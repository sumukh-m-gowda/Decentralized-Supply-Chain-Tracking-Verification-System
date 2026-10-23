import { HttpError, json, requireApprovedOrg, requireSession, route } from "@/lib/api";
import { query, tx } from "@/lib/db";
import { shipmentSchema } from "@/lib/validators";

export const GET = route(async () => {
  const s = await requireSession(["manufacturer", "distributor", "retailer", "admin"]);
  return json(await query(
    `SELECT s.shipment_id, s.status, fo.name AS from_name, t.name AS to_name, s.from_org, s.to_org,
            s.created_at, s.dispatched_at, s.delivered_at,
            (SELECT COUNT(*)::int FROM shipment_items si WHERE si.shipment_id = s.shipment_id) AS item_count
     FROM shipments s JOIN organizations fo ON fo.org_id = s.from_org JOIN organizations t ON t.org_id = s.to_org
     WHERE ($1::int IS NULL OR s.from_org = $1 OR s.to_org = $1)
     ORDER BY s.shipment_id DESC LIMIT 200`,
    [s.role === "admin" ? null : s.orgId]));
});

export const POST = route(async (req) => {
  const s = await requireSession(["manufacturer", "distributor", "retailer"]);
  const orgId = await requireApprovedOrg(s);
  const b = shipmentSchema.parse(await req.json());
  if (b.to_org === orgId) throw new HttpError(400, "Choose a different receiving organization");

  const id = await tx(async (c) => {
    const dest = await c.query("SELECT 1 FROM organizations WHERE org_id = $1 AND status = 'approved'", [b.to_org]);
    if (!dest.rowCount) throw new HttpError(400, "Receiving organization is not approved");
    const mine = await c.query(
      `UPDATE items SET status = 'reserved'
       WHERE item_id = ANY($1::int[]) AND current_owner_org = $2 AND status = 'in_stock' RETURNING item_id`,
      [b.item_ids, orgId]);
    if (mine.rowCount !== b.item_ids.length) throw new HttpError(409, "Some items are not in your stock or are already in a shipment");
    const sh = await c.query(
      "INSERT INTO shipments(from_org, to_org, status, created_by) VALUES ($1,$2,'created',$3) RETURNING shipment_id",
      [orgId, b.to_org, s.uid]);
    const shipmentId = sh.rows[0].shipment_id;
    await c.query("INSERT INTO shipment_items(shipment_id, item_id) SELECT $1, UNNEST($2::int[])", [shipmentId, b.item_ids]);
    return shipmentId;
  });
  return json({ shipment_id: id }, 201);
});
