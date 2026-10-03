-- ============================================================================
-- Supabase Security Hardening - APPLY ONLY
-- ============================================================================
-- Run this in the Supabase SQL Editor against the LIVE database to fix the
-- Database Advisor warnings. Unlike schema.sql (full bootstrap), this file
-- only touches functions and their privileges - it never creates or drops
-- tables, policies, or data, so it is safe to run repeatedly.
--
-- Fixes:
--   0011 function_search_path_mutable          (role-mutable search_path)
--   0028 anon_security_definer_function_executable
--   0029 authenticated_security_definer_function_executable
--
-- The same GRANT/REVOKE statements now sit at the end of schema.sql;
-- keeping both in sync matters only for new environments.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Step 1: Pin search_path on every SECURITY DEFINER function that exists.
-- ALTER FUNCTION ... SET search_path works without rewriting the body.
-- ----------------------------------------------------------------------------

do $$
declare
  def text;
  defs text[] := array[
    'public.handle_new_user()',
    'public.check_batch_approval_auth()',
    'public.admin_create_user(text, text, text, text)',
    'public.admin_delete_user(uuid)',
    'public.get_db_size_bytes()',
    'public.is_manager()'
  ];
begin
  foreach def in array defs
  loop
    if to_regprocedure(def) is not null then
      execute format('alter function %s set search_path = public, extensions;', def);
    end if;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- Step 2: Strip EXECUTE from the two trigger functions. They are invoked by the
-- trigger itself, never over /rest/v1/rpc, so no role should execute them.
--
-- NOTE: In Supabase the function grants live on the PUBLIC pseudo-role, which
-- both anon and authenticated inherit. Revoking only from `anon` leaves the
-- PUBLIC grant in place, which is why the first run didn't clear the advisor
-- rows. We revoke from anon AND authenticated AND public to cover every grant.
-- ----------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'handle_new_user'
  ) then
    revoke execute on function public.handle_new_user() from anon;
    revoke execute on function public.handle_new_user() from authenticated;
    revoke execute on function public.handle_new_user() from public;
  end if;

  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'check_batch_approval_auth'
  ) then
    revoke execute on function public.check_batch_approval_auth() from anon;
    revoke execute on function public.check_batch_approval_auth() from authenticated;
    revoke execute on function public.check_batch_approval_auth() from public;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Step 3: Strip EXECUTE from anon (and from PUBLIC, which grants anon) on the
-- app-facing SECURITY DEFINER functions. Authenticated access is re-granted in
-- Step 4 for the ones the LIMS actually calls.
-- ----------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_create_user'
  ) then
    revoke execute on function public.admin_create_user(text, text, text, text) from anon;
    revoke execute on function public.admin_create_user(text, text, text, text) from public;
  end if;

  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_delete_user'
  ) then
    revoke execute on function public.admin_delete_user(uuid) from anon;
    revoke execute on function public.admin_delete_user(uuid) from public;
  end if;

  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_db_size_bytes'
  ) then
    revoke execute on function public.get_db_size_bytes() from anon;
    revoke execute on function public.get_db_size_bytes() from public;
  end if;

  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_manager'
  ) then
    revoke execute on function public.is_manager() from anon;
    revoke execute on function public.is_manager() from public;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Step 4: Re-grant EXECUTE to the roles the app actually uses while signed in.
-- ----------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_create_user'
  ) then
    grant execute on function public.admin_create_user(text, text, text, text) to authenticated;
    grant execute on function public.admin_create_user(text, text, text, text) to service_role;
  end if;

  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_delete_user'
  ) then
    grant execute on function public.admin_delete_user(uuid) to authenticated;
    grant execute on function public.admin_delete_user(uuid) to service_role;
  end if;

  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_db_size_bytes'
  ) then
    grant execute on function public.get_db_size_bytes() to authenticated;
    grant execute on function public.get_db_size_bytes() to service_role;
  end if;

  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_manager'
  ) then
    grant execute on function public.is_manager() to authenticated;
    grant execute on function public.is_manager() to service_role;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Step 5: Drop the stale 3-argument admin_create_user overload. The app only
-- ever calls the 4-argument version (user_name has a DEFAULT), and the older
-- overload is pure anonymous attack surface.
-- ----------------------------------------------------------------------------

drop function if exists public.admin_create_user(text, text, text);