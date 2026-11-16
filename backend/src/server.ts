import { Pool } from 'pg';

import { createApp } from './app.js';
import { sharedAuth } from './standard/auth.js';

const auth = sharedAuth();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const server = createApp(pool, { auth }).listen(Number(process.env.PORT ?? 3101), '0.0.0.0', () =>
  console.log('API http://localhost:3101'),
);
process.on('SIGTERM', () =>
  server.close(() => {
    void pool.end();
  }),
);
