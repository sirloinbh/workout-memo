import { meHandler } from '@sirloinbh/auth-client';
import express from 'express';
import type { Pool } from 'pg';
import { types } from 'pg';

import { tools } from './ai-tools.js';
import { registerBackupRoutes } from './backup.js';
import { seoulToday } from './progress.js';
import { registerAnalysisRoutes } from './routes/analysis.js';
import { registerBodyMeasurementRoutes } from './routes/body-measurements.js';
import { registerCardioImportRoute, registerCardioRoutes } from './routes/cardio.js';
import { registerCardioGoalRoutes } from './routes/cardio-goals.js';
import { registerExerciseNameRoutes } from './routes/exercise-names.js';
import { registerGoalRoutes } from './routes/goals.js';
import { registerMachineRoutes } from './routes/machines.js';
import { registerPushRoutes } from './routes/push.js';
import { registerRoutineRoutes } from './routes/routines.js';
import { appErrors } from './routes/shared.js';
import { registerWeightStepRoutes } from './routes/weight-steps.js';
import { registerWorkoutRoutes } from './routes/workouts.js';
import { setInt8Parser } from './standard/db.js';
import { errorHandler, notFound, requestLog } from './standard/http.js';
import { apiRateLimit } from './standard/rate-limit.js';
import { registerToolRoutes } from './standard/tools.js';
import { createPushService, type PushService } from './web-push.js';
import { createWeeklySummary, type WeeklySummary } from './weekly-summary.js';
// BIGINT values (row_number(), audit_log ids) come back as numbers, and a value above 2^53 throws (ADR-0025).
setInt8Parser(types);
// DATE columns stay `YYYY-MM-DD` strings instead of being shifted through JS Date.
types.setTypeParser(1082, (value) => value);

// Feature routes live in routes/; the REST contract is documented in docs/api.md.
export function createApp(
  pool: Pool,
  options: {
    today?: () => string;
    auth?: express.RequestHandler;
    push?: PushService;
    weeklySummary?: WeeklySummary;
    now?: () => number;
    /** shared-ai's public key (PEM); without it the AI tool routes are off (project-standards#559). */
    toolsPublicKey?: string;
  } = {},
) {
  const today = options.today ?? (() => seoulToday());
  const app = express();
  app.disable('x-powered-by');
  // project-standards#552: a request ID and one JSON log line for every request, a 401 included.
  app.use(requestLog);
  apiRateLimit(app);
  // #361: the health check registers before the sign-in, so it never depends on the auth package skipping it.
  app.get('/api/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  });
  // #303: the shared sign-in guards every /api route except /api/health, before any route registers.
  if (options.auth) app.use('/api', options.auth);
  app.get('/api/me', meHandler);
  // Backup routes parse their own 10MB body, so they register before the 256kb parser.
  registerBackupRoutes(app, pool);
  // #119: up to 200 imported cardio sessions; its own 2MB body limit.
  registerCardioImportRoute(app, pool, today);
  app.use(express.json({ limit: '256kb' }));
  registerRoutineRoutes(app, pool, today);
  registerMachineRoutes(app, pool);
  registerWorkoutRoutes(app, pool);
  registerBodyMeasurementRoutes(app, pool);
  registerGoalRoutes(app, pool);
  registerAnalysisRoutes(app, pool);
  registerWeightStepRoutes(app, pool);
  registerExerciseNameRoutes(app, pool);
  registerCardioRoutes(app, pool, today);
  registerCardioGoalRoutes(app, pool, today);
  // #260: without VAPID keys the service is disabled and the routes say so.
  const push = options.push ?? createPushService(pool, { config: null });
  registerPushRoutes(
    app,
    push,
    options.now,
    options.weeklySummary ?? createWeeklySummary(pool, push),
  );
  // AI tools for shared-ai on /internal/tools: outside /api, so nginx never forwards them and the
  // signed call token, not the session, is the check.
  // #822: shared-ai signs the tool and jti claims (project-standards#670), so the app requires them.
  registerToolRoutes(app, {
    app: 'workout-memo',
    tools,
    pool,
    publicKey: options.toolsPublicKey,
    requireBinding: true,
  });
  // #172: an unknown /api path is a JSON 404; the app's own messages come before the central handler.
  app.use('/api', notFound);
  app.use(appErrors);
  app.use(errorHandler);
  return app;
}
