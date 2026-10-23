import { json, requireSession, route } from "@/lib/api";
import { query } from "@/lib/db";

// Admin: full list. Everyone else (or ?directory=1): approved orgs they can ship to.
export const GET = route(async (req) => {
  const s = await requireSession();
  const directory = req.nextUrl.searchParams.get("directory") === "1";
  if (s.role === "admin" && !directory) {
    return json(await query(
      `SELECT o.org_id, o.name, o.type, o.license_no, o.status, o.created_at,
              (SELECT COUNT(*)::int FROM users u WHERE u.org_id = o.org_id) AS users
       FROM organizations o ORDER BY (o.status = 'pending') DESC, o.created_at DESC`));
  }
  return json(await query(
    "SELECT org_id, name, type FROM organizations WHERE status = 'approved' AND org_id IS DISTINCT FROM $1 ORDER BY name",
    [s.orgId]));
});
