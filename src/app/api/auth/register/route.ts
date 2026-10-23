import bcrypt from "bcryptjs";
import { json, route } from "@/lib/api";
import { tx } from "@/lib/db";
import { registerSchema } from "@/lib/validators";

export const POST = route(async (req) => {
  const b = registerSchema.parse(await req.json());
  const hash = await bcrypt.hash(b.password, 10);
  const userId = await tx(async (c) => {
    let orgId: number | null = null;
    if (b.role !== "auditor") {
      const o = await c.query(
        "INSERT INTO organizations(name, type, license_no, status) VALUES ($1,$2,$3,'pending') RETURNING org_id",
        [b.orgName, b.role, b.licenseNo]);
      orgId = o.rows[0].org_id;
    }
    const u = await c.query(
      "INSERT INTO users(org_id, name, email, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING user_id",
      [orgId, b.name, b.email, hash, b.role]);
    return u.rows[0].user_id;
  });
  return json({ ok: true, user_id: userId }, 201);
});
