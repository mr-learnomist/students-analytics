// ============================================================
// modules/lecturePlan/lecturePlanUI.js
// Lecture Plan Module — full CRUD + row editor + CSV import
// Two tabs: "Lecture Plans" + "LP Assignments"
// Pattern: identical to campus.js / discipline.js / batch.js
// ============================================================

import { AppState }             from '../../utils/state.js';
import { Modal, Table, injectUIStyles } from '../../utils/ui.js';
import { Toast }                from '../../utils/helpers.js';
import { Auth }                 from '../../utils/auth.js';
import {
  LecturePlanService,
  getLPMeta,
  getLPRows,
  getAssignmentForBatch,
  getAllAssignments,
  saveAllAssignments,
  calcHours,
  rowHours,
  autoDetectType,
  parseRowsCSV,
  getSampleCSV,
  HolidayWatcher,
  getHolidaysForBatch,
} from './lecturePlanService.js';

// ── Working state (replaces global vars from original) ────────
let _lpActiveDiscId  = '';
let _lpActiveSubjId  = '';
let _lpActiveLPId    = '';
let _lpPlanFilter    = { discIds: [], levelIds: [], subjIds: [], search: '' };
let _lpSelectedIds   = new Set(); // checkboxes for plan row selection
let _lpEditingRows   = [];
let _lpEditingLPId   = '';
let _lpAssignState   = {};
let _lpAssignFilter  = { campusId: '', discId: '', levelId: '', subjId: '', sessionId: '', search: '' };
let _lpAsgSearchTimer  = null;
let _lpSearchTimer     = null;

// ── Helpers ───────────────────────────────────────────────────
function fmtDate(ds) {
  if (!ds) return '—';
  const d    = new Date(ds + 'T00:00:00');
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const mons = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `<span style="color:var(--t3);font-size:10px">${days[d.getDay()]}</span> ${d.getDate()} ${mons[d.getMonth()]} ${d.getFullYear()}`;
}

function typeColor(type) {
  const t = (type || '').toLowerCase();
  if (t === 'test' || t === 'midterm') return 'var(--yellow)';
  if (t === 'mock')                    return 'var(--violet)';
  if (t === 'holiday')                 return 'var(--red)';
  if (t === 'revision')                return 'var(--cyan)';
  return 'var(--t2)';
}

function hoursBadge(hrs) {
  const chip = (icon, label, val, color) =>
    `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:500;color:${color};background:${color}15;padding:3px 9px;border-radius:20px;border:1px solid ${color}30">
      <span style="font-size:13px">${icon}</span>${val}h <span style="font-size:10px;opacity:.75">${label}</span>
     </span>`;
  return chip('🎓','lecture', hrs.teaching,'var(--blue)')
       + chip('📝','test',    hrs.test,    'var(--yellow)')
       + chip('🔁','mock',    hrs.mock,    'var(--violet)')
       + chip('🔄','revision',hrs.revision || 0,'var(--cyan)');
}

// ── Duration calculator (inclusive: start & end both counted) ─
function calcDuration(startStr, endStr) {
  if (!startStr || !endStr) return null;
  const s = new Date(startStr);
  const e = new Date(endStr);
  if (isNaN(s) || isNaN(e) || e < s) return null;
  // Make end date inclusive (add 1 day)
  e.setDate(e.getDate() + 1);

  let years  = e.getFullYear() - s.getFullYear();
  let months = e.getMonth()    - s.getMonth();
  let days   = e.getDate()     - s.getDate();

  if (days < 0) {
    months--;
    const prevMonth = new Date(e.getFullYear(), e.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }

  const totalMonths = years * 12 + months;
  if (totalMonths === 0 && days === 0) return '0 D';
  const parts = [];
  if (totalMonths > 0) parts.push(`${totalMonths} M`);
  if (days > 0)        parts.push(`${days} D`);
  return parts.join(' ');
}

// ── CSS (injected once) ───────────────────────────────────────
function injectLPStyles() {
  if (document.getElementById('lp-module-css')) return;
  const s = document.createElement('style');
  s.id = 'lp-module-css';
  s.textContent = `
    /* ── LP View Modal overrides ─────────────────────── */
    .lp-view-box {
      max-width: min(94vw, 1300px) !important;
      width: min(94vw, 1300px) !important;
      max-height: 90vh !important;
      display: flex !important;
      flex-direction: column !important;
      overflow: hidden !important;
    }
    .lp-view-box .modal-header { flex-shrink: 0; }
    .lp-view-box .modal-footer { flex-shrink: 0; }
    .lp-view-box .modal-body {
      flex: 1 1 0% !important;
      min-height: 120px !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
    }
    .lp-tabs{display:flex;gap:2px;border-bottom:1px solid var(--border);margin-bottom:20px}
    .lp-tab-btn{padding:8px 18px;background:none;border:none;cursor:pointer;font-size:13px;
      font-weight:500;color:var(--t3);border-bottom:2px solid transparent;transition:all .15s;font-family:var(--font)}
    .lp-tab-btn.active{color:var(--blue);border-bottom-color:var(--blue)}
    .lp-tab-btn:hover:not(.active){color:var(--t1)}
    .lp-tab-panel{display:none}.lp-tab-panel.active{display:block}

    .lp-selectors{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px}
    .lp-sel-label{font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;
      letter-spacing:.06em;margin-bottom:6px;display:block}

    .lp-card{background:var(--surface2);border:1px solid var(--border);
      border-radius:var(--r-sm);overflow:hidden;margin-bottom:14px}
    .lp-card.lp-card-selected{border-color:var(--blue);background:rgba(37,99,235,.04)}
    .lp-card-head{padding:12px 16px;border-bottom:1px solid var(--border);
      display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
    .lp-code-badge{font-family:'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:600;
      background:none;color:var(--blue);padding:0;border-radius:0;min-width:52px;display:inline-block}
    .lp-hours-strip{display:flex;gap:8px;flex-wrap:wrap;padding:10px 16px;
      border-bottom:1px solid var(--border);background:var(--surface3)}

    .lp-table-wrap{overflow-x:auto;max-height:calc(100vh - 300px);overflow-y:auto}
    .lp-table-wrap thead tr{position:sticky;top:0;z-index:3;background:var(--surface3)}
    .lp-table-wrap thead th{box-shadow:0 1px 0 var(--border)}
    .lp-row-test   td{background:rgba(245,158,11,.03)}
    .lp-row-midterm td{background:rgba(245,158,11,.05)}
    .lp-row-mock   td{background:rgba(139,92,246,.04)}
    .lp-row-holiday td{background:rgba(239,68,68,.03)}
    .lp-row-revision td{background:rgba(6,182,212,.03)}

    .lp-notif-card{background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm);margin-bottom:10px;overflow:hidden;transition:border-color .15s}
    .lp-notif-card.excluded{opacity:.45;border-style:dashed}
    .lp-notif-card-head{padding:10px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-bottom:1px solid var(--border);background:var(--surface3)}
    .lp-notif-dates{padding:8px 14px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
    .lp-date-chip{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;background:rgba(239,68,68,.1);color:var(--red);border:1px solid rgba(239,68,68,.2)}
    .lp-badge-pulse{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--red);color:#fff;font-size:10px;font-weight:700;animation:lp-pulse 2s infinite}
    @keyframes lp-pulse{0%,100%{opacity:1}50%{opacity:.6}}
    .lp-fix-btn{padding:4px 12px;border-radius:6px;border:1px solid rgba(16,185,129,.3);background:rgba(16,185,129,.1);color:#10b981;font-size:11.5px;font-weight:600;cursor:pointer;transition:all .15s}
    .lp-fix-btn:hover{background:rgba(16,185,129,.2);border-color:#10b981}
    .lp-excl-btn{padding:4px 10px;border-radius:6px;border:1px solid var(--border2);background:var(--surface2);color:var(--t3);font-size:11px;cursor:pointer;transition:all .15s}
    .lp-excl-btn:hover{color:var(--t1);border-color:var(--t3)}

    .lp-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;
      min-height:200px;gap:10px;color:var(--t3);border:1px dashed var(--border2);
      border-radius:var(--r-sm);padding:24px;text-align:center}
    .lp-empty p{font-size:13.5px;font-weight:600;color:var(--t2);margin:0}

    .lp-assign-row{padding:12px 16px;border-bottom:1px solid var(--border);
      display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .lp-assign-row:last-child{border-bottom:none}
    .lp-assign-list-wrap{overflow-y:auto;max-height:calc(100vh - 280px)}
    .lp-assigned-badge{font-size:10px;font-weight:700;color:var(--violet);
      background:rgba(139,92,246,.12);padding:2px 8px;border-radius:4px}

    .lp-row-editor-wrap{overflow-y:auto;max-height:55vh}
    .lp-row-input{width:100%;padding:4px 6px;background:var(--surface2);
      border:1px solid var(--border);border-radius:4px;color:var(--t1);
      font-size:12px;font-family:var(--font);outline:none}
    .lp-row-input:focus{border-color:var(--blue)}

    /* ── Responsive: Tablet (≤768px) ───────────────────────── */
    @media(max-width:768px){
      /* Tabs scrollable */
      .lp-tabs{overflow-x:auto;flex-wrap:nowrap!important;scrollbar-width:none;-webkit-overflow-scrolling:touch}
      .lp-tabs::-webkit-scrollbar{display:none}
      .lp-tab-btn{font-size:11.5px!important;padding:7px 11px!important;white-space:nowrap}

      /* Plan card row → wrap to flex column on small screens */
      .lp-card-head .lp-plan-row-grid{
        display:flex!important;flex-direction:column!important;gap:6px!important;
      }
      .lp-card.lp-card-selected{border-left:3px solid var(--blue)}

      /* Toolbar */
      .module-toolbar{flex-direction:column!important;align-items:stretch!important}
      .search-wrap{width:100%!important}
      .search-input{width:100%!important;min-width:0!important}

      /* Filters row — scroll horizontally */
      #lpFiltRow{display:flex;overflow-x:auto;gap:6px;padding-bottom:4px;scrollbar-width:none}
      #lpFiltRow::-webkit-scrollbar{display:none}
      .lp-asg-mf{flex-shrink:0}
      .lp-asg-mf-btn{font-size:11px!important;padding:5px 9px!important;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lp-asg-mf-panel{min-width:180px!important;left:0!important}

      /* Plan card hours badges wrap */
      .lp-hours-strip{gap:6px!important}

      /* Table on mobile — horizontal scroll */
      .lp-table-wrap{max-height:60vh!important;-webkit-overflow-scrolling:touch}

      /* Row editor */
      .lp-row-editor-wrap{max-height:50vh!important}

      /* Assignment list */
      .lp-assign-row{flex-direction:column!important;align-items:flex-start!important;gap:8px!important;padding:10px 12px!important}
      .lp-assign-list-wrap{max-height:55vh!important}

      /* Selectors grid → 1 col */
      .lp-selectors{grid-template-columns:1fr!important}

      /* Plan detail header buttons — wrap */
      .lp-card-head > div:last-child{flex-wrap:wrap!important;gap:4px!important}

      /* Notification cards */
      .lp-notif-card-head{flex-direction:column!important;align-items:flex-start!important}
    }

    /* ── Responsive: Phone (≤480px) ────────────────────────── */
    @media(max-width:480px){
      .lp-tab-btn{font-size:10.5px!important;padding:6px 8px!important}
      .lp-card-head{padding:8px 10px!important}
      .lp-hours-strip{padding:8px 10px!important;gap:5px!important}
      .lp-table-wrap{font-size:11.5px!important}

      /* Hide # column on very small */
      .lp-table-wrap th:first-child,
      .lp-table-wrap td:first-child{display:none!important}

      /* Compact add buttons */
      .add-btn{font-size:11px!important;padding:5px 9px!important}
    }
  `;
  document.head.appendChild(s);
}

// ── Page template ─────────────────────────────────────────────
function _pageTemplate() {
  const notifCount = HolidayWatcher.activeCount();
  const badge = notifCount
    ? ` <span class="lp-badge-pulse" style="margin-left:4px">${notifCount}</span>`
    : '';
  return `
    <div class="lp-tabs">
      <button class="lp-tab-btn active" data-lp-tab="plans">📋 Lecture Plans</button>
      <button class="lp-tab-btn"        data-lp-tab="assign">📅 LP Assignments</button>
      <button class="lp-tab-btn"        data-lp-tab="timeline">📊 Batch Timeline</button>
      <button class="lp-tab-btn"        data-lp-tab="notifs" id="lpNotifTabBtn">🔔 Notifications${badge}</button>
    </div>
    <div id="lp-panel-plans"    class="lp-tab-panel active"></div>
    <div id="lp-panel-assign"   class="lp-tab-panel"></div>
    <div id="lp-panel-timeline" class="lp-tab-panel"></div>
    <div id="lp-panel-notifs"   class="lp-tab-panel"></div>
  `;
}

// ═══════════════════════════════════════════════════
//  TAB 1 — LECTURE PLANS
// ═══════════════════════════════════════════════════

// ── Build ordered teacher names string for a batch ───────────
// Returns: "Active Teacher, Other Teacher1, Other Teacher2"
function _batchTeacherNames(batch) {
  const teachers = batch?.teachers;
  if (teachers && teachers.length > 1) {
    const resolveT = id => AppState.findById('teachers', id);
    // Active first, then rest in array order
    const active  = teachers.filter(t =>  t.isActive);
    const others  = teachers.filter(t => !t.isActive);
    const ordered = [...active, ...others];
    const names   = ordered.map(t => {
      const obj = resolveT(t.teacherId);
      return obj?.fullName || t.teacherName || '';
    }).filter(Boolean);
    return names.join(', ');
  }
  // Single teacher fallback
  const t = AppState.findById('teachers', batch?.teacherId);
  return t?.fullName || batch?.teacherName || '';
}
// ── Partial refresh: only re-render plan cards (no focus loss) ───────────────
function _refreshPlanCards(container) {
  const el = container.querySelector('#lp-panel-plans');
  if (!el) return;
  const planArea = el.querySelector('#lpPlanArea');
  if (!planArea) { renderPlansTab(container); return; }
  if (_lpActiveLPId) { renderPlansTab(container); return; }

  const allMeta  = getLPMeta();
  const subjects = AppState.get('subjects') || [];

  const hasDiscF  = _lpPlanFilter.discIds.length  > 0;
  const hasLevelF = _lpPlanFilter.levelIds.length > 0;
  const hasSubjF  = _lpPlanFilter.subjIds.length  > 0;
  const hasSearch = _lpPlanFilter.search.trim().length > 0;

  const plans = allMeta.filter(p => {
    if (hasDiscF && !_lpPlanFilter.discIds.includes(p.disciplineId)) return false;
    if (hasLevelF) {
      const subj = subjects.find(s => s.id === p.subjectId);
      if (!subj || !_lpPlanFilter.levelIds.includes(subj.levelId)) return false;
    }
    if (hasSubjF && !_lpPlanFilter.subjIds.includes(p.subjectId)) return false;
    if (hasSearch) {
      const q = _lpPlanFilter.search.toLowerCase();
      const hay = `${p.code} ${p.title} ${p.desc||''} ${p.subjectCode||''} ${p.subjectName||''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Update record count
  const totalRows = plans.reduce((s, m) => s + getLPRows(m.id).length, 0);
  const rc = el.querySelector('.record-count');
  if (rc) rc.textContent = `${plans.length}/${allMeta.length} plan${allMeta.length !== 1 ? "s" : ""} · ${totalRows} rows`;

  // Build cards HTML directly — no full re-render, input keeps focus
  let html = '';
  if (plans.length) {
    const sorted = [
      ...plans.filter(p => _lpSelectedIds.has(p.id)),
      ...plans.filter(p => !_lpSelectedIds.has(p.id)),
    ];
    html = sorted.map(meta => {
      const rows = getLPRows(meta.id);
      const hrs  = calcHours(rows);
      const liveSubj      = AppState.findById('subjects', meta.subjectId);
      const cardSubjLabel = meta.subjectName || liveSubj?.subjectName || '';
      const cardSubjCode  = meta.subjectCode || liveSubj?.subjectCode || '';
      const masterCode    = liveSubj?.subjectCode || '';
      const snapCode      = meta.subjectCode || '';
      const snapStale     = snapCode && masterCode && snapCode !== masterCode;
      const staleTag      = snapStale
        ? `<span title="Subject was renamed." style="font-size:10px;font-weight:700;color:#b45309;background:#fef3c7;padding:1px 7px;border-radius:10px;border:1px solid #fcd34d;margin-left:6px">⚠ ${snapCode}→${masterCode}</span>`
        : '';
      const cardSubjTag = cardSubjCode
        ? `<span style="font-size:10.5px;color:var(--t3);margin-left:8px;padding:1px 7px;background:var(--surface3);border-radius:10px;border:1px solid var(--border)">${cardSubjCode}${cardSubjLabel ? ' · ' + cardSubjLabel : ''}</span>${staleTag}`
        : '';
      const isSelected = _lpSelectedIds.has(meta.id);
      return `<div class="lp-card${isSelected ? ' lp-card-selected' : ''}" data-lp-select="${meta.id}">
        <div class="lp-card-head" style="padding:10px 16px">
          <div class="lp-plan-row-grid" style="display:grid;grid-template-columns:32px 60px 1fr 180px 120px 110px 120px;align-items:center;width:100%;gap:4px">
            <input type="checkbox" class="lp-plan-chk" data-lp-id="${meta.id}" ${isSelected ? 'checked' : ''} style="width:15px;height:15px;cursor:pointer;accent-color:var(--blue)" onclick="event.stopPropagation()"/>
            <span class="lp-code-badge" style="cursor:pointer">${meta.code}</span>
            <span style="font-size:14px;font-weight:400;color:var(--t1);padding-left:8px;cursor:pointer">${meta.title}${meta.desc ? `<span style="font-size:12px;color:var(--t3);margin-left:10px">${meta.desc}</span>` : ''}${cardSubjTag}</span>
            <span style="font-size:12px;color:var(--blue);font-weight:500;white-space:nowrap">🎓 ${hrs.teaching}h</span>
            <span style="font-size:12px;color:var(--yellow);font-weight:500;white-space:nowrap">📝 ${hrs.test}h</span>
            <span style="font-size:12px;color:var(--violet);font-weight:500;white-space:nowrap">🔁 ${hrs.mock}h</span>
            <span style="font-size:12px;color:var(--cyan);font-weight:500;white-space:nowrap">🔄 ${hrs.revision||0}h</span>
            <span style="font-size:13px;font-weight:700;color:var(--t1);white-space:nowrap">${hrs.total}h total</span>
          </div>
        </div>
      </div>`;
    }).join('');
  } else {
    html = `<div class="lp-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" style="opacity:.4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <p>No plans match your search.</p><span>Try a different term.</span>
    </div>`;
  }

  // Update ONLY the cards div — search input keeps focus ✅
  planArea.innerHTML = html;

  // Re-wire events on new card elements
  planArea.querySelectorAll('.lp-plan-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      if (chk.checked) _lpSelectedIds.add(chk.dataset.lpId);
      else _lpSelectedIds.delete(chk.dataset.lpId);
      _refreshPlanCards(container);
    });
  });
  planArea.querySelectorAll('.lp-card[data-lp-select]').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.classList.contains('lp-plan-chk')) return;
      _lpActiveLPId = card.dataset.lpSelect;
      renderPlansTab(container);
    });
  });
}

function renderPlansTab(container) {
  // ── One-time backfill: freeze snapshots on old LP records ────────────────
  LecturePlanService.backfillSnapshots();

  const el      = container.querySelector('#lp-panel-plans');
  const discs   = AppState.get('disciplines') || [];
  const levels  = AppState.get('levels')      || [];
  const subjects= AppState.get('subjects')    || [];
  const allMeta = getLPMeta();

  // ── Multi-filter: apply discipline, level, subject filters ───
  const hasDiscF  = _lpPlanFilter.discIds.length  > 0;
  const hasLevelF = _lpPlanFilter.levelIds.length > 0;
  const hasSubjF  = _lpPlanFilter.subjIds.length  > 0;
  const hasSearch = _lpPlanFilter.search.trim().length > 0;

  const plans = allMeta.filter(p => {
    // Discipline filter
    if (hasDiscF && !_lpPlanFilter.discIds.includes(p.disciplineId)) return false;
    // Level filter — match via subject's levelId
    if (hasLevelF) {
      const subj = subjects.find(s => s.id === p.subjectId);
      if (!subj || !_lpPlanFilter.levelIds.includes(subj.levelId)) return false;
    }
    // Subject filter
    if (hasSubjF && !_lpPlanFilter.subjIds.includes(p.subjectId)) return false;
    // Search
    if (hasSearch) {
      const q = _lpPlanFilter.search.toLowerCase();
      const hay = `${p.code} ${p.title} ${p.desc || ''} ${p.subjectCode || ''} ${p.subjectName || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Legacy single-select kept for plan selector dropdown only
  const _lpActiveDiscId = _lpPlanFilter.discIds[0] || '';
  const _lpActiveSubjId = _lpPlanFilter.subjIds[0] || '';

  // KPIs
  const totalRows = allMeta.reduce((n, p) => n + getLPRows(p.id).length, 0);

  let plansHTML = '';
  if (!_lpActiveLPId && plans.length) {
    // Sort: selected plans float to top, unselected sink to bottom
    const sortedPlans = [
      ...plans.filter(p => _lpSelectedIds.has(p.id)),
      ...plans.filter(p => !_lpSelectedIds.has(p.id)),
    ];
    // Show plan rows (no cards — flat rows with checkboxes)
    plansHTML = sortedPlans.map(meta => {
      const rows = getLPRows(meta.id);
      const hrs  = calcHours(rows);
      // Prefer snapshot subject name (frozen at save) over live lookup
      const liveSubj = AppState.findById('subjects', meta.subjectId);
      const cardSubjLabel = meta.subjectName || liveSubj?.subjectName || '';
      const cardSubjCode  = meta.subjectCode || liveSubj?.subjectCode || '';

      // ── Stale snapshot warning ────────────────────────────────────────────
      // If the LP's frozen subjectCode differs from the current master code,
      // show an amber badge so admin knows this LP's snapshot is from an old
      // subject name and can re-save it via "Edit Info" to refresh the snapshot.
      const masterCode = liveSubj?.subjectCode || '';
      const snapCode   = meta.subjectCode || '';
      const snapStale  = snapCode && masterCode && snapCode !== masterCode;
      const staleTag   = snapStale
        ? `<span title="Subject was renamed. Open Edit Info and Save to refresh." style="font-size:10px;font-weight:700;color:#b45309;background:#fef3c7;padding:1px 7px;border-radius:10px;border:1px solid #fcd34d;margin-left:6px;cursor:help">⚠ ${snapCode} (renamed to ${masterCode})</span>`
        : '';
      // ─────────────────────────────────────────────────────────────────────

      const cardSubjTag   = cardSubjCode
        ? `<span style="font-size:10.5px;color:var(--t3);margin-left:8px;padding:1px 7px;background:var(--surface3);border-radius:10px;border:1px solid var(--border)">${cardSubjCode}${cardSubjLabel ? ' · ' + cardSubjLabel : ''}</span>${staleTag}`
        : '';
      const isSelected = _lpSelectedIds.has(meta.id);
      return `
        <div class="lp-card${isSelected ? ' lp-card-selected' : ''}" data-lp-select="${meta.id}">
          <div class="lp-card-head" style="padding:10px 16px">
            <div class="lp-plan-row-grid" style="display:grid;grid-template-columns:32px 60px 1fr 180px 120px 110px 120px;align-items:center;width:100%;gap:4px">
              <input type="checkbox" class="lp-plan-chk" data-lp-id="${meta.id}"
                     ${isSelected ? 'checked' : ''}
                     style="width:15px;height:15px;cursor:pointer;accent-color:var(--blue)"
                     onclick="event.stopPropagation()"/>
              <span class="lp-code-badge" style="cursor:pointer">${meta.code}</span>
              <span style="font-size:14px;font-weight:400;color:var(--t1);padding-left:8px;cursor:pointer">${meta.title}${meta.desc ? `<span style="font-size:12px;color:var(--t3);margin-left:10px">${meta.desc}</span>` : ''}${cardSubjTag}</span>
              <span style="font-size:12px;color:var(--blue);font-weight:500;white-space:nowrap">🎓 ${hrs.teaching}h</span>
              <span style="font-size:12px;color:var(--yellow);font-weight:500;white-space:nowrap">📝 ${hrs.test}h</span>
              <span style="font-size:12px;color:var(--violet);font-weight:500;white-space:nowrap">🔁 ${hrs.mock}h</span>
              <span style="font-size:12px;color:var(--cyan);font-weight:500;white-space:nowrap">🔄 ${hrs.revision||0}h</span>
              <span style="font-size:13px;font-weight:700;color:var(--t1);font-family:'Segoe UI',Arial,sans-serif;white-space:nowrap">${hrs.total}h total</span>
            </div>
          </div>
        </div>`;
    }).join('');
  } else if (_lpActiveLPId) {
    plansHTML = _renderPlanDetail(_lpActiveLPId);
  } else {
    plansHTML = `<div class="lp-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" style="opacity:.4">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <p>${_lpActiveDiscId || _lpActiveSubjId ? 'No plans found for this filter.' : 'No lecture plans yet.'}</p>
      <span>Click "+ New Plan" to create the first lecture plan.</span>
    </div>`;
  }

  el.innerHTML = `
    <div class="module-toolbar" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div class="search-wrap">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input id="lpSearch" class="search-input" placeholder="Search by code, title, subject…" value="${_lpPlanFilter.search}"/>
      </div>
      <div id="lpFiltRow" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <div id="lpFiltDisc" class="lp-asg-mf"></div>
        <div id="lpFiltLevel" class="lp-asg-mf"></div>
        <div id="lpFiltSubj" class="lp-asg-mf"></div>
        ${(hasDiscF||hasLevelF||hasSubjF||hasSearch) ? `<button id="lpFiltClearAll" style="font-size:11px;padding:4px 10px;border-radius:6px;background:var(--red-dim);color:var(--red);border:1px solid rgba(239,68,68,.2);cursor:pointer;font-family:var(--font)">✕ Clear All</button>` : ''}
      </div>
      <span class="record-count" style="margin-left:auto">${plans.length}/${allMeta.length} plan${allMeta.length !== 1 ? 's' : ''} · ${totalRows} rows</span>
      <button id="lpNewBtn" class="add-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        New Plan
      </button>
    </div>

    <div id="lpPlanArea">${plansHTML}</div>
  `;

  // ── Init multi-filter widgets ─────────────────────────────────
  _injectLPAsgMFStyles();

  // Discipline filter
  _initLPAsgMF(
    el.querySelector('#lpFiltDisc'),
    'Discipline',
    discs.map(d => ({ value: d.id, label: d.abbreviation || d.fullName })),
    _lpPlanFilter.discIds,
    (vals) => { _lpPlanFilter.discIds = vals; _lpPlanFilter.levelIds = []; _lpPlanFilter.subjIds = []; _lpActiveLPId = ''; renderPlansTab(container); },
    true  // multi-select
  );

  // Level filter (filtered by selected disciplines)
  const filtLevels = hasDiscF
    ? levels.filter(l => _lpPlanFilter.discIds.includes(l.disciplineId))
    : levels;
  _initLPAsgMF(
    el.querySelector('#lpFiltLevel'),
    'Level',
    filtLevels.map(l => ({ value: l.id, label: l.levelName || l.name || l.id })),
    _lpPlanFilter.levelIds,
    (vals) => { _lpPlanFilter.levelIds = vals; _lpPlanFilter.subjIds = []; _lpActiveLPId = ''; renderPlansTab(container); },
    true
  );

  // Subject filter (filtered by selected disciplines/levels)
  let filtSubjs = subjects;
  if (hasLevelF) {
    filtSubjs = subjects.filter(s => _lpPlanFilter.levelIds.includes(s.levelId));
  } else if (hasDiscF) {
    filtSubjs = subjects.filter(s => {
      const lv = levels.find(l => l.id === s.levelId);
      return lv && _lpPlanFilter.discIds.includes(lv.disciplineId);
    });
  }
  _initLPAsgMF(
    el.querySelector('#lpFiltSubj'),
    'Subject',
    filtSubjs.map(s => ({ value: s.id, label: s.subjectCode || s.subjectName })),
    _lpPlanFilter.subjIds,
    (vals) => { _lpPlanFilter.subjIds = vals; _lpActiveLPId = ''; renderPlansTab(container); },
    true
  );

  // Clear all filters button
  el.querySelector('#lpFiltClearAll')?.addEventListener('click', () => {
    _lpPlanFilter = { discIds: [], levelIds: [], subjIds: [], search: '' };
    _lpActiveLPId = '';
    renderPlansTab(container);
  });

  el.querySelector('#lpNewBtn')?.addEventListener('click', () => {
    _openPlanForm(null, container);
  });

  // Search bar — update only plan cards, preserve input focus
  el.querySelector('#lpSearch')?.addEventListener('input', e => {
    _lpPlanFilter.search = e.target.value;
    _lpActiveLPId = '';
    clearTimeout(_lpSearchTimer);
    _lpSearchTimer = setTimeout(() => _refreshPlanCards(container), 180);
  });
  // Wire plan checkboxes — toggle selection, re-render to resort
  el.querySelectorAll('.lp-plan-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      const id = chk.dataset.lpId;
      if (chk.checked) _lpSelectedIds.add(id);
      else _lpSelectedIds.delete(id);
      renderPlansTab(container);
    });
  });

  el.querySelectorAll('.lp-card[data-lp-select]').forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't open detail if clicking the checkbox itself
      if (e.target.classList.contains('lp-plan-chk')) return;
      _lpActiveLPId = card.dataset.lpSelect;
      renderPlansTab(container);
    });
  });

  // Wire plan detail buttons AFTER render — only when detail view is active
  if (_lpActiveLPId) {
    _wirePlanDetail(container, _lpActiveLPId);
  }
}

