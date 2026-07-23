// ============================================================
// modules/governance/governanceAttendanceUI.js — Governance
// Attendance Watch (consolidated)
//
// Governance-scope version of the teacher's "Attendance Watch"
// (see modules/teacher/teacherHorizonUI.js). Instead of one
// teacher's batches, this rolls up EVERY batch the governance
// user has campus access to, and groups it:
//
//     Campus → Discipline → Batch → Student
//
// with a top-level consolidated tally (how many students are
// Critical / Risk / Alert / Good) across the whole scope, so an
// admin can see institution-wide attendance health at a glance
// before drilling in.
//
// Tier thresholds are IDENTICAL to teacherHorizonUI.js on purpose
// (critical <80%, risk <85%, alert <90%, good >=90%) — same
// definition of "at risk" everywhere in the app.
//
// CAMPUS SCOPING — two different populations can land on this page:
//   1) Users whose PRIMARY role is 'governance' — their campus
//      scope is whatever their normal role's campus scope is.
//      ASSUMPTION (matches the convention used elsewhere, e.g.
//      Auth.filterByCampus): empty/undefined campusIds = full
//      access to all campuses. If Auth.js encodes a different
//      convention, adjust _accessibleCampusIds() below — it's the
//      only place this logic lives.
//   2) Users with ADDITIVE governance access (see
//      governanceUsersUI.js) — their scope is deliberately opt-in
//      (user.governanceAccess.campusIds). No campuses checked yet
//      means NO access, not "all campuses" — different convention
//      from (1) on purpose, since it's a manually granted extra.
// ============================================================

import { AppState } from '../../utils/state.js';
import {
  AttendanceService,
  fetchAndSyncBatchesAttendance,
} from '../attendance/attendanceService.js';

