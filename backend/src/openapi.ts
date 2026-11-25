// The API's operation table. The document is built by the managed standard/openapi.ts from Zod schemas
// (z.toJSONSchema). `npm run openapi` writes docs/openapi.json; a test fails when it is out of date or when the
// table and the registered routes differ. Summaries are the descriptions in docs/api.md.
import { z } from 'zod/v4';

import { bodyPartMappingSchema } from './analysis.js';
import { exportQuery, restoreRequest } from './backup.js';
import { pushSubscriptionSchema, pushUnsubscribeSchema, restPushSchema } from './contract.js';
import {
  bodyMeasurementSchema,
  cardioGoalSchema,
  cardioSessionSchema,
  date,
  dateRange,
  goalSchema,
  machineSchema,
  officialWeightQuery,
  routineSchema,
  weightStepSchema,
  workoutSchema,
} from './domain.js';
import { analysisQuery } from './routes/analysis.js';
import { cardioImportDocument, cardioQuery } from './routes/cardio.js';
import { goalSuggestionQuery } from './routes/weight-steps.js';
import { buildOpenApi, type Operation } from './standard/openapi.js';

const idempotencyKeyHeader = {
  'Idempotency-Key': {
    description: 'Retry key that applies the same request only once for 7 days',
    schema: z.uuid(),
  },
};

