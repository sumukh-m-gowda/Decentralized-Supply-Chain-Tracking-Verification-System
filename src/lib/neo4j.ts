import neo4j, { type Driver } from "neo4j-driver";

const g = globalThis as unknown as { neoDriver?: Driver };

export function driver(): Driver {
  if (!g.neoDriver) {
    const { NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD } = process.env;
    if (!NEO4J_URI || !NEO4J_USER || !NEO4J_PASSWORD) throw new Error("NEO4J_URI, NEO4J_USER and NEO4J_PASSWORD must be set in .env.local");
    // disableLosslessIntegers: Neo4j integers come back as plain JS numbers
    g.neoDriver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD), { disableLosslessIntegers: true });
  }
  return g.neoDriver;
}

// JS numbers are sent to Neo4j as floats; our ids are integers, so convert them.
function params(p: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(p)) out[k] = typeof v === "number" && Number.isInteger(v) ? neo4j.int(v) : v;
  return out;
}

const dbName = () => process.env.NEO4J_DATABASE || undefined;

export async function cypher<T = any>(q: string, p: Record<string, any> = {}): Promise<T[]> {
  const s = driver().session({ database: dbName(), defaultAccessMode: neo4j.session.READ });
  try {
    const r = await s.run(q, params(p));
    return r.records.map((rec) => rec.toObject() as T);
  } finally {
    await s.close();
  }
}

/** Run several write statements in one Neo4j transaction. */
export async function cypherWrite(statements: [string, Record<string, any>][]) {
  const s = driver().session({ database: dbName(), defaultAccessMode: neo4j.session.WRITE });
  try {
    await s.executeWrite(async (t) => {
      for (const [q, p] of statements) await t.run(q, params(p));
    });
  } finally {
    await s.close();
  }
}
