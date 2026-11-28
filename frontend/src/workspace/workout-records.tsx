import { ArrowRight, NotebookPen, Plus, Trash2 } from 'lucide-react';

import { List, ListItem } from '../components/list';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { SkeletonList } from '../components/ui/skeleton';
import { useConfirmDelete } from '../components/use-confirm-delete';
import { monthNames } from '../date';
import { plural } from '../labels';
import { api, type WriteAction } from './api';
import {
  cleanDate,
  dateLabel,
  done,
  feedbackLabels,
  fmt,
  type Machine,
  vol,
  type Workout,
} from './model';

export type RecordsProps = {
  workouts: Workout[];
  loading: boolean;
  machines: Machine[];
  // A recoverable local draft blocks editing and a new record until it is restored or discarded.
  recovery: boolean;
  saving: boolean;
  newWorkout: () => void;
  setEditor: (value: Partial<Workout> | null) => void;
  action: WriteAction;
};

/** The "Workout records" card; the dashboard adds a link to the journal. */
export function WorkoutRecords({
  workouts,
  loading,
  machines,
  recovery,
  saving,
  newWorkout,
  setEditor,
  action,
  onAll,
}: RecordsProps & { onAll?: () => void }) {
  // #381: one request per delete, asked in a dialog instead of the browser's confirm().
  const deleting = useConfirmDelete<{ id: number; title: string }>({
    title: () => 'Delete this workout journal and its sets?',
    description: 'The journal and all of its sets are deleted. This cannot be undone.',
    onConfirm: (w) => action(() => api('/workouts/' + w.id, 'DELETE')),
  });
  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardHeader className="px-4 pt-5 md:px-6 md:pt-6">
        <CardTitle asHeading="h2" className="flex items-center gap-2 text-body font-semibold">
          Workout records{' '}
          <Badge variant="secondary" className="text-xs">
            {workouts.length}
          </Badge>
        </CardTitle>
        <CardDescription className="text-caption">
          So today&apos;s effort becomes tomorrow&apos;s baseline
        </CardDescription>
        {onAll && (
          <CardAction>
            <Button variant="ghost" size="sm" onClick={onAll}>
              All records <ArrowRight aria-hidden />
            </Button>
          </CardAction>
        )}
      </CardHeader>
      {loading ? (
        // #173: row placeholders while the list loads; the hidden line keeps the status.
        <div aria-busy="true" aria-label="Workout record list" className="px-6 py-6">
          <p role="status" className="sr-only">
            Loading records…
          </p>
          <SkeletonList />
        </div>
      ) : workouts.length === 0 ? (
        <EmptyState
          className="m-4 md:m-6"
          headingLevel="h3"
          icon={<NotebookPen />}
          title="Log your first record"
          description="Your growth story starts with today's sets."
          action={
            <Button
              variant="secondary"
              size="icon"
              aria-label="Log workout"
              title="Log workout"
              onClick={newWorkout}
            >
              <Plus aria-hidden />
            </Button>
          }
        />
      ) : (
        <List aria-label="Workout records" className="px-4 py-1 md:px-6 md:py-2.5">
          {workouts.map((w) => (
            <ListItem
              data-slot="workout-row"
              className="flex-wrap gap-2.5 py-4 md:flex-nowrap md:gap-4"
              key={w.id}
            >
              <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-md bg-muted">
                <strong className="text-lg leading-none font-medium">
                  {Number(cleanDate(w.date).slice(8))}
                </strong>
                <small className="mt-1 text-meta leading-none text-foreground">
                  {monthNames[Number(cleanDate(w.date).slice(5, 7)) - 1]}
                </small>
              </div>
              <div className="min-w-0 flex-1 [overflow-wrap:anywhere] max-md:basis-[calc(100%-3.625rem)]">
                <h3 className="text-body-sm font-semibold">{w.title}</h3>
                <p className="mt-1 text-meta text-muted-foreground">
                  {dateLabel(w.date)} ·{' '}
                  {Array.from(new Set(w.sets.map((s) => s.exercise))).join(', ')}
                </p>
                {w.feedback && (
                  <p className="mt-1 text-meta text-muted-foreground">
                    Effort {feedbackLabels[w.feedback]}
                  </p>
                )}
                {w.notes && <p className="mt-1 text-meta text-muted-foreground">{w.notes}</p>}
                <details className="mt-1 text-body-sm">
                  <summary>View set records</summary>
                  <ol>
                    {w.sets.map((s, i) => (
                      <li key={i}>
                        {s.exercise} · {fmt(Number(s.weight))}kg × {plural(s.reps ?? 0, 'rep')} ·{' '}
                        {machines.find((m) => m.id === s.machine_id)?.name ?? 'No machine'}
                        {s.rpe != null && ` · RPE ${fmt(Number(s.rpe))}`}
                        {!done(s) && ' · Incomplete (excluded from stats)'}
                        {s.notes && <p>{s.notes}</p>}
                      </li>
                    ))}
                  </ol>
                </details>
              </div>
              <div className="text-right text-meta text-muted-foreground max-md:mr-auto max-md:ml-14.5 max-md:text-left">
                <strong className="text-body-sm font-medium text-foreground">
                  {fmt(vol(w))} <small className="text-meta text-muted-foreground">kg</small>
                </strong>
                <span className="mt-1 block">{plural(w.sets.filter(done).length, 'set')}</span>
                {w.sets.some((s) => !done(s)) && (
                  <span className="mt-1 block">
                    Incomplete {w.sets.filter((s) => !done(s)).length}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={recovery || saving}
                onClick={() =>
                  !recovery &&
                  setEditor({
                    ...w,
                    version: w.version ?? 1,
                    date: cleanDate(w.date),
                    sets: w.sets.map((s) => ({
                      ...s,
                      weight: Number(s.weight),
                      completed: done(s),
                      rpe: s.rpe == null ? null : Number(s.rpe),
                    })),
                  })
                }
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground"
                aria-label={`Delete ${w.title}`}
                disabled={saving}
                onClick={(e) => deleting.ask(w, e.currentTarget)}
              >
                <Trash2 size={16} />
              </Button>
            </ListItem>
          ))}
        </List>
      )}
      {deleting.dialog}
    </Card>
  );
}
