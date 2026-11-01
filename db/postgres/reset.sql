-- DESTRUCTIVE: permanently deletes all TraceLedger application data and schema objects.
-- Review this file before running it. Use only when you intentionally want a clean rebuild.
-- Back up important data first.
-- Example: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f reset.sql
\set ON_ERROR_STOP on

DROP TABLE IF EXISTS graph_sync_outbox, verification_logs, alerts, sensor_readings, custody_events,
                     shipment_items, shipments, items, batches, category_limits, products, users, organizations CASCADE;
DROP SEQUENCE IF EXISTS item_serial_seq;

\i init.sql
