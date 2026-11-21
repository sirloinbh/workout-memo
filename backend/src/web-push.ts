import type { Pool } from 'pg';
import webpush from 'web-push';

import type { PushSubscriptionInput } from './contract.js';

// #260: Web Push for the rest timer. The client tells the server when a rest ends; a timer
// here sends one push at that time, so the alert arrives even when the phone screen is off.
export type PushConfig = { publicKey: string; privateKey: string; subject: string };
export type PushPayload = { title: string; body: string; url: string; tag: string };
export type PushSender = (
  subscription: PushSubscriptionInput,
  payload: PushPayload,
) => Promise<void>;
export type PushService = ReturnType<typeof createPushService>;

// Keys come only from the environment (never from the repo). Without both keys, push is off:
// the API says so and the in-screen timer works as before.
export function pushConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): PushConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  const subject = env.VAPID_SUBJECT?.trim() || 'https://workout-memo.daysofme.com';
  return { publicKey, privateKey, subject };
}

export const restOverPayload: PushPayload = {
  title: 'Rest over',
  body: 'Time for your next set.',
  url: '/journal',
  tag: 'rest-timer',
};

// A push the server could not send in time (for example during a restart) is not sent later.
const staleAfterMs = 120_000;
// A subscription the push service no longer knows (404, 410) is removed.
const gone = (error: unknown) => {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return status === 404 || status === 410;
};

function webPushSender(config: PushConfig): PushSender {
  return async (subscription, payload) => {
    await webpush.sendNotification(subscription, JSON.stringify(payload), {
      vapidDetails: config,
      TTL: 120,
      urgency: 'high',
    });
  };
}

type Options = { config: PushConfig | null; send?: PushSender; log?: (message: string) => void };

export function createPushService(pool: Pick<Pool, 'query'>, options: Options) {
  const { config } = options;
  const send = options.send ?? (config ? webPushSender(config) : undefined);
  const log = options.log ?? ((message: string) => console.error(message));
  const enabled = Boolean(config && send);
  let running = false;
  // The send in progress, so shutdown can wait for it (#361).
  let current: Promise<number> | null = null;

  // Claims the rests that ended (deleting the row, so each is sent at most once) and pushes to
  // every subscription of the user. Returns how many users were notified.
  function sendDue() {
    if (!send || running) return Promise.resolve(0);
    running = true;
    current = claimAndSend(send).finally(() => {
      running = false;
      current = null;
    });
    return current;
  }
  async function claimAndSend(send: PushSender) {
    await pool.query(
      `DELETE FROM rest_pushes WHERE ends_at < now() - make_interval(secs => $1::float8 / 1000)`,
      [staleAfterMs],
    );
    const due = (
      await pool.query('DELETE FROM rest_pushes WHERE ends_at <= now() RETURNING user_id')
    ).rows as { user_id: string }[];
    for (const { user_id } of due) {
      const subscriptions = (
        await pool.query('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=$1', [
          user_id,
        ])
      ).rows as { endpoint: string; p256dh: string; auth: string }[];
      await Promise.all(
        subscriptions.map(async (row) => {
          try {
            await send(
              { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
              restOverPayload,
            );
          } catch (error) {
            if (gone(error))
              await pool.query('DELETE FROM push_subscriptions WHERE endpoint=$1', [row.endpoint]);
            else log(`Rest push failed: ${(error as Error).message}`);
          }
        }),
      );
    }
    return due.length;
  }

  return {
    enabled,
    publicKey: config?.publicKey ?? null,
    async saveSubscription(userId: string, subscription: PushSubscriptionInput) {
      await pool.query(
        `INSERT INTO push_subscriptions(endpoint, user_id, p256dh, auth) VALUES($1,$2,$3,$4)
         ON CONFLICT (endpoint) DO UPDATE SET user_id=EXCLUDED.user_id, p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth`,
        [subscription.endpoint, userId, subscription.keys.p256dh, subscription.keys.auth],
      );
    },
    // Only the owner removes a subscription. A user with none left does not keep a pending push.
    async deleteSubscription(userId: string, endpoint: string) {
      await pool.query('DELETE FROM push_subscriptions WHERE endpoint=$1 AND user_id=$2', [
        endpoint,
        userId,
      ]);
      await pool.query(
        `DELETE FROM rest_pushes WHERE user_id=$1
         AND NOT EXISTS (SELECT 1 FROM push_subscriptions WHERE user_id=$1)`,
        [userId],
      );
    },
    // One pending push per user: a new rest replaces the earlier one.
    async scheduleRest(userId: string, endsAtMs: number) {
      await pool.query(
        `INSERT INTO rest_pushes(user_id, ends_at) VALUES($1, to_timestamp($2::float8 / 1000))
         ON CONFLICT (user_id) DO UPDATE SET ends_at=EXCLUDED.ends_at`,
        [userId, endsAtMs],
      );
    },
    async cancelRest(userId: string) {
      await pool.query('DELETE FROM rest_pushes WHERE user_id=$1', [userId]);
    },
    sendDue,
    // Checks for due pushes every 2 seconds; the returned function stops it (server shutdown).
    start(intervalMs = 2000): () => Promise<void> {
      if (!send) return () => Promise.resolve();
      const id = setInterval(() => {
        sendDue().catch((error: Error) => log(`Rest push check failed: ${error.message}`));
      }, intervalMs);
      id.unref();
      // Stops the timer and resolves once a send in progress has finished, so the pool can end after it.
      return async () => {
        clearInterval(id);
        await current?.catch(() => undefined);
      };
    },
  };
}
