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
  using (student_id = coalesce(public.get_my_profile() ->> 'student_id', ''));
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
  -- course CAN change, but only by an admin / superadmin — otherwise a
  -- non-BSIT member could flip their own course to 'BSIT' and bypass the
  -- BSIT-only rule enforced by mark_attendance.
  if tg_op = 'UPDATE' and new.course is distinct from old.course then
    if auth.uid() is not null and
       coalesce((select role from public.profiles where id = auth.uid()), '') not in ('admin','superadmin') then
      raise exception 'Only admins can change a member''s course';
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

  select coalesce(jsonb_agg(to_jsonb(t) order by t.full_name), '[]'::jsonb)
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
--  RPC: full attendance log (superadmins only)
--  The REST path cannot embed-join profiles.student_id — that column has
--  no SELECT grant under the ID lockdown, so every attendance query with
--  a member join dies with "permission denied for table profiles". This
--  runs as the owner (security definer) and enforces the role itself.
-- ────────────────────────────────────────────────
create or replace function public.get_attendance()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.get_my_role();
  v_rows jsonb;
begin
  if v_role <> 'superadmin' then
    raise exception 'Insufficient permissions';
  end if;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.scanned_at desc), '[]'::jsonb)
  into v_rows
  from (
    select a.id, a.event_id, a.student_id, a.scanned_at, a.scanned_by,
           (select to_jsonb(p) from (
              select full_name, year_level, section, avatar_url
              from public.profiles p
              where p.student_id = a.student_id
            ) p) as profiles,
           (select to_jsonb(e) from (
              select id, title from public.events e where e.id = a.event_id
            ) e) as events
    from public.attendance a
    order by a.scanned_at desc
    limit 500
  ) t;

  return v_rows;
end;
$$;

grant execute on function public.get_attendance() to authenticated;

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

-- PostgREST connects as `authenticator`; revoking from PUBLIC above also
-- stripped its implicit EXECUTE, which hides the functions from the REST
-- API (404 "function does not exist"). Re-grant explicitly so the RPCs
-- stay callable through PostgREST while anon/public stay locked out.
grant execute on function
  public.get_my_role(), public.mark_attendance(uuid, text),
  public.event_attendance(uuid), public.delete_event(uuid),
  public.superadmin_delete_user(uuid), public.confirm_membership(uuid, boolean),
  public.get_my_profile(), public.get_members(), public.attendance_counts(),
  public.get_attendance()
  to authenticator;

-- ────────────────────────────────────────────────
--  ID PRIVACY: student IDs are visible to the owner,
--  moderators and admins only.
--  Table-level SELECT is removed from `authenticated` and replaced with
--  column-level grants on every column EXCEPT student_id — so even a
--  hand-crafted REST query cannot read it (Postgres column revokes
--  cannot cap a table-level grant, but column grants do restrict).
--  Staff read IDs through the security-definer RPCs below (which run as
--  the table owner). INSERT/UPDATE privileges are untouched.
-- ────────────────────────────────────────────────
revoke select on public.profiles from authenticated;
grant select (id, full_name, year_level, section, course, role,
              avatar_url, created_at, membership_paid, membership_paid_at,
              points, receipt_url)
  on public.profiles to authenticated;

-- Logged-out visitors may only count members (the welcome page shows a
-- public member count via /api/status). The anon RLS policy below only
-- opens the `id` column grant, so names and IDs stay hidden.
grant select (id) on public.profiles to anon;
drop policy if exists "profiles_select_anon_count" on public.profiles;
create policy "profiles_select_anon_count" on public.profiles
  for select to anon using (true);

-- Own full profile (incl. the owner's own student ID)
create or replace function public.get_my_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
begin
  select to_jsonb(t) into v_row
  from (select * from public.profiles where id = auth.uid()) t;
  return coalesce(v_row, '{}'::jsonb);
end;
$$;

grant execute on function public.get_my_profile() to authenticated;

-- Member list: students get everything except student_id; staff
-- (moderators / admins / superadmins) get the full record including IDs.
create or replace function public.get_members()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.get_my_role();
begin
  if v_role in ('admin','moderator','superadmin') then
    return (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.full_name), '[]'::jsonb)
      from (
        select id, student_id, full_name, year_level, section, course, role,
               avatar_url, created_at, membership_paid, membership_paid_at,
               points, receipt_url
        from public.profiles
      ) t
    );
  end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.full_name), '[]'::jsonb)
    from (
      select id, full_name, year_level, section, course, role,
             avatar_url, created_at, membership_paid, points
      from public.profiles
    ) t
  );
