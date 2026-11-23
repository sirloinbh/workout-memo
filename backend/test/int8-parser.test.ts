import '../src/app.js';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { types } from 'pg';

// app.ts calls setInt8Parser(types) at import time (ADR-0025, project-standards#778, workout-memo#470).
test('BIGINT values come back as numbers, and a value past 2^53 throws', () => {
  const parse = types.getTypeParser(20) as (text: string) => unknown;
  assert.equal(parse('42'), 42);
  assert.throws(() => parse('9007199254740993'), /outside the safe integer range/);
});
