import { AlertBanner } from '../components/alert-banner';
import { Switch } from '../components/switch';
import { Button } from '../components/ui/button';
import { Input as CommonInput } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { cn } from '../lib/utils';
import { permissionHelp } from '../push';
import {
  cancelTimer,
  formatRemaining,
  maxRest,
  minRest,
  pauseTimer,
  restKinds,
  resumeTimer,
  startTimer,
  validDuration,
  withDuration,
} from '../rest-timer';
import { restKindLabels } from './model';
import type { PushState } from './use-push';
import type { RestTimerState } from './use-rest-timer';

/**
 * #105: the countdown and its buttons are one bar that stays pinned while the page or the
 * workout editor scrolls; the settings below it scroll away. Sticky works only inside its
 * parent, so the bar is not nested in the settings card.
 */
export function TimerBar({ rest }: { rest: RestTimerState }) {
  const { timer, timerEnded, timerLeft, updateTimer } = rest;
  return (
    <>
      <section
        data-slot="rest-timer"
        aria-label="Rest timer"
        className="grid items-center gap-x-4 gap-y-2 rounded-lg border border-input bg-muted p-3.5 min-[480px]:grid-cols-[1fr_auto]"
      >
        <strong
          role="timer"
          className={cn('text-2xl tabular-nums', timerEnded && 'text-muted-foreground')}
        >
          {timerEnded
            ? 'Rest over'
            : timer.state === 'running'
              ? `${formatRemaining(timerLeft)} left`
              : timer.state === 'paused'
                ? `${formatRemaining(timerLeft)} paused`
                : `Rest ${formatRemaining(timerLeft)}`}
        </strong>
        <div className="flex flex-wrap gap-2 min-[480px]:justify-end">
          {(timer.state === 'idle' || timerEnded) && (
            <Button
              type="button"
              variant="outline"
              onClick={() => updateTimer(startTimer(timer, Date.now()))}
            >
              Start rest
            </Button>
          )}
          {timer.state === 'running' && !timerEnded && (
            <Button
              type="button"
              variant="outline"
              onClick={() => updateTimer(pauseTimer(timer, Date.now()))}
            >
              Pause
            </Button>
          )}
          {timer.state === 'paused' && (
            <Button
              type="button"
              variant="outline"
              onClick={() => updateTimer(resumeTimer(timer, Date.now()))}
            >
              Resume
            </Button>
          )}
          {timer.state !== 'idle' && (
            <Button type="button" variant="ghost" onClick={() => updateTimer(cancelTimer(timer))}>
              Cancel rest
            </Button>
          )}
        </div>
      </section>
      {/* #382: the ticking readout is a timer (not live), so it is not read every second; only a change of
        state (started, paused, ended) is announced, here. */}
      <span aria-live="polite" className="sr-only" data-slot="rest-announcement">
        {timerEnded
          ? 'Rest ended'
          : timer.state === 'running'
            ? 'Rest running'
            : timer.state === 'paused'
              ? 'Rest paused'
              : ''}
      </span>
    </>
  );
}

export function TimerSettings({ rest, pushState }: { rest: RestTimerState; pushState: PushState }) {
  const { timer, updateTimer, durationInput, setDurationInput, restInputs, updateRestDuration } =
    rest;
  const { push, pushBusy, togglePush } = pushState;
  return (
    <section
      data-slot="rest-settings"
      aria-label="Rest settings"
      className="mb-4 grid items-center gap-x-4 gap-y-2 rounded-lg border border-input bg-muted p-3.5 md:grid-cols-[1fr_auto]"
    >
      <label
        htmlFor="rest-duration"
        className="mb-0 flex flex-col gap-1 text-meta text-muted-foreground"
      >
        Rest time (sec)
        <CommonInput
          id="rest-duration"
          type="number"
          aria-label="Rest time (sec)"
          className="max-w-30 md:pointer-coarse:text-base"
          min={minRest}
          max={maxRest}
          step="1"
          inputMode="numeric"
          value={durationInput}
          onChange={(e) => {
            setDurationInput(e.target.value);
            const seconds = Number(e.target.value);
            if (validDuration(seconds)) updateTimer(withDuration(timer, seconds));
          }}
        />
      </label>
      <div className="flex items-center gap-2">
        <Switch
          id="rest-auto-start"
          checked={timer.autoStart}
          onCheckedChange={(autoStart) => updateTimer({ ...timer, autoStart })}
        />
        <Label htmlFor="rest-auto-start" className="mb-0 flex-row text-meta text-foreground">
          Auto-start when a set is done
        </Label>
      </div>
      <fieldset className="col-span-full m-0 flex flex-wrap gap-x-4 gap-y-2 border-0 p-0 text-meta text-muted-foreground">
        <legend>Default rest by exercise type (sec)</legend>
        {restKinds.map((kind) => (
          <label htmlFor={`rest-${kind}`} className="mb-0 flex flex-col gap-1 text-meta" key={kind}>
            {restKindLabels[kind]}
            <CommonInput
              id={`rest-${kind}`}
              type="number"
              aria-label={`${restKindLabels[kind]} rest (sec)`}
              className="max-w-30 md:pointer-coarse:text-base"
              min={minRest}
              max={maxRest}
              step="1"
              inputMode="numeric"
              value={restInputs[kind]}
              onChange={(e) => updateRestDuration(kind, e.target.value)}
            />
          </label>
        ))}
      </fieldset>
      {(push.status === 'off' || push.status === 'on' || push.status === 'denied') && (
        <div className="col-span-full flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Switch
              id="rest-push"
              checked={push.status === 'on'}
              disabled={pushBusy || push.status === 'denied'}
              onCheckedChange={(on) => void togglePush(on)}
            />
            <Label htmlFor="rest-push" className="mb-0 flex-row text-meta text-foreground">
              Notify me when rest ends, even with the screen off
            </Label>
          </div>
          <p className="text-meta text-muted-foreground" id="rest-push-help">
            {push.status === 'denied'
              ? permissionHelp
              : 'Sent from the server at the end time, so it also arrives when the screen is off. Turn it on for each device you use. Your browser asks for permission the first time.'}
          </p>
        </div>
      )}
      <p className="col-span-full text-meta text-muted-foreground">
        Kept only in this browser, by end time; reopening the tab corrects the time left. No alert
        while the browser is closed. If rest ends while this screen is open (after one tap),
        supported devices such as Android vibrate; iPhone does not.
      </p>
      <p className="col-span-full text-meta text-muted-foreground">
        On set completion, rest uses the default for single-joint machines, then lower body, then
        upper body. Single-joint is set in the Machine Library; body parts come from Exercise
        Analysis, not from the exercise name. If unset, the rest time above applies.
      </p>
    </section>
  );
}

export function TimerAlert({ message }: { message: string }) {
  return message ? <AlertBanner className="mb-4">{message}</AlertBanner> : null;
}
