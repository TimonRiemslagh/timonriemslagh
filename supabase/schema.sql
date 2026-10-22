-- timonriemslagh.be: database setup for the update wall. Paste this whole file into Supabase → SQL Editor and click Run.
-- Before you run it: replace the example address in the last statement with your own.

-- Who may post on the wall and approve the mood. Everyone else can only read what is public.
create table if not exists public.wall_authors (
  email text primary key
);
alter table public.wall_authors enable row level security;
drop policy if exists "authors see themselves" on public.wall_authors;
create policy "authors see themselves" on public.wall_authors
  for select to authenticated
  using (email = lower(auth.jwt() ->> 'email'));

create or replace function public.is_wall_author() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.wall_authors where email = lower(auth.jwt() ->> 'email')) $$;

-- One row per thing on the wall. Tools post here directly; source_ref stops the same event from being posted twice.
create table if not exists public.wall_updates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tool text not null,
  type text not null check (type in ('walk', 'cook', 'idea', 'update', 'feedback')),
  title text not null check (char_length(title) between 1 and 200),
  body text check (char_length(body) <= 2000),
  meta jsonb not null default '{}'::jsonb,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  source_ref text unique
);
alter table public.wall_updates enable row level security;
drop policy if exists "anyone reads public updates" on public.wall_updates;
create policy "anyone reads public updates" on public.wall_updates
  for select to anon, authenticated
  using (visibility = 'public' or public.is_wall_author());
drop policy if exists "authors write updates" on public.wall_updates;
create policy "authors write updates" on public.wall_updates
  for all to authenticated
  using (public.is_wall_author())
  with check (public.is_wall_author());

-- Claude's weekly summary. The server writes it as a draft; it only shows publicly once you approve it.
create table if not exists public.wall_moods (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  mood text not null,
  likes jsonb not null default '[]'::jsonb,
  dislikes jsonb not null default '[]'::jsonb,
  weeks jsonb not null default '[]'::jsonb,
  approved_at timestamptz
);
alter table public.wall_moods enable row level security;
drop policy if exists "anyone reads approved moods" on public.wall_moods;
create policy "anyone reads approved moods" on public.wall_moods
  for select to anon, authenticated
  using (approved_at is not null or public.is_wall_author());
drop policy if exists "authors approve moods" on public.wall_moods;
create policy "authors approve moods" on public.wall_moods
  for update to authenticated
  using (public.is_wall_author())
  with check (public.is_wall_author());

-- Live updates on the wall.
do $$ begin
  alter publication supabase_realtime add table public.wall_updates;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.wall_moods;
exception when duplicate_object then null; end $$;

-- ✏️ Replace this address with yours (lowercase).
insert into public.wall_authors (email) values
  ('jij@example.com')
on conflict do nothing;
