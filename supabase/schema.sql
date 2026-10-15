-- Wine in my Cellar : une cave par compte utilisateur.
-- À exécuter une fois dans Supabase : SQL Editor → New query → coller → Run.

create table if not exists public.cellars (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.cellars enable row level security;

-- Chaque utilisateur ne voit et ne modifie que sa propre cave.
drop policy if exists "cave: lecture" on public.cellars;
drop policy if exists "cave: création" on public.cellars;
drop policy if exists "cave: modification" on public.cellars;
drop policy if exists "cave: suppression" on public.cellars;

create policy "cave: lecture" on public.cellars
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "cave: création" on public.cellars
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "cave: modification" on public.cellars
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "cave: suppression" on public.cellars
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Photos des bouteilles (haute définition) : seau privé « photos », un dossier par compte (<user_id>/<photo>.jpg).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "photos: lecture" on storage.objects;
drop policy if exists "photos: création" on storage.objects;
drop policy if exists "photos: modification" on storage.objects;
drop policy if exists "photos: suppression" on storage.objects;

create policy "photos: lecture" on storage.objects
  for select to authenticated using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos: création" on storage.objects
  for insert to authenticated with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos: modification" on storage.objects
  for update to authenticated using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos: suppression" on storage.objects
  for delete to authenticated using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
