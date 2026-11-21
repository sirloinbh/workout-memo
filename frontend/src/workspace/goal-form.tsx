import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import {
  defaultWeightStep,
  type GoalInput,
  goalSchema,
  weightStepSchema,
} from '../../../shared/contract';
import { fieldLabel, touchText } from '../components/form-styles';
import { Button } from '../components/ui/button';
import { Combobox } from '../components/ui/combobox';
import { FieldError } from '../components/ui/field';
import { invalidProps } from '../components/ui/field-props';
import { Input as CommonInput } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Spinner } from '../components/ui/spinner';
import { SimilarNameHint } from '../exercise-names';
import { cn } from '../lib/utils';
import { api } from './api';
import { fieldHint } from './form-text';
import { fmt, today } from './model';

// #64: React Hook Form with the shared goal schema. Messages come from the same
// contract the server uses, and each one is linked to its field for screen readers.
export function GoalForm({
  deadline,
  saving,
  names,
  onSave,
}: {
  deadline: string;
  saving: boolean;
  names: readonly string[];
  onSave: (goal: GoalInput) => void;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitted },
  } = useForm<GoalInput>({
    resolver: zodResolver(goalSchema),
    defaultValues: { exercise: '', target_reps: 10, start_date: today(), deadline },
  });
  const exercise = watch('exercise') ?? '';
  // A picked suggestion or an accepted similar name, validated like typing once submitted.
  const rename = (value: string) =>
    setValue('exercise', value, { shouldDirty: true, shouldValidate: isSubmitted });
  const field = (name: keyof GoalInput) => invalidProps(name, errors[name]?.message);
  const message = (name: keyof GoalInput) => (
    <FieldError name={name}>{errors[name]?.message}</FieldError>
  );
  return (
    <form noValidate onSubmit={(event) => void handleSubmit(onSave)(event)}>
      <Label className={fieldLabel}>
        Exercise name
        {/* #124: the same suggestions as the journal; a pick sets the form value. */}
        <Combobox
          className={touchText}
          maxLength={120}
          placeholder="Enter the same exercise name as in the journal"
          {...register('exercise')}
          {...field('exercise')}
          value={exercise}
          options={names}
          listLabel="Previously used names"
          onValueChange={rename}
        />
      </Label>
      {message('exercise')}
      <SimilarNameHint value={exercise} names={names} onReplace={rename} />
      <GoalSuggestion
        exercise={exercise}
        apply={(weight) => setValue('target_weight', weight, { shouldValidate: true })}
      />
      <div className="grid grid-cols-2 gap-x-3 md:gap-x-5 pointer-coarse:max-[480px]:grid-cols-1">
        <Label className={fieldLabel}>
          Goal total weight (kg)
          <CommonInput
            className={touchText}
            type="number"
            min="0"
            max="99999"
            step="0.25"
            {...register('target_weight', { valueAsNumber: true })}
            {...field('target_weight')}
          />
        </Label>
        <Label className={fieldLabel}>
          Goal reps
          <CommonInput
            className={touchText}
            type="number"
            min="1"
            max="1000"
            {...register('target_reps', { valueAsNumber: true })}
            {...field('target_reps')}
          />
        </Label>
        <Label className={fieldLabel}>
          Start date
          <CommonInput
            className={touchText}
            type="date"
            {...register('start_date')}
            {...field('start_date')}
          />
        </Label>
        <Label className={fieldLabel}>
          End date
          <CommonInput
            className={touchText}
            type="date"
            {...register('deadline')}
            {...field('deadline')}
          />
        </Label>
      </div>
      {message('target_weight')}
      {message('target_reps')}
      {message('start_date')}
      {message('deadline')}
      <p className={fieldHint}>
        It counts as achieved when you hit the goal weight or more and the goal reps or more in a
        single set within the period.
      </p>
      <Button type="submit" className="w-full" disabled={saving}>
        {saving && <Spinner size="sm" aria-hidden />}
        Save goal
      </Button>
    </form>
  );
}
export type Suggestion = {
  exercise: string;
  weight_step: number;
  custom: boolean;
  base: { source: 'goal' | 'record'; weight: number; reps: number } | null;
  target_weight: number | null;
};
// #86: the next goal is the latest goal or record plus the exercise's increment
// (default 5 kg). Changing the increment saves it for this exercise right away, so
// later suggestions and auto routines use it too.
export function GoalSuggestion({
  exercise,
  apply,
}: {
  exercise: string;
  apply: (w: number) => void;
}) {
  const name = exercise.trim();
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [step, setStep] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (value: string, signal?: { stale: boolean }) => {
    try {
      const next = await api<Suggestion>(`/goal-suggestion?exercise=${encodeURIComponent(value)}`);
      if (signal?.stale) return;
      setSuggestion(next);
      setStep(String(next.weight_step));
    } catch (e) {
      if (!signal?.stale) setMessage((e as Error).message);
    }
  }, []);
  useEffect(() => {
    setSuggestion(null);
    setMessage('');
    if (!name) return;
    const signal = { stale: false };
    const id = setTimeout(() => void load(name, signal), 300);
    return () => {
      signal.stale = true;
      clearTimeout(id);
    };
  }, [name, load]);
  async function save(value: number | null) {
    const checked = weightStepSchema.safeParse({ exercise: name, weight_step: value });
    if (!checked.success) {
      setMessage(checked.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      await api('/exercise-weight-steps', 'PUT', checked.data);
      setMessage(value === null ? 'Reset to the default increase step' : 'Increase step saved');
      await load(name);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!name) return null;
  return (
    <section
      aria-label="Suggest next goal"
      className="mb-4 rounded-lg border border-input p-3 text-body-sm"
    >
      {suggestion &&
        (suggestion.base && suggestion.target_weight !== null ? (
          <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-muted-foreground">
            Suggestion {fmt(suggestion.target_weight)} kg ·{' '}
            {suggestion.base.source === 'goal' ? 'Recent goals' : 'Previous record'}{' '}
            {fmt(suggestion.base.weight)} kg + {fmt(suggestion.weight_step)} kg{' '}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => apply(suggestion.target_weight!)}
            >
              Apply suggestion
            </Button>
          </p>
        ) : (
          <p className="mb-2 text-body-sm text-muted-foreground">
            Cannot suggest because this exercise has no goals or completed records.
          </p>
        ))}
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <Label className={cn(fieldLabel, 'mb-0')}>
          Increase step for this exercise (kg)
          <CommonInput
            className={touchText}
            type="number"
            min="0.01"
            max="100"
            step="0.01"
            value={step}
            onChange={(e) => setStep(e.target.value)}
          />
        </Label>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => void save(step === '' ? Number.NaN : Number(step))}
        >
          {busy && <Spinner size="sm" aria-hidden />}
          Save increase step
        </Button>
        {suggestion?.custom && (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void save(null)}>
            To the default ({defaultWeightStep} kg)
          </Button>
        )}
      </div>
      {message && (
        <p role="status" className="mt-2 text-body-sm text-muted-foreground">
          {message}
        </p>
      )}
    </section>
  );
}
