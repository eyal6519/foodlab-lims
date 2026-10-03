-- Add submitted_at to batches for batch submission workflow.
-- Previously this DDL lived at the bottom of schema.sql, after the RLS policies,
-- so it was missed when the schema was applied and the column never reached the DB
-- (PostgREST returned PGRST204 on any PATCH touching submitted_at).

alter table public.batches
    add column if not exists submitted_at timestamp with time zone;

-- Ask PostgREST to refresh its cached schema so the new column is visible.
notify pgrst, 'reload schema';