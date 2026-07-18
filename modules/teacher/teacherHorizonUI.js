// ============================================================
// modules/teacher/teacherHorizonUI.js — Horizon View
// A teacher's at-a-glance dashboard: high priority tasks,
// students who need attention on attendance, and Lecture Plans
// that are nearing completion.
// ============================================================

import { AppState } from '../../utils/state.js';
import { Toast }    from '../../utils/helpers.js';
import {
  AttendanceService,
  fetchAndSyncBatchAttendance,
} from '../attendance/attendanceService.js';
import { TeacherNotesService, fetchAndSyncTeacherNotes } from '../../utils/teacherNotesStorage.js';

let _stylesInjected = false;
function _injectStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const style = document.createElement('style');
  style.id = 'hz-styles';
  style.textContent = `
    .hz-wrap { display:grid; grid-template-columns:1fr 340px; gap:18px; align-items:start; }
    @media (max-width:900px) { .hz-wrap { grid-template-columns:1fr; } }

    .hz-section { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:16px; margin-bottom:16px; }
    .hz-section-hdr { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
    .hz-section-title { font-size:14px; font-weight:800; color:var(--t1); display:flex; align-items:center; gap:8px; }
    .hz-count-badge {
      font-size:11px; font-weight:800; padding:2px 8px; border-radius:20px;
      background:var(--surface2); color:var(--t3);
    }
    .hz-empty { padding:20px; text-align:center; color:var(--t3); font-size:12.5px; }

    /* Tasks */
    .hz-task-row { display:flex; align-items:center; gap:10px; padding:10px 0; border-top:1px solid var(--border2); }
    .hz-task-row:first-child { border-top:none; }
    .hz-task-dot { width:8px; height:8px; border-radius:50%; background:var(--red); flex-shrink:0; }
    .hz-task-title { font-size:12.5px; font-weight:600; color:var(--t1); flex:1; }
    .hz-task-due { font-size:11px; color:var(--t3); white-space:nowrap; }
    .hz-task-due.overdue { color:var(--red); font-weight:700; }

    /* LP highlights */
    .hz-lp-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); gap:10px; }
    .hz-lp-card {
      border:1.5px solid color-mix(in srgb, var(--green) 40%, var(--border2)); border-radius:10px; padding:10px 12px;
      background:color-mix(in srgb, var(--green) 8%, transparent);
    }
    .hz-lp-name { font-size:12.5px; font-weight:700; color:var(--t1); }
    .hz-lp-sub { font-size:10.5px; color:var(--t3); margin-top:1px; }
    .hz-lp-bar-track { height:5px; border-radius:4px; background:var(--surface2); margin-top:8px; overflow:hidden; }
    .hz-lp-bar-fill { height:100%; background:var(--green); }
    .hz-lp-pct { font-size:11px; font-weight:800; color:var(--green); margin-top:4px; }

    /* Attendance watch (aside) */
    .hz-watch-group { margin-bottom:14px; }
    .hz-watch-group:last-child { margin-bottom:0; }
    .hz-watch-label {
      font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.03em;
      display:flex; align-items:center; gap:6px; margin-bottom:8px;
    }
    .hz-watch-dot { width:8px; height:8px; border-radius:50%; }
    .hz-watch-critical .hz-watch-dot { background:var(--red); }
    .hz-watch-critical .hz-watch-label { color:var(--red); }
    .hz-watch-risk .hz-watch-dot { background:#d97706; }
    .hz-watch-risk .hz-watch-label { color:#d97706; }
    .hz-watch-alert .hz-watch-dot { background:#ca8a04; }
    .hz-watch-alert .hz-watch-label { color:#ca8a04; }
    .hz-watch-item {
      display:flex; justify-content:space-between; align-items:center; gap:8px;
      padding:7px 9px; border-radius:8px; background:var(--surface2); margin-bottom:6px;
    }
    .hz-watch-item .name { font-size:12px; font-weight:600; color:var(--t1); }
    .hz-watch-item .batch { font-size:10px; color:var(--t3); }
    .hz-watch-item .pct { font-size:12px; font-weight:800; }
    .hz-watch-critical .pct { color:var(--red); }
    .hz-watch-risk .pct { color:#d97706; }
    .hz-watch-alert .pct { color:#ca8a04; }
  `;
  document.head.appendChild(style);
}

