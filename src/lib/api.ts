import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getSession } from "./auth";
import type { Role, Session } from "./jwt";
import { one } from "./db";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

export async function requireSession(roles?: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, "Not signed in");
  if (roles && !roles.includes(s.role)) throw new HttpError(403, "Your role cannot do this");
  return s;
}

/** Returns the caller's org id, only if the org has been approved by an admin. */
export async function requireApprovedOrg(s: Session): Promise<number> {
  if (s.orgId == null) throw new HttpError(403, "Your account has no organization");
  const o = await one<{ status: string }>("SELECT status FROM organizations WHERE org_id = $1", [s.orgId]);
  if (o?.status !== "approved") throw new HttpError(403, "Your organization is waiting for admin approval");
  return s.orgId;
}

export const num = (v: string, what = "id") => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `Invalid ${what}`);
  return n;
};

function toError(e: any) {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  if (e instanceof ZodError) return json({ error: e.issues.map((i) => i.message).join("; ") }, 400);
  switch (e?.code) {
    case "23505": return json({ error: "That already exists" }, 409);
    case "23503": return json({ error: "A referenced record does not exist" }, 409);
    case "23514": case "23502": case "22P02": case "22007": case "22008":
      return json({ error: "Rejected by a database rule: " + (e.detail || e.message) }, 400);
    case "P0001": return json({ error: e.message }, 400); // RAISE EXCEPTION from a trigger/function
    case "42P01": case "42883": case "42703":
      return json({ error: "Database objects are missing. Run the scripts in db/postgres first. (" + e.message + ")" }, 500);
  }
  console.error(e);
  return json({ error: e?.message || "Something went wrong" }, 500);
}

/** Wraps a route handler so thrown errors become clean JSON responses. */
export function route(fn: (req: NextRequest, ctx: any) => Promise<Response>) {
  return async (req: NextRequest, ctx: any) => {
    try { return await fn(req, ctx); } catch (e) { return toError(e); }
  };
}
