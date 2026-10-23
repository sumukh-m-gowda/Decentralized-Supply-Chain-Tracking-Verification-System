import { HttpError, json, num, requireApprovedOrg, requireSession, route } from "@/lib/api";
import { one, query } from "@/lib/db";
import { sensorSchema } from "@/lib/validators";

// Alerting on out-of-range readings is done by a trigger in the database, not here.
export const POST = route(async (req, ctx) => {
  const s = await requireSession(["manufacturer", "distributor", "retailer"]);
  const orgId = await requireApprovedOrg(s);
  const id = num((await ctx.params).id);
  const b = sensorSchema.parse(await req.json());
  const sh = await one<{ from_org: number; to_org: number; status: string }>(
    "SELECT from_org, to_org, status FROM shipments WHERE shipment_id = $1", [id]);
  if (!sh) throw new HttpError(404, "Shipment not found");
  if (sh.from_org !== orgId && sh.to_org !== orgId) throw new HttpError(403, "Not your shipment");
  if (sh.status !== "in_transit") throw new HttpError(409, "Readings can only be added while the shipment is in transit");
  const row = await one(
    `INSERT INTO sensor_readings(shipment_id, ts, temperature, humidity, lat, lng)
     VALUES ($1, COALESCE($2::timestamptz, now()), $3, $4, $5, $6) RETURNING reading_id`,
    [id, b.ts ?? null, b.temperature, b.humidity ?? null, b.lat ?? null, b.lng ?? null]);
  return json(row, 201);
});

export const GET = route(async (req, ctx) => {
  await requireSession();
  const id = num((await ctx.params).id);
  return json(await query(
    "SELECT ts, temperature::float AS temperature, humidity::float AS humidity FROM sensor_readings WHERE shipment_id = $1 ORDER BY ts", [id]));
});
