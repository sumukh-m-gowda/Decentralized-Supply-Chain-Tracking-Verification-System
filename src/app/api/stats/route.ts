import { json, requireSession, route } from "@/lib/api";
import { query } from "@/lib/db";

export const GET = route(async () => {
  await requireSession(["admin"]);
  const [totals, byStatus, routes, alertsByDay, delayed] = await Promise.all([
    query(`SELECT (SELECT COUNT(*)::int FROM organizations WHERE status = 'pending') AS pending_orgs,
                  (SELECT COUNT(*)::int FROM items) AS items,
                  (SELECT COUNT(*)::int FROM alerts WHERE resolved = false) AS open_alerts,
                  (SELECT COUNT(*)::int FROM verification_logs) AS scans`),
    query("SELECT status, COUNT(*)::int AS count FROM shipments GROUP BY status ORDER BY status"),
    // average transit time per route (JOIN + GROUP BY + aggregate)
    query(`SELECT fo.name || ' to ' || t.name AS route,
                  ROUND(AVG(EXTRACT(EPOCH FROM (s.delivered_at - s.dispatched_at)) / 3600)::numeric, 1)::float AS avg_hours,
                  COUNT(*)::int AS shipments
           FROM shipments s JOIN organizations fo ON fo.org_id = s.from_org JOIN organizations t ON t.org_id = s.to_org
           WHERE s.delivered_at IS NOT NULL GROUP BY fo.name, t.name ORDER BY avg_hours DESC LIMIT 10`),
    query(`SELECT to_char(created_at::date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
           FROM alerts GROUP BY 1 ORDER BY 1 DESC LIMIT 14`),
    // organizations with slow deliveries (GROUP BY + HAVING)
    query(`SELECT o.name, COUNT(*)::int AS delayed
           FROM shipments s JOIN organizations o ON o.org_id = s.from_org
           WHERE s.delivered_at - s.dispatched_at > interval '72 hours'
           GROUP BY o.name HAVING COUNT(*) >= 1 ORDER BY delayed DESC LIMIT 10`),
  ]);
  return json({ totals: totals[0], byStatus, routes, alertsByDay: alertsByDay.reverse(), delayed });
});
