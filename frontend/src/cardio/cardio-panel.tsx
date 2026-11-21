import { Activity, FileUp, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AlertBanner } from '../components/alert-banner';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { Notice } from '../components/ui/notice';
import { SkeletonList } from '../components/ui/skeleton';
import { useConfirmDelete } from '../components/use-confirm-delete';
import { seoulDate } from '../date';
import { RequestError } from '../lib/api';
import type { CardioPreset } from '../routine-cardio';
import { type CardioSession, deleteCardioSession, listCardioSessions } from './api';
import { CardioForm, type LinkableWorkout } from './cardio-form';
import { CardioImport } from './cardio-import';
import { CardioList } from './cardio-list';
import { sessionLabel } from './format';

// The state of the list a caller receives through onSessionsChange.
export type CardioListStatus = 'loading' | 'error' | 'ready';

// #115: the cardio records of a period, self-contained so the journal's cardio tab only has to
// place it. It loads the period, lists it, and opens CardioForm to add or edit. The tab's
// statistics reuse its list through `onSessionsChange`, and `onChanged` tells the caller after a
// save or delete so the personal records and the dashboard summary can reload.
export function CardioPanel({
  from,
  to,
  today = seoulDate(),
  workouts,
  onSessionsChange,
  onChanged,
  preset,
  onPresetUsed,
}: {
  from: string;
  to: string;
  // The service date (Asia/Seoul): a session may not be after it. Tests may pin it.
  today?: string;
  // Strength workouts the form may link to; it offers those on the session's date.
  workouts: readonly LinkableWorkout[];
  // Called with the list on screen whenever it or its state changes ([] while a new period
  // loads, with 'loading'; [] after a failed first load, with 'error').
  onSessionsChange?: (sessions: CardioSession[], status: CardioListStatus) => void;
  // Called after a session is saved or deleted (or found already deleted).
  onChanged?: () => void;
  // #117: when set, the form opens for a new session filled in from a routine's cardio item;
  // onPresetUsed tells the caller it was taken, so a later render does not open it again.
  preset?: CardioPreset | null;
  onPresetUsed?: () => void;
}) {
  const [sessions, setSessions] = useState<CardioSession[]>([]);
  const [loading, setLoading] = useState(true);
  // A failed load (with "Reconnect") and a failed delete are shown apart: a reload clears only
  // the first, so a delete failure stays until the next action.
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  // undefined: closed, null: a new session, otherwise the session being edited.
  const [editing, setEditing] = useState<CardioSession | null | undefined>();
  const [formPreset, setFormPreset] = useState<CardioPreset>();
  // Each preset remounts the form, so one arriving while a form is open is never ignored.
  const [presetCount, setPresetCount] = useState(0);
  useEffect(() => {
    if (!preset) return;
    setStatus('');
    setActionError('');
    setFormPreset(preset);
    setPresetCount((n) => n + 1);
    setEditing(null);
    onPresetUsed?.();
  }, [preset, onPresetUsed]);
  const closeForm = () => {
    setEditing(undefined);
    setFormPreset(undefined);
  };
  // #119: the activity file import card under the list.
  const [importing, setImporting] = useState(false);
  const importButton = useRef<HTMLButtonElement>(null);
  // Closing the card returns focus to the button that opened it.
  const closeImport = () => {
    setImporting(false);
    importButton.current?.focus();
  };
  const version = useRef(0);
  // The latest callback, so a caller passing a new function on each render adds no calls.
  const report = useRef(onSessionsChange);
  useEffect(() => {
    report.current = onSessionsChange;
  });
  // The list's state goes along, so a caller never reads a failed first load as "no sessions".
  // A failed reload that kept its rows still counts as ready.
  const listStatus: CardioListStatus = loading
    ? 'loading'
    : error && sessions.length === 0
      ? 'error'
      : 'ready';
  useEffect(() => report.current?.(sessions, listStatus), [sessions, listStatus]);

  // `fresh`: a first load or a new period. It shows the loading line and drops the old rows so
  // they never sit under the new period. A reload after saving or deleting keeps the list (and
  // the focused row) on screen until the answer replaces it.
  const load = useCallback(
    async (fresh = false) => {
      const current = ++version.current;
      if (fresh) {
        setLoading(true);
        setSessions([]);
      }
      try {
        const data = await listCardioSessions(from, to);
        // Only the newest request may replace the list.
        if (current !== version.current) return;
        setSessions(data);
        setError('');
      } catch (e) {
        if (current !== version.current) return;
        // A failed reload after saving or deleting keeps the rows (and focus) under the error;
        // a failed first load or period change has no rows of its own to show.
        if (fresh) setSessions([]);
        setError((e as Error).message);
      } finally {
        if (current === version.current) setLoading(false);
      }
    },
    [from, to],
  );
  useEffect(() => {
    void load(true);
  }, [load]);

  async function remove(session: CardioSession) {
    if (busy) return;
    setBusy(true);
    setStatus('');
    setActionError('');
    let reload = true;
    try {
      await deleteCardioSession(session.id);
      setStatus('Cardio record deleted');
      onChanged?.();
    } catch (e) {
      // Already deleted elsewhere: the reload below shows the list without it. Any other
      // failure leaves the row in place (it may still exist) and needs no reload.
      if (e instanceof RequestError && e.status === 404) {
        setStatus('This record was already deleted');
        onChanged?.();
      } else {
        setActionError((e as Error).message);
        reload = false;
      }
    } finally {
      setBusy(false);
    }
    if (reload) await load();
  }

  const deleting = useConfirmDelete<CardioSession>({
    title: (session) => `Delete the ${sessionLabel(session)} cardio record?`,
    onConfirm: remove,
  });
  // A new session starts today when today is in the period, otherwise on the period's last
  // day that is not in the future.
  const newDate = today >= from && today <= to ? today : to < today ? to : today;

  return (
    <section>
      {error && (
        <AlertBanner
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => void load(true)}>
              Reconnect
            </Button>
          }
        >
          {error}
        </AlertBanner>
      )}
      {actionError && <AlertBanner>{actionError}</AlertBanner>}
      <Notice className="mb-4" notice={status ? { kind: 'status', text: status } : undefined} />
      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="px-4 pt-5 md:px-6 md:pt-6">
          <CardTitle asHeading="h2" className="flex items-center gap-2 text-body font-semibold">
            Cardio records{' '}
            {/* #173: no count until the records arrive, so the first load does not claim 0. */}
            {!loading && (
              <Badge variant="secondary" className="text-xs">
                {sessions.length}
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="text-caption">
            {from} ~ {to}
          </CardDescription>
          {/* Two buttons beside the title squeeze it to one character per line on a phone (and
              wrap the period at 768px). Under 36rem of header width they move to their own row
              below the title and period. */}
          <CardAction className="flex flex-wrap justify-end gap-2 @max-xl/card-header:col-span-2 @max-xl/card-header:col-start-1 @max-xl/card-header:row-span-1 @max-xl/card-header:row-start-3 @max-xl/card-header:mt-2 @max-xl/card-header:justify-start @max-xl/card-header:justify-self-start">
            <Button
              ref={importButton}
              variant="outline"
              disabled={busy}
              aria-expanded={importing}
              onClick={() => {
                setStatus('');
                setActionError('');
                setImporting(true);
              }}
            >
              <FileUp aria-hidden />
              Import file
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setStatus('');
                setActionError('');
                setFormPreset(undefined);
                setEditing(null);
              }}
            >
              <Plus aria-hidden />
              Add cardio record
            </Button>
          </CardAction>
        </CardHeader>
        {loading ? (
          // #173: row placeholders while the records load; the hidden line keeps the status.
          <div aria-busy="true" aria-label="Cardio records" className="px-4 pb-5 md:px-6 md:pb-6">
            <p role="status" className="sr-only">
              Loading records…
            </p>
            <SkeletonList />
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState
            className="m-4 md:m-6"
            headingLevel="h3"
            icon={<Activity />}
            title="No cardio records in the selected period"
            description="Log a cardio session by time and distance, like a run, walk, or bike ride."
          />
        ) : (
          <CardioList
            sessions={sessions}
            busy={busy}
            onEdit={(session) => {
              setStatus('');
              setActionError('');
              setFormPreset(undefined);
              setEditing(session);
            }}
            onDelete={(session, button) => deleting.ask(session, button)}
          />
        )}
      </Card>
      {importing && (
        <CardioImport
          today={today}
          workouts={workouts}
          close={closeImport}
          done={(count) => {
            closeImport();
            setStatus(`Imported ${count} cardio ${count === 1 ? 'record' : 'records'}`);
            onChanged?.();
            void load();
          }}
          savedSome={() => {
            onChanged?.();
            void load();
          }}
        />
      )}
      {editing !== undefined && (
        <CardioForm
          key={formPreset ? `preset-${presetCount}` : (editing?.id ?? 'new')}
          session={editing ?? undefined}
          // A preset session is the routine's cardio for today.
          date={formPreset ? today : newDate}
          preset={formPreset}
          today={today}
          workouts={workouts}
          close={closeForm}
          onSaved={() => {
            closeForm();
            setStatus('Cardio record saved');
            onChanged?.();
            void load();
          }}
        />
      )}
      {deleting.dialog}
    </section>
  );
}
