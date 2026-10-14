-- ══════════════════════════════════════════════════════════════════════
--  003 — remove the legacy 2-arg mark_attendance + the stray v_rows table
--
--  WHY:
--   • mark_attendance(p_event_id, p_student_id) was the old single-action
--     scan. It stamped time_in AND time_out on the SAME scan, so a student
--     could never be checked in and out as two distinct actions, and it must
--     not be reachable now that scanning is phase-based. The phase-aware
--     mark_attendance(p_event_id, p_student_id, p_phase) is the only
--     implementation (see migration 002).
--   • public.v_rows was created by accident — a botched migration ran a
--     `select ... into v_rows` without a DECLARE, so Postgres materialised a
--     one-column table (coalesce jsonb) that nothing reads or writes.
--
--  Run in the Supabase SQL Editor, or:
--    node scripts/db-run-migration.mjs database/migrations/003_drop_legacy_mark_attendance.sql
-- ══════════════════════════════════════════════════════════════════════

drop function if exists public.mark_attendance(uuid, text);

drop table if exists public.v_rows;

-- Refresh PostgREST's schema cache so the removed function disappears.
notify pgrst, 'reload schema';
