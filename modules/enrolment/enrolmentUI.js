// ============================================================
// modules/enrolment/enrolmentUI.js
// Enrolment Module — Full UI (list, add, edit, filters, export)
// ============================================================

import { AppState }       from '../../utils/state.js';
import { Auth }           from '../../utils/auth.js';
import { Toast }          from '../../utils/helpers.js';
import {
  EnrolmentService,
  ensureEnrolmentKeys,
  ENROLMENT_STATUSES,
  FEE_STATUSES,
  STATUS_LABELS,
  FEE_LABELS,
  ENR_SUBJECT_STATUSES,
  ENR_SUBJECT_STATUS_LABELS,
} from './enrolmentService.js';

// ── Styles (injected once) ────────────────────────────────────
let _stylesInjected = false;
function injectStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const s = document.createElement('style');
  s.textContent = `
.enr-wrap{padding:20px;display:flex;flex-direction:column;gap:16px}

/* toolbar */
.enr-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.enr-search{flex:1;min-width:180px;background:var(--surface2);border:1px solid var(--border2);
  border-radius:var(--r-sm);color:var(--t1);font-size:13px;padding:8px 12px;outline:none;transition:border-color .15s}
.enr-search:focus{border-color:var(--blue)}
.enr-select{background:var(--surface2);border:1px solid var(--border2);border-radius:var(--r-sm);
  color:var(--t1);font-size:13px;padding:8px 10px;outline:none;cursor:pointer}
.enr-select:focus{border-color:var(--blue)}

/* buttons */
.enr-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:var(--r-sm);
  font-size:13px;font-weight:600;transition:opacity .15s,transform .15s;cursor:pointer;border:none;white-space:nowrap}
.enr-btn:hover:not(:disabled){opacity:.85;transform:translateY(-1px)}
.enr-btn:disabled{opacity:.4;cursor:not-allowed}
.enr-btn-primary{background:var(--blue);color:#fff}
.enr-btn-ghost{background:var(--surface3);color:var(--t2);border:1px solid var(--border2)}
.enr-btn-danger{background:var(--red-dim);color:var(--red)}

/* status tabs */
.enr-tabs{display:flex;gap:4px;border-bottom:1px solid var(--border);padding-bottom:0}
.enr-tab{padding:9px 16px;font-size:13px;font-weight:600;color:var(--t3);cursor:pointer;
  border:none;background:transparent;border-bottom:2px solid transparent;margin-bottom:-1px;
  transition:color .15s,border-color .15s;display:flex;align-items:center;gap:6px}
.enr-tab:hover{color:var(--t1)}
.enr-tab.active{color:var(--blue);border-bottom-color:var(--blue)}
.enr-tab .enr-tab-count{background:var(--surface3);color:var(--t3);font-size:11px;font-weight:700;
  padding:1px 7px;border-radius:10px}
.enr-tab.active .enr-tab-count{background:var(--blue-dim);color:var(--blue)}

/* summary pills */
.enr-summary{display:flex;gap:8px;flex-wrap:wrap}
.enr-pill{padding:5px 12px;border-radius:20px;font-size:12px;font-weight:500;
  background:var(--surface2);border:1px solid var(--border2);color:var(--t2);
  cursor:pointer;transition:all .15s;user-select:none}
.enr-pill:hover{border-color:var(--blue);color:var(--blue)}
.enr-pill.active-filter{background:var(--blue-dim);border-color:var(--blue);color:var(--blue)}
.enr-pill b{color:var(--t1);margin-left:4px}

/* table */
.enr-table{width:100%;border-collapse:collapse;font-size:13px}
.enr-table-wrap{overflow-x:auto;overflow-y:auto;max-height:calc(100vh - 260px);border-radius:var(--r);border:1px solid var(--border)}
.enr-table th{background:var(--surface2);color:var(--t3);font-size:11px;font-weight:600;
  text-transform:uppercase;letter-spacing:.06em;padding:10px 14px;text-align:left;
  border-bottom:1px solid var(--border);white-space:nowrap;
  position:sticky;top:0;z-index:2;}
.enr-table td{padding:11px 14px;border-bottom:1px solid var(--border);color:var(--t2);vertical-align:middle}
.enr-table tr:last-child td{border-bottom:none}
.enr-table tbody tr:hover td{background:var(--surface2)}
.enr-name{color:var(--t1);font-weight:500}
.enr-cnic{font-size:11.5px;color:var(--t3);margin-top:2px}

/* badges */
.enr-badge{display:inline-flex;align-items:center;padding:3px 9px;border-radius:20px;
  font-size:11.5px;font-weight:600;white-space:nowrap}
.badge-active   {background:var(--green-dim);color:var(--green)}
.badge-completed{background:var(--blue-dim);color:var(--blue)}
.badge-dropped  {background:var(--red-dim);color:var(--red)}
.badge-suspended{background:var(--yellow-dim);color:var(--yellow)}
.badge-paid     {background:var(--green-dim);color:var(--green)}
.badge-partial  {background:var(--yellow-dim);color:var(--yellow)}
.badge-unpaid   {background:var(--red-dim);color:var(--red)}

/* action buttons in table */
.enr-actions{display:flex;gap:6px;align-items:center}
.enr-icon-btn{width:30px;height:30px;border-radius:var(--r-sm);display:flex;align-items:center;
  justify-content:center;cursor:pointer;border:none;transition:background .15s,color .15s}
.enr-icon-btn.edit{background:transparent;color:var(--blue)}
.enr-icon-btn.del {background:transparent;color:var(--red)}
.enr-icon-btn:hover{opacity:.6}

/* bulk-delete toolbar */
.enr-bulk-bar{display:flex;align-items:center;gap:10px;padding:8px 14px;
  border-radius:var(--r-sm);background:var(--red-dim);border:1px solid var(--red);
  animation:fadeIn .15s ease}
@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
.enr-bulk-count{font-size:13px;font-weight:600;color:var(--red);flex:1}
.enr-bulk-del{background:var(--red);color:#fff;border:none;border-radius:var(--r-sm);
  padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .15s}
.enr-bulk-del:hover{opacity:.85}
.enr-bulk-cancel{background:transparent;color:var(--red);border:1px solid var(--red);
  border-radius:var(--r-sm);padding:6px 12px;font-size:13px;font-weight:600;cursor:pointer}
.enr-bulk-cancel:hover{background:var(--surface2)}

/* row checkbox */
.enr-row-chk{width:15px;height:15px;accent-color:var(--red);cursor:pointer}
.enr-row-selected td{background:color-mix(in srgb,var(--red-dim) 30%,transparent)!important}

/* sortable headers */
.enr-sortable{cursor:pointer;user-select:none;white-space:nowrap}
.enr-sortable:hover{color:var(--blue)}
.enr-sort-icon{font-size:11px;font-weight:700;opacity:.8}

/* filter bar */
.enr-filter-bar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;
  padding:8px 12px;background:var(--surface);border:1px solid var(--border);
  border-radius:12px}
.enr-ms-wrap{position:relative}
.enr-ms-trigger{height:30px;padding:0 10px;display:inline-flex;align-items:center;gap:5px;
  background:var(--surface2);border:1px solid var(--border2);border-radius:8px;
  color:var(--t2);font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;
  transition:all .12s;max-width:180px;font-family:inherit}
.enr-ms-trigger:hover{border-color:var(--blue);color:var(--t1)}
.enr-ms-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px}
.enr-ms-caret{flex-shrink:0;color:var(--t4)}
.enr-ms-dropdown{display:none;position:absolute;top:calc(100% + 4px);left:0;min-width:180px;
  max-height:300px;background:var(--surface);border:1px solid var(--border2);
  border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.14);z-index:999;
  flex-direction:column;overflow:hidden}
.enr-ms-dropdown.open{display:flex}
.enr-ms-search-wrap{padding:6px 8px;border-bottom:1px solid var(--border);flex-shrink:0}
.enr-ms-search{width:100%;padding:5px 8px;border:1px solid var(--border2);border-radius:6px;
  background:var(--surface2);color:var(--t1);font-size:12px;outline:none;box-sizing:border-box}
.enr-ms-search:focus{border-color:var(--blue)}
.enr-ms-list{overflow-y:auto;flex:1;padding:4px}
.enr-ms-option{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:7px;
  font-size:12.5px;color:var(--t2);cursor:pointer;transition:background .1s;user-select:none}
.enr-ms-option:hover{background:var(--surface2);color:var(--t1)}
.enr-ms-option input[type="checkbox"]{width:14px;height:14px;cursor:pointer;flex-shrink:0;accent-color:var(--blue)}
.enr-ms-empty{padding:10px;text-align:center;font-size:12px;color:var(--t4)}

/* active filter chips */
.enr-active-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;
  border-radius:20px;font-size:11px;font-weight:600;border:1px solid transparent;cursor:default}
.enr-chip-x{font-size:10px;cursor:pointer;opacity:.7;line-height:1}
.enr-chip-x:hover{opacity:1}

/* clear all button */
.enr-clear-all-btn{height:26px;padding:0 10px;border:1px solid var(--border2);border-radius:20px;
  background:transparent;color:var(--t3);font-size:11px;font-weight:600;cursor:pointer;
  transition:all .12s;white-space:nowrap;font-family:inherit}
.enr-clear-all-btn:hover{border-color:var(--red);color:var(--red)}

.enr-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:12px;padding:64px 20px;color:var(--t3);text-align:center}
.enr-empty svg{opacity:.35}
.enr-empty p{font-size:14px;font-weight:500}

/* modal overlay */
.enr-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:999;
  display:flex;align-items:flex-start;justify-content:center;padding:24px 16px;
  overflow-y:auto;backdrop-filter:blur(3px)}
.enr-modal{background:var(--surface);border:1px solid var(--border2);border-radius:var(--r-lg);
  width:100%;max-width:900px;margin:auto;box-shadow:var(--shadow-lg)}
.enr-modal-hdr{display:flex;align-items:center;justify-content:space-between;
  padding:18px 20px 14px;border-bottom:1px solid var(--border)}
.enr-modal-title{font-size:15px;font-weight:700;color:var(--t1)}
.enr-modal-close{width:28px;height:28px;border-radius:6px;display:flex;align-items:center;
  justify-content:center;cursor:pointer;border:none;background:var(--surface3);color:var(--t2)}
.enr-modal-close:hover{background:var(--surface4)}
.enr-modal-body{padding:20px;display:flex;flex-direction:column;gap:16px}
.enr-modal-footer{display:flex;gap:10px;justify-content:flex-end;
  padding:14px 20px;border-top:1px solid var(--border)}

/* form fields */
.enr-field{display:flex;flex-direction:column;gap:5px;margin-bottom:14px}
.enr-label{font-size:12px;font-weight:600;color:var(--t2)}
.enr-input,.enr-field select,.enr-field textarea{background:var(--surface2);border:1px solid var(--border2);
  border-radius:var(--r-sm);color:var(--t1);font-size:13px;padding:9px 12px;outline:none;
  transition:border-color .15s;width:100%}
.enr-input:focus,.enr-field select:focus,.enr-field textarea:focus{border-color:var(--blue)}
.enr-input.err,.enr-field select.err{border-color:var(--red)}
.enr-field textarea{resize:vertical;min-height:72px}
.enr-form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:480px){.enr-form-row{grid-template-columns:1fr}}
`;
  document.head.appendChild(s);
}

// ── Badge helpers ─────────────────────────────────────────────
function statusBadge(status) {
  const label = STATUS_LABELS[status] || status;
  return `<span class="enr-badge badge-${status}">${label}</span>`;
}
function feeBadge(feeStatus) {
  const label = FEE_LABELS[feeStatus] || feeStatus;
  return `<span class="enr-badge badge-${feeStatus}">${label}</span>`;
}

// ── Build <option> lists ──────────────────────────────────────
function buildOptions(arr, valueKey, labelKey, selected = '') {
  return arr.map(item =>
    `<option value="${item[valueKey]}" ${item[valueKey] === selected ? 'selected' : ''}>
      ${item[labelKey]}
    </option>`
  ).join('');
}

// ── State ─────────────────────────────────────────────────────
let _container      = null;
let _filterCampus   = [];   // campus filter (first)
let _filterBatch    = [];   // multi-select arrays
let _filterStatus   = [];
let _filterSubject  = [];
let _filterSession  = [];
let _filterTeacher  = [];
let _filterFee      = '';
let _search         = '';
let _sortCol        = '';    // 'student'|'subject'|'batchNo'|'session'|'teacher'|'startDate'|'endDate'|'status'
let _sortDir        = 'asc'; // 'asc'|'desc'
let _selected       = new Set(); // bulk-delete: selected enrolment IDs
let _activeTab       = 'enrolled'; // 'enrolled' | 'freeze' | 'dormant'

// ── Main mount ────────────────────────────────────────────────
export const EnrolmentModule = {
  mount(container) {
    if (!container) return;
    _container = container;
    ensureEnrolmentKeys();
    injectStyles();
    render();

    // Re-render when students/batches change (e.g. from other modules)
    AppState.subscribe('enrolments',    () => renderTable());
    AppState.subscribe('lpAssignments', () => renderTable()); // LP end date live sync
    AppState.subscribe('batches',       () => renderTable()); // batch endDate manual sync
  },
};

