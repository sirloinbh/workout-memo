import { useEffect, useRef, useState } from 'react';

import {
  endAlertDue,
  endVibration,
  finished,
  parseRestDurations,
  parseTimer,
  remainingMs,
  type RestDurations,
  restDurationsKey,
  type RestKind,
  restKinds,
  type RestTimer,
  restTimerKey,
  validDuration,
} from '../rest-timer';

function readRestDurations(): RestDurations {
  try {
    return parseRestDurations(localStorage.getItem(restDurationsKey));
  } catch {
    return parseRestDurations(null);
  }
}
function readTimer(): RestTimer {
  try {
    return parseTimer(localStorage.getItem(restTimerKey), Date.now());
  } catch {
    return parseTimer(null, Date.now());
  }
}

/** The rest timer and its settings: stored by end time, redrawn by ticks, with one vibration at the end. */
export function useRestTimer() {
  const [timer, setTimerState] = useState(readTimer);
  const [durationInput, setDurationInput] = useState(String(timer.duration));
  const [timerWarning, setTimerWarning] = useState('');
  const [restDurations, setRestDurations] = useState(readRestDurations);
  const [restInputs, setRestInputs] = useState(() =>
    Object.fromEntries(restKinds.map((k) => [k, String(restDurations[k])])),
  );
  function updateRestDuration(kind: RestKind, value: string) {
    setRestInputs({ ...restInputs, [kind]: value });
    const seconds = Number(value);
    if (!validDuration(seconds)) return;
    const next = { ...restDurations, [kind]: seconds };
    setRestDurations(next);
    try {
      localStorage.setItem(restDurationsKey, JSON.stringify(next));
      setTimerWarning('');
    } catch {
      setTimerWarning(
        'Could not save the rest time setting in this browser. It returns to the default when you reload.',
      );
    }
  }
  const [tick, setTick] = useState(0);
  const timerNow = Date.now();
  const timerLeft = remainingMs(timer, timerNow);
  const timerEnded = finished(timer, timerNow);
  function updateTimer(next: RestTimer) {
    setTimerState(next);
    try {
      localStorage.setItem(restTimerKey, JSON.stringify(next));
      setTimerWarning('');
    } catch {
      setTimerWarning('Could not save the timer state in this browser. It resets when you reload.');
    }
  }
  // Ticks only redraw; the shown value is always computed from the stored end time.
  useEffect(() => {
    if (timer.state !== 'running') return;
    const left = remainingMs(timer, Date.now());
    if (!left) return;
    const id = setTimeout(() => setTick(Date.now()), left % 1000 || 1000);
    return () => clearTimeout(id);
  }, [timer, tick]);
  useEffect(() => {
    // Background tabs may skip ticks; redraw as soon as the tab is visible again.
    const wake = () => setTick(Date.now());
    window.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    return () => {
      window.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
    };
  }, []);
  // #105: one short vibration when a rest ends while the app is open. Each end (endsAt)
  // alerts once; browsers without the Vibration API (iPhone Safari) only show Rest over.
  const alertedEnd = useRef<number | null>(null);
  useEffect(() => {
    if (!endAlertDue(timer, Date.now()) || alertedEnd.current === timer.endsAt) return;
    alertedEnd.current = timer.endsAt;
    if ('vibrate' in navigator) navigator.vibrate(endVibration);
  }, [timer, tick]);
  return {
    timer,
    timerLeft,
    timerEnded,
    updateTimer,
    timerWarning,
    durationInput,
    setDurationInput,
    restDurations,
    restInputs,
    updateRestDuration,
  };
}
export type RestTimerState = ReturnType<typeof useRestTimer>;
