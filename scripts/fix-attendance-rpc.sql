-- =====================================================
-- FIX: Update event_attendance and get_attendance RPCs
-- to return AM/PM columns for proper "Still In" display
-- Run this in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. UPDATE event_attendance RPC
-- Returns AM/PM columns for EventDetail attendance table
-- =====================================================
CREATE OR REPLACE FUNCTION public.event_attendance(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public.get_my_role();
  v_rows jsonb;
BEGIN
  IF COALESCE(v_role, '') NOT IN ('admin','moderator','superadmin','adviser') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT COALESCE(JSONB_AGG(TO_JSONB(t) ORDER BY t.time_in_am), '[]'::JSONB)
  INTO v_rows
  FROM (
    SELECT 
      a.student_id,
      a.time_in_am,
      a.time_out_am,
      a.time_in_pm,
      a.time_out_pm,
      a.scanned_by,
      JSONB_BUILD_OBJECT(
        'student_id', p.student_id,
        'full_name', p.full_name,
        'year_level', p.year_level,
        'section', p.section,
        'course', p.course,
        'avatar_url', p.avatar_url
      ) AS profiles,
      JSONB_BUILD_OBJECT(
        'id', s.id,
        'full_name', s.full_name
      ) AS scanned_by_profile
    FROM public.attendance a
    JOIN public.profiles p ON p.student_id = a.student_id
    LEFT JOIN public.profiles s ON s.id = a.scanned_by
    WHERE a.event_id = p_event_id
  ) t;

  RETURN v_rows;
END;
$$;

-- =====================================================
-- 2. UPDATE get_attendance RPC (superadmin view)
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_attendance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public.get_my_role();
  v_rows jsonb;
BEGIN
  IF COALESCE(v_role, '') <> 'superadmin' THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT COALESCE(JSONB_AGG(TO_JSONB(t) ORDER BY t.time_in_am DESC), '[]'::JSONB)
  INTO v_rows
  FROM (
    SELECT 
      a.id,
      a.event_id,
      a.student_id,
      a.time_in_am,
      a.time_out_am,
      a.time_in_pm,
      a.time_out_pm,
      a.scanned_by,
      JSONB_BUILD_OBJECT(
        'id', e.id,
        'title', e.title
      ) AS events,
      JSONB_BUILD_OBJECT(
        'student_id', p.student_id,
        'full_name', p.full_name,
        'year_level', p.year_level,
        'section', p.section,
        'course', p.course,
        'avatar_url', p.avatar_url
      ) AS profiles,
      JSONB_BUILD_OBJECT(
        'id', s.id,
        'full_name', s.full_name
      ) AS scanned_by_profile
    FROM public.attendance a
    JOIN public.events e ON e.id = a.event_id
    JOIN public.profiles p ON p.student_id = a.student_id
    LEFT JOIN public.profiles s ON s.id = a.scanned_by
  ) t;

  RETURN v_rows;
END;
$$;

-- =====================================================
-- 3. GRANT EXECUTE permissions
-- =====================================================
GRANT EXECUTE ON FUNCTION public.event_attendance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_attendance() TO authenticated;

-- =====================================================
-- 4. RELOAD PostgREST schema cache
-- =====================================================
NOTIFY pgrst, 'reload schema';