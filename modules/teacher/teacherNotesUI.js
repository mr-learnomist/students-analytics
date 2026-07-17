// ============================================================
// modules/teacher/teacherNotesUI.js — Teacher Portal Notes
// Three sections: Sticky Notes, Tasks (with a timeline view),
// and per-Student Notes. Personal to each teacher — every write
// goes straight through TeacherNotesService (instant save, same
// pattern as the rest of the Teacher Portal's simple toggles).
// ============================================================

import { AppState } from '../../utils/state.js';
import { Toast }    from '../../utils/helpers.js';
import { formatDisplayDate, toISODate } from '../attendance/attendanceService.js';
import {
  TeacherNotesService,
  fetchAndSyncTeacherNotes,
} from '../../utils/teacherNotesStorage.js';

let _stylesInjected = false;
function _injectStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const style = document.createElement('style');
  style.id = 'tn-styles';
  style.textContent = `
    .tn-wrap { display:flex; flex-direction:column; gap:16px; }
    .tn-tabs { display:flex; gap:8px; flex-wrap:wrap; }
    .tn-tab {
      height:34px; padding:0 16px; border-radius:9px; font-size:13px; font-weight:700;
      cursor:pointer; font-family:inherit; border:1.5px solid var(--border2);
      background:var(--surface2); color:var(--t3); transition:all .12s;
    }
    .tn-tab:hover { color:var(--t1); }
    .tn-tab.active { border-color:var(--blue); color:var(--blue); background:color-mix(in srgb, var(--blue) 12%, transparent); }

    .tn-toolbar { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
    .tn-btn {
      height:34px; padding:0 14px; border-radius:9px; font-size:12.5px; font-weight:700;
      cursor:pointer; font-family:inherit; border:none; background:var(--blue); color:#fff;
      display:inline-flex; align-items:center; gap:6px;
    }
    .tn-btn:hover { opacity:.92; }
    .tn-btn.ghost { background:var(--surface2); color:var(--t2); border:1.5px solid var(--border2); }
    .tn-icon-btn {
      width:26px; height:26px; border-radius:7px; border:none; background:transparent;
      color:var(--t3); cursor:pointer; display:inline-flex; align-items:center; justify-content:center;
    }
    .tn-icon-btn:hover { background:var(--surface2); color:var(--t1); }

    .tn-empty { text-align:center; padding:36px 20px; color:var(--t3); font-size:13px; border:1px dashed var(--border2); border-radius:12px; }

    /* ── Sticky notes ── */
    .tn-sticky-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:14px; }
    .tn-sticky-card {
      border-radius:12px; padding:14px; min-height:140px; display:flex; flex-direction:column;
      box-shadow:0 1px 3px rgba(0,0,0,.08); position:relative; color:#2b2b2b;
    }
    .tn-sticky-top { display:flex; align-items:flex-start; justify-content:space-between; gap:6px; margin-bottom:6px; }
    .tn-sticky-title { font-weight:800; font-size:13.5px; word-break:break-word; }
    .tn-sticky-actions { display:flex; gap:2px; flex-shrink:0; }
    .tn-sticky-actions .tn-icon-btn { color:rgba(0,0,0,.45); }
    .tn-sticky-actions .tn-icon-btn:hover { background:rgba(0,0,0,.08); color:#2b2b2b; }
    .tn-sticky-body { font-size:12.5px; line-height:1.5; white-space:pre-wrap; word-break:break-word; flex:1; }
    .tn-sticky-date { font-size:10.5px; color:rgba(0,0,0,.45); margin-top:10px; }
    .tn-color-picker { display:flex; gap:6px; margin-top:8px; }
    .tn-color-dot { width:18px; height:18px; border-radius:50%; cursor:pointer; border:2px solid transparent; }
    .tn-color-dot.selected { border-color:#2b2b2b; }

    .tn-editor { display:flex; flex-direction:column; gap:8px; }
    .tn-editor input, .tn-editor textarea {
      width:100%; border:1px solid rgba(0,0,0,.15); border-radius:7px; padding:7px 9px;
      font-family:inherit; font-size:12.5px; background:rgba(255,255,255,.55); color:#2b2b2b; resize:vertical;
    }
    .tn-editor input:focus, .tn-editor textarea:focus { outline:none; border-color:rgba(0,0,0,.35); }
    .tn-editor-actions { display:flex; gap:8px; justify-content:flex-end; }
    .tn-editor-actions button {
      height:26px; padding:0 10px; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; border:none;
    }
    .tn-editor-save { background:#2b2b2b; color:#fff; }
    .tn-editor-cancel { background:rgba(0,0,0,.08); color:#2b2b2b; }

    /* ── Tasks ── */
    .tn-task-form { display:flex; gap:8px; flex-wrap:wrap; align-items:center; background:var(--surface2); border:1px solid var(--border2); border-radius:12px; padding:12px; }
    .tn-task-form input[type="text"] { flex:1; min-width:160px; }
    .tn-task-form input, .tn-task-form select {
      height:32px; padding:0 10px; border-radius:8px; border:1px solid var(--border2);
      background:var(--surface); color:var(--t1); font-size:12.5px; font-family:inherit;
    }
    .tn-task-group-label { font-size:11.5px; font-weight:800; letter-spacing:.03em; color:var(--t3); text-transform:uppercase; margin:4px 2px; }
    .tn-task-list { display:flex; flex-direction:column; gap:8px; }
    .tn-task-row {
      display:flex; align-items:flex-start; gap:10px; padding:10px 12px; border:1px solid var(--border2);
      border-radius:10px; background:var(--surface);
    }
    .tn-task-row.done { opacity:.6; }
    .tn-task-check {
      width:20px; height:20px; border-radius:6px; border:1.5px solid var(--border2); background:var(--surface2);
      cursor:pointer; flex-shrink:0; margin-top:1px; display:flex; align-items:center; justify-content:center; color:#fff;
    }
    .tn-task-check.checked { background:var(--green); border-color:var(--green); }
    .tn-task-body { flex:1; min-width:0; }
    .tn-task-title { font-size:13px; font-weight:600; color:var(--t1); }
    .tn-task-title.strike { text-decoration:line-through; }
    .tn-task-meta { display:flex; gap:10px; margin-top:4px; font-size:11px; }
    .tn-task-priority { font-weight:700; }
    .tn-task-due { color:var(--t3); }
    .tn-task-due.overdue { color:var(--red); font-weight:700; }

    .tn-timeline { display:flex; flex-direction:column; gap:14px; margin-top:6px; }
    .tn-timeline-date { font-size:11.5px; font-weight:800; color:var(--t3); }
    .tn-timeline-item { display:flex; gap:10px; align-items:flex-start; padding-left:2px; }
    .tn-timeline-dot { width:8px; height:8px; border-radius:50%; margin-top:5px; flex-shrink:0; }
    .tn-timeline-dot.created   { background:var(--t3); }
    .tn-timeline-dot.completed { background:var(--green); }
    .tn-timeline-text { font-size:12.5px; color:var(--t2); }
    .tn-timeline-text b { color:var(--t1); }
    .tn-timeline-time { font-size:10.5px; color:var(--t4); margin-left:6px; }

    /* ── Student notes ── */
    .tn-student-layout { display:grid; grid-template-columns:260px 1fr; gap:16px; align-items:start; }
    @media (max-width:720px) { .tn-student-layout { grid-template-columns:1fr; } }
    .tn-student-search {
      width:100%; height:34px; padding:0 12px; border-radius:9px; border:1px solid var(--border2);
      background:var(--surface); color:var(--t1); font-size:12.5px; margin-bottom:8px;
    }
    .tn-student-list { display:flex; flex-direction:column; gap:4px; max-height:520px; overflow-y:auto; }
    .tn-student-item {
      display:flex; flex-direction:column; padding:8px 10px; border-radius:8px; cursor:pointer; border:1px solid transparent;
    }
    .tn-student-item:hover { background:var(--surface2); }
    .tn-student-item.active { background:color-mix(in srgb, var(--blue) 12%, transparent); border-color:color-mix(in srgb, var(--blue) 35%, transparent); }
    .tn-student-item .name { font-size:12.5px; font-weight:700; color:var(--t1); }
    .tn-student-item .batch { font-size:11px; color:var(--t3); }
    .tn-student-item .count { font-size:10.5px; color:var(--blue); font-weight:700; margin-top:2px; }

    .tn-student-panel { border:1px solid var(--border2); border-radius:12px; padding:16px; background:var(--surface); min-height:200px; }
    .tn-student-panel-hdr { font-size:15px; font-weight:800; color:var(--t1); }
    .tn-student-panel-sub { font-size:12px; color:var(--t3); margin-top:2px; margin-bottom:14px; }
    .tn-note-form { display:flex; flex-direction:column; gap:8px; margin-bottom:16px; }
    .tn-note-form textarea {
      width:100%; min-height:70px; padding:9px 11px; border-radius:9px; border:1px solid var(--border2);
      background:var(--surface2); color:var(--t1); font-size:12.5px; font-family:inherit; resize:vertical;
    }
    .tn-note-form textarea:focus { outline:none; border-color:var(--blue); }
    .tn-note-item { border:1px solid var(--border2); border-radius:10px; padding:10px 12px; margin-bottom:8px; }
    .tn-note-item-hdr { display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; }
    .tn-note-item-date { font-size:10.5px; color:var(--t4); }
    .tn-note-item-body { font-size:12.5px; color:var(--t2); white-space:pre-wrap; word-break:break-word; }
  `;
  document.head.appendChild(style);
}

