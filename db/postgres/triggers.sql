-- =====================================================================
-- triggers.sql - ledger integrity, outbox, sensor alerts and data-validation triggers
-- Run after functions.sql.  (ASCII only)
-- =====================================================================
SET client_min_messages = warning;

-- ---------------------------------------------------------------------
-- 1. HASH TRIGGER (BEFORE INSERT on custody_events)
--    Links the new event to the previous one, checks the custodian, stamps the time, computes the hash.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_custody_hash() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_prev_hash text;
    v_prev_to   int;
BEGIN
    NEW.event_time := clock_timestamp();            -- ledger time is set by the database, never by the app

    SELECT curr_hash, to_org INTO v_prev_hash, v_prev_to
    FROM custody_events WHERE item_id = NEW.item_id ORDER BY event_id DESC LIMIT 1;

    IF NEW.event_type = 'genesis' THEN
        IF FOUND THEN
            RAISE EXCEPTION 'Item % already has a genesis event', NEW.item_id;
        END IF;
        NEW.prev_hash := NULL;
    ELSE
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Item % has no history to transfer from', NEW.item_id;
        END IF;
        IF NEW.from_org IS DISTINCT FROM v_prev_to THEN
            RAISE EXCEPTION 'Chain of custody broken: item % is not held by organization %', NEW.item_id, NEW.from_org;
        END IF;
        NEW.prev_hash := v_prev_hash;
    END IF;

    NEW.curr_hash := compute_event_hash(NEW.prev_hash, NEW.item_id, NEW.from_org, NEW.to_org, NEW.event_type, NEW.event_time);
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS custody_events_hash ON custody_events;
CREATE TRIGGER custody_events_hash BEFORE INSERT ON custody_events
    FOR EACH ROW EXECUTE FUNCTION fn_custody_hash();

-- ---------------------------------------------------------------------
-- 2. IMMUTABILITY (ledger rows can never be changed, deleted or truncated)
--    The tamper demo disables custody_events_immutable on purpose.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_custody_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'custody_events is an append-only ledger: % is not allowed', TG_OP;
END $$;

DROP TRIGGER IF EXISTS custody_events_immutable ON custody_events;
CREATE TRIGGER custody_events_immutable BEFORE UPDATE OR DELETE ON custody_events
    FOR EACH ROW EXECUTE FUNCTION fn_custody_immutable();

DROP TRIGGER IF EXISTS custody_events_no_truncate ON custody_events;
CREATE TRIGGER custody_events_no_truncate BEFORE TRUNCATE ON custody_events
    FOR EACH STATEMENT EXECUTE FUNCTION fn_custody_immutable();

