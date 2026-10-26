# TraceLedger — Decentralized Supply Chain Tracking & Verification System

PES University · DBMS Experiential Learning, Level 3 project · Team of 2

---

## 1. What exactly are we building?

A website where the journey of a physical product is recorded as a chain of **custody events**, and anyone can check it.

**The story in one paragraph.** A manufacturer makes a batch of 100 items. Each item gets its own serial number and QR code. When the manufacturer ships items to a distributor, the system records a handover event. The distributor later hands over to a retailer, and the retailer sells to a customer. Every handover is saved in a ledger where each record contains a fingerprint (SHA-256 hash) of the record before it. If anyone edits an old record, every fingerprint after it stops matching, and the system shows "tampered". A customer who scans the QR code sees the full timeline and a verdict: **Authentic**, **Needs a closer look**, or **Record tampered**.

**What "decentralized" means here.** We do not build a blockchain. Instead:
- No single company owns the trail. Each organization can only record handovers of items it currently holds.
- Records are chained by hashes and cannot be edited or deleted (the database blocks it).
- Anyone can re-verify the chain independently.

Say this clearly in the viva. A real blockchain would hide the DBMS concepts the course is testing.

### Who uses it

| Role | What they do |
|---|---|
| **Admin** | Approves organizations, resolves alerts, views the network graph, recall impact and analytics |
| **Manufacturer** | Creates products and batches, prints QR labels, ships items, runs recall checks |
| **Distributor** | Receives shipments, forwards them, uploads temperature readings |
| **Retailer** | Receives shipments, marks items sold |
| **Auditor** | Reviews alerts, reports suspected counterfeits |
| **Public (no login)** | Scans a QR code and sees the verdict at `/verify/<serial>` |

---

## 2. Tech stack and why each database exists

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, Recharts, react-force-graph, qrcode.react |
| Backend | Next.js Route Handlers (`src/app/api/...`), Zod validation, bcrypt, JWT (jose) |
| SQL database | **PostgreSQL** |
| NoSQL database | **Neo4j** (graph) |
| Version control | Git + GitHub |

This is **Option 1 (SQL + NoSQL)** from the project brief.

**Why PostgreSQL** holds users, organizations, products, batches, items, shipments, sensor readings, alerts and the custody ledger. This data is structured and needs strict integrity: foreign keys, CHECK constraints, ACID transactions, triggers. The ledger must never end up half-written.

**Why Neo4j** holds the supply network: which organization shipped to which, and which organization held which item. Questions like "this batch is faulty, who received any of it?" or "did an item come back to someone who already held it?" are multi-hop traversals. In Cypher each is a few lines. In SQL they need recursive joins.

**Why not sensor data in Neo4j?** Temperature readings are high-volume time-series rows. They live in Postgres in `sensor_readings`, indexed on `(shipment_id, ts)`.

---

## 3. How the pieces connect

```
 Browser (Next.js pages)
        │  fetch("/api/...")   cookie: JWT (httpOnly)
        ▼
 Next.js Route Handlers  ── middleware.ts checks the JWT and the role
   • validate input (Zod)
   • call the database
        │                                   │
        │ SQL (pg, DATABASE_URL)            │ Cypher (neo4j-driver)
        ▼                                   ▼
 PostgreSQL  ──────── graph_sync_outbox ────► Neo4j
 (source of truth)    (src/lib/sync.ts)       (relationship view)
```

Rules to remember:
1. **The browser never talks to a database.** Everything goes through `/api/*`.
2. **Postgres is the source of truth.** Neo4j can be rebuilt from it at any time.
3. **The important logic is inside Postgres** (functions and triggers), so even our own app cannot bypass it. The API stays thin.
4. **Credentials only live in `.env.local`**, never in code (brief item 10).

### How Postgres and Neo4j stay in sync (the outbox pattern)
1. A custody event is inserted in Postgres. In the same transaction, a row describing it is added to `graph_sync_outbox`.
2. After dispatching a shipment or creating a batch, the app calls `syncOutbox()`, which reads unsynced rows and runs a Cypher `MERGE` for each one in Neo4j.
3. The row is marked `synced = true`.
4. If Neo4j is down, rows stay pending. The admin page has a "Sync pending events" button to retry. Nothing is lost, and re-running is safe because every write is a `MERGE`.

