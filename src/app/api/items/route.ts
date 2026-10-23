import { json, requireApprovedOrg, requireSession, route } from "@/lib/api";
import { query } from "@/lib/db";

// Items held by my organization. ?status= filters; ?q= searches serial or (full-text) product name.
export const GET = route(async (req) => {
  const s = await requireSession(["manufacturer", "distributor", "retailer"]);
  const orgId = await requireApprovedOrg(s);
  const status = req.nextUrl.searchParams.get("status");
  const q = req.nextUrl.searchParams.get("q")?.trim() || null;
  return json(await query(
    `SELECT i.item_id, i.serial_no, i.status, b.batch_id, b.expiry_date::text AS expiry_date, p.name AS product, p.sku
     FROM items i JOIN batches b ON b.batch_id = i.batch_id JOIN products p ON p.product_id = b.product_id
     WHERE i.current_owner_org = $1
       AND ($2::text IS NULL OR i.status = $2)
       AND ($3::text IS NULL OR i.serial_no ILIKE '%' || $3 || '%'
            OR to_tsvector('english', p.name) @@ plainto_tsquery('english', $3))
     ORDER BY i.item_id DESC LIMIT 500`,
    [orgId, status, q]));
});
