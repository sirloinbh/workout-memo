import { List, ListItem } from '../components/list';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import type { CardioSession } from './api';
import {
  cardioKindLabels,
  effortLabels,
  formatDistance,
  formatDuration,
  formatPace,
  formatSpeed,
  paceOf,
  sessionLabel,
  speedOf,
} from './format';

// #115: one row per session, newest first as the API sends them. A session without distance
// shows only its time: pace and speed are never guessed. Button names carry the start time or
// duration (sessionLabel) so two sessions of one kind on one day stay distinguishable.
export function CardioList({
  sessions,
  busy,
  onEdit,
  onDelete,
}: {
  sessions: readonly CardioSession[];
  busy: boolean;
  onEdit: (session: CardioSession) => void;
  onDelete: (session: CardioSession) => void;
}) {
  return (
    <List aria-label="Cardio records" className="px-4 py-1 md:px-6 md:py-2.5">
      {sessions.map((s) => {
        const date = s.date.slice(0, 10);
        const kind = cardioKindLabels[s.kind];
        const label = sessionLabel(s);
        const figures = [
          formatDuration(s.duration_sec),
          formatDistance(s.kind, s.distance_km) ?? 'No distance',
          formatPace(paceOf(s.duration_sec, s.distance_km, s.pace_sec_per_km)),
          formatSpeed(speedOf(s.duration_sec, s.distance_km, s.speed_kmh)),
        ].filter(Boolean);
        return (
          <ListItem key={s.id} className="flex-wrap gap-2.5 py-4 md:flex-nowrap md:gap-4">
            <div className="min-w-0 flex-1 basis-full [overflow-wrap:anywhere] md:basis-auto">
              <h3 className="flex flex-wrap items-center gap-2 text-body-sm font-semibold">
                {date} {kind}
                {s.effort && <Badge variant="secondary">Effort {effortLabels[s.effort]}</Badge>}
              </h3>
              <p className="mt-1 text-meta text-muted-foreground">{figures.join(' · ')}</p>
              {s.memo && (
                <p className="mt-1 line-clamp-2 text-meta text-muted-foreground">{s.memo}</p>
              )}
            </div>
            <div className="flex gap-1 max-md:ml-auto">
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                aria-label={`Edit cardio record ${label}`}
                onClick={() => onEdit(s)}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                aria-label={`Delete cardio record ${label}`}
                onClick={() => onDelete(s)}
              >
                Delete
              </Button>
            </div>
          </ListItem>
        );
      })}
    </List>
  );
}