### How verification works
`GET /api/verify/<serial>` (public) does this:
1. Looks up the item. If it does not exist the verdict is **unknown**.
2. Calls the SQL function `verify_chain(item_id)`, which recomputes every hash. A broken link gives **tampered**.
3. Checks unresolved alerts, expiry date, and the cities the serial was scanned from in the last 24 hours. Any problem gives **suspicious**. Three or more cities also creates a counterfeit alert.
4. Writes a row to `verification_logs` and returns the verdict with the timeline.

---

## 4. Current status

| Part | State |
|---|---|
| Frontend: all pages | ✅ Written, builds cleanly |
| Backend: 25 API routes, auth, roles, validation | ✅ Written, builds cleanly |
| DB connections, outbox sync, verify logic | ✅ Written |
| Neo4j constraints and Cypher queries | ✅ Written |
| PostgreSQL: schema, functions, triggers, views, seed, queries, tests | ✅ Written and tested (see `db/postgres/README.md`) |
| Neo4j sync and graph pages tested against a live Neo4j | ⛔ To do on your machine |
| ER diagram, report, screenshots | ⛔ To do |

The app was run end to end against PostgreSQL 16 (register, approve, batch, ship, sensor alert, verify, tamper and counterfeit scan all worked). It has **not** been run against a live Neo4j yet; that is the first thing to check on your machine.

---

## 5. First-time setup (do this now)

### Prerequisites
- Node.js 20 or newer
- PostgreSQL 16 installed locally (includes pgAdmin and psql), or a free cloud Postgres such as Neon or Supabase
- Neo4j: **Neo4j Aura Free** (cloud, easiest) or Neo4j Desktop (local)
- Git
- A way to run SQL files: `psql`, pgAdmin or DBeaver

### Step by step

```bash
# 1. Install packages
npm install

# 2. Create your environment file
cp .env.example .env.local          # on Windows PowerShell: copy .env.example .env.local
```

Edit `.env.local`:

| Variable | Meaning | Local default |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | `postgres://postgres:YOUR_PASSWORD@localhost:5432/supplychain` |
| `NEO4J_URI` | Neo4j Bolt address | `neo4j://localhost:7687` (Desktop) or `neo4j+s://xxxx.databases.neo4j.io` (Aura) |
| `NEO4J_USER` | Neo4j username | `neo4j` |
| `NEO4J_PASSWORD` | Neo4j password | the password you set (Aura shows it once at creation) |
| `NEO4J_DATABASE` | Optional database name | leave unset locally |
| `JWT_SECRET` | Signs login cookies. **Use a long random string** | generate with `openssl rand -hex 32` |

```bash
# 3. Prepare the databases (no Docker needed)
#    Postgres: create an empty database named  supplychain  (pgAdmin, or: createdb supplychain)
#    Neo4j:    create a free Aura instance (or a Neo4j Desktop database) and copy its URI + password into .env.local

# 4. Create the Neo4j constraints
npm run neo4j-setup
```

Then load the SQL (section 6):

```bash
# Run every SQL file in order (needs psql on your PATH):
cd db/postgres
psql "postgres://postgres:YOUR_PASSWORD@localhost:5432/supplychain" -v ON_ERROR_STOP=1 -f init.sql
# No psql? Open each file in pgAdmin or DBeaver and run them in this order:
# schema.sql, functions.sql, triggers.sql, views.sql, seed.sql
```

```bash
# 5. Create the first admin (admins cannot self-register)
npm run create-admin -- admin@example.com "StrongPassword123" "Admin"

# 6. Run the app
npm run dev          # http://localhost:3000
```

---

## 6. The PostgreSQL part (done)

All SQL is written, tested and documented in **`db/postgres/README.md`**: tables, constraints, indexes, the hash-chain trigger, the append-only ledger, atomic `transfer_custody()`, `verify_chain()`, views, migrations, seed data, 11 report queries, the index benchmark, 32 automated tests and the tamper demo script.

