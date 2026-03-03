"""
title: Mermaid Syntax Corrector (Auto Loop + External Validator)
description: Automatically validates all Mermaid blocks via external API, then loops with LLM fixes until all pass or max rounds reached.
author: fl0w1nd
version: 1.0.0
license: MIT
required_open_webui_version: 0.6.0
requirements: aiohttp
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import aiohttp
import asyncio
import json
import re


# ---------------- Mermaid 文本清理（保留原功能） ----------------


def fix_mermaid_lists(mermaid_code: str) -> str:
    import re

    FLOWCHART_TYPES = ("graph", "flowchart")
    m = re.search(r"^\s*(\w+)", mermaid_code)
    if not m:
        return mermaid_code
    diag = m.group(1).lower()
    if diag not in FLOWCHART_TYPES:
        return mermaid_code

    def escape_markdown_in_text(text: str) -> str:
        text = re.sub(r"(?<!\\)`([^`]+)`", r"\\`\1\\`", text)

        def repl_multi(mm):
            bt, content = mm.group(1), mm.group(2)
            return f"\\{bt}{content}\\{bt}"

        text = re.sub(r"(?<!\\)(`{2,})([^`]+?)\1", repl_multi, text)

        def repl_list(mm):
            lead, rest = mm.group(1), mm.group(5)
            if mm.group(2):
                return f"{lead}\\{mm.group(2)}{rest}"
            return f"{lead}{mm.group(3)}\\{mm.group(4)}{rest}"

        text = re.sub(r"(?m)^(\s*)(?<!\\)(?:([-*])|(\d+)(\.))(\s+.*)", repl_list, text)
        return text

    def repl_quotes(mm):
        return f'"{escape_markdown_in_text(mm.group(1))}"'

    fixed = re.sub(r'"((?:\\.|[^"\\])*)"', repl_quotes, mermaid_code)

    def repl_edge(mm):
        link, inner = mm.group(1), mm.group(2)
        if '"' in inner:
            return mm.group(0)
        return f"{link}|{escape_markdown_in_text(inner)}|"

    fixed = re.sub(r"((?:-?>|--?|-\.->)\s*)\|([^|]+?)\|", repl_edge, fixed)

    def repl_brackets(mm):
        node, lb, inner, rb = mm.groups()
        if '"' in inner:
            return mm.group(0)
        return f"{node}{lb}{escape_markdown_in_text(inner)}{rb}"

    fixed = re.sub(r'(\w+\s*)(\[|\{)([^"\]}]+)(\]|\})', repl_brackets, fixed)

    return fixed


# ---------------- 主动作 ----------------


class Action:
    class Valves(BaseModel):
        validator_api_url: str = Field(
            default="https://YOUR-MERMAID-VALIDATOR.example.com",
            description="External validator API base URL, e.g. https://your-app.vercel.app or https://your-app.vercel.app/api",
        )
        validator_timeout: int = Field(
            default=20,
            description="HTTP timeout (s) for validator API",
        )
        max_rounds: int = Field(
            default=4,
            description="Max validate-fix loop rounds",
        )
        openai_api_url: str = Field(
            default="http://localhost:11434/v1",
            description="OpenAI-compatible /chat/completions endpoint",
        )
        api_key: str = Field(
            default="sk-1234567",
            description="API key for correction model",
        )
        model: str = Field(
            default="gpt-4.1-mini",
            description="Model used for Mermaid correction",
        )
        correction_timeout: int = Field(
            default=60,
            description="HTTP timeout (s) for LLM correction API",
        )
        correction_prompt: str = Field(
            default=(
                "You are an expert in Mermaid.js syntax. "
                "Given Mermaid code and a REAL parser/render error message, fix the code. "
                "Return ONLY corrected Mermaid code wrapped in ```mermaid fences. "
                "Do not output explanations."
            ),
            description="System prompt for LLM correction",
        )

    def __init__(self):
        self.valves = self.Valves()
        self.mermaid_pattern = re.compile(r"```mermaid\s*([\s\S]*?)```", re.IGNORECASE)

    # ---------- helpers ----------

    def _extract_mermaid_code_from_response(self, response_text: str) -> str:
        m = self.mermaid_pattern.search(response_text or "")
        return (m.group(1) if m else (response_text or "")).strip()

    def _extract_content_from_body(self, body: dict) -> Optional[str]:
        content: Optional[str] = None
        if isinstance(body, dict) and isinstance(body.get("content"), str):
            content = body.get("content") or ""
        elif isinstance(body, dict) and isinstance(body.get("messages"), list):
            msgs = body["messages"]
            idx = next(
                (
                    i
                    for i, m in reversed(list(enumerate(msgs)))
                    if m.get("role") == "assistant"
                ),
                -1,
            )
            if idx != -1:
                content = msgs[idx].get("content", "")
        return content

    async def _notify(self, emitter, type_: str, content: str):
        if not emitter:
            return
        await emitter({
            "type": "notification",
            "data": {"type": type_, "content": content},
        })

    async def _status(self, emitter, description: str, done: bool = False, hidden: bool = False):
        if not emitter:
            return
        await emitter({
            "type": "status",
            "data": {
                "description": description,
                "done": done,
                "hidden": hidden,
            },
        })

    async def query_openai_api(self, messages: List[Dict[str, str]]) -> str:
        url = f"{self.valves.openai_api_url}/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.valves.api_key}",
        }
        payload = {
            "user": "mermaid_auto_repair",
            "model": self.valves.model,
            "messages": messages,
            "stream": False,
        }

        timeout = aiohttp.ClientTimeout(total=self.valves.correction_timeout)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(url, headers=headers, json=payload) as resp:
                resp.raise_for_status()
                data = await resp.json()
                return data["choices"][0]["message"]["content"]

    async def _validate_batch(self, blocks: List[str]) -> List[Dict[str, Any]]:
        base = self.valves.validator_api_url.rstrip("/")
        if base.endswith("/api"):
            url = f"{base}/validate/batch"
        else:
            url = f"{base}/api/validate/batch"
        payload = {
            "items": [
                {"id": str(i), "code": block}
                for i, block in enumerate(blocks)
            ]
        }
        headers = {"Content-Type": "application/json"}

        timeout = aiohttp.ClientTimeout(total=self.valves.validator_timeout)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(url, headers=headers, json=payload) as resp:
                # 尽量保留远端报错文本
                text = await resp.text()
                if resp.status >= 400:
                    raise Exception(f"Validator API HTTP {resp.status}: {text[:800]}")

                try:
                    data = json.loads(text)
                except Exception:
                    raise Exception(f"Validator API returned non-JSON: {text[:800]}")

        if not isinstance(data, dict) or not isinstance(data.get("results"), list):
            raise Exception("Validator API response missing results[]")

        return data["results"]

    async def _single_fix(self, block_code: str, actual_error_text: str, history_text: str = "") -> str:
        user_prompt = (
            "Please fix the following Mermaid code using the real error from validator.\n\n"
            f"--- CODE ---\n{block_code}\n\n"
            f"--- VALIDATOR ERROR ---\n{actual_error_text}\n\n"
            f"--- PREVIOUS ATTEMPTS (for context, avoid repeating same mistakes) ---\n{history_text or '(none)'}\n\n"
            "Output only corrected code in ```mermaid fences."
        )
        messages = [
            {"role": "system", "content": self.valves.correction_prompt},
            {"role": "user", "content": user_prompt},
        ]
        llm_resp = await self.query_openai_api(messages)
        fixed_code = self._extract_mermaid_code_from_response(llm_resp)
        return fix_mermaid_lists(fixed_code)

    def _replace_blocks(self, content: str, matches: List[re.Match], new_blocks: Dict[int, str]) -> str:
        out = []
        cursor = 0
        for i, m in enumerate(matches):
            start, end = m.span()
            out.append(content[cursor:start])
            code = new_blocks.get(i, m.group(1).strip())
            out.append(f"```mermaid\n{code}\n```")
            cursor = end
        out.append(content[cursor:])
        return "".join(out)

    # ---------- main ----------

    async def action(
        self,
        body: dict,
        __user__=None,
        __event_emitter__=None,
        __event_call__=None,
        __model__=None,
        __request__=None,
        __id__=None,
    ) -> Optional[dict]:

        if not __event_emitter__:
            return None

        content = self._extract_content_from_body(body)
        if not isinstance(content, str):
            await self._notify(__event_emitter__, "error", "未找到可处理的消息内容（content）。")
            return None

        if not self.mermaid_pattern.search(content):
            await self._notify(__event_emitter__, "info", "未发现 Mermaid 代码块。")
            await __event_emitter__({"type": "replace", "data": {"content": content}})
            return None

        current_text = content
        total_fixed_count = 0
        # 每个 block 的跨轮历史上下文：[{round, error, before, after}]
        attempt_history: Dict[int, List[Dict[str, str]]] = {}

        for round_idx in range(1, self.valves.max_rounds + 1):
            matches = list(self.mermaid_pattern.finditer(current_text))
            if not matches:
                break

            blocks = [m.group(1).strip() for m in matches]

            await self._status(
                __event_emitter__,
                f"第 {round_idx}/{self.valves.max_rounds} 轮：正在检测 {len(blocks)} 个 Mermaid 片段…",
                done=False,
            )

            try:
                results = await self._validate_batch(blocks)
            except Exception as e:
                await self._notify(__event_emitter__, "error", f"语法检测接口调用失败：{e}")
                return None

            invalid_indices = []
            for i, r in enumerate(results):
                if not r.get("valid", False):
                    invalid_indices.append(i)

            if not invalid_indices:
                await self._status(
                    __event_emitter__,
                    f"第 {round_idx} 轮检测通过：所有 Mermaid 片段语法正确。",
                    done=False,
                )
                break

            await self._status(
                __event_emitter__,
                f"第 {round_idx} 轮发现 {len(invalid_indices)} 个错误，正在自动修复…",
                done=False,
            )

            async def fix_one(i: int):
                err = str(results[i].get("error") or "Unknown validator error")

                # 组装该 block 的历史上下文（跨轮记忆）
                hist_items = attempt_history.get(i, [])
                hist_lines = []
                for h in hist_items[-6:]:
                    hist_lines.append(
                        f"[Round {h.get('round','?')}] error={h.get('error','')}\n"
                        f"before:\n{h.get('before','')}\n"
                        f"after:\n{h.get('after','')}"
                    )
                history_text = "\n\n".join(hist_lines)

                fixed = await self._single_fix(blocks[i], err, history_text)
                return i, fixed, err

            fixed_map: Dict[int, str] = {}
            try:
                fixed_pairs = await asyncio.gather(*(fix_one(i) for i in invalid_indices))
                for i, fixed, err in fixed_pairs:
                    if fixed:
                        fixed_map[i] = fixed

                    # 记录跨轮历史（让下一轮携带上下文）
                    attempt_history.setdefault(i, []).append(
                        {
                            "round": str(round_idx),
                            "error": err,
                            "before": blocks[i],
                            "after": fixed or "",
                        }
                    )
            except Exception as e:
                await self._notify(__event_emitter__, "error", f"调用修复模型失败：{e}")
                return None

            if not fixed_map:
                await self._notify(__event_emitter__, "warning", "本轮未得到有效修复结果，停止循环。")
                break

            total_fixed_count += len(fixed_map)
            current_text = self._replace_blocks(current_text, matches, fixed_map)

            await __event_emitter__({"type": "replace", "data": {"content": current_text}})

        # 循环结束后，做一次最终检测，给出残留错误数量
        final_matches = list(self.mermaid_pattern.finditer(current_text))
        if final_matches:
            final_blocks = [m.group(1).strip() for m in final_matches]
            try:
                final_results = await self._validate_batch(final_blocks)
                final_invalid = [r for r in final_results if not r.get("valid", False)]
            except Exception:
                final_invalid = []
        else:
            final_invalid = []

        if final_invalid:
            await self._notify(
                __event_emitter__,
                "warning",
                f"自动循环已结束：仍有 {len(final_invalid)} 个 Mermaid 片段存在错误（已到最大轮次或无法继续修复）。",
            )
        else:
            await self._notify(
                __event_emitter__,
                "success",
                f"自动修复完成：累计处理 {total_fixed_count} 个错误片段，当前全部通过检测。",
            )

        await self._status(__event_emitter__, "Mermaid 自动修复流程结束。", done=True, hidden=True)

        # 兼容旧版本
        return {"content": current_text}
