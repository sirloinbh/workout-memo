import { createAuthMiddleware } from '@sirloinbh/auth-client';
import { Pool } from 'pg';

import { createApp } from './app.js';

// #303: the shared sign-in (sirloinbh/shared-auth) checks every /api request on the server.
// Local development without AUTH_INTERNAL_URL runs open; production refuses to start without it.
const authUrl = process.env.AUTH_INTERNAL_URL;
if (!authUrl && process.env.NODE_ENV === 'production')
  throw new Error('AUTH_INTERNAL_URL is required in production (the shared sign-in service)');
const auth = authUrl ? createAuthMiddleware({ authUrl }) : undefined;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const server = createApp(pool, { auth }).listen(Number(process.env.PORT ?? 3101), '0.0.0.0', () =>
  console.log('API http://localhost:3101'),
);
process.on('SIGTERM', () =>
  server.close(() => {
    void pool.end();
  }),
);
