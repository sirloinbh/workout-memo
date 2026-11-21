import { ArrowRight, ArrowUpRight } from 'lucide-react';
import type React from 'react';

import type { CardioSession } from '../cardio/api';
import { Button } from '../components/ui/button';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
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
      <div className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_230px] xl:grid-cols-[minmax(0,1fr)_280px] 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="gap-0 py-0 shadow-none">
          <CardHeader className="px-4 pt-5 md:px-6 md:pt-6">
            <CardTitle asHeading="h2" className="text-body font-semibold">
              Training volume
            </CardTitle>
            <CardDescription className="text-caption">
              Growth that gets clearer as your records build up
            </CardDescription>
            <CardAction className="flex items-center gap-1.5 text-meta whitespace-nowrap">
              <i aria-hidden className="size-1.5 rounded-xs bg-primary" />
              Volume (kg)
            </CardAction>
          </CardHeader>
          <VolumeChart workouts={workouts} from={from} to={to} custom={custom} />
        </Card>
        <Card className="relative min-h-52 gap-0 overflow-hidden bg-muted p-5 shadow-none xl:p-6">
          <div className="flex items-center justify-between text-meta tracking-widest">
            THE NEXT CHAPTER <ArrowUpRight aria-hidden size={19} />
          </div>
          <h2 className="mt-4 mb-2 text-2xl leading-normal font-semibold tracking-tight md:text-xl xl:text-2xl">
            A little heavier.
            <br />
            Do it once more.
          </h2>
          <p className="text-caption">
            Small challenges add up
            <br />
            to build your own growth.
          </p>
          <Button
            variant="link"
            className="relative z-10 mt-2 self-start px-0 text-foreground has-[>svg]:px-0"
            onClick={() => setPage('goals')}
          >
            See your goals <ArrowRight aria-hidden />
          </Button>
          <div
            aria-hidden
            className="pointer-events-none absolute -right-10 -bottom-[75px] size-[200px]"
          >
            <span className="absolute inset-0 rounded-full border" />
            <span className="absolute inset-5 rounded-full border" />
            <span className="absolute inset-10 rounded-full border" />
          </div>
        </Card>
      </div>
      <WorkoutRecords {...recordsProps} onAll={() => setPage('journal')} />
    </>
  );
}