// ── Full render ───────────────────────────────────────────────
function render() {
  const canWrite = Auth.can('enrolment');

  _container.innerHTML = `
<div class="enr-wrap">

  <!-- Toolbar row 1: search + action buttons -->
  <div class="enr-toolbar">
    <input id="enrSearch" class="enr-search" placeholder="Search student / CNIC…" value="${_search}" style="min-width:140px;max-width:220px;flex:0 1 220px"/>
    <div style="flex:1"></div>
    <button class="enr-btn enr-btn-primary" id="enrAddBtn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      Add Enrolment
    </button>
    <button class="enr-btn enr-btn-ghost" id="enrExportBtn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      Export CSV
    </button>
  </div>

  <!-- Status tabs -->
  <div class="enr-tabs" id="enrTabs">
    <button class="enr-tab ${_activeTab === 'enrolled' ? 'active' : ''}" data-tab="enrolled">
      Enrolled <span class="enr-tab-count" id="enrTabCountEnrolled">0</span>
    </button>
    <button class="enr-tab ${_activeTab === 'freeze' ? 'active' : ''}" data-tab="freeze">
      Freeze <span class="enr-tab-count" id="enrTabCountFreeze">0</span>
    </button>
    <button class="enr-tab ${_activeTab === 'dormant' ? 'active' : ''}" data-tab="dormant">
      Dormant <span class="enr-tab-count" id="enrTabCountDormant">0</span>
    </button>
  </div>

  <!-- Toolbar row 2: multi-select filter bar -->
  <div class="enr-filter-bar" id="enrFilterBar">

    <!-- Campus multi-select (first) -->
    <div class="enr-ms-wrap" id="enrMsCampus">
      <button class="enr-ms-trigger" id="enrMsCampusTrigger">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <span class="enr-ms-label" id="enrMsCampusLabel">All Campuses</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="enr-ms-caret"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="enr-ms-dropdown" id="enrMsCampusDropdown">
        <div class="enr-ms-search-wrap"><input class="enr-ms-search" placeholder="Search campus…" data-dd="enrMsCampusDropdown"/></div>
        <div class="enr-ms-list"><div class="enr-ms-empty">—</div></div>
      </div>
    </div>

    <!-- Session multi-select (first — drives Subject/Batch#/Teacher) -->
    <div class="enr-ms-wrap" id="enrMsSession">
      <button class="enr-ms-trigger" id="enrMsSessionTrigger">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <span class="enr-ms-label" id="enrMsSessionLabel">All Sessions</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="enr-ms-caret"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="enr-ms-dropdown" id="enrMsSessionDropdown">
        <div class="enr-ms-search-wrap"><input class="enr-ms-search" placeholder="Search session…" data-dd="enrMsSessionDropdown"/></div>
        <div class="enr-ms-list"><div class="enr-ms-empty">—</div></div>
      </div>
    </div>

    <!-- Subject multi-select (filtered by session) -->
    <div class="enr-ms-wrap" id="enrMsSubject">
      <button class="enr-ms-trigger" id="enrMsSubjectTrigger">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
        </svg>
        <span class="enr-ms-label" id="enrMsSubjectLabel">All Subjects</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="enr-ms-caret"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="enr-ms-dropdown" id="enrMsSubjectDropdown">
        <div class="enr-ms-search-wrap"><input class="enr-ms-search" placeholder="Search subject…" data-dd="enrMsSubjectDropdown"/></div>
        <div class="enr-ms-list"><div class="enr-ms-empty">—</div></div>
      </div>
    </div>

    <!-- Batch # multi-select (filtered by session + subject) -->
    <div class="enr-ms-wrap" id="enrMsBatch">
      <button class="enr-ms-trigger" id="enrMsBatchTrigger">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
        </svg>
        <span class="enr-ms-label" id="enrMsBatchLabel">All Batch #</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="enr-ms-caret"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="enr-ms-dropdown" id="enrMsBatchDropdown">
        <div class="enr-ms-search-wrap"><input class="enr-ms-search" placeholder="Search batch #…" data-dd="enrMsBatchDropdown"/></div>
        <div class="enr-ms-list"><div class="enr-ms-empty">—</div></div>
      </div>
    </div>

    <!-- Teacher multi-select (filtered by session + subject) -->
    <div class="enr-ms-wrap" id="enrMsTeacher">
      <button class="enr-ms-trigger" id="enrMsTeacherTrigger">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        <span class="enr-ms-label" id="enrMsTeacherLabel">All Teachers</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="enr-ms-caret"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="enr-ms-dropdown" id="enrMsTeacherDropdown">
        <div class="enr-ms-search-wrap"><input class="enr-ms-search" placeholder="Search teacher…" data-dd="enrMsTeacherDropdown"/></div>
        <div class="enr-ms-list"><div class="enr-ms-empty">—</div></div>
      </div>
    </div>

    <!-- Status multi-select -->
    <div class="enr-ms-wrap" id="enrMsStatus">
      <button class="enr-ms-trigger" id="enrMsStatusTrigger">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        <span class="enr-ms-label" id="enrMsStatusLabel">All Statuses</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="enr-ms-caret"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="enr-ms-dropdown" id="enrMsStatusDropdown">
        <div class="enr-ms-search-wrap"><input class="enr-ms-search" placeholder="Search status…" data-dd="enrMsStatusDropdown"/></div>
        <div class="enr-ms-list">
        ${[
          { value:'active',        label:'Active',        color:'var(--green)'  },
          { value:'dormant',       label:'Dormant',       color:'var(--t3)'     },
          { value:'exempt',        label:'Exempt',        color:'var(--blue)'   },
          { value:'change_campus', label:'Change Campus', color:'var(--yellow)' },
          { value:'left_study',    label:'Left Study',    color:'var(--red)'    },
          { value:'left_campus',   label:'Left Campus',   color:'var(--orange)' },
        ].map(s => `
          <label class="enr-ms-option">
            <input type="checkbox" value="${s.value}" class="enr-ms-cb enr-ms-status-cb" ${_filterStatus.includes(s.value)?'checked':''}/>
            <span class="enr-ms-dot" style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${s.color}"></span>
            ${s.label}
          </label>`).join('')}
        </div>
      </div>
    </div>

    <!-- Active chips + Clear all -->
    <div id="enrActiveChips" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-left:4px"></div>
    <button id="enrClearAll" class="enr-clear-all-btn" style="display:none">Clear all</button>

  </div>

  <!-- Bulk-delete bar (hidden by default) -->
  <div id="enrBulkBar" style="display:none" class="enr-bulk-bar">
    <span class="enr-bulk-count" id="enrBulkCount"></span>
    <button class="enr-bulk-cancel" id="enrBulkCancel">Deselect All</button>
    <button class="enr-bulk-del"    id="enrBulkDel">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
        style="vertical-align:-2px;margin-right:4px">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
        <path d="M10 11v6"/><path d="M14 11v6"/>
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
      </svg>
      Delete Selected
    </button>
  </div>

  <!-- Summary pills -->
  <div class="enr-summary" id="enrSummary"></div>

  <!-- Table -->
  <div class="enr-table-wrap">
    <table class="enr-table">
      <thead>
        <tr>
          <th style="width:36px;text-align:center">
            <input type="checkbox" class="enr-row-chk" id="enrChkAll" title="Select all visible rows"/>
          </th>
          <th class="enr-sortable" data-col="student">Student <span class="enr-sort-icon" data-col="student"></span></th>
          <th class="enr-sortable" data-col="campus">Campus <span class="enr-sort-icon" data-col="campus"></span></th>
          <th class="enr-sortable" data-col="subject">Subject <span class="enr-sort-icon" data-col="subject"></span></th>
          <th class="enr-sortable" data-col="batchNo">Batch # <span class="enr-sort-icon" data-col="batchNo"></span></th>
          <th class="enr-sortable" data-col="session">Session <span class="enr-sort-icon" data-col="session"></span></th>
          <th class="enr-sortable" data-col="teacher">Teacher <span class="enr-sort-icon" data-col="teacher"></span></th>
          <th class="enr-sortable" data-col="startDate">Start Date <span class="enr-sort-icon" data-col="startDate"></span></th>
          <th class="enr-sortable" data-col="endDate">End Date <span class="enr-sort-icon" data-col="endDate"></span></th>
          <th>Duration</th>
          <th class="enr-sortable" data-col="status">Status <span class="enr-sort-icon" data-col="status"></span></th>
          <th>Note</th>
          ${canWrite ? '<th>Actions</th>' : ''}
        </tr>
      </thead>
      <tbody id="enrTbody"></tbody>
    </table>
  </div>

</div>`;

  wireEvents();
  renderSummary();
  renderTable();
}

