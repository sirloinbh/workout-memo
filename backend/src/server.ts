import { Pool } from 'pg';

import { createApp } from './app.js';
import { sharedAuth } from './standard/auth.js';
import { createPushService, pushConfigFromEnv } from './web-push.js';

const auth = sharedAuth();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// #260: rest-end Web Push is on only when the VAPID keys are set (docs/deployment.md).
const push = createPushService(pool, { config: pushConfigFromEnv() });
const stopPush = push.start();
const server = createApp(pool, { auth, push }).listen(
  Number(process.env.PORT ?? 3101),
  '0.0.0.0',
  () => console.log('API http://localhost:3101'),
);
process.on('SIGTERM', () => {
  stopPush();
  server.close(() => {
    void pool.end();
  });
});
