"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, ErrorMsg } from "@/components/Bits";
import { api, fmt, useApi } from "@/lib/client";

export default function Shipments() {
  const list = useApi<any[]>("/api/shipments");
  const orgs = useApi<any[]>("/api/orgs?directory=1");
  const stock = useApi<any[]>("/api/items?status=in_stock");
  const [to, setTo] = useState("");
  const [sel, setSel] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);

  const toggle = (id: number) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setError("");
    try {
      await api("/api/shipments", { method: "POST", body: { to_org: Number(to), item_ids: sel } });
      setSel([]); setTo(""); setShow(false); list.reload(); stock.reload();
    } catch (e: any) { setError(e.message); }
  }

  return (
    <>
      <div className="row" style={{ alignItems: "center" }}>
        <h1>Shipments</h1>
        <button className="btn fit" onClick={() => setShow(!show)}>{show ? "Cancel" : "New shipment"}</button>
      </div>
      <ErrorMsg msg={list.error} />
      {show && (
        <form className="card" onSubmit={create}>
          <h2>New shipment</h2>
          <div className="field" style={{ maxWidth: 360 }}><label htmlFor="to">Send to</label>
            <select id="to" required value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">Choose an organization</option>
              {orgs.data?.map((o) => <option key={o.org_id} value={o.org_id}>{o.name} ({o.type})</option>)}
            </select></div>
          <label>Items to include ({sel.length} selected)</label>
          <div className="tablewrap" style={{ maxHeight: 260, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 6 }}>
            <table><tbody>
              {stock.data?.map((i) => (
                <tr key={i.item_id}><td style={{ width: 36 }}><input type="checkbox" aria-label={`Select ${i.serial_no}`} checked={sel.includes(i.item_id)} onChange={() => toggle(i.item_id)} /></td>
                  <td className="mono">{i.serial_no}</td><td>{i.product}</td></tr>
              ))}
            </tbody></table>
            {stock.data?.length === 0 && <p className="empty">You have no items in stock to ship.</p>}
          </div>
          <ErrorMsg msg={error} />
          <p><button className="btn" disabled={!to || sel.length === 0}>Create shipment</button></p>
        </form>
      )}
      <div className="card tablewrap">
        <table>
          <thead><tr><th>#</th><th>From</th><th>To</th><th>Items</th><th>Status</th><th>Dispatched</th><th></th></tr></thead>
          <tbody>
            {list.data?.map((s) => (
              <tr key={s.shipment_id}>
                <td>{s.shipment_id}</td><td>{s.from_name}</td><td>{s.to_name}</td><td>{s.item_count}</td>
                <td><Badge v={s.status} /></td><td>{fmt(s.dispatched_at)}</td>
                <td><Link href={`/shipments/${s.shipment_id}`}>Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data?.length === 0 && <p className="empty">No shipments yet.</p>}
      </div>
    </>
  );
}
