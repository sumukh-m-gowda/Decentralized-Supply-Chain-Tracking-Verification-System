import { json, requireSession, route } from "@/lib/api";
import { one, query } from "@/lib/db";
import { reportSchema } from "@/lib/validators";

export const GET = route(async () => {
  await requireSession(["admin", "auditor"]);
  return json(await query(
    `SELECT a.alert_id, a.type, a.severity, a.description, a.resolved, a.created_at, a.shipment_id, i.serial_no
     FROM alerts a LEFT JOIN items i ON i.item_id = a.item_id
     ORDER BY a.resolved, a.created_at DESC LIMIT 200`));
});

// Any signed-in user can report a suspected counterfeit.
export const POST = route(async (req) => {
  await requireSession();
  const b = reportSchema.parse(await req.json());
  const item = b.serial_no ? await one<{ item_id: number }>("SELECT item_id FROM items WHERE serial_no = $1", [b.serial_no]) : null;
  const row = await one(
    "INSERT INTO alerts(item_id, type, severity, description, resolved) VALUES ($1,'counterfeit_report','high',$2,false) RETURNING alert_id",
    [item?.item_id ?? null, b.description]);
  return json(row, 201);
});
