-- =====================================================================
-- views.sql - read-only views for timelines, inventory, alerts and shipments
-- Run after triggers.sql.  (ASCII only)
-- =====================================================================
SET client_min_messages = warning;

-- Full custody history of every item, with organization names instead of ids
CREATE OR REPLACE VIEW v_item_timeline AS
SELECT i.item_id, i.serial_no, e.event_id, e.event_type, e.event_time,
       fo.name AS from_org_name, t.name AS to_org_name, e.shipment_id, e.prev_hash, e.curr_hash
FROM custody_events e
JOIN items i         ON i.item_id = e.item_id
LEFT JOIN organizations fo ON fo.org_id = e.from_org
JOIN organizations t ON t.org_id = e.to_org;

-- What each organization holds right now, grouped by product and status
CREATE OR REPLACE VIEW v_org_inventory AS
SELECT o.org_id, o.name AS org_name, p.name AS product, i.status, COUNT(*)::int AS items
FROM items i
JOIN organizations o ON o.org_id = i.current_owner_org
JOIN batches b       ON b.batch_id = i.batch_id
JOIN products p      ON p.product_id = b.product_id
GROUP BY o.org_id, o.name, p.name, i.status;

-- Unresolved alerts only
CREATE OR REPLACE VIEW v_active_alerts AS
SELECT a.alert_id, a.type, a.severity, a.description, a.created_at, a.shipment_id, i.serial_no
FROM alerts a
LEFT JOIN items i ON i.item_id = a.item_id
WHERE a.resolved = false;

-- One row per shipment with parties, size, transit time and open alerts
CREATE OR REPLACE VIEW v_shipment_summary AS
SELECT s.shipment_id, fo.name AS from_name, t.name AS to_name, s.status,
       (SELECT COUNT(*)::int FROM shipment_items si WHERE si.shipment_id = s.shipment_id) AS item_count,
       s.dispatched_at, s.delivered_at,
       ROUND((EXTRACT(EPOCH FROM (s.delivered_at - s.dispatched_at)) / 3600)::numeric, 1) AS transit_hours,
       (SELECT COUNT(*)::int FROM alerts a WHERE a.shipment_id = s.shipment_id AND a.resolved = false) AS open_alerts
FROM shipments s
JOIN organizations fo ON fo.org_id = s.from_org
JOIN organizations t  ON t.org_id = s.to_org;
