import { useEffect, useRef, useState } from 'react';

import { disablePush, enablePush, loadPushStatus, type PushStatus, syncRest } from '../push';
import type { RestTimer } from '../rest-timer';

/**
 * #260: rest-end Web Push. The settings toggle appears only when the server has keys and this
 * browser supports push. While it is on, every start, resume, pause and cancel of the rest is
 * sent to the server, which pushes at the end time even with the screen off.
 */
export function usePush(timer: RestTimer) {
  const [push, setPush] = useState<{ status: PushStatus; publicKey: string | null }>({
    status: 'checking',
    publicKey: null,
  });
  const [pushBusy, setPushBusy] = useState(false);
  const [pushWarning, setPushWarning] = useState('');
  useEffect(() => {
    let current = true;
    loadPushStatus().then(
      (loaded) => current && setPush(loaded),
      // Not knowing means no toggle; the in-screen timer is unaffected.
      () => current && setPush({ status: 'unavailable', publicKey: null }),
    );
    return () => {
      current = false;
    };
  }, []);
  // The first run (page load, or the toggle just turned on) with no running rest sends nothing:
  // another device of the same user may have a rest running, and clearing it would cancel its push.
  const pushSynced = useRef(false);
  useEffect(() => {
    if (push.status !== 'on') {
      pushSynced.current = false;
      return;
    }
    if (!pushSynced.current && timer.state !== 'running') {
      pushSynced.current = true;
      return;
    }
    pushSynced.current = true;
    syncRest(timer, Date.now()).then(
      () => setPushWarning(''),
      () =>
        setPushWarning(
          'Could not tell the server when the rest ends, so the notification may not arrive. The timer on screen still works.',
        ),
    );
    // Only a change of state or end time is sent, not every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [push.status, timer.state, timer.endsAt]);
  async function togglePush(on: boolean) {
    if (pushBusy || !push.publicKey) return;
    setPushBusy(true);
    setPushWarning('');
    try {
      if (on) setPush({ ...push, status: await enablePush(push.publicKey) });
      else {
        await disablePush();
        setPush({ ...push, status: 'off' });
      }
    } catch (error) {
      setPushWarning(
        error instanceof Error && error.message
          ? error.message
          : 'Could not change the notification setting.',
      );
    } finally {
      setPushBusy(false);
    }
  }
  return { push, pushBusy, pushWarning, togglePush };
}
export type PushState = ReturnType<typeof usePush>;
