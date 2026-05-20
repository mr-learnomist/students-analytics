// ============================================================
// modules/testing/resultsTab.js — Results Tab
// Sub-tabs: Test Results | Final Results
// ============================================================

import { AppState, generateID } from '../../utils/state.js';
import { Modal, Form }          from '../../utils/ui.js';
import { Toast }                from '../../utils/helpers.js';
import { Auth }                 from '../../utils/auth.js';
import { TestResultsPanel }     from './testResultsPanel.js';

// ── AppState Key ──────────────────────────────────────────────
const RESULTS_KEY = 'finalResults'; // stores per-student final result entries

// ── Sub-tab definitions ───────────────────────────────────────
const SUB_TABS = [
  { id: 'test-results',  label: 'Test Results'  },
  { id: 'final-results', label: 'Final Results' },
];

// ── Main export ───────────────────────────────────────────────
export const ResultsTab = {

  mount(container) {
    this._injectStyles();
    container.innerHTML = this._shellTemplate();
    this._attachSubTabSwitcher(container);
    this._activateSubTab('test-results', container);
  },

  // ── Shell: sub-tab nav + panel area ──────────────────────────
  _shellTemplate() {
    const tabs = SUB_TABS.map(t => `
      <button class="res-subtab-btn" data-subtab="${t.id}">${t.label}</button>
    `).join('');

    const panels = SUB_TABS.map(t =>
      `<div id="res-panel-${t.id}" class="res-panel"></div>`
    ).join('');

    return `
      <div class="res-shell">
        <div class="res-subtab-nav" id="resSubTabs">${tabs}</div>
        <div class="res-panel-area">${panels}</div>
      </div>
    `;
  },

  // ── Sub-tab switcher ──────────────────────────────────────────
  _attachSubTabSwitcher(container) {
    container.querySelector('#resSubTabs')?.addEventListener('click', e => {
      const btn = e.target.closest('.res-subtab-btn[data-subtab]');
      if (btn) this._activateSubTab(btn.dataset.subtab, container);
    });
  },

  _activateSubTab(tabId, container) {
    container.querySelectorAll('.res-subtab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.subtab === tabId)
    );
    container.querySelectorAll('.res-panel').forEach(p =>
      p.classList.toggle('active', p.id === `res-panel-${tabId}`)
    );

    const panel = container.querySelector(`#res-panel-${tabId}`);
    if (!panel || panel.dataset.mounted) return;

    if (tabId === 'test-results') {
      TestResultsPanel.mount(panel);
    } else if (tabId === 'final-results') {
      FinalResultsPanel.mount(panel);
    }

    panel.dataset.mounted = 'true';
  },

  // ── Styles ────────────────────────────────────────────────────
  _injectStyles() {
    if (document.getElementById('res-tab-styles')) return;
    const st = document.createElement('style');
    st.id = 'res-tab-styles';
    st.textContent = `
      .res-shell { display:flex; flex-direction:column; gap:0; }

      /* Sub-tab nav */
      .res-subtab-nav {
        display:flex; gap:4px;
        padding:4px;
        background:var(--surface2);
        border:1px solid var(--border);
        border-radius:10px;
        width:fit-content;
        margin-bottom:16px;
      }
      .res-subtab-btn {
        padding:7px 18px;
        border-radius:7px;
        font-size:13px;
        font-weight:500;
        color:var(--t3);
        font-family:var(--font-body);
        transition:all .15s;
        cursor:pointer;
      }
      .res-subtab-btn:hover { color:var(--t1); background:var(--surface3); }
      .res-subtab-btn.active {
        background:var(--surface);
        color:var(--t1);
        font-weight:700;
        box-shadow:0 1px 4px rgba(0,0,0,.08);
        border:1px solid var(--border);
      }

      .res-panel { display:none; }
      .res-panel.active { display:block; }

      /* ── Coming soon ── */
      .res-coming-soon {
        display:flex; flex-direction:column; align-items:center;
        justify-content:center; min-height:300px; gap:12px;
        border:1px dashed var(--border2); border-radius:12px;
        color:var(--t3);
      }

      /* ── Toolbar ── */
      .fr-toolbar {
        display:flex; align-items:center; gap:8px; flex-wrap:wrap;
        padding:12px 16px;
        background:var(--surface);
        border:1px solid var(--border);
        border-radius:12px;
        margin-bottom:14px;
      }
      .fr-filter-sel {
        height:34px; padding:0 10px;
        background:var(--surface2); border:1px solid var(--border2);
        border-radius:8px; color:var(--t2); font-size:12.5px;
        cursor:pointer; outline:none; font-family:var(--font-body);
        min-width:150px;
      }
      .fr-filter-sel:focus { border-color:var(--blue); color:var(--t1); }
      .fr-filter-sel:disabled { opacity:.45; cursor:not-allowed; }
      .fr-add-btn {
        display:inline-flex; align-items:center; gap:6px;
        height:34px; padding:0 14px;
        background:var(--blue); color:#fff;
        border-radius:8px; font-size:13px; font-weight:600;
        font-family:var(--font-body); transition:opacity .15s;
        flex-shrink:0; margin-left:auto;
      }
      .fr-add-btn:hover { opacity:.88; }
      .fr-add-btn:disabled { opacity:.4; cursor:not-allowed; }
      .fr-count { font-size:12px; color:var(--t3); white-space:nowrap; }

      /* ── Results table wrapper ── */
      .fr-table-wrap {
        background:var(--surface);
        border:1px solid var(--border);
        border-radius:12px;
        overflow:hidden;
      }
      .fr-table {
        width:100%; border-collapse:collapse; font-size:12.5px;
      }
      .fr-table thead tr {
        background:var(--surface2);
        border-bottom:1px solid var(--border);
      }
      .fr-table th {
        padding:10px 14px; text-align:left;
        font-size:11px; font-weight:700;
        text-transform:uppercase; letter-spacing:.06em;
        color:var(--t3); white-space:nowrap;
      }
      .fr-table td {
        padding:10px 14px; border-bottom:1px solid var(--border);
        vertical-align:middle; color:var(--t1);
      }
      .fr-table tbody tr:last-child td { border-bottom:none; }
      .fr-table tbody tr:hover td { background:var(--surface2); }

      /* ── Inline editable cell ── */
      .fr-cell-input {
        width:100%; border:none; outline:none;
        background:transparent; color:var(--t1);
        font-size:12.5px; font-family:var(--font-body);
        padding:3px 6px; border-radius:6px;
        transition:background .12s, box-shadow .12s;
      }
      .fr-cell-input:focus {
        background:var(--surface2);
        box-shadow:0 0 0 2px var(--blue);
      }

      /* ── Pass / Fail / Absent / Blank badges ── */
      .fr-badge {
        display:inline-flex; align-items:center;
        padding:2px 9px; border-radius:20px;
        font-size:11px; font-weight:700; letter-spacing:.03em;
      }
      .fr-badge-pass    { background:var(--green-dim); color:var(--green); }
      .fr-badge-fail    { background:var(--red-dim);   color:var(--red);   }
      .fr-badge-absent  { background:var(--yellow-dim);color:var(--yellow);}
      .fr-badge-blank   { background:var(--surface3);  color:var(--t3);    }

      /* ── Action button in table ── */
      .fr-act-btn {
        width:28px; height:28px; border-radius:6px;
        display:inline-flex; align-items:center; justify-content:center;
        border:1px solid var(--border); color:var(--t3);
        transition:all .12s; cursor:pointer;
      }
      .fr-del-btn:hover  { border-color:var(--red);  color:var(--red);  background:var(--red-dim);  }
      .fr-edit-btn:hover { border-color:var(--blue); color:var(--blue); background:var(--blue-dim); }

      /* ── Empty state ── */
      .fr-empty {
        display:flex; flex-direction:column; align-items:center;
        justify-content:center; padding:64px 24px; color:var(--t3);
      }

      /* ── Meta info strip ── */
      .fr-meta-strip {
        display:flex; align-items:center; gap:16px; flex-wrap:wrap;
        padding:10px 16px;
        background:var(--surface2);
        border:1px solid var(--border);
        border-radius:10px;
        margin-bottom:12px;
        font-size:12px; color:var(--t2);
      }
      .fr-meta-item { display:flex; align-items:center; gap:5px; }
      .fr-meta-label { color:var(--t3); }

      /* ── Total / passing marks header row ── */
      .fr-marks-header {
        display:flex; align-items:center; gap:16px;
        padding:10px 16px;
        background:var(--surface);
        border:1px solid var(--border);
        border-radius:10px;
        margin-bottom:12px;
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

      /* ── Passing marks auto badge ── */
      .fr-auto-badge {
        font-size:10.5px; font-weight:700;
        background:var(--blue-dim); color:var(--blue);
        padding:2px 7px; border-radius:8px;
      }

      /* ── Form modal specifics ── */
      .fr-form-section {
        font-size:11px; font-weight:700; text-transform:uppercase;
        letter-spacing:.07em; color:var(--t3);
        margin-bottom:10px; margin-top:20px;
        padding-bottom:5px; border-bottom:1px solid var(--border);
      }
      .fr-form-section:first-child { margin-top:0; }

      /* ── Filter bar (same pattern as assessmentCalendar) ── */
      .fr-filter-bar {
        display:flex; align-items:center; gap:6px; flex-wrap:wrap;
        padding:8px 12px;
        background:var(--surface);
        border:1px solid var(--border);
        border-radius:12px;
      }

      /* Multi-select wrapper */
      .fr-ms-wrap { position:relative; }

      .fr-ms-trigger {
        height:30px; padding:0 10px;
        display:inline-flex; align-items:center; gap:5px;
        background:var(--surface2); border:1px solid var(--border2);
        border-radius:8px; color:var(--t2); font-size:12px;
        font-family:var(--font-body); font-weight:600;
        cursor:pointer; white-space:nowrap; transition:all .12s;
        max-width:180px;
      }
      .fr-ms-trigger:hover { border-color:var(--blue); color:var(--t1); }

      .fr-ms-label {
        overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
        max-width:110px;
      }
      .fr-ms-caret { flex-shrink:0; color:var(--t4); }

      /* Dropdown panel */
      .fr-ms-dropdown {
        display:none; position:absolute; top:calc(100% + 4px); left:0;
        min-width:180px; max-height:240px; overflow-y:auto;
        background:var(--surface); border:1px solid var(--border2);
        border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.14);
        z-index:999; padding:4px;
      }
      .fr-ms-dropdown.open { display:block; }

      .fr-ms-option {
        display:flex; align-items:center; gap:8px;
        padding:7px 10px; border-radius:7px;
        font-size:12.5px; color:var(--t2); cursor:pointer;
        transition:background .1s; user-select:none;
      }
      .fr-ms-option:hover { background:var(--surface2); color:var(--t1); }
      .fr-ms-option input[type="checkbox"] {
        width:14px; height:14px; cursor:pointer; flex-shrink:0;
        accent-color:var(--blue);
      }
      .fr-ms-empty {
        padding:10px; text-align:center;
        font-size:12px; color:var(--t4);
      }

      /* Active filter chips */
      .fr-active-chip {
        display:inline-flex; align-items:center; gap:4px;
        padding:2px 8px; border-radius:20px;
        font-size:11px; font-weight:600;
        border:1px solid transparent; cursor:default;
      }
      .fr-chip-x {
        font-size:10px; cursor:pointer; opacity:.7; line-height:1;
      }
      .fr-chip-x:hover { opacity:1; }

      /* Clear all button */
      .fr-clear-all-btn {
        height:26px; padding:0 10px;
        border:1px solid var(--border2); border-radius:20px;
        background:transparent; color:var(--t3);
        font-size:11px; font-weight:600; cursor:pointer;
        transition:all .12s; white-space:nowrap;
        font-family:var(--font-body);
      }
      .fr-clear-all-btn:hover { border-color:var(--red); color:var(--red); }

      /* ── Stats strip ── */
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
      .fr-stat-num {
        font-size:18px; font-weight:700; color:var(--t1);
        line-height:1.1;
      }
      .fr-stat-lbl {
        font-size:10px; font-weight:600; color:var(--t1);
        text-transform:uppercase; letter-spacing:.05em;
      }
      .fr-stat-divider {
        width:1px; height:36px; background:var(--border);
        margin:0 8px; flex-shrink:0;
      }
      .fr-stat-pass    .fr-stat-num { color:var(--green);  }
      .fr-stat-fail    .fr-stat-num { color:var(--red);    }
      .fr-stat-absent  .fr-stat-num { color:var(--yellow); }
      .fr-stat-pending .fr-stat-num { color:var(--t3);     }

      .fr-stat-rate-block {
        display:flex; flex-direction:column; align-items:center; gap:4px;
        padding:2px 20px; min-width:160px;
      }
      .fr-stat-rate-title {
        font-size:10px; font-weight:700; color:var(--t1);
        text-transform:uppercase; letter-spacing:.06em;
        text-align:center;
      }
      .fr-stat-rate-bar-wrap {
        width:100%; height:5px;
        background:var(--surface3); border-radius:10px; overflow:hidden;
      }
      .fr-stat-rate-bar {
        height:100%; border-radius:10px;
        transition:width .4s ease, background .3s ease;
      }
      .fr-stat-rate-footer {
        display:flex; align-items:baseline; gap:6px;
        justify-content:center;
      }
      .fr-stat-rate-pct {
        font-size:15px; font-weight:700; line-height:1;
      }
      .fr-stat-rate-sub {
        font-size:10px; color:var(--t3);
      }
    `;
    document.head.appendChild(st);
  },
};


