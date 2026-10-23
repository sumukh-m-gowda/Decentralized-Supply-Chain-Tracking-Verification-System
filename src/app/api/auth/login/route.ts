import bcrypt from "bcryptjs";
import { HttpError, json, route } from "@/lib/api";
import { COOKIE_OPTS } from "@/lib/auth";
import { one } from "@/lib/db";
import { signToken, type Role } from "@/lib/jwt";
import { loginSchema } from "@/lib/validators";

export const POST = route(async (req) => {
  const b = loginSchema.parse(await req.json());
  const u = await one<{ user_id: number; org_id: number | null; name: string; password_hash: string; role: Role }>(
    "SELECT user_id, org_id, name, password_hash, role FROM users WHERE email = $1", [b.email]);
  const ok = u ? await bcrypt.compare(b.password, u.password_hash) : false;
  if (!u || !ok) throw new HttpError(401, "Email or password is incorrect");
  const token = await signToken({ uid: u.user_id, role: u.role, orgId: u.org_id, name: u.name });
  const res = json({ role: u.role, name: u.name });
  res.cookies.set("token", token, COOKIE_OPTS);
  return res;
});
