import { query } from "./db";
import { cypherWrite } from "./neo4j";

/**
 * Outbox payload written by the Postgres custody functions/triggers
 * (see db/postgres/CONTRACT.md):
 * { event_id, event_type, event_time, item_id, serial_no, batch_id, product_id, product_name,
 *   manufacturer_org, manufacturer_name, from_org?, from_name?, from_type?, to_org, to_name, to_type, shipment_id? }
 */
interface Payload {
  event_id: number; event_type: string; event_time: string; item_id: number; serial_no: string;
  batch_id: number; product_id: number; product_name: string; manufacturer_org: number; manufacturer_name: string;
  from_org?: number | null; from_name?: string | null; from_type?: string | null;
  to_org: number; to_name: string; to_type: string; shipment_id?: number | null;
}

const HOLD = `
MERGE (m:Organization {org_id:$manufacturer_org}) SET m.name=$manufacturer_name, m.type='manufacturer'
MERGE (p:Product {product_id:$product_id}) SET p.name=$product_name
MERGE (p)-[:MADE_BY]->(m)
MERGE (b:Batch {batch_id:$batch_id})
MERGE (b)-[:OF_PRODUCT]->(p)
MERGE (i:Item {serial_no:$serial_no}) SET i.item_id=$item_id
MERGE (i)-[:PART_OF]->(b)
MERGE (t:Organization {org_id:$to_org}) SET t.name=$to_name, t.type=$to_type
WITH i, t
OPTIONAL MATCH (i)-[old:HELD_BY]->(:Organization) WHERE old.to_time IS NULL AND old.event_id <> $event_id
SET old.to_time = $event_time
WITH DISTINCT i, t
MERGE (i)-[h:HELD_BY {event_id:$event_id}]->(t)
ON CREATE SET h.from_time=$event_time, h.shipment_id=$shipment_id`;

const SHIP = `
MERGE (f:Organization {org_id:$from_org}) SET f.name=$from_name, f.type=$from_type
MERGE (t:Organization {org_id:$to_org}) SET t.name=$to_name, t.type=$to_type
MERGE (f)-[s:SHIPPED_TO {shipment_id:$shipment_id}]->(t)
ON CREATE SET s.date=$event_time`;

export async function applyEvent(p: Payload) {
  const args = { ...p, shipment_id: p.shipment_id ?? null };
  const stmts: [string, Record<string, any>][] = [[HOLD, args]];
  if (p.from_org && p.shipment_id) stmts.push([SHIP, args]);
  await cypherWrite(stmts);
}

/** Push pending outbox rows into Neo4j in order. Safe to re-run: every write is a MERGE. */
export async function syncOutbox(limit = 500) {
  const rows = await query<{ id: number; payload: Payload }>(
    "SELECT id, payload FROM graph_sync_outbox WHERE synced = false ORDER BY id LIMIT $1", [limit]);
  let synced = 0;
  let error: string | null = null;
  for (const r of rows) {
    try {
      await applyEvent(r.payload);
      await query("UPDATE graph_sync_outbox SET synced = true, synced_at = now() WHERE id = $1", [r.id]);
      synced++;
    } catch (e: any) {
      error = e.message; // stop here so events stay in order; the row stays pending
      break;
    }
  }
  return { pending: rows.length - synced, synced, error };
}