end;
$$;

grant execute on function public.get_members() to authenticated;

revoke all on function public.get_my_profile, public.get_members from anon, public;

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
  content     text not null check (char_length(content) <= 500),
  created_at  timestamptz not null default now(),
  image_url   text,
  parent_id   uuid references public.post_comments(id) on delete cascade,
  updated_at  timestamptz default now()
);

-- Existing databases already have this table, so `create table if not exists`
-- is a no-op for them — add the new columns explicitly (idempotent).
alter table public.post_comments add column if not exists image_url text;
alter table public.post_comments add column if not exists parent_id uuid;
alter table public.post_comments add column if not exists updated_at timestamptz;

-- allow image-only comments (empty content when a photo is attached)
alter table public.post_comments
  drop constraint if exists post_comments_content_check,
  add constraint post_comments_content_check check (
    (content is not null and char_length(content) between 1 and 500)
    or (image_url is not null and (content is null or char_length(content) = 0))
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

-- Replies vanish when the parent comment goes away.
alter table public.post_comments
  drop constraint if exists post_comments_parent_id_fkey,
  add constraint post_comments_parent_id_fkey foreign key (parent_id)
    references public.post_comments(id) on delete cascade;

alter table public.post_comments enable row level security;
revoke all on table public.post_comments from anon;

drop policy if exists "post_comments_select_all" on public.post_comments;
drop policy if exists "post_comments_insert_own" on public.post_comments;
drop policy if exists "post_comments_update_own" on public.post_comments;
drop policy if exists "post_comments_delete_own" on public.post_comments;
drop policy if exists "post_comments_superadmin_delete" on public.post_comments;
create policy "post_comments_select_all" on public.post_comments
  for select to authenticated using (true);
create policy "post_comments_insert_own" on public.post_comments
  for insert to authenticated with check (author_id = auth.uid());
create policy "post_comments_update_own" on public.post_comments
  for update to authenticated using (author_id = auth.uid())
  with check (author_id = auth.uid());
create policy "post_comments_delete_own" on public.post_comments
  for delete to authenticated using (author_id = auth.uid());
create policy "post_comments_superadmin_delete" on public.post_comments
  for delete to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'superadmin');

-- ────────────────────────────────────────────────
--  EVENT COMMENTS (Q&A on an event page)
-- ────────────────────────────────────────────────
create table if not exists public.event_comments (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  content     text not null check (char_length(content) between 1 and 500),
  created_at  timestamptz not null default now()
);

alter table public.event_comments
  drop constraint if exists event_comments_event_id_fkey,
  add constraint event_comments_event_id_fkey foreign key (event_id)
    references public.events(id) on delete cascade;
alter table public.event_comments
  drop constraint if exists event_comments_author_id_fkey,
  add constraint event_comments_author_id_fkey foreign key (author_id)
    references public.profiles(id) on delete cascade;

alter table public.event_comments enable row level security;
revoke all on table public.event_comments from anon;

drop policy if exists "event_comments_select_all" on public.event_comments;
drop policy if exists "event_comments_insert_own" on public.event_comments;
drop policy if exists "event_comments_delete_own" on public.event_comments;
drop policy if exists "event_comments_superadmin_delete" on public.event_comments;
create policy "event_comments_select_all" on public.event_comments
  for select to authenticated using (true);
create policy "event_comments_insert_own" on public.event_comments
  for insert to authenticated with check (author_id = auth.uid());
create policy "event_comments_delete_own" on public.event_comments
  for delete to authenticated using (author_id = auth.uid());
create policy "event_comments_superadmin_delete" on public.event_comments
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

  select coalesce(jsonb_agg(to_jsonb(t) order by t.event_date), '[]'::jsonb)
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
--  FEATURE PACK: dues receipts · points · leaderboard ·
--  certificates · elections · push · multi-photo posts
-- ============================================================

