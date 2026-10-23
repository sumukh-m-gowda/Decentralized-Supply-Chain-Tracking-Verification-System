"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorMsg } from "@/components/Bits";
import { api } from "@/lib/client";

export default function Register() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", email: "", password: "", role: "manufacturer", orgName: "", licenseNo: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });
  const needsOrg = f.role !== "auditor";

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      await api("/api/auth/register", { method: "POST", body: { ...f, orgName: needsOrg ? f.orgName : undefined, licenseNo: needsOrg ? f.licenseNo : undefined } });
      router.push("/login");
    } catch (e: any) { setError(e.message); setBusy(false); }
  }

  return (
    <div className="card narrow">
      <h1>Create an account</h1>
      <form onSubmit={submit}>
        <div className="field"><label htmlFor="role">I am a</label>
          <select id="role" value={f.role} onChange={set("role")}>
            <option value="manufacturer">Manufacturer</option><option value="distributor">Distributor</option>
            <option value="retailer">Retailer</option><option value="auditor">Auditor</option>
          </select></div>
        <div className="field"><label htmlFor="n">Your name</label><input id="n" required value={f.name} onChange={set("name")} /></div>
        <div className="field"><label htmlFor="e">Email</label><input id="e" type="email" required value={f.email} onChange={set("email")} /></div>
        <div className="field"><label htmlFor="p">Password (8+ characters)</label><input id="p" type="password" minLength={8} required value={f.password} onChange={set("password")} /></div>
        {needsOrg && <>
          <div className="field"><label htmlFor="o">Organization name</label><input id="o" required value={f.orgName} onChange={set("orgName")} /></div>
          <div className="field"><label htmlFor="l">License number</label><input id="l" required value={f.licenseNo} onChange={set("licenseNo")} /></div>
          <p className="muted">An admin must approve your organization before you can create or ship items.</p>
        </>}
        <ErrorMsg msg={error} />
        <button className="btn" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
      </form>
      <p className="muted" style={{ marginTop: "1rem" }}>Already registered? <Link href="/login">Sign in</Link></p>
    </div>
  );
}