function _renderPlanDetail(lpId) {
  const meta  = getLPMeta().find(m => m.id === lpId);
  if (!meta) return '';
  const rows  = getLPRows(lpId).sort((a, b) => (a.date || '').localeCompare(b.date || '') || 0);
  const hrs   = calcHours(rows);

  // ── Prefer snapshot names (frozen at save time) over live lookups ─────────
  // Same pattern as batch.js — master renames don't affect this LP display.
  const disc  = AppState.findById('disciplines', meta.disciplineId);
  const subj  = AppState.findById('subjects',    meta.subjectId);
  const discAbbr   = meta.disciplineAbbr  || disc?.abbreviation  || '';
  const subjCode   = meta.subjectCode     || subj?.subjectCode   || '';
  const subjDisplay = meta.subjectName    || subj?.subjectName   || subjCode;
  // ─────────────────────────────────────────────────────────────────────────

  return `
    <div class="lp-card">
      <div class="lp-card-head">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <button id="lpBackBtn" style="background:none;border:none;cursor:pointer;color:var(--t3);font-size:13px;padding:0">← Back</button>
          <span class="lp-code-badge">${meta.code}</span>
          <span style="font-weight:600;color:var(--t1)">${meta.title}</span>
          ${meta.desc ? `<span style="font-size:11.5px;color:var(--t3)">${meta.desc}</span>` : ''}
          ${disc || discAbbr ? `<span style="font-size:11px;color:var(--t3)">${discAbbr}${subjCode ? ' › ' + subjCode : ''}${subjDisplay ? ' — ' + subjDisplay : ''}</span>` : ''}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button id="lpEditInfoBtn"   class="add-btn" style="background:var(--surface3);color:var(--t2);border:1px solid var(--border);font-size:11.5px">✏️ Edit Info</button>
          <button id="lpEditRowsBtn"   class="add-btn" style="font-size:11.5px">📝 Edit Rows</button>
          <button id="lpExportCsvBtn"  class="add-btn" style="background:rgba(16,185,129,.1);color:#10b981;border:1px solid rgba(16,185,129,.25);font-size:11.5px">⬇ Export CSV</button>
          <button id="lpDeletePlanBtn" class="add-btn" style="background:var(--red-dim);color:var(--red);border:1px solid rgba(239,68,68,.2);font-size:11.5px">🗑 Delete</button>
        </div>
      </div>

      <div class="lp-hours-strip">${hoursBadge(hrs)}
        <span style="font-size:11px;color:var(--t3);margin-left:auto">${rows.length} rows</span>
      </div>

      <div class="lp-table-wrap">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:var(--surface3);position:sticky;top:0;z-index:3">
              <th style="padding:8px 12px;font-size:10px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;text-align:left;border-bottom:1px solid var(--border);width:36px">#</th>
              <th style="padding:8px 12px;font-size:10px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;text-align:left;border-bottom:1px solid var(--border)">Particulars</th>
              <th style="padding:8px 12px;font-size:10px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;text-align:left;border-bottom:1px solid var(--border);width:100px">Type</th>
              <th style="padding:8px 12px;font-size:10px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;text-align:left;border-bottom:1px solid var(--border);width:60px">Hrs</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0
              ? `<tr><td colspan="4" style="padding:32px;text-align:center;color:var(--t3);font-size:13px">No rows yet — click "Edit Rows" to add lectures.</td></tr>`
              : rows.map((r, i) => {
                  const t  = (r.type || 'Lecture').toLowerCase();
                  const tc = typeColor(r.type);
                  const h  = rowHours(r);
                  const rowCls = `lp-row-${t}`;
                  return `<tr class="${rowCls}">
                    <td style="padding:7px 12px;color:var(--t3);font-family:'Segoe UI',Arial,sans-serif;font-size:10px;border-bottom:1px solid var(--border)">${i + 1}</td>
                    <td style="padding:7px 12px;border-bottom:1px solid var(--border);font-weight:${t !== 'lecture' ? '600' : '400'};color:var(--t1)">${r.topic || '—'}</td>
                    <td style="padding:7px 12px;border-bottom:1px solid var(--border)"><span style="font-size:10px;font-weight:700;color:${tc};background:${tc}18;padding:2px 8px;border-radius:4px">${r.type || 'Lecture'}</span></td>
                    <td style="padding:7px 12px;border-bottom:1px solid var(--border);font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:${h === 0 ? 'var(--t3)' : 'var(--t1)'}">${h > 0 ? h + 'h' : '—'}</td>
                  </tr>`;
                }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ── Wire plan detail buttons (called after render) ────────────
function _wirePlanDetail(container, lpId) {
  const el = container.querySelector('#lp-panel-plans');

  el.querySelector('#lpBackBtn')?.addEventListener('click', () => {
    _lpActiveLPId = '';
    renderPlansTab(container);
  });
  el.querySelector('#lpEditInfoBtn')?.addEventListener('click', () => {
    const meta = getLPMeta().find(m => m.id === lpId);
    _openPlanForm(meta, container);
  });
  el.querySelector('#lpEditRowsBtn')?.addEventListener('click', () => {
    _openRowEditor(lpId, container);
  });

  // ── Export CSV — same format as Import CSV ──────────────────
  el.querySelector('#lpExportCsvBtn')?.addEventListener('click', () => {
    const meta = getLPMeta().find(m => m.id === lpId);
    const rows = getLPRows(lpId);
    if (!rows.length) { Toast.error('No rows to export.'); return; }

    const lines = ['Date,Particulars,Status'];
    rows.forEach(r => {
      const date   = r.date   || '';
      const topic  = r.topic  ? `"${r.topic.replace(/"/g, '""')}"` : '';
      const status = r.status || '';
      lines.push(`${date},${topic},${status}`);
    });

    const csv  = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href:     url,
      download: `LP_${meta.code}_${new Date().toISOString().slice(0,10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
    Toast.success(`Exported: LP_${meta.code}.csv`);
  });

  el.querySelector('#lpDeletePlanBtn')?.addEventListener('click', async () => {
    const meta = getLPMeta().find(m => m.id === lpId);
    const ok   = await Modal.confirm({
      title:        'Delete Plan',
      message:      `Delete plan <strong>${meta?.code} — ${meta?.title}</strong>? All rows will be removed.`,
      confirmLabel: 'Delete',
      danger:       true,
    });
    if (!ok) return;
    const result = LecturePlanService.delete(lpId);
    if (!result.success) { Toast.error(result.message); return; }
    _lpActiveLPId = '';
    Toast.success('Plan deleted.');
    renderPlansTab(container);
  });
}

// ── Plan Add/Edit form ────────────────────────────────────────
function _openPlanForm(existing, container) {
  const isEdit = !!existing;
  const discs  = AppState.get('disciplines') || [];
  const subjs  = AppState.get('subjects')    || [];

  const selDisc   = existing?.disciplineId || _lpActiveDiscId || '';
  const selSubj   = existing?.subjectId    || _lpActiveSubjId || '';
  const filtSubj = selDisc
    ? subjs.filter(s => {
        const l = AppState.findById('levels', s.levelId);
        return l?.disciplineId === selDisc;
      })
    : [];

  // ── Pre-fill Custom Subject Name only if user had explicitly set one ──────
  // Show snapshot ONLY when it differs from current master name.
  // This prevents a master rename from getting silently locked-in on next Save.
  const _masterSubjName = (AppState.findById('subjects', existing?.subjectId))?.subjectName || '';
  const _snapName = existing?.subjectName || '';
  const customSubjPrefill = (_snapName && _snapName !== _masterSubjName) ? _snapName : '';
  // ─────────────────────────────────────────────────────────────────────────

  let _mid;
  _mid = Modal.open({
    title: isEdit ? `Edit Plan — ${existing.code}` : 'New Lecture Plan',
    size:  'md',
    body: `
      <div class="form-group">
        <label class="form-label">Plan Code <span class="req">*</span></label>
        <input id="lpFCode" class="form-input" placeholder="e.g. LP-CS101-A"
               value="${existing?.code || ''}" style="font-family:'Segoe UI',Arial,sans-serif;text-transform:uppercase"/>
        <span class="form-hint">Unique identifier — e.g. LP-CS101-A, LP-BBA-June26</span>
      </div>
      <div class="form-group">
        <label class="form-label">Plan Title <span class="req">*</span></label>
        <input id="lpFTitle" class="form-input" placeholder="e.g. CS101 Morning Batch Plan"
               value="${existing?.title || ''}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <input id="lpFDesc" class="form-input" placeholder="Short note (optional)"
               value="${existing?.desc || ''}"/>
      </div>
      <div class="form-row cols-2">
        <div class="form-group">
          <label class="form-label">Discipline <span class="req">*</span></label>
          <select id="lpFDisc" class="form-select form-input">
            <option value="">— Select Discipline —</option>
            ${discs.map(d => `<option value="${d.id}" ${d.id === selDisc ? 'selected' : ''}>${d.abbreviation} — ${d.fullName}</option>`).join('')}
          </select>
          <span class="form-hint">Required — LP is linked to a discipline.</span>
        </div>
        <div class="form-group">
          <label class="form-label">Subject <span class="req">*</span></label>
          <select id="lpFSubj" class="form-select form-input" ${!selDisc ? 'disabled' : ''}>
            <option value="">— Select Subject —</option>
            ${filtSubj.map(s => `<option value="${s.id}" ${s.id === selSubj ? 'selected' : ''}>${s.subjectCode} — ${s.subjectName}</option>`).join('')}
          </select>
          <span class="form-hint">Required — Select discipline first.</span>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Custom Subject Name
          <span style="font-size:10px;font-weight:400;color:var(--t3);margin-left:6px">(optional override)</span>
        </label>
        <input id="lpFCustomSubjName" class="form-input"
               placeholder="Leave blank to use master subject name"
               value="${customSubjPrefill}"/>
        <span class="form-hint">
          🔒 This name is <strong>frozen per-LP</strong> — renaming the master subject won't affect this plan.
          You can also set a different display name for this specific LP (e.g. "Chemistry (Advanced)").
        </span>
      </div>
    `,
    actions: [
      { label: 'Cancel', variant: 'ghost', close: true },
      {
        label:   isEdit ? 'Save Changes' : 'Create Plan',
        variant: 'primary',
        close:   false,
        handler: (modalEl) => {
          const code  = modalEl.querySelector('#lpFCode')?.value?.trim();
          const title = modalEl.querySelector('#lpFTitle')?.value?.trim();
          const desc  = modalEl.querySelector('#lpFDesc')?.value?.trim();
          const discId = modalEl.querySelector('#lpFDisc')?.value || null;
          const subjId = modalEl.querySelector('#lpFSubj')?.value || null;
          const customSubjectName = modalEl.querySelector('#lpFCustomSubjName')?.value?.trim() || '';

          // Validate required fields
          if (!code)   { Toast.error('Plan Code is required.'); return; }
          if (!title)  { Toast.error('Plan Title is required.'); return; }
          if (!discId) { Toast.error('Discipline is required.'); return; }
          if (!subjId) { Toast.error('Subject is required.'); return; }

          const result = isEdit
            ? LecturePlanService.update(existing.id, { code, title, desc, disciplineId: discId, subjectId: subjId, customSubjectName })
            : LecturePlanService.create({ code, title, desc, disciplineId: discId, subjectId: subjId, customSubjectName });

          if (!result.success) { Toast.error(result.message); return; }

          if (!isEdit) _lpActiveLPId = result.plan.id;
          Modal.close(_mid);
          Toast.success(isEdit ? `Plan "${result.plan.code}" updated.` : `Plan "${result.plan.code}" created.`);
          renderPlansTab(container);
        }
      }
    ],
    onOpen: (modalEl) => {
      // Wire discipline → subject cascade
      modalEl.querySelector('#lpFDisc')?.addEventListener('change', e => {
        const dId = e.target.value;
        const ss  = dId
          ? subjs.filter(s => {
              const l = AppState.findById('levels', s.levelId);
              return l?.disciplineId === dId;
            })
          : [];
        const subjSel = modalEl.querySelector('#lpFSubj');
        if (!ss.length && dId) {
          subjSel.innerHTML = `<option value="">— No subjects found for this discipline —</option>`;
        } else {
          subjSel.innerHTML = `<option value="">— Select Subject —</option>` +
            ss.map(s => `<option value="${s.id}">${s.subjectCode} — ${s.subjectName}</option>`).join('');
        }
        subjSel.disabled = !dId;
      });
    }
  });
}

// ── Row editor modal ──────────────────────────────────────────
function _openRowEditor(lpId, container) {
  const meta = getLPMeta().find(m => m.id === lpId);
  _lpEditingLPId  = lpId;
  _lpEditingRows  = JSON.parse(JSON.stringify(getLPRows(lpId)));

  let _mid;
  _mid = Modal.open({
    title: `Edit Rows — ${meta?.code} · ${meta?.title}`,
    size:  'lg',
    body: `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <button id="lpRowAddBtn"  class="add-btn" style="font-size:12px">+ Add Row</button>
        <button id="lpRowTestBtn" class="add-btn" style="font-size:12px;background:rgba(245,158,11,.12);color:var(--yellow);border:1px solid rgba(245,158,11,.25)">+ Test</button>
        <button id="lpRowMockBtn" class="add-btn" style="font-size:12px;background:rgba(139,92,246,.12);color:var(--violet);border:1px solid rgba(139,92,246,.25)">+ Mock</button>
        <button id="lpRowMidBtn"  class="add-btn" style="font-size:12px;background:rgba(245,158,11,.15);color:var(--yellow);border:1px solid rgba(245,158,11,.3)">+ Midterm</button>
        <div style="margin-left:auto;display:flex;gap:6px">
          <label class="add-btn" style="font-size:12px;background:var(--surface3);color:var(--t2);border:1px solid var(--border);cursor:pointer">
            📥 Import CSV <input id="lpCsvInput" type="file" accept=".csv" style="display:none"/>
          </label>
          <button id="lpSampleBtn" class="add-btn" style="font-size:12px;background:var(--surface3);color:var(--t2);border:1px solid var(--border)">📄 Sample CSV</button>
        </div>
      </div>
      <div id="lpHoursSummary" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;min-height:22px"></div>
      <div class="lp-row-editor-wrap">
        <table style="width:100%;border-collapse:collapse" id="lpRowEditorTable">
          <thead>
            <tr style="background:var(--surface3)">
              <th style="padding:7px 10px;font-size:10px;color:var(--t3);text-transform:uppercase;text-align:left;width:36px;border-bottom:1px solid var(--border)">#</th>
              <th style="padding:7px 10px;font-size:10px;color:var(--t3);text-transform:uppercase;text-align:left;border-bottom:1px solid var(--border)">Particulars</th>
              <th style="padding:7px 10px;font-size:10px;color:var(--t3);text-transform:uppercase;text-align:left;width:90px;border-bottom:1px solid var(--border)">Type</th>
              <th style="padding:7px 10px;font-size:10px;color:var(--t3);text-transform:uppercase;text-align:left;width:55px;border-bottom:1px solid var(--border)">Hrs</th>
              <th style="padding:7px 10px;width:36px;border-bottom:1px solid var(--border)"></th>
            </tr>
          </thead>
          <tbody id="lpRowBody"></tbody>
        </table>
      </div>
    `,
    actions: [
      { label: 'Cancel', variant: 'ghost', close: true },
      {
        label: 'Save Rows', variant: 'primary', close: false,
        handler: () => {
          LecturePlanService.saveRows(_lpEditingLPId, _lpEditingRows);
          Modal.close(_mid);
          Toast.success(`${_lpEditingRows.length} rows saved.`);
          renderPlansTab(container);
        }
      }
    ],
    onOpen: (modalEl) => {
      _renderRowBody(modalEl);

      modalEl.querySelector('#lpRowAddBtn')?.addEventListener('click', () => {
        _lpEditingRows.push({ id: 'row-' + Date.now(), date: '', topic: '', type: 'Lecture', status: 'Pending' });
        _renderRowBody(modalEl);
        // Scroll to bottom
        const wrap = modalEl.querySelector('.lp-row-editor-wrap');
        if (wrap) setTimeout(() => { wrap.scrollTop = wrap.scrollHeight; }, 50);
      });
      ['Test','Mock','Midterm'].forEach(type => {
        const id = `lpRow${type.replace('term','').charAt(0).toUpperCase() + type.slice(type === 'Midterm' ? 0 : 1)}Btn`;
        const btn = modalEl.querySelector(`#lpRow${type === 'Test' ? 'Test' : type === 'Mock' ? 'Mock' : 'Mid'}Btn`);
        btn?.addEventListener('click', () => {
          _lpEditingRows.push({ id: 'row-' + Date.now() + '-s', date: '', topic: type, type, status: 'Pending' });
          _renderRowBody(modalEl);
        });
      });

      modalEl.querySelector('#lpCsvInput')?.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          const { rows, errors } = parseRowsCSV(ev.target.result);
          if (!rows.length) { Toast.error('No valid rows found in CSV.'); return; }
          if (_lpEditingRows.length && !confirm(`Replace existing ${_lpEditingRows.length} rows with ${rows.length} CSV rows?`)) return;
          _lpEditingRows = rows;
          _renderRowBody(modalEl);
          Toast.success(`${rows.length} rows imported.`);
        };
        reader.readAsText(file);
        e.target.value = '';
      });

      modalEl.querySelector('#lpSampleBtn')?.addEventListener('click', () => {
        const blob = new Blob([getSampleCSV()], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = Object.assign(document.createElement('a'), { href: url, download: 'lecture_plan_sample.csv' });
        a.click();
        URL.revokeObjectURL(url);
        Toast.success('Sample CSV downloaded.');
      });
    }
  });
}

