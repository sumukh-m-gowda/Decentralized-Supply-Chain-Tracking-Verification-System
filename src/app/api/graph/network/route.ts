import { json, requireSession, route } from "@/lib/api";
import { cypher } from "@/lib/neo4j";

export const GET = route(async () => {
  await requireSession(["admin", "manufacturer"]);
  const rows = await cypher(
    `MATCH (a:Organization)-[s:SHIPPED_TO]->(b:Organization)
     RETURN a.org_id AS aid, a.name AS aname, a.type AS atype, b.org_id AS bid, b.name AS bname, b.type AS btype, count(s) AS shipments`);
  const nodes = new Map<number, { id: number; name: string; type: string }>();
  const links = rows.map((r: any) => {
    nodes.set(r.aid, { id: r.aid, name: r.aname, type: r.atype });
    nodes.set(r.bid, { id: r.bid, name: r.bname, type: r.btype });
    return { source: r.aid, target: r.bid, shipments: r.shipments };
  });
  return json({ nodes: [...nodes.values()], links });
});
