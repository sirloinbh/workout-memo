import { useCallback, useEffect, useRef, useState } from 'react';

import type { Progress } from '../progress-data';
import { api } from './api';
import type { Page } from './model';

/** Today's routine card: the progress answer, the rest-day change and its confirmation. */
export function useRoutineProgress(page: Page) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [progressError, setProgressError] = useState('');
  const [restConfirm, setRestConfirm] = useState(false);
  const [restBusy, setRestBusy] = useState(false);
  const restPending = useRef(false);
  const loadProgress = useCallback(async () => {
    try {
      setProgress(await api<Progress>('/routine-progress'));
      setProgressError('');
    } catch (e) {
      setProgressError((e as Error).message);
    }
  }, []);
  // Reload on every page change: a routine created in Routine Builder must show up when the
  // user comes back to the journal without a full page refresh.
  useEffect(() => {
    void loadProgress();
  }, [loadProgress, page]);
  // Rest changes only the plan. A pending request blocks repeated clicks and the
  // server applies the same day's rest at most once.
  async function changeRest(method: 'POST' | 'DELETE') {
    const routine = progress?.routine;
    if (!progress || !routine || restPending.current) return;
    restPending.current = true;
    setRestBusy(true);
    try {
      const path =
        `/routines/${routine.id}/rests` + (method === 'DELETE' ? '/' + progress.today : '');
      setProgress(
        await api<Progress>(path, method, method === 'POST' ? { date: progress.today } : undefined),
      );
      setRestConfirm(false);
      setProgressError('');
    } catch (e) {
      setProgressError((e as Error).message);
    } finally {
      restPending.current = false;
      setRestBusy(false);
    }
  }
  return {
    progress,
    progressError,
    restConfirm,
    setRestConfirm,
    restBusy,
    loadProgress,
    changeRest,
  };
}
