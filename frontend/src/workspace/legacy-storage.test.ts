import { expect, test } from 'vitest';

import { clearLegacyStorage } from './legacy-storage';

// #528: the removed feature's browser keys are cleared and nothing else is touched.
test('clears the removed feature keys and keeps other keys', () => {
  localStorage.setItem('workout-memo:rest-timer:v1', '{"running":true}');
  localStorage.setItem('workout-memo:rest-durations:v1', '{"default":90}');
  localStorage.setItem('workout-memo:other', 'keep');
  clearLegacyStorage();
  expect(localStorage.getItem('workout-memo:rest-timer:v1')).toBeNull();
  expect(localStorage.getItem('workout-memo:rest-durations:v1')).toBeNull();
  expect(localStorage.getItem('workout-memo:other')).toBe('keep');
  localStorage.removeItem('workout-memo:other');
});