-- ---------------------------------------------------------------------
-- 3. OUTBOX (AFTER INSERT on custody_events) - queues each event for Neo4j.
--    The JSON shape is exactly what src/lib/sync.ts reads.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_custody_outbox() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO graph_sync_outbox (payload)
    SELECT jsonb_build_object(
        'event_id', NEW.event_id,
        'event_type', NEW.event_type,
        'event_time', to_char(NEW.event_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'item_id', i.item_id,
        'serial_no', i.serial_no,
        'batch_id', b.batch_id,
        'product_id', p.product_id,
        'product_name', p.name,
        'manufacturer_org', m.org_id,
        'manufacturer_name', m.name,
        'from_org', NEW.from_org,
        'from_name', fo.name,
        'from_type', fo.type,
        'to_org', NEW.to_org,
        'to_name', t.name,
        'to_type', t.type,
        'shipment_id', NEW.shipment_id)
    FROM items i
    JOIN batches b       ON b.batch_id = i.batch_id
    JOIN products p      ON p.product_id = b.product_id
    JOIN organizations m ON m.org_id = p.org_id
    JOIN organizations t ON t.org_id = NEW.to_org
    LEFT JOIN organizations fo ON fo.org_id = NEW.from_org
    WHERE i.item_id = NEW.item_id;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS custody_events_outbox ON custody_events;
CREATE TRIGGER custody_events_outbox AFTER INSERT ON custody_events
    FOR EACH ROW EXECUTE FUNCTION fn_custody_outbox();

-- ---------------------------------------------------------------------
-- 4. SENSOR TRIGGER (AFTER INSERT on sensor_readings)
--    Compares the reading with the allowed range for each product category in the shipment and
--    raises one open temperature_breach alert per shipment.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_sensor_breach() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    r   record;
    dev numeric;
BEGIN
    IF EXISTS (SELECT 1 FROM alerts WHERE shipment_id = NEW.shipment_id AND type = 'temperature_breach' AND resolved = false) THEN
        RETURN NEW;                                  -- one open alert per shipment is enough
    END IF;

    SELECT x.category, x.lo, x.hi INTO r
    FROM (
        SELECT pc.category,
               COALESCE(cl.min_temp, d.min_temp) AS lo,
               COALESCE(cl.max_temp, d.max_temp) AS hi
        FROM (SELECT DISTINCT p.category
              FROM shipment_items si
              JOIN items i    ON i.item_id = si.item_id
              JOIN batches b  ON b.batch_id = i.batch_id
              JOIN products p ON p.product_id = b.product_id
              WHERE si.shipment_id = NEW.shipment_id) pc
        LEFT JOIN category_limits cl ON cl.category = pc.category
        CROSS JOIN (SELECT min_temp, max_temp FROM category_limits WHERE category = 'default') d
    ) x
    WHERE NEW.temperature < x.lo OR NEW.temperature > x.hi
    ORDER BY GREATEST(x.lo - NEW.temperature, NEW.temperature - x.hi) DESC
    LIMIT 1;

    IF FOUND THEN
        dev := GREATEST(r.lo - NEW.temperature, NEW.temperature - r.hi);
        INSERT INTO alerts (shipment_id, type, severity, description)
        VALUES (NEW.shipment_id, 'temperature_breach',
                CASE WHEN dev >= 10 THEN 'critical' WHEN dev >= 5 THEN 'high' ELSE 'medium' END,
                format('Temperature %s C is outside the allowed %s to %s C range for %s products', NEW.temperature, r.lo, r.hi, r.category));
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sensor_readings_breach_alert ON sensor_readings;
CREATE TRIGGER sensor_readings_breach_alert AFTER INSERT ON sensor_readings
    FOR EACH ROW EXECUTE FUNCTION fn_sensor_breach();

-- ---------------------------------------------------------------------
-- 5. DATA-VALIDATION TRIGGERS (rules a CHECK constraint cannot express)
-- ---------------------------------------------------------------------
-- 5a. a shipment can only move forward: created -> in_transit -> delivered
CREATE OR REPLACE FUNCTION fn_shipment_status_flow() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status <> OLD.status AND NOT (
        (OLD.status = 'created' AND NEW.status = 'in_transit') OR
        (OLD.status = 'in_transit' AND NEW.status = 'delivered')) THEN
        RAISE EXCEPTION 'Invalid shipment status change: % to %', OLD.status, NEW.status;
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS shipments_status_flow ON shipments;
CREATE TRIGGER shipments_status_flow BEFORE UPDATE ON shipments
    FOR EACH ROW EXECUTE FUNCTION fn_shipment_status_flow();

-- 5b. an item's identity (batch and serial number) can never change
CREATE OR REPLACE FUNCTION fn_items_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'An item''s serial number and batch cannot be changed';
END $$;
DROP TRIGGER IF EXISTS items_identity_immutable ON items;
CREATE TRIGGER items_identity_immutable BEFORE UPDATE OF batch_id, serial_no ON items
    FOR EACH ROW EXECUTE FUNCTION fn_items_identity();

-- 5c. a user's role must match the type of their organization
CREATE OR REPLACE FUNCTION fn_user_role_matches_org() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_type text;
BEGIN
    IF NEW.org_id IS NOT NULL THEN
        SELECT type INTO v_type FROM organizations WHERE org_id = NEW.org_id;
        IF v_type IS DISTINCT FROM NEW.role THEN
            RAISE EXCEPTION 'Role % does not match the organization type %', NEW.role, v_type;
        END IF;
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS users_role_matches_org ON users;
CREATE TRIGGER users_role_matches_org BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_user_role_matches_org();

-- 5d. only manufacturers can own products
CREATE OR REPLACE FUNCTION fn_product_owner_is_manufacturer() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF (SELECT type FROM organizations WHERE org_id = NEW.org_id) IS DISTINCT FROM 'manufacturer' THEN
        RAISE EXCEPTION 'Only a manufacturer can own products';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS products_manufacturer_only ON products;
CREATE TRIGGER products_manufacturer_only BEFORE INSERT OR UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION fn_product_owner_is_manufacturer();
