import { Router } from 'express';
import { supabase, supabaseFor, supabaseAdmin } from '../lib/supabase.js';

const router = Router();

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

// Verify the caller's session and that their profile role is superadmin.
// Returns the user object or null (with a response already sent on failure).
async function requireSuperAdmin(req, res) {
  const token = bearer(req);
  if (!token) {
    res.status(401).json({ error: 'Missing session token.' });
    return null;
  }
  const sb = supabaseFor(token);
  const { data: { user }, error: authError } = await sb.auth.getUser();
  if (authError || !user) {
    res.status(401).json({ error: 'Invalid session.' });
    return null;
  }
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!profile || profile.role !== 'superadmin') {
    res.status(403).json({ error: 'Only a super admin can use this endpoint.' });
    return null;
  }
  return user;
}

function adminClientOr500(res) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({
      error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server.',
      hint: 'Add it in the Vercel dashboard → Project → Settings → Environment Variables.',
    });
    return null;
  }
  return supabaseAdmin();
}

const VALID_YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const VALID_COURSES = ['BSIT', 'BSEM', 'BSAB', 'other'];
const VALID_ROLES = ['student', 'moderator', 'admin', 'superadmin'];

// GET /api/admin/users — list every member (email from auth.users + profile)
router.get('/users', async (req, res) => {
  const caller = await requireSuperAdmin(req, res);
  if (!caller) return;
  const admin = adminClientOr500(res);
  if (!admin) return;

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const perPage = Math.min(500, Math.max(1, parseInt(req.query.perPage, 10) || 200));

  const [{ data: list, error: usersError }, { data: profiles, error: profilesError }] = await Promise.all([
    admin.auth.admin.listUsers({ page, perPage }),
    admin.from('profiles').select('*').order('created_at', { ascending: false }),
  ]);

  if (usersError || profilesError) {
    return res.status(500).json({ error: usersError?.message || profilesError?.message || 'Could not list users.' });
  }

  const byId = new Map((profiles || []).map((p) => [p.id, p]));
  const users = (list.users || []).map((u) => ({
    id: u.id,
    email: u.email,
    email_confirmed: Boolean(u.email_confirmed_at),
    created_at: u.created_at,
    ...(byId.get(u.id) || null),
  }));

  res.set('Cache-Control', 'no-store');
  res.json({ users, count: list.total ?? users.length });
});

// POST /api/admin/users — enroll a new member (auth user + profile)
router.post('/users', async (req, res) => {
  const caller = await requireSuperAdmin(req, res);
  if (!caller) return;
  const admin = adminClientOr500(res);
  if (!admin) return;

  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const fullName = String(b.full_name || '').trim();
  const studentId = String(b.student_id || '').trim().toUpperCase();
  const yearLevel = String(b.year_level || '');
  const section = String(b.section || '').trim();
  const course = String(b.course || 'BSIT');
  const role = String(b.role || 'student');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (!fullName) return res.status(400).json({ error: 'Full name is required.' });
  if (!studentId) return res.status(400).json({ error: 'Student ID is required.' });
  if (!VALID_YEARS.includes(yearLevel)) {
    return res.status(400).json({ error: 'Year level must be one of: ' + VALID_YEARS.join(', ') });
  }
  if (!section) return res.status(400).json({ error: 'Section is required.' });
  if (!VALID_COURSES.includes(course)) {
    return res.status(400).json({ error: 'Course must be one of: ' + VALID_COURSES.join(', ') });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Role must be one of: ' + VALID_ROLES.join(', ') });
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // enrolled members log in immediately — no inbox step
  });
  if (createError) {
    const msg = createError.message || '';
    if (/already registered|already been registered|already exists/i.test(msg)) {
      return res.status(409).json({ error: 'That email already has an account.' });
    }
    return res.status(400).json({ error: msg });
  }

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    student_id: studentId,
    full_name: fullName,
    year_level: yearLevel,
    section,
    course,
    role,
  });

  if (profileError) {
    // Roll the auth user back so a half-created account never lingers.
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    const msg = profileError.message || '';
    if (/duplicate key|already exists|unique constraint/i.test(msg)) {
      return res.status(409).json({ error: 'That student ID is already registered to another account.' });
    }
    return res.status(400).json({ error: msg });
  }

  res.status(201).json({ ok: true, id: created.user.id, email });
});

// POST /api/admin/maintenance — superadmin toggles maintenance mode.
// The flag is stored in app_settings; /api/status broadcasts it to every
// visitor so the frontend can show a maintenance page instantly.
router.post('/maintenance', async (req, res) => {
  const caller = await requireSuperAdmin(req, res);
  if (!caller) return;
  const admin = adminClientOr500(res);
  if (!admin) return;

  const enabled = req.body?.enabled === true;
  const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 200) : '';
  const value = { enabled, message: message || null };
  const now = new Date().toISOString();

  const { error } = await admin.from('app_settings').upsert(
    { key: 'maintenance', value, updated_at: now },
    { onConflict: 'key' }
  );

  if (error) return res.status(500).json({ error: error.message || 'Could not save maintenance mode.' });
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, enabled, message: message || null, updatedAt: now });
});

export default router;
