import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from './_utils.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 404, { error: 'Not Found' });
    return;
  }
  sendJson(res, 200, { ok: true, service: 'mermaid-validator-api' });
}
