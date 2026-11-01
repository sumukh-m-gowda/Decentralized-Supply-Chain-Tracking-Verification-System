-- Initialize a NEW/EMPTY database only. Existing tables cause a safe failure.
-- For a deliberate destructive reset, review and run reset.sql instead.
-- Example: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f init.sql
\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
    IF to_regclass('public.organizations') IS NOT NULL
       OR to_regclass('public.items') IS NOT NULL
       OR to_regclass('public.custody_events') IS NOT NULL THEN
        RAISE EXCEPTION 'TraceLedger tables already exist. Use migrations for upgrades, or review reset.sql for a destructive reset.';
    END IF;
END
$$;

\i schema.sql
\i functions.sql
\i triggers.sql
\i views.sql
\i migrations.sql
\i seed.sql

COMMIT;
