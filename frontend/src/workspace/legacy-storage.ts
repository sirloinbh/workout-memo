// #528: keys that a removed feature stored in this browser are cleared once on load.
const legacyKeys = ['workout-memo:rest-timer:v1', 'workout-memo:rest-durations:v1'];

export function clearLegacyStorage() {
  for (const key of legacyKeys) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage can be blocked; the leftover keys are harmless.
    }
  }
}
