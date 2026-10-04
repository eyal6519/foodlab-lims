-- =============================================================================
-- REFERENCE SNAPSHOT — NOT THE MECHANISM FOR SHIPPING CHANGES
-- =============================================================================
-- This file documents the complete database structure: tables, columns,
-- triggers, security functions, and RLS policies.
--
-- Schema changes ship through versioned migrations in supabase/migrations/
-- and are applied with `supabase db push`. Do not apply this file by hand to
-- make a change — statements here can be silently skipped, which previously
-- left `batches.submitted_at` missing and caused PGRST204 API errors.
-- =============================================================================

-- Enable pgcrypto extension if not already enabled
create extension if not exists pgcrypto;

-- 1. PROFILES TABLE (linked to Supabase Auth)
create table if not exists public.profiles (
    id uuid primary key references auth.users on delete cascade,
    email text not null,
    name text,
    role text not null check (role in ('manager', 'technician')),
    created_at timestamp with time zone default now()
);

-- Ensure the column exists for existing tables
alter table public.profiles add column if not exists name text;

-- Enable RLS on profiles
alter table public.profiles enable row level security;

-- Role helper functions.
--
-- A row level security policy may not read the table it guards: Postgres
-- rejects that with 42P17 "infinite recursion detected in policy". The
-- profiles policies therefore cannot ask "does the caller have a role?" by
-- querying public.profiles. These SECURITY DEFINER helpers answer the question
-- instead. They run as the table owner, which bypasses the profiles policies,
-- so the answer comes back without re-entering the guard.
--
-- They must exist before the policies below reference them, so they are
-- declared here rather than in the utility section at the end of the file.

create or replace function public.has_app_role()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $body$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('manager', 'technician')
  )
$body$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $body$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'manager'
  )
$body$;

-- Policies for profiles
-- Drop the legacy name and the current name so this block is safe to re-run.
drop policy if exists "Users can read all profiles" on public.profiles;
drop policy if exists "Users can read profiles" on public.profiles;
create policy "Users can read profiles"
    on public.profiles for select
    to authenticated
    using (
        id = auth.uid()
        or
        public.has_app_role()
    );

drop policy if exists "Managers can update profiles" on public.profiles;
create policy "Managers can update profiles"
    on public.profiles for update
    to authenticated
    using (
        public.is_manager()
    )
    with check (
        public.is_manager()
    );

-- 2. PRODUCT TEMPLATES TABLE
create table if not exists public.product_templates (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    packaging text,
    requires_incubation boolean default true,
    incubation_36 integer default 0,
    incubation_55 integer default 0,
    tests jsonb not null, -- Array of strings (test IDs)
    standards jsonb default '{}'::jsonb, -- Map of testId -> {min, max}
    created_at timestamp with time zone default now()
);

-- Ensure the column exists for existing tables
alter table public.product_templates add column if not exists requires_incubation boolean default true;

alter table public.product_templates enable row level security;

-- Policies for templates
drop policy if exists "Authenticated users can read templates" on public.product_templates;
create policy "Authenticated users can read templates"
    on public.product_templates for select
    to authenticated
    using (
        exists (
            select 1 from public.profiles
            where public.profiles.id = auth.uid() and public.profiles.role in ('manager', 'technician')
        )
    );

drop policy if exists "Managers can manage templates" on public.product_templates;
create policy "Managers can manage templates"
    on public.product_templates for all
    to authenticated
    using (
        exists (
            select 1 from public.profiles
            where public.profiles.id = auth.uid() and public.profiles.role = 'manager'
        )
    );

-- 3. SHIPMENTS TABLE
create table if not exists public.shipments (
    id uuid primary key default gen_random_uuid(),
    template_id uuid references public.product_templates on delete restrict not null,
    supplier text not null,
    intake_date date not null,
    size text,
    units_36 integer default 0,
    units_55 integer default 0,
    exit_36 date,
    exit_55 date,
    is_manually_unlocked boolean default false,
    incubation_exited_at timestamp with time zone,
    incubation_removed_early_at timestamp with time zone,
    incubation_early_acknowledged_at timestamp with time zone,
    assigned_to jsonb default '[]'::jsonb,
    created_at timestamp with time zone default now()
);

alter table public.shipments enable row level security;

-- Policies for shipments
drop policy if exists "Authenticated users can read shipments" on public.shipments;
create policy "Authenticated users can read shipments"
    on public.shipments for select
    to authenticated
    using (
        exists (
            select 1 from public.profiles
            where public.profiles.id = auth.uid() and public.profiles.role in ('manager', 'technician')
        )
    );

