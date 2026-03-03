import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import app from '../src/app.js';

const vercelApp = new Hono().basePath('/api');
vercelApp.route('/', app);

export default handle(vercelApp);
