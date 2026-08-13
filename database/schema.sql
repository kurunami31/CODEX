-- ============================================================
--  CODEX — Supabase schema
--  Run this whole file in: Supabase Dashboard → SQL Editor
--  It creates tables, row-level security, attendance RPCs and
--  the identity lock trigger. No demo accounts are seeded.
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
  role        text not null default 'student' check (role in ('student','moderator','admin','superadmin')),
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- idempotent upgrade for databases created before avatars existed
alter table public.profiles add column if not exists avatar_url text;

-- idempotent upgrade: allow the superadmin role on databases created earlier
-- (drops + re-adds the default-named check constraint with the new role)
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('student','moderator','admin','superadmin'));

-- ────────────────────────────────────────────────
--  MEMBERSHIP DUES — members see their own status; only admins
--  and super admins can confirm (flip) payment. The columns are
--  guarded by the lock_profile_identity trigger below, so a member
--  can never mark themselves paid through their own row update.
-- ────────────────────────────────────────────────
alter table public.profiles add column if not exists membership_paid boolean not null default false;
alter table public.profiles add column if not exists membership_paid_at timestamptz;
alter table public.profiles add column if not exists membership_confirmed_by uuid
  references auth.users(id) on delete set null;

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

-- archived posts: hidden from the feed but kept for the author to restore
alter table public.posts add column if not exists archived boolean not null default false;

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

-- Deleting a staff account must not fail because they created events —
-- events survive and simply lose their creator.
alter table public.events
  drop constraint if exists events_created_by_fkey,
  add constraint events_created_by_fkey foreign key (created_by)
    references auth.users(id) on delete set null;

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
  for update to authenticated using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));
-- superadmins manage every member (edit details, change roles). Both USING
-- and WITH CHECK are gated on the acting user's role so that a student
-- updating their own row can never pass this policy's check.
drop policy if exists "profiles_superadmin_update" on public.profiles;
create policy "profiles_superadmin_update" on public.profiles
  for update to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'superadmin')
  with check ((select role from public.profiles where id = auth.uid()) = 'superadmin');
-- NOTE: account deletion intentionally has no direct DELETE policy — it goes
-- through the public.superadmin_delete_user RPC so the auth.users row (and
-- posts/likes/attendance) is removed with it, never orphaning an account.

-- events: everyone signed in can read; only admins write
drop policy if exists "events_select_all"  on public.events;
drop policy if exists "events_admin_write" on public.events;
create policy "events_select_all" on public.events
  for select to authenticated using (true);
create policy "events_admin_write" on public.events
  for insert to authenticated
  with check ((select role from public.profiles where id = auth.uid()) in ('admin','superadmin'));

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
-- superadmins see every attendance record and may remove mistaken scans
drop policy if exists "attendance_superadmin_select" on public.attendance;
drop policy if exists "attendance_superadmin_delete" on public.attendance;
create policy "attendance_superadmin_select" on public.attendance
  for select to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'superadmin');
create policy "attendance_superadmin_delete" on public.attendance
  for delete to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'superadmin');

-- posts: everyone signed in reads and posts; authors edit, archive and
-- delete their own posts
drop policy if exists "posts_select_all" on public.posts;
drop policy if exists "posts_insert_all" on public.posts;
drop policy if exists "posts_update_own" on public.posts;
drop policy if exists "posts_delete_own" on public.posts;
create policy "posts_select_all" on public.posts
  for select to authenticated using (true);
create policy "posts_insert_all" on public.posts
  for insert to authenticated with check (author_id = auth.uid());
create policy "posts_update_own" on public.posts
  for update to authenticated using (author_id = auth.uid())
  with check (author_id = auth.uid());
create policy "posts_delete_own" on public.posts
  for delete to authenticated using (author_id = auth.uid());
-- superadmins may moderate any post (check gated on the acting user, same
-- reasoning as profiles_superadmin_update)
drop policy if exists "posts_superadmin_update" on public.posts;
drop policy if exists "posts_superadmin_delete" on public.posts;
create policy "posts_superadmin_update" on public.posts
  for update to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'superadmin')
  with check ((select role from public.profiles where id = auth.uid()) = 'superadmin');
