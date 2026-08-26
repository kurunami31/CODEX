import 'dotenv/config';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  // 1. Add time_in and time_out columns to attendance table
  await client.query(`
    alter table public.attendance
      add column if not exists time_in timestamptz,
      add column if not exists time_out timestamptz;
  `);
  console.log('Columns added');

  // 2. Backfill: set time_in = scanned_at for existing rows
  await client.query(`
    update public.attendance
    set time_in = scanned_at
    where time_in is null;
  `);
  console.log('Backfilled time_in from scanned_at');

  // 3. Update mark_attendance RPC to handle check-in/check-out
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

      -- Check for existing attendance record
      select * into v_existing
      from public.attendance
      where event_id = p_event_id and student_id = p_student_id;

      if v_existing is null then
        -- No record: CHECK-IN (time_in)
        insert into public.attendance (event_id, student_id, scanned_by, time_in)
        values (p_event_id, p_student_id, auth.uid(), now())
        on conflict (event_id, student_id) do nothing;
      elsif v_existing.time_out is null then
        -- Has time_in but no time_out: CHECK-OUT (time_out)
        update public.attendance
        set time_out = now()
        where event_id = p_event_id and student_id = p_student_id;
      else
        -- Already checked out: allow re-entry (new check-in cycle)
        update public.attendance
        set time_in = now(), time_out = null, scanned_by = auth.uid()
        where event_id = p_event_id and student_id = p_student_id;
      end if;

      select jsonb_build_object(
        'status', case
          when (select time_out from public.attendance where event_id = p_event_id and student_id = p_student_id) is not null then 'checked_out'
          else 'checked_in'
        end,
        'time_in', (select time_in from public.attendance where event_id = p_event_id and student_id = p_student_id),
        'time_out', (select time_out from public.attendance where event_id = p_event_id and student_id = p_student_id),
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
  console.log('mark_attendance RPC updated');

  // 4. Update event_attendance RPC to return time_in and time_out
  await client.query(`
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

      select coalesce(jsonb_agg(to_jsonb(t) order by t.time_in), '[]'::jsonb)
      into v_rows
      from (
        select a.student_id, a.time_in, a.time_out, a.scanned_by,
               p.full_name, p.year_level, p.section, p.course, p.avatar_url,
               s.full_name as scanned_by_name
        from public.attendance a
        join public.profiles p on p.student_id = a.student_id
        left join public.profiles s on s.id = a.scanned_by
        where a.event_id = p_event_id
      ) t;

      return v_rows;
    end;
    $$;
  `);
  console.log('event_attendance RPC updated');

  // 5. Update get_attendance RPC (superadmin) to return time_in and time_out
  await client.query(`
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

      select coalesce(jsonb_agg(to_jsonb(t) order by t.time_in desc), '[]'::jsonb)
      into v_rows
      from (
        select a.id, a.event_id, a.student_id, a.time_in, a.time_out,
               a.scanned_by, e.title as event_title,
               p.full_name as student_name, p.year_level, p.section,
               s.full_name as scanned_by_name
        from public.attendance a
        join public.events e on e.id = a.event_id
        join public.profiles p on p.student_id = a.student_id
        left join public.profiles s on s.id = a.scanned_by
      ) t;

      return v_rows;
    end;
    $$;
  `);
  console.log('get_attendance RPC updated');

  // 6. Update attendance_counts RPC if needed (optional)
  await client.query(`
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
      if coalesce(v_role, '') not in ('admin','moderator','superadmin','adviser') then
        raise exception 'Insufficient permissions';
      end if;

      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
      into v_rows
      from (
        select e.id, e.title, e.event_date,
               count(a.id) as total_scans,
               count(case when a.time_in is not null then 1 end) as checked_in,
               count(case when a.time_out is not null then 1 end) as checked_out
        from public.events e
        left join public.attendance a on a.event_id = e.id
        group by e.id, e.title, e.event_date
        order by e.event_date desc
      ) t;

      return v_rows;
    end;
    $$;
  `);
  console.log('attendance_counts RPC updated');

  console.log('All database updates completed successfully');
} catch (err) {
  console.error('Error:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}