import { useRef, useState } from 'react';

import { feedbackLevels, fieldErrors, workoutSchema } from '../../../shared/contract';
import { enqueueSave } from '../offline/queue';
import { api, Unreachable } from './api';
import { done, repeatTapWindow, withoutSetKeys, withSetKeys, type Workout } from './model';
import type { NewRecord } from './new-records';

type Draft = {
  format: 1;
  savedAt: number;
  editor: Partial<Workout>;
  request?: { key: string; body: string; path: string; method: string };
};
const draftKey = 'workout-memo:draft:v1';
const draftLifetime = 7 * 86400000;
function retryKey() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // getRandomValues also works on a phone accessing a local HTTP server.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function readDraft(): { draft: Draft | null; warning: string } {
  try {
    const raw = localStorage.getItem(draftKey);
    if (!raw) return { draft: null, warning: '' };
    const d = JSON.parse(raw) as Draft;
    if (
      d.format !== 1 ||
      !Number.isFinite(d.savedAt) ||
      d.savedAt > Date.now() ||
      !d.editor ||
      typeof d.editor.date !== 'string' ||
      typeof d.editor.title !== 'string' ||
      typeof d.editor.notes !== 'string' ||
      (d.editor.feedback != null && !feedbackLevels.includes(d.editor.feedback)) ||
      (d.editor.id !== undefined && (!Number.isInteger(d.editor.id) || d.editor.id <= 0)) ||
      (d.editor.version !== undefined &&
        (!Number.isInteger(d.editor.version) || d.editor.version <= 0)) ||
      !Array.isArray(d.editor.sets) ||
      !d.editor.sets.length ||
      d.editor.sets.length > 200 ||
      !d.editor.sets.every(
        (s) =>
          s &&
          typeof s.exercise === 'string' &&
          (s.notes === undefined || typeof s.notes === 'string') &&
          (s.machine_id === null || (Number.isInteger(s.machine_id) && s.machine_id > 0)) &&
          (s.weight === undefined || Number.isFinite(s.weight)) &&
          (s.reps === undefined || Number.isFinite(s.reps)) &&
          (s.completed === undefined || typeof s.completed === 'boolean') &&
          (s.rpe === undefined || s.rpe === null || Number.isFinite(s.rpe)),
      ) ||
      (d.request &&
        (typeof d.request.key !== 'string' ||
          typeof d.request.body !== 'string' ||
          typeof d.request.path !== 'string' ||
          !['POST', 'PUT'].includes(d.request.method)))
    ) {
      throw Error('invalid draft');
    }
    if (Date.now() - d.savedAt >= draftLifetime) {
      localStorage.removeItem(draftKey);
      return {
        draft: null,
        warning:
          'Cleaned up local drafts older than 7 days. If the save result was uncertain, check the server record.',
      };
    }
    return { draft: d, warning: '' };
  } catch {
    return {
      draft: null,
      warning:
        'Could not read local storage or the draft is damaged. You can keep entering new input.',
    };
  }
}

/**
 * The workout editor and its local draft: every edit is kept in localStorage, a save is retried with
 * the same idempotency key, and a draft found at load is offered for restore or discard.
 * `onSaved` runs after a successful save;
 */
