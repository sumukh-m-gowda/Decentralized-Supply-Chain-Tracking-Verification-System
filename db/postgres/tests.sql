-- =====================================================================
-- tests.sql - database test cases. Creates its own data, prints PASS/FAIL, then ROLLS BACK
-- (your seed data is untouched). Run:  psql "<url>" -f tests.sql        ASCII only.
-- =====================================================================
\set QUIET on
BEGIN;
SET client_min_messages = warning;

CREATE TEMP TABLE test_results (n serial, name text, passed boolean, detail text);
CREATE TEMP TABLE ctx (k text PRIMARY KEY, v int);

CREATE FUNCTION pg_temp.rec(p_name text, p_ok boolean, p_detail text DEFAULT '') RETURNS void LANGUAGE sql AS
$$ INSERT INTO test_results (name, passed, detail) VALUES (p_name, p_ok, p_detail) $$;

CREATE FUNCTION pg_temp.c(p_k text) RETURNS int LANGUAGE sql AS $$ SELECT v FROM ctx WHERE k = p_k $$;

-- runs p_sql and passes only if it raises an error whose message contains p_fragment
CREATE FUNCTION pg_temp.expect_error(p_name text, p_sql text, p_fragment text DEFAULT '') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
        PERFORM pg_temp.rec(p_name, false, 'no error was raised');
    EXCEPTION WHEN OTHERS THEN
        PERFORM pg_temp.rec(p_name, p_fragment = '' OR position(p_fragment in SQLERRM) > 0, SQLSTATE || ': ' || SQLERRM);
    END;
END $$;

-- ---------------------------------------------------------------------
-- fixture: orgs A (manufacturer), B (distributor), C (retailer); one batch of 4 items i1..i4
-- ---------------------------------------------------------------------
DO $$
DECLARE a int; b int; c int; p int; bt int; s1 int; sa int; sb int;
BEGIN
    INSERT INTO organizations (name, type, license_no, status) VALUES ('T Maker', 'manufacturer', 'T-A', 'approved') RETURNING org_id INTO a;
    INSERT INTO organizations (name, type, license_no, status) VALUES ('T Mover', 'distributor',  'T-B', 'approved') RETURNING org_id INTO b;
    INSERT INTO organizations (name, type, license_no, status) VALUES ('T Shop',  'retailer',     'T-C', 'approved') RETURNING org_id INTO c;
    INSERT INTO products (org_id, name, category, sku) VALUES (a, 'Test Serum', 'Pharma', 'T-SKU') RETURNING product_id INTO p;
    bt := create_batch(p, CURRENT_DATE - 10, CURRENT_DATE + 100, 4);
    INSERT INTO ctx VALUES ('A', a), ('B', b), ('C', c), ('prod', p), ('batch', bt);
    INSERT INTO ctx SELECT 'i' || row_number() OVER (ORDER BY item_id), item_id FROM items WHERE batch_id = bt;

    -- ship1: A -> B carrying i1 and i4, dispatched properly
    UPDATE items SET status = 'reserved' WHERE item_id IN (pg_temp.c('i1'), pg_temp.c('i4'));
    INSERT INTO shipments (from_org, to_org) VALUES (a, b) RETURNING shipment_id INTO s1;
    INSERT INTO shipment_items VALUES (s1, pg_temp.c('i1')), (s1, pg_temp.c('i4'));
    PERFORM transfer_custody(s1, a);
    INSERT INTO ctx VALUES ('ship1', s1);

    -- sa: A -> C carrying i3 (used to test a wrong sender)
    UPDATE items SET status = 'reserved' WHERE item_id = pg_temp.c('i3');
    INSERT INTO shipments (from_org, to_org) VALUES (a, c) RETURNING shipment_id INTO sa;
    INSERT INTO shipment_items VALUES (sa, pg_temp.c('i3'));
    INSERT INTO ctx VALUES ('ship_a', sa);

    -- sb: A -> C carrying i2 (healthy) and i4 (its owner column was forged back to A, but the ledger says B)
    UPDATE items SET current_owner_org = a, status = 'reserved' WHERE item_id = pg_temp.c('i4');
    UPDATE items SET status = 'reserved' WHERE item_id = pg_temp.c('i2');
    INSERT INTO shipments (from_org, to_org) VALUES (a, c) RETURNING shipment_id INTO sb;
    INSERT INTO shipment_items VALUES (sb, pg_temp.c('i2')), (sb, pg_temp.c('i4'));
    INSERT INTO ctx VALUES ('ship_b', sb);