const restBody = z.object({ date });
// Every registered route must appear here exactly once (checked when building).
export const operations: Record<string, Operation> = {
  'GET /api/health': {
    summary: 'DB connection check. { "status": "ok" }',
    status: [200, 500],
  },
  'GET /api/me': {
    summary: 'The signed-in user. { "user": { id, email, name, image } }',
    status: [200, 401, 503],
  },
  'GET /api/brands': {
    summary: 'Brand list (by id)',
    status: [200],
  },
  'GET /api/official-machine-weights': {
    summary: 'Manufacturer official starting resistance reference values. ?brand= optional',
    query: officialWeightQuery,
    status: [200, 400],
  },
  'GET /api/machines': {
    summary: 'Machine list with the linked official reference values (newest first)',
    status: [200],
  },
  'POST /api/machines': {
    summary: 'Create a machine → 201',
    body: ['Machine', machineSchema],
    status: [201, 400, 409],
  },
  'PUT /api/machines/:id': {
    summary: 'Update a machine',
    body: ['Machine', machineSchema],
    status: [200, 400, 404, 409],
  },
  'GET /api/workouts': {
    summary: 'Logs and sets in the ?from&to period (latest date first)',
    query: dateRange,
    status: [200, 400],
  },
  'POST /api/workouts': {
    summary: 'Save a log → 201 { id, version, records }. Idempotency-Key optional',

    body: ['Workout', workoutSchema],
    status: [201, 400, 409],
    headers: idempotencyKeyHeader,
  },
  'PUT /api/workouts/:id': {
    summary: 'Replace a whole log → { id, version, records }. version required',

    body: ['Workout', workoutSchema],
    status: [200, 400, 404, 409],
    headers: idempotencyKeyHeader,
  },
  'DELETE /api/workouts/:id': {
    summary: 'Delete a log and its sets → { ok: true }',
    status: [200, 400, 404],
  },
  'GET /api/goals': {
    summary: 'Goal list with the server-evaluated achieved',
    status: [200],
  },
  'POST /api/goals': {
    summary: 'Create a goal → 201',
    body: ['Goal', goalSchema],
    status: [201, 400],
  },
  'DELETE /api/goals/:id': {
    summary: 'Delete a goal → { ok }',
    status: [200, 400, 404],
  },
  'GET /api/routines': {
    summary: 'Saved routines with the 84-day schedule (schedule)',
    status: [200],
  },
  'POST /api/routines': {
    summary: 'Save a routine → 201 { id }',
    body: ['Routine', routineSchema],
    status: [201, 400],
  },
  'GET /api/routines/:id': {
    summary: 'One routine with its schedule',
    status: [200, 400, 404],
  },
  'GET /api/routine-progress': {
    summary:
      "Today's goal, weekly and 12-week progress, and previous records of the routine in progress, and stalls (3 misses in a row: deload and smaller-step suggestion). routine: null if none",
    status: [200],
  },
  'POST /api/routines/:id/rests': {
    summary: 'Choose to rest today { date } → 201 (applied) or 200 (already applied)',

    body: ['RoutineRest', restBody],
    status: [201, 200, 400, 404, 409],
  },
  'DELETE /api/routines/:id/rests/:date': {
    params: { date },
    summary: 'Cancel the rest on the same day',
    status: [200, 400, 404, 409],
  },
  'GET /api/body-measurements': {
    summary: 'Body records in the ?from&to period (by date)',
    query: dateRange,
    status: [200, 400],
  },
  'POST /api/body-measurements': {
    summary: 'Create a body record → 201. The same date is 409',

    body: ['BodyMeasurement', bodyMeasurementSchema],
    status: [201, 400, 409],
  },
  'PUT /api/body-measurements/:id': {
    summary: 'Replace a whole body record. Omitted values become null',

    body: ['BodyMeasurement', bodyMeasurementSchema],
    status: [200, 400, 404, 409],
  },
  'DELETE /api/body-measurements/:id': {
    summary: 'Delete a body record → { ok: true }',
    status: [200, 400, 404],
  },
  'GET /api/analysis': {
    summary:
      '?from&to (up to 371 days) PR by exercise, estimated 1RM, and weekly volume by body part',
    query: analysisQuery,
    status: [200, 400],
  },
  'GET /api/records': {
    summary:
      'Record board: per exercise the best estimated 1RM and the heaviest set over all saved history, with dates',
    status: [200],
  },
  'GET /api/exercise-body-parts': {
    summary: 'Body part mapping per exercise',
    status: [200],
  },
  'PUT /api/exercise-body-parts': {
    summary: 'Replace the body part mapping of one exercise. An empty array deletes the mapping',

    body: ['BodyPartMapping', bodyPartMappingSchema],
    status: [200, 400],
  },
  // #124: autocomplete candidates; see docs/api.md.
  'GET /api/exercise-names': {
    summary: 'Exercise name autocomplete candidates (#124). Recent, then most used, up to 50',
    status: [200],
  },
  'GET /api/exercise-weight-steps': {
    summary: 'Weight step per exercise (#86). Only the exercises that were set',
    status: [200],
  },
  'PUT /api/exercise-weight-steps': {
    summary: 'Save the weight step of one exercise. null goes back to the default 5 kg',

    body: ['WeightStep', weightStepSchema],
    status: [200, 400],
  },
  // #260: Web Push for the rest timer; see docs/api.md.
  'GET /api/push/config': {
    summary: 'Whether rest-end Web Push is set up on the server and its public VAPID key (#260)',
    status: [200],
  },
  'POST /api/push/subscriptions': {
    summary:
      "Save this browser's push subscription for the signed-in user → 201. 503 when push is not set up",

    body: ['PushSubscription', pushSubscriptionSchema],
    status: [201, 400, 503],
  },
  'DELETE /api/push/subscriptions': {
    summary: 'Remove a push subscription (endpoint in the body) → { ok: true }',

    body: ['PushUnsubscribe', pushUnsubscribeSchema],
    status: [200, 400],
  },
  'PUT /api/push/rest': {
    summary:
      'Tell the server when the running rest ends (ends_at, epoch ms); it sends one push then. 503 when push is not set up',
    body: ['RestPush', restPushSchema],
    status: [200, 400, 503],
  },
  'DELETE /api/push/rest': {
    summary: 'Cancel the pending rest-end push (cancel or pause) → { ok: true }',
    status: [200],
  },
  'GET /api/goal-suggestion': {
    summary: 'Next goal suggestion for ?exercise= (not saved)',
    query: goalSuggestionQuery,
    status: [200, 400],
  },
  // #114: the server also rejects a date after today (Asia/Seoul); see docs/api.md.
  'GET /api/cardio-sessions': {
    summary: 'Cardio records in the ?from&to period (newest first). kind optional',
    query: cardioQuery,
    status: [200, 400],
  },
  // #115: all-time personal records; see docs/api.md.
  'GET /api/cardio-sessions/records': {
    summary:
      'Cardio personal records (all time): longest distance per kind, best running 5km and 10km times',
    status: [200],
  },
  'GET /api/cardio-sessions/:id': {
    summary: 'One cardio record',
    status: [200, 400, 404],
  },
  'POST /api/cardio-sessions': {
    summary: 'Create a cardio record → 201. The same source and external ID is 409',

    body: ['CardioSession', cardioSessionSchema],
    status: [201, 400, 409],
  },
  // #119: all rows or none; a refused row comes back by its index (see docs/api.md).
  'POST /api/cardio-sessions/import': {
    summary:
      'Save imported cardio records in bulk (all or nothing) → 201. Rejected rows are in rows',

    body: ['CardioImport', cardioImportDocument],
    status: [201, 400, 409, 413],
  },
  'PUT /api/cardio-sessions/:id': {
    summary: 'Replace a whole cardio record (transaction). Omitted optional values become null',

    body: ['CardioSession', cardioSessionSchema],
    status: [200, 400, 404, 409],
  },
  'DELETE /api/cardio-sessions/:id': {
    summary: 'Delete a cardio record → { ok: true }',
    status: [200, 400, 404],
  },
  'GET /api/export/cardio.csv': {
    summary: 'CSV for cardio analysis (?from&to optional). Cannot be used for restore',
    query: exportQuery,
    status: [200, 400],
    produces: 'text/csv',
  },
  'GET /api/cardio-goals': {
    summary: 'Cardio goal list with the server-evaluated achieved and progress',
    status: [200],
  },
  'POST /api/cardio-goals': {
    summary: 'Create a cardio goal → 201',
    body: ['CardioGoal', cardioGoalSchema],
    status: [201, 400],
  },
  'GET /api/cardio-goals/:id/suggestion': {
    summary: 'Next goal suggestion for that goal (not saved). suggestion: null if out of range',
    status: [200, 400, 404],
  },
  'DELETE /api/cardio-goals/:id': {
    summary: 'Delete a cardio goal → { ok: true }',
    status: [200, 400, 404],
  },
  'GET /api/export/workouts.csv': {
    summary: 'CSV for analysis (?from&to optional). Cannot be used for restore',
    query: exportQuery,
    status: [200, 400],
    produces: 'text/csv',
  },
  'GET /api/backup': {
    summary: 'JSON backup file for restore',
    status: [200],
  },
  'POST /api/backup/preview': {
    summary: 'Restore preview (the same procedure, then ROLLBACK)',

    body: ['RestoreRequest', restoreRequest],
    status: [200, 400, 413, 500],
  },
  'POST /api/backup/restore': {
    summary:
      'Run a restore. mode: "replace" requires confirm: "전체 교체" (Korean for "full replace")',

    body: ['RestoreRequest', restoreRequest],
    status: [200, 400, 413, 500],
  },
};

const statusText: Record<number, string> = {
  200: 'Success',
  201: 'Created',
  400: 'Input validation failed or a referenced item does not exist',
  401: 'Sign-in required (no session from the shared sign-in)',
  404: 'No target',
  409: 'Duplicate, version conflict, retry key mismatch, or date condition mismatch',
  413: 'Request size limit exceeded',
  500: 'Server error',
  // The sign-in route and the push routes (not set up on this server) share this status.
  503: 'Service unavailable: the shared sign-in service could not be reached, or Web Push is not set up',
};

export const document = buildOpenApi({
  title: 'Workout Memo API',
  description:
    'Personal workout journal API. Dates are YYYY-MM-DD (Asia/Seoul) and weights are total weight in kg including the base weight. See docs/api.md for response bodies and cross-field rules.',
  errorDescription: 'English error message',
  operations,
  statusText,
});
