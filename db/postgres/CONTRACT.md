# What the app expects from PostgreSQL

The Next.js code is finished and already calls these tables and functions.
When we write the SQL, it must match this contract (or we change the code to match).

## Tables and columns

| Table | Columns the app uses |
|---|---|
| `organizations` | org_id PK, name, type (`manufacturer`/`distributor`/`retailer`), license_no, status (`pending`/`approved`/`rejected`), created_at |
| `users` | user_id PK, org_id FK (NULL for admin and auditor), name, email UNIQUE, password_hash, role (`admin`/`manufacturer`/`distributor`/`retailer`/`auditor`) |
| `products` | product_id PK, org_id FK, name, category, sku UNIQUE |
| `batches` | batch_id PK, product_id FK, manufacture_date DATE, expiry_date DATE, quantity — CHECK (expiry_date > manufacture_date) |
| `items` | item_id PK, batch_id FK, serial_no UNIQUE, current_owner_org FK, status (`in_stock`/`reserved`/`in_transit`/`sold`) |
| `shipments` | shipment_id PK, from_org FK, to_org FK, status (`created`/`in_transit`/`delivered`), created_by FK users, created_at, dispatched_at, delivered_at |
| `shipment_items` | shipment_id FK, item_id FK, PK (shipment_id, item_id) |
| `custody_events` | event_id PK, item_id FK, from_org FK NULL, to_org FK, event_type (`genesis`/`transfer`), event_time, prev_hash NULL, curr_hash — the hash-chain ledger |
| `sensor_readings` | reading_id PK, shipment_id FK, ts, temperature NUMERIC, humidity NUMERIC NULL, lat NULL, lng NULL |
| `alerts` | alert_id PK, item_id FK NULL, shipment_id FK NULL, type, severity (`low`/`medium`/`high`/`critical`), description, resolved BOOL DEFAULT false, created_at DEFAULT now() |
| `verification_logs` | log_id PK, item_id FK, scanned_at DEFAULT now(), scan_city, result |
| `graph_sync_outbox` | id PK, payload JSONB, synced BOOL DEFAULT false, created_at, synced_at NULL |

## Functions the app calls

| Function | Called from | Must do |
|---|---|---|
| `create_batch(product_id int, mfg date, exp date, qty int) RETURNS int` | `POST /api/batches` | Insert the batch, create `qty` items with unique serials (owner = manufacturer, status `in_stock`), insert a `genesis` custody event for each, and one outbox row per event. Return batch_id. |
| `transfer_custody(shipment_id int, actor_org int) RETURNS void` | `PATCH /api/shipments/:id/dispatch` | One transaction: shipment must be `created` and `from_org = actor_org`; every item must be currently owned by actor_org; insert a `transfer` custody event per item (prev_hash, curr_hash); set items to `in_transit` and owner to `to_org`; set shipment `in_transit` + `dispatched_at`; write outbox rows. `RAISE EXCEPTION` on any violation (the API turns it into a 400). |
| `verify_chain(item_id int) RETURNS TABLE(is_valid bool, broken_event_id int, event_count int)` | `GET /api/verify/:serial` | Recompute every hash in order; report the first event where it does not match. |

## Triggers we need

- Compute `curr_hash` (SHA-256 of prev_hash + item + from + to + type + time) on `custody_events` insert.
- Block UPDATE and DELETE on `custody_events`.
- On `sensor_readings` insert, if temperature is outside the allowed range, insert an `alerts` row (`type = 'temperature_breach'`).

## Outbox payload (JSON) — read by `src/lib/sync.ts`

```json
{ "event_id": 1, "event_type": "transfer", "event_time": "2026-01-01T10:00:00Z",
  "item_id": 5, "serial_no": "SN-000005", "batch_id": 2, "product_id": 3, "product_name": "...",
  "manufacturer_org": 1, "manufacturer_name": "...",
  "from_org": 1, "from_name": "...", "from_type": "manufacturer",
  "to_org": 2, "to_name": "...", "to_type": "distributor", "shipment_id": 7 }
```
For `genesis` events, `from_*` and `shipment_id` are null.

## Also expected
Indexes on `items(serial_no)`, `custody_events(item_id, event_time)`, `sensor_readings(shipment_id, ts)`, and a GIN index on `to_tsvector('english', products.name)` (used by inventory search).
