-- =====================================================================
-- schema.sql  -  TraceLedger tables, constraints and indexes (PostgreSQL 16)
-- Safe to re-run: drops everything first.   Run order: schema -> functions -> triggers -> views -> migrations -> seed
-- =====================================================================

SET client_min_messages = warning;
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- provides digest() for SHA-256

-- ---------- clean slate (DDL: DROP) ----------
DROP TABLE IF EXISTS graph_sync_outbox, verification_logs, alerts, sensor_readings, custody_events,
                     shipment_items, shipments, items, batches, category_limits, products, users, organizations CASCADE;
DROP SEQUENCE IF EXISTS item_serial_seq;

-- ---------- organizations ----------
CREATE TABLE organizations (
    org_id      SERIAL PRIMARY KEY,
    name        VARCHAR(120) NOT NULL,
    type        VARCHAR(20)  NOT NULL CHECK (type IN ('manufacturer','distributor','retailer')),
    license_no  VARCHAR(60)  NOT NULL,
    status      VARCHAR(20)  NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_org_license UNIQUE (license_no)
);

-- ---------- users (admin/auditor have no organization) ----------
CREATE TABLE users (
    user_id        SERIAL PRIMARY KEY,
    org_id         INT REFERENCES organizations(org_id) ON DELETE RESTRICT,
    name           VARCHAR(100) NOT NULL,
    email          VARCHAR(254) NOT NULL,
    password_hash  TEXT         NOT NULL,
    role           VARCHAR(20)  NOT NULL CHECK (role IN ('admin','manufacturer','distributor','retailer','auditor')),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT chk_email_format CHECK (email LIKE '%_@_%._%'),
    CONSTRAINT chk_role_org CHECK (
        (role IN ('admin','auditor') AND org_id IS NULL) OR
        (role IN ('manufacturer','distributor','retailer') AND org_id IS NOT NULL))
);

-- ---------- products ----------
CREATE TABLE products (
    product_id  SERIAL PRIMARY KEY,
    org_id      INT NOT NULL REFERENCES organizations(org_id) ON DELETE RESTRICT,   -- the manufacturer
    name        VARCHAR(120) NOT NULL,
    category    VARCHAR(60)  NOT NULL,
    sku         VARCHAR(60)  NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_products_sku UNIQUE (sku)
);

-- Allowed storage temperature per product category (used by the sensor trigger).
CREATE TABLE category_limits (
    category  VARCHAR(60) PRIMARY KEY,
    min_temp  NUMERIC(5,1) NOT NULL,
    max_temp  NUMERIC(5,1) NOT NULL,
    CONSTRAINT chk_limits CHECK (min_temp < max_temp)
);
INSERT INTO category_limits VALUES ('default', -10, 40), ('Pharma', 2, 8), ('Food', -2, 6), ('Electronics', -20, 50);

-- ---------- batches ----------
CREATE TABLE batches (
    batch_id          SERIAL PRIMARY KEY,
    product_id        INT  NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
    manufacture_date  DATE NOT NULL,
    expiry_date       DATE NOT NULL,
    quantity          INT  NOT NULL CHECK (quantity BETWEEN 1 AND 10000),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_batch_dates CHECK (expiry_date > manufacture_date)
);

-- ---------- items (one row per physical unit) ----------
CREATE SEQUENCE item_serial_seq START 1;
CREATE TABLE items (
    item_id            SERIAL PRIMARY KEY,
    batch_id           INT NOT NULL REFERENCES batches(batch_id) ON DELETE RESTRICT,
    serial_no          VARCHAR(40) NOT NULL,
    current_owner_org  INT NOT NULL REFERENCES organizations(org_id) ON DELETE RESTRICT,
    status             VARCHAR(20) NOT NULL DEFAULT 'in_stock' CHECK (status IN ('in_stock','reserved','in_transit','sold')),
    CONSTRAINT uq_items_serial UNIQUE (serial_no)
);

