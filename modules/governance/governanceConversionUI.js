// ============================================================
// modules/governance/governanceConversionUI.js — Governance
// Conversion Watch (consolidated)
//
// Governance-scope companion to governanceAttendanceUI.js, shown
// in the same Horizon View. Instead of attendance tiers, this rolls
// up subject-to-subject CONVERSION across every campus the
// governance user has access to:
//
//     Campus → Segment → Student
//
// Segments (ported straight from the two existing analytics reports
// so the numbers always match what those reports show):
//   modules/analytics/reports/batches/conversionTracking.js
//     FA track: FA1 → FA2, FA2 → F3
//     MA track: MA1 → MA2, MA2 → F2
//   modules/analytics/reports/batches/prcConversionTracking.js
//     PRC (BEI/FA/ECS/QAB) → CAF Group A (FAR/TPC/DSR/BLD)
//     PRC (BEI/FA/ECS/QAB) → CAF Group B (MA/CR/BIA/AAE)
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
  { key: 'prc_capa', label: 'PRC → CAF Group A',    from: PRC_CODES,   to: CAF_A_CODES },
  { key: 'prc_capb', label: 'PRC → CAF Group B',    from: PRC_CODES,   to: CAF_B_CODES },
];

let _stylesInjected = false;
function _injectStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const style = document.createElement('style');
  style.id = 'gc-styles';
  style.textContent = `
    .gc-wrap {
      display:flex; flex-direction:column; gap:12px; max-width:680px;
      background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:14px;
    }
    .gc-empty { text-align:center; padding:36px 20px; color:var(--t3); font-size:13px; border:1px dashed var(--border2); border-radius:12px; }

    .gc-summary-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; }
    @media (max-width:520px) { .gc-summary-grid { grid-template-columns:repeat(2, 1fr); } }
    .gc-summary-card { border:1px solid var(--border2); border-radius:10px; padding:9px 4px; text-align:center; background:var(--surface); }
    .gc-summary-num { font-size:17px; font-weight:800; color:var(--blue); }
    .gc-summary-lbl { font-size:8.5px; font-weight:700; color:var(--t3); text-transform:uppercase; letter-spacing:.01em; margin-top:2px; line-height:1.2; }
    .gc-summary-sub { font-size:8px; color:var(--t3); margin-top:1px; }

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

    .gc-pct-tag { font-size:11px; font-weight:800; padding:2px 8px; border-radius:6px; white-space:nowrap; }
    .gc-pct-tag.hi  { background:color-mix(in srgb, var(--green) 15%, transparent); color:var(--green); }
    .gc-pct-tag.mid { background:color-mix(in srgb, #ca8a04 15%, transparent); color:#ca8a04; }
    .gc-pct-tag.lo  { background:color-mix(in srgb, var(--red) 15%, transparent); color:var(--red); }
    .gc-pct-tag.none { background:var(--surface2); color:var(--t3); }
    .gc-count-sub { font-size:10.5px; color:var(--t3); white-space:nowrap; }

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
    this._students = this._buildStudentSubjectMap();
    this._render();
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

  // For one campus + one segment: which students started it (base)
  // and which of those also reached the target stage (converted).
  _computeSegmentForCampus(campusId, seg) {
    const base = this._students.filter(s =>
      this._studentHasAny(s, seg.from) && this._studentFromCampusId(s, seg.from) === campusId
    );
    const converted = base.filter(s => this._studentHasAny(s, seg.to));
    const notYet = base.filter(s => !this._studentHasAny(s, seg.to));
    const pct = base.length ? Math.round((converted.length / base.length) * 100) : 0;
    return { seg, base, converted, notYet, pct };
  },

  _computeCampusTree() {
    const campusNodes = this._campuses.map(campus => {
      const segments = SEGMENTS.map(seg => this._computeSegmentForCampus(campus.id, seg));
      return { campus, segments };
    });

    const grandSegments = SEGMENTS.map(seg => {
      const base      = this._students.filter(s => this._studentHasAny(s, seg.from));
      const converted = base.filter(s => this._studentHasAny(s, seg.to));
      const pct = base.length ? Math.round((converted.length / base.length) * 100) : 0;
      return { seg, base, converted, pct };
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
      <div class="gc-wrap">
        <div class="gc-summary-grid">
          ${tree.grandSegments.map(g => `
            <div class="gc-summary-card">
              <div class="gc-summary-num">${g.base.length ? g.pct + '%' : '—'}</div>
              <div class="gc-summary-lbl">${_esc(g.seg.label)}</div>
              <div class="gc-summary-sub">${g.converted.length}/${g.base.length}</div>
            </div>
          `).join('')}
        </div>

        <div id="gcCampusList">
          ${tree.campusNodes.length ? tree.campusNodes.map(cn => this._campusRowHTML(cn)).join('') : `<div class="gc-empty">No students found in your assigned campuses.</div>`}
        </div>
      </div>`;

    this._bindEvents();
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
            ${sg.base.length ? `
              ${sg.converted.length ? `
                <div class="gc-tier-label converted">Converted (${sg.converted.length})</div>
                ${sg.converted.map(s => `
                  <div class="gc-student-item">
                    <span class="name">${_esc(s.studentName)}<span class="code">${_esc(s.studentCode)}</span></span>
                  </div>`).join('')}
              ` : ''}
              ${sg.notYet.length ? `
                <div class="gc-tier-label notyet">Not Yet (${sg.notYet.length})</div>
                ${sg.notYet.map(s => `
                  <div class="gc-student-item">
                    <span class="name">${_esc(s.studentName)}<span class="code">${_esc(s.studentCode)}</span></span>
                  </div>`).join('')}
              ` : ''}
            ` : `<div class="gc-empty" style="padding:6px 0">No students on this segment for this campus yet.</div>`}
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
