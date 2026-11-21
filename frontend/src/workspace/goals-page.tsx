import { Target } from 'lucide-react';

import { CardioGoals } from '../cardio-goals';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardTitle } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { useConfirmDelete } from '../components/use-confirm-delete';
import { api, changed, type WriteAction } from './api';
import { cleanDate, type Goal, today } from './model';

/** Strength goals as cards, then the cardio goals, which load and save on their own (#116). */
export function GoalsPage({
  goals,
  saving,
  action,
  to,
}: {
  goals: Goal[];
  saving: boolean;
  action: WriteAction;
  to: string;
}) {
  // #381: one request per delete, asked in a dialog instead of the browser's confirm().
  const deleting = useConfirmDelete<Goal>({
    title: () => 'Delete this goal?',
    onConfirm: (g) => action(() => api('/goals/' + g.id, 'DELETE'), undefined, changed.goals),
  });
  return (
    <>
      {goals.length === 0 ? (
        <EmptyState
          icon={<Target />}
          title="Set a goal for your next workout"
          description="e.g. Leg Press total weight 100 kg, 10 reps achieved"
        />
      ) : (
        <div data-slot="goal-grid" className="grid gap-5 md:grid-cols-2">
          {goals.map((g) => {
            const ended = !g.achieved && cleanDate(g.deadline) < today();
            return (
              <Card key={g.id} className="items-start gap-0 px-6 py-6 shadow-none md:px-7 md:py-7">
                <Badge
                  variant={g.achieved ? 'success' : ended ? 'warning' : 'outline'}
                  className="mb-5"
                >
                  {g.achieved ? 'Achieved' : ended ? 'Period ended' : 'In progress'}
                </Badge>
                <CardTitle asHeading="h2" className="text-body font-semibold">
                  {g.exercise}
                </CardTitle>
                <div className="mt-5 text-[32px] leading-tight">
                  {g.target_weight}
                  <small className="text-body-sm text-muted-foreground"> kg × </small>
                  {g.target_reps}
                  <small className="text-body-sm text-muted-foreground"> reps</small>
                </div>
                <p className="mt-3 text-body-sm text-muted-foreground">
                  {cleanDate(g.start_date)} — {cleanDate(g.deadline)}
                </p>
                <p className="mt-1 text-body-sm text-muted-foreground">
                  {g.achieved
                    ? 'You hit both the weight and reps within the goal period.'
                    : 'Log it under the same exercise name to check whether you achieved it.'}
                </p>
                <Button
                  variant="link"
                  size="sm"
                  className="mt-3 px-0"
                  aria-label={`Delete ${g.exercise} goal`}
                  disabled={saving}
                  onClick={(e) => deleting.ask(g, e.currentTarget)}
                >
                  Delete goal
                </Button>
              </Card>
            );
          })}
        </div>
      )}
      {/* #116: cardio goals load and save on their own, below the strength goals. */}
      <CardioGoals deadline={to} />
      {deleting.dialog}
    </>
  );
}
