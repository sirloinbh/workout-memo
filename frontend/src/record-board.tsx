import { useQuery } from '@tanstack/react-query';

import { Badge } from './components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { EmptyState } from './components/ui/empty-state';
import { requestJson } from './lib/api';

// #484: per exercise the best estimated 1RM and the heaviest set, each with the date it was first reached.
type Best = { value: number; weight: number; reps: number; date: string; ties: number };
export type BoardEntry = {
  exercise: string;
  estimated_1rm: Best | null;
  max_weight: Best | null;
};
type Board = { today: string; records: BoardEntry[] };

const fmt = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
const cellClass = 'px-2 py-1.5 text-left align-top';

function Cell({ best, text }: { best: Best | null; text: (b: Best) => string }) {
  if (!best) return <td className={cellClass}>-</td>;
  return (
    <td className={cellClass}>
      {text(best)}
      <span className="block text-caption text-muted-foreground">{best.date}</span>
    </td>
  );
}

export function RecordBoard() {
  const query = useQuery({
    queryKey: ['records'],
    queryFn: () => requestJson<Board>('/api/records'),
  });
  const records = query.data?.records ?? [];
  if (query.isPending || query.isError) return null;
  return (
    <Card role="region" aria-label="Record board" className="mt-5 gap-0 py-0 shadow-none">
      <CardHeader className="px-4 pt-5 md:px-6 md:pt-6">
        <CardTitle asHeading="h2" className="text-body font-semibold">
          Record board{' '}
          <Badge variant="secondary" className="ml-1.5 align-middle">
            {records.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pt-2 pb-3 md:px-6 md:pb-4">
        {!records.length ? (
          <EmptyState
            className="my-2"
            headingLevel="h3"
            title="No records yet"
            description="Save a completed set to see your bests here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <caption className="sr-only">
                Best estimated 1RM and heaviest set per exercise
              </caption>
              <thead>
                <tr className="text-caption text-muted-foreground">
                  <th scope="col" className={cellClass + ' font-medium'}>
                    Exercise
                  </th>
                  <th scope="col" className={cellClass + ' font-medium'}>
                    Est. 1RM
                  </th>
                  <th scope="col" className={cellClass + ' font-medium'}>
                    Heaviest set
                  </th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.exercise} className="border-t border-border">
                    <th scope="row" className={cellClass + ' font-medium [overflow-wrap:anywhere]'}>
                      {r.exercise}
                    </th>
                    <Cell best={r.estimated_1rm} text={(b) => `${fmt(b.value)} kg`} />
                    <Cell best={r.max_weight} text={(b) => `${fmt(b.weight)} kg × ${b.reps}`} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