function _esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const ICON = {
  bolt:  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  book:  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  eye:   `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
};

export const TeacherHorizonModule = {

  async mount(el, ctx) {
    if (!el) return;
    _injectStyles();
    this._el = el;
    this._ctx = ctx; // { teacher }

    el.innerHTML = `<div class="hz-empty">Loading Horizon View…</div>`;

    const teacher = ctx.teacher;
    const allBatches = AppState.get('batches') || [];
    const myBatches  = allBatches.filter(b => b.teacherId === teacher.id);
    const activeBatches = myBatches.filter(b => this._isActive(b));

    // This page needs FULL attendance history (not just today) to
    // compute real percentages — a deliberate, heavier fetch that only
    // happens when a teacher actually opens Horizon View, not on every
    // login. Only active batches are pulled; closed batches are skipped.
    await Promise.allSettled([
      fetchAndSyncTeacherNotes(teacher.id),
      ...activeBatches.map(b => fetchAndSyncBatchAttendance(b.id)),
    ]);

    this._render(myBatches, activeBatches);
  },

  _isActive(batch) {
    const today  = new Date().toISOString().slice(0, 10);
    const lpaMap = AppState.get('lpAssignments') || {};
    let end = null;
    if (batch.endDateMode === 'lp' || !batch.endDateMode) {
      const dated = (lpaMap[batch.id]?.rows || []).filter(r => r.date);
      end = dated.length ? dated[dated.length - 1].date : null;
    } else {
      end = batch.endDate || null;
    }
    return !(end && end < today);
  },

  _render(myBatches, activeBatches) {
    const el = this._el;
    const teacher = this._ctx.teacher;

    // ── High priority tasks ──
    const tasks = TeacherNotesService.getByKind(teacher.id, 'task')
      .filter(t => t.priority === 'high' && t.status !== 'done')
      .sort((a, b) => (a.endDate || a.startDate || '9999').localeCompare(b.endDate || b.startDate || '9999'));

    // ── Attendance watch — across active batches only ──
    const today = new Date().toISOString().slice(0, 10);
    const critical = [], risk = [], alert = [];
    activeBatches.forEach(batch => {
      const summary = AttendanceService.getSummary(batch.id);
      summary.students.forEach(s => {
        if (s.attendancePercent === null) return; // never marked yet — nothing to flag
        const row = { name: s.studentName, batch: batch.batchName, pct: s.attendancePercent };
        if (s.attendancePercent < 80)                                     critical.push(row);
        else if (s.attendancePercent >= 80 && s.attendancePercent < 85)   risk.push(row);
        else if (s.attendancePercent >= 85 && s.attendancePercent < 90)   alert.push(row);
      });
    });
    critical.sort((a, b) => a.pct - b.pct);
    risk.sort((a, b) => a.pct - b.pct);
    alert.sort((a, b) => a.pct - b.pct);

    // ── LP completion highlights (>=80%) — across all batches ──
    const lpaMap = AppState.get('lpAssignments') || {};
    const lpHighlights = myBatches
      .map(b => {
        const lpa = lpaMap[b.id];
        const rows = lpa?.rows || [];
        if (!rows.length) return null;
        const done = rows.filter(r => r.status === 'Done').length;
        const pct = Math.round((done / rows.length) * 100);
        return pct >= 80 ? { batch: b, lpa, pct, done, total: rows.length } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.pct - a.pct);

    const watchGroupHTML = (cls, label, list) => `
      <div class="hz-watch-group hz-watch-${cls}">
        <div class="hz-watch-label"><span class="hz-watch-dot"></span>${label} (${list.length})</div>
        ${list.length
          ? list.map(s => `
              <div class="hz-watch-item">
                <span>
                  <div class="name">${_esc(s.name)}</div>
                  <div class="batch">${_esc(s.batch)}</div>
                </span>
                <span class="pct">${s.pct}%</span>
              </div>`).join('')
          : `<div class="hz-empty" style="padding:8px 0">None right now</div>`}
      </div>`;

    el.innerHTML = `
      <div class="hz-wrap">
        <div>
          <div class="hz-section">
            <div class="hz-section-hdr">
              <span class="hz-section-title">${ICON.bolt} High Priority Tasks</span>
              <span class="hz-count-badge">${tasks.length}</span>
            </div>
            ${tasks.length
              ? tasks.map(t => {
                  const overdue = t.endDate && t.endDate < today;
                  return `
                    <div class="hz-task-row">
                      <span class="hz-task-dot"></span>
                      <span class="hz-task-title">${_esc(t.title)}</span>
                      ${t.endDate ? `<span class="hz-task-due ${overdue ? 'overdue' : ''}">${overdue ? 'Overdue · ' : 'Due '}${t.endDate}</span>` : ''}
                    </div>`;
                }).join('')
              : `<div class="hz-empty">No high priority tasks pending. Add some from Notes → Tasks.</div>`}
          </div>

          <div class="hz-section">
            <div class="hz-section-hdr">
              <span class="hz-section-title">${ICON.book} Lecture Plans Nearing Completion</span>
              <span class="hz-count-badge">${lpHighlights.length}</span>
            </div>
            ${lpHighlights.length
              ? `<div class="hz-lp-grid">${lpHighlights.map(h => `
                  <div class="hz-lp-card">
                    <div class="hz-lp-name">${_esc(h.lpa.lpCode || h.lpa.lpTitle || 'Lecture Plan')}</div>
                    <div class="hz-lp-sub">${_esc(h.batch.batchName)}</div>
                    <div class="hz-lp-bar-track"><div class="hz-lp-bar-fill" style="width:${h.pct}%"></div></div>
                    <div class="hz-lp-pct">${h.done}/${h.total} · ${h.pct}% complete</div>
                  </div>`).join('')}</div>`
              : `<div class="hz-empty">No Lecture Plan has crossed 80% completion yet.</div>`}
          </div>
        </div>

        <div>
          <div class="hz-section">
            <div class="hz-section-hdr">
              <span class="hz-section-title">${ICON.eye} Attendance Watch</span>
            </div>
            ${watchGroupHTML('critical', 'Critical · Below 80%', critical)}
            ${watchGroupHTML('risk',     'Risk · 80–85%',        risk)}
            ${watchGroupHTML('alert',    'Alert · 85–90%',       alert)}
          </div>
        </div>
      </div>
    `;
  },
};
