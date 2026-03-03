import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  readJsonBody,
  sendJson,
  validateOne,
  type ValidateItemInput,
  type ValidateItemOutput,
} from '../_utils.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 404, { error: 'Not Found' });
    return;
  }

  let payload: { items?: ValidateItemInput[] };
  try {
    payload = (await readJsonBody(req)) as { items?: ValidateItemInput[] };
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  const items = payload?.items;
  if (!Array.isArray(items) || items.length === 0) {
    sendJson(res, 400, { error: 'Field "items" must be non-empty array' });
    return;
  }
  if (items.length > 200) {
    sendJson(res, 400, { error: 'Too many items: max 200' });
    return;
  }

  const results: ValidateItemOutput[] = await Promise.all(items.map((item) => validateOne(item)));
  sendJson(res, 200, {
    ok: true,
    count: results.length,
    invalidCount: results.filter((x) => !x.valid).length,
    results,
  });
}