// ── Multi-select helpers ──────────────────────────────────────
function _enrInitMultiSelect({ triggerId, dropdownId, labelId, cbClass, allLabel, stateKey }) {
  const trigger  = _container.querySelector(`#${triggerId}`);
  const dropdown = _container.querySelector(`#${dropdownId}`);
  if (!trigger || !dropdown) return;

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = dropdown.classList.contains('open');
    _container.querySelectorAll('.enr-ms-dropdown.open').forEach(d => d.classList.remove('open'));
    if (!isOpen) {
      dropdown.classList.add('open');
      dropdown.querySelector('.enr-ms-search')?.focus();
    }
  });

  // Wire checkboxes inside .enr-ms-list (or dropdown itself for backwards compat)
  const list = dropdown.querySelector('.enr-ms-list') || dropdown;
  list.querySelectorAll(`.${cbClass}`).forEach(cb => {
    cb.addEventListener('change', () => {
      if (stateKey === '_filterCampus')  _filterCampus  = [...dropdown.querySelectorAll(`.${cbClass}:checked`)].map(c => c.value);
      if (stateKey === '_filterBatch')   _filterBatch   = [...dropdown.querySelectorAll(`.${cbClass}:checked`)].map(c => c.value);
      if (stateKey === '_filterStatus')  _filterStatus  = [...dropdown.querySelectorAll(`.${cbClass}:checked`)].map(c => c.value);
      if (stateKey === '_filterSubject') _filterSubject = [...dropdown.querySelectorAll(`.${cbClass}:checked`)].map(c => c.value);
      if (stateKey === '_filterSession') _filterSession = [...dropdown.querySelectorAll(`.${cbClass}:checked`)].map(c => c.value);
      if (stateKey === '_filterTeacher') _filterTeacher = [...dropdown.querySelectorAll(`.${cbClass}:checked`)].map(c => c.value);
      _enrSyncLabel(labelId, _enrGetState(stateKey), allLabel);
      _enrRenderChips();
      renderTable();
    });
  });

  // Wire search for static dropdowns (like status)
  const searchInp = dropdown.querySelector('.enr-ms-search');
  if (searchInp) {
    searchInp.oninput = () => {
      const q = searchInp.value.toLowerCase();
      list.querySelectorAll('.enr-ms-option').forEach(opt => {
        opt.style.display = opt.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    };
  }
}

function _enrGetState(key) {
  if (key === '_filterCampus')  return _filterCampus;
  if (key === '_filterBatch')   return _filterBatch;
  if (key === '_filterStatus')  return _filterStatus;
  if (key === '_filterSubject') return _filterSubject;
  if (key === '_filterSession') return _filterSession;
  if (key === '_filterTeacher') return _filterTeacher;
  return [];
}

function _enrSyncLabel(labelId, selected, allLabel) {
  const el = _container.querySelector(`#${labelId}`);
  if (!el) return;
  if (!selected.length) { el.textContent = allLabel; return; }
  if (selected.length === 1) {
    const cb = _container.querySelector(`.enr-ms-cb[value="${selected[0]}"]`);
    el.textContent = (cb?.closest('label')?.textContent?.trim()) || selected[0];
  } else {
    el.textContent = `${selected.length} selected`;
  }
}

function _enrSyncAllLabels() {
  _enrSyncLabel('enrMsCampusLabel',  _filterCampus,  'All Campuses');
  _enrSyncLabel('enrMsSessionLabel', _filterSession, 'All Sessions');
  _enrSyncLabel('enrMsSubjectLabel', _filterSubject, 'All Subjects');
  _enrSyncLabel('enrMsBatchLabel',   _filterBatch,   'All Batch #');
  _enrSyncLabel('enrMsTeacherLabel', _filterTeacher, 'All Teachers');
  _enrSyncLabel('enrMsStatusLabel',  _filterStatus,  'All Statuses');
}

function _enrRenderChips() {
  const wrap     = _container.querySelector('#enrActiveChips');
  const clearBtn = _container.querySelector('#enrClearAll');
  if (!wrap) return;

  const STATUS_COLORS = {
    active: 'var(--green)', dormant: 'var(--t3)', exempt: 'var(--blue)',
    change_campus: 'var(--yellow)', left_study: 'var(--red)', left_campus: 'var(--orange)',
  };

  function makeChips(arr, stateKey, cbClass, color) {
    return arr.map(val => {
      const cb   = _container.querySelector(`.${cbClass}[value="${val}"]`);
      const text = cb?.closest('label')?.textContent?.trim() || val;
      const c    = stateKey === '_filterStatus' ? (STATUS_COLORS[val] || color) : color;
      return `<span class="enr-active-chip" style="background:${c}20;color:${c};border-color:${c}50"
                    data-key="${stateKey}" data-val="${val}">
                ${text}
                <span class="enr-chip-x">✕</span>
              </span>`;
    }).join('');
  }

  wrap.innerHTML =
    makeChips(_filterCampus,  '_filterCampus',  'enr-ms-campus-cb',  'var(--teal, var(--blue))') +
    makeChips(_filterBatch,   '_filterBatch',   'enr-ms-batch-cb',   'var(--blue)')   +
    makeChips(_filterSubject, '_filterSubject', 'enr-ms-subject-cb', 'var(--violet)') +
    makeChips(_filterSession, '_filterSession', 'enr-ms-session-cb', 'var(--teal, var(--blue))') +
    makeChips(_filterTeacher, '_filterTeacher', 'enr-ms-teacher-cb', 'var(--green)')  +
    makeChips(_filterStatus,  '_filterStatus',  'enr-ms-status-cb',  'var(--yellow)');

  const hasAny = _filterCampus.length || _filterBatch.length || _filterSubject.length || _filterSession.length ||
                 _filterTeacher.length || _filterStatus.length;
  if (clearBtn) clearBtn.style.display = hasAny ? '' : 'none';

  wrap.querySelectorAll('.enr-active-chip').forEach(chip => {
    chip.querySelector('.enr-chip-x')?.addEventListener('click', () => {
      const { key, val } = chip.dataset;
      if (key === '_filterCampus')  _filterCampus  = _filterCampus.filter(v => v !== val);
      if (key === '_filterBatch')   _filterBatch   = _filterBatch.filter(v => v !== val);
      if (key === '_filterStatus')  _filterStatus  = _filterStatus.filter(v => v !== val);
      if (key === '_filterSubject') _filterSubject = _filterSubject.filter(v => v !== val);
      if (key === '_filterSession') _filterSession = _filterSession.filter(v => v !== val);
      if (key === '_filterTeacher') _filterTeacher = _filterTeacher.filter(v => v !== val);
      // Uncheck checkbox
      const cb = _container.querySelector(`.enr-ms-cb[value="${val}"]`);
      if (cb) cb.checked = false;
      _enrSyncAllLabels();
      _enrRenderChips();
      renderTable();
    });
  });
}

// ── Wire toolbar events ───────────────────────────────────────
function wireEvents() {
  // ── Status tabs ────────────────────────────────────────────
  _container.querySelectorAll('.enr-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeTab = btn.dataset.tab;
      _container.querySelectorAll('.enr-tab').forEach(b => b.classList.toggle('active', b === btn));
      renderTable();
    });
  });

  _container.querySelector('#enrSearch')?.addEventListener('input', e => {
    _search = e.target.value;
    renderTable();
  });

  _container.querySelector('#enrAddBtn')?.addEventListener('click', () => openModal());
  _container.querySelector('#enrExportBtn')?.addEventListener('click', () => {
    EnrolmentService.exportCSV(null);
    Toast.success('CSV exported successfully.');
  });

  // ── Bulk-delete bar buttons ───────────────────────────────
  _container.querySelector('#enrBulkCancel')?.addEventListener('click', () => {
    _selected.clear();
    renderTable();
  });
  _container.querySelector('#enrBulkDel')?.addEventListener('click', () => {
    if (!_selected.size) return;
    confirmBulkDelete([..._selected]);
  });

  // ── Multi-select filter dropdowns (status is static; others are dynamic via renderTable) ──
  _enrInitMultiSelect({ triggerId:'enrMsStatusTrigger', dropdownId:'enrMsStatusDropdown', labelId:'enrMsStatusLabel', cbClass:'enr-ms-status-cb', allLabel:'All Statuses', stateKey:'_filterStatus' });

  // Dynamic dropdowns (session/subject/batch/teacher) are wired inside repopDynDropdown on each renderTable call.
  // We only need to wire their trigger buttons here:
  ['enrMsCampus','enrMsSession','enrMsSubject','enrMsBatch','enrMsTeacher'].forEach(wrapId => {
    const trigger  = _container.querySelector(`#${wrapId}Trigger`);
    const dropdown = _container.querySelector(`#${wrapId}Dropdown`);
    if (!trigger || !dropdown) return;
    trigger.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('open');
      _container.querySelectorAll('.enr-ms-dropdown.open').forEach(d => d.classList.remove('open'));
      if (!isOpen) {
        dropdown.classList.add('open');
        dropdown.querySelector('.enr-ms-search')?.focus();
      }
    });
  });

  // ── Clear all chips ───────────────────────────────────────
  _container.querySelector('#enrClearAll')?.addEventListener('click', () => {
    _filterCampus = []; _filterSession = []; _filterSubject = []; _filterBatch = [];
    _filterTeacher = []; _filterStatus = [];
    _container.querySelectorAll('.enr-ms-cb').forEach(cb => cb.checked = false);
    _enrSyncAllLabels();
    _enrRenderChips();
    renderTable();
  });

  // ── Close dropdowns on outside click ─────────────────────
  window.addEventListener('mousedown', function _enrOutside(e) {
    if (!_container || !_container.isConnected) {
      window.removeEventListener('mousedown', _enrOutside, true);
      return;
    }
    if (!e.target.closest('.enr-ms-wrap')) {
      _container.querySelectorAll('.enr-ms-dropdown.open').forEach(d => d.classList.remove('open'));
    }
  }, true);

  // ── Sort header clicks ────────────────────────────────────
  _container.querySelectorAll('.enr-sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (_sortCol === col) { _sortDir = _sortDir === 'asc' ? 'desc' : 'asc'; }
      else { _sortCol = col; _sortDir = 'asc'; }
      renderTable();
    });
  });
}

// ── Summary pills ─────────────────────────────────────────────
function renderSummary() {
  const el = _container.querySelector('#enrSummary');
  if (!el) return;

  // Same statuses as table inline dropdown
  const ENR_SUBJ_STATUS_OPTS = [
    { value: 'active',        label: 'Active' },
    { value: 'dormant',       label: 'Dormant' },
    { value: 'exempt',        label: 'Exempt' },
    { value: 'change_campus', label: 'Change Campus' },
    { value: 'left_study',    label: 'Left Study' },
    { value: 'left_campus',   label: 'Left Campus' },
  ];

  // Count per subject-level status across all enrolments
  const allEnrolments = EnrolmentService.getAll();
  let totalSubjectRows = 0;
  const statusCounts = {};
  ENR_SUBJ_STATUS_OPTS.forEach(o => { statusCounts[o.value] = 0; });

  allEnrolments.forEach(e => {
    const subjects = Array.isArray(e.subjects) && e.subjects.length ? e.subjects : null;
    if (subjects) {
      subjects.forEach(sub => {
        totalSubjectRows++;
        const st = sub.status || 'active';
        if (st in statusCounts) statusCounts[st]++;
      });
    } else {
      totalSubjectRows++;
      const st = e.status || 'active';
      if (st in statusCounts) statusCounts[st]++;
    }
  });

  const pills = [
    { label: 'Total', count: totalSubjectRows, value: '' },
    ...ENR_SUBJ_STATUS_OPTS.map(o => ({ label: o.label, count: statusCounts[o.value], value: o.value })),
  ];

  el.innerHTML = pills.map(p => `
    <div class="enr-pill ${p.value !== '' && _filterStatus.includes(p.value) ? 'active-filter' : ''}"
         data-status="${p.value}" title="${p.value ? 'Filter by ' + p.label : 'Show all'}">
      ${p.label} <b>${p.count}</b>
    </div>
  `).join('');

  // Wire pill clicks → toggle in multi-select filter array + sync UI
  el.querySelectorAll('.enr-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const val = pill.dataset.status;
      if (!val) {
        // "Total" pill → clear all status filters
        _filterStatus = [];
        _container.querySelectorAll('.enr-ms-status-cb').forEach(cb => cb.checked = false);
      } else {
        if (_filterStatus.includes(val)) {
          _filterStatus = _filterStatus.filter(v => v !== val);
          const cb = _container.querySelector(`.enr-ms-status-cb[value="${val}"]`);
          if (cb) cb.checked = false;
        } else {
          _filterStatus = [..._filterStatus, val];
          const cb = _container.querySelector(`.enr-ms-status-cb[value="${val}"]`);
          if (cb) cb.checked = true;
        }
      }
      _enrSyncAllLabels();
      _enrRenderChips();
      renderSummary();
      renderTable();
    });
  });
}