// ══════════════════════════════════════════════════════════════
//  FINAL RESULTS PANEL
// ══════════════════════════════════════════════════════════════
const FinalResultsPanel = {

  // ── State ─────────────────────────────────────────────────────
  _sel: {
    campusId:     '',
    disciplineId: '',
    levelId:      '',
    session:      '',   // plain string e.g. "Jan-2024" — NOT an ID
    subjectId:    '',
    batchId:      '',
  },
  _totalMarks:   100,
  _passingMarks: 50,   // always 50% of totalMarks (auto)

  mount(container) {
    this._container = container;
    // Filter state
    this._filterCampus  = [];
    this._filterSession = [];
    this._filterSubject = [];
    this._filterBatch   = [];
    this._filterStatus  = [];
    container.innerHTML = this._template();
    this._attachToolbar(container);
    this._initFilterBar(container);
    this._renderAllResults(container);
  },

  // ── HTML ──────────────────────────────────────────────────────
  _template() {
    return `
      <div style="display:flex;flex-direction:column;gap:12px">

        <!-- ── Row 1: Add Result + Export buttons ── -->
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <button class="fr-add-btn" id="frAddBtn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5"  y1="12" x2="19" y2="12"/>
            </svg>
            Add Result
          </button>
          <div style="flex:1"></div>
          <!-- Export buttons (same style as assessmentCalendar) -->
          <button id="frExportCSV" title="Export to CSV (Excel)"
            style="display:inline-flex;align-items:center;justify-content:center;gap:5px;
                   height:32px;padding:0 14px;border-radius:8px;
                   border:1px solid var(--border);background:var(--surface2);
                   color:var(--t3);cursor:pointer;font-size:12px;font-weight:600;
                   font-family:var(--font-body);transition:all .15s;white-space:nowrap">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M8 12l2.5 2.5L16 9"/>
            </svg>
            CSV
          </button>
          <button id="frExportPDF" title="Export to PDF"
            style="display:inline-flex;align-items:center;justify-content:center;gap:5px;
                   height:32px;padding:0 14px;border-radius:8px;
                   border:1px solid var(--border);background:var(--surface2);
                   color:var(--t3);cursor:pointer;font-size:12px;font-weight:600;
                   font-family:var(--font-body);transition:all .15s;white-space:nowrap">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="8" y1="13" x2="16" y2="13"/>
              <line x1="8" y1="17" x2="16" y2="17"/>
            </svg>
            PDF
          </button>
        </div>

        <!-- ── Row 2: Filter bar (same style as assessmentCalendar) ── -->
        <div class="fr-filter-bar" id="frFilterBar">

          <!-- Campus multi-select -->
          <div class="fr-ms-wrap" id="frMsCampus">
            <button class="fr-ms-trigger" id="frMsCampusTrigger">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
              <span class="fr-ms-label" id="frMsCampusLabel">All Campuses</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="fr-ms-caret"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="fr-ms-dropdown" id="frMsCampusDropdown"></div>
          </div>

          <!-- Session multi-select -->
          <div class="fr-ms-wrap" id="frMsSession">
            <button class="fr-ms-trigger" id="frMsSessionTrigger">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span class="fr-ms-label" id="frMsSessionLabel">All Sessions</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="fr-ms-caret"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="fr-ms-dropdown" id="frMsSessionDropdown"></div>
          </div>

          <!-- Subject multi-select -->
          <div class="fr-ms-wrap" id="frMsSubject">
            <button class="fr-ms-trigger" id="frMsSubjectTrigger">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
              </svg>
              <span class="fr-ms-label" id="frMsSubjectLabel">All Subjects</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="fr-ms-caret"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="fr-ms-dropdown" id="frMsSubjectDropdown"></div>
          </div>

          <!-- Batch# multi-select -->
          <div class="fr-ms-wrap" id="frMsBatch">
            <button class="fr-ms-trigger" id="frMsBatchTrigger">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <span class="fr-ms-label" id="frMsBatchLabel">All Batches</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="fr-ms-caret"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="fr-ms-dropdown" id="frMsBatchDropdown"></div>
          </div>

          <!-- Status filter -->
          <div class="fr-ms-wrap" id="frMsStatus">
            <button class="fr-ms-trigger" id="frMsStatusTrigger">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <span class="fr-ms-label" id="frMsStatusLabel">All Statuses</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="fr-ms-caret"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="fr-ms-dropdown" id="frMsStatusDropdown">
              <label class="fr-ms-option"><input type="checkbox" value="pass"    class="fr-ms-cb fr-ms-status-cb"/> Pass</label>
              <label class="fr-ms-option"><input type="checkbox" value="fail"    class="fr-ms-cb fr-ms-status-cb"/> Fail</label>
              <label class="fr-ms-option"><input type="checkbox" value="absent"  class="fr-ms-cb fr-ms-status-cb"/> Absent</label>
              <label class="fr-ms-option"><input type="checkbox" value="pending" class="fr-ms-cb fr-ms-status-cb"/> Pending</label>
            </div>
          </div>

          <!-- Search input -->
          <input id="frAllSearch" class="fr-filter-sel" type="text"
                 placeholder="Search student…"
                 style="min-width:160px;padding:0 10px;height:30px;font-size:12px;flex:1"/>

          <!-- Active filter chips + clear all -->
          <div id="frActiveChips" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap"></div>
          <button id="frClearAll" class="fr-clear-all-btn" style="display:none">Clear all</button>

          <span id="frAllCount" style="font-size:12px;color:var(--t3);white-space:nowrap;margin-left:4px"></span>
        </div>

        <!-- ── Row 3: Results table ── -->
        <div id="frAllTableArea"></div>

      </div>
    `;
  },

  // ── Toolbar wiring ────────────────────────────────────────────
  _attachToolbar(container) {
    container.querySelector('#frAddBtn')?.addEventListener('click', () => this._openAddForm(container));

    // Search
    container.querySelector('#frAllSearch')?.addEventListener('input', () => this._renderAllResults(container));

    // Export hover styles
    ['frExportCSV', 'frExportPDF'].forEach(id => {
      const btn = container.querySelector(`#${id}`);
      if (!btn) return;
      btn.addEventListener('mouseenter', () => { btn.style.borderColor='var(--blue)'; btn.style.color='var(--blue)'; btn.style.background='var(--blue-dim)'; });
      btn.addEventListener('mouseleave', () => { btn.style.borderColor='var(--border)'; btn.style.color='var(--t3)'; btn.style.background='var(--surface2)'; });
    });

    container.querySelector('#frExportCSV')?.addEventListener('click', () => {
      const rows = this._getFilteredRows(container);
      this._exportCSV(rows);
    });
    container.querySelector('#frExportPDF')?.addEventListener('click', () => {
      const rows = this._getFilteredRows(container);
      this._exportPDF(rows);
    });
  },

  // ── Filter bar init (multi-select dropdowns, same pattern as assessmentCalendar) ──
  _initFilterBar(container) {
    const self = this;

    // Generic multi-select init
    const initMs = ({ triggerId, dropdownId, labelId, cbClass, allLabel, stateKey }) => {
      const trigger  = container.querySelector(`#${triggerId}`);
      const dropdown = container.querySelector(`#${dropdownId}`);
      const labelEl  = container.querySelector(`#${labelId}`);
      if (!trigger || !dropdown) return;

      // Toggle open
      trigger.addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = dropdown.classList.contains('open');
        container.querySelectorAll('.fr-ms-dropdown.open').forEach(d => d.classList.remove('open'));
        if (!isOpen) dropdown.classList.add('open');
      });

      // Checkbox change
      dropdown.addEventListener('change', e => {
        if (!e.target.classList.contains(cbClass)) return;
        self[stateKey] = [...dropdown.querySelectorAll(`input.${cbClass}:checked`)].map(c => c.value);
        // Update label
        const cnt = self[stateKey].length;
        labelEl.textContent = cnt ? `${allLabel.split(' ')[1] || allLabel}: ${cnt}` : allLabel;
        self._renderChips(container);
        self._renderAllResults(container);
      });
    };

    initMs({ triggerId:'frMsCampusTrigger',  dropdownId:'frMsCampusDropdown',  labelId:'frMsCampusLabel',  cbClass:'fr-ms-campus-cb',  allLabel:'All Campuses',  stateKey:'_filterCampus'  });
    initMs({ triggerId:'frMsSessionTrigger', dropdownId:'frMsSessionDropdown', labelId:'frMsSessionLabel', cbClass:'fr-ms-session-cb', allLabel:'All Sessions',  stateKey:'_filterSession' });
    initMs({ triggerId:'frMsSubjectTrigger', dropdownId:'frMsSubjectDropdown', labelId:'frMsSubjectLabel', cbClass:'fr-ms-subject-cb', allLabel:'All Subjects',  stateKey:'_filterSubject' });
    initMs({ triggerId:'frMsBatchTrigger',   dropdownId:'frMsBatchDropdown',   labelId:'frMsBatchLabel',   cbClass:'fr-ms-batch-cb',   allLabel:'All Batches',   stateKey:'_filterBatch'   });
    initMs({ triggerId:'frMsStatusTrigger',  dropdownId:'frMsStatusDropdown',  labelId:'frMsStatusLabel',  cbClass:'fr-ms-status-cb',  allLabel:'All Statuses',  stateKey:'_filterStatus'  });

    // Close dropdowns on outside click
    document.addEventListener('click', () => {
      container.querySelectorAll('.fr-ms-dropdown.open').forEach(d => d.classList.remove('open'));
    });

    // Clear all chips
    container.querySelector('#frClearAll')?.addEventListener('click', () => {
      this._filterCampus = this._filterSession = this._filterSubject = this._filterBatch = this._filterStatus = [];
      container.querySelectorAll('.fr-ms-cb').forEach(cb => cb.checked = false);
      ['frMsCampusLabel','frMsSessionLabel','frMsSubjectLabel','frMsBatchLabel','frMsStatusLabel'].forEach((id, i) => {
        const el = container.querySelector(`#${id}`);
        if (el) el.textContent = ['All Campuses','All Sessions','All Subjects','All Batches','All Statuses'][i];
      });
      this._renderChips(container);
      this._renderAllResults(container);
    });
  },

  // ── Render active filter chips ─────────────────────────────────
  _renderChips(container) {
    const chipsEl = container.querySelector('#frActiveChips');
    const clearBtn = container.querySelector('#frClearAll');
    if (!chipsEl) return;

    const allFilters = [
      { key: 'Campus',  arr: this._filterCampus  },
      { key: 'Session', arr: this._filterSession },
      { key: 'Subject', arr: this._filterSubject },
      { key: 'Batch',   arr: this._filterBatch   },
      { key: 'Status',  arr: this._filterStatus  },
    ];

    const chips = [];
    allFilters.forEach(({ key, arr }) => {
      arr.forEach(val => {
        chips.push(`
          <span class="fr-active-chip" style="background:var(--blue-dim);color:var(--blue);border-color:var(--blue)">
            <span style="font-size:10px;color:var(--t3)">${key}:</span> ${val}
            <span class="fr-chip-x" data-key="${key}" data-val="${val}">✕</span>
          </span>`);
      });
    });

    chipsEl.innerHTML = chips.join('');
    if (clearBtn) clearBtn.style.display = chips.length ? '' : 'none';

    // Wire chip remove
    chipsEl.querySelectorAll('.fr-chip-x').forEach(x => {
      x.addEventListener('click', () => {
        const { key, val } = x.dataset;
        const map = { Campus:'_filterCampus', Session:'_filterSession', Subject:'_filterSubject', Batch:'_filterBatch', Status:'_filterStatus' };
        const sk = map[key];
        if (sk) this[sk] = this[sk].filter(v => v !== val);
        // Uncheck the checkbox
        container.querySelectorAll('.fr-ms-cb').forEach(cb => { if (cb.value === val) cb.checked = false; });
        this._renderChips(container);
        this._renderAllResults(container);
      });
    });
  },

  // ── Repopulate dynamic multi-select dropdowns ─────────────────
  _repopDynDropdown(container, dropdownId, cbClass, values, currentArr) {
    const dd = container.querySelector(`#${dropdownId}`);
    if (!dd) return;
    const unique = [...new Set(values.filter(v => v && v !== '—'))].sort();
    dd.innerHTML = unique.length
      ? unique.map(v => `
          <label class="fr-ms-option">
            <input type="checkbox" value="${v}" class="fr-ms-cb ${cbClass}" ${currentArr.includes(v) ? 'checked' : ''}/>
            ${v}
          </label>`).join('')
      : `<div class="fr-ms-empty">No options</div>`;
  },

  // ── Cascade helpers ───────────────────────────────────────────

  _resetSel(sel, placeholder) {
    sel.innerHTML = `<option value="">${placeholder}</option>`;
  },

  _populateDisciplines(sel, campusId) {
    // discipline.js: fields = id, abbreviation, fullName, campusIds (array)
    const disciplines = (AppState.get('disciplines') || [])
      .filter(d => !campusId || (Array.isArray(d.campusIds) && d.campusIds.includes(campusId)));
    sel.innerHTML =
      '<option value="">Select Discipline…</option>' +
      disciplines.map(d =>
        `<option value="${d.id}">${d.abbreviation} — ${d.fullName}</option>`
      ).join('');
  },

  _populateLevels(sel, disciplineId) {
    // levels.js: fields = id, disciplineId (FK), levelName
    const levels = (AppState.get('levels') || [])
      .filter(l => !disciplineId || l.disciplineId === disciplineId);
    sel.innerHTML =
      '<option value="">Select Level…</option>' +
      levels.map(l =>
        `<option value="${l.id}">${l.levelName}</option>`
      ).join('');
  },

  _populateSessions(sel) {
    // Sessions are NOT a separate AppState key — they are unique sessionPeriod
    // strings stored on each batch (e.g. "Jan-2024", "June-2024")
    // Same logic as getUniqueSessions() in enrolmentUI.js
    const { campusId, disciplineId, levelId } = this._sel;

    // Filter batches by already-selected criteria to narrow sessions
    const batches = (AppState.get('batches') || []).filter(b => {
      if (campusId     && b.campusId     !== campusId)     return false;
      if (disciplineId && b.disciplineId !== disciplineId) return false;
      if (levelId      && b.levelId      !== levelId)      return false;
      return true;
    });

    const sessions = [...new Set(
      batches.map(b => b.sessionPeriod).filter(Boolean)
    )].sort((a, b) => {
      const p = v => {
        const [n, yy] = (v || '').split('-');
        return parseInt(yy) * 2 + (n === 'June' ? 1 : 0);
      };
      return p(b) - p(a);
    });

    sel.innerHTML =
      '<option value="">Select Session…</option>' +
      sessions.map(s => `<option value="${s}">${s}</option>`).join('');
  },

  _populateSubjects(sel, levelId) {
    const subjects = (AppState.get('subjects') || [])
      .filter(s => !levelId || s.levelId === levelId);
    sel.innerHTML =
      '<option value="">Select Subject…</option>' +
      subjects.map(s =>
        `<option value="${s.id}">${s.subjectCode ? s.subjectCode + ' — ' : ''}${s.subjectName}</option>`
      ).join('');
  },

  _populateBatches(sel) {
    const { campusId, disciplineId, levelId, session, subjectId } = this._sel;

    // Get subject code to filter batches (batchName format: FA1-Dec-25-01)
    // First segment of batchName = subject code (e.g. FA1, CS2)
    const subject     = subjectId ? AppState.findById('subjects', subjectId) : null;
    const subjectCode = subject?.subjectCode || '';

    const batches = (AppState.get('batches') || []).filter(b => {
      if (campusId     && b.campusId      !== campusId)     return false;
      if (disciplineId && b.disciplineId  !== disciplineId) return false;
      if (levelId      && b.levelId       !== levelId)      return false;
      if (session      && b.sessionPeriod !== session)      return false;
      // Filter by subject code — first segment of batchName
      if (subjectCode) {
        const firstSeg = (b.batchName || '').split('-')[0] || '';
        if (firstSeg !== subjectCode) return false;
      }
      return true;
    });

    // Only show batches that have enrolments
    const enrolments = AppState.get('enrolments') || [];
    const filtered   = batches.filter(b =>
      enrolments.some(e => e.batchId === b.id)
    );

    // Show only batch number (last segment of batchName e.g. "01", "02")
    sel.innerHTML =
      '<option value="">Select Batch…</option>' +
      filtered.map(b => {
        const parts   = (b.batchName || '').split('-');
        const batchNo = parts[parts.length - 1] || b.batchName;
        return `<option value="${b.id}">Batch ${batchNo}</option>`;
      }).join('');
  },

  // ── Render results table (batch-specific, called after modal save) ──
  _renderTable(container) {
    const area = container.querySelector('#frTableArea');
    if (!area) return;

    const { batchId, subjectId } = this._sel;

    if (!batchId) {
      area.innerHTML = `
        <div class="fr-empty">
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="1.2" style="color:var(--t4);margin-bottom:12px">
            <path d="M9 11l3 3L22 4"/>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
          <div style="font-size:14px;font-weight:600;color:var(--t2)">No results added yet</div>
          <div style="font-size:12.5px;color:var(--t3);margin-top:4px">
            Click <strong>Add Result</strong> to enter exam results for a batch.
          </div>
        </div>`;
      return;
    }

    // Load enrolled students
    const enrolments = (AppState.get('enrolments') || [])
      .filter(e => e.batchId === batchId && e.status !== 'dropped');
    const studentIds  = enrolments.map(e => e.studentId);
    const allStudents = AppState.get('students') || [];
    const students    = studentIds
      .map(sid => allStudents.find(s => s.id === sid))
      .filter(Boolean);

    const allResults = AppState.get(RESULTS_KEY) || [];
    const results    = allResults.filter(r =>
      r.batchId === batchId &&
      (!subjectId || r.subjectId === subjectId)
    );

    const getResult = (studentId) =>
      results.find(r => r.studentId === studentId) || null;

    const passing = Math.ceil(this._totalMarks * 0.5);
    this._passingMarks = passing;

    if (!students.length) {
      area.innerHTML = `
        <div class="fr-empty">
          <div style="font-size:14px;font-weight:600;color:var(--t2)">No enrolled students found</div>
          <div style="font-size:12.5px;color:var(--t3);margin-top:4px">
            Enroll students in this batch to enter results.
          </div>
        </div>`;
      return;
    }

    const subject = subjectId ? AppState.findById('subjects', subjectId) : null;
    const batch   = AppState.findById('batches', batchId);

    area.innerHTML = `
      <!-- Meta strip -->
      <div class="fr-meta-strip">
        <span class="fr-meta-item">
          <span class="fr-meta-label">Batch:</span>
          <strong>${batch?.batchName || '—'}</strong>
        </span>
        ${subject ? `<span class="fr-meta-item">
          <span class="fr-meta-label">Subject:</span>
          <strong>${subject.subjectCode || ''} ${subject.subjectName}</strong>
        </span>` : ''}
        <span class="fr-meta-item">
          <span class="fr-meta-label">Students:</span>
          <strong>${students.length}</strong>
        </span>
        <span class="fr-meta-item">
          <span class="fr-meta-label">Total Marks:</span>
          <strong>${this._totalMarks}</strong>
          <span class="fr-auto-badge" style="margin-left:4px">Pass: ${passing}</span>
        </span>
      </div>

      <!-- Results table -->
      <div class="fr-table-wrap">
        <table class="fr-table">
          <thead>
            <tr>
              <th style="width:38px">#</th>
              <th>Student Name</th>
              <th style="width:80px">Roll No</th>
              <th style="width:80px">Campus</th>
              <th style="width:90px">Session</th>
              <th style="width:70px">Batch</th>
              <th style="width:130px">Exam Date</th>
              <th style="width:110px">Marks Obtained</th>
              <th style="width:90px">Status</th>
              <th style="width:70px">Actions</th>
            </tr>
          </thead>
          <tbody id="frTbody">
            ${students.map((s, i) => this._studentRow(s, i + 1, getResult(s.id), batch)).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Wire total marks change (inline in meta strip not applicable here — marks set in modal)

    // ── Collect all rows for keyboard nav ──────────────────────
    const allRows = [...area.querySelectorAll('tbody tr[data-student-id]')];

    // Wire inline inputs (marks & date) → live status update + auto-fill + keyboard nav
    allRows.forEach((row, rowIdx) => {
      const sid     = row.dataset.studentId;
      const marksEl = row.querySelector('.fr-marks-cell');
      const dateEl  = row.querySelector('.fr-date-cell');

      const updateBadge = () => {
        const marksVal = marksEl?.value?.trim() || '';
        const dateVal  = dateEl?.value?.trim()  || '';
        const badge    = row.querySelector('.fr-status-badge');
        if (badge) badge.outerHTML = this._statusBadge(marksVal, dateVal, this._passingMarks);
      };
      marksEl?.addEventListener('input', () => {
        updateBadge();
        const v = parseFloat(marksEl.value);
        if (!isNaN(v) && v > this._totalMarks) {
          marksEl.value = this._totalMarks;
          marksEl.style.boxShadow = '0 0 0 2px var(--red)';
          setTimeout(() => marksEl.style.boxShadow = '', 800);
        } else {
          marksEl.style.boxShadow = '';
        }
      });
      dateEl?.addEventListener('change', updateBadge);

      dateEl?.addEventListener('change', () => {
        if (rowIdx === 0 && dateEl.value) {
          allRows.slice(1).forEach(otherRow => {
            const otherDate = otherRow.querySelector('.fr-date-cell');
            if (otherDate && !otherDate.value) {
              otherDate.value = dateEl.value;
              const otherMarks = otherRow.querySelector('.fr-marks-cell')?.value?.trim() || '';
              const badge = otherRow.querySelector('.fr-status-badge');
              if (badge) badge.outerHTML = this._statusBadge(otherMarks, dateEl.value, this._passingMarks);
              this._saveInlineResult(otherRow, otherRow.dataset.studentId);
            }
          });
        }
        this._saveInlineResult(row, sid);
      });

      marksEl?.addEventListener('blur', () => this._saveInlineResult(row, sid));

      const navigate = (e, cellType) => {
        const isDate  = cellType === 'date';
        const isMarks = cellType === 'marks';
        let target = null;
        if (e.key === 'ArrowRight' && isDate) {
          target = marksEl;
        } else if (e.key === 'ArrowLeft' && isMarks) {
          target = dateEl;
        } else if ((e.key === 'ArrowDown' || e.key === 'Enter') && rowIdx < allRows.length - 1) {
          const nextRow = allRows[rowIdx + 1];
          target = isDate ? nextRow.querySelector('.fr-date-cell') : nextRow.querySelector('.fr-marks-cell');
        } else if (e.key === 'ArrowUp' && rowIdx > 0) {
          const prevRow = allRows[rowIdx - 1];
          target = isDate ? prevRow.querySelector('.fr-date-cell') : prevRow.querySelector('.fr-marks-cell');
        } else { return; }
        if (target) { e.preventDefault(); target.focus(); if (target.type === 'number') target.select(); }
      };

      dateEl?.addEventListener('keydown',  e => navigate(e, 'date'));
      marksEl?.addEventListener('keydown', e => navigate(e, 'marks'));
    });

    // Delete buttons
    area.querySelectorAll('[data-action="delete-result"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const sid = btn.dataset.studentId;
        this._deleteResult(sid, container);
      });
    });

    // Edit buttons (inline table) — find saved result by studentId+batchId and open edit modal
    area.querySelectorAll('[data-action="edit-inline-result"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const sid = btn.dataset.studentId;
        const { batchId, subjectId } = this._sel;
        const allResults = AppState.get(RESULTS_KEY) || [];
        const result = allResults.find(r =>
          r.studentId === sid &&
          r.batchId   === batchId &&
          (r.subjectId || '') === (subjectId || '')
        );
        if (result?.id) {
          this._openEditForm(result.id, container);
        } else {
          // No saved result yet — open edit form with a temp save first
          const student = (AppState.get('students') || []).find(s => s.id === sid);
          const name = student?.studentName || [student?.firstName, student?.lastName].filter(Boolean).join(' ') || '—';
          Toast.error(`No saved result for ${name} yet. Enter marks first.`);
        }
      });
    });
  },

  // ── Single student row HTML ───────────────────────────────────
  _studentRow(student, index, result, batch) {
    const marks   = result?.marks    != null ? result.marks    : '';
    const date    = result?.examDate  || '';
    const passing = this._passingMarks;
    const name    = student.studentName
                    || [student.firstName, student.lastName].filter(Boolean).join(' ')
                    || '—';
    const rollNo  = student.rollNo || '—';

    // Campus & Session from batch
    const allCampuses = AppState.get('campuses') || [];
    const campus = batch?.campusId ? allCampuses.find(c => c.id === batch.campusId) : null;
    const campusName = campus ? (campus.campusName || '').replace(/\s*campus$/i,'').trim() || campus.campusName : '—';
    const session = batch?.sessionPeriod || '—';

    // Batch number only (last segment)
    const batchParts = (batch?.batchName || '').split('-');
    const batchNo = batchParts.length > 1 ? 'Batch ' + batchParts[batchParts.length - 1] : (batch?.batchName || '—');

    return `
      <tr data-student-id="${student.id}">
        <td style="color:var(--t3);font-size:11.5px">${index}</td>
        <td style="font-weight:600">${name}</td>
        <td style="color:var(--t3);font-size:12px">${rollNo}</td>
        <td style="color:var(--t3);font-size:12px">${campusName}</td>
        <td style="color:var(--t3);font-size:12px">${session}</td>
        <td style="font-size:12px;font-weight:600;color:var(--t2)">${batchNo}</td>
        <td>
          <input type="date" class="fr-cell-input fr-date-cell"
                 value="${date}" title="Exam date for this student" />
        </td>
        <td>
          <input type="number" class="fr-cell-input fr-marks-cell"
                 min="0" max="${this._totalMarks}"
                 value="${marks !== '' ? marks : ''}"
                 placeholder="—" title="Marks obtained" />
        </td>
        <td>
          ${this._statusBadge(String(marks), date, passing)}
        </td>
        <td>
          <div style="display:flex;gap:4px;align-items:center">
            <button class="fr-act-btn fr-edit-btn" data-action="edit-inline-result"
                    data-student-id="${student.id}" title="Edit result">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="fr-act-btn fr-del-btn" data-action="delete-result"
                    data-student-id="${student.id}" title="Clear result">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  },

  // ── Get filtered rows (used by export + table render) ─────────
  _getFilteredRows(container) {
    const allResults  = AppState.get(RESULTS_KEY) || [];
    const allStudents = AppState.get('students')   || [];
    const allBatches  = AppState.get('batches')    || [];
    const allCampuses = AppState.get('campuses')   || [];
    const allSubjects = AppState.get('subjects')   || [];
    const search = (container.querySelector('#frAllSearch')?.value || '').toLowerCase().trim();

    // ── Helper: parse batchName parts (same as enrolmentUI) ──
    const parseBatchName = (batchName) => {
      if (!batchName) return { subject: '—', batchNo: '—', session: '—' };
      const parts = batchName.split('-');
      return {
        subject: parts[0] || '—',
        batchNo: parts[parts.length - 1] || '—',
        session: parts.length >= 3 ? parts.slice(1, parts.length - 1).join('-') : '—',
      };
    };

    let rows = allResults.map(r => {
      const student = allStudents.find(s => s.id === r.studentId);
      const batch   = allBatches.find(b => b.id === r.batchId);
      const campus  = batch?.campusId ? allCampuses.find(c => c.id === batch.campusId) : null;
      const subject = r.subjectId ? allSubjects.find(s => s.id === r.subjectId) : null;
      const name    = student?.studentName
                      || [student?.firstName, student?.lastName].filter(Boolean).join(' ')
                      || '—';
      const parsed  = parseBatchName(batch?.batchName || r.batchName || '');
      const passing = r.passingMarks || Math.ceil((r.totalMarks || 100) * 0.5);
      const status  = r.marks != null && r.marks >= passing ? 'pass'
                    : r.marks != null && r.marks <  passing ? 'fail'
                    : r.examDate ? 'absent' : 'pending';
      const campusName = campus ? (campus.campusName || '').replace(/\s*campus$/i,'').trim() || campus.campusName : '—';
      return {
        ...r,
        studentName: name,
        campusName,
        session:     parsed.session,
        subjectCode: subject?.subjectCode || subject?.subjectName || parsed.subject || '—',
        batchNo:     parsed.batchNo,
        status,
        passing,
      };
    });

    // Apply multi-select filters
    if (this._filterCampus.length)  rows = rows.filter(r => this._filterCampus.includes(r.campusName));
    if (this._filterSession.length) rows = rows.filter(r => this._filterSession.includes(r.session));
    if (this._filterSubject.length) rows = rows.filter(r => this._filterSubject.includes(r.subjectCode));
    if (this._filterBatch.length)   rows = rows.filter(r => this._filterBatch.includes(r.batchNo));
    if (this._filterStatus.length)  rows = rows.filter(r => this._filterStatus.includes(r.status));
    if (search) rows = rows.filter(r =>
      r.studentName.toLowerCase().includes(search) ||
      r.batchNo.toLowerCase().includes(search)
    );

    rows.sort((a, b) => (a.studentName || '').localeCompare(b.studentName || ''));
    return rows;
  },

  // ── Render ALL saved results ───────────────────────────────────
  _renderAllResults(container) {
    const area = container.querySelector('#frAllTableArea');
    if (!area) return;

    const allResults = AppState.get(RESULTS_KEY) || [];

    // Repopulate dynamic filter dropdowns from ALL data (unfiltered)
    const allBatches  = AppState.get('batches')  || [];
    const allCampuses = AppState.get('campuses') || [];
    const allStudents = AppState.get('students') || [];
    const allSubjects = AppState.get('subjects') || [];
    const parseBN = (bn) => {
      if (!bn) return { subject:'—', batchNo:'—', session:'—' };
      const p = bn.split('-');
      return { subject:p[0]||'—', batchNo:p[p.length-1]||'—', session:p.length>=3?p.slice(1,p.length-1).join('-'):'—' };
    };

    const allEnriched = allResults.map(r => {
      const batch   = allBatches.find(b => b.id === r.batchId);
      const campus  = batch?.campusId ? allCampuses.find(c => c.id === batch.campusId) : null;
      const subject = r.subjectId ? allSubjects.find(s => s.id === r.subjectId) : null;
      const parsed  = parseBN(batch?.batchName || '');
      return {
        campusName:  campus ? (campus.campusName||'').replace(/\s*campus$/i,'').trim()||campus.campusName : '—',
        session:     parsed.session,
        subjectCode: subject?.subjectCode || subject?.subjectName || parsed.subject || '—',
        batchNo:     parsed.batchNo,
      };
    });

    this._repopDynDropdown(container, 'frMsCampusDropdown',  'fr-ms-campus-cb',  allEnriched.map(r=>r.campusName),  this._filterCampus);
    this._repopDynDropdown(container, 'frMsSessionDropdown', 'fr-ms-session-cb', allEnriched.map(r=>r.session),     this._filterSession);
    this._repopDynDropdown(container, 'frMsSubjectDropdown', 'fr-ms-subject-cb', allEnriched.map(r=>r.subjectCode), this._filterSubject);
    this._repopDynDropdown(container, 'frMsBatchDropdown',   'fr-ms-batch-cb',   allEnriched.map(r=>r.batchNo),     this._filterBatch);

    const rows = this._getFilteredRows(container);

    const countEl = container.querySelector('#frAllCount');
    if (countEl) countEl.textContent = `${rows.length} record${rows.length !== 1 ? 's' : ''}`;

    if (!rows.length) {
      area.innerHTML = `
        <div class="fr-empty" style="padding:48px 24px">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.3" style="color:var(--t4);margin-bottom:10px">
            <path d="M9 11l3 3L22 4"/>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
          <div style="font-size:13.5px;font-weight:600;color:var(--t2)">No results saved yet</div>
          <div style="font-size:12px;color:var(--t3);margin-top:4px">
            Use "Add Result" above to record exam results
          </div>
        </div>`;
      return;
    }

    // ── Stats ─────────────────────────────────────────────────────
    const totalCount   = rows.length;
    const passCount    = rows.filter(r => r.status === 'pass').length;
    const failCount    = rows.filter(r => r.status === 'fail').length;
    const absentCount  = rows.filter(r => r.status === 'absent').length;
    const pendingCount = rows.filter(r => r.status === 'pending').length;

    // Pass rate = pass / (pass + fail)  — only among appeared students
    const appearedCount = passCount + failCount;
    const passRate      = appearedCount > 0 ? Math.round((passCount / appearedCount) * 100) : 0;

    // Appeared % = (pass + fail) / total
    const appearedPct   = totalCount > 0 ? Math.round((appearedCount / totalCount) * 100) : 0;

    // Bar color thresholds
    const passBarColor  = passRate >= 80 ? 'var(--green)' : passRate >= 60 ? 'var(--yellow)' : 'var(--red)';
    const passNumColor  = passRate >= 80 ? 'var(--green)' : passRate >= 60 ? 'var(--yellow)' : 'var(--red)';

    const appearedBarColor = appearedPct >= 80 ? 'var(--green)' : appearedPct >= 60 ? 'var(--yellow)' : 'var(--red)';
    const appearedNumColor = appearedPct >= 80 ? 'var(--green)' : appearedPct >= 60 ? 'var(--yellow)' : 'var(--red)';

    const statsStrip = `
      <div class="fr-stats-strip">

        <!-- Left: count boxes -->
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

        <!-- Right: rate blocks -->
        <div style="display:flex;align-items:center;gap:0;margin-left:auto">

          <div class="fr-stat-divider"></div>

          <!-- Pass Rate -->
          <div class="fr-stat-rate-block">
            <div class="fr-stat-rate-title">Pass Rate</div>
            <div class="fr-stat-rate-bar-wrap">
              <div class="fr-stat-rate-bar" style="width:${passRate}%;background:${passBarColor}"></div>
            </div>
            <div class="fr-stat-rate-footer">
              <span class="fr-stat-rate-pct" style="color:${passNumColor}">${passRate}%</span>
              <span class="fr-stat-rate-sub">pass / appeared (${passCount}/${appearedCount})</span>
            </div>
          </div>

          <div class="fr-stat-divider"></div>

          <!-- Appeared -->
          <div class="fr-stat-rate-block">
            <div class="fr-stat-rate-title">Appeared</div>
            <div class="fr-stat-rate-bar-wrap">
              <div class="fr-stat-rate-bar" style="width:${appearedPct}%;background:${appearedBarColor}"></div>
            </div>
            <div class="fr-stat-rate-footer">
              <span class="fr-stat-rate-pct" style="color:${appearedNumColor}">${appearedPct}%</span>
              <span class="fr-stat-rate-sub">appeared / total (${appearedCount}/${totalCount})</span>
            </div>
          </div>

        </div>
      </div>
    `;

    area.innerHTML = statsStrip + `
      <div style="overflow-x:auto;border:1px solid var(--border);border-top:none;border-radius:0 0 12px 12px;overflow:hidden">
        <table class="fr-table" style="table-layout:fixed;width:100%">
          <colgroup>
            <col style="width:40px"/>        <!-- # -->
            <col style="width:auto"/>         <!-- Student — flex fills remaining -->
            <col style="width:90px"/>         <!-- Campus -->
            <col style="width:90px"/>         <!-- Session -->
            <col style="width:80px"/>         <!-- Subject -->
            <col style="width:70px"/>         <!-- Batch -->
            <col style="width:115px"/>        <!-- Exam Date -->
            <col style="width:115px"/>        <!-- Marks -->
            <col style="width:85px"/>         <!-- Status -->
            <col style="width:70px"/>         <!-- Actions -->
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              <th>Student</th>
              <th>Campus</th>
              <th>Session</th>
              <th>Subject</th>
              <th>Batch</th>
              <th>Exam Date</th>
              <th>Marks</th>
              <th>Status</th>
              <th style="text-align:right;padding-right:14px">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, i) => {
              const statusBadge = r.status === 'pass'
                ? `<span class="fr-badge fr-badge-pass">Pass</span>`
                : r.status === 'fail'
                ? `<span class="fr-badge fr-badge-fail">Fail</span>`
                : r.status === 'absent'
                ? `<span class="fr-badge fr-badge-absent">Absent</span>`
                : `<span class="fr-badge fr-badge-blank">Pending</span>`;

              const marksDisplay = r.marks != null
                ? `<span style="font-weight:700;font-family:var(--font-mono)">${r.marks}</span>
                   <span style="color:var(--t3);font-size:11px"> / ${r.totalMarks || 100}</span>`
                : `<span style="color:var(--t4)">—</span>`;

              return `
                <tr>
                  <td style="color:var(--t3);font-size:11.5px">${i + 1}</td>
                  <td style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                      title="${r.studentName}">${r.studentName}</td>
                  <td style="font-size:12px;color:var(--t3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.campusName}</td>
                  <td style="font-size:12px;color:var(--t3);white-space:nowrap">${r.session}</td>
                  <td style="white-space:nowrap">
                    <span style="font-family:var(--font-mono);font-size:12px;
                                 font-weight:700;color:var(--blue)">${r.subjectCode}</span>
                  </td>
                  <td style="font-size:12.5px;font-weight:600;color:var(--t2);white-space:nowrap">${r.batchNo}</td>
                  <td style="font-size:12px;color:var(--t2);white-space:nowrap">${r.examDate || '—'}</td>
                  <td style="white-space:nowrap">${marksDisplay}</td>
                  <td>${statusBadge}</td>
                  <td>
                    <div style="display:flex;gap:4px;align-items:center;justify-content:flex-end">
                      <button class="fr-act-btn fr-edit-btn"
                              data-action="edit-result"
                              data-id="${r.id}"
                              title="Edit result">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button class="fr-act-btn fr-del-btn"
                              data-action="delete-all-result"
                              data-id="${r.id}"
                              title="Delete">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6M14 11v6"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    // Wire delete buttons
    area.querySelectorAll('[data-action="delete-all-result"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        let all  = AppState.get(RESULTS_KEY) || [];
        all      = all.filter(r => r.id !== id);
        AppState.set(RESULTS_KEY, all);
        Toast.success('Result deleted.');
        this._renderAllResults(container);
      });
    });

    // Wire edit buttons
    area.querySelectorAll('[data-action="edit-result"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        this._openEditForm(id, container);
      });
    });
  },

  // ── Single-student edit modal ──────────────────────────────────
  _openEditForm(resultId, container) {
    const allResults = AppState.get(RESULTS_KEY) || [];
    const result     = allResults.find(r => r.id === resultId);
    if (!result) { Toast.error('Result not found.'); return; }

    const allStudents = AppState.get('students') || [];
    const allBatches  = AppState.get('batches')  || [];
    const student = allStudents.find(s => s.id === result.studentId);
    const batch   = allBatches.find(b => b.id === result.batchId);
    const name    = student?.studentName || [student?.firstName, student?.lastName].filter(Boolean).join(' ') || '—';
    const totalVal  = result.totalMarks   || this._totalMarks;
    const passVal   = result.passingMarks || Math.ceil(totalVal * 0.5);

    Modal.open({
      title: 'Edit Result',
      subtitle: name,
      size: 'sm',
      body: `
        <div style="display:flex;flex-direction:column;gap:14px">
          <!-- Student info strip -->
          <div style="padding:10px 14px;background:var(--surface2);border:1px solid var(--border);
                      border-radius:10px;font-size:12.5px;color:var(--t2)">
            <div><span style="color:var(--t3)">Student: </span><strong>${name}</strong></div>
            <div style="margin-top:3px"><span style="color:var(--t3)">Batch: </span>${batch?.batchName || '—'}</div>
          </div>

          <!-- Total / Passing -->
          <div class="fr-marks-header" style="margin-bottom:0">
            <div>
              <label style="color:var(--t3);font-size:11.5px;margin-right:4px">Total Marks</label>
              <input id="editTotal" class="fr-marks-input" type="number" min="1" value="${totalVal}" style="width:80px"/>
            </div>
            <div>
              <label style="color:var(--t3);font-size:11.5px;margin-right:4px">Passing (50%)</label>
              <span id="editPassing" style="font-weight:700">${passVal}</span>
              <span class="fr-auto-badge" style="margin-left:6px">Auto</span>
            </div>
          </div>

          <!-- Date + Marks -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div>
              <label style="font-size:11.5px;color:var(--t3);display:block;margin-bottom:4px">Exam Date</label>
              <input id="editDate" type="date" class="fr-marks-input" style="width:100%"
                     value="${result.examDate || ''}"/>
            </div>
            <div>
              <label style="font-size:11.5px;color:var(--t3);display:block;margin-bottom:4px">Marks Obtained</label>
              <input id="editMarks" type="number" class="fr-marks-input" style="width:100%"
                     min="0" max="${totalVal}" value="${result.marks != null ? result.marks : ''}"
                     placeholder="—"/>
            </div>
          </div>
        </div>
      `,
      actions: [
        { label: 'Cancel', variant: 'ghost', close: true },
        {
          label:   'Save Changes',
          variant: 'primary',
          close:   false,
          handler: (modalEl) => {
            const totalV  = parseInt(modalEl.querySelector('#editTotal')?.value)  || 100;
            const passV   = Math.ceil(totalV * 0.5);
            const dateV   = modalEl.querySelector('#editDate')?.value?.trim()  || '';
            const marksV  = modalEl.querySelector('#editMarks')?.value?.trim() || '';

            const updated = {
              examDate:     dateV   || null,
              marks:        marksV !== '' ? parseFloat(marksV) : null,
              totalMarks:   totalV,
              passingMarks: passV,
              updatedAt:    new Date().toISOString(),
            };

            let all = AppState.get(RESULTS_KEY) || [];
            const idx = all.findIndex(r => r.id === resultId);
            if (idx >= 0) all[idx] = { ...all[idx], ...updated };
            AppState.set(RESULTS_KEY, all);

            Modal.closeAll();
            Toast.success('Result updated.');
            this._renderAllResults(container);
          },
        },
      ],
      onOpen: (modalEl) => {
        const totalInput  = modalEl.querySelector('#editTotal');
        const passingSpan = modalEl.querySelector('#editPassing');
        totalInput?.addEventListener('input', () => {
          const v = parseInt(totalInput.value) || 100;
          if (passingSpan) passingSpan.textContent = Math.ceil(v * 0.5);
          const marksEl = modalEl.querySelector('#editMarks');
          if (marksEl) marksEl.max = v;
        });
      },
    });
  },

  // ── Status badge logic ─────────────────────────────────────────
  // Rules:
  //   - No date AND no marks → blank
  //   - Has date BUT no marks → Absent
  //   - Has marks AND marks >= passing → Pass
  //   - Has marks AND marks < passing → Fail
  _statusBadge(marksStr, dateStr, passing) {
    const hasDate  = (dateStr  || '').trim() !== '';
    const hasMarks = (marksStr || '').trim() !== '' && marksStr !== 'undefined';
    const marks    = hasMarks ? parseFloat(marksStr) : NaN;

    let cls, label;

    if (!hasDate && !hasMarks) {
      cls = 'fr-badge-blank'; label = '—';
    } else if (hasDate && !hasMarks) {
      cls = 'fr-badge-absent'; label = 'Absent';
    } else if (!isNaN(marks) && marks >= passing) {
      cls = 'fr-badge-pass'; label = 'Pass';
    } else {
      cls = 'fr-badge-fail'; label = 'Fail';
    }

    return `<span class="fr-badge ${cls} fr-status-badge">${label}</span>`;
  },

  // ── Save inline result to AppState ───────────────────────────
  _saveInlineResult(row, studentId) {
    const marksEl = row.querySelector('.fr-marks-cell');
    const dateEl  = row.querySelector('.fr-date-cell');

    const marksStr = marksEl?.value?.trim() || '';
    const dateStr  = dateEl?.value?.trim()  || '';

    const { batchId, subjectId } = this._sel;
    const allResults = AppState.get(RESULTS_KEY) || [];
    const existingIdx = allResults.findIndex(r =>
      r.studentId === studentId &&
      r.batchId   === batchId   &&
      (r.subjectId || '') === (subjectId || '')
    );

    // Build result object
    const entry = {
      studentId,
      batchId,
      subjectId:    subjectId || null,
      examDate:     dateStr   || null,
      marks:        marksStr !== '' ? parseFloat(marksStr) : null,
      totalMarks:   this._totalMarks,
      passingMarks: this._passingMarks,
      updatedAt:    new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      allResults[existingIdx] = { ...allResults[existingIdx], ...entry };
    } else {
      entry.id        = generateID('fres');
      entry.createdAt = new Date().toISOString();
      allResults.push(entry);
    }

    AppState.set(RESULTS_KEY, allResults);
  },

  // ── Delete a student's result ─────────────────────────────────
  _deleteResult(studentId, container) {
    const { batchId, subjectId } = this._sel;
    const allResults = (AppState.get(RESULTS_KEY) || []).filter(r => !(
      r.studentId === studentId &&
      r.batchId   === batchId   &&
      (r.subjectId || '') === (subjectId || '')
    ));
    AppState.set(RESULTS_KEY, allResults);
    Toast.success('Result cleared.');
    this._renderTable(container);
  },

  // ── "Add Result" — multi-step modal ──────────────────────────
  // Step 1: Criteria selection (Campus → Discipline → Level → Session → Subject → Batch)
  // Step 2: Student marks entry (after batch is selected)
  // Save: data saved → main table refreshed
  _openAddForm(container) {
    // Local state for the modal's cascade selectors
    const modalSel = {
      campusId: '', disciplineId: '', levelId: '',
      session: '', subjectId: '', batchId: '',
    };

    const campuses = AppState.get('campuses') || [];
    const campusOpts = campuses.map(c =>
      `<option value="${c.id}">${c.campusName.replace(/\s*campus$/i,'').trim()}</option>`
    ).join('');

    Modal.open({
      title: 'Add / Edit Final Results',
      size: 'lg',
      body: `
        <!-- ── Step 1: Criteria ── -->
        <div id="frmStep1">
          <div class="fr-form-section" style="margin-top:0">Select Batch</div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
            <div>
              <label style="font-size:11.5px;color:var(--t3);display:block;margin-bottom:4px">Campus</label>
              <select id="frmCampus" class="fr-filter-sel" style="width:100%">
                <option value="">Select Campus…</option>${campusOpts}
              </select>
            </div>
            <div>
              <label style="font-size:11.5px;color:var(--t3);display:block;margin-bottom:4px">Discipline</label>
              <select id="frmDiscipline" class="fr-filter-sel" style="width:100%" disabled>
                <option value="">Select Discipline…</option>
              </select>
            </div>
            <div>
              <label style="font-size:11.5px;color:var(--t3);display:block;margin-bottom:4px">Level</label>
              <select id="frmLevel" class="fr-filter-sel" style="width:100%" disabled>
                <option value="">Select Level…</option>
              </select>
            </div>
            <div>
              <label style="font-size:11.5px;color:var(--t3);display:block;margin-bottom:4px">Session</label>
              <select id="frmSession" class="fr-filter-sel" style="width:100%" disabled>
                <option value="">Select Session…</option>
              </select>
            </div>
            <div>
              <label style="font-size:11.5px;color:var(--t3);display:block;margin-bottom:4px">Subject</label>
              <select id="frmSubject" class="fr-filter-sel" style="width:100%" disabled>
                <option value="">Select Subject…</option>
              </select>
            </div>
            <div>
              <label style="font-size:11.5px;color:var(--t3);display:block;margin-bottom:4px">Batch</label>
              <select id="frmBatch" class="fr-filter-sel" style="width:100%" disabled>
                <option value="">Select Batch…</option>
              </select>
            </div>
          </div>

          <!-- Students area (loads after batch selected) -->
          <div id="frmStudentArea"></div>
        </div>
      `,
      actions: [
        { label: 'Cancel', variant: 'ghost', close: true },
        {
          label:    'Save Results',
          variant:  'primary',
          close:    false,
          id:       'frmSaveBtn',
          disabled: true,
          handler:  (modalEl) => this._handleBulkSave(modalEl, modalSel, container),
        },
      ],
      onOpen: (modalEl) => {
        const campusSel     = modalEl.querySelector('#frmCampus');
        const disciplineSel = modalEl.querySelector('#frmDiscipline');
        const levelSel      = modalEl.querySelector('#frmLevel');
        const sessionSel    = modalEl.querySelector('#frmSession');
        const subjectSel    = modalEl.querySelector('#frmSubject');
        const batchSel      = modalEl.querySelector('#frmBatch');
        const saveBtn       = modalEl.querySelector('[data-modal-action="frmSaveBtn"]')
                              || [...modalEl.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save Results');
        const studentArea   = modalEl.querySelector('#frmStudentArea');

        const resetSel = (sel, placeholder) => {
          sel.innerHTML = `<option value="">${placeholder}</option>`;
          sel.disabled = true;
        };

        const loadStudents = () => {
          const { batchId, subjectId } = modalSel;
          if (!batchId) { studentArea.innerHTML = ''; if (saveBtn) saveBtn.disabled = true; return; }

          const enrolments  = (AppState.get('enrolments') || [])
            .filter(e => e.batchId === batchId && e.status !== 'dropped');
          const studentIds  = enrolments.map(e => e.studentId);
          const allStudents = AppState.get('students') || [];
          const students    = studentIds.map(sid => allStudents.find(s => s.id === sid)).filter(Boolean);
          const allResults  = AppState.get(RESULTS_KEY) || [];
          const totalVal    = parseInt(modalEl.querySelector('#frmTotal')?.value) || this._totalMarks;
          const passVal     = Math.ceil(totalVal * 0.5);
          const batch       = AppState.findById('batches', batchId);
          const subject     = subjectId ? AppState.findById('subjects', subjectId) : null;

          if (!students.length) {
            studentArea.innerHTML = `
              <div class="fr-empty" style="padding:32px">
                <div style="font-size:13.5px;font-weight:600;color:var(--t2)">No enrolled students</div>
                <div style="font-size:12px;color:var(--t3);margin-top:4px">Enroll students in this batch first.</div>
              </div>`;
            if (saveBtn) saveBtn.disabled = true;
            return;
          }

          const rows = students.map((s, i) => {
            const result = allResults.find(r =>
              r.studentId === s.id &&
              r.batchId   === batchId &&
              (r.subjectId || '') === (subjectId || '')
            );
            const name   = s.studentName || [s.firstName, s.lastName].filter(Boolean).join(' ') || '—';
            const rollNo = s.rollNo || s.studentId || '—';
            return `
              <tr data-sid="${s.id}">
                <td style="font-size:11.5px;color:var(--t3)">${i + 1}</td>
                <td style="font-weight:600;font-size:13px">${name}</td>
                <td style="font-size:12px;color:var(--t3)">${rollNo}</td>
                <td>
                  <input type="date" class="fr-cell-input frm-date"
                         value="${result?.examDate || ''}" style="width:130px" />
                </td>
                <td>
                  <input type="number" class="fr-cell-input frm-marks"
                         min="0" max="${totalVal}"
                         value="${result?.marks != null ? result.marks : ''}"
                         placeholder="—" style="width:90px" />
                </td>
              </tr>`;
          }).join('');

          studentArea.innerHTML = `
            <!-- Marks settings -->
            <div class="fr-marks-header" style="margin-bottom:12px">
              <div>
                <label style="color:var(--t3);font-size:11.5px;margin-right:4px">Total Marks</label>
                <input id="frmTotal" class="fr-marks-input" type="number"
                       min="1" value="${totalVal}" style="width:80px" />
              </div>
              <div>
                <label style="color:var(--t3);font-size:11.5px;margin-right:4px">Passing (50%)</label>
                <span id="frmPassing" style="font-weight:700">${passVal}</span>
                <span class="fr-auto-badge" style="margin-left:6px">Auto</span>
              </div>
              <div style="margin-left:auto;font-size:11.5px;color:var(--t3)">
                ${batch?.batchName || ''}${subject ? ' · ' + (subject.subjectCode || subject.subjectName) : ''}
                — <strong style="color:var(--t1)">${students.length} student${students.length !== 1 ? 's' : ''}</strong>
              </div>
            </div>

            <!-- Student table -->
            <div style="overflow-x:auto;border:1px solid var(--border);border-radius:10px;max-height:340px;overflow-y:auto">
              <table class="fr-table">
                <thead>
                  <tr>
                    <th style="width:36px">#</th>
                    <th>Student</th>
                    <th>Roll No</th>
                    <th style="width:140px">Exam Date</th>
                    <th style="width:110px">Marks</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          `;

          // Wire total marks live update inside modal
          const totalInput = studentArea.querySelector('#frmTotal');
          const passingSpan = studentArea.querySelector('#frmPassing');
          totalInput?.addEventListener('input', () => {
            const v = parseInt(totalInput.value) || 100;
            if (passingSpan) passingSpan.textContent = Math.ceil(v * 0.5);
            studentArea.querySelectorAll('.frm-marks').forEach(inp => inp.max = v);
          });

          // ── Keyboard navigation inside modal table ─────────────
          // ArrowUp   → same column, row above
          // ArrowDown → same column, row below
          // ArrowLeft → date cell (same row)
          // ArrowRight→ marks cell (same row)
          const allModalRows = [...studentArea.querySelectorAll('tbody tr[data-sid]')];
          allModalRows.forEach((row, rowIdx) => {
            const dateEl  = row.querySelector('.frm-date');
            const marksEl = row.querySelector('.frm-marks');

            const navigate = (e, cellType) => {
              const isDate  = cellType === 'date';
              let target = null;

              if (e.key === 'ArrowRight' && isDate) {
                target = marksEl;
              } else if (e.key === 'ArrowLeft' && !isDate) {
                target = dateEl;
              } else if (e.key === 'ArrowDown' && rowIdx < allModalRows.length - 1) {
                const next = allModalRows[rowIdx + 1];
                target = isDate ? next.querySelector('.frm-date') : next.querySelector('.frm-marks');
              } else if (e.key === 'ArrowUp' && rowIdx > 0) {
                const prev = allModalRows[rowIdx - 1];
                target = isDate ? prev.querySelector('.frm-date') : prev.querySelector('.frm-marks');
              } else if (e.key === 'Enter' && !isDate) {
                // Enter on marks → next row's marks
                if (rowIdx < allModalRows.length - 1) {
                  target = allModalRows[rowIdx + 1].querySelector('.frm-marks');
                }
              } else { return; }

              if (target) {
                e.preventDefault();
                target.focus();
                if (target.type === 'number') target.select();
              }
            };

            dateEl?.addEventListener('keydown',  e => navigate(e, 'date'));
            marksEl?.addEventListener('keydown', e => navigate(e, 'marks'));
          });

          if (saveBtn) saveBtn.disabled = false;
        };

        // Cascade: Campus
        campusSel.addEventListener('change', () => {
          modalSel.campusId = campusSel.value;
          modalSel.disciplineId = modalSel.levelId = modalSel.session = modalSel.subjectId = modalSel.batchId = '';
          this._populateDisciplines(disciplineSel, campusSel.value);
          disciplineSel.disabled = !campusSel.value;
          resetSel(levelSel, 'Select Level…');
          resetSel(sessionSel, 'Select Session…');
          resetSel(subjectSel, 'Select Subject…');
          resetSel(batchSel, 'Select Batch…');
          studentArea.innerHTML = '';
          if (saveBtn) saveBtn.disabled = true;
        });

        // Cascade: Discipline
        disciplineSel.addEventListener('change', () => {
          modalSel.disciplineId = disciplineSel.value;
          modalSel.levelId = modalSel.session = modalSel.subjectId = modalSel.batchId = '';
          this._populateLevels(levelSel, disciplineSel.value);
          levelSel.disabled = !disciplineSel.value;
          resetSel(sessionSel, 'Select Session…');
          resetSel(subjectSel, 'Select Subject…');
          resetSel(batchSel, 'Select Batch…');
          studentArea.innerHTML = '';
          if (saveBtn) saveBtn.disabled = true;
        });

        // Cascade: Level
        levelSel.addEventListener('change', () => {
          modalSel.levelId = levelSel.value;
          modalSel.session = modalSel.subjectId = modalSel.batchId = '';
          // Temporarily set _sel.levelId so _populateSessions/_populateSubjects work
          const prevSel = { ...this._sel };
          this._sel = { ...this._sel, ...modalSel };
          this._populateSessions(sessionSel);
          this._populateSubjects(subjectSel, levelSel.value);
          this._sel = prevSel;
          sessionSel.disabled = !levelSel.value;
          subjectSel.disabled = !levelSel.value;
          resetSel(batchSel, 'Select Batch…');
          studentArea.innerHTML = '';
          if (saveBtn) saveBtn.disabled = true;
        });

        // Cascade: Session
        sessionSel.addEventListener('change', () => {
          modalSel.session = sessionSel.value;
          modalSel.batchId = '';
          const prevSel = { ...this._sel };
          this._sel = { ...this._sel, ...modalSel };
          this._populateBatches(batchSel);
          this._sel = prevSel;
          batchSel.disabled = !sessionSel.value;
          studentArea.innerHTML = '';
          if (saveBtn) saveBtn.disabled = true;
        });

        // Cascade: Subject
        subjectSel.addEventListener('change', () => {
          modalSel.subjectId = subjectSel.value;
          modalSel.batchId = '';
          const prevSel = { ...this._sel };
          this._sel = { ...this._sel, ...modalSel };
          this._populateBatches(batchSel);
          this._sel = prevSel;
          batchSel.disabled = !modalSel.session;
          studentArea.innerHTML = '';
          if (saveBtn) saveBtn.disabled = true;
        });

        // Batch selected → load students
        batchSel.addEventListener('change', () => {
          modalSel.batchId = batchSel.value;
          loadStudents();
        });
      },
    });
  },

  // ── Bulk save from modal ──────────────────────────────────────
  _handleBulkSave(modalEl, modalSel, container) {
    const { batchId, subjectId } = modalSel;
    if (!batchId) { Toast.error('Please select a batch first.'); return; }

    const totalVal  = parseInt(modalEl.querySelector('#frmTotal')?.value) || 100;
    const passVal   = Math.ceil(totalVal * 0.5);
    this._totalMarks   = totalVal;
    this._passingMarks = passVal;

    // Update main _sel so _renderTable shows correct batch
    this._sel = { ...this._sel, ...modalSel };

    let allResults = AppState.get(RESULTS_KEY) || [];
    let savedCount = 0;

    modalEl.querySelectorAll('tbody tr[data-sid]').forEach(row => {
      const sid      = row.dataset.sid;
      const marksStr = row.querySelector('.frm-marks')?.value?.trim() || '';
      const dateStr  = row.querySelector('.frm-date')?.value?.trim()  || '';

      // Skip completely empty rows
      if (!marksStr && !dateStr) return;

      const entry = {
        studentId:    sid,
        batchId,
        subjectId:    subjectId || null,
        examDate:     dateStr   || null,
        marks:        marksStr !== '' ? parseFloat(marksStr) : null,
        totalMarks:   totalVal,
        passingMarks: passVal,
        updatedAt:    new Date().toISOString(),
      };

      const idx = allResults.findIndex(r =>
        r.studentId === sid &&
        r.batchId   === batchId &&
        (r.subjectId || '') === (subjectId || '')
      );

      if (idx >= 0) {
        allResults[idx] = { ...allResults[idx], ...entry };
      } else {
        entry.id        = generateID('fres');
        entry.createdAt = new Date().toISOString();
        allResults.push(entry);
      }
      savedCount++;
    });

    AppState.set(RESULTS_KEY, allResults);
    Modal.closeAll();
    Toast.success(`Results saved for ${savedCount} student${savedCount !== 1 ? 's' : ''}.`);
    this._renderTable(container);
    this._renderAllResults(container);
  },

  // ── Get filter labels for export header ───────────────────────
  _getFilterLabels() {
    const labels = [];
    const allCampuses = AppState.get('campuses') || [];
    const allSubjects = AppState.get('subjects') || [];
    const allBatches  = AppState.get('batches')  || [];

    if (this._filterCampus.length) {
      labels.push({ key: 'Campus',  val: this._filterCampus.join(', ') });
    }
    if (this._filterSession.length) {
      labels.push({ key: 'Session', val: this._filterSession.join(', ') });
    }
    if (this._filterSubject.length) {
      labels.push({ key: 'Subject', val: this._filterSubject.join(', ') });
    }
    if (this._filterBatch.length) {
      labels.push({ key: 'Batch',   val: this._filterBatch.join(', ') });
    }
    if (this._filterStatus.length) {
      const statusMap = { pass:'Pass', fail:'Fail', absent:'Absent', pending:'Pending' };
      labels.push({ key: 'Status',  val: this._filterStatus.map(s => statusMap[s] || s).join(', ') });
    }
    if (!labels.length) {
      return [
        { key: 'Campus',  val: 'All Campuses'  },
        { key: 'Session', val: 'All Sessions'  },
        { key: 'Subject', val: 'All Subjects'  },
        { key: 'Batch',   val: 'All Batches'   },
        { key: 'Status',  val: 'All Statuses'  },
      ];
    }
    return labels;
  },

  // ── Build flat rows for export ─────────────────────────────────
  _buildExportRows(rows) {
    return rows.map(r => {
      const hasData = r.examDate || r.marks != null;
      return {
        'Campus':      r.campusName  || '—',
        'Session':     r.session     || '—',
        'Subject':     r.subjectCode || '—',
        'Batch':       r.batchNo     || '—',
        'Student':     r.studentName || '—',
        'Exam Date':   r.examDate    || '—',
        'Marks':       r.marks != null ? String(r.marks) : '—',
        'Total Marks': hasData ? (r.totalMarks ? String(r.totalMarks) : '100') : '—',
        'Status':      r.status === 'pass'   ? 'Pass'
                     : r.status === 'fail'   ? 'Fail'
                     : r.status === 'absent' ? 'Absent' : 'Pending',
      };
    });
  },

  // ── Export CSV ─────────────────────────────────────────────────
  _exportCSV(rows) {
    if (!rows.length) { alert('No results to export.'); return; }

    const data    = this._buildExportRows(rows);
    const headers = Object.keys(data[0]);
    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

    const filterLabels  = this._getFilterLabels();
    const filterLine    = filterLabels.map(f => `${f.key}: ${f.val}`).join(' | ');

    const metaLines = [
      `Final Results Report`,
      `Generated: ${dateStr} ${timeStr}`,
      `Filters: ${filterLine}`,
      `Total Records: ${rows.length}`,
      '',
    ].join('\n');

    const csvRows = [
      metaLines,
      headers.join(','),
      ...data.map(r => headers.map(h => `"${(r[h] || '').replace(/"/g,'""')}"`).join(',')),
    ];

    const blob = new Blob([csvRows.join('\n')], { type:'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `Final-Results-${dateStr.replace(/ /g,'-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // ── Export PDF ─────────────────────────────────────────────────
  _exportPDF(rows) {
    if (!rows.length) { alert('No results to export.'); return; }

    const data    = this._buildExportRows(rows);
    const headers = Object.keys(data[0]);
    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

    const passCount    = rows.filter(r => r.status === 'pass').length;
    const failCount    = rows.filter(r => r.status === 'fail').length;
    const absentCount  = rows.filter(r => r.status === 'absent').length;
    const pendCount    = rows.filter(r => r.status === 'pending').length;
    const appearedCount = passCount + failCount;
    const passRate     = appearedCount > 0 ? Math.round((passCount / appearedCount) * 100) : 0;
    const appearedPct  = rows.length   > 0 ? Math.round((appearedCount / rows.length) * 100) : 0;

    const passRateColor    = passRate   >= 80 ? '#16a34a' : passRate   >= 60 ? '#d97706' : '#dc2626';
    const appearedPctColor = appearedPct >= 80 ? '#16a34a' : appearedPct >= 60 ? '#d97706' : '#dc2626';
    const passRateBg       = passRate   >= 80 ? '#f0fdf4' : passRate   >= 60 ? '#fffbeb' : '#fef2f2';
    const appearedPctBg    = appearedPct >= 80 ? '#f0fdf4' : appearedPct >= 60 ? '#fffbeb' : '#fef2f2';

    const filterLabels = this._getFilterLabels();
    const filterHTML   = filterLabels.map(f =>
      `<span class="filter-chip"><span class="fk">${f.key}:</span> ${f.val}</span>`
    ).join('');

    const colWidths = {
      'Campus':'65px','Session':'65px','Subject':'55px','Batch':'45px',
      'Student':'120px','Exam Date':'75px','Marks':'55px',
      'Total Marks':'60px','Status':'55px',
    };

    const thCells = headers.map(h =>
      `<th style="width:${colWidths[h]||'70px'}">${h}</th>`
    ).join('');

    const tdRows = data.map((r, i) => {
      const statusColors = { 'Pass':'#16a34a','Fail':'#dc2626','Absent':'#d97706','Pending':'#64748b' };
      const statusBg     = { 'Pass':'#f0fdf4','Fail':'#fef2f2','Absent':'#fffbeb','Pending':'#f8fafc' };
      const s    = r['Status'];
      const sCol = statusColors[s] || '#64748b';
      const sBg  = statusBg[s]     || '#f8fafc';
      const cells = headers.map(h => {
        if (h === 'Status') return `<td><span style="color:${sCol};background:${sBg};padding:2px 8px;border-radius:6px;font-size:9px;font-weight:700">${r[h]}</span></td>`;
        return `<td>${r[h] || '—'}</td>`;
      }).join('');
      return `<tr class="${i % 2 === 0 ? 'even' : 'odd'}">${cells}</tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Final Results Report</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#1e293b;background:#fff;padding:18px 20px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #2563eb;padding-bottom:10px;margin-bottom:12px}
  .header-left .title{font-size:18px;font-weight:700;color:#1e40af;letter-spacing:-0.3px}
  .header-left .subtitle{font-size:10.5px;color:#64748b;margin-top:2px}
  .header-right{text-align:right;font-size:10px;color:#64748b;line-height:1.6}
  .header-right .date{font-weight:600;color:#1e293b;font-size:10.5px}

  /* Stats row */
  .stats-row{display:flex;align-items:stretch;gap:0;margin-bottom:10px;
             border:1px solid #e2e8f0;border-radius:10px;overflow:hidden}
  .stat-box{flex:1;padding:7px 10px;text-align:center;border-right:1px solid #e2e8f0;background:#f8fafc}
  .stat-box:last-child{border-right:none}
  .stat-box .num{font-size:16px;font-weight:700;color:#1e293b}
  .stat-box .lbl{font-size:8.5px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-top:1px}
  .stat-box.pass .num{color:#16a34a} .stat-box.pass{background:#f0fdf4}
  .stat-box.fail .num{color:#dc2626} .stat-box.fail{background:#fef2f2}
  .stat-box.absent .num{color:#d97706} .stat-box.absent{background:#fffbeb}

  /* Rate blocks */
  .rate-box{flex:1.6;padding:7px 14px;text-align:center;border-right:1px solid #e2e8f0;background:#fff}
  .rate-box:last-child{border-right:none}
  .rate-title{font-size:8.5px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
  .rate-bar-wrap{width:100%;height:5px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin-bottom:4px}
  .rate-bar{height:100%;border-radius:6px}
  .rate-footer{display:flex;align-items:baseline;justify-content:center;gap:5px}
  .rate-pct{font-size:14px;font-weight:700}
  .rate-sub{font-size:8.5px;color:#64748b}

  .filters-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;
               background:#f0f7ff;border:1px solid #bfdbfe;border-radius:8px;
               padding:7px 12px;margin-bottom:10px}
  .filters-label{font-size:9px;font-weight:700;color:#1e40af;text-transform:uppercase;
                 letter-spacing:0.6px;white-space:nowrap;margin-right:2px}
  .filter-chip{background:#dbeafe;color:#1d4ed8;font-size:9.5px;font-weight:500;
               padding:2px 9px;border-radius:10px;white-space:nowrap}
  .filter-chip .fk{font-weight:700}
  table{width:100%;border-collapse:collapse;font-size:9.5px}
  thead tr{background:#1e40af}
  thead th{color:#fff;font-weight:600;padding:6px;text-align:left;font-size:8.5px;
           text-transform:uppercase;letter-spacing:0.3px;white-space:nowrap}
  tbody tr.even{background:#fff}
  tbody tr.odd{background:#f8faff}
  tbody td{padding:5px 6px;border-bottom:1px solid #e2e8f0;color:#334155;vertical-align:middle}
  tbody td:nth-child(5){font-weight:600;color:#1e293b}
  .footer{margin-top:12px;padding-top:8px;border-top:1px solid #e2e8f0;
          display:flex;justify-content:space-between;font-size:9px;color:#94a3b8}
  @media print{body{padding:10px 12px}@page{size:A4 landscape;margin:8mm}.no-print{display:none}}
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <div class="title">Final Results Report</div>
      <div class="subtitle">Student Exam Results</div>
    </div>
    <div class="header-right">
      <div class="date">${dateStr}</div>
      <div>${timeStr}</div>
    </div>
  </div>

  <div class="stats-row">
    <div class="stat-box">
      <div class="num">${rows.length}</div><div class="lbl">Total</div>
    </div>
    <div class="stat-box pass">
      <div class="num">${passCount}</div><div class="lbl">Pass</div>
    </div>
    <div class="stat-box fail">
      <div class="num">${failCount}</div><div class="lbl">Fail</div>
    </div>
    <div class="stat-box absent">
      <div class="num">${absentCount}</div><div class="lbl">Absent</div>
    </div>
    <div class="stat-box">
      <div class="num">${pendCount}</div><div class="lbl">Pending</div>
    </div>
    <div class="rate-box">
      <div class="rate-title">Pass Rate</div>
      <div class="rate-bar-wrap">
        <div class="rate-bar" style="width:${passRate}%;background:${passRateColor}"></div>
      </div>
      <div class="rate-footer">
        <span class="rate-pct" style="color:${passRateColor}">${passRate}%</span>
        <span class="rate-sub">pass / appeared (${passCount}/${appearedCount})</span>
      </div>
    </div>
    <div class="rate-box">
      <div class="rate-title">Appeared</div>
      <div class="rate-bar-wrap">
        <div class="rate-bar" style="width:${appearedPct}%;background:${appearedPctColor}"></div>
      </div>
      <div class="rate-footer">
        <span class="rate-pct" style="color:${appearedPctColor}">${appearedPct}%</span>
        <span class="rate-sub">appeared / total (${appearedCount}/${rows.length})</span>
      </div>
    </div>
  </div>

  <div class="filters-row">
    <span class="filters-label">&#9660; Filters</span>
    ${filterHTML}
  </div>

  <table>
    <thead><tr>${thCells}</tr></thead>
    <tbody>${tdRows}</tbody>
  </table>

  <div class="footer">
    <span>Final Results &nbsp;|&nbsp; Exported ${dateStr} at ${timeStr}</span>
    <span>Total: ${rows.length} record${rows.length !== 1 ? 's' : ''}</span>
  </div>
  <div style="margin-top:8px;text-align:center;font-size:9px;color:#94a3b8">
    Powered by <strong style="color:#2563eb">Learnomist</strong>
  </div>

  <div class="no-print" style="margin-top:16px;text-align:center">
    <button onclick="window.print()"
      style="padding:8px 26px;background:#2563eb;color:#fff;border:none;border-radius:8px;
             font-size:13px;font-weight:600;cursor:pointer">
      Print / Save as PDF
    </button>
  </div>
</body>
</html>`;

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 600);
  },
};