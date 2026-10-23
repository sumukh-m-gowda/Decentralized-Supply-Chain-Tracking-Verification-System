"use client";
import { useState } from "react";
import { Empty, ErrorMsg } from "@/components/Bits";
import { api, useApi } from "@/lib/client";

export default function Recall() {
  const batches = useApi<any[]>("/api/batches");
  const [batch, setBatch] = useState("");
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState("");

  async function run(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setRes(null);
    try { setRes(await api(`/api/graph/recall/${batch}`)); } catch (e: any) { setErr(e.message); }
  }
  return (
    <>
      <h1>Recall impact</h1>
      <p className="muted">Pick a faulty batch to see every organization that has handled its items, and where they are now.</p>
      <form className="card" onSubmit={run}>
        <div className="row">
          <div><label htmlFor="b">Batch</label>
            <select id="b" required value={batch} onChange={(e) => setBatch(e.target.value)}>
              <option value="">Choose a batch</option>
              {batches.data?.map((b) => <option key={b.batch_id} value={b.batch_id}>#{b.batch_id} · {b.product} · {b.manufacturer}</option>)}
            </select></div>
          <button className="btn fit" disabled={!batch}>Find affected organizations</button>
        </div>
      </form>
      <ErrorMsg msg={err || batches.error} />
      {res && (
        <div className="card tablewrap">
          <h2>{res.total_items} items in batch #{res.batch_id}</h2>
          {res.orgs.length ? (
            <table>
              <thead><tr><th>Organization</th><th>Type</th><th>Items handled</th><th>Holding now</th><th>Example serials</th></tr></thead>
              <tbody>{res.orgs.map((o: any) => (
                <tr key={o.org_id}><td>{o.name}</td><td>{o.type}</td><td>{o.items_handled}</td><td>{o.items_held_now}</td><td className="mono">{o.sample_serials.join(", ")}</td></tr>
              ))}</tbody>
            </table>
          ) : <Empty>No custody data for this batch in the graph yet. Sync from the admin page.</Empty>}
        </div>
      )}
    </>
  );
}
