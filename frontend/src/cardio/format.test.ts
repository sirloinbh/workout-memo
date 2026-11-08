import { expect, test } from 'vitest';

import {
  formatDistance,
  formatDuration,
  formatPace,
  formatSpeed,
  kmToMetres,
  metresToKm,
  optionalNumber,
  paceOf,
  parseDuration,
  sessionLabel,
  speedOf,
  splitDuration,
} from './format';

test('h/m/s fields become whole seconds and hours may stay empty', () => {
  expect(parseDuration({ hours: '', minutes: '32', seconds: '5' })).toEqual({ seconds: 1925 });
  expect(parseDuration({ hours: '1', minutes: '2', seconds: '3' })).toEqual({ seconds: 3723 });
  expect(parseDuration({ hours: ' 2 ', minutes: '', seconds: '' })).toEqual({ seconds: 7200 });
  expect(parseDuration({ hours: '', minutes: '', seconds: '45' })).toEqual({ seconds: 45 });
});

test('empty, zero, negative, decimal and 60+ minute/second inputs are refused', () => {
  expect(parseDuration({ hours: '', minutes: '', seconds: '' })).toEqual({
    error: '운동 시간을 입력하세요',
  });
  expect(parseDuration({ hours: '0', minutes: '0', seconds: '0' })).toEqual({
    error: '운동 시간은 1초 이상이어야 합니다',
  });
  for (const minutes of ['-1', '1.5', 'abc'])
    expect(parseDuration({ hours: '', minutes, seconds: '0' })).toEqual({
      error: '시·분·초는 0 이상의 정수로 입력하세요',
    });
  expect(parseDuration({ hours: '', minutes: '90', seconds: '0' })).toEqual({
    error: '분과 초는 0~59로 입력하세요',
  });
  expect(parseDuration({ hours: '', minutes: '1', seconds: '60' })).toEqual({
    error: '분과 초는 0~59로 입력하세요',
  });
});

test('seconds split back into the fields and format as h:mm:ss or m:ss', () => {
  expect(splitDuration(1925)).toEqual({ hours: '', minutes: '32', seconds: '5' });
  expect(splitDuration(3723)).toEqual({ hours: '1', minutes: '2', seconds: '3' });
  expect(formatDuration(1925)).toBe('32:05');
  expect(formatDuration(3723)).toBe('1:02:03');
  expect(formatDuration(45)).toBe('0:45');
});

test('pace is m:ss/km rounded to whole seconds, speed km/h with one decimal', () => {
  expect(formatPace(330)).toBe('5:30/km');
  expect(formatPace(364.5)).toBe('6:05/km');
  // 359.6 s rounds up to 6:00, not 5:60.
  expect(formatPace(359.6)).toBe('6:00/km');
  expect(formatPace(1600)).toBe('26:40/km');
  expect(formatPace(null)).toBeNull();
  expect(formatSpeed(9.88)).toBe('9.9 km/h');
  expect(formatSpeed(12)).toBe('12 km/h');
  expect(formatSpeed(null)).toBeNull();
});

test('pace and speed come from duration and distance, rounded once', () => {
  // 6589 s over 20 km is 329.45 s/km → 5:29. A pace already rounded to 329.5 would show 5:30.
  expect(formatPace(paceOf(6589, 20, 329.5))).toBe('5:29/km');
  expect(formatPace(paceOf(1830, 5.02))).toBe('6:05/km');
  expect(formatSpeed(speedOf(2400, 1.5))).toBe('2.3 km/h');
  // Without a distance the API value (null) is used: nothing is guessed.
  expect(paceOf(3725, null, null)).toBeNull();
  expect(speedOf(3725, null, null)).toBeNull();
});

test('only plain decimals are read as numbers', () => {
  expect(optionalNumber('')).toBeNull();
  expect(optionalNumber('  ')).toBeNull();
  expect(optionalNumber('5')).toBe(5);
  expect(optionalNumber(' 5.02 ')).toBe(5.02);
  expect(optionalNumber('1,5')).toBe(1.5);
  expect(optionalNumber('.5')).toBe(0.5);
  expect(optionalNumber('-1')).toBe(-1);
  for (const text of ['0x10', '1e3', '1,500.5', 'Infinity', 'abc', '1 5', '--1'])
    expect(optionalNumber(text)).toBeNaN();
});

test('km and m convert without float noise', () => {
  expect(kmToMetres(5)).toBe(5000);
  expect(kmToMetres(5.02)).toBe(5020);
  expect(kmToMetres(1.005)).toBe(1005);
  expect(metresToKm(1500)).toBe(1.5);
  expect(metresToKm(1234)).toBe(1.234);
});

test('a session label adds the start time, or the duration without one', () => {
  const run = { date: '2026-11-07', kind: 'running', duration_sec: 1830 } as const;
  expect(sessionLabel({ ...run, start_time: '07:30' })).toBe('2026-11-07 07:30 러닝');
  expect(sessionLabel({ ...run, start_time: null })).toBe('2026-11-07 러닝 30:30');
});

test('distance is km for every kind except swimming, which shows metres', () => {
  expect(formatDistance('running', 5.02)).toBe('5.02 km');
  expect(formatDistance('outdoor_cycling', 42.195)).toBe('42.195 km');
  expect(formatDistance('running', 10)).toBe('10 km');
  expect(formatDistance('swimming', 1.5)).toBe('1,500 m');
  expect(formatDistance('swimming', 0.025)).toBe('25 m');
  expect(formatDistance('swimming', null)).toBeNull();
});
