import { HttpError, json, requireApprovedOrg, requireSession, route } from "@/lib/api";
import { tx } from "@/lib/db";
import { sellSchema } from "@/lib/validators";

export const POST = route(async (req) => {
  const s = await requireSession(["retailer"]);
  const orgId = await requireApprovedOrg(s);
  const b = sellSchema.parse(await req.json());

  if (new Set(b.item_ids).size !== b.item_ids.length) {
    throw new HttpError(400, "Duplicate item IDs are not allowed");
  }

  const sold = await tx(async (client) => {
    const result = await client.query(
      `UPDATE items SET status = 'sold'
       WHERE item_id = ANY($1::int[]) AND current_owner_org = $2 AND status = 'in_stock'
       RETURNING item_id`,
      [b.item_ids, orgId]
    );
    if (result.rows.length !== b.item_ids.length) {
      throw new HttpError(409, "Some items are not in your stock");
    }
    return result.rows.length;
  });

  return json({ sold });
});
