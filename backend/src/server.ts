import { Pool } from 'pg';

import { createApp } from './app.js';
import { listenHost, sharedAuth } from './standard/auth.js';
import { createPool } from './standard/db.js';
import { createPushService, pushConfigFromEnv } from './web-push.js';
import { createWeeklySummary } from './weekly-summary.js';

const auth = sharedAuth();
const port = Number(process.env.PORT ?? 3101);
// 127.0.0.1 when the sign-in is off (local run), so the open API is not reachable from the network (#898).
const host = listenHost(auth !== undefined);
const pool = createPool(new Pool({ connectionString: process.env.DATABASE_URL }));
// #260: rest-end Web Push is on only when the VAPID keys are set (docs/deployment.md).
const push = createPushService(pool, { config: pushConfigFromEnv() });
const stopPush = push.start();
// #485: the Sunday 21:00 weekly summary push, sent only to users who turned it on.
const weekly = createWeeklySummary(pool, push);
const stopWeekly = weekly.start();
const server = createApp(pool, {
  auth,
  push,
  weeklySummary: weekly,
  toolsPublicKey: process.env.AI_TOOLS_PUBLIC_KEY,
}).listen(port, host, () => console.log(`API http://${host}:${port}`));
process.on('SIGTERM', () => {
  // #361: wait for a running push send before the pool ends, so a claimed rest push is not lost.
  const pushStopped = Promise.all([stopPush(), stopWeekly()]);
  server.close(() => {
    void pushStopped.then(() => pool.end());
  });
});
