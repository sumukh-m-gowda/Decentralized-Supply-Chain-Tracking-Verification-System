import { HttpError, json, num, requireSession, route } from "@/lib/api";
import { one } from "@/lib/db";

export const PATCH = route(async (req, ctx) => {
  await requireSession(["admin"]);
  const id = num((await ctx.params).id);
  const row = await one("UPDATE alerts SET resolved = true WHERE alert_id = $1 RETURNING alert_id", [id]);
  if (!row) throw new HttpError(404, "Alert not found");
  return json(row);
});
