import express from 'express';
import type { Pool } from 'pg';
import { types } from 'pg';

import { registerBackupRoutes } from './backup.js';
import { seoulToday } from './progress.js';
import { registerAnalysisRoutes } from './routes/analysis.js';
import { registerBodyMeasurementRoutes } from './routes/body-measurements.js';
import { registerCardioImportRoute, registerCardioRoutes } from './routes/cardio.js';
import { registerCardioGoalRoutes } from './routes/cardio-goals.js';
import { registerExerciseNameRoutes } from './routes/exercise-names.js';
import { registerGoalRoutes } from './routes/goals.js';
import { registerMachineRoutes } from './routes/machines.js';
import { registerRoutineRoutes } from './routes/routines.js';
import { appErrors } from './routes/shared.js';
import { registerWeightStepRoutes } from './routes/weight-steps.js';
import { registerWorkoutRoutes } from './routes/workouts.js';
import { errorHandler, notFound } from './standard/http.js';
// DATE columns stay `YYYY-MM-DD` strings instead of being shifted through JS Date.
types.setTypeParser(1082, (value) => value);

// Feature routes live in routes/; the REST contract is documented in docs/api.md.
export function createApp(pool: Pool, options: { today?: () => string } = {}) {
  const today = options.today ?? (() => seoulToday());
  const app = express();
  app.disable('x-powered-by');
  // Backup routes parse their own 10MB body, so they register before the 256kb parser.
  registerBackupRoutes(app, pool);
  // #119: up to 200 imported cardio sessions; its own 2MB body limit.
  registerCardioImportRoute(app, pool, today);
  app.use(express.json({ limit: '256kb' }));
  registerRoutineRoutes(app, pool, today);
  app.get('/api/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  });
  registerMachineRoutes(app, pool);
  registerWorkoutRoutes(app, pool);
  registerBodyMeasurementRoutes(app, pool);
  registerGoalRoutes(app, pool);
  registerAnalysisRoutes(app, pool);
  registerWeightStepRoutes(app, pool);
  registerExerciseNameRoutes(app, pool);
  registerCardioRoutes(app, pool, today);
  registerCardioGoalRoutes(app, pool, today);
  // #172: an unknown /api path is a JSON 404; the app's own messages come before the central handler.
  app.use('/api', notFound);
  app.use(appErrors);
  app.use(errorHandler);
  return app;
}
