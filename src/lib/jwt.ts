import { SignJWT, jwtVerify } from "jose";

export type Role = "admin" | "manufacturer" | "distributor" | "retailer" | "auditor";
export interface Session { uid: number; role: Role; orgId: number | null; name: string }

function key() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error("JWT_SECRET must be set (16+ characters) in .env.local");
  return new TextEncoder().encode(s);
}

export async function signToken(s: Session) {
  return new SignJWT({ ...s }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("8h").sign(key());
}

export async function verifyToken(t: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(t, key());
    return {
      uid: Number(payload.uid),
      role: payload.role as Role,
      orgId: payload.orgId == null ? null : Number(payload.orgId),
      name: String(payload.name),
    };
  } catch {
    return null;
  }
}
