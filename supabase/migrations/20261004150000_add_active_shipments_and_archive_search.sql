-- Read-only query helpers so the app stops downloading the whole database.
--
-- The manager and technician views used to SELECT every shipment, every batch and
-- every test_results row on mount and again after nearly every action. That is
-- ~5 MB per action at 3,000 batches, which exhausts the Free plan's 5 GB egress
-- in roughly 1,000 actions. These three functions move the filtering, counting
-- and paging into Postgres so each screen fetches only what it renders.
--
-- All three are SECURITY INVOKER on purpose: the caller's role is authenticated,
-- so the existing row level security policies still apply. Do not promote them to
-- SECURITY DEFINER — that would make every signed-in user read every row.

-- ---------------------------------------------------------------------------
-- 1. Active shipments: everything that is not fully approved yet.
--
-- "Archived" mirrors isShipmentArchived() in src/utils/calculations.js exactly:
-- a shipment counts as archived only when it has at least one batch AND every one
-- of those batches has approved_at. A shipment with no batches is still active.
-- ---------------------------------------------------------------------------
create or replace function public.get_active_shipments()
returns jsonb
language sql
stable
security invoker
set search_path = public, extensions
as $body$
  select coalesce(
           jsonb_agg(t.row_json order by t.created_at desc),
           '[]'::jsonb
         )
  from (
    select
      s.created_at,
      to_jsonb(s) || jsonb_build_object(
        'batches',
        coalesce(
          (
            select jsonb_agg(to_jsonb(b) order by b.number nulls last, b.created_at asc)
            from public.batches b
            where b.shipment_id = s.id
          ),
          '[]'::jsonb
        )
      ) as row_json
    from public.shipments s
    where (
            select count(*) from public.batches b where b.shipment_id = s.id
          ) = 0
       or exists (
            select 1 from public.batches b
            where b.shipment_id = s.id and b.approved_at is null
          )
  ) t
$body$;

-- ---------------------------------------------------------------------------
-- 2. Paged, filtered COA archive.
--
-- Replaces the identical browser-side filter blocks in ManagerView (archive and
-- fresh_coas tabs) and TechnicianView (archive tab). The filter semantics are
-- carried over unchanged, including the 'Unnamed Batch' fallback so a search for
-- "unnamed" still matches batches with no number.
--
-- p_require_fully_approved keeps the one existing difference between the two
-- views: the technician archive only lists fully approved shipments, while the
-- manager archive also lists approved batches of partially approved shipments.
-- ---------------------------------------------------------------------------
create or replace function public.search_coa_archive(
  p_search text default null,
  p_date_type text default 'all',
  p_start date default null,
  p_end date default null,
  p_page integer default 1,
  p_page_size integer default 20,
  p_require_fully_approved boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = public, extensions
as $body$
  -- The browser-side filter this replaces used a literal substring match, so the
  -- LIKE wildcards a user might type ("50%") are escaped rather than honoured.
  with params as (
    select case
             when p_search is null or btrim(p_search) = '' then null
             else '%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%'
           end as needle
  ),
  base as (
    select
      to_jsonb(b) as batch_json,
      to_jsonb(s) as shipment_json,
      b.approved_at,
      s.intake_date,
      b.production_date
    from public.batches b
    join public.shipments s on s.id = b.shipment_id
    join public.product_templates pt on pt.id = s.template_id
    cross join params
    where b.approved_at is not null
      and (
        not p_require_fully_approved
        or not exists (
          select 1 from public.batches x
          where x.shipment_id = s.id and x.approved_at is null
        )
      )
      and (
        params.needle is null
        or coalesce(pt.name, '') ilike params.needle escape '\'
        or coalesce(b.number, 'Unnamed Batch') ilike params.needle escape '\'
      )
  ),
  dated as (
    select
      base.*,
      case p_date_type
        when 'approved_at' then base.approved_at::date
        when 'intake_date' then base.intake_date
        when 'production_date' then base.production_date
      end as target_date
    from base
  ),
  filtered as (
    select *
    from dated
    where p_date_type = 'all'
       or (p_start is null and p_end is null)
       or (
         target_date is not null
         and (p_start is null or target_date >= p_start)
         and (p_end is null or target_date <= p_end)
       )
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce(
      (
        select jsonb_agg(
                 page.batch_json || jsonb_build_object('shipment', page.shipment_json)
                 order by page.approved_at desc
               )
        from (
          select *
          from filtered
          order by approved_at desc, batch_json->>'id' asc
          limit greatest(coalesce(p_page_size, 20), 1)
          offset greatest(coalesce(p_page, 1) - 1, 0) * greatest(coalesce(p_page_size, 20), 1)
        ) page
      ),
      '[]'::jsonb
    )
  )
$body$;

-- ---------------------------------------------------------------------------
-- 3. Fully approved shipments for the storage auto-cleanup.
--
-- The cleanup ran on every manager login and downloaded every shipment with its
-- batches just to work out which ones were fully approved. This returns the same
-- input as ids only.
-- ---------------------------------------------------------------------------
create or replace function public.get_archived_shipments_for_cleanup()
returns jsonb
language sql
stable
security invoker
set search_path = public, extensions
as $body$
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  from (
    select
      s.id as shipment_id,
      min(b.approved_at) as oldest_approved_at,
      jsonb_agg(b.id) as batch_ids
    from public.shipments s
    join public.batches b on b.shipment_id = s.id
    where not exists (
      select 1 from public.batches x
      where x.shipment_id = s.id and x.approved_at is null
    )
    group by s.id
    order by min(b.approved_at) asc
  ) t
$body$;

-- ---------------------------------------------------------------------------
-- EXECUTE grants.
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default, which would
-- leave these readable by anonymous visitors. Revoke from anon and PUBLIC, then
-- re-grant to the two roles the app uses.
-- ---------------------------------------------------------------------------
revoke execute on function public.get_active_shipments() from anon, public;
revoke execute on function public.search_coa_archive(text, text, date, date, integer, integer, boolean) from anon, public;
revoke execute on function public.get_archived_shipments_for_cleanup() from anon, public;

grant execute on function public.get_active_shipments() to authenticated, service_role;
grant execute on function public.search_coa_archive(text, text, date, date, integer, integer, boolean) to authenticated, service_role;
grant execute on function public.get_archived_shipments_for_cleanup() to authenticated, service_role;

-- Ask PostgREST to refresh its cached schema so the new functions are callable.
notify pgrst, 'reload schema';