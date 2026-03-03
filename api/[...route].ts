import { getRequestListener } from '@hono/node-server';
import app from '../src/app.js';

export default getRequestListener(app.fetch);
