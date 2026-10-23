import { HttpError, json, num, requireSession, route } from "@/lib/api";
import { one, query } from "@/lib/db";

export const GET = route(async (req, ctx) => {
  const s = await requireSession(["manufacturer", "admin"]);
  const id = num((await ctx.params).id);
  const b = await one<{ org_id: number }>(
    "SELECT p.org_id FROM batches b JOIN products p ON p.product_id = b.product_id WHERE b.batch_id = $1", [id]);
  if (!b) throw new HttpError(404, "Batch not found");
  if (s.role !== "admin" && b.org_id !== s.orgId) throw new HttpError(403, "Not your batch");
  return json(await query("SELECT item_id, serial_no, status FROM items WHERE batch_id = $1 ORDER BY item_id LIMIT 1000", [id]));
});
