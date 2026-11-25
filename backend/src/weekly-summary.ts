import type { Pool } from 'pg';

import { exerciseKeySql } from './domain.js';
import { newRecordsFor } from './records.js';
import type { PushPayload, PushService } from './web-push.js';

// #485: the weekly summary push. Sunday 21:00 Asia/Seoul (user decision, 2026-11-25), off until turned on, and
// skipped in a week with no workouts. A week is Monday to Sunday (AGENTS.project.md).
const hourMs = 3600 * 1000;
const dayMs = 24 * hourMs;
// Asia/Seoul has no daylight saving, so a fixed offset is exact.
const seoulOffsetMs = 9 * hourMs;
const sendHour = 21;
// The longest delay setTimeout accepts.
const maxTimerMs = 2 ** 31 - 1;

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The next Sunday 21:00 Seoul time strictly after `nowMs`, as epoch milliseconds. */
export function nextSendAt(nowMs: number): number {
  const seoul = new Date(nowMs + seoulOffsetMs);
  const daysToSunday = (7 - seoul.getUTCDay()) % 7;
  const target =
    Date.UTC(seoul.getUTCFullYear(), seoul.getUTCMonth(), seoul.getUTCDate() + daysToSunday) +
    sendHour * hourMs;
  const at = target - seoulOffsetMs;
  return at > nowMs ? at : at + 7 * dayMs;
}

/**
 * The Monday of the week whose summary is due at `nowMs`: it is Sunday between 21:00 and midnight in Seoul.
 * Any other time has nothing due, so a restart on Monday never sends last week's summary late.
 */
export function dueWeek(nowMs: number): string | null {
  const seoul = new Date(nowMs + seoulOffsetMs);
  if (seoul.getUTCDay() !== 0 || seoul.getUTCHours() < sendHour) return null;
  return isoDate(Date.UTC(seoul.getUTCFullYear(), seoul.getUTCMonth(), seoul.getUTCDate() - 6));
}

export type WeekSummary = {
  from: string;
  to: string;
  workouts: number;
  days: number;
  volume: number;
  records: number;
  goals_achieved: number;
  goals_total: number;
};

const fmt = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The push text: the week's volume, new records and goal progress. */
export function summaryPayload(s: WeekSummary): PushPayload {
  const parts = [
    `${plural(s.days, 'workout day')} · ${fmt(s.volume)} kg`,
    `${plural(s.records, 'new record')}`,
  ];
  if (s.goals_total > 0) parts.push(`goals ${s.goals_achieved}/${s.goals_total} achieved`);
  return { title: 'Your week in review', body: parts.join(' · '), url: '/', tag: 'weekly-summary' };
}

type Options = { now?: () => number; log?: (message: string) => void };

