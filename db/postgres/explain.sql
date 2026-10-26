-- =====================================================================
-- explain.sql - index speed-up demo (own scratch table, your real data is untouched)
-- Compare "Execution Time" in the two EXPLAIN outputs. ASCII only.
-- =====================================================================
SET client_min_messages = warning;
DROP TABLE IF EXISTS bench_readings;
CREATE TABLE bench_readings AS
SELECT g AS reading_id,
       (g % 2000) + 1 AS shipment_id,
       now() - (g || ' seconds')::interval AS ts,
       (random() * 10)::numeric(5,1) AS temperature
FROM generate_series(1, 500000) g;
ANALYZE bench_readings;

\echo === BEFORE: no index, expect a Seq Scan ===
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM bench_readings WHERE shipment_id = 1234 ORDER BY ts;

CREATE INDEX idx_bench_ship_ts ON bench_readings (shipment_id, ts);
ANALYZE bench_readings;

\echo === AFTER: composite index on (shipment_id, ts), expect an Index/Bitmap scan ===
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM bench_readings WHERE shipment_id = 1234 ORDER BY ts;

DROP TABLE bench_readings;