END $$;

-- ---------------------------------------------------------------------
-- 1. ledger integrity
-- ---------------------------------------------------------------------
SELECT pg_temp.rec('T01 healthy chain verifies (2 events)',
       (SELECT is_valid AND event_count = 2 FROM verify_chain(pg_temp.c('i1')))) \gset

SELECT pg_temp.rec('T02 stored hashes equal recomputed hashes',
       NOT EXISTS (SELECT 1 FROM custody_events e
                   WHERE e.item_id IN (SELECT v FROM ctx WHERE k LIKE 'i_')
                     AND e.curr_hash <> compute_event_hash(e.prev_hash, e.item_id, e.from_org, e.to_org, e.event_type, e.event_time))) \gset

SELECT pg_temp.expect_error('T03 ledger UPDATE is blocked',
       format('UPDATE custody_events SET to_org = %s WHERE item_id = %s', pg_temp.c('C'), pg_temp.c('i1')), 'append-only') \gset
SELECT pg_temp.expect_error('T04 ledger DELETE is blocked',
       format('DELETE FROM custody_events WHERE item_id = %s', pg_temp.c('i1')), 'append-only') \gset
SELECT pg_temp.expect_error('T05 ledger TRUNCATE is blocked', 'TRUNCATE custody_events', 'append-only') \gset

SELECT pg_temp.expect_error('T06 second genesis event for an item is rejected',
       format('INSERT INTO custody_events (item_id, from_org, to_org, event_type) VALUES (%s, NULL, %s, ''genesis'')', pg_temp.c('i3'), pg_temp.c('A')),
       'already has a genesis') \gset
SELECT pg_temp.expect_error('T07 transfer from a non-custodian is rejected by the ledger trigger',
       format('INSERT INTO custody_events (item_id, from_org, to_org, event_type) VALUES (%s, %s, %s, ''transfer'')', pg_temp.c('i3'), pg_temp.c('B'), pg_temp.c('C')),
       'Chain of custody broken') \gset

-- ---------------------------------------------------------------------
-- 2. atomic custody transfer
-- ---------------------------------------------------------------------
SELECT pg_temp.expect_error('T08 only the sender can dispatch (wrong actor rejected)',
       format('SELECT transfer_custody(%s, %s)', pg_temp.c('ship_a'), pg_temp.c('B')), 'Only the sending organization') \gset

CREATE TEMP TABLE before_state AS
SELECT (SELECT count(*) FROM custody_events WHERE item_id = pg_temp.c('i2')) AS i2_events,
       (SELECT status FROM shipments WHERE shipment_id = pg_temp.c('ship_b')) AS ship_status;

SELECT pg_temp.expect_error('T09 transfer fails midway (i2 ok, i4 inconsistent)',
       format('SELECT transfer_custody(%s, %s)', pg_temp.c('ship_b'), pg_temp.c('A')), 'Chain of custody broken') \gset

SELECT pg_temp.rec('T10 failed transfer rolled back completely (no partial events, shipment unchanged)',
       (SELECT (SELECT count(*) FROM custody_events WHERE item_id = pg_temp.c('i2')) = b.i2_events
           AND (SELECT status FROM shipments WHERE shipment_id = pg_temp.c('ship_b')) = b.ship_status
        FROM before_state b)) \gset

SELECT pg_temp.expect_error('T11 shipment status cannot go backwards',
       format('UPDATE shipments SET status = ''created'' WHERE shipment_id = %s', pg_temp.c('ship1')), 'Invalid shipment status') \gset

-- ---------------------------------------------------------------------
-- 3. constraints and validation (database level)
-- ---------------------------------------------------------------------
SELECT pg_temp.expect_error('T12 expiry before manufacture is rejected (CHECK)',
       format('SELECT create_batch(%s, CURRENT_DATE, CURRENT_DATE - 1, 1)', pg_temp.c('prod')), 'chk_batch_dates') \gset
