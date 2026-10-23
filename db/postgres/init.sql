-- Run everything in order:  psql "$DATABASE_URL" -f db/postgres/init.sql   (from the db/postgres folder)
\i schema.sql
\i functions.sql
\i triggers.sql
\i views.sql
-- \i seed.sql