function _renderRowBody(modalEl) {
  const tbody = modalEl.querySelector('#lpRowBody');
  if (!tbody) return;

  if (!_lpEditingRows.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--t3)">No rows yet. Click "+ Add Row" or import from CSV.</td></tr>`;
    _updateHoursSummary(modalEl);
    return;
  }

  tbody.innerHTML = _lpEditingRows.map((r, i) => {
    r.type = autoDetectType(r.topic);
    const t  = r.type;
    const tc = typeColor(t);
    const h  = rowHours(r);
    const rowCls = `lp-row-${t.toLowerCase()}`;
    return `<tr class="${rowCls}" data-row-idx="${i}">
      <td style="padding:5px 10px;color:var(--t3);font-family:'Segoe UI',Arial,sans-serif;font-size:10px;border-bottom:1px solid var(--border)">${i + 1}</td>
      <td style="padding:4px 10px;border-bottom:1px solid var(--border)">
        <input class="lp-row-input" data-row-field="topic" data-row-i="${i}"
               value="${(r.topic || '').replace(/"/g, '&quot;')}"
               placeholder="e.g. IAS-2 Inventory, Test 1, Mock…"/>
      </td>
      <td style="padding:5px 10px;border-bottom:1px solid var(--border)">
        <span id="lp_typelbl_${i}" style="font-size:10px;font-weight:700;color:${tc};background:${tc}18;padding:2px 8px;border-radius:4px">${t}</span>
      </td>
      <td id="lp_hcell_${i}" style="padding:5px 10px;border-bottom:1px solid var(--border);font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:${h === 0 ? 'var(--t3)' : 'var(--t1)'}">${h > 0 ? h + 'h' : '—'}</td>
      <td style="padding:5px 10px;border-bottom:1px solid var(--border)">
        <button class="lp-row-del-btn" data-row-i="${i}" style="background:none;border:none;cursor:pointer;color:var(--t3);font-size:13px;padding:2px 6px" title="Delete">🗑</button>
      </td>
    </tr>`;
  }).join('');

  // Wire inputs
  tbody.querySelectorAll('.lp-row-input').forEach(inp => {
    inp.addEventListener('input', e => {
      const i = parseInt(e.target.dataset.rowI);
      _lpEditingRows[i].topic = e.target.value;
      _lpEditingRows[i].type  = autoDetectType(e.target.value);
      const t  = _lpEditingRows[i].type;
      const h  = rowHours(_lpEditingRows[i]);
      const tc = typeColor(t);
      const lbl = document.getElementById('lp_typelbl_' + i);
      if (lbl) { lbl.textContent = t; lbl.style.color = tc; lbl.style.background = tc + '18'; }
      const hCell = document.getElementById('lp_hcell_' + i);
      if (hCell) { hCell.textContent = h > 0 ? h + 'h' : '—'; hCell.style.color = h === 0 ? 'var(--t3)' : 'var(--t1)'; }
      _updateHoursSummary(modalEl);
    });
  });
  tbody.querySelectorAll('.lp-row-del-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = parseInt(e.target.dataset.rowI || e.target.closest('[data-row-i]')?.dataset.rowI);
      _lpEditingRows.splice(i, 1);
      _renderRowBody(modalEl);
    });
  });

  _updateHoursSummary(modalEl);
}

function _updateHoursSummary(modalEl) {
  const el  = modalEl.querySelector('#lpHoursSummary');
  if (!el) return;
  const hrs = calcHours(_lpEditingRows);
  el.innerHTML = hoursBadge(hrs) + `<span style="font-size:11px;color:var(--t3);margin-left:8px">${_lpEditingRows.length} rows</span>`;
}

// ── LP Assignments multi-filter: inject styles ───────────────
function _injectLPAsgMFStyles() {
  if (document.getElementById('lp-asg-mf-style')) return;
  const st = document.createElement('style');
  st.id = 'lp-asg-mf-style';
  st.textContent = `
    .lp-asg-mf { position:relative; flex-shrink:0; }

    .lp-asg-mf-btn {
      display:inline-flex; align-items:center; gap:6px;
      padding:0 12px; height:34px; border:1px solid var(--border);
      border-radius:8px; background:var(--surface2); color:var(--t2);
      font-size:12.5px; white-space:nowrap; user-select:none; cursor:pointer;
      font-family:var(--font); transition:border-color .15s, color .15s, background .15s;
    }
    .lp-asg-mf-btn:hover { border-color:var(--blue); color:var(--blue); }
    .lp-asg-mf-btn.active {
      border-color:var(--blue); background:var(--blue-dim,rgba(37,99,235,.08));
      color:var(--blue); font-weight:600;
    }
    .lp-asg-mf-btn .mf-caret { font-size:9px; opacity:.55; flex-shrink:0; }
    .lp-asg-mf-btn .mf-clear {
      display:inline-flex;align-items:center;justify-content:center;
      width:16px;height:16px;border-radius:50%;
      background:var(--blue);color:#fff;font-size:9px;font-weight:700;
      flex-shrink:0;line-height:1;cursor:pointer;transition:opacity .15s;
    }
    .lp-asg-mf-btn .mf-clear:hover { opacity:.8; }

    .lp-asg-mf-panel {
      position:absolute; top:calc(100% + 6px); left:0; z-index:1000;
      min-width:220px; max-width:280px;
      background:var(--surface1,#fff);
      border:1px solid var(--border,#e2e8f0);
      border-radius:12px;
      box-shadow:0 8px 32px rgba(0,0,0,.14), 0 2px 8px rgba(0,0,0,.08);
      overflow:hidden; display:none; flex-direction:column;
    }
    .lp-asg-mf-panel.open { display:flex; }

    .lp-asg-mf-header {
      padding:10px 12px 6px;
      border-bottom:1px solid var(--border);
      background:var(--surface2);
    }
    .lp-asg-mf-header span {
      font-size:10px; font-weight:700; color:var(--t3);
      text-transform:uppercase; letter-spacing:.07em;
    }
    .lp-asg-mf-search {
      padding:8px 10px 6px;
      border-bottom:1px solid var(--border);
    }
    .lp-asg-mf-search input {
      width:100%; padding:5px 9px; font-size:12px;
      border:1px solid var(--border); border-radius:7px;
      background:var(--surface2); color:var(--t1);
      outline:none; font-family:var(--font);
      transition:border-color .15s;
    }
    .lp-asg-mf-search input:focus { border-color:var(--blue); }

    .lp-asg-mf-list { overflow-y:auto; max-height:210px; padding:4px 0; }

    .lp-asg-mf-item {
      display:flex; align-items:center; gap:9px;
      padding:7px 12px; cursor:pointer;
      font-size:12.5px; color:var(--t2);
      transition:background .1s, color .1s;
    }
    .lp-asg-mf-item:hover { background:var(--blue-dim,rgba(37,99,235,.07)); color:var(--blue); }
    .lp-asg-mf-item.selected { color:var(--blue); font-weight:600; }
    .lp-asg-mf-item .mf-check {
      width:15px; height:15px; border-radius:4px; flex-shrink:0;
      border:1.5px solid var(--border2,#cbd5e1);
      display:flex; align-items:center; justify-content:center;
      transition:all .12s;
    }
    .lp-asg-mf-item.selected .mf-check {
      background:var(--blue); border-color:var(--blue);
    }
    .lp-asg-mf-item.selected .mf-check::after {
      content:''; display:block; width:4px; height:7px;
      border:2px solid #fff; border-top:none; border-left:none;
      transform:rotate(45deg) translate(-1px,-1px);
    }
    .lp-asg-mf-empty {
      padding:14px 12px; font-size:12px; color:var(--t4);
      text-align:center; font-style:italic;
    }
    .lp-asg-mf-footer {
      border-top:1px solid var(--border);
      padding:7px 10px;
      display:flex; justify-content:space-between; align-items:center; gap:6px;
      background:var(--surface2);
    }
    .lp-asg-mf-footer .mf-count { font-size:11px; color:var(--t3); }
    .lp-asg-mf-footer .mf-reset {
      font-size:11px; padding:3px 10px; border-radius:6px; cursor:pointer;
      border:1px solid var(--border); background:var(--surface2); color:var(--t2);
      font-family:var(--font); transition:all .12s;
    }
    .lp-asg-mf-footer .mf-reset:hover { border-color:var(--red); color:var(--red); }
  `;
  document.head.appendChild(st);
}

// ── LP Assignments multi-filter: init one widget ──────────────
// multiSelect=false → single-select (like Odoo group-by)
// multiSelect=true  → multi-select (checkboxes, used in Plans tab)
function _initLPAsgMF(wrap, label, items, selectedVals, onChange, multiSelect = false) {
  if (!wrap) return;
  wrap.innerHTML = '';

  // normalize: single-select keeps a string, multi keeps an array
  let selected = multiSelect
    ? (Array.isArray(selectedVals) ? [...selectedVals] : [])
    : (selectedVals[0] || '');

  // ── Build DOM ──────────────────────────────────────────────
  const btn = document.createElement('div');
  btn.className = 'lp-asg-mf-btn';

  const panel = document.createElement('div');
  panel.className = 'lp-asg-mf-panel';

  // Header label
  const header = document.createElement('div');
  header.className = 'lp-asg-mf-header';
  header.innerHTML = `<span>${label}</span>`;
  panel.appendChild(header);

  // Search box
  const searchWrap = document.createElement('div');
  searchWrap.className = 'lp-asg-mf-search';
  const searchInp = document.createElement('input');
  searchInp.placeholder = `Search ${label.toLowerCase()}…`;
  searchWrap.appendChild(searchInp);
  panel.appendChild(searchWrap);

  // List
  const list = document.createElement('div');
  list.className = 'lp-asg-mf-list';
  panel.appendChild(list);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'lp-asg-mf-footer';
  const countSpan = document.createElement('span');
  countSpan.className = 'mf-count';
  const resetBtn = document.createElement('button');
  resetBtn.className = 'mf-reset';
  resetBtn.textContent = 'Clear';
  footer.appendChild(countSpan);
  footer.appendChild(resetBtn);
  panel.appendChild(footer);

  wrap.appendChild(btn);
  wrap.appendChild(panel);

  // ── Render list ────────────────────────────────────────────
  const renderList = (q = '') => {
    const filtered = q
      ? items.filter(i => i.label.toLowerCase().includes(q.toLowerCase()))
      : items;

    if (!filtered.length) {
      list.innerHTML = `<div class="lp-asg-mf-empty">No ${label.toLowerCase()}s found</div>`;
    } else {
      list.innerHTML = filtered.map(i => {
        const v = i.value ?? i.val ?? '';
        const isSel = multiSelect ? selected.includes(v) : selected === v;
        return `<div class="lp-asg-mf-item ${isSel ? 'selected' : ''}" data-val="${v}">
          <span class="mf-check"></span>
          <span>${i.label}</span>
        </div>`;
      }).join('');
    }

    countSpan.textContent = `${filtered.length} option${filtered.length !== 1 ? 's' : ''}`;

    list.querySelectorAll('.lp-asg-mf-item').forEach(item => {
      item.addEventListener('click', () => {
        const val = item.dataset.val;
        if (multiSelect) {
          // Toggle in array
          const idx = selected.indexOf(val);
          if (idx > -1) selected.splice(idx, 1);
          else selected.push(val);
          renderList(searchInp.value);
          renderBtn();
          onChange([...selected]);   // don't close — allow multi pick
        } else {
          if (selected === val) selected = '';
          else selected = val;
          renderList(searchInp.value);
          renderBtn();
          panel.classList.remove('open');
          onChange(selected);
        }
      });
    });
  };

  // ── Render button ──────────────────────────────────────────
  const renderBtn = () => {
    const isEmpty = multiSelect ? selected.length === 0 : !selected;
    if (isEmpty) {
      btn.className = 'lp-asg-mf-btn';
      btn.innerHTML = `<span>All ${label}s</span><span class="mf-caret">▾</span>`;
    } else {
      let lbl;
      if (multiSelect) {
        if (selected.length === 1) {
          const found = items.find(i => i.value === selected[0]);
          lbl = found ? found.label : selected[0];
          lbl = lbl.length > 20 ? lbl.slice(0,18)+'…' : lbl;
        } else {
          lbl = `${selected.length} selected`;
        }
      } else {
        const found = items.find(i => i.val === selected);
        lbl = found ? found.label : selected;
        lbl = lbl.length > 22 ? lbl.slice(0,20)+'…' : lbl;
      }
      btn.className = 'lp-asg-mf-btn active';
      btn.innerHTML = `<span>${lbl}</span><span class="mf-clear" data-mf-clear>✕</span><span class="mf-caret">▾</span>`;
      btn.querySelector('[data-mf-clear]')?.addEventListener('click', e => {
        e.stopPropagation();
        selected = multiSelect ? [] : '';
        renderBtn();
        renderList(searchInp.value);
        onChange(multiSelect ? [] : '');
      });
    }
  };

  // ── Search input ───────────────────────────────────────────
  searchInp.addEventListener('input', () => renderList(searchInp.value));

  // ── Reset button ───────────────────────────────────────────
  resetBtn.addEventListener('click', () => {
    selected = multiSelect ? [] : '';
    renderList(searchInp.value);
    renderBtn();
    onChange(multiSelect ? [] : '');
  });

  // ── Toggle panel ───────────────────────────────────────────
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = panel.classList.contains('open');
    // Close all other lp-asg panels
    document.querySelectorAll('.lp-asg-mf-panel.open').forEach(p => p.classList.remove('open'));
    if (!isOpen) {
      panel.classList.add('open');
      searchInp.value = '';
      renderList();
      setTimeout(() => searchInp.focus(), 60);
    }
  });

  // Close on outside click
  document.addEventListener('click', () => {
    panel.classList.remove('open');
  }, { capture: false });

  // Initial render
  renderList();
  renderBtn();
}

