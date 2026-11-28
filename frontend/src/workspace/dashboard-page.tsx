import type React from 'react';

import type { CardioSession } from '../cardio/api';
import { Card, CardAction, CardHeader, CardTitle } from '../components/ui/card';
import { ActivityCalendar } from './activity-calendar';
import type { Goal, Page } from './model';
import { StatsGrid } from './stats-grid';
import { VolumeChart } from './volume-chart';
import { type RecordsProps, WorkoutRecords } from './workout-records';

/** The dashboard: period totals, the volume chart and the records of the period. */
export function DashboardPage({
  periodControls,
  goals,
  cardioSessions,
  recordsProps,
  from,
  to,
  custom,
  setPage,
}: {
  periodControls: React.ReactNode;
  goals: Goal[];
  cardioSessions: CardioSession[];
  recordsProps: RecordsProps;
  from: string;
  to: string;
  custom: boolean;
  setPage: (page: Page) => void;
}) {
  const { workouts } = recordsProps;
  return (
    <>
      {periodControls}
      <StatsGrid workouts={workouts} goals={goals} cardioSessions={cardioSessions} />
      <div className="mb-6">
        <Card className="gap-0 py-0 shadow-none">
          <CardHeader className="px-4 pt-5 md:px-6 md:pt-6">
            <CardTitle asHeading="h2" className="text-body font-semibold">
              Training volume
            </CardTitle>
            <CardAction className="flex items-center gap-1.5 text-meta whitespace-nowrap">
              <i aria-hidden className="size-1.5 rounded-xs bg-primary" />
              Volume (kg)
            </CardAction>
          </CardHeader>
          <VolumeChart workouts={workouts} from={from} to={to} custom={custom} />
        </Card>
      </div>
      <ActivityCalendar />
      <WorkoutRecords {...recordsProps} onAll={() => setPage('journal')} />
    </>
  );
}
