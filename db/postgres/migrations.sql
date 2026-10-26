-- =====================================================================
-- migrations.sql - demonstrates ALTER and DROP (safe to run any number of times)
-- Run after views.sql.  (ASCII only)
-- =====================================================================
SET client_min_messages = warning;

-- ALTER TABLE ... ADD COLUMN, then a CHECK constraint on it
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_email VARCHAR(254);
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_org_contact_email') THEN
        ALTER TABLE organizations ADD CONSTRAINT chk_org_contact_email
            CHECK (contact_email IS NULL OR contact_email LIKE '%_@_%._%');
    END IF;
END $$;

ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';

-- A full CREATE / ALTER / DROP life cycle on a scratch table
DROP TABLE IF EXISTS demo_scratch;
CREATE TABLE demo_scratch (id SERIAL PRIMARY KEY, note TEXT);
ALTER TABLE demo_scratch ADD COLUMN created_on DATE DEFAULT CURRENT_DATE;
ALTER TABLE demo_scratch RENAME COLUMN note TO remark;
ALTER TABLE demo_scratch ALTER COLUMN remark SET NOT NULL;
CREATE INDEX idx_demo_scratch_remark ON demo_scratch (remark);
DROP INDEX idx_demo_scratch_remark;
ALTER TABLE demo_scratch DROP COLUMN created_on;
DROP TABLE demo_scratch;
