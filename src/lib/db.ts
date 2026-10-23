import { Pool, type PoolClient, type QueryResultRow } from "pg";

const g = globalThis as unknown as { pgPool?: Pool };
export const pool = g.pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL });
if (process.env.NODE_ENV !== "production") g.pgPool = pool;

export async function query<T extends QueryResultRow = any>(text: string, params: any[] = []): Promise<T[]> {
  return (await pool.query<T>(text, params)).rows;
}

export async function one<T extends QueryResultRow = any>(text: string, params: any[] = []): Promise<T | null> {
  return (await query<T>(text, params))[0] ?? null;
}

/** Run several statements atomically. Anything thrown rolls the whole thing back. */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
