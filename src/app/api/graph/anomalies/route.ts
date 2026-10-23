import { json, requireSession, route } from "@/lib/api";
import { cypher } from "@/lib/neo4j";

// Counterfeit/diversion signal: an item that comes back to an organization that already held it.
export const GET = route(async () => {
  await requireSession(["admin", "manufacturer"]);
  return json(await cypher(
    `MATCH (i:Item)-[h1:HELD_BY]->(o:Organization)<-[h2:HELD_BY]-(i)
     WHERE h1.event_id < h2.event_id
     RETURN i.serial_no AS serial, o.name AS org, h1.event_id AS first_event, h2.event_id AS return_event LIMIT 50`));
});
