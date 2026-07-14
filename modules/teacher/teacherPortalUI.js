// ============================================================
// modules/teacher/teacherPortalUI.js — Teacher Portal (shell)
// Route: teacherPortal — mounted only for role === 'teacher'
//
// Shows the logged-in teacher's own assigned batches.
// This is a SHELL: batch cards + a "Mark Attendance" entry point.
// The actual attendance-marking screen is intentionally left as
// an extension point (see _openMarkAttendance below) so it can
// be filled in separately without touching the list/layout code.
// ============================================================

import { AppState }  from '../../utils/state.js';
import { Auth }       from '../../utils/auth.js';
import { _avatarHTML } from './teacherUI.js';

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
`;
  document.head.appendChild(st);
}

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

  _render(el, teacher) {
    const allBatches = AppState.get('batches') || [];
    const myBatches   = allBatches.filter(b => b.teacherId === teacher.id);

    const totalStudents = myBatches.reduce((sum, b) => sum + this._activeStudentCount(b.id), 0);

    el.innerHTML = `
      <div class="tp-wrap">

        <!-- Hero / welcome -->
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

        <!-- Search -->
        <div class="tp-search-row">
          <input id="tpSearch" class="tp-search" type="text" placeholder="Search your batches…"/>
        </div>

        <!-- Batch grid -->
        <div class="tp-grid" id="tpGrid"></div>
      </div>`;

    const gridEl   = el.querySelector('#tpGrid');
    const searchEl = el.querySelector('#tpSearch');

    const renderGrid = (filterText = '') => {
      const q = filterText.trim().toLowerCase();
      const filtered = !q ? myBatches : myBatches.filter(b =>
        (b.batchName || '').toLowerCase().includes(q)
      );

      if (!filtered.length) {
        gridEl.innerHTML = `
          <div class="tp-empty" style="grid-column:1/-1">
            ${myBatches.length
              ? 'No batches match your search.'
              : 'No batches have been assigned to you yet.'}
          </div>`;
        return;
      }

      gridEl.innerHTML = filtered.map(b => this._cardHTML(b)).join('');

      gridEl.querySelectorAll('[data-mark-attendance]').forEach(btn => {
        btn.addEventListener('click', () => this._openMarkAttendance(btn.dataset.markAttendance));
      });
    };

    renderGrid();
    searchEl.addEventListener('input', () => renderGrid(searchEl.value));
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

  // ── Extension point ──────────────────────────────────────────
  // Called when a teacher clicks "Mark Attendance" on a batch card.
  // Build the actual attendance-marking screen here (or route to it).
  _openMarkAttendance(batchId) {
    console.log('[TeacherPortal] Mark Attendance requested for batch:', batchId);
    alert('Attendance marking screen goes here — batch ID: ' + batchId);
  },
};
