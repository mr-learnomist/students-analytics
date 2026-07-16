// ============================================================
// modules/teacher/teacherPortalUI.js — Teacher Portal
// Route: teacherPortal — mounted only for role === 'teacher'
//
// Shows the logged-in teacher's own assigned batches. Clicking
// "Mark Attendance" on a batch opens a TODAY-ONLY attendance
// sheet for that batch's active students (no date picker, no
// history — just today, same P/A/L marking used elsewhere).
// ============================================================

import { AppState }     from '../../utils/state.js';
import { Auth }          from '../../utils/auth.js';
import { Toast }         from '../../utils/helpers.js';
import { _avatarHTML }   from './teacherUI.js';
import LecturePlanStorage from '../../utils/lecturePlanStorage.js';
import { LecturePlanService } from '../lecturePlan/lecturePlanService.js';
import {
  AttendanceService,
  AttendanceDateGenerator,
  fetchAndSyncBatchAttendance,
  toISODate,
  formatDisplayDate,
} from '../attendance/attendanceService.js';

let _styleInjected = false;

function _injectStyles() {
  if (_styleInjected) return;
  _styleInjected = true;
  const st = document.createElement('style');
  st.textContent = `
.tp-wrap { display:flex; flex-direction:column; gap:18px; }
.tp-hero {
  display:flex; align-items:center; gap:14px;
  padding:16px 20px; border:1px solid var(--border); border-radius:var(--r-lg, 12px);
  background:var(--surface);
}
.tp-hero-name { font-size:15px; font-weight:700; color:var(--t1); }
.tp-hero-meta { font-size:12px; color:var(--t3); margin-top:2px; }
.tp-stats { display:flex; gap:10px; margin-left:auto; flex-wrap:wrap; }
.tp-stat {
  padding:8px 14px; border-radius:10px; background:var(--surface2);
  border:1px solid var(--border2); text-align:center; min-width:76px;
}
.tp-stat-num { font-size:16px; font-weight:800; color:var(--blue); line-height:1.2; }
.tp-stat-lbl { font-size:10px; color:var(--t3); text-transform:uppercase; letter-spacing:.05em; }

.tp-search-row { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
.tp-search {
  flex:1; min-width:180px; height:36px; padding:0 12px; border-radius:9px;
  border:1px solid var(--border2); background:var(--surface); color:var(--t1); font-size:13px;
}
.tp-filter-tabs { display:flex; gap:8px; flex-wrap:wrap; }
.tp-filter-tab {
  height:34px; padding:0 14px; border-radius:9px; font-size:12.5px; font-weight:700;
  cursor:pointer; font-family:inherit; border:1.5px solid var(--border2);
  background:var(--surface2); color:var(--t3); transition:all .12s;
}
.tp-filter-tab:hover { color:var(--t1); }
.tp-filter-tab.active {
  border-color:var(--blue); color:var(--blue);
  background:var(--blue-dim, rgba(79,133,247,.12));
}

.tp-section-title { font-size:15px; font-weight:800; color:var(--t1); margin-top:6px; }
.tp-lp-progress-track {
  flex:1; min-width:80px; height:6px; border-radius:4px; background:var(--surface2); overflow:hidden;
}
.tp-lp-progress-fill { height:100%; background:var(--blue); border-radius:4px; }

.tp-lp-mark-btn {
  height:28px; padding:0 12px; border-radius:7px; font-size:11.5px; font-weight:700;
  cursor:pointer; font-family:inherit; border:1.5px solid; background:transparent;
}
.tp-lp-mark-btn.todo { color:var(--blue); border-color:color-mix(in srgb, var(--blue) 35%, transparent); background:color-mix(in srgb, var(--blue) 10%, transparent); }
.tp-lp-mark-btn.done { color:var(--t3);   border-color:var(--border2); background:var(--surface2); }

.tp-lp-row + .tp-lp-row { margin-top:12px; padding-top:12px; border-top:1px solid var(--border2); }
.tp-lp-remark-row { margin-top:6px; }
.tp-lp-remark-input {
  width:100%; height:30px; padding:0 10px; border-radius:7px;
  border:1px solid var(--border2); background:var(--surface2); color:var(--t1);
  font-size:12px; font-family:inherit;
}
.tp-lp-remark-input:focus { outline:none; border-color:var(--blue); }
.tp-lp-remark-display { margin-top:4px; font-size:11.5px; color:var(--t3); }

.tp-grid {
  display:grid; grid-template-columns:repeat(auto-fill, minmax(260px,1fr)); gap:14px;
}
.tp-card {
  display:flex; flex-direction:column; gap:10px; padding:16px;
  border:1px solid var(--border); border-radius:var(--r-lg, 12px); background:var(--surface);
  transition:box-shadow .15s, border-color .15s;
}
.tp-card:hover { border-color:var(--border2); box-shadow:0 4px 16px rgba(0,0,0,.06); }
.tp-card-top { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; }
.tp-card-name { font-size:14px; font-weight:700; color:var(--t1); line-height:1.3; }
.tp-card-sub  { font-size:11.5px; color:var(--t3); margin-top:2px; }
.tp-badges { display:flex; gap:6px; flex-wrap:wrap; }
.tp-badge {
  font-size:10.5px; font-weight:600; padding:2px 8px; border-radius:20px;
  background:var(--blue-dim, rgba(79,133,247,.12)); color:var(--blue);
}
.tp-badge.grey { background:var(--surface2); color:var(--t3); }
.tp-card-row {
  display:flex; align-items:center; justify-content:space-between;
  font-size:12px; color:var(--t2); padding-top:8px; border-top:1px solid var(--border2);
}
.tp-card-students { display:flex; align-items:center; gap:6px; color:var(--t3); }
.tp-mark-btn {
  height:34px; padding:0 14px; border-radius:9px; border:none;
  background:var(--blue); color:#fff; font-size:12.5px; font-weight:700;
  cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-family:inherit;
}
.tp-mark-btn:hover { opacity:.9; }
.tp-empty {
  padding:48px 20px; text-align:center; color:var(--t3); font-size:13px;
  border:1px dashed var(--border2); border-radius:var(--r-lg, 12px);
}

/* ── Attendance (today) view ── */
.tp-att-head { display:flex; flex-direction:column; gap:10px; }
.tp-back-btn {
  align-self:flex-start; display:inline-flex; align-items:center; gap:6px;
  height:30px; padding:0 12px; border-radius:8px; border:1px solid var(--border2);
  background:var(--surface2); color:var(--t2); font-size:12px; font-weight:600;
  cursor:pointer; font-family:inherit;
}
.tp-back-btn:hover { color:var(--t1); border-color:var(--blue); }
.tp-att-bar {
  display:flex; align-items:center; gap:12px; flex-wrap:wrap;
  padding:14px 18px; border:1px solid var(--border); border-radius:var(--r-lg, 12px);
  background:var(--surface);
}
.tp-att-batch { font-size:15px; font-weight:800; color:var(--t1); }
.tp-att-sub   { font-size:12px; color:var(--t3); margin-top:2px; }
.tp-att-date  { margin-left:auto; text-align:right; font-size:13px; font-weight:700; color:var(--blue); }
.tp-att-statbar {
  display:flex; align-items:center; gap:12px; flex-wrap:wrap;
  padding:12px 18px; border:1px solid var(--border); border-radius:var(--r-lg, 12px);
  background:var(--surface);
}
.tp-pill {
  font-size:11.5px; font-weight:700; padding:3px 10px; border-radius:20px;
}
.tp-pill.p { color:var(--green); background:color-mix(in srgb, var(--green) 12%, transparent); }
.tp-pill.a { color:var(--red);   background:color-mix(in srgb, var(--red) 12%, transparent); }
.tp-pill.l { color:var(--t2);    background:var(--surface2); }
.tp-att-actions { margin-left:auto; display:flex; gap:8px; }
.tp-quick-btn {
  height:32px; padding:0 14px; border-radius:8px; font-size:12px; font-weight:700;
  cursor:pointer; font-family:inherit; border:1.5px solid; background:transparent;
}
.tp-quick-btn.p { color:var(--green); border-color:color-mix(in srgb, var(--green) 35%, transparent); background:color-mix(in srgb, var(--green) 10%, transparent); }
.tp-quick-btn.a { color:var(--red);   border-color:color-mix(in srgb, var(--red) 35%, transparent);   background:color-mix(in srgb, var(--red) 10%, transparent); }

.tp-att-table { width:100%; border-collapse:collapse; }
.tp-att-table th {
  text-align:left; font-size:10.5px; text-transform:uppercase; letter-spacing:.05em;
  color:var(--t3); padding:8px 10px; border-bottom:1px solid var(--border2);
}
.tp-att-table td { padding:8px 10px; border-bottom:1px solid var(--border); font-size:13px; color:var(--t1); }
.tp-att-idx { color:var(--t4); font-family:var(--font-mono); font-size:11px; width:34px; }
.tp-status-grp { display:inline-flex; gap:6px; }
.tp-status-btn {
  width:32px; height:32px; border-radius:7px; font-size:12px; font-weight:800;
  cursor:pointer; font-family:inherit; transition:all .12s; background:var(--surface2);
  border:1.5px solid var(--border2); color:var(--t3);
}
@keyframes tpspin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
`;
  document.head.appendChild(st);
}

