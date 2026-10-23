"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Empty, ErrorMsg } from "@/components/Bits";
import { api, fmt, useApi } from "@/lib/client";

const STEPS = ["created", "in_transit", "delivered"];

export default function ShipmentDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useApi<any>(`/api/shipments/${id}`);
  const me = useApi<any>("/api/auth/me");
  const [err, setErr] = useState("");
  const [r, setR] = useState({ temperature: "", humidity: "", lat: "", lng: "" });

  async function act(what: "dispatch" | "receive") {
    setErr("");
    try { await api(`/api/shipments/${id}/${what}`, { method: "PATCH" }); reload(); } catch (e: any) { setErr(e.message); }
  }
  async function addReading(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    const n = (v: string) => (v === "" ? undefined : Number(v));
    try {
      await api(`/api/shipments/${id}/sensors`, { method: "POST", body: { temperature: Number(r.temperature), humidity: n(r.humidity), lat: n(r.lat), lng: n(r.lng) } });
      setR({ temperature: "", humidity: "", lat: "", lng: "" }); reload();
    } catch (e: any) { setErr(e.message); }
  }

  if (error) return <ErrorMsg msg={error} />;
  if (!data) return <p className="muted">Loading…</p>;
  const { shipment: s, items, readings, alerts } = data;
  const orgId = me.data?.orgId;
  const chart = readings.map((x: any) => ({ time: new Date(x.ts).toLocaleTimeString(), temperature: x.temperature }));

  return (
    <>
      <h1>Shipment #{s.shipment_id}</h1>
      <p>{s.from_name} to {s.to_name}</p>
      <div className="steps" aria-label="Progress">{STEPS.map((x, i) => <span key={x} className={i <= STEPS.indexOf(s.status) ? "on" : ""}>{x.replace("_", " ")}</span>)}</div>
      <ErrorMsg msg={err} />
      <div className="row noprint" style={{ marginBottom: "1rem" }}>
        {orgId === s.from_org && s.status === "created" && <button className="btn fit" onClick={() => act("dispatch")}>Dispatch and hand over custody</button>}
        {orgId === s.to_org && s.status === "in_transit" && <button className="btn fit" onClick={() => act("receive")}>Mark as received</button>}
      </div>

      {alerts.length > 0 && (
        <div className="card">
          <h2>Alerts</h2>
          {alerts.map((a: any) => <p key={a.alert_id}><Badge v={a.severity} /> {a.description} {a.resolved && <span className="muted">(resolved)</span>}</p>)}
        </div>
      )}

      <div className="card">
        <h2>Temperature</h2>
        {chart.length ? (
          <div style={{ height: 240 }}><ResponsiveContainer><LineChart data={chart}>
            <CartesianGrid stroke="#e3e8ee" /><XAxis dataKey="time" /><YAxis unit="°C" /><Tooltip />
            <Line type="monotone" dataKey="temperature" stroke="#0e6f68" strokeWidth={2} dot />
          </LineChart></ResponsiveContainer></div>
        ) : <Empty>No sensor readings yet.</Empty>}
        {s.status === "in_transit" && (
          <form onSubmit={addReading} style={{ marginTop: "1rem" }}>
            <div className="row">
              <div><label htmlFor="t">Temperature (°C)</label><input id="t" type="number" step="0.1" required value={r.temperature} onChange={(e) => setR({ ...r, temperature: e.target.value })} /></div>
              <div><label htmlFor="h">Humidity (%)</label><input id="h" type="number" step="0.1" value={r.humidity} onChange={(e) => setR({ ...r, humidity: e.target.value })} /></div>
              <div><label htmlFor="la">Latitude</label><input id="la" type="number" step="any" value={r.lat} onChange={(e) => setR({ ...r, lat: e.target.value })} /></div>
              <div><label htmlFor="lo">Longitude</label><input id="lo" type="number" step="any" value={r.lng} onChange={(e) => setR({ ...r, lng: e.target.value })} /></div>
              <button className="btn fit">Add reading</button>
            </div>
          </form>
        )}
      </div>

      <div className="card tablewrap">
        <h2>Items ({items.length})</h2>
        <table><thead><tr><th>Serial</th><th>Product</th><th>Status</th></tr></thead>
          <tbody>{items.map((i: any) => <tr key={i.serial_no}><td className="mono">{i.serial_no}</td><td>{i.product}</td><td><Badge v={i.status} /></td></tr>)}</tbody></table>
        <p className="muted">Created {fmt(s.created_at)} · dispatched {fmt(s.dispatched_at)} · delivered {fmt(s.delivered_at)}</p>
      </div>
    </>
  );
}
