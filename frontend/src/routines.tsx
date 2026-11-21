import { Plus } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { AlertBanner } from './components/alert-banner';
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { ConfirmDialog } from './components/ui/confirm-dialog';
import { Notice } from './components/ui/notice';
import { SkeletonList } from './components/ui/skeleton';
import { Spinner } from './components/ui/spinner';
import { requestJson } from './lib/api';
import { cn } from './lib/utils';
import {
  autoRule,
  type Machine,
  newPlan,
  payload,
  type Plan,
  routineSteps,
  type Split,
  stepName,
  type Steps,
} from './routines/model';
import { PlanList } from './routines/plan-list';
import { PlanView } from './routines/plan-view';
import { CardioPreview, Preview } from './routines/previews';
import { SplitEditor } from './routines/split-editor';
import { BasicsStep, ScheduleStep, WeeklyGoals } from './routines/steps';
import { hint } from './routines/styles';

const request = <T,>(path: string, body?: unknown) =>
  requestJson<T>('/api/routines' + path, { method: body ? 'POST' : 'GET', body });
}

// #124: exercise name candidates come from the page (GET /api/exercise-names plus local names).
export function Routines({ exerciseNames = [] }: { exerciseNames?: readonly string[] }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<Plan | null>(null);
  const [draft, setDraft] = useState<Plan | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [steps, setSteps] = useState<Steps>({});
  const [machines, setMachines] = useState<Machine[]>([]);
  // #105: the form is entered one step at a time; only earlier steps can be revisited.
  const [step, setStep] = useState(0);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const movedAt = useRef(0);
  useEffect(() => {
    // Focus follows a step change (not the form opening) so the new step is announced.
    if (moved.current) stepHeading.current?.focus();
    moved.current = false;
  }, [step]);
  const goTo = (next: number) => {
    moved.current = true;
    movedAt.current = performance.now();
    setStep(next);
  };
  // #173: the plan being opened, so its button shows it is waiting.
  const [opening, setOpening] = useState<number | null>(null);
  // #312, #323: what waits for the user to discard the open draft (a saved plan, or 'new' for a
  // fresh draft), and the button that asked.
  const [replacing, setReplacing] = useState<Plan | 'new' | null>(null);
  // The dialog wording, kept after replacing clears so the closing dialog does not switch text.
  const [asking, setAsking] = useState<'plan' | 'new'>('plan');
  const askToReplace = (next: Plan | 'new') => {
    setAsking(next === 'new' ? 'new' : 'plan');
    setReplacing(next);
  };
  const askedFrom = useRef<HTMLButtonElement | null>(null);
  const startDraft = () => {
    setDraft(newPlan());
    setStep(0);
    setSelected(null);
    setError('');
    setSavedId(null);
  };
  const openPlan = (p: Plan) => {
    setError('');
    setOpening(p.id!);
    void request<Plan>('/' + p.id)
      .then((value) => {
        setSelected(value);
        setDraft(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setOpening(null));
  };
  useEffect(() => {
    let active = true;
    void requestJson<{ exercise: string; weight_step: number }[]>('/api/exercise-weight-steps')
      .then((rows: { exercise: string; weight_step: number }[]) => {
        if (active && Array.isArray(rows))
          setSteps(Object.fromEntries(rows.map((r) => [r.exercise, r.weight_step])));
      })
      .catch(() => undefined);
    // #82: machines are optional; a failed load only leaves the select empty.
    void requestJson<Machine[]>('/api/machines')
      .then((m) => {
        if (active && Array.isArray(m)) setMachines(m);
      })
      .catch(() => undefined);
    request<Plan[]>('')
      .then((p) => {
        if (active) setPlans(p);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const changeSplit = (index: number, value: Split) => {
    if (draft)
      setDraft({ ...draft, splits: draft.splits.map((s, i) => (i === index ? value : s)) });
  };
  return (
    <section data-slot="routine-page">
      <h2 className="mb-2 text-body font-semibold">Routine Builder · 12-week plan</h2>
      <p className="text-body-sm text-muted-foreground">
        Splits rotate on each workout day, and weeks 4, 8, and 12 are deload weeks. Auto goals
        calculate the 12-week goals from your current performance, and for manual goals you enter
        the weekly changes yourself.
      </p>
      <p className="mb-4 text-body-sm text-muted-foreground">
        A plan is only a goal. Record what you actually did separately in the workout journal.
      </p>
      {/* An open form shows its error beside its buttons, on whichever step it is. */}
      {error && !draft && <AlertBanner>{error}</AlertBanner>}
      <Notice
        className="mb-3"
        notice={
          savedId !== null ? { kind: 'status', text: `Routine #${savedId} saved.` } : undefined
        }
      />
      <Button
        // A plan still opening would close the new draft when it arrives.
        disabled={saving || opening !== null}
        onClick={(e) => {
          askedFrom.current = e.currentTarget;
          if (draft) askToReplace('new');
          else startDraft();
        }}
      >
        <Plus aria-hidden />
        Create new routine
      </Button>
      {/* #173: row placeholders while the saved routines first load (reloads after a save do not
          show a loading state); the status line is for screen readers. */}
      {loading && (
        <div aria-busy="true" aria-label="Saved routines" className="mt-3 rounded-lg border p-4">
          <Notice className="sr-only" notice={{ kind: 'status', text: 'Loading routines…' }} />
          <SkeletonList rows={2} />
        </div>
      )}
      {!loading && !plans.length && (
        <p className="mt-3 text-body-sm text-muted-foreground">No saved routines.</p>
      )}
      {plans.length > 0 && (
        <PlanList
          plans={plans}
          // A plan still opening would close the new draft when it arrives.
          disabled={saving || opening !== null}
          opening={opening}
          onOpen={(p, button) => {
            askedFrom.current = button;
            if (draft) askToReplace(p);
            else openPlan(p);
          }}
        />
      )}
      <ConfirmDialog
        open={replacing !== null}
        onOpenChange={(open) => !open && setReplacing(null)}
        title="Discard the new routine you are entering?"
        description={
          asking === 'new'
            ? 'Starting over clears the new routine form, and what you entered is not saved.'
            : 'Opening this plan closes the new routine form, and what you entered is not saved.'
        }
        confirmLabel={asking === 'new' ? 'Discard and start over' : 'Discard and view plan'}
        cancelLabel="Keep editing"
        returnFocusRef={askedFrom}
        onConfirm={() => {
          if (replacing === 'new') startDraft();
          else if (replacing) openPlan(replacing);
        }}
      />
      {draft && (
        <Card className="mt-5 gap-0 px-4 py-5 shadow-none md:px-6 md:py-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (saving) return;
              // Before the last step a submit (Next or Enter) only moves on. Only the current
              // step's fields are rendered, so the browser checks just those first.
              if (step < routineSteps.length - 1) {
                goTo(step + 1);
                return;
              }
              // Save takes Next's place, so a double tap on Next would save at once.
              if (performance.now() - movedAt.current < 400) return;
              setSaving(true);
              setError('');
              void request<{ id: number }>('', payload(draft))
                .then(async (result) => {
                  // The POST has succeeded even if a subsequent read fails.
                  // Close this draft so retrying a read cannot duplicate the plan.
                  const saved = { ...(payload(draft) as Plan), id: result.id };
                  setSavedId(result.id);
                  setDraft(null);
                  setSelected(saved);
                  setPlans((previous) => [saved, ...previous]);
                  const detail = await request<Plan>('/' + result.id);
                  setPlans(await request<Plan[]>(''));
                  setSelected(detail);
                })
                .catch((e) => setError(e.message))
                .finally(() => setSaving(false));
            }}
          >
            <nav aria-label="Routine steps">
              <ol data-slot="routine-steps" className="mb-4 flex flex-wrap gap-2">
                {routineSteps.map((name, i) => (
                  <li key={name}>
                    {i < step ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => goTo(i)}>
                        {i + 1}. {stepName(name, draft)}
                      </Button>
                    ) : (
                      // The current and later steps are not links: later ones open through Next.
                      <span
                        aria-current={i === step ? 'step' : undefined}
                        className={cn(
                          'inline-flex min-h-8 items-center rounded-md px-3 text-body-sm',
                          i === step
                            ? 'bg-primary font-semibold text-primary-foreground'
                            : 'text-muted-foreground',
                        )}
                      >
                        {i + 1}. {stepName(name, draft)}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
            <h3
              ref={stepHeading}
              tabIndex={-1}
              className="mb-3 text-body font-semibold outline-none"
            >
              Step {step + 1} of {routineSteps.length} · {stepName(routineSteps[step], draft)}
            </h3>
            {step === 0 && <BasicsStep draft={draft} setDraft={setDraft} />}
            {step === 1 && <ScheduleStep draft={draft} setDraft={setDraft} />}
            {step === 2 &&
              draft.splits.map((s, i) => (
                <SplitEditor
                  key={i}
                  split={s}
                  index={i}
                  progression={draft.progression}
                  machines={machines}
                  exerciseNames={exerciseNames}
                  onChange={(value) => changeSplit(i, value)}
                />
              ))}
            {step === 3 && draft.progression === 'auto' && (
              <>
                {/* The rule from step 1 again, beside the targets it produces. */}
                <p className={hint}>{autoRule}</p>
                <Preview plan={draft} steps={steps} />
              </>
            )}
            {step === 3 && <CardioPreview splits={draft.splits} />}
            {step === 3 && draft.progression !== 'auto' && (
              <WeeklyGoals draft={draft} setDraft={setDraft} />
            )}
            {/* #105: a server check can be about an earlier step, which the step list reaches. */}
            {error && <AlertBanner className="mt-5 mb-0">{error}</AlertBanner>}
            <div className="mt-5 flex flex-wrap gap-2">
              {step > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => goTo(step - 1)}
                >
                  Previous
                </Button>
              )}
              {step < routineSteps.length - 1 ? (
                <Button type="submit">Next</Button>
              ) : (
                <Button type="submit" disabled={saving}>
                  {saving && <Spinner size="sm" aria-hidden />}
                  {saving ? 'Saving…' : 'Save routine'}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => {
                  // A failed save's error belongs to the closed draft.
                  setError('');
                  setDraft(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}
      {selected && <PlanView selected={selected} machines={machines} steps={steps} />}
    </section>
  );
}
