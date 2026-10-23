import { json, requireSession, route } from "@/lib/api";
import { one } from "@/lib/db";

export const GET = route(async () => {
  const s = await requireSession();
  const org = s.orgId == null ? null
    : await one("SELECT org_id, name, type, status FROM organizations WHERE org_id = $1", [s.orgId]);
  return json({ ...s, org, orgStatus: org?.status ?? null });
});
