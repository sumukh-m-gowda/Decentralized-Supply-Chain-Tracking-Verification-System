import { cookies } from "next/headers";
import { verifyToken, type Session } from "./jwt";

export const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 8,
};

export async function getSession(): Promise<Session | null> {
  const t = (await cookies()).get("token")?.value;
  return t ? verifyToken(t) : null;
}