create policy "posts_superadmin_delete" on public.posts
  for delete to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'superadmin');

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
  -- student ID and the row id can never change — for anyone.
  if tg_op = 'UPDATE' and (new.student_id is distinct from old.student_id
                        or new.id is distinct from old.id) then
    raise exception 'Profile identity (student ID) is immutable after creation';
  end if;
  -- roles CAN change, but only by a superadmin (or the SQL Editor, where
  -- auth.uid() is null — that is how the first super admin is bootstrapped).
  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    if auth.uid() is not null and
       coalesce((select role from public.profiles where id = auth.uid()), '') <> 'superadmin' then
      raise exception 'Only a super admin can change a member''s role';
    end if;
  end if;
  -- membership dues CAN change, but only by an admin / superadmin — a member
  -- can never mark their own fee as paid.
  if tg_op = 'UPDATE' and (new.membership_paid is distinct from old.membership_paid
                        or new.membership_paid_at is distinct from old.membership_paid_at
                        or new.membership_confirmed_by is distinct from old.membership_confirmed_by) then
    if auth.uid() is not null and
       coalesce((select role from public.profiles where id = auth.uid()), '') not in ('admin','superadmin') then
      raise exception 'Only admins can confirm membership payments';
    end if;
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
  if v_role not in ('admin','moderator','superadmin') then
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
  if v_role not in ('admin','moderator','superadmin') then
    raise exception 'Insufficient permissions';
  end if;

  select coalesce(jsonb_agg(row_to_jsonb(t) order by t.full_name), '[]'::jsonb)
  into v_rows
  from (
    select p.student_id, p.full_name, p.year_level, p.section, p.course, p.avatar_url,
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
  if public.get_my_role() not in ('admin','superadmin') then
    raise exception 'Insufficient permissions';
  end if;
  delete from public.events where id = p_event_id;
end;
$$;

grant execute on function public.delete_event(uuid) to authenticated;

-- ────────────────────────────────────────────────
--  RPC: delete a member account (superadmins only)
--  Removes the auth.users row; profiles/posts/likes/attendance
--  cascade away automatically. Cannot delete your own account.
-- ────────────────────────────────────────────────
create or replace function public.superadmin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select role from public.profiles where id = auth.uid()) <> 'superadmin' then
    raise exception 'Insufficient permissions';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;
  delete from auth.users where id = p_user_id;
end;
$$;

grant execute on function public.superadmin_delete_user(uuid) to authenticated;

-- ────────────────────────────────────────────────
--  RPC: confirm / revoke a member's dues (admins / superadmins)
--  Sets membership_paid plus audit columns (when + who).
-- ────────────────────────────────────────────────
create or replace function public.confirm_membership(p_user_id uuid, p_paid boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((select role from public.profiles where id = auth.uid()), '') not in ('admin','superadmin') then
    raise exception 'Insufficient permissions: only admins can confirm membership payments';
  end if;
  update public.profiles
     set membership_paid = p_paid,
         membership_paid_at = case when p_paid then now() else null end,
         membership_confirmed_by = case when p_paid then auth.uid() else null end
   where id = p_user_id;
  if not found then
    raise exception 'Member not found';
  end if;
end;
$$;

grant execute on function public.confirm_membership(uuid, boolean) to authenticated;

-- Defense in depth: lock the RPCs down to authenticated users only.
revoke all on function public.get_my_role, public.mark_attendance,
        public.event_attendance, public.delete_event, public.superadmin_delete_user,
        public.confirm_membership
        from anon, public;

-- Tell PostgREST to reload its schema cache so the RPCs (and any new
-- tables/policies) become visible through the REST API immediately.
notify pgrst, 'reload schema';

-- ────────────────────────────────────────────────
--  POST IMAGES — posts may carry one optional image
-- ────────────────────────────────────────────────
alter table public.posts add column if not exists image_url text;

-- ────────────────────────────────────────────────
--  POST COMMENTS (community feed threads)
-- ────────────────────────────────────────────────
create table if not exists public.post_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  content     text not null check (char_length(content) between 1 and 500),
  created_at  timestamptz not null default now()
);

-- posts: comments disappear with the post; commenters with the account
alter table public.post_comments
  drop constraint if exists post_comments_post_id_fkey,
  add constraint post_comments_post_id_fkey foreign key (post_id)
    references public.posts(id) on delete cascade;
alter table public.post_comments
  drop constraint if exists post_comments_author_id_fkey,
  add constraint post_comments_author_id_fkey foreign key (author_id)
    references public.profiles(id) on delete cascade;

alter table public.post_comments enable row level security;
revoke all on table public.post_comments from anon;

drop policy if exists "post_comments_select_all" on public.post_comments;
drop policy if exists "post_comments_insert_own" on public.post_comments;
drop policy if exists "post_comments_delete_own" on public.post_comments;
drop policy if exists "post_comments_superadmin_delete" on public.post_comments;
create policy "post_comments_select_all" on public.post_comments
  for select to authenticated using (true);
create policy "post_comments_insert_own" on public.post_comments
  for insert to authenticated with check (author_id = auth.uid());
create policy "post_comments_delete_own" on public.post_comments
  for delete to authenticated using (author_id = auth.uid());
create policy "post_comments_superadmin_delete" on public.post_comments
  for delete to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'superadmin');