Load it (from `db/postgres`):
```bash
psql "postgres://postgres:YOUR_PASSWORD@localhost:5432/supplychain" -v ON_ERROR_STOP=1 -f init.sql
psql "postgres://postgres:YOUR_PASSWORD@localhost:5432/supplychain" -f tests.sql     # expect: passed 32, failed 0
```
The seed creates demo accounts (password `Password123` for all): `admin@`, `manufacturer@`, `distributor@`, `retailer@`, `auditor@traceledger.test`. You can skip `npm run create-admin`.

---

## 7. NEXT STEP: run it end to end on your machine

1. `npm run dev`, open http://localhost:3000.
2. Sign in with the seeded accounts (see section 6), or **register** new ones at `/register`. New organizations stay pending until the admin approves them (admin → **Organizations**).
3. Try `/verify/SN-000001` right away: the seed already contains a finished custody chain.
4. Sign in as the manufacturer → **Products and batches** → add a product, create a batch of 10, open **QR codes**.
5. **Shipments** → New shipment → pick the distributor and some items → open it → **Dispatch and hand over custody**.
6. Sign in as the distributor → open the shipment → add temperature readings → try an out-of-range one → **Mark as received**.
7. Repeat distributor → retailer. Retailer can mark items sold.
8. Open `/verify/SN-000001` (use a real serial): you should see the timeline and "Authentic".
9. Admin → **Sync pending events**, then check **Network** and **Recall** (Neo4j data).

### Tamper demo (your strongest moment in the viva)
```sql
ALTER TABLE custody_events DISABLE TRIGGER custody_events_immutable;
UPDATE custody_events SET to_org = 99 WHERE event_id = 2;   -- any change to a past record
ALTER TABLE custody_events ENABLE TRIGGER custody_events_immutable;
```
Reload `/verify/<serial>`: the verdict becomes **Record tampered** and the broken block is highlighted in red.

---

## 8. If something goes wrong

| Message or symptom | Cause and fix |
|---|---|
| "Database objects are missing. Run the scripts in db/postgres first." | A table or function from `CONTRACT.md` does not exist yet, or a column name differs |
| "Not signed in" on every page | `JWT_SECRET` missing or shorter than 16 characters in `.env.local`. Restart `npm run dev` after editing |
| Login works but you cannot create anything | The organization is still `pending`. Approve it as admin |
| Network or Recall pages are empty | Neo4j has no data yet. Dispatch a shipment, then use admin → Sync. Check the Neo4j credentials and that the instance is running |
| "NEO4J_URI, NEO4J_USER and NEO4J_PASSWORD must be set" | Fill the Neo4j variables in `.env.local` |
| `connect ECONNREFUSED 5432` | Postgres is not running, or `DATABASE_URL` has the wrong host/port/password. Start the PostgreSQL service and re-check |
| Verify shows tampered for a normal item | `verify_chain` recomputes the hash differently from the trigger. Use the same fields and the same text formatting in both |

---

## 9. Project layout

```
db/
  postgres/   CONTRACT.md (spec), schema.sql, functions.sql, triggers.sql, views.sql, seed.sql, init.sql
  neo4j/      constraints.cypher, queries.cypher
src/
  app/        pages (login, register, verify, admin, manufacturer, shipments, inventory,
              network, recall, analytics, alerts)
  app/api/    route handlers (auth, orgs, products, batches, items, shipments, verify,
              alerts, stats, graph, sync)
  lib/        db.ts, neo4j.ts, auth.ts, jwt.ts, sync.ts, verify.ts, validators.ts, api.ts, roles.ts
  components/ Nav, SerialForm, small shared pieces
  middleware.ts   login and role guard for pages and APIs
scripts/      create-admin.mjs, neo4j-setup.mjs
docs/         ER diagram, schema, report, screenshots (to produce)
tests/        test case list
```

