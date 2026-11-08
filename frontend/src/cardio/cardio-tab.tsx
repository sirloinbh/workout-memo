import { Footprints } from 'lucide-react';
import { useState } from 'react';

import { StatCard } from '../components/stat-card';
import type { CardioSession } from './api';
import type { LinkableWorkout } from './cardio-form';
import { CardioPanel } from './cardio-panel';
import { CardioStats } from './cardio-stats';
import { formatDistance, formatDuration } from './format';
import { totalsOf } from './stats';

// #115 PR ③: the journal's 유산소 tab. CardioPanel loads the period and keeps its list; the
// statistics reuse that list (no second request) and the personal records reload after every
// save or delete through `refreshKey`.
export function CardioTab({
  from,
  to,
  today,
  workouts,
  onChanged,
}: {
  from: string;
  to: string;
  today?: string;
  workouts: readonly LinkableWorkout[];
  // After a save or delete, e.g. so the dashboard summary loads the period again.
  onChanged?: () => void;
}) {
  const [sessions, setSessions] = useState<CardioSession[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="flex flex-col gap-6">
      <CardioPanel
        from={from}
        to={to}
        today={today}
        workouts={workouts}
        onSessionsChange={setSessions}
        onChanged={() => {
          setRefreshKey((key) => key + 1);
          onChanged?.();
        }}
      />
      <CardioStats from={from} to={to} sessions={sessions} refreshKey={refreshKey} />
    </div>
  );
}

// #115 decision 5: the dashboard's one cardio card — distance, count and time of the period.
// Nothing is drawn without a session. Distance is in km for every kind, like the tab's totals.
export function CardioSummaryCard({ sessions }: { sessions: readonly CardioSession[] }) {
  const total = totalsOf(sessions);
  if (!total.count) return null;
  // "12.3 km" → the number and its unit, as StatCard shows them apart.
  const [distance, unit] = formatDistance('running', total.distance_km)!.split(' ');
  return (
    <StatCard
      label="유산소"
      value={distance}
      unit={unit}
      icon={<Footprints size={19} />}
      foot={`${total.count}회 · ${formatDuration(total.duration_sec)}`}
    />
  );
}
