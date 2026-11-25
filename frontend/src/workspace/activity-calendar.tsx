import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { Button } from '../components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { monthNames } from '../date';
import { dailyVolumes, monthGrid, shadeLevel, shiftMonth, weekStreaks } from './activity';
import { api } from './api';
import { fmt, today, type Workout } from './model';

const historyDays = 400;
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const shades = [
  'bg-muted/50 text-muted-foreground',
  'bg-primary/20',
  'bg-primary/40',
  'bg-primary/65 text-primary-foreground',
  'bg-primary text-primary-foreground',
] as const;

const addDays = (date: string, delta: number) =>
  new Date(Date.parse(date + 'T00:00:00Z') + delta * 86400000).toISOString().slice(0, 10);

/** #482: a month calendar shaded by daily volume, with the current and best weekly streak. */
export function ActivityCalendar({ now = today() }: { now?: string }) {
  const thisMonth = now.slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const from = addDays(now, -historyDays);
  // Independent of the dashboard period: the streak needs history. A failed load only hides the card.
  const query = useQuery({
    queryKey: ['workouts', 'activity', from, now],
    queryFn: () =>
      api<Workout[]>(`/workouts?from=${from}&to=${now}&view=activity`).catch(() => null),
  });
  if (!query.data) return null;
  const volumes = dailyVolumes(query.data);
  const { current, best } = weekStreaks(volumes.keys(), now);
  const weeks = monthGrid(month);
  const max = Math.max(
    0,
    ...weeks
      .flat()
      .filter((d) => d.inMonth)
      .map((d) => volumes.get(d.date) ?? 0),
  );
  const [y, m] = month.split('-').map(Number);
  const days = weeks.flat().filter((d) => d.inMonth && volumes.has(d.date)).length;
  return (
    <Card className="mb-6 gap-0 py-0 shadow-none" data-testid="activity-calendar">
      <CardHeader className="px-4 pt-5 md:px-6 md:pt-6">
        <CardTitle asHeading="h2" className="text-body font-semibold">
          Workout calendar
        </CardTitle>
        <CardDescription className="text-caption">
          Streak: {current} {current === 1 ? 'week' : 'weeks'} in a row · Best: {best}{' '}
          {best === 1 ? 'week' : 'weeks'} (a week counts with at least one workout, Monday to
          Sunday)
        </CardDescription>
      </CardHeader>
      <div className="px-4 pt-3 pb-5 md:px-6 md:pb-6">
        <div className="mb-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous month"
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <div className="text-center text-body font-semibold" aria-live="polite">
            {monthNames[m - 1]} {y}
            <span className="block text-meta font-normal text-muted-foreground">
              {days} workout {days === 1 ? 'day' : 'days'}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next month"
            disabled={month >= thisMonth}
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
        <table className="w-full table-fixed border-separate border-spacing-1 text-center text-meta">
          <thead>
            <tr>
              {weekdays.map((d) => (
                <th key={d} scope="col" className="font-normal text-muted-foreground">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week[0].date}>
                {week.map(({ date, inMonth }) => {
                  const volume = volumes.get(date);
                  const level = inMonth ? shadeLevel(volume, max) : 0;
                  return (
                    <td
                      key={date}
                      data-date={date}
                      data-level={inMonth ? level : undefined}
                      title={
                        inMonth && volume !== undefined ? `${date}: ${fmt(volume)} kg` : undefined
                      }
                      className={`h-9 rounded-md ${inMonth ? shades[level] : 'text-transparent'} ${date === now ? 'ring-2 ring-ring' : ''}`}
                    >
                      {inMonth && (
                        <>
                          {Number(date.slice(8))}
                          {volume !== undefined && (
                            <span className="sr-only">, workout, {fmt(volume)} kg</span>
                          )}
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
