-- Enable pgcrypto extension if not already enabled
create extension if not exists pgcrypto;

-- 1. PROFILES TABLE (linked to Supabase Auth)
create table if not exists public.profiles (
    id uuid primary key references auth.users on delete cascade,
    email text not null,
    role text not null check (role in ('manager', 'technician')),
    created_at timestamp with time zone default now()
);

-- Enable RLS on profiles
alter table public.profiles enable row level security;

-- Policies for profiles
create policy "Users can read all profiles"
    on public.profiles for select
    to authenticated
    using (true);

create policy "Managers can update profiles"
    on public.profiles for update
    to authenticated
    using (
        exists (
            select 1 from public.profiles
            where public.profiles.id = auth.uid() and public.profiles.role = 'manager'
        )
    );

-- 2. PRODUCT TEMPLATES TABLE
create table if not exists public.product_templates (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    packaging text,
    incubation_36 integer default 0,
    incubation_55 integer default 0,
    tests jsonb not null, -- Array of strings (test IDs)
    standards jsonb default '{}'::jsonb, -- Map of testId -> {min, max}
    created_at timestamp with time zone default now()
);

alter table public.product_templates enable row level security;

-- Policies for templates
create policy "Authenticated users can read templates"
    on public.product_templates for select
    to authenticated
    using (true);

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
    created_at timestamp with time zone default now()
);

alter table public.shipments enable row level security;

-- Policies for shipments
create policy "Authenticated users can read shipments"
    on public.shipments for select
    to authenticated
    using (true);

create policy "Managers can manage shipments"
    on public.shipments for all
    to authenticated
    using (
        exists (
            select 1 from public.profiles
            where public.profiles.id = auth.uid() and public.profiles.role = 'manager'
        )
    );

create policy "Technicians can update shipments (e.g. exit early if needed or set dates)"
    on public.shipments for update
    to authenticated
    using (
        exists (
            select 1 from public.profiles
            where public.profiles.id = auth.uid() and public.profiles.role = 'technician'
        )
    );

-- 4. BATCHES TABLE
create table if not exists public.batches (
    id uuid primary key default gen_random_uuid(),
    shipment_id uuid references public.shipments on delete cascade not null,
    number text not null,
    production_date date,
    expiration_date date,
    approved_at timestamp with time zone,
    created_at timestamp with time zone default now()
);

alter table public.batches enable row level security;

-- Policies for batches
create policy "Authenticated users can read batches"
    on public.batches for select
    to authenticated
    using (true);

create policy "Managers can manage batches"
    on public.batches for all
    to authenticated
    using (
        exists (
            select 1 from public.profiles
            where public.profiles.id = auth.uid() and public.profiles.role = 'manager'
        )
    );

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
create policy "Authenticated users can read test results"
    on public.test_results for select
    to authenticated
    using (true);

create policy "Authenticated users can modify test results"
    on public.test_results for all
    to authenticated
    using (true);

-- 6. AUTH TRIGGERS FOR USER PROFILES
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'technician')
  );
  return new;
end;
$$ language plpgsql security definer;

-- Recreate trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 7. MANAGER-ONLY SECURE FUNCTION TO CREATE USER ACCOUNTS
create or replace function public.admin_create_user(
  user_email text, 
  user_password text, 
  user_role text
)
returns uuid security definer as $$
  declare
    new_user_id uuid;
    clean_email text;
    query_cols text := 'id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token';
    query_vals text := '$1, ''00000000-0000-0000-0000-000000000000'', ''authenticated'', ''authenticated'', $2, crypt($3, gen_salt(''bf'')), now(), $4, $5, now(), now(), '''', ''''';
  begin
    -- Access control check: Only allow manager to create accounts, unless database has no users yet (seeding)
    if exists (select 1 from public.profiles) then
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
      using new_user_id, clean_email, user_password, jsonb_build_object('provider', 'email', 'providers', array['email']), jsonb_build_object('role', user_role);

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
$$ language plpgsql;

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
$$ language plpgsql;