-- ── Multi-photo posts: `images` (array of URLs) + legacy `image_url` ──
alter table public.posts add column if not exists images jsonb;

-- ── Dues receipt: members upload payment proof; staff view it ──
alter table public.profiles add column if not exists receipt_url text;

-- ── Points: +5 for a post, +10 for attending an event ──
alter table public.profiles add column if not exists points integer not null default 0;

create or replace function public.award_post_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set points = points + 5 where id = new.author_id;
  return new;
end;
$$;

drop trigger if exists trg_posts_award_points on public.posts;
create trigger trg_posts_award_points
  after insert on public.posts
  for each row execute function public.award_post_points();

-- Attendance awards +10 only on a NEW scan (duplicates earn nothing).
-- Re-declares mark_attendance so existing deployments get the new logic.
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

  if not exists (select 1 from public.attendance a
                 where a.event_id = p_event_id and a.student_id = p_student_id) then
    insert into public.attendance (event_id, student_id, scanned_by)
    values (p_event_id, p_student_id, auth.uid());
    update public.profiles set points = points + 10 where student_id = p_student_id;
  end if;

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

-- ── Elections: digital voting for org officers ──
-- `archived` hides a finished election from members while keeping its
-- results for officers (unarchive to bring it back). `starts_at`/`ends_at`
-- define an optional voting window that auto-opens/closes the election;
-- `positions` is the roster [{name, min, max}] of contested offices;
-- `publish_results` lets officers show the tally to members after close.
create table if not exists public.elections (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text,
  open            boolean not null default false,
  archived        boolean not null default false,
  starts_at       timestamptz,
  ends_at         timestamptz,
  positions       jsonb,
  publish_results boolean not null default false,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
alter table public.elections add column if not exists archived boolean not null default false;
alter table public.elections add column if not exists starts_at timestamptz;
alter table public.elections add column if not exists ends_at timestamptz;
alter table public.elections add column if not exists positions jsonb;
alter table public.elections add column if not exists publish_results boolean not null default false;

create table if not exists public.election_candidates (
  id          uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  position    text not null,
  platform    text,
  winner      boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (election_id, user_id, position)
);
alter table public.election_candidates add column if not exists winner boolean not null default false;

-- Upgrade path: the first version of election_votes allowed only ONE vote
-- per voter per election (PK on election_id+voter_id, no position column),
-- so a ballot with multiple offices was impossible. Any database that still
-- has that shape is rebuilt as the per-position ballot below. The feature is
-- brand new, so there are no production votes worth preserving.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'election_votes'
      and column_name = 'election_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'election_votes'
      and column_name = 'position'
  ) then
    drop table public.election_votes;
  end if;
end $$;

-- One row per (voter, position) so a member casts one vote for each
-- office (president, vp, secretary…) — the unique constraint rejects a
-- second vote in the same position while still allowing one per office.
create table if not exists public.election_votes (
  id           uuid primary key default gen_random_uuid(),
  election_id  uuid not null references public.elections(id) on delete cascade,
  voter_id     uuid not null references public.profiles(id) on delete cascade,
  candidate_id uuid not null references public.election_candidates(id) on delete cascade,
  position     text not null,
  created_at   timestamptz not null default now(),
  unique (election_id, voter_id, position)
);

alter table public.elections enable row level security;
alter table public.election_candidates enable row level security;
alter table public.election_votes enable row level security;
revoke all on table public.elections, public.election_candidates, public.election_votes from anon;

drop policy if exists "elections_select_all" on public.elections;
drop policy if exists "elections_admin_write" on public.elections;
drop policy if exists "elections_admin_update" on public.elections;
drop policy if exists "elections_admin_delete" on public.elections;
drop policy if exists "election_candidates_select_all" on public.election_candidates;
drop policy if exists "election_candidates_admin_write" on public.election_candidates;
drop policy if exists "election_candidates_admin_delete" on public.election_candidates;
drop policy if exists "election_votes_select_own" on public.election_votes;
drop policy if exists "election_votes_insert_own" on public.election_votes;

