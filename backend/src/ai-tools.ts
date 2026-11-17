// The AI tools of Workout Memo (project-standards#559, ADR-0017). shared-ai lists and calls them over
// /internal/tools; standard/tools.ts checks the signed call, the scope, and writes the audit row.
import { dateRange, workoutSchema } from './domain.js';
import type { Db } from './routes/shared.js';
import { insertWorkout, listWorkouts, summary } from './routes/workouts.js';
import { defineTool } from './standard/tools.js';

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
      'Add a strength workout journal: date (YYYY-MM-DD), title, notes, and sets of exercise, weight in kg (total, including the machine base) and reps.',
    // A new journal has no version yet.
    input: workoutSchema.omit({ version: true }),
    access: 'write',
    action: 'create',
    entity: 'workout',
    run: async (w, { db }: { db: Db }) => {
      const id = await insertWorkout(db, w);
      return {
        result: { id, version: 1 },
        entityId: id,
        after: summary({ date: w.date, title: w.title, version: 1 }, w.sets.length),
      };
    },
  }),
];