// ═══════════════════════════════════════════════════
//  TAB 2 — LP ASSIGNMENTS
// ═══════════════════════════════════════════════════
function renderAssignTab(container) {
  const el       = container.querySelector('#lp-panel-assign');
  if (!el) return;
  const allBatch = Auth.filterByCampus(AppState.get('batches') || [], 'campusId');
  const allMeta  = getLPMeta();
  const discs    = AppState.get('disciplines') || [];
  const levels   = AppState.get('levels')      || [];
  const subjects = AppState.get('subjects')    || [];
  const campuses = AppState.get('campuses')    || [];

  if (!allBatch.length) {
    el.innerHTML = `<div class="lp-empty"><p>No batches found.</p><span>Create batches first in the Batches module.</span></div>`;
    return;
  }

  // ── Build unique session list ─────────────────────────────
  const uniqueSessions = [...new Set(allBatch.map(b => b.sessionPeriod).filter(Boolean))].sort();

  // ── Build filter dropdowns ────────────────────────────────
  const discOpts = `<option value="">All Disciplines</option>` +
    discs.map(d => `<option value="${d.id}" ${d.id === _lpAssignFilter.discId ? 'selected' : ''}>${d.abbreviation} — ${d.fullName}</option>`).join('');

  // Levels filtered by selected discipline
  const filteredLevels = _lpAssignFilter.discId
    ? levels.filter(l => l.disciplineId === _lpAssignFilter.discId)
    : levels;
  const levelOpts = `<option value="">All Levels</option>` +
    filteredLevels.map(l => `<option value="${l.id}" ${l.id === _lpAssignFilter.levelId ? 'selected' : ''}>${l.levelName || l.name || l.code || l.id}</option>`).join('');

  // Subjects filtered by selected level
  const filteredSubjects = _lpAssignFilter.levelId
    ? subjects.filter(s => s.levelId === _lpAssignFilter.levelId)
    : (_lpAssignFilter.discId
        ? subjects.filter(s => { const lv = levels.find(l => l.id === s.levelId); return lv?.disciplineId === _lpAssignFilter.discId; })
        : subjects);
  const subjOpts = `<option value="">All Subjects</option>` +
    filteredSubjects.map(s => `<option value="${s.id}" ${s.id === _lpAssignFilter.subjId ? 'selected' : ''}>${s.subjectCode} — ${s.subjectName}</option>`).join('');

  // ── Apply filters to batches ──────────────────────────────
  const q = (_lpAssignFilter.search || '').toLowerCase().trim();
  const batches = allBatch.filter(b => {
    const subj    = subjects.find(s => s.id === b.subjectId);
    // levelId: prefer from subject chain, fallback to batch.levelId directly (batch.js stores it)
    const levelId = subj?.levelId || b.levelId || '';
    const level   = levels.find(l => l.id === levelId);
    // disciplineId: prefer from level chain, fallback to batch.disciplineId directly
    const discId  = level?.disciplineId || b.disciplineId || '';
    if (_lpAssignFilter.campusId && b.campusId !== _lpAssignFilter.campusId) return false;
    if (_lpAssignFilter.discId  && discId  !== _lpAssignFilter.discId)  return false;
    if (_lpAssignFilter.levelId && levelId !== _lpAssignFilter.levelId) return false;
    if (_lpAssignFilter.subjId  && b.subjectId !== _lpAssignFilter.subjId) return false;
    if (_lpAssignFilter.sessionId && (b.sessionPeriod || '') !== _lpAssignFilter.sessionId) return false;
    if (q) {
      const disc    = discs.find(d => d.id === discId);
      const lvlObj  = level || levels.find(l => l.id === b.levelId);
      const teacher = AppState.findById('teachers', b.teacherId);
      const campus  = campuses.find(c => c.id === b.campusId);
      const hay = [
        b.batchName, b.subjectCode || subj?.subjectCode, b.subjectName || subj?.subjectName,
        disc?.abbreviation, teacher?.fullName, lvlObj?.levelName,
        campus?.campusName, b.sessionPeriod,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const assignedCount = allBatch.filter(b => getAssignmentForBatch(b.id)).length;

  // ── Store filtered+assigned batches for bulk export ───────
  const assignedBatches = batches.filter(b => getAssignmentForBatch(b.id));

  // ── Render rows ───────────────────────────────────────────
  const rows = batches.length ? batches.map(b => {
    const lpa    = getAssignmentForBatch(b.id);
    const disc   = AppState.findById('disciplines', b.disciplineId);
    const tchObj = AppState.findById('teachers',    b.teacherId);
    const totalHrs = lpa ? (() => { const h = calcHours(lpa.rows); return Math.round((h.teaching + h.test + h.mock + (h.revision || 0)) * 100) / 100; })() : null;

    // ── Subject display: prefer LP assignment snapshot → batch snapshot → live ─
    // Priority: lpa.subjectCode (frozen at assign time) → b.subjectCode (batch
    // snapshot) → live lookup. This ensures master renames don't affect display.
    const liveSubj   = AppState.findById('subjects', b.subjectId);
    const subjCode   = lpa?.subjectCode  || b.subjectCode  || liveSubj?.subjectCode  || '';
    const subjName   = lpa?.subjectName  || b.subjectName  || liveSubj?.subjectName  || '';
    const discAbbr   = b.disciplineAbbr  || AppState.findById('disciplines', b.disciplineId)?.abbreviation || '';
    // ─────────────────────────────────────────────────────────────────────────

    return `
      <div class="lp-assign-row">
        <div style="min-width:160px">
          <div style="font-family:'Segoe UI',Arial,sans-serif;font-size:13px;font-weight:600;color:var(--t1)">${b.batchName}</div>
          <div style="font-size:11.5px;color:var(--t3);margin-top:2px">
            ${discAbbr}${subjCode ? ' › ' + subjCode : ''}${(() => { const n = _batchTeacherNames(b); return n ? ' · ' + n : ''; })()}
          </div>
        </div>
        <div style="flex:1;display:flex;align-items:center;gap:10px">
          ${lpa
            ? `<span style="font-size:12.5px;font-weight:500;color:var(--t1)">${lpa.lpCode} · ${lpa.lpTitle}</span>
               <span id="lp-total-hrs-${b.id}" style="font-size:12px;font-weight:600;color:var(--t2);font-family:'Segoe UI',Arial,sans-serif">${totalHrs}h</span>`
            : `<span style="font-size:12px;color:var(--t4);font-style:italic">No LP assigned</span>`}
        </div>
        <div style="display:flex;gap:4px;align-items:center">
          ${lpa ? `
            <button title="View" data-lp-view="${b.id}" style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:var(--surface2);border:1px solid var(--border);border-radius:7px;cursor:pointer;color:var(--t2)" onmouseover="this.style.borderColor='var(--blue)';this.style.color='var(--blue)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--t2)'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>` : ''}
          ${allMeta.length ? `
            <button title="${lpa ? 'Edit Assignment' : 'Assign LP'}" data-lp-assign="${b.id}" style="${lpa ? 'width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:var(--surface2);border:1px solid var(--border);border-radius:7px;cursor:pointer;color:var(--t2)' : 'padding:0 12px;height:32px;display:flex;align-items:center;gap:5px;background:var(--surface2);border:1px solid var(--border);border-radius:7px;cursor:pointer;color:var(--t2);font-size:12px;white-space:nowrap'}" onmouseover="this.style.borderColor='var(--blue)';this.style.color='var(--blue)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--t2)'">
              ${lpa
                ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M8.46 8.46a5 5 0 0 0 0 7.07"/></svg>`
                : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Assign LP`}
            </button>` : `<span style="font-size:11px;color:var(--t3)">No plans</span>`}
          ${lpa ? `
            <button title="Remove" data-lp-remove="${b.id}" style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:var(--surface2);border:1px solid var(--border);border-radius:7px;cursor:pointer;color:var(--t2)" onmouseover="this.style.borderColor='var(--red)';this.style.color='var(--red)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--t2)'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
            </button>` : ''}
        </div>
      </div>`;
  }).join('') : `<div class="lp-empty" style="margin:0"><p>No batches match filters.</p></div>`;

  el.innerHTML = `
    <div class="module-toolbar" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div class="search-wrap" style="min-width:200px;max-width:320px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0;opacity:.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input id="lpAsgSearch" class="search-input" placeholder="Search batch, subject, teacher…" value="${_lpAssignFilter.search || ''}" style="flex:1"/>
      </div>
      <div class="lp-asg-mf" id="lpAsgCampusMF" data-label="Campus"></div>
      <div class="lp-asg-mf" id="lpAsgDiscMF" data-label="Discipline"></div>
      <div class="lp-asg-mf" id="lpAsgLevelMF" data-label="Level"></div>
      <div class="lp-asg-mf" id="lpAsgSubjMF" data-label="Subject"></div>
      <div class="lp-asg-mf" id="lpAsgSessionMF" data-label="Session"></div>
      ${(_lpAssignFilter.campusId || _lpAssignFilter.discId || _lpAssignFilter.levelId || _lpAssignFilter.subjId || _lpAssignFilter.sessionId || _lpAssignFilter.search)
        ? `<button id="lpAsgClearBtn" class="add-btn" style="font-size:11.5px;background:var(--surface3);color:var(--t2);border:1px solid var(--border2)">✕ Clear all</button>`
        : ''}
      <span class="record-count" style="margin-left:auto">${batches.length} of ${allBatch.length} batch${allBatch.length !== 1 ? 'es' : ''} · ${assignedCount} assigned</span>
      ${assignedBatches.length ? `
        <div style="display:flex;gap:4px;align-items:center">
          <button id="lpAsgBulkExcelBtn" title="Bulk Export Excel — all filtered assigned batches"
            style="display:inline-flex;align-items:center;gap:5px;padding:0 10px;height:32px;border-radius:7px;border:1px solid rgba(16,185,129,.35);background:rgba(16,185,129,.07);color:#10b981;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:var(--font);transition:all .15s"
            onmouseover="this.style.background='rgba(16,185,129,.15)'" onmouseout="this.style.background='rgba(16,185,129,.07)'">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Excel (${assignedBatches.length})
          </button>
          <button id="lpAsgBulkPDFBtn" title="Bulk Export PDF — all filtered assigned batches"
            style="display:inline-flex;align-items:center;gap:5px;padding:0 10px;height:32px;border-radius:7px;border:1px solid rgba(239,68,68,.35);background:rgba(239,68,68,.07);color:#ef4444;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:var(--font);transition:all .15s"
            onmouseover="this.style.background='rgba(239,68,68,.15)'" onmouseout="this.style.background='rgba(239,68,68,.07)'">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            PDF (${assignedBatches.length})
          </button>
        </div>` : ''}
    </div>
    <div class="lp-assign-list-wrap"><div class="lp-card">${rows}</div></div>`;

  // ── Inject lp-asg multi-filter styles (once) ──────────────
  _injectLPAsgMFStyles();

  // ── Build multi-filter widgets ────────────────────────────
  const campusItems  = campuses
    .filter(c => allBatch.some(b => b.campusId === c.id))
    .map(c => ({ val: c.id, label: c.campusName || c.name || c.id }));
  const discItems  = discs.map(d => ({ val: d.id, label: `${d.abbreviation} — ${d.fullName}` }));
  const levelItems = filteredLevels.map(l => ({ val: l.id, label: l.levelName || l.name || l.id }));
  const subjItems  = filteredSubjects.map(s => ({ val: s.id, label: `${s.subjectCode} — ${s.subjectName}` }));
  const sessionItems = uniqueSessions.map(s => ({ val: s, label: s }));

  _initLPAsgMF(el.querySelector('#lpAsgCampusMF'), 'Campus',     campusItems,  _lpAssignFilter.campusId  ? [_lpAssignFilter.campusId]  : [], val => {
    _lpAssignFilter.campusId = val;
    renderAssignTab(container);
  });
  _initLPAsgMF(el.querySelector('#lpAsgDiscMF'),  'Discipline', discItems,  _lpAssignFilter.discId  ? [_lpAssignFilter.discId]  : [], val => {
    _lpAssignFilter.discId  = val;
    _lpAssignFilter.levelId = '';
    _lpAssignFilter.subjId  = '';
    renderAssignTab(container);
  });
  _initLPAsgMF(el.querySelector('#lpAsgLevelMF'), 'Level',      levelItems, _lpAssignFilter.levelId ? [_lpAssignFilter.levelId] : [], val => {
    _lpAssignFilter.levelId = val;
    _lpAssignFilter.subjId  = '';
    renderAssignTab(container);
  });
  _initLPAsgMF(el.querySelector('#lpAsgSubjMF'),  'Subject',    subjItems,  _lpAssignFilter.subjId  ? [_lpAssignFilter.subjId]  : [], val => {
    _lpAssignFilter.subjId = val;
    renderAssignTab(container);
  });
  _initLPAsgMF(el.querySelector('#lpAsgSessionMF'), 'Session',  sessionItems, _lpAssignFilter.sessionId ? [_lpAssignFilter.sessionId] : [], val => {
    _lpAssignFilter.sessionId = val;
    renderAssignTab(container);
  });

  // ── Search — live re-render so rows never get stuck hidden ──
  // _lpAssignFilter.search is already set before render, so the list
  // always reflects the current query. Clearing the box re-renders
  // and shows all rows again automatically.
  el.querySelector('#lpAsgSearch')?.addEventListener('input', e => {
    _lpAssignFilter.search = e.target.value;
    clearTimeout(_lpAsgSearchTimer);
    _lpAsgSearchTimer = setTimeout(() => {
      const savedVal = _lpAssignFilter.search;
      renderAssignTab(container);
      // Restore focus + cursor after re-render
      const newInp = el.querySelector('#lpAsgSearch');
      if (newInp) {
        newInp.focus();
        try { newInp.setSelectionRange(savedVal.length, savedVal.length); } catch(_) {}
      }
    }, 120);
  });
  el.querySelector('#lpAsgClearBtn')?.addEventListener('click', () => {
    _lpAssignFilter = { campusId: '', discId: '', levelId: '', subjId: '', sessionId: '', search: '' };
    renderAssignTab(container);
  });

  // ── Wire batch action buttons ─────────────────────────────
  el.querySelectorAll('[data-lp-assign]').forEach(btn => {
    btn.addEventListener('click', () => _openAssignModal(btn.dataset.lpAssign, container));
  });
  el.querySelectorAll('[data-lp-view]').forEach(btn => {
    btn.addEventListener('click', () => _openViewModal(btn.dataset.lpView, el));
  });
  el.querySelectorAll('[data-lp-remove]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const b = AppState.findById('batches', btn.dataset.lpRemove);
      const ok = await Modal.confirm({
        title: 'Remove Assignment',
        message: `Remove LP assignment from batch <strong>${b?.batchName}</strong>?`,
        confirmLabel: 'Remove', danger: true,
      });
      if (!ok) return;
      LecturePlanService.removeAssignment(btn.dataset.lpRemove);
      Toast.success('Assignment removed.');
      renderAssignTab(container);
    });
  });

  // ── Bulk Export — Excel ───────────────────────────────────
  el.querySelector('#lpAsgBulkExcelBtn')?.addEventListener('click', () => {
    if (!assignedBatches.length) return;
    _bulkExportExcel(assignedBatches);
  });

  // ── Bulk Export — PDF ─────────────────────────────────────
  el.querySelector('#lpAsgBulkPDFBtn')?.addEventListener('click', () => {
    if (!assignedBatches.length) return;
    _bulkExportPDF(assignedBatches);
  });
}

// ── Shared: load a script once, then call cb ──────────────────
function _loadScript(src, cb, errCb) {
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) { cb(); return; }
  const s = document.createElement('script');
  s.src = src;
  s.onload  = cb;
  s.onerror = errCb;
  document.head.appendChild(s);
}

// ── Bulk Export — Excel (one .xlsx per batch, zipped) ─────────
function _bulkExportExcel(batches) {
  const doExport = (XLSX, JSZip) => {
    const zip     = new JSZip();
    const now     = new Date();
    const dateTag = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }).replace(/ /g, '-');

    batches.forEach(b => {
      const lpa      = getAssignmentForBatch(b.id);
      if (!lpa) return;
      const hrs      = calcHours(lpa.rows);
      const liveSubj = AppState.findById('subjects',    b.subjectId);
      const disc     = AppState.findById('disciplines', b.disciplineId);
      const teacher  = AppState.findById('teachers',    b.teacherId);
      const subjCode = lpa.subjectCode || b.subjectCode || liveSubj?.subjectCode || '—';
      const discAbbr = b.disciplineAbbr || disc?.abbreviation || '—';
      const tchName  = _batchTeacherNames(b) || teacher?.fullName || '—';

      const dataRows = [];
      dataRows.push(['Batch', b.batchName, 'LP Code', lpa.lpCode, 'LP Title', lpa.lpTitle]);
      dataRows.push(['Discipline', discAbbr, 'Subject', subjCode, 'Teacher', tchName]);
      dataRows.push(['Teaching', hrs.teaching + 'h', 'Test', hrs.test + 'h', 'Mock', hrs.mock + 'h', 'Revision', (hrs.revision || 0) + 'h', 'Total', hrs.total + 'h']);
      dataRows.push([]);
      dataRows.push(['#', 'Date', 'Particulars', 'Type', 'Hours', 'Status', 'Remarks']);

      lpa.rows.forEach((r, i) => {
        const ds = r.date ? (() => {
          const d    = new Date(r.date + 'T00:00:00');
          const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
          const mons = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          return days[d.getDay()] + ' ' + d.getDate() + ' ' + mons[d.getMonth()] + ' ' + d.getFullYear();
        })() : '';
        dataRows.push([i + 1, ds, r.topic || '', r.type || 'Lecture', rowHours(r) || 0, r.status || 'Pending', r.remarks || '']);
      });

      const ws = XLSX.utils.aoa_to_sheet(dataRows);
      ws['!cols'] = [{ wch:5 },{ wch:20 },{ wch:48 },{ wch:12 },{ wch:8 },{ wch:12 },{ wch:30 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Lecture Plan');

      // Write workbook to binary array and add to zip
      const wbOut  = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      // Same filename logic as individual PDF export
      const _teacher = AppState.findById('teachers', b?.teacherId);
      const _activeTeacher = (() => {
        const ts = b?.teachers;
        if (ts && ts.length) {
          const a = ts.find(t => t.isActive);
          const obj = AppState.findById('teachers', a?.teacherId);
          return obj?.fullName || a?.teacherName || '';
        }
        return _teacher?.fullName || b?.teacherName || '';
      })();
      const _fileName = [b?.batchName, _activeTeacher].filter(Boolean).join(' - ');
      const safeName  = _fileName.replace(/[\\\/\?\*\[\]:]/g, '_').slice(0, 80);
      zip.file(`${safeName}.xlsx`, wbOut);
    });

    zip.generateAsync({ type: 'blob' }).then(blob => {
      const url = URL.createObjectURL(blob);
      const a   = Object.assign(document.createElement('a'), {
        href: url, download: `LP-Assignments-${dateTag}.zip`,
      });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      Toast.success(`ZIP downloaded — ${batches.length} Excel file${batches.length !== 1 ? 's' : ''}.`);
    });
  };

  const xlsxSrc  = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  const jszipSrc = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

  const run = () => doExport(window.XLSX, window.JSZip);
  const err = () => Toast.error('Could not load required library.');

  if (window.XLSX && window.JSZip) { run(); return; }
  _loadScript(xlsxSrc, () => {
    _loadScript(jszipSrc, run, err);
  }, err);
}

// ── Bulk Export — PDF (one real .pdf per batch, zipped) ────────
function _bulkExportPDF(batches) {

  // Row-type colours  [textColor, fillColor]
  const TYPE_COLORS = {
    lecture:  [55,  65,  81,  249,250,251],
    test:     [146, 64,  14,  255,251,235],
    midterm:  [120, 53,  15,  254,243,199],
    mock:     [76,  29,  149, 245,243,255],
    holiday:  [153, 27,  27,  254,242,242],
    revision: [22,  78,  99,  236,254,255],
    other:    [55,  65,  81,  249,250,251],
  };

  const now     = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
  const dateTag = dateStr.replace(/ /g, '-');

  // ── Build one PDF (ArrayBuffer) per batch using jsPDF + autoTable ──
  const _buildPDF = (b, jsPDF, autoTable) => {
    const lpa      = getAssignmentForBatch(b.id);
    if (!lpa) return null;
    const hrs      = calcHours(lpa.rows);
    const liveSubj = AppState.findById('subjects',    b.subjectId);
    const disc     = AppState.findById('disciplines', b.disciplineId);
    const campus   = AppState.findById('campuses',    b.campusId);
    const subjCode = lpa.subjectCode || b.subjectCode || liveSubj?.subjectCode || '';
    const discAbbr = b.disciplineAbbr || disc?.abbreviation || '';
    const tchName  = _batchTeacherNames(b);
    const campName = campus?.campusName || '';

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const PW  = doc.internal.pageSize.getWidth();   // 210mm
    const PH  = doc.internal.pageSize.getHeight();  // 297mm
    const ML  = 14, MR = 14, MT = 14;
    const CW  = PW - ML - MR;                       // content width

    // ── Header bar ──────────────────────────────────────────
    doc.setFillColor(30, 64, 175);                   // #1e40af
    doc.rect(ML, MT, CW, 14, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text(b.batchName || '—', ML + 3, MT + 5.5);

    // LP code badge (right side of header)
    doc.setFontSize(8);
    doc.text(lpa.lpCode || '', PW - MR - 3, MT + 5.5, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    const metaParts = [
      campName  ? `${campName}`    : '',
      discAbbr  ? `${discAbbr}`    : '',
      subjCode  ? `${subjCode}`    : '',
      tchName   ? `${tchName}`     : '',
    ].filter(Boolean).join('   |   ');
    doc.text(metaParts || ' ', ML + 3, MT + 10.5);
    doc.text(lpa.lpTitle || '', PW - MR - 3, MT + 10.5, { align: 'right' });

    let y = MT + 18;

    // ── KPI strip ────────────────────────────────────────────
    const kpis = [
      { label: 'Teaching', val: `${hrs.teaching}h`, bg: [236,253,245], acc: [16,185,129] },
      { label: 'Test',     val: `${hrs.test}h`,     bg: [255,251,235], acc: [245,158,11] },
      { label: 'Mock',     val: `${hrs.mock}h`,     bg: [245,243,255], acc: [139,92,246] },
      { label: 'Revision', val: `${hrs.revision||0}h`, bg: [236,254,255], acc: [6,182,212]  },
      { label: 'Total',    val: `${hrs.total}h`,    bg: [248,250,252], acc: [100,116,139] },
      { label: 'Rows',     val: `${lpa.rows.length}`,bg:[250,245,255], acc: [168,85,247]  },
    ];
    const kW = CW / kpis.length;
    kpis.forEach((k, i) => {
      const x = ML + i * kW;
      // Background
      doc.setFillColor(...k.bg);
      doc.roundedRect(x, y, kW - 1, 12, 1.5, 1.5, 'F');
      // Left accent bar
      doc.setFillColor(...k.acc);
      doc.rect(x, y, 2, 12, 'F');
      // Label
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(107, 114, 128);
      doc.text(k.label.toUpperCase(), x + 4, y + 4.5);
      // Value
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...k.acc);
      doc.text(k.val, x + 4, y + 10);
    });

    y += 16;

    // ── Rows table ───────────────────────────────────────────
    const tableRows = lpa.rows.map((r, i) => {
      const t    = (r.type || 'Lecture').toLowerCase();
      const h    = rowHours(r);
      const done = r.status === 'Done';
      const ds   = r.date ? (() => {
        try {
          const d = new Date(r.date + 'T00:00:00');
          const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
          const mons = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          return `${days[d.getDay()]} ${d.getDate()} ${mons[d.getMonth()]}`;
        } catch(_) { return r.date; }
      })() : '—';
      return [
        i + 1,
        ds,
        done ? `[Done] ${r.topic || ''}` : (r.topic || ''),
        r.type || 'Lecture',
        h > 0 ? `${h}h` : '—',
        r.status || 'Pending',
        { _type: t, _done: done },   // metadata (removed before render)
      ];
    });

    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR },
      head: [['#', 'Date', 'Particulars', 'Type', 'Hrs', 'Status']],
      body: tableRows.map(r => r.slice(0, 6)),
      headStyles: {
        fillColor: [30, 64, 175],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: 3,
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8  },
        1: { cellWidth: 24 },
        2: { cellWidth: 'auto' },
        3: { halign: 'center', cellWidth: 20 },
        4: { halign: 'center', cellWidth: 12 },
        5: { halign: 'center', cellWidth: 20 },
      },
      bodyStyles: { fontSize: 8, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      // Per-row colours by type
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const meta = tableRows[data.row.index]?.[6];
        if (!meta) return;
        const tc = TYPE_COLORS[meta._type] || TYPE_COLORS.other;
        data.cell.styles.fillColor  = [tc[3], tc[4], tc[5]];
        data.cell.styles.textColor  = meta._done ? [156,163,175] : [tc[0], tc[1], tc[2]];
      },
      // Footer on each page
      didDrawPage: (data) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(156, 163, 175);
        doc.text(
          `${b.batchName} · ${lpa.lpCode} — LP Export`,
          ML, PH - 8
        );
        doc.text(
          `Generated ${dateStr} at ${timeStr}   |   Page ${data.pageNumber}`,
          PW - MR, PH - 8, { align: 'right' }
        );
        // Bottom line
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.3);
        doc.line(ML, PH - 10, PW - MR, PH - 10);
      },
    });

    // Return as Uint8Array for JSZip
    return doc.output('arraybuffer');
  };

  // ── Load libs then build ZIP ──────────────────────────────
  const doExport = (jsPDF, autoTable, JSZip) => {
    const zip = new JSZip();

    batches.forEach(b => {
      const buf = _buildPDF(b, jsPDF, autoTable);
      if (!buf) return;

      // Same filename logic as individual PDF export
      const teacher = AppState.findById('teachers', b?.teacherId);
      const activeTeacher = (() => {
        const ts = b?.teachers;
        if (ts && ts.length) {
          const a = ts.find(t => t.isActive);
          const obj = AppState.findById('teachers', a?.teacherId);
          return obj?.fullName || a?.teacherName || '';
        }
        return teacher?.fullName || b?.teacherName || '';
      })();
      const fileName = [b?.batchName, activeTeacher].filter(Boolean).join(' - ');
      const safeName = fileName.replace(/[\\\/\?\*\[\]:]/g, '_').slice(0, 80);

      zip.file(`${safeName}.pdf`, buf);
    });

    zip.generateAsync({ type: 'blob' }).then(blob => {
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), {
        href: url, download: `LP-PDF-Export-${dateTag}.zip`,
      }).click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      Toast.success(`ZIP downloaded — ${batches.length} PDF file${batches.length !== 1 ? 's' : ''}.`);
    });
  };

  // CDN sources
  const JSPDF_SRC     = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  const AUTOTABLE_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
  const JSZIP_SRC     = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

  const err = () => Toast.error('Could not load PDF library. Check your internet connection.');

  const run = () => {
    const jsPDF     = window.jspdf?.jsPDF || window.jsPDF;
    const autoTable = window.jspdf?.autoTable || ((doc, opts) => doc.autoTable(opts));
    doExport(jsPDF, autoTable, window.JSZip);
  };

  if (window.jspdf?.jsPDF && window.JSZip) { run(); return; }

  _loadScript(JSPDF_SRC, () => {
    _loadScript(AUTOTABLE_SRC, () => {
      if (window.JSZip) { run(); return; }
      _loadScript(JSZIP_SRC, run, err);
    }, err);
  }, err);
}

// ── Assign LP to batch modal ──────────────────────────────────
function _openAssignModal(batchId, container) {
  const batch   = AppState.findById('batches', batchId);
  const allMeta = getLPMeta();
  const existing = getAssignmentForBatch(batchId);

  // Smart filter: match by subjectId AND subjectCode snapshot.
  //
  // Why both? When a subject is renamed (FA1→FA12→FA1), all LPs keep the
  // same subjectId. An LP whose subjectCode snapshot says "FA12" belongs to
  // the FA12 era; one whose snapshot says "FA1" belongs to FA1.
  // A batch created as FA12 should only see FA12 LPs, not FA1 LPs.
  //
  // Match rule (most-specific first):
  //  1. subjectId matches  AND  LP subjectCode === batch subjectCode  → exact hit
  //  2. subjectId matches  AND  LP subjectCode is empty (old, un-snapshotted LP)
  //       → include as fallback so nothing disappears for legacy data
  //  3. subjectId doesn't match → exclude always
  const batchSubjCodeSnap = (batch?.subjectCode || '').trim().toUpperCase();
  const relevant = allMeta.filter(p => {
    if (p.subjectId !== batch?.subjectId) return false;     // wrong subject entirely
    const lpCode = (p.subjectCode || '').trim().toUpperCase();
    if (!lpCode) return true;                               // legacy LP, no snapshot yet → include
    if (!batchSubjCodeSnap) return true;                    // batch has no snapshot → include all
    return lpCode === batchSubjCodeSnap;                    // strict code match
  });
  const noLPFound = relevant.length === 0;
  const planList  = relevant;

  // ── Use batch snapshot for subject display (master rename safe) ───────────
  const liveSubjForBatch = AppState.findById('subjects', batch?.subjectId);
  const batchSubjCode = batch?.subjectCode || liveSubjForBatch?.subjectCode || 'this subject';
  // ─────────────────────────────────────────────────────────────────────────

  const filteredNote = noLPFound
    ? `<div style="padding:12px 16px;background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.2);border-radius:8px;font-size:13px;color:var(--red);margin-bottom:12px;display:flex;align-items:center;gap:10px">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <div>
          <div style="font-weight:700;margin-bottom:2px">No Lecture Plan found for this subject</div>
          <div style="font-size:11.5px;opacity:.8">First create an LP for <strong>${batchSubjCode}</strong> in the "Lecture Plans" tab, then come back to assign it.</div>
        </div>
       </div>`
    : `<div style="padding:8px 12px;background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.2);border-radius:6px;font-size:12px;color:#10b981;margin-bottom:12px;display:flex;align-items:center;gap:8px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        LP found for <strong>${batchSubjCode}</strong> — select it below.
       </div>`;

  // Fix 3: Pre-populate with existing assignment settings if re-assigning
  _lpAssignState = {
    batchId,
    batch,
    lpId:         existing?.lpId || '',
    startDate:    batch?.startDate || '',
    hoursPerDay:  1.5,
    workDays:     [1, 2, 3, 4, 5],
    inclRevision:  false,
    inclHolidays:  true,
    revisionDays:  [6],
    generatedRows: [],
  };

  // Build dropdown — if no LP for subject, show disabled placeholder
  const lpOpts = noLPFound
    ? `<option value="">— No LP available for this subject —</option>`
    : `<option value="">— Select Lecture Plan —</option>` +
      planList.map(m => {
        // Prefer LP's own frozen subjectCode snapshot over live lookup
        const liveS = AppState.findById('subjects', m.subjectId);
        const sCode = m.subjectCode || liveS?.subjectCode || '';
        return `<option value="${m.id}" ${m.id === _lpAssignState.lpId ? 'selected' : ''}>${m.code} · ${m.title}${sCode ? ' (' + sCode + ')' : ''}</option>`;
      }).join('');

  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dayChecks = [1,2,3,4,5,6,0].map(d => {
    const chk = _lpAssignState.workDays.includes(d) ? 'checked' : '';
    return `<label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;padding:4px 8px;border-radius:5px;border:1px solid var(--border);background:var(--surface2)">
      <input type="checkbox" value="${d}" ${chk} class="lp-day-chk"> ${dayNames[d]}
    </label>`;
  }).join('');

  // If re-assigning, show existing rows as a reminder
  const existingNote = existing
    ? `<div style="padding:8px 12px;background:rgba(139,92,246,.07);border:1px solid rgba(139,92,246,.2);border-radius:6px;font-size:12px;color:var(--violet);margin-bottom:12px">
        ♻️ Re-assigning <strong>${existing.lpCode}</strong>. Change settings below and click "Generate Plan" to create a fresh schedule.
       </div>`
    : '';

  let _mid;
  _mid = Modal.open({
    title:  `${existing ? 'Re-assign' : 'Assign'} LP → ${batch?.batchName}`,
    size:   'lg',
    body: `
      ${existingNote}
      ${filteredNote}
      <div class="form-group">
        <label class="form-label">Lecture Plan <span class="req">*</span></label>
        <select id="aLpSel" class="form-select form-input" ${noLPFound ? 'disabled' : ''}>${lpOpts}</select>
      </div>
      <div class="form-row cols-2" style="${noLPFound ? 'opacity:.4;pointer-events:none' : ''}">
        <div class="form-group">
          <label class="form-label">Class Start Date <span class="req">*</span></label>
          <input id="aLpStart" class="form-input" type="date" value="${_lpAssignState.startDate}" ${noLPFound ? 'disabled' : ''}/>
        </div>
        <div class="form-group">
          <label class="form-label">Hours / Day</label>
          <select id="aLpHpd" class="form-select form-input">
            ${[0.5,1,1.5,2,2.5,3].map(h => `<option value="${h}" ${_lpAssignState.hoursPerDay === h ? 'selected' : ''}>${h}h / day</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Working Days</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${dayChecks}</div>
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px;align-items:center">
        <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer">
          <input type="checkbox" id="aLpRev" ${_lpAssignState.inclRevision ? 'checked' : ''}> Include Weekly Revision
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer">
          <input type="checkbox" id="aLpHol" checked> Skip Public Holidays
        </label>
      </div>
      <div id="aLpRevDayWrap" style="display:${_lpAssignState.inclRevision ? 'flex' : 'none'};align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:12px;padding:8px 12px;background:var(--surface3);border-radius:var(--r-sm);border:1px solid var(--border)">
        <span style="font-size:11px;color:var(--t3);min-width:60px">Revision on</span>
        <div id="aLpRevDayChecks" style="display:flex;gap:6px;flex-wrap:wrap"></div>
      </div>
      <button id="aLpGenBtn" class="add-btn" style="width:100%;justify-content:center;background:${noLPFound ? 'var(--surface3)' : 'var(--blue)'};color:${noLPFound ? 'var(--t3)' : '#fff'};height:38px;cursor:${noLPFound ? 'not-allowed' : 'pointer'}" ${noLPFound ? 'disabled' : ''}>
        ⚙️ Generate Plan with Dates
      </button>
      <div id="aLpPreview" style="margin-top:14px"></div>
    `,
    actions: [
      { label: 'Cancel', variant: 'ghost', close: true },
      {
        label: '💾 Save Assignment', variant: 'primary', close: false,
        handler: () => {
          if (!_lpAssignState.generatedRows?.length) { Toast.error('Generate the plan first.'); return; }
          const r = LecturePlanService.assignToBatch(batchId, _lpAssignState.lpId, _lpAssignState.generatedRows, {
            workDays:    _lpAssignState.workDays,
            hoursPerDay: _lpAssignState.hoursPerDay,
          });
          if (!r.success) { Toast.error(r.message); return; }
          Modal.close(_mid);
          Toast.success('LP assigned successfully.');
          renderAssignTab(container);
        }
      }
    ],
    onOpen: (modalEl) => {
      function buildRevDayChecks() {
        const container = modalEl.querySelector('#aLpRevDayChecks');
        if (!container) return;
        const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        // Sirf working days dikhao — revision انہی دنوں میں سے select hogi
        const workDaysOrdered = [1,2,3,4,5,6,0].filter(d => _lpAssignState.workDays.includes(d));
        container.innerHTML = workDaysOrdered.map(d => {
          const chk = (_lpAssignState.revisionDays || []).includes(d) ? 'checked' : '';
          return `<label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;padding:4px 8px;border-radius:5px;border:1px solid var(--border);background:var(--surface2)">
            <input type="checkbox" class="lp-rev-day-chk" value="${d}" ${chk}> ${dayNames[d]}
          </label>`;
        }).join('');
        container.querySelectorAll('.lp-rev-day-chk').forEach(chk => {
          chk.addEventListener('change', () => {
            _lpAssignState.revisionDays = [...container.querySelectorAll('.lp-rev-day-chk:checked')].map(c => parseInt(c.value));
          });
        });
      }

      modalEl.querySelectorAll('.lp-day-chk').forEach(chk => {
        chk.addEventListener('change', e => {
          const d = parseInt(e.target.value);
          if (e.target.checked) { if (!_lpAssignState.workDays.includes(d)) _lpAssignState.workDays.push(d); }
          else {
            _lpAssignState.workDays = _lpAssignState.workDays.filter(x => x !== d);
            _lpAssignState.revisionDays = (_lpAssignState.revisionDays || []).filter(x => x !== d);
          }
          buildRevDayChecks();
        });
      });

      // Show/hide revision day checkboxes
      modalEl.querySelector('#aLpRev')?.addEventListener('change', e => {
        const wrap = modalEl.querySelector('#aLpRevDayWrap');
        if (wrap) wrap.style.display = e.target.checked ? 'flex' : 'none';
      });

      buildRevDayChecks();

      modalEl.querySelector('#aLpGenBtn')?.addEventListener('click', () => {
        _lpAssignState.lpId         = modalEl.querySelector('#aLpSel')?.value;
        _lpAssignState.startDate    = modalEl.querySelector('#aLpStart')?.value;
        _lpAssignState.hoursPerDay  = parseFloat(modalEl.querySelector('#aLpHpd')?.value) || 1.5;
        _lpAssignState.inclRevision = modalEl.querySelector('#aLpRev')?.checked || false;
        _lpAssignState.inclHolidays = modalEl.querySelector('#aLpHol')?.checked !== false;
        _lpAssignState.revisionDays = [...modalEl.querySelectorAll('.lp-rev-day-chk:checked')].map(c => parseInt(c.value));

        if (!_lpAssignState.lpId)      { Toast.error('Select a Lecture Plan first.'); return; }
        if (!_lpAssignState.startDate) { Toast.error('Set a start date first.'); return; }

        const result = LecturePlanService.generateDatedRows(_lpAssignState.lpId, {
          startDate:    _lpAssignState.startDate,
          hoursPerDay:  _lpAssignState.hoursPerDay,
          workDays:     _lpAssignState.workDays,
          inclRevision: _lpAssignState.inclRevision,
          inclHolidays: _lpAssignState.inclHolidays,
          revisionDays: _lpAssignState.revisionDays,
          batchId:      batchId,  // campus-aware holiday filtering
        });
        if (!result.success) { Toast.error(result.message); return; }

        _lpAssignState.generatedRows = result.rows;
        const hrs = calcHours(result.rows);
        const preview = modalEl.querySelector('#aLpPreview');

        preview.innerHTML = `
          <div style="padding:10px 14px;background:rgba(139,92,246,.07);border:1px solid rgba(139,92,246,.2);border-radius:var(--r-sm);margin-bottom:10px;display:flex;gap:10px;flex-wrap:wrap">
            ${hoursBadge(hrs)}
            <span style="font-size:11px;color:var(--t3);margin-left:auto">${result.rows.length} rows generated</span>
          </div>
          <div style="overflow-y:auto;max-height:300px;border:1px solid var(--border);border-radius:var(--r-sm)">
            <table style="width:100%;border-collapse:collapse">
              <thead><tr style="background:var(--surface3)">
                <th style="padding:7px 12px;font-size:10px;color:var(--t3);text-transform:uppercase;border-bottom:1px solid var(--border);text-align:left">#</th>
                <th style="padding:7px 12px;font-size:10px;color:var(--t3);text-transform:uppercase;border-bottom:1px solid var(--border);text-align:left">Date</th>
                <th style="padding:7px 12px;font-size:10px;color:var(--t3);text-transform:uppercase;border-bottom:1px solid var(--border);text-align:left">Particulars</th>
                <th style="padding:7px 12px;font-size:10px;color:var(--t3);text-transform:uppercase;border-bottom:1px solid var(--border);text-align:left">Type</th>
                <th style="padding:7px 12px;font-size:10px;color:var(--t3);text-transform:uppercase;border-bottom:1px solid var(--border);text-align:left">Hrs</th>
              </tr></thead>
              <tbody>
                ${result.rows.map((r, i) => {
                  const tc = typeColor(r.type);
                  const h  = rowHours(r);
                  return `<tr>
                    <td style="padding:6px 12px;font-size:10px;color:var(--t3);border-bottom:1px solid var(--border)">${i+1}</td>
                    <td style="padding:6px 12px;font-size:11px;font-family:'Segoe UI',Arial,sans-serif;border-bottom:1px solid var(--border)">${fmtDate(r.date)}</td>
                    <td style="padding:6px 12px;font-size:12px;border-bottom:1px solid var(--border);font-weight:${r.type==='Lecture'?'400':'600'}">${r.topic}</td>
                    <td style="padding:6px 12px;border-bottom:1px solid var(--border)"><span style="font-size:10px;font-weight:700;color:${tc};background:${tc}18;padding:2px 8px;border-radius:4px">${r.type}</span></td>
                    <td style="padding:6px 12px;font-size:11px;font-family:'Segoe UI',Arial,sans-serif;border-bottom:1px solid var(--border);color:${h===0?'var(--t3)':'var(--t1)'}">${h>0?h+'h':'—'}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`;

        Toast.success(`${result.rows.length} rows generated.`);
      });
    }
  });
}

// ── Export helpers ────────────────────────────────────────────
function _exportLPtoPDF(lpa, batch) {
  const hrs  = calcHours(lpa.rows);
  // ── Prefer snapshots over live lookup (master renames safe) ──────────────
  const disc     = AppState.findById('disciplines', batch?.disciplineId);
  const liveSubj = AppState.findById('subjects',    batch?.subjectId);
  const teacher  = AppState.findById('teachers',    batch?.teacherId);
  const subjCode = lpa?.subjectCode || batch?.subjectCode || liveSubj?.subjectCode || '';
  // Discipline: only abbreviation (e.g. "ACCA")
  const discStr  = disc ? disc.abbreviation : (batch?.disciplineAbbr || batch?.disciplineName || '');
  // Subject: only code (e.g. "FA1")
  const subjStr  = subjCode;
  // Teacher names: active first, then others
  const teacherName = _batchTeacherNames(batch)
    || teacher?.fullName || teacher?.name || batch?.teacherName || '';
  // File name: batchName + active teacher only (first name)
  const activeTeacherOnly = (() => {
    const ts = batch?.teachers;
    if (ts && ts.length) {
      const a = ts.find(t => t.isActive);
      const obj = AppState.findById('teachers', a?.teacherId);
      return obj?.fullName || a?.teacherName || '';
    }
    return teacher?.fullName || batch?.teacherName || '';
  })();
  const fileName = [batch?.batchName, activeTeacherOnly].filter(Boolean).join(' - ');
  // ─────────────────────────────────────────────────────────────────────────

  const typeColors = {
    lecture:  '#374151',
    test:     '#92400e',
    midterm:  '#78350f',
    mock:     '#4c1d95',
    holiday:  '#991b1b',
    revision: '#164e63',
    other:    '#374151',
  };
  const typeBg = {
    lecture:  '#f9fafb',
    test:     '#fffbeb',
    midterm:  '#fef3c7',
    mock:     '#f5f3ff',
    holiday:  '#fef2f2',
    revision: '#ecfeff',
    other:    '#f9fafb',
  };

  const rowsHTML = lpa.rows.map((r, i) => {
    const t  = (r.type || 'Lecture').toLowerCase();
    const h  = rowHours(r);
    const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
    const specialBg = typeBg[t] || bg;
    const fc = typeColors[t] || '#374151';
    const done = r.status === 'Done';
    return `<tr style="background:${specialBg}">
      <td style="padding:6px 10px;font-size:11px;color:#9ca3af;border-bottom:1px solid #e5e7eb;text-align:center">${i+1}</td>
      <td style="padding:6px 10px;font-size:11px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:'Segoe UI',Arial,sans-serif">${r.date || '—'}</td>
      <td style="padding:6px 10px;font-size:11.5px;color:#111827;border-bottom:1px solid #e5e7eb;${done?'text-decoration:line-through;color:#9ca3af':''}">${r.topic}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center">
        <span style="font-size:10px;font-weight:700;color:${fc};background:${fc}22;padding:2px 8px;border-radius:4px">${r.type}</span>
      </td>
      <td style="padding:6px 10px;font-size:11px;font-family:'Segoe UI',Arial,sans-serif;color:#374151;border-bottom:1px solid #e5e7eb;text-align:center">${h > 0 ? h + 'h' : '—'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center">
        <span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;${done?'background:#d1fae5;color:#065f46':'background:#f3f4f6;color:#6b7280'}">${r.status || 'Pending'}</span>
      </td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>${fileName || lpa.lpCode}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #111827; background:#fff; padding: 32px; }
    .header { border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 20px; }
    .title-row { display: flex; justify-content: space-between; align-items: flex-start; }
    .plan-title { font-size: 20px; font-weight: 700; color: #111827; }
    .plan-code  { font-size: 13px; font-weight: 700; color: #2563eb; background: #eff6ff; padding: 4px 12px; border-radius: 6px; font-family: monospace; }
    .meta-row   { display: flex; gap: 20px; margin-top: 8px; font-size: 12px; color: #6b7280; }
    .kpi-strip  { display: flex; gap: 12px; margin-bottom: 20px; }
    .kpi        { flex: 1; padding: 10px 14px; border-radius: 8px; }
    .kpi.teaching { background: #ecfdf5; border-left: 3px solid #10b981; }
    .kpi.test     { background: #fffbeb; border-left: 3px solid #f59e0b; }
    .kpi.mock     { background: #f5f3ff; border-left: 3px solid #8b5cf6; }
    .kpi.revision { background: #ecfeff; border-left: 3px solid #06b6d4; }
    .kpi .label   { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; font-weight: 600; }
    .kpi .value   { font-size: 18px; font-weight: 700; margin-top: 2px; }
    .kpi.teaching .value { color: #10b981; }
    .kpi.test .value     { color: #f59e0b; }
    .kpi.mock .value     { color: #8b5cf6; }
    .kpi.revision .value { color: #0e7490; }
    .kpi.revision .label { color: #0e7490; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    thead tr { background: #f1f5f9; }
    th { padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; font-weight: 600; border-bottom: 2px solid #e2e8f0; }
    .footer { margin-top: 24px; font-size: 10px; color: #9ca3af; text-align: right; border-top: 1px solid #e5e7eb; padding-top: 10px; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="title-row">
      <div class="plan-title">${lpa.lpTitle}</div>
      <span class="plan-code">${lpa.lpCode}</span>
    </div>
    <div class="meta-row">
      <span>📚 Batch: <strong>${batch?.batchName || '—'}</strong></span>
      ${discStr ? `<span>🎓 Discipline: <strong>${discStr}</strong></span>` : ''}
      ${subjStr ? `<span>📖 Subject: <strong>${subjStr}</strong></span>` : ''}
      ${teacherName ? `<span>👤 Teacher: <strong>${teacherName}</strong></span>` : ''}
    </div>
  </div>
  <div class="kpi-strip">
    <div class="kpi teaching"><div class="label">Teaching Hours</div><div class="value">${hrs.teaching}h</div></div>
    <div class="kpi test"><div class="label">Test Hours</div><div class="value">${hrs.test}h</div></div>
    <div class="kpi mock"><div class="label">Mock Hours</div><div class="value">${hrs.mock}h</div></div>
    <div class="kpi revision"><div class="label">Revision Hours</div><div class="value">${hrs.revision||0}h</div></div>
    <div class="kpi" style="background:#f8fafc;border-left:3px solid #64748b"><div class="label">Total Hours</div><div class="value" style="color:#334155">${hrs.total}h</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:36px">#</th>
        <th style="width:100px">Date</th>
        <th>Particulars</th>
        <th style="width:80px">Type</th>
        <th style="width:50px">Hrs</th>
        <th style="width:70px">Status</th>
      </tr>
    </thead>
    <tbody>${rowsHTML}</tbody>
  </table>
  <div class="footer">Generated on ${new Date().toLocaleDateString('en-PK', {day:'2-digit',month:'short',year:'numeric'})} · Lecture Plan System</div>
</body>
</html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.print(); }, 600);
}

function _exportLPtoExcel(lpa, batch) {
  const hrs      = calcHours(lpa.rows);
  const disc     = AppState.findById('disciplines', batch?.disciplineId);
  const liveSubj = AppState.findById('subjects',    batch?.subjectId);
  // Prefer snapshots (frozen names) over live lookup
  const exSubjCode = lpa?.subjectCode || batch?.subjectCode || liveSubj?.subjectCode || '—';
  const exDiscAbbr = batch?.disciplineAbbr || disc?.abbreviation || '—';

  function doExport(XLSX) {
    const dataRows = [];

    // Info header rows
    dataRows.push(['Lecture Plan Export', '', '', '', '', '', '']);
    dataRows.push(['Plan Code', lpa.lpCode, 'Title', lpa.lpTitle, '', '', '']);
    dataRows.push(['Batch', batch?.batchName || '—', 'Discipline', exDiscAbbr, 'Subject', exSubjCode, '']);
    dataRows.push(['Teaching', hrs.teaching + 'h', 'Test', hrs.test + 'h', 'Mock', hrs.mock + 'h', 'Revision', (hrs.revision||0) + 'h', 'Total: ' + hrs.total + 'h']);
    dataRows.push(['', '', '', '', '', '', '']);

    // Column headers
    dataRows.push(['#', 'Date', 'Particulars', 'Type', 'Hours', 'Status', 'Remarks']);

    // Data rows
    lpa.rows.forEach((r, i) => {
      const dateStr = r.date
        ? (() => {
            const d = new Date(r.date + 'T00:00:00');
            const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
            const mons = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            return days[d.getDay()] + ' ' + d.getDate() + ' ' + mons[d.getMonth()] + ' ' + d.getFullYear();
          })()
        : '';
      dataRows.push([
        i + 1,
        dateStr,
        r.topic   || '',
        r.type    || 'Lecture',
        rowHours(r) > 0 ? rowHours(r) : 0,
        r.status  || 'Pending',
        r.remarks || '',
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(dataRows);

    // Column widths
    ws['!cols'] = [
      { wch: 5  },  // #
      { wch: 20 },  // Date
      { wch: 50 },  // Particulars
      { wch: 12 },  // Type
      { wch: 8  },  // Hours
      { wch: 12 },  // Status
      { wch: 32 },  // Remarks
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lecture Plan');
    XLSX.writeFile(wb, ('LP_' + lpa.lpCode + '_' + (batch?.batchName || 'batch') + '.xlsx').replace(/\s+/g, '_'));
  }

  if (typeof window.XLSX !== 'undefined') {
    doExport(window.XLSX);
  } else {
    const script = document.createElement('script');
    script.src   = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload  = () => doExport(window.XLSX);
    script.onerror = () => { if(typeof Toast !== 'undefined') Toast.error('Could not load Excel library.'); };
    document.head.appendChild(script);
  }
}

// ── View assigned LP modal (with Reschedule + Bulk Hours) ───────────
function _openViewModal(batchId, container) {
  const batch = AppState.findById('batches', batchId);
  const lpa   = getAssignmentForBatch(batchId);
  if (!lpa) { Toast.error('No assignment found.'); return; }

  // Infer current working days from schedule
  const dayUsage = {};
  lpa.rows.forEach(r => {
    if (r.date && !['revision','holiday'].includes((r.type||'').toLowerCase())) {
      const d = new Date(r.date + 'T12:00:00');
      dayUsage[d.getDay()] = (dayUsage[d.getDay()] || 0) + 1;
    }
  });
  const iWorkDays = Object.keys(dayUsage).map(Number).filter(d => dayUsage[d] > 0);
  const curWorkDays = iWorkDays.length ? iWorkDays : [1,2,3,4,5];
  const hasSatRev   = lpa.rows.some(r => {
    if ((r.type||'').toLowerCase() !== 'revision') return false;
    return new Date(r.date + 'T12:00:00').getDay() === 6;
  });

  // First pending row date as default reschedule-from
  const firstPending = lpa.rows.find(r => r.status !== 'Done');
  const today        = new Date().toISOString().slice(0,10);
  const defaultReDate = firstPending?.date || today;
  const firstPendingIdx = lpa.rows.findIndex(r => r.status !== 'Done');

  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dayChecksRe = [1,2,3,4,5,6,0].map(d => {
    const chk = curWorkDays.includes(d) ? 'checked' : '';
    return `<label style="display:inline-flex;align-items:center;gap:3px;font-size:11px;cursor:pointer;padding:3px 7px;border-radius:4px;border:1px solid var(--border);background:var(--surface2)">
      <input type="checkbox" class="re-day-chk" value="${d}" ${chk}> ${dayNames[d]}
    </label>`;
  }).join('');

  const hourOpts = [0.5,1,1.5,2,2.5,3].map(h => `<option value="${h}">${h}h</option>`).join('');
  const typeOpts = ['All','Lecture','Revision','Test','Midterm','Mock'].map(t => `<option value="${t}">${t}</option>`).join('');

  let _mid;
  _mid = Modal.open({
    title: `LP — ${batch?.batchName}`,
    size:  'lg',
    body: `
      <!-- Header -->
      <div style="padding:10px 0 12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-bottom:1px solid var(--border);margin-bottom:0">
        <span class="lp-code-badge">${lpa.lpCode}</span>
        <span style="font-weight:600;color:var(--t1)">${lpa.lpTitle}</span>
        <div id="lpHrsBadge" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          ${hoursBadge(calcHours(lpa.rows))}
          <span style="font-size:11px;color:var(--t3)">${lpa.rows.length} rows</span>
        </div>
        <div style="margin-left:auto;display:flex;gap:6px;flex-shrink:0;position:relative">
          <div class="lp-icon-btn-wrap" style="position:relative">
            <button id="lpExportPDFBtn"
              style="display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--t2);cursor:pointer;transition:all .15s"
              onmouseover="this.style.borderColor='#ef4444';this.style.color='#ef4444';this.style.background='rgba(239,68,68,.08)';this.nextElementSibling.style.opacity='1';this.nextElementSibling.style.transform='translateY(0)';this.nextElementSibling.style.pointerEvents='all'"
              onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--t2)';this.style.background='var(--surface2)';this.nextElementSibling.style.opacity='0';this.nextElementSibling.style.transform='translateY(4px)';this.nextElementSibling.style.pointerEvents='none'">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            </button>
            <div style="position:absolute;bottom:-34px;right:0;background:var(--surface1);border:1px solid var(--border);border-radius:6px;padding:5px 10px;font-size:11px;font-weight:500;color:var(--t2);white-space:nowrap;opacity:0;transform:translateY(4px);transition:all .15s;pointer-events:none;z-index:10;box-shadow:0 4px 12px rgba(0,0,0,.12)">Print / PDF</div>
          </div>
          <div class="lp-icon-btn-wrap" style="position:relative">
            <button id="lpExportXLSBtn"
              style="display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--t2);cursor:pointer;transition:all .15s"
              onmouseover="this.style.borderColor='#10b981';this.style.color='#10b981';this.style.background='rgba(16,185,129,.08)';this.nextElementSibling.style.opacity='1';this.nextElementSibling.style.transform='translateY(0)';this.nextElementSibling.style.pointerEvents='all'"
              onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--t2)';this.style.background='var(--surface2)';this.nextElementSibling.style.opacity='0';this.nextElementSibling.style.transform='translateY(4px)';this.nextElementSibling.style.pointerEvents='none'">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </button>
            <div style="position:absolute;bottom:-34px;right:0;background:var(--surface1);border:1px solid var(--border);border-radius:6px;padding:5px 10px;font-size:11px;font-weight:500;color:var(--t2);white-space:nowrap;opacity:0;transform:translateY(4px);transition:all .15s;pointer-events:none;z-index:10;box-shadow:0 4px 12px rgba(0,0,0,.12)">Export Excel</div>
          </div>
        </div>
      </div>

      <!-- ① Reschedule Panel — collapsible -->
      <div style="border-bottom:1px solid var(--border)">
        <!-- Trigger bar -->
        <div id="rePanelToggle" style="display:flex;align-items:center;gap:8px;padding:10px 0;cursor:pointer;user-select:none">
          <div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:7px;border:1px solid var(--border);background:var(--surface2);color:var(--t2);transition:all .2s" id="reGearIcon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M19.07 19.07l-1.41-1.41M4.93 19.07l1.41-1.41M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>
          </div>
          <span style="font-size:12px;font-weight:600;color:var(--t2)">Re-schedule</span>
          <svg id="reChevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:var(--t3);transition:transform .25s;margin-left:2px"><polyline points="6 9 12 15 18 9"/></svg>
          <span style="font-size:10.5px;color:var(--t4);margin-left:4px">Done rows unchanged — dates update from selected date</span>
        </div>
        <!-- Collapsible body -->
        <div id="rePanelBody" style="overflow:hidden;max-height:0;transition:max-height .3s cubic-bezier(.4,0,.2,1);opacity:0;transition:max-height .3s cubic-bezier(.4,0,.2,1),opacity .25s">
          <div style="padding:4px 0 14px;display:flex;flex-direction:column;gap:10px">
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
              <div style="display:flex;align-items:center;gap:6px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:4px 10px">
                <span style="font-size:11px;color:var(--t3)">From</span>
                <input type="date" id="reDate" value="${defaultReDate}" style="background:none;border:none;font-size:12px;color:var(--t1);outline:none;padding:0"/>
              </div>
              <div style="display:flex;align-items:center;gap:6px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:4px 10px">
                <span style="font-size:11px;color:var(--t3)">Hrs/day</span>
                <select id="reHpd" style="background:none;border:none;font-size:12px;color:var(--t1);outline:none;padding:0">${hourOpts}</select>
              </div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
              <span style="font-size:11px;color:var(--t3);min-width:78px">Working Days</span>
              ${dayChecksRe}
            </div>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
              <label style="display:inline-flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;color:var(--t2)">
                <input type="checkbox" id="reRevision" ${hasSatRev ? 'checked' : ''}> Weekly Revision
              </label>
              <div id="reRevDayWrap" style="display:${hasSatRev ? 'flex' : 'none'};align-items:center;gap:6px;flex-wrap:wrap">
                <span style="font-size:11px;color:var(--t3)">on</span>
                <div id="reRevDayChecks" style="display:flex;gap:5px;flex-wrap:wrap"></div>
              </div>
              <button id="reScheduleBtn" style="display:inline-flex;align-items:center;gap:6px;padding:0 16px;height:32px;border-radius:7px;border:1px solid var(--border);background:var(--surface2);color:var(--t1);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font);transition:all .15s" onmouseover="this.style.background='var(--surface3)';this.style.borderColor='var(--t3)'" onmouseout="this.style.background='var(--surface2)';this.style.borderColor='var(--border)'">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                Apply
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ② Bulk Hours Panel -->
      <div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <span style="font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.4px;min-width:70px">Bulk Hours</span>
          <select id="bulkHrVal" style="padding:4px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm);font-size:12px;color:var(--t1)">${hourOpts}</select>
          <span style="font-size:11.5px;color:var(--t3)">for</span>
          <select id="bulkType" style="padding:4px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm);font-size:12px;color:var(--t1)">${typeOpts}</select>
          <select id="bulkRange" style="padding:4px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm);font-size:12px;color:var(--t1)">
            <option value="all">All rows</option>
            <option value="pending" selected>Pending only</option>
            <option value="from">Row # range</option>
          </select>
          <input type="number" id="bulkFromRow" min="1" max="${lpa.rows.length}" value="${firstPendingIdx + 1}"
                 style="display:none;padding:4px 7px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm);font-size:12px;color:var(--t1);width:62px"/>
          <input type="number" id="bulkToRow" min="1" max="${lpa.rows.length}" value="${lpa.rows.length}"
                 style="display:none;padding:4px 7px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm);font-size:12px;color:var(--t1);width:62px"/>
          <button id="bulkHrBtn" class="add-btn" style="background:var(--blue-dim);color:var(--blue);border:1px solid rgba(79,133,247,.3)">✓ Apply</button>
        </div>
      </div>

      <!-- ③ Table -->
      <div id="lpViewTableWrap" style="margin-top:0">
        <table style="width:100%;border-collapse:collapse" id="lpViewTable">
          <thead>
            <tr style="background:var(--surface3);position:sticky;top:0;z-index:2">
              <th style="padding:9px 10px;font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid var(--border);text-align:left">#</th>
              <th style="padding:9px 10px;font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid var(--border);text-align:left">Date</th>
              <th style="padding:9px 10px;font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid var(--border);text-align:left">Particulars</th>
              <th style="padding:9px 10px;font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid var(--border);text-align:left">Type</th>
              <th style="padding:9px 10px;font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid var(--border);text-align:center">Hrs</th>
              <th style="padding:9px 10px;font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid var(--border);text-align:center">✓</th>
              <th style="padding:9px 10px;font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid var(--border);text-align:left">Remarks</th>
            </tr>
          </thead>
          <tbody id="lpViewTbody"></tbody>
        </table>
      </div>
    `,
    actions: [{ label: 'Close', variant: 'ghost', close: true, handler: () => { document.body.style.overflow = ''; } }],
    onOpen: (modalEl) => {
      // ── Widen modal-box and enable body scroll lock ───────
      const box = modalEl.querySelector('.modal-box');
      if (box) box.classList.add('lp-view-box');
      document.body.style.overflow = 'hidden';
      // Unlock scroll when modal closes (backdrop click, ESC, Close btn)
      const _unlockScroll = () => { document.body.style.overflow = ''; };
      modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl || e.target.closest('[data-close]') || e.target.closest('.modal-close')) {
          setTimeout(_unlockScroll, 250);
        }
      });
      document.addEventListener('keydown', function _escUnlock(e) {
        if (e.key === 'Escape') { setTimeout(_unlockScroll, 250); document.removeEventListener('keydown', _escUnlock); }
      });
      // ── Reschedule panel toggle ──────────────────────────
      const reToggle = modalEl.querySelector('#rePanelToggle');
      const reBody   = modalEl.querySelector('#rePanelBody');
      const reChev   = modalEl.querySelector('#reChevron');
      const reGear   = modalEl.querySelector('#reGearIcon');
      let reOpen = false;
      if (reToggle && reBody) {
        reToggle.addEventListener('click', () => {
          reOpen = !reOpen;
          if (reOpen) {
            reBody.style.maxHeight = '300px';
            reBody.style.opacity = '1';
            reChev && (reChev.style.transform = 'rotate(180deg)');
            reGear && (reGear.style.background = 'var(--surface3)', reGear.style.borderColor = 'var(--t3)', reGear.style.color = 'var(--t1)');
          } else {
            reBody.style.maxHeight = '0';
            reBody.style.opacity = '0';
            reChev && (reChev.style.transform = 'rotate(0deg)');
            reGear && (reGear.style.background = 'var(--surface2)', reGear.style.borderColor = 'var(--border)', reGear.style.color = 'var(--t2)');
          }
        });
      }

      // ── Render table ─────────────────────────────────────
      function renderViewTable() {
        const cur = getAssignmentForBatch(batchId);
        if (!cur) return;
        const tbody = modalEl.querySelector('#lpViewTbody');
        const today = new Date().toISOString().slice(0,10);

        tbody.innerHTML = cur.rows.map((r, i) => {
          const tp    = (r.type || 'Lecture').toLowerCase();
          const tc    = typeColor(r.type);
          const h     = rowHours(r);
          const done  = r.status === 'Done';
          const isToday = r.date === today;
          const isRev = tp === 'revision';
          const rowBg = done
            ? 'background:rgba(16,185,129,.04)'
            : isToday
            ? 'background:rgba(79,133,247,.06)'
            : i % 2 === 1 ? 'background:var(--surface2)' : '';
          const rem   = (r.remarks || '').replace(/"/g, '&quot;');
          const topicCell = isRev
            ? `<td style="padding:8px 10px;border-bottom:1px solid var(--border);vertical-align:middle">
                <div style="display:flex;align-items:center;gap:6px">
                  <span id="lp-rev-topic-${r.id}" style="font-size:12.5px;font-weight:600;color:var(--cyan);line-height:1.45;flex:1">${r.topic}</span>
                  <button class="lp-rev-edit-btn" data-row-id="${r.id}" title="Edit revision topic"
                    style="flex-shrink:0;background:none;border:1px solid var(--border);border-radius:5px;cursor:pointer;color:var(--t3);padding:3px 6px;font-size:11px;display:flex;align-items:center;gap:3px"
                    onmouseover="this.style.borderColor='var(--cyan)';this.style.color='var(--cyan)'"
                    onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--t3)'">
                    ✏️
                  </button>
                </div>
               </td>`
            : `<td style="padding:8px 10px;font-size:12.5px;border-bottom:1px solid var(--border);vertical-align:middle;font-weight:${tp==='lecture'?'400':'600'};${done?'text-decoration:line-through;color:var(--t3)':'color:var(--t1)'};line-height:1.45">${r.topic}</td>`;
          return `<tr style="${rowBg};transition:background .1s" onmouseover="this.style.background='rgba(79,133,247,.08)'" onmouseout="this.style.background='${rowBg.replace('background:','')}'">
            <td style="padding:8px 10px;font-size:10px;color:var(--t3);border-bottom:1px solid var(--border);vertical-align:middle">${i+1}</td>
            <td style="padding:8px 10px;font-size:11px;border-bottom:1px solid var(--border);vertical-align:middle;white-space:nowrap">
              ${fmtDate(r.date)}${isToday ? '<br><span style="font-size:9px;font-weight:700;color:var(--blue);letter-spacing:.04em">TODAY</span>' : ''}
            </td>
            ${topicCell}
            <td style="padding:8px 10px;border-bottom:1px solid var(--border);vertical-align:middle">
              <span style="font-size:10px;font-weight:600;color:${tp==='lecture'?'var(--t3)':tc};background:${tp==='lecture'?'transparent':tc+'18'};padding:3px ${tp==='lecture'?'0':'9px'};border-radius:20px;white-space:nowrap">${r.type||'Lecture'}</span>
            </td>
            <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center;vertical-align:middle">
              <input type="number" value="${h}" min="0" max="24" step="0.5" data-row-id="${r.id}"
                     class="lp-hrs-inp"
                     style="width:54px;padding:4px 5px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;font-size:11.5px;color:var(--t1);text-align:center;outline:none;font-weight:600"/>
            </td>
            <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center;vertical-align:middle">
              <input type="checkbox" ${done ? 'checked' : ''} data-row-id="${r.id}" class="lp-done-chk"
                     style="cursor:pointer;width:16px;height:16px;accent-color:#10b981"/>
            </td>
            <td style="padding:8px 10px;border-bottom:1px solid var(--border);vertical-align:middle">
              <input type="text" value="${rem}" placeholder="Add note…" data-row-id="${r.id}" class="lp-rem-inp"
                     style="background:var(--surface2);border:1px solid var(--border);border-radius:5px;padding:4px 8px;font-size:11.5px;color:var(--t1);outline:none;width:100%"/>
            </td>
          </tr>`;
        }).join('');

        // Update hours badge
        const badge = modalEl.querySelector('#lpHrsBadge');
        if (badge) badge.innerHTML = hoursBadge(calcHours(cur.rows)) + `<span style="font-size:11px;color:var(--t3)">${cur.rows.length} rows</span>`;

        // Wire row controls
        tbody.querySelectorAll('.lp-hrs-inp').forEach(inp => {
          inp.addEventListener('change', e => {
            LecturePlanService.setRowHours(batchId, e.target.dataset.rowId, e.target.value);
            const cur2 = getAssignmentForBatch(batchId);
            // Update modal badge (inside view modal)
            const badge2 = modalEl.querySelector('#lpHrsBadge');
            if (badge2 && cur2) badge2.innerHTML = hoursBadge(calcHours(cur2.rows)) + `<span style="font-size:11px;color:var(--t3)">${cur2.rows.length} rows</span>`;
            // Update assign tab list badge (outside modal) real-time
            const listSpan = document.getElementById('lp-total-hrs-' + batchId);
            if (listSpan && cur2) {
              const h2 = calcHours(cur2.rows);
              listSpan.textContent = (Math.round((h2.teaching + h2.test + h2.mock + (h2.revision || 0)) * 100) / 100) + 'h';
            }
          });
        });
        tbody.querySelectorAll('.lp-done-chk').forEach(chk => {
          chk.addEventListener('change', e => {
            LecturePlanService.markRow(batchId, e.target.dataset.rowId, e.target.checked);
          });
        });
        tbody.querySelectorAll('.lp-rem-inp').forEach(inp => {
          inp.addEventListener('change', e => {
            LecturePlanService.setRowRemark(batchId, e.target.dataset.rowId, e.target.value);
          });
        });
        // Wire revision topic edit buttons
        tbody.querySelectorAll('.lp-rev-edit-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const rowId = btn.dataset.rowId;
            const topicSpan = document.getElementById('lp-rev-topic-' + rowId);
            if (!topicSpan) return;
            const current = topicSpan.textContent;
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.value = current;
            inp.style.cssText = 'flex:1;padding:3px 7px;font-size:12.5px;border:1px solid var(--cyan);border-radius:5px;background:var(--surface2);color:var(--t1);outline:none;font-weight:600';
            topicSpan.replaceWith(inp);
            btn.style.display = 'none';
            inp.focus();
            inp.select();
            const save = () => {
              const newTopic = inp.value.trim() || current;
              LecturePlanService.setRowRemark(batchId, rowId, ''); // keep remarks intact
              // Save topic directly
              const all = getAllAssignments();
              if (all[batchId]) {
                all[batchId].rows = all[batchId].rows.map(r => r.id === rowId ? { ...r, topic: newTopic } : r);
                saveAllAssignments(all);
              }
              const newSpan = document.createElement('span');
              newSpan.id = 'lp-rev-topic-' + rowId;
              newSpan.style.cssText = 'font-size:12.5px;font-weight:600;color:var(--cyan);line-height:1.45;flex:1';
              newSpan.textContent = newTopic;
              inp.replaceWith(newSpan);
              btn.style.display = '';
            };
            inp.addEventListener('blur', save);
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } if (e.key === 'Escape') { inp.value = current; inp.blur(); } });
          });
        });
      }

      renderViewTable();

      // ── Export buttons ────────────────────────────────────
      modalEl.querySelector('#lpExportPDFBtn')?.addEventListener('click', () => {
        _exportLPtoPDF(getAssignmentForBatch(batchId), batch);
      });
      modalEl.querySelector('#lpExportXLSBtn')?.addEventListener('click', () => {
        _exportLPtoExcel(getAssignmentForBatch(batchId), batch);
        Toast.success('Excel file downloaded.');
      });

      // ── Revision day checkboxes ──────────────────────────
      function buildReRevDayChecks() {
        const container = modalEl.querySelector('#reRevDayChecks');
        if (!container) return;
        const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const curWorkDays = [...modalEl.querySelectorAll('.re-day-chk:checked')].map(c => parseInt(c.value));
        const existingRevDays = new Set(
          (getAssignmentForBatch(batchId)?.rows || [])
            .filter(r => (r.type||'').toLowerCase() === 'revision' && r.date)
            .map(r => new Date(r.date + 'T12:00:00').getDay())
        );
        // Sirf working days dikhao — revision انہی دنوں میں سے hogi
        const workDaysOrdered = [1,2,3,4,5,6,0].filter(d => curWorkDays.includes(d));
        container.innerHTML = workDaysOrdered.map(d => {
          const chk = existingRevDays.has(d) ? 'checked' : '';
          return `<label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;padding:3px 8px;border-radius:5px;border:1px solid var(--border);background:var(--surface2)">
            <input type="checkbox" class="re-rev-day-chk" value="${d}" ${chk}> ${dayNames[d]}
          </label>`;
        }).join('');
      }
      buildReRevDayChecks();
      modalEl.querySelectorAll('.re-day-chk').forEach(chk => {
        chk.addEventListener('change', buildReRevDayChecks);
      });
      // ── Revision day toggle ───────────────────────────────
      modalEl.querySelector('#reRevision')?.addEventListener('change', e => {
        const wrap = modalEl.querySelector('#reRevDayWrap');
        if (wrap) wrap.style.display = e.target.checked ? 'flex' : 'none';
      });

      // ── Bulk range toggle ─────────────────────────────────
      modalEl.querySelector('#bulkRange')?.addEventListener('change', e => {
        const show = e.target.value === 'from';
        modalEl.querySelector('#bulkFromRow').style.display = show ? '' : 'none';
        modalEl.querySelector('#bulkToRow').style.display   = show ? '' : 'none';
      });

      // ── Re-schedule button ────────────────────────────────
      modalEl.querySelector('#reScheduleBtn')?.addEventListener('click', () => {
        const reDate       = modalEl.querySelector('#reDate')?.value;
        const hoursPerDay  = parseFloat(modalEl.querySelector('#reHpd')?.value) || 1;
        const workDays     = [...modalEl.querySelectorAll('.re-day-chk:checked')].map(c => parseInt(c.value));
        const inclRevision = modalEl.querySelector('#reRevision')?.checked || false;
        const revisionDays = [...modalEl.querySelectorAll('.re-rev-day-chk:checked')].map(c => parseInt(c.value));

        const result = LecturePlanService.reschedule(batchId, {
          reDate, hoursPerDay, workDays, inclRevision, revisionDays,
        });

        if (!result.success) { Toast.error(result.message); return; }
        Toast.success(`Re-scheduled: ${result.rescheduled} rows updated.`);
        renderViewTable();
        // Also refresh assign tab if container available
        if (container) renderAssignTab(container);
      });

      // ── Bulk hours button ─────────────────────────────────
      modalEl.querySelector('#bulkHrBtn')?.addEventListener('click', () => {
        const hours      = modalEl.querySelector('#bulkHrVal')?.value;
        const typeFilter = modalEl.querySelector('#bulkType')?.value;
        const range      = modalEl.querySelector('#bulkRange')?.value;
        const fromRow    = parseInt(modalEl.querySelector('#bulkFromRow')?.value) || 1;
        const toRow      = parseInt(modalEl.querySelector('#bulkToRow')?.value)   || 999999;

        LecturePlanService.bulkSetHours(batchId, { hours, typeFilter, range, fromRow, toRow });
        Toast.success('Hours updated.');
        renderViewTable();
      });
    }
  });
}

// ═══════════════════════════════════════════════════
//  TAB 3 — NOTIFICATIONS (Holiday Conflicts)
// ═══════════════════════════════════════════════════
function renderNotifsTab(container) {
  const el     = container.querySelector('#lp-panel-notifs');
  if (!el) return;

  const notifs = HolidayWatcher.getNotifs();
  const all    = Object.values(notifs);
  const active = all.filter(n => !n.excluded);
  const excl   = all.filter(n => n.excluded);

  // ── Format date nicely ────────────────────────────
  const fmt = ds => {
    if (!ds) return ds;
    const d = new Date(ds + 'T00:00:00');
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const mons = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${days[d.getDay()]} ${d.getDate()} ${mons[d.getMonth()]}`;
  };

  // ── Campus name helper ───────────────────────────
  const campusLabel = (campusId) => {
    if (!campusId) return '';
    const c = (AppState.get('campuses') || []).find(c => c.id === campusId);
    return c ? `<span style="font-size:10px;padding:1px 7px;border-radius:4px;background:rgba(245,158,11,.12);color:#f59e0b;font-weight:600">${c.campusName || c.name || campusId}</span>` : '';
  };

  // ── Render one notif card ─────────────────────────
  const renderCard = (n) => {
    const isExcl = n.excluded;
    return `
      <div class="lp-notif-card ${isExcl ? 'excluded' : ''}" data-notif-batch="${n.batchId}">
        <div class="lp-notif-card-head">
          <div style="display:flex;align-items:center;gap:8px;flex:1;flex-wrap:wrap">
            <span style="font-family:'Segoe UI',Arial,sans-serif;font-size:13px;font-weight:700;color:var(--t1)">${n.batchName}</span>
            ${campusLabel(n.campusId)}
            <span style="font-size:11.5px;color:var(--blue);font-weight:500">${n.lpCode} · ${n.lpTitle}</span>
            <span style="font-size:11px;color:var(--t3)">${n.affectedCount} row${n.affectedCount !== 1 ? 's' : ''} affected</span>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            ${isExcl
              ? `<button class="lp-fix-btn" style="background:rgba(79,133,247,.1);color:var(--blue);border-color:rgba(79,133,247,.3)" data-notif-include="${n.batchId}">↩ Re-include</button>`
              : `<button class="lp-fix-btn" data-notif-fix="${n.batchId}">✓ Fix this LP</button>
                 <button class="lp-excl-btn" data-notif-exclude="${n.batchId}" title="Exclude from notifications">✕ Exclude</button>`
            }
          </div>
        </div>
        <div class="lp-notif-dates">
          <span style="font-size:11px;color:var(--t3);min-width:90px">Holiday dates:</span>
          ${n.affectedDates.map(d => `<span class="lp-date-chip" title="${d}">${fmt(d)}</span>`).join('')}
        </div>
      </div>`;
  };

  const emptyState = `
    <div class="lp-empty" style="margin-top:24px">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" style="opacity:.4;color:var(--green)">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      <p style="color:var(--t2)">All lecture plans are up to date!</p>
      <span>When holidays overlap with pending rows, affected LPs will appear here.</span>
    </div>`;

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      <div>
        <div style="font-size:15px;font-weight:700;color:var(--t1)">Holiday Conflict Notifications</div>
        <div style="font-size:12px;color:var(--t3);margin-top:3px">
          ${active.length
            ? `<span style="color:var(--red);font-weight:600">${active.length} LP${active.length !== 1 ? 's' : ''} need updating</span> — pending rows fall on holidays`
            : 'No conflicts detected'}
          ${excl.length ? ` · <span style="color:var(--t4)">${excl.length} excluded</span>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button id="lpNotifScanBtn" class="add-btn" style="background:var(--surface3);color:var(--t2);border:1px solid var(--border);font-size:12px">
          🔍 Re-scan
        </button>

        ${active.length ? `
          <button id="lpNotifFixAllBtn" class="add-btn" style="background:rgba(16,185,129,.12);color:#10b981;border:1px solid rgba(16,185,129,.3);font-size:12px;font-weight:600">
            ✓ Fix All (${active.length})
          </button>` : ''}
        ${all.length ? `
          <button id="lpNotifClearBtn" class="add-btn" style="background:var(--surface3);color:var(--t3);border:1px solid var(--border);font-size:11.5px">
            🗑 Clear All
          </button>` : ''}
      </div>
    </div>

    <div id="lpNotifList">
      ${active.length === 0 && excl.length === 0
        ? emptyState
        : `
          ${active.map(renderCard).join('')}
          ${excl.length ? `
            <div style="font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin:16px 0 8px;padding-top:12px;border-top:1px solid var(--border)">
              Excluded (${excl.length})
            </div>
            ${excl.map(renderCard).join('')}
          ` : ''}
        `}
    </div>
  `;

  // ── Wire buttons ──────────────────────────────────
  el.querySelector('#lpNotifScanBtn')?.addEventListener('click', () => {
    const count = HolidayWatcher.scan();
    _refreshNotifBadge(container);
    renderNotifsTab(container);
    if (count === 0) Toast.success('No conflicts found — all LPs are clean.');
    else Toast.warning(`${count} LP${count !== 1 ? 's' : ''} affected by holiday conflicts.`);
  });

  el.querySelector('#lpNotifFixAllBtn')?.addEventListener('click', async () => {
    const activeNotifs = Object.values(HolidayWatcher.getNotifs()).filter(n => !n.excluded);
    const ok = await Modal.confirm({
      title:        'Fix All Lecture Plans',
      message:      `This will shift pending rows for <strong>${activeNotifs.length} LP${activeNotifs.length !== 1 ? 's' : ''}</strong> — rows falling on holiday dates will move to the next available working day. Topics and types remain unchanged. Excluded batches will be skipped.`,
      confirmLabel: 'Fix All',
      danger:       false,
    });
    if (!ok) return;
    const fixResult = HolidayWatcher.fixAll();
    _refreshNotifBadge(container);
    renderNotifsTab(container);
    Toast.success(`Fixed ${fixResult.fixed} of ${fixResult.total} lecture plan${fixResult.total !== 1 ? 's' : ''}.`);
  });

  el.querySelector('#lpNotifClearBtn')?.addEventListener('click', async () => {
    const ok = await Modal.confirm({
      title:        'Clear Notifications',
      message:      'This will dismiss all notifications without fixing any LPs. Holiday conflicts may reappear on next scan.',
      confirmLabel: 'Clear All',
      danger:       true,
    });
    if (!ok) return;
    HolidayWatcher.clearAll();
    _refreshNotifBadge(container);
    renderNotifsTab(container);
    Toast.success('Notifications cleared.');
  });

  // Fix single
  el.querySelectorAll('[data-notif-fix]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const bid   = btn.dataset.notifFix;
      const notif = HolidayWatcher.getNotifs()[bid];
      const ok    = await Modal.confirm({
        title:        `Fix LP — ${notif?.batchName}`,
        message:      `Shift <strong>${notif?.affectedCount} pending row${notif?.affectedCount !== 1 ? 's' : ''}</strong> falling on holiday dates to the next available working day for batch <strong>${notif?.batchName}</strong>? Topics and types will not change.`,
        confirmLabel: 'Fix',
      });
      if (!ok) return;
      const result = HolidayWatcher.fixBatch(bid);
      _refreshNotifBadge(container);
      renderNotifsTab(container);
      if (result.success) Toast.success(`${result.shifted} row${result.shifted !== 1 ? 's' : ''} shifted for batch "${notif?.batchName}".`);
      else Toast.error(result.message);
    });
  });

  // Exclude single
  el.querySelectorAll('[data-notif-exclude]').forEach(btn => {
    btn.addEventListener('click', () => {
      HolidayWatcher.excludeBatch(btn.dataset.notifExclude);
      _refreshNotifBadge(container);
      renderNotifsTab(container);
    });
  });

  // Re-include single
  el.querySelectorAll('[data-notif-include]').forEach(btn => {
    btn.addEventListener('click', () => {
      HolidayWatcher.includeBatch(btn.dataset.notifInclude);
      _refreshNotifBadge(container);
      renderNotifsTab(container);
    });
  });
}

// ═══════════════════════════════════════════════════
//  TAB 4 — BATCH TIMELINE
// ═══════════════════════════════════════════════════

// ── Timeline multi-filter styles (injected once) ──────────────
function _injectTLFilterStyles() {
  if (document.getElementById('tl-mf-style')) return;
  const st = document.createElement('style');
  st.id = 'tl-mf-style';
  st.textContent = `
    .tl-mf { position:relative; flex-shrink:0; }
    .tl-mf-btn {
      display:flex; align-items:center; gap:5px; cursor:pointer;
      padding:0 10px; height:34px; border:1px solid var(--border);
      border-radius:8px; background:var(--surface2); color:var(--t2);
      font-size:12.5px; white-space:nowrap; user-select:none;
      min-width:90px; max-width:180px; font-family:var(--font);
    }
    .tl-mf-btn:hover { border-color:var(--blue); color:var(--blue); }
    .tl-mf-btn.active { border-color:var(--blue); background:var(--blue-dim); color:var(--blue); font-weight:600; }
    .tl-mf-btn .mf-label { overflow:hidden; text-overflow:ellipsis; flex:1; }
    .tl-mf-btn .mf-caret { font-size:9px; flex-shrink:0; opacity:0.6; }
    .tl-mf-btn .mf-badge {
      background:var(--blue); color:#fff; font-size:9.5px; font-weight:700;
      border-radius:10px; padding:1px 5px; flex-shrink:0;
    }
    .tl-mf-panel {
      position:absolute; top:calc(100% + 4px); left:0; z-index:999;
      background:var(--surface1, #ffffff); border:1px solid var(--border, #e2e8f0);
      border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.12);
      min-width:180px; max-width:260px; overflow:hidden;
      display:none; flex-direction:column;
    }
    .tl-mf-panel.open { display:flex; }
    .tl-mf-search { padding:8px 10px 4px; border-bottom:1px solid var(--border); }
    .tl-mf-search input {
      width:100%; padding:4px 8px; font-size:12px;
      border:1px solid var(--border); border-radius:6px;
      background:var(--surface2); color:var(--t1); outline:none;
    }
    .tl-mf-list { overflow-y:auto; max-height:220px; padding:4px 0; }
    .tl-mf-item {
      display:flex; align-items:center; gap:9px;
      padding:7px 12px; cursor:pointer; font-size:12.5px; color:var(--t2);
      transition:background .1s, color .1s; user-select:none;
    }
    .tl-mf-item:hover { background:var(--blue-dim,rgba(37,99,235,.07)); color:var(--blue); }
    .tl-mf-item.checked { color:var(--blue); font-weight:600; }
    .tl-mf-item.checked:hover { background:rgba(37,99,235,.1); }
    /* custom checkbox */
    .tl-mf-chk {
      width:15px; height:15px; border-radius:4px; flex-shrink:0;
      border:1.5px solid var(--border2,#cbd5e1);
      display:inline-flex; align-items:center; justify-content:center;
      transition:all .12s; background:var(--surface1);
    }
    .tl-mf-item.checked .tl-mf-chk {
      background:var(--blue); border-color:var(--blue);
    }
    .tl-mf-item.checked .tl-mf-chk::after {
      content:''; display:block; width:4px; height:7px;
      border:2px solid #fff; border-top:none; border-left:none;
      transform:rotate(45deg) translate(-1px,-1px);
    }
    .tl-mf-lbl { flex:1; }
    .tl-mf-footer {
      border-top:1px solid var(--border); padding:7px 10px;
      display:flex; justify-content:space-between; align-items:center; gap:6px;
      background:var(--surface2);
    }
    .tl-mf-count { font-size:11px; color:var(--t3); }
    .tl-mf-clear {
      font-size:11px; padding:3px 10px; border-radius:6px; cursor:pointer;
      border:1px solid var(--border); background:var(--surface1); color:var(--t2);
      font-family:var(--font); transition:all .12s;
    }
    .tl-mf-clear:hover { border-color:var(--red,#ef4444); color:var(--red,#ef4444); }
    .tl-export-btn {
      display:inline-flex;align-items:center;justify-content:center;
      width:32px;height:32px;border-radius:7px;border:1px solid var(--border);
      background:var(--surface2);color:var(--t3);cursor:pointer;transition:all .15s;
    }
    .tl-export-btn:hover { border-color:var(--blue);color:var(--blue);background:var(--blue-dim); }
  `;
  document.head.appendChild(st);
}

// ── Init a single multi-select widget (auto-apply, stay-open) ──
function _initTLMultiFilter(wrap, allLabel, items, onchange) {
  wrap._mfItems    = items;
  wrap._mfSelected = new Set();

  const btn   = document.createElement('div');
  btn.className = 'tl-mf-btn';

  const panel = document.createElement('div');
  panel.className = 'tl-mf-panel';

  wrap.appendChild(btn);
  wrap.appendChild(panel);

  const renderBtn = () => {
    const sel = wrap._mfSelected;
    if (sel.size === 0) {
      btn.className = 'tl-mf-btn';
      btn.innerHTML = `<span class="mf-label">${allLabel}</span><span class="mf-caret">▾</span>`;
    } else {
      btn.className = 'tl-mf-btn active';
      const lbl = sel.size === 1
        ? (wrap._mfItems.find(i => i.val === [...sel][0])?.label || '')
        : `${sel.size} selected`;
      const short = lbl.length > 18 ? lbl.slice(0,16)+'…' : lbl;
      btn.innerHTML = `<span class="mf-label">${short}</span><span class="mf-badge">${sel.size}</span><span class="mf-caret">▾</span>`;
    }
  };

  const renderList = (q = '') => {
    const filtered = wrap._mfItems.filter(i =>
      !q || i.label.toLowerCase().includes(q.toLowerCase())
    );
    panel.innerHTML = `
      <div class="tl-mf-search">
        <input placeholder="Search…" value="${q}" autocomplete="off"/>
      </div>
      <div class="tl-mf-list">
        ${filtered.length ? filtered.map(i => `
          <div class="tl-mf-item ${wrap._mfSelected.has(i.val) ? 'checked' : ''}" data-val="${i.val}">
            <span class="tl-mf-chk"></span>
            <span class="tl-mf-lbl">${i.label}</span>
          </div>`).join('') : '<div style="padding:12px;font-size:12px;color:var(--t4);text-align:center">No results</div>'}
      </div>
      <div class="tl-mf-footer">
        <span class="tl-mf-count">${wrap._mfSelected.size} selected</span>
        <button class="tl-mf-clear">✕ Clear</button>
      </div>`;

    // Search
    const inp = panel.querySelector('.tl-mf-search input');
    inp.addEventListener('input', e => renderList(e.target.value));
    // Keep focus inside search after re-render
    setTimeout(() => inp.focus(), 0);

    // Checkbox rows — click = toggle + auto-apply (panel stays open)
    panel.querySelectorAll('.tl-mf-item').forEach(item => {
      item.addEventListener('click', e => {
        e.stopPropagation();
        const val = item.dataset.val;
        if (wrap._mfSelected.has(val)) wrap._mfSelected.delete(val);
        else                           wrap._mfSelected.add(val);
        item.classList.toggle('checked', wrap._mfSelected.has(val));
        // Update footer count
        const cnt = panel.querySelector('.tl-mf-count');
        if (cnt) cnt.textContent = `${wrap._mfSelected.size} selected`;
        renderBtn();
        onchange([...wrap._mfSelected]); // ← auto-apply immediately
      });
    });

    // Clear button
    panel.querySelector('.tl-mf-clear').addEventListener('click', e => {
      e.stopPropagation();
      wrap._mfSelected.clear();
      renderBtn();
      renderList(inp ? inp.value : '');
      onchange([]);
    });
  };

  wrap._mfRenderList = renderList;
  renderList();
  renderBtn();

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = panel.classList.contains('open');
    document.querySelectorAll('.tl-mf-panel.open').forEach(p => p.classList.remove('open'));
    if (!isOpen) {
      panel.classList.add('open');
      renderList('');
    }
  });
}

function renderTimelineTab(container) {
  const el = container.querySelector('#lp-panel-timeline');
  if (!el) return;

  _injectTLFilterStyles();

  const allBatches  = Auth.filterByCampus(AppState.get('batches') || [], 'campusId');
  const campuses    = AppState.get('campuses')     || [];
  const subjects    = AppState.get('subjects')     || [];
  const levels      = AppState.get('levels')       || [];
  const teachers    = AppState.get('teachers')     || [];
  const disciplines = AppState.get('disciplines')  || [];
  const allAssign   = getAllAssignments();

  // Storage key for timeline remarks
  const REMARKS_KEY = 'lpTimelineRemarks';
  const getRemarks  = () => AppState.get(REMARKS_KEY) || {};
  const saveRemarks = (obj) => AppState.set(REMARKS_KEY, obj);

  // Only batches that have an LP assigned
  const assigned = allBatches.filter(b => allAssign[b.id]);

  // ── Filter & sort state ────────────────────────────────────
  let _sort          = el._tlSort          || 'oldest';
  let _search        = el._tlSearch        || '';
  let _campFilter    = el._tlCampFilter    || [];
  let _subjFilter    = el._tlSubjFilter    || [];
  let _discFilter    = el._tlDiscFilter    || [];
  let _levelFilter   = el._tlLevelFilter   || [];
  let _sessionFilter = el._tlSessionFilter || [];

  el._tlSort          = _sort;
  el._tlSearch        = _search;
  el._tlCampFilter    = _campFilter;
  el._tlSubjFilter    = _subjFilter;
  el._tlDiscFilter    = _discFilter;
  el._tlLevelFilter   = _levelFilter;
  el._tlSessionFilter = _sessionFilter;

  const fmt = ds => {
    if (!ds) return '—';
    const d    = new Date(ds + 'T00:00:00');
    const mons = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${d.getDate()} ${mons[d.getMonth()]} ${d.getFullYear()}`;
  };

  const today = new Date();
  today.setHours(0,0,0,0);

  const pct = (rows) => {
    if (!rows || !rows.length) return 0;
    const dated = rows.filter(r => r.date);
    if (!dated.length) return 0;
    const passed = dated.filter(r => new Date(r.date + 'T00:00:00') <= today).length;
    return Math.round((passed / dated.length) * 100);
  };

  const pctBar = (p) => {
    const color = p >= 80 ? '#10b981' : p >= 40 ? '#f59e0b' : '#6366f1';
    return `
      <div style="display:flex;align-items:center;gap:7px">
        <div style="flex:1;height:5px;background:var(--surface3);border-radius:3px;overflow:hidden;min-width:60px">
          <div style="height:100%;width:${p}%;background:${color};border-radius:3px;transition:width .3s"></div>
        </div>
        <span style="font-size:12px;font-weight:600;color:${color};min-width:32px">${p}%</span>
      </div>`;
  };

  // Build rows from live assignment data
  let rows = assigned.map(b => {
    const lpa     = allAssign[b.id];
    const campus  = campuses.find(c => c.id === b.campusId);
    const subj    = subjects.find(s => s.id === b.subjectId);
    const teacher = teachers.find(t => t.id === b.teacherId);
    const disc    = disciplines.find(d => d.id === b.disciplineId);

    // Start = first dated row, End = last dated row
    const dated = (lpa.rows || []).filter(r => r.date).sort((a,b) => a.date.localeCompare(b.date));
    const startDate = dated[0]?.date || null;
    const endDate   = dated[dated.length - 1]?.date || null;

    const subjLabel = b.subjectCode || lpa?.subjectCode || (subj ? (subj.subjectCode || subj.subjectName) : null) || lpa.lpCode || '—';
    const batchName = b.batchName || b.name || b.id;
    const teacherLabel = teacher
      ? (teacher.fullName || teacher.name || `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim())
      : '—';
    const completion = pct(lpa.rows || []);
    // Session from batch
    const sessionPeriod = b.sessionPeriod || '';

    // resolve levelId: from subject chain OR direct batch.levelId
    const levelId = subj?.levelId || b.levelId || '';
    const level   = levels.find(l => l.id === levelId);
    const hrs     = calcHours(lpa.rows || []);

    return {
      batchId:        b.id,
      campusId:       b.campusId     || '',
      subjectId:      b.subjectId    || '',
      disciplineId:   b.disciplineId || '',
      levelId,
      sessionPeriod,
      campus:         campus ? (campus.campusName || campus.name || '—') : '—',
      subject:        subjLabel,
      batchName,
      batchNo:        b.batchNo != null ? String(b.batchNo).padStart(2, '0') : '—',
      teacher:        teacherLabel,
      startDate,
      endDate,
      completion,
      rows:           lpa.rows || [],
      hrs,
      // raw refs for export
      _disc:    disc,
      _subj:    subj,
      _level:   level,
      _campus:  campus,
      _teacher: teacher,
    };
  });

  // ── Apply multi-select filters ─────────────────────────────
  if (_campFilter.length)    rows = rows.filter(r => _campFilter.includes(r.campusId));
  if (_subjFilter.length)    rows = rows.filter(r => _subjFilter.includes(r.subjectId));
  if (_discFilter.length)    rows = rows.filter(r => _discFilter.includes(r.disciplineId));
  if (_levelFilter.length)   rows = rows.filter(r => _levelFilter.includes(r.levelId));
  if (_sessionFilter.length) rows = rows.filter(r => _sessionFilter.includes(r.sessionPeriod));

  // Apply search
  const q = _search.toLowerCase();
  if (q) {
    rows = rows.filter(r =>
      [r.campus, r.subject, r.batchName, r.teacher, r.sessionPeriod].join(' ').toLowerCase().includes(q)
    );
  }

  // Sort
  rows.sort((a, b) => {
    const sa = a.startDate || '';
    const sb = b.startDate || '';
    return _sort === 'oldest' ? sa.localeCompare(sb) : sb.localeCompare(sa);
  });

  // Store for export
  el._tlFilteredRows = rows;

  const remarksMap = getRemarks();

  const buildTable = () => `
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <!-- Row 1: main headers — Hours spans 4 sub-cols -->
        <tr style="background:var(--surface2);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:3">
          <th rowspan="2" style="padding:9px 12px;text-align:center;font-size:11px;font-weight:600;color:var(--t3);width:44px;border-right:1px solid var(--border)">#</th>
          <th rowspan="2" style="padding:9px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3)">Campus</th>
          <th rowspan="2" style="padding:9px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3)">Subject</th>
          <th rowspan="2" style="padding:9px 12px;text-align:center;font-size:11px;font-weight:600;color:var(--t3);width:52px">Batch</th>
          <th rowspan="2" style="padding:9px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3)">Teacher</th>
          <th rowspan="2" style="padding:9px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3)">Start Date</th>
          <th rowspan="2" style="padding:9px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3);white-space:nowrap">End Date</th>
          <th rowspan="2" style="padding:9px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3);white-space:nowrap">Duration</th>
          <th colspan="4" style="padding:6px 12px;text-align:center;font-size:11px;font-weight:700;color:var(--t1);border-bottom:1px solid var(--border);border-left:1px solid var(--border)">Hours</th>
          <th rowspan="2" style="padding:9px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3);min-width:120px">Completion</th>
          <th rowspan="2" style="padding:9px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3);min-width:180px">Remarks</th>
        </tr>
        <!-- Row 2: Hours sub-headers -->
        <tr style="background:var(--surface2);border-bottom:2px solid var(--border);position:sticky;top:39px;z-index:3">
          <th style="padding:5px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--t2);border-left:1px solid var(--border);white-space:nowrap">Teaching</th>
          <th style="padding:5px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--t2);white-space:nowrap">Test</th>
          <th style="padding:5px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--t2);white-space:nowrap">Mock</th>
          <th style="padding:5px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--t2);white-space:nowrap">Revision</th>
        </tr>
      </thead>
      <tbody>
        ${rows.length ? rows.map((r, i) => {
          const rem = remarksMap[r.batchId] || '';
          return `
            <tr style="border-bottom:1px solid var(--border);transition:background .12s"
                onmouseover="this.style.background='var(--surface2)'"
                onmouseout="this.style.background=''">
              <td style="padding:10px 12px;text-align:center;color:var(--t3);font-size:12px;border-right:1px solid var(--border)">${i + 1}</td>
              <td style="padding:10px 12px">
                <span style="font-size:12.5px;color:var(--t1)">${r.campus}</span>
              </td>
              <td style="padding:10px 12px">
                <span style="font-family:'Segoe UI',Arial,sans-serif;font-size:12.5px;font-weight:700;color:var(--blue)">${r.subject}</span>
              </td>
              <td style="padding:10px 12px;text-align:center">
                <span style="font-family:'Segoe UI',Arial,sans-serif;font-size:13px;font-weight:700;color:var(--t1)">${r.batchNo}</span>
              </td>
              <td style="padding:10px 12px;font-size:12.5px;color:var(--t2)">${r.teacher}</td>
              <td style="padding:10px 12px;font-size:12.5px;color:var(--t2);white-space:nowrap">${fmt(r.startDate)}</td>
              <td style="padding:10px 12px;font-size:12.5px;color:var(--t2);white-space:nowrap">${fmt(r.endDate)}</td>
              <td style="padding:10px 12px;white-space:nowrap">${(() => {
                const dur = calcDuration(r.startDate, r.endDate);
                return dur
                  ? `<span style="font-family:'Segoe UI',Arial,sans-serif;font-size:11.5px;font-weight:600;
                       color:var(--blue);background:var(--blue-dim);
                       padding:2px 8px;border-radius:8px">${dur}</span>`
                  : '<span style="color:var(--t4)">—</span>';
              })()}</td>
              <td style="padding:10px 12px;text-align:center;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;font-weight:600;color:var(--blue);border-left:1px solid var(--border)">${r.hrs.teaching}</td>
              <td style="padding:10px 12px;text-align:center;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;font-weight:600;color:var(--yellow)">${r.hrs.test}</td>
              <td style="padding:10px 12px;text-align:center;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;font-weight:600;color:var(--violet)">${r.hrs.mock}</td>
              <td style="padding:10px 12px;text-align:center;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;font-weight:600;color:var(--cyan)">${r.hrs.revision || 0}</td>
              <td style="padding:10px 12px">${pctBar(r.completion)}</td>
              <td style="padding:10px 12px">
                <div style="display:flex;align-items:center;gap:6px">
                  <span class="tl-rem-text" data-bid="${r.batchId}"
                        style="font-size:12.5px;color:${rem ? 'var(--t1)' : 'var(--t4)'};
                               font-style:${rem ? 'normal' : 'italic'};flex:1;min-width:0;
                               overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
                               max-width:200px" title="${rem || ''}">
                    ${rem || 'Add note…'}
                  </span>
                  <button class="tl-rem-edit" data-bid="${r.batchId}"
                          title="Edit remarks"
                          style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;
                                 background:var(--surface2);border:1px solid var(--border);
                                 border-radius:6px;cursor:pointer;color:var(--t3);flex-shrink:0">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  ${rem ? `
                  <button class="tl-rem-del" data-bid="${r.batchId}"
                          title="Clear remarks"
                          style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;
                                 background:var(--surface2);border:1px solid var(--border);
                                 border-radius:6px;cursor:pointer;color:var(--t3);flex-shrink:0">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    </svg>
                  </button>` : ''}
                </div>
              </td>
            </tr>`;
        }).join('') : `
          <tr><td colspan="14" style="padding:40px;text-align:center;color:var(--t3);font-size:13px">
            No LP-assigned batches found.
          </td></tr>`}
      </tbody>
    </table>`;

  // ── Build unique filter option lists ────────────────────────
  const uniqueSessions = [...new Set(assigned.map(b => b.sessionPeriod).filter(Boolean))]
    .sort((a, b) => {
      const parse = v => { const [n, yy] = v.split('-'); return parseInt(yy) * 2 + (n === 'June' ? 1 : 0); };
      return parse(b) - parse(a);
    });

  const campItems = campuses
    .filter(c => assigned.some(b => b.campusId === c.id))
    .map(c => ({ val: c.id, label: c.campusName.replace(/\s*campus$/i,'').trim() }));

  const subjItems = subjects
    .filter(s => assigned.some(b => b.subjectId === s.id))
    .map(s => ({ val: s.id, label: `${s.subjectCode} — ${s.subjectName}` }));

  const discItems = disciplines
    .filter(d => assigned.some(b => b.disciplineId === d.id))
    .map(d => ({ val: d.id, label: `${d.abbreviation} — ${d.fullName}` }));

  // Level items — only levels that appear in assigned batches
  const levelItems = levels
    .filter(l => assigned.some(b => {
      const s = subjects.find(s => s.id === b.subjectId);
      return (s?.levelId || b.levelId) === l.id;
    }))
    .map(l => ({ val: l.id, label: l.levelName || l.name || l.id }));

  const sessionItems = uniqueSessions.map(s => ({ val: s, label: s }));

  // active filters count for Clear All visibility
  const _anyFilter = _campFilter.length || _subjFilter.length || _discFilter.length || _levelFilter.length || _sessionFilter.length || _search;

  el.innerHTML = `
    <div style="padding:0">
      <!-- Toolbar -->
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap">

        <!-- Search — screenshot style: rounded pill with icon -->
        <div style="display:flex;align-items:center;gap:8px;height:36px;padding:0 12px;
                    background:var(--surface1,#fff);border:1.5px solid var(--border);
                    border-radius:20px;min-width:220px;max-width:280px;flex:1;
                    transition:border-color .15s;box-shadow:0 1px 3px rgba(0,0,0,.06)"
             onfocusin="this.style.borderColor='var(--blue)'"
             onfocusout="this.style.borderColor='var(--border)'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:var(--t3);flex-shrink:0">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input id="tlSearch" placeholder="Search by batch name or teacher…"
                 value="${_search}"
                 style="border:none;outline:none;background:transparent;font-size:12.5px;
                        color:var(--t1);width:100%;font-family:var(--font)"/>
        </div>

        <!-- Multi-select filter dropdowns -->
        <div class="tl-mf" id="tlCampFilter"></div>
        <div class="tl-mf" id="tlDiscFilter"></div>
        <div class="tl-mf" id="tlLevelFilter"></div>
        <div class="tl-mf" id="tlSubjFilter"></div>
        <div class="tl-mf" id="tlSessionFilter"></div>

        <!-- Clear All Filters -->
        ${_anyFilter ? `
          <button id="tlClearAllBtn"
                  style="display:inline-flex;align-items:center;gap:5px;height:34px;padding:0 12px;
                         border-radius:8px;border:1px solid rgba(239,68,68,.35);
                         background:rgba(239,68,68,.06);color:var(--red,#ef4444);
                         font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;
                         font-family:var(--font);transition:all .15s"
                  onmouseover="this.style.background='rgba(239,68,68,.12)'"
                  onmouseout="this.style.background='rgba(239,68,68,.06)'">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            Clear Filters
          </button>` : ''}

        <!-- Sort -->
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:auto">
          <select id="tlSort" style="padding:6px 10px;height:34px;background:var(--surface2);
                                     border:1px solid var(--border);border-radius:8px;
                                     font-size:12.5px;color:var(--t1);cursor:pointer;font-family:var(--font)">
            <option value="oldest" ${_sort === 'oldest' ? 'selected' : ''}>Oldest First</option>
            <option value="newest" ${_sort === 'newest' ? 'selected' : ''}>Newest First</option>
          </select>
        </div>

        <span style="font-size:12px;color:var(--t3);flex-shrink:0;white-space:nowrap">${rows.length} batch${rows.length !== 1 ? 'es' : ''}</span>

        <!-- Export buttons -->
        <button id="tlExportCSV" class="tl-export-btn" title="Export to CSV">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12l2.5 2.5L16 9"/>
          </svg>
        </button>
        <button id="tlExportPDF" class="tl-export-btn" title="Export to PDF">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>
          </svg>
        </button>
      </div>

      <!-- Table -->
      <div style="border:1px solid var(--border);border-radius:var(--r-sm);overflow:hidden;overflow-x:auto;overflow-y:auto;max-height:calc(100vh - 280px)">
        <div id="tl-table-wrap">${buildTable()}</div>
      </div>
    </div>
  `;

  // ── Init multi-select filters ────────────────────────────────
  const rerender = () => renderTimelineTab(container);

  const campWrap  = el.querySelector('#tlCampFilter');
  const discWrap  = el.querySelector('#tlDiscFilter');
  const levelWrap = el.querySelector('#tlLevelFilter');
  const subjWrap  = el.querySelector('#tlSubjFilter');
  const sessWrap  = el.querySelector('#tlSessionFilter');

  _initTLMultiFilter(campWrap,  'All Campuses',    campItems,    vals => { el._tlCampFilter    = vals; rerender(); });
  _initTLMultiFilter(discWrap,  'All Disciplines', discItems,    vals => { el._tlDiscFilter    = vals; rerender(); });
  _initTLMultiFilter(levelWrap, 'All Levels',      levelItems,   vals => { el._tlLevelFilter   = vals; rerender(); });
  _initTLMultiFilter(subjWrap,  'All Subjects',    subjItems,    vals => { el._tlSubjFilter    = vals; rerender(); });
  _initTLMultiFilter(sessWrap,  'All Sessions',    sessionItems, vals => { el._tlSessionFilter = vals; rerender(); });

  // ── Restore previously selected filter values ─────────────────
  const restoreMF = (wrap, vals) => {
    if (!vals.length || !wrap?._mfSelected) return;
    vals.forEach(v => wrap._mfSelected.add(v));
    if (wrap._mfRenderList) wrap._mfRenderList('');
    const b = wrap.querySelector('.tl-mf-btn');
    if (b) {
      b.classList.add('active');
      const lbl = vals.length === 1
        ? (wrap._mfItems?.find(i => i.val === vals[0])?.label || vals[0])
        : `${vals.length} selected`;
      const short = lbl.length > 18 ? lbl.slice(0,16)+'…' : lbl;
      b.innerHTML = `<span class="mf-label">${short}</span><span class="mf-badge">${vals.length}</span><span class="mf-caret">▾</span>`;
    }
  };
  restoreMF(campWrap,  _campFilter);
  restoreMF(discWrap,  _discFilter);
  restoreMF(levelWrap, _levelFilter);
  restoreMF(subjWrap,  _subjFilter);
  restoreMF(sessWrap,  _sessionFilter);

  // ── Clear All Filters button ──────────────────────────────────
  el.querySelector('#tlClearAllBtn')?.addEventListener('click', () => {
    el._tlCampFilter    = [];
    el._tlDiscFilter    = [];
    el._tlLevelFilter   = [];
    el._tlSubjFilter    = [];
    el._tlSessionFilter = [];
    el._tlSearch        = '';
    renderTimelineTab(container);
  });

  // Close filter panels on outside click
  document.addEventListener('click', () => {
    document.querySelectorAll('.tl-mf-panel.open').forEach(p => p.classList.remove('open'));
  });

  // ── Wire toolbar controls ────────────────────────────────────
  el.querySelector('#tlSearch').addEventListener('input', e => {
    el._tlSearch = e.target.value;
    // In-place DOM filter for timeline rows — no full re-render, focus stays
    const sq = (e.target.value || '').toLowerCase();
    el.querySelectorAll('#tl-table-wrap tbody tr').forEach(tr => {
      const text = tr.textContent.toLowerCase();
      tr.style.display = !sq || text.includes(sq) ? '' : 'none';
    });
    // Update count live
    const visibleCount = [...el.querySelectorAll('#tl-table-wrap tbody tr')].filter(tr => tr.style.display !== 'none').length;
    const countSpan = [...el.querySelectorAll('span')].find(s => /\d+ batch/.test(s.textContent));
    if (countSpan) countSpan.textContent = `${visibleCount} batch${visibleCount !== 1 ? 'es' : ''}`;
  });
  el.querySelector('#tlSort').addEventListener('change', e => {
    el._tlSort = e.target.value;
    renderTimelineTab(container);
  });

  // ── Build filter labels for export ──────────────────────────
  const getFilterLabels = () => {
    const labels = [];
    if (_search) labels.push(`Search: "${_search}"`);
    if (_campFilter.length) {
      const names = _campFilter.map(id => campuses.find(c => c.id === id)?.campusName?.replace(/\s*campus$/i,'').trim()).filter(Boolean);
      labels.push(`Campus: ${names.join(', ')}`);
    }
    if (_discFilter.length) {
      const names = _discFilter.map(id => disciplines.find(d => d.id === id)?.abbreviation).filter(Boolean);
      labels.push(`Discipline: ${names.join(', ')}`);
    }
    if (_levelFilter.length) {
      const names = _levelFilter.map(id => levels.find(l => l.id === id)?.levelName).filter(Boolean);
      labels.push(`Level: ${names.join(', ')}`);
    }
    if (_subjFilter.length) {
      const names = _subjFilter.map(id => subjects.find(s => s.id === id)?.subjectCode).filter(Boolean);
      labels.push(`Subject: ${names.join(', ')}`);
    }
    if (_sessionFilter.length) labels.push(`Session: ${_sessionFilter.join(', ')}`);
    return labels;
  };

  // ── Export CSV ───────────────────────────────────────────────
  el.querySelector('#tlExportCSV')?.addEventListener('click', () => {
    const exportRows = el._tlFilteredRows || [];
    if (!exportRows.length) { return; }
    const remarksMapExp = getRemarks();
    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
    const headers = ['Campus', 'Discipline', 'Subject', 'Batch #', 'Teacher', 'Session', 'Start Date', 'End Date', 'Duration', 'Teaching h', 'Test h', 'Mock h', 'Revision h', 'Completion %', 'Remarks'];
    const metaLines = [
      `Lecture Plan Timeline Report`,
      `Generated: ${dateStr} ${timeStr}`,
      getFilterLabels().length ? `Filters: ${getFilterLabels().join(' | ')}` : 'Filters: None',
      `Total Batches: ${exportRows.length}`,
      '',
    ];
    const dataRows = exportRows.map(r => {
      const discLabel = r._disc ? r._disc.abbreviation : '—';
      const rem = remarksMapExp[r.batchId] || '';
      const h = r.hrs || calcHours(r.rows || []);
      return [r.campus, discLabel, r.subject, r.batchNo || '—', r.teacher, r.sessionPeriod || '—',
              r.startDate || '—', r.endDate || '—', calcDuration(r.startDate, r.endDate) || '—',
              h.teaching, h.test, h.mock, h.revision || 0, `${r.completion}%`, rem];
    });
    const csvContent = [
      metaLines.join('\n'),
      headers.join(','),
      ...dataRows.map(row => row.map(cell => `"${(cell||'').toString().replace(/"/g,'""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `LP-Timeline-${dateStr.replace(/ /g,'-')}.csv`; a.click();
    URL.revokeObjectURL(url);
  });

  // ── Export PDF ───────────────────────────────────────────────
  el.querySelector('#tlExportPDF')?.addEventListener('click', () => {
    const exportRows = el._tlFilteredRows || [];
    if (!exportRows.length) { return; }
    const remarksMapExp = getRemarks();
    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
    const filterLabels = getFilterLabels();

    const filterHTML = filterLabels.length
      ? filterLabels.map(f => `<span class="filter-chip">${f}</span>`).join('')
      : '<span class="filter-chip" style="background:#f1f5f9;color:#64748b">No filters applied — showing all batches</span>';

    const tdRows = exportRows.map((r, i) => {
      const discLabel = r._disc ? r._disc.abbreviation : '—';
      const rem = remarksMapExp[r.batchId] || '—';
      const compColor = r.completion >= 80 ? '#10b981' : r.completion >= 40 ? '#f59e0b' : '#6366f1';
      const ph = r.hrs || calcHours(r.rows || []);
      return `<tr class="${i%2===0?'even':'odd'}">
        <td>${r.campus}</td>
        <td style="font-family:'Segoe UI',Arial,sans-serif;font-weight:700;color:#7c3aed">${discLabel}</td>
        <td style="font-family:'Segoe UI',Arial,sans-serif;font-weight:700;color:#2563eb">${r.subject}</td>
        <td style="font-family:'Segoe UI',Arial,sans-serif;font-weight:700;text-align:center">${r.batchNo || '—'}</td>
        <td>${r.teacher}</td>
        <td style="font-family:'Segoe UI',Arial,sans-serif;text-align:center">${r.sessionPeriod || '—'}</td>
        <td style="text-align:center">${r.startDate ? new Date(r.startDate+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'}</td>
        <td style="text-align:center">${r.endDate   ? new Date(r.endDate  +'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'}</td>
        <td style="font-family:'Segoe UI',Arial,sans-serif;font-weight:600;color:#2563eb;text-align:center">${calcDuration(r.startDate, r.endDate) || '—'}</td>
        <td style="font-family:'Segoe UI',Arial,sans-serif;font-weight:700;color:#2563eb;text-align:center">${ph.teaching}</td>
        <td style="font-family:'Segoe UI',Arial,sans-serif;font-weight:700;color:#d97706;text-align:center">${ph.test}</td>
        <td style="font-family:'Segoe UI',Arial,sans-serif;font-weight:700;color:#7c3aed;text-align:center">${ph.mock}</td>
        <td style="font-family:'Segoe UI',Arial,sans-serif;font-weight:700;color:#0891b2;text-align:center">${ph.revision || 0}</td>
        <td style="font-weight:700;color:${compColor}">${r.completion}%</td>
        <td style="color:#64748b;font-style:${rem==='—'?'italic':'normal'}">${rem}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>LP Timeline Report</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#1e293b;background:#fff;padding:20px 24px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #2563eb;padding-bottom:12px;margin-bottom:14px}
  .header-left .title{font-size:20px;font-weight:700;color:#1e40af;letter-spacing:-0.3px}
  .header-left .subtitle{font-size:11px;color:#64748b;margin-top:2px}
  .header-right{text-align:right;font-size:10.5px;color:#64748b;line-height:1.6}
  .header-right .date{font-weight:600;color:#1e293b;font-size:11px}
  .meta-row{display:flex;align-items:center;gap:16px;margin-bottom:12px;flex-wrap:wrap}
  .stat-box{background:#f8faff;border:1px solid #dbeafe;border-radius:8px;padding:6px 14px;text-align:center}
  .stat-box .num{font-size:18px;font-weight:700;color:#2563eb;font-family:'Segoe UI',Arial,sans-serif}
  .stat-box .lbl{font-size:9.5px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px}
  .filters-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px}
  .filters-label{font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap}
  .filter-chip{background:#dbeafe;color:#1d4ed8;font-size:10px;font-weight:600;padding:2px 9px;border-radius:10px}
  table{width:100%;border-collapse:collapse;font-size:10.5px}
  thead tr{background:#1e40af}
  thead th{color:#fff;font-weight:600;padding:7px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.4px;white-space:nowrap}
  tbody tr.even{background:#fff}
  tbody tr.odd{background:#f8faff}
  tbody tr:hover{background:#eff6ff}
  tbody td{padding:6px 8px;border-bottom:1px solid #e2e8f0;color:#334155;vertical-align:middle}
  .footer{margin-top:16px;padding-top:10px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9.5px;color:#94a3b8}
  @media print{
    body{padding:12px 14px}
    @page{size:A4 landscape;margin:10mm}
    .no-print{display:none}
  }
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <div class="title">Lecture Plan Timeline Report</div>
      <div class="subtitle">Batch-wise LP Progress & Schedule</div>
    </div>
    <div class="header-right">
      <div class="date">${dateStr}</div>
      <div>${timeStr}</div>
    </div>
  </div>
  <div class="meta-row">
    <div class="stat-box">
      <div class="num">${exportRows.length}</div>
      <div class="lbl">Total Batches</div>
    </div>
    <div class="stat-box">
      <div class="num">${exportRows.length ? Math.round(exportRows.reduce((s,r)=>s+r.completion,0)/exportRows.length) : 0}%</div>
      <div class="lbl">Avg Completion</div>
    </div>
  </div>
  <div class="filters-row">
    <span class="filters-label">&#9660; Filters</span>
    ${filterHTML}
  </div>
  <table>
    <thead>
      <tr>
        <th>Campus</th><th>Disc.</th><th>Subject</th><th style="text-align:center">Batch</th><th>Teacher</th>
        <th>Session</th><th>Start Date</th><th>End Date</th><th>Duration</th>
        <th style="color:#fff;text-align:center">Teaching h</th><th style="color:#fff;text-align:center">Test h</th><th style="color:#fff;text-align:center">Mock h</th><th style="color:#fff;text-align:center">Revision h</th>
        <th>Completion</th><th>Remarks</th>
      </tr>
    </thead>
    <tbody>${tdRows}</tbody>
  </table>
  <div class="footer">
    <span>Lecture Plan Timeline &nbsp;|&nbsp; Exported on ${dateStr} at ${timeStr}</span>
    <span>Total: ${exportRows.length} batch${exportRows.length!==1?'es':''}</span>
  </div>
  <div style="margin-top:10px;text-align:center;font-size:10px;color:#94a3b8">
    Powered by <strong style="color:#2563eb">Learnomist</strong>
  </div>
  <div class="no-print" style="margin-top:18px;text-align:center">
    <button onclick="window.print()" style="padding:9px 28px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">
      Print / Save as PDF
    </button>
  </div>
</body>
</html>`;

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 600);
  });

  // ── Wire remarks edit ────────────────────────────────────────
  el.querySelectorAll('.tl-rem-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const bid     = btn.dataset.bid;
      const current = getRemarks()[bid] || '';
      const row     = rows.find(r => r.batchId === bid);

      Modal.open({
        title: `Remarks — ${row?.batchName || bid}`,
        body: `
          <div class="form-group">
            <label class="form-label">Remarks</label>
            <textarea id="tlRemInput" class="form-input"
                      style="min-height:80px;resize:vertical"
                      placeholder="Add any notes about this batch…">${current}</textarea>
          </div>`,
        actions: [
          { label: 'Cancel', variant: 'ghost', close: true },
          {
            label: 'Save', variant: 'primary', close: false,
            handler: (modalEl) => {
              const val = modalEl.querySelector('#tlRemInput').value.trim();
              const rem = getRemarks();
              if (val) rem[bid] = val;
              else delete rem[bid];
              saveRemarks(rem);
              Modal.closeAll();
              renderTimelineTab(container);
            }
          }
        ]
      });
    });
  });

  // ── Wire remarks delete ──────────────────────────────────────
  el.querySelectorAll('.tl-rem-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const rem = getRemarks();
      delete rem[btn.dataset.bid];
      saveRemarks(rem);
      renderTimelineTab(container);
    });
  });
}

// ── Refresh badge on tab button ───────────────────────────────
function _refreshNotifBadge(container) {
  const count = HolidayWatcher.activeCount();
  const btn   = container.querySelector('#lpNotifTabBtn');
  if (!btn) return;
  // Rebuild tab label
  btn.innerHTML = `🔔 Notifications${count ? ` <span class="lp-badge-pulse">${count}</span>` : ''}`;
}

// ── Module entry point ────────────────────────────────────────
export const LecturePlanModule = {
  mount(container) {
    injectUIStyles();
    injectLPStyles();
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) { console.error('[LecturePlanModule] Container not found'); return; }

    // Initial scan on mount
    HolidayWatcher.scan();

    el.innerHTML = _pageTemplate();

    renderPlansTab(el);

    // Tab switching
    el.querySelectorAll('.lp-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.lp-tab-btn').forEach(b => b.classList.remove('active'));
        el.querySelectorAll('.lp-tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const panel = el.querySelector(`#lp-panel-${btn.dataset.lpTab}`);
        if (panel) panel.classList.add('active');

        if (btn.dataset.lpTab === 'assign')   renderAssignTab(el);
        else if (btn.dataset.lpTab === 'timeline') renderTimelineTab(el);
        else if (btn.dataset.lpTab === 'notifs')   renderNotifsTab(el);
        else renderPlansTab(el);
      });
    });

    // Subscribe to state changes
    AppState.subscribe('lecturePlans',   () => renderPlansTab(el));
    AppState.subscribe('lpAssignments',  () => {
      const tlPanel = el.querySelector('#lp-panel-timeline');
      if (tlPanel?.classList.contains('active')) renderTimelineTab(el);
    });
    AppState.subscribe('batches',        () => {
      const tlPanel = el.querySelector('#lp-panel-timeline');
      if (tlPanel?.classList.contains('active')) renderTimelineTab(el);
    });

    // When holidays change → scan for new conflicts AND reverse-shift
    // rows whose holiday was deleted
    let _prevHolidays = (AppState.get('holidays') || []).map(h => h.date);
    AppState.subscribe('holidays', () => {
      const currHolidays = (AppState.get('holidays') || []).map(h => h.date);
      const removedDates = _prevHolidays.filter(d => !currHolidays.includes(d));
      _prevHolidays = currHolidays;

      if (removedDates.length) {
        HolidayWatcher.scanDeleted(removedDates);
      }
      HolidayWatcher.scan();
      _refreshNotifBadge(el);
      const notifPanel = el.querySelector('#lp-panel-notifs');
      if (notifPanel?.classList.contains('active')) {
        renderNotifsTab(el);
      }
    });
  }
};
