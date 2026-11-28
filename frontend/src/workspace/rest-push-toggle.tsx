import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { permissionHelp } from '../push';
import type { PushState } from './use-push';

/** #508: the rest-end push switch, now in Settings next to the weekly summary. */
export function RestPushToggle({ pushState }: { pushState: PushState }) {
  const { push, pushBusy, togglePush } = pushState;
  return (
    <>
      {(push.status === 'off' || push.status === 'on' || push.status === 'denied') && (
        <div className="flex flex-col gap-1">
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
    </>
  );
}
