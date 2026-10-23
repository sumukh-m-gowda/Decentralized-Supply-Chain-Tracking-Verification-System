import { json, requireSession, route } from "@/lib/api";
import { cypher } from "@/lib/neo4j";

// Neo4j: every organization that has held this item, in order.
export const GET = route(async (req, ctx) => {
  await requireSession();
  const serial = decodeURIComponent((await ctx.params).serial).trim();
  return json(await cypher(
    `MATCH (i:Item {serial_no:$serial})-[h:HELD_BY]->(o:Organization)
     RETURN o.org_id AS org_id, o.name AS name, o.type AS type, h.from_time AS from_time, h.to_time AS to_time, h.event_id AS event_id
     ORDER BY h.event_id`, { serial }));
});