drop policy if exists "Managers can manage shipments" on public.shipments;
drop policy if exists "Technicians can update shipments (e.g. exit early if needed or set dates)" on public.shipments;

drop policy if exists "Managers and technicians can manage shipments" on public.shipments;
create policy "Managers and technicians can manage shipments"
    on public.shipments for all
    to authenticated
    using (
        exists (
            select 1 from public.profiles
            where public.profiles.id = auth.uid() and public.profiles.role in ('manager', 'technician')
        )
    );


-- 4. BATCHES TABLE
create table if not exists public.batches (
    id uuid primary key default gen_random_uuid(),
    shipment_id uuid references public.shipments on delete cascade not null,
    number text, -- Nullable to allow optional batch numbers
    production_date date,
    expiration_date date,
    approved_at timestamp with time zone,
    retest_requested_at timestamp with time zone,
    retest_reason text,
    created_at timestamp with time zone default now()
);

-- Ensure columns exist and drop NOT NULL constraint on number for existing tables
alter table public.batches alter column number drop not null;
alter table public.batches add column if not exists retest_requested_at timestamp with time zone;
alter table public.batches add column if not exists retest_reason text;
alter table public.batches add column if not exists units_36 integer default 0;
alter table public.batches add column if not exists units_55 integer default 0;
alter table public.batches add column if not exists exit_36 date;
alter table public.batches add column if not exists exit_55 date;
alter table public.batches add column if not exists is_manually_unlocked boolean default false;
alter table public.batches add column if not exists incubation_exited_at timestamp with time zone;
alter table public.batches add column if not exists incubation_removed_early_at timestamp with time zone;
alter table public.batches add column if not exists incubation_early_acknowledged_at timestamp with time zone;
alter table public.batches add column if not exists submitted_at timestamp with time zone;

alter table public.batches enable row level security;

-- Policies for batches
drop policy if exists "Authenticated users can read batches" on public.batches;
create policy "Authenticated users can read batches"
    on public.batches for select
    to authenticated
    using (
        exists (
            select 1 from public.profiles
            where public.profiles.id = auth.uid() and public.profiles.role in ('manager', 'technician')
        )
    );

drop policy if exists "Managers can manage batches" on public.batches;

drop policy if exists "Managers and technicians can manage batches" on public.batches;
create policy "Managers and technicians can manage batches"
    on public.batches for all
    to authenticated
    using (
        exists (
            select 1 from public.profiles
            where public.profiles.id = auth.uid() and public.profiles.role in ('manager', 'technician')
        )
    );

-- Trigger to verify only managers can modify approval status of a batch
create or replace function public.check_batch_approval_auth()
returns trigger as $$
begin
  if (new.approved_at is distinct from old.approved_at) then
    if not exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'manager'
    ) then
      raise exception 'Only managers are authorized to approve or modify batch approval status.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, extensions;

drop trigger if exists on_batch_approval_check on public.batches;
create trigger on_batch_approval_check
  before update on public.batches
  for each row execute procedure public.check_batch_approval_auth();

-- 5. TEST RESULTS TABLE
create table if not exists public.test_results (
    id uuid primary key default gen_random_uuid(),
    batch_id uuid references public.batches on delete cascade not null,
    test_id text not null,
    replicates jsonb not null, -- Array of replicate records
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    constraint unique_batch_test unique (batch_id, test_id)
);

alter table public.test_results enable row level security;

-- Policies for test results
drop policy if exists "Authenticated users can read test results" on public.test_results;
create policy "Authenticated users can read test results"
    on public.test_results for select
    to authenticated
    using (
        exists (
            select 1 from public.profiles
            where public.profiles.id = auth.uid() and public.profiles.role in ('manager', 'technician')
        )
    );

drop policy if exists "Authenticated users can modify test results" on public.test_results;
create policy "Authenticated users can modify test results"
    on public.test_results for all
    to authenticated
    using (
        exists (
            select 1 from public.profiles
            where public.profiles.id = auth.uid() and public.profiles.role in ('manager', 'technician')
        )
    );

-- 6. AUTH TRIGGERS FOR USER PROFILES
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'technician'),
    new.raw_user_meta_data->>'name'
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public, extensions;

