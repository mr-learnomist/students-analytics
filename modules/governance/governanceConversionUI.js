// ============================================================
// modules/governance/governanceConversionUI.js — Governance
// Conversion Watch (consolidated)
//
// Governance-scope companion to governanceAttendanceUI.js, shown
// in the same Horizon View. Instead of attendance tiers, this rolls
// up subject-to-subject CONVERSION across every campus the
// governance user has access to:
//
//     Campus → Segment → Batch → Student
//
// Segments (ported straight from the two existing analytics reports
// so the numbers always match what those reports show):
//   modules/analytics/reports/batches/conversionTracking.js
//     FA track: FA1 → FA2, FA2 → F3
//     MA track: MA1 → MA2, MA2 → F2
//   modules/analytics/reports/batches/prcConversionTracking.js
//     PRC (BEI/FA/ECS/QAB) → CAF Group A (FAR/TPC/DSR/BLD)
//     CAF Group A (FAR/TPC/DSR/BLD) → CAF Group B (MA/CR/BIA/AAE)
//
// BATCH-LEVEL RULE (not student-level): a whole batch is judged, not
// individual students. If a student's FROM-stage batch (e.g. their
// FA1 batch) is still ACTIVE, none of that batch's students count
// toward conversion yet — full stop, no exceptions. Only once the
// FROM-stage batch is CLOSED do its students get counted (converted
// or not). Batch status uses the same canonical logic as
// governanceAttendanceUI.js's _batchStatus(), ported from
// testResultSummary.js.
//
// Subject code is read the same way both source reports read it:
// the batch name's first hyphen-separated segment, with any
// "(...)" paper suffix stripped — e.g. "FA1-June-26-1" → "FA1",
// "BEI (P3)-June-26-1" → "BEI".
//
// CAMPUS SCOPING for a segment: a student is attributed to whichever
// campus their FROM-stage batch was at (e.g. for FA1 → FA2, the
// campus of their FA1 enrolment) — same idea as "which campus gets
// credit for starting this student on the track". For PRC → CAF,
// the campus of whichever PRC subject was found first (BEI, then
// FA, then ECS, then QAB) is used.
//
// CAMPUS SCOPING for the governance user themself is identical to
// governanceAttendanceUI.js — see that file's header comment for
// the two conventions (pure governance role vs additive access).
// ============================================================

import { AppState } from '../../utils/state.js';
import { getAllAssignments } from '../lecturePlan/lecturePlanService.js';

// ── Subject chains — copied 1:1 from the source reports ──────────
const FA_CHAIN   = ['FA1', 'FA2', 'F3'];
const MA_CHAIN   = ['MA1', 'MA2', 'F2'];
const PRC_CODES  = ['BEI', 'FA', 'ECS', 'QAB'];
const CAF_A_CODES = ['FAR', 'TPC', 'DSR', 'BLD'];
const CAF_B_CODES = ['MA', 'CR', 'BIA', 'AAE'];

const ALL_TRACK_CODES = [...new Set([
  ...FA_CHAIN, ...MA_CHAIN, ...PRC_CODES, ...CAF_A_CODES, ...CAF_B_CODES,
])];

// The exact breakdown requested: FA1→FA2, FA2→F3, MA1→MA2, MA2→F2,
// PRC→CAF Group A, PRC→CAF Group B.
const SEGMENTS = [
  { key: 'fa1_fa2', label: 'FA1 → FA2',            from: ['FA1'],     to: ['FA2'] },
  { key: 'fa2_f3',  label: 'FA2 → F3',              from: ['FA2'],     to: ['F3']  },
  { key: 'ma1_ma2', label: 'MA1 → MA2',             from: ['MA1'],     to: ['MA2'] },
  { key: 'ma2_f2',  label: 'MA2 → F2',              from: ['MA2'],     to: ['F2']  },
  { key: 'prc_capa', label: 'PRC → CAF Group A',       from: PRC_CODES,   to: CAF_A_CODES },
  { key: 'capa_capb', label: 'CAF Group A → Group B',  from: CAF_A_CODES, to: CAF_B_CODES },
];

