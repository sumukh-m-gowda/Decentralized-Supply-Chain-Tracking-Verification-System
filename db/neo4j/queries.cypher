// 1. Full route of an item
MATCH (i:Item {serial_no:'SN-000001'})-[h:HELD_BY]->(o:Organization)
RETURN o.name, h.from_time, h.to_time ORDER BY h.event_id;

// 2. Recall impact for a batch
MATCH (b:Batch {batch_id:1})<-[:PART_OF]-(i:Item)-[h:HELD_BY]->(o:Organization)
RETURN o.name, count(DISTINCT i) AS items_handled,
       count(DISTINCT CASE WHEN h.to_time IS NULL THEN i END) AS held_now
ORDER BY items_handled DESC;

// 3. Items that came back to an earlier holder (cycle)
MATCH (i:Item)-[h1:HELD_BY]->(o:Organization)<-[h2:HELD_BY]-(i)
WHERE h1.event_id < h2.event_id
RETURN i.serial_no, o.name;

// 4. Shortest shipping path between two organizations
MATCH p = shortestPath((a:Organization {org_id:1})-[:SHIPPED_TO*..6]->(b:Organization {org_id:3}))
RETURN [n IN nodes(p) | n.name] AS route;

// 5. Most connected distributors
MATCH (d:Organization {type:'distributor'})-[s:SHIPPED_TO]-(x:Organization)
RETURN d.name, count(s) AS links, collect(DISTINCT x.name) AS partners ORDER BY links DESC;
