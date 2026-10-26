-- =====================================================================
-- queries.sql - the important queries for the report and the viva demo (run after seed.sql)
-- ASCII only. Each query has a one-line purpose.
-- =====================================================================

-- Q1  JOIN across 5 tables: an item, its batch, product, manufacturer and current holder
SELECT i.serial_no, p.name AS product, b.batch_id, b.expiry_date,
       m.name AS manufacturer, o.name AS held_by, i.status
FROM items i
JOIN batches b       ON b.batch_id = i.batch_id
JOIN products p      ON p.product_id = b.product_id
JOIN organizations m ON m.org_id = p.org_id
JOIN organizations o ON o.org_id = i.current_owner_org
ORDER BY i.serial_no
LIMIT 10;

-- Q2  GROUP BY + HAVING: senders with at least one delivery slower than 72 hours
SELECT o.name AS sender, COUNT(*) AS slow_deliveries,
       ROUND(AVG(EXTRACT(EPOCH FROM (s.delivered_at - s.dispatched_at)) / 3600)::numeric, 1) AS avg_hours
FROM shipments s
JOIN organizations o ON o.org_id = s.from_org
WHERE s.delivered_at - s.dispatched_at > interval '72 hours'
GROUP BY o.name
HAVING COUNT(*) >= 1
ORDER BY slow_deliveries DESC;

-- Q3  Aggregate + ORDER BY: average transit time per route
SELECT fo.name || ' -> ' || t.name AS route, COUNT(*) AS shipments,
       ROUND(AVG(EXTRACT(EPOCH FROM (s.delivered_at - s.dispatched_at)) / 3600)::numeric, 1) AS avg_hours
FROM shipments s
JOIN organizations fo ON fo.org_id = s.from_org
JOIN organizations t  ON t.org_id = s.to_org
WHERE s.delivered_at IS NOT NULL
GROUP BY fo.name, t.name
ORDER BY avg_hours DESC;

-- Q4  Subquery (integrity check): items whose last custodian in the ledger differs from items.current_owner_org.
--     A healthy database returns ZERO rows.
SELECT i.serial_no, i.current_owner_org AS owner_in_items,
       (SELECT e.to_org FROM custody_events e WHERE e.item_id = i.item_id ORDER BY e.event_id DESC LIMIT 1) AS owner_in_ledger
FROM items i
WHERE i.current_owner_org IS DISTINCT FROM
      (SELECT e.to_org FROM custody_events e WHERE e.item_id = i.item_id ORDER BY e.event_id DESC LIMIT 1);

-- Q5  NOT EXISTS subquery: items that have never left the manufacturer
SELECT i.serial_no, p.name AS product
FROM items i
JOIN batches b  ON b.batch_id = i.batch_id
JOIN products p ON p.product_id = b.product_id
WHERE NOT EXISTS (SELECT 1 FROM custody_events e WHERE e.item_id = i.item_id AND e.event_type = 'transfer')
ORDER BY i.serial_no;

-- Q6  Window function LAG(): how long each custodian held an item before passing it on
SELECT serial_no, to_org_name AS custodian, event_time,
       event_time - LAG(event_time) OVER (PARTITION BY item_id ORDER BY event_id) AS time_since_previous_event
FROM v_item_timeline
WHERE serial_no = 'SN-000001'
ORDER BY event_id;

-- Q7  Recursive CTE: walk one item's whole chain from the genesis event, following prev_hash -> curr_hash links
WITH RECURSIVE chain AS (
    SELECT event_id, item_id, from_org, to_org, curr_hash, 1 AS hop
    FROM custody_events
    WHERE item_id = (SELECT item_id FROM items WHERE serial_no = 'SN-000001') AND event_type = 'genesis'
    UNION ALL
    SELECT e.event_id, e.item_id, e.from_org, e.to_org, e.curr_hash, c.hop + 1
    FROM custody_events e
    JOIN chain c ON e.prev_hash = c.curr_hash AND e.item_id = c.item_id
)
SELECT c.hop, COALESCE(fo.name, '(factory)') AS from_org, t.name AS to_org
FROM chain c
LEFT JOIN organizations fo ON fo.org_id = c.from_org
JOIN organizations t ON t.org_id = c.to_org
ORDER BY c.hop;

-- Q8  Full-text search on product names (uses the GIN index)
SELECT product_id, name, category
FROM products
WHERE to_tsvector('english', name) @@ plainto_tsquery('english', 'insulin');

-- Q9  Temperature statistics per shipment, only shipments that went above their category limit (HAVING)
SELECT sr.shipment_id, COUNT(*) AS readings, MIN(sr.temperature) AS min_c, MAX(sr.temperature) AS max_c,
       ROUND(AVG(sr.temperature), 1) AS avg_c
FROM sensor_readings sr
GROUP BY sr.shipment_id
HAVING MAX(sr.temperature) > 8
ORDER BY max_c DESC;

-- Q10 Using the views
SELECT * FROM v_org_inventory ORDER BY org_name, product, status;
SELECT * FROM v_active_alerts;
SELECT * FROM v_shipment_summary ORDER BY shipment_id;

-- Q11 Chain verification for every item (counts valid / broken)
SELECT COUNT(*) FILTER (WHERE v.is_valid) AS valid_items, COUNT(*) FILTER (WHERE NOT v.is_valid) AS broken_items
FROM items i CROSS JOIN LATERAL verify_chain(i.item_id) v;

-- =====================================================================
-- DML demonstration (INSERT / UPDATE / DELETE / SELECT) inside a transaction that is rolled back,
-- so your demo data stays untouched.
-- =====================================================================
BEGIN;
INSERT INTO products (org_id, name, category, sku)
VALUES ((SELECT org_id FROM organizations WHERE license_no = 'LIC-MFR-001'), 'Test Bandage', 'Pharma', 'TEST-BND');
UPDATE products SET category = 'Food' WHERE sku = 'TEST-BND';
SELECT product_id, name, category FROM products WHERE sku = 'TEST-BND';
DELETE FROM products WHERE sku = 'TEST-BND';
ROLLBACK;

-- Transaction rollback demo: the second statement fails, so the first is undone too
BEGIN;
UPDATE organizations SET status = 'rejected' WHERE license_no = 'LIC-MFR-002';
INSERT INTO batches (product_id, manufacture_date, expiry_date, quantity)
VALUES (1, CURRENT_DATE, CURRENT_DATE - 1, 5);        -- EXPECTED TO FAIL: expiry before manufacture (CHECK violation)
ROLLBACK;
SELECT status FROM organizations WHERE license_no = 'LIC-MFR-002';   -- still 'pending'
