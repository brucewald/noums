-- noums backend schema
-- Run this once in the Supabase SQL Editor (paste + Run).

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  t timestamptz not null,
  mode text,
  dur int,
  words int,
  fillers int,
  counts jsonb default '{}'::jsonb,
  score int,
  fpm numeric,
  pauses int default 0,
  stalls int default 0,
  clean int default 0,
  created_at timestamptz not null default now()
);

alter table public.sessions enable row level security;

create policy "users read own sessions"
  on public.sessions for select
  using (auth.uid() = user_id);

create policy "users insert own sessions"
  on public.sessions for insert
  with check (auth.uid() = user_id);

create policy "users delete own sessions"
  on public.sessions for delete
  using (auth.uid() = user_id);

create index sessions_user_t on public.sessions (user_id, t);

-- Newer Supabase projects don't auto-grant table access to the API roles.
-- Signed-in users (role "authenticated") need these; RLS above still
-- restricts them to their own rows. The "anon" role gets nothing.
grant usage on schema public to authenticated;
grant select, insert, delete on public.sessions to authenticated;

