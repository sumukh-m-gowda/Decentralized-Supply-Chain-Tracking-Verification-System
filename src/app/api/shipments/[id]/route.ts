import { HttpError, json, num, requireSession, route } from "@/lib/api";
import { one, query } from "@/lib/db";

export const GET = route(async (req, ctx) => {
  const s = await requireSession(["manufacturer", "distributor", "retailer", "admin"]);
  const id = num((await ctx.params).id);
  const sh = await one(
    `SELECT s.shipment_id, s.status, s.from_org, s.to_org, fo.name AS from_name, t.name AS to_name,
            s.created_at, s.dispatched_at, s.delivered_at
     FROM shipments s JOIN organizations fo ON fo.org_id = s.from_org JOIN organizations t ON t.org_id = s.to_org
     WHERE s.shipment_id = $1`, [id]);
  if (!sh) throw new HttpError(404, "Shipment not found");
  if (s.role !== "admin" && s.orgId !== sh.from_org && s.orgId !== sh.to_org) throw new HttpError(403, "Not your shipment");
  const [items, readings, alerts] = await Promise.all([
    query(`SELECT i.serial_no, p.name AS product, i.status
           FROM shipment_items si JOIN items i ON i.item_id = si.item_id
           JOIN batches b ON b.batch_id = i.batch_id JOIN products p ON p.product_id = b.product_id
           WHERE si.shipment_id = $1 ORDER BY i.item_id`, [id]),
    query(`SELECT ts, temperature::float AS temperature, humidity::float AS humidity, lat::float AS lat, lng::float AS lng
           FROM sensor_readings WHERE shipment_id = $1 ORDER BY ts`, [id]),
    query(`SELECT alert_id, type, severity, description, resolved, created_at
           FROM alerts WHERE shipment_id = $1 ORDER BY created_at DESC`, [id]),
  ]);
  return json({ shipment: sh, items, readings, alerts });
});
