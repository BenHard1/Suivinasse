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
