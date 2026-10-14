-- ══════════════════════════════════════════════════════════════════════
--  002 — Separate AM/PM time-in / time-out scanning + session locks
--
--  WHY: the live mark_attendance(p_event_id, p_student_id) auto-detected the
--  session and stamped BOTH time_in and time_out on a single scan, so a
--  student could never be checked in and out as two distinct actions. This
--  migration makes the scan phase explicit (AM/PM × In/Out), fixes the window
--  math, and adds per-session scan locks.
--
--  Run in the Supabase SQL Editor, or: node scripts/db-run-migration.mjs
--  database/migrations/002_scan_lock_and_phases.sql
-- ══════════════════════════════════════════════════════════════════════

-- ── 1. Per-session scan lock ──────────────────────────────────────────
--   'auto'   → follow the event's AM/PM window (default)
--   'open'   → forced OPEN — overrides the window (staff override)
--   'locked' → forced CLOSED — blocks every scan for that session
alter table public.events
  add column if not exists scan_am text not null default 'auto',
  add column if not exists scan_pm text not null default 'auto';

alter table public.events drop constraint if exists events_scan_am_check;
alter table public.events add constraint events_scan_am_check check (scan_am in ('auto','open','locked'));
alter table public.events drop constraint if exists events_scan_pm_check;
alter table public.events add constraint events_scan_pm_check check (scan_pm in ('auto','open','locked'));

-- ── 2. mark_attendance: explicit phase + locks + correct windows ──────
--   Each phase stamps ONLY its own column, and only once (first scan wins),
--   so "Time In" and "Time Out" are genuinely separate actions.
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
  v_is_am   boolean;
  v_session text;
  v_lock    text;
  v_start   timestamptz;
  v_end     timestamptz;
begin
  if coalesce(v_role, '') not in ('admin','moderator','superadmin','adviser') then
    raise exception 'Insufficient permissions: only moderators and admins can mark attendance';
  end if;

  if p_phase is null or p_phase not in ('time_in_am','time_out_am','time_in_pm','time_out_pm') then
    raise exception 'Invalid phase. Must be one of: time_in_am, time_out_am, time_in_pm, time_out_pm';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if v_event is null then
    raise exception 'Event not found';
  end if;

  v_is_am   := right(p_phase, 3) = '_am';
  v_session := case when v_is_am then 'AM' else 'PM' end;
  v_lock    := case when v_is_am then coalesce(v_event.scan_am, 'auto') else coalesce(v_event.scan_pm, 'auto') end;
  v_start   := case when v_is_am then v_event.am_start else v_event.pm_start end;
  v_end     := case when v_is_am then v_event.am_end   else v_event.pm_end   end;

  -- Session lock / window enforcement
  if v_lock = 'locked' then
    raise exception '% session is locked — scanning is closed.', v_session;
  elsif v_lock <> 'open' then           -- 'auto': follow the window
    if v_start is null or v_end is null then
      raise exception 'No % attendance window is set for this event.', v_session;
    end if;
    if v_now < v_start then
      raise exception '% session has not started yet.', v_session;
    end if;
    if v_now > v_end then
      raise exception '% session has ended.', v_session;
    end if;
    if v_event.event_end is not null and v_now > v_event.event_end then
      raise exception 'Attendance is closed — the event has ended.';
    end if;
  end if;
  -- 'open' skips every automatic time check (staff override).

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

  case p_phase
    when 'time_in_am' then
      update public.attendance set time_in_am = coalesce(time_in_am, v_now), scanned_by = auth.uid(), scanned_at = v_now
      where event_id = p_event_id and student_id = p_student_id;
    when 'time_out_am' then
      update public.attendance set time_out_am = coalesce(time_out_am, v_now), scanned_by = auth.uid(), scanned_at = v_now
      where event_id = p_event_id and student_id = p_student_id;
    when 'time_in_pm' then
      update public.attendance set time_in_pm = coalesce(time_in_pm, v_now), scanned_by = auth.uid(), scanned_at = v_now
      where event_id = p_event_id and student_id = p_student_id;
    when 'time_out_pm' then
      update public.attendance set time_out_pm = coalesce(time_out_pm, v_now), scanned_by = auth.uid(), scanned_at = v_now
      where event_id = p_event_id and student_id = p_student_id;
  end case;

  if v_is_new then
    update public.profiles set points = points + 10 where student_id = p_student_id;
  end if;

  select * into v_att
  from public.attendance
  where event_id = p_event_id and student_id = p_student_id;

  return jsonb_build_object(
    'status', 'recorded',
    'phase', p_phase,
    'session', v_session,
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
  );
end;
$$;

grant execute on function public.mark_attendance(uuid, text, text) to authenticated;

-- ── 3. Staff-only scan lock control ───────────────────────────────────
--   Moderators cannot UPDATE events (events are admin-write), so locking
--   goes through this security-definer RPC that checks the caller's role.
create or replace function public.set_event_scan_lock(
  p_event_id uuid,
  p_session  text,   -- 'am' | 'pm'
  p_state    text    -- 'auto' | 'open' | 'locked'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.get_my_role();
begin
  if coalesce(v_role, '') not in ('admin','moderator','superadmin','adviser') then
    raise exception 'Insufficient permissions: only staff can lock scanning';
  end if;
  if p_session not in ('am','pm') then
    raise exception 'Invalid session (expected am or pm)';
  end if;
  if p_state not in ('auto','open','locked') then
    raise exception 'Invalid state (expected auto, open, or locked)';
  end if;
  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'Event not found';
  end if;

  if p_session = 'am' then
    update public.events set scan_am = p_state where id = p_event_id;
  else
    update public.events set scan_pm = p_state where id = p_event_id;
  end if;

  return jsonb_build_object('event_id', p_event_id, 'session', p_session, 'state', p_state);
end;
$$;

grant execute on function public.set_event_scan_lock(uuid, text, text) to authenticated;

-- ── 4. Refresh PostgREST's schema cache ───────────────────────────────
notify pgrst, 'reload schema';