const STATUS_CFG = {
  P: { color: 'var(--green)', label: 'P', title: 'Present' },
  A: { color: 'var(--red)',   label: 'A', title: 'Absent'  },
  L: { color: 'var(--t2)',    label: 'L', title: 'Leave'   },
};

export const TeacherPortalModule = {

  mount(el) {
    if (!el) return;
    _injectStyles();

    const session = Auth.getCurrentUser();

    // ── Guard: only teacher sessions belong here ────────────────
    if (!session || !session.isTeacher) {
      el.innerHTML = `
        <div class="tp-empty">
          This page is only available to teacher accounts.
        </div>`;
      return;
    }

    const teacher = AppState.findById('teachers', session.userId);
    if (!teacher) {
      el.innerHTML = `
        <div class="tp-empty">
          Your teacher profile could not be found. Please contact your administrator.
        </div>`;
      return;
    }

    this._render(el, teacher);
  },

  // ══════════════════════════════════════════════════════════
  // BATCH GRID (the "My Batches" list)
  // ══════════════════════════════════════════════════════════
  _render(el, teacher) {
    const allBatches  = AppState.get('batches') || [];
    const myBatches   = allBatches.filter(b => b.teacherId === teacher.id);
    const totalStudents = myBatches.reduce((sum, b) => sum + this._activeStudentCount(b.id), 0);

    el.innerHTML = `
      <div class="tp-wrap">
        <div class="tp-hero">
          ${_avatarHTML(teacher.profilePicture, teacher.fullName, 52)}
          <div>
            <div class="tp-hero-name">${teacher.fullName}</div>
            <div class="tp-hero-meta">${teacher.qualification || ''}${teacher.email ? ' · ' + teacher.email : ''}</div>
          </div>
          <div class="tp-stats">
            <div class="tp-stat">
              <div class="tp-stat-num">${myBatches.length}</div>
              <div class="tp-stat-lbl">Batches</div>
            </div>
            <div class="tp-stat">
              <div class="tp-stat-num">${totalStudents}</div>
              <div class="tp-stat-lbl">Students</div>
            </div>
          </div>
        </div>

        <div class="tp-search-row">
          <div class="tp-filter-tabs" id="tpFilterTabs">
            <button class="tp-filter-tab" data-filter="active">Active</button>
            <button class="tp-filter-tab" data-filter="closed">Closed</button>
            <button class="tp-filter-tab" data-filter="all">All</button>
          </div>
          <input id="tpSearch" class="tp-search" type="text" placeholder="Search your batches…"/>
        </div>

        <div class="tp-grid" id="tpGrid"></div>
      </div>`;

    const gridEl   = el.querySelector('#tpGrid');
    const searchEl = el.querySelector('#tpSearch');
    const tabsEl   = el.querySelector('#tpFilterTabs');

    // A batch is "closed" once its closing date has passed, "active"
    // otherwise. The closing date is either the manual endDate, or —
    // when the batch follows the Lecture Plan (endDateMode:'lp' or
    // unset) — the last dated row of its LP assignment, same logic
    // used in the admin Batches table.
    const today = toISODate(new Date());
    const lpaMap = AppState.get('lpAssignments') || {};

    const _effectiveEndDate = (b) => {
      if (b.endDateMode === 'lp' || !b.endDateMode) {
        const datedRows = (lpaMap[b.id]?.rows || []).filter(r => r.date);
        return datedRows.length ? datedRows[datedRows.length - 1].date : null;
      }
      return b.endDate || null;
    };

    // No known closing date (no manual date, no LP assigned) → treat as active.
    const _status = (b) => {
      const end = _effectiveEndDate(b);
      return end && end < today ? 'closed' : 'active';
    };

    let currentFilter = 'active'; // default: show active batches only

    const renderTabs = () => {
      tabsEl.querySelectorAll('.tp-filter-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === currentFilter);
      });
    };

    const renderGrid = (filterText = '') => {
      const q = filterText.trim().toLowerCase();
      const scoped = currentFilter === 'all'
        ? myBatches
        : myBatches.filter(b => _status(b) === currentFilter);
      const filtered = !q ? scoped : scoped.filter(b => (b.batchName || '').toLowerCase().includes(q));

      if (!filtered.length) {
        gridEl.innerHTML = `
          <div class="tp-empty" style="grid-column:1/-1">
            ${!myBatches.length
              ? 'No batches have been assigned to you yet.'
              : scoped.length
                ? 'No batches match your search.'
                : `No ${currentFilter === 'all' ? '' : currentFilter + ' '}batches found.`}
          </div>`;
        return;
      }

      gridEl.innerHTML = filtered.map(b => this._cardHTML(b)).join('');

      gridEl.querySelectorAll('[data-mark-attendance]').forEach(btn => {
        btn.addEventListener('click', () => {
          const batch = AppState.findById('batches', btn.dataset.markAttendance);
          if (batch) this._renderAttendanceView(el, teacher, batch);
        });
      });
    };

    tabsEl.querySelectorAll('.tp-filter-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.filter === currentFilter) return;
        currentFilter = btn.dataset.filter;
        renderTabs();
        renderGrid(searchEl.value);
      });
    });

    renderTabs();
    renderGrid();
    searchEl.addEventListener('input', () => renderGrid(searchEl.value));
  },

  // ══════════════════════════════════════════════════════════
  // LECTURE PLANS PAGE — sidebar entry point, own route
  // Read-only for teachers: one card per own batch, showing
  // whatever Lecture Plan is assigned to it (or "not assigned").
  // ══════════════════════════════════════════════════════════
  mountLecturePlans(el) {
    if (!el) return;
    _injectStyles();

    const session = Auth.getCurrentUser();
    if (!session || !session.isTeacher) {
      el.innerHTML = `
        <div class="tp-empty">
          This page is only available to teacher accounts.
        </div>`;
      return;
    }

    const teacher = AppState.findById('teachers', session.userId);
    if (!teacher) {
      el.innerHTML = `
        <div class="tp-empty">
          Your teacher profile could not be found. Please contact your administrator.
        </div>`;
      return;
    }

    this._renderLecturePlans(el, teacher);
  },

  _renderLecturePlans(el, teacher) {
    const allBatches = AppState.get('batches') || [];
    const myBatches   = allBatches.filter(b => b.teacherId === teacher.id);

    el.innerHTML = `
      <div class="tp-wrap">
        <div class="tp-search-row">
          <div class="tp-filter-tabs" id="tpLpFilterTabs">
            <button class="tp-filter-tab" data-filter="active">Active</button>
            <button class="tp-filter-tab" data-filter="closed">Closed</button>
            <button class="tp-filter-tab" data-filter="all">All</button>
          </div>
        </div>
        <div class="tp-grid" id="tpLpGrid"></div>
      </div>`;

    // Same "closed once its closing date has passed" rule as My Batches.
    const today  = toISODate(new Date());
    const lpaMap = AppState.get('lpAssignments') || {};

    const _effectiveEndDate = (b) => {
      if (b.endDateMode === 'lp' || !b.endDateMode) {
        const datedRows = (lpaMap[b.id]?.rows || []).filter(r => r.date);
        return datedRows.length ? datedRows[datedRows.length - 1].date : null;
      }
      return b.endDate || null;
    };
    const _status = (b) => {
      const end = _effectiveEndDate(b);
      return end && end < today ? 'closed' : 'active';
    };

    const lpGridEl = el.querySelector('#tpLpGrid');
    const lpTabsEl = el.querySelector('#tpLpFilterTabs');
    let currentLpFilter = 'active'; // default: active batches' plans only

    const renderLpTabs = () => {
      lpTabsEl.querySelectorAll('.tp-filter-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === currentLpFilter);
      });
    };

    const renderLpGrid = () => {
      const scoped = currentLpFilter === 'all'
        ? myBatches
        : myBatches.filter(b => _status(b) === currentLpFilter);

      if (!scoped.length) {
        lpGridEl.innerHTML = `
          <div class="tp-empty" style="grid-column:1/-1">
            ${!myBatches.length
              ? 'No batches have been assigned to you yet.'
              : `No ${currentLpFilter === 'all' ? '' : currentLpFilter + ' '}batches found.`}
          </div>`;
        return;
      }

      lpGridEl.innerHTML = scoped.map(b => this._lpCardHTML(b)).join('');

      lpGridEl.querySelectorAll('[data-view-lp]').forEach(btn => {
        btn.addEventListener('click', () => {
          const batch = AppState.findById('batches', btn.dataset.viewLp);
          if (batch) this._renderLecturePlanView(el, teacher, batch);
        });
      });
    };

    lpTabsEl.querySelectorAll('.tp-filter-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.filter === currentLpFilter) return;
        currentLpFilter = btn.dataset.filter;
        renderLpTabs();
        renderLpGrid();
      });
    });

    renderLpTabs();
    renderLpGrid();

    // Cards render instantly with whatever's already in AppState, then
    // quietly refresh in the background (same 2-minute cache as the
    // attendance view) and re-render once fresh data lands.
    LecturePlanStorage.loadLectureData(120000).then(fresh => {
      if (!fresh) return;
      if (Array.isArray(fresh.lecturePlans)) AppState._silentSet('lecturePlans', fresh.lecturePlans);
      if (fresh.lpRows)                      AppState._silentSet('lpRows', fresh.lpRows);
      if (fresh.lpAssignments)               AppState._silentSet('lpAssignments', fresh.lpAssignments);
      renderLpGrid();
    }).catch(() => { /* best-effort — cards just keep showing whatever was already cached */ });
  },

  _lpCardHTML(batch) {
    const disc   = AppState.findById('disciplines', batch.disciplineId);
    const campus = AppState.findById('campuses', batch.campusId);
    const lpaMap = AppState.get('lpAssignments') || {};
    const lpa    = lpaMap[batch.id];
    const rows   = lpa?.rows || [];

    if (!rows.length) {
      return `
        <div class="tp-card">
          <div class="tp-card-top">
            <div>
              <div class="tp-card-name">${batch.batchName || '—'}</div>
              <div class="tp-card-sub">${batch.sessionPeriod || ''}</div>
            </div>
          </div>
          <div class="tp-badges">
            ${disc ? `<span class="tp-badge">${disc.abbreviation || disc.fullName || ''}</span>` : ''}
            ${campus ? `<span class="tp-badge grey">${campus.campusName}</span>` : ''}
          </div>
          <div class="tp-card-row">
            <span style="color:var(--t3)">No Lecture Plan assigned</span>
          </div>
        </div>`;
    }

    const total = rows.length;
    const done  = rows.filter(r => r.status === 'Done').length;
    const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

    return `
      <div class="tp-card">
        <div class="tp-card-top">
          <div>
            <div class="tp-card-name">${lpa.lpCode || lpa.lpTitle || 'Lecture Plan'}</div>
            <div class="tp-card-sub">${batch.batchName || ''}</div>
          </div>
        </div>
        <div class="tp-badges">
          ${disc ? `<span class="tp-badge">${disc.abbreviation || disc.fullName || ''}</span>` : ''}
          ${campus ? `<span class="tp-badge grey">${campus.campusName}</span>` : ''}
        </div>
        <div class="tp-card-row" style="gap:10px">
          <span class="tp-lp-progress-track"><span class="tp-lp-progress-fill" style="width:${pct}%"></span></span>
          <span style="color:var(--t3);white-space:nowrap">${done}/${total} · ${pct}%</span>
        </div>
        <div class="tp-card-row">
          <span></span>
          <button class="tp-mark-btn" data-view-lp="${batch.id}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>
            </svg>
            View Plan
          </button>
        </div>
      </div>`;
  },

  // ══════════════════════════════════════════════════════════
  // READ-ONLY LECTURE PLAN VIEW (for a teacher's own batch)
  // ══════════════════════════════════════════════════════════
  _renderLecturePlanView(el, teacher, batch) {
    if (batch.teacherId !== teacher.id) {
      Toast.error('This batch is not assigned to you.');
      return;
    }

    const campus = AppState.findById('campuses', batch.campusId);
    const lpaMap = AppState.get('lpAssignments') || {};
    const lpa    = lpaMap[batch.id];

    const headerHTML = `
      <div class="tp-att-head">
        <button class="tp-back-btn" id="tpLpBack">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Back to Lecture Plans
        </button>
        <div class="tp-att-bar">
          <div>
            <div class="tp-att-batch">${lpa?.lpCode ? lpa.lpCode + ' — ' : ''}${lpa?.lpTitle || 'Lecture Plan'}</div>
            <div class="tp-att-sub">${batch.batchName || ''}${campus ? ' · ' + campus.campusName : ''}</div>
          </div>
        </div>
      </div>`;

    const backWire = () => {
      el.querySelector('#tpLpBack').addEventListener('click', () => this._renderLecturePlans(el, teacher));
    };

    const rows = lpa?.rows || [];
    if (!rows.length) {
      el.innerHTML = headerHTML + `
        <div class="tp-empty" style="margin-top:16px">
          No Lecture Plan has been assigned to <strong>${batch.batchName || 'this batch'}</strong> yet.
        </div>`;
      backWire();
      return;
    }

    const sorted = [...rows].sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });

    const total = sorted.length;
    const done  = sorted.filter(r => r.status === 'Done').length;
    const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

    el.innerHTML = headerHTML + `
      <div class="tp-att-statbar" style="margin-top:16px">
        <div style="display:flex;align-items:center;gap:12px;flex:1;flex-wrap:wrap">
          <span class="tp-pill p">${done} Done</span>
          <span class="tp-pill l">${total - done} Pending</span>
          <span style="font-size:12px;font-weight:800;color:var(--blue)">${pct}% complete</span>
        </div>
      </div>
      <div style="border:1px solid var(--border);border-radius:var(--r-lg, 12px);overflow:hidden;margin-top:14px">
        <table class="tp-att-table">
          <thead>
            <tr>
              <th class="tp-att-idx">#</th>
              <th>Date</th>
              <th>Topic</th>
              <th>Type</th>
              <th style="text-align:center">Status</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map((r, i) => `
              <tr>
                <td class="tp-att-idx">${i + 1}</td>
                <td>${r.date ? formatDisplayDate(r.date) : '—'}</td>
                <td style="font-weight:600">${r.topic || '—'}</td>
                <td>${r.type || 'Lecture'}</td>
                <td style="text-align:center">
                  <span style="font-weight:800;color:${r.status === 'Done' ? 'var(--green)' : 'var(--t3)'}">${r.status || 'Pending'}</span>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    backWire();
  },

  _cardHTML(batch) {
    const disc   = AppState.findById('disciplines', batch.disciplineId);
    const campus = AppState.findById('campuses', batch.campusId);
    const count  = this._activeStudentCount(batch.id);

    return `
      <div class="tp-card">
        <div class="tp-card-top">
          <div>
            <div class="tp-card-name">${batch.batchName || '—'}</div>
            <div class="tp-card-sub">${batch.sessionPeriod || ''}</div>
          </div>
        </div>
        <div class="tp-badges">
          ${disc ? `<span class="tp-badge">${disc.abbreviation || disc.fullName || ''}</span>` : ''}
          ${campus ? `<span class="tp-badge grey">${campus.campusName}</span>` : ''}
        </div>
        <div class="tp-card-row">
          <span class="tp-card-students">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            </svg>
            ${count} student${count !== 1 ? 's' : ''}
          </span>
          <button class="tp-mark-btn" data-mark-attendance="${batch.id}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
            Mark Attendance
          </button>
        </div>
      </div>`;
  },

  _activeStudentCount(batchId) {
    const enrolments = AppState.get('enrolments') || [];
    return enrolments.filter(e => e.batchId === batchId && e.status === 'active').length;
  },

  // ══════════════════════════════════════════════════════════
  // TODAY-ONLY ATTENDANCE VIEW
  // ══════════════════════════════════════════════════════════
  async _renderAttendanceView(el, teacher, batch) {
    // Ownership guard — a teacher may only mark their own batches,
    // even if someone tampers with the DOM/data attribute.
    if (batch.teacherId !== teacher.id) {
      Toast.error('This batch is not assigned to you.');
      return;
    }

    el.innerHTML = `<div class="tp-empty">Loading today's attendance…</div>`;

    const today = toISODate(new Date());

    // The other big part of the slowness: LecturePlanStorage.loadLectureData()
    // downloads EVERY batch's LP data system-wide on every call, with no
    // per-batch scoping on the backend. Until that's added server-side,
    // we cache it for 2 minutes client-side — LP data rarely changes
    // mid-day, so a teacher opening several batches back-to-back won't
    // re-trigger that full download each time.
    //
    // - fetchAndSyncBatchAttendance: several teachers/admins could be
    //   marking the same batch concurrently, so we need fresh records —
    //   no caching here, always live.
    // - LecturePlanStorage.loadLectureData(120000): served from the
    //   2-minute cache when available; only hits the network if stale.
    const [, lpResult] = await Promise.allSettled([
      fetchAndSyncBatchAttendance(batch.id, today),
      LecturePlanStorage.loadLectureData(120000),
    ]);

    if (lpResult.status === 'fulfilled' && lpResult.value) {
      const fresh = lpResult.value;
      if (Array.isArray(fresh.lecturePlans)) AppState._silentSet('lecturePlans', fresh.lecturePlans);
      if (fresh.lpRows)                      AppState._silentSet('lpRows', fresh.lpRows);
      if (fresh.lpAssignments)               AppState._silentSet('lpAssignments', fresh.lpAssignments);
    }

    // ── Class-day check — must match the admin Attendance module's
    // logic exactly: Lecture Plan rows take priority; the schedule
    // generator (batchSchedules) is only a fallback when no LP exists.
    const lpaMap = AppState.get('lpAssignments') || {};
    const lpa    = lpaMap[batch.id];
    let isClassDay;
    if (lpa?.rows?.length) {
      isClassDay = lpa.rows.some(r => r.date === today);
    } else {
      isClassDay = AttendanceDateGenerator.isClassDay(batch.id, today);
    }

    const disc       = AppState.findById('disciplines', batch.disciplineId);
    const campus     = AppState.findById('campuses', batch.campusId);

    const dateObj  = new Date(today + 'T00:00:00');
    const dateDisp = dateObj.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const headerHTML = `
      <div class="tp-att-head">
        <button class="tp-back-btn" id="tpAttBack">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Back to My Batches
        </button>
        <div class="tp-att-bar">
          <div>
            <div class="tp-att-batch">${disc ? disc.abbreviation + ' — ' : ''}${batch.batchName || ''}</div>
            <div class="tp-att-sub">${campus ? campus.campusName + ' · ' : ''}${batch.sessionPeriod || ''}</div>
          </div>
          <div class="tp-att-date">📅 Today · ${dateDisp}</div>
        </div>
      </div>`;

    const backWire = () => {
      el.querySelector('#tpAttBack').addEventListener('click', () => this._render(el, teacher));
    };

    // ── Not a scheduled class day today ─────────────────────────
    if (!isClassDay) {
      el.innerHTML = headerHTML + `
        <div class="tp-empty" style="margin-top:16px">
          No class is scheduled today for <strong>${batch.batchName || 'this batch'}</strong>.
        </div>`;
      backWire();
      return;
    }

    const enrolments = (AppState.get('enrolments') || []).filter(e => e.batchId === batch.id && e.status === 'active');
    const students = enrolments
      .map(e => AppState.findById('students', e.studentId))
      .filter(Boolean)
      .sort((a, b) => (a.studentName || '').localeCompare(b.studentName || ''));

    if (!students.length) {
      el.innerHTML = headerHTML + `
        <div class="tp-empty" style="margin-top:16px">No active students are enrolled in this batch.</div>`;
      backWire();
      return;
    }

    const canMark  = Auth.can('attendance:create') || Auth.can('attendance:edit');
    const markedBy = AppState.get('currentUser')?.userId || null;

    // ── Today's Lecture Plan entries — same info/style shown in the
    // Lecture Plans detail view (topic + Done/Pending), just for today,
    // right under the attendance sheet. A batch can have MORE THAN ONE
    // session on the same date (e.g. double lecture), so we show every
    // row that matches today — not just the first. Teachers who can
    // mark attendance for this batch can also toggle each row
    // Done/Pending and add a remark; both write through the SAME
    // LecturePlanService functions the admin editor uses, so changes
    // show up there too.
    const todayRows = (lpa?.rows || []).filter(r => r.date === today);

    const _escapeAttr = (s) => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');

    const _lpRowHTML = (row) => `
      <div class="tp-lp-row" data-row-id="${row.id}">
        <div class="tp-card-row">
          <span style="font-weight:600">${row.topic || '—'} <span style="color:var(--t3);font-weight:400">(${row.type || 'Lecture'})</span></span>
          <span style="display:flex;align-items:center;gap:10px">
            <span style="font-weight:800;color:${row.status === 'Done' ? 'var(--green)' : 'var(--t3)'}">${row.status || 'Pending'}</span>
            ${canMark ? `
              <button class="tp-lp-mark-btn ${row.status === 'Done' ? 'done' : 'todo'}" data-lp-mark="${row.id}">
                ${row.status === 'Done' ? 'Mark Pending' : 'Mark Done'}
              </button>` : ''}
          </span>
        </div>
        ${canMark
          ? `<div class="tp-lp-remark-row">
               <input type="text" class="tp-lp-remark-input" data-lp-remark="${row.id}"
                      placeholder="Add a remark…" value="${_escapeAttr(row.remarks)}" />
             </div>`
          : (row.remarks ? `<div class="tp-lp-remark-display">📝 ${row.remarks}</div>` : '')}
      </div>`;

    const _lpCardHTML = (rows) => `
      <div class="tp-card" id="tpTodayLpCard" style="margin-top:14px">
        <div class="tp-card-top">
          <div>
            <div class="tp-card-name">Today's Lecture Plan${rows.length > 1 ? ` · ${rows.length} sessions` : ''}</div>
            <div class="tp-card-sub">${lpa.lpCode ? lpa.lpCode + ' — ' : ''}${lpa.lpTitle || ''}</div>
          </div>
        </div>
        ${rows.map(_lpRowHTML).join('')}
      </div>`;

    const todayLpHTML = todayRows.length ? _lpCardHTML(todayRows) : '';

    el.innerHTML = headerHTML + `
      <div class="tp-att-statbar" id="tpStatBar" style="margin-top:16px"></div>
      <div style="border:1px solid var(--border);border-radius:var(--r-lg, 12px);overflow:hidden;margin-top:14px">
        <table class="tp-att-table">
          <thead>
            <tr>
              <th class="tp-att-idx">#</th>
              <th>Student Name</th>
              <th style="text-align:center">Status</th>
            </tr>
          </thead>
          <tbody id="tpAttBody"></tbody>
        </table>
      </div>
      ${todayLpHTML}`;

    // Push the current lecturePlans/lpRows/lpAssignments state to the
    // backend and invalidate the read cache, so the Lecture Plans page
    // picks up the change on next visit instead of showing stale data.
    const _persistLpChange = () => {
      LecturePlanStorage.setLectureData({
        lecturePlans:  AppState.get('lecturePlans')  || [],
        lpRows:        AppState.get('lpRows')        || {},
        lpAssignments: AppState.get('lpAssignments') || {},
      });
    };

    if (todayRows.length && canMark) {
      const _wireLpCard = () => {
        const card = el.querySelector('#tpTodayLpCard');
        if (!card) return;

        card.querySelectorAll('[data-lp-mark]').forEach(btn => {
          btn.addEventListener('click', () => {
            const row = todayRows.find(r => r.id === btn.dataset.lpMark);
            if (!row) return;
            btn.disabled = true;
            btn.style.opacity = '.6';

            const willBeDone = row.status !== 'Done';
            LecturePlanService.markRow(batch.id, row.id, willBeDone);
            _persistLpChange();
            row.status = willBeDone ? 'Done' : 'Pending';

            card.outerHTML = _lpCardHTML(todayRows);
            _wireLpCard(); // card node was just replaced — re-attach everything
            Toast.success(willBeDone ? 'Marked as Done.' : 'Marked as Pending.');
          });
        });

        card.querySelectorAll('[data-lp-remark]').forEach(input => {
          const _saveRemark = () => {
            const row = todayRows.find(r => r.id === input.dataset.lpRemark);
            if (!row) return;
            const val = input.value.trim();
            if (val === (row.remarks || '')) return; // unchanged — nothing to save
            row.remarks = val;
            LecturePlanService.setRowRemark(batch.id, row.id, val);
            _persistLpChange();
            Toast.success('Remark saved.');
          };
          input.addEventListener('blur', _saveRemark);
          input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
          });
        });
      };

      _wireLpCard();
    }

    backWire();

    const statBar = el.querySelector('#tpStatBar');
    const tbody   = el.querySelector('#tpAttBody');

    const SAVE_ICON  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`;
    const CHECK_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
    const SPIN_ICON  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:tpspin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;

    // ── Unsaved-changes staging ──────────────────────────────────
    // Clicking P/A/L only updates this local object — it does NOT call
    // AttendanceService (so nothing hits the backend yet). Only the
    // Save button commits `pending` to AttendanceService, which is what
    // actually persists it. If the teacher marks students and then
    // leaves without saving, `pending` simply disappears with this view
    // — nothing was ever written anywhere, so reopening the batch shows
    // only whatever was last actually saved.
    //   pending[studentId] = 'P' | 'A' | 'L'  → staged mark
    //   pending[studentId] = null              → staged "uncheck"
    //   key absent                             → no staged change (show saved value)
    let pending = {};

    const _hasPending = () => Object.keys(pending).length > 0;

    // Merge saved records with staged-but-unsaved changes, in the same
    // { studentId: { status } } shape AttendanceService.getRecordsForDate
    // returns, so the render functions below don't need to change.
    const _mergedRecords = () => {
      const saved  = AttendanceService.getRecordsForDate(batch.id, today);
      const merged = { ...saved };
      Object.entries(pending).forEach(([sid, status]) => {
        if (status === null) delete merged[sid];
        else merged[sid] = { status };
      });
      return merged;
    };

    // Reflects Save button appearance/enabled-state to match whether
    // there are unsaved staged changes right now.
    const _updateSaveState = () => {
      const btn = statBar.querySelector('#tpSaveBtn');
      if (!btn) return;
      const has = _hasPending();
      btn.disabled = !has;
      btn.style.opacity = has ? '1' : '.5';
      btn.style.pointerEvents = has ? 'auto' : 'none';
    };

    const _markSaved = () => {
      const btn = statBar.querySelector('#tpSaveBtn');
      if (!btn) return;
      btn.innerHTML = `${CHECK_ICON} Saved`;
      btn.style.background = 'var(--green)';
      btn.disabled = true;
      btn.style.opacity = '0.7';
      btn.style.pointerEvents = 'none';
      setTimeout(() => {
        const b = statBar.querySelector('#tpSaveBtn'); // re-query — don't trust a stale reference
        if (!b) return;
        b.innerHTML = `${SAVE_ICON} Save`;
        b.style.background = 'var(--blue)';
        _updateSaveState(); // back to dim, since pending is now empty (unless changed meanwhile)
      }, 2000);
    };

    const renderStats = () => {
      const existing = _mergedRecords();
      let p = 0, a = 0, l = 0;
      students.forEach(s => {
        const st = existing[s.id]?.status;
        if (st === 'P') p++; else if (st === 'A') a++; else if (st === 'L') l++;
      });
      const markedTotal = p + a + l;
      const pct = markedTotal > 0 ? Math.round((p / markedTotal) * 100) : null;
      const pctColor = pct === null ? 'var(--t3)' : pct >= 75 ? 'var(--green)' : 'var(--red)';

      statBar.innerHTML = `
        <div id="tpStatsInner" style="display:flex;align-items:center;gap:12px;flex:1;flex-wrap:wrap">
          ${markedTotal > 0 ? `
            <span class="tp-pill p">${p} P</span>
            <span class="tp-pill a">${a} A</span>
            <span class="tp-pill l">${l} Leave</span>
            <span style="font-size:12px;font-weight:800;color:${pctColor}">${pct}%</span>
          ` : `<span style="font-size:12px;color:var(--t3)">${students.length} students · Not marked yet</span>`}
          <span style="font-size:11px;color:var(--t3)">${markedTotal}/${students.length} marked</span>
        </div>
        ${canMark ? `
          <div class="tp-att-actions">
            <button class="tp-quick-btn p" id="tpAllP">All Present</button>
            <button class="tp-quick-btn a" id="tpAllA">All Absent</button>
            <button class="tp-mark-btn" id="tpSaveBtn" style="opacity:.5;pointer-events:none" disabled>
              ${SAVE_ICON} Save
            </button>
          </div>` : ''}
      `;

      // Stage "mark everyone P/A" — same rule as individual clicks:
      // if it matches what's already saved, clear the staged entry
      // instead of leaving a redundant no-op pending change.
      const _stageAll = (targetStatus) => {
        const saved = AttendanceService.getRecordsForDate(batch.id, today);
        students.forEach(s => {
          if ((saved[s.id]?.status || '') === targetStatus) delete pending[s.id];
          else pending[s.id] = targetStatus;
        });
        renderStats();
        _updateSaveState();
        renderRows();
      };

      statBar.querySelector('#tpAllP')?.addEventListener('click', () => _stageAll('P'));
      statBar.querySelector('#tpAllA')?.addEventListener('click', () => _stageAll('A'));

      statBar.querySelector('#tpSaveBtn')?.addEventListener('click', async () => {
        const changes = Object.entries(pending);
        if (!changes.length) return; // nothing staged — button should be disabled anyway

        const btn = statBar.querySelector('#tpSaveBtn');
        btn.innerHTML = `${SPIN_ICON} Saving...`;
        btn.disabled = true;

        // This is the ONE place staged changes actually get committed —
        // AttendanceService.markAttendance/clearAttendance are what hit
        // the backend (via _apiUpsert / DELETE), so nothing is persisted
        // anywhere until this runs.
        changes.forEach(([sid, status]) => {
          if (status === null) AttendanceService.clearAttendance(batch.id, sid, today);
          else AttendanceService.markAttendance(batch.id, sid, today, status, markedBy);
        });
        pending = {};

        await new Promise(r => setTimeout(r, 400));
        _markSaved();
        Toast.success('Attendance saved.');
      });
    };

    const rowHTML = (stu, idx, existing) => {
      const status = existing[stu.id]?.status || '';
      return `<tr data-sid="${stu.id}">
        <td class="tp-att-idx">${idx + 1}</td>
        <td style="font-weight:600">${stu.studentName || '—'}</td>
        <td style="text-align:center">
          ${canMark ? `
            <div class="tp-status-grp" data-sid="${stu.id}">
              ${['P', 'A', 'L'].map(s => {
                const active = status === s;
                const cfg = STATUS_CFG[s];
                const tip = active ? `${cfg.title} (click again to unmark)` : cfg.title;
                return `<button class="tp-status-btn" data-s="${s}" title="${tip}" style="
                  border:${active ? `2px solid ${cfg.color}` : '1.5px solid var(--border2)'};
                  background:${active ? `color-mix(in srgb, ${cfg.color} 15%, transparent)` : 'var(--surface2)'};
                  color:${active ? cfg.color : 'var(--t3)'};
                ">${cfg.label}</button>`;
              }).join('')}
            </div>`
            : `<span style="font-weight:800;color:${status === 'P' ? 'var(--green)' : status === 'A' ? 'var(--red)' : status === 'L' ? 'var(--t2)' : 'var(--t4)'}">${status || '—'}</span>`
          }
        </td>
      </tr>`;
    };

    const renderRows = () => {
      const existing = _mergedRecords();
      tbody.innerHTML = students.map((s, i) => rowHTML(s, i, existing)).join('');
    };

    renderStats();
    renderRows();

    if (canMark) {
      tbody.addEventListener('click', e => {
        const btn = e.target.closest('button[data-s]');
        if (!btn) return;
        const grp = btn.closest('.tp-status-grp');
        if (!grp) return;
        const sid    = grp.dataset.sid;
        const status = btn.dataset.s;

        const savedStatus = AttendanceService.getRecordsForDate(batch.id, today)[sid]?.status || '';
        const curStatus    = _mergedRecords()[sid]?.status || '';
        const isUnclick    = curStatus === status;
        const newEffective = isUnclick ? '' : status;

        // Stage the click. If it happens to match what's already saved
        // (e.g. teacher clicks then clicks back), drop the staged entry
        // entirely so Save correctly goes back to disabled when there's
        // truly nothing new to persist.
        if (newEffective === savedStatus) {
          delete pending[sid];
        } else {
          pending[sid] = newEffective === '' ? null : newEffective;
        }

        renderStats();
        _updateSaveState();
        renderRows();
      });
    }
  },
};
