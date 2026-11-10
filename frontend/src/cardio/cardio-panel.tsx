import { Activity, FileUp, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AlertBanner } from '../components/alert-banner';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { Notice } from '../components/ui/notice';
import { seoulDate } from '../date';
import { RequestError } from '../lib/api';
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
}) {
  const [sessions, setSessions] = useState<CardioSession[]>([]);
  const [loading, setLoading] = useState(true);
  // A failed load (with "다시 연결") and a failed delete are shown apart: a reload clears only
  // the first, so a delete failure stays until the next action.
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  // undefined: closed, null: a new session, otherwise the session being edited.
  const [editing, setEditing] = useState<CardioSession | null | undefined>();
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
    if (busy || !confirm(`${sessionLabel(session)} 유산소 기록을 삭제할까요?`)) return;
    setBusy(true);
    setStatus('');
    setActionError('');
    let reload = true;
    try {
      await deleteCardioSession(session.id);
      setStatus('유산소 기록을 삭제했습니다');
      onChanged?.();
    } catch (e) {
      // Already deleted elsewhere: the reload below shows the list without it. Any other
      // failure leaves the row in place (it may still exist) and needs no reload.
      if (e instanceof RequestError && e.status === 404) {
        setStatus('이미 삭제된 기록입니다');
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

  // A new session starts today when today is in the period, otherwise on the period's last
  // day that is not in the future.
  const newDate = today >= from && today <= to ? today : to < today ? to : today;

  return (
    <section>
      {error && (
        <AlertBanner
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => void load(true)}>
              다시 연결
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
            유산소 기록{' '}
            <Badge variant="secondary" className="text-xs">
              {sessions.length}
            </Badge>
          </CardTitle>
          <CardDescription className="text-caption">
            {from} ~ {to}
          </CardDescription>
          <CardAction className="flex flex-wrap justify-end gap-2">
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
              파일 가져오기
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setStatus('');
                setActionError('');
                setEditing(null);
              }}
            >
              <Plus aria-hidden />
              유산소 기록 추가
            </Button>
          </CardAction>
        </CardHeader>
        {loading ? (
          <p className="px-6 py-14 text-center text-sm text-muted-foreground">
            기록을 불러오는 중…
          </p>
        ) : sessions.length === 0 ? (
          <EmptyState
            className="m-4 md:m-6"
            headingLevel="h3"
            icon={<Activity />}
            title="선택한 기간에 유산소 기록이 없습니다"
            description="러닝·걷기·자전거처럼 한 번의 유산소 운동을 시간과 거리로 남겨 보세요."
          />
        ) : (
          <CardioList
            sessions={sessions}
            busy={busy}
            onEdit={(session) => {
              setStatus('');
              setActionError('');
              setEditing(session);
            }}
            onDelete={(session) => void remove(session)}
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
            setStatus(`유산소 기록 ${count}건을 가져왔습니다`);
            onChanged?.();
            void load();
          }}
        />
      )}
      {editing !== undefined && (
        <CardioForm
          session={editing ?? undefined}
          date={newDate}
          today={today}
          workouts={workouts}
          close={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            setStatus('유산소 기록을 저장했습니다');
            onChanged?.();
            void load();
          }}
        />
      )}
    </section>
  );
}