let _stylesInjected = false;
function _injectStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const style = document.createElement('style');
  style.id = 'ga-styles';
  style.textContent = `
    .ga-wrap {
      display:flex; flex-direction:column; gap:12px; max-width:680px;
      background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:14px;
    }
    .ga-empty { text-align:center; padding:36px 20px; color:var(--t3); font-size:13px; border:1px dashed var(--border2); border-radius:12px; }

    /* Consolidated summary */
    .ga-summary-grid { display:grid; grid-template-columns:repeat(5, 1fr); gap:6px; }
    @media (max-width:520px) { .ga-summary-grid { grid-template-columns:repeat(2, 1fr); } }
    .ga-summary-card { border:1px solid var(--border2); border-radius:10px; padding:9px 4px; text-align:center; background:var(--surface); }
    .ga-summary-num { font-size:18px; font-weight:800; color:var(--t1); }
    .ga-summary-lbl { font-size:9px; font-weight:700; color:var(--t3); text-transform:uppercase; letter-spacing:.01em; margin-top:2px; line-height:1.2; }
    .ga-summary-card.critical .ga-summary-num { color:var(--red); }
    .ga-summary-card.risk     .ga-summary-num { color:#d97706; }
    .ga-summary-card.alert    .ga-summary-num { color:#ca8a04; }
    .ga-summary-card.good     .ga-summary-num { color:var(--green); }

    /* Shared row chrome (campus / discipline / batch all reuse this) */
    .ga-row-hdr { display:flex; align-items:center; gap:8px; padding:11px 13px; cursor:pointer; }
    .ga-row-hdr:hover { background:var(--surface2); }
    .ga-row-name { font-size:13px; font-weight:700; color:var(--t1); flex:1; }
    .ga-row-name.small { font-size:12.5px; font-weight:600; }
    .ga-row-body { padding:8px 13px 12px 33px; border-top:1px solid var(--border2); }
    .ga-chev { color:var(--t3); transition:transform .15s; flex-shrink:0; }
    .ga-chev.open { transform:rotate(90deg); }

    .ga-campus-row     { border:1px solid var(--border2); border-radius:12px; margin-bottom:10px; overflow:hidden; background:var(--surface); }
    .ga-campus-row > .ga-row-hdr { background:var(--surface2); }
    .ga-discipline-row { border:1px solid var(--border2); border-radius:10px; margin-bottom:8px; overflow:hidden; }
    .ga-batch-row       { border:1px solid var(--border2); border-radius:9px; margin-bottom:6px; overflow:hidden; }

    .ga-tally { display:flex; gap:4px; flex-wrap:wrap; justify-content:flex-end; }
    .ga-tier-tag {
      font-size:9.5px; font-weight:800; padding:2px 7px; border-radius:6px; text-transform:uppercase;
      letter-spacing:.02em; white-space:nowrap;
    }
    .ga-tier-tag.critical { background:color-mix(in srgb, var(--red) 15%, transparent); color:var(--red); }
    .ga-tier-tag.risk     { background:color-mix(in srgb, #d97706 15%, transparent); color:#d97706; }
    .ga-tier-tag.alert    { background:color-mix(in srgb, #ca8a04 15%, transparent); color:#ca8a04; }
    .ga-tier-tag.ok       { background:color-mix(in srgb, var(--green) 15%, transparent); color:var(--green); }
    .ga-tier-tag.none     { background:var(--surface2); color:var(--t3); }

    .ga-tier-label { font-size:10.5px; font-weight:800; text-transform:uppercase; margin:8px 0 6px; }
    .ga-tier-label:first-child { margin-top:0; }
    .ga-tier-label.critical { color:var(--red); }
    .ga-tier-label.risk     { color:#d97706; }
    .ga-tier-label.alert    { color:#ca8a04; }
    .ga-tier-label.good     { color:var(--green); }

    .ga-student-item { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:7px 9px; border-radius:8px; background:var(--surface2); margin-bottom:6px; cursor:pointer; }
    .ga-student-item:hover { background:var(--surface3, var(--surface2)); }
    .ga-student-item .name { font-size:12px; font-weight:600; color:var(--t1); }
    .ga-student-item .pct { font-size:12px; font-weight:800; }
    .ga-student-detail { display:flex; gap:14px; font-size:11px; color:var(--t3); padding:0 9px 8px; margin-top:-4px; }
    .ga-student-detail b { color:var(--t1); }

    .critical-text { color:var(--red); }
    .risk-text     { color:#d97706; }
    .alert-text    { color:#ca8a04; }
    .good-text     { color:var(--green); }
  `;
  document.head.appendChild(style);
}

function _esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _chevSVG(isOpen) {
  return `<svg class="ga-chev${isOpen ? ' open' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="9 18 15 12 9 6"/></svg>`;
}

const TIER_LABEL = { critical: 'Critical', risk: 'Risk', alert: 'Alert', good: 'Good' };

