# Test cases

The database test cases are automated in `db/postgres/tests.sql` (32 cases, all passing; the script rolls back so it never changes your data).
Run it from inside `db/postgres`:  `psql "<DATABASE_URL>" -f tests.sql`

| Group | Cases |
|---|---|
| Ledger integrity | T01-T07: valid chain, hash recomputation, UPDATE/DELETE/TRUNCATE blocked, duplicate genesis, non-custodian transfer |
| Atomic transfer | T08-T11: wrong sender rejected, failure midway rolls back completely, status cannot go backwards |
| Constraints and validation | T12-T23: expiry before manufacture, quantity 0, temperature range, invalid status, self-shipment, duplicate SKU/email, foreign key, role/org mismatch, manufacturer-only products, immutable serial, unapproved manufacturer |
| Sensor trigger | T24-T26: no alert in range, alert on breach, no duplicate alert |
| Neo4j outbox | T27-T28: one outbox row per event, payload has every field the sync needs |
| Tamper detection | T29-T31: edited history, restored history, deleted last event |
| Views | T32 |

## Application-level checks (run by hand with curl; all verified against PostgreSQL)
- No cookie gives 401; a manufacturer calling an admin-only API gives 403.
- A pending organization cannot create products (403) until an admin approves it.
- Dispatching the same shipment twice is rejected; a non-sender cannot dispatch.
- Scanning one serial from 3 cities creates a counterfeit alert and a "suspicious" verdict.
- Editing a ledger row with the guard trigger disabled makes `/api/verify` return "tampered".
- Not yet verified: the Neo4j sync and graph pages (they need a running Neo4j instance).
- Index timing: `db/postgres/explain.sql`.
