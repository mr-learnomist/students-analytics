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
  parseLocalDate,
  toISODate,
} from '../attendance/attendanceService.js';
import { getAllAssignments } from '../lecturePlan/lecturePlanService.js';

let _stylesInjected = false;
function _injectStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const style = document.createElement('style');
  style.id = 'ga-styles';
  style.textContent = `
    .ga-wrap {
      position:relative; display:flex; flex-direction:column; gap:12px; max-width:680px;
      background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:14px;
    }
    .ga-wrap.ga-fullscreen {
      position:fixed; inset:0; z-index:9999; max-width:none; width:100vw; height:100vh;
      border-radius:0; margin:0; overflow-y:auto;
    }
    /* True edge-to-edge via the browser Fullscreen API — no address
       bar, no chrome. Requested on the STABLE outer host container
       (never on .ga-wrap, which gets replaced by every _render()
       call — fullscreening a node that then gets removed from the
       DOM makes the browser auto-exit fullscreen immediately). */
    .ga-host:fullscreen, .ga-host:-webkit-full-screen {
      width:100vw; height:100vh; background:var(--surface); overflow:auto; padding:0; margin:0;
    }
    .ga-host::backdrop, .ga-host::-webkit-full-screen-backdrop { background:var(--surface); }
    .ga-host:fullscreen .ga-wrap, .ga-host:-webkit-full-screen .ga-wrap {
      width:100%; height:100%; max-width:none; margin:0; border-radius:0; overflow-y:auto; box-sizing:border-box;
    }
    .ga-header-row { display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .ga-fs-btn {
      width:26px; height:26px; flex-shrink:0; display:flex; align-items:center; justify-content:center;
      border-radius:7px; border:1px solid var(--border2); background:var(--surface2); color:var(--t2);
      cursor:pointer; padding:0;
    }
    .ga-fs-btn:hover { background:var(--surface3, var(--border2)); color:var(--t1); }
    .ga-title { font-size:14px; font-weight:800; color:var(--t1); }
    .ga-empty { text-align:center; padding:36px 20px; color:var(--t3); font-size:13px; border:1px dashed var(--border2); border-radius:12px; }

    /* Active / Closed / All status filter */
    .ga-status-tabs { display:flex; gap:6px; }
    .ga-status-tab {
      flex:1; height:28px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer;
      font-family:inherit; border:1.5px solid var(--border2); background:var(--surface2); color:var(--t3);
    }
    .ga-status-tab.active { border-color:var(--blue); color:var(--blue); background:color-mix(in srgb, var(--blue) 12%, transparent); }

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

    .ga-batch-check { width:14px; height:14px; accent-color:var(--blue); cursor:pointer; flex-shrink:0; }
    .ga-row-hdr.excluded { opacity:.5; }
    .ga-row-hdr.excluded .ga-row-name { text-decoration:line-through; }

    .ga-batch-search {
      width:100%; height:30px; padding:0 10px; margin-bottom:8px; border-radius:8px;
      border:1px solid var(--border2); background:var(--surface); color:var(--t1); font-size:12px; box-sizing:border-box;
    }

    .critical-text { color:var(--red); }
    .risk-text     { color:#d97706; }
    .alert-text    { color:#ca8a04; }
    .good-text     { color:var(--green); }

    /* Trend card — standalone Attendance module only, never in Horizon View */
    .ga-trend-card {
      margin-top:16px; max-width:680px; display:flex; flex-direction:column; gap:10px;
      background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:14px;
    }
    .ga-trend-header { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
    .ga-trend-title { font-size:14px; font-weight:800; color:var(--t1); }
    .ga-trend-range { display:flex; align-items:center; gap:6px; font-size:11.5px; color:var(--t3); }
    .ga-trend-range input[type="date"] {
      height:28px; padding:0 8px; border-radius:8px; border:1px solid var(--border2);
      background:var(--surface); color:var(--t1); font-size:11.5px; font-family:inherit;
    }
    .ga-trend-chart-wrap { position:relative; height:240px; }
    .ga-trend-chart-wrap canvas { width:100% !important; height:100% !important; }
    .ga-trend-empty { text-align:center; padding:30px 10px; color:var(--t3); font-size:13px; border:1px dashed var(--border2); border-radius:10px; }
  `;
  document.head.appendChild(style);
}

function _esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _chevSVG(isOpen) {
  return `<svg class="ga-chev${isOpen ? ' open' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="9 18 15 12 9 6"/></svg>`;
}

