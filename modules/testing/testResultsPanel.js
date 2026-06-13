// ============================================================
// modules/testing/testResultsPanel.js — Test Results Panel
// Sub-panel inside Results → "Test Results" tab
//
// Features:
//  • Same filter toolbar as Final Results (campus, session,
//    subject, batch) — chained cascading dropdowns
//  • "Add Result" opens a modal where the LAST dropdown is
//    "Select Test" — auto-populated from Assessment Calendar
//    entries (LP + manual schedules) matching chosen criteria
//  • After selecting a test, an inline marks-entry grid
//    appears: rows = students, columns = each test entry
//    (Test 1, Test 2, Midterm, Mock, etc.)
//  • Arrow-key + Tab/Enter navigation across all mark cells
//  • Saves per-student per-test marks in AppState['testResults']
//  • Main table: same structure + export as Final Results
// ============================================================

import { AppState, generateID }  from '../../utils/state.js';
import { Modal, Form }           from '../../utils/ui.js';
import { Toast }                 from '../../utils/helpers.js';
import { Auth }                  from '../../utils/auth.js';
import {
  getSchedules,
  getScheduleStatus,
  TEST_TYPE_META,
  formatDate,
} from './testingService.js';
import { getAllAssignments }      from '../lecturePlan/lecturePlanService.js';

// ── AppState key ──────────────────────────────────────────────
const TR_KEY = 'testResults';   // Array of result records

// LP row types that count as assessable tests
const LP_TEST_TYPES = new Set(['test', 'midterm', 'mock']);
const LP_VALID_RE   = /^(?:test(?:\s+\d+)?|mid[\s-]?term(?:\s+\d+)?|mock(?:\s+exam)?(?:\s+\d+)?)$/i;

// ── Helpers ───────────────────────────────────────────────────

function _normType(t) {
  t = (t || '').toLowerCase();
  if (t === 'midterm') return 'midterm';
  if (t === 'mock')    return 'mock';
  return 'written';
}

function _defaultLabel(type) {
  if (type === 'midterm') return 'Midterm';
  if (type === 'mock')    return 'Mock Exam';
  return 'Test';
}

/**
 * Build ALL calendar entries (LP-derived + manual schedules)
 * that match a given criteria object:
 *   { campusId, sessionId, subjectId, batchId }
 * Returns array of "virtual schedule" objects sorted by date.
 */
function _buildCalendarEntries({ campusId, sessionId, subjectId, batchId } = {}) {
  const batches  = AppState.get('batches')  || [];
  const entries  = [];

  // ── 1. LP-derived entries ──────────────────────────────────
  const assignments = getAllAssignments();
  for (const [bid, lpa] of Object.entries(assignments)) {
    if (!lpa?.rows?.length) continue;

    // Filter by batchId
    if (batchId && bid !== batchId) continue;

    const batch = AppState.findById('batches', bid) || {};

    // Filter by campusId
    if (campusId && batch.campusId !== campusId) continue;

    // Filter by sessionId (stored as batch.sessionId or batch.sessionPeriod)
    if (sessionId && batch.sessionId !== sessionId && batch.sessionPeriod !== sessionId) continue;

    lpa.rows.forEach(row => {
      const rowType = (row.type || '').toLowerCase();
      if (!LP_TEST_TYPES.has(rowType)) return;
      if (!row.date) return;

      const rawTopic = (row.topic || '').trim();
      if (rawTopic && !LP_VALID_RE.test(rawTopic)) return;

      // Filter by subjectId (LP rows may carry subjectId)
      if (subjectId && row.subjectId && row.subjectId !== subjectId) return;

      const testName = rawTopic || _defaultLabel(rowType);

      entries.push({
        id:       `lp__${bid}__${row.id}`,
        date:     row.date,
        testName,
        testType: _normType(rowType),
        batchId:  bid,
        batchName: batch.batchName || '—',
        subjectId: row.subjectId || '',
        source:   'lp',
        totalMarks:   row.totalMarks   || '',
        passingMarks: row.passingMarks || '',
      });
    });
  }

  // ── 2. Manual schedules ────────────────────────────────────
  getSchedules().forEach(s => {
    if (batchId   && s.batchId   !== batchId)   return;
    if (subjectId && s.subjectId !== subjectId)  return;

    const batch = AppState.findById('batches', s.batchId) || {};
    if (campusId  && batch.campusId  !== campusId)  return;
    if (sessionId && batch.sessionId !== sessionId && batch.sessionPeriod !== sessionId) return;

    entries.push({
      id:       s.id,
      date:     s.date,
      testName: s.testName,
      testType: s.testType,
      batchId:  s.batchId,
      batchName: batch.batchName || '—',
      subjectId: s.subjectId || '',
      source:   'schedule',
      totalMarks:   s.totalMarks   || '',
      passingMarks: s.passingMarks || '',
    });
  });

  // ── 3. Saved retest virtual entries ──────────────────────────
  const retestStubs = _getRetestEntries();
  retestStubs.forEach(stub => {
    // Find parent entry in our list
    const parent = entries.find(e => e.id === stub.retestOf);
    if (!parent) return;
    // Apply filters (same as parent)
    if (batchId   && parent.batchId   !== batchId)   return;
    if (subjectId && parent.subjectId !== subjectId)  return;
    const retEntry = _makeRetestEntry(parent, stub.retestDate, stub.retestIndex);
    retEntry.id = stub.scheduleEntryId; // use the stored virtual id
    entries.push(retEntry);
  });

  // Sort by date ascending
  entries.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return entries;
}

/**
 * Group entries by batch and count — used for smart ordering
 * (batches with more test entries surface first in dropdown)
 */
function _groupByBatch(entries) {
  const map = {};
  entries.forEach(e => {
    if (!map[e.batchId]) map[e.batchId] = { batchName: e.batchName, entries: [] };
    map[e.batchId].entries.push(e);
  });
  // Sort by count desc
  return Object.entries(map).sort((a, b) => b[1].entries.length - a[1].entries.length);
}

// ── CRUD helpers ──────────────────────────────────────────────

function _getResults() { return AppState.get(TR_KEY) || []; }

/**
 * Upsert a single student-test mark.
 * Key: { scheduleEntryId, studentId }
 */
function _upsertMark({ scheduleEntryId, studentId, marks, absent, subjectId, totalMarks, passingMarks,
                       isRetest, retestOf, retestDate, retestIndex }) {
  const all  = _getResults();
  const idx  = all.findIndex(r => r.scheduleEntryId === scheduleEntryId && r.studentId === studentId);
  const extra = {};
  if (subjectId    != null) extra.subjectId    = subjectId;
  if (totalMarks   != null) extra.totalMarks   = totalMarks;
  if (passingMarks != null) extra.passingMarks = passingMarks;
  if (isRetest     != null) extra.isRetest     = isRetest;
  if (retestOf     != null) extra.retestOf     = retestOf;     // parent entry id
  if (retestDate   != null) extra.retestDate   = retestDate;
  if (retestIndex  != null) extra.retestIndex  = retestIndex;  // 1, 2, 3…
  if (idx >= 0) {
    all[idx] = { ...all[idx], marks, absent, ...extra, updatedAt: new Date().toISOString() };
  } else {
    all.push({
      id:              generateID('tr'),
      scheduleEntryId,
      studentId,
      marks,
      absent,
      ...extra,
      createdAt:       new Date().toISOString(),
    });
  }
  AppState.set(TR_KEY, all);
}

/**
 * Build a virtual "retest" calendar entry derived from an original entry.
 * retestIndex: 1-based count of retest for this parent entry.
 */
function _makeRetestEntry(parentEntry, retestDate, retestIndex) {
  return {
    ...parentEntry,
    id:          `retest__${parentEntry.id}__${retestIndex}`,
    testName:    `${parentEntry.testName} (Retest ${retestIndex > 1 ? retestIndex : ''})`.trim(),
    date:        retestDate,
    isRetest:    true,
    retestOf:    parentEntry.id,
    retestIndex,
    source:      'retest',
  };
}

/**
 * Get all saved retest virtual entries from AppState (stored alongside marks).
 * Returns an array of virtual entry objects.
 */
function _getRetestEntries() {
  const all = _getResults();
  const map = {}; // key: `${retestOf}__${retestIndex}` → entry stub
  all.forEach(r => {
    if (!r.isRetest || !r.retestOf || !r.retestIndex) return;
    const key = `${r.retestOf}__${r.retestIndex}`;
    if (!map[key]) {
      map[key] = {
        retestOf:    r.retestOf,
        retestIndex: r.retestIndex,
        retestDate:  r.retestDate || '',
        scheduleEntryId: r.scheduleEntryId, // the retest virtual id
      };
    }
  });
  return Object.values(map);
}

function _getMark(scheduleEntryId, studentId) {
  return _getResults().find(r =>
    r.scheduleEntryId === scheduleEntryId && r.studentId === studentId
  ) || null;
}

