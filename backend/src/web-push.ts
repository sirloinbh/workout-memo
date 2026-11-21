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

// One send gets this long (#371); a stalled push service must not hold back other users' pushes.
const sendTimeoutMs = 10_000;
// A push the server could not send in time (for example during a restart) is not sent later.
const staleAfterMs = 120_000;
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

// The longest delay setTimeout accepts.
const maxTimerMs = 2 ** 31 - 1;

export function createPushService(pool: Pick<Pool, 'query'>, options: Options) {
  const { config } = options;
  const send = options.send ?? (config ? webPushSender(config) : undefined);
  const log = options.log ?? ((message: string) => console.error(message));
  const enabled = Boolean(config && send);
  const deadline = options.sendTimeoutMs ?? sendTimeoutMs;
  // Checks and sends in progress, so shutdown can wait for them (#361).
  const inFlight = new Set<Promise<unknown>>();
  const track = <T>(work: Promise<T>) => {
    inFlight.add(work);
    void work.then(
      () => inFlight.delete(work),
      () => inFlight.delete(work),
    );
    return work;
  };

  // Claims the rests that ended (deleting the row, so each is sent at most once, even when two checks overlap)
  // and pushes to every subscription of each user, users in parallel and each send under a deadline (#371).
  // Returns how many users were notified.
  function sendDue() {
    return send ? track(claimAndSend(send)) : Promise.resolve(0);
  }
  async function claimAndSend(send: PushSender) {
    await pool.query(
      `DELETE FROM rest_pushes WHERE ends_at < now() - make_interval(secs => $1::float8 / 1000)`,
      [staleAfterMs],
    );
    const due = (
      await pool.query('DELETE FROM rest_pushes WHERE ends_at <= now() RETURNING user_id')
    ).rows as { user_id: string }[];
    await Promise.all(
      due.map(async ({ user_id }) => {
        const subscriptions = (
          await pool.query(
            'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=$1',
            [user_id],
          )
        ).rows as { endpoint: string; p256dh: string; auth: string }[];
        await Promise.all(
          subscriptions.map(async (row) => {
            try {
              await withDeadline(
                send(
                  { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
                  restOverPayload,
                ),
                deadline,
              );
            } catch (error) {
              if (gone(error))
                await pool.query('DELETE FROM push_subscriptions WHERE endpoint=$1', [
                  row.endpoint,
                ]);
              else log(`Rest push failed: ${(error as Error).message}`);
            }
          }),
        );
      }),
    );
    return due.length;
  }

  // One timer for the earliest pending rest (#371): nothing runs, and no query is issued, while no rest is pending.
  let started = false;
  let timer: NodeJS.Timeout | null = null;
  let timerAt = Infinity;
  function armAt(atMs: number) {
    if (!started || (timer && timerAt <= atMs)) return;
    if (timer) clearTimeout(timer);
    timerAt = atMs;
    timer = setTimeout(fire, Math.min(maxTimerMs, Math.max(0, atMs - Date.now())));
    timer.unref();
  }
  function fire() {
    timer = null;
    timerAt = Infinity;
    void track(
      sendDue()
        .then(armNext)
        .catch((error: Error) => log(`Rest push check failed: ${error.message}`)),
    );
  }
  // Arms the timer for the earliest rest left in the table, if any.
  async function armNext() {
    if (!started) return;
    const next = (
      await pool.query(
        'SELECT (extract(epoch FROM min(ends_at)) * 1000)::float8 AS at FROM rest_pushes',
      )
    ).rows[0] as { at: number | null } | undefined;
    // A short floor, so a row that is not claimable yet cannot spin the timer.
    if (next?.at != null) armAt(Math.max(next.at, Date.now() + 50));
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
      armAt(endsAtMs);
    },
    async cancelRest(userId: string) {
      await pool.query('DELETE FROM rest_pushes WHERE user_id=$1', [userId]);
    },
    sendDue,
    // Starts the timer for the earliest pending rest (rests that ended while the server was down are sent if they
    // are still fresh). The returned function stops it and resolves once checks in progress have finished, so the
    // pool can end after them (server shutdown).
    start(): () => Promise<void> {
      if (!send) return () => Promise.resolve();
      started = true;
      void track(
        armNext().catch((error: Error) => log(`Rest push check failed: ${error.message}`)),
      );
      return async () => {
        started = false;
        if (timer) clearTimeout(timer);
        timer = null;
        await Promise.allSettled([...inFlight]);
      };
    },
  };
}
