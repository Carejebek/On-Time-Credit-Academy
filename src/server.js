const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const PORT = parseInt(process.env.PORT || '3070', 10);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
const SEAT_CAP = parseInt(process.env.SEAT_CAP || '15', 10);
const COOKIE = 'otca_session';
const SESSION_DAYS = 14;
const LINK_DAYS = 7;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = (text, params) => pool.query(text, params);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('hex');
const addDays = (d) => new Date(Date.now() + d * 86400000);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'same-origin');
  next();
});

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function setSession(res, token) {
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${SESSION_DAYS * 86400}`];
  if (COOKIE_SECURE) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}
function clearSession(res) {
  res.append('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${COOKIE_SECURE ? '; Secure' : ''}`);
}

async function startSession(res, userId) {
  const token = newToken();
  await q('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2,$3)', [sha(token), userId, addDays(SESSION_DAYS)]);
  setSession(res, token);
}

async function loadUser(req, res, next) {
  try {
    const token = parseCookies(req)[COOKIE];
    req.user = null;
    if (token) {
      const r = await q(
        `SELECT u.id, u.email, u.first_name, u.last_name, u.role FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active`,
        [sha(token)]
      );
      req.user = r.rows[0] || null;
    }
    next();
  } catch (e) { next(e); }
}
app.use(loadUser);

const requireAuth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Please sign in.' }));
const requireRole = (...roles) => (req, res, next) =>
  req.user && roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Not allowed.' });

// Simple in-memory login throttle: 8 failures per 15 minutes per email+ip.
const fails = new Map();
function throttled(key) {
  const now = Date.now();
  const list = (fails.get(key) || []).filter((t) => now - t < 15 * 60000);
  fails.set(key, list);
  return list.length >= 8;
}
function noteFail(key) { const l = fails.get(key) || []; l.push(Date.now()); fails.set(key, l); }

const validEmail = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
const validPassword = (p) => typeof p === 'string' && p.length >= 10 && p.length <= 200;
const publicUser = (u) => ({ id: u.id, email: u.email, firstName: u.first_name, lastName: u.last_name, role: u.role });

app.get('/healthz', async (req, res) => {
  try { await q('SELECT 1'); res.json({ ok: true }); } catch { res.status(500).json({ ok: false }); }
});