SELECT pg_temp.expect_error('T13 batch quantity 0 is rejected (CHECK)',
       format('SELECT create_batch(%s, CURRENT_DATE - 1, CURRENT_DATE + 1, 0)', pg_temp.c('prod')), 'batches_quantity_check') \gset
SELECT pg_temp.expect_error('T14 temperature outside -100..100 is rejected (CHECK)',
       format('INSERT INTO sensor_readings (shipment_id, temperature) VALUES (%s, 500)', pg_temp.c('ship1')), 'sensor_readings_temperature_check') \gset
SELECT pg_temp.expect_error('T15 invalid shipment status value is rejected (CHECK)',
       format('INSERT INTO shipments (from_org, to_org, status) VALUES (%s, %s, ''lost'')', pg_temp.c('A'), pg_temp.c('B')), 'shipments_status_check') \gset
SELECT pg_temp.expect_error('T16 a shipment to oneself is rejected (CHECK)',
       format('INSERT INTO shipments (from_org, to_org) VALUES (%s, %s)', pg_temp.c('A'), pg_temp.c('A')), 'chk_ship_parties') \gset
SELECT pg_temp.expect_error('T17 duplicate product SKU is rejected (UNIQUE)',
       format('INSERT INTO products (org_id, name, category, sku) VALUES (%s, ''x'', ''x'', ''T-SKU'')', pg_temp.c('A')), 'uq_products_sku') \gset
SELECT pg_temp.expect_error('T18 unknown organization in a shipment is rejected (FOREIGN KEY)',
       format('INSERT INTO shipments (from_org, to_org) VALUES (%s, 999999)', pg_temp.c('A')), 'violates foreign key') \gset
SELECT pg_temp.expect_error('T19 user role must match organization type',
       format('INSERT INTO users (org_id, name, email, password_hash, role) VALUES (%s, ''x'', ''x@x.com'', ''h'', ''retailer'')', pg_temp.c('A')), 'does not match') \gset
SELECT pg_temp.expect_error('T20 only manufacturers can own products',
       format('INSERT INTO products (org_id, name, category, sku) VALUES (%s, ''x'', ''x'', ''T-SKU2'')', pg_temp.c('B')), 'Only a manufacturer') \gset
SELECT pg_temp.expect_error('T21 an item serial number cannot be changed',
       format('UPDATE items SET serial_no = ''HACKED'' WHERE item_id = %s', pg_temp.c('i1')), 'cannot be changed') \gset
SELECT pg_temp.expect_error('T22 duplicate user email is rejected (UNIQUE)',
       format('INSERT INTO users (org_id, name, email, password_hash, role) VALUES (%s, ''a'', ''dup@x.com'', ''h'', ''distributor''), (%s, ''b'', ''dup@x.com'', ''h'', ''distributor'')', pg_temp.c('B'), pg_temp.c('B')), 'uq_users_email') \gset

DO $$
DECLARE pend int; p2 int;
BEGIN
    INSERT INTO organizations (name, type, license_no, status) VALUES ('T Pending', 'manufacturer', 'T-P', 'pending') RETURNING org_id INTO pend;
    INSERT INTO products (org_id, name, category, sku) VALUES (pend, 'P', 'Food', 'T-PEND') RETURNING product_id INTO p2;
    INSERT INTO ctx VALUES ('pending_prod', p2);
END $$;
SELECT pg_temp.expect_error('T23 an unapproved manufacturer cannot create a batch',
       format('SELECT create_batch(%s, CURRENT_DATE - 1, CURRENT_DATE + 30, 1)', pg_temp.c('pending_prod')), 'not approved') \gset

-- ---------------------------------------------------------------------
-- 4. sensor trigger
-- ---------------------------------------------------------------------
INSERT INTO sensor_readings (shipment_id, temperature) VALUES (pg_temp.c('ship1'), 5.0);
SELECT pg_temp.rec('T24 in-range reading creates no alert',
       (SELECT count(*) FROM alerts WHERE shipment_id = pg_temp.c('ship1')) = 0) \gset
INSERT INTO sensor_readings (shipment_id, temperature) VALUES (pg_temp.c('ship1'), 12.0);
SELECT pg_temp.rec('T25 out-of-range reading creates a temperature_breach alert',
       (SELECT count(*) = 1 AND bool_and(type = 'temperature_breach') FROM alerts WHERE shipment_id = pg_temp.c('ship1')),
       (SELECT string_agg(severity || ': ' || description, ' | ') FROM alerts WHERE shipment_id = pg_temp.c('ship1'))) \gset
