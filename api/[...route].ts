import { getRequestListener } from '@hono/node-server';
import { Hono } from 'hono';
import app from '../src/app.js';

const server = new Hono();
server.route('/api', app);

export default getRequestListener(server.fetch);