### API summary
`/api/auth/*` register, login, logout, me · `/api/orgs` and `/api/orgs/:id/approve` · `/api/products` · `/api/batches` and `/api/batches/:id/items` · `/api/items` and `/api/items/sell` · `/api/shipments`, `/:id`, `/:id/dispatch`, `/:id/receive`, `/:id/sensors` · `/api/verify/:serial` (public) · `/api/alerts` and `/api/alerts/:id` · `/api/stats` · `/api/graph/route/:serial`, `/recall/:batchId`, `/network`, `/anomalies` · `/api/sync/run`

---

## 10. Project brief checklist

| Brief item | Where it is covered |
|---|---|
| Not simple CRUD (1, 17) | Hash-chained ledger, verification, recall traversal, counterfeit detection |
| 2-member team (2) | Split below |
| SQL + NoSQL (3) | PostgreSQL + Neo4j |
| ER diagram and relational schema (4) | `docs/` — **to draw** from the table list in `CONTRACT.md` |
| DDL: CREATE/ALTER/DROP, keys, constraints, indexes, views (5) | `schema.sql`, `views.sql` — **to write** |
| DML and queries with JOIN, GROUP BY, HAVING, ORDER BY, subqueries (6) | Already used in `/api/stats`, `/api/shipments`, `/api/items`, verify; add more in the report |
| 4 advanced SQL features + 1 NoSQL (7) | Transactions, triggers, functions, views, indexes, full-text search · Cypher traversals |
| Next.js interface (9) | Done |
| Backend/API layer, no hard-coded secrets (10) | Done, `.env.local` |
| Authentication, 2+ roles (11) | Done, 5 roles |
| Validation at database level (12) | CHECK/UNIQUE/FK/triggers — **to write** (Zod is only a first line) |
| Documentation (13) | `docs/` — **to write** |
| Git/GitHub with README and individual commits (14) | This README; each member commits on their own branch |
| Demo and test cases (15) | Demo flow in section 7; list in `tests/README.md` |

---

## 11. Suggested plan from here

| Order | Task | Output |
|---|---|---|
| 1 | Draw the ER diagram and relational schema (3NF) | `docs/er-diagram`, `docs/schema` |
| 2 | Write `schema.sql` (done) | Tables and indexes |
| 3 | Triggers and functions (done) | Working ledger and `verify_chain` |
| 4 | Views and seed data (done) | Demo data |
| 5 | Run section 7 on your machine incl. Neo4j, fix mismatches | Working system |
| 6 | Paste `tests.sql` and `explain.sql` output into the report | Test report |
| 7 | Optional bonus: pgvector similarity search over inspection reports | Extra credit |
| 8 | Screenshots, report, GitHub cleanup, demo rehearsal | Final submission |

### Splitting work between two members
The brief says both members must touch the database and the application.
- **Member A:** SQL schema, ledger triggers and functions, auth and ledger APIs, verify page.
- **Member B:** Neo4j sync and queries, shipments and sensor flows, network, recall and analytics pages.
- **Both:** write queries, test cases and documentation. Use separate Git branches and commit often, because commits are checked for individual contribution.

### Git basics
```bash
git init && git add . && git commit -m "Initial project scaffold"
git branch -M main && git remote add origin <your-repo-url> && git push -u origin main
```
Never commit `.env.local` (it is already in `.gitignore`).

---

## 12. Viva talking points

1. Why SQL for the ledger: integrity, ACID, triggers. Why Neo4j for the network: multi-hop traversal.
2. Why no blockchain: the DBMS concepts are the point. Hash chaining plus immutability triggers gives tamper evidence.
3. The outbox pattern: how two databases stay consistent without distributed transactions.
4. Where the validation lives: in the database, so the app cannot bypass it.
5. Show the tamper demo, then the recall query.

---

## 13. Known limits (be honest about these in the report)

- Neo4j sync is triggered right after the API call and can also be run manually. In a serverless deployment you would use a scheduled job instead. Locally this is fine.
- Counterfeit detection by scan city relies on a header or the demo "city" box. In production you would use a geolocation service.
- Passwords are bcrypt-hashed and sessions last 8 hours. There is no password reset or email verification.
- This is a coursework system, not a production traceability product.
