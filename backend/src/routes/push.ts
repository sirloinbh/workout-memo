import type express from 'express';

import {
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
  restPushSchema,
  weeklySummarySettingSchema,
} from '../contract.js';
import { sendError } from '../standard/http.js';
import type { PushService } from '../web-push.js';
import type { WeeklySummary } from '../weekly-summary.js';

// The rest can be one hour at most (#84); a little more is allowed for a device clock that runs fast.
const maxAheadMs = 3600 * 1000 + 60_000;
// An end time that is already past is refused, with some room for a device clock that runs slow.
const maxBehindMs = 10_000;

// The shared sign-in sets req.user (#303). Without it (local development) there is one user.
const pushUserId = (req: express.Request) =>
  (req as express.Request & { user?: { id?: string } }).user?.id || 'local';

// #260: Web Push subscriptions and the rest-end push. See docs/api.md.
export function registerPushRoutes(
  app: express.Express,
  push: PushService,
  now: () => number = Date.now,
  weekly?: WeeklySummary,
) {
  const unavailable = (res: express.Response) =>
    sendError(res, 503, 'Push notifications are not set up on the server');
  app.get('/api/push/config', (_req, res) => {
    res.json({ enabled: push.enabled, public_key: push.publicKey });
  });
  app.post('/api/push/subscriptions', async (req, res) => {
    const subscription = pushSubscriptionSchema.parse(req.body);
    if (!push.enabled) return unavailable(res);
    await push.saveSubscription(pushUserId(req), subscription);
    res.status(201).json({ ok: true });
  });
  app.delete('/api/push/subscriptions', async (req, res) => {
    const { endpoint } = pushUnsubscribeSchema.parse(req.body);
    await push.deleteSubscription(pushUserId(req), endpoint);
    res.json({ ok: true });
  });
  app.put('/api/push/rest', async (req, res) => {
    const { ends_at } = restPushSchema.parse(req.body);
    if (!push.enabled) return unavailable(res);
    const at = now();
    if (ends_at < at - maxBehindMs) return sendError(res, 400, 'The rest has already ended');
    if (ends_at > at + maxAheadMs)
      return sendError(res, 400, 'The rest end time is more than an hour away');
    await push.scheduleRest(pushUserId(req), ends_at);
    res.json({ ok: true });
  });
  app.delete('/api/push/rest', async (req, res) => {
    await push.cancelRest(pushUserId(req));
    res.json({ ok: true });
  });
  // #485: the weekly summary switch. Off until turned on; turning it on needs push set up on the server.
  if (weekly) {
    app.get('/api/push/weekly-summary', async (req, res) => {
      res.json({ enabled: await weekly.isEnabled(pushUserId(req)) });
    });
    app.put('/api/push/weekly-summary', async (req, res) => {
      const { enabled } = weeklySummarySettingSchema.parse(req.body);
      if (enabled && !push.enabled) return unavailable(res);
      await weekly.setEnabled(pushUserId(req), enabled);
      res.json({ enabled });
    });
  }
}
