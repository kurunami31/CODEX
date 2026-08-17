import { Router } from 'express';
import ExcelJS from 'exceljs';
import pg from 'pg';
import { supabaseFor, supabaseAdmin } from '../lib/supabase.js';

const { Client } = pg;

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
  const confirmed = rows.filter((r) => r.email_confirmed);
  const unconfirmed = rows.filter((r) => !r.email_confirmed);
  const amounts = paid.map((r) => Number(r.membership_paid_amount || 120));
  const totalCollected = amounts.reduce((s, a) => s + a, 0);
  const fullCount = amounts.filter((a) => a >= 120).length;
  const halfCount = amounts.length - fullCount;
  const rate = rows.length ? Math.round((paid.length / rows.length) * 100) : 0;
  const exportedAt = new Date();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CODEX';
  workbook.created = exportedAt;

  const thin = { style: 'thin', color: { argb: 'FFE5E7EB' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };

  const sum = workbook.addWorksheet('Summary');
  sum.columns = [{ width: 34 }, { width: 44 }];
  sum.mergeCells('A1:B1');
  sum.getCell('A1').value = 'MEMBERSHIP FEE REPORT';
  sum.getCell('A1').font = { bold: true, size: 16 };
  sum.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  sum.getRow(1).height = 28;
  sum.mergeCells('A2:B2');
  sum.getCell('A2').value = 'CODEX · CODEBYTERS';
  sum.getCell('A2').font = { italic: true, color: { argb: 'FF6B7280' } };
  sum.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
  sum.mergeCells('A3:B3');
  sum.getCell('A3').value = 'Fee: ₱120.00 full or ₱60.00 half per semester';
  sum.getCell('A3').font = { italic: true, color: { argb: 'FF6B7280' } };
  sum.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };

  const sumHeader = sum.addRow(['Metric', 'Value']);
  sumHeader.height = 24;
  sumHeader.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    c.alignment = { vertical: 'middle', horizontal: 'center' };
    c.border = border;
  });
  const metrics = [
    ['Report generated', `${exportedAt.toLocaleString('en-PH', { dateStyle: 'full', timeStyle: 'long', timeZone: 'Asia/Manila' })} (PHT)`],
    ['Total members', rows.length],
    ['Email confirmed', confirmed.length],
    ['Email NOT confirmed', unconfirmed.length],
    ['Dues paid', paid.length],
    ['Unpaid', unpaid.length],
    ['Collection rate', `${rate}%`],
    ['Total collected', totalCollected],
    ['Full payments (₱120)', fullCount],
    ['Half payments (₱60)', halfCount],
  ];
  metrics.forEach(([label, value], i) => {
    const r = sum.addRow([label, value]);
    r.getCell(2).numFmt = i === 7 ? '"₱"#,##0.00' : undefined;
    r.eachCell((c) => {
      c.alignment = { vertical: 'middle', horizontal: c.col === 2 ? 'right' : 'left' };
      c.border = border;
      if (i % 2 === 1) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
      }
    });
  });

  const ws = workbook.addWorksheet('Membership Fees');
  ws.columns = [
    { key: 'i', width: 5 },
    { key: 'student_id', width: 14 },
    { key: 'full_name', width: 26 },
    { key: 'year_level', width: 11 },
    { key: 'section', width: 10 },
    { key: 'course', width: 9 },
    { key: 'status', width: 10 },
    { key: 'paid_at', width: 18 },
    { key: 'amount', width: 11 },
    { key: 'confirmed_by', width: 22 },
    { key: 'email_confirmed', width: 12 },
    { key: 'email_confirmed_at', width: 18 },
    { key: 'last_sign_in', width: 18 },
    { key: 'receipt_url', width: 36 },
    { key: 'created_at', width: 18 },
  ];
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const head = ws.addRow(ws.columns.map((c) => c.header));
  head.height = 24;
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    c.alignment = { vertical: 'middle', horizontal: 'center' };
    c.border = border;
  });

  // Per-column horizontal alignment so every cell lines up cleanly:
  // centered for short/coded values, right for amounts, left for text.
  const ALIGN = [
    'center', // i (#)
    'center', // student_id
    'left',   // full_name
    'center', // year_level
    'center', // section
    'center', // course
    'center', // status (PAID/UNPAID)
    'center', // paid_at
    'right',  // amount (₱)
    'left',   // confirmed_by
    'center', // email_confirmed
    'center', // email_confirmed_at
    'center', // last_sign_in
    'left',   // receipt_url
    'center', // created_at
  ];

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
      r.email_confirmed ? 'CONFIRMED' : 'UNCONFIRMED',
      r.email_confirmed_at ? new Date(r.email_confirmed_at) : null,
      r.last_sign_in_at ? new Date(r.last_sign_in_at) : null,
      r.receipt_url || '',
      r.created_at ? new Date(r.created_at) : null,
    ]);
    row.eachCell((c) => {
      c.alignment = { vertical: 'middle', horizontal: ALIGN[c.col - 1] };
      c.border = border;
    });
    const status = row.getCell(7);
    status.font = { bold: true };
    status.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: r.membership_paid ? 'FFD1FAE5' : 'FFFEE2E2' },
    };
    status.font = { bold: true, color: { argb: r.membership_paid ? 'FF065F46' : 'FF991B1B' } };
    const emailStatus = row.getCell(11);
    emailStatus.font = { bold: true };
    emailStatus.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: r.email_confirmed ? 'FFD1FAE5' : 'FFFEE2E2' },
    };
    emailStatus.font = { bold: true, color: { argb: r.email_confirmed ? 'FF065F46' : 'FF991B1B' } };
    row.getCell(9).numFmt = '"₱"#,##0.00';
    row.getCell(8).numFmt = 'yyyy-mm-dd hh:mm';
    row.getCell(12).numFmt = 'yyyy-mm-dd hh:mm';
    row.getCell(13).numFmt = 'yyyy-mm-dd hh:mm';
    row.getCell(15).numFmt = 'yyyy-mm-dd hh:mm';
  });

  if (rows.length) ws.autoFilter = { from: 'A1', to: `O${rows.length + 1}` };

  const stamp = exportedAt.toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="membership-report-${stamp}.xlsx"`);
  res.setHeader('Cache-Control', 'no-store');
  await workbook.xlsx.write(res);
  res.end();
});

// GET /api/admin/membership-feed?key=… — LIVE CSV feed of the same report.
// Point Excel (Data → From Web) or Google Sheets (=IMPORTDATA) at this URL
// and set a refresh interval: every refresh pulls the latest rows from the
// database, so the sheet auto-updates as members are added and payments are
// confirmed — no re-downloading the file ever again. Protected by the
// static REPORT_FEED_KEY (never shipped to the client).
// GET /api/admin/membership-feed/view?key=… — the same data as a mobile-first
// HTML page (bookmark / Add to Home Screen) for checking fees on a phone.

function requireFeedKey(req, res) {
  const expected = process.env.REPORT_FEED_KEY;
  if (!expected) {
    res.status(503).json({ error: 'Report feed is not configured (REPORT_FEED_KEY missing).' });
    return false;
  }
  if (req.query.key !== expected) {
    res.status(401).json({ error: 'Invalid feed key.' });
    return false;
  }
  if (!process.env.DATABASE_URL) {
    res.status(503).json({ error: 'DATABASE_URL is not configured on the server.' });
    return false;
  }
  return true;
}

async function fetchReportRows() {
  const sql = `select p.student_id, p.full_name, p.year_level, p.section, p.course, p.role,
         p.membership_paid,
         to_char(p.membership_paid_at at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI') as paid_at,
         p.membership_paid_amount,
         c.full_name as confirmed_by_name,
         (u.email_confirmed_at is not null) as email_confirmed,
         to_char(u.email_confirmed_at at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI') as email_confirmed_at,
         to_char(u.last_sign_in_at at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI') as last_sign_in,
         p.receipt_url,
         to_char(p.created_at at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI') as created_at
  from public.profiles p
  left join public.profiles c on c.id = p.membership_confirmed_by
  left join auth.users u on u.id = p.id
  order by p.full_name`;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(sql);
    return rows;
  } finally {
    await client.end();
  }
}

router.get('/membership-feed', async (req, res) => {
  if (!requireFeedKey(req, res)) return;

  let rows;
  try {
    rows = await fetchReportRows();
  } catch {
    return res.status(500).json({ error: 'Could not read the report feed.' });
  }

  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = [
    '#', 'Student ID', 'Full Name', 'Year Level', 'Section', 'Course', 'Status',
    'Paid At', 'Amount', 'Confirmed By', 'Email Confirmed',
    'Email Confirmed At', 'Last Sign In', 'Receipt URL', 'Created At',
  ];
  const lines = [head.join(',')];
  rows.forEach((r, i) => {
    lines.push([
      i + 1,
      r.student_id,
      r.full_name,
      r.year_level,
      r.section,
      r.course,
      r.membership_paid ? 'PAID' : 'UNPAID',
      r.paid_at,
      r.membership_paid ? (r.membership_paid_amount ?? 120) : '',
      r.confirmed_by_name,
      r.email_confirmed ? 'CONFIRMED' : 'UNCONFIRMED',
      r.email_confirmed_at,
      r.last_sign_in,
      r.receipt_url,
      r.created_at,
    ].map(esc).join(','));
  });

  res.set('Cache-Control', 'no-store');
  res.type('text/csv; charset=utf-8');
  res.send(`\uFEFF${lines.join('\r\n')}\r\n`);
});

// Mobile-first HTML view of the same report — open it on the phone (bookmark
// or Add to Home Screen) to check fees anywhere; every open and the 60s
// auto-refresh pulls fresh rows straight from the database. Key-protected
// like the CSV feed, and never cached so the phone can't show stale data.
router.get('/membership-feed/view', async (req, res) => {
  if (!requireFeedKey(req, res)) return;

  let rows;
  try {
    rows = await fetchReportRows();
  } catch {
    return res.status(500).send('<h1>Could not read the report feed.</h1>');
  }

  const paid = rows.filter((r) => r.membership_paid);
  const collected = paid.reduce((s, r) => s + Number(r.membership_paid_amount || 120), 0);
  const rate = rows.length ? Math.round((paid.length / rows.length) * 100) : 0;
  const updatedAt = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: false,
  }).format(new Date());

  const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const cards = rows
    .map((r) => {
      const isPaid = !!r.membership_paid;
      const amount = isPaid ? `\u20B1${Number(r.membership_paid_amount || 120)}` : '';
      const receipt = r.receipt_url ? `<a href="${esc(r.receipt_url)}" target="_blank" rel="noopener">Open receipt</a>` : '';
      return `
      <article class="card ${isPaid ? 'paid' : 'unpaid'}">
        <div class="top">
          <div class="who">
            <div class="name">${esc(r.full_name)}</div>
            <div class="sid">${esc(r.student_id)}</div>
          </div>
          <span class="badge">${isPaid ? 'PAID' : 'UNPAID'}</span>
        </div>
        <div class="meta">
          <div>${esc(r.year_level)} &middot; ${esc(r.section)} &middot; ${esc(r.course)}</div>
          ${isPaid ? `<div>Paid ${esc(r.paid_at)} &middot; ${amount}</div>` : ''}
          ${r.confirmed_by_name ? `<div>Confirmed by ${esc(r.confirmed_by_name)}</div>` : ''}
          <div>Email ${r.email_confirmed ? 'confirmed' : 'not confirmed'}${r.email_confirmed_at ? ` &middot; ${esc(r.email_confirmed_at)}` : ''}</div>
          <div>Last sign in ${esc(r.last_sign_in || 'never')}</div>
          <div>Member since ${esc(r.created_at)}</div>
          ${receipt ? `<div>${receipt}</div>` : ''}
        </div>
      </article>`;
    })
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0b1c3f">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="CODEX Fees">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="/pwa-192x192.png">
<title>CODEX &middot; Membership Fees</title>
<style>
  :root { --ink:#1a2233; --muted:#5b6478; --line:#e3e7ef; --paid:#1a7f37; --paidbg:#e6f6ea; --unpaid:#c92a2a; --unpaidbg:#fdecec; --navy:#0b1c3f; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; background:#f4f6fa; color:var(--ink); padding-left:env(safe-area-inset-left, 0px); padding-right:env(safe-area-inset-right, 0px); }
  header { background:var(--navy); color:#fff; padding:calc(16px + env(safe-area-inset-top, 0px)) calc(16px + env(safe-area-inset-right, 0px)) 12px calc(16px + env(safe-area-inset-left, 0px)); position:sticky; top:0; z-index:5; }
  h1 { margin:0; font-size:17px; letter-spacing:.2px; }
  .sub { margin-top:4px; font-size:12px; color:#b9c4dd; display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; }
  .refresh { background:#2b4a8f; color:#fff; border:0; border-radius:8px; padding:6px 12px; font-size:12px; font-weight:600; cursor:pointer; }
  .search { width:100%; margin-top:10px; padding:10px 14px; border:0; border-radius:10px; background:#132a5c; color:#fff; font-size:15px; outline:none; -webkit-appearance:none; }
  .search::placeholder { color:#8fa3cc; }
  .search:focus { box-shadow:inset 0 0 0 2px #3b5fae; }
  main { max-width:640px; margin:0 auto; padding:12px 12px calc(48px + env(safe-area-inset-bottom, 0px)); }
  .chips { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin:12px 0; }
  .chip { background:#fff; border:1px solid var(--line); border-radius:12px; padding:10px 12px; text-align:center; }
  .chip b { display:block; font-size:18px; font-variant-numeric:tabular-nums; }
  .chip span { font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.4px; }
  .chip.ok b { color:var(--paid); }
  .card { background:#fff; border:1px solid var(--line); border-left:4px solid var(--line); border-radius:12px; padding:12px 14px; margin-bottom:10px; }
  .card.paid { border-left-color:var(--paid); }
  .card.unpaid { border-left-color:var(--unpaid); }
  .top { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
  .name { font-weight:700; font-size:15px; }
  .sid { color:var(--muted); font-size:12px; margin-top:1px; font-variant-numeric:tabular-nums; }
  .badge { font-size:11px; font-weight:800; letter-spacing:.5px; padding:4px 10px; border-radius:999px; white-space:nowrap; }
  .paid .badge { color:var(--paid); background:var(--paidbg); }
  .unpaid .badge { color:var(--unpaid); background:var(--unpaidbg); }
  .meta { margin-top:8px; font-size:12.5px; color:var(--muted); line-height:1.55; }
  .meta a { color:#1d4ed8; text-decoration:none; font-weight:600; }
  .empty { text-align:center; color:var(--muted); padding:40px 0; }
</style>
</head>
<body>
<header>
  <h1>CODEX &middot; Membership Fees</h1>
  <div class="sub"><span>Updated ${esc(updatedAt)} &middot; refreshes every 60s</span><button class="refresh" onclick="location.reload()">Refresh</button></div>
  <input id="q" class="search" type="search" placeholder="Search name or student ID…" autocomplete="off" enterkeyhint="search">
</header>
<main>
  <div class="chips">
    <div class="chip"><b>${rows.length}</b><span>Members</span></div>
    <div class="chip ok"><b>${paid.length}</b><span>Paid</span></div>
    <div class="chip"><b>${rows.length - paid.length}</b><span>Unpaid</span></div>
    <div class="chip ok"><b>\u20B1${collected}</b><span>Collected</span></div>
    <div class="chip"><b>${rate}%</b><span>Rate</span></div>
  </div>
  ${cards || '<div class="empty">No members yet.</div>'}
  <div id="empty" class="empty" style="display:none">No matches found.</div>
</main>
<script>
var q = document.getElementById('q');
var cards = Array.prototype.slice.call(document.querySelectorAll('.card'));
var none = document.getElementById('empty');
if (q) {
  q.addEventListener('input', function () {
    var term = q.value.trim().toLowerCase();
    var shown = 0;
    cards.forEach(function (c) {
      var hit = !term || c.textContent.toLowerCase().indexOf(term) !== -1;
      c.style.display = hit ? '' : 'none';
      if (hit) shown++;
    });
    if (none) none.style.display = shown ? 'none' : 'block';
  });
}
setInterval(function(){ location.reload(); }, 60000);
</script>
</body>
</html>`;

  res.set('Cache-Control', 'no-store');
  res.type('text/html; charset=utf-8');
  res.send(html);
});

export default router;