let _stylesInjected = false;
function _injectStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const style = document.createElement('style');
  style.id = 'gc-styles';
  style.textContent = `
    .gc-wrap {
      position:relative; display:flex; flex-direction:column; gap:12px; max-width:680px;
      background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:14px;
    }
    .gc-wrap.gc-fullscreen {
      position:fixed; inset:0; z-index:9999; max-width:none; width:100vw; height:100vh;
      border-radius:0; margin:0; overflow-y:auto;
    }
    /* True edge-to-edge via the browser Fullscreen API — no address
       bar, no chrome. Overrides the UA's default centered/black box. */
    .gc-wrap:fullscreen, .gc-wrap:-webkit-full-screen {
      width:100vw; height:100vh; max-width:none; max-height:none; margin:0;
      border-radius:0; overflow-y:auto; background:var(--surface);
    }
    .gc-wrap::backdrop, .gc-wrap::-webkit-full-screen-backdrop { background:var(--surface); }
    .gc-header-row { display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .gc-fs-btn {
      width:26px; height:26px; flex-shrink:0; display:flex; align-items:center; justify-content:center;
      border-radius:7px; border:1px solid var(--border2); background:var(--surface2); color:var(--t2);
      cursor:pointer; padding:0;
    }
    .gc-fs-btn:hover { background:var(--surface3, var(--border2)); color:var(--t1); }
    .gc-title { font-size:14px; font-weight:800; color:var(--t1); }
    .gc-empty { text-align:center; padding:36px 20px; color:var(--t3); font-size:13px; border:1px dashed var(--border2); border-radius:12px; }

    .gc-summary-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; }
    @media (max-width:520px) { .gc-summary-grid { grid-template-columns:repeat(2, 1fr); } }
    .gc-summary-card { border:1px solid var(--border2); border-radius:10px; padding:9px 4px; text-align:center; background:var(--surface); }
    .gc-summary-num { font-size:17px; font-weight:800; color:var(--blue); }
    .gc-summary-lbl { font-size:8.5px; font-weight:700; color:var(--t3); text-transform:uppercase; letter-spacing:.01em; margin-top:2px; line-height:1.2; }
    .gc-summary-sub { font-size:8px; color:var(--t3); margin-top:1px; }
    .gc-summary-stat { font-size:8.5px; color:var(--t2); font-weight:600; margin-top:3px; border-top:1px dashed var(--border2); padding-top:3px; }
    .gc-outlier-count { color:#ca8a04; font-weight:700; }

    .gc-outlier-toggle {
      display:flex; align-items:center; gap:7px; font-size:11.5px; color:var(--t2); cursor:pointer; user-select:none;
    }
    .gc-outlier-toggle input { width:14px; height:14px; accent-color:var(--blue); cursor:pointer; }

    .gc-row-hdr { display:flex; align-items:center; gap:8px; padding:11px 13px; cursor:pointer; }
    .gc-row-hdr:hover { background:var(--surface2); }
    .gc-row-name { font-size:13px; font-weight:700; color:var(--t1); flex:1; }
    .gc-row-name.small { font-size:12.5px; font-weight:600; }
    .gc-row-body { padding:8px 13px 12px 33px; border-top:1px solid var(--border2); }
    .gc-chev { color:var(--t3); transition:transform .15s; flex-shrink:0; }
    .gc-chev.open { transform:rotate(90deg); }

    .gc-campus-row  { border:1px solid var(--border2); border-radius:12px; margin-bottom:10px; overflow:hidden; background:var(--surface); }
    .gc-campus-row > .gc-row-hdr { background:var(--surface2); }
    .gc-segment-row { border:1px solid var(--border2); border-radius:10px; margin-bottom:8px; overflow:hidden; }
    .gc-batch-row   { border:1px solid var(--border2); border-radius:9px; margin-bottom:6px; overflow:hidden; }

    .gc-pct-tag { font-size:11px; font-weight:800; padding:2px 8px; border-radius:6px; white-space:nowrap; }
    .gc-pct-tag.hi  { background:color-mix(in srgb, var(--green) 15%, transparent); color:var(--green); }
    .gc-pct-tag.mid { background:color-mix(in srgb, #ca8a04 15%, transparent); color:#ca8a04; }
    .gc-pct-tag.lo  { background:color-mix(in srgb, var(--red) 15%, transparent); color:var(--red); }
    .gc-pct-tag.none { background:var(--surface2); color:var(--t3); }
    .gc-count-sub { font-size:10.5px; color:var(--t3); white-space:nowrap; }

    .gc-batch-check { width:14px; height:14px; accent-color:var(--blue); cursor:pointer; flex-shrink:0; }
    .gc-row-hdr.excluded { opacity:.5; }
    .gc-row-hdr.excluded .gc-row-name { text-decoration:line-through; }

    .gc-batch-search {
      width:100%; height:30px; padding:0 10px; margin-bottom:8px; border-radius:8px;
      border:1px solid var(--border2); background:var(--surface); color:var(--t1); font-size:12px; box-sizing:border-box;
    }

    .gc-tier-label { font-size:10.5px; font-weight:800; text-transform:uppercase; margin:8px 0 6px; }
    .gc-tier-label:first-child { margin-top:0; }
    .gc-tier-label.converted  { color:var(--green); }
    .gc-tier-label.notyet     { color:var(--t3); }

    .gc-student-item { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:7px 9px; border-radius:8px; background:var(--surface2); margin-bottom:6px; }
    .gc-student-item .name { font-size:12px; font-weight:600; color:var(--t1); }
    .gc-student-item .code { font-size:10.5px; color:var(--t3); margin-left:6px; }
  `;
  document.head.appendChild(style);
}

