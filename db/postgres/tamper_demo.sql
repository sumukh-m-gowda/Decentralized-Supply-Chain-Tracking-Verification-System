-- =====================================================================
-- tamper_demo.sql - the strongest moment of the demo. Run the steps one at a time. ASCII only.
-- Works on the seed data: SN-000001 went Acme -> FastMove -> CityCare.
-- =====================================================================

-- STEP 1: the chain is healthy
SELECT * FROM verify_chain((SELECT item_id FROM items WHERE serial_no = 'SN-000001'));
--   expect is_valid = t

-- STEP 2: the ledger refuses edits (this MUST fail)
UPDATE custody_events SET to_org = 3 WHERE item_id = (SELECT item_id FROM items WHERE serial_no = 'SN-000001');
--   expect: ERROR  custody_events is an append-only ledger: UPDATE is not allowed

-- STEP 3: an attacker with database access switches the guard off, edits history, switches it back on
ALTER TABLE custody_events DISABLE TRIGGER custody_events_immutable;
UPDATE custody_events
   SET to_org = (SELECT org_id FROM organizations WHERE name = 'CityCare Pharmacy')
 WHERE event_id = (SELECT MIN(event_id) FROM custody_events
                   WHERE item_id = (SELECT item_id FROM items WHERE serial_no = 'SN-000001') AND event_type = 'transfer');
ALTER TABLE custody_events ENABLE TRIGGER custody_events_immutable;

-- STEP 4: verification now detects it
SELECT * FROM verify_chain((SELECT item_id FROM items WHERE serial_no = 'SN-000001'));
--   expect is_valid = f and broken_event_id = the edited event
--   In the browser, reload  /verify/SN-000001  -> "Record tampered", broken block in red

-- STEP 5: put the original value back so you can demo again
ALTER TABLE custody_events DISABLE TRIGGER custody_events_immutable;
UPDATE custody_events
   SET to_org = (SELECT org_id FROM organizations WHERE name = 'FastMove Logistics')
 WHERE event_id = (SELECT MIN(event_id) FROM custody_events
                   WHERE item_id = (SELECT item_id FROM items WHERE serial_no = 'SN-000001') AND event_type = 'transfer');
ALTER TABLE custody_events ENABLE TRIGGER custody_events_immutable;
SELECT * FROM verify_chain((SELECT item_id FROM items WHERE serial_no = 'SN-000001'));   -- is_valid = t again
