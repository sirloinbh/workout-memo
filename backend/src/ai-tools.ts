// The AI tools of Workout Memo (project-standards#559, ADR-0017). shared-ai lists and calls them over
// /internal/tools; standard/tools.ts checks the signed call, the scope, and writes the audit row.
import { createHash } from 'node:crypto';

import { z } from 'zod/v4';

import { dateRange, workoutSchema } from './domain.js';
import { defineTool } from './standard/tools.js';
import type { Db } from './store/db.js';
import { findRetry, insertWorkout, listWorkouts, summary } from './store/workouts.js';

// A tool reads at most a year of journals, so one call cannot return the whole history.
const MAX_DAYS = 366;
const listInput = dateRange.refine(
  (r) => (Date.parse(r.to) - Date.parse(r.from)) / 86_400_000 <= MAX_DAYS,
  `List at most ${MAX_DAYS} days at a time`,
);

export const tools = [
  defineTool({
    name: 'list_workouts',
    description:
      'List the strength workout journals between two dates (YYYY-MM-DD, at most 366 days), newest first, with their sets.',
    input: listInput,
    access: 'read',
    action: 'read',
    entity: 'workout',
    run: async (range, { db }: { db: Db }) => ({ result: await listWorkouts(db, range) }),
  }),
  defineTool({
    name: 'add_workout',
    description:
      'Add a strength workout journal: date (YYYY-MM-DD), title, notes, and sets of exercise, weight in kg (total, including the machine base) and reps. Pass the same idempotency_key (a UUID) when you retry a call, so the journal is added only once.',
    // A new journal has no version yet. The optional key makes a retried call (the AI client or shared-ai
    // sends it again) answer with the journal the first call made instead of adding a second one (#362).
    input: workoutSchema.omit({ version: true }).extend({ idempotency_key: z.guid().optional() }),
    access: 'write',
    action: 'create',
    entity: 'workout',
    run: async ({ idempotency_key: key, ...w }, { db }: { db: Db }) => {
      const fingerprint = createHash('sha256')
        .update(JSON.stringify(['ai-add', w]))
        .digest('hex');
      if (key) {
        const replay = await findRetry(db, key, fingerprint);
        if (replay) {
          const body = replay.body as { id?: number };
          // A replay answers with the stored journal; a conflict says why nothing was added.
          return replay.status < 400
            ? { result: replay.body, entityId: body.id ?? null }
            : { result: replay.body };
        }
      }
      const id = await insertWorkout(db, w);
      if (key)
        await db.query(
          'INSERT INTO workout_requests(key,fingerprint,status,response) VALUES($1,$2,$3,$4)',
          [key, fingerprint, 201, { id, version: 1 }],
        );
      return {
        result: { id, version: 1 },
        entityId: id,
        after: summary({ date: w.date, title: w.title, version: 1 }, w.sets.length),
      };
    },
  }),
];
