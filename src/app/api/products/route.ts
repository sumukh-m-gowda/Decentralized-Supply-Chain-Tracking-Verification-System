import { json, requireApprovedOrg, requireSession, route } from "@/lib/api";
import { one, query } from "@/lib/db";
import { productSchema } from "@/lib/validators";

export const GET = route(async () => {
  const s = await requireSession(["manufacturer"]);
  return json(await query(
    "SELECT product_id, name, category, sku FROM products WHERE org_id = $1 ORDER BY product_id DESC", [s.orgId]));
});

export const POST = route(async (req) => {
  const s = await requireSession(["manufacturer"]);
  const orgId = await requireApprovedOrg(s);
  const b = productSchema.parse(await req.json());
  const row = await one(
    "INSERT INTO products(org_id, name, category, sku) VALUES ($1,$2,$3,$4) RETURNING product_id, name, category, sku",
    [orgId, b.name, b.category, b.sku]);
  return json(row, 201);
});
