import { json, route } from "@/lib/api";
import { verifySerial } from "@/lib/verify";

// Public: no sign-in needed. City comes from ?city= (demo) or the hosting provider's geo header.
export const GET = route(async (req, ctx) => {
  const serial = decodeURIComponent((await ctx.params).serial).trim();
  const city = (req.nextUrl.searchParams.get("city") || req.headers.get("x-vercel-ip-city") || "unknown").slice(0, 60);
  return json(await verifySerial(serial, city));
});
