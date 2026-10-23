"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ErrorMsg } from "@/components/Bits";
import { api } from "@/lib/client";
import { homeFor } from "@/lib/roles";

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const r = await api("/api/auth/login", { method: "POST", body: { email, password } });
      router.push(next || homeFor(r.role)); router.refresh();
    } catch (e: any) { setError(e.message); setBusy(false); }
  }

  return (
    <div className="card narrow">
      <h1>Sign in</h1>
      <form onSubmit={submit}>
        <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label htmlFor="pw">Password</label><input id="pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <ErrorMsg msg={error} />
        <button className="btn" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="muted" style={{ marginTop: "1rem" }}>New here? <Link href="/register">Create an account</Link></p>
    </div>
  );
}

export default function Login() { return <Suspense><LoginForm /></Suspense>; }
