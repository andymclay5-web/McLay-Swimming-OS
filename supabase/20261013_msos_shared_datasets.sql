-- 13 Oct 2026 (applied live via MCP): head coach's active season plan, weekly plan and calendar shared to coach phones.
create table if not exists public.msos_shared_datasets (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  dataset_type text not null check (dataset_type in ('season_plan','weekly_plan','calendar')),
  dataset_id text not null,
  imported_at text not null default '',
  dataset jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (organisation_id, dataset_type)
);
alter table public.msos_shared_datasets enable row level security;
create policy "coaches read shared datasets" on public.msos_shared_datasets for select to authenticated using (public.is_org_member_coach(organisation_id));
create policy "owner writes shared datasets" on public.msos_shared_datasets for insert to authenticated with check (public.mclay_is_owner(organisation_id));
create policy "owner updates shared datasets" on public.msos_shared_datasets for update to authenticated using (public.mclay_is_owner(organisation_id)) with check (public.mclay_is_owner(organisation_id));
grant select, insert, update on public.msos_shared_datasets to authenticated;
-- Also applied 13 Oct: Jordan's organisation_members.permissions set to the assistant-coach set (see engines/team-access.js T.ASSISTANT_PERMISSIONS).
