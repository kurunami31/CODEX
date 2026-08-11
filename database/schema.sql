-- ============================================================
--  CODEX — Supabase schema
--  Run this whole file in: Supabase Dashboard → SQL Editor
--  It creates tables, row-level security, attendance RPCs and
--  demo accounts (admin / moderator / students).
-- ============================================================

create extension if not exists pgcrypto;

-- ────────────────────────────────────────────────
--  PROFILES (one row per auth user)
-- ────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  student_id  text unique not null,
  full_name   text not null,
  year_level  text not null check (year_level in ('1st Year','2nd Year','3rd Year','4th Year')),
  section     text not null,
  course      text not null default 'BSIT' check (course in ('BSIT','BSEM','BSAB','other')),
  role        text not null default 'student' check (role in ('student','moderator','admin')),
  created_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────
--  EVENTS (posted by admins)
-- ────────────────────────────────────────────────
create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  location     text,
  event_date   timestamptz not null,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

-- ────────────────────────────────────────────────
--  ATTENDANCE (one row per student per event)
-- ────────────────────────────────────────────────
create table if not exists public.attendance (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  student_id  text not null references public.profiles(student_id) on delete cascade,
  scanned_by  uuid references auth.users(id),
  scanned_at  timestamptz not null default now(),
  unique (event_id, student_id)
);

-- ────────────────────────────────────────────────
--  POSTS (community feed) + LIKES
-- ────────────────────────────────────────────────
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles(id) on delete cascade,
  content     text not null check (char_length(content) <= 2000),
  created_at  timestamptz not null default now()
);

create table if not exists public.likes (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- Bring existing databases in line with the create statements above
-- (postgres default constraint names are "<table>_<column>_fkey").
alter table public.posts
  drop constraint if exists posts_author_id_fkey,
  add constraint posts_author_id_fkey foreign key (author_id)
    references public.profiles(id) on delete cascade;
alter table public.likes
  drop constraint if exists likes_user_id_fkey,
  add constraint likes_user_id_fkey foreign key (user_id)
    references public.profiles(id) on delete cascade;

-- ────────────────────────────────────────────────
--  ROW LEVEL SECURITY
-- ────────────────────────────────────────────────
alter table public.profiles    enable row level security;
alter table public.events      enable row level security;
alter table public.attendance  enable row level security;
alter table public.posts       enable row level security;
alter table public.likes       enable row level security;

-- Defense in depth: the unauthenticated role gets nothing, even if a
-- future policy forgets a USING clause.
revoke all on table public.profiles, public.events, public.attendance,
        public.posts, public.likes from anon;

-- profiles: members can see each other (name/role/section — like a community
-- directory; emails live in auth.users and are never exposed); users only
-- manage their own row
drop policy if exists "profiles_select_own"      on public.profiles;
drop policy if exists "profiles_select_members"  on public.profiles;
drop policy if exists "profiles_insert_own"      on public.profiles;
drop policy if exists "profiles_update_own"      on public.profiles;
create policy "profiles_select_members" on public.profiles
  for select to authenticated using (true);
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (id = auth.uid() and role = 'student');
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and role = 'student');

-- events: everyone signed in can read; only admins write
drop policy if exists "events_select_all"  on public.events;
drop policy if exists "events_admin_write" on public.events;
create policy "events_select_all" on public.events
  for select to authenticated using (true);
create policy "events_admin_write" on public.events
  for insert to authenticated
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

-- attendance: no direct writes — all recording goes through the
-- security-definer RPCs (mark_attendance / event_attendance). Students
-- may only read their OWN attendance history.
drop policy if exists "attendance_no_public_access" on public.attendance;
drop policy if exists "attendance_select_own" on public.attendance;
create policy "attendance_no_public_access" on public.attendance
  for all to authenticated using (false) with check (false);
create policy "attendance_select_own" on public.attendance
  for select to authenticated
  using (student_id = (select p.student_id from public.profiles p where p.id = auth.uid()));

-- posts: everyone signed in reads and posts; authors delete their own
drop policy if exists "posts_select_all" on public.posts;
drop policy if exists "posts_insert_all" on public.posts;
drop policy if exists "posts_delete_own" on public.posts;
create policy "posts_select_all" on public.posts
  for select to authenticated using (true);
create policy "posts_insert_all" on public.posts
  for insert to authenticated with check (author_id = auth.uid());
create policy "posts_delete_own" on public.posts
  for delete to authenticated using (author_id = auth.uid());

-- likes: anyone signed in can read / like / unlike
drop policy if exists "likes_select_all" on public.likes;
drop policy if exists "likes_insert_own" on public.likes;
drop policy if exists "likes_delete_own" on public.likes;
create policy "likes_select_all" on public.likes
  for select to authenticated using (true);
create policy "likes_insert_own" on public.likes
  for insert to authenticated with check (user_id = auth.uid());
create policy "likes_delete_own" on public.likes
  for delete to authenticated using (user_id = auth.uid());

-- ────────────────────────────────────────────────
--  HARDENING: lock role + student_id forever
--  Even a security-definer function cannot escalate a user's role or
--  rewrite their student ID after sign-up.
-- ────────────────────────────────────────────────
create or replace function public.lock_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (new.role is distinct from old.role
                        or new.student_id is distinct from old.student_id
                        or new.id is distinct from old.id) then
    raise exception 'Profile identity (role / student ID) is immutable after creation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_lock_identity on public.profiles;
create trigger trg_profiles_lock_identity
  before update on public.profiles
  for each row execute function public.lock_profile_identity();

-- ────────────────────────────────────────────────
--  RPC: current user's role
-- ────────────────────────────────────────────────
create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

grant execute on function public.get_my_role() to authenticated;

