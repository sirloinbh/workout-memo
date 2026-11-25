import { estimatedOneRepMax } from './contract.js';
import { exerciseKeySql } from './domain.js';
import type { Db } from './store/db.js';

/** A saved set whose estimated 1RM is above every earlier completed set of the same exercise (#477). */
export type NewRecord = {
  /** Index of the set inside the saved workout (0-based, the order it was sent in). */
  position: number;
  exercise: string;
  weight: number;
  reps: number;
  estimated_1rm: number;
  previous_best: number;
};

export type RecordRow = {
  workout_id: number;
  position: number;
  exercise: string;
  exercise_key: string;
  weight: number | string;
  reps: number;
  unknown_base: boolean;
};

/**
 * rows: completed sets in chronological order (date, then id). A tie is not a record, sets on a machine whose base
 * weight is unconfirmed have no estimate and are skipped, and the first estimate of an exercise has nothing to beat.
 */
export function findNewRecords(rows: RecordRow[], workoutId: number): NewRecord[] {
  const best = new Map<string, number>();
  const records: NewRecord[] = [];
  for (const s of rows) {
    const weight = Number(s.weight);
    const value = estimatedOneRepMax(weight, s.reps, s.unknown_base);
    if (value === null) continue;
    const previous = best.get(s.exercise_key);
    if (previous !== undefined && value > previous) {
      if (s.workout_id === workoutId)
        records.push({
          position: s.position,
          exercise: s.exercise.trim(),
          weight,
          reps: s.reps,
          estimated_1rm: value,
          previous_best: previous,
        });
    }
    if (previous === undefined || value > previous) best.set(s.exercise_key, value);
  }
  return records.sort((a, b) => a.position - b.position);
}

export async function newRecordsFor(db: Db, workoutId: number): Promise<NewRecord[]> {
  const rows = await db.query(
    `SELECT s.workout_id, s.position, s.exercise, ${exerciseKeySql('s.exercise')} exercise_key, s.weight, s.reps,
            (s.machine_id IS NOT NULL AND m.base_weight IS NULL) unknown_base
     FROM sets s JOIN workouts w ON w.id=s.workout_id LEFT JOIN machines m ON m.id=s.machine_id
     WHERE s.completed AND ${exerciseKeySql('s.exercise')} IN (
       SELECT ${exerciseKeySql('t.exercise')} FROM sets t WHERE t.workout_id=$1 AND t.completed)
     ORDER BY w.date, s.id`,
    [workoutId],
  );
  return findNewRecords(rows.rows as RecordRow[], workoutId);
}
