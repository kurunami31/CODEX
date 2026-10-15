-- ══════════════════════════════════════════════════════════════════
--  FIX: "Event has no end time set" on every scan
--
--  Root cause: the live mark_attendance RPC HARD-REQUIRED event_end and
--  raised 'Event has no end time set' whenever it was NULL. Events created
--  through the UI never saved event_end, so every scan was rejected.
--
--  This migration:
--    1. Backfills event_end for existing events (pm_end → am_end → start+8h)
--    2. Replaces mark_attendance with the p_phase version that treats a
--       missing/ended window as "no cutoff" instead of a hard failure
--    3. Keeps a 2-arg wrapper so already-cached clients keep working
--    4. Reloads the PostgREST schema cache
--
--  Run this in the Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════════

-- 1. Backfill event_end so existing events are scannable immediately.
update public.events
set event_end = coalesce(pm_end, am_end, event_date + interval '8 hours')
where event_end is null;

-- 2. Replace the RPC with the p_phase version. A NULL event_end (or a
--    window that hasn't been configured) means "no cutoff" — never a
--    hard failure, so legacy events keep working.
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
  v_role    text := public.get_my_role();
  v_profile record;
  v_event   record;
  v_att     record;
  v_now     timestamptz := now();
  v_is_new  boolean := false;
  v_result  jsonb;
begin
  if coalesce(v_role, '') not in ('admin','moderator','superadmin','adviser') then
    raise exception 'Insufficient permissions: only moderators and admins can mark attendance';
  end if;

  if p_phase is null or p_phase not in ('time_in_am','time_out_am','time_in_pm','time_out_pm') then
    raise exception 'Invalid phase. Must be: time_in_am, time_out_am, time_in_pm, time_out_pm';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if v_event is null then
    raise exception 'Event not found';
  end if;

  -- Event end cutoff: only enforced when an end time is actually set.
  if v_event.event_end is not null and v_now > v_event.event_end then
    raise exception 'Attendance closed — event has ended';
  end if;

  -- Phase window checks: only when the relevant window is configured.
  if p_phase in ('time_in_am','time_out_am') and v_event.am_end is not null
     and v_now > v_event.am_end then
    raise exception 'AM session has ended — use the PM phase instead';
  end if;
  if p_phase in ('time_in_pm','time_out_pm') and v_event.pm_end is not null
     and v_now > v_event.pm_end then
    raise exception 'PM session has ended';
  end if;

  select p.* into v_profile from public.profiles p where p.student_id = p_student_id;
  if v_profile is null then
    raise exception 'No student found with ID %', p_student_id;
  end if;
  if v_profile.course <> 'BSIT' then
    raise exception 'Attendance is reserved for BSIT students';
  end if;

  insert into public.attendance (event_id, student_id, scanned_by)
  values (p_event_id, p_student_id, auth.uid())
  on conflict (event_id, student_id) do nothing;

  select * into v_att
  from public.attendance
  where event_id = p_event_id and student_id = p_student_id;

  v_is_new := v_att.time_in_am is null and v_att.time_out_am is null
               and v_att.time_in_pm is null and v_att.time_out_pm is null;

  if v_is_new then
    update public.profiles set points = points + 10 where student_id = p_student_id;
  end if;

  case p_phase
    when 'time_in_am'  then
      update public.attendance set time_in_am  = coalesce(time_in_am,  v_now)
      where event_id = p_event_id and student_id = p_student_id;
    when 'time_out_am' then
      update public.attendance set time_out_am = coalesce(time_out_am, v_now)
      where event_id = p_event_id and student_id = p_student_id;
    when 'time_in_pm'  then
      update public.attendance set time_in_pm  = coalesce(time_in_pm,  v_now)
      where event_id = p_event_id and student_id = p_student_id;
    when 'time_out_pm' then
      update public.attendance set time_out_pm = coalesce(time_out_pm, v_now)
      where event_id = p_event_id and student_id = p_student_id;
  end case;

  select * into v_att
  from public.attendance
  where event_id = p_event_id and student_id = p_student_id;

  select jsonb_build_object(
    'status', case when v_is_new then 'present' else 'updated' end,
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

-- 3. Back-compat wrapper: cached clients that still call the 2-arg form
--    get defaulted to the AM time-in phase instead of erroring.
create or replace function public.mark_attendance(
  p_event_id   uuid,
  p_student_id text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.mark_attendance(p_event_id, p_student_id, 'time_in_am');
$$;

grant execute on function public.mark_attendance(uuid, text) to authenticated;

-- 4. Reload the PostgREST schema cache.
notify pgrst, 'reload schema';