// ── Main Panel export ─────────────────────────────────────────
export const TestResultsPanel = {

  _container: null,

  // Filter state (same pattern as FinalResultsPanel)
  _filterCampus:  [],
  _filterSession: [],
  _filterSubject: [],
  _filterBatch:   [],

  // ── Mount ─────────────────────────────────────────────────────
  mount(container) {
    this._container     = container;
    this._filterCampus  = [];
    this._filterSession = [];
    this._filterSubject = [];
    this._filterBatch   = [];

    this._injectStyles();
    container.innerHTML = this._template();
    this._attachToolbar(container);
    this._initFilterBar(container);
    this._renderTable(container);
  },

  // ── Top-level template ────────────────────────────────────────
  _template() {
    return `
      <div class="tr-page">

        <!-- Row 1: Add Result + Export -->
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <button class="tr-add-btn" id="trAddBtn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5"  y1="12" x2="19" y2="12"/>
            </svg>
            Add Test Result
          </button>
          <div style="flex:1"></div>
          <button id="trExportCSV" class="tr-export-btn" title="Export CSV">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M8 12l2.5 2.5L16 9"/>
            </svg> CSV
          </button>
          <button id="trExportPDF" class="tr-export-btn" title="Export PDF">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="8" y1="13" x2="16" y2="13"/>
              <line x1="8" y1="17" x2="16" y2="17"/>
            </svg> PDF
          </button>
        </div>

        <!-- Row 2: Filter bar -->
        <div class="tr-filter-bar" id="trFilterBar">

          <!-- Campus -->
          <div class="tr-ms-wrap" id="trMsCampus">
            <button class="tr-ms-trigger" id="trMsCampusTrigger">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
              <span class="tr-ms-label" id="trMsCampusLabel">All Campuses</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="tr-ms-caret"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="tr-ms-dropdown" id="trMsCampusDropdown"></div>
          </div>

          <!-- Session -->
          <div class="tr-ms-wrap" id="trMsSession">
            <button class="tr-ms-trigger" id="trMsSessionTrigger">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3"  y1="10" x2="21" y2="10"/>
              </svg>
              <span class="tr-ms-label" id="trMsSessionLabel">All Sessions</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="tr-ms-caret"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="tr-ms-dropdown" id="trMsSessionDropdown"></div>
          </div>

          <!-- Subject -->
          <div class="tr-ms-wrap" id="trMsSubject">
            <button class="tr-ms-trigger" id="trMsSubjectTrigger">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
              </svg>
              <span class="tr-ms-label" id="trMsSubjectLabel">All Subjects</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="tr-ms-caret"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="tr-ms-dropdown" id="trMsSubjectDropdown"></div>
          </div>

          <!-- Batch -->
          <div class="tr-ms-wrap" id="trMsBatch">
            <button class="tr-ms-trigger" id="trMsBatchTrigger">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <span class="tr-ms-label" id="trMsBatchLabel">All Batches</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="tr-ms-caret"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="tr-ms-dropdown" id="trMsBatchDropdown"></div>
          </div>

          <!-- Search -->
          <input id="trSearch" class="tr-search-input" type="text"
                 placeholder="Search student…"/>

          <!-- Active chips + clear -->
          <div id="trActiveChips" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap"></div>
          <button id="trClearAll" class="tr-clear-btn" style="display:none">Clear all</button>
          <span id="trCount" style="font-size:12px;color:var(--t3);white-space:nowrap;margin-left:4px"></span>
        </div>

        <!-- Row 3: Results table area -->
        <div id="trTableArea"></div>

      </div>
    `;
  },

  // ── Toolbar wiring ─────────────────────────────────────────────
  _attachToolbar(container) {
    container.querySelector('#trAddBtn')?.addEventListener('click', () => {
      this._openAddModal(container);
    });
    container.querySelector('#trExportCSV')?.addEventListener('click', () => {
      this._exportCSV(container);
    });
    container.querySelector('#trExportPDF')?.addEventListener('click', () => {
      this._exportPDF(container);
    });
    container.querySelector('#trSearch')?.addEventListener('input', () => {
      this._renderTable(container);
    });
  },

  // ── Filter bar (same multi-select pattern as FinalResultsPanel) ──
  _initFilterBar(container) {
    const campuses    = AppState.get('campuses')    || [];
    const sessions    = this._getSessions();
    const subjects    = AppState.get('subjects')    || [];
    const batches     = AppState.get('batches')     || [];

    // Campus
    this._buildMultiSelect(container, {
      wrapperId:   'trMsCampus',
      triggerId:   'trMsCampusTrigger',
      labelId:     'trMsCampusLabel',
      dropdownId:  'trMsCampusDropdown',
      placeholder: 'All Campuses',
      options:     campuses.map(c => ({
        value: c.id,
        label: (c.campusName || '').replace(/\s*campus$/i, '').trim(),
      })),
      stateKey:    '_filterCampus',
    });

    // Session
    this._buildMultiSelect(container, {
      wrapperId:   'trMsSession',
      triggerId:   'trMsSessionTrigger',
      labelId:     'trMsSessionLabel',
      dropdownId:  'trMsSessionDropdown',
      placeholder: 'All Sessions',
      options:     sessions.map(s => ({ value: s, label: s })),
      stateKey:    '_filterSession',
    });

    // Subject
    this._buildMultiSelect(container, {
      wrapperId:   'trMsSubject',
      triggerId:   'trMsSubjectTrigger',
      labelId:     'trMsSubjectLabel',
      dropdownId:  'trMsSubjectDropdown',
      placeholder: 'All Subjects',
      options:     subjects.map(s => ({
        value: s.id,
        label: `${s.subjectCode || ''} — ${s.subjectName || ''}`.trim().replace(/^—\s*/, ''),
      })),
      stateKey:    '_filterSubject',
    });

    // Batch
    this._buildMultiSelect(container, {
      wrapperId:   'trMsBatch',
      triggerId:   'trMsBatchTrigger',
      labelId:     'trMsBatchLabel',
      dropdownId:  'trMsBatchDropdown',
      placeholder: 'All Batches',
      options:     batches.map(b => ({ value: b.id, label: b.batchName || b.id })),
      stateKey:    '_filterBatch',
    });

    // Close dropdowns on outside click
    document.addEventListener('click', e => {
      container.querySelectorAll('.tr-ms-dropdown.open').forEach(dd => {
        if (!dd.closest('.tr-ms-wrap')?.contains(e.target)) {
          dd.classList.remove('open');
        }
      });
    });
  },

  _buildMultiSelect(container, { wrapperId, triggerId, labelId, dropdownId, placeholder, options, stateKey }) {
    const trigger  = container.querySelector(`#${triggerId}`);
    const dropdown = container.querySelector(`#${dropdownId}`);
    const labelEl  = container.querySelector(`#${labelId}`);

    if (!trigger || !dropdown) return;

    if (!options.length) {
      dropdown.innerHTML = `<div class="tr-ms-empty">No options</div>`;
    } else {
      dropdown.innerHTML = options.map(o => `
        <label class="tr-ms-option">
          <input type="checkbox" value="${o.value}" class="tr-ms-cb" data-state="${stateKey}"/>
          ${o.label}
        </label>
      `).join('');
    }

    // Toggle dropdown
    trigger.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('open');
      container.querySelectorAll('.tr-ms-dropdown.open').forEach(d => d.classList.remove('open'));
      if (!isOpen) dropdown.classList.add('open');
    });

    // Checkbox change
    dropdown.addEventListener('change', e => {
      if (!e.target.classList.contains('tr-ms-cb')) return;
      const vals = [...dropdown.querySelectorAll('.tr-ms-cb:checked')].map(cb => cb.value);
      this[stateKey] = vals;

      // Update label
      if (!vals.length) {
        labelEl.textContent = placeholder;
      } else if (vals.length === 1) {
        const opt = options.find(o => o.value === vals[0]);
        labelEl.textContent = opt?.label || vals[0];
      } else {
        labelEl.textContent = `${vals.length} selected`;
      }

      this._updateActiveChips(container);
      this._renderTable(container);
    });
  },

  _getSessions() {
    const batches = AppState.get('batches') || [];
    const set = new Set();
    batches.forEach(b => {
      if (b.sessionPeriod) set.add(b.sessionPeriod);
      else if (b.sessionId) set.add(b.sessionId);
    });
    return [...set].sort();
  },

  _updateActiveChips(container) {
    const chipsEl   = container.querySelector('#trActiveChips');
    const clearBtn  = container.querySelector('#trClearAll');
    if (!chipsEl) return;

    const chips = [];

    const push = (vals, stateKey, labelFn, color) => {
      vals.forEach(v => chips.push({ v, stateKey, label: labelFn(v), color }));
    };

    const campuses = AppState.get('campuses') || [];
    const sessions = this._getSessions();
    const subjects = AppState.get('subjects') || [];
    const batches  = AppState.get('batches')  || [];

    push(this._filterCampus,  '_filterCampus',  v => {
      const c = campuses.find(x => x.id === v);
      return (c?.campusName || v).replace(/\s*campus$/i,'').trim();
    }, 'var(--blue)');
    push(this._filterSession, '_filterSession', v => v, 'var(--violet)');
    push(this._filterSubject, '_filterSubject', v => {
      const s = subjects.find(x => x.id === v);
      return s ? `${s.subjectCode} — ${s.subjectName}` : v;
    }, 'var(--cyan)');
    push(this._filterBatch,   '_filterBatch',   v => {
      const b = batches.find(x => x.id === v);
      return b?.batchName || v;
    }, 'var(--green)');

    chipsEl.innerHTML = chips.map(ch => `
      <span class="tr-active-chip"
            style="background:color-mix(in srgb,${ch.color} 15%,transparent);
                   color:${ch.color};border-color:${ch.color};opacity:.85"
            data-state="${ch.stateKey}" data-val="${ch.v}">
        ${ch.label}
        <span class="tr-chip-x" data-state="${ch.stateKey}" data-val="${ch.v}">✕</span>
      </span>
    `).join('');

    clearBtn.style.display = chips.length ? '' : 'none';

    chipsEl.querySelectorAll('.tr-chip-x').forEach(x => {
      x.addEventListener('click', () => {
        const sk = x.dataset.state;
        const vl = x.dataset.val;
        this[sk] = this[sk].filter(i => i !== vl);
        // uncheck the corresponding checkbox
        const dd = container.querySelector('.tr-ms-dropdown');
        container.querySelectorAll(`.tr-ms-cb[data-state="${sk}"][value="${vl}"]`)
          .forEach(cb => { cb.checked = false; });
        // Refresh label
        this._refreshMultiSelectLabel(container, sk);
        this._updateActiveChips(container);
        this._renderTable(container);
      });
    });

    clearBtn.addEventListener('click', () => {
      ['_filterCampus','_filterSession','_filterSubject','_filterBatch'].forEach(sk => {
        this[sk] = [];
        container.querySelectorAll(`.tr-ms-cb[data-state="${sk}"]`).forEach(cb => { cb.checked = false; });
        this._refreshMultiSelectLabel(container, sk);
      });
      this._updateActiveChips(container);
      this._renderTable(container);
    }, { once: false });
  },

  _refreshMultiSelectLabel(container, stateKey) {
    const MAP = {
      _filterCampus:  { labelId: 'trMsCampusLabel',  placeholder: 'All Campuses'  },
      _filterSession: { labelId: 'trMsSessionLabel',  placeholder: 'All Sessions'  },
      _filterSubject: { labelId: 'trMsSubjectLabel',  placeholder: 'All Subjects'  },
      _filterBatch:   { labelId: 'trMsBatchLabel',    placeholder: 'All Batches'   },
    };
    const cfg = MAP[stateKey];
    if (!cfg) return;
    const labelEl = container.querySelector(`#${cfg.labelId}`);
    if (!labelEl) return;
    const vals = this[stateKey];
    labelEl.textContent = vals.length ? `${vals.length} selected` : cfg.placeholder;
  },

  // ── Enrich + filter rows (shared by table render & export) ──────
  _getEnrichedRows(container) {
    const search = (container.querySelector('#trSearch')?.value || '').toLowerCase().trim();
    const allScheduleEntries = _buildCalendarEntries({});
    const allCampuses = AppState.get('campuses') || [];

    let rows = _getResults().map(r => {
      const entry   = allScheduleEntries.find(e => e.id === r.scheduleEntryId);
      if (!entry) return null;
      const batch   = AppState.findById('batches',  entry.batchId)   || {};
      const student = AppState.findById('students', r.studentId)     || {};
      // subjectId: prefer entry.subjectId, fallback to r.subjectId (saved at mark-entry time)
      const resolvedSubjectId = entry.subjectId || r.subjectId || '';
      const subject = AppState.findById('subjects', resolvedSubjectId) || {};
      const campus  = allCampuses.find(c => c.id === batch.campusId) || {};

      // totalMarks/passingMarks: prefer result record (user-entered), fallback to entry
      const effectiveTotalMarks   = r.totalMarks   || entry.totalMarks   || null;
      const effectivePassingMarks = r.passingMarks  || entry.passingMarks || (effectiveTotalMarks ? Math.ceil(effectiveTotalMarks * 0.5) : null);
      const passing = effectivePassingMarks;
      const status  = r.absent           ? 'absent'
                    : r.marks == null    ? 'pending'
                    : (passing && r.marks >= passing) ? 'pass'
                    : 'fail';

      // Parse batchName like FinalResultsPanel: FA1-JUNE-26-01
      const parts     = (batch.batchName || '').split('-');
      const batchNo   = parts.length > 1 ? parts[parts.length - 1] : (batch.batchName || '—');
      const session   = batch.sessionPeriod || batch.sessionId || '—';
      const campusName = (campus.campusName || '').replace(/\s*campus$/i, '').trim() || '—';
      const subjectCode = subject.subjectCode || subject.subjectName || resolvedSubjectId || '—';
      const studentName = (student.studentName || `${student.firstName||''} ${student.lastName||''}`.trim() || '—');

      return { ...r, entry, batch, student, subject, campus, passing, status,
               batchNo, session, campusName, subjectCode, studentName,
               totalMarks: effectiveTotalMarks, passingMarks: effectivePassingMarks };
    }).filter(Boolean);

    if (this._filterCampus.length)  rows = rows.filter(r => this._filterCampus.includes(r.batch.campusId));
    if (this._filterSession.length) rows = rows.filter(r =>
      this._filterSession.includes(r.batch.sessionId) ||
      this._filterSession.includes(r.batch.sessionPeriod)
    );
    if (this._filterSubject.length) rows = rows.filter(r => this._filterSubject.includes(r.entry.subjectId));
    if (this._filterBatch.length)   rows = rows.filter(r => this._filterBatch.includes(r.entry.batchId));
    if (search) rows = rows.filter(r =>
      r.studentName.toLowerCase().includes(search) ||
      (r.entry.testName || '').toLowerCase().includes(search) ||
      (r.batch.batchName || '').toLowerCase().includes(search)
    );

    rows.sort((a, b) => a.studentName.localeCompare(b.studentName));
    return rows;
  },

  // ── Main table render ─────────────────────────────────────────
  _renderTable(container) {
    const area = container.querySelector('#trTableArea');
    if (!area) return;

    const rows = this._getEnrichedRows(container);

    const countEl = container.querySelector('#trCount');
    if (countEl) countEl.textContent = `${rows.length} record${rows.length !== 1 ? 's' : ''}`;

    if (!rows.length) {
      area.innerHTML = `
        <div class="tr-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.3" style="color:var(--t4);margin-bottom:12px">
            <path d="M9 11l3 3L22 4"/>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
          <div style="font-size:14px;font-weight:600;color:var(--t2)">No test results yet</div>
          <div style="font-size:12.5px;color:var(--t3);margin-top:4px">
            Click "Add Test Result" to enter marks for a batch
          </div>
        </div>`;
      return;
    }

    // ── Stats (same as FinalResultsPanel) ──────────────────────
    const totalCount   = rows.length;
    const passCount    = rows.filter(r => r.status === 'pass').length;
    const failCount    = rows.filter(r => r.status === 'fail').length;
    const absentCount  = rows.filter(r => r.status === 'absent').length;
    const pendingCount = rows.filter(r => r.status === 'pending').length;
    const appearedCount = passCount + failCount;
    const passRate      = appearedCount > 0 ? Math.round((passCount / appearedCount) * 100) : 0;
    const appearedPct   = totalCount    > 0 ? Math.round((appearedCount / totalCount) * 100) : 0;

    const passBarColor     = passRate    >= 80 ? 'var(--green)' : passRate    >= 60 ? 'var(--yellow)' : 'var(--red)';
    const appearedBarColor = appearedPct >= 80 ? 'var(--green)' : appearedPct >= 60 ? 'var(--yellow)' : 'var(--red)';

    const statsStrip = `
      <div class="fr-stats-strip">
        <div style="display:flex;align-items:center;gap:0">
          <div class="fr-stat-box">
            <div class="fr-stat-num">${totalCount}</div>
            <div class="fr-stat-lbl">Total</div>
          </div>
          <div class="fr-stat-divider"></div>
          <div class="fr-stat-box fr-stat-pass">
            <div class="fr-stat-num">${passCount}</div>
            <div class="fr-stat-lbl">Pass</div>
          </div>
          <div class="fr-stat-box fr-stat-fail">
            <div class="fr-stat-num">${failCount}</div>
            <div class="fr-stat-lbl">Fail</div>
          </div>
          <div class="fr-stat-box fr-stat-absent">
            <div class="fr-stat-num">${absentCount}</div>
            <div class="fr-stat-lbl">Absent</div>
          </div>
          <div class="fr-stat-box fr-stat-pending">
            <div class="fr-stat-num">${pendingCount}</div>
            <div class="fr-stat-lbl">Pending</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:0;margin-left:auto">
          <div class="fr-stat-divider"></div>
          <div class="fr-stat-rate-block">
            <div class="fr-stat-rate-title">Pass Rate</div>
            <div class="fr-stat-rate-bar-wrap">
              <div class="fr-stat-rate-bar" style="width:${passRate}%;background:${passBarColor}"></div>
            </div>
            <div class="fr-stat-rate-footer">
              <span class="fr-stat-rate-pct" style="color:${passBarColor}">${passRate}%</span>
              <span class="fr-stat-rate-sub">pass / appeared (${passCount}/${appearedCount})</span>
            </div>
          </div>
          <div class="fr-stat-divider"></div>
          <div class="fr-stat-rate-block">
            <div class="fr-stat-rate-title">Appeared</div>
            <div class="fr-stat-rate-bar-wrap">
              <div class="fr-stat-rate-bar" style="width:${appearedPct}%;background:${appearedBarColor}"></div>
            </div>
            <div class="fr-stat-rate-footer">
              <span class="fr-stat-rate-pct" style="color:${appearedBarColor}">${appearedPct}%</span>
              <span class="fr-stat-rate-sub">appeared / total (${appearedCount}/${totalCount})</span>
            </div>
          </div>
        </div>
      </div>`;

    area.innerHTML = statsStrip + `
      <div style="overflow-x:auto;border:1px solid var(--border);border-top:none;
                  border-radius:0 0 12px 12px;overflow:hidden">
        <table class="fr-table" style="table-layout:fixed;width:100%">
          <colgroup>
            <col style="width:38px"/>   <!-- # -->
            <col style="width:auto"/>   <!-- Student -->
            <col style="width:80px"/>   <!-- Campus -->
            <col style="width:85px"/>   <!-- Session -->
            <col style="width:75px"/>   <!-- Subject -->
            <col style="width:60px"/>   <!-- Batch -->
            <col style="width:120px"/>  <!-- Test -->
            <col style="width:105px"/>  <!-- Exam Date -->
            <col style="width:110px"/>  <!-- Marks -->
            <col style="width:80px"/>   <!-- Status -->
            <col style="width:65px"/>   <!-- Actions -->
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              <th>Student</th>
              <th>Campus</th>
              <th>Session</th>
              <th>Subject</th>
              <th>Batch</th>
              <th>Test</th>
              <th>Exam Date</th>
              <th>Marks</th>
              <th>Status</th>
              <th style="text-align:right;padding-right:14px">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, i) => this._rowHTML(r, i)).join('')}
          </tbody>
        </table>
      </div>`;

    // Wire delete buttons
    area.querySelectorAll('[data-action="delete-tr"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        let all  = _getResults();
        all = all.filter(r => r.id !== id);
        AppState.set(TR_KEY, all);
        Toast.success('Result deleted.');
        this._renderTable(container);
      });
    });
  },

  _rowHTML(r, i) {
    const typeMeta    = TEST_TYPE_META[r.entry.testType] || {};
    const isRetest    = r.isRetest || r.entry?.isRetest || false;
    const retestOf    = r.retestOf || r.entry?.retestOf || null;
    const retestIndex = r.retestIndex || r.entry?.retestIndex || null;

    // Find parent test name for retest label
    let parentTestName = '';
    if (isRetest && retestOf) {
      const allEntries = _buildCalendarEntries({});
      const parent = allEntries.find(e => e.id === retestOf);
      parentTestName = parent?.testName || '';
    }

    const retestBadge = isRetest
      ? `<span style="display:inline-block;padding:1px 6px;border-radius:5px;font-size:9.5px;font-weight:700;
           background:var(--violet-dim,#ede9fe);color:var(--violet,#7c3aed);margin-left:4px">
           Retest${retestIndex > 1 ? ' #'+retestIndex : ''}</span>`
      : '';

    const testChip    = `<div style="display:flex;flex-direction:column;gap:2px">
      <div>
        <span style="display:inline-block;padding:2px 7px;border-radius:6px;
          font-size:10.5px;font-weight:700;background:${typeMeta.bg||'var(--surface3)'};
          color:${typeMeta.color||'var(--t2)'};">${r.entry.testName || '—'}</span>${retestBadge}
      </div>
      ${isRetest && parentTestName ? `<div style="font-size:10px;color:var(--t4);padding-left:2px">↳ Retest of ${parentTestName}</div>` : ''}
    </div>`;

    const _tm = r.totalMarks || r.entry.totalMarks || null;
    const _tmSuffix = _tm ? ` <span style="color:var(--t3);font-size:11px">/ ${_tm}</span>` : '';
    const marksDisplay = r.absent
      ? `<span style="color:var(--yellow);font-weight:700">Absent</span>${_tmSuffix}`
      : r.marks != null
        ? `<span style="font-weight:700;font-family:var(--font-mono)">${r.marks}</span>${_tmSuffix}`
        : `<span style="color:var(--t4)">—</span>${_tmSuffix}`;

    const statusBadge = r.status === 'pass'    ? `<span class="tr-badge tr-badge-pass">Pass</span>`
                      : r.status === 'fail'    ? `<span class="tr-badge tr-badge-fail">Fail</span>`
                      : r.status === 'absent'  ? `<span class="tr-badge tr-badge-absent">Absent</span>`
                      : `<span class="tr-badge tr-badge-blank">Pending</span>`;

    return `
      <tr class="tr-row">
        <td style="color:var(--t3);font-size:11.5px">${i + 1}</td>
        <td style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
            title="${r.studentName}">${r.studentName}</td>
        <td style="font-size:12px;color:var(--t3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.campusName}</td>
        <td style="font-size:12px;color:var(--t3);white-space:nowrap">${r.session}</td>
        <td style="white-space:nowrap">
          <span style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--blue)">${r.subjectCode}</span>
        </td>
        <td style="font-size:12.5px;font-weight:600;color:var(--t2);white-space:nowrap">${r.batchNo}</td>
        <td>${testChip}</td>
        <td style="font-size:12px;color:var(--t2);white-space:nowrap">${r.entry.date ? formatDate(r.entry.date) : '—'}</td>
        <td style="white-space:nowrap">${marksDisplay}</td>
        <td>${statusBadge}</td>
        <td>
          <div style="display:flex;gap:4px;align-items:center;justify-content:flex-end">
            <button class="fr-act-btn fr-del-btn"
                    data-action="delete-tr"
                    data-id="${r.id}"
                    title="Delete">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
              </svg>
            </button>
          </div>
        </td>
      </tr>`;
  },

  // ══════════════════════════════════════════════════════════════
  //  ADD RESULT MODAL  — styled like FinalResultsPanel._openAddForm
  // ══════════════════════════════════════════════════════════════

  _openAddModal(container) {
    const campuses   = AppState.get('campuses') || [];
    const campusOpts = campuses.map(c =>
      `<option value="${c.id}">${(c.campusName||'').replace(/\s*campus$/i,'').trim()}</option>`
    ).join('');

    // local cascade state (mirrors FinalResultsPanel.modalSel)
    const sel = { campusId:'', disciplineId:'', levelId:'', sessionId:'', subjectId:'', batchId:'' };

    Modal.open({
      title:  'Add Test Results',
      size:   'lg',
      body: `
        <div id="trModalInner" style="max-height:calc(100vh - 160px);overflow-y:auto;overflow-x:hidden;padding-right:4px">

          <!-- ── Step 1: Criteria grid (same layout as FinalResultsPanel) ── -->
          <div class="fr-form-section" style="margin-top:0">Select Batch &amp; Test</div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
            <div>
              <label style="font-size:11.5px;color:var(--t3);display:block;margin-bottom:4px">Campus</label>
              <select id="trModalCampus" class="fr-filter-sel" style="width:100%">
                <option value="">Select Campus…</option>${campusOpts}
              </select>
            </div>
            <div>
              <label style="font-size:11.5px;color:var(--t3);display:block;margin-bottom:4px">Discipline</label>
              <select id="trModalDiscipline" class="fr-filter-sel" style="width:100%" disabled>
                <option value="">Select Discipline…</option>
              </select>
            </div>
            <div>
              <label style="font-size:11.5px;color:var(--t3);display:block;margin-bottom:4px">Level</label>
              <select id="trModalLevel" class="fr-filter-sel" style="width:100%" disabled>
                <option value="">Select Level…</option>
              </select>
            </div>
            <div>
              <label style="font-size:11.5px;color:var(--t3);display:block;margin-bottom:4px">Session</label>
              <select id="trModalSession" class="fr-filter-sel" style="width:100%" disabled>
                <option value="">Select Session…</option>
              </select>
            </div>
            <div>
              <label style="font-size:11.5px;color:var(--t3);display:block;margin-bottom:4px">Subject</label>
              <select id="trModalSubject" class="fr-filter-sel" style="width:100%" disabled>
                <option value="">Select Subject…</option>
              </select>
            </div>
            <div>
              <label style="font-size:11.5px;color:var(--t3);display:block;margin-bottom:4px">Batch</label>
              <select id="trModalBatch" class="fr-filter-sel" style="width:100%" disabled>
                <option value="">Select Batch…</option>
              </select>
            </div>
          </div>

          <!-- ── Step 2: Select Test — styled as dropdown trigger ── -->
          <div id="trModalTestGroup" style="display:none;margin-bottom:12px">
            <label style="font-size:11.5px;color:var(--t3);display:flex;align-items:center;gap:6px;margin-bottom:6px;font-weight:600">
              Select Test
              <span id="trTestBadge" style="font-size:10px;background:var(--blue-dim);color:var(--blue);
                padding:2px 7px;border-radius:8px;font-weight:700;display:none">0 tests found</span>
            </label>

            <!-- Dropdown trigger button -->
            <div style="position:relative;display:inline-block;width:100%">
              <button id="trTestTrigger" type="button"
                style="width:100%;height:34px;padding:0 12px;
                  display:flex;align-items:center;justify-content:space-between;gap:8px;
                  background:var(--surface2);border:1px solid var(--border2);border-radius:8px;
                  color:var(--t2);font-size:12.5px;font-family:var(--font-body);font-weight:500;
                  cursor:pointer;transition:all .12s;text-align:left">
                <span id="trTestTriggerLabel" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">
                  Select a test…
                </span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                  style="flex-shrink:0;color:var(--t4)"><polyline points="6 9 12 15 18 9"/></svg>
              </button>

              <!-- Dropdown panel — hierarchical with retests nested -->
              <div id="trTestDropdown"
                style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;
                  background:var(--surface);border:1px solid var(--border2);border-radius:10px;
                  box-shadow:0 8px 24px rgba(0,0,0,.14);z-index:999;padding:4px;
                  max-height:260px;overflow-y:auto">
                <div id="trTestCheckboxList" style="display:flex;flex-direction:column;gap:1px"></div>
              </div>
            </div>

            <div id="trTestHint" style="font-size:11.5px;color:var(--t3);margin-top:6px;display:none"></div>

            <!-- ── Retest toggle ── -->
            <div id="trRetestRow" style="display:none;margin-top:10px;padding:10px 12px;
              background:var(--surface2);border:1px solid var(--border);border-radius:10px">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:600;color:var(--t1);user-select:none">
                <input type="checkbox" id="trIsRetest"
                  style="accent-color:var(--blue);width:15px;height:15px;cursor:pointer;flex-shrink:0"/>
                This is a Retest
                <span style="font-size:10.5px;font-weight:500;color:var(--t3);margin-left:2px">(only students with existing marks will be shown)</span>
              </label>
              <!-- Retest date — shown when checkbox checked -->
              <div id="trRetestDateRow" style="display:none;margin-top:8px;display:none;align-items:center;gap:8px">
                <label style="font-size:12px;color:var(--t3);font-weight:600;white-space:nowrap">Retest Date <span style="color:var(--red)">*</span></label>
                <input type="date" id="trRetestDate"
                  style="height:32px;padding:0 10px;background:var(--surface);border:1px solid var(--border2);
                    border-radius:8px;color:var(--t1);font-size:12.5px;font-family:var(--font-body);outline:none;"/>
                <span id="trRetestDateErr" style="font-size:10.5px;color:var(--red);display:none">Required</span>
              </div>
            </div>
          </div>

          <!-- ── Step 3: Marks settings (same as FinalResultsPanel fr-marks-header) ── -->
          <div id="trModalMarksSettings" style="display:none;margin-bottom:12px">
            <div class="fr-marks-header" style="margin-bottom:6px">
              <div>
                <label style="color:var(--t3);font-size:11.5px;margin-right:4px;font-weight:600">
                  Total Marks <span style="color:var(--red)">*</span>
                </label>
                <input id="trModalTotalMarks" class="fr-marks-input" type="number" min="1"
                  placeholder="e.g. 100" style="width:88px"/>
                <span id="trTotalMarksErr" style="font-size:10.5px;color:var(--red);margin-left:6px;display:none">Required</span>
              </div>
              <div>
                <label style="color:var(--t3);font-size:11.5px;margin-right:4px;font-weight:600">Passing (50%)</label>
                <span id="trModalPassingDisplay" style="font-weight:700;color:var(--t1)">—</span>
                <span class="fr-auto-badge" style="margin-left:6px">Auto</span>
              </div>
              <div style="margin-left:auto;font-size:11.5px;color:var(--t3)" id="trModalMetaLabel"></div>
            </div>
            <p style="font-size:11px;color:var(--t4);margin-top:4px">
              Fill in Total Marks above — marks grid will appear below.
            </p>
          </div>

          <!-- ── Step 4: Marks entry grid (student table) ── -->
          <div id="trMarksGrid" style="display:none;margin-top:16px"></div>

        </div>
      `,
      actions: [
        { label: 'Cancel', variant: 'ghost', close: true },
        {
          label:    'Save All Marks',
          variant:  'primary',
          close:    false,
          disabled: true,
          id:       'trSaveBtn',
          handler:  (modalEl) => this._handleSaveMarks(modalEl, container, sel),
        },
      ],
      onOpen: (modalEl) => {
        this._wireModalDropdowns(modalEl, sel, container);
      },
    });
  },

  // ── Wire cascading dropdowns inside modal ──────────────────────
  _wireModalDropdowns(modalEl, sel, container) {
    const panel = this; // capture for use inside closures
    const campusSel      = modalEl.querySelector('#trModalCampus');
    const disciplineSel  = modalEl.querySelector('#trModalDiscipline');
    const levelSel       = modalEl.querySelector('#trModalLevel');
    const sessionSel     = modalEl.querySelector('#trModalSession');
    const subjectSel     = modalEl.querySelector('#trModalSubject');
    const batchSel       = modalEl.querySelector('#trModalBatch');
    const testGroup      = modalEl.querySelector('#trModalTestGroup');
    const testBadge      = modalEl.querySelector('#trTestBadge');
    const testHint       = modalEl.querySelector('#trTestHint');
    const testCheckList  = modalEl.querySelector('#trTestCheckboxList');
    const testTrigger    = modalEl.querySelector('#trTestTrigger');
    const testTriggerLbl = modalEl.querySelector('#trTestTriggerLabel');
    const testDropdown   = modalEl.querySelector('#trTestDropdown');
    const marksGrid      = modalEl.querySelector('#trMarksGrid');
    const marksSettings  = modalEl.querySelector('#trModalMarksSettings');
    const totalMarksInp  = modalEl.querySelector('#trModalTotalMarks');
    const passingDisplay = modalEl.querySelector('#trModalPassingDisplay');
    const totalMarksErr  = modalEl.querySelector('#trTotalMarksErr');
    const metaLabel      = modalEl.querySelector('#trModalMetaLabel');
    const saveBtn        = [...modalEl.querySelectorAll('button')]
                            .find(b => b.textContent.trim() === 'Save All Marks');

    let _batchEntries  = [];
    let _selectedEntry = null; // the one chosen test entry
    let _isRetest      = false;
    let _retestDate    = '';

    // Retest UI elements
    const retestRow     = modalEl.querySelector('#trRetestRow');
    const retestCb      = modalEl.querySelector('#trIsRetest');
    const retestDateRow = modalEl.querySelector('#trRetestDateRow');
    const retestDateInp = modalEl.querySelector('#trRetestDate');
    const retestDateErr = modalEl.querySelector('#trRetestDateErr');

    // Wire retest checkbox
    retestCb?.addEventListener('change', () => {
      _isRetest = retestCb.checked;
      retestDateRow.style.display = _isRetest ? 'flex' : 'none';
      if (!_isRetest) { _retestDate = ''; retestDateInp.value = ''; }
      // Reset grid when toggling
      marksGrid.style.display = 'none';
      if (saveBtn) saveBtn.disabled = true;
      if (_isRetest && totalMarksInp?.value?.trim()) refreshGrid();
    });

    // Wire retest date input
    retestDateInp?.addEventListener('change', () => {
      _retestDate = retestDateInp.value;
      retestDateErr.style.display = 'none';
      retestDateInp.style.borderColor = '';
      if (_selectedEntry && totalMarksInp?.value?.trim()) refreshGrid();
    });

    // ── helpers ──────────────────────────────────────────────────

    const resetSel = (el, placeholder) => {
      el.innerHTML = `<option value="">${placeholder}</option>`;
      el.disabled  = true;
    };

    const resetFrom = (from) => {
      if (from <= 1) { resetSel(disciplineSel, 'Select Discipline…'); sel.disciplineId = ''; }
      if (from <= 2) { resetSel(levelSel,      'Select Level…');      sel.levelId      = ''; }
      if (from <= 3) { resetSel(sessionSel,    'Select Session…');    sel.sessionId    = ''; }
      if (from <= 4) { resetSel(subjectSel,    'Select Subject…');    sel.subjectId    = ''; }
      if (from <= 5) { resetSel(batchSel,      'Select Batch…');      sel.batchId      = ''; }
      testGroup.style.display     = 'none';
      marksSettings.style.display = 'none';
      marksGrid.style.display     = 'none';
      testDropdown.style.display  = 'none';
      testTriggerLbl.textContent  = 'Select a test…';
      testTrigger.style.borderColor = '';
      _batchEntries  = [];
      _selectedEntry = null;
      _isRetest      = false;
      _retestDate    = '';
      if (retestCb)      { retestCb.checked = false; }
      if (retestRow)     { retestRow.style.display = 'none'; }
      if (retestDateRow) { retestDateRow.style.display = 'none'; }
      if (retestDateInp) { retestDateInp.value = ''; }
      if (saveBtn) saveBtn.disabled = true;
    };

    // ── Test dropdown open/close ──────────────────────────────────

    const closeTestDropdown = () => {
      testDropdown.style.display = 'none';
      testTrigger.style.borderColor = _selectedEntry ? 'var(--blue)' : '';
    };

    testTrigger?.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = testDropdown.style.display !== 'none';
      testDropdown.style.display = isOpen ? 'none' : 'block';
      testTrigger.style.borderColor = 'var(--blue)';
    });

    document.addEventListener('click', closeTestDropdown);

    // ── populate helpers (same pattern as FinalResultsPanel) ─────

    const populateDisciplines = () => {
      const disciplines = (AppState.get('disciplines') || [])
        .filter(d => !sel.campusId || (Array.isArray(d.campusIds) && d.campusIds.includes(sel.campusId)));
      disciplineSel.innerHTML =
        '<option value="">Select Discipline…</option>' +
        disciplines.map(d =>
          `<option value="${d.id}">${d.abbreviation ? d.abbreviation + ' — ' : ''}${d.fullName || d.disciplineName || d.name || d.id}</option>`
        ).join('');
      disciplineSel.disabled = !disciplines.length;
    };

    const populateLevels = () => {
      const levels = (AppState.get('levels') || [])
        .filter(l => !sel.disciplineId || l.disciplineId === sel.disciplineId);
      levelSel.innerHTML =
        '<option value="">Select Level…</option>' +
        levels.map(l => `<option value="${l.id}">${l.levelName || l.name || l.id}</option>`).join('');
      levelSel.disabled = !levels.length;
    };

    const populateSessions = () => {
      const batches = (AppState.get('batches') || []).filter(b => {
        if (sel.campusId     && b.campusId     !== sel.campusId)     return false;
        if (sel.disciplineId && b.disciplineId !== sel.disciplineId) return false;
        if (sel.levelId      && b.levelId      !== sel.levelId)      return false;
        return true;
      });
      const sessions = [...new Set(batches.map(b => b.sessionPeriod || b.sessionId).filter(Boolean))].sort();
      sessionSel.innerHTML =
        '<option value="">Select Session…</option>' +
        sessions.map(s => `<option value="${s}">${s}</option>`).join('');
      sessionSel.disabled = !sessions.length;
    };

    const populateSubjects = () => {
      const subjects = (AppState.get('subjects') || [])
        .filter(s => !sel.levelId || s.levelId === sel.levelId);
      subjectSel.innerHTML =
        '<option value="">Select Subject…</option>' +
        subjects.map(s =>
          `<option value="${s.id}">${s.subjectCode ? s.subjectCode + ' — ' : ''}${s.subjectName || s.id}</option>`
        ).join('');
      subjectSel.disabled = !subjects.length;
    };

    const populateBatches = () => {
      const enrolments = AppState.get('enrolments') || [];
      let batches = (AppState.get('batches') || []).filter(b => {
        if (sel.campusId     && b.campusId     !== sel.campusId)     return false;
        if (sel.disciplineId && b.disciplineId !== sel.disciplineId) return false;
        if (sel.levelId      && b.levelId      !== sel.levelId)      return false;
        if (sel.sessionId    && b.sessionPeriod !== sel.sessionId && b.sessionId !== sel.sessionId) return false;
        return true;
      }).filter(b => enrolments.some(e => e.batchId === b.id));

      if (sel.subjectId) {
        const batchIdsWithSubject = new Set(_buildCalendarEntries({ subjectId: sel.subjectId }).map(e => e.batchId));
        batches = batches.filter(b => batchIdsWithSubject.has(b.id));
      }

      batchSel.innerHTML =
        '<option value="">Select Batch…</option>' +
        batches.map(b => `<option value="${b.id}">${b.batchName || b.id}</option>`).join('');
      batchSel.disabled = !batches.length;
    };

    // ── Refresh student marks grid (inline build) ───────────────────

    const refreshGrid = () => {
      const tm = parseFloat(totalMarksInp?.value);
      if (!sel.batchId || !_selectedEntry || !tm) {
        marksGrid.style.display = 'none';
        if (saveBtn) saveBtn.disabled = true;
        return;
      }
      // If retest mode, require retest date
      if (_isRetest && !_retestDate) {
        marksGrid.style.display = 'none';
        if (saveBtn) saveBtn.disabled = true;
        return;
      }
      totalMarksErr.style.display = 'none';
      totalMarksInp.style.borderColor = '';

      const pm = Math.ceil(tm * 0.5);
      if (passingDisplay) passingDisplay.textContent = pm;

      const entry = { ..._selectedEntry, totalMarks: tm, passingMarks: pm };

      // ── Get enrolled students for this batch ──────────────────────
      const enrolments  = AppState.get('enrolments') || [];
      const allStudents = AppState.get('students')   || [];
      const enrolledIds = new Set();
      enrolments.forEach(e => {
        if (e.batchId === sel.batchId) enrolledIds.add(e.studentId);
      });
      let students = allStudents
        .filter(s => enrolledIds.has(s.id) || s.batchId === sel.batchId)
        .sort((a, b) => {
          const na = (a.studentName || `${a.firstName||''} ${a.lastName||''}`).toLowerCase();
          const nb = (b.studentName || `${b.firstName||''} ${b.lastName||''}`).toLowerCase();
          return na.localeCompare(nb);
        });

      // In retest mode: only show students who have marks on the PARENT test
      // Students with no marks on parent = excluded (not absent, just not shown)
      let parentEntryId = null;
      let studentsWithParentMarks = new Set();
      if (_isRetest) {
        // The selected entry is the original test; retestOf is that entry's id
        parentEntryId = entry.id;
        const allSavedForParent = AppState.get('testResults') || [];
        allSavedForParent.forEach(r => {
          if (r.scheduleEntryId === parentEntryId && r.marks != null && !r.absent) {
            studentsWithParentMarks.add(r.studentId);
          }
        });
        students = students.filter(s => studentsWithParentMarks.has(s.id));
      }

      if (!students.length) {
        marksGrid.style.display = '';
        marksGrid.innerHTML = `<div style="padding:12px;text-align:center;color:var(--t3);
          font-size:12.5px;border:1px dashed var(--border2);border-radius:10px">
          ${_isRetest
            ? 'No students found with marks in the original test. Enter original marks first.'
            : 'No students found in this batch.'}</div>`;
        return;
      }

      // Determine the effective entry id for retest saves
      // For retests, we generate a virtual id based on parentEntryId + retestIndex
      let effectiveEntryId = entry.id;
      if (_isRetest) {
        // Count existing retests for this parent
        const allSaved = AppState.get('testResults') || [];
        const existingRetestIndices = new Set(
          allSaved.filter(r => r.isRetest && r.retestOf === entry.id).map(r => r.retestIndex)
        );
        // Check if we already have a retest entry for same date (editing existing retest)
        const matchingRetest = allSaved.find(r =>
          r.isRetest && r.retestOf === entry.id && r.retestDate === _retestDate
        );
        if (matchingRetest) {
          // Re-use existing retest virtual id
          effectiveEntryId = matchingRetest.scheduleEntryId;
        } else {
          // New retest: next index
          const nextIndex = existingRetestIndices.size > 0 ? Math.max(...existingRetestIndices) + 1 : 1;
          effectiveEntryId = `retest__${entry.id}__${nextIndex}`;
        }
        entry._retestIndex = parseInt(effectiveEntryId.split('__')[2]) || 1;
      }

      // ── Helper: pass/fail badge ───────────────────────────────────
      const passBadge = (marks, absent) => {
        if (absent) return `<span style="font-size:10px;font-weight:700;color:var(--yellow)">Absent</span>`;
        if (marks === '' || marks == null) return `<span style="font-size:10px;color:var(--t4)">—</span>`;
        return parseFloat(marks) >= pm
          ? `<span style="font-size:10px;font-weight:700;color:var(--green)">Pass</span>`
          : `<span style="font-size:10px;font-weight:700;color:var(--red)">Fail</span>`;
      };

      // ── Get saved marks for this entry ────────────────────────────
      const allSaved = AppState.get('testResults') || [];
      const getSaved = (studentId) =>
        allSaved.find(r => r.scheduleEntryId === effectiveEntryId && r.studentId === studentId) || null;

      // ── Build tbody rows ──────────────────────────────────────────
      const tbodyRows = students.map((stu, idx) => {
        const saved    = getSaved(stu.id);
        const val      = saved?.absent ? '' : (saved?.marks ?? '');
        const isAbsent = saved?.absent || false;
        const stuName  = stu.studentName || `${stu.firstName||''} ${stu.lastName||''}`.trim() || stu.id;
        const rollNo   = stu.rollNo || '—';
        return `
          <tr data-row="${idx}">
            <td style="font-size:11.5px;color:var(--t3)">${idx + 1}</td>
            <td style="font-weight:600;font-size:13px">${stuName}</td>
            <td style="font-size:12px;color:var(--t3)">${rollNo}</td>
            <td style="text-align:center">
              <div style="display:flex;flex-direction:column;align-items:center;gap:3px">
                <input type="number"
                  class="fr-marks-input tr-mark-cell"
                  data-row="${idx}"
                  data-entry-id="${effectiveEntryId}"
                  data-student-id="${stu.id}"
                  data-total="${tm}"
                  data-passing="${pm}"
                  data-is-retest="${_isRetest ? '1' : '0'}"
                  data-retest-of="${_isRetest ? entry.id : ''}"
                  data-retest-date="${_isRetest ? _retestDate : ''}"
                  data-retest-index="${_isRetest ? (entry._retestIndex || 1) : ''}"
                  min="0" max="${tm}"
                  value="${val}"
                  placeholder="—"
                  style="width:80px;text-align:center;${isAbsent ? 'opacity:.4;cursor:not-allowed;' : ''}"
                  ${isAbsent ? 'disabled' : ''}/>
                <div class="tr-pf-badge" style="min-height:16px">${passBadge(val, isAbsent)}</div>
              </div>
            </td>
            <td style="text-align:center">
              <label style="display:flex;align-items:center;gap:4px;font-size:11.5px;color:var(--t3);cursor:pointer;justify-content:center">
                <input type="checkbox"
                  class="tr-absent-cb"
                  data-entry-id="${effectiveEntryId}"
                  data-student-id="${stu.id}"
                  data-row="${idx}"
                  ${isAbsent ? 'checked' : ''}
                  style="accent-color:var(--yellow);width:13px;height:13px;cursor:pointer"/>
                Absent
              </label>
            </td>
          </tr>`;
      }).join('');

      const batch   = AppState.findById('batches', sel.batchId) || {};
      const subject = sel.subjectId ? AppState.findById('subjects', sel.subjectId) : null;

      const retestBadge = _isRetest
        ? `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;
            background:var(--violet-dim,#ede9fe);color:var(--violet,#7c3aed)">
            Retest #${entry._retestIndex || 1} &nbsp;·&nbsp; ${_retestDate}</span>`
        : '';

      marksGrid.style.display = '';
      marksGrid.innerHTML = `
        <div style="border:1px solid var(--border);border-radius:12px;overflow:hidden">
          <div style="padding:10px 14px;background:var(--surface2);border-bottom:1px solid var(--border);
            display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" style="color:var(--blue)">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
            <span style="font-size:12.5px;font-weight:700;color:var(--t1)">
              ${_isRetest ? `Retest of ${entry.testName}` : entry.testName} — ${students.length} student${students.length !== 1 ? 's' : ''}
            </span>
            ${retestBadge}
            <span style="font-size:11px;color:var(--t3)">
              Total: ${tm} &nbsp;|&nbsp; Pass: ${pm}
            </span>
            <span style="font-size:11px;color:var(--t3);margin-left:auto">
              ${batch.batchName || ''}${subject ? ' · ' + (subject.subjectCode || subject.subjectName) : ''}
            </span>
          </div>
          <div style="overflow-x:auto;max-height:360px;overflow-y:auto">
            <table class="fr-table">
              <thead>
                <tr>
                  <th style="width:36px">#</th>
                  <th>Student</th>
                  <th style="width:90px">Roll No</th>
                  <th style="width:120px;text-align:center">Marks / ${tm}</th>
                  <th style="width:90px;text-align:center">Absent</th>
                </tr>
              </thead>
              <tbody>${tbodyRows}</tbody>
            </table>
          </div>
        </div>`;

      // ── Live pass/fail badge on input ─────────────────────────────
      marksGrid.querySelectorAll('.tr-mark-cell').forEach(input => {
        input.addEventListener('input', () => {
          const badge = input.closest('td')?.querySelector('.tr-pf-badge');
          if (!badge) return;
          const v = input.value;
          badge.innerHTML = v === ''
            ? '<span style="font-size:10px;color:var(--t4)">—</span>'
            : parseFloat(v) >= pm
              ? '<span style="font-size:10px;font-weight:700;color:var(--green)">Pass</span>'
              : '<span style="font-size:10px;font-weight:700;color:var(--red)">Fail</span>';
        });
      });

      // ── Absent checkbox toggle ────────────────────────────────────
      marksGrid.querySelectorAll('.tr-absent-cb').forEach(cb => {
        cb.addEventListener('change', () => {
          const row    = cb.closest('tr');
          const inp    = row?.querySelector('.tr-mark-cell');
          const badge  = row?.querySelector('.tr-pf-badge');
          if (inp) {
            inp.disabled = cb.checked;
            inp.style.opacity = cb.checked ? '.4' : '1';
            if (cb.checked) inp.value = '';
          }
          if (badge) badge.innerHTML = cb.checked
            ? '<span style="font-size:10px;font-weight:700;color:var(--yellow)">Absent</span>'
            : '<span style="font-size:10px;color:var(--t4)">—</span>';
        });
      });

      // ── Arrow key / Enter navigation ──────────────────────────────
      const cells = [...marksGrid.querySelectorAll('.tr-mark-cell')];
      cells.forEach((inp, i) => {
        inp.addEventListener('keydown', e => {
          let target = null;
          if (e.key === 'ArrowDown' || e.key === 'Enter') target = cells[i + 1];
          else if (e.key === 'ArrowUp') target = cells[i - 1];
          else return;
          if (target) { e.preventDefault(); target.focus(); target.select(); }
        });
      });

      if (saveBtn) saveBtn.disabled = false;
    };

    // ── Total marks input → live passing + grid ───────────────────

    totalMarksInp?.addEventListener('input', () => {
      const v = parseFloat(totalMarksInp.value);
      if (passingDisplay) passingDisplay.textContent = v ? Math.ceil(v * 0.5) : '—';
      if (_selectedEntry) refreshGrid();
    });

    // ── Cascade: Campus ──────────────────────────────────────────

    campusSel.addEventListener('change', () => {
      sel.campusId = campusSel.value;
      resetFrom(1);
      if (!sel.campusId) return;
      populateDisciplines();
    });

    // ── Cascade: Discipline ──────────────────────────────────────

    disciplineSel.addEventListener('change', () => {
      sel.disciplineId = disciplineSel.value;
      resetFrom(2);
      if (!sel.disciplineId) return;
      populateLevels();
    });

    // ── Cascade: Level ───────────────────────────────────────────

    levelSel.addEventListener('change', () => {
      sel.levelId = levelSel.value;
      resetFrom(3);
      if (!sel.levelId) return;
      populateSessions();
      populateSubjects();
    });

    // ── Cascade: Session ─────────────────────────────────────────

    sessionSel.addEventListener('change', () => {
      sel.sessionId = sessionSel.value;
      sel.batchId   = '';
      resetSel(batchSel, 'Select Batch…');
      testGroup.style.display     = 'none';
      marksSettings.style.display = 'none';
      marksGrid.style.display     = 'none';
      _batchEntries = []; _selectedEntry = null;
      if (saveBtn) saveBtn.disabled = true;
      if (!sel.sessionId) return;
      populateBatches();
    });

    // ── Cascade: Subject ─────────────────────────────────────────

    subjectSel.addEventListener('change', () => {
      sel.subjectId = subjectSel.value;
      sel.batchId   = '';
      resetSel(batchSel, 'Select Batch…');
      testGroup.style.display     = 'none';
      marksSettings.style.display = 'none';
      marksGrid.style.display     = 'none';
      _batchEntries = []; _selectedEntry = null;
      if (saveBtn) saveBtn.disabled = true;
      if (!sel.sessionId) return;
      populateBatches();
    });

    // ── Cascade: Batch → populate test dropdown ───────────────────

    batchSel.addEventListener('change', () => {
      sel.batchId = batchSel.value;
      testGroup.style.display     = 'none';
      marksSettings.style.display = 'none';
      marksGrid.style.display     = 'none';
      testCheckList.innerHTML     = '';
      testTriggerLbl.textContent  = 'Select a test…';
      testTrigger.style.borderColor = '';
      _batchEntries  = [];
      _selectedEntry = null;
      _isRetest      = false;
      _retestDate    = '';
      if (retestCb)      { retestCb.checked = false; }
      if (retestRow)     { retestRow.style.display = 'none'; }
      if (retestDateRow) { retestDateRow.style.display = 'none'; }
      if (retestDateInp) { retestDateInp.value = ''; }
      if (saveBtn) saveBtn.disabled = true;
      if (!sel.batchId) return;

      const allEntries = _buildCalendarEntries({
        campusId:  sel.campusId,
        sessionId: sel.sessionId,
        subjectId: sel.subjectId,
        batchId:   sel.batchId,
      });

      // Separate originals and retests
      const originalEntries = allEntries.filter(e => !e.isRetest && e.batchId === sel.batchId);
      const retestEntries   = allEntries.filter(e =>  e.isRetest && e.batchId === sel.batchId);
      _batchEntries = allEntries.filter(e => e.batchId === sel.batchId);

      // Show test group
      testGroup.style.display = '';
      testBadge.style.display = '';
      testBadge.textContent   = `${originalEntries.length} test${originalEntries.length !== 1 ? 's' : ''} found`;

      if (!originalEntries.length) {
        testCheckList.innerHTML = `<div style="padding:10px;text-align:center;font-size:12px;color:var(--t4)">
          No test entries found. Schedule tests first.</div>`;
        testHint.style.display = '';
        testHint.textContent   = 'No tests found. Please schedule tests in Assessment Calendar first.';
        return;
      }

      testHint.style.display = '';
      testHint.innerHTML = `Tests from <strong>Assessment Calendar</strong>. Select one to continue.`;

      const batch   = AppState.findById('batches', sel.batchId) || {};
      const subject = sel.subjectId ? AppState.findById('subjects', sel.subjectId) : null;
      if (metaLabel) {
        metaLabel.textContent = (batch.batchName || '') +
          (subject ? ' · ' + (subject.subjectCode || subject.subjectName) : '');
      }

      // ── Build hierarchical dropdown: original → its retests nested ──
      const buildItem = (e, indent = false) => {
        const typeMeta  = TEST_TYPE_META[e.testType] || {};
        const dateLabel = e.date       ? ` — ${formatDate(e.date)}` : '';
        const mrkLabel  = e.totalMarks ? ` [${e.totalMarks} marks]` : '';
        const retestBadgeHtml = e.isRetest
          ? `<span style="font-size:9.5px;font-weight:700;padding:1px 6px;border-radius:5px;
               background:var(--violet-dim,#ede9fe);color:var(--violet,#7c3aed);flex-shrink:0">
               Retest ${e.retestIndex > 1 ? '#'+e.retestIndex : ''}</span>`
          : '';
        return `
          <label style="display:flex;align-items:center;gap:8px;padding:7px ${indent ? '22px' : '10px'} 7px ${indent ? '22px' : '10px'};
            border-radius:7px;cursor:pointer;font-size:12.5px;color:var(--t1);
            transition:background .1s;user-select:none;${indent ? 'border-left:2px solid var(--border2);margin-left:12px;margin-right:4px;' : ''}"
            onmouseover="this.style.background='var(--surface2)'"
            onmouseout="this.style.background=this.querySelector('input').checked?'var(--blue-dim)':'transparent'">
            <input type="radio" name="trTestRadio" class="tr-test-rb" value="${e.id}"
              style="accent-color:var(--blue);width:14px;height:14px;cursor:pointer;flex-shrink:0"/>
            <span style="display:inline-block;padding:1px 7px;border-radius:5px;font-size:10px;font-weight:700;
              background:${typeMeta.bg||'var(--surface3)'};color:${typeMeta.color||'var(--t2)'};flex-shrink:0">
              ${e.testName}
            </span>
            ${retestBadgeHtml}
            <span style="color:var(--t3);font-size:11.5px">${dateLabel}${mrkLabel}</span>
          </label>`;
      };

      let html = '';
      originalEntries.forEach(e => {
        html += buildItem(e, false);
        // Nested retests
        const myRetests = retestEntries
          .filter(r => r.retestOf === e.id)
          .sort((a, b) => (a.retestIndex || 0) - (b.retestIndex || 0));
        myRetests.forEach(r => {
          html += buildItem(r, true);
        });
      });

      testCheckList.innerHTML = html;

      // Wire radio buttons
      testCheckList.querySelectorAll('.tr-test-rb').forEach(rb => {
        rb.addEventListener('change', () => {
          _selectedEntry = _batchEntries.find(e => e.id === rb.value) || null;

          const typeMeta = _selectedEntry ? (TEST_TYPE_META[_selectedEntry.testType] || {}) : {};
          testTriggerLbl.textContent = _selectedEntry
            ? `${_selectedEntry.testName}${_selectedEntry.date ? '  —  ' + formatDate(_selectedEntry.date) : ''}`
            : 'Select a test…';
          testTrigger.style.borderColor = 'var(--blue)';

          // Highlight selected row
          testCheckList.querySelectorAll('label').forEach(lbl => {
            const inp = lbl.querySelector('input');
            lbl.style.background = inp?.checked ? 'var(--blue-dim)' : 'transparent';
          });

          closeTestDropdown();

          // Pre-fill totalMarks from entry if available
          if (_selectedEntry?.totalMarks && totalMarksInp) {
            totalMarksInp.value = _selectedEntry.totalMarks;
            if (passingDisplay) {
              passingDisplay.textContent = _selectedEntry.passingMarks ||
                Math.ceil(parseFloat(_selectedEntry.totalMarks) * 0.5);
            }
          }

          // Show marks settings
          marksSettings.style.display = '';

          // If this is already a retest entry (selected from hierarchy), lock retest mode
          if (_selectedEntry?.isRetest) {
            // Pre-set retest mode as read-only context (editing existing retest)
            _isRetest   = false; // it's already saved as retest, treat as normal edit
            _retestDate = '';
            if (retestCb)      { retestCb.checked = false; }
            if (retestRow)     { retestRow.style.display = 'none'; }
            if (retestDateRow) { retestDateRow.style.display = 'none'; }
          } else {
            // Original test: show retest option
            _isRetest   = false;
            _retestDate = '';
            if (retestCb)      { retestCb.checked = false; }
            if (retestRow)     { retestRow.style.display = ''; }
            if (retestDateRow) { retestDateRow.style.display = 'none'; }
          }

          if (totalMarksInp?.value?.trim()) refreshGrid();
        });
      });
    });
  },

  // ── Save all marks (includes ALL students, even blank — so totalMarks persists) ──
  _handleSaveMarks(modalEl, container, sel) {
    // Validate test selected
    const selectedRb = modalEl.querySelector('.tr-test-rb:checked');
    if (!selectedRb) { Toast.error('Please select a test first.'); return; }

    // Validate total marks
    const totalMarksInp   = modalEl.querySelector('#trModalTotalMarks');
    const totalMarksErr   = modalEl.querySelector('#trTotalMarksErr');
    const tmVal = totalMarksInp?.value?.trim();
    if (!tmVal) {
      if (totalMarksErr) { totalMarksErr.style.display = ''; }
      if (totalMarksInp) { totalMarksInp.style.borderColor = 'var(--red)'; totalMarksInp.focus(); }
      return;
    }
    if (totalMarksErr)  { totalMarksErr.style.display = 'none'; }
    if (totalMarksInp)  { totalMarksInp.style.borderColor = ''; }

    // Validate retest date if retest mode
    const retestCb      = modalEl.querySelector('#trIsRetest');
    const retestDateInp = modalEl.querySelector('#trRetestDate');
    const retestDateErr = modalEl.querySelector('#trRetestDateErr');
    const isRetestMode  = retestCb?.checked || false;
    const retestDateVal = retestDateInp?.value?.trim() || '';

    if (isRetestMode && !retestDateVal) {
      if (retestDateErr) { retestDateErr.style.display = ''; }
      if (retestDateInp) { retestDateInp.style.borderColor = 'var(--red)'; retestDateInp.focus(); }
      return;
    }
    if (retestDateErr) { retestDateErr.style.display = 'none'; }
    if (retestDateInp) { retestDateInp.style.borderColor = ''; }

    const cells = modalEl.querySelectorAll('.tr-mark-cell');
    if (!cells.length) {
      Toast.error('Marks grid not loaded. Fill Total Marks first.');
      return;
    }

    const subjectIdVal    = sel?.subjectId || modalEl.querySelector('#trModalSubject')?.value || null;
    const totalMarksVal   = parseFloat(tmVal) || null;
    const passingMarksVal = totalMarksVal ? Math.ceil(totalMarksVal * 0.5) : null;

    let saved = 0;

    cells.forEach(input => {
      const entryId      = input.dataset.entryId;
      const studentId    = input.dataset.studentId;
      const isRetest     = input.dataset.isRetest === '1';
      const retestOf     = input.dataset.retestOf     || null;
      const retestDateV  = input.dataset.retestDate   || null;
      const retestIndex  = input.dataset.retestIndex  ? parseInt(input.dataset.retestIndex) : null;
      if (!entryId || !studentId) return;

      const cb     = modalEl.querySelector(`.tr-absent-cb[data-entry-id="${entryId}"][data-student-id="${studentId}"]`);
      const absent = cb?.checked || false;
      const marks  = absent ? null : (input.value !== '' ? parseFloat(input.value) : null);

      // Always upsert — even blank rows — so totalMarks/subjectId is stored on every student record
      _upsertMark({
        scheduleEntryId: entryId,
        studentId,
        marks,
        absent,
        subjectId:    subjectIdVal    || undefined,
        totalMarks:   totalMarksVal   || undefined,
        passingMarks: passingMarksVal || undefined,
        isRetest:     isRetest        || undefined,
        retestOf:     retestOf        || undefined,
        retestDate:   retestDateV     || undefined,
        retestIndex:  retestIndex     || undefined,
      });

      if (marks !== null || absent) saved++;
    });

    Toast.success(saved
      ? `${saved} record${saved !== 1 ? 's' : ''} saved successfully.`
      : 'Total Marks saved for all students.');
    Modal.closeAll();
    this._renderTable(container);
  },

  // ── CSV Export (same style as FinalResultsPanel) ─────────────
  _exportCSV(container) {
    const rows = this._getEnrichedRows(container);
    if (!rows.length) { Toast.error('No results to export.'); return; }

    const data = rows.map(r => ({
      Campus:      r.campusName,
      Session:     r.session,
      Subject:     r.subjectCode,
      Batch:       r.batchNo,
      Student:     r.studentName,
      Test:        r.entry.testName || '—',
      'Exam Date': r.entry.date ? formatDate(r.entry.date) : '—',
      Marks:       r.absent ? 'Absent' : (r.marks ?? ''),
      'Total Marks': r.totalMarks || r.entry.totalMarks || '—',
      Status:      r.status === 'pass' ? 'Pass' : r.status === 'fail' ? 'Fail'
                 : r.status === 'absent' ? 'Absent' : 'Pending',
    }));

    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map(row => headers.map(h => `"${String(row[h]).replace(/"/g,'""')}"`).join(',')),
    ].join('\n');

    const now     = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const blob    = new Blob([csv], { type: 'text/csv' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href     = url;
    a.download = `Test-Results-${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // ── PDF Export (same style as FinalResultsPanel) ─────────────
  _exportPDF(container) {
    const rows = this._getEnrichedRows(container);
    if (!rows.length) { Toast.error('No results to export.'); return; }

    const now        = new Date();
    const dateStr    = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr    = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

    const totalCount   = rows.length;
    const passCount    = rows.filter(r => r.status === 'pass').length;
    const failCount    = rows.filter(r => r.status === 'fail').length;
    const absentCount  = rows.filter(r => r.status === 'absent').length;
    const pendCount    = rows.filter(r => r.status === 'pending').length;
    const appearedCount = passCount + failCount;
    const passRate      = appearedCount > 0 ? Math.round((passCount / appearedCount) * 100) : 0;
    const appearedPct   = totalCount    > 0 ? Math.round((appearedCount / totalCount) * 100) : 0;

    const passRateColor    = passRate    >= 80 ? '#16a34a' : passRate    >= 60 ? '#d97706' : '#dc2626';
    const appearedPctColor = appearedPct >= 80 ? '#16a34a' : appearedPct >= 60 ? '#d97706' : '#dc2626';

    const colWidths = {
      'Campus':'60px','Session':'65px','Subject':'55px','Batch':'40px','Student':'115px',
      'Test':'80px','Exam Date':'75px','Marks':'60px','Total Marks':'60px','Status':'55px',
    };

    const headers  = ['Campus','Session','Subject','Batch','Student','Test','Exam Date','Marks','Total Marks','Status'];
    const thCells  = headers.map(h => `<th style="width:${colWidths[h]||'70px'}">${h}</th>`).join('');

    const tdRows = rows.map((r, i) => {
      const sc = { pass:'#16a34a', fail:'#dc2626', absent:'#d97706', pending:'#64748b' }[r.status] || '#64748b';
      const sb = { pass:'#f0fdf4', fail:'#fef2f2', absent:'#fffbeb', pending:'#f8fafc' }[r.status] || '#f8fafc';
      const statusLabel = r.status === 'pass' ? 'Pass' : r.status === 'fail' ? 'Fail'
                        : r.status === 'absent' ? 'Absent' : 'Pending';
      const marksVal = r.absent ? 'Absent' : (r.marks != null ? r.marks : '—');
      return `<tr class="${i%2===0?'even':'odd'}">
        <td>${r.campusName}</td>
        <td>${r.session}</td>
        <td style="font-weight:700;color:#1d4ed8">${r.subjectCode}</td>
        <td>${r.batchNo}</td>
        <td style="font-weight:600">${r.studentName}</td>
        <td>${r.entry.testName || '—'}</td>
        <td>${r.entry.date ? formatDate(r.entry.date) : '—'}</td>
        <td style="font-weight:700;text-align:center">${marksVal}</td>
        <td style="text-align:center">${r.totalMarks || r.entry.totalMarks || '—'}</td>
        <td><span style="color:${sc};background:${sb};padding:2px 8px;border-radius:6px;font-size:9px;font-weight:700">${statusLabel}</span></td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Test Results Report</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#1e293b;background:#fff;padding:18px 20px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #2563eb;padding-bottom:10px;margin-bottom:12px}
  .header-left .title{font-size:18px;font-weight:700;color:#1e40af;letter-spacing:-0.3px}
  .header-left .subtitle{font-size:10.5px;color:#64748b;margin-top:2px}
  .header-right{text-align:right;font-size:10px;color:#64748b;line-height:1.6}
  .header-right .date{font-weight:600;color:#1e293b;font-size:10.5px}
  .stats-row{display:flex;align-items:stretch;gap:0;margin-bottom:10px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden}
  .stat-box{flex:1;padding:7px 10px;text-align:center;border-right:1px solid #e2e8f0;background:#f8fafc}
  .stat-box:last-child{border-right:none}
  .stat-box .num{font-size:16px;font-weight:700;color:#1e293b}
  .stat-box .lbl{font-size:8.5px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-top:1px}
  .stat-box.pass .num{color:#16a34a}.stat-box.pass{background:#f0fdf4}
  .stat-box.fail .num{color:#dc2626}.stat-box.fail{background:#fef2f2}
  .stat-box.absent .num{color:#d97706}.stat-box.absent{background:#fffbeb}
  .rate-box{flex:1.6;padding:7px 14px;text-align:center;border-right:1px solid #e2e8f0;background:#fff}
  .rate-box:last-child{border-right:none}
  .rate-title{font-size:8.5px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
  .rate-bar-wrap{width:100%;height:5px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin-bottom:4px}
  .rate-bar{height:100%;border-radius:6px}
  .rate-footer{display:flex;align-items:baseline;justify-content:center;gap:5px}
  .rate-pct{font-size:14px;font-weight:700}
  .rate-sub{font-size:8.5px;color:#64748b}
  table{width:100%;border-collapse:collapse;font-size:9.5px}
  thead tr{background:#1e40af}
  thead th{color:#fff;font-weight:600;padding:6px;text-align:left;font-size:8.5px;text-transform:uppercase;letter-spacing:0.3px;white-space:nowrap}
  tbody tr.even{background:#fff}
  tbody tr.odd{background:#f8faff}
  tbody td{padding:5px 6px;border-bottom:1px solid #e2e8f0;color:#334155;vertical-align:middle}
  .footer{margin-top:12px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8}
  @media print{body{padding:10px 12px}@page{size:A4 landscape;margin:8mm}.no-print{display:none}}
</style>
</head><body>
  <div class="header">
    <div class="header-left">
      <div class="title">Test Results Report</div>
      <div class="subtitle">Per-Test Student Marks</div>
    </div>
    <div class="header-right">
      <div class="date">${dateStr}</div>
      <div>${timeStr}</div>
    </div>
  </div>
  <div class="stats-row">
    <div class="stat-box"><div class="num">${totalCount}</div><div class="lbl">Total</div></div>
    <div class="stat-box pass"><div class="num">${passCount}</div><div class="lbl">Pass</div></div>
    <div class="stat-box fail"><div class="num">${failCount}</div><div class="lbl">Fail</div></div>
    <div class="stat-box absent"><div class="num">${absentCount}</div><div class="lbl">Absent</div></div>
    <div class="stat-box"><div class="num">${pendCount}</div><div class="lbl">Pending</div></div>
    <div class="rate-box">
      <div class="rate-title">Pass Rate</div>
      <div class="rate-bar-wrap"><div class="rate-bar" style="width:${passRate}%;background:${passRateColor}"></div></div>
      <div class="rate-footer">
        <span class="rate-pct" style="color:${passRateColor}">${passRate}%</span>
        <span class="rate-sub">pass / appeared (${passCount}/${appearedCount})</span>
      </div>
    </div>
    <div class="rate-box">
      <div class="rate-title">Appeared</div>
      <div class="rate-bar-wrap"><div class="rate-bar" style="width:${appearedPct}%;background:${appearedPctColor}"></div></div>
      <div class="rate-footer">
        <span class="rate-pct" style="color:${appearedPctColor}">${appearedPct}%</span>
        <span class="rate-sub">appeared / total (${appearedCount}/${totalCount})</span>
      </div>
    </div>
  </div>
  <table>
    <thead><tr>${thCells}</tr></thead>
    <tbody>${tdRows}</tbody>
  </table>
  <div class="footer">
    <span>Test Results &nbsp;|&nbsp; Exported ${dateStr} at ${timeStr}</span>
    <span>Total: ${totalCount} record${totalCount !== 1 ? 's' : ''}</span>
  </div>
  <div style="margin-top:8px;text-align:center;font-size:9px;color:#94a3b8">
    Powered by <strong style="color:#2563eb">Learnomist</strong>
  </div>
  <div class="no-print" style="margin-top:16px;text-align:center">
    <button onclick="window.print()"
      style="padding:8px 26px;background:#2563eb;color:#fff;border:none;border-radius:8px;
             font-size:13px;font-weight:600;cursor:pointer">Print / Save as PDF</button>
  </div>
</body></html>`;

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 600);
  },

  // ── Styles ─────────────────────────────────────────────────────
  _injectStyles() {
    if (document.getElementById('tr-panel-styles')) return;
    const st = document.createElement('style');
    st.id = 'tr-panel-styles';
    st.textContent = `
      .tr-page { display:flex; flex-direction:column; gap:12px; }

      /* Toolbar buttons */
      .tr-add-btn {
        display:inline-flex; align-items:center; gap:6px;
        height:34px; padding:0 14px;
        background:var(--blue); color:#fff;
        border-radius:8px; font-size:13px; font-weight:600;
        font-family:var(--font-body); transition:opacity .15s;
      }
      .tr-add-btn:hover { opacity:.88; }
      .tr-export-btn {
        display:inline-flex; align-items:center; justify-content:center; gap:5px;
        height:32px; padding:0 14px; border-radius:8px;
        border:1px solid var(--border); background:var(--surface2);
        color:var(--t3); cursor:pointer; font-size:12px; font-weight:600;
        font-family:var(--font-body); transition:all .15s; white-space:nowrap;
      }
      .tr-export-btn:hover { border-color:var(--blue); color:var(--blue); }

      /* Filter bar */
      .tr-filter-bar {
        display:flex; align-items:center; gap:6px; flex-wrap:wrap;
        padding:8px 12px;
        background:var(--surface);
        border:1px solid var(--border);
        border-radius:12px;
      }

      /* Multi-select */
      .tr-ms-wrap { position:relative; }
      .tr-ms-trigger {
        height:30px; padding:0 10px;
        display:inline-flex; align-items:center; gap:5px;
        background:var(--surface2); border:1px solid var(--border2);
        border-radius:8px; color:var(--t2); font-size:12px;
        font-family:var(--font-body); font-weight:600;
        cursor:pointer; white-space:nowrap; transition:all .12s;
        max-width:180px;
      }
      .tr-ms-trigger:hover { border-color:var(--blue); color:var(--t1); }
      .tr-ms-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:110px; }
      .tr-ms-caret { flex-shrink:0; color:var(--t4); }
      .tr-ms-dropdown {
        display:none; position:absolute; top:calc(100% + 4px); left:0;
        min-width:180px; max-height:240px; overflow-y:auto;
        background:var(--surface); border:1px solid var(--border2);
        border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.14);
        z-index:999; padding:4px;
      }
      .tr-ms-dropdown.open { display:block; }
      .tr-ms-option {
        display:flex; align-items:center; gap:8px;
        padding:7px 10px; border-radius:7px;
        font-size:12.5px; color:var(--t2); cursor:pointer;
        transition:background .1s; user-select:none;
      }
      .tr-ms-option:hover { background:var(--surface2); color:var(--t1); }
      .tr-ms-option input[type="checkbox"] {
        width:14px; height:14px; cursor:pointer; flex-shrink:0;
        accent-color:var(--blue);
      }
      .tr-ms-empty { padding:10px; text-align:center; font-size:12px; color:var(--t4); }

      /* Search */
      .tr-search-input {
        height:30px; padding:0 10px; min-width:160px; flex:1;
        background:var(--surface2); border:1px solid var(--border2);
        border-radius:8px; color:var(--t1); font-size:12.5px;
        font-family:var(--font-body); outline:none;
      }
      .tr-search-input:focus { border-color:var(--blue); }
      .tr-search-input::placeholder { color:var(--t3); }

      /* Active filter chips */
      .tr-active-chip {
        display:inline-flex; align-items:center; gap:4px;
        padding:2px 8px; border-radius:20px;
        font-size:11px; font-weight:600;
        border:1px solid transparent; cursor:default;
      }
      .tr-chip-x { font-size:10px; cursor:pointer; opacity:.7; line-height:1; }
      .tr-chip-x:hover { opacity:1; }
      .tr-clear-btn {
        height:26px; padding:0 10px;
        border:1px solid var(--border2); border-radius:20px;
        background:transparent; color:var(--t3);
        font-size:11px; font-weight:600; cursor:pointer;
        transition:all .12s; white-space:nowrap; font-family:var(--font-body);
      }
      .tr-clear-btn:hover { border-color:var(--red); color:var(--red); }

      /* Main results table */
      .tr-table-wrap {
        background:var(--surface);
        border:1px solid var(--border);
        border-radius:12px;
        overflow:hidden;
      }
      .tr-table {
        width:100%; border-collapse:collapse; font-size:12.5px;
      }
      .tr-table thead tr {
        background:var(--surface2);
        border-bottom:1px solid var(--border);
      }
      .tr-table th {
        padding:10px 14px; text-align:left;
        font-size:11px; font-weight:700;
        text-transform:uppercase; letter-spacing:.06em;
        color:var(--t3); white-space:nowrap;
      }
      .tr-table td {
        padding:10px 14px; border-bottom:1px solid var(--border);
        vertical-align:middle; color:var(--t1);
      }
      .tr-row:last-child td { border-bottom:none; }
      .tr-row:hover td { background:var(--surface2); }

      /* Marks entry table */
      .tr-marks-table {
        width:100%; border-collapse:collapse; font-size:12.5px;
      }
      .tr-marks-table thead tr { background:var(--surface2); }
      .tr-marks-table th {
        padding:8px 10px; border-bottom:1px solid var(--border);
        font-size:11px; font-weight:700; text-transform:uppercase;
        letter-spacing:.05em; color:var(--t3); white-space:nowrap;
        text-align:left;
      }
      .tr-marks-table td {
        padding:6px 8px; border-bottom:1px solid var(--border);
        vertical-align:middle;
      }
      .tr-marks-table tbody tr:last-child td { border-bottom:none; }
      .tr-marks-table tbody tr:hover td { background:var(--surface2); }

      /* Mark cell input */
      .tr-mark-cell {
        width:62px; height:30px; text-align:center;
        background:var(--surface2); border:1px solid var(--border2);
        border-radius:7px; color:var(--t1); font-size:13px; font-weight:600;
        font-family:var(--font-body); outline:none;
        transition:border-color .12s, box-shadow .12s;
      }
      .tr-mark-cell:focus {
        border-color:var(--blue);
        box-shadow:0 0 0 2px color-mix(in srgb,var(--blue) 25%,transparent);
        background:var(--surface);
      }
      .tr-mark-cell:disabled { cursor:not-allowed; }

      /* Badges */
      .tr-badge {
        display:inline-flex; align-items:center;
        padding:2px 9px; border-radius:20px;
        font-size:11px; font-weight:700; letter-spacing:.03em;
      }
      .tr-badge-pass   { background:var(--green-dim);  color:var(--green);  }
      .tr-badge-fail   { background:var(--red-dim);    color:var(--red);    }
      .tr-badge-absent { background:var(--yellow-dim); color:var(--yellow); }
      .tr-badge-blank  { background:var(--surface3);   color:var(--t3);     }

      /* Empty state */
      .tr-empty {
        display:flex; flex-direction:column; align-items:center;
        justify-content:center; padding:64px 24px;
        border:1px dashed var(--border2); border-radius:12px;
        color:var(--t3);
      }

      /* ── Stats strip (same as FinalResultsPanel) ── */
      .fr-stats-strip {
        display:flex; align-items:center;
        background:var(--surface);
        border:1px solid var(--border);
        border-bottom:none;
        border-radius:12px 12px 0 0;
        padding:8px 16px;
      }
      .fr-stat-box {
        display:flex; flex-direction:column; align-items:center;
        padding:3px 12px; gap:1px;
      }
      .fr-stat-num { font-size:18px; font-weight:700; color:var(--t1); line-height:1.1; }
      .fr-stat-lbl { font-size:10px; font-weight:600; color:var(--t1); text-transform:uppercase; letter-spacing:.05em; }
      .fr-stat-divider { width:1px; height:36px; background:var(--border); margin:0 8px; flex-shrink:0; }
      .fr-stat-pass    .fr-stat-num { color:var(--green);  }
      .fr-stat-fail    .fr-stat-num { color:var(--red);    }
      .fr-stat-absent  .fr-stat-num { color:var(--yellow); }
      .fr-stat-pending .fr-stat-num { color:var(--t3);     }
      .fr-stat-rate-block { display:flex; flex-direction:column; align-items:center; gap:4px; padding:2px 20px; min-width:160px; }
      .fr-stat-rate-title { font-size:10px; font-weight:700; color:var(--t1); text-transform:uppercase; letter-spacing:.06em; }
      .fr-stat-rate-bar-wrap { width:100%; height:5px; background:var(--surface3); border-radius:10px; overflow:hidden; }
      .fr-stat-rate-bar { height:100%; border-radius:10px; transition:width .4s ease; }
      .fr-stat-rate-footer { display:flex; align-items:baseline; gap:6px; justify-content:center; }
      .fr-stat-rate-pct { font-size:15px; font-weight:700; line-height:1; }
      .fr-stat-rate-sub { font-size:10px; color:var(--t3); }

      /* ── Action buttons (same as FinalResultsPanel) ── */
      .fr-act-btn {
        width:28px; height:28px; border-radius:6px;
        display:inline-flex; align-items:center; justify-content:center;
        border:1px solid var(--border); color:var(--t3);
        transition:all .12s; cursor:pointer; background:transparent;
      }
      .fr-del-btn:hover { border-color:var(--red); color:var(--red); background:var(--red-dim); }

      /* ── fr-table for the new table ── */
      .fr-table { width:100%; border-collapse:collapse; font-size:12.5px; }
      .fr-table thead tr { background:var(--surface2); border-bottom:1px solid var(--border); }
      .fr-table th { padding:10px 14px; text-align:left; font-size:11px; font-weight:700;
        text-transform:uppercase; letter-spacing:.06em; color:var(--t3); white-space:nowrap; }
      .fr-table td { padding:10px 14px; border-bottom:1px solid var(--border); vertical-align:middle; color:var(--t1); }
      .fr-table tbody tr:last-child td { border-bottom:none; }
      .fr-table tbody tr:hover td { background:var(--surface2); }

      /* ── Modal shared styles (from resultsTab) ── */
      .fr-form-section {
        font-size:11px; font-weight:700; text-transform:uppercase;
        letter-spacing:.07em; color:var(--t3);
        margin-bottom:10px; padding-bottom:5px;
        border-bottom:1px solid var(--border);
      }
      .fr-filter-sel {
        height:34px; padding:0 10px;
        background:var(--surface2); border:1px solid var(--border2);
        border-radius:8px; color:var(--t2); font-size:12.5px;
        cursor:pointer; outline:none; font-family:var(--font-body);
      }
      .fr-filter-sel:focus  { border-color:var(--blue); color:var(--t1); }
      .fr-filter-sel:disabled { opacity:.45; cursor:not-allowed; }
      .fr-marks-header {
        display:flex; align-items:center; gap:16px;
        padding:10px 16px;
        background:var(--surface);
        border:1px solid var(--border);
        border-radius:10px;
        font-size:12.5px;
      }
      .fr-marks-header label { color:var(--t3); font-size:11.5px; margin-right:4px; }
      .fr-marks-input {
        width:72px; height:30px; padding:0 8px;
        background:var(--surface2); border:1px solid var(--border2);
        border-radius:7px; color:var(--t1); font-size:12.5px;
        font-family:var(--font-body); outline:none;
        transition:border-color .12s;
      }
      .fr-marks-input:focus { border-color:var(--blue); }
      .fr-auto-badge {
        font-size:10.5px; font-weight:700;
        background:var(--blue-dim); color:var(--blue);
        padding:2px 7px; border-radius:8px;
      }
    `;
    document.head.appendChild(st);
  },
};
