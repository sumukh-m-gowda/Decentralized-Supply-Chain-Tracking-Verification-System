"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Session } from "@/lib/jwt";
import { NAV } from "@/lib/roles";
import { api } from "@/lib/client";

export default function Nav({ session }: { session: Session | null }) {
  const path = usePathname();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!session?.orgId) return;
    api("/api/auth/me").then((m) => setPending(m.orgStatus !== "approved")).catch(() => {});
  }, [session]);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/"); router.refresh();
  }

  return (
    <>
      <header className="top">
        <Link href="/" className="brand">TraceLedger</Link>
        <nav aria-label="Main">
          {session && NAV[session.role].map((l) => (
            <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? "page" : undefined}>{l.label}</Link>
          ))}
        </nav>
        <div className="who">
          {session ? (<><span>{session.name} ({session.role})</span><button className="btn ghost small" style={{ color: "#fff", borderColor: "#fff" }} onClick={logout}>Sign out</button></>)
            : (<><Link href="/login">Sign in</Link><Link href="/register">Register</Link></>)}
        </div>
      </header>
      {pending && <div className="banner">Your organization is waiting for admin approval. You can sign in, but you cannot create or ship anything yet.</div>}
    </>
  );
}
