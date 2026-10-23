import { one, query } from "./db";

export type Verdict = "authentic" | "suspicious" | "tampered" | "unknown";

/**
 * Public verification of one serial number.
 *  - verify_chain() (SQL function) recomputes every hash in the item's custody chain
 *  - open alerts, expiry and scan locations decide between authentic / suspicious
 *  - every scan is logged; scans from 3+ cities within 24h raise a counterfeit alert
 */
export async function verifySerial(serial: string, city: string) {
  const item = await one(
    `SELECT i.item_id, i.serial_no, i.status, o.name AS current_owner, b.batch_id,
            b.manufacture_date::text AS manufacture_date, b.expiry_date::text AS expiry_date,
            p.name AS product, p.category, p.sku, m.name AS manufacturer
     FROM items i JOIN batches b ON b.batch_id = i.batch_id JOIN products p ON p.product_id = b.product_id
     JOIN organizations m ON m.org_id = p.org_id JOIN organizations o ON o.org_id = i.current_owner_org
     WHERE i.serial_no = $1`, [serial]);
  if (!item) return { verdict: "unknown" as Verdict, reasons: ["No item with this serial number exists in the ledger."] };

  const [chain, events, alerts, cities] = await Promise.all([
    one<{ is_valid: boolean; broken_event_id: number | null; event_count: number }>(
      "SELECT is_valid, broken_event_id, event_count FROM verify_chain($1)", [item.item_id]),
    query(`SELECT e.event_id, e.event_type, e.event_time, fo.name AS from_name, t.name AS to_name, e.prev_hash, e.curr_hash
           FROM custody_events e LEFT JOIN organizations fo ON fo.org_id = e.from_org
           JOIN organizations t ON t.org_id = e.to_org WHERE e.item_id = $1 ORDER BY e.event_id`, [item.item_id]),
    query(`SELECT alert_id, type, severity, description FROM alerts
           WHERE resolved = false AND (item_id = $1 OR shipment_id IN (SELECT shipment_id FROM shipment_items WHERE item_id = $1))`,
      [item.item_id]),
    query<{ scan_city: string }>(
      `SELECT DISTINCT scan_city FROM verification_logs
       WHERE item_id = $1 AND scanned_at > now() - interval '24 hours' AND scan_city <> 'unknown'`, [item.item_id]),
  ]);

  const reasons: string[] = [];
  let verdict: Verdict = "authentic";
  const chainOk = !!chain?.is_valid && (chain?.event_count ?? 0) > 0;
  if (!chainOk) {
    verdict = "tampered";
    reasons.push(chain && chain.event_count > 0
      ? `The custody record was altered: the hash link breaks at event #${chain.broken_event_id}.`
      : "This item has no custody history.");
  } else {
    const cityset = new Set(cities.map((c) => c.scan_city));
    if (city !== "unknown") cityset.add(city);
    if (alerts.length) { verdict = "suspicious"; reasons.push(`${alerts.length} unresolved alert(s) on this item or its shipments.`); }
    if (item.expiry_date < new Date().toISOString().slice(0, 10)) { verdict = "suspicious"; reasons.push("This item is past its expiry date."); }
    if (cityset.size >= 3) {
      verdict = "suspicious";
      reasons.push(`This serial was scanned in ${cityset.size} different cities in the last 24 hours, which suggests a copied code.`);
      const existing = await one("SELECT 1 FROM alerts WHERE item_id = $1 AND type = 'counterfeit_suspected' AND resolved = false", [item.item_id]);
      if (!existing) await query(
        "INSERT INTO alerts(item_id, type, severity, description, resolved) VALUES ($1,'counterfeit_suspected','high',$2,false)",
        [item.item_id, `Serial scanned in ${cityset.size} cities within 24h: ${[...cityset].join(", ")}`]);
    }
    if (!reasons.length) reasons.push("The custody chain is unbroken and no problems were reported.");
  }

  await query("INSERT INTO verification_logs(item_id, scan_city, result) VALUES ($1,$2,$3)", [item.item_id, city, verdict]);
  return { verdict, reasons, item, chain, events, alerts };
}