-- ────────────────────────────────────────────────
--  RPC: mark attendance (moderators / admins only)
--  Returns { status: 'present'|'duplicate', student: {...} }
-- ────────────────────────────────────────────────
create or replace function public.mark_attendance(
  p_event_id uuid,
  p_student_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role    text := public.get_my_role();
  v_profile record;
  v_result  jsonb;
begin
  if v_role not in ('admin','moderator') then
    raise exception 'Insufficient permissions: only moderators and admins can mark attendance';
  end if;

  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'Event not found';
  end if;

  select p.* into v_profile
  from public.profiles p
  where p.student_id = p_student_id;

  if v_profile is null then
    raise exception 'No student found with ID %', p_student_id;
  end if;

  if v_profile.course <> 'BSIT' then
    raise exception 'Attendance is reserved for BSIT students';
  end if;

  insert into public.attendance (event_id, student_id, scanned_by)
  values (p_event_id, p_student_id, auth.uid())
  on conflict (event_id, student_id) do nothing;

  select jsonb_build_object(
    'status', case when exists (
      select 1 from public.attendance a
      where a.event_id = p_event_id and a.student_id = p_student_id
    ) then 'present' else 'duplicate' end,
    'student', jsonb_build_object(
      'student_id', v_profile.student_id,
      'full_name', v_profile.full_name,
      'year_level', v_profile.year_level,
      'section',   v_profile.section,
      'course',    v_profile.course
    )
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.mark_attendance(uuid, text) to authenticated;

-- ────────────────────────────────────────────────
--  RPC: attendance list for an event (admins / moderators)
-- ────────────────────────────────────────────────
create or replace function public.event_attendance(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.get_my_role();
  v_rows jsonb;
begin
  if v_role not in ('admin','moderator') then
    raise exception 'Insufficient permissions';
  end if;

  select coalesce(jsonb_agg(row_to_jsonb(t) order by t.full_name), '[]'::jsonb)
  into v_rows
  from (
    select p.student_id, p.full_name, p.year_level, p.section, p.course,
           a.scanned_at, a.scanned_by,
           (select full_name from public.profiles sp where sp.id = a.scanned_by) as scanned_by_name
    from public.attendance a
    join public.profiles p on p.student_id = a.student_id
    where a.event_id = p_event_id
  ) t;

  return v_rows;
end;
$$;

grant execute on function public.event_attendance(uuid) to authenticated;

-- ────────────────────────────────────────────────
--  RPC: delete an event (admins only)
-- ────────────────────────────────────────────────
create or replace function public.delete_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_my_role() <> 'admin' then
    raise exception 'Insufficient permissions';
  end if;
  delete from public.events where id = p_event_id;
end;
$$;

grant execute on function public.delete_event(uuid) to authenticated;

-- Defense in depth: lock the RPCs down to authenticated users only.
revoke all on function public.get_my_role, public.mark_attendance,
        public.event_attendance, public.delete_event from anon, public;

-- Tell PostgREST to reload its schema cache so the RPCs (and any new
-- tables/policies) become visible through the REST API immediately.
notify pgrst, 'reload schema';

-- ============================================================
--  SEED — DEMO ACCOUNTS
--  Remove this section before going live, or keep for testing.
--  Passwords below are for LOCAL/DEMO use only.
-- ============================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change
) values
(
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-0000-4000-8000-000000000001',
  'authenticated', 'authenticated',
  'admin@codex.org',
  crypt('CodexAdmin2026!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}', now(), now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-0000-4000-8000-000000000002',
  'authenticated', 'authenticated',
  'moderator@codex.org',
  crypt('CodexMod2026!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}', now(), now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-0000-4000-8000-000000000003',
  'authenticated', 'authenticated',
  'juan.delos@student.codex.org',
  crypt('Student2026!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}', now(), now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-0000-4000-8000-000000000004',
  'authenticated', 'authenticated',
  'maria.santos@student.codex.org',
  crypt('Student2026!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}', now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into public.profiles (id, student_id, full_name, year_level, section, course, role) values
('aaaaaaaa-0000-4000-8000-000000000001', 'ADM-0001', 'Admin One',    '4th Year', 'A', 'BSIT', 'admin'),
('aaaaaaaa-0000-4000-8000-000000000002', 'MOD-0001', 'Moderator One', '3rd Year', 'B', 'BSIT', 'moderator'),
('aaaaaaaa-0000-4000-8000-000000000003', '2024-1001', 'Juan Dela Cruz',  '2nd Year', 'B', 'BSIT', 'student'),
('aaaaaaaa-0000-4000-8000-000000000004', '2024-1002', 'Maria Santos',    '2nd Year', 'B', 'BSIT', 'student')
on conflict (id) do nothing;

insert into public.events (id, title, description, location, event_date, created_by) values
(
  'bbbbbbbb-0000-4000-8000-000000000001',
  'CODEBYTERS General Assembly',
  'Kick-off assembly for the semester. Meet the officers, see the roadmap, and learn how to join committees. Attendance is counted via QR.',
  'DOrSU ICT Building — Audio Visual Room',
  now() + interval '3 days',
  'aaaaaaaa-0000-4000-8000-000000000001'
),
(
  'bbbbbbbb-0000-4000-8000-000000000002',
  'Intro to Web Development Workshop',
  'Hands-on workshop: HTML, CSS and your first deploy. Bring your laptop!',
  'DOrSU ICT Building — Computer Lab 2',
  now() + interval '10 days',
  'aaaaaaaa-0000-4000-8000-000000000001'
)
on conflict (id) do nothing;

-- ============================================================
--  DONE. Now head to Authentication → Providers → Email and
--  DISABLE "Confirm email" so demo sign-ups work instantly.
-- ============================================================
