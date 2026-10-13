-- 13 Oct 2026 (applied live via MCP): v4 uploads use v4/<org>/<session>/<capture>/media.*; existing policies
-- required <org> as the first folder, so every capture upload since 14 Aug was refused with 400.
create policy "v4 media insert" on storage.objects for insert to authenticated with check (
  bucket_id='swimming-media' and split_part(name,'/',1)='v4'
  and split_part(name,'/',2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.mclay_has_permission(split_part(name,'/',2)::uuid,'add_notes'));
create policy "v4 media update" on storage.objects for update to authenticated using (
  bucket_id='swimming-media' and split_part(name,'/',1)='v4'
  and split_part(name,'/',2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.mclay_has_permission(split_part(name,'/',2)::uuid,'add_notes'))
  with check (
  bucket_id='swimming-media' and split_part(name,'/',1)='v4'
  and split_part(name,'/',2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.mclay_has_permission(split_part(name,'/',2)::uuid,'add_notes'));
create policy "v4 media read" on storage.objects for select to authenticated using (
  bucket_id='swimming-media' and split_part(name,'/',1)='v4'
  and split_part(name,'/',2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.is_org_member_coach(split_part(name,'/',2)::uuid));
