-- ============================================================================
-- Fix login: "infinite recursion detected in policy" for relation "profiles"
-- ============================================================================
-- PASTE THIS WHOLE FILE into Supabase Dashboard -> SQL Editor -> Run.
--
-- Why: the two access rules on public.profiles decided whether the signed-in
-- person has a role by querying public.profiles, the same table they guard.
-- Postgres forbids a policy from reading its own table and raises 42P17. Every
-- profile read therefore failed, so the app could not load a role and reported
-- that the account did not exist.
--
-- The fix moves the role question into a SECURITY DEFINER helper, which reads
-- the table as its owner with the rules switched off, so nothing loops.
--
-- No tables, columns, rows, accounts or roles are touched. Only two policy
-- definitions change. Safe to run more than once.
-- ============================================================================

-- 1. The role helpers. Declared first: the policies below reference them, and
--    the function must already exist when the policy is created.
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

-- 2. Permissions. A policy expression runs as the signed-in user, so
--    authenticated needs EXECUTE on the helper the read policy calls.
revoke execute on function public.has_app_role() from anon, public;
grant execute on function public.has_app_role() to authenticated;
grant execute on function public.has_app_role() to service_role;

-- 3. Recreate the two policies without the self-reference.
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

-- 4. Confirmation query. Run it separately; expected result: 2 rows, both
--    showing public.has_app_role() or public.is_manager().
--
-- select policyname, qual
-- from pg_policies
-- where schemaname = 'public' and tablename = 'profiles'
-- order by policyname;