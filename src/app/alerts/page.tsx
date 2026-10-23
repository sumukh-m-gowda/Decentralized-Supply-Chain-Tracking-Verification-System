"use client";
import { useState } from "react";
import { Badge, ErrorMsg } from "@/components/Bits";
import { api, fmt, useApi } from "@/lib/client";

export default function Alerts() {
  const { data, error, reload } = useApi<any[]>("/api/alerts");
  const me = useApi<any>("/api/auth/me");
  const [err, setErr] = useState("");
  async function resolve(id: number) {
    try { await api(`/api/alerts/${id}`, { method: "PATCH" }); reload(); } catch (e: any) { setErr(e.message); }
  }
  return (
    <>
      <h1>Alerts</h1>
      <p className="muted">Temperature breaches, suspected counterfeits and reports from the public.</p>
      <ErrorMsg msg={err || error} />
      <div className="card tablewrap">
        <table>
          <thead><tr><th>When</th><th>Type</th><th>Severity</th><th>Details</th><th>Item</th><th></th></tr></thead>
          <tbody>
            {data?.map((a) => (
              <tr key={a.alert_id}>
                <td>{fmt(a.created_at)}</td><td>{a.type.replace(/_/g, " ")}</td><td><Badge v={a.severity} /></td><td>{a.description}</td>
                <td className="mono">{a.serial_no ?? (a.shipment_id ? `shipment #${a.shipment_id}` : "")}</td>
                <td>{a.resolved ? <span className="muted">Resolved</span> : me.data?.role === "admin" && <button className="btn small ghost" onClick={() => resolve(a.alert_id)}>Resolve</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.length === 0 && <p className="empty">No alerts. Everything looks fine.</p>}
      </div>
    </>
  );
}
