import type express from 'express';

import {
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
  weeklySummarySettingSchema,
} from '../contract.js';
import { sendError } from '../standard/http.js';
import type { PushService } from '../web-push.js';
import type { WeeklySummary } from '../weekly-summary.js';

// The shared sign-in sets req.user (#303). Without it (local development) there is one user.
const pushUserId = (req: express.Request) =>
  (req as express.Request & { user?: { id?: string } }).user?.id || 'local';

// #260: Web Push subscriptions and the weekly summary switch. See docs/api.md.
export function registerPushRoutes(
  app: express.Express,
  push: PushService,
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
