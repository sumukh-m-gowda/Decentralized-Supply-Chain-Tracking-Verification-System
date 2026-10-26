# PostgreSQL part - how to run it

Everything here was tested on PostgreSQL 16 (32 of 32 database tests pass, and the full app flow was run against it).

## Files and what they do

| File | Purpose | Brief item |
|---|---|---|
| `schema.sql` | 13 tables, primary and foreign keys, CHECK/UNIQUE/NOT NULL, 16 indexes (incl. partial and GIN full-text). **Drops everything first.** | DDL, constraints, indexes |
| `functions.sql` | `compute_event_hash`, `create_batch`, `transfer_custody` (atomic transaction), `verify_chain` | Transactions, stored functions |
| `triggers.sql` | Hash-chain trigger, append-only ledger, Neo4j outbox, temperature-alert trigger, 4 data-validation triggers | Triggers, DB-level validation |
| `views.sql` | `v_item_timeline`, `v_org_inventory`, `v_active_alerts`, `v_shipment_summary` | Views |
| `migrations.sql` | ALTER and DROP demonstrations (safe to re-run) | ALTER, DROP |
| `seed.sql` | Demo organizations, users, products, batches, 4 shipments, readings, one alert | Demo data |
| `init.sql` | Runs all of the above in order | |
| `queries.sql` | 11 report queries (JOIN, GROUP BY, HAVING, subquery, window LAG, recursive CTE, full-text) + DML and rollback demos | DML, queries |
| `explain.sql` | Index vs no index with `EXPLAIN ANALYZE` (about 97 ms down to 0.5 ms in our test) | Indexing |
| `tests.sql` | 32 automated test cases, prints PASS/FAIL, rolls back (your data is safe) | Test cases |
| `tamper_demo.sql` | The live tamper demo, step by step | Demo |
| `CONTRACT.md` | What the Next.js app expects from the database | |

## Run it

1. Create an empty database called `supplychain` (pgAdmin: right-click Databases > Create > Database).
2. Put its connection string in `.env.local` as `DATABASE_URL`.
3. Load everything. Open a terminal **in this folder** (`db/postgres`):

```
psql "postgres://postgres:YOUR_PASSWORD@localhost:5432/supplychain" -v ON_ERROR_STOP=1 -f init.sql
```

On Windows `psql` is usually at `C:\Program Files\PostgreSQL\16\bin\psql.exe`. If `psql` is not recognized, either use the full path in quotes, or use pgAdmin: open **Query Tool**, use the folder icon to open each file, and press F5, in this order:
`schema.sql, functions.sql, triggers.sql, views.sql, migrations.sql, seed.sql`.

4. Run the tests (needs `psql`, because the script uses psql commands):
```
psql "postgres://postgres:YOUR_PASSWORD@localhost:5432/supplychain" -f tests.sql
```
You should end with `passed 32, failed 0`.

`explain.sql` also needs `psql`. `queries.sql` and `tamper_demo.sql` can be run in pgAdmin or psql, a statement at a time. One statement in `queries.sql` is meant to fail (the rollback demo), so run it **without** `ON_ERROR_STOP`.

## Demo accounts (created by seed.sql, password for all: `Password123`)

| Email | Role | Organization |
|---|---|---|
| admin@traceledger.test | admin | none |
| manufacturer@traceledger.test | manufacturer | Acme Pharma Ltd |
| distributor@traceledger.test | distributor | FastMove Logistics |
| retailer@traceledger.test | retailer | CityCare Pharmacy |
| auditor@traceledger.test | auditor | none |
| coastal@ / greenleaf@traceledger.test | distributor / retailer | Coastal Cold Chain / GreenLeaf Chemists |
| pending@traceledger.test | manufacturer | NewLeaf Foods (still pending: approve it as admin) |

With the seed you do **not** need `npm run create-admin`.

## Good serials to try on `/verify/<serial>`

| Serial | What you see |
|---|---|
| SN-000001 | Authentic: Acme -> FastMove -> CityCare, 3 events |
| SN-000013 | Suspicious: its shipment has an open temperature-breach alert |
| SN-000019 | Authentic: still in the manufacturer's stock (genesis event only) |
| FAKE-1 (any serial that does not exist) | Not recognised |
| SN-000001 after `tamper_demo.sql` steps 3 and 4 | Record tampered |
| SN-000008 scanned with 3 different cities in the "simulate a scan" box | Suspicious, plus a counterfeit alert |

## Design notes you can quote in the viva

- **One hash definition.** `compute_event_hash()` is used by both the insert trigger and `verify_chain()`, so they can never disagree. Time is formatted in UTC with microseconds so session time zones cannot change the hash.
- **Append-only ledger.** Row triggers block UPDATE and DELETE, a statement trigger blocks TRUNCATE, and the foreign keys use `ON DELETE RESTRICT` so nothing can cascade into the ledger.
- **Custody is enforced twice.** `transfer_custody()` checks ownership, and the ledger trigger independently refuses an event whose sender is not the previous receiver.
- **Atomic transfer.** If any item fails, PostgreSQL rolls back every event, owner change and status change of that shipment (tests T09 and T10).
- **Truncation is detected.** `verify_chain()` also checks that the last holder in the ledger equals `items.current_owner_org`, which catches a deleted final event (test T31).
- **The outbox is written by a trigger**, so every ledger event, from any code path, is queued for Neo4j.
- **Temperature limits live in a table** (`category_limits`), not in code: Pharma 2 to 8 C, Food -2 to 6 C, Electronics -20 to 50 C, default -10 to 40 C.