-- ---------- shipments ----------
CREATE TABLE shipments (
    shipment_id    SERIAL PRIMARY KEY,
    from_org       INT NOT NULL REFERENCES organizations(org_id) ON DELETE RESTRICT,
    to_org         INT NOT NULL REFERENCES organizations(org_id) ON DELETE RESTRICT,
    status         VARCHAR(20) NOT NULL DEFAULT 'created' CHECK (status IN ('created','in_transit','delivered')),
    created_by     INT REFERENCES users(user_id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    dispatched_at  TIMESTAMPTZ,
    delivered_at   TIMESTAMPTZ,
    CONSTRAINT chk_ship_parties CHECK (from_org <> to_org),
    CONSTRAINT chk_ship_times   CHECK (delivered_at IS NULL OR dispatched_at IS NULL OR delivered_at >= dispatched_at)
);

-- many-to-many: which items travel in which shipment
CREATE TABLE shipment_items (
    shipment_id  INT NOT NULL REFERENCES shipments(shipment_id) ON DELETE CASCADE,
    item_id      INT NOT NULL REFERENCES items(item_id) ON DELETE RESTRICT,
    PRIMARY KEY (shipment_id, item_id)
);

-- ---------- custody_events: the tamper-evident hash-chained ledger ----------
CREATE TABLE custody_events (
    event_id     SERIAL PRIMARY KEY,
    item_id      INT NOT NULL REFERENCES items(item_id) ON DELETE RESTRICT,
    from_org     INT REFERENCES organizations(org_id) ON DELETE RESTRICT,     -- NULL for the genesis event
    to_org       INT NOT NULL REFERENCES organizations(org_id) ON DELETE RESTRICT,
    event_type   VARCHAR(20) NOT NULL CHECK (event_type IN ('genesis','transfer')),
    shipment_id  INT REFERENCES shipments(shipment_id) ON DELETE RESTRICT,
    event_time   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    prev_hash    CHAR(64),                       -- NULL for the first event of an item
    curr_hash    CHAR(64) NOT NULL,              -- filled by trigger
    CONSTRAINT chk_genesis_shape CHECK (
        (event_type = 'genesis'  AND from_org IS NULL AND prev_hash IS NULL) OR
        (event_type = 'transfer' AND from_org IS NOT NULL AND prev_hash IS NOT NULL))
);

-- ---------- sensor readings (IoT temperature/humidity/GPS) ----------
CREATE TABLE sensor_readings (
    reading_id   SERIAL PRIMARY KEY,
    shipment_id  INT NOT NULL REFERENCES shipments(shipment_id) ON DELETE CASCADE,
    ts           TIMESTAMPTZ NOT NULL DEFAULT now(),
    temperature  NUMERIC(5,1) NOT NULL CHECK (temperature BETWEEN -100 AND 100),
    humidity     NUMERIC(5,1) CHECK (humidity BETWEEN 0 AND 100),
    lat          NUMERIC(9,6) CHECK (lat BETWEEN -90 AND 90),
    lng          NUMERIC(9,6) CHECK (lng BETWEEN -180 AND 180)
);

-- ---------- alerts ----------
CREATE TABLE alerts (
    alert_id     SERIAL PRIMARY KEY,
    item_id      INT REFERENCES items(item_id) ON DELETE CASCADE,
    shipment_id  INT REFERENCES shipments(shipment_id) ON DELETE CASCADE,
    type         VARCHAR(40) NOT NULL CHECK (type IN ('temperature_breach','counterfeit_suspected','counterfeit_report','delay')),
    severity     VARCHAR(10) NOT NULL CHECK (severity IN ('low','medium','high','critical')),
    description  TEXT NOT NULL,
    resolved     BOOLEAN NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- verification_logs: every public scan ----------
CREATE TABLE verification_logs (
    log_id      SERIAL PRIMARY KEY,
    item_id     INT NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
    scanned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    scan_city   VARCHAR(60) NOT NULL DEFAULT 'unknown',
    result      VARCHAR(20) NOT NULL CHECK (result IN ('authentic','suspicious','tampered','unknown'))
);

-- ---------- graph_sync_outbox: Postgres -> Neo4j queue ----------
CREATE TABLE graph_sync_outbox (
    id          SERIAL PRIMARY KEY,
    payload     JSONB NOT NULL,
    synced      BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    synced_at   TIMESTAMPTZ
);

-- =====================================================================
-- Indexes (UNIQUE constraints above already create indexes on email, sku, serial_no, license_no)
-- =====================================================================
CREATE INDEX idx_items_owner_status   ON items (current_owner_org, status);
CREATE INDEX idx_items_batch          ON items (batch_id);
CREATE INDEX idx_batches_product      ON batches (product_id);
CREATE INDEX idx_products_org         ON products (org_id);
CREATE INDEX idx_custody_item_time    ON custody_events (item_id, event_time);       -- timeline of one item
CREATE INDEX idx_custody_shipment     ON custody_events (shipment_id);
CREATE INDEX idx_shipments_from       ON shipments (from_org, status);
CREATE INDEX idx_shipments_to         ON shipments (to_org, status);
CREATE INDEX idx_shipitems_item       ON shipment_items (item_id);
CREATE INDEX idx_sensor_ship_ts       ON sensor_readings (shipment_id, ts);          -- readings of one shipment, in time order
CREATE INDEX idx_alerts_open          ON alerts (created_at DESC) WHERE resolved = false;   -- partial index: open alerts only
CREATE INDEX idx_alerts_item          ON alerts (item_id);
CREATE INDEX idx_alerts_shipment      ON alerts (shipment_id);
CREATE INDEX idx_verif_item_time      ON verification_logs (item_id, scanned_at);   -- counterfeit city check
CREATE INDEX idx_outbox_pending       ON graph_sync_outbox (id) WHERE synced = false;
CREATE INDEX idx_products_name_fts    ON products USING GIN (to_tsvector('english', name));   -- full-text search
