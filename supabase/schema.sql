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

-- ============================================================
-- v0.2 additions — run this block in the SQL Editor if the
-- original schema above is already applied.
-- ============================================================

-- Dismissing a false-positive filler on the recap updates the saved
-- session row; the original schema had no update policy, so those
-- corrections silently never synced.
create policy "users update own sessions"
  on public.sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
grant update on public.sessions to authenticated;

-- Lightweight visit pings from the landing page and the app.
-- Anyone may insert (write-only); only the admin may read.
create table public.visits (
  id uuid primary key default gen_random_uuid(),
  t timestamptz not null default now(),
  path text not null default '/',
  uid uuid
);
alter table public.visits enable row level security;

create policy "anyone logs a visit"
  on public.visits for insert
  to anon, authenticated
  with check (true);

create policy "admin reads visits"
  on public.visits for select
  to authenticated
  using ((auth.jwt() ->> 'email') = 'bruce@waldschmidt.com');

grant usage on schema public to anon;
grant insert on public.visits to anon, authenticated;
grant select on public.visits to authenticated;
create index visits_t on public.visits (t);

-- Admin (email enforced server-side via the JWT claim) can read every
-- session row, for aggregate stats in /admin/.
create policy "admin reads all sessions"
  on public.sessions for select
  using ((auth.jwt() ->> 'email') = 'bruce@waldschmidt.com');

-- ============================================================
-- v0.3 additions — signup tracking for /admin/
-- ============================================================

-- Client code can't read auth.users, so mirror the fields the admin
-- dashboard needs into a profiles table kept current by a trigger.
create table public.profiles (
  uid uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "admin reads profiles"
  on public.profiles for select
  to authenticated
  using ((auth.jwt() ->> 'email') = 'bruce@waldschmidt.com');

grant select on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (uid, email, created_at)
  values (new.id, new.email, new.created_at)
  on conflict (uid) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- backfill accounts that signed up before this table existed
insert into public.profiles (uid, email, created_at)
select id, email, created_at from auth.users
on conflict (uid) do nothing;


-- ---------------------------------------------------------------------------
-- Keep-alive. Free-tier projects pause after about a week without database
-- activity, which silently breaks sign-in, sync and the Deepgram recap. The
-- GitHub workflow in .github/workflows/keepalive.yml calls this every few
-- days. It reads nothing, so it is safe to expose to anon.
create or replace function public.keepalive()
returns timestamptz
language sql
stable
as $$ select now() $$;

grant execute on function public.keepalive() to anon;
