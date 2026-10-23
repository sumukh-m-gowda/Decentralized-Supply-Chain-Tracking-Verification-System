"use client";
import { useEffect, useState } from "react";
import { Badge, ErrorMsg } from "@/components/Bits";
import { api, useApi } from "@/lib/client";

export default function Inventory() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const me = useApi<any>("/api/auth/me");
  const { data, error, reload } = useApi<any[]>(`/api/items?q=${encodeURIComponent(query)}`);
  const [err, setErr] = useState("");
  useEffect(() => { const t = setTimeout(() => setQuery(q), 300); return () => clearTimeout(t); }, [q]);

  async function sell(id: number) {
    try { await api("/api/items/sell", { method: "POST", body: { item_ids: [id] } }); reload(); } catch (e: any) { setErr(e.message); }
  }
  return (
    <>
      <h1>Inventory</h1>
      <p className="muted">Items your organization holds right now.</p>
      <div className="field" style={{ maxWidth: 420 }}><label htmlFor="q">Search by serial number or product name</label><input id="q" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <ErrorMsg msg={err || error} />
      <div className="card tablewrap">
        <table>
          <thead><tr><th>Serial</th><th>Product</th><th>Batch</th><th>Expires</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {data?.map((i) => (
              <tr key={i.item_id}>
                <td className="mono">{i.serial_no}</td><td>{i.product}</td><td>#{i.batch_id}</td><td>{i.expiry_date}</td><td><Badge v={i.status} /></td>
                <td>{me.data?.role === "retailer" && i.status === "in_stock" && <button className="btn small ghost" onClick={() => sell(i.item_id)}>Mark sold</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.length === 0 && <p className="empty">Nothing in stock{query ? " matches that search" : ""}.</p>}
      </div>
    </>
  );
}