INSERT INTO sensor_readings (shipment_id, temperature) VALUES (pg_temp.c('ship1'), 15.0);
SELECT pg_temp.rec('T26 a second breach does not duplicate the open alert',
       (SELECT count(*) FROM alerts WHERE shipment_id = pg_temp.c('ship1')) = 1) \gset

-- ---------------------------------------------------------------------
-- 5. outbox for Neo4j
-- ---------------------------------------------------------------------
SELECT pg_temp.rec('T27 every ledger event has exactly one outbox row',
       (SELECT count(*) FROM graph_sync_outbox o WHERE (o.payload->>'item_id')::int IN (SELECT v FROM ctx WHERE k LIKE 'i_'))
     = (SELECT count(*) FROM custody_events WHERE item_id IN (SELECT v FROM ctx WHERE k LIKE 'i_'))) \gset
SELECT pg_temp.rec('T28 outbox payload has every field src/lib/sync.ts needs',
       (SELECT bool_and(payload ?& ARRAY['event_id','event_type','event_time','item_id','serial_no','batch_id','product_id','product_name',
                                         'manufacturer_org','manufacturer_name','to_org','to_name','to_type','from_org','shipment_id'])
        FROM graph_sync_outbox WHERE (payload->>'item_id')::int IN (SELECT v FROM ctx WHERE k LIKE 'i_'))) \gset

-- ---------------------------------------------------------------------
-- 6. TAMPERING is detected (a privileged attacker disables the guard, edits history, re-enables it)
-- ---------------------------------------------------------------------
ALTER TABLE custody_events DISABLE TRIGGER custody_events_immutable;
CREATE TEMP TABLE tamper_target AS
    SELECT event_id, to_org FROM custody_events WHERE item_id = pg_temp.c('i1') AND event_type = 'transfer';
UPDATE custody_events SET to_org = pg_temp.c('C') WHERE event_id = (SELECT event_id FROM tamper_target);
ALTER TABLE custody_events ENABLE TRIGGER custody_events_immutable;

SELECT pg_temp.rec('T29 edited history is detected by verify_chain',
       (SELECT NOT is_valid AND broken_event_id = (SELECT event_id FROM tamper_target) FROM verify_chain(pg_temp.c('i1'))),
       (SELECT 'broken_event_id=' || coalesce(broken_event_id::text, 'null') FROM verify_chain(pg_temp.c('i1')))) \gset

ALTER TABLE custody_events DISABLE TRIGGER custody_events_immutable;
UPDATE custody_events SET to_org = (SELECT to_org FROM tamper_target) WHERE event_id = (SELECT event_id FROM tamper_target);
ALTER TABLE custody_events ENABLE TRIGGER custody_events_immutable;
SELECT pg_temp.rec('T30 restoring the original value makes the chain valid again',
       (SELECT is_valid FROM verify_chain(pg_temp.c('i1')))) \gset

ALTER TABLE custody_events DISABLE TRIGGER custody_events_immutable;
DELETE FROM custody_events WHERE item_id = pg_temp.c('i1') AND event_type = 'transfer';
ALTER TABLE custody_events ENABLE TRIGGER custody_events_immutable;
SELECT pg_temp.rec('T31 a deleted last event is detected (ledger no longer matches the owner)',
       (SELECT NOT is_valid FROM verify_chain(pg_temp.c('i1')))) \gset

-- ---------------------------------------------------------------------
-- 7. views
-- ---------------------------------------------------------------------
SELECT pg_temp.rec('T32 views return rows',
       (SELECT count(*) FROM v_org_inventory) > 0 AND (SELECT count(*) FROM v_item_timeline) > 0 AND (SELECT count(*) FROM v_active_alerts) > 0) \gset

-- ---------------------------------------------------------------------
-- results
-- ---------------------------------------------------------------------
\set QUIET off
SELECT n, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, name, CASE WHEN passed THEN '' ELSE detail END AS failure_detail
FROM test_results ORDER BY n;
SELECT count(*) FILTER (WHERE passed) AS passed, count(*) FILTER (WHERE NOT passed) AS failed, count(*) AS total FROM test_results;

ROLLBACK;
