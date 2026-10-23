import { HttpError, json, num, requireSession, route } from "@/lib/api";
import { one } from "@/lib/db";
import { cypher } from "@/lib/neo4j";

// Recall impact: every organization that has held items from this batch, and how many it holds now.
export const GET = route(async (req, ctx) => {
  const s = await requireSession(["admin", "manufacturer"]);
  const batchId = num((await ctx.params).batchId);
  if (s.role !== "admin") {
    const b = await one("SELECT 1 FROM batches b JOIN products p ON p.product_id = b.product_id WHERE b.batch_id = $1 AND p.org_id = $2", [batchId, s.orgId]);
    if (!b) throw new HttpError(403, "Not your batch");
  }
  const orgs = await cypher(
    `MATCH (b:Batch {batch_id:$batch})<-[:PART_OF]-(i:Item)-[h:HELD_BY]->(o:Organization)
     RETURN o.org_id AS org_id, o.name AS name, o.type AS type,
            count(DISTINCT i) AS items_handled,
            count(DISTINCT CASE WHEN h.to_time IS NULL THEN i END) AS items_held_now,
            collect(DISTINCT i.serial_no)[0..5] AS sample_serials
     ORDER BY items_handled DESC`, { batch: batchId });
  const total = await cypher("MATCH (b:Batch {batch_id:$batch})<-[:PART_OF]-(i:Item) RETURN count(i) AS total", { batch: batchId });
  return json({ batch_id: batchId, total_items: total[0]?.total ?? 0, orgs });
});
