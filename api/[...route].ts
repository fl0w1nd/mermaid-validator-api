import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from './_utils.js';

export default async function handler(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  sendJson(res, 404, { error: 'Not Found' });
}