-- Recreate trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 7. MANAGER-ONLY SECURE FUNCTION TO CREATE USER ACCOUNTS
create or replace function public.admin_create_user(
  user_email text, 
  user_password text, 
  user_role text,
  user_name text default null
)
returns uuid security definer as $$
  declare
    new_user_id uuid;
    clean_email text;
    query_cols text := 'id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token';
    query_vals text := '$1, ''00000000-0000-0000-0000-000000000000'', ''authenticated'', ''authenticated'', $2, crypt($3, gen_salt(''bf'')), now(), $4, $5, now(), now(), '''', ''''';
  begin
    -- Access control check: only a signed-in manager may create accounts.
    -- The service role (server-side seeding via the service_role key) is exempt,
    -- because the bootstrap user does not exist yet at that point. An empty
    -- profiles table is NOT sufficient on its own: otherwise an anonymous caller
    -- could create itself a manager account.
    if auth.role() <> 'service_role' then
      if not exists (
        select 1 from public.profiles 
        where id = auth.uid() and role = 'manager'
      ) then
        raise exception 'Only managers are authorized to create users.';
      end if;
    end if;
  
    if user_role not in ('manager', 'technician') then
      raise exception 'Invalid role specified.';
    end if;
  
    clean_email := lower(trim(user_email));
    -- Generate new UUID
    new_user_id := gen_random_uuid();
  
    -- Add extra columns dynamically if they exist in auth.users
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'email_change') then
      query_cols := query_cols || ', email_change';
      query_vals := query_vals || ', ''''';
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'email_change_token_new') then
      query_cols := query_cols || ', email_change_token_new';
      query_vals := query_vals || ', ''''';
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'email_change_token_current') then
      query_cols := query_cols || ', email_change_token_current';
      query_vals := query_vals || ', ''''';
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'phone_change') then
      query_cols := query_cols || ', phone_change';
      query_vals := query_vals || ', ''''';
    end if;
  
    execute format('insert into auth.users (%s) values (%s)', query_cols, query_vals)
      using new_user_id, clean_email, user_password, jsonb_build_object('provider', 'email', 'providers', array['email']), jsonb_build_object('role', user_role, 'name', user_name);

  -- Insert into auth.identities
  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', clean_email, 'email_verified', true, 'phone_verified', false),
    'email',
    new_user_id::text,
    now(),
    now(),
    now()
  );

  return new_user_id;
end;
$$ language plpgsql set search_path = public, extensions;

-- 8. MANAGER-ONLY SECURE FUNCTION TO DELETE USER ACCOUNTS
create or replace function public.admin_delete_user(target_user_id uuid)
returns void security definer as $$
begin
  -- Access control check: Only allow manager to delete accounts
  if not exists (
    select 1 from public.profiles 
    where id = auth.uid() and role = 'manager'
  ) then
    raise exception 'Only managers are authorized to delete users.';
  end if;

  -- Prevent a manager from deleting themselves
  if target_user_id = auth.uid() then
    raise exception 'You cannot delete your own account.';
  end if;

  -- Delete from auth.identities
  delete from auth.identities where user_id = target_user_id;

  -- Delete from auth.users (which cascades to public.profiles)
  delete from auth.users where id = target_user_id;
end;
$$ language plpgsql set search_path = public, extensions;

-- 9. TARE REGISTRY TABLE
create table if not exists public.tare_registry (
    id uuid primary key default gen_random_uuid(),
    product_template_id uuid references public.product_templates(id) on delete cascade not null,
    supplier text not null,
    declared_weight text not null,
    short_description text not null,
    tare_weight numeric not null,
    manufacturer text,
    image_url text, -- holds image base64 representation
    created_at timestamp with time zone default now()
);

-- Enable RLS
alter table public.tare_registry enable row level security;

-- Policies (allow read & write for managers and technicians)
drop policy if exists "Authenticated users can read tare registry" on public.tare_registry;
create policy "Authenticated users can read tare registry"
    on public.tare_registry for select
    to authenticated
    using (
        exists (
            select 1 from public.profiles
            where public.profiles.id = auth.uid() and public.profiles.role in ('manager', 'technician')
        )
    );

drop policy if exists "Managers and technicians can manage tare registry" on public.tare_registry;
create policy "Managers and technicians can manage tare registry"
    on public.tare_registry for all
    to authenticated
    using (
        exists (
            select 1 from public.profiles
            where public.profiles.id = auth.uid() and public.profiles.role in ('manager', 'technician')
        )
    );

