"use client";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge, ErrorMsg, Hash } from "@/components/Bits";
import { api, fmt } from "@/lib/client";

const TITLE: Record<string, string> = { authentic: "Authentic", suspicious: "Needs a closer look", tampered: "Record tampered", unknown: "Not recognised" };

export default function Verify() {
  const { serial } = useParams<{ serial: string }>();
  const serialStr = decodeURIComponent(serial);
  const [r, setR] = useState<any>(null);
  const [error, setError] = useState("");
  const [city, setCity] = useState("");
  const [report, setReport] = useState("");
  const [reportMsg, setReportMsg] = useState("");

  const scan = useCallback(async (c?: string) => {
    try {
      setR(await api(`/api/verify/${encodeURIComponent(serialStr)}${c ? `?city=${encodeURIComponent(c)}` : ""}`));
      setError("");
    } catch (e: any) { setError(e.message); }
  }, [serialStr]);
  useEffect(() => { scan(); }, [scan]);

  async function sendReport(e: React.FormEvent) {
    e.preventDefault(); setReportMsg("");
    try { await api("/api/alerts", { method: "POST", body: { serial_no: serialStr, description: report } }); setReportMsg("Thanks. Your report was sent to the admins."); setReport(""); }
    catch (e: any) { setReportMsg(e.message === "Not signed in" ? "Sign in to send a report." : e.message); }
  }

  if (error) return <ErrorMsg msg={error} />;
  if (!r) return <p className="muted">Checking the ledger…</p>;
  const brokenId = r.chain && !r.chain.is_valid ? r.chain.broken_event_id : null;

  return (
    <>
      <div className={`verdict ${r.verdict}`} role="status">
        <p className="mono" style={{ margin: 0 }}>{serialStr}</p>
        <h1>{TITLE[r.verdict]}</h1>
        <ul>{r.reasons.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
      </div>

      {r.item && (
        <div className="card">
          <h2>Product</h2>
          <dl className="facts">
            <div><dt>Name</dt><dd>{r.item.product}</dd></div>
            <div><dt>Category</dt><dd>{r.item.category}</dd></div>
            <div><dt>Made by</dt><dd>{r.item.manufacturer}</dd></div>
            <div><dt>Batch</dt><dd>#{r.item.batch_id}</dd></div>
            <div><dt>Manufactured</dt><dd>{r.item.manufacture_date}</dd></div>
            <div><dt>Expires</dt><dd>{r.item.expiry_date}</dd></div>
            <div><dt>Held by now</dt><dd>{r.item.current_owner}</dd></div>
            <div><dt>Status</dt><dd><Badge v={r.item.status} /></dd></div>
          </dl>
        </div>
      )}

      {r.events && (
        <div className="card">
          <h2>Custody chain</h2>
          <p className="muted">Each block stores the fingerprint of the block before it. Changing any past record breaks every link after it.</p>
          <ol className="chain">
            {r.events.map((e: any) => (
              <li key={e.event_id} className={brokenId === e.event_id ? "broken" : ""}>
                <span className="who2">{e.event_type === "genesis" ? `Created by ${e.to_name}` : `${e.from_name} handed over to ${e.to_name}`}</span>
                <span className="muted"> · {fmt(e.event_time)}</span>
                <div className="hashes mono"><span>previous</span><Hash h={e.prev_hash} /><span>this block</span><Hash h={e.curr_hash} /></div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="cols">
        <div className="card noprint">
          <h2>Simulate a scan from another city</h2>
          <p className="muted">Scanning one serial from three different cities in a day raises a counterfeit alert.</p>
          <div className="row">
            <div><label htmlFor="city">City</label><input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Mumbai" /></div>
            <button className="btn fit" disabled={!city.trim()} onClick={() => scan(city.trim())}>Scan again</button>
          </div>
        </div>
        <div className="card noprint">
          <h2>Report this item</h2>
          <form onSubmit={sendReport}>
            <div className="field"><label htmlFor="rep">What looks wrong?</label><textarea id="rep" rows={3} minLength={5} required value={report} onChange={(e) => setReport(e.target.value)} /></div>
            {reportMsg && <p className="muted">{reportMsg}</p>}
            <button className="btn ghost">Send report</button>
          </form>
        </div>
      </div>
    </>
  );
}
