import { Footprints } from 'lucide-react';
import { useState } from 'react';

import { StatCard } from '../components/stat-card';
import type { CardioSession } from './api';
import type { LinkableWorkout } from './cardio-form';
import { type CardioListStatus, CardioPanel } from './cardio-panel';
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
  const [list, setList] = useState<{ sessions: CardioSession[]; status: CardioListStatus }>({
    sessions: [],
    status: 'loading',
  });
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="flex flex-col gap-6">
      <CardioPanel
        from={from}
        to={to}
        today={today}
        workouts={workouts}
        onSessionsChange={(sessions, status) => setList({ sessions, status })}
        onChanged={() => {
          setRefreshKey((key) => key + 1);
          onChanged?.();
        }}
      />
      {/* A failed load is reported by the panel above, so the statistics must not claim "no
          sessions" for it. While a period loads they stay mounted (keeping the chosen metric and
          the loaded personal records) and say they are loading. */}
      {list.status !== 'error' && (
        <CardioStats
          from={from}
          to={to}
          sessions={list.sessions}
          refreshKey={refreshKey}
          pending={list.status === 'loading'}
        />
      )}
    </div>
  );
}

// #115 decision 5: the dashboard's one cardio card — distance, count and time of the period.
// Nothing is drawn without a session. Distance is in km for every kind, like the tab's totals.
export function CardioSummaryCard({ sessions }: { sessions: readonly CardioSession[] }) {
  const total = totalsOf(sessions);
  if (!total.count) return null;
  // Sessions without any distance (e.g. indoor cycling only) would read as "0 km", as if a
  // distance of zero had been covered; the card leads with the count instead.
  if (!total.distance_km)
    return (
      <StatCard
        label="유산소"
        value={String(total.count)}
        unit="회"
        icon={<Footprints size={19} />}
        foot={`${formatDuration(total.duration_sec)} · 거리 미입력`}
      />
    );
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
