import { Trophy } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AlertBanner } from '../components/alert-banner';
import { List, ListItem } from '../components/list';
import { Button } from '../components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { SkeletonList } from '../components/ui/skeleton';
import { type CardioRecord, type CardioRecords as Records, getCardioRecords } from './api';
import {
  cardioKindLabels,
  formatDistance,
  formatDuration,
  formatPace,
  formatSpeed,
  paceOf,
  speedOf,
} from './format';

// #115: all-time personal records, loaded on their own because they do not depend on the
// period. `refreshKey` lets the caller reload them after a session is saved or deleted.
export function CardioRecords({ refreshKey = 0 }: { refreshKey?: number }) {
  const [records, setRecords] = useState<Records | null>(null);
  const [error, setError] = useState('');
  const version = useRef(0);

  const load = useCallback(async () => {
    const current = ++version.current;
    try {
      const data = await getCardioRecords();
      // Only the newest request may replace the records.
      if (current !== version.current) return;
      setRecords(data);
      setError('');
    } catch (e) {
      if (current === version.current) setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const best = (title: string, range: string, record: CardioRecord | null) => (
    <ListItem key={title} className="flex-col items-start gap-1">
      <h4 className="text-body-sm font-semibold">{title}</h4>
      {record ? (
        <p className="text-meta text-muted-foreground">
          <strong className="mr-1.5 text-body-sm font-semibold text-foreground tabular-nums">
            {formatDuration(record.duration_sec)}
          </strong>
          {[
            formatDistance('running', record.distance_km),
            formatPace(paceOf(record.duration_sec, record.distance_km)),
            formatSpeed(speedOf(record.duration_sec, record.distance_km)),
            record.date.slice(0, 10),
          ].join(' · ')}
        </p>
      ) : (
        <p className="text-meta text-muted-foreground">{range} No running records</p>
      )}
    </ListItem>
  );

  const nothing = records && !records.longest.length && !records.best5k && !records.best10k;
  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardHeader className="px-4 pt-5 md:px-6 md:pt-6">
        <CardTitle asHeading="h3" className="flex items-center gap-2 text-body font-semibold">
          Personal records
        </CardTitle>
        <CardDescription className="text-caption">
          All time. 5 km and 10 km only compare runs whose distance is within ±2%
        </CardDescription>
      </CardHeader>
      <div className="px-4 pt-3 pb-5 md:px-6 md:pb-6">
        {error && (
          <AlertBanner
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
                Reconnect
              </Button>
            }
          >
            {error}
          </AlertBanner>
        )}
        {!records ? (
          !error && (
            // #173: row placeholders while the records load; the hidden line keeps the status.
            <div
              aria-busy="true"
              aria-label="Personal records"
              className="px-4 pb-5 md:px-6 md:pb-6"
            >
              <p role="status" className="sr-only">
                Loading records…
              </p>
              <SkeletonList rows={3} />
            </div>
          )
        ) : nothing ? (
          <EmptyState
            headingLevel="h4"
            icon={<Trophy />}
            title="No personal records yet"
            description="Once you log cardio with a distance, the longest distance per type and your 5 km and 10 km bests appear here."
          />
        ) : (
          <List aria-label="Personal records">
            {best('5 km best', '4.9~5.1 km', records.best5k)}
            {best('10 km best', '9.8~10.2 km', records.best10k)}
            {records.longest.map((r) => (
              <ListItem key={r.kind} className="flex-col items-start gap-1">
                <h4 className="text-body-sm font-semibold">
                  Longest {cardioKindLabels[r.kind].toLowerCase()} distance
                </h4>
                <p className="text-meta text-muted-foreground">
                  <strong className="mr-1.5 text-body-sm font-semibold text-foreground tabular-nums">
                    {formatDistance(r.kind, r.distance_km)}
                  </strong>
                  {formatDuration(r.duration_sec)} · {r.date.slice(0, 10)}
                </p>
              </ListItem>
            ))}
          </List>
        )}
      </div>
    </Card>
  );
}
