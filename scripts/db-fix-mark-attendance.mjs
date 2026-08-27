import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '..', '.env') });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  // Fix mark_attendance RPC - missing FROM clause for 'e' alias
  await client.query(`
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
      v_existing record;
      v_event_end timestamptz;
      v_action text;
    begin
      if coalesce(v_role, '') not in ('admin','moderator','superadmin','adviser') then
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

      -- Get event end time
      select e.event_end into v_event_end
      from public.events e
      where e.id = p_event_id;

      if v_event_end is null then
        raise exception 'Event has no end time set';
      end if;

      -- Check for existing attendance record
      select * into v_existing
      from public.attendance
      where event_id = p_event_id and student_id = p_student_id;

      if v_existing is null then
        -- No record: MORNING TIME IN
        insert into public.attendance (event_id, student_id, scanned_by, time_in_am)
        values (p_event_id, p_student_id, auth.uid(), now())
        on conflict (event_id, student_id) do nothing;
        v_action := 'time_in_am';
      elsif v_existing.time_in_am is not null and v_existing.time_out_am is null then
        -- Has morning time in, no morning time out: MORNING TIME OUT
        update public.attendance
        set time_out_am = now()
        where event_id = p_event_id and student_id = p_student_id;
        v_action := 'time_out_am';
      elsif v_existing.time_out_am is not null and v_existing.time_in_pm is null then
        -- Morning done, no afternoon time in yet: AFTERNOON TIME IN
        update public.attendance
        set time_in_pm = now()
        where event_id = p_event_id and student_id = p_student_id;
        v_action := 'time_in_pm';
      elsif v_existing.time_in_pm is not null and v_existing.time_out_pm is null then
        -- Has afternoon time in, no afternoon time out: AFTERNOON TIME OUT
        update public.attendance
        set time_out_pm = now()
        where event_id = p_event_id and student_id = p_student_id;
        v_action := 'time_out_pm';
      else
        -- All 4 slots filled: RE-ENTRY (reset for next day)
        update public.attendance
        set time_in_am = now(), time_out_am = null, time_in_pm = null, time_out_pm = null, scanned_by = auth.uid()
        where event_id = p_event_id and student_id = p_student_id;
        v_action := 're_entry';
      end if;

      select jsonb_build_object(
        'status', v_action,
        'time_in_am', (select time_in_am from public.attendance where event_id = p_event_id and student_id = p_student_id),
        'time_out_am', (select time_out_am from public.attendance where event_id = p_event_id and student_id = p_student_id),
        'time_in_pm', (select time_in_pm from public.attendance where event_id = p_event_id and student_id = p_student_id),
        'time_out_pm', (select time_out_pm from public.attendance where event_id = p_event_id and student_id = p_student_id),
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
  `);
  console.log('mark_attendance RPC fixed');
} catch (err) {
  console.error('Error:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}