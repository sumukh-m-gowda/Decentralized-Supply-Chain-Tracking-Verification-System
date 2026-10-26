-- =====================================================================
-- functions.sql - stored functions: hashing, batch creation, atomic custody transfer, chain verification
-- Run after schema.sql.  (ASCII only, so it also runs cleanly from Windows psql)
-- =====================================================================
SET client_min_messages = warning;

-- ---------------------------------------------------------------------
-- compute_event_hash: the single place that defines how a ledger hash is made.
-- Used by BOTH the insert trigger and verify_chain(), so they can never disagree.
-- Time is formatted in UTC with microseconds so the text never depends on the session time zone.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION compute_event_hash(
    p_prev_hash text, p_item_id int, p_from_org int, p_to_org int, p_event_type text, p_event_time timestamptz
) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT encode(digest(concat_ws('|',
        COALESCE(p_prev_hash, 'GENESIS'),
        p_item_id::text,
        COALESCE(p_from_org::text, '-'),
        p_to_org::text,
        p_event_type,
        to_char(p_event_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
    ), 'sha256'), 'hex')
$$;

-- ---------------------------------------------------------------------
-- create_batch: one transaction creates the batch, its items (unique serials) and one genesis
-- custody event per item. The ledger trigger hashes each event and the outbox trigger queues it for Neo4j.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_batch(p_product_id int, p_mfg date, p_exp date, p_qty int)
RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
    v_org   int;
    v_batch int;
BEGIN
    SELECT org_id INTO v_org FROM products WHERE product_id = p_product_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % does not exist', p_product_id;
    END IF;
    IF (SELECT status FROM organizations WHERE org_id = v_org) <> 'approved' THEN
        RAISE EXCEPTION 'The manufacturer is not approved yet';
    END IF;

    INSERT INTO batches (product_id, manufacture_date, expiry_date, quantity)
    VALUES (p_product_id, p_mfg, p_exp, p_qty)          -- CHECK constraints validate dates and quantity
    RETURNING batch_id INTO v_batch;

    INSERT INTO items (batch_id, serial_no, current_owner_org, status)
    SELECT v_batch, 'SN-' || lpad(nextval('item_serial_seq')::text, 6, '0'), v_org, 'in_stock'
    FROM generate_series(1, p_qty);

    INSERT INTO custody_events (item_id, from_org, to_org, event_type)
    SELECT item_id, NULL, v_org, 'genesis' FROM items WHERE batch_id = v_batch ORDER BY item_id;

    RETURN v_batch;
END $$;

-- ---------------------------------------------------------------------
-- transfer_custody: ATOMIC handover of every item in a shipment (a single transaction).
-- Any failed check raises an exception and PostgreSQL rolls back everything done so far.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION transfer_custody(p_shipment_id int, p_actor_org int)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    s       shipments%ROWTYPE;
    v_count int;
    v_bad   int;
BEGIN
    SELECT * INTO s FROM shipments WHERE shipment_id = p_shipment_id FOR UPDATE;   -- lock: no double dispatch
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Shipment % does not exist', p_shipment_id;
    END IF;
    IF s.from_org <> p_actor_org THEN
        RAISE EXCEPTION 'Only the sending organization can dispatch this shipment';
    END IF;
    IF s.status <> 'created' THEN
        RAISE EXCEPTION 'Shipment is already %', s.status;
    END IF;
    IF (SELECT status FROM organizations WHERE org_id = s.to_org) <> 'approved' THEN
        RAISE EXCEPTION 'The receiving organization is not approved';
    END IF;

    PERFORM 1 FROM items WHERE item_id IN (SELECT item_id FROM shipment_items WHERE shipment_id = p_shipment_id) FOR UPDATE;

    SELECT count(*) INTO v_count FROM shipment_items WHERE shipment_id = p_shipment_id;
    IF v_count = 0 THEN
        RAISE EXCEPTION 'Shipment has no items';
    END IF;

    SELECT count(*) INTO v_bad
    FROM shipment_items si JOIN items i ON i.item_id = si.item_id
    WHERE si.shipment_id = p_shipment_id
      AND (i.current_owner_org <> p_actor_org OR i.status <> 'reserved');
    IF v_bad > 0 THEN
        RAISE EXCEPTION '% item(s) are not currently held by the sending organization', v_bad;
    END IF;

    -- ledger rows (the trigger links each one to the previous hash and checks the custodian)
    INSERT INTO custody_events (item_id, from_org, to_org, event_type, shipment_id)
    SELECT si.item_id, s.from_org, s.to_org, 'transfer', p_shipment_id
    FROM shipment_items si WHERE si.shipment_id = p_shipment_id ORDER BY si.item_id;

    UPDATE items i SET current_owner_org = s.to_org, status = 'in_transit'
    FROM shipment_items si WHERE si.shipment_id = p_shipment_id AND si.item_id = i.item_id;

    UPDATE shipments SET status = 'in_transit', dispatched_at = now() WHERE shipment_id = p_shipment_id;
END $$;

-- ---------------------------------------------------------------------
-- verify_chain: recompute every hash of one item and report whether the chain is intact.
--   is_valid        true only if every link matches and the last holder equals the item's current owner
--   broken_event_id first event where the chain breaks (NULL if intact)
--   event_count     number of events found
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION verify_chain(p_item_id int)
RETURNS TABLE (is_valid boolean, broken_event_id int, event_count int)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    r        record;
    v_prev   text := NULL;
    v_count  int := 0;
    v_broken int := NULL;
    v_last_event int;
    v_last_to    int;
    v_owner      int;
BEGIN
    FOR r IN SELECT * FROM custody_events WHERE item_id = p_item_id ORDER BY event_id LOOP
        v_count := v_count + 1;
        IF v_broken IS NULL THEN
            IF r.prev_hash IS DISTINCT FROM v_prev
               OR r.curr_hash IS DISTINCT FROM compute_event_hash(v_prev, r.item_id, r.from_org, r.to_org, r.event_type, r.event_time) THEN
                v_broken := r.event_id;
            END IF;
        END IF;
        v_prev := r.curr_hash;
        v_last_event := r.event_id;
        v_last_to := r.to_org;
    END LOOP;

    -- catches a deleted last event: the final holder in the ledger must be the item's current owner
    IF v_broken IS NULL AND v_count > 0 THEN
        SELECT current_owner_org INTO v_owner FROM items WHERE item_id = p_item_id;
        IF v_owner IS DISTINCT FROM v_last_to THEN
            v_broken := v_last_event;
        END IF;
    END IF;

    RETURN QUERY SELECT (v_broken IS NULL AND v_count > 0), v_broken, v_count;
END $$;