// ── Table render ──────────────────────────────────────────────
function renderTable() {
  const canWrite = Auth.can('enrolment');
  const tbody    = _container?.querySelector('#enrTbody');
  if (!tbody) return;

  let rows = EnrolmentService.getEnriched();

  // ── Tab counts (computed off full dataset, before search/other filters) ──
  const _allForCounts = rows;
  const _freezeCount  = _allForCounts.filter(e => e.status === 'suspended').length;
  const _dormantCount = _allForCounts.filter(e =>
    (Array.isArray(e.subjects) && e.subjects.length)
      ? e.subjects.some(sub => sub.status === 'dormant')
      : e.status === 'dormant'
  ).length;
  const _enrolledCount = _allForCounts.length - _freezeCount;
  const _cntEnrolled = _container.querySelector('#enrTabCountEnrolled');
  const _cntFreeze   = _container.querySelector('#enrTabCountFreeze');
  const _cntDormant  = _container.querySelector('#enrTabCountDormant');
  if (_cntEnrolled) _cntEnrolled.textContent = _enrolledCount;
  if (_cntFreeze)   _cntFreeze.textContent   = _freezeCount;
  if (_cntDormant)  _cntDormant.textContent  = _dormantCount;

  // ── Filter by active tab (enrolment-level status) ──────────
  if (_activeTab === 'freeze') {
    rows = rows.filter(e => e.status === 'suspended');
  } else if (_activeTab === 'enrolled') {
    rows = rows.filter(e => e.status !== 'suspended');
  }
  // 'dormant' tab is filtered later at subject-row level (subjectStatus)

  // Search
  if (_search.trim()) {
    const q = _search.trim().toLowerCase();
    rows = rows.filter(e =>
      e.studentName.toLowerCase().includes(q) ||
      e.studentCnic.toLowerCase().includes(q)
    );
  }

  renderSummary();

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${canWrite ? 13 : 12}">
          <div class="enr-empty">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            <p>No enrolments found</p>
          </div>
        </td>
      </tr>`;
    return;
  }

  // ── Helper: parse batchName parts (e.g. FA1-Dec-25-01) ────
  function parseBatchName(batchName) {
    if (!batchName) return { subject: '—', batchNo: '—', session: '—' };
    const parts = batchName.split('-');
    // Subject = everything before first '-' that looks like a code (first segment)
    const subject = parts[0] || '—';
    // Batch# = last segment
    const batchNo = parts[parts.length - 1] || '—';
    // Session = middle segments joined (e.g. Dec-25)
    const session = parts.length >= 3 ? parts.slice(1, parts.length - 1).join('-') : '—';
    return { subject, batchNo, session };
  }

  // ── Helper: compute duration between two date strings ─────
  function calcDuration(startDate, endDate) {
    if (!startDate || !endDate) return '—';
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (isNaN(s) || isNaN(e) || e <= s) return '—';
    const diffMs    = e - s;
    const diffDays  = Math.round(diffMs / (1000 * 60 * 60 * 24));
    const months    = Math.floor(diffDays / 30);
    const remDays   = diffDays % 30;
    if (months > 0 && remDays > 0) return `${months}m ${remDays}d`;
    if (months > 0) return `${months} month${months !== 1 ? 's' : ''}`;
    return `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
  }

  // ── Per-subject status options ─────────────────────────────
  const ENR_SUBJ_STATUS_OPTS = [
    { value: 'active',        label: 'Active' },
    { value: 'dormant',       label: 'Dormant' },
    { value: 'exempt',        label: 'Exempt' },
    { value: 'change_campus', label: 'Change Campus' },
    { value: 'left_study',    label: 'Left Study' },
    { value: 'left_campus',   label: 'Left Campus' },
  ];

  // ── Expand each enrolment into per-subject rows ────────────
  // Each enrolment may have multiple subjects; each gets its own table row.
  // If no subjects stored, fall back to batchName-based row.
  const expandedRows = [];
  rows.forEach(e => {
    const subjects = Array.isArray(e.subjects) && e.subjects.length ? e.subjects : null;
    if (subjects) {
      subjects.forEach(sub => {
        const parsed = parseBatchName(sub.batchName || e.batchName);
        const subBatchRec = (AppState.get('batches') || []).find(b => b.id === sub.batchId);
        const _sCampus = subBatchRec?.campusId
          ? (AppState.get('campuses') || []).find(c => c.id === subBatchRec.campusId)
          : null;

        // ── Live sync: resolve startDate/endDate from batch record (not stored snapshot) ──
        const liveStartDate = subBatchRec?.startDate || sub.startDate || '';
        let liveEndDate = subBatchRec?.endDate || sub.endDate || '';
        if (subBatchRec && subBatchRec.endDateMode !== 'manual') {
          try {
            const allAssign = AppState.get('lpAssignments') || {};
            const lpa       = allAssign[subBatchRec.id];
            if (lpa && lpa.rows) {
              const datedRows = lpa.rows.filter(r => r.date).sort((a, b) => a.date.localeCompare(b.date));
              if (datedRows.length) liveEndDate = datedRows[datedRows.length - 1].date;
            }
          } catch(_) { /* fallback to batch stored endDate */ }
        }

        expandedRows.push({
          _enrolmentId: e.id,
          _subjectId:   sub.subjectId || '',
          _subjectIdx:  subjects.indexOf(sub),
          studentName:  e.studentName,
          studentCnic:  e.studentCnic,
          campus:       _sCampus ? (_sCampus.campusName || '').replace(/\s*campus$/i,'').trim() || _sCampus.campusName : '—',
          subject:      parsed.subject,
          batchNo:      sub.batchNo   || parsed.batchNo,
          session:      sub.session   || parsed.session,
          teacher:      subBatchRec?.teacher || subBatchRec?.teacherName || '—',
          startDate:    liveStartDate,
          endDate:      liveEndDate,
          duration:     calcDuration(liveStartDate, liveEndDate),
          subjectStatus: sub.status   || 'active',
          note:         sub.note || e.notes || '',
        });
      });
    } else {
      const parsed = parseBatchName(e.batchName);
      // Try to get dates from batch data
      const batchRecord = (AppState.get('batches') || []).find(b => b.id === e.batchId);
      const _bCampus = batchRecord?.campusId
        ? (AppState.get('campuses') || []).find(c => c.id === batchRecord.campusId)
        : null;

      // Resolve end date: if LP mode, get last dated row from assignment; else use stored endDate
      let resolvedEndDate = batchRecord?.endDate || '';
      if (batchRecord && batchRecord.endDateMode !== 'manual') {
        try {
          const allAssign = AppState.get('lpAssignments') || {};
          const lpa       = allAssign[batchRecord.id];
          if (lpa && lpa.rows) {
            const datedRows = lpa.rows.filter(r => r.date).sort((a, b) => a.date.localeCompare(b.date));
            if (datedRows.length) resolvedEndDate = datedRows[datedRows.length - 1].date;
          }
        } catch(e) { /* fallback to stored */ }
      }

      expandedRows.push({
        _enrolmentId: e.id,
        _subjectId:   '',
        _subjectIdx:  -1,
        studentName:  e.studentName,
        studentCnic:  e.studentCnic,
        campus:       _bCampus ? (_bCampus.campusName || '').replace(/\s*campus$/i,'').trim() || _bCampus.campusName : '—',
        subject:      parsed.subject,
        batchNo:      parsed.batchNo,
        session:      parsed.session,
        teacher:      batchRecord?.teacher || batchRecord?.teacherName || '—',
        startDate:    batchRecord?.startDate  || '',
        endDate:      resolvedEndDate,
        duration:     calcDuration(batchRecord?.startDate, resolvedEndDate),
        subjectStatus: e.status || 'active',
        note:         e.notes || '',
      });
    }
  });

  // Filter expanded rows by subject-level status (multi-select)
  let filteredRows = _filterStatus.length
    ? expandedRows.filter(r => _filterStatus.includes(r.subjectStatus))
    : expandedRows;

  // ── Dormant tab: only show subject-rows whose subject-status is dormant ──
  if (_activeTab === 'dormant') {
    filteredRows = filteredRows.filter(r => r.subjectStatus === 'dormant');
  }

  // ── Apply campus / subject / session / teacher / batchNo filters ──
  let displayRows = filteredRows;
  if (_filterCampus.length)  displayRows = displayRows.filter(r => _filterCampus.includes(r.campus));
  if (_filterSubject.length) displayRows = displayRows.filter(r => _filterSubject.includes(r.subject));
  if (_filterSession.length) displayRows = displayRows.filter(r => _filterSession.includes(r.session));
  if (_filterTeacher.length) displayRows = displayRows.filter(r => _filterTeacher.includes(r.teacher));
  if (_filterBatch.length)   displayRows = displayRows.filter(r => _filterBatch.includes(String(r.batchNo)));

  // ── Populate dynamic filter dropdowns with search + cascade ──
  function repopDynDropdown(dropdownId, cbClass, values, currentArr) {
    const dd   = _container.querySelector(`#${dropdownId}`);
    if (!dd) return;
    const list = dd.querySelector('.enr-ms-list') || dd;
    const unique = [...new Set(values.filter(v => v && v !== '—'))].sort();

    const buildItems = (filter = '') => {
      const shown = filter ? unique.filter(v => v.toLowerCase().includes(filter.toLowerCase())) : unique;
      list.innerHTML = shown.length
        ? shown.map(v => `
            <label class="enr-ms-option">
              <input type="checkbox" value="${v}" class="enr-ms-cb ${cbClass}" ${currentArr.includes(v)?'checked':''}/>
              ${v}
            </label>`).join('')
        : `<div class="enr-ms-empty">No results</div>`;
      // Re-wire checkboxes
      list.querySelectorAll(`.${cbClass}`).forEach(cb => {
        cb.addEventListener('change', () => {
          if (cbClass === 'enr-ms-campus-cb')  _filterCampus  = [..._container.querySelectorAll('.enr-ms-campus-cb:checked')].map(c=>c.value);
          if (cbClass === 'enr-ms-subject-cb') _filterSubject = [..._container.querySelectorAll(`.enr-ms-subject-cb:checked`)].map(c=>c.value);
          if (cbClass === 'enr-ms-session-cb') _filterSession = [..._container.querySelectorAll(`.enr-ms-session-cb:checked`)].map(c=>c.value);
          if (cbClass === 'enr-ms-teacher-cb') _filterTeacher = [..._container.querySelectorAll(`.enr-ms-teacher-cb:checked`)].map(c=>c.value);
          if (cbClass === 'enr-ms-batch-cb')   _filterBatch   = [..._container.querySelectorAll(`.enr-ms-batch-cb:checked`)].map(c=>c.value);
          _enrSyncAllLabels();
          _enrRenderChips();
          renderTable();
        });
      });
    };

    buildItems();

    // Wire search input inside this dropdown
    const searchInp = dd.querySelector('.enr-ms-search');
    if (searchInp) {
      searchInp.oninput = () => buildItems(searchInp.value);
    }
  }

  // Cascading values: campus is the outermost filter
  const allExpanded = expandedRows;

  // Campus dropdown: always shows all campuses from ALL data
  repopDynDropdown('enrMsCampusDropdown', 'enr-ms-campus-cb',
    allExpanded.map(r => r.campus), _filterCampus);

  // Session dropdown: filtered by campus selection
  const campFiltered = _filterCampus.length
    ? allExpanded.filter(r => _filterCampus.includes(r.campus))
    : allExpanded;
  repopDynDropdown('enrMsSessionDropdown', 'enr-ms-session-cb',
    campFiltered.map(r => r.session), _filterSession);

  // Subject dropdown: filtered by campus + session
  const sessFiltered = _filterSession.length
    ? campFiltered.filter(r => _filterSession.includes(r.session))
    : campFiltered;
  repopDynDropdown('enrMsSubjectDropdown', 'enr-ms-subject-cb',
    sessFiltered.map(r => r.subject), _filterSubject);

  // Batch# dropdown: filtered by session + subject
  const subjFiltered = _filterSubject.length
    ? sessFiltered.filter(r => _filterSubject.includes(r.subject))
    : sessFiltered;
  repopDynDropdown('enrMsBatchDropdown', 'enr-ms-batch-cb',
    subjFiltered.map(r => r.batchNo), _filterBatch);

  // Teacher dropdown: filtered by session + subject
  repopDynDropdown('enrMsTeacherDropdown', 'enr-ms-teacher-cb',
    subjFiltered.map(r => r.teacher).filter(t => t && t !== '—'), _filterTeacher);

  // Wire search for status dropdown too
  const statusDd = _container.querySelector('#enrMsStatusDropdown');
  const statusSearch = statusDd?.querySelector('.enr-ms-search');
  if (statusSearch) {
    statusSearch.oninput = () => {
      const q = statusSearch.value.toLowerCase();
      const list = statusDd.querySelector('.enr-ms-list') || statusDd;
      list.querySelectorAll('.enr-ms-option').forEach(opt => {
        const txt = opt.textContent.toLowerCase();
        opt.style.display = txt.includes(q) ? '' : 'none';
      });
    };
  }
  _enrSyncAllLabels();
  _enrRenderChips();

  // ── Sorting ───────────────────────────────────────────────
  if (_sortCol) {
    displayRows = [...displayRows].sort((a, b) => {
      let av = '', bv = '';
      switch (_sortCol) {
        case 'student':   av = a.studentName;    bv = b.studentName;    break;
        case 'campus':    av = a.campus;         bv = b.campus;         break;
        case 'subject':   av = a.subject;        bv = b.subject;        break;
        case 'batchNo':   av = a.batchNo;        bv = b.batchNo;        break;
        case 'session':   av = a.session;        bv = b.session;        break;
        case 'teacher':   av = a.teacher;        bv = b.teacher;        break;
        case 'startDate': av = a.startDate;      bv = b.startDate;      break;
        case 'endDate':   av = a.endDate;        bv = b.endDate;        break;
        case 'status':    av = a.subjectStatus;  bv = b.subjectStatus;  break;
      }
      av = (av || '').toString().toLowerCase();
      bv = (bv || '').toString().toLowerCase();
      if (av < bv) return _sortDir === 'asc' ? -1 : 1;
      if (av > bv) return _sortDir === 'asc' ?  1 : -1;
      return 0;
    });
  }

  // ── Update sort icons in headers ──────────────────────────
  _container.querySelectorAll('.enr-sort-icon').forEach(icon => {
    const col = icon.dataset.col;
    if (col === _sortCol) {
      icon.textContent = _sortDir === 'asc' ? ' ↑' : ' ↓';
      icon.style.color = 'var(--blue)';
      icon.closest('th').style.color = 'var(--blue)';
    } else {
      icon.textContent = '';
      icon.closest('th').style.color = '';
    }
  });

  tbody.innerHTML = displayRows.map((r, i) => {
    const statusOpts = ENR_SUBJ_STATUS_OPTS.map(o =>
      `<option value="${o.value}" ${r.subjectStatus === o.value ? 'selected' : ''}>${o.label}</option>`
    ).join('');

    return `
    <tr class="${_selected.has(r._enrolmentId) ? 'enr-row-selected' : ''}" data-enrolment-id="${r._enrolmentId}">
      <td style="text-align:center">
        <input type="checkbox" class="enr-row-chk enr-chk-row"
          data-id="${r._enrolmentId}"
          ${_selected.has(r._enrolmentId) ? 'checked' : ''}/>
      </td>
      <td>
        <div class="enr-name">${r.studentName}</div>
        <div class="enr-cnic">${r.studentCnic}</div>
      </td>
      <td style="font-size:12px;color:var(--t2);white-space:nowrap">${r.campus || '—'}</td>
      <td><span style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--violet)">${r.subject}</span></td>
      <td style="text-align:center"><span style="font-family:var(--font-mono);font-size:12px">${r.batchNo}</span></td>
      <td><span style="font-size:12px">${r.session}</span></td>
      <td style="font-size:12px;color:var(--t2)">${r.teacher || '—'}</td>
      <td style="font-size:12px;color:var(--t2)">${r.startDate || '—'}</td>
      <td style="font-size:12px;color:var(--t2)">${r.endDate || '—'}</td>
      <td style="font-size:12px;color:var(--t3)">${r.duration}</td>
      <td>
        <select class="enr-subj-status-sel enr-select" style="padding:4px 8px;font-size:12px"
          data-enrolment-id="${r._enrolmentId}"
          data-subject-idx="${r._subjectIdx}"
          data-subject-id="${r._subjectId}">
          ${statusOpts}
        </select>
      </td>
      <td style="font-size:12px;color:var(--t2);max-width:160px">
        <span title="${r.note || ''}" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px">
          ${r.note || '—'}
        </span>
      </td>
      ${canWrite ? `
      <td>
        <div class="enr-actions">
          <button class="enr-icon-btn edit" data-id="${r._enrolmentId}" title="Edit">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="enr-icon-btn del" data-id="${r._enrolmentId}" title="Delete">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        </div>
      </td>` : ''}
    </tr>`;
  }).join('');

  // ── Wire row checkboxes ──────────────────────────────────
  function syncBulkBar() {
    const bar      = _container.querySelector('#enrBulkBar');
    const countEl  = _container.querySelector('#enrBulkCount');
    const chkAll   = _container.querySelector('#enrChkAll');
    if (!bar) return;
    if (_selected.size > 0) {
      bar.style.display = 'flex';
      countEl.textContent = _selected.size + ' row' + (_selected.size > 1 ? 's' : '') + ' selected';
    } else {
      bar.style.display = 'none';
    }
    // sync select-all checkbox state
    const visibleIds = displayRows.map(r => r._enrolmentId);
    const allChecked = visibleIds.length > 0 && visibleIds.every(id => _selected.has(id));
    if (chkAll) chkAll.checked = allChecked;
  }

  tbody.querySelectorAll('.enr-chk-row').forEach(chk => {
    chk.addEventListener('change', () => {
      const id  = chk.dataset.id;
      const row = tbody.querySelector(`tr[data-enrolment-id="${id}"]`);
      if (chk.checked) {
        _selected.add(id);
        row?.classList.add('enr-row-selected');
      } else {
        _selected.delete(id);
        row?.classList.remove('enr-row-selected');
      }
      syncBulkBar();
    });
  });

  // select-all
  const chkAllEl = _container.querySelector('#enrChkAll');
  if (chkAllEl) {
    chkAllEl.addEventListener('change', () => {
      displayRows.forEach(r => {
        if (chkAllEl.checked) _selected.add(r._enrolmentId);
        else                  _selected.delete(r._enrolmentId);
      });
      renderTable(); // re-render to reflect check states
    });
  }

  syncBulkBar();

  // ── Wire inline status dropdowns ──────────────────────────
  tbody.querySelectorAll('.enr-subj-status-sel').forEach(sel => {
    sel.addEventListener('change', () => {
      const enrolmentId = sel.dataset.enrolmentId;
      const subjectIdx  = parseInt(sel.dataset.subjectIdx);
      const newStatus   = sel.value;
      const enrolment   = EnrolmentService.getById(enrolmentId);
      if (!enrolment) return;

      const user = AppState.get('currentUser')?.username || null;

      if (subjectIdx >= 0 && Array.isArray(enrolment.subjects) && enrolment.subjects[subjectIdx]) {
        // Update the specific subject's status
        const updatedSubjects = enrolment.subjects.map((sub, idx) =>
          idx === subjectIdx ? { ...sub, status: newStatus } : sub
        );
        const r = EnrolmentService.update(enrolmentId, { subjects: updatedSubjects }, user);
        if (r.success) { Toast.success('Status updated.'); renderSummary(); }
        else Toast.error(r.message || 'Update failed.');
      } else {
        // No subjects array — update top-level status
        const r = EnrolmentService.update(enrolmentId, { status: newStatus }, user);
        if (r.success) { Toast.success('Status updated.'); renderSummary(); }
        else Toast.error(r.message || 'Update failed.');
      }
    });
  });

  // ── Wire edit / delete buttons ────────────────────────────
  tbody.querySelectorAll('.enr-icon-btn.edit').forEach(btn =>
    btn.addEventListener('click', () => openEditRowModal(btn.dataset.id))
  );
  tbody.querySelectorAll('.enr-icon-btn.del').forEach(btn =>
    btn.addEventListener('click', () => confirmDelete(btn.dataset.id))
  );
}