export const GovernanceAttendanceModule = {

  async mount(el, ctx) {
    if (!el) return;
    _injectStyles();
    this._el = el;
    this._ctx = ctx || {};
    this._expandedCampuses    = new Set();
    this._expandedDisciplines = new Set();
    this._expandedBatches     = new Set();
    this._expandedStudents    = new Set();

    el.innerHTML = `<div class="ga-empty">Loading Governance Attendance View…</div>`;

    // Expect ctx.user (the currently signed-in governance user record),
    // same shape as governanceUsersUI.js reads/writes. Fall back to
    // AppState in case the router doesn't pass ctx explicitly.
    const user = this._ctx.user || AppState.get('currentUser') || AppState.get('user');
    if (!user) {
      el.innerHTML = `<div class="ga-empty">Unable to determine the current user.</div>`;
      return;
    }

    const scopeCampusIds = this._accessibleCampusIds(user);
    const allCampuses = AppState.get('campuses') || [];
    const campuses = scopeCampusIds === null
      ? allCampuses
      : allCampuses.filter(c => scopeCampusIds.includes(c.id));

    if (!campuses.length) {
      el.innerHTML = `<div class="ga-empty">No campus access assigned for Governance yet. Ask an admin to grant campus access from Governance → Access.</div>`;
      return;
    }

    const campusIdSet = new Set(campuses.map(c => c.id));
    const allBatches = AppState.get('batches') || [];
    const inScopeActiveBatches = allBatches.filter(b => campusIdSet.has(b.campusId) && this._isActive(b));

    // Same reasoning as teacherHorizonUI.js: full attendance history is
    // needed to compute real percentages, so this heavier fetch only
    // happens when this page is actually opened, batched into one
    // request covering every in-scope active batch.
    await fetchAndSyncBatchesAttendance(inScopeActiveBatches.map(b => b.id));

    this._render(campuses, inScopeActiveBatches);
  },

  // ── Campus scoping (see header comment for the two conventions) ──
  _accessibleCampusIds(user) {
    const isPureGovernance = user.role === 'governance';
    if (isPureGovernance) {
      return (user.campusIds && user.campusIds.length) ? user.campusIds : null; // null = all campuses
    }
    const gc = user.governanceAccess;
    if (!gc || !gc.enabled) return [];
    return gc.campusIds || [];
  },

  // ── copied 1:1 from teacherHorizonUI.js so "active batch" means the
  // same thing everywhere in the app ──
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

  // ── copied 1:1 from teacherHorizonUI.js: roster from active
  // enrolments is the source of truth used by the attendance-marking
  // screen ──
  _rosterFor(batchId) {
    return (AppState.get('enrolments') || [])
      .filter(e => e.batchId === batchId && e.status === 'active')
      .map(e => AppState.findById('students', e.studentId))
      .filter(Boolean);
  },

  // ── same thresholds as teacherHorizonUI.js: critical <80%, risk <85%,
  // alert <90%, good >=90% ──
  _tierFor(pct) {
    if (pct < 80) return 'critical';
    if (pct < 85) return 'risk';
    if (pct < 90) return 'alert';
    return 'good';
  },

  _countsFromTiers(critical, risk, alert, good) {
    return {
      critical: critical.length,
      risk: risk.length,
      alert: alert.length,
      good: good.length,
      total: critical.length + risk.length + alert.length + good.length,
    };
  },

  _sumCounts(nodes) {
    return nodes.reduce((acc, n) => {
      acc.critical += n.counts.critical;
      acc.risk     += n.counts.risk;
      acc.alert    += n.counts.alert;
      acc.good     += n.counts.good;
      acc.total    += n.counts.total;
      return acc;
    }, { critical: 0, risk: 0, alert: 0, good: 0, total: 0 });
  },

  // Per-batch roster + attendance % + P/A/L, split into tiers —
  // identical computation to teacherHorizonUI.js's _computeWatchData,
  // just for one batch at a time since batches get grouped by
  // campus/discipline first here.
  _computeBatchNode(batch) {
    const roster  = this._rosterFor(batch.id);
    const records = AttendanceService.getRecordsForBatch(batch.id);

    const students = roster.map(stu => {
      const recs = records.filter(r => r.studentId === stu.id);
      const total = recs.length;
      const P = recs.filter(r => r.status === 'P').length;
      const A = recs.filter(r => r.status === 'A').length;
      const L = recs.filter(r => r.status === 'L').length;
      const pct = total > 0 ? Math.round((P / total) * 100) : null;
      return { studentId: stu.id, name: stu.studentName, pct, P, A, L, total };
    }).filter(s => s.pct !== null);

    const critical = students.filter(s => this._tierFor(s.pct) === 'critical').sort((a, b) => a.pct - b.pct);
    const risk     = students.filter(s => this._tierFor(s.pct) === 'risk').sort((a, b) => a.pct - b.pct);
    const alert    = students.filter(s => this._tierFor(s.pct) === 'alert').sort((a, b) => a.pct - b.pct);
    const good     = students.filter(s => this._tierFor(s.pct) === 'good').sort((a, b) => b.pct - a.pct);

    return {
      batch, students, critical, risk, alert, good,
      counts: this._countsFromTiers(critical, risk, alert, good),
    };
  },

  // Campus → Discipline → Batch tree, each level carrying a rolled-up
  // tally so the summary cards and every row header can show counts
  // without recomputing.
  _computeTree(campuses, batches) {
    const campusNodes = campuses.map(campus => {
      const campusBatches = batches.filter(b => b.campusId === campus.id);

      const discMap = new Map();
      campusBatches.forEach(batch => {
        const discId = batch.disciplineId || '__none__';
        if (!discMap.has(discId)) {
          discMap.set(discId, {
            disciplineId: discId,
            disciplineName: batch.disciplineName || 'Unassigned Discipline',
            disciplineAbbr: batch.disciplineAbbr || '',
            batchNodes: [],
          });
        }
        discMap.get(discId).batchNodes.push(this._computeBatchNode(batch));
      });

      const disciplineNodes = [...discMap.values()]
        .map(d => ({ ...d, counts: this._sumCounts(d.batchNodes) }))
        .sort((a, b) => (b.counts.critical + b.counts.risk) - (a.counts.critical + a.counts.risk));

      return { campus, disciplineNodes, counts: this._sumCounts(disciplineNodes) };
    }).sort((a, b) => (b.counts.critical + b.counts.risk) - (a.counts.critical + a.counts.risk));

    const grandCounts = this._sumCounts(campusNodes.length ? campusNodes : [{ counts: { critical: 0, risk: 0, alert: 0, good: 0, total: 0 } }]);
    return { campusNodes, grandCounts };
  },

  _tallyHTML(counts) {
    return `
      <span class="ga-tally">
        ${counts.critical ? `<span class="ga-tier-tag critical">${counts.critical} Critical</span>` : ''}
        ${counts.risk     ? `<span class="ga-tier-tag risk">${counts.risk} Risk</span>`             : ''}
        ${counts.alert    ? `<span class="ga-tier-tag alert">${counts.alert} Alert</span>`           : ''}
        ${counts.good     ? `<span class="ga-tier-tag ok">${counts.good} Good</span>`                : ''}
        ${!counts.total   ? `<span class="ga-tier-tag none">No data</span>`                          : ''}
      </span>`;
  },

  _render(campuses, batches) {
    const el = this._el;
    const tree = this._computeTree(campuses, batches);
    this._tree = tree;

    el.innerHTML = `
      <div class="ga-wrap">
        <div class="ga-summary-grid">
          <div class="ga-summary-card critical"><div class="ga-summary-num">${tree.grandCounts.critical}</div><div class="ga-summary-lbl">Critical</div></div>
          <div class="ga-summary-card risk"><div class="ga-summary-num">${tree.grandCounts.risk}</div><div class="ga-summary-lbl">Risk</div></div>
          <div class="ga-summary-card alert"><div class="ga-summary-num">${tree.grandCounts.alert}</div><div class="ga-summary-lbl">Alert</div></div>
          <div class="ga-summary-card good"><div class="ga-summary-num">${tree.grandCounts.good}</div><div class="ga-summary-lbl">Good</div></div>
          <div class="ga-summary-card total"><div class="ga-summary-num">${tree.grandCounts.total}</div><div class="ga-summary-lbl">Students Tracked</div></div>
        </div>

        <div id="gaCampusList">
          ${tree.campusNodes.length ? tree.campusNodes.map(cn => this._campusRowHTML(cn)).join('') : `<div class="ga-empty">No batches with attendance data in your assigned campuses.</div>`}
        </div>
      </div>`;

    this._bindEvents();
  },

  _campusRowHTML(cn) {
    const isOpen = this._expandedCampuses.has(cn.campus.id);
    return `
      <div class="ga-campus-row">
        <div class="ga-row-hdr" data-toggle-campus="${cn.campus.id}">
          ${_chevSVG(isOpen)}
          <span class="ga-row-name">${_esc(cn.campus.campusName)}</span>
          ${this._tallyHTML(cn.counts)}
        </div>
        ${isOpen ? `
          <div class="ga-row-body">
            ${cn.disciplineNodes.length
              ? cn.disciplineNodes.map(dn => this._disciplineRowHTML(cn.campus.id, dn)).join('')
              : `<div class="ga-empty" style="padding:10px 0">No batches recorded for this campus yet.</div>`}
          </div>` : ''}
      </div>`;
  },

  _disciplineRowHTML(campusId, dn) {
    const key = `${campusId}__${dn.disciplineId}`;
    const isOpen = this._expandedDisciplines.has(key);
    const label = dn.disciplineAbbr || dn.disciplineName;
    return `
      <div class="ga-discipline-row">
        <div class="ga-row-hdr" data-toggle-discipline="${key}">
          ${_chevSVG(isOpen)}
          <span class="ga-row-name small">${_esc(label)}</span>
          ${this._tallyHTML(dn.counts)}
        </div>
        ${isOpen ? `
          <div class="ga-row-body">
            ${dn.batchNodes.map(bn => this._batchRowHTML(bn)).join('')}
          </div>` : ''}
      </div>`;
  },

  _batchRowHTML(bn) {
    const isOpen = this._expandedBatches.has(bn.batch.id);
    const hasStudents = bn.students.length > 0;

    const tierListHTML = (tier, list) => list.length ? `
      <div class="ga-tier-label ${tier}">${TIER_LABEL[tier]} (${list.length})</div>
      ${list.map(s => {
        const sKey = `${s.studentId}__${bn.batch.id}`;
        const sOpen = this._expandedStudents.has(sKey);
        return `
          <div class="ga-student-item" data-toggle-student="${sKey}">
            <span class="name">${_esc(s.name)}</span>
            <span class="pct ${tier}-text">${s.pct}%</span>
          </div>
          ${sOpen ? `
            <div class="ga-student-detail">
              <span>Present: <b>${s.P}</b></span>
              <span>Absent: <b>${s.A}</b></span>
              <span>Leave: <b>${s.L}</b></span>
              <span>Total marked: <b>${s.total}</b></span>
            </div>` : ''}`;
      }).join('')}
    ` : '';

    return `
      <div class="ga-batch-row">
        <div class="ga-row-hdr" data-toggle-batch="${bn.batch.id}">
          ${_chevSVG(isOpen)}
          <span class="ga-row-name small">${_esc(bn.batch.batchName)}</span>
          ${this._tallyHTML(bn.counts)}
        </div>
        ${isOpen ? `
          <div class="ga-row-body">
            ${hasStudents
              ? tierListHTML('critical', bn.critical) + tierListHTML('risk', bn.risk) + tierListHTML('alert', bn.alert) + tierListHTML('good', bn.good)
              : `<div class="ga-empty" style="padding:6px 0">No attendance data recorded for this batch yet.</div>`}
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

    el.querySelectorAll('[data-toggle-discipline]').forEach(hdr => {
      hdr.addEventListener('click', () => {
        const key = hdr.dataset.toggleDiscipline;
        if (this._expandedDisciplines.has(key)) this._expandedDisciplines.delete(key);
        else this._expandedDisciplines.add(key);
        this._rerenderList();
      });
    });

    el.querySelectorAll('[data-toggle-batch]').forEach(hdr => {
      hdr.addEventListener('click', () => {
        const id = hdr.dataset.toggleBatch;
        if (this._expandedBatches.has(id)) this._expandedBatches.delete(id);
        else this._expandedBatches.add(id);
        this._rerenderList();
      });
    });

    el.querySelectorAll('[data-toggle-student]').forEach(item => {
      item.addEventListener('click', () => {
        const key = item.dataset.toggleStudent;
        if (this._expandedStudents.has(key)) this._expandedStudents.delete(key);
        else this._expandedStudents.add(key);
        this._rerenderList();
      });
    });
  },

  _rerenderList() {
    const el = this._el;
    const list = el.querySelector('#gaCampusList');
    if (!list) return;
    list.innerHTML = this._tree.campusNodes.length
      ? this._tree.campusNodes.map(cn => this._campusRowHTML(cn)).join('')
      : `<div class="ga-empty">No batches with attendance data in your assigned campuses.</div>`;
    this._bindEvents();
  },
};
