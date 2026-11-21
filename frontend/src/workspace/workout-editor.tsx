import { Plus, X } from 'lucide-react';
import React from 'react';

import { feedbackLevels } from '../../../shared/contract';
import { AlertBanner } from '../components/alert-banner';
import { FieldError } from '../components/field';
import { invalidProps } from '../components/field-props';
import { Modal, ModalFooter } from '../components/modal';
import { NumberValueInput } from '../components/number-input';
import { ToggleChips } from '../components/toggle-chips';
import { Button } from '../components/ui/button';
import { Combobox } from '../components/ui/combobox';
import { Notice } from '../components/ui/notice';
import { Spinner } from '../components/ui/spinner';
import { SimilarNameHint } from '../exercise-names';
import { cn } from '../lib/utils';
import { type Progress, setReference } from '../progress-data';
import {
  done,
  feedbackLabels,
  type Machine,
  officialLabel,
  setField,
  setFieldName,
  statusNotice,
  weightStep,
} from './model';
import type { WorkoutDraftState } from './use-workout-draft';

/** The full-screen editor for one workout journal and its sets. */
export function WorkoutEditor({
  draft,
  saving,
  machines,
  exerciseNames,
  progress,
  timerBar,
  timerAlert,
  timerSettings,
}: {
  draft: WorkoutDraftState;
  saving: boolean;
  machines: Machine[];
  exerciseNames: readonly string[];
  progress: Progress | null;
  timerBar: React.ReactNode;
  timerAlert: React.ReactNode;
  timerSettings: React.ReactNode;
}) {
  const { setIssues, setEditor, saveWorkout, renameSet, markSet, saveState, saveError, issues } =
    draft;
  const storageWarning = draft.storageWarning;
  const editor = draft.editor!;
  const invalid = (key: string) => invalidProps(key, issues[key]);
  const issue = (key: string) => <FieldError name={key}>{issues[key]}</FieldError>;
  return (
    <Modal
      title={editor.id ? 'Edit workout journal' : 'New workout record'}
      layout="full"
      close={() => {
        setIssues({});
        setEditor(null);
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void saveWorkout();
        }}
      >
        {/* #173: a spinner beside the status line while the save request is in flight. The
                wrapper stays mounted so the role="status" line is not replaced and still announces
                each change. */}
        <div className={cn('flex items-center gap-2', (saving || saveState) && 'mb-3')}>
          {saving && <Spinner size="sm" aria-hidden className="text-muted-foreground" />}
          <Notice notice={statusNotice(saveState)} />
        </div>
        {storageWarning && <AlertBanner className="mb-3">{storageWarning}</AlertBanner>}
        <p className="form-hint">
          Drafts stay in this browser&apos;s localStorage for 7 days after the last input. They do
          not sync to other devices and may vanish if you clear browser data or use private mode.
          Only records saved to the server count toward stats and goals.
        </p>
        {saveError && (
          <AlertBanner
            className="mb-3"
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => void saveWorkout()}
              >
                Retry save
              </Button>
            }
          >
            {saveError}
          </AlertBanner>
        )}
        {/* Pinned to the top of the editor while the long form scrolls; it spans the
                modal's 24px side padding so fields scroll behind it. */}
        <div className="sticky top-0 z-10 -mx-6 mb-2 bg-background px-6 py-2">{timerBar}</div>
        {timerAlert}
        {timerSettings}
        <fieldset disabled={saving} className="workout-fields">
          <div className="form-grid">
            <label>
              Workout date
              <input
                type="date"
                required
                value={editor.date}
                onChange={(e) => setEditor({ ...editor, date: e.target.value })}
                {...invalid('date')}
              />
            </label>
            {issue('date')}
            <label>
              Journal title
              <input
                required
                maxLength={120}
                placeholder="e.g. Legs · quad focus"
                value={editor.title}
                onChange={(e) => setEditor({ ...editor, title: e.target.value })}
                {...invalid('title')}
              />
            </label>
            {issue('title')}
          </div>
          <div className="mb-4 flex flex-col items-start gap-2 text-caption text-muted-foreground">
            <span>Effort feedback (optional)</span>
            <ToggleChips
              label="Effort feedback"
              options={feedbackLevels.map((level) => feedbackLabels[level])}
              value={editor.feedback ? [feedbackLabels[editor.feedback]] : []}
              // At most one level: a new press replaces the old one, and pressing the
              // selected level again clears it back to not recorded.
              onValueChange={(next) =>
                setEditor({
                  ...editor,
                  feedback:
                    feedbackLevels.find(
                      (level) => level !== editor.feedback && next.includes(feedbackLabels[level]),
                    ) ?? null,
                })
              }
            />
          </div>
          {issue('feedback')}
          {issue('sets')}
          <p className="form-hint">
            Record each set. For weight, enter the total weight (kg) including the machine&apos;s
            base weight. For equipment that moves both sides together, enter the sum of both sides;
            for one-sided exercises, enter the total weight actually moved on one side. If you do
            not know the base weight, do not guess; leave a note in the set memo. Selecting a
            machine does not add its base weight automatically.
          </p>
          <p className="form-hint">
            Mark sets you performed as done. Only completed sets count toward stats and goal
            achievement, and incomplete sets are kept as plans. Leave how the whole workout felt as
            effort feedback (hard, medium, easy); if you do not choose, it stays not entered.
            Completed {editor.sets?.filter(done).length ?? 0} / {editor.sets?.length ?? 0} sets
          </p>
          {editor.sets?.map((s, i) => (
            // #105: one card per set; weight and reps take − / + presses and a number
            // keypad, and the completion button spans the card for a one-handed tap.
            <div
              data-slot="set-row"
              className={cn(
                'mb-3 grid gap-x-3 gap-y-2.5 rounded-lg border border-border bg-card p-3 md:grid-cols-2',
                done(s) && 'border-primary/60',
              )}
              key={i}
            >
              <div className="flex items-center justify-between gap-2 md:col-span-2">
                <span
                  className={cn(
                    'text-meta text-muted-foreground',
                    done(s) && 'font-bold text-foreground',
                  )}
                >
                  Set {i + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground"
                  disabled={editor.sets!.length === 1}
                  aria-label="Delete set"
                  onClick={() =>
                    setEditor({ ...editor, sets: editor.sets!.filter((_, j) => j !== i) })
                  }
                >
                  <X size={15} />
                </Button>
              </div>
              {/* The hint stays in the name's grid cell so Machine keeps its place beside it. */}
              <div>
                <label htmlFor={`set-${i}-exercise`} className={setField}>
                  <span className={setFieldName}>Exercise name</span>
                  {/* #124: suggestions from earlier journals, goals, routines and machines. */}
                  <Combobox
                    id={`set-${i}-exercise`}
                    className="md:pointer-coarse:text-base"
                    required
                    value={s.exercise}
                    options={exerciseNames}
                    listLabel="Previously used names"
                    onValueChange={(exercise) => renameSet(i, exercise)}
                    {...invalid(`sets.${i}.exercise`)}
                  />
                </label>
                <SimilarNameHint
                  value={s.exercise}
                  names={exerciseNames}
                  onReplace={(exercise) => renameSet(i, exercise)}
                />
              </div>
              <label className={setField}>
                <span className={setFieldName}>Machine</span>
                <select
                  className="h-9 px-2 py-0 text-body-sm pointer-coarse:text-base"
                  value={s.machine_id ?? ''}
                  onChange={(e) => {
                    const m = machines.find((m) => m.id === Number(e.target.value));
                    const sets = [...editor.sets!];
                    sets[i] = {
                      ...s,
                      machine_id: m?.id ?? null,
                      exercise: s.exercise || m?.name || '',
                    };
                    setEditor({ ...editor, sets });
                  }}
                >
                  <option value="">Free workout</option>
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.brand} · {m.name} (base weight{' '}
                      {m.base_weight === null ? 'unconfirmed' : `${m.base_weight} kg`})
                      {m.official_status
                        ? ` · Official reference ${officialLabel({
                            status: m.official_status,
                            raw_value: m.official_raw_value,
                            raw_unit: m.official_raw_unit,
                            weight_kg: m.official_weight_kg,
                            basis: m.official_basis,
                          })}`
                        : ''}
                    </option>
                  ))}
                </select>
              </label>
              {/* Stacked on phones: two − / + fields side by side leave no room for the digits.
                      #268: there each label sits beside its field rather than above it. */}
              <div className="grid gap-3 min-[480px]:grid-cols-2 md:col-span-2">
                <div className="flex min-w-0 items-center gap-2 min-[480px]:flex-col min-[480px]:items-stretch">
                  <label htmlFor={`set-${i}-weight`} className={cn('mb-0 text-meta', setFieldName)}>
                    Total weight kg
                  </label>
                  <NumberValueInput
                    id={`set-${i}-weight`}
                    label="Total weight kg"
                    className="min-w-0 max-[480px]:flex-1 md:pointer-coarse:[&_input]:text-base"
                    step={weightStep}
                    // A whole-number step would pick the digits-only keypad; 0.25 kg still needs a point.
                    inputMode="decimal"
                    min={0}
                    max={99999}
                    required
                    value={s.weight}
                    onValueChange={(weight) => {
                      const sets = [...editor.sets!];
                      sets[i] = { ...s, weight };
                      setEditor({ ...editor, sets });
                    }}
                    {...invalid(`sets.${i}.weight`)}
                  />
                </div>
                <div className="flex min-w-0 items-center gap-2 min-[480px]:flex-col min-[480px]:items-stretch">
                  <label htmlFor={`set-${i}-reps`} className={cn('mb-0 text-meta', setFieldName)}>
                    Reps
                  </label>
                  <NumberValueInput
                    id={`set-${i}-reps`}
                    label="Reps"
                    className="min-w-0 max-[480px]:flex-1 md:pointer-coarse:[&_input]:text-base"
                    min={1}
                    max={1000}
                    required
                    value={s.reps}
                    onValueChange={(reps) => {
                      const sets = [...editor.sets!];
                      sets[i] = { ...s, reps };
                      setEditor({ ...editor, sets });
                    }}
                    {...invalid(`sets.${i}.reps`)}
                  />
                </div>
              </div>
              {(['exercise', 'weight', 'reps', 'rpe'] as const).map((field) => (
                <React.Fragment key={field}>{issue(`sets.${i}.${field}`)}</React.Fragment>
              ))}
              <label className={cn(setField, 'md:col-span-2')}>
                <span className={setFieldName}>Set memo</span>
                {/* #268: one line on phones, still a 44px target, growing with a longer memo. */}
                <textarea
                  className="max-md:field-sizing-content max-md:min-h-11"
                  rows={1}
                  maxLength={4000}
                  value={s.notes}
                  placeholder="Form, machine settings, etc."
                  onChange={(e) => {
                    const sets = [...editor.sets!];
                    sets[i] = { ...s, notes: e.target.value };
                    setEditor({ ...editor, sets });
                  }}
                />
              </label>
              {setReference(progress, s.exercise) && (
                <p className="m-0 text-meta text-muted-foreground md:col-span-2">
                  {setReference(progress, s.exercise)}
                </p>
              )}
              <Button
                type="button"
                size="lg"
                variant={done(s) ? 'default' : 'outline'}
                className="h-auto min-h-12 w-full py-2 text-base whitespace-normal md:col-span-2"
                aria-pressed={done(s)}
                aria-label={`Set ${i + 1} done`}
                onClick={() => markSet(i, !done(s))}
              >
                {done(s) ? 'Done · tap again to cancel' : 'Done'}
              </Button>
            </div>
          ))}
          <button
            type="button"
            className="subtle-button"
            onClick={() =>
              setEditor({
                ...editor,
                // The next set is planned until it is marked completed.
                sets: [...editor.sets!, { ...editor.sets!.at(-1)!, completed: false, rpe: null }],
              })
            }
          >
            <Plus size={16} />
            Add set
          </button>
          <button
            type="button"
            className="subtle-button"
            disabled={editor.sets!.length >= 200}
            onClick={() =>
              setEditor({
                ...editor,
                sets: [
                  ...editor.sets!,
                  {
                    exercise: '',
                    machine_id: null,
                    weight: 0,
                    reps: 10,
                    notes: '',
                    completed: false,
                    rpe: null,
                  },
                ],
              })
            }
          >
            <Plus size={16} />
            Add another exercise
          </button>
          <label>
            Workout memo
            <textarea
              maxLength={4000}
              value={editor.notes}
              placeholder="Condition, form, things to remember for the next workout…"
              onChange={(e) => setEditor({ ...editor, notes: e.target.value })}
            />
          </label>
          <ModalFooter>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Spinner size="sm" aria-hidden />}
              {saving ? 'Saving…' : 'Save record'}
            </Button>
          </ModalFooter>
        </fieldset>
      </form>
    </Modal>
  );
}