export function createWeeklySummary(
  pool: Pick<Pool, 'query'>,
  push: PushService,
  options: Options = {},
) {
  const now = options.now ?? Date.now;
  const log = options.log ?? ((message: string) => console.error(message));

  /** The summary of Monday `from` to Sunday, or null when that week has no completed workout. */
  async function buildSummary(from: string): Promise<WeekSummary | null> {
    const to = isoDate(Date.parse(`${from}T00:00:00Z`) + 6 * dayMs);
    const totals = (
      await pool.query(
        `SELECT count(DISTINCT w.id)::int workouts, count(DISTINCT w.date)::int days,
                coalesce(sum(s.weight * s.reps), 0)::float8 volume
         FROM workouts w JOIN sets s ON s.workout_id=w.id
         WHERE s.completed AND w.date BETWEEN $1 AND $2`,
        [from, to],
      )
    ).rows[0] as { workouts: number; days: number; volume: number };
    if (!totals.workouts) return null;
    const ids = (
      await pool.query(
        `SELECT DISTINCT w.id FROM workouts w JOIN sets s ON s.workout_id=w.id
         WHERE s.completed AND w.date BETWEEN $1 AND $2`,
        [from, to],
      )
    ).rows as { id: number }[];
    let records = 0;
    for (const { id } of ids) records += (await newRecordsFor(pool, id)).length;
    // Goals whose period overlaps the week; achieved as of the end of the week.
    const goals = (
      await pool.query(
        `SELECT count(*)::int total,
                count(*) FILTER (WHERE EXISTS(
                  SELECT 1 FROM sets s JOIN workouts w ON w.id=s.workout_id
                  WHERE s.completed AND ${exerciseKeySql('s.exercise')}=${exerciseKeySql('g.exercise')}
                    AND s.weight>=g.target_weight AND s.reps>=g.target_reps
                    AND w.date BETWEEN g.start_date AND LEAST(g.deadline, $2::date)))::int achieved
         FROM goals g WHERE g.start_date <= $2::date AND g.deadline >= $1::date`,
        [from, to],
      )
    ).rows[0] as { total: number; achieved: number };
    return {
      from,
      to,
      workouts: totals.workouts,
      days: totals.days,
      volume: totals.volume,
      records,
      goals_achieved: goals.achieved,
      goals_total: goals.total,
    };
  }

  /**
   * Sends the summary when it is due. The week is claimed first (one UPDATE sets `last_sent_week` for every user
   * who has it on and has not had this week), so a restart or two overlapping checks never send it twice. A week
   * with no workouts is claimed too, and nothing is sent. Returns how many users were notified.
   */
  async function sendDue(): Promise<number> {
    const week = dueWeek(now());
    if (!week || !push.enabled) return 0;
    const claimed = (
      await pool.query(
        `UPDATE weekly_summary_settings SET last_sent_week=$1
         WHERE enabled AND (last_sent_week IS NULL OR last_sent_week < $1) RETURNING user_id`,
        [week],
      )
    ).rows as { user_id: string }[];
    if (!claimed.length) return 0;
    const summary = await buildSummary(week);
    if (!summary) return 0;
    const payload = summaryPayload(summary);
    await Promise.all(claimed.map(({ user_id }) => push.sendToUser(user_id, payload)));
    return claimed.length;
  }

  let timer: NodeJS.Timeout | null = null;
  const inFlight = new Set<Promise<unknown>>();
  let started = false;

  function arm() {
    if (!started) return;
    timer = setTimeout(fire, Math.min(maxTimerMs, nextSendAt(now()) - now()));
    timer.unref();
  }
  function fire() {
    timer = null;
    // Woken early by the timer cap: nothing is due, so just arm again.
    const work = sendDue()
      .catch((error: Error) => log(`Weekly summary failed: ${error.message}`))
      .then(arm);
    inFlight.add(work);
    void work.then(() => inFlight.delete(work));
  }

  return {
    buildSummary,
    sendDue,
    async isEnabled(userId: string): Promise<boolean> {
      const rows = (
        await pool.query('SELECT enabled FROM weekly_summary_settings WHERE user_id=$1', [userId])
      ).rows as { enabled: boolean }[];
      return rows[0]?.enabled ?? false;
    },
    async setEnabled(userId: string, enabled: boolean): Promise<void> {
      await pool.query(
        `INSERT INTO weekly_summary_settings(user_id, enabled) VALUES($1,$2)
         ON CONFLICT (user_id) DO UPDATE SET enabled=EXCLUDED.enabled`,
        [userId, enabled],
      );
    },
    /** Arms the Sunday timer and sends a summary that is due right now (a restart during Sunday evening). */
    start(): () => Promise<void> {
      if (!push.enabled) return () => Promise.resolve();
      started = true;
      const first = sendDue().catch((error: Error) =>
        log(`Weekly summary failed: ${error.message}`),
      );
      inFlight.add(first);
      void first.then(() => inFlight.delete(first));
      arm();
      return async () => {
        started = false;
        if (timer) clearTimeout(timer);
        timer = null;
        await Promise.allSettled([...inFlight]);
      };
    },
  };
}
export type WeeklySummary = ReturnType<typeof createWeeklySummary>;
