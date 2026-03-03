import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import app from './app.js';

const server = new Hono();

server.route('/api', app);
server.use('/*', serveStatic({ root: './public' }));

const port = Number(process.env.PORT) || 3000;

serve({ fetch: server.fetch, port }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});
