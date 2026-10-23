import { HttpError, json, num, requireApprovedOrg, requireSession, route } from "@/lib/api";
import { tx } from "@/lib/db";

export const PATCH = route(async (req, ctx) => {
  const s = await requireSession(["manufacturer", "distributor", "retailer"]);
  const orgId = await requireApprovedOrg(s);
  const id = num((await ctx.params).id);
  await tx(async (c) => {
    const r = await c.query(
      "UPDATE shipments SET status = 'delivered', delivered_at = now() WHERE shipment_id = $1 AND to_org = $2 AND status = 'in_transit'",
      [id, orgId]);
    if (!r.rowCount) throw new HttpError(409, "This shipment is not in transit to your organization");
    await c.query(
      "UPDATE items SET status = 'in_stock' WHERE item_id IN (SELECT item_id FROM shipment_items WHERE shipment_id = $1)", [id]);
  });
  return json({ ok: true });
});