// ══════════════════════════════════════════════════════════════
// INLINE ROW EDIT MODAL — Edit a single enrolment's editable fields
// (student name is read-only; status, dates, notes are editable)
// ══════════════════════════════════════════════════════════════
function openEditRowModal(enrolmentId) {
  const enrolment = EnrolmentService.getById(enrolmentId);
  if (!enrolment) return;

  const enriched    = EnrolmentService.getEnriched().find(x => x.id === enrolmentId);
  const studentName = enriched?.studentName || '—';

  const overlay = document.createElement('div');
  overlay.className = 'enr-overlay';

  const ENR_SUBJ_STATUS_OPTS = [
    { value: 'active',        label: 'Active' },
    { value: 'dormant',       label: 'Dormant' },
    { value: 'exempt',        label: 'Exempt' },
    { value: 'change_campus', label: 'Change Campus' },
    { value: 'left_study',    label: 'Left Study' },
    { value: 'left_campus',   label: 'Left Campus' },
  ];

  const statusOpts = ENR_SUBJ_STATUS_OPTS
    .map(o => `<option value="${o.value}" ${enrolment.status === o.value ? 'selected' : ''}>${o.label}</option>`)
    .join('');

  overlay.innerHTML = `
<div class="enr-modal" style="max-width:480px">
  <div class="enr-modal-hdr">
    <span class="enr-modal-title">Edit Enrolment</span>
    <button class="enr-modal-close" id="enrEditClose">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>
  <div class="enr-modal-body">
    <div class="enr-field">
      <label class="enr-label">Student</label>
      <input class="enr-input" value="${studentName}" disabled style="opacity:.6;cursor:not-allowed"/>
    </div>
    <div class="enr-field">
      <label class="enr-label">Enrolment Date</label>
      <input id="enrEditDate" type="date" class="enr-input" value="${enrolment.enrolmentDate || ''}"/>
    </div>
    <div class="enr-field">
      <label class="enr-label">Status</label>
      <select id="enrEditStatus" class="enr-input">${statusOpts}</select>
    </div>
    <div class="enr-field">
      <label class="enr-label">Notes</label>
      <textarea id="enrEditNotes" class="enr-input" rows="3" style="resize:vertical">${enrolment.notes || ''}</textarea>
    </div>
  </div>
  <div class="enr-modal-footer">
    <button class="enr-btn enr-btn-ghost" id="enrEditCancel">Cancel</button>
    <button class="enr-btn enr-btn-primary" id="enrEditSave">Save Changes</button>
  </div>
</div>`;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();

  overlay.querySelector('#enrEditClose').addEventListener('click', close);
  overlay.querySelector('#enrEditCancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  overlay.querySelector('#enrEditSave').addEventListener('click', () => {
    const status        = overlay.querySelector('#enrEditStatus').value;
    const enrolmentDate = overlay.querySelector('#enrEditDate').value;
    const notes         = overlay.querySelector('#enrEditNotes').value;
    const user          = AppState.get('currentUser')?.username || null;

    const result = EnrolmentService.update(enrolmentId, { status, enrolmentDate, notes }, user);
    if (result.success) {
      Toast.success('Enrolment updated.');
      close();
      renderTable();
      renderSummary();
    } else {
      Toast.error(result.message || 'Update failed.');
    }
  });
}

