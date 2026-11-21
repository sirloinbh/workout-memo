import type { Pool } from 'pg';

// What a data-access function needs: a Pool or the PoolClient of an open transaction.
export type Db = Pick<Pool, 'query'>;
