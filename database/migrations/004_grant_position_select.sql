-- ══════════════════════════════════════════════════════════════════════
--  004 — let members read their own office label (profiles.position)
--
--  WHY: `position` (e.g. "President", "Developer") is what the UI shows in
--  place of the raw role — roleLabel(role, position) = position || role label.
--  The column was added to the table (see schema.sql) but never added to the
--  column-level SELECT grant, so every direct read of profiles.position was
--  denied and the UI silently fell back to the generic role name. The bug was
--  invisible because ROLE_LABELS.superadmin happens to be "Developer".
--
--  The ID-privacy lockdown only needs to hide `student_id`; `position` is a
--  harmless display label, so exposing it is safe.
--
--  Run in the Supabase SQL Editor, or:
--    node scripts/db-run-migration.mjs database/migrations/004_grant_position_select.sql
-- ══════════════════════════════════════════════════════════════════════

grant select (position) on public.profiles to authenticated;

notify pgrst, 'reload schema';