-- ────────────────────────────────────────────────
--  RSVPS (event headcount — "I'm going")
-- ────────────────────────────────────────────────
create table if not exists public.rsvps (
  event_id    uuid not null references public.events(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.rsvps
  drop constraint if exists rsvps_event_id_fkey,
  add constraint rsvps_event_id_fkey foreign key (event_id)
    references public.events(id) on delete cascade;
alter table public.rsvps
  drop constraint if exists rsvps_user_id_fkey,
  add constraint rsvps_user_id_fkey foreign key (user_id)
    references public.profiles(id) on delete cascade;

alter table public.rsvps enable row level security;
revoke all on table public.rsvps from anon;

drop policy if exists "rsvps_select_all" on public.rsvps;
drop policy if exists "rsvps_insert_own" on public.rsvps;
drop policy if exists "rsvps_delete_own" on public.rsvps;
create policy "rsvps_select_all" on public.rsvps
  for select to authenticated using (true);
create policy "rsvps_insert_own" on public.rsvps
  for insert to authenticated with check (user_id = auth.uid());
create policy "rsvps_delete_own" on public.rsvps
  for delete to authenticated using (user_id = auth.uid());

-- ────────────────────────────────────────────────
--  RPC: attendance counts per event (admins / moderators)
--  Powers the analytics chart on the Control panel.
-- ────────────────────────────────────────────────
create or replace function public.attendance_counts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.get_my_role();
  v_rows jsonb;
begin
  if v_role not in ('admin','moderator','superadmin') then
    raise exception 'Insufficient permissions';
  end if;

  select coalesce(jsonb_agg(row_to_jsonb(t) order by t.event_date), '[]'::jsonb)
  into v_rows
  from (
    select e.id as event_id, e.title, e.event_date,
           count(a.id)::int as present
    from public.events e
    left join public.attendance a on a.event_id = e.id
    group by e.id, e.title, e.event_date
  ) t;

  return v_rows;
end;
$$;

grant execute on function public.attendance_counts() to authenticated;

-- ============================================================
--  PROFILE PICTURES — public storage bucket
--  Path layout: avatars/<auth.uid()>/avatar.<ext> — each user
--  owns exactly one object under their own folder. 3 MB cap,
--  common image formats only. Read is public (shared avatars).
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 3145728,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "avatars_own_insert"  on storage.objects;
drop policy if exists "avatars_own_update"  on storage.objects;
drop policy if exists "avatars_own_delete"  on storage.objects;

create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars_own_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce((metadata ->> 'contentLength')::bigint, 0) <= 3145728);

create policy "avatars_own_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_own_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
--  POST IMAGES — public storage bucket
--  Path layout: post-images/<auth.uid()>/<uuid>.<ext> — each user
--  owns the images they upload. 5 MB cap, common image formats.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 5242880,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

drop policy if exists "postimages_public_read" on storage.objects;
drop policy if exists "postimages_own_insert"  on storage.objects;
drop policy if exists "postimages_own_delete"  on storage.objects;

create policy "postimages_public_read" on storage.objects
  for select using (bucket_id = 'post-images');

create policy "postimages_own_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce((metadata ->> 'contentLength')::bigint, 0) <= 5242880);

create policy "postimages_own_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
--  GOING LIVE — no demo accounts are seeded.
--  New sign-ups create their own auth user + profile, so the
--  old demo rows are intentionally omitted (they used to reserve
--  student IDs like 2024-1001 / 2024-1002 and blocked real users).
--
--  If a database was already created WITH the old demo seed, run
--  this once in the SQL Editor to free those IDs:
--
--  delete from public.profiles
--   where student_id in ('ADM-0001','MOD-0001','2024-1001','2024-1002');
--  delete from auth.users
--   where id in ('aaaaaaaa-0000-4000-8000-000000000001',
--                'aaaaaaaa-0000-4000-8000-000000000002',
--                'aaaaaaaa-0000-4000-8000-000000000003',
--                'aaaaaaaa-0000-4000-8000-000000000004');
--
--  Then decide on email confirmation (Authentication → Providers
--  → Email): OFF for instant sign-ups, ON for verified sign-ups.
--
--  SUPER ADMIN — bootstrap the first one after the schema runs:
--  (runs as postgres in the SQL Editor, so the role-lock trigger permits it)
--
--  update public.profiles p set role = 'superadmin'
--  from auth.users u
--  where p.id = u.id and u.email = 'you@yourdomain.com';
--
--  The superadmin role can: manage every member (edit / change roles /
--  delete accounts via public.superadmin_delete_user), moderate any post,
--  and see / correct every attendance record. Only a superadmin may change
--  roles — admins keep their existing event + attendance powers.
-- ============================================================
-- ============================================================
-- App settings � public flags consumed by /api/status (e.g.
-- maintenance mode). Publicly readable so the maintenance page
-- renders even before login; only the server API (service role)
-- may write, which RLS enforces.
-- ============================================================
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "app_settings_read" on public.app_settings;
create policy "app_settings_read"
  on public.app_settings for select
  using (true);

grant select on public.app_settings to anon, authenticated;