export function useWorkoutDraft({
  setSaving,
  onSaved,
  onQueued,
}: {
  /** Runs after an unreachable save was queued on the phone (#476). */
  onQueued?: () => void;
  setSaving: (saving: boolean) => void;
  onSaved: () => Promise<unknown>;
}) {
  const [editor, updateEditorRaw] = useState<Partial<Workout> | null>(null);
  const updateEditor = (value: Partial<Workout> | null) => {
    if (value) setNewRecords([]);
    updateEditorRaw(withSetKeys(value));
  };
  const [initialDraft] = useState(readDraft);
  const [recovery, setRecovery] = useState(initialDraft.draft);
  const [storageWarning, setStorageWarning] = useState(initialDraft.warning);
  const [saveState, setSaveState] = useState('');
  const [saveError, setSaveError] = useState('');
  const [newRecords, setNewRecords] = useState<NewRecord[]>([]);
  // Per-field messages from the shared contract, keyed like "sets.0.weight" (#64).
  const [issues, setIssues] = useState<Record<string, string>>({});
  const draft = useRef<Draft | null>(initialDraft.draft);
  const workoutSaving = useRef(false);
  function persist(value: Draft | null) {
    draft.current = value;
    try {
      if (value) localStorage.setItem(draftKey, JSON.stringify(value));
      else localStorage.removeItem(draftKey);
      setStorageWarning('');
      return true;
    } catch {
      setStorageWarning(
        'Local storage error: saving or clearing the draft failed. If you reload, you may lose your input or see an older draft again.',
      );
      return false;
    }
  }
  function setEditor(value: Partial<Workout> | null) {
    if (workoutSaving.current) return;
    const keyed = withSetKeys(value);
    updateEditorRaw(keyed);
    if (keyed) {
      setNewRecords([]);
      persist({ format: 1, savedAt: Date.now(), editor: keyed, request: draft.current?.request });
      setRecovery(null);
      setSaveState('Local draft · Before server save');
    } else setRecovery(draft.current);
  }
  // #124, #531: typing, picking a suggestion or accepting a similar name renames the whole exercise: every set of
  // the group that set `i` belongs to.
  function renameSet(i: number, exercise: string) {
    if (!editor?.sets) return;
    const group = editor.sets[i]?._group;
    setEditor({
      ...editor,
      sets: editor.sets.map((s, j) =>
        j === i || (group !== undefined && s._group === group) ? { ...s, exercise } : s,
      ),
    });
  }
  // Taps on one set within this window after completing it are treated as a double tap.
  const completedAt = useRef(new Map<string, number>());
  function markSet(i: number, completed: boolean) {
    // The synchronously stored draft is newer than this render: a repeated tap from the
    // same render must not toggle back.
    const latest = draft.current?.editor ?? editor;
    const current = latest?.sets?.[i];
    if (!latest || !current || done(current) === completed) return;
    const key = current._key ?? String(i);
    if (!completed && Date.now() - (completedAt.current.get(key) ?? -Infinity) < repeatTapWindow)
      return;
    if (completed) completedAt.current.set(key, Date.now());
    const sets = [...latest.sets!];
    sets[i] = { ...current, completed };
    setEditor({ ...latest, sets });
  }
  async function saveWorkout() {
    if (!editor || workoutSaving.current) return;
    // #64: the server's schema checks the input first; nothing is sent while it is invalid.
    // An emptied weight or reps field is undefined; NaN makes the schema answer "Enter ... as a number" (#383).
    const payload = withoutSetKeys(editor);
    const checked = workoutSchema.safeParse({
      ...payload,
      sets: payload.sets?.map((s) => ({
        ...s,
        weight: s.weight ?? Number.NaN,
        reps: s.reps ?? Number.NaN,
      })),
    });
    setIssues(checked.success ? {} : fieldErrors(checked.error));
    if (!checked.success) {
      setSaveState('Check your input · Not sent to the server');
      return;
    }
    workoutSaving.current = true;
    setSaving(true);
    setSaveState('Saving…');
    setSaveError('');
    const path = '/workouts' + (editor.id ? '/' + editor.id : '');
    const method = editor.id ? 'PUT' : 'POST';
    let kept = false;
    try {
      const body = JSON.stringify(payload);
      const old = draft.current?.request;
      const request =
        old?.body === body && old.path === path && old.method === method
          ? old
          : { key: retryKey(), body, path, method };
      kept = persist({ format: 1, savedAt: draft.current?.savedAt ?? Date.now(), editor, request });
      const saved = await api<{ records?: NewRecord[] }>(path, method, payload, request.key);
      setNewRecords(saved?.records ?? []);
      persist(null);
      setRecovery(null);
      updateEditor(null);
      setSaveState('Saved to server');
      await onSaved();
    } catch (e) {
      // #476: an unreachable server leaves the save on the phone's queue; it is sent when back online.
      // The retry key travels with it, so a save the server did receive is not created twice.
      const queued =
        e instanceof Unreachable &&
        kept &&
        draft.current?.request &&
        (await enqueueSave({
          key: draft.current.request.key,
          path: draft.current.request.path,
          method: draft.current.request.method,
          body: draft.current.request.body,
        }));
      if (queued) {
        persist(null);
        setRecovery(null);
        updateEditor(null);
        setSaveError('');
        setSaveState('Saved on this phone · Will be sent when you are back online');
        onQueued?.();
        return;
      }
      setSaveState('Save failed · Unknown whether the server saved it');
      setSaveError(
        (e as Error).message +
          ' Your input stays on screen. Retry or check the server record. Saving after changing the content is handled as a separate request.' +
          (e instanceof Unreachable && kept
            ? ' It is also kept as a draft on this device, so you can restore it after a reload.'
            : ''),
      );
    } finally {
      workoutSaving.current = false;
      setSaving(false);
    }
  }
  return {
    editor,
    updateEditor,
    setEditor,
    recovery,
    setRecovery,
    storageWarning,
    saveState,
    setSaveState,
    saveError,
    newRecords,
    issues,
    setIssues,
    persist,
    renameSet,
    markSet,
    saveWorkout,
  };
}
export type WorkoutDraftState = ReturnType<typeof useWorkoutDraft>;
