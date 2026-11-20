import type { Pool, PoolClient } from 'pg';

import { withTransaction } from './standard/db.js';

class RollBack<T> {
  constructor(readonly result: T) {}
}

/**
 * Runs `run` in one transaction (BEGIN, COMMIT and ROLLBACK are in the managed withTransaction). It commits unless
 * `commit` says otherwise for the result (then it rolls back and still returns the result) or `run` throws.
 * `setup` runs first, e.g. a SET TRANSACTION for a read snapshot.
 */
export async function inTransaction<T>(
  pool: Pool,
  run: (client: PoolClient) => Promise<T>,
  options: { commit?: (result: T) => boolean; setup?: string } = {},
): Promise<T> {
  try {
    return await withTransaction(pool, async (client: PoolClient) => {
      if (options.setup) await client.query(options.setup);
      const result = await run(client);
      if (options.commit && !options.commit(result)) throw new RollBack(result);
      return result;
    });
  } catch (error) {
    if (error instanceof RollBack) return error.result as T;
    throw error;
  }
}
