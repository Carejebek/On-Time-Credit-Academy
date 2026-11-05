const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/data/uploads';
const EXTS = new Set(['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'csv', 'txt', 'zip', 'png', 'jpg', 'jpeg']);

module.exports = function mount(app, { q, requireAuth, requireRole }) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const staff = requireRole('admin', 'instructor');
  const isStaff = (u) => u.role === 'admin' || u.role === 'instructor';
  const int = (v) => parseInt(v, 10);
  const removeFile = (p) => { if (p) fs.unlink(path.join(UPLOAD_DIR, p), () => {}); };

  async function weekOpenFor(user, weekId) {
    if (isStaff(user)) return true;
    const r = await q(
      `SELECT 1 FROM cohort_weeks cw JOIN enrollments e ON e.cohort_id = cw.cohort_id
       WHERE e.user_id = $1 AND cw.week_id = $2 LIMIT 1`, [user.id, weekId]);
    return !!r.rows[0];
  }

  // ---------- Quizzes ----------
  app.get('/api/course/:number/quiz', requireAuth, async (req, res, next) => {
    try {
      const w = (await q('SELECT id FROM weeks WHERE number = $1', [int(req.params.number)])).rows[0];
      if (!w) return res.status(404).json({ error: 'Week not found.' });
      if (!(await weekOpenFor(req.user, w.id))) return res.status(403).json({ error: 'This week has not opened yet.' });
      const qz = (await q('SELECT * FROM quizzes WHERE week_id = $1', [w.id])).rows[0];
      if (!qz) return res.json({ quiz: null });
      const qs = (await q('SELECT * FROM quiz_questions WHERE quiz_id = $1 ORDER BY position, id', [qz.id])).rows;
      const staffUser = isStaff(req.user);
      const best = (await q(
        `SELECT score, total, passed FROM quiz_attempts WHERE quiz_id = $1 AND user_id = $2
         ORDER BY score::float / NULLIF(total,0) DESC, id DESC LIMIT 1`, [qz.id, req.user.id])).rows[0] || null;
      const attempts = (await q('SELECT count(*)::int AS n FROM quiz_attempts WHERE quiz_id = $1 AND user_id = $2', [qz.id, req.user.id])).rows[0].n;
      res.json({
        quiz: {
          id: qz.id, title: qz.title, passMark: qz.pass_mark,
          questions: qs.map((x) => staffUser
            ? { id: x.id, prompt: x.prompt, options: x.options, correct: x.correct, explanation: x.explanation }
            : { id: x.id, prompt: x.prompt, options: x.options }),
        },
        best, attempts,
      });
    } catch (e) { next(e); }
  });

  app.post('/api/quizzes/:id/attempt', requireAuth, async (req, res, next) => {
    try {
      const qz = (await q('SELECT * FROM quizzes WHERE id = $1', [int(req.params.id)])).rows[0];
      if (!qz) return res.status(404).json({ error: 'Quiz not found.' });
      if (!(await weekOpenFor(req.user, qz.week_id))) return res.status(403).json({ error: 'This week has not opened yet.' });
      const qs = (await q('SELECT * FROM quiz_questions WHERE quiz_id = $1 ORDER BY position, id', [qz.id])).rows;
      const answers = (req.body && req.body.answers) || {};
      let score = 0;
      const results = qs.map((x) => {
        const given = answers[x.id];
        const ok = Number.isInteger(given) && given === x.correct;
        if (ok) score++;
        return { id: x.id, correct: ok, given: Number.isInteger(given) ? given : null, correctIndex: x.correct, explanation: x.explanation };
      });
      const total = qs.length;
      const percent = total ? Math.round((score / total) * 100) : 0;
      const passed = percent >= qz.pass_mark;
      if (!isStaff(req.user)) {
        await q('INSERT INTO quiz_attempts (quiz_id, user_id, score, total, passed, answers) VALUES ($1,$2,$3,$4,$5,$6)',
          [qz.id, req.user.id, score, total, passed, JSON.stringify(answers)]);
      }
      res.json({ score, total, percent, passed, passMark: qz.pass_mark, saved: !isStaff(req.user), results });
    } catch (e) { next(e); }
  });

  app.put('/api/course/:number/quiz', requireAuth, staff, async (req, res, next) => {
    try {
      const w = (await q('SELECT id, title FROM weeks WHERE number = $1', [int(req.params.number)])).rows[0];
      if (!w) return res.status(404).json({ error: 'Week not found.' });
      const b = req.body || {};
      const title = String(b.title || '').trim() || `Week ${req.params.number} quiz`;
      const passMark = int(b.passMark);
      if (!(passMark >= 1 && passMark <= 100)) return res.status(400).json({ error: 'Pass mark must be between 1 and 100.' });
      const list = Array.isArray(b.questions) ? b.questions : [];
      if (list.length < 1 || list.length > 50) return res.status(400).json({ error: 'A quiz needs between 1 and 50 questions.' });
      const clean = [];
      for (let i = 0; i < list.length; i++) {
        const x = list[i] || {};
        const prompt = String(x.prompt || '').trim();
        const options = (Array.isArray(x.options) ? x.options : []).map((o) => String(o || '').trim()).filter(Boolean);
        const correct = int(x.correct);
        if (!prompt) return res.status(400).json({ error: `Question ${i + 1} has no text.` });
        if (options.length < 2 || options.length > 6) return res.status(400).json({ error: `Question ${i + 1} needs 2 to 6 answer choices.` });
        if (!(correct >= 0 && correct < options.length)) return res.status(400).json({ error: `Question ${i + 1}: mark which answer is correct.` });
        clean.push({ pos: i + 1, prompt, options, correct, explanation: String(x.explanation || '').trim() });
      }
      const up = await q(
        `INSERT INTO quizzes (week_id, title, pass_mark) VALUES ($1,$2,$3)
         ON CONFLICT (week_id) DO UPDATE SET title = EXCLUDED.title, pass_mark = EXCLUDED.pass_mark RETURNING id`,
        [w.id, title, passMark]);
      const quizId = up.rows[0].id;
      await q(
        `WITH d AS (DELETE FROM quiz_questions WHERE quiz_id = $1)
         INSERT INTO quiz_questions (quiz_id, position, prompt, options, correct, explanation)
         SELECT $1, t.pos, t.prompt, t.options, t.correct, t.explanation
         FROM jsonb_to_recordset($2::jsonb) AS t(pos int, prompt text, options jsonb, correct int, explanation text)`,
        [quizId, JSON.stringify(clean)]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  app.delete('/api/course/:number/quiz', requireAuth, staff, async (req, res, next) => {
    try {
      await q('DELETE FROM quizzes WHERE week_id = (SELECT id FROM weeks WHERE number = $1)', [int(req.params.number)]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  app.get('/api/quiz-results', requireAuth, staff, async (req, res, next) => {
    try {
      const r = await q(
        `SELECT u.id AS user_id, u.first_name, u.last_name, w.number AS week, count(a.id)::int AS attempts,
                max(round(100.0 * a.score / NULLIF(a.total,0)))::int AS best, bool_or(a.passed) AS passed
         FROM quiz_attempts a JOIN users u ON u.id = a.user_id JOIN quizzes z ON z.id = a.quiz_id JOIN weeks w ON w.id = z.week_id
         GROUP BY u.id, u.first_name, u.last_name, w.number ORDER BY u.last_name, u.first_name, w.number`);
      res.json({ results: r.rows });
    } catch (e) { next(e); }
  });

  // ---------- Assignments ----------
  const subJson = (s, forStudent) => {
    if (!s) return null;
    const show = !forStudent || s.released;
    return {
      id: s.id, body: s.body, fileName: s.file_name, hasFile: !!s.file_path, submittedAt: s.submitted_at,
      released: s.released, graded: s.score !== null,
      score: show ? s.score : null, feedback: show ? s.feedback : '',
    };
  };

  async function assignmentItem(id) {
    return (await q("SELECT * FROM items WHERE id = $1 AND kind = 'assignment' AND NOT staff_only", [id])).rows[0];
  }

  app.get('/api/items/:id/submission', requireAuth, async (req, res, next) => {
    try {
      const it = await assignmentItem(int(req.params.id));
      if (!it) return res.status(404).json({ error: 'Not found.' });
      if (!(await weekOpenFor(req.user, it.week_id))) return res.status(403).json({ error: 'This week has not opened yet.' });
      const s = (await q('SELECT * FROM submissions WHERE item_id = $1 AND user_id = $2', [it.id, req.user.id])).rows[0];
      res.json({ submission: subJson(s, true) });
    } catch (e) { next(e); }
  });

  async function upsertSubmission(req, res, next, mutate) {
    try {
      if (isStaff(req.user)) return res.status(403).json({ error: 'Submitting is for students. Use Preview to look at the page.' });
      const it = await assignmentItem(int(req.params.id));
      if (!it) return res.status(404).json({ error: 'Not found.' });
      if (!(await weekOpenFor(req.user, it.week_id))) return res.status(403).json({ error: 'This week has not opened yet.' });
      const cur = (await q('SELECT * FROM submissions WHERE item_id = $1 AND user_id = $2', [it.id, req.user.id])).rows[0];
      if (cur && cur.released) return res.status(409).json({ error: 'This assignment has already been graded.' });
      await mutate(it, cur);
    } catch (e) { next(e); }
  }

  app.put('/api/items/:id/submission', requireAuth, (req, res, next) => upsertSubmission(req, res, next, async (it) => {
    const body = String((req.body && req.body.body) || '');
    if (body.length > 60000) return res.status(400).json({ error: 'The text is too long.' });
    const s = (await q(
      `INSERT INTO submissions (item_id, user_id, body) VALUES ($1,$2,$3)
       ON CONFLICT (item_id, user_id) DO UPDATE SET body = EXCLUDED.body, submitted_at = now()
       RETURNING *`, [it.id, req.user.id, body])).rows[0];
    res.json({ submission: subJson(s, true) });
  }));

  app.post('/api/items/:id/submission/file', requireAuth, express.raw({ type: () => true, limit: '25mb' }),
    (req, res, next) => upsertSubmission(req, res, next, async (it, cur) => {
      const orig = decodeURIComponent(String(req.headers['x-filename'] || 'file')).replace(/[^\w.\- ]/g, '_').slice(0, 120);
      const ext = (orig.split('.').pop() || '').toLowerCase();
      if (!EXTS.has(ext)) return res.status(400).json({ error: 'That file type is not allowed. Use PDF, Word, Excel, PowerPoint, CSV, text, zip or an image.' });
      if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'The file was empty.' });
      const stored = `s${it.id}-${req.user.id}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, stored), req.body);
      const s = (await q(
        `INSERT INTO submissions (item_id, user_id, body, file_path, file_name) VALUES ($1,$2,'',$3,$4)
         ON CONFLICT (item_id, user_id) DO UPDATE SET file_path = EXCLUDED.file_path, file_name = EXCLUDED.file_name, submitted_at = now()
         RETURNING *`, [it.id, req.user.id, stored, orig])).rows[0];
      if (cur) removeFile(cur.file_path);
      res.json({ submission: subJson(s, true) });
    }));

  // Staff grading
  app.get('/api/submissions', requireAuth, staff, async (req, res, next) => {
    try {
      const r = await q(
        `SELECT s.id, s.submitted_at, s.score, s.released, u.first_name, u.last_name, i.title AS item, w.number AS week
         FROM submissions s JOIN users u ON u.id = s.user_id JOIN items i ON i.id = s.item_id JOIN weeks w ON w.id = i.week_id
         ORDER BY (s.released) ASC, s.submitted_at DESC`);
      res.json({ submissions: r.rows });
    } catch (e) { next(e); }
  });

  async function loadSub(req) {
    const s = (await q(
      `SELECT s.*, u.first_name, u.last_name, u.email, i.title AS item, i.body AS item_body, w.number AS week
       FROM submissions s JOIN users u ON u.id = s.user_id JOIN items i ON i.id = s.item_id JOIN weeks w ON w.id = i.week_id
       WHERE s.id = $1`, [int(req.params.id)])).rows[0];
    if (!s) return null;
    if (!isStaff(req.user) && s.user_id !== req.user.id) return null;
    return s;
  }

  app.get('/api/submissions/:id', requireAuth, staff, async (req, res, next) => {
    try {
      const s = await loadSub(req);
      if (!s) return res.status(404).json({ error: 'Not found.' });
      res.json({ submission: { ...subJson(s, false), student: `${s.first_name} ${s.last_name}`, email: s.email, item: s.item, itemBody: s.item_body, week: s.week } });
    } catch (e) { next(e); }
  });

  app.put('/api/submissions/:id', requireAuth, staff, async (req, res, next) => {
    try {
      const b = req.body || {};
      const score = int(b.score);
      if (!(score >= 0 && score <= 100)) return res.status(400).json({ error: 'Score must be a number from 0 to 100.' });
      const feedback = String(b.feedback || '').slice(0, 20000);
      const r = await q('UPDATE submissions SET score = $1, feedback = $2, released = $3, graded_by = $4, graded_at = now() WHERE id = $5',
        [score, feedback, !!b.release, req.user.id, int(req.params.id)]);
      if (!r.rowCount) return res.status(404).json({ error: 'Not found.' });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  app.get('/api/submissions/:id/file', requireAuth, async (req, res, next) => {
    try {
      const s = await loadSub(req);
      if (!s || !s.file_path) return res.status(404).json({ error: 'No file.' });
      res.set('X-Content-Type-Options', 'nosniff');
      res.sendFile(path.resolve(UPLOAD_DIR, s.file_path), {
        headers: { 'Content-Disposition': `attachment; filename="${s.file_name || 'file'}"` },
      });
    } catch (e) { next(e); }
  });
};
