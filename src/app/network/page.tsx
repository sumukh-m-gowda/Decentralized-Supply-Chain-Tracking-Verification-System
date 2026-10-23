"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Empty, ErrorMsg } from "@/components/Bits";
import { api, fmt, useApi } from "@/lib/client";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });
const COLOR: Record<string, string> = { manufacturer: "#0e6f68", distributor: "#c58a12", retailer: "#b3261e" };

export default function Network() {
  const graph = useApi<any>("/api/graph/network");
  const odd = useApi<any[]>("/api/graph/anomalies");
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  const [serial, setSerial] = useState("");
  const [path, setPath] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { if (box.current) setW(box.current.clientWidth); }, [graph.data]);

  async function lookup(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    try { setPath(await api(`/api/graph/route/${encodeURIComponent(serial.trim())}`)); } catch (e: any) { setErr(e.message); }
  }

  return (
    <>
      <h1>Supply network</h1>
      <p className="muted">Built from Neo4j. Lines show shipments between organizations.</p>
      <ErrorMsg msg={graph.error} />
      <div className="legend">{Object.entries(COLOR).map(([k, c]) => <span key={k}><span className="dot" style={{ background: c }} />{k}</span>)}</div>
      <div className="graphbox" ref={box}>
        {graph.data?.nodes.length ? (
          <ForceGraph2D width={w} height={420} graphData={graph.data} nodeLabel="name" linkDirectionalArrowLength={6} linkDirectionalArrowRelPos={1}
            nodeColor={(n: any) => COLOR[n.type] || "#5b6778"} linkLabel={(l: any) => `${l.shipments} shipment(s)`} nodeRelSize={7} />
        ) : <Empty>No shipments in the graph yet. Dispatch a shipment, then sync from the admin page.</Empty>}
      </div>

      <div className="cols" style={{ marginTop: "1.25rem" }}>
        <form className="card" onSubmit={lookup}>
          <h2>Trace one item</h2>
          <div className="row"><div><label htmlFor="s">Serial number</label><input id="s" required value={serial} onChange={(e) => setSerial(e.target.value)} /></div><button className="btn fit">Trace</button></div>
          <ErrorMsg msg={err} />
          {path && (path.length ? <ol>{path.map((p) => <li key={p.event_id}><b>{p.name}</b> <span className="muted">({p.type}) from {fmt(p.from_time)}{p.to_time ? ` to ${fmt(p.to_time)}` : ", holds it now"}</span></li>)}</ol> : <p className="muted">That serial is not in the graph.</p>)}
        </form>
        <div className="card">
          <h2>Items that returned to an earlier holder</h2>
          <p className="muted">A possible sign of diversion or counterfeits re-entering the chain.</p>
          {odd.data?.length ? <ul>{odd.data.map((o, i) => <li key={i}><span className="mono">{o.serial}</span> came back to {o.org}</li>)}</ul> : <p>None found.</p>}
        </div>
      </div>
    </>
  );
}