-- 10. UTILITY FUNCTIONS
-- These exist in the deployed database but were missing from this script. They
-- are created only when absent so that re-running this file against a live
-- database never rewrites an existing definition.
--
-- public.is_manager() is NOT created here. It is declared with
-- public.has_app_role() above, before the policies that call it, because the
-- profiles policies cannot query the table they guard.

do $$
begin
  if to_regprocedure('public.get_db_size_bytes()') is null then
    execute $fn$
      create function public.get_db_size_bytes()
      returns bigint
      language sql
      security definer
      set search_path = public, extensions
      as $body$
        select pg_database_size(current_database())
      $body$;
    $fn$;
  end if;
end;
$$;

-- 11. READ-ONLY QUERY HELPERS
-- Shipped by supabase/migrations/20261004150000_add_active_shipments_and_archive_search.sql.
-- These move the app's filtering, counting and paging into Postgres so the views
-- stop downloading every shipment, batch and test result on each load. They are
-- SECURITY INVOKER so the RLS policies above keep applying to the caller; none of
-- them may be promoted to SECURITY DEFINER.

do $$
begin
  if to_regprocedure('public.get_active_shipments()') is null then
    execute $fn$
      create function public.get_active_shipments()
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
    $fn$;
  end if;
end;
$$;

do $$
begin
  if to_regprocedure('public.search_coa_archive(text,text,date,date,integer,integer,boolean)') is null then
    execute $fn$
      create function public.search_coa_archive(
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
        -- The browser-side filter this replaces used a literal substring match,
        -- so the LIKE wildcards a user might type ("50%") are escaped rather
        -- than honoured.
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
    $fn$;
  end if;
end;
$$;

do $$
begin
  if to_regprocedure('public.get_archived_shipments_for_cleanup()') is null then
    execute $fn$
      create function public.get_archived_shipments_for_cleanup()
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
    $fn$;
  end if;
end;
$$;

-- 12. FUNCTION EXECUTION GRANTS
-- Supabase grants EXECUTE on new functions to anon and authenticated by
-- default. Every SECURITY DEFINER function above is therefore callable by
-- unauthenticated visitors, and the SECURITY INVOKER helpers would still be
-- readable by anonymous callers through the PUBLIC grant. Revoke from anon,
-- authenticated, and PUBLIC (both roles inherit EXECUTE from the PUBLIC
-- pseudo-role), then re-grant only what the app actually calls.

revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.check_batch_approval_auth() from anon, authenticated, public;
revoke execute on function public.admin_create_user(text, text, text, text) from anon, public;
revoke execute on function public.admin_delete_user(uuid) from anon, public;
revoke execute on function public.get_db_size_bytes() from anon, public;
revoke execute on function public.is_manager() from anon, public;
revoke execute on function public.has_app_role() from anon, public;
revoke execute on function public.get_active_shipments() from anon, public;
revoke execute on function public.search_coa_archive(text, text, date, date, integer, integer, boolean) from anon, public;
revoke execute on function public.get_archived_shipments_for_cleanup() from anon, public;

-- Trigger functions are invoked by the trigger, never over the API. No role
-- needs EXECUTE on them.
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.check_batch_approval_auth() from authenticated;

grant execute on function public.admin_create_user(text, text, text, text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.get_db_size_bytes() to authenticated;
grant execute on function public.is_manager() to authenticated;
grant execute on function public.get_active_shipments() to authenticated;
grant execute on function public.search_coa_archive(text, text, date, date, integer, integer, boolean) to authenticated;
grant execute on function public.get_archived_shipments_for_cleanup() to authenticated;

-- Used by the profiles RLS policies. Policy expressions are evaluated as the
-- querying role, so authenticated needs EXECUTE on it.
grant execute on function public.has_app_role() to authenticated;
grant execute on function public.has_app_role() to service_role;

-- service_role is exempt: the QA seeding panel (mockDataGenerator.js) uses the
-- service-role key to bootstrap users on an empty database.
grant execute on function public.admin_create_user(text, text, text, text) to service_role;
grant execute on function public.admin_delete_user(uuid) to service_role;
grant execute on function public.get_active_shipments() to service_role;
grant execute on function public.search_coa_archive(text, text, date, date, integer, integer, boolean) to service_role;
grant execute on function public.get_archived_shipments_for_cleanup() to service_role;

-- 13. REMOVE STALE OVERLOAD
-- The deployed database carries an older 3-argument admin_create_user that has
-- no user_name parameter. It is unreachable from the app and is extra anonymous
-- attack surface. The 4-argument version is the one the app calls.
drop function if exists public.admin_create_user(text, text, text);


