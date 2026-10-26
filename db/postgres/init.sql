-- Run everything in order from this folder:
--   psql "postgres://postgres:YOUR_PASSWORD@localhost:5432/supplychain" -v ON_ERROR_STOP=1 -f init.sql
\i schema.sql
\i functions.sql
\i triggers.sql
\i views.sql
\i migrations.sql
\i seed.sql