// ══════════════════════════════════════════════════════════════
// MODAL — Add / Edit (bulk enrolment wizard)
// ══════════════════════════════════════════════════════════════
function openModal(enrolmentId = null) {
  const isEdit   = !!enrolmentId;
  const existing = isEdit ? EnrolmentService.getById(enrolmentId) : null;

  // ── Local form state ──────────────────────────────────────
  let _selCampus   = existing?.campusId       || '';
  let _selSession  = existing?.session        || '';
  let _selAdmBatch = existing?.admissionBatch || '';

  // _selectedSubjects: array of subjectId strings (order matters — becomes column order)
  let _selectedSubjects = existing?.subjects
    ? existing.subjects.map(x => x.subjectId)
    : [];

  // _studentRows: array of student objects, each has:
  //   { ...studentData, _enrolled: bool, _subjectData: { [subjectId]: { session, batchNo, batchId } } }
  let _studentRows = [];

  // _firstRowSet: tracks if first-row auto-fill has been triggered per subject
  // { [subjectId]: { session: str, batchNo: str } }
  let _firstRowData = {};

  // ── Inject modal-specific styles once ────────────────────
  if (!document.getElementById('enr-modal-css')) {
    const st = document.createElement('style');
    st.id = 'enr-modal-css';
    st.textContent = `
      /* Conflict modal */
      .enr-conflict-wrap{display:flex;flex-direction:column;gap:10px;max-height:360px;overflow-y:auto;padding-right:4px}
      .enr-conflict-row{display:flex;align-items:center;justify-content:space-between;gap:12px;
        padding:10px 14px;border-radius:var(--r-sm);border:1px solid var(--red-dim);
        background:color-mix(in srgb,var(--red-dim) 40%,transparent)}
      .enr-conflict-info{display:flex;flex-direction:column;gap:3px}
      .enr-conflict-name{font-size:13px;font-weight:600;color:var(--t1)}
      .enr-conflict-detail{font-size:11.5px;color:var(--t3)}
      .enr-conflict-remove{border:none;background:var(--red-dim);color:var(--red);
        border-radius:var(--r-sm);padding:5px 12px;font-size:12px;font-weight:600;
        cursor:pointer;white-space:nowrap;flex-shrink:0;transition:opacity .15s}
      .enr-conflict-remove:hover{opacity:.75}
      .enr-conflict-remove.removed{background:var(--surface3);color:var(--t3);cursor:default;opacity:.5}

      /* Section boxes */
      .enrs-box{background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm);padding:14px 16px}
      .enrs-box-title{font-size:11.5px;font-weight:700;color:var(--t2);text-transform:uppercase;
        letter-spacing:.06em;margin-bottom:12px;display:flex;align-items:center;gap:8px}
      .enrs-badge{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;
        border-radius:50%;background:var(--blue);color:#fff;font-size:11px;font-weight:800;flex-shrink:0}

      /* Multi-select subject dropdown */
      .enrs-subj-dropdown{position:relative}
      .enrs-subj-trigger{display:flex;align-items:center;gap:8px;padding:9px 12px;
        background:var(--surface);border:1px solid var(--border2);border-radius:var(--r-sm);
        cursor:pointer;color:var(--t1);font-size:13px;min-height:40px;flex-wrap:wrap}
      .enrs-subj-trigger:hover{border-color:var(--blue)}
      .enrs-subj-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;
        background:var(--blue-dim);color:var(--blue);border-radius:10px;font-size:11.5px;font-weight:600}
      .enrs-subj-chip-x{border:none;background:none;color:var(--blue);cursor:pointer;
        font-size:13px;line-height:1;padding:0 0 0 2px;display:flex;align-items:center}
      .enrs-subj-chip-x:hover{color:var(--red)}
      .enrs-subj-placeholder{color:var(--t4);font-size:13px}
      .enrs-subj-panel{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:1000;
        background:var(--surface);border:1px solid var(--border2);border-radius:var(--r-sm);
        box-shadow:var(--shadow-lg);max-height:240px;overflow-y:auto}
      .enrs-subj-panel-item{display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;
        font-size:13px;color:var(--t1);border-bottom:1px solid var(--border)}
      .enrs-subj-panel-item:last-child{border-bottom:none}
      .enrs-subj-panel-item:hover{background:var(--surface2)}
      .enrs-subj-panel-item.selected{background:var(--blue-dim)}
      .enrs-subj-panel-item input[type=checkbox]{accent-color:var(--blue);width:15px;height:15px;cursor:pointer}
      .enrs-subj-code{font-family:var(--font-mono);font-size:11.5px;font-weight:700;
        color:var(--violet);min-width:48px}
      .enrs-subj-name{flex:1;color:var(--t2);font-size:12px}

      /* Student matrix table */
      .enrs-matrix-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:var(--r-sm)}
      .enrs-matrix{border-collapse:collapse;font-size:12px;width:100%;min-width:500px}
      .enrs-matrix th{background:var(--surface3);color:var(--t3);font-size:10px;font-weight:700;
        text-transform:uppercase;letter-spacing:.05em;padding:8px 10px;border-bottom:1px solid var(--border);
        white-space:nowrap;text-align:left}
      .enrs-matrix th.subj-col-hdr{background:var(--blue-dim);color:var(--blue);
        border-bottom:2px solid var(--blue);min-width:220px;vertical-align:top}
      .enrs-matrix td{padding:6px 8px;border-bottom:1px solid var(--border);vertical-align:top}
      .enrs-matrix tbody tr:last-child td{border-bottom:none}
      .enrs-matrix tbody tr:hover td{background:var(--surface2)}

      /* Cell inputs inside matrix */
      .enrs-cell-input{background:var(--surface);border:1px solid var(--border2);border-radius:5px;
        color:var(--t1);font-size:12px;padding:4px 7px;outline:none;width:100%;box-sizing:border-box;
        transition:border-color .15s}
      .enrs-cell-input:focus{border-color:var(--blue)}
      .enrs-cell-select{background:var(--surface);border:1px solid var(--border2);border-radius:5px;
        color:var(--t1);font-size:12px;padding:4px 7px;outline:none;width:100%;box-sizing:border-box;
        cursor:pointer}
      .enrs-cell-select:focus{border-color:var(--blue)}

      /* Subject column sub-header (session + batch fields row) */
      .enrs-subj-cell{display:flex;flex-direction:column;gap:4px}
      .enrs-subj-cell-row{display:flex;gap:4px;align-items:center}
      .enrs-subj-cell-lbl{font-size:9.5px;font-weight:700;color:var(--t4);
        text-transform:uppercase;letter-spacing:.05em;min-width:38px}

      /* Batch info pill inside cell */
      .enrs-batch-info{font-size:10px;color:var(--t3);margin-top:2px;display:flex;gap:6px;flex-wrap:wrap}
      .enrs-batch-info span{background:var(--surface3);padding:1px 6px;border-radius:8px}

      /* Add student row */
      .enrs-add-row{display:flex;gap:8px;align-items:center;margin-top:10px}

      /* Remove student button */
      .enrs-rm-btn{width:22px;height:22px;border:none;border-radius:4px;cursor:pointer;
        background:var(--red-dim);color:var(--red);display:inline-flex;align-items:center;
        justify-content:center;flex-shrink:0}
      .enrs-rm-btn:hover{opacity:.75}

      /* Student id mono */
      .enrs-sid{font-family:var(--font-mono);font-size:10.5px;color:var(--violet)}
    `;
    document.head.appendChild(st);
  }

  // ── Overlay ───────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'enr-overlay';
  document.body.appendChild(overlay);

  // ── Shorthand querySelector inside overlay ────────────────
  function G(id) { return overlay.querySelector('#' + id); }

  // ── Data helpers ──────────────────────────────────────────
  function getUniqueSessions() {
    // Sessions from students
    const fromStudents = (AppState.get('students') || []).map(s => s.session).filter(Boolean);
    // Sessions from batches
    const fromBatches  = (AppState.get('batches')  || []).map(b => b.sessionPeriod).filter(Boolean);
    const all = [...new Set([...fromStudents, ...fromBatches])];
    return all.sort((a, b) => {
      const p = v => { const [n, yy] = v.split('-'); return parseInt(yy) * 2 + (n === 'June' ? 1 : 0); };
      return p(b) - p(a);
    });
  }

  function getAdmBatches(sess) {
    if (!sess) return [];
    return [...new Set((AppState.get('students') || [])
      .filter(s => s.session === sess && (!_selCampus || s.campusId === _selCampus))
      .map(s => s.admissionBatch).filter(Boolean))].sort();
  }

  function getAllSubjects() { return AppState.get('subjects') || []; }

  // Get batches available for a given subjectId (optionally filtered by session)
  function getBatchesForSubject(subjectId, session) {
    let batches = AppState.get('batches') || [];
    if (subjectId) batches = batches.filter(b => b.subjectId === subjectId);
    if (session)   batches = batches.filter(b => b.sessionPeriod === session);
    return batches;
  }

  // Find a batch by subjectId + sessionPeriod + batchNo
  function findBatch(subjectId, sessionPeriod, batchNo) {
    if (!subjectId || !sessionPeriod || !batchNo) return null;
    const no = String(batchNo).trim();
    return (AppState.get('batches') || []).find(b =>
      b.subjectId === subjectId &&
      b.sessionPeriod === sessionPeriod &&
      (String(b.batchNo) === no || String(b.batchNo).padStart(2,'0') === no.padStart(2,'0'))
    ) || null;
  }

  function filterStudents() {
    let list = AppState.get('students') || [];
    if (_selCampus)   list = list.filter(s => s.campusId        === _selCampus);
    if (_selSession)  list = list.filter(s => s.session         === _selSession);
    if (_selAdmBatch) list = list.filter(s => s.admissionBatch  === _selAdmBatch);
    // Preserve _enrolled state and _subjectData for already-loaded students
    _studentRows = list.map(s => {
      const existing = _studentRows.find(r => r.id === s.id);
      return existing || { ...s, _enrolled: true, _subjectData: {} };
    });
  }

  // ── Subject multi-select dropdown ─────────────────────────
  let _subjPanelOpen = false;

  function renderSubjectDropdown() {
    const wrap = G('enrSubjDropWrap');
    if (!wrap) return;
    const allSubjs = getAllSubjects();

    const chipsHtml = _selectedSubjects.map(sid => {
      const sub = allSubjs.find(s => s.id === sid);
      if (!sub) return '';
      const code = sub.subjectCode || sub.abbreviation || sub.abbr || sid;
      return `<span class="enrs-subj-chip">
        ${code}
        <button class="enrs-subj-chip-x" data-sid="${sid}" title="Remove">×</button>
      </span>`;
    }).join('');

    wrap.innerHTML = `
      <div class="enrs-subj-dropdown">
        <div class="enrs-subj-trigger" id="enrSubjTrigger">
          ${chipsHtml || '<span class="enrs-subj-placeholder">— Select subjects to enrol —</span>'}
          <svg style="margin-left:auto;flex-shrink:0;color:var(--t3)" width="12" height="12"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
        <div class="enrs-subj-panel" id="enrSubjPanel" style="display:${_subjPanelOpen?'block':'none'}">
          ${allSubjs.map(sub => {
            const code = sub.subjectCode || sub.abbreviation || sub.abbr || sub.id;
            const name = sub.name || sub.fullName || sub.title || '';
            const sel  = _selectedSubjects.includes(sub.id);
            return `<label class="enrs-subj-panel-item ${sel?'selected':''}" data-sid="${sub.id}">
              <input type="checkbox" data-sid="${sub.id}" ${sel?'checked':''} />
              <span class="enrs-subj-code">${code}</span>
              <span class="enrs-subj-name">${name}</span>
            </label>`;
          }).join('')}
        </div>
      </div>`;

    // Toggle panel
    G('enrSubjTrigger').addEventListener('click', e => {
      _subjPanelOpen = !_subjPanelOpen;
      const panel = G('enrSubjPanel');
      if (panel) panel.style.display = _subjPanelOpen ? 'block' : 'none';
    });

    // Close panel on outside click
    document.addEventListener('click', function outsideClick(e) {
      if (!wrap.contains(e.target)) {
        _subjPanelOpen = false;
        const panel = G('enrSubjPanel');
        if (panel) panel.style.display = 'none';
        document.removeEventListener('click', outsideClick);
      }
    });

    // Checkbox toggles
    wrap.querySelectorAll('.enrs-subj-panel-item input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', e => {
        e.stopPropagation();
        const sid = cb.dataset.sid;
        if (cb.checked) {
          if (!_selectedSubjects.includes(sid)) _selectedSubjects.push(sid);
        } else {
          _selectedSubjects = _selectedSubjects.filter(x => x !== sid);
          // Clear first-row data for removed subject
          delete _firstRowData[sid];
          // Clear all student subject data for this subject
          _studentRows.forEach(s => { delete s._subjectData[sid]; });
        }
        _subjPanelOpen = true; // keep panel open after selection
        renderSubjectDropdown();
        renderStudentMatrix();
      });
    });

    // Chip remove buttons
    wrap.querySelectorAll('.enrs-subj-chip-x').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const sid = btn.dataset.sid;
        _selectedSubjects = _selectedSubjects.filter(x => x !== sid);
        delete _firstRowData[sid];
        _studentRows.forEach(s => { delete s._subjectData[sid]; });
        renderSubjectDropdown();
        renderStudentMatrix();
      });
    });
  }

  // ── Admission batch dropdown ──────────────────────────────
  function renderAdmBatchOpts() {
    const sel = G('enrFldAdmBatch');
    if (!sel) return;
    const batches = getAdmBatches(_selSession);
    sel.innerHTML = '<option value="">— All / Any —</option>' +
      batches.map(b => `<option value="${b}" ${b===_selAdmBatch?'selected':''}>${b}</option>`).join('');
  }

  // ── Student matrix table ──────────────────────────────────
  // Columns: # | Name | Disc | [per-subject: Session + BatchNo + BatchName] | Remove
  function renderStudentMatrix() {
    const wrap = G('enrMatrixWrap');
    const countEl = G('enrStudentCount');
    if (!wrap) return;

    const allSubjs  = getAllSubjects();
    const selSubjs  = _selectedSubjects.map(sid => allSubjs.find(s => s.id === sid)).filter(Boolean);
    const discs     = AppState.get('disciplines') || [];
    const sessions  = getUniqueSessions();

    if (!_selSession) {
      wrap.innerHTML = `<div style="text-align:center;color:var(--t3);padding:32px;font-size:13px">
        Select a session above to load students.</div>`;
      if (countEl) countEl.textContent = '';
      return;
    }

    if (!_studentRows.length) {
      wrap.innerHTML = `<div style="text-align:center;color:var(--t3);padding:32px;font-size:13px">
        No students found for this session${_selAdmBatch ? ' / '+_selAdmBatch : ''}.</div>`;
      if (countEl) countEl.textContent = '0 students';
      return;
    }

    if (countEl) countEl.textContent = _studentRows.length + ' student' + (_studentRows.length!==1?'s':'') + ' loaded';

    // Build column headers
    const subjColHeaders = selSubjs.map(sub => {
      const code = sub.subjectCode || sub.abbreviation || sub.abbr || sub.id;
      const name = sub.name || sub.fullName || '';
      return `<th class="subj-col-hdr">
        <div style="font-size:11px;font-weight:800;color:var(--blue)">${code}</div>
        ${name ? `<div style="font-size:10px;font-weight:400;color:var(--blue);opacity:.75;margin-top:1px">${name}</div>` : ''}
      </th>`;
    }).join('');

    // Build rows
    const rowsHtml = _studentRows.map((s, idx) => {
      const disc    = discs.find(d => d.id === s.disciplineId);
      const discAbbr = disc?.abbreviation || '—';

      const subjCells = selSubjs.map(sub => {
        const sd       = s._subjectData[sub.id] || {};
        const sess     = sd.session  || _firstRowData[sub.id]?.session  || '';
        const bno      = sd.batchNo  || _firstRowData[sub.id]?.batchNo  || '';
        const matched  = findBatch(sub.id, sess, bno);

        // Build session options
        const sessOpts = sessions.map(sv =>
          `<option value="${sv}" ${sv===sess?'selected':''}>${sv}</option>`
        ).join('');

        // Batch info display — removed for cleaner UI
        const batchInfoHtml = '';

        return `<td>
          <div class="enrs-subj-cell">
            <div class="enrs-subj-cell-row">
              <span class="enrs-subj-cell-lbl">Session</span>
              <select class="enrs-cell-select enrs-sess-sel"
                data-idx="${idx}" data-sid="${sub.id}">
                <option value="">—</option>
                ${sessOpts}
              </select>
              <span class="enrs-subj-cell-lbl" style="margin-left:6px">Batch #</span>
              <input type="text" class="enrs-cell-input enrs-bno-inp"
                data-idx="${idx}" data-sid="${sub.id}"
                placeholder="e.g. 1" value="${bno}"
                style="width:56px;flex-shrink:0"/>
            </div>
            ${batchInfoHtml}
          </div>
        </td>`;
      }).join('');

      return `<tr data-idx="${idx}">
        <td style="color:var(--t3);font-size:11px;text-align:center">${idx+1}</td>
        <td>
          <div style="font-weight:600;color:var(--t1);font-size:12.5px">${s.studentName}</div>
          <div class="enrs-sid">${s.studentId || s.id || ''}</div>
        </td>
        <td>
          <span style="font-size:11px;font-weight:700;color:var(--blue);background:var(--blue-dim);
            padding:2px 7px;border-radius:10px">${discAbbr}</span>
        </td>
        ${subjCells}
        <td style="text-align:center">
          <button class="enrs-rm-btn" data-idx="${idx}" title="Remove student">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </td>
      </tr>`;
    }).join('');

    wrap.innerHTML = `
      <div class="enrs-matrix-wrap">
        <table class="enrs-matrix">
          <thead>
            <tr>
              <th style="width:32px">#</th>
              <th>Student</th>
              <th>Disc.</th>
              ${subjColHeaders}
              <th style="width:32px"></th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;

    // ── Wire session selects ──────────────────────────────
    wrap.querySelectorAll('.enrs-sess-sel').forEach(sel => {
      sel.addEventListener('change', () => {
        const idx = parseInt(sel.dataset.idx);
        const sid = sel.dataset.sid;
        const val = sel.value;

        if (!_studentRows[idx]._subjectData[sid]) _studentRows[idx]._subjectData[sid] = {};
        _studentRows[idx]._subjectData[sid].session = val;

        // Auto-fill first-row data
        if (idx === 0) {
          if (!_firstRowData[sid]) _firstRowData[sid] = {};
          _firstRowData[sid].session = val;
          // Apply to all subsequent rows that haven't been individually set
          _studentRows.forEach((s, i) => {
            if (i === 0) return;
            if (!s._subjectData[sid]) s._subjectData[sid] = {};
            if (!s._subjectData[sid]._sessionOverride) {
              s._subjectData[sid].session = val;
            }
          });
        } else {
          // Mark as manually overridden
          _studentRows[idx]._subjectData[sid]._sessionOverride = true;
        }

        renderStudentMatrix();
      });
    });

    // ── Wire batch number inputs ──────────────────────────
    wrap.querySelectorAll('.enrs-bno-inp').forEach(inp => {
      inp.addEventListener('input', () => {
        const idx = parseInt(inp.dataset.idx);
        const sid = inp.dataset.sid;
        const val = inp.value.trim();

        if (!_studentRows[idx]._subjectData[sid]) _studentRows[idx]._subjectData[sid] = {};
        _studentRows[idx]._subjectData[sid].batchNo = val;

        // Auto-fill first-row data to subsequent rows
        if (idx === 0) {
          if (!_firstRowData[sid]) _firstRowData[sid] = {};
          _firstRowData[sid].batchNo = val;
          _studentRows.forEach((s, i) => {
            if (i === 0) return;
            if (!s._subjectData[sid]) s._subjectData[sid] = {};
            if (!s._subjectData[sid]._batchNoOverride) {
              s._subjectData[sid].batchNo = val;
            }
          });
          // Re-render to show batch info updates downstream
          // Use debounce-like approach: only re-render if user paused
          clearTimeout(inp._rt);
          inp._rt = setTimeout(() => renderStudentMatrix(), 400);
        } else {
          _studentRows[idx]._subjectData[sid]._batchNoOverride = true;
          clearTimeout(inp._rt);
          inp._rt = setTimeout(() => renderStudentMatrix(), 400);
        }
      });
    });

    // ── Wire remove buttons ───────────────────────────────
    wrap.querySelectorAll('.enrs-rm-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _studentRows.splice(parseInt(btn.dataset.idx), 1);
        renderStudentMatrix();
        renderAddStudentRow();
      });
    });
  }

  // ── Add individual student row (searchable combobox) ─────
  function renderAddStudentRow() {
    const wrap = G('enrAddStudentWrap');
    if (!wrap) return;
    const shown = new Set(_studentRows.map(s => s.id));
    const avail = (AppState.get('students') || []).filter(s => !shown.has(s.id));

    // Inject searchable combobox styles once
    if (!document.getElementById('enrs-search-sel-css')) {
      const st = document.createElement('style');
      st.id = 'enrs-search-sel-css';
      st.textContent = `
        .enrs-search-sel-wrap{position:relative;flex:1;min-width:0}
        .enrs-search-input{width:100%;background:var(--surface2);border:1px solid var(--border2);
          border-radius:var(--r-sm);color:var(--t1);font-size:13px;padding:8px 32px 8px 10px;
          outline:none;transition:border-color .15s;box-sizing:border-box}
        .enrs-search-input:focus{border-color:var(--blue)}
        .enrs-search-input::placeholder{color:var(--t4)}
        .enrs-search-clear{position:absolute;right:8px;top:50%;transform:translateY(-50%);
          background:none;border:none;cursor:pointer;color:var(--t3);padding:0;
          display:none;align-items:center;justify-content:center;width:16px;height:16px}
        .enrs-search-clear:hover{color:var(--t1)}
        .enrs-search-dropdown{position:absolute;top:calc(100% + 3px);left:0;right:0;z-index:2000;
          background:var(--surface);border:1px solid var(--border2);border-radius:var(--r-sm);
          box-shadow:var(--shadow-lg);max-height:220px;overflow-y:auto;display:none}
        .enrs-search-dropdown.open{display:block}
        .enrs-search-item{padding:8px 12px;cursor:pointer;font-size:13px;color:var(--t1);
          border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:2px}
        .enrs-search-item:last-child{border-bottom:none}
        .enrs-search-item:hover,.enrs-search-item.highlighted{background:var(--blue-dim);color:var(--blue)}
        .enrs-search-item-sub{font-size:11px;color:var(--t3);font-family:var(--font-mono)}
        .enrs-search-item.highlighted .enrs-search-item-sub{color:var(--blue);opacity:.75}
        .enrs-search-empty{padding:12px;text-align:center;font-size:12px;color:var(--t3)}
        .enrs-search-highlight{background:var(--yellow-dim);color:var(--t1);border-radius:2px;
          font-weight:700;padding:0 1px}
      `;
      document.head.appendChild(st);
    }

    wrap.innerHTML = `
      <div class="enrs-add-row">
        <div class="enrs-search-sel-wrap">
          <input type="text" id="enrAddStudentSearch" class="enrs-search-input"
            placeholder="— Add individual student — (type to search)" autocomplete="off"/>
          <button id="enrAddStudentClear" class="enrs-search-clear" tabindex="-1" title="Clear">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <div id="enrAddStudentDropdown" class="enrs-search-dropdown"></div>
        </div>
        <button id="enrAddStudentBtn" class="enr-btn enr-btn-ghost" style="flex-shrink:0">+ Add</button>
      </div>`;

    let _selectedStudentId = null;
    let _highlightIdx = -1;

    const searchInp  = G('enrAddStudentSearch');
    const dropdown   = G('enrAddStudentDropdown');
    const clearBtn   = G('enrAddStudentClear');
    const addBtn     = G('enrAddStudentBtn');

    function highlight(text, query) {
      if (!query) return text;
      const idx = text.toLowerCase().indexOf(query.toLowerCase());
      if (idx === -1) return text;
      return text.slice(0, idx) +
        `<mark class="enrs-search-highlight">${text.slice(idx, idx + query.length)}</mark>` +
        text.slice(idx + query.length);
    }

    function getFiltered(q) {
      if (!q.trim()) return avail.slice(0, 50); // show first 50 when empty
      const ql = q.trim().toLowerCase();
      return avail.filter(s =>
        s.studentName.toLowerCase().includes(ql) ||
        (s.cnic || '').toLowerCase().includes(ql) ||
        (s.studentId || s.id || '').toLowerCase().includes(ql)
      ).slice(0, 50);
    }

    function renderDropdown(q) {
      const filtered = getFiltered(q);
      _highlightIdx = -1;
      if (!filtered.length) {
        dropdown.innerHTML = `<div class="enrs-search-empty">No students found</div>`;
      } else {
        dropdown.innerHTML = filtered.map((s, i) => `
          <div class="enrs-search-item" data-id="${s.id}" data-idx="${i}">
            <span>${highlight(s.studentName, q)}</span>
            ${s.cnic || s.studentId ? `<span class="enrs-search-item-sub">${s.studentId || s.id}${s.cnic ? ' · ' + s.cnic : ''}</span>` : ''}
          </div>`).join('');

        // Wire click on each item
        dropdown.querySelectorAll('.enrs-search-item').forEach(item => {
          item.addEventListener('mousedown', e => {
            e.preventDefault(); // prevent blur before click
            const id = item.dataset.id;
            const st = avail.find(s => s.id === id);
            if (st) {
              _selectedStudentId = st.id;
              searchInp.value = st.studentName + (st.cnic ? ' (' + st.cnic + ')' : '');
              clearBtn.style.display = 'flex';
              dropdown.classList.remove('open');
            }
          });
        });
      }
      dropdown.classList.add('open');
    }

    function moveHighlight(dir) {
      const items = dropdown.querySelectorAll('.enrs-search-item');
      if (!items.length) return;
      items.forEach(i => i.classList.remove('highlighted'));
      _highlightIdx = (_highlightIdx + dir + items.length) % items.length;
      const target = items[_highlightIdx];
      if (target) {
        target.classList.add('highlighted');
        target.scrollIntoView({ block: 'nearest' });
      }
    }

    function selectHighlighted() {
      const items = dropdown.querySelectorAll('.enrs-search-item');
      if (_highlightIdx >= 0 && items[_highlightIdx]) {
        const id = items[_highlightIdx].dataset.id;
        const st = avail.find(s => s.id === id);
        if (st) {
          _selectedStudentId = st.id;
          searchInp.value = st.studentName + (st.cnic ? ' (' + st.cnic + ')' : '');
          clearBtn.style.display = 'flex';
          dropdown.classList.remove('open');
        }
      }
    }

    searchInp.addEventListener('input', () => {
      _selectedStudentId = null;
      const q = searchInp.value;
      clearBtn.style.display = q ? 'flex' : 'none';
      renderDropdown(q);
    });

    searchInp.addEventListener('focus', () => {
      renderDropdown(searchInp.value);
    });

    searchInp.addEventListener('blur', () => {
      // slight delay so mousedown on items fires first
      setTimeout(() => dropdown.classList.remove('open'), 150);
    });

    searchInp.addEventListener('keydown', e => {
      if (!dropdown.classList.contains('open')) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); moveHighlight(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveHighlight(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); selectHighlighted(); }
      else if (e.key === 'Escape') { dropdown.classList.remove('open'); }
    });

    clearBtn.addEventListener('click', () => {
      _selectedStudentId = null;
      searchInp.value = '';
      clearBtn.style.display = 'none';
      searchInp.focus();
    });

    addBtn.addEventListener('click', () => {
      if (!_selectedStudentId) { Toast.error('Pehle student select karein.'); return; }
      const st = (AppState.get('students') || []).find(s => s.id === _selectedStudentId);
      if (st) {
        _studentRows.push({ ...st, _enrolled: true, _subjectData: {} });
        renderStudentMatrix();
        renderAddStudentRow();
      }
    });
  }

  // ── Collect subject assignments from student rows ─────────
  // Returns array of subject records for saving
  function collectSubjectsForStudent(studentRow) {
    const allSubjs = getAllSubjects();
    return _selectedSubjects.map(sid => {
      const sd      = studentRow._subjectData[sid] || {};
      const sess    = sd.session || _firstRowData[sid]?.session || '';
      const bno     = sd.batchNo || _firstRowData[sid]?.batchNo || '';
      const matched = findBatch(sid, sess, bno);
      const sub     = allSubjs.find(s => s.id === sid);
      return {
        subjectId:  sid,
        session:    sess,
        batchNo:    bno,
        batchId:    matched?.id        || '',
        batchName:  matched?.batchName || '',
        startDate:  matched?.startDate || '',
        endDate:    matched?.endDate   || '',
        status:     'active',
      };
    }).filter(x => x.subjectId);
  }

  // ── Build modal HTML ──────────────────────────────────────
  const sessions = getUniqueSessions();
  const campuses = (AppState.get('campuses') || []);

  overlay.innerHTML = `
<div class="enr-modal" style="max-width:900px;width:100%;margin:auto" role="dialog" aria-modal="true">

  <!-- Header -->
  <div class="enr-modal-hdr">
    <span class="enr-modal-title">${isEdit ? 'Edit Enrolment' : 'Add Enrolment'}</span>
    <button class="enr-modal-close" id="enrModalClose" title="Close">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>

  <div class="enr-modal-body">

    <!-- ① Campus, Session & Admission Batch -->
    <div class="enrs-box">
      <div class="enrs-box-title"><span class="enrs-badge">1</span>Session &amp; Admission Batch</div>
      <div class="enr-form-row" style="grid-template-columns:1fr 1fr 1fr">
        <div class="enr-field" style="margin-bottom:0">
          <label class="enr-label">Campus <span style="color:var(--red)">*</span></label>
          <select id="enrFldCampus" class="enr-select">
            <option value="">— Select campus —</option>
            ${campuses.map(c => `<option value="${c.id}" ${c.id===_selCampus?'selected':''}>${c.campusName || c.name || c.id}</option>`).join('')}
          </select>
        </div>
        <div class="enr-field" style="margin-bottom:0">
          <label class="enr-label">Session <span style="color:var(--red)">*</span></label>
          <select id="enrFldSession" class="enr-select">
            <option value="">— Select session —</option>
            ${sessions.map(sv => `<option value="${sv}" ${sv===_selSession?'selected':''}>${sv}</option>`).join('')}
          </select>
        </div>
        <div class="enr-field" style="margin-bottom:0">
          <label class="enr-label">Admission Batch
            <span style="font-size:10px;color:var(--t4);font-weight:400;text-transform:none">(filter students)</span>
          </label>
          <select id="enrFldAdmBatch" class="enr-select"><option value="">— All / Any —</option></select>
        </div>
      </div>
    </div>

    <!-- ② Subjects multi-select -->
    <div class="enrs-box">
      <div class="enrs-box-title"><span class="enrs-badge">2</span>Subjects
        <span style="font-size:10.5px;font-weight:400;color:var(--t3);text-transform:none;margin-left:6px">
          — select all subjects students will be enrolled in
        </span>
      </div>
      <div id="enrSubjDropWrap"></div>
    </div>

    <!-- ③ Students + Subject-Batch matrix -->
    <div class="enrs-box">
      <div class="enrs-box-title" style="justify-content:space-between">
        <span><span class="enrs-badge">3</span>Students &amp; Subject Batches</span>
        <span id="enrStudentCount" style="font-size:11px;color:var(--t3);font-weight:400;text-transform:none"></span>
      </div>
      <p style="font-size:11.5px;color:var(--t3);margin:0 0 10px">
        For each student, select the <b>session</b> and type the <b>batch number</b> for each subject.
        The first student's values auto-fill all others — override individually if needed.
      </p>
      <div id="enrMatrixWrap"></div>
      <div id="enrAddStudentWrap" style="margin-top:10px"></div>
    </div>

  </div><!-- /body -->

  <div class="enr-modal-footer">
    <button class="enr-btn enr-btn-ghost"   id="enrModalCancel">Cancel</button>
    <button class="enr-btn enr-btn-primary" id="enrModalSave">
      ${isEdit ? 'Save Changes' : 'Enrol Students'}
    </button>
  </div>

</div>`;

  // ── Wire close ────────────────────────────────────────────
  const close = () => overlay.remove();
  G('enrModalClose').addEventListener('click', close);
  G('enrModalCancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  // ── Wire campus change ────────────────────────────────────
  G('enrFldCampus').addEventListener('change', e => {
    _selCampus   = e.target.value;
    _selAdmBatch = '';
    _firstRowData = {};
    renderAdmBatchOpts();
    filterStudents();
    renderStudentMatrix();
    renderAddStudentRow();
  });

  // ── Wire session change ───────────────────────────────────
  G('enrFldSession').addEventListener('change', e => {
    _selSession  = e.target.value;
    _selAdmBatch = '';
    _firstRowData = {}; // reset auto-fill on session change
    renderAdmBatchOpts();
    filterStudents();
    renderStudentMatrix();
    renderAddStudentRow();
  });

  G('enrFldAdmBatch').addEventListener('change', e => {
    _selAdmBatch = e.target.value;
    filterStudents();
    renderStudentMatrix();
    renderAddStudentRow();
  });

  // ── Initial renders ───────────────────────────────────────
  renderSubjectDropdown();
  renderAdmBatchOpts();
  if (_selSession) {
    filterStudents();
  }
  renderStudentMatrix();
  renderAddStudentRow();

  // ── Save ──────────────────────────────────────────────────
  G('enrModalSave').addEventListener('click', () => {
    const enrolmentDate = new Date().toISOString().slice(0, 10);
    const status        = 'active';
    const feeStatus     = 'unpaid';
    const notes         = '';
    const user          = AppState.get('currentUser')?.username || null;

    if (isEdit) {
      // In edit mode, update the single enrolment record
      const subjects = collectSubjectsForStudent(_studentRows[0] || {});
      const r = EnrolmentService.update(enrolmentId,
        { status, feeStatus, enrolmentDate, notes, subjects,
          session: _selSession, admissionBatch: _selAdmBatch }, user);
      if (r.success) { Toast.success('Enrolment updated.'); close(); renderTable(); renderSummary(); }
      else Toast.error(r.message || 'Update failed.');
      return;
    }

    // Add mode — enrol each student
    const toEnrol = _studentRows.filter(s => s._enrolled !== false);
    if (!toEnrol.length) { Toast.error('No students to enrol. Load students first.'); return; }
    if (!_selCampus)     { Toast.error('Please select a campus.'); return; }
    if (!_selSession)    { Toast.error('Please select a session.'); return; }

    // ── Pre-check: find duplicates before saving ──────────────
    const existingEnrolments = EnrolmentService.getAll();
    const students           = AppState.get('students') || [];
    const conflicts = [];

    toEnrol.forEach(s => {
      const subjects   = collectSubjectsForStudent(s);
      const primaryBid = subjects[0]?.batchId || '';
      const isDup = existingEnrolments.some(e =>
        e.studentId === s.id && e.batchId === primaryBid
      );
      if (isDup) {
        const stu     = students.find(st => st.id === s.id);
        const existE  = existingEnrolments.find(e => e.studentId === s.id && e.batchId === primaryBid);
        const enriched = EnrolmentService.getEnriched().find(x => x.id === existE?.id);
        conflicts.push({
          studentId:   s.id,
          studentName: stu?.studentName || s.id,
          studentCnic: stu?.cnic || '',
          batchName:   enriched?.batchName || primaryBid,
          existingId:  existE?.id || '',
        });
      }
    });

    // ── If conflicts found → show conflict modal ──────────────
    if (conflicts.length) {
      showConflictModal({
        conflicts,
        onProceed: (removedIds) => {
          // removedIds = studentIds user ne remove kiye
          const finalList = toEnrol.filter(s => !removedIds.includes(s.id));
          if (!finalList.length) { Toast.error('No students left to enrol.'); return; }
          let added = 0, skipped = 0;
          finalList.forEach(s => {
            const subjects = collectSubjectsForStudent(s);
            const r = EnrolmentService.add({
              studentId: s.id, enrolmentDate, status, feeStatus, notes, subjects,
              campusId: _selCampus,
              session: _selSession, admissionBatch: _selAdmBatch,
              batchId: subjects[0]?.batchId || '',
            }, user);
            if (r.success) added++; else skipped++;
          });
          close(); renderTable(); renderSummary();
          if (skipped) Toast.error(added + ' enrolled, ' + skipped + ' skipped.');
          else Toast.success(added + ' student' + (added !== 1 ? 's' : '') + ' enrolled successfully.');
        },
      });
      return;
    }

    // ── No conflicts — save directly ──────────────────────────
    let added = 0, skipped = 0;
    toEnrol.forEach(s => {
      const subjects = collectSubjectsForStudent(s);
      const r = EnrolmentService.add({
        studentId:      s.id,
        enrolmentDate,
        status,
        feeStatus,
        notes,
        subjects,
        campusId:       _selCampus,
        session:        _selSession,
        admissionBatch: _selAdmBatch,
        batchId:        subjects[0]?.batchId || '',
      }, user);
      if (r.success) added++; else skipped++;
    });

    close(); renderTable(); renderSummary();
    if (skipped) Toast.error(added + ' enrolled, ' + skipped + ' skipped (duplicate or error).');
    else Toast.success(added + ' student' + (added !== 1 ? 's' : '') + ' enrolled successfully.');
  });
}

// ── Conflict Modal — duplicate students dikhao, remove karne do ─
function showConflictModal({ conflicts, onProceed }) {
  const removedIds = new Set();

  const overlay = document.createElement('div');
  overlay.className = 'enr-overlay';

  function buildRows() {
    return conflicts.map(c => `
      <div class="enr-conflict-row" id="crow-${c.studentId}">
        <div class="enr-conflict-info">
          <div class="enr-conflict-name">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2.5" style="color:var(--red);margin-right:5px;vertical-align:-1px">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            ${c.studentName}
          </div>
          <div class="enr-conflict-detail">
            ${c.studentCnic ? 'CNIC: ' + c.studentCnic + ' &nbsp;|&nbsp; ' : ''}
            Pehle se enrolled in: <b>${c.batchName}</b>
          </div>
        </div>
        <button class="enr-conflict-remove" data-sid="${c.studentId}">
          List se Hata Do
        </button>
      </div>
    `).join('');
  }

  overlay.innerHTML = `
<div class="enr-modal" style="max-width:560px">
  <div class="enr-modal-hdr">
    <span class="enr-modal-title" style="color:var(--red)">
      ⚠️ ${conflicts.length} Duplicate Student${conflicts.length > 1 ? 's' : ''} Mili ${conflicts.length > 1 ? 'Hain' : 'Hai'}
    </span>
    <button class="enr-modal-close" id="enrCnfClose">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>
  <div class="enr-modal-body">
    <p style="font-size:13px;color:var(--t2);margin:0 0 12px;line-height:1.6">
      Neeche diye gaye students <b>pehle se enrol</b> hain. Inhe list se hata kar baaki students ko 
      enrol kar sakte hain, ya Cancel karke dobara check kar sakte hain.
    </p>
    <div class="enr-conflict-wrap" id="enrConflictList">
      ${buildRows()}
    </div>
  </div>
  <div class="enr-modal-footer" style="justify-content:space-between">
    <div style="font-size:12px;color:var(--t3)" id="enrCnfCounter">
      ${conflicts.length} conflict(s) found — none removed yet
    </div>
    <div style="display:flex;gap:10px">
      <button class="enr-btn enr-btn-ghost" id="enrCnfCancel">Cancel</button>
      <button class="enr-btn enr-btn-primary" id="enrCnfProceed">
        Enrol Remaining Students
      </button>
    </div>
  </div>
</div>`;

  document.body.appendChild(overlay);

  const closeModal = () => overlay.remove();

  overlay.querySelector('#enrCnfClose').addEventListener('click', closeModal);
  overlay.querySelector('#enrCnfCancel').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  // ── Wire remove buttons ────────────────────────────────────
  function updateCounter() {
    const el = overlay.querySelector('#enrCnfCounter');
    if (!el) return;
    const total   = conflicts.length;
    const removed = removedIds.size;
    const left    = total - removed;
    el.textContent = removed === 0
      ? `${total} conflict — none removed yet`
      : `${removed} hataye gaye, ${left} baki hain`;
  }

  overlay.querySelectorAll('.enr-conflict-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid = btn.dataset.sid;
      if (removedIds.has(sid)) return;
      removedIds.add(sid);

      // Visual feedback
      const row = overlay.querySelector('#crow-' + sid);
      if (row) {
        row.style.opacity = '0.45';
        row.style.textDecoration = 'line-through';
      }
      btn.textContent = '✓ Removed';
      btn.classList.add('removed');
      btn.disabled = true;
      updateCounter();
    });
  });

  // ── Proceed button ─────────────────────────────────────────
  overlay.querySelector('#enrCnfProceed').addEventListener('click', () => {
    closeModal();
    onProceed([...removedIds]);
  });
}

// ── Bulk Delete confirmation ─────────────────────────────────
function confirmBulkDelete(ids) {
  if (!ids.length) return;

  // collect unique enrolment IDs (multiple rows can share one enrolmentId)
  const uniqueIds = [...new Set(ids)];
  const enriched  = EnrolmentService.getEnriched();

  // build a readable list — one entry per unique enrolment
  const names = uniqueIds.map(id => {
    const e = enriched.find(x => x.id === id);
    return e ? e.studentName : id;
  });

  const overlay = document.createElement('div');
  overlay.className = 'enr-overlay';
  overlay.innerHTML = `
<div class="enr-modal" style="max-width:460px">
  <div class="enr-modal-hdr">
    <span class="enr-modal-title" style="color:var(--red)">
      Delete ${uniqueIds.length} Enrolment${uniqueIds.length > 1 ? 's' : ''}?
    </span>
    <button class="enr-modal-close" id="enrBDClose">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>
  <div class="enr-modal-body">
    <p style="font-size:13px;color:var(--t2);margin:0 0 12px;line-height:1.6">
      The following <b>${uniqueIds.length} enrolment${uniqueIds.length > 1 ? 's' : ''}</b> will be permanently deleted.
      This action cannot be undone.
    </p>
    <div style="background:var(--red-dim);border:1px solid var(--red);border-radius:var(--r-sm);
      padding:10px 14px;max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:4px">
      ${names.map(n => `
        <div style="font-size:12.5px;color:var(--red);display:flex;align-items:center;gap:6px">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          </svg>
          ${n}
        </div>`).join('')}
    </div>
  </div>
  <div class="enr-modal-footer">
    <button class="enr-btn enr-btn-ghost"  id="enrBDCancel">Cancel</button>
    <button class="enr-btn enr-btn-danger" id="enrBDConfirm">
      Yes, Delete (${uniqueIds.length})
    </button>
  </div>
</div>`;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();

  overlay.querySelector('#enrBDClose').addEventListener('click', close);
  overlay.querySelector('#enrBDCancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  overlay.querySelector('#enrBDConfirm').addEventListener('click', () => {
    let deleted = 0, failed = 0;
    uniqueIds.forEach(id => {
      const r = EnrolmentService.remove(id);
      if (r.success) deleted++; else failed++;
    });
    _selected.clear();
    close();
    renderTable();
    renderSummary();
    if (failed) Toast.error(deleted + ' deleted, ' + failed + ' failed.');
    else Toast.success(deleted + ' enrolment' + (deleted > 1 ? 's' : '') + ' deleted.');
  });
}

// ── Delete confirmation ───────────────────────────────────────
function confirmDelete(id) {
  const e = EnrolmentService.getById(id);
  if (!e) return;

  const enriched = EnrolmentService.getEnriched().find(x => x.id === id);
  const name     = enriched?.studentName || 'this student';

  const overlay = document.createElement('div');
  overlay.className = 'enr-overlay';
  overlay.innerHTML = `
<div class="enr-modal" style="max-width:400px">
  <div class="enr-modal-hdr">
    <span class="enr-modal-title">Remove Enrolment</span>
    <button class="enr-modal-close" id="enrDelClose">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>
  <div class="enr-modal-body" style="color:var(--t2);font-size:13.5px;line-height:1.6">
    Are you sure you want to remove the enrolment for
    <strong style="color:var(--t1)">${name}</strong>?
    This action cannot be undone.
  </div>
  <div class="enr-modal-footer">
    <button class="enr-btn enr-btn-ghost" id="enrDelCancel">Cancel</button>
    <button class="enr-btn enr-btn-danger" id="enrDelConfirm">Yes, Remove</button>
  </div>
</div>`;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();

  overlay.querySelector('#enrDelClose').addEventListener('click', close);
  overlay.querySelector('#enrDelCancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  overlay.querySelector('#enrDelConfirm').addEventListener('click', () => {
    const result = EnrolmentService.remove(id);
    if (result.success) {
      Toast.success('Enrolment removed.');
      close();
      renderTable();
      renderSummary();
    } else {
      Toast.error(result.message || 'Could not remove enrolment.');
    }
  });
}
