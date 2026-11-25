import { useEffect, useState } from 'react';

import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { requestJson } from '../lib/api';
import { enablePush, loadPushStatus, permissionHelp, type PushStatus } from '../push';

const path = '/api/push/weekly-summary';

/**
 * #485: the switch for the Sunday 21:00 weekly summary push (off until turned on). It needs Web Push, so it is
 * hidden where push is unsupported or not set up on the server, and turning it on also subscribes this browser.
 */
export function WeeklySummaryToggle() {
  const [state, setState] = useState<{
    status: PushStatus;
    publicKey: string | null;
    enabled: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let current = true;
    (async () => {
      const push = await loadPushStatus();
      if (push.status === 'unsupported' || push.status === 'unavailable') return;
      const { enabled } = await requestJson<{ enabled: boolean }>(path);
      if (current) setState({ ...push, enabled });
    })().catch(() => undefined); // Not knowing means no switch.
    return () => {
      current = false;
    };
  }, []);
  if (!state || state.status === 'checking') return null;
  async function toggle(on: boolean) {
    if (!state || busy) return;
    setBusy(true);
    setMessage('');
    try {
      let status = state.status;
      // The summary arrives as a push, so this browser must be subscribed first.
      if (on && status !== 'on' && state.publicKey) status = await enablePush(state.publicKey);
      if (on && status !== 'on') {
        setState({ ...state, status });
        setMessage(status === 'denied' ? permissionHelp : 'Notifications were not allowed.');
        return;
      }
      const { enabled } = await requestJson<{ enabled: boolean }>(path, {
        method: 'PUT',
        body: { enabled: on },
      });
      setState({ ...state, status, enabled });
    } catch (error) {
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Could not change the weekly summary setting.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mb-6 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Switch
          id="weekly-summary"
          checked={state.enabled}
          disabled={busy || (state.status === 'denied' && !state.enabled)}
          onCheckedChange={(on) => void toggle(on)}
        />
        <Label htmlFor="weekly-summary" className="mb-0 flex-row text-meta text-foreground">
          Send me a weekly summary on Sunday at 21:00
        </Label>
      </div>
      <p className="text-meta text-muted-foreground" role="status">
        {message ||
          (state.status === 'denied'
            ? permissionHelp
            : 'Volume, new records and goal progress. Skipped in a week with no workouts.')}
      </p>
    </div>
  );
}