app.post('/api/login', async (req, res, next) => {
  try {
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    const password = String((req.body && req.body.password) || '');
    const key = `${email}|${req.ip}`;
    if (throttled(key)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
    const r = await q('SELECT * FROM users WHERE email = $1 AND active', [email]);
    const u = r.rows[0];
    const ok = u && u.password_hash && (await bcrypt.compare(password, u.password_hash));
    if (!ok) { noteFail(key); return res.status(401).json({ error: 'Email or password is not right.' }); }
    fails.delete(key);
    await startSession(res, u.id);
    res.json({ user: publicUser(u) });
  } catch (e) { next(e); }
});

app.post('/api/logout', async (req, res, next) => {
  try {
    const token = parseCookies(req)[COOKIE];
    if (token) await q('DELETE FROM sessions WHERE token_hash = $1', [sha(token)]);
    clearSession(res);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get('/api/me', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));

// Invite / reset links
async function findLink(token) {
  const r = await q(
    `SELECT l.*, u.email, u.first_name, u.last_name FROM link_tokens l JOIN users u ON u.id = l.user_id
     WHERE l.token_hash = $1 AND l.used_at IS NULL AND l.expires_at > now() AND u.active`,
    [sha(token)]
  );
  return r.rows[0];
}
app.get('/api/link/:token', async (req, res, next) => {
  try {
    const l = await findLink(req.params.token);
    if (!l) return res.status(404).json({ error: 'This link is not valid or has expired. Ask your instructor for a new one.' });
    res.json({ kind: l.kind, email: l.email, firstName: l.first_name });
  } catch (e) { next(e); }
});
app.post('/api/link/:token', async (req, res, next) => {
  try {
    const l = await findLink(req.params.token);
    if (!l) return res.status(404).json({ error: 'This link is not valid or has expired. Ask your instructor for a new one.' });
    const password = req.body && req.body.password;
    if (!validPassword(password)) return res.status(400).json({ error: 'Password must be at least 10 characters.' });
    const hash = await bcrypt.hash(password, 11);
    await q('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, l.user_id]);
    await q('UPDATE link_tokens SET used_at = now() WHERE token_hash = $1', [l.token_hash]);
    await q('DELETE FROM sessions WHERE user_id = $1', [l.user_id]);
    await startSession(res, l.user_id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Admin / instructor
async function makeLink(userId, kind) {
  const token = newToken();
  await q('INSERT INTO link_tokens (token_hash, user_id, kind, expires_at) VALUES ($1,$2,$3,$4)', [sha(token), userId, kind, addDays(LINK_DAYS)]);
  return `${BASE_URL}/#/link/${token}`;
}
async function seatsUsed(cohortId) {
  const r = await q(
    `SELECT count(*)::int AS n FROM enrollments e JOIN users u ON u.id = e.user_id
     WHERE e.cohort_id = $1 AND u.role = 'student' AND u.active`, [cohortId]);
  return r.rows[0].n;
}

app.get('/api/cohorts', requireAuth, requireRole('admin', 'instructor'), async (req, res, next) => {
  try {
    const r = await q(
      `SELECT c.*, c.start_date::text AS start_date, (SELECT count(*)::int FROM enrollments e JOIN users u ON u.id = e.user_id
                    WHERE e.cohort_id = c.id AND u.role = 'student' AND u.active) AS seats_used
       FROM cohorts c ORDER BY c.id DESC`);
    res.json({ cohorts: r.rows });
  } catch (e) { next(e); }
});

app.post('/api/cohorts', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const name = String((req.body && req.body.name) || '').trim();
    const start = (req.body && req.body.startDate) || null;
    if (!name || name.length > 100) return res.status(400).json({ error: 'Give the cohort a name.' });
    if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) return res.status(400).json({ error: 'Start date must look like 2026-12-01.' });
    const r = await q('INSERT INTO cohorts (name, start_date, seat_cap) VALUES ($1,$2,$3) RETURNING *', [name, start, SEAT_CAP]);
    res.json({ cohort: r.rows[0] });
  } catch (e) { next(e); }
});

app.get('/api/users', requireAuth, requireRole('admin', 'instructor'), async (req, res, next) => {
  try {
    const r = await q(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.active, (u.password_hash IS NOT NULL) AS has_password,
              c.id AS cohort_id, c.name AS cohort_name
       FROM users u LEFT JOIN enrollments e ON e.user_id = u.id LEFT JOIN cohorts c ON c.id = e.cohort_id
       ORDER BY u.role, u.last_name, u.first_name`);
    res.json({ users: r.rows });
  } catch (e) { next(e); }
});

app.post('/api/invites', requireAuth, requireRole('admin', 'instructor'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    const first = String(b.firstName || '').trim();
    const last = String(b.lastName || '').trim();
    const role = b.role || 'student';
    const cohortId = b.cohortId ? parseInt(b.cohortId, 10) : null;
    if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (!first || !last) return res.status(400).json({ error: 'First and last name are required.' });
    if (!['student', 'instructor', 'admin'].includes(role)) return res.status(400).json({ error: 'Unknown role.' });
    if (role !== 'student' && req.user.role !== 'admin') return res.status(403).json({ error: 'Only the admin can invite staff.' });
    if (role === 'student') {
      if (!cohortId) return res.status(400).json({ error: 'Choose a cohort for the student.' });
      const c = await q('SELECT * FROM cohorts WHERE id = $1', [cohortId]);
      if (!c.rows[0]) return res.status(400).json({ error: 'Cohort not found.' });
      const used = await seatsUsed(cohortId);
      if (used >= Math.min(c.rows[0].seat_cap, SEAT_CAP)) {
        return res.status(409).json({ error: `This cohort is full (${used} of ${c.rows[0].seat_cap} seats used).` });
      }
    }
    const exists = await q('SELECT 1 FROM users WHERE email = $1', [email]);
    if (exists.rows[0]) return res.status(409).json({ error: 'That email already has an account. Use "New link" in the People list instead.' });
    const u = await q(
      'INSERT INTO users (email, first_name, last_name, role) VALUES ($1,$2,$3,$4) RETURNING id',
      [email, first, last, role]);
    if (role === 'student') await q('INSERT INTO enrollments (user_id, cohort_id) VALUES ($1,$2)', [u.rows[0].id, cohortId]);
    const link = await makeLink(u.rows[0].id, 'invite');
    res.json({ link });
  } catch (e) { next(e); }
});

app.post('/api/users/:id/reset-link', requireAuth, requireRole('admin', 'instructor'), async (req, res, next) => {
  try {
    const r = await q('SELECT id, role FROM users WHERE id = $1', [parseInt(req.params.id, 10)]);
    const u = r.rows[0];
    if (!u) return res.status(404).json({ error: 'User not found.' });
    if (u.role !== 'student' && req.user.role !== 'admin') return res.status(403).json({ error: 'Only the admin can do that for staff.' });
    res.json({ link: await makeLink(u.id, 'reset') });
  } catch (e) { next(e); }
});

app.post('/api/users/:id/active', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (id === req.user.id) return res.status(400).json({ error: 'You cannot deactivate yourself.' });
    const active = !!(req.body && req.body.active);
    await q('UPDATE users SET active = $1 WHERE id = $2', [active, id]);
    if (!active) await q('DELETE FROM sessions WHERE user_id = $1', [id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

require('./content')(app, { q, requireAuth, requireRole });
require('./assess')(app, { q, requireAuth, requireRole });

app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '5m' }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side.' });
});

async function bootstrap() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  for (let i = 0; i < 20; i++) {
    try { await q(sql); break; } catch (e) {
      if (i === 19) throw e;
      console.log('Waiting for database...', e.message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  await require('./seed').seed(q);
  const n = await q('SELECT count(*)::int AS n FROM users');
  if (n.rows[0].n === 0 && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 11);
    await q('INSERT INTO users (email, first_name, last_name, role, password_hash) VALUES ($1,$2,$3,$4,$5)',
      [process.env.ADMIN_EMAIL.toLowerCase(), process.env.ADMIN_FIRST_NAME || 'Admin', process.env.ADMIN_LAST_NAME || 'User', 'admin', hash]);
    console.log('Created first admin:', process.env.ADMIN_EMAIL);
  }
  setInterval(() => {
    q('DELETE FROM sessions WHERE expires_at < now()').catch(() => {});
  }, 3600000);
  app.listen(PORT, '0.0.0.0', () => console.log(`Academy listening on ${PORT}`));
}
bootstrap().catch((e) => { console.error(e); process.exit(1); });
