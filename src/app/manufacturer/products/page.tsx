"use client";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { ErrorMsg } from "@/components/Bits";
import { api, useApi } from "@/lib/client";

export default function Products() {
  const products = useApi<any[]>("/api/products");
  const batches = useApi<any[]>("/api/batches");
  const [p, setP] = useState({ name: "", category: "", sku: "" });
  const [b, setB] = useState({ product_id: "", manufacture_date: "", expiry_date: "", quantity: "50" });
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [items, setItems] = useState<any[]>([]);

  async function addProduct(e: React.FormEvent) {
    e.preventDefault(); setError(""); setOk("");
    try { await api("/api/products", { method: "POST", body: p }); setP({ name: "", category: "", sku: "" }); products.reload(); }
    catch (e: any) { setError(e.message); }
  }
  async function addBatch(e: React.FormEvent) {
    e.preventDefault(); setError(""); setOk("");
    try {
      const r = await api("/api/batches", { method: "POST", body: { ...b, product_id: Number(b.product_id), quantity: Number(b.quantity) } });
      setOk(`Batch #${r.batch_id} created with its items.`); batches.reload();
    } catch (e: any) { setError(e.message); }
  }
  async function showQr(id: number) {
    if (open === id) return setOpen(null);
    try { setItems(await api(`/api/batches/${id}/items`)); setOpen(id); } catch (e: any) { setError(e.message); }
  }

  return (
    <>
      <h1>Products and batches</h1>
      <ErrorMsg msg={error} />
      {ok && <div className="notice">{ok}</div>}
      <div className="cols noprint">
        <form className="card" onSubmit={addProduct}>
          <h2>New product</h2>
          <div className="field"><label htmlFor="pn">Name</label><input id="pn" required value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></div>
          <div className="row">
            <div className="field"><label htmlFor="pc">Category</label><input id="pc" required value={p.category} onChange={(e) => setP({ ...p, category: e.target.value })} /></div>
            <div className="field"><label htmlFor="ps">SKU</label><input id="ps" required value={p.sku} onChange={(e) => setP({ ...p, sku: e.target.value })} /></div>
          </div>
          <button className="btn">Add product</button>
        </form>
        <form className="card" onSubmit={addBatch}>
          <h2>New batch</h2>
          <div className="field"><label htmlFor="bp">Product</label>
            <select id="bp" required value={b.product_id} onChange={(e) => setB({ ...b, product_id: e.target.value })}>
              <option value="">Choose a product</option>
              {products.data?.map((x) => <option key={x.product_id} value={x.product_id}>{x.name} ({x.sku})</option>)}
            </select></div>
          <div className="row">
            <div className="field"><label htmlFor="bm">Manufactured</label><input id="bm" type="date" required value={b.manufacture_date} onChange={(e) => setB({ ...b, manufacture_date: e.target.value })} /></div>
            <div className="field"><label htmlFor="be">Expires</label><input id="be" type="date" required value={b.expiry_date} onChange={(e) => setB({ ...b, expiry_date: e.target.value })} /></div>
            <div className="field"><label htmlFor="bq">Items (1–1000)</label><input id="bq" type="number" min={1} max={1000} required value={b.quantity} onChange={(e) => setB({ ...b, quantity: e.target.value })} /></div>
          </div>
          <button className="btn">Create batch</button>
        </form>
      </div>

      <div className="card tablewrap">
        <h2>Batches</h2>
        <table>
          <thead><tr><th>Batch</th><th>Product</th><th>Manufactured</th><th>Expires</th><th>Items</th><th></th></tr></thead>
          <tbody>
            {batches.data?.map((x) => (
              <tr key={x.batch_id}>
                <td>#{x.batch_id}</td><td>{x.product}</td><td>{x.manufacture_date}</td><td>{x.expiry_date}</td><td>{x.quantity}</td>
                <td><button className="btn small ghost" onClick={() => showQr(x.batch_id)}>{open === x.batch_id ? "Hide QR codes" : "QR codes"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {batches.data?.length === 0 && <p className="empty">No batches yet. Add a product, then create a batch.</p>}
        {open && (
          <>
            <button className="btn small noprint" onClick={() => window.print()}>Print labels</button>
            <div className="qrgrid">
              {items.slice(0, 120).map((i) => (
                <div className="qr" key={i.item_id}>
                  <QRCodeSVG value={`${window.location.origin}/verify/${encodeURIComponent(i.serial_no)}`} size={96} />
                  <div className="mono">{i.serial_no}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