create policy "elections_select_all" on public.elections
  for select to authenticated using (true);
create policy "elections_admin_write" on public.elections
  for insert to authenticated
  with check ((select role from public.profiles where id = auth.uid()) in ('admin','superadmin'));
create policy "elections_admin_update" on public.elections
  for update to authenticated
  using ((select role from public.profiles where id = auth.uid()) in ('admin','superadmin'))
  with check ((select role from public.profiles where id = auth.uid()) in ('admin','superadmin'));
create policy "elections_admin_delete" on public.elections
  for delete to authenticated
  using ((select role from public.profiles where id = auth.uid()) in ('admin','superadmin'));
create policy "election_candidates_select_all" on public.election_candidates
  for select to authenticated using (true);
create policy "election_candidates_admin_write" on public.election_candidates
  for insert to authenticated
  with check ((select role from public.profiles where id = auth.uid()) in ('admin','superadmin'));
create policy "election_candidates_admin_delete" on public.election_candidates
  for delete to authenticated
  using ((select role from public.profiles where id = auth.uid()) in ('admin','superadmin'));
create policy "election_votes_select_own" on public.election_votes
  for select to authenticated using (voter_id = auth.uid());
-- IMPORTANT: the new-row columns MUST be qualified as election_votes.* —
-- unqualified election_id/position would resolve to the subquery's
-- election_candidates columns instead (innermost scope wins), silently
-- letting members vote for candidates outside this election.
-- Voting is gated on the election being open (manually OR inside the
-- voting window) and on eligibility: dues-paid members or staff.
create policy "election_votes_insert_own" on public.election_votes
  for insert to authenticated
  with check (
    voter_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = election_votes.voter_id
        and (p.membership_paid or p.role in ('admin','moderator','superadmin'))
    )
    and exists (
      select 1 from public.elections e
      join public.election_candidates c on c.election_id = e.id
      where e.id = election_votes.election_id
        and not e.archived
        and (e.open or (
          e.starts_at is not null and e.ends_at is not null
          and now() between e.starts_at and e.ends_at
        ))
        and c.id = election_votes.candidate_id
        and c.position = election_votes.position
    )
  );

-- Candidate guardrails: a candidate's position must be on the election
-- roster (when one is defined) and within its max limit.
create or replace function public.election_candidate_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_roster jsonb;
  v_min    int;
  v_max    int;
  v_count  int;
begin
  select e.positions into v_roster from public.elections e where e.id = new.election_id;
  if v_roster is not null and jsonb_array_length(v_roster) > 0 then
    if not exists (
      select 1 from jsonb_array_elements(v_roster) p
      where p->>'name' = new.position
    ) then
      raise exception 'Position "%" is not on this election''s roster', new.position;
    end if;
    select (p->>'min')::int, (p->>'max')::int into v_min, v_max
    from jsonb_array_elements(v_roster) p where p->>'name' = new.position;
    if v_max is not null then
      select count(*) into v_count
      from public.election_candidates c
      where c.election_id = new.election_id and c.position = new.position;
      if v_count >= v_max then
        raise exception 'Position "%" has reached its maximum of % candidates', new.position, v_max;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_candidate_limits on public.election_candidates;
create trigger trg_candidate_limits
  before insert on public.election_candidates
  for each row execute function public.election_candidate_limits();

-- Opening an election requires each roster position to have its minimum
-- number of candidates (default minimum 1 when not specified).
create or replace function public.election_open_min_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_missing text;
begin
  if new.open and not old.open and new.positions is not null
     and jsonb_array_length(new.positions) > 0 then
    select string_agg(p->>'name', ', ') into v_missing
    from jsonb_array_elements(new.positions) p
    where (select count(*) from public.election_candidates c
           where c.election_id = new.id and c.position = p->>'name')
          < coalesce((p->>'min')::int, 1);
    if v_missing is not null then
      raise exception 'Cannot open: % still need(s) more candidates', v_missing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_election_open_min on public.elections;
create trigger trg_election_open_min
  before update on public.elections
  for each row execute function public.election_open_min_check();

-- On close, compute the winner per position: the candidate with strictly
-- more votes than every other candidate in that position (ties = no winner).
create or replace function public.election_compute_winners()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.open and not new.open then
    update public.election_candidates set winner = false
    where election_id = new.id;
    update public.election_candidates c set winner = true
    where c.election_id = new.id
      and exists (
        select 1
        from (
          select v.candidate_id, count(*) as cnt
          from public.election_votes v
          where v.election_id = new.id
          group by v.candidate_id
        ) votes
        where votes.candidate_id = c.id
          and votes.cnt > 0
          and not exists (
            select 1
            from public.election_votes v2
            join public.election_candidates c2 on c2.id = v2.candidate_id
            where v2.election_id = new.id
              and c2.position = c.position
              and c2.id <> c.id
            group by c2.id
            having count(*) >= votes.cnt
          )
      );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_election_winners on public.elections;
create trigger trg_election_winners
  before update on public.elections
  for each row execute function public.election_compute_winners();

-- Member-visible results: only after the election is closed AND results
-- are published (staff may always view).
create or replace function public.election_results(p_election_id uuid)
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
    if not exists (
      select 1 from public.elections e
      where e.id = p_election_id and not e.open
        and e.publish_results and not e.archived
    ) then
      raise exception 'Results are not published yet';
    end if;
  end if;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.position, t.votes desc), '[]'::jsonb)
  into v_rows
  from (
    select c.id as candidate_id, c.position, c.user_id, p.full_name, p.section,
           c.winner, count(v.voter_id)::int as votes
    from public.election_candidates c
    join public.profiles p on p.id = c.user_id
    left join public.election_votes v on v.candidate_id = c.id
    where c.election_id = p_election_id
    group by c.id, c.position, c.user_id, p.full_name, p.section, c.winner
  ) t;

  return v_rows;
end;
$$;

grant execute on function public.election_results(uuid) to authenticated;

-- Tally RPC: staff only. Returns candidate vote counts per position.

-- Tally RPC: staff only. Returns candidate vote counts per position.
create or replace function public.election_tally(p_election_id uuid)
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

  select coalesce(jsonb_agg(to_jsonb(t) order by t.position, t.votes desc), '[]'::jsonb)
  into v_rows
  from (
    select c.id as candidate_id, c.position, c.user_id, p.full_name, p.section,
           count(v.voter_id)::int as votes
    from public.election_candidates c
    join public.profiles p on p.id = c.user_id
    left join public.election_votes v on v.candidate_id = c.id
    where c.election_id = p_election_id
    group by c.id, c.position, c.user_id, p.full_name, p.section
  ) t;

  return v_rows;
end;
$$;

grant execute on function public.election_tally(uuid) to authenticated;

-- ── In-app notifications: powers the topbar bell (works without VAPID) ──
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  title      text not null,
  body       text,
  url        text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on table public.notifications from anon;

drop policy if exists "notifications_select_own" on public.notifications;
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "notifications_update_own" on public.notifications
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Trigger: a new event lands a notification on every member's bell
-- (except the officer who created it). Runs as definer so it bypasses
-- RLS and can insert for all users.
create or replace function public.notify_new_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, title, body, url)
  select id, 'New event', new.title, '/app/events'
  from public.profiles
  where id <> new.created_by;
  return new;
end;
$$;

drop trigger if exists trg_events_notify on public.events;
create trigger trg_events_notify
  after insert on public.events
  for each row execute function public.notify_new_event();

-- Trigger: a new comment notifies the post author (skip self-comments).
create or replace function public.notify_post_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
begin
  select author_id into v_author from public.posts where id = new.post_id;
  if v_author is not null and v_author <> new.author_id then
    insert into public.notifications (user_id, title, body, url)
    values (v_author, 'New comment',
      case when char_length(new.content) > 0 then left(new.content, 120)
           else 'Someone commented with a photo' end,
      '/app/feed');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_comments_notify on public.post_comments;
create trigger trg_comments_notify
  after insert on public.post_comments
  for each row execute function public.notify_post_comment();

-- ── Push notifications: one row per device subscription ──
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null,
  keys       jsonb not null,
  created_at timestamptz not null default now(),
  unique (endpoint)
);

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon;

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

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
