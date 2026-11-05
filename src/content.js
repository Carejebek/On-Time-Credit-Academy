const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/data/uploads';
const KINDS = ['lesson', 'video', 'reading', 'file', 'assignment', 'live', 'note'];
const EXTS = new Set(['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'csv', 'txt', 'zip', 'png', 'jpg', 'jpeg']);

function parseVideo(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let id = null;
    if (host === 'youtube.com') id = u.searchParams.get('v');
    else if (host === 'youtu.be') id = u.pathname.slice(1);
    if (id && /^[\w-]{6,20}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
    if (host === 'vimeo.com') {
      const m = u.pathname.match(/^\/(\d+)(?:\/(\w+))?/);
      if (m) return `https://player.vimeo.com/video/${m[1]}${m[2] ? '?h=' + m[2] : ''}`;
    }
  } catch (e) { /* fall through */ }
  return null;
}

module.exports = function mount(app, { q, requireAuth, requireRole }) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const staff = requireRole('admin', 'instructor');
  const isStaff = (u) => u.role === 'admin' || u.role === 'instructor';

  const itemJson = (r, done) => ({
    id: r.id, kind: r.kind, title: r.title, body: r.body, url: r.url,
    embed: r.url ? parseVideo(r.url) : null,
    hasFile: !!r.file_path, fileName: r.file_name, staffOnly: r.staff_only,
    position: r.position, done: !!done,
  });

  async function weekOpenFor(user, weekId) {
    if (isStaff(user)) return true;
    const r = await q(
      `SELECT 1 FROM cohort_weeks cw JOIN enrollments e ON e.cohort_id = cw.cohort_id
       WHERE e.user_id = $1 AND cw.week_id = $2 LIMIT 1`, [user.id, weekId]);
    return !!r.rows[0];
  }

  // Course overview
  app.get('/api/course', requireAuth, async (req, res, next) => {
    try {
      const staffUser = isStaff(req.user);
      const r = await q(
        `SELECT w.id, w.number, w.title, w.objectives,
           (SELECT count(*)::int FROM items i WHERE i.week_id = w.id AND ($2 OR NOT i.staff_only)) AS total,
           (SELECT count(*)::int FROM completions c JOIN items i ON i.id = c.item_id
              WHERE i.week_id = w.id AND NOT i.staff_only AND c.user_id = $1) AS done,
           EXISTS (SELECT 1 FROM cohort_weeks cw JOIN enrollments e ON e.cohort_id = cw.cohort_id
              WHERE e.user_id = $1 AND cw.week_id = w.id) AS open
         FROM weeks w ORDER BY w.number`, [req.user.id, staffUser]);
      res.json({ weeks: r.rows.map((w) => ({ number: w.number, title: w.title, objectives: w.objectives, total: w.total, done: w.done, open: staffUser ? true : w.open })) });
    } catch (e) { next(e); }
  });

  app.get('/api/course/:number', requireAuth, async (req, res, next) => {
    try {
      const w = (await q('SELECT * FROM weeks WHERE number = $1', [parseInt(req.params.number, 10)])).rows[0];
      if (!w) return res.status(404).json({ error: 'Week not found.' });
      if (!(await weekOpenFor(req.user, w.id))) return res.status(403).json({ error: 'This week has not opened yet.' });
      const staffUser = isStaff(req.user);
      const items = await q(
        `SELECT i.*, (c.user_id IS NOT NULL) AS done FROM items i
         LEFT JOIN completions c ON c.item_id = i.id AND c.user_id = $1
         WHERE i.week_id = $2 AND ($3 OR NOT i.staff_only) ORDER BY i.position, i.id`,
        [req.user.id, w.id, staffUser]);
      res.json({ week: { number: w.number, title: w.title, objectives: w.objectives }, items: items.rows.map((r) => itemJson(r, r.done)) });
    } catch (e) { next(e); }
  });

  app.post('/api/items/:id/complete', requireAuth, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const it = (await q('SELECT * FROM items WHERE id = $1', [id])).rows[0];
      if (!it || it.staff_only) return res.status(404).json({ error: 'Not found.' });
      if (!(await weekOpenFor(req.user, it.week_id))) return res.status(403).json({ error: 'This week has not opened yet.' });
      if (req.body && req.body.done === false) await q('DELETE FROM completions WHERE user_id = $1 AND item_id = $2', [req.user.id, id]);
      else await q('INSERT INTO completions (user_id, item_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, id]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // Staff editing
  app.put('/api/course/:number', requireAuth, staff, async (req, res, next) => {
    try {
      const title = String((req.body && req.body.title) || '').trim();
      const objectives = String((req.body && req.body.objectives) || '').trim();
      if (!title || title.length > 150) return res.status(400).json({ error: 'Give the week a title.' });
      if (objectives.length > 2000) return res.status(400).json({ error: 'Objectives are too long.' });
      await q('UPDATE weeks SET title = $1, objectives = $2 WHERE number = $3', [title, objectives, parseInt(req.params.number, 10)]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  function readItemBody(b) {
    const kind = b.kind;
    const title = String(b.title || '').trim();
    const body = String(b.body || '');
    const url = String(b.url || '').trim();
    if (!KINDS.includes(kind)) return { error: 'Choose what kind of item this is.' };
    if (!title || title.length > 200) return { error: 'Give the item a title.' };
    if (body.length > 60000) return { error: 'The text is too long.' };
    if (url && !parseVideo(url)) return { error: 'Use a YouTube or Vimeo link (unlisted is fine).' };
    return { kind, title, body, url: url || null, staffOnly: !!b.staffOnly };
  }

  app.post('/api/course/:number/items', requireAuth, staff, async (req, res, next) => {
    try {
      const w = (await q('SELECT id FROM weeks WHERE number = $1', [parseInt(req.params.number, 10)])).rows[0];
      if (!w) return res.status(404).json({ error: 'Week not found.' });
      const d = readItemBody(req.body || {});
      if (d.error) return res.status(400).json({ error: d.error });
      const pos = (await q('SELECT coalesce(max(position),0)+1 AS p FROM items WHERE week_id = $1', [w.id])).rows[0].p;
      const r = await q(
        'INSERT INTO items (week_id, position, kind, title, body, url, staff_only) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [w.id, pos, d.kind, d.title, d.body, d.url, d.staffOnly]);
      res.json({ id: r.rows[0].id });
    } catch (e) { next(e); }
  });

  app.put('/api/items/:id', requireAuth, staff, async (req, res, next) => {
    try {
      const d = readItemBody(req.body || {});
      if (d.error) return res.status(400).json({ error: d.error });
      const r = await q('UPDATE items SET kind=$1, title=$2, body=$3, url=$4, staff_only=$5 WHERE id=$6',
        [d.kind, d.title, d.body, d.url, d.staffOnly, parseInt(req.params.id, 10)]);
      if (!r.rowCount) return res.status(404).json({ error: 'Item not found.' });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  const removeFile = (p) => { if (p) fs.unlink(path.join(UPLOAD_DIR, p), () => {}); };

  app.delete('/api/items/:id', requireAuth, staff, async (req, res, next) => {
    try {
      const r = await q('DELETE FROM items WHERE id = $1 RETURNING file_path', [parseInt(req.params.id, 10)]);
      if (!r.rowCount) return res.status(404).json({ error: 'Item not found.' });
      removeFile(r.rows[0].file_path);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  app.post('/api/items/:id/move', requireAuth, staff, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const dir = req.body && req.body.dir === 'up' ? -1 : 1;
      const it = (await q('SELECT week_id FROM items WHERE id = $1', [id])).rows[0];
      if (!it) return res.status(404).json({ error: 'Item not found.' });
      const list = (await q('SELECT id FROM items WHERE week_id = $1 ORDER BY position, id', [it.week_id])).rows.map((r) => r.id);
      const i = list.indexOf(id);
      const j = i + dir;
      if (j < 0 || j >= list.length) return res.json({ ok: true });
      [list[i], list[j]] = [list[j], list[i]];
      for (let k = 0; k < list.length; k++) await q('UPDATE items SET position = $1 WHERE id = $2', [k + 1, list[k]]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // Files
  app.post('/api/items/:id/file', requireAuth, staff, express.raw({ type: () => true, limit: '25mb' }), async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const it = (await q('SELECT file_path FROM items WHERE id = $1', [id])).rows[0];
      if (!it) return res.status(404).json({ error: 'Item not found.' });
      const orig = decodeURIComponent(String(req.headers['x-filename'] || 'file')).replace(/[^\w.\- ]/g, '_').slice(0, 120);
      const ext = (orig.split('.').pop() || '').toLowerCase();
      if (!EXTS.has(ext)) return res.status(400).json({ error: 'That file type is not allowed. Use PDF, Word, Excel, PowerPoint, CSV, text, zip or an image.' });
      if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'The file was empty.' });
      const stored = `${id}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, stored), req.body);
      await q('UPDATE items SET file_path = $1, file_name = $2 WHERE id = $3', [stored, orig, id]);
      removeFile(it.file_path);
      res.json({ ok: true, fileName: orig });
    } catch (e) { next(e); }
  });

  app.delete('/api/items/:id/file', requireAuth, staff, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const it = (await q('SELECT file_path FROM items WHERE id = $1', [id])).rows[0];
      if (!it) return res.status(404).json({ error: 'Item not found.' });
      await q('UPDATE items SET file_path = NULL, file_name = NULL WHERE id = $1', [id]);
      removeFile(it.file_path);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  app.get('/api/items/:id/file', requireAuth, async (req, res, next) => {
    try {
      const it = (await q('SELECT * FROM items WHERE id = $1', [parseInt(req.params.id, 10)])).rows[0];
      if (!it || !it.file_path) return res.status(404).json({ error: 'No file.' });
      if (it.staff_only && !isStaff(req.user)) return res.status(404).json({ error: 'No file.' });
      if (!(await weekOpenFor(req.user, it.week_id))) return res.status(403).json({ error: 'This week has not opened yet.' });
      res.set('X-Content-Type-Options', 'nosniff');
      res.sendFile(path.resolve(UPLOAD_DIR, it.file_path), {
        headers: { 'Content-Disposition': `attachment; filename="${it.file_name || 'file'}"` },
      });
    } catch (e) { next(e); }
  });

  // Opening weeks for a cohort, and progress
  app.get('/api/cohorts/:id/open', requireAuth, staff, async (req, res, next) => {
    try {
      const r = await q('SELECT w.number FROM cohort_weeks cw JOIN weeks w ON w.id = cw.week_id WHERE cw.cohort_id = $1 ORDER BY w.number', [parseInt(req.params.id, 10)]);
      res.json({ open: r.rows.map((x) => x.number) });
    } catch (e) { next(e); }
  });

  app.post('/api/cohorts/:id/open/:number', requireAuth, staff, async (req, res, next) => {
    try {
      const cid = parseInt(req.params.id, 10);
      const w = (await q('SELECT id FROM weeks WHERE number = $1', [parseInt(req.params.number, 10)])).rows[0];
      const c = (await q('SELECT id FROM cohorts WHERE id = $1', [cid])).rows[0];
      if (!w || !c) return res.status(404).json({ error: 'Not found.' });
      if (req.body && req.body.open === false) await q('DELETE FROM cohort_weeks WHERE cohort_id = $1 AND week_id = $2', [cid, w.id]);
      else await q('INSERT INTO cohort_weeks (cohort_id, week_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [cid, w.id]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  app.get('/api/cohorts/:id/progress', requireAuth, staff, async (req, res, next) => {
    try {
      const cid = parseInt(req.params.id, 10);
      const total = (await q(
        `SELECT count(*)::int AS n FROM items i JOIN cohort_weeks cw ON cw.week_id = i.week_id
         WHERE cw.cohort_id = $1 AND NOT i.staff_only`, [cid])).rows[0].n;
      const r = await q(
        `SELECT u.id, u.first_name, u.last_name,
           (SELECT count(*)::int FROM completions c JOIN items i ON i.id = c.item_id
              JOIN cohort_weeks cw ON cw.week_id = i.week_id AND cw.cohort_id = $1
              WHERE c.user_id = u.id AND NOT i.staff_only) AS done
         FROM users u JOIN enrollments e ON e.user_id = u.id
         WHERE e.cohort_id = $1 AND u.role = 'student' AND u.active ORDER BY u.last_name, u.first_name`, [cid]);
      res.json({ total, students: r.rows });
    } catch (e) { next(e); }
  });
};
