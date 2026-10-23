import { HttpError, json, num, requireSession, route } from "@/lib/api";
import { one } from "@/lib/db";
import { approveSchema } from "@/lib/validators";

export const PATCH = route(async (req, ctx) => {
  await requireSession(["admin"]);
  const id = num((await ctx.params).id);
  const { status } = approveSchema.parse(await req.json());
  const row = await one("UPDATE organizations SET status = $1 WHERE org_id = $2 RETURNING org_id, status", [status, id]);
  if (!row) throw new HttpError(404, "Organization not found");
  return json(row);
});
