import type { IncomingMessage, ServerResponse } from 'node:http';
import { validateMermaidCode } from '../src/validator.js';

export type ValidateItemInput = {
  id?: string;
  code: string;
};

export type ValidateItemOutput = {
  id?: string;
  valid: boolean;
  error: string | null;
};

const MERMAID_BLOCK_RE = /```mermaid\s*([\s\S]*?)```/i;

export function extractMermaidCode(input: string): string {
  const m = MERMAID_BLOCK_RE.exec(input);
  return (m?.[1] ?? input).trim();
}

export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const reqAny = req as IncomingMessage & { body?: unknown };

  if (reqAny.body !== undefined) {
    if (typeof reqAny.body === 'string') {
      return reqAny.body.length ? JSON.parse(reqAny.body) : {};
    }
    return reqAny.body;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw.length ? JSON.parse(raw) : {};
}

export async function validateOne(item: ValidateItemInput): Promise<ValidateItemOutput> {
  const code = extractMermaidCode(String(item?.code ?? ''));
  if (!code) {
    return { id: item?.id, valid: false, error: 'Empty mermaid code' };
  }
  const result = await validateMermaidCode(code);
  return { id: item?.id, valid: result.valid, error: result.error };
}