function _fsIconSVG(isFullscreen) {
  return isFullscreen
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/></svg>`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`;
}

// Chart.js can't read CSS custom properties directly — resolve them to
// real color strings so trend lines stay theme-consistent (light/dark).
function _cssVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch (e) { return fallback; }
}

const TIER_LABEL = { critical: 'Critical', risk: 'Risk', alert: 'Alert', good: 'Good' };

export const GovernanceAttendanceModule = {

  async mount(el, ctx) {
    if (!el) return;
    _injectStyles();
    this._el = el;
    this._el.classList.add('ga-host'); // stable fullscreen target — never destroyed by re-renders
    this._ctx = ctx || {};
    this._expandedCampuses    = new Set();
    this._expandedDisciplines = new Set();
    this._expandedBatches     = new Set();
    this._expandedStudents    = new Set();
    this._excludedBatchIds    = new Set(); // batches unchecked out of the rollup — in-memory only, never saved
    this._batchSearch         = new Map(); // disciplineKey -> search text
    this._isFullscreen        = false;

    // Trend graph — ONLY rendered when mounted standalone (the
    // Attendance module page), never inside the Horizon View widget.
    // Caller controls this via ctx.standalone (see app.js route registration).
    this._standalone = !!(this._ctx.standalone);
    this._trendChart = null;
    if (!this._trendTo)   this._trendTo   = toISODate(new Date());
    if (!this._trendFrom) {
      const d = new Date(); d.setDate(d.getDate() - 29);
      this._trendFrom = toISODate(d);
    }

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
          this._renderAll();
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
    const inScopeBatches = allBatches.filter(b => campusIdSet.has(b.campusId));

    // Fetch attendance for EVERY in-scope batch (active + closed) once,
    // up front — same heavy-fetch reasoning as teacherHorizonUI.js, but
    // done for the whole scope so the Active/Closed/All toggle below
    // can just re-filter in memory instead of re-fetching per click.
    await fetchAndSyncBatchesAttendance(inScopeBatches.map(b => b.id));

    this._campuses = campuses;
    this._allBatches = inScopeBatches;
    this._statusFilter = 'active'; // 'active' | 'closed' | 'all'
    this._renderAll();
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

  // ── ported from testResultSummary.js's _batchStatus() so "Active"/
  // "Closed" here means exactly the same thing as in Result Profile —
  // manual endDate takes priority when set, otherwise falls back to
  // the Lecture Plan's last dated row. No end date at all = active.
  // Active = effective end > today (or no effective end); Closed = end <= today.
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
        discMap.get(discId).batchNodes.push({
          ...this._computeBatchNode(batch),
          excluded: this._excludedBatchIds.has(batch.id),
        });
      });

      const disciplineNodes = [...discMap.values()]
        .map(d => ({
          ...d,
          counts: this._sumCounts(d.batchNodes.filter(bn => !bn.excluded)),
        }))
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

  // ── Trend graph data — standalone Attendance module ONLY ──────────
  // For every day in [fromDate, toDate], applies that day's attendance
  // records on top of a running cumulative P/total per student, then
  // re-tiers every student who has at least one record so far. This
  // gives a day-by-day picture of how many tracked students are
  // Critical/Risk/Alert/Good — and the total tracked count — as the
  // scope's attendance history builds up, using the SAME batches
  // (status tab + manual exclusions) as the tree above it.
  _computeTrendSeries(fromDate, toDate) {
    if (!fromDate || !toDate || toDate < fromDate) return [];

    const inScopeBatches = (this._statusFilter === 'all'
      ? this._allBatches
      : this._allBatches.filter(b => this._batchStatus(b) === this._statusFilter)
    ).filter(b => !this._excludedBatchIds.has(b.id));

    // Group every relevant record by date, once, up front.
    const recordsByDate = new Map(); // date -> [{studentId, status}]
    inScopeBatches.forEach(batch => {
      const rosterIds = new Set(this._rosterFor(batch.id).map(s => s.id));
      AttendanceService.getRecordsForBatch(batch.id).forEach(r => {
        if (!rosterIds.has(r.studentId)) return;
        if (r.date < fromDate || r.date > toDate) return; // outside the chosen range — ignore for the walk below
        if (!recordsByDate.has(r.date)) recordsByDate.set(r.date, []);
        recordsByDate.get(r.date).push({ studentId: r.studentId, status: r.status });
      });
    });

    const series = [];
    const cumMap = new Map(); // studentId -> { P, total }
    let cursor = parseLocalDate(fromDate);
    const end  = parseLocalDate(toDate);

    while (cursor <= end) {
      const iso = toISODate(cursor);
      (recordsByDate.get(iso) || []).forEach(({ studentId, status }) => {
        if (!cumMap.has(studentId)) cumMap.set(studentId, { P: 0, total: 0 });
        const c = cumMap.get(studentId);
        c.total++;
        if (status === 'P') c.P++;
      });

      let critical = 0, risk = 0, alert = 0, good = 0, total = 0;
      cumMap.forEach(c => {
        if (!c.total) return;
        total++;
        const tier = this._tierFor(Math.round((c.P / c.total) * 100));
        if (tier === 'critical') critical++;
        else if (tier === 'risk') risk++;
        else if (tier === 'alert') alert++;
        else good++;
      });

      series.push({ date: iso, total, critical, risk, alert, good });
      cursor.setDate(cursor.getDate() + 1);
    }

    return series;
  },

  _trendCardHTML(series) {
    const hasData = series.some(p => p.total > 0);
    return `
      <div class="ga-trend-card">
        <div class="ga-trend-header">
          <div class="ga-trend-title">Attendance Trend</div>
          <div class="ga-trend-range">
            <input type="date" id="gaTrendFrom" value="${this._trendFrom}" max="${this._trendTo}" />
            <span>to</span>
            <input type="date" id="gaTrendTo" value="${this._trendTo}" min="${this._trendFrom}" max="${toISODate(new Date())}" />
          </div>
        </div>
        ${hasData
          ? `<div class="ga-trend-chart-wrap"><canvas id="gaTrendCanvas"></canvas></div>`
          : `<div class="ga-trend-empty">No attendance data in this date range for the current scope.</div>`}
      </div>`;
  },

  _bindTrend(series) {
    const el = this._el;

    const fromInp = el.querySelector('#gaTrendFrom');
    const toInp   = el.querySelector('#gaTrendTo');
    if (fromInp) fromInp.addEventListener('change', () => {
      if (!fromInp.value) return;
      this._trendFrom = fromInp.value;
      this._renderAll();
    });
    if (toInp) toInp.addEventListener('change', () => {
      if (!toInp.value) return;
      this._trendTo = toInp.value;
      this._renderAll();
    });

    if (this._trendChart) { this._trendChart.destroy(); this._trendChart = null; }

    const canvas = el.querySelector('#gaTrendCanvas');
    if (!canvas || typeof Chart === 'undefined') return;

    const line = (label, data, color) => ({
      label, data, borderColor: color, backgroundColor: 'transparent',
      borderWidth: 2, pointRadius: 0, tension: 0.25,
    });

    this._trendChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: series.map(p => p.date),
        datasets: [
          line('Total',    series.map(p => p.total),    _cssVar('--blue', '#3b82f6')),
          line('Good',     series.map(p => p.good),     _cssVar('--green', '#10b981')),
          line('Alert',    series.map(p => p.alert),    '#ca8a04'),
          line('Risk',     series.map(p => p.risk),     '#d97706'),
          line('Critical', series.map(p => p.critical), _cssVar('--red', '#ef4444')),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
        scales: {
          x: { ticks: { maxTicksLimit: 8, font: { size: 10 } }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } } },
        },
      },
    });
  },

  _renderAll() {
    const filtered = this._statusFilter === 'all'
      ? this._allBatches
      : this._allBatches.filter(b => this._batchStatus(b) === this._statusFilter);
    this._render(this._campuses, filtered);
  },

  _render(campuses, batches) {
    const el = this._el;
    const tree = this._computeTree(campuses, batches);
    this._tree = tree;

    const trendSeries = this._standalone ? this._computeTrendSeries(this._trendFrom, this._trendTo) : null;

    el.innerHTML = `
      <div class="ga-wrap${this._isFullscreen ? ' ga-fullscreen' : ''}">
        <div class="ga-header-row">
          <div class="ga-title">Attendance</div>
          <button type="button" class="ga-fs-btn" id="gaFsBtn" title="${this._isFullscreen ? 'Exit full screen' : 'Full screen'}" aria-label="${this._isFullscreen ? 'Exit full screen' : 'Full screen'}">${_fsIconSVG(this._isFullscreen)}</button>
        </div>
        <div class="ga-status-tabs" id="gaStatusTabs">
          <button class="ga-status-tab ${this._statusFilter === 'active' ? 'active' : ''}" data-status="active">Active</button>
          <button class="ga-status-tab ${this._statusFilter === 'closed' ? 'active' : ''}" data-status="closed">Closed</button>
          <button class="ga-status-tab ${this._statusFilter === 'all'    ? 'active' : ''}" data-status="all">All</button>
        </div>

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
      </div>
      ${this._standalone ? this._trendCardHTML(trendSeries) : ''}`;

    const fsBtn = el.querySelector('#gaFsBtn');
    if (fsBtn) fsBtn.addEventListener('click', () => this._toggleFullscreen());

    this._bindStatusTabs();
    this._bindEvents();
    if (this._standalone) this._bindTrend(trendSeries);
  },

  // Toggling full screen just flips a flag and re-renders — all
  // drill-down state (_expandedCampuses/_expandedDisciplines/
  // _expandedBatches/_expandedStudents etc.) lives on `this`, not in
  // the DOM, so it survives the toggle untouched in both directions.
  //
  // Uses the real browser Fullscreen API on the card itself so it's
  // genuinely edge-to-edge (no address bar / browser chrome). Falls
  // back to a CSS full-viewport overlay only if the API is missing
  // or the browser blocks the request.
  async _toggleFullscreen() {
    if (!this._isFullscreen) {
      try {
        const host = this._el; // stable across re-renders, unlike .ga-wrap
        const req = host && (host.requestFullscreen || host.webkitRequestFullscreen || host.msRequestFullscreen);
        if (req) {
          await req.call(host);
          return; // fullscreenchange listener flips the flag + re-renders
        }
      } catch (e) { /* blocked/unsupported — fall through to CSS overlay */ }
      this._isFullscreen = true;
      document.body.style.overflow = 'hidden';
      this._renderAll();
    } else {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        try {
          const exit = document.exitFullscreen || document.webkitExitFullscreen;
          if (exit) { await exit.call(document); return; } // fullscreenchange listener handles the rest
        } catch (e) { /* ignore — fall through to manual reset below */ }
      }
      this._isFullscreen = false;
      document.body.style.overflow = '';
      this._renderAll();
    }
  },

  _bindStatusTabs() {
    const el = this._el;
    el.querySelectorAll('#gaStatusTabs [data-status]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.status === this._statusFilter) return;
        this._statusFilter = btn.dataset.status;
        this._renderAll();
      });
    });
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
    const searchVal = this._batchSearch.get(key) || '';
    const visibleBatchNodes = searchVal.trim()
      ? dn.batchNodes.filter(bn => bn.batch.batchName.toLowerCase().includes(searchVal.trim().toLowerCase()))
      : dn.batchNodes;
    return `
      <div class="ga-discipline-row">
        <div class="ga-row-hdr" data-toggle-discipline="${key}">
          ${_chevSVG(isOpen)}
          <span class="ga-row-name small">${_esc(label)}</span>
          ${this._tallyHTML(dn.counts)}
        </div>
        ${isOpen ? `
          <div class="ga-row-body">
            ${dn.batchNodes.length > 1 ? `
              <input type="text" class="ga-batch-search" data-batch-search="${key}" placeholder="Search batch…" value="${_esc(searchVal)}" />
            ` : ''}
            ${visibleBatchNodes.length
              ? visibleBatchNodes.map(bn => this._batchRowHTML(bn)).join('')
              : `<div class="ga-empty" style="padding:8px 0">No batch matches "${_esc(searchVal)}".</div>`}
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
        <div class="ga-row-hdr ${bn.excluded ? 'excluded' : ''}" data-toggle-batch="${bn.batch.id}">
          <input type="checkbox" class="ga-batch-check" data-toggle-batch-include="${bn.batch.id}" title="Include in totals" ${bn.excluded ? '' : 'checked'} />
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
      hdr.addEventListener('click', (e) => {
        if (e.target.closest('[data-toggle-batch-include]')) return; // checkbox clicks shouldn't expand/collapse
        const id = hdr.dataset.toggleBatch;
        if (this._expandedBatches.has(id)) this._expandedBatches.delete(id);
        else this._expandedBatches.add(id);
        this._rerenderList();
      });
    });

    el.querySelectorAll('[data-toggle-batch-include]').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.toggleBatchInclude;
        if (cb.checked) this._excludedBatchIds.delete(id);
        else this._excludedBatchIds.add(id);
        this._renderAll(); // exclusion changes every rollup level, so recompute the whole tree
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
