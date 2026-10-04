-- Fix 42P17 "infinite recursion detected in policy" on public.profiles.
--
-- "Users can read profiles" and "Managers can update profiles" decided whether
-- the caller had a role by running a subquery against public.profiles, the same
-- table the policies guard. Postgres refuses that: a policy may not read its own
-- table. Every read of profiles therefore failed with 42P17, so the app could
-- not load a role for a signed-in user and displayed "Access Pending" even
-- though the account existed and had a role.
--
-- The role questions move into SECURITY DEFINER helpers. They execute as the
-- table owner, which bypasses the profiles policies, so nothing re-enters the
-- guard. Both helpers are declared before the policies that call them, because
-- the function must exist at policy-creation time.

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

-- Policy expressions are evaluated as the querying role, so authenticated needs
-- EXECUTE on the helper the select policy calls.
revoke execute on function public.has_app_role() from anon, public;
grant execute on function public.has_app_role() to authenticated;
grant execute on function public.has_app_role() to service_role;

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