-- =====================================================================
-- seed.sql - demo data. All demo accounts use the password  Password123
-- Run after migrations.sql, on an empty database (schema.sql resets everything).  (ASCII only)
-- =====================================================================
SET client_min_messages = warning;
BEGIN;

-- ---------- organizations (ids 1..6) ----------
INSERT INTO organizations (name, type, license_no, status) VALUES
  ('Acme Pharma Ltd',     'manufacturer', 'LIC-MFR-001', 'approved'),
  ('FastMove Logistics',  'distributor',  'LIC-DST-001', 'approved'),
  ('CityCare Pharmacy',   'retailer',     'LIC-RET-001', 'approved'),
  ('NewLeaf Foods',       'manufacturer', 'LIC-MFR-002', 'pending'),
  ('Coastal Cold Chain',  'distributor',  'LIC-DST-002', 'approved'),
  ('GreenLeaf Chemists',  'retailer',     'LIC-RET-002', 'approved');

-- ---------- users (bcrypt hashes made by pgcrypto; bcryptjs in the app can verify them) ----------
INSERT INTO users (org_id, name, email, password_hash, role)
SELECT o.org_id, u.name, u.email, crypt('Password123', gen_salt('bf', 10)), u.role
FROM (VALUES
  ('Anita Admin',        'admin@traceledger.test',       'admin',        NULL),
  ('Manoj Manufacturer', 'manufacturer@traceledger.test','manufacturer', 'LIC-MFR-001'),
  ('Divya Distributor',  'distributor@traceledger.test', 'distributor',  'LIC-DST-001'),
  ('Ravi Retailer',      'retailer@traceledger.test',    'retailer',     'LIC-RET-001'),
  ('Asha Auditor',       'auditor@traceledger.test',     'auditor',      NULL),
  ('Nina Newleaf',       'pending@traceledger.test',     'manufacturer', 'LIC-MFR-002'),
  ('Dev Coastal',        'coastal@traceledger.test',     'distributor',  'LIC-DST-002'),
  ('Rita Greenleaf',     'greenleaf@traceledger.test',   'retailer',     'LIC-RET-002')
) AS u(name, email, role, license)
LEFT JOIN organizations o ON o.license_no = u.license;

-- ---------- products and batches (create_batch also writes genesis events + outbox rows) ----------
INSERT INTO products (org_id, name, category, sku)
SELECT org_id, v.name, v.category, v.sku FROM organizations,
  (VALUES ('Insulin Pen 3ml', 'Pharma', 'INS-3ML'), ('Vaccine Vial A', 'Pharma', 'VAC-A')) AS v(name, category, sku)
WHERE license_no = 'LIC-MFR-001';

SELECT create_batch((SELECT product_id FROM products WHERE sku = 'INS-3ML'), CURRENT_DATE - 60, CURRENT_DATE + 300, 12);  -- SN-000001..12
SELECT create_batch((SELECT product_id FROM products WHERE sku = 'VAC-A'),   CURRENT_DATE - 30, CURRENT_DATE + 180, 8);   -- SN-000013..20

-- ---------- helpers that exist only for this script ----------
CREATE FUNCTION pg_temp.sn(a int, b int) RETURNS text[] LANGUAGE sql AS
$$ SELECT array_agg('SN-' || lpad(g::text, 6, '0')) FROM generate_series(a, b) g $$;

CREATE FUNCTION pg_temp.org(p_license text) RETURNS int LANGUAGE sql AS
$$ SELECT org_id FROM organizations WHERE license_no = p_license $$;

CREATE FUNCTION pg_temp.seed_shipment(p_from int, p_to int, p_serials text[], p_dispatched_hours_ago int,
                                      p_transit_hours int, p_deliver boolean) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE v_id int; v_creator int;
BEGIN
    SELECT user_id INTO v_creator FROM users WHERE org_id = p_from LIMIT 1;
    UPDATE items SET status = 'reserved' WHERE serial_no = ANY(p_serials) AND current_owner_org = p_from;
    INSERT INTO shipments (from_org, to_org, created_by) VALUES (p_from, p_to, v_creator) RETURNING shipment_id INTO v_id;
    INSERT INTO shipment_items (shipment_id, item_id) SELECT v_id, item_id FROM items WHERE serial_no = ANY(p_serials);
    PERFORM transfer_custody(v_id, p_from);
    UPDATE shipments SET dispatched_at = now() - make_interval(hours => p_dispatched_hours_ago) WHERE shipment_id = v_id;
    IF p_deliver THEN
        UPDATE shipments SET status = 'delivered',
               delivered_at = now() - make_interval(hours => p_dispatched_hours_ago - p_transit_hours)
        WHERE shipment_id = v_id;
        UPDATE items SET status = 'in_stock' WHERE item_id IN (SELECT item_id FROM shipment_items WHERE shipment_id = v_id);
    END IF;
    RETURN v_id;
END $$;

CREATE FUNCTION pg_temp.seed_readings(p_shipment int, p_temps numeric[]) RETURNS void LANGUAGE plpgsql AS $$
DECLARE i int; v_start timestamptz;
BEGIN
    SELECT dispatched_at INTO v_start FROM shipments WHERE shipment_id = p_shipment;
    FOR i IN 1 .. array_length(p_temps, 1) LOOP
        INSERT INTO sensor_readings (shipment_id, ts, temperature, humidity, lat, lng)
        VALUES (p_shipment, v_start + make_interval(hours => i * 2), p_temps[i], 45 + i, 12.97 + i * 0.1, 77.59 + i * 0.1);
    END LOOP;
END $$;

-- ---------- shipments ----------
-- 1. Acme -> FastMove, 6 insulin pens, delivered after 30 hours, temperatures fine
SELECT pg_temp.seed_readings(pg_temp.seed_shipment(pg_temp.org('LIC-MFR-001'), pg_temp.org('LIC-DST-001'), pg_temp.sn(1, 6), 60, 30, true),
                             ARRAY[4.5, 5.1, 5.8, 6.2, 5.0]);
-- 2. FastMove -> CityCare, 3 pens, delivered after 12 hours
SELECT pg_temp.seed_readings(pg_temp.seed_shipment(pg_temp.org('LIC-DST-001'), pg_temp.org('LIC-RET-001'), pg_temp.sn(1, 3), 24, 12, true),
                             ARRAY[5.2, 5.9, 6.0]);
-- 3. FastMove -> GreenLeaf, 2 pens, SLOW delivery (100 hours) for the HAVING query
SELECT pg_temp.seed_readings(pg_temp.seed_shipment(pg_temp.org('LIC-DST-001'), pg_temp.org('LIC-RET-002'), pg_temp.sn(4, 5), 130, 100, true),
                             ARRAY[4.8, 5.4, 6.1]);
-- 4. Acme -> Coastal, 5 vaccine vials, STILL IN TRANSIT, one reading above the 8 C limit -> alert created by the trigger
SELECT pg_temp.seed_readings(pg_temp.seed_shipment(pg_temp.org('LIC-MFR-001'), pg_temp.org('LIC-DST-002'), pg_temp.sn(13, 17), 10, 0, false),
                             ARRAY[5.5, 6.0, 11.2, 7.0]);

-- one item sold, and a couple of public scans
UPDATE items SET status = 'sold' WHERE serial_no = 'SN-000003';
INSERT INTO verification_logs (item_id, scan_city, result)
SELECT item_id, 'Bengaluru', 'authentic' FROM items WHERE serial_no IN ('SN-000001', 'SN-000002');

COMMIT;
