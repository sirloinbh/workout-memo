import { useEffect, useState } from 'react';

import { disablePush, enablePush, loadPushStatus, type PushStatus } from '../push';

/**
 * #260: rest-end Web Push. The settings toggle appears only when the server has keys and this
 * browser supports push. The rest-end sync is gone with the timer (#527); #528 removes the toggle.
 */
export function usePush() {
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