const STICKY_COLORS = {
  yellow: '#fff3b0',
  blue:   '#cfe4ff',
  green:  '#d3f2d8',
  pink:   '#ffd6ea',
  purple: '#e4d9ff',
};

const PRIORITY_CFG = {
  high:   { label: 'High',   color: 'var(--red)' },
  medium: { label: 'Medium', color: '#d97706' },
  low:    { label: 'Low',    color: 'var(--t3)' },
};

const ICON = {
  edit:   `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
  trash:  `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
  check:  `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`,
  plus:   `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
};

function _esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _escAttr(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function _dateHeader(isoDateStr) {
  const today = toISODate(new Date());
  const yest  = toISODate(new Date(Date.now() - 86400000));
  if (isoDateStr === today) return 'Today';
  if (isoDateStr === yest)  return 'Yesterday';
  return formatDisplayDate(isoDateStr);
}

export const TeacherNotesModule = {

  // ctx = { teacher, students: [{ id, studentName, batchId, batchName }] }
  async mount(el, ctx) {
    if (!el) return;
    _injectStyles();
    this._el  = el;
    this._ctx = ctx;
    this._tab = 'sticky';
    this._selectedStudentId = null;
    this._studentSearch = '';

    el.innerHTML = `<div class="tn-empty">Loading your notes…</div>`;
    await fetchAndSyncTeacherNotes(ctx.teacher.id);

    this._renderShell();
  },

  _renderShell() {
    const el = this._el;
    el.innerHTML = `
      <div class="tn-wrap">
        <div class="tn-tabs" id="tnTabs">
          <button class="tn-tab" data-tab="sticky">Sticky Notes</button>
          <button class="tn-tab" data-tab="task">Tasks</button>
          <button class="tn-tab" data-tab="student">Student Notes</button>
        </div>
        <div id="tnTabContent"></div>
      </div>`;

    el.querySelectorAll('.tn-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tab === this._tab) return;
        this._tab = btn.dataset.tab;
        this._renderTabs();
        this._renderContent();
      });
    });

    this._renderTabs();
    this._renderContent();
  },

  _renderTabs() {
    this._el.querySelectorAll('.tn-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === this._tab);
    });
  },

  _renderContent() {
    const host = this._el.querySelector('#tnTabContent');
    if (this._tab === 'sticky')  return this._renderSticky(host);
    if (this._tab === 'task')    return this._renderTasks(host);
    if (this._tab === 'student') return this._renderStudentNotes(host);
  },

  // ══════════════════════════════════════════════════════════
  // STICKY NOTES
  // ══════════════════════════════════════════════════════════
  _renderSticky(host) {
    const teacherId = this._ctx.teacher.id;
    const notes = TeacherNotesService.getByKind(teacherId, 'sticky')
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    const cardHTML = (note, editing) => {
      const bg = STICKY_COLORS[note.color] || STICKY_COLORS.yellow;
      if (editing) {
        return `
          <div class="tn-sticky-card" style="background:${bg}" data-id="${note.id}">
            <div class="tn-editor">
              <input type="text" class="tn-sticky-title-input" placeholder="Title" value="${_escAttr(note.title)}" />
              <textarea class="tn-sticky-body-input" rows="4" placeholder="Write a note…">${_esc(note.body)}</textarea>
              <div class="tn-color-picker">
                ${Object.entries(STICKY_COLORS).map(([key, hex]) => `
                  <span class="tn-color-dot ${note.color === key ? 'selected' : ''}" data-color="${key}" style="background:${hex}"></span>
                `).join('')}
              </div>
              <div class="tn-editor-actions">
                <button class="tn-editor-cancel" data-cancel="${note.id}">Cancel</button>
                <button class="tn-editor-save" data-save="${note.id}">Save</button>
              </div>
            </div>
          </div>`;
      }
      return `
        <div class="tn-sticky-card" style="background:${bg}" data-id="${note.id}">
          <div class="tn-sticky-top">
            <div class="tn-sticky-title">${_esc(note.title) || 'Untitled'}</div>
            <div class="tn-sticky-actions">
              <button class="tn-icon-btn" data-edit="${note.id}" title="Edit">${ICON.edit}</button>
              <button class="tn-icon-btn" data-delete="${note.id}" title="Delete">${ICON.trash}</button>
            </div>
          </div>
          <div class="tn-sticky-body">${_esc(note.body)}</div>
          <div class="tn-sticky-date">${formatDisplayDate(toISODate(new Date(note.updatedAt)))}</div>
        </div>`;
    };

    host.innerHTML = `
      <div class="tn-toolbar">
        <span style="font-size:12px;color:var(--t3)">${notes.length} note${notes.length === 1 ? '' : 's'}</span>
        <button class="tn-btn" id="tnNewSticky">${ICON.plus} New Note</button>
      </div>
      ${notes.length
        ? `<div class="tn-sticky-grid" id="tnStickyGrid">${notes.map(n => cardHTML(n, false)).join('')}</div>`
        : `<div class="tn-empty">No sticky notes yet. Click "New Note" to add one.</div>`}
    `;

    const _wireCard = (note, editing) => {
      const card = host.querySelector(`.tn-sticky-card[data-id="${note.id}"]`);
      if (!card) return;

      if (!editing) {
        card.querySelector(`[data-edit="${note.id}"]`)?.addEventListener('click', () => {
          card.outerHTML = cardHTML(note, true);
          _wireCard(note, true);
        });
        card.querySelector(`[data-delete="${note.id}"]`)?.addEventListener('click', () => {
          TeacherNotesService.remove(note.id, teacherId);
          card.remove();
          Toast.success('Note deleted.');
          if (!host.querySelector('.tn-sticky-card')) this._renderSticky(host);
        });
        return;
      }

      let selectedColor = note.color || 'yellow';
      card.querySelectorAll('.tn-color-dot').forEach(dot => {
        dot.addEventListener('click', () => {
          selectedColor = dot.dataset.color;
          card.style.background = STICKY_COLORS[selectedColor];
          card.querySelectorAll('.tn-color-dot').forEach(d => d.classList.toggle('selected', d === dot));
        });
      });
      card.querySelector(`[data-cancel="${note.id}"]`)?.addEventListener('click', () => {
        card.outerHTML = cardHTML(note, false);
        _wireCard(note, false);
      });
      card.querySelector(`[data-save="${note.id}"]`)?.addEventListener('click', () => {
        const title = card.querySelector('.tn-sticky-title-input').value.trim();
        const body  = card.querySelector('.tn-sticky-body-input').value.trim();
        const updated = TeacherNotesService.update(note.id, { title, body, color: selectedColor });
        card.outerHTML = cardHTML(updated, false);
        _wireCard(updated, false);
        Toast.success('Note saved.');
      });
    };

    notes.forEach(n => _wireCard(n, false));

    host.querySelector('#tnNewSticky')?.addEventListener('click', () => {
      const draft = { id: '__draft__', teacherId, kind: 'sticky', title: '', body: '', color: 'yellow', updatedAt: new Date().toISOString() };
      const grid = host.querySelector('#tnStickyGrid') || (() => {
        host.querySelector('.tn-empty')?.remove();
        const g = document.createElement('div');
        g.className = 'tn-sticky-grid';
        g.id = 'tnStickyGrid';
        host.appendChild(g);
        return g;
      })();
      const wrapper = document.createElement('div');
      wrapper.innerHTML = cardHTML(draft, true);
      const card = wrapper.firstElementChild;
      grid.prepend(card);

      let selectedColor = 'yellow';
      card.querySelectorAll('.tn-color-dot').forEach(dot => {
        dot.addEventListener('click', () => {
          selectedColor = dot.dataset.color;
          card.style.background = STICKY_COLORS[selectedColor];
          card.querySelectorAll('.tn-color-dot').forEach(d => d.classList.toggle('selected', d === dot));
        });
      });
      card.querySelector('[data-cancel="__draft__"]')?.addEventListener('click', () => card.remove());
      card.querySelector('[data-save="__draft__"]')?.addEventListener('click', () => {
        const title = card.querySelector('.tn-sticky-title-input').value.trim();
        const body  = card.querySelector('.tn-sticky-body-input').value.trim();
        if (!title && !body) { card.remove(); return; }
        TeacherNotesService.create({ teacherId, kind: 'sticky', title, body, color: selectedColor });
        Toast.success('Note added.');
        this._renderSticky(host);
      });
    });
  },

  // ══════════════════════════════════════════════════════════
  // TASKS (+ timeline)
  // ══════════════════════════════════════════════════════════
  _renderTasks(host) {
    const teacherId = this._ctx.teacher.id;
    const tasks = TeacherNotesService.getByKind(teacherId, 'task');
    const today = toISODate(new Date());

    const pending = tasks.filter(t => t.status !== 'done')
      .sort((a, b) => (a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : 1);
    const done = tasks.filter(t => t.status === 'done')
      .sort((a, b) => new Date(b.completedAt || b.updatedAt) - new Date(a.completedAt || a.updatedAt));

    const taskRowHTML = (task) => {
      const pr = PRIORITY_CFG[task.priority] || PRIORITY_CFG.medium;
      const isDone = task.status === 'done';
      const overdue = !isDone && task.dueDate && task.dueDate < today;
      return `
        <div class="tn-task-row ${isDone ? 'done' : ''}" data-id="${task.id}">
          <button class="tn-task-check ${isDone ? 'checked' : ''}" data-toggle="${task.id}" title="${isDone ? 'Mark pending' : 'Mark done'}">
            ${isDone ? ICON.check : ''}
          </button>
          <div class="tn-task-body">
            <div class="tn-task-title ${isDone ? 'strike' : ''}">${_esc(task.title)}</div>
            <div class="tn-task-meta">
              <span class="tn-task-priority" style="color:${pr.color}">${pr.label}</span>
              ${task.dueDate ? `<span class="tn-task-due ${overdue ? 'overdue' : ''}">${overdue ? 'Overdue · ' : 'Due '}${formatDisplayDate(task.dueDate)}</span>` : ''}
            </div>
          </div>
          <button class="tn-icon-btn" data-delete="${task.id}" title="Delete">${ICON.trash}</button>
        </div>`;
    };

    // Timeline — created + completed events, newest first, grouped by date.
    const events = [];
    tasks.forEach(t => {
      events.push({ ts: t.createdAt, type: 'created', task: t });
      if (t.status === 'done' && t.completedAt) events.push({ ts: t.completedAt, type: 'completed', task: t });
    });
    events.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    const grouped = {};
    events.forEach(e => {
      const d = toISODate(new Date(e.ts));
      (grouped[d] = grouped[d] || []).push(e);
    });

    const timelineHTML = events.length ? `
      <div class="tn-task-group-label" style="margin-top:20px">Timeline</div>
      <div class="tn-timeline">
        ${Object.keys(grouped).map(d => `
          <div>
            <div class="tn-timeline-date">${_dateHeader(d)}</div>
            ${grouped[d].map(e => `
              <div class="tn-timeline-item">
                <span class="tn-timeline-dot ${e.type}"></span>
                <span class="tn-timeline-text">
                  ${e.type === 'created'
                    ? `Task added: <b>${_esc(e.task.title)}</b>`
                    : `Task completed: <b>${_esc(e.task.title)}</b>`}
                  <span class="tn-timeline-time">${new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </span>
              </div>`).join('')}
          </div>`).join('')}
      </div>` : '';

    host.innerHTML = `
      <div class="tn-task-form">
        <input type="text" id="tnTaskTitle" placeholder="Add an important task…" />
        <input type="date" id="tnTaskDue" />
        <select id="tnTaskPriority">
          <option value="medium">Medium priority</option>
          <option value="high">High priority</option>
          <option value="low">Low priority</option>
        </select>
        <button class="tn-btn" id="tnTaskAdd">${ICON.plus} Add Task</button>
      </div>

      ${tasks.length ? '' : '<div class="tn-empty" style="margin-top:14px">No tasks yet — add your first one above.</div>'}

      ${pending.length ? `
        <div class="tn-task-group-label" style="margin-top:16px">Pending (${pending.length})</div>
        <div class="tn-task-list">${pending.map(taskRowHTML).join('')}</div>
      ` : ''}

      ${done.length ? `
        <div class="tn-task-group-label" style="margin-top:16px">Done (${done.length})</div>
        <div class="tn-task-list">${done.map(taskRowHTML).join('')}</div>
      ` : ''}

      ${timelineHTML}
    `;

    host.querySelector('#tnTaskAdd')?.addEventListener('click', () => {
      const titleEl = host.querySelector('#tnTaskTitle');
      const dueEl   = host.querySelector('#tnTaskDue');
      const prEl    = host.querySelector('#tnTaskPriority');
      const title = titleEl.value.trim();
      if (!title) { titleEl.focus(); return; }
      TeacherNotesService.create({
        teacherId, kind: 'task', title,
        dueDate: dueEl.value || null,
        priority: prEl.value,
        status: 'pending',
        completedAt: null,
      });
      Toast.success('Task added.');
      this._renderTasks(host);
    });
    host.querySelector('#tnTaskTitle')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') host.querySelector('#tnTaskAdd')?.click();
    });

    host.querySelectorAll('[data-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const task = tasks.find(t => t.id === btn.dataset.toggle);
        if (!task) return;
        const willBeDone = task.status !== 'done';
        TeacherNotesService.update(task.id, {
          status: willBeDone ? 'done' : 'pending',
          completedAt: willBeDone ? new Date().toISOString() : null,
        });
        this._renderTasks(host);
      });
    });
    host.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => {
        TeacherNotesService.remove(btn.dataset.delete, teacherId);
        Toast.success('Task deleted.');
        this._renderTasks(host);
      });
    });
  },

  // ══════════════════════════════════════════════════════════
  // STUDENT NOTES
  // ══════════════════════════════════════════════════════════
  _renderStudentNotes(host) {
    const teacherId = this._ctx.teacher.id;
    const students  = this._ctx.students || [];

    const noteCountFor = (studentId) => TeacherNotesService.getForStudent(teacherId, studentId).length;

    const listHTML = () => {
      const q = this._studentSearch.trim().toLowerCase();
      const filtered = !q ? students : students.filter(s => (s.studentName || '').toLowerCase().includes(q));
      if (!filtered.length) return `<div class="tn-empty">No students match your search.</div>`;
      return filtered.map(s => `
        <div class="tn-student-item ${s.id === this._selectedStudentId ? 'active' : ''}" data-sid="${s.id}">
          <span class="name">${_esc(s.studentName)}</span>
          <span class="batch">${_esc(s.batchName)}</span>
          ${noteCountFor(s.id) ? `<span class="count">${noteCountFor(s.id)} note${noteCountFor(s.id) === 1 ? '' : 's'}</span>` : ''}
        </div>`).join('');
    };

    const panelHTML = () => {
      if (!this._selectedStudentId) {
        return `<div class="tn-empty">Select a student on the left to view or add notes about them.</div>`;
      }
      const student = students.find(s => s.id === this._selectedStudentId);
      if (!student) return `<div class="tn-empty">Student not found.</div>`;

      const notes = TeacherNotesService.getForStudent(teacherId, student.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return `
        <div class="tn-student-panel-hdr">${_esc(student.studentName)}</div>
        <div class="tn-student-panel-sub">${_esc(student.batchName)}</div>
        <div class="tn-note-form">
          <textarea id="tnStudentNoteBody" placeholder="Write a note about ${_esc(student.studentName)}…"></textarea>
          <div style="display:flex;justify-content:flex-end">
            <button class="tn-btn" id="tnStudentNoteAdd">${ICON.plus} Add Note</button>
          </div>
        </div>
        <div id="tnStudentNoteList">
          ${notes.length ? notes.map(n => `
            <div class="tn-note-item" data-id="${n.id}">
              <div class="tn-note-item-hdr">
                <span class="tn-note-item-date">${new Date(n.createdAt).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                <button class="tn-icon-btn" data-delete-note="${n.id}" title="Delete">${ICON.trash}</button>
              </div>
              <div class="tn-note-item-body">${_esc(n.body)}</div>
            </div>`).join('')
            : `<div class="tn-empty" style="padding:20px">No notes about this student yet.</div>`}
        </div>`;
    };

    host.innerHTML = `
      <div class="tn-student-layout">
        <div>
          <input type="text" class="tn-student-search" id="tnStudentSearch" placeholder="Search students…" value="${_escAttr(this._studentSearch)}" />
          <div class="tn-student-list" id="tnStudentList">${listHTML()}</div>
        </div>
        <div class="tn-student-panel" id="tnStudentPanel">${panelHTML()}</div>
      </div>`;

    const _wireList = () => {
      host.querySelectorAll('.tn-student-item').forEach(item => {
        item.addEventListener('click', () => {
          this._selectedStudentId = item.dataset.sid;
          host.querySelector('#tnStudentList').innerHTML = listHTML();
          _wireList();
          host.querySelector('#tnStudentPanel').innerHTML = panelHTML();
          _wirePanel();
        });
      });
    };

    const _wirePanel = () => {
      host.querySelector('#tnStudentNoteAdd')?.addEventListener('click', () => {
        const ta = host.querySelector('#tnStudentNoteBody');
        const body = ta.value.trim();
        if (!body) { ta.focus(); return; }
        TeacherNotesService.create({
          teacherId, kind: 'student', studentId: this._selectedStudentId,
          batchId: (students.find(s => s.id === this._selectedStudentId) || {}).batchId || null,
          body,
        });
        Toast.success('Note added.');
        host.querySelector('#tnStudentPanel').innerHTML = panelHTML();
        _wirePanel();
        host.querySelector('#tnStudentList').innerHTML = listHTML();
        _wireList();
      });
      host.querySelectorAll('[data-delete-note]').forEach(btn => {
        btn.addEventListener('click', () => {
          TeacherNotesService.remove(btn.dataset.deleteNote, teacherId);
          Toast.success('Note deleted.');
          host.querySelector('#tnStudentPanel').innerHTML = panelHTML();
          _wirePanel();
          host.querySelector('#tnStudentList').innerHTML = listHTML();
          _wireList();
        });
      });
    };

    host.querySelector('#tnStudentSearch')?.addEventListener('input', (e) => {
      this._studentSearch = e.target.value;
      host.querySelector('#tnStudentList').innerHTML = listHTML();
      _wireList();
    });

    _wireList();
    _wirePanel();
  },
};
