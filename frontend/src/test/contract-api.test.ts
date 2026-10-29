// 중앙 관리 파일. 수정은 sirloinbh/project-standards의 templates/msw/frontend/src/test/에서
import { http, HttpResponse } from 'msw';
import { describe, expect, test } from 'vitest';

import { contractHandlers, sample, setupContractApi, takeUnhandledRequests } from './contract-api';

describe('sample', () => {
  test('uses examples, enums and the smallest value of each type', () => {
    const components = {
      Goal: {
        type: 'object',
        properties: { id: { type: 'integer', minimum: 1 }, done: { type: 'boolean' } },
      },
    };
    expect(sample({ type: 'string', example: '스쿼트' })).toBe('스쿼트');
    expect(sample({ type: 'string', enum: ['weight', 'reps'] })).toBe('weight');
    expect(sample({ type: 'string', format: 'date' })).toBe('2026-01-01');
    expect(sample({ type: ['integer', 'null'] })).toBe(0);
    expect(sample({ type: 'array', items: { type: 'string' } })).toEqual([]);
    expect(sample({ $ref: '#/components/schemas/Goal' }, components)).toEqual({
      id: 1,
      done: false,
    });
    expect(sample({ anyOf: [{ type: 'null' }, { type: 'string' }] })).toBe('');
  });
});

describe('contract mock server', () => {
  const api = setupContractApi();

  test('answers a contract operation on a relative URL, as screens call it', async () => {
    // The status comes from the contract. Without a response schema the body is empty, so screens
    // that read data get it from an override.
    const response = await fetch('/api/health');
    expect(response.status).toBe(200);
  });

  test('an override replaces one response for the current test only', async () => {
    api.use(...contractHandlers({ 'GET /api/health': { status: 'override' } }));
    expect(await (await fetch('/api/health')).json()).toEqual({ status: 'override' });
    api.use(http.get('/api/health', () => HttpResponse.json({ status: 'inline' })));
    expect(await (await fetch('/api/health')).json()).toEqual({ status: 'inline' });
  });

  test('emptyBody answers operations whose contract response has no JSON body', async () => {
    api.use(...contractHandlers({}, { emptyBody: [] }));
    expect(await (await fetch('/api/health')).json()).toEqual([]);
  });

  test('after a test with overrides, the next test gets the contract handlers back', async () => {
    expect((await fetch('/api/health')).status).toBe(200);
    expect(await (await fetch('/api/health')).text()).toBe('');
  });

  test('a request the contract does not have rejects and is reported to fail the test', async () => {
    await expect(fetch('/api/not-in-the-contract')).rejects.toThrow();
    // setupContractApi's afterEach throws on these; taking them here keeps this test green.
    const found = takeUnhandledRequests();
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('/api/not-in-the-contract');
  });
});
