import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  readJsonBody,
  sendJson,
  validateOne,
  type ValidateItemInput,
} from './_utils.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 404, { error: 'Not Found' });
    return;
  }

  let payload: ValidateItemInput;
  try {
    payload = (await readJsonBody(req)) as ValidateItemInput;
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  if (!payload?.code || typeof payload.code !== 'string') {
    sendJson(res, 400, { error: 'Field "code" is required and must be string' });
    return;
  }

  const result = await validateOne(payload);
  sendJson(res, 200, result);
}
