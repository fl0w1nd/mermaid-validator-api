import { Hono } from 'hono';
import { validateMermaidCode } from './validator';

type ValidateItemInput = {
  id?: string;
  code: string;
};

type ValidateItemOutput = {
  id?: string;
  valid: boolean;
  error: string | null;
};

const MERMAID_BLOCK_RE = /```mermaid\s*([\s\S]*?)```/i;

function extractMermaidCode(input: string): string {
  const m = MERMAID_BLOCK_RE.exec(input);
  return (m?.[1] ?? input).trim();
}

const app = new Hono();

app.get('/health', (c) => {
  return c.json({ ok: true, service: 'mermaid-validator-api' });
});

app.post('/validate', async (c) => {
  let payload: ValidateItemInput;
  try {
    payload = (await c.req.json()) as ValidateItemInput;
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!payload?.code || typeof payload.code !== 'string') {
    return c.json({ error: 'Field "code" is required and must be string' }, 400);
  }

  const code = extractMermaidCode(payload.code);
  const result = await validateMermaidCode(code);

  return c.json({
    id: payload.id,
    valid: result.valid,
    error: result.error,
  } satisfies ValidateItemOutput);
});

app.post('/validate/batch', async (c) => {
  let payload: { items?: ValidateItemInput[]; timeoutMs?: number };
  try {
    payload = (await c.req.json()) as { items?: ValidateItemInput[]; timeoutMs?: number };
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const items = payload?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return c.json({ error: 'Field "items" must be non-empty array' }, 400);
  }

  if (items.length > 200) {
    return c.json({ error: 'Too many items: max 200' }, 400);
  }

  const results = await Promise.all(
    items.map(async (item) => {
      const code = extractMermaidCode(String(item?.code ?? ''));
      if (!code) {
        return {
          id: item?.id,
          valid: false,
          error: 'Empty mermaid code',
        } satisfies ValidateItemOutput;
      }

      const result = await validateMermaidCode(code);
      return {
        id: item?.id,
        valid: result.valid,
        error: result.error,
      } satisfies ValidateItemOutput;
    }),
  );

  return c.json({
    ok: true,
    count: results.length,
    invalidCount: results.filter((x) => !x.valid).length,
    results,
  });
});

export default app;
