//
"use client";
import { useState } from "react";
import { Badge, ErrorMsg } from "@/components/Bits";
import { api, fmt, useApi } from "@/lib/client";

export default function Admin() {
  const orgs = useApi<any[]>("/api/orgs");
  const stats = useApi<any>("/api/stats");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function decide(id: number, status: string) {
    try { await api(`/api/orgs/${id}/approve`, { method: "PATCH", body: { status } }); orgs.reload(); stats.reload(); }
    catch (e: any) { setError(e.message); }
  }
  async function sync() {
    setError(""); setMsg("");
    try { const r = await api("/api/sync/run", { method: "POST" }); setMsg(`Synced ${r.synced} event(s) to Neo4j, ${r.pending} still pending.${r.error ? " Last error: " + r.error : ""}`); }
    catch (e: any) { setError(e.message); }
  }
  const t = stats.data?.totals;

  return (
    <>
      <h1>Organizations</h1>
      {t && (
        <div className="stats">
          <div className="stat"><b>{t.pending_orgs}</b>awaiting approval</div>
          <div className="stat"><b>{t.items}</b>items tracked</div>
          <div className="stat"><b>{t.open_alerts}</b>open alerts</div>
          <div className="stat"><b>{t.scans}</b>public scans</div>
        </div>
      )}
      <ErrorMsg msg={error || orgs.error} />
      {msg && <div className="notice">{msg}</div>}
      <div className="card tablewrap">
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>License</th><th>Users</th><th>Registered</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {orgs.data?.map((o) => (
              <tr key={o.org_id}>
                <td>{o.name}</td><td>{o.type}</td><td className="mono">{o.license_no}</td><td>{o.users}</td><td>{fmt(o.created_at)}</td>
                <td><Badge v={o.status} /></td>
                <td>
                  {o.status !== "approved" && <button className="btn small" onClick={() => decide(o.org_id, "approved")}>Approve</button>}{" "}
                  {o.status === "pending" && <button className="btn small danger" onClick={() => decide(o.org_id, "rejected")}>Reject</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {orgs.data?.length === 0 && <p className="empty">No organizations have registered yet.</p>}
      </div>
      <div className="card">
        <h2>Graph sync</h2>
        <p className="muted">Custody events are queued in Postgres and copied to Neo4j. Push anything still pending.</p>
        <button className="btn ghost" onClick={sync}>Sync pending events</button>
      </div>
    </>
  );
}
