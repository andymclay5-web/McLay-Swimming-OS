-- McLay Swimming OS Version 1
-- Run this once in a NEW Supabase project. Do not use the fundraising project.

create extension if not exists pgcrypto;

create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.organisation_members (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'coach' check (role in ('owner','admin','coach','viewer')),
  created_at timestamptz not null default now(),
  primary key (organisation_id,user_id)
);

create table if not exists public.athletes (
  id text primary key,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  full_name text not null,
  squad text not null,
  active boolean not null default true,
  legacy_pace jsonb,
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.sessions (
  id text primary key,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  session_date date not null,
  day_part text not null check (day_part in ('AM','PM')),
  venue text,
  title text not null,
  squads text[] not null default '{}',
  planned_distance integer not null default 0,
  primary_system text,
  technical_focus text,
  workout text,
  step_number integer,
  previous_session_id text,
  status text not null default 'planned',
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.attendance (
  id text primary key,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  session_id text not null references public.sessions(id) on delete cascade,
  athlete_id text not null references public.athletes(id) on delete cascade,
  status text not null check (status in ('present','modified','absent')),
  note text,
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique(session_id,athlete_id)
);

create table if not exists public.captures (
  id text primary key,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  session_id text not null references public.sessions(id) on delete cascade,
  athlete_id text references public.athletes(id) on delete set null,
  capture_type text not null check (capture_type in ('text','voice','photo','video')),
  text_content text,
  media_path text,
  mime_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.timed_sets (
  id text primary key,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  session_id text not null references public.sessions(id) on delete cascade,
  athlete_id text not null references public.athletes(id) on delete cascade,
  distance integer not null,
  stroke text not null,
  set_label text,
  send_off text,
  times jsonb not null,
  average numeric not null,
  best numeric not null,
  spread numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.session_reviews (
  id text primary key,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  session_id text not null references public.sessions(id) on delete cascade,
  went_well text,
  reinforce text,
  athlete_notes text,
  carry_forward text,
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

alter table public.organisations enable row level security;
alter table public.organisation_members enable row level security;
alter table public.athletes enable row level security;
alter table public.sessions enable row level security;
alter table public.attendance enable row level security;
alter table public.captures enable row level security;
alter table public.timed_sets enable row level security;
alter table public.session_reviews enable row level security;

create or replace function public.is_org_member(org uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.organisation_members m
    where m.organisation_id=org and m.user_id=auth.uid()
  );
$$;

drop policy if exists "create own organisation" on public.organisations;
create policy "create own organisation" on public.organisations
for insert to authenticated with check (owner_id=auth.uid());

drop policy if exists "read member organisations" on public.organisations;
create policy "read member organisations" on public.organisations
for select to authenticated using (owner_id=auth.uid() or public.is_org_member(id));

drop policy if exists "owner updates organisation" on public.organisations;
create policy "owner updates organisation" on public.organisations
for update to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());

drop policy if exists "owner creates first membership" on public.organisation_members;
create policy "owner creates first membership" on public.organisation_members
for insert to authenticated with check (
  user_id=auth.uid()
  and exists(select 1 from public.organisations o where o.id=organisation_id and o.owner_id=auth.uid())
);

drop policy if exists "members read memberships" on public.organisation_members;
create policy "members read memberships" on public.organisation_members
for select to authenticated using (
  user_id=auth.uid()
  or exists(select 1 from public.organisations o where o.id=organisation_id and o.owner_id=auth.uid())
);

-- Shared policy pattern for swimming tables.
do $$
declare t text;
begin
  foreach t in array array['athletes','sessions','attendance','captures','timed_sets','session_reviews']
  loop
    execute format('drop policy if exists "members read %1$s" on public.%1$I',t);
    execute format('create policy "members read %1$s" on public.%1$I for select to authenticated using (public.is_org_member(organisation_id))',t);
    execute format('drop policy if exists "members insert %1$s" on public.%1$I',t);
    execute format('create policy "members insert %1$s" on public.%1$I for insert to authenticated with check (public.is_org_member(organisation_id))',t);
    execute format('drop policy if exists "members update %1$s" on public.%1$I',t);
    execute format('create policy "members update %1$s" on public.%1$I for update to authenticated using (public.is_org_member(organisation_id)) with check (public.is_org_member(organisation_id))',t);
  end loop;
end $$;

insert into storage.buckets (id,name,public)
values ('swimming-media','swimming-media',false)
on conflict (id) do nothing;

drop policy if exists "members read swimming media" on storage.objects;
create policy "members read swimming media" on storage.objects
for select to authenticated using (
  bucket_id='swimming-media'
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "members upload swimming media" on storage.objects;
create policy "members upload swimming media" on storage.objects
for insert to authenticated with check (
  bucket_id='swimming-media'
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "members update swimming media" on storage.objects;
create policy "members update swimming media" on storage.objects
for update to authenticated using (
  bucket_id='swimming-media'
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
) with check (
  bucket_id='swimming-media'
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
);
