import { HttpError, json, requireApprovedOrg, requireSession, route } from "@/lib/api";
import { one, query } from "@/lib/db";
import { syncOutbox } from "@/lib/sync";
import { batchSchema } from "@/lib/validators";

export const GET = route(async () => {
  const s = await requireSession(["manufacturer", "admin"]);
  return json(await query(
    `SELECT b.batch_id, b.product_id, p.name AS product, o.name AS manufacturer,
            b.manufacture_date::text AS manufacture_date, b.expiry_date::text AS expiry_date, b.quantity
     FROM batches b JOIN products p ON p.product_id = b.product_id JOIN organizations o ON o.org_id = p.org_id
     WHERE ($1::int IS NULL OR p.org_id = $1) ORDER BY b.batch_id DESC`,
    [s.role === "admin" ? null : s.orgId]));
});

// Creating a batch also creates its items and their genesis custody events — inside the database (create_batch).
export const POST = route(async (req) => {
  const s = await requireSession(["manufacturer"]);
  const orgId = await requireApprovedOrg(s);
  const b = batchSchema.parse(await req.json());
  const p = await one("SELECT 1 FROM products WHERE product_id = $1 AND org_id = $2", [b.product_id, orgId]);
  if (!p) throw new HttpError(404, "Product not found in your catalog");
  const r = await one<{ batch_id: number }>(
    "SELECT create_batch($1, $2::date, $3::date, $4) AS batch_id",
    [b.product_id, b.manufacture_date, b.expiry_date, b.quantity]);
  syncOutbox().catch(() => {}); // best effort; pending rows can be re-synced later
  return json({ batch_id: r!.batch_id }, 201);
});
