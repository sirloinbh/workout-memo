import { Activity, Dumbbell, NotebookPen, Target } from 'lucide-react';

import type { CardioSession } from '../cardio/api';
import { CardioSummaryCard } from '../cardio/cardio-tab';
import { StatCard } from '../components/ui/stat-card';
import { plural } from '../labels';
import { cleanDate, done, fmt, type Goal, vol, type Workout } from './model';

/** The four period totals, and on the dashboard a fifth card for cardio. */
export function StatsGrid({
  workouts,
  goals,
  cardioSessions,
}: {
  workouts: Workout[];
  goals: Goal[];
  cardioSessions: CardioSession[];
}) {
  const total = workouts.reduce((n, w) => n + vol(w), 0),
    totalSets = workouts.reduce((n, w) => n + w.sets.filter(done).length, 0),
    days = new Set(workouts.filter((w) => w.sets.some(done)).map((w) => cleanDate(w.date))).size;
  return (
    <div
      className={`mb-6 grid grid-cols-2 gap-2.5 xl:gap-4 ${cardioSessions.length ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}
    >
      <StatCard
        label="Workout days"
        value={String(days)}
        unit={days === 1 ? ' day' : ' days'}
        icon={<NotebookPen size={19} />}
        foot="By recorded date"
      />
      <StatCard
        label="Total volume"
        value={fmt(total)}
        unit="kg"
        icon={<Dumbbell size={19} />}
        foot="Total weight × reps"
      />
      <StatCard
        label="Completed sets"
        value={String(totalSets)}
        unit={totalSets === 1 ? ' set' : ' sets'}
        icon={<Activity size={19} />}
        foot={plural(workouts.length, 'workout journal')}
      />
      <StatCard
        label="Goal achieved"
        value={String(goals.filter((g) => g.achieved).length)}
        unit={`/ ${goals.length}`}
        icon={<Target size={19} />}
        foot="Based on records within the goal period"
      />
      {/* #115: the fifth card fills a row of its own on phones. */}
      {cardioSessions.length > 0 && (
        <div className="max-lg:col-span-2 [&>*]:h-full">
          <CardioSummaryCard sessions={cardioSessions} />
        </div>
      )}
    </div>
  );
}
