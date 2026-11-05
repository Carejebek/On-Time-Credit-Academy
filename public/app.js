(function () {
  const app = document.getElementById('app');
  const who = document.getElementById('who');
  let me = null;

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'class') n.className = attrs[k];
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    kids.flat().forEach((c) => n.append(c && c.nodeType ? c : document.createTextNode(c == null ? '' : String(c))));
    return n;
  }
  function field(label, name, type, extra) {
    const input = el('input', Object.assign({ name, type: type || 'text', required: 'required' }, extra || {}));
    return el('div', {}, el('label', {}, label), input);
  }
  async function api(path, method, body) {
    const r = await fetch(path, {
      method: method || 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    let data = {};
    try { data = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }
  function show(...nodes) { app.replaceChildren(...nodes); }
  function formData(form) { return Object.fromEntries(new FormData(form).entries()); }

  function renderHeader() {
    who.replaceChildren();
    if (!me) return;
    who.append(el('span', {}, `${me.firstName} ${me.lastName}`), el('span', { class: 'tag' }, me.role),
      el('button', { class: 'link', onclick: async () => { await api('/api/logout', 'POST'); me = null; route(); } }, 'Sign out'));
  }

  function loginView() {
    const err = el('div', { class: 'err' });
    const form = el('form', { onsubmit: async (e) => {
      e.preventDefault(); err.textContent = '';
      try { const d = await api('/api/login', 'POST', formData(form)); me = d.user; route(); }
      catch (x) { err.textContent = x.message; }
    } },
      field('Email', 'email', 'email', { autocomplete: 'username' }),
      field('Password', 'password', 'password', { autocomplete: 'current-password' }),
      el('div', { style: 'margin-top:16px' }, el('button', { type: 'submit' }, 'Sign in')), err);
    show(el('div', { class: 'card' }, el('h1', {}, 'Sign in'),
      el('p', { class: 'muted' }, 'Students receive a private link from the program to set a password. Lost your password? Ask your instructor for a new link.'), form));
  }

  async function linkView(token) {
    let info;
    try { info = await api('/api/link/' + encodeURIComponent(token)); }
    catch (x) { show(el('div', { class: 'card' }, el('h1', {}, 'Link not valid'), el('p', {}, x.message))); return; }
    const err = el('div', { class: 'err' });
    const form = el('form', { onsubmit: async (e) => {
      e.preventDefault(); err.textContent = '';
      const d = formData(form);
      if (d.password !== d.again) { err.textContent = 'The two passwords do not match.'; return; }
      try { await api('/api/link/' + encodeURIComponent(token), 'POST', { password: d.password }); location.hash = ''; await boot(); }
      catch (x) { err.textContent = x.message; }
    } },
      field('New password (10 characters or more)', 'password', 'password', { minlength: '10', autocomplete: 'new-password' }),
      field('Type it again', 'again', 'password', { minlength: '10', autocomplete: 'new-password' }),
      el('div', { style: 'margin-top:16px' }, el('button', { type: 'submit' }, 'Save password and continue')), err);
    show(el('div', { class: 'card' }, el('h1', {}, info.kind === 'invite' ? `Welcome, ${info.firstName}` : 'Choose a new password'),
      el('p', { class: 'muted' }, `Account: ${info.email}`), form));
  }

  async function homeView() {
    const isStaff = me.role === 'admin' || me.role === 'instructor';
    const nodes = [el('div', { class: 'card' }, el('h1', {}, `Hello, ${me.firstName}`),
      el('p', {}, isStaff
        ? 'Edit the course, open weeks for a cohort and invite students below. Quizzes and grading arrive in the next build steps.'
        : 'Welcome. Your eight weeks appear below as your instructor opens them.'))];
    if (isStaff) nodes.push(await staffCourse(), ...(await staffPanels()));
    else nodes.push(await studentCourse());
    show(...nodes);
  }

  async function staffPanels() {
    const [{ cohorts }, { users }] = await Promise.all([api('/api/cohorts'), api('/api/users')]);
    const panels = [];

    const cohortList = el('div', {}, cohorts.length ? cohorts.map((c) =>
      el('div', { style: 'margin-bottom:12px' },
        el('b', {}, c.name), ` `, el('span', { class: 'muted' }, `${c.seats_used} of ${c.seat_cap} seats used${c.start_date ? ' · starts ' + String(c.start_date).slice(0, 10) : ''}`),
        el('div', { class: 'seat' }, el('i', { style: `width:${Math.min(100, (c.seats_used / c.seat_cap) * 100)}%` })))) : el('p', { class: 'muted' }, 'No cohorts yet.'));
    const cerr = el('div', { class: 'err' });
    const cform = el('form', { onsubmit: async (e) => {
      e.preventDefault(); cerr.textContent = '';
      const d = formData(cform);
      try { await api('/api/cohorts', 'POST', { name: d.name, startDate: d.startDate || null }); homeView(); }
      catch (x) { cerr.textContent = x.message; }
    } },
      el('div', { class: 'row' }, field('Cohort name', 'name', 'text', { placeholder: 'Cohort 1' }),
        el('div', {}, el('label', {}, 'Start date (optional)'), el('input', { name: 'startDate', type: 'date' }))),
      el('div', { style: 'margin-top:12px' }, el('button', { type: 'submit' }, 'Add cohort')), cerr);
    panels.push(el('div', { class: 'card' }, el('h2', {}, 'Cohorts'), cohortList, me.role === 'admin' ? cform : ''));

    const result = el('div', {});
    const ierr = el('div', { class: 'err' });
    const sel = el('select', { name: 'cohortId' }, el('option', { value: '' }, 'Choose a cohort'),
      cohorts.map((c) => el('option', { value: c.id }, `${c.name} (${c.seats_used}/${c.seat_cap})`)));
    const roleSel = el('select', { name: 'role' }, el('option', { value: 'student' }, 'Student'),
      me.role === 'admin' ? [el('option', { value: 'instructor' }, 'Instructor'), el('option', { value: 'admin' }, 'Admin')] : []);
    const iform = el('form', { onsubmit: async (e) => {
      e.preventDefault(); ierr.textContent = ''; result.replaceChildren();
      const d = formData(iform);
      try {
        const r = await api('/api/invites', 'POST', { email: d.email, firstName: d.firstName, lastName: d.lastName, role: d.role, cohortId: d.cohortId || null });
        result.append(linkBox(r.link, 'Send this private link to the person. It works once and expires in 7 days.'));
        iform.reset();
      } catch (x) { ierr.textContent = x.message; }
    } },
      el('div', { class: 'row' }, field('First name', 'firstName'), field('Last name', 'lastName')),
      field('Email', 'email', 'email'),
      el('div', { class: 'row' }, el('div', {}, el('label', {}, 'Role'), roleSel), el('div', {}, el('label', {}, 'Cohort (students)'), sel)),
      el('div', { style: 'margin-top:12px' }, el('button', { class: 'gold', type: 'submit' }, 'Create invite link')), ierr, result);
    panels.push(el('div', { class: 'card' }, el('h2', {}, 'Invite someone'), iform));

    const rlink = el('div', {});
    const rows = users.map((u) => el('tr', {},
      el('td', {}, `${u.first_name} ${u.last_name}`, el('div', { class: 'muted' }, u.email)),
      el('td', {}, el('span', { class: 'tag' }, u.role)),
      el('td', {}, u.cohort_name || ''),
      el('td', {}, u.active ? (u.has_password ? 'Active' : 'Invited') : 'Deactivated'),
      el('td', {}, el('button', { class: 'small', onclick: async () => {
        try { const r = await api(`/api/users/${u.id}/reset-link`, 'POST'); rlink.replaceChildren(linkBox(r.link, `New sign-in link for ${u.first_name}.`)); rlink.scrollIntoView(); }
        catch (x) { alert(x.message); }
      } }, 'New link'),
        me.role === 'admin' && u.id !== me.id ? [' ', el('button', { class: 'small', onclick: async () => {
          await api(`/api/users/${u.id}/active`, 'POST', { active: !u.active }); homeView();
        } }, u.active ? 'Deactivate' : 'Reactivate')] : '')));
    panels.push(el('div', { class: 'card' }, el('h2', {}, 'People'), rlink,
      el('table', {}, el('thead', {}, el('tr', {}, ['Name', 'Role', 'Cohort', 'Status', ''].map((h) => el('th', {}, h)))), el('tbody', {}, rows))));
    return panels;
  }

  function linkBox(link, note) {
    const box = el('div', { class: 'ok' }, el('div', { class: 'muted' }, note), el('div', { style: 'margin:6px 0;font-weight:600' }, link));
    const b = el('button', { class: 'small', type: 'button', onclick: async () => {
      try { await navigator.clipboard.writeText(link); b.textContent = 'Copied'; } catch (e) { b.textContent = 'Select and copy the link'; }
    } }, 'Copy link');
    box.append(b);
    return box;
  }

  // ---------- Course ----------
  function inlineBold(t) {
    const frag = document.createDocumentFragment();
    t.split(/(\*\*[^*]+\*\*)/).forEach((part) => {
      if (/^\*\*[^*]+\*\*$/.test(part)) frag.append(el('b', {}, part.slice(2, -2)));
      else if (part) frag.append(part);
    });
    return frag;
  }
  function rich(text) {
    const box = el('div', { class: 'rich' });
    let list = null, listType = null, para = [];
    const flushPara = () => { if (para.length) { const p = el('p'); p.append(inlineBold(para.join(' '))); box.append(p); para = []; } };
    for (const raw of String(text || '').split('\n')) {
      const line = raw.trimEnd();
      let m;
      if (!line.trim()) { flushPara(); list = null; listType = null; continue; }
      if ((m = line.match(/^## (.*)/))) { flushPara(); list = null; listType = null; box.append(el('h4', {}, m[1])); continue; }
      if ((m = line.match(/^- (.*)/)) || (m = line.match(/^\d+\. (.*)/))) {
        flushPara();
        const type = /^- /.test(line) ? 'ul' : 'ol';
        if (listType !== type) { list = el(type); box.append(list); listType = type; }
        const li = el('li'); li.append(inlineBold(m[1])); list.append(li);
        continue;
      }
      list = null; listType = null; para.push(line);
    }
    flushPara();
    return box;
  }
  const bar = (done, total) => el('div', { class: 'bar' }, el('i', { style: `width:${total ? Math.round((done / total) * 100) : 0}%` }));
  const KIND_LABEL = { lesson: 'Lesson', video: 'Video', reading: 'Reading', file: 'File', assignment: 'Assignment', live: 'Live session', note: 'Note' };

  async function studentCourse() {
    const { weeks } = await api('/api/course');
    const open = weeks.filter((w) => w.open);
    const done = open.reduce((a, w) => a + w.done, 0), total = open.reduce((a, w) => a + w.total, 0);
    const card = el('div', { class: 'card' }, el('h2', {}, 'Your course'));
    if (open.length) card.append(el('p', { class: 'muted' }, `${done} of ${total} items done so far`), bar(done, total));
    else card.append(el('p', { class: 'muted' }, 'Week 1 opens when your instructor starts the cohort.'));
    weeks.forEach((w) => card.append(el('div', { class: 'wk' + (w.open ? '' : ' locked') },
      el('div', { style: 'flex:1' }, el('h3', {}, `Week ${w.number}: ${w.title}`), el('div', { class: 'muted' }, w.objectives),
        w.open && w.total ? el('div', { style: 'margin-top:8px' }, bar(w.done, w.total), el('div', { class: 'muted' }, `${w.done} of ${w.total} done`)) : ''),
      w.open ? el('a', { class: 'btn', href: `#/week/${w.number}` }, 'Open') : el('span', { class: 'muted' }, 'Opens soon'))));
    return card;
  }

  async function staffCourse() {
    const [{ weeks }, { cohorts }] = await Promise.all([api('/api/course'), api('/api/cohorts')]);
    const card = el('div', { class: 'card' }, el('h2', {}, 'Course content'),
      el('p', { class: 'muted' }, 'Edit each week, then open it for a cohort when you are ready. Students only see weeks you have opened.'));
    const holder = el('div');
    const sel = el('select', {}, cohorts.map((c) => el('option', { value: c.id }, c.name)));
    async function load() {
      holder.replaceChildren();
      let open = [], prog = null;
      if (cohorts.length) {
        open = (await api(`/api/cohorts/${sel.value}/open`)).open;
        prog = await api(`/api/cohorts/${sel.value}/progress`);
      }
      const rows = weeks.map((w) => {
        const isOpen = open.includes(w.number);
        return el('tr', {},
          el('td', {}, `Week ${w.number}`), el('td', {}, w.title), el('td', {}, String(w.total)),
          el('td', {}, cohorts.length ? el('button', { class: 'small' + (isOpen ? '' : ' gold'), onclick: async () => {
            await api(`/api/cohorts/${sel.value}/open/${w.number}`, 'POST', { open: !isOpen }); load();
          } }, isOpen ? 'Open (click to close)' : 'Open this week') : ''),
          el('td', {}, el('a', { class: 'plain', href: `#/edit/${w.number}` }, 'Edit'), ' · ', el('a', { class: 'plain', href: `#/week/${w.number}` }, 'Preview')));
      });
      holder.append(el('table', {}, el('thead', {}, el('tr', {}, ['Week', 'Title', 'Items', 'For this cohort', ''].map((h) => el('th', {}, h)))), el('tbody', {}, rows)));
      if (prog) {
        holder.append(el('h2', { style: 'margin-top:20px' }, 'Student progress'));
        if (!prog.students.length) holder.append(el('p', { class: 'muted' }, 'No students in this cohort yet.'));
        else holder.append(el('table', {}, el('thead', {}, el('tr', {}, ['Student', 'Done', ''].map((h) => el('th', {}, h)))),
          el('tbody', {}, prog.students.map((s) => el('tr', {}, el('td', {}, `${s.first_name} ${s.last_name}`),
            el('td', {}, prog.total ? `${s.done} of ${prog.total}` : 'No weeks open'), el('td', { style: 'width:35%' }, bar(s.done, prog.total)))))));
      }
    }
    sel.addEventListener('change', load);
    if (cohorts.length) card.append(el('label', {}, 'Cohort'), sel);
    else card.append(el('p', { class: 'muted' }, 'Add a cohort first (below), then you can open weeks for it.'));
    card.append(el('p', {}, el('a', { class: 'btn', href: '#/grading' }, 'Grading and quiz results')));
    card.append(holder);
    await load();
    return card;
  }

  async function weekView(n) {
    let d;
    try { d = await api('/api/course/' + n); }
    catch (x) { show(el('div', { class: 'card' }, el('p', {}, x.message), el('a', { class: 'plain', href: '#/' }, 'Back to the course'))); return; }
    const staffUser = me.role !== 'student';
    const nodes = [el('div', { class: 'crumb' }, el('a', { class: 'plain', href: '#/' }, '← All weeks'))];
    const head = el('div', { class: 'card' }, el('h1', {}, `Week ${d.week.number}: ${d.week.title}`), el('p', { class: 'muted' }, d.week.objectives));
    if (staffUser) head.append(el('a', { class: 'btn', href: `#/edit/${n}` }, 'Edit this week'));
    nodes.push(head);
    if (!d.items.length) nodes.push(el('div', { class: 'card' }, el('p', { class: 'muted' }, 'Nothing has been added to this week yet.')));
    for (const it of d.items) {
      const box = el('div', { class: 'item' + (it.staffOnly ? ' staffonly' : '') },
        el('h3', {}, it.title), el('span', { class: 'tag' }, KIND_LABEL[it.kind] || it.kind), it.staffOnly ? [' ', el('span', { class: 'tag' }, 'Staff only')] : '');
      if (it.embed) box.append(el('div', { class: 'video' }, el('iframe', { src: it.embed, allow: 'fullscreen; picture-in-picture', allowfullscreen: 'allowfullscreen', title: it.title })));
      if (it.body) box.append(el('div', { style: 'margin-top:10px' }, rich(it.body)));
      if (it.hasFile) box.append(el('p', {}, el('a', { class: 'btn', href: `/api/items/${it.id}/file` }, `Download ${it.fileName}`)));
      if (!staffUser && it.kind === 'assignment') box.append(await assignmentBox(it));
      if (!staffUser && !it.staffOnly) {
        const cb = el('input', { type: 'checkbox' });
        cb.checked = it.done;
        cb.addEventListener('change', async () => { try { await api(`/api/items/${it.id}/complete`, 'POST', { done: cb.checked }); } catch (x) { cb.checked = !cb.checked; alert(x.message); } });
        box.append(el('label', { class: 'check' }, cb, 'Mark as done'));
      }
      nodes.push(box);
    }
    const qc = await quizCard(n);
    if (qc) nodes.push(qc);
    show(...nodes);
  }

  function itemForm(it, n, onDone) {
    const err = el('div', { class: 'err' });
    const kind = el('select', { name: 'kind' }, Object.keys(KIND_LABEL).map((k) => el('option', { value: k }, KIND_LABEL[k])));
    kind.value = it ? it.kind : 'lesson';
    const staffOnly = el('input', { type: 'checkbox', name: 'staffOnly' });
    staffOnly.checked = !!(it && it.staffOnly);
    const title = el('input', { name: 'title', value: it ? it.title : '', maxlength: '200' });
    const url = el('input', { name: 'url', value: it && it.url ? it.url : '', placeholder: 'https://youtu.be/... (optional)' });
    const body = el('textarea', { name: 'body' }); body.value = it ? it.body : '';
    const payload = () => ({ kind: kind.value, title: title.value, url: url.value, body: body.value, staffOnly: staffOnly.checked });
    const save = el('button', { type: 'button', onclick: async () => {
      err.textContent = '';
      try {
        if (it) await api(`/api/items/${it.id}`, 'PUT', payload());
        else await api(`/api/course/${n}/items`, 'POST', payload());
        onDone();
      } catch (x) { err.textContent = x.message; }
    } }, it ? 'Save changes' : 'Add to this week');
    const form = el('div', {},
      el('div', { class: 'row' }, el('div', {}, el('label', {}, 'Type'), kind), el('div', {}, el('label', {}, 'Title'), title)),
      el('label', {}, 'Video link (YouTube or Vimeo, unlisted is fine)'), url,
      el('label', {}, 'Text (use ## for a heading, - for bullets, 1. for numbered steps, **bold**)'), body,
      el('label', { class: 'check' }, staffOnly, 'Staff only (students never see this)'),
      el('div', { class: 'actions' }, save), err);
    return { form, actions: form.querySelector('.actions') };
  }

  async function editView(n) {
    let d;
    try { d = await api('/api/course/' + n); }
    catch (x) { show(el('div', { class: 'card' }, el('p', {}, x.message))); return; }
    const reload = () => editView(n);
    const nodes = [el('div', { class: 'crumb' }, el('a', { class: 'plain', href: '#/' }, '← Back'), ' · ', el('a', { class: 'plain', href: `#/week/${n}` }, 'Preview as student'))];

    const terr = el('div', { class: 'err' });
    const wt = el('input', { value: d.week.title, maxlength: '150' });
    const wo = el('textarea', { style: 'min-height:70px' }); wo.value = d.week.objectives;
    nodes.push(el('div', { class: 'card' }, el('h1', {}, `Edit Week ${n}`), el('label', {}, 'Week title'), wt, el('label', {}, 'What students will be able to do'), wo,
      el('div', { class: 'actions' }, el('button', { type: 'button', onclick: async () => {
        terr.textContent = '';
        try { await api(`/api/course/${n}`, 'PUT', { title: wt.value, objectives: wo.value }); terr.textContent = 'Saved.'; } catch (x) { terr.textContent = x.message; }
      } }, 'Save week details')), terr));

    d.items.forEach((it, i) => {
      const { form, actions } = itemForm(it, n, reload);
      const card = el('div', { class: 'item' + (it.staffOnly ? ' staffonly' : '') }, el('h3', {}, `${i + 1}. ${it.title}`), form);
      actions.append(
        el('button', { type: 'button', class: 'small', onclick: async () => { await api(`/api/items/${it.id}/move`, 'POST', { dir: 'up' }); reload(); } }, 'Move up'),
        el('button', { type: 'button', class: 'small', onclick: async () => { await api(`/api/items/${it.id}/move`, 'POST', { dir: 'down' }); reload(); } }, 'Move down'),
        el('button', { type: 'button', class: 'small', onclick: async () => { if (confirm('Delete this item?')) { await api(`/api/items/${it.id}`, 'DELETE'); reload(); } } }, 'Delete'));
      const ferr = el('div', { class: 'err' });
      const fin = el('input', { type: 'file' });
      const fileRow = el('div', { style: 'margin-top:14px;padding-top:12px;border-top:1px solid var(--line)' },
        el('b', {}, 'Attached file: '), it.hasFile ? [it.fileName, ' '] : 'none ',
        it.hasFile ? el('button', { type: 'button', class: 'small', onclick: async () => { await api(`/api/items/${it.id}/file`, 'DELETE'); reload(); } }, 'Remove file') : '',
        el('div', { style: 'margin-top:8px' }, fin, ' ', el('button', { type: 'button', class: 'small', onclick: async () => {
          ferr.textContent = '';
          const f = fin.files[0];
          if (!f) { ferr.textContent = 'Choose a file first.'; return; }
          try {
            const r = await fetch(`/api/items/${it.id}/file`, { method: 'POST', credentials: 'same-origin',
              headers: { 'Content-Type': 'application/octet-stream', 'x-filename': encodeURIComponent(f.name) }, body: f });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j.error || 'Upload failed.');
            reload();
          } catch (x) { ferr.textContent = x.message; }
        } }, 'Upload'), ' ', el('span', { class: 'muted' }, 'Up to 25 MB')), ferr);
      card.append(fileRow);
      nodes.push(card);
    });

    const add = itemForm(null, n, reload);
    nodes.push(el('div', { class: 'card' }, el('h2', {}, 'Add something to this week'), add.form,
      el('p', { class: 'muted' }, 'After adding an item you can attach a file to it.')));
    nodes.push(await quizEditor(n));
    show(...nodes);
  }

  // ---------- Quizzes and assignments ----------
  const shuffled = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const fmtDate = (d) => new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

  async function quizCard(n) {
    let d;
    try { d = await api(`/api/course/${n}/quiz`); } catch (x) { return null; }
    if (!d.quiz) return null;
    const qz = d.quiz;
    const staffUser = me.role !== 'student';
    const card = el('div', { class: 'item' }, el('h3', {}, qz.title), el('span', { class: 'tag' }, 'Quiz'),
      el('p', { class: 'muted' }, `${qz.questions.length} questions · ${qz.passMark}% to pass · retake as often as you like`));
    if (d.best) card.append(el('p', {}, el('b', {}, `Your best: ${d.best.score} of ${d.best.total}`), d.best.passed ? ' · Passed' : ' · Not passed yet', ` (${d.attempts} attempt${d.attempts === 1 ? '' : 's'})`));
    const body = el('div');
    const start = () => {
      body.replaceChildren();
      const err = el('div', { class: 'err' });
      const form = el('div');
      qz.questions.forEach((x, i) => {
        const box = el('div', { style: 'margin:14px 0' }, el('b', {}, `${i + 1}. ${x.prompt}`));
        shuffled(x.options.map((t, idx) => [idx, t])).forEach(([idx, t]) => {
          const r = el('input', { type: 'radio', name: 'q' + x.id, value: String(idx) });
          box.append(el('label', { class: 'check', style: 'font-weight:400' }, r, t));
        });
        form.append(box);
      });
      const submit = el('button', { type: 'button', onclick: async () => {
        err.textContent = '';
        const answers = {};
        qz.questions.forEach((x) => { const c = form.querySelector(`input[name=q${x.id}]:checked`); if (c) answers[x.id] = parseInt(c.value, 10); });
        if (Object.keys(answers).length < qz.questions.length && !confirm('Some questions are unanswered. Submit anyway?')) return;
        try { showResult(await api(`/api/quizzes/${qz.id}/attempt`, 'POST', { answers })); } catch (x) { err.textContent = x.message; }
      } }, 'Submit answers');
      body.append(form, submit, err);
    };
    const showResult = (r) => {
      body.replaceChildren(el('div', { class: 'ok', style: 'word-break:normal' },
        el('b', {}, `${r.score} of ${r.total} (${r.percent}%)`), r.passed ? ' · Passed' : ` · Not passed yet. You need ${r.passMark}%.`,
        r.saved ? '' : ' · Preview only, not saved.'));
      qz.questions.forEach((x, i) => {
        const res = r.results.find((y) => y.id === x.id);
        body.append(el('div', { style: 'margin:12px 0' },
          el('b', {}, `${i + 1}. ${x.prompt}`),
          el('div', {}, res.correct ? '✔ Correct' : `✘ Not quite. Right answer: ${x.options[res.correctIndex]}`),
          res.explanation ? el('div', { class: 'muted' }, res.explanation) : ''));
      });
      body.append(el('button', { type: 'button', onclick: start }, 'Try again'));
    };
    card.append(body, el('button', { type: 'button', style: 'margin-top:8px', onclick: start }, staffUser ? 'Try the quiz (not saved)' : (d.attempts ? 'Retake the quiz' : 'Take the quiz')));
    return card;
  }

  async function assignmentBox(it) {
    const box = el('div', { style: 'margin-top:14px;padding-top:12px;border-top:1px solid var(--line)' });
    async function draw() {
      const { submission: s } = await api(`/api/items/${it.id}/submission`);
      box.replaceChildren(el('b', {}, 'Your submission'));
      if (s && s.released) {
        box.append(el('div', { class: 'ok', style: 'word-break:normal' }, el('b', {}, `Graded: ${s.score} out of 100`)));
        if (s.feedback) box.append(el('p', {}, el('b', {}, 'Feedback')), rich(s.feedback));
        if (s.body) box.append(el('p', { class: 'muted' }, 'What you submitted:'), el('div', { style: 'white-space:pre-wrap' }, s.body));
        if (s.hasFile) box.append(el('p', {}, el('a', { class: 'plain', href: `/api/submissions/${s.id}/file` }, `Your file: ${s.fileName}`)));
        return;
      }
      const msg = el('div', { class: 'err' });
      const ta = el('textarea', { placeholder: 'Type or paste your answer here' }); ta.value = s ? s.body : '';
      const fin = el('input', { type: 'file' });
      box.append(el('p', { class: 'muted' }, s ? `Last saved ${fmtDate(s.submittedAt)}. You can change it until it is graded.` : 'Not submitted yet.'), ta,
        el('div', { class: 'actions' }, el('button', { type: 'button', onclick: async () => {
          msg.textContent = '';
          try { await api(`/api/items/${it.id}/submission`, 'PUT', { body: ta.value }); await draw(); } catch (x) { msg.textContent = x.message; }
        } }, 'Submit text')),
        el('div', { style: 'margin-top:10px' }, el('span', { class: 'muted' }, 'Or attach a document (up to 25 MB): '), fin, ' ', el('button', { type: 'button', class: 'small', onclick: async () => {
          msg.textContent = '';
          const f = fin.files[0];
          if (!f) { msg.textContent = 'Choose a file first.'; return; }
          try {
            const r = await fetch(`/api/items/${it.id}/submission/file`, { method: 'POST', credentials: 'same-origin',
              headers: { 'Content-Type': 'application/octet-stream', 'x-filename': encodeURIComponent(f.name) }, body: f });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j.error || 'Upload failed.');
            await draw();
          } catch (x) { msg.textContent = x.message; }
        } }, 'Upload file')),
        s && s.hasFile ? el('p', {}, `Attached: ${s.fileName}`) : '', msg);
    }
    await draw();
    return box;
  }

  async function quizEditor(n) {
    const d = await api(`/api/course/${n}/quiz`);
    const state = d.quiz
      ? { title: d.quiz.title, passMark: d.quiz.passMark, questions: d.quiz.questions.map((x) => ({ prompt: x.prompt, options: x.options.slice(), correct: x.correct, explanation: x.explanation })) }
      : { title: `Week ${n} quiz`, passMark: 70, questions: [] };
    const card = el('div', { class: 'card' });
    const refs = [];
    function draw() {
      refs.length = 0;
      card.replaceChildren(el('h2', {}, 'Quiz for this week'), el('p', { class: 'muted' }, 'Multiple choice. Students see the right answers and your explanation after they submit.'));
      const title = el('input', { value: state.title, maxlength: '150' });
      const pass = el('input', { type: 'number', min: '1', max: '100', value: String(state.passMark) });
      card.append(el('div', { class: 'row' }, el('div', {}, el('label', {}, 'Quiz title'), title), el('div', {}, el('label', {}, 'Pass mark (%)'), pass)));
      state.questions.forEach((x, i) => {
        const prompt = el('textarea', { style: 'min-height:60px' }); prompt.value = x.prompt;
        const opts = [], radios = [];
        const box = el('div', { class: 'item' }, el('b', {}, `Question ${i + 1}`), prompt);
        for (let k = 0; k < 4; k++) {
          const o = el('input', { value: x.options[k] || '', placeholder: `Answer ${String.fromCharCode(65 + k)}` });
          const r = el('input', { type: 'radio', name: `c${i}` }); r.checked = x.correct === k;
          opts.push(o); radios.push(r);
          box.append(el('label', { class: 'check', style: 'font-weight:400' }, r, 'Correct', o));
        }
        const why = el('input', { value: x.explanation || '', placeholder: 'Why this is the right answer (shown after submitting)' });
        box.append(el('div', { style: 'margin-top:8px' }, why), el('div', { class: 'actions' }, el('button', { type: 'button', class: 'small', onclick: () => { readAll(); state.questions.splice(i, 1); draw(); } }, 'Remove question')));
        card.append(box);
        refs.push({ prompt, opts, radios, why });
      });
      const msg = el('div', { class: 'err' });
      card.append(el('div', { class: 'actions' },
        el('button', { type: 'button', class: 'small', onclick: () => { readAll(); state.questions.push({ prompt: '', options: ['', '', '', ''], correct: 0, explanation: '' }); draw(); } }, 'Add a question'),
        el('button', { type: 'button', onclick: async () => {
          msg.textContent = '';
          readAll();
          try {
            const questions = state.questions.map((x, i) => {
              const options = [], map = [];
              x.options.forEach((t, k) => { if (t.trim()) { map[k] = options.length; options.push(t.trim()); } });
              if (map[x.correct] === undefined) throw new Error(`Question ${i + 1}: the marked answer is empty.`);
              return { prompt: x.prompt, options, correct: map[x.correct], explanation: x.explanation };
            });
            await api(`/api/course/${n}/quiz`, 'PUT', { title: state.title, passMark: parseInt(state.passMark, 10), questions });
            msg.textContent = 'Quiz saved.';
          } catch (e) { msg.textContent = e.message; }
        } }, 'Save quiz'),
        d.quiz ? el('button', { type: 'button', class: 'small', onclick: async () => { if (confirm('Delete this quiz and all student attempts?')) { await api(`/api/course/${n}/quiz`, 'DELETE'); editView(n); } } }, 'Delete quiz') : ''), msg);
      card._title = title; card._pass = pass;
    }
    function readAll() {
      if (card._title) { state.title = card._title.value; state.passMark = card._pass.value; }
      refs.forEach((r, i) => {
        const x = state.questions[i]; if (!x) return;
        x.prompt = r.prompt.value; x.options = r.opts.map((o) => o.value); x.explanation = r.why.value;
        const k = r.radios.findIndex((c) => c.checked); if (k >= 0) x.correct = k;
      });
    }
    draw();
    return card;
  }

  async function gradingView() {
    const [{ submissions }, { results }] = await Promise.all([api('/api/submissions'), api('/api/quiz-results')]);
    const status = (s) => (s.released ? `Released: ${s.score}/100` : (s.score !== null ? `Draft: ${s.score}/100` : 'Needs grading'));
    const nodes = [el('div', { class: 'crumb' }, el('a', { class: 'plain', href: '#/' }, '← Back'))];
    nodes.push(el('div', { class: 'card' }, el('h1', {}, 'Assignments to grade'),
      submissions.length ? el('table', {}, el('thead', {}, el('tr', {}, ['Student', 'Week', 'Assignment', 'Submitted', 'Status', ''].map((h) => el('th', {}, h)))),
        el('tbody', {}, submissions.map((s) => el('tr', {}, el('td', {}, `${s.first_name} ${s.last_name}`), el('td', {}, `Week ${s.week}`), el('td', {}, s.item),
          el('td', {}, fmtDate(s.submitted_at)), el('td', {}, status(s)), el('td', {}, el('a', { class: 'plain', href: `#/grade/${s.id}` }, 'Open'))))))
        : el('p', { class: 'muted' }, 'Nothing has been submitted yet.')));
    nodes.push(el('div', { class: 'card' }, el('h2', {}, 'Quiz results'),
      results.length ? el('table', {}, el('thead', {}, el('tr', {}, ['Student', 'Week', 'Best score', 'Attempts', 'Passed'].map((h) => el('th', {}, h)))),
        el('tbody', {}, results.map((r) => el('tr', {}, el('td', {}, `${r.first_name} ${r.last_name}`), el('td', {}, `Week ${r.week}`), el('td', {}, `${r.best}%`), el('td', {}, String(r.attempts)), el('td', {}, r.passed ? 'Yes' : 'Not yet')))))
        : el('p', { class: 'muted' }, 'No quiz attempts yet.')));
    show(...nodes);
  }

  async function gradeView(id) {
    let s;
    try { s = (await api('/api/submissions/' + id)).submission; } catch (x) { show(el('div', { class: 'card' }, el('p', {}, x.message))); return; }
    const msg = el('div', { class: 'err' });
    const score = el('input', { type: 'number', min: '0', max: '100', value: s.score === null ? '' : String(s.score) });
    const fb = el('textarea'); fb.value = s.feedback || '';
    const save = (release) => async () => {
      msg.textContent = '';
      try { await api('/api/submissions/' + id, 'PUT', { score: score.value, feedback: fb.value, release }); msg.textContent = release ? 'Released to the student.' : 'Draft saved. The student cannot see it yet.'; }
      catch (x) { msg.textContent = x.message; }
    };
    show(el('div', { class: 'crumb' }, el('a', { class: 'plain', href: '#/grading' }, '← All submissions')),
      el('div', { class: 'card' }, el('h1', {}, s.item), el('p', { class: 'muted' }, `${s.student} (${s.email}) · Week ${s.week} · submitted ${fmtDate(s.submittedAt)}`),
        el('h2', {}, 'Their answer'), s.body ? el('div', { style: 'white-space:pre-wrap;border:1px solid var(--line);border-radius:6px;padding:12px;background:#fff' }, s.body) : el('p', { class: 'muted' }, 'No typed text.'),
        s.hasFile ? el('p', {}, el('a', { class: 'btn', href: `/api/submissions/${s.id}/file` }, `Download ${s.fileName}`)) : ''),
      el('div', { class: 'card' }, el('h2', {}, 'Grade'), el('label', {}, 'Score (0 to 100)'), score, el('label', {}, 'Feedback for the student'), fb,
        el('div', { class: 'actions' }, el('button', { type: 'button', class: 'small', onclick: save(false) }, 'Save draft'), el('button', { type: 'button', class: 'gold', onclick: save(true) }, 'Release to student')), msg));
  }

  async function route() {
    renderHeader();
    const m = location.hash.match(/^#\/link\/([a-f0-9]+)$/);
    if (m) return linkView(m[1]);
    if (!me) return loginView();
    const w = location.hash.match(/^#\/week\/(\d)$/);
    if (w) return weekView(parseInt(w[1], 10));
    if (me.role !== 'student' && location.hash === '#/grading') return gradingView();
    const g = location.hash.match(/^#\/grade\/(\d+)$/);
    if (g && me.role !== 'student') return gradeView(parseInt(g[1], 10));
    const e = location.hash.match(/^#\/edit\/(\d)$/);
    if (e && me.role !== 'student') return editView(parseInt(e[1], 10));
    try { await homeView(); } catch (x) { show(el('div', { class: 'card' }, el('p', { class: 'err' }, x.message))); }
  }
  async function boot() {
    try { me = (await api('/api/me')).user; } catch (e) { me = null; }
    route();
  }
  window.addEventListener('hashchange', route);
  boot();
})();
