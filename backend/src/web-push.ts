import type { Pool } from 'pg';
import webpush from 'web-push';

import type { PushSubscriptionInput } from './contract.js';

// #260: Web Push subscriptions and one-off pushes (the weekly summary, #485).
export type PushConfig = { publicKey: string; privateKey: string; subject: string };
export type PushPayload = { title: string; body: string; url: string; tag: string };
export type PushSender = (
  subscription: PushSubscriptionInput,
  payload: PushPayload,
) => Promise<void>;
export type PushService = ReturnType<typeof createPushService>;

// Keys come only from the environment (never from the repo). Without both keys, push is off:
// the API says so.
export function pushConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): PushConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  const subject = env.VAPID_SUBJECT?.trim() || 'https://workout-memo.daysofme.com';
  return { publicKey, privateKey, subject };
}

// One send gets this long (#371); a stalled push service must not hold back other users' pushes.
const sendTimeoutMs = 10_000;
// A subscription the push service no longer knows (404, 410) is removed.
const gone = (error: unknown) => {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return status === 404 || status === 410;
};

function webPushSender(config: PushConfig): PushSender {
  return async (subscription, payload) => {
    // web-push honors `timeout` at run time, but its type declarations do not list it.
    const requestOptions = {
      vapidDetails: config,
      TTL: 120,
      urgency: 'high' as const,
      timeout: sendTimeoutMs,
    };
    await webpush.sendNotification(subscription, JSON.stringify(payload), requestOptions);
  };
}

type Options = {
  config: PushConfig | null;
  send?: PushSender;
  log?: (message: string) => void;
  /** The deadline of one send, in milliseconds. */
  sendTimeoutMs?: number;
};

// Rejects when `work` has not settled within `ms`, so a sender that never answers cannot hang a check.
async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function createPushService(pool: Pick<Pool, 'query'>, options: Options) {
  const { config } = options;
  const send = options.send ?? (config ? webPushSender(config) : undefined);
  const log = options.log ?? ((message: string) => console.error(message));
  const enabled = Boolean(config && send);
  const deadline = options.sendTimeoutMs ?? sendTimeoutMs;
  // Sends in progress, so shutdown can wait for them (#361).
  const inFlight = new Set<Promise<unknown>>();
  const track = <T>(work: Promise<T>) => {
    inFlight.add(work);
    void work.then(
      () => inFlight.delete(work),
      () => inFlight.delete(work),
    );
    return work;
  };

  // Pushes one payload to every subscription of the user, each send under a deadline (#371). A subscription
  // the push service no longer knows is removed. Failures are logged, never thrown.
  async function pushToUser(send: PushSender, userId: string, payload: PushPayload, what: string) {
    const subscriptions = (
      await pool.query('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=$1', [
        userId,
      ])
    ).rows as { endpoint: string; p256dh: string; auth: string }[];
    await Promise.all(
      subscriptions.map(async (row) => {
        try {
          await withDeadline(
            send({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload),
            deadline,
          );
        } catch (error) {
          if (gone(error))
            await pool.query('DELETE FROM push_subscriptions WHERE endpoint=$1', [row.endpoint]);
          else log(`${what} failed: ${(error as Error).message}`);
        }
      }),
    );
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
    // Only the owner removes a subscription.
    async deleteSubscription(userId: string, endpoint: string) {
      await pool.query('DELETE FROM push_subscriptions WHERE endpoint=$1 AND user_id=$2', [
        endpoint,
        userId,
      ]);
    },
    /** #485: a one-off push (the weekly summary) to every subscription of the user. Does nothing when push is off. */
    sendToUser(userId: string, payload: PushPayload): Promise<void> {
      return send ? track(pushToUser(send, userId, payload, 'Push')) : Promise.resolve();
    },
    // Resolves once the sends in progress have finished, so the pool can end after them (server shutdown, #361).
    async stop(): Promise<void> {
      await Promise.allSettled([...inFlight]);
    },
  };
}
