import type { z } from 'zod/v4';

import type { workoutSchema } from '../domain.js';
import type { Db } from './db.js';

// Workout data access (#366): the routes, the AI tools and the backup restore share these queries.
// The audit summary of a journal (project-standards#553): what identifies it, not every set.
export const summary = (w: { date: string; title: string; version: number }, sets?: number) => ({
  date: w.date,
  title: w.title,
  version: w.version,
  ...(sets === undefined ? {} : { sets }),
});

type Workout = z.infer<typeof workoutSchema>;

export async function listWorkouts(db: Db, range: { from: string; to: string }) {
  return (
    await db.query(
      `SELECT w.*,COALESCE(json_agg(s ORDER BY s.position) FILTER(WHERE s.id IS NOT NULL),'[]') sets FROM workouts w LEFT JOIN sets s ON s.workout_id=w.id WHERE w.date BETWEEN $1 AND $2 GROUP BY w.id ORDER BY w.date DESC,w.id DESC`,
      [range.from, range.to],
    )
  ).rows;
}

export async function insertWorkout(db: Db, w: Workout): Promise<number> {
  const id: number = (
    await db.query(
      'INSERT INTO workouts(date,title,notes,feedback) VALUES($1,$2,$3,$4) RETURNING id',
      [w.date, w.title, w.notes, w.feedback],
    )
  ).rows[0].id;
  await insertSets(db, id, w.sets);
  return id;
}

// #368: one multi-row INSERT for all sets (the arrays keep their order, which is the position).
export async function insertSets(db: Db, workoutId: number, sets: Workout['sets']) {
  if (!sets.length) return;
  await db.query(
    `INSERT INTO sets(workout_id,exercise,machine_id,weight,reps,position,notes,completed,rpe)
     SELECT $1, exercise, machine_id, weight, reps, position - 1, notes, completed, rpe
     FROM unnest($2::text[], $3::int[], $4::numeric[], $5::int[], $6::text[], $7::boolean[], $8::numeric[])
       WITH ORDINALITY AS t(exercise, machine_id, weight, reps, notes, completed, rpe, position)
     ORDER BY position`,
    [
      workoutId,
      sets.map((s) => s.exercise),
      sets.map((s) => s.machine_id),
      sets.map((s) => s.weight),
      sets.map((s) => s.reps),
      sets.map((s) => s.notes),
      sets.map((s) => s.completed),
      sets.map((s) => s.rpe),
    ],
  );
}

/**
 * The stored answer for a retry key (#362: shared by the REST route and the add_workout AI tool). The lock serializes
 * identical keys across connections, including their first use. Null when the key is new; a 409 when the key expired
 * or came with other content.
 */
export async function findRetry(
  client: Db,
  key: string,
  fingerprint: string,
): Promise<{ status: number; body: unknown } | null> {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
  const previous = await client.query(
    'SELECT *, expires_at <= now() expired FROM workout_requests WHERE key=$1',
    [key],
  );
  if (!previous.rowCount) return null;
  const saved = previous.rows[0];
  if (saved.expired)
    return {
      status: 409,
      body: { error: 'The 7-day validity of the retry key has passed. Check the server record.' },
    };
  if (saved.fingerprint !== fingerprint)
    return {
      status: 409,
      body: { error: 'The request content differs from the one with the same retry key.' },
    };
  return { status: saved.status, body: saved.response };
}