function _esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _chevSVG(isOpen) {
  return `<svg class="gc-chev${isOpen ? ' open' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="9 18 15 12 9 6"/></svg>`;
}

function _fsIconSVG(isFullscreen) {
  return isFullscreen
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/></svg>`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`;
}

function _pctTagClass(pct) {
  if (pct >= 70) return 'hi';
  if (pct >= 40) return 'mid';
  return 'lo';
}

export const GovernanceConversionModule = {

  mount(el, ctx) {
    if (!el) return;
    _injectStyles();
    this._el = el;
    this._ctx = ctx || {};
    this._expandedCampuses = new Set();
    this._expandedSegments = new Set();
    this._expandedBatches  = new Set();
    this._excludedBatchIds = new Set(); // batches unchecked out of the rollup — in-memory only, never saved
    this._batchSearch      = new Map(); // segmentKey -> search text
    this._removeOutliers   = false;     // stats-only toggle — never affects the rollup/drill-down itself
    this._isFullscreen     = false;

    // Native Fullscreen API state can change from outside our button
    // (browser's own ESC handling, swipe-down, etc.) — this listener
    // keeps `this._isFullscreen` and the icon in sync whenever that
    // happens, bound once so a remount never stacks duplicates.
    if (!this._fsChangeBound) {
      this._fsChangeBound = true;
      const syncFs = () => {
        const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (active !== this._isFullscreen) {
          this._isFullscreen = active;
          document.body.style.overflow = active ? 'hidden' : '';
          this._render();
        }
      };
      document.addEventListener('fullscreenchange', syncFs);
      document.addEventListener('webkitfullscreenchange', syncFs);
    }

    // Fallback path only: if the browser doesn't support the
    // Fullscreen API, _toggleFullscreen() falls back to the CSS
    // overlay above, which native ESC handling won't dismiss — so we
    // still listen for it, but only act when native fullscreen isn't
    // actually engaged (document.fullscreenElement is empty).
    if (!this._escBound) {
      this._escBound = true;
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this._isFullscreen && !document.fullscreenElement) this._toggleFullscreen();
      });
    }

    const user = this._ctx.user || AppState.get('currentUser') || AppState.get('user');
    if (!user) {
      el.innerHTML = `<div class="gc-empty">Unable to determine the current user.</div>`;
      return;
    }

    const scopeCampusIds = this._accessibleCampusIds(user);
    const allCampuses = AppState.get('campuses') || [];
    const campuses = scopeCampusIds === null
      ? allCampuses
      : allCampuses.filter(c => scopeCampusIds.includes(c.id));

    if (!campuses.length) {
      el.innerHTML = `<div class="gc-empty">No campus access assigned for Governance yet. Ask an admin to grant campus access from Governance → Access.</div>`;
      return;
    }

    this._campuses = campuses;
    this._batchesById = new Map((AppState.get('batches') || []).map(b => [b.id, b]));
    this._students = this._buildStudentSubjectMap();
    this._render();
  },

  // ── ported 1:1 from governanceAttendanceUI.js / testResultSummary.js
  // so "closed batch" means exactly the same thing everywhere ──
  _batchStatus(batch) {
    const today = new Date(); today.setHours(0, 0, 0, 0);

    let effectiveEnd = batch.endDate || '';

    if ((!effectiveEnd || batch.endDateMode !== 'manual') && batch.id) {
      try {
        const assignment = getAllAssignments()[batch.id];
        const rows = assignment?.rows || [];
        const datedRows = rows.filter(r => r.date);
        if (datedRows.length) {
          const lpLastDate = datedRows[datedRows.length - 1].date;
          if (lpLastDate && batch.endDateMode !== 'manual') {
            effectiveEnd = lpLastDate;
          } else if (lpLastDate && !effectiveEnd) {
            effectiveEnd = lpLastDate;
          }
        }
      } catch (e) { /* LP not available — use saved endDate */ }
    }

    if (!effectiveEnd) return 'active';

    const end = new Date(effectiveEnd); end.setHours(0, 0, 0, 0);
    return end <= today ? 'closed' : 'active';
  },

  // ── Campus scoping for the governance user — identical logic to
  // governanceAttendanceUI.js's _accessibleCampusIds() ──
  _accessibleCampusIds(user) {
    const isPureGovernance = user.role === 'governance';
    if (isPureGovernance) {
      return (user.campusIds && user.campusIds.length) ? user.campusIds : null; // null = all campuses
    }
    const gc = user.governanceAccess;
    if (!gc || !gc.enabled) return [];
    return gc.campusIds || [];
  },

  // ── Build studentId → { subjects: { CODE: { campusId, status } } } —
  // reads subject code from batch name exactly like conversionTracking.js
  // and prcConversionTracking.js do, scoped to the codes this widget cares
  // about (FA/MA/PRC/CAF).
  _buildStudentSubjectMap() {
    const enrolments = AppState.get('enrolments') || [];
    const batches    = AppState.get('batches')    || [];
    const students    = AppState.get('students')  || [];

    const map = {};

    enrolments.forEach(enr => {
      const student = students.find(s => s.id === enr.studentId);
      if (!student) return;

      const subjList = Array.isArray(enr.subjects) && enr.subjects.length
        ? enr.subjects
        : [{ batchId: enr.batchId, status: enr.status }];

      subjList.forEach(sub => {
        const batchId  = sub.batchId || enr.batchId;
        const batchRec = batches.find(b => b.id === batchId);
        if (!batchRec) return;

        const batchName  = sub.batchName || batchRec.batchName || '';
        const parts      = batchName.split('-');
        // Strip a "(...)" paper suffix, e.g. "BEI (P3)" → "BEI"
        const rawSubject = (parts[0] || '').trim();
        const code       = rawSubject.split('(')[0].trim().toUpperCase();
        if (!ALL_TRACK_CODES.includes(code)) return;

        if (!map[enr.studentId]) {
          map[enr.studentId] = {
            studentId: enr.studentId,
            studentName: student.studentName || '—',
            studentCode: student.studentCode || student.admissionNo || '',
            subjects: {},
          };
        }
        if (!map[enr.studentId].subjects[code]) {
          map[enr.studentId].subjects[code] = {
            campusId: batchRec.campusId || '',
            batchId: batchRec.id,
            status: sub.status || enr.status || 'active',
          };
        }
      });
    });

    return Object.values(map);
  },

  _studentHasAny(student, codes) {
    return codes.some(c => student.subjects[c]);
  },

  // Campus credited for a segment = campus of the first matching
  // FROM-stage subject found (in the order the codes are listed).
  _studentFromCampusId(student, fromCodes) {
    for (const c of fromCodes) {
      if (student.subjects[c]) return student.subjects[c].campusId;
    }
    return '';
  },

  // Batch credited for a segment = batch of the first matching
  // FROM-stage subject found (same order as _studentFromCampusId).
  _studentFromBatchId(student, fromCodes) {
    for (const c of fromCodes) {
      if (student.subjects[c]) return student.subjects[c].batchId;
    }
    return null;
  },

  // For one campus + one segment: which students started it (base —
  // ONLY counting students whose FROM-stage batch has closed) and
  // which of those also reached the target stage (converted),
  // grouped by their FROM-stage batch for the drill-down.
  _computeSegmentForCampus(campusId, seg) {
    const rawBase = this._students.filter(s =>
      this._studentHasAny(s, seg.from) && this._studentFromCampusId(s, seg.from) === campusId
    );

    // Batch-level rule: if the FROM-stage batch is still active, none
    // of its students count toward conversion yet — full stop. We're
    // judging the batch, not individual students.
    const eligibleBase = rawBase.filter(s => {
      const batch = this._batchesById.get(this._studentFromBatchId(s, seg.from));
      return batch && this._batchStatus(batch) === 'closed';
    });

    // Group into batches first (ALL eligible batches, including any the
    // user has manually excluded — they still need to render with
    // their checkbox), then roll up only the non-excluded ones.
    const batchMap = new Map();
    eligibleBase.forEach(s => {
      const batchId = this._studentFromBatchId(s, seg.from);
      if (!batchMap.has(batchId)) {
        batchMap.set(batchId, { batch: this._batchesById.get(batchId), students: [] });
      }
      batchMap.get(batchId).students.push(s);
    });
    const batchGroups = [...batchMap.values()].map(g => {
      const bConverted = g.students.filter(s => this._studentHasAny(s, seg.to));
      const bNotYet = g.students.filter(s => !this._studentHasAny(s, seg.to));
      const bPct = g.students.length ? Math.round((bConverted.length / g.students.length) * 100) : 0;
      return {
        batch: g.batch, students: g.students, converted: bConverted, notYet: bNotYet, pct: bPct,
        excluded: this._excludedBatchIds.has(g.batch?.id),
      };
    }).sort((a, b) => (a.batch?.batchName || '').localeCompare(b.batch?.batchName || ''));

    const includedGroups = batchGroups.filter(g => !g.excluded);
    const base      = includedGroups.flatMap(g => g.students);
    const converted = includedGroups.flatMap(g => g.converted);
    const notYet    = includedGroups.flatMap(g => g.notYet);
    const pct = base.length ? Math.round((converted.length / base.length) * 100) : 0;

    return { seg, base, converted, notYet, pct, batchGroups };
  },

  _mean(arr) {
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  },

  _stddev(arr, mean) {
    if (arr.length < 2) return 0;
    const variance = arr.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (arr.length - 1);
    return Math.sqrt(variance);
  },

  // Batch-level % values for a segment (across all in-scope campuses,
  // respecting manual excludes, ignoring batches with 0 students) —
  // this is a pure STATS layer: it never changes the rollup/drill-down,
  // only what the average/std-dev line under each card shows.
  _segmentStats(campusNodes, segIndex) {
    const values = campusNodes
      .flatMap(cn => cn.segments[segIndex].batchGroups)
      .filter(g => !g.excluded && g.students.length > 0)
      .map(g => g.pct);

    const rawMean = this._mean(values);
    const rawSd   = this._stddev(values, rawMean);

    if (!this._removeOutliers || values.length < 3 || rawSd === 0) {
      return { mean: rawMean, stddev: rawSd, n: values.length, removed: 0 };
    }

    // Outlier = more than 2 standard deviations from the raw mean
    const kept = values.filter(v => Math.abs(v - rawMean) <= 2 * rawSd);
    if (!kept.length || kept.length === values.length) {
      return { mean: rawMean, stddev: rawSd, n: values.length, removed: 0 };
    }
    const mean = this._mean(kept);
    return { mean, stddev: this._stddev(kept, mean), n: kept.length, removed: values.length - kept.length };
  },

  _computeCampusTree() {
    const campusNodes = this._campuses.map(campus => {
      const segments = SEGMENTS.map(seg => this._computeSegmentForCampus(campus.id, seg));
      return { campus, segments };
    });

    // Grand totals = sum of the already campus-scoped segment results
    // above (not recomputed from the full unscoped student list) —
    // this guarantees the top summary cards always match what the
    // campus drill-down shows, and never include campuses outside
    // this governance user's access.
    const grandSegments = SEGMENTS.map((seg, i) => {
      const base      = campusNodes.flatMap(cn => cn.segments[i].base);
      const converted = campusNodes.flatMap(cn => cn.segments[i].converted);
      const pct = base.length ? Math.round((converted.length / base.length) * 100) : 0;
      return { seg, base, converted, pct, stats: this._segmentStats(campusNodes, i) };
    });

    return { campusNodes, grandSegments };
  },

  _pctTagHTML(pct, baseLen) {
    if (!baseLen) return `<span class="gc-pct-tag none">No data</span>`;
    return `<span class="gc-pct-tag ${_pctTagClass(pct)}">${pct}%</span>`;
  },

  _render() {
    const el = this._el;
    const tree = this._computeCampusTree();
    this._tree = tree;

    el.innerHTML = `
      <div class="gc-wrap${this._isFullscreen ? ' gc-fullscreen' : ''}">
        <div class="gc-header-row">
          <div class="gc-title">Conversion</div>
          <button type="button" class="gc-fs-btn" id="gcFsBtn" title="${this._isFullscreen ? 'Exit full screen' : 'Full screen'}" aria-label="${this._isFullscreen ? 'Exit full screen' : 'Full screen'}">${_fsIconSVG(this._isFullscreen)}</button>
        </div>

        <label class="gc-outlier-toggle">
          <input type="checkbox" id="gcRemoveOutliers" ${this._removeOutliers ? 'checked' : ''} />
          Remove outliers (batches &gt;2σ from the mean)
        </label>

        <div class="gc-summary-grid">
          ${tree.grandSegments.map(g => `
            <div class="gc-summary-card">
              <div class="gc-summary-num">${g.base.length ? g.pct + '%' : '—'}</div>
              <div class="gc-summary-lbl">${_esc(g.seg.label)}</div>
              <div class="gc-summary-sub">${g.converted.length}/${g.base.length}</div>
              <div class="gc-summary-stat">${g.stats.n ? `Avg ${g.stats.mean.toFixed(1)}% ± ${g.stats.stddev.toFixed(1)}%` : 'No batch data'}${g.stats.removed ? ` <span class="gc-outlier-count">(${g.stats.removed} excl.)</span>` : ''}</div>
            </div>
          `).join('')}
        </div>

        <div id="gcCampusList">
          ${tree.campusNodes.length ? tree.campusNodes.map(cn => this._campusRowHTML(cn)).join('') : `<div class="gc-empty">No students found in your assigned campuses.</div>`}
        </div>
      </div>`;

    const fsBtn = el.querySelector('#gcFsBtn');
    if (fsBtn) fsBtn.addEventListener('click', () => this._toggleFullscreen());

    this._bindOutlierToggle();
    this._bindEvents();
  },

  // Toggling full screen just flips a flag and re-renders — all
  // drill-down state (_expandedCampuses/_expandedSegments/_expandedBatches
  // etc.) lives on `this`, not in the DOM, so it survives the toggle
  // untouched in both directions.
  //
  // Uses the real browser Fullscreen API on the card itself so it's
  // genuinely edge-to-edge (no address bar / browser chrome). Falls
  // back to a CSS full-viewport overlay only if the API is missing
  // or the browser blocks the request.
  async _toggleFullscreen() {
    const wrap = this._el.querySelector('.gc-wrap');

    if (!this._isFullscreen) {
      try {
        const req = wrap && (wrap.requestFullscreen || wrap.webkitRequestFullscreen || wrap.msRequestFullscreen);
        if (req) {
          await req.call(wrap);
          return; // fullscreenchange listener flips the flag + re-renders
        }
      } catch (e) { /* blocked/unsupported — fall through to CSS overlay */ }
      this._isFullscreen = true;
      document.body.style.overflow = 'hidden';
      this._render();
    } else {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        try {
          const exit = document.exitFullscreen || document.webkitExitFullscreen;
          if (exit) { await exit.call(document); return; } // fullscreenchange listener handles the rest
        } catch (e) { /* ignore — fall through to manual reset below */ }
      }
      this._isFullscreen = false;
      document.body.style.overflow = '';
      this._render();
    }
  },

  _bindOutlierToggle() {
    const el = this._el;
    const outlierCb = el.querySelector('#gcRemoveOutliers');
    if (outlierCb) {
      outlierCb.addEventListener('change', () => {
        this._removeOutliers = outlierCb.checked;
        this._render();
      });
    }
  },

  _campusRowHTML(cn) {
    const isOpen = this._expandedCampuses.has(cn.campus.id);
    return `
      <div class="gc-campus-row">
        <div class="gc-row-hdr" data-toggle-campus="${cn.campus.id}">
          ${_chevSVG(isOpen)}
          <span class="gc-row-name">${_esc(cn.campus.campusName)}</span>
        </div>
        ${isOpen ? `
          <div class="gc-row-body">
            ${cn.segments.map(sg => this._segmentRowHTML(cn.campus.id, sg)).join('')}
          </div>` : ''}
      </div>`;
  },

  _segmentRowHTML(campusId, sg) {
    const key = `${campusId}__${sg.seg.key}`;
    const isOpen = this._expandedSegments.has(key);
    const searchVal = this._batchSearch.get(key) || '';
    const visibleBatchGroups = searchVal.trim()
      ? sg.batchGroups.filter(bg => (bg.batch?.batchName || '').toLowerCase().includes(searchVal.trim().toLowerCase()))
      : sg.batchGroups;
    return `
      <div class="gc-segment-row">
        <div class="gc-row-hdr" data-toggle-segment="${key}">
          ${_chevSVG(isOpen)}
          <span class="gc-row-name small">${_esc(sg.seg.label)}</span>
          <span class="gc-count-sub">${sg.converted.length}/${sg.base.length}</span>
          ${this._pctTagHTML(sg.pct, sg.base.length)}
        </div>
        ${isOpen ? `
          <div class="gc-row-body">
            ${sg.batchGroups.length > 1 ? `
              <input type="text" class="gc-batch-search" data-batch-search="${key}" placeholder="Search batch…" value="${_esc(searchVal)}" />
            ` : ''}
            ${visibleBatchGroups.length
              ? visibleBatchGroups.map(bg => this._batchGroupRowHTML(key, bg)).join('')
              : `<div class="gc-empty" style="padding:6px 0">${sg.batchGroups.length ? `No batch matches "${_esc(searchVal)}".` : 'No closed batches on this segment for this campus yet.'}</div>`}
          </div>` : ''}
      </div>`;
  },

  _batchGroupRowHTML(segKey, bg) {
    const batchId = bg.batch?.id || 'unknown';
    const key = `${segKey}__${batchId}`;
    const isOpen = this._expandedBatches.has(key);
    return `
      <div class="gc-batch-row">
        <div class="gc-row-hdr ${bg.excluded ? 'excluded' : ''}" data-toggle-conv-batch="${key}">
          <input type="checkbox" class="gc-batch-check" data-toggle-conv-batch-include="${batchId}" title="Include in totals" ${bg.excluded ? '' : 'checked'} />
          ${_chevSVG(isOpen)}
          <span class="gc-row-name small">${_esc(bg.batch?.batchName || 'Unknown batch')}</span>
          <span class="gc-count-sub">${bg.converted.length}/${bg.students.length}</span>
          ${this._pctTagHTML(bg.pct, bg.students.length)}
        </div>
        ${isOpen ? `
          <div class="gc-row-body">
            ${bg.converted.length ? `
              <div class="gc-tier-label converted">Converted (${bg.converted.length})</div>
              ${bg.converted.map(s => `
                <div class="gc-student-item">
                  <span class="name">${_esc(s.studentName)}<span class="code">${_esc(s.studentCode)}</span></span>
                </div>`).join('')}
            ` : ''}
            ${bg.notYet.length ? `
              <div class="gc-tier-label notyet">Not Yet (${bg.notYet.length})</div>
              ${bg.notYet.map(s => `
                <div class="gc-student-item">
                  <span class="name">${_esc(s.studentName)}<span class="code">${_esc(s.studentCode)}</span></span>
                </div>`).join('')}
            ` : ''}
          </div>` : ''}
      </div>`;
  },

  _bindEvents() {
    const el = this._el;

    el.querySelectorAll('[data-toggle-campus]').forEach(hdr => {
      hdr.addEventListener('click', () => {
        const id = hdr.dataset.toggleCampus;
        if (this._expandedCampuses.has(id)) this._expandedCampuses.delete(id);
        else this._expandedCampuses.add(id);
        this._rerenderList();
      });
    });

    el.querySelectorAll('[data-toggle-segment]').forEach(hdr => {
      hdr.addEventListener('click', () => {
        const key = hdr.dataset.toggleSegment;
        if (this._expandedSegments.has(key)) this._expandedSegments.delete(key);
        else this._expandedSegments.add(key);
        this._rerenderList();
      });
    });

    el.querySelectorAll('[data-toggle-conv-batch]').forEach(hdr => {
      hdr.addEventListener('click', (e) => {
        if (e.target.closest('[data-toggle-conv-batch-include]')) return; // checkbox clicks shouldn't expand/collapse
        const key = hdr.dataset.toggleConvBatch;
        if (this._expandedBatches.has(key)) this._expandedBatches.delete(key);
        else this._expandedBatches.add(key);
        this._rerenderList();
      });
    });

    el.querySelectorAll('[data-toggle-conv-batch-include]').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.toggleConvBatchInclude;
        if (cb.checked) this._excludedBatchIds.delete(id);
        else this._excludedBatchIds.add(id);
        this._render(); // exclusion changes every rollup level, so recompute the whole tree
      });
    });

    el.querySelectorAll('[data-batch-search]').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const key = inp.dataset.batchSearch;
        this._batchSearch.set(key, e.target.value);
        this._rerenderList();
        const refocused = this._el.querySelector(`[data-batch-search="${key}"]`);
        if (refocused) { refocused.focus(); refocused.setSelectionRange(refocused.value.length, refocused.value.length); }
      });
    });
  },

  _rerenderList() {
    const el = this._el;
    const list = el.querySelector('#gcCampusList');
    if (!list) return;
    list.innerHTML = this._tree.campusNodes.length
      ? this._tree.campusNodes.map(cn => this._campusRowHTML(cn)).join('')
      : `<div class="gc-empty">No students found in your assigned campuses.</div>`;
    this._bindEvents();
  },
};
