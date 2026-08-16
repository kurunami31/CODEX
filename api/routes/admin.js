import { Router } from 'express';
import ExcelJS from 'exceljs';
import { supabaseFor, supabaseAdmin } from '../lib/supabase.js';

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

// GET /api/membership/report — superadmin downloads the membership fee
// report as a styled .xlsx workbook (summary sheet + one row per member).
// Student IDs and receipts come from the owner-run RPC behind the ID
// lockdown; the caller's own token is used so RLS semantics apply.
router.get('/membership/report', async (req, res) => {
  const caller = await requireSuperAdmin(req, res);
  if (!caller) return;

  const sb = supabaseFor(bearer(req));
  const { data, error } = await sb.rpc('get_membership_report');
  if (error) {
    return res.status(400).json({ error: error.message || 'Could not load the membership report.' });
  }
  const rows = Array.isArray(data) ? data : [];

  const paid = rows.filter((r) => r.membership_paid);
  const unpaid = rows.filter((r) => !r.membership_paid);
  const amounts = paid.map((r) => Number(r.membership_paid_amount || 120));
  const totalCollected = amounts.reduce((s, a) => s + a, 0);
  const fullCount = amounts.filter((a) => a >= 120).length;
  const halfCount = amounts.length - fullCount;
  const rate = rows.length ? Math.round((paid.length / rows.length) * 100) : 0;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CODEX';
  workbook.created = new Date();

  const sum = workbook.addWorksheet('Summary');
  sum.columns = [{ width: 32 }, { width: 22 }];
  sum.mergeCells('A1:B1');
  sum.getCell('A1').value = 'MEMBERSHIP FEE REPORT';
  sum.getCell('A1').font = { bold: true, size: 16 };
  sum.mergeCells('A2:B2');
  sum.getCell('A2').value = `CODEX · CODEBYTERS — generated ${new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })}`;
  sum.getCell('A2').font = { italic: true, color: { argb: 'FF6B7280' } };
  sum.mergeCells('A3:B3');
  sum.getCell('A3').value = 'Fee: ₱120.00 full or ₱60.00 half per semester';
  sum.getCell('A3').font = { italic: true, color: { argb: 'FF6B7280' } };

  const sumHeader = sum.addRow(['Metric', 'Value']);
  sumHeader.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    c.alignment = { vertical: 'middle' };
  });
  const metrics = [
    ['Total members', rows.length],
    ['Dues paid', paid.length],
    ['Unpaid', unpaid.length],
    ['Collection rate', `${rate}%`],
    ['Total collected', totalCollected],
    ['Full payments (₱120)', fullCount],
    ['Half payments (₱60)', halfCount],
  ];
  metrics.forEach(([label, value], i) => {
    const r = sum.addRow([label, value]);
    r.getCell(2).numFmt = i === 4 ? '"₱"#,##0.00' : undefined;
    if (i % 2 === 1) {
      r.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }; });
    }
  });

  const ws = workbook.addWorksheet('Membership Fees');
  ws.columns = [
    { header: '#', key: 'i', width: 5 },
    { header: 'Student ID', key: 'student_id', width: 14 },
    { header: 'Full Name', key: 'full_name', width: 26 },
    { header: 'Year Level', key: 'year_level', width: 11 },
    { header: 'Section', key: 'section', width: 10 },
    { header: 'Course', key: 'course', width: 9 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Paid At', key: 'paid_at', width: 18 },
    { header: 'Amount', key: 'amount', width: 11 },
    { header: 'Confirmed By', key: 'confirmed_by', width: 22 },
    { header: 'Receipt Link', key: 'receipt_url', width: 36 },
    { header: 'Registered At', key: 'created_at', width: 18 },
  ];
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const head = ws.addRow(ws.columns.map((c) => c.header));
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    c.alignment = { vertical: 'middle' };
  });

  rows.forEach((r, idx) => {
    const row = ws.addRow([
      idx + 1,
      r.student_id || '',
      r.full_name || '',
      r.year_level || '',
      r.section || '',
      r.course || '',
      r.membership_paid ? 'PAID' : 'UNPAID',
      r.membership_paid_at ? new Date(r.membership_paid_at) : null,
      r.membership_paid ? Number(r.membership_paid_amount || 120) : null,
      r.confirmed_by_name || '—',
      r.receipt_url || '',
      r.created_at ? new Date(r.created_at) : null,
    ]);
    const status = row.getCell(7);
    status.font = { bold: true };
    status.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: r.membership_paid ? 'FFD1FAE5' : 'FFFEE2E2' },
    };
    status.font = { bold: true, color: { argb: r.membership_paid ? 'FF065F46' : 'FF991B1B' } };
    row.getCell(9).numFmt = '"₱"#,##0.00';
    row.getCell(8).numFmt = 'yyyy-mm-dd hh:mm';
    row.getCell(12).numFmt = 'yyyy-mm-dd hh:mm';
  });

  if (rows.length) ws.autoFilter = { from: 'A1', to: `L${rows.length + 1}` };

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="membership-report-${stamp}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

export default router;
