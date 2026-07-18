// ============================================================
// modules/teacher/teacherHorizonUI.js — Horizon View
// A teacher's at-a-glance dashboard: high priority tasks,
// students who need attention on attendance (by batch or by
// student, expandable), batch health (marks/pass rate), and
// Lecture Plans nearing completion.
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
    .hz-wrap { display:grid; grid-template-columns:1fr 360px; gap:18px; align-items:start; }
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

    /* Batch health */
    .hz-health-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); gap:10px; }
    .hz-health-card { border:1px solid var(--border2); border-radius:10px; padding:10px 12px; background:var(--surface2); }
    .hz-health-name { font-size:12.5px; font-weight:700; color:var(--t1); }
    .hz-health-sub { font-size:10px; color:var(--t3); margin-top:1px; margin-bottom:8px; }
    .hz-health-row { display:flex; justify-content:space-between; font-size:11.5px; margin-top:4px; }
    .hz-health-row .lbl { color:var(--t3); }
    .hz-health-row .val { font-weight:800; }

    /* Attendance watch tabs */
    .hz-watch-tabs { display:flex; gap:6px; margin-bottom:12px; }
    .hz-watch-tab {
      flex:1; height:30px; border-radius:8px; font-size:11.5px; font-weight:700; cursor:pointer;
      font-family:inherit; border:1.5px solid var(--border2); background:var(--surface2); color:var(--t3);
    }
    .hz-watch-tab.active { border-color:var(--blue); color:var(--blue); background:color-mix(in srgb, var(--blue) 12%, transparent); }

    .hz-tier-tag {
      font-size:9.5px; font-weight:800; padding:2px 6px; border-radius:6px; text-transform:uppercase; letter-spacing:.02em;
    }
    .hz-tier-tag.critical { background:color-mix(in srgb, var(--red) 15%, transparent); color:var(--red); }
    .hz-tier-tag.risk     { background:color-mix(in srgb, #d97706 15%, transparent); color:#d97706; }
    .hz-tier-tag.alert    { background:color-mix(in srgb, #ca8a04 15%, transparent); color:#ca8a04; }
    .hz-tier-tag.ok       { background:color-mix(in srgb, var(--green) 15%, transparent); color:var(--green); }

    /* By-batch expandable rows */
    .hz-batch-row { border:1px solid var(--border2); border-radius:10px; margin-bottom:8px; overflow:hidden; }
    .hz-batch-row-hdr {
      display:flex; align-items:center; gap:8px; padding:10px 12px; cursor:pointer; background:var(--surface2);
    }
    .hz-batch-row-hdr:hover { background:var(--surface3, var(--surface2)); }
    .hz-chev { color:var(--t3); transition:transform .15s; flex-shrink:0; }
    .hz-chev.open { transform:rotate(90deg); }
    .hz-batch-row-hdr .name { font-size:12.5px; font-weight:700; color:var(--t1); flex:1; }
    .hz-batch-row-hdr .tally { display:flex; gap:4px; flex-wrap:wrap; justify-content:flex-end; }
    .hz-batch-row-body { padding:10px 12px; border-top:1px solid var(--border2); }
    .hz-batch-tier-label { font-size:10.5px; font-weight:800; text-transform:uppercase; margin:8px 0 6px; }
    .hz-batch-tier-label:first-child { margin-top:0; }
    .hz-batch-tier-label.critical { color:var(--red); }
    .hz-batch-tier-label.risk     { color:#d97706; }
    .hz-batch-tier-label.alert    { color:#ca8a04; }

    /* By-student rows */
    .hz-student-row { border:1px solid var(--border2); border-radius:10px; margin-bottom:6px; overflow:hidden; }
    .hz-student-row-hdr { display:flex; align-items:center; gap:8px; padding:9px 11px; cursor:pointer; }
    .hz-student-row-hdr:hover { background:var(--surface2); }
    .hz-student-row-hdr .name { font-size:12px; font-weight:700; color:var(--t1); }
    .hz-student-row-hdr .batch { font-size:10px; color:var(--t3); }
    .hz-student-row-hdr .pct { font-size:12.5px; font-weight:800; margin-left:auto; }
    .hz-student-row-body { padding:0 11px 10px 29px; font-size:11px; color:var(--t3); display:flex; gap:14px; }
    .hz-student-row-body b { color:var(--t1); }

    .hz-watch-item { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:7px 9px; border-radius:8px; background:var(--surface2); margin-bottom:6px; }
    .hz-watch-item .name { font-size:12px; font-weight:600; color:var(--t1); }
    .hz-watch-item .pct { font-size:12px; font-weight:800; }
    .critical-text { color:var(--red); }
    .risk-text     { color:#d97706; }
    .alert-text    { color:#ca8a04; }
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
  chart: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="20" x2="6" y2="14"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="18" y1="20" x2="18" y2="10"/></svg>`,
  chev:  `<svg class="hz-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="9 18 15 12 9 6"/></svg>`,
};

const TIER_LABEL = { critical: 'Critical', risk: 'Risk', alert: 'Alert' };

export const TeacherHorizonModule = {

  async mount(el, ctx) {
    if (!el) return;
    _injectStyles();
    this._el  = el;
    this._ctx = ctx; // { teacher }
    this._watchView = 'batch'; // 'batch' | 'student'
    this._expandedBatches  = new Set();
    this._expandedStudents = new Set();

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

  // Roster comes from active enrolments (same source of truth used by
  // the attendance-marking screen) — NOT AttendanceService.getSummary(),
  // whose internal student.batchId matching doesn't reliably line up
  // with this app's actual enrolment model and was showing "—" names.
  _rosterFor(batchId) {
    return (AppState.get('enrolments') || [])
      .filter(e => e.batchId === batchId && e.status === 'active')
      .map(e => AppState.findById('students', e.studentId))
      .filter(Boolean);
  },

  _tierFor(pct) {
    if (pct < 80) return 'critical';
    if (pct < 85) return 'risk';
    if (pct < 90) return 'alert';
    return null;
  },

  // Builds, per active batch: roster with attendance % + P/A/L counts,
  // split into critical/risk/alert tiers.
  _computeWatchData(activeBatches) {
    const perBatch = activeBatches.map(batch => {
      const roster  = this._rosterFor(batch.id);
      const records = AttendanceService.getRecordsForBatch(batch.id);

      const students = roster.map(stu => {
        const recs = records.filter(r => r.studentId === stu.id);
        const total = recs.length;
        const P = recs.filter(r => r.status === 'P').length;
        const A = recs.filter(r => r.status === 'A').length;
        const L = recs.filter(r => r.status === 'L').length;
        const pct = total > 0 ? Math.round((P / total) * 100) : null;
        return { studentId: stu.id, name: stu.studentName, batchId: batch.id, batchName: batch.batchName, pct, P, A, L, total };
      }).filter(s => s.pct !== null);

      const critical = students.filter(s => this._tierFor(s.pct) === 'critical').sort((a, b) => a.pct - b.pct);
      const risk     = students.filter(s => this._tierFor(s.pct) === 'risk').sort((a, b) => a.pct - b.pct);
      const alert    = students.filter(s => this._tierFor(s.pct) === 'alert').sort((a, b) => a.pct - b.pct);

      return { batch, critical, risk, alert, flaggedCount: critical.length + risk.length + alert.length };
    });

    const allFlagged = [];
    perBatch.forEach(b => {
      allFlagged.push(...b.critical.map(s => ({ ...s, tier: 'critical' })));
      allFlagged.push(...b.risk.map(s => ({ ...s, tier: 'risk' })));
      allFlagged.push(...b.alert.map(s => ({ ...s, tier: 'alert' })));
    });
    const tierOrder = { critical: 0, risk: 1, alert: 2 };
    allFlagged.sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier] || a.pct - b.pct);

    return { perBatch, allFlagged };
  },

  // Batch Health — same idea as the Result Profile report (average
  // marks % and pass rate), computed directly from testResults for
  // just this teacher's active batches.
  _computeBatchHealth(activeBatches) {
    const results = AppState.get('testResults') || [];
    return activeBatches.map(batch => {
      const recs = results.filter(r =>
        r.batchId === batch.id && r.marks != null && !r.absent && r.totalMarks
      );
      if (!recs.length) return null;

      let sumPct = 0, passCount = 0;
      recs.forEach(r => {
        const pct = (Number(r.marks) / Number(r.totalMarks)) * 100;
        sumPct += pct;
        const passMark = r.passMark != null ? Number(r.passMark) : Math.ceil(Number(r.totalMarks) * 0.5);
        if (Number(r.marks) >= passMark) passCount++;
      });

      return {
        batch,
        avgMarks: Math.round(sumPct / recs.length),
        passRate: Math.round((passCount / recs.length) * 100),
        count: recs.length,
      };
    }).filter(Boolean);
  },

  _render(myBatches, activeBatches) {
    const el = this._el;
    const teacher = this._ctx.teacher;
    const today = new Date().toISOString().slice(0, 10);

    // ── High priority tasks ──
    const tasks = TeacherNotesService.getByKind(teacher.id, 'task')
      .filter(t => t.priority === 'high' && t.status !== 'done')
      .sort((a, b) => (a.endDate || a.startDate || '9999').localeCompare(b.endDate || b.startDate || '9999'));

    // ── Attendance watch data ──
    const watch = this._computeWatchData(activeBatches);
    this._watch = watch; // stashed for re-render on tab/expand clicks

    // ── Batch health ──
    const health = this._computeBatchHealth(activeBatches);

    // ── LP completion highlights (>=80%) ──
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
              <span class="hz-section-title">${ICON.chart} Batch Health</span>
              <span class="hz-count-badge">${health.length}</span>
            </div>
            ${health.length
              ? `<div class="hz-health-grid">${health.map(h => `
                  <div class="hz-health-card">
                    <div class="hz-health-name">${_esc(h.batch.batchName)}</div>
                    <div class="hz-health-sub">${h.count} result${h.count === 1 ? '' : 's'} recorded</div>
                    <div class="hz-health-row"><span class="lbl">Avg Marks</span><span class="val">${h.avgMarks}%</span></div>
                    <div class="hz-health-row"><span class="lbl">Pass Rate</span><span class="val" style="color:${h.passRate >= 60 ? 'var(--green)' : 'var(--red)'}">${h.passRate}%</span></div>
                  </div>`).join('')}</div>`
              : `<div class="hz-empty">No test results recorded for your batches yet.</div>`}
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
            <div class="hz-watch-tabs" id="hzWatchTabs">
              <button class="hz-watch-tab" data-view="batch">By Batch</button>
              <button class="hz-watch-tab" data-view="student">By Student</button>
            </div>
            <div id="hzWatchBody"></div>
          </div>
        </div>
      </div>
    `;

    el.querySelectorAll('#hzWatchTabs .hz-watch-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.view === this._watchView) return;
        this._watchView = btn.dataset.view;
        this._renderWatchBody();
      });
    });

    this._renderWatchBody();
  },

  _renderWatchBody() {
    const el = this._el;
    el.querySelectorAll('#hzWatchTabs .hz-watch-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === this._watchView);
    });

    const body = el.querySelector('#hzWatchBody');
    if (this._watchView === 'batch') this._renderByBatch(body);
    else this._renderByStudent(body);
  },

  // ── By Batch: one row per batch, click to expand its flagged students ──
  _renderByBatch(body) {
    const { perBatch } = this._watch;

    if (!perBatch.length) {
      body.innerHTML = `<div class="hz-empty">No active batches to show.</div>`;
      return;
    }

    const sorted = [...perBatch].sort((a, b) => b.flaggedCount - a.flaggedCount);

    const tierListHTML = (tier, list) => list.length ? `
      <div class="hz-batch-tier-label ${tier}">${TIER_LABEL[tier]} (${list.length})</div>
      ${list.map(s => `
        <div class="hz-watch-item">
          <span class="name">${_esc(s.name)}</span>
          <span class="pct ${tier}-text">${s.pct}%</span>
        </div>`).join('')}
    ` : '';

    body.innerHTML = sorted.map(b => {
      const isOpen = this._expandedBatches.has(b.batch.id);
      return `
        <div class="hz-batch-row">
          <div class="hz-batch-row-hdr" data-toggle-batch="${b.batch.id}">
            ${ICON.chev.replace('class="hz-chev"', `class="hz-chev${isOpen ? ' open' : ''}"`)}
            <span class="name">${_esc(b.batch.batchName)}</span>
            <span class="tally">
              ${b.critical.length ? `<span class="hz-tier-tag critical">${b.critical.length} Critical</span>` : ''}
              ${b.risk.length     ? `<span class="hz-tier-tag risk">${b.risk.length} Risk</span>`         : ''}
              ${b.alert.length    ? `<span class="hz-tier-tag alert">${b.alert.length} Alert</span>`       : ''}
              ${!b.flaggedCount   ? `<span class="hz-tier-tag ok">All good</span>`                          : ''}
            </span>
          </div>
          ${isOpen ? `
            <div class="hz-batch-row-body">
              ${b.flaggedCount
                ? tierListHTML('critical', b.critical) + tierListHTML('risk', b.risk) + tierListHTML('alert', b.alert)
                : `<div class="hz-empty" style="padding:6px 0">No students below 90% attendance in this batch.</div>`}
            </div>` : ''}
        </div>`;
    }).join('');

    body.querySelectorAll('[data-toggle-batch]').forEach(hdr => {
      hdr.addEventListener('click', () => {
        const id = hdr.dataset.toggleBatch;
        if (this._expandedBatches.has(id)) this._expandedBatches.delete(id);
        else this._expandedBatches.add(id);
        this._renderByBatch(body);
      });
    });
  },

  // ── By Student: flat flagged list, click to expand P/A/L detail ──
  _renderByStudent(body) {
    const { allFlagged } = this._watch;

    if (!allFlagged.length) {
      body.innerHTML = `<div class="hz-empty">No students below 90% attendance right now.</div>`;
      return;
    }

    body.innerHTML = allFlagged.map(s => {
      const key = `${s.studentId}__${s.batchId}`;
      const isOpen = this._expandedStudents.has(key);
      return `
        <div class="hz-student-row">
          <div class="hz-student-row-hdr" data-toggle-student="${key}">
            ${ICON.chev.replace('class="hz-chev"', `class="hz-chev${isOpen ? ' open' : ''}"`)}
            <span class="hz-tier-tag ${s.tier}">${TIER_LABEL[s.tier]}</span>
            <span>
              <div class="name">${_esc(s.name)}</div>
              <div class="batch">${_esc(s.batchName)}</div>
            </span>
            <span class="pct ${s.tier}-text">${s.pct}%</span>
          </div>
          ${isOpen ? `
            <div class="hz-student-row-body">
              <span>Present: <b>${s.P}</b></span>
              <span>Absent: <b>${s.A}</b></span>
              <span>Leave: <b>${s.L}</b></span>
              <span>Total marked: <b>${s.total}</b></span>
            </div>` : ''}
        </div>`;
    }).join('');

    body.querySelectorAll('[data-toggle-student]').forEach(hdr => {
      hdr.addEventListener('click', () => {
        const key = hdr.dataset.toggleStudent;
        if (this._expandedStudents.has(key)) this._expandedStudents.delete(key);
        else this._expandedStudents.add(key);
        this._renderByStudent(body);
      });
    });
  },
};
