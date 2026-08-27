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
  // Fix event_attendance RPC to return AM/PM columns
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

      select coalesce(jsonb_agg(to_jsonb(t) order by t.time_in_am), '[]'::jsonb)
      into v_rows
      from (
        select 
          a.student_id,
          a.time_in_am,
          a.time_out_am,
          a.time_in_pm,
          a.time_out_pm,
          a.scanned_by,
          jsonb_build_object(
            'student_id', p.student_id,
            'full_name', p.full_name,
            'year_level', p.year_level,
            'section', p.section,
            'course', p.course,
            'avatar_url', p.avatar_url
          ) as profiles,
          jsonb_build_object(
            'id', s.id,
            'full_name', s.full_name
          ) as scanned_by_profile
        from public.attendance a
        join public.profiles p on p.student_id = a.student_id
        left join public.profiles s on s.id = a.scanned_by
        where a.event_id = p_event_id
      ) t;

      return v_rows;
    end;
    $$;
  `);
  console.log('event_attendance RPC updated with AM/PM columns');

  // Also fix get_attendance (superadmin) RPC
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

      select coalesce(jsonb_agg(to_jsonb(t) order by t.time_in_am desc), '[]'::jsonb)
      into v_rows
      from (
        select 
          a.id,
          a.event_id,
          a.student_id,
          a.time_in_am,
          a.time_out_am,
          a.time_in_pm,
          a.time_out_pm,
          a.scanned_by,
          jsonb_build_object(
            'id', e.id,
            'title', e.title
          ) as events,
          jsonb_build_object(
            'student_id', p.student_id,
            'full_name', p.full_name,
            'year_level', p.year_level,
            'section', p.section,
            'course', p.course,
            'avatar_url', p.avatar_url
          ) as profiles,
          jsonb_build_object(
            'id', s.id,
            'full_name', s.full_name
          ) as scanned_by_profile
        from public.attendance a
        join public.events e on e.id = a.event_id
        join public.profiles p on p.student_id = a.student_id
        left join public.profiles s on s.id = a.scanned_by
      ) t;

      return v_rows;
    end;
    $$;
  `);
  console.log('get_attendance RPC updated with AM/PM columns');

  console.log('All RPCs updated successfully');
} catch (err) {
  console.error('Error:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}