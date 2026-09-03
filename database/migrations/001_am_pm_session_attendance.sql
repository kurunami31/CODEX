-- ══════════════════════════════════════════════════════════════════
--  AM/PM Session Attendance Migration
--  Run this in Supabase SQL Editor before deploying frontend changes.
-- ══════════════════════════════════════════════════════════════════

-- 1. Add AM/PM window columns to events table
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS am_start timestamptz,
  ADD COLUMN IF NOT EXISTS am_end   timestamptz,
  ADD COLUMN IF NOT EXISTS pm_start timestamptz,
  ADD COLUMN IF NOT EXISTS pm_end   timestamptz,
  ADD COLUMN IF NOT EXISTS event_end timestamptz;

-- 2. Add AM/PM timestamp columns to attendance table
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS time_in_am  timestamptz,
  ADD COLUMN IF NOT EXISTS time_out_am timestamptz,
  ADD COLUMN IF NOT EXISTS time_in_pm  timestamptz,
  ADD COLUMN IF NOT EXISTS time_out_pm timestamptz;

-- 3. Rewrite mark_attendance RPC with phase parameter
--    p_phase: 'time_in_am', 'time_out_am', 'time_in_pm', 'time_out_pm'
--    Toggle logic: if target column is NULL → set now(); if set → leave it.
--    Awards +10 points only on first ever scan for the student+event.
--    Checks event_end cutoff and phase window boundaries.
create or replace function public.mark_attendance(
  p_event_id   uuid,
  p_student_id text,
  p_phase      text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role      text := public.get_my_role();
  v_profile   record;
  v_event     record;
  v_att       record;
  v_now       timestamptz := now();
  v_is_new    boolean := false;
  v_result    jsonb;
begin
  -- Permission check
  if coalesce(v_role, '') not in ('admin','moderator','superadmin','adviser') then
    raise exception 'Insufficient permissions: only moderators and admins can mark attendance';
  end if;

  -- Validate phase parameter
  if p_phase is null or p_phase not in ('time_in_am','time_out_am','time_in_pm','time_out_pm') then
    raise exception 'Invalid phase. Must be: time_in_am, time_out_am, time_in_pm, time_out_pm';
  end if;

  -- Event exists?
  select * into v_event from public.events where id = p_event_id;
  if v_event is null then
    raise exception 'Event not found';
  end if;

  -- Event end cutoff: if event_end is set and now > event_end, reject
  if v_event.event_end is not null and v_now > v_event.event_end then
    raise exception 'Attendance closed — event has ended';
  end if;

  -- Phase window check (only if the event has the relevant windows set)
  if p_phase in ('time_in_am','time_out_am') and v_event.am_end is not null then
    if v_now > v_event.am_end then
      raise exception 'AM session has ended — use PM phase instead';
    end if;
  end if;
  if p_phase in ('time_in_pm','time_out_pm') and v_event.pm_end is not null then
    if v_now > v_event.pm_end then
      raise exception 'PM session has ended';
    end if;
  end if;

  -- Look up student
  select p.* into v_profile
  from public.profiles p
  where p.student_id = p_student_id;

  if v_profile is null then
    raise exception 'No student found with ID %', p_student_id;
  end if;

  if v_profile.course <> 'BSIT' then
    raise exception 'Attendance is reserved for BSIT students';
  end if;

  -- Upsert attendance row
  insert into public.attendance (event_id, student_id, scanned_by)
  values (p_event_id, p_student_id, auth.uid())
  on conflict (event_id, student_id) do nothing;

  -- Check if this is a new record (all time columns NULL)
  select * into v_att
  from public.attendance
  where event_id = p_event_id and student_id = p_student_id;

  v_is_new := v_att.time_in_am is null and v_att.time_out_am is null
               and v_att.time_in_pm is null and v_att.time_out_pm is null;

  -- Award +10 points only on first scan
  if v_is_new then
    update public.profiles set points = points + 10 where student_id = p_student_id;
  end if;

  -- Toggle logic: if target column is NULL → set now(); otherwise leave it
  case p_phase
    when 'time_in_am' then
      update public.attendance set time_in_am = coalesce(time_in_am, v_now)
      where event_id = p_event_id and student_id = p_student_id;
    when 'time_out_am' then
      update public.attendance set time_out_am = coalesce(time_out_am, v_now)
      where event_id = p_event_id and student_id = p_student_id;
    when 'time_in_pm' then
      update public.attendance set time_in_pm = coalesce(time_in_pm, v_now)
      where event_id = p_event_id and student_id = p_student_id;
    when 'time_out_pm' then
      update public.attendance set time_out_pm = coalesce(time_out_pm, v_now)
      where event_id = p_event_id and student_id = p_student_id;
  end case;

  -- Return updated attendance row
  select * into v_att
  from public.attendance
  where event_id = p_event_id and student_id = p_student_id;

  select jsonb_build_object(
    'status', case
      when v_is_new then 'present'
      else 'updated'
    end,
    'phase', p_phase,
    'time_in_am',  v_att.time_in_am,
    'time_out_am', v_att.time_out_am,
    'time_in_pm',  v_att.time_in_pm,
    'time_out_pm', v_att.time_out_pm,
    'student', jsonb_build_object(
      'student_id', v_profile.student_id,
      'full_name',  v_profile.full_name,
      'year_level', v_profile.year_level,
      'section',    v_profile.section,
      'course',     v_profile.course
    )
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.mark_attendance(uuid, text, text) to authenticated;

-- 4. Update event_attendance RPC to return AM/PM columns + nested profiles
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
  if coalesce(v_role, '') not in ('admin','moderator','superadmin','adviser') then
    raise exception 'Insufficient permissions';
  end if;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.full_name), '[]'::jsonb)
  into v_rows
  from (
    select p.student_id, p.full_name, p.year_level, p.section, p.course, p.avatar_url,
           a.time_in_am, a.time_out_am, a.time_in_pm, a.time_out_pm, a.scanned_at, a.scanned_by,
           jsonb_build_object(
             'id', sp.id,
             'full_name', sp.full_name
           ) as scanned_by_profile
    from public.attendance a
    join public.profiles p on p.student_id = a.student_id
    left join public.profiles sp on sp.id = a.scanned_by
    where a.event_id = p_event_id
  ) t;

  return v_rows;
end;
$$;

grant execute on function public.event_attendance(uuid) to authenticated;

-- 5. Update get_attendance RPC to return AM/PM columns + nested profiles
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
  if coalesce(v_role, '') <> 'superadmin' then
    raise exception 'Insufficient permissions';
  end if;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.scanned_at desc), '[]'::jsonb)
  into v_rows
  from (
    select a.id, a.event_id, a.student_id,
           a.time_in_am, a.time_out_am, a.time_in_pm, a.time_out_pm,
           a.scanned_at, a.scanned_by,
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
