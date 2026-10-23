import { NextResponse, type NextRequest } from "next/server";
import { verifyToken, type Role } from "@/lib/jwt";
import { homeFor } from "@/lib/roles";

const ORG: Role[] = ["manufacturer", "distributor", "retailer"];
const PAGE_ROLES: Record<string, Role[]> = {
  "/admin": ["admin"],
  "/manufacturer": ["manufacturer"],
  "/shipments": ORG,
  "/inventory": ORG,
  "/network": ["admin", "manufacturer"],
  "/recall": ["admin", "manufacturer"],
  "/analytics": ["admin"],
  "/alerts": ["admin", "auditor"],
};
const PUBLIC_API = ["/api/auth/login", "/api/auth/register", "/api/verify/"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("token")?.value;
  const session = token ? await verifyToken(token) : null;

  if (pathname.startsWith("/api/")) {
    if (PUBLIC_API.some((p) => pathname.startsWith(p)) || session) return NextResponse.next();
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const rule = Object.keys(PAGE_ROLES).find((p) => pathname === p || pathname.startsWith(p + "/"));
  if (rule) {
    if (!session) {
      const url = new URL("/login", req.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    if (!PAGE_ROLES[rule].includes(session.role)) return NextResponse.redirect(new URL(homeFor(session.role), req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
