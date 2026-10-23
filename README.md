# TraceLedger — Decentralized Supply Chain Tracking & Verification

Every product's journey (manufacturer → distributor → retailer → consumer) is recorded as tamper-evident custody events.
Anyone can scan a QR code and see whether an item is authentic, whether its chain of custody is unbroken, and whether it was stored properly.

**Stack:** Next.js 15 (UI + API route handlers) · PostgreSQL (source of truth, ledger) · Neo4j (supply-network graph) · JWT auth with 5 roles.

## Status

| Part | State |
|---|---|
| Next.js frontend (all pages) | Done |
| API route handlers, auth, RBAC, validation | Done |
| Postgres + Neo4j connections, outbox sync | Done |
| Neo4j constraints and queries | Done |
| **PostgreSQL schema, functions, triggers, views, seed** | **To do** (see `db/postgres/CONTRACT.md`) |

## Setup

```bash
npm install
cp .env.example .env.local        # then edit values
docker compose up -d              # Postgres + Neo4j for local dev
# --- after the SQL files are written ---
psql "$DATABASE_URL" -f db/postgres/init.sql   # run from db/postgres folder: cd db/postgres && psql "$DATABASE_URL" -f init.sql
npm run neo4j-setup               # create Neo4j constraints
npm run create-admin -- admin@example.com "StrongPassword123" "Admin"
npm run dev                       # http://localhost:3000
```

## How it fits together

- **Browser** → Next.js pages → `/api/*` route handlers (JWT cookie + role check + Zod validation) → databases. The browser never talks to a database.
- **Postgres** holds users, orgs, products, batches, items, shipments, sensor readings, alerts and the hash-chain `custody_events` ledger. Hashing, ownership checks and atomic transfers live in SQL functions/triggers so the app cannot bypass them.
- **Neo4j** holds the relationship view (who shipped to whom, who held which item). Postgres writes each custody event to `graph_sync_outbox`; `src/lib/sync.ts` copies pending rows into Neo4j (idempotent `MERGE`). If Neo4j is down, rows wait and nothing is lost.
- **Config** is read from environment variables (`.env.local`, never committed).

## Roles

| Role | Can |
|---|---|
| admin | approve organizations, see all alerts, network, recall, analytics, run graph sync |
| manufacturer | create products and batches (prints QR labels), ship, recall impact, network |
| distributor / retailer | receive and forward shipments, add sensor readings; retailers mark items sold |
| auditor | view alerts, report suspected counterfeits |
| public | verify any serial at `/verify/<serial>` |

## Project layout

```
db/postgres/   CONTRACT.md + SQL files (to write)      db/neo4j/   constraints + queries
src/app/       pages and src/app/api route handlers    src/lib/    db, neo4j, auth, sync, verify
src/components shared UI                               scripts/    create-admin, neo4j-setup
```
