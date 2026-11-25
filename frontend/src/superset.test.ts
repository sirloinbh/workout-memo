import { describe, expect, it } from 'vitest';

import { groupChoices, groupExercises, startsRest } from './superset';

const s = (exercise: string, superset: number | null = null) => ({ exercise, superset });

describe('startsRest (#481)', () => {
  it('a set outside a superset always starts the rest', () => {
    const sets = [s('Squat'), s('Curl')];
    expect(startsRest(sets, 0)).toBe(true);
    expect(startsRest(sets, 1)).toBe(true);
  });
  it('only the last exercise of a superset round starts the rest', () => {
    // A1 B1 A2 B2 in the log: the rest follows each B
    const sets = [s('Bench', 1), s('Row', 1), s('Bench', 1), s('Row', 1)];
    expect(sets.map((_, i) => startsRest(sets, i))).toEqual([false, true, false, true]);
  });
  it('three exercises rest after the third, and other groups and plain sets are independent', () => {
    const sets = [s('A', 1), s('B', 1), s('C', 1), s('X', 2), s('Y', 2), s('Squat')];
    expect(sets.map((_, i) => startsRest(sets, i))).toEqual([
      false,
      false,
      true,
      false,
      true,
      true,
    ]);
  });
  it('names compare without case or surrounding spaces', () => {
    const sets = [s('Bench', 1), s(' row ', 1), s('bench ', 1)];
    expect(groupExercises(sets, 1)).toEqual(['bench', 'row']);
    expect(startsRest(sets, 2)).toBe(false);
    expect(startsRest(sets, 1)).toBe(true);
  });
  it('a group with a single exercise (not finished grouping) behaves like no group', () => {
    const sets = [s('Bench', 1), s('Bench', 1)];
    expect(startsRest(sets, 0)).toBe(true);
  });
  it('ungrouping a set puts it back to resting every time', () => {
    const sets = [s('Bench', 1), s('Row', 1)];
    expect(startsRest(sets, 0)).toBe(false);
    const ungrouped = [{ ...sets[0], superset: null }, sets[1]];
    expect(startsRest(ungrouped, 0)).toBe(true);
    expect(startsRest(ungrouped, 1)).toBe(true);
  });
});

describe('groupChoices', () => {
  it('offers the groups in use plus the next free one, capped', () => {
    expect(groupChoices([s('A')])).toEqual([1]);
    expect(groupChoices([s('A', 1), s('B', 1)])).toEqual([1, 2]);
    expect(groupChoices([s('A', 20)])).toHaveLength(20);
  });
});
