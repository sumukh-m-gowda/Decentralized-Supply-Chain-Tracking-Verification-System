import { json, route } from "@/lib/api";

export const POST = route(async () => {
  const res = json({ ok: true });
  res.cookies.set("token", "", { path: "/", maxAge: 0 });
  return res;
});
