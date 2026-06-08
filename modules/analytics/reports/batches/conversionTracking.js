// ============================================================
// modules/analytics/reports/batches/conversionTracking.js
// Report: Conversion Tracking
// Shows student journey across subject chains per ACCA track
// FA1 → FA2 → F3  |  MA1 → MA2 → F2
// Data source: AppState enrolments + batches + students
// ============================================================

import { AppState } from '../../../../utils/state.js';

// ── ACCA Foundation tracks ────────────────────────────────────
const TRACKS = [
  { id: 'fa', label: 'FA Track', chain: ['FA1', 'FA2', 'F3'] },
  { id: 'ma', label: 'MA Track', chain: ['MA1', 'MA2', 'F2'] },
];

// ── Styles (injected once) ────────────────────────────────────
let _stylesInjected = false;
function injectStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const s = document.createElement('style');
  s.textContent = `
.ct-wrap { display:flex; flex-direction:column; gap:20px; }

.ct-track-nav {
  display:flex; gap:4px;
  border-bottom:1px solid var(--border);
}
.ct-track-btn {
  display:flex; align-items:center; gap:7px;
  padding:8px 16px;
  border-radius:var(--r-sm) var(--r-sm) 0 0;
  font-size:12.5px; font-weight:600;
  color:var(--t2); background:none; border:none;
  border-bottom:2px solid transparent;
  margin-bottom:-1px; cursor:pointer;
  transition:color .15s, background .15s;
}
.ct-track-btn:hover { color:var(--t1); background:var(--surface2); }
.ct-track-btn.active { color:var(--blue); border-bottom-color:var(--blue); background:var(--blue-dim); }

.ct-kpi-row {
  display:grid;
  grid-template-columns: repeat(4, 1fr);
  gap:12px;
}
@media(max-width:900px){ .ct-kpi-row{ grid-template-columns:repeat(2,1fr); } }
@media(max-width:500px){ .ct-kpi-row{ grid-template-columns:1fr 1fr; } }

.ct-kpi {
  background:var(--surface);
  border:1px solid var(--border);
  border-radius:var(--r-lg);
  padding:16px 18px;
  display:flex; flex-direction:column; gap:4px;
}
.ct-kpi-val {
  font-family:var(--font-display);
  font-size:26px; font-weight:800;
  color:var(--t1); line-height:1.1;
}
.ct-kpi-lbl { font-size:12px; color:var(--t2); font-weight:500; }
.ct-kpi-sub { font-size:11px; color:var(--t3); margin-top:2px; }
.ct-kpi-bar-wrap { height:3px; background:var(--surface3); border-radius:3px; margin-top:8px; overflow:hidden; }
.ct-kpi-bar      { height:100%; border-radius:3px; width:0; transition:width .9s cubic-bezier(.16,1,.3,1); }

.ct-table-wrap {
  overflow-x:auto;
  border:1px solid var(--border);
  border-radius:var(--r-lg);
}
.ct-table {
  width:100%; border-collapse:collapse;
  font-size:13px;
  min-width:700px;
}
.ct-th-group {
  padding:10px 14px;
  font-size:11px; font-weight:700;
  text-transform:uppercase; letter-spacing:.07em;
  text-align:center;
  border-bottom:1px solid var(--border);
  border-right:1px solid var(--border2);
  white-space:nowrap;
}
.ct-th-group:last-child { border-right:none; }

.ct-table th {
  background:var(--surface2);
  color:var(--t3);
  font-size:10.5px; font-weight:600;
  text-transform:uppercase; letter-spacing:.06em;
  padding:9px 12px;
  text-align:left;
  border-bottom:1px solid var(--border);
  white-space:nowrap;
}
.ct-table th.ct-col-sep { border-left:2px solid var(--border2); }
.ct-table td {
  padding:10px 12px;
  border-bottom:1px solid var(--border);
  color:var(--t2);
  vertical-align:middle;
}
.ct-table td.ct-col-sep { border-left:2px solid var(--border2); }
.ct-table tbody tr:last-child td { border-bottom:none; }
.ct-table tbody tr:hover td { background:var(--surface2); }

.ct-student-name { font-weight:600; color:var(--t1); font-size:13px; }
.ct-student-id   { font-size:11px; color:var(--t3); margin-top:2px; }
.ct-dash { color:var(--t4); font-size:13px; }
.ct-session-pill {
  display:inline-flex; align-items:center;
  padding:2px 8px; border-radius:20px;
  font-size:11px; font-weight:600;
  background:var(--blue-dim); color:var(--blue);
  white-space:nowrap;
}
.ct-batch-no { font-size:12px; color:var(--t2); }

.ct-badge {
  display:inline-flex; align-items:center;
  padding:2px 8px; border-radius:20px;
  font-size:11px; font-weight:600;
  white-space:nowrap;
}
.ct-badge-active        { background:var(--green-dim);           color:var(--green);  }
.ct-badge-dormant       { background:rgba(136,146,180,.12);      color:var(--t2);     }
.ct-badge-left_study    { background:var(--red-dim);             color:var(--red);    }
.ct-badge-left_campus   { background:var(--red-dim);             color:var(--red);    }
.ct-badge-change_campus { background:var(--yellow-dim);          color:var(--yellow); }
.ct-badge-exempt        { background:var(--blue-dim);            color:var(--blue);   }
.ct-badge-completed     { background:var(--cyan-dim);            color:var(--cyan);   }

.ct-funnel-wrap {
  background:var(--surface);
  border:1px solid var(--border);
  border-radius:var(--r-lg);
  padding:20px 24px;
}
.ct-funnel-title {
  font-family:var(--font-display);
  font-size:13.5px; font-weight:700;
  color:var(--t1); margin-bottom:16px;
}
.ct-funnel-steps { display:flex; flex-direction:column; gap:10px; }
.ct-funnel-step  { display:flex; align-items:center; gap:12px; }
.ct-funnel-lbl   { font-size:12px; font-weight:600; color:var(--t2); min-width:40px; }
.ct-funnel-bar-bg { flex:1; height:30px; background:var(--surface2); border-radius:6px; overflow:hidden; }
.ct-funnel-bar-fill {
  height:100%; border-radius:6px;
  display:flex; align-items:center; padding-left:12px;
  font-size:11.5px; font-weight:700; color:#fff;
  transition:width .9s cubic-bezier(.16,1,.3,1);
  width:0; white-space:nowrap; min-width:0;
}
.ct-funnel-pct { font-size:11px; color:var(--t3); min-width:38px; text-align:right; }

.ct-filter-bar {
  display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end;
  background:var(--surface);
  border:1px solid var(--border);
  border-radius:var(--r-lg);
  padding:14px 16px;
}
.ct-filter-group { display:flex; flex-direction:column; gap:4px; flex:1; min-width:130px; }
.ct-filter-label { font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--t3); }
.ct-filter-select {
  padding:6px 10px;
  border-radius:var(--r-sm);
  border:1px solid var(--border);
  background:var(--surface2);
  color:var(--t1);
  font-size:12.5px;
  cursor:pointer;
  outline:none;
  width:100%;
}
.ct-filter-select:focus { border-color:var(--blue); }
.ct-filter-reset {
  padding:6px 14px;
  border-radius:var(--r-sm);
  border:1px solid var(--border);
  background:var(--surface2);
  color:var(--t2);
  font-size:12px; font-weight:600;
  cursor:pointer;
  align-self:flex-end;
  white-space:nowrap;
  transition:background .15s, color .15s;
}
.ct-filter-reset:hover { background:var(--red-dim); color:var(--red); border-color:var(--red); }
.ct-filter-badge {
  display:inline-flex; align-items:center; gap:4px;
  background:var(--blue-dim); color:var(--blue);
  border-radius:20px; padding:2px 8px;
  font-size:10.5px; font-weight:700;
  margin-left:6px;
}

/* ── Group header clickable filter tabs ── */
.ct-th-group {
  position:relative;
  cursor:pointer;
  user-select:none;
  transition:filter .15s;
}
.ct-th-group:hover { filter:brightness(1.08); }
.ct-th-group-inner {
  display:inline-flex; align-items:center; gap:6px;
  justify-content:center;
}
.ct-th-funnel {
  opacity:.55; flex-shrink:0;
  transition:opacity .15s;
}
.ct-th-group:hover .ct-th-funnel { opacity:1; }
.ct-th-chip {
  display:inline-flex; align-items:center; gap:4px;
  background:rgba(0,0,0,.18); color:inherit;
  border-radius:20px; padding:1px 7px 1px 6px;
  font-size:10px; font-weight:700;
  letter-spacing:.02em; line-height:1.5;
  white-space:nowrap;
}
.ct-th-chip-x {
  font-size:10px; opacity:.75; margin-left:1px;
  cursor:pointer; line-height:1;
}
.ct-th-chip-x:hover { opacity:1; }

/* ── Popover ── */
.ct-popover {
  position:absolute;
  top:calc(100% + 4px);
  left:50%; transform:translateX(-50%);
  z-index:999;
  background:var(--surface);
  border:1px solid var(--border);
  border-radius:var(--r-lg);
  box-shadow:0 8px 28px rgba(0,0,0,.18);
  padding:14px 16px 12px;
  min-width:210px;
  display:flex; flex-direction:column; gap:10px;
  animation:ct-pop-in .12s ease;
}
@keyframes ct-pop-in {
  from { opacity:0; transform:translateX(-50%) translateY(-4px); }
  to   { opacity:1; transform:translateX(-50%) translateY(0);    }
}
.ct-popover-title {
  font-size:11px; font-weight:800;
  text-transform:uppercase; letter-spacing:.07em;
  margin-bottom:2px;
}
.ct-popover-row { display:flex; flex-direction:column; gap:3px; }
.ct-popover-label {
  font-size:10px; font-weight:700; text-transform:uppercase;
  letter-spacing:.06em; color:var(--t3);
}
.ct-popover-select {
  padding:6px 10px;
  border-radius:var(--r-sm);
  border:1px solid var(--border);
  background:var(--surface2);
  color:var(--t1); font-size:12.5px;
  cursor:pointer; outline:none; width:100%;
}
.ct-popover-select:focus { border-color:currentColor; }
/* ── Multi-select checkbox list ── */
.ct-chk-list {
  display:flex; flex-direction:column; gap:1px;
  max-height:140px; overflow-y:auto;
  border:1px solid var(--border);
  border-radius:var(--r-sm);
  background:var(--surface2);
  padding:3px 0;
}
.ct-chk-list::-webkit-scrollbar { width:4px; }
.ct-chk-list::-webkit-scrollbar-thumb { background:var(--border); border-radius:4px; }
.ct-chk-item {
  display:flex; align-items:center; gap:8px;
  padding:5px 10px;
  cursor:pointer;
  font-size:12.5px; color:var(--t1);
  border-radius:3px;
  transition:background .1s;
  user-select:none;
}
.ct-chk-item:hover { background:var(--surface3,rgba(128,128,128,.1)); }
.ct-chk-item input[type=checkbox] {
  width:13px; height:13px; margin:0;
  accent-color:currentColor;
  cursor:pointer; flex-shrink:0;
}
.ct-chk-empty {
  padding:6px 10px;
  font-size:12px; color:var(--t3);
  font-style:italic;
}
.ct-popover-actions { display:flex; gap:6px; margin-top:2px; }
.ct-popover-set {
  flex:1; padding:6px 0;
  border-radius:var(--r-sm);
  border:none;
  font-size:12px; font-weight:700;
  cursor:pointer;
  transition:opacity .15s;
}
.ct-popover-set:hover { opacity:.85; }
.ct-popover-clear {
  padding:6px 10px;
  border-radius:var(--r-sm);
  border:1px solid var(--border);
  background:transparent;
  color:var(--t2); font-size:12px; font-weight:600;
  cursor:pointer;
  transition:background .15s, color .15s;
  white-space:nowrap;
}
.ct-popover-clear:hover { background:var(--red-dim); color:var(--red); border-color:var(--red); }


.ct-empty {
  display:flex; flex-direction:column; align-items:center;
  justify-content:center; gap:12px;
  padding:60px 20px; color:var(--t3); text-align:center;
}
.ct-empty p    { font-size:13.5px; font-weight:500; color:var(--t2); }
.ct-empty span { font-size:12.5px; }

/* ── AC-style Batch Filter (inline in track nav row) ── */
.ct-bf-row-wrap {
  display:flex; align-items:center; gap:6px; flex-wrap:wrap;
  padding:6px 0 6px 0;
  border-bottom:1px solid var(--border);
}
.ct-bf-ms-wrap {
  position:relative;
}
.ct-bf-ms-trigger {
  height:30px; padding:0 10px;
  display:inline-flex; align-items:center; gap:5px;
  background:var(--surface2); border:1px solid var(--border2);
  border-radius:8px; color:var(--t2); font-size:12px;
  font-family:inherit; font-weight:600;
  cursor:pointer; white-space:nowrap; transition:all .12s;
  max-width:200px;
}
.ct-bf-ms-trigger:hover { border-color:var(--blue); color:var(--t1); }
.ct-bf-ms-trigger.active { border-color:var(--blue); color:var(--blue); background:var(--blue-dim); }
.ct-bf-ms-label {
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  max-width:130px;
}
.ct-bf-ms-caret { flex-shrink:0; color:var(--t4); }

.ct-bf-ms-dropdown {
  display:none; position:absolute; top:calc(100% + 4px); left:0;
  min-width:180px; max-height:240px; overflow-y:auto;
  background:var(--surface); border:1px solid var(--border2);
  border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.14);
  z-index:9999; padding:4px;
}
.ct-bf-ms-dropdown.open { display:block; }
.ct-bf-ms-option {
  display:flex; align-items:center; gap:8px;
  padding:7px 10px; border-radius:7px;
  font-size:12.5px; color:var(--t2); cursor:pointer;
  transition:background .1s; user-select:none;
}
.ct-bf-ms-option:hover { background:var(--surface2); color:var(--t1); }
.ct-bf-ms-option.radio-pill {
  justify-content:center; font-weight:700;
}
.ct-bf-ms-option.radio-pill.selected {
  background:var(--blue-dim); color:var(--blue);
}
.ct-bf-ms-option input[type="checkbox"],
.ct-bf-ms-option input[type="radio"] {
  width:14px; height:14px; cursor:pointer; flex-shrink:0;
  accent-color:var(--blue);
}

/* Active filter chips in filter row */
.ct-bf-active-chip {
  display:inline-flex; align-items:center; gap:4px;
  padding:3px 9px; border-radius:20px;
  font-size:11px; font-weight:600;
  border:1px solid transparent; cursor:default;
}
.ct-bf-chip-x {
  font-size:10px; cursor:pointer; opacity:.7; line-height:1;
}
.ct-bf-chip-x:hover { opacity:1; }
.ct-bf-clear-all {
  height:26px; padding:0 10px;
  border:1px solid var(--border2); border-radius:20px;
  background:transparent; color:var(--t3);
  font-size:11px; font-weight:600; cursor:pointer;
  transition:all .12s; white-space:nowrap;
}
.ct-bf-clear-all:hover { border-color:var(--red); color:var(--red); }
/* Subject pills inside dropdown */
.ct-bf-subj-pill {
  display:inline-flex; align-items:center; justify-content:center;
  padding:6px 16px; border-radius:20px; width:100%; margin:1px 0;
  font-size:12.5px; font-weight:700;
  border:1.5px solid var(--border); color:var(--t2);
  cursor:pointer; transition:all .15s; user-select:none;
}
.ct-bf-subj-pill:hover { border-color:var(--blue); color:var(--blue); }
.ct-bf-subj-pill.selected { background:var(--blue-dim); color:var(--blue); border-color:var(--blue); }

/* ── AC-style Batch Filter (inline in track nav row) ── */
.ct-bf-row-wrap {
  display:flex; align-items:center; gap:6px; flex-wrap:wrap;
  padding:6px 0 6px 0;
  border-bottom:1px solid var(--border);
}
.ct-bf-ms-wrap {
  position:relative;
}
.ct-bf-ms-trigger {
  height:30px; padding:0 10px;
  display:inline-flex; align-items:center; gap:5px;
  background:var(--surface2); border:1px solid var(--border2);
  border-radius:8px; color:var(--t2); font-size:12px;
  font-family:inherit; font-weight:600;
  cursor:pointer; white-space:nowrap; transition:all .12s;
  max-width:200px;
}
.ct-bf-ms-trigger:hover { border-color:var(--blue); color:var(--t1); }
.ct-bf-ms-trigger.active { border-color:var(--blue); color:var(--blue); background:var(--blue-dim); }
.ct-bf-ms-label {
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  max-width:130px;
}
.ct-bf-ms-caret { flex-shrink:0; color:var(--t4); }

.ct-bf-ms-dropdown {
  display:none; position:absolute; top:calc(100% + 4px); left:0;
  min-width:180px; max-height:240px; overflow-y:auto;
  background:var(--surface); border:1px solid var(--border2);
  border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.14);
  z-index:9999; padding:4px;
}
.ct-bf-ms-dropdown.open { display:block; }
.ct-bf-ms-option {
  display:flex; align-items:center; gap:8px;
  padding:7px 10px; border-radius:7px;
  font-size:12.5px; color:var(--t2); cursor:pointer;
  transition:background .1s; user-select:none;
}
.ct-bf-ms-option:hover { background:var(--surface2); color:var(--t1); }
.ct-bf-ms-option.radio-pill {
  justify-content:center; font-weight:700;
}
.ct-bf-ms-option.radio-pill.selected {
  background:var(--blue-dim); color:var(--blue);
}
.ct-bf-ms-option input[type="checkbox"],
.ct-bf-ms-option input[type="radio"] {
  width:14px; height:14px; cursor:pointer; flex-shrink:0;
  accent-color:var(--blue);
}

/* Active filter chips in filter row */
.ct-bf-active-chip {
  display:inline-flex; align-items:center; gap:4px;
  padding:3px 9px; border-radius:20px;
  font-size:11px; font-weight:600;
  border:1px solid transparent; cursor:default;
}
.ct-bf-chip-x {
  font-size:10px; cursor:pointer; opacity:.7; line-height:1;
}
.ct-bf-chip-x:hover { opacity:1; }
.ct-bf-clear-all {
  height:26px; padding:0 10px;
  border:1px solid var(--border2); border-radius:20px;
  background:transparent; color:var(--t3);
  font-size:11px; font-weight:600; cursor:pointer;
  transition:all .12s; white-space:nowrap;
}
.ct-bf-clear-all:hover { border-color:var(--red); color:var(--red); }
/* Subject pills inside dropdown */
.ct-bf-subj-pill {
  display:inline-flex; align-items:center; justify-content:center;
  padding:6px 16px; border-radius:20px; width:100%; margin:1px 0;
  font-size:12.5px; font-weight:700;
  border:1.5px solid var(--border); color:var(--t2);
  cursor:pointer; transition:all .15s; user-select:none;
}
.ct-bf-subj-pill:hover { border-color:var(--blue); color:var(--blue); }
.ct-bf-subj-pill.selected { background:var(--blue-dim); color:var(--blue); border-color:var(--blue); }

/* ── Batch Filter Panel ── */
.ct-bf-bar {
  background:var(--surface);
  border:1px solid var(--border);
  border-radius:var(--r-lg);
  overflow:hidden;
}
.ct-bf-toggle {
  display:flex; align-items:center; gap:8px;
  width:100%; padding:11px 16px;
  background:none; border:none;
  font-family:inherit; font-size:13px; font-weight:700;
  color:var(--t1); cursor:pointer;
  text-align:left;
  transition:background .15s;
}
.ct-bf-toggle:hover { background:var(--surface2); }
.ct-bf-toggle-label { flex:1; }
.ct-bf-toggle-badge {
  display:inline-flex; align-items:center;
  background:var(--blue-dim); color:var(--blue);
  border-radius:20px; padding:2px 9px;
  font-size:11px; font-weight:700;
}
.ct-bf-toggle-arrow {
  transition:transform .2s;
  color:var(--t3);
}
.ct-bf-toggle-arrow.open { transform:rotate(180deg); }

.ct-bf-body {
  display:none; flex-direction:column; gap:0;
  border-top:1px solid var(--border);
  padding:16px;
  gap:14px;
}
.ct-bf-body.open { display:flex; }

.ct-bf-row {
  display:flex; flex-wrap:wrap; gap:14px;
}
.ct-bf-col {
  display:flex; flex-direction:column; gap:6px;
  flex:1; min-width:160px;
}
.ct-bf-col-label {
  font-size:10.5px; font-weight:700;
  text-transform:uppercase; letter-spacing:.07em;
  color:var(--t3);
}
/* Subject radio pills */
.ct-bf-pills {
  display:flex; flex-wrap:wrap; gap:6px;
}
.ct-bf-pill {
  display:inline-flex; align-items:center;
  padding:5px 14px; border-radius:20px;
  font-size:12px; font-weight:700;
  border:1.5px solid var(--border);
  background:var(--surface2); color:var(--t2);
  cursor:pointer; user-select:none;
  transition:all .15s;
}
.ct-bf-pill:hover { border-color:var(--blue); color:var(--blue); }
.ct-bf-pill.active {
  background:var(--blue-dim); color:var(--blue);
  border-color:var(--blue);
}
/* Checkbox list (reuse ct-chk-list styles, new wrapper) */
.ct-bf-chk-wrap {
  display:flex; flex-direction:column; gap:1px;
  max-height:130px; overflow-y:auto;
  border:1px solid var(--border);
  border-radius:var(--r-sm);
  background:var(--surface2);
  padding:3px 0;
}
.ct-bf-chk-wrap::-webkit-scrollbar { width:4px; }
.ct-bf-chk-wrap::-webkit-scrollbar-thumb { background:var(--border); border-radius:4px; }
.ct-bf-chk-item {
  display:flex; align-items:center; gap:8px;
  padding:5px 10px; cursor:pointer;
  font-size:12.5px; color:var(--t1);
  border-radius:3px; transition:background .1s;
  user-select:none;
}
.ct-bf-chk-item:hover { background:var(--surface3,rgba(128,128,128,.1)); }
.ct-bf-chk-item input[type=checkbox] {
  width:13px; height:13px; margin:0; cursor:pointer; flex-shrink:0;
}
.ct-bf-chk-empty { padding:6px 10px; font-size:12px; color:var(--t3); font-style:italic; }
.ct-bf-chk-sel-row {
  display:flex; align-items:center; justify-content:space-between;
  margin-bottom:3px;
}
.ct-bf-sel-all {
  font-size:10px; font-weight:700;
  background:none; border:none; cursor:pointer; padding:0;
  color:var(--blue);
}
/* actions */
.ct-bf-actions {
  display:flex; gap:8px; align-items:center;
  padding-top:4px;
}
.ct-bf-apply {
  padding:7px 20px;
  border-radius:var(--r-sm); border:none;
  background:var(--blue); color:#fff;
  font-size:12.5px; font-weight:700;
  cursor:pointer; transition:opacity .15s;
}
.ct-bf-apply:hover { opacity:.88; }
.ct-bf-clear {
  padding:7px 14px;
  border-radius:var(--r-sm);
  border:1px solid var(--border);
  background:transparent; color:var(--t2);
  font-size:12px; font-weight:600;
  cursor:pointer; transition:all .15s;
}
.ct-bf-clear:hover { background:var(--red-dim); color:var(--red); border-color:var(--red); }
`;
  document.head.appendChild(s);
}

// ── Main export ───────────────────────────────────────────────
export const ConversionTracking = {

  _activeTrack:    'fa',
  _container:      null,
  _filterCampus:   'all',
  // Per-subject filters: { FA1: { sessions:[], batches:[] }, ... }
  // Empty array = "all" (no filter). Non-empty = must match one of the values.
  _subjectFilters: {},

  // ── Batch Filter Panel state ──────────────────────────────
  // Tracks selected values in the new collapsible filter panel.
  // _bfOpen: whether panel is expanded
  // _bfSubject: selected subject code (e.g. 'FA1') or null
  // _bfCampuses, _bfSessions, _bfBatches: selected multi-values
  // _bfActive: true when this filter is applied (driving the table)
  _bfOpen:     false,
  _bfSubject:  null,
  _bfCampuses: [],
  _bfSessions: [],
  _bfBatches:  [],
  _bfActive:   false,

  // ── Has any filter been set? ──────────────────────────────
  _hasAnyFilter() {
    return this._bfActive ||
      this._activeTrack !== 'fa' ||
      Object.values(this._subjectFilters).some(f =>
        (f.sessions && f.sessions.length) || (f.batches && f.batches.length)
      );
  },

  // ── Report is shown only after user clicks "Generate" ────
  _reportGenerated: false,

  mount(container) {
    if (!container) return;
    injectStyles();
    this._container = container;
    this._reportGenerated = false;
    this._render();
  },

  _render() {
    const c = this._container;
    c.innerHTML = `
      <div class="ct-wrap">
        <div style="display:flex; align-items:center; gap:0; border-bottom:1px solid var(--border);">
          <nav class="ct-track-nav" id="ctTrackNav" style="border-bottom:none; flex:1">
            ${TRACKS.map(t => `
              <button class="ct-track-btn ${t.id === this._activeTrack ? 'active' : ''}"
                      data-track="${t.id}">${t.label}</button>
            `).join('')}
          </nav>
          <div id="ctBfNavBtn" style="padding:0 12px"></div>
        </div>
        <div id="ctBatchFilter"></div>
        <div id="ctGenerateBar"></div>
        <div id="ctFilterBar"></div>
        <div id="ctBody"></div>
      </div>
    `;

    c.querySelector('#ctTrackNav').addEventListener('click', e => {
      const btn = e.target.closest('.ct-track-btn');
      if (!btn) return;
      this._activeTrack = btn.dataset.track;
      // Reset filters on track change
      this._filterCampus   = 'all';
      this._subjectFilters = {};
      // Reset batch filter panel
      this._bfOpen     = false;
      this._bfSubject  = null;
      this._bfCampuses = [];
      this._bfSessions = [];
      this._bfBatches  = [];
      this._bfActive   = false;
      this._reportGenerated = false;
      c.querySelectorAll('.ct-track-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.track === this._activeTrack)
      );
      this._renderBody();
    });

    this._renderBody();

    // Wire placeholder generate button (rendered inside body before report)
    const wirePlaceholderBtn = () => {
      const btn = this._container.querySelector('#ctPlaceholderGenBtn');
      btn?.addEventListener('click', () => {
        this._reportGenerated = true;
        this._renderBody();
      });
    };
    wirePlaceholderBtn();
  },

  _renderBody() {
    const track    = TRACKS.find(t => t.id === this._activeTrack);
    const navBtnEl = this._container.querySelector('#ctBfNavBtn');
    const bfEl     = this._container.querySelector('#ctBatchFilter');
    const genBar   = this._container.querySelector('#ctGenerateBar');
    const filterEl = this._container.querySelector('#ctFilterBar');
    const body     = this._container.querySelector('#ctBody');

    // ── Render batch filter nav button ────────────────────────
    this._renderBfNavButton(navBtnEl, track);

    // ── Render batch filter panel (needs allData for options) ─
    // Only build allData if filter panel is open (cheap check)
    const allData = this._bfOpen || this._reportGenerated
      ? this._buildData(track.chain)
      : this._buildDataLite(track.chain);

    this._renderBatchFilter(bfEl, allData, track);

    // ── Generate bar (always visible) ─────────────────────────
    this._renderGenerateBar(genBar, track);

    // ── If not yet generated, show placeholder ────────────────
    if (!this._reportGenerated) {
      filterEl.innerHTML = '';
      body.innerHTML = this._placeholderHTML(track);
      return;
    }

    // ── Report is generated — build full data & render ────────
    const fullData = this._bfOpen ? allData : this._buildData(track.chain);

    // ── Render filter bar ────────────────────────────────────
    this._renderFilterBar(filterEl, fullData, track.chain);

    // ── No data at all ───────────────────────────────────────
    if (!fullData.students.length) {
      body.innerHTML = `
        <div class="ct-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <p>No enrolment data found</p>
          <span>Enrol students in ${track.chain.join(', ')} subjects to see conversion data.</span>
        </div>`;
      return;
    }

    // ── Apply filters ────────────────────────────────────────
    let data;
    let visibleChain = track.chain;
    if (this._bfActive) {
      data         = this._applyBatchFilter(fullData, track.chain);
      visibleChain = this._bfVisibleChain(track.chain);
    } else {
      data = this._applyFilters(fullData, track.chain);
    }

    if (!data.students.length) {
      body.innerHTML = `
        <div class="ct-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <p>No students match the selected filters</p>
          <span>Try changing or clearing the filters above.</span>
        </div>`;
      return;
    }

    body.innerHTML = `
      ${this._kpiHTML(data, visibleChain)}
      ${this._tableHTML(data, visibleChain)}
    `;

    // Attach clickable popover logic to group headers (only when bf not active)
    if (!this._bfActive) this._attachHeaderPopovers(fullData, track.chain);

    // Animate progress bars
    requestAnimationFrame(() => {
      body.querySelectorAll('.ct-kpi-bar[data-w]').forEach(b =>
        setTimeout(() => { b.style.width = b.dataset.w; }, 120)
      );
    });
  },

  // ── Placeholder: shown before "Generate" is clicked ───────
  _placeholderHTML(track) {
    const chain = track.chain;
    return `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                  gap:18px;padding:60px 24px;text-align:center">
        <div style="width:64px;height:64px;border-radius:18px;background:var(--blue-dim);
                    display:flex;align-items:center;justify-content:center">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--blue)"
               stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <div>
          <div style="font-size:16px;font-weight:800;color:var(--t1);margin-bottom:6px">
            ${track.label} — Conversion Report
          </div>
          <div style="font-size:13px;color:var(--t3);max-width:360px;line-height:1.6">
            Apply filters above (optional), then click
            <strong style="color:var(--blue)">Generate Report</strong>
            to load student data.
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:4px;
                    background:var(--surface2);border:1px solid var(--border);
                    border-radius:12px;padding:14px 20px;font-size:12.5px;color:var(--t3)">
          ${chain.map((code, i) => `
            <span style="font-weight:700;color:var(--blue)">${code}</span>
            ${i < chain.length - 1 ? `<span style="color:var(--t4)">→</span>` : ''}
          `).join('')}
          <span style="color:var(--t4)">·</span>
          <span>Conversion funnel</span>
        </div>
        <button id="ctPlaceholderGenBtn"
          style="display:inline-flex;align-items:center;gap:8px;padding:10px 24px;
                 background:var(--blue);color:#fff;border:none;border-radius:10px;
                 font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;
                 box-shadow:0 2px 8px rgba(59,130,246,.25);transition:opacity .15s">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          Generate Report
        </button>
      </div>`;
  },

  // ── Generate bar (always shown below filters) ──────────────
  _renderGenerateBar(el, track) {
    if (!el) return;
    // If report not generated yet — show prominent generate button
    // If already generated — show a subtle "Refresh" button
    if (!this._reportGenerated) {
      el.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 0 4px">
          <button id="ctGenerateBtn"
            style="display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 20px;
                   background:var(--blue);color:#fff;border:none;border-radius:8px;
                   font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;
                   box-shadow:0 2px 8px rgba(59,130,246,.2);transition:opacity .15s">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Generate Report
          </button>
          <span style="font-size:12px;color:var(--t3)">
            Set filters first (optional), then generate
          </span>
        </div>`;
    } else {
      // Compact refresh row when report is already showing
      const track = TRACKS.find(t => t.id === this._activeTrack);
      const anyFilter = this._bfActive ||
        Object.values(this._subjectFilters).some(f => (f.sessions||[]).length || (f.batches||[]).length);
      el.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0 2px">
          <button id="ctGenerateBtn"
            style="display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 14px;
                   background:var(--surface2);color:var(--blue);border:1px solid var(--blue);
                   border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;
                   font-family:inherit;transition:all .15s">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            Refresh
          </button>
          ${anyFilter ? `<span style="font-size:11.5px;color:var(--t3)">Filters active — click Refresh to update results</span>` : ''}
        </div>`;
    }

    // Wire both Generate and Refresh buttons
    el.querySelector('#ctGenerateBtn')?.addEventListener('click', () => {
      this._reportGenerated = true;
      this._renderBody();
    });
  },

  // ── Lightweight data build (just counts, no full student map) ─
  // Used when filter panel is closed and report not shown yet
  _buildDataLite(chain) {
    return { students: [], counts: Object.fromEntries(chain.map(c => [c, 0])) };
  },

  // ── Batch Filter nav button (sits in track nav row) ────────
  _renderBfNavButton(el, track) {
    if (!el) return;
    const isActive = this._bfActive && (this._bfSubject || this._bfCampuses.length || this._bfSessions.length || this._bfBatches.length);
    el.innerHTML = `
      <button id="ctBfNavTrigger"
        style="display:inline-flex;align-items:center;gap:6px;
               height:28px;padding:0 12px;border-radius:6px;
               border:1px solid ${isActive ? 'var(--blue)' : 'var(--border)'};
               background:${isActive ? 'var(--blue-dim)' : 'var(--surface2)'};
               color:${isActive ? 'var(--blue)' : 'var(--t2)'};
               font-size:12px;font-weight:700;font-family:inherit;
               cursor:pointer;transition:all .15s;white-space:nowrap">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
        </svg>
        Batch Filter
        ${isActive ? `<span style="background:var(--blue);color:#fff;border-radius:20px;padding:1px 7px;font-size:10px;font-weight:800">${this._bfSubject}</span>` : ''}
      </button>
    `;
    el.querySelector('#ctBfNavTrigger').addEventListener('click', () => {
      this._bfOpen = !this._bfOpen;
      this._renderBody();
    });
  },

  // ── Batch Filter Panel (AC-style dropdowns) ───────────────
  _renderBatchFilter(el, allData, track) {
    if (!el) return;
    if (!this._bfOpen) { el.innerHTML = ''; return; }

    const chain              = track.chain;
    const filterableSubjects = chain.slice(0, 2); // FA1,FA2 or MA1,MA2

    // ── Build option sets ─────────────────────────────────────
    const campusSet = new Set();
    allData.students.forEach(st => {
      chain.forEach(code => {
        const sub = st.subjects[code];
        if (sub && sub.campus && sub.campus !== '—') campusSet.add(sub.campus);
      });
    });
    const allCampuses = [...campusSet].sort();

    const sessionSet = new Set();
    allData.students.forEach(st => {
      filterableSubjects.forEach(code => {
        if (this._bfSubject && code !== this._bfSubject) return;
        const sub = st.subjects[code];
        if (sub && sub.session && sub.session !== '—') sessionSet.add(sub.session);
      });
    });
    const allSessions = [...sessionSet].sort((a,b) => _parseSession(a) - _parseSession(b));

    const batchSet = new Set();
    allData.students.forEach(st => {
      const codesToCheck = this._bfSubject ? [this._bfSubject] : chain;
      codesToCheck.forEach(code => {
        const sub = st.subjects[code];
        if (!sub) return;
        if (this._bfCampuses.length && !this._bfCampuses.includes(sub.campus)) return;
        if (this._bfSessions.length && !this._bfSessions.includes(sub.session)) return;
        if (sub.batchNo && sub.batchNo !== '—') batchSet.add(sub.batchNo);
      });
    });
    const allBatches = [...batchSet].sort((a,b) => (parseInt(a,10)||0) - (parseInt(b,10)||0));

    // ── Active chip helpers ───────────────────────────────────
    const makeChip = (label, key, color, val) =>
      `<span class="ct-bf-active-chip"
             style="background:${color}20;color:${color};border-color:${color}40"
             data-chip-key="${key}" data-chip-val="${val !== undefined ? val : label}">
         ${label}
         <span class="ct-bf-chip-x">✕</span>
       </span>`;

    const campusChips  = this._bfCampuses.map(v => makeChip(v, 'campus',  'var(--blue)'));
    const sessionChips = this._bfSessions.map(v => makeChip(v, 'session', 'var(--green)'));
    const batchChips   = this._bfBatches.map(v  => makeChip('Batch ' + v, 'batch',   'var(--yellow)', v));
    const subjectChip  = this._bfSubject
      ? [makeChip(this._bfSubject, 'subject', 'var(--violet)')]
      : [];
    const allChips = [...subjectChip, ...campusChips, ...sessionChips, ...batchChips];

    const hasAnyFilter = this._bfCampuses.length || this._bfSessions.length ||
                         this._bfBatches.length  || this._bfSubject;

    // ── Dropdown HTML builder ─────────────────────────────────
    const msDropdown = (id, triggerLabel, icon, items, selectedArr, type = 'checkbox') => {
      const hasSelected = selectedArr.length > 0;
      const displayLabel = !hasSelected
        ? triggerLabel
        : selectedArr.length === 1 ? selectedArr[0] : `${selectedArr.length} selected`;

      const optionsHTML = type === 'subject'
        ? items.map(v => `
            <div class="ct-bf-subj-pill ${this._bfSubject === v ? 'selected' : ''}"
                 data-subj="${v}">${v}</div>
          `).join('')
        : items.length
          ? items.map(v => `
              <label class="ct-bf-ms-option">
                <input type="checkbox" value="${v}" data-ms-group="${id}"
                  style="accent-color:var(--blue)"
                  ${selectedArr.includes(v) ? 'checked' : ''}>
                ${v}
              </label>`).join('')
          : `<div style="padding:10px;text-align:center;font-size:12px;color:var(--t4)">${this._bfSubject ? 'No options' : 'Select subject first'}</div>`;

      return `
        <div class="ct-bf-ms-wrap" id="ctBfWrap-${id}">
          <button class="ct-bf-ms-trigger ${hasSelected ? 'active' : ''}" id="ctBfTrig-${id}">
            ${icon}
            <span class="ct-bf-ms-label">${displayLabel}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="ct-bf-ms-caret">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          <div class="ct-bf-ms-dropdown" id="ctBfDrop-${id}">
            ${optionsHTML}
          </div>
        </div>`;
    };

    const campusIcon  = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
    const sessionIcon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
    const subjectIcon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`;
    const batchIcon   = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`;

    el.innerHTML = `
      <div class="ct-bf-row-wrap">
        ${msDropdown('campus',  'All Campuses', campusIcon,  allCampuses, this._bfCampuses)}
        ${msDropdown('session', 'All Sessions', sessionIcon, allSessions, this._bfSessions)}
        ${msDropdown('subject', 'Subject',      subjectIcon, filterableSubjects, this._bfSubject ? [this._bfSubject] : [], 'subject')}

        <!-- Batch: custom searchable dropdown -->
        <div class="ct-bf-ms-wrap" id="ctBfWrap-batch">
          <button class="ct-bf-ms-trigger ${this._bfBatches.length ? 'active' : ''}" id="ctBfTrig-batch">
            ${batchIcon}
            <span class="ct-bf-ms-label">
              ${this._bfBatches.length === 0 ? 'All Batches'
                : this._bfBatches.length === 1 ? 'Batch ' + this._bfBatches[0]
                : this._bfBatches.length + ' Batches'}
            </span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="ct-bf-ms-caret">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          <div class="ct-bf-ms-dropdown" id="ctBfDrop-batch" style="min-width:200px">
            <!-- Search box -->
            <div style="padding:6px 6px 4px;position:sticky;top:0;background:var(--surface);z-index:1">
              <input id="ctBfBatchSearch" type="text" placeholder="Search batch…"
                style="width:100%;padding:5px 9px;border-radius:6px;
                       border:1px solid var(--border);background:var(--surface2);
                       color:var(--t1);font-size:12px;outline:none;box-sizing:border-box">
            </div>
            <!-- Select all / Clear row -->
            <div style="display:flex;align-items:center;justify-content:space-between;padding:3px 10px 4px;border-bottom:1px solid var(--border)">
              <span id="ctBfBatchSelAll" style="font-size:10px;font-weight:700;color:var(--blue);cursor:pointer">
                ${this._bfBatches.length === allBatches.length && allBatches.length > 0 ? 'Deselect all' : 'Select all'}
              </span>
              ${this._bfBatches.length ? `<span id="ctBfBatchClear" style="font-size:10px;color:var(--t3);cursor:pointer;font-weight:600">Clear</span>` : ''}
            </div>
            <!-- Batch list -->
            <div id="ctBfBatchList">
              ${allBatches.length
                ? allBatches.map(v => `
                    <label class="ct-bf-ms-option" data-batch-val="${v}">
                      <input type="checkbox" value="${v}" data-ms-group="batch"
                        style="accent-color:var(--blue)"
                        ${this._bfBatches.includes(v) ? 'checked' : ''}>
                      <span>Batch ${v}</span>
                    </label>`).join('')
                : `<div style="padding:10px;text-align:center;font-size:12px;color:var(--t4)">No batches available</div>`
              }
            </div>
          </div>
        </div>

        <!-- Active chips -->
        <div id="ctBfChips" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-left:4px">
          ${allChips.join('')}
        </div>

        <!-- Apply / Clear -->
        <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
          ${this._bfActive ? `<button class="ct-bf-clear-all" id="ctBfClearAll">Clear</button>` : ''}
          <button id="ctBfApplyBtn"
            style="height:30px;padding:0 16px;border-radius:8px;border:none;
                   background:var(--blue);color:#fff;font-size:12px;font-weight:700;
                   font-family:inherit;cursor:pointer;transition:opacity .15s">
            Apply
          </button>
        </div>
      </div>
    `;

    // ── Wire dropdown toggles (campus, session, subject) ────
    ['campus','session','subject'].forEach(id => {
      const trig = el.querySelector(`#ctBfTrig-${id}`);
      const drop = el.querySelector(`#ctBfDrop-${id}`);
      if (!trig || !drop) return;
      trig.addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = drop.classList.contains('open');
        el.querySelectorAll('.ct-bf-ms-dropdown.open').forEach(d => d.classList.remove('open'));
        if (!isOpen) drop.classList.add('open');
      });
    });

    // Close on outside click
    const outsideClose = e => {
      if (!e.target.closest('.ct-bf-ms-wrap') && !e.target.closest('#ctBfApplyBtn') && !e.target.closest('#ctBfClearAll')) {
        el.querySelectorAll('.ct-bf-ms-dropdown.open').forEach(d => d.classList.remove('open'));
      }
    };
    window.addEventListener('mousedown', outsideClose, true);

    // ── Campus checkboxes ─────────────────────────────────────
    el.querySelectorAll('[data-ms-group="campus"]').forEach(cb => {
      cb.addEventListener('change', () => {
        this._bfCampuses = [...el.querySelectorAll('[data-ms-group="campus"]:checked')].map(b => b.value);
        this._bfBatches  = [];
        this._renderBatchFilter(el, allData, track);
      });
    });

    // ── Session checkboxes ────────────────────────────────────
    el.querySelectorAll('[data-ms-group="session"]').forEach(cb => {
      cb.addEventListener('change', () => {
        this._bfSessions = [...el.querySelectorAll('[data-ms-group="session"]:checked')].map(b => b.value);
        this._bfBatches  = [];
        this._renderBatchFilter(el, allData, track);
      });
    });

    // ── Subject pills (radio behavior) ───────────────────────
    el.querySelectorAll('[data-subj]').forEach(pill => {
      pill.addEventListener('click', e => {
        e.stopPropagation();
        const code = pill.dataset.subj;
        this._bfSubject = (this._bfSubject === code) ? null : code;
        this._bfBatches = [];
        this._renderBatchFilter(el, allData, track);
      });
    });

    // ── Batch dropdown toggle ────────────────────────────────
    const batchTrig = el.querySelector('#ctBfTrig-batch');
    const batchDrop = el.querySelector('#ctBfDrop-batch');
    if (batchTrig && batchDrop) {
      batchTrig.addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = batchDrop.classList.contains('open');
        el.querySelectorAll('.ct-bf-ms-dropdown.open').forEach(d => d.classList.remove('open'));
        if (!isOpen) {
          batchDrop.classList.add('open');
          el.querySelector('#ctBfBatchSearch')?.focus();
        }
      });
    }

    // ── Batch checkboxes ──────────────────────────────────────
    el.querySelectorAll('[data-ms-group="batch"]').forEach(cb => {
      cb.addEventListener('change', () => {
        this._bfBatches = [...el.querySelectorAll('[data-ms-group="batch"]:checked')].map(b => b.value);
        // Update trigger label live
        const trig = el.querySelector('#ctBfTrig-batch .ct-bf-ms-label');
        if (trig) {
          trig.textContent = this._bfBatches.length === 0 ? 'All Batches'
            : this._bfBatches.length === 1 ? 'Batch ' + this._bfBatches[0]
            : this._bfBatches.length + ' Batches';
        }
        const trigBtn = el.querySelector('#ctBfTrig-batch');
        if (trigBtn) trigBtn.classList.toggle('active', this._bfBatches.length > 0);
      });
    });

    // ── Batch search ──────────────────────────────────────────
    el.querySelector('#ctBfBatchSearch')?.addEventListener('input', e => {
      const q = e.target.value.toLowerCase().trim();
      el.querySelectorAll('#ctBfBatchList [data-batch-val]').forEach(row => {
        const val = row.dataset.batchVal.toLowerCase();
        row.style.display = (!q || val.includes(q) || ('batch ' + val).includes(q)) ? '' : 'none';
      });
    });

    // ── Batch select all / deselect all ───────────────────────
    el.querySelector('#ctBfBatchSelAll')?.addEventListener('click', e => {
      e.stopPropagation();
      const visibleBoxes = [...el.querySelectorAll('#ctBfBatchList [data-batch-val]')]
        .filter(r => r.style.display !== 'none')
        .map(r => r.querySelector('input[type=checkbox]'));
      const allChecked = visibleBoxes.every(b => b.checked);
      visibleBoxes.forEach(b => { b.checked = !allChecked; });
      this._bfBatches = [...el.querySelectorAll('[data-ms-group="batch"]:checked')].map(b => b.value);
      const trig = el.querySelector('#ctBfTrig-batch .ct-bf-ms-label');
      if (trig) {
        trig.textContent = this._bfBatches.length === 0 ? 'All Batches'
          : this._bfBatches.length === 1 ? 'Batch ' + this._bfBatches[0]
          : this._bfBatches.length + ' Batches';
      }
      const trigBtn = el.querySelector('#ctBfTrig-batch');
      if (trigBtn) trigBtn.classList.toggle('active', this._bfBatches.length > 0);
      const selAllBtn = el.querySelector('#ctBfBatchSelAll');
      if (selAllBtn) selAllBtn.textContent = allChecked ? 'Select all' : 'Deselect all';
    });

    // ── Batch clear ───────────────────────────────────────────
    el.querySelector('#ctBfBatchClear')?.addEventListener('click', e => {
      e.stopPropagation();
      el.querySelectorAll('[data-ms-group="batch"]').forEach(b => { b.checked = false; });
      this._bfBatches = [];
      const trig = el.querySelector('#ctBfTrig-batch .ct-bf-ms-label');
      if (trig) trig.textContent = 'All Batches';
      const trigBtn = el.querySelector('#ctBfTrig-batch');
      if (trigBtn) trigBtn.classList.remove('active');
    });

    // ── Apply ─────────────────────────────────────────────────
    el.querySelector('#ctBfApplyBtn')?.addEventListener('click', () => {
      this._bfCampuses = [...el.querySelectorAll('[data-ms-group="campus"]:checked')].map(b => b.value);
      this._bfSessions = [...el.querySelectorAll('[data-ms-group="session"]:checked')].map(b => b.value);
      this._bfBatches  = [...el.querySelectorAll('[data-ms-group="batch"]:checked')].map(b => b.value);
      // Capture subject selection from the subject pills dropdown
      const selSubjPill = el.querySelector('.ct-bf-subj-pill.selected');
      if (selSubjPill) this._bfSubject = selSubjPill.dataset.subj || this._bfSubject;
      this._bfActive   = this._bfCampuses.length > 0 || this._bfSessions.length > 0 ||
                         this._bfBatches.length > 0  || !!this._bfSubject;
      this._bfOpen     = false;
      this._subjectFilters = {};
      this._reportGenerated = true;  // auto-generate on Apply
      this._renderBody();
    });

    // ── Clear all ─────────────────────────────────────────────
    el.querySelector('#ctBfClearAll')?.addEventListener('click', () => {
      this._bfSubject  = null;
      this._bfCampuses = [];
      this._bfSessions = [];
      this._bfBatches  = [];
      this._bfActive   = false;
      this._renderBody();
    });

    // ── Chip × remove ─────────────────────────────────────────
    el.querySelectorAll('[data-chip-key]').forEach(chip => {
      chip.querySelector('.ct-bf-chip-x')?.addEventListener('click', () => {
        const key = chip.dataset.chipKey;
        const val = chip.dataset.chipVal;
        if (key === 'campus')  this._bfCampuses = this._bfCampuses.filter(v => v !== val);
        if (key === 'session') this._bfSessions = this._bfSessions.filter(v => v !== val);
        if (key === 'batch')   this._bfBatches  = this._bfBatches.filter(v => v !== val);
        if (key === 'subject') { this._bfSubject = null; this._bfBatches = []; }
        this._renderBatchFilter(el, allData, track);
      });
    });
  },

  // ── Filter bar (campus filter removed — now per-subject in table columns) ──
  _renderFilterBar(el, allData, chain) {
    const anySubjectFilter = chain.some(code => {
      const f = this._subjectFilters[code] || { sessions: [], batches: [] };
      return f.sessions.length > 0 || f.batches.length > 0;
    });

    el.innerHTML = `
      <div class="ct-filter-bar">
        <div style="font-size:11px;color:var(--t3);font-style:italic;align-self:center;">
          Click a subject header (${chain.join(' / ')}) to filter by session &amp; batch
        </div>
        ${anySubjectFilter ? `
          <button class="ct-filter-reset" id="ctFilterReset">
            ✕ Clear all filters
          </button>` : ''}
        <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
          <button id="ctExportCSV" title="Export to CSV"
            style="display:inline-flex;align-items:center;justify-content:center;gap:5px;
                   height:30px;padding:0 12px;border-radius:8px;
                   border:1px solid var(--border);background:var(--surface2);
                   color:var(--t3);cursor:pointer;font-size:12px;font-weight:600;
                   font-family:inherit;transition:all .15s;white-space:nowrap">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M8 12l2.5 2.5L16 9"/>
            </svg>
            CSV
          </button>
          <button id="ctExportPDF" title="Export to PDF"
            style="display:inline-flex;align-items:center;justify-content:center;gap:5px;
                   height:30px;padding:0 12px;border-radius:8px;
                   border:1px solid var(--border);background:var(--surface2);
                   color:var(--t3);cursor:pointer;font-size:12px;font-weight:600;
                   font-family:inherit;transition:all .15s;white-space:nowrap">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="8" y1="13" x2="16" y2="13"/>
              <line x1="8" y1="17" x2="16" y2="17"/>
            </svg>
            PDF
          </button>
        </div>
      </div>
    `;

    el.querySelector('#ctFilterReset')?.addEventListener('click', () => {
      this._subjectFilters = {};
      this._renderBody();
    });

    el.querySelector('#ctExportCSV')?.addEventListener('click', () => {
      const track   = TRACKS.find(t => t.id === this._activeTrack);
      const allData = this._buildData(track.chain);
      const data    = this._bfActive
        ? this._applyBatchFilter(allData, track.chain)
        : this._applyFilters(allData, track.chain);
      this._exportCSV(data, track);
    });

    el.querySelector('#ctExportPDF')?.addEventListener('click', () => {
      const track   = TRACKS.find(t => t.id === this._activeTrack);
      const allData = this._buildData(track.chain);
      const data    = this._bfActive
        ? this._applyBatchFilter(allData, track.chain)
        : this._applyFilters(allData, track.chain);
      this._exportPDF(data, track);
    });
  },

  // ── Apply per-subject session/batch filters ──────────────
  _applyFilters(data, chain) {
    const sf = code => this._subjectFilters[code] || { sessions: [], batches: [] };

    const anySubjectFilter = chain.some(code => {
      const f = sf(code);
      return f.sessions.length > 0 || f.batches.length > 0;
    });
    if (!anySubjectFilter) return data;

    const filtered = data.students.filter(st => {
      for (const code of chain) {
        const f = sf(code);
        if (!f.sessions.length && !f.batches.length) continue;

        const sub = st.subjects[code];
        if (!sub) return false; // filter active + not enrolled → exclude

        const sessionOk = !f.sessions.length || f.sessions.includes(sub.session);
        const batchOk   = !f.batches.length  || f.batches.includes(sub.batchNo);
        if (!sessionOk || !batchOk) return false;
      }
      return true;
    });

    const counts = {};
    chain.forEach(code => {
      counts[code] = filtered.filter(r => r.subjects[code]).length;
    });

    return { students: filtered, counts };
  },

  // ── Batch Filter: which subjects to show as columns ──────
  // When filtering by FA1: show [FA1, FA2, F3] (all, anchored on FA1 students)
  // When filtering by FA2: show [FA2, F3] (only those who reached FA2)
  // When no subject selected: show full chain
  _bfVisibleChain(chain) {
    if (!this._bfSubject) return chain;
    const idx = chain.indexOf(this._bfSubject);
    return idx >= 0 ? chain.slice(idx) : chain;
  },

  // ── Apply Batch Filter to data ────────────────────────────
  // Filters students whose selected-subject enrolment matches
  // the chosen campus / session / batch selections.
  // If no subject selected, applies campus/session/batch across ALL subjects.
  _applyBatchFilter(data, chain) {
    const hasCampus  = this._bfCampuses.length > 0;
    const hasSession = this._bfSessions.length > 0;
    const hasBatch   = this._bfBatches.length  > 0;
    const hasSubject = !!this._bfSubject;

    // Nothing selected → return all
    if (!hasCampus && !hasSession && !hasBatch && !hasSubject) return data;

    const filtered = data.students.filter(st => {
      // If subject is selected, filter only on that subject's enrolment
      if (hasSubject) {
        const sub = st.subjects[this._bfSubject];
        if (!sub) return false;
        const campusOk  = !hasCampus  || this._bfCampuses.includes(sub.campus);
        const sessionOk = !hasSession || this._bfSessions.includes(sub.session);
        const batchOk   = !hasBatch   || this._bfBatches.includes(sub.batchNo);
        return campusOk && sessionOk && batchOk;
      }

      // No subject selected → student must have at least one subject
      // where ALL active filters match simultaneously on that same subject.
      const enrolledCodes = chain.filter(code => !!st.subjects[code]);
      if (!enrolledCodes.length) return false;
      return enrolledCodes.some(code => {
        const sub = st.subjects[code];
        const campusOk  = !hasCampus  || this._bfCampuses.includes(sub.campus);
        const sessionOk = !hasSession || this._bfSessions.includes(sub.session);
        const batchOk   = !hasBatch   || this._bfBatches.includes(sub.batchNo);
        return campusOk && sessionOk && batchOk;
      });
    });

    const counts = {};
    chain.forEach(c => {
      counts[c] = filtered.filter(r => r.subjects[c]).length;
    });

    return { students: filtered, counts };
  },

  // ── Build data map from AppState ──────────────────────────
  _buildData(chain) {
    const enrolments = AppState.get('enrolments') || [];
    const batches    = AppState.get('batches')    || [];
    const students   = AppState.get('students')   || [];
    const campuses   = AppState.get('campuses')   || [];

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

        const batchName   = sub.batchName || batchRec.batchName || '';
        const parts       = batchName.split('-');
        const subjectCode = (parts[0] || '').toUpperCase();
        if (!chain.includes(subjectCode)) return;

        const session = parts.length >= 3
          ? parts.slice(1, parts.length - 1).join('-')
          : '—';
        const batchNo = parts[parts.length - 1] || '—';

        if (!map[enr.studentId]) {
          // ── Resolve campus from batch → campuses list ───────
          const campusRec = batchRec.campusId
            ? campuses.find(c => c.id === batchRec.campusId)
            : null;
          const campusName = campusRec
            ? (campusRec.campusName || '').replace(/\s*campus$/i, '').trim() || campusRec.campusName
            : (student.campus || student.campusName || '');

          map[enr.studentId] = {
            studentId:   enr.studentId,
            studentName: student.studentName || '—',
            studentCode: student.studentCode || student.admissionNo || '',
            campusId:    batchRec.campusId || '',
            campusName:  campusName || '—',
            subjects:    {},
          };
        }

        // Keep only first enrolment per subject per student
        if (!map[enr.studentId].subjects[subjectCode]) {
          // Resolve campus for THIS subject's batch specifically
          const subCampusRec = batchRec.campusId
            ? campuses.find(c => c.id === batchRec.campusId)
            : null;
          const subCampusName = subCampusRec
            ? (subCampusRec.campusName || '').replace(/\s*campus$/i, '').trim() || subCampusRec.campusName
            : '—';

          map[enr.studentId].subjects[subjectCode] = {
            session,
            batchNo,
            campus:    subCampusName,
            teacher:   batchRec.teacher || batchRec.teacherName || '—',
            status:    sub.status || enr.status || 'active',
            startDate: sub.startDate || batchRec.startDate || '',
            endDate:   sub.endDate   || batchRec.endDate   || '',
          };
        }
      });
    });

    const firstCode = chain[0];
    const studentRows = Object.values(map).sort((a, b) => {
      const aSub = a.subjects[firstCode];
      const bSub = b.subjects[firstCode];

      // No first-subject enrolment → push to bottom
      if (!aSub && !bSub) return a.studentName.localeCompare(b.studentName);
      if (!aSub) return 1;
      if (!bSub) return -1;

      // 1. Batch number ascending (numeric)
      const aBatch = parseInt(aSub.batchNo, 10) || 0;
      const bBatch = parseInt(bSub.batchNo, 10) || 0;
      if (aBatch !== bBatch) return aBatch - bBatch;

      // 2. Session oldest → latest
      const aDate = _parseSession(aSub.session);
      const bDate = _parseSession(bSub.session);
      if (aDate !== bDate) return aDate - bDate;

      // 3. Alphabetical
      return a.studentName.localeCompare(b.studentName);
    });

    const counts = {};
    chain.forEach(code => {
      counts[code] = studentRows.filter(r => r.subjects[code]).length;
    });

    return { students: studentRows, counts };
  },

  // ── KPI cards ─────────────────────────────────────────────
  _kpiHTML(data, chain) {
    const colors = ['#4f85f7','#8b5cf6','#10b981'];
    const counts = chain.map(code => data.counts[code] || 0);
    const c0 = counts[0];

    const kpis = chain.map((code, i) => {
      const cnt  = counts[i];
      const prev = i > 0 ? counts[i-1] : null;
      const pct  = (prev && prev > 0) ? Math.round(cnt / prev * 100) : null;
      const sub  = i === 0 ? 'Started the track'
                           : 'Progressed from ' + chain[i-1];
      return { val: cnt, lbl: code + ' Enrolled', sub, color: colors[i] || '#94a3b8',
               pct: pct !== null ? pct + '%' : null,
               w: i === 0 ? '100%' : (pct || 0) + '%' };
    });

    // Overall rate: first → last
    const cLast   = counts[counts.length - 1];
    const overall = c0 ? Math.round(cLast / c0 * 100) : 0;
    kpis.push({ val: overall + '%', lbl: 'Overall Rate',
                sub: chain[0] + ' → ' + chain[chain.length-1] + ' reach',
                color: '#f59e0b', pct: null, w: overall + '%' });

    return `
      <div class="ct-kpi-row">
        ${kpis.map(k => `
          <div class="ct-kpi">
            <div style="display:flex;align-items:flex-end;gap:8px;line-height:1.1">
              <div class="ct-kpi-val">${k.val}</div>
              ${k.pct !== null ? `<div style="font-size:13px;font-weight:700;color:${k.color};padding-bottom:3px;opacity:.85">${k.pct}</div>` : ''}
            </div>
            <div class="ct-kpi-lbl">${k.lbl}</div>
            <div class="ct-kpi-sub">${k.sub}</div>
            <div class="ct-kpi-bar-wrap">
              <div class="ct-kpi-bar" style="background:${k.color}" data-w="${k.w}"></div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  // ── Funnel chart ──────────────────────────────────────────
  _funnelHTML(data, chain) {
    const max    = data.counts[chain[0]] || 1;
    const colors = ['#4f85f7', '#8b5cf6', '#10b981'];

    return `
      <div class="ct-funnel-wrap">
        <div class="ct-funnel-title">Conversion Funnel</div>
        <div class="ct-funnel-steps">
          ${chain.map((code, i) => {
            const count = data.counts[code] || 0;
            const pct   = Math.round((count / max) * 100);
            return `
              <div class="ct-funnel-step">
                <span class="ct-funnel-lbl">${code}</span>
                <div class="ct-funnel-bar-bg">
                  <div class="ct-funnel-bar-fill" style="background:${colors[i]}" data-w="${Math.max(pct,0)}%">
                    ${count > 0 ? count + ' students' : ''}
                  </div>
                </div>
                <span class="ct-funnel-pct">${pct}%</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  },

  // ── Table ─────────────────────────────────────────────────
  _tableHTML(data, chain) {
    const subCols   = ['Campus', 'Session', 'Batch #', 'Teacher', 'Status'];
    const colColors = ['rgba(79,133,247,.07)', 'rgba(139,92,246,.07)', 'rgba(16,185,129,.07)'];
    const accents   = ['#4f85f7', '#8b5cf6', '#10b981'];

    const sf = code => this._subjectFilters[code] || { sessions: [], batches: [] };

    const groupHeaders = chain.map((code, i) => {
      const cur       = sf(code);
      const hasSess   = cur.sessions.length > 0;
      const hasBatch  = cur.batches.length  > 0;
      const hasFilter = hasSess || hasBatch;
      const chipParts = [];
      if (hasSess)  chipParts.push(cur.sessions.length === 1 ? cur.sessions[0] : cur.sessions.length + ' sessions');
      if (hasBatch) chipParts.push(cur.batches.length  === 1 ? '#' + cur.batches[0] : cur.batches.length + ' batches');
      return `
        <th class="ct-th-group ${i > 0 ? 'ct-col-sep' : ''}"
            colspan="${subCols.length}"
            data-code="${code}"
            style="background:${colColors[i]}; color:${accents[i]};">
          <span class="ct-th-group-inner">
            <svg class="ct-th-funnel" width="12" height="12" viewBox="0 0 24 24" fill="none"
                 stroke="${accents[i]}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
            ${code}
            ${hasFilter ? `
              <span class="ct-th-chip" style="background:${accents[i]}22;color:${accents[i]};">
                ${chipParts.join(' · ')}
                <span class="ct-th-chip-x" data-clear="${code}">✕</span>
              </span>` : ''}
          </span>
        </th>
      `;
    }).join('');

    const colHeaders = chain.map((_, i) =>
      subCols.map((col, j) => `
        <th class="${i > 0 && j === 0 ? 'ct-col-sep' : ''}">${col}</th>
      `).join('')
    ).join('');

    const rows = data.students.map(st => {
      const cells = chain.map((code, i) => {
        const sub = st.subjects[code];
        if (!sub) {
          return subCols.map((_, j) => `
            <td class="${i > 0 && j === 0 ? 'ct-col-sep' : ''}">
              <span class="ct-dash">—</span>
            </td>
          `).join('');
        }
        return `
          <td class="${i > 0 ? 'ct-col-sep' : ''}" style="font-size:12px;color:var(--t2);white-space:nowrap">
            ${sub.campus && sub.campus !== '—' ? sub.campus : `<span class="ct-dash">—</span>`}
          </td>
          <td>
            ${sub.session && sub.session !== '—'
              ? `<span class="ct-session-pill">${sub.session}</span>`
              : `<span class="ct-dash">—</span>`}
          </td>
          <td><span class="ct-batch-no">${sub.batchNo}</span></td>
          <td style="font-size:12px;color:var(--t2);white-space:nowrap">${sub.teacher}</td>
          <td>
            <span class="ct-badge ct-badge-${sub.status}">
              ${_statusLabel(sub.status)}
            </span>
          </td>
        `;
      }).join('');

      return `
        <tr>
          <td style="min-width:160px;border-right:2px solid var(--border2);position:sticky;left:0;background:var(--surface);z-index:1">
            <div class="ct-student-name">${st.studentName}</div>
            ${st.studentCode ? `<div class="ct-student-id">${st.studentCode}</div>` : ''}
          </td>
          ${cells}
        </tr>
      `;
    }).join('');

    return `
      <div class="ct-table-wrap">
        <table class="ct-table">
          <thead>
            <tr>
              <th rowspan="2"
                  style="background:var(--surface2);
                         border-bottom:1px solid var(--border);
                         border-right:2px solid var(--border2);
                         vertical-align:middle;
                         min-width:160px;
                         position:sticky;left:0;z-index:3;">
                Student Info
              </th>
              ${groupHeaders}
            </tr>
            <tr>${colHeaders}</tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  // ── Attach popover logic to group headers ─────────────────
  _attachHeaderPopovers(allData, chain) {
    const accents = ['#4f85f7', '#8b5cf6', '#10b981'];
    const sf = code => this._subjectFilters[code] || { sessions: [], batches: [] };

    // Build per-subject options from allData
    const subjectOpts = {};
    chain.forEach(code => {
      const sessionSet = new Set();
      const batchSet   = new Set();
      allData.students.forEach(st => {
        const sub = st.subjects[code];
        if (sub) {
          if (sub.session && sub.session !== '—') sessionSet.add(sub.session);
          if (sub.batchNo && sub.batchNo !== '—') batchSet.add(sub.batchNo);
        }
      });
      subjectOpts[code] = {
        sessions: [...sessionSet].sort((a, b) => _parseSession(a) - _parseSession(b)),
        batches:  [...batchSet].sort((a, b) => (parseInt(a,10)||0) - (parseInt(b,10)||0)),
      };
    });

    let openPopover = null;

    const closePopover = () => {
      if (openPopover) {
        // Restore table overflow
        const wrap = openPopover.closest?.('.ct-table-wrap');
        if (wrap) wrap.style.overflow = '';
        openPopover.remove();
        openPopover = null;
      }
    };

    // Outside-click closes popover
    const onOutside = (e) => {
      if (openPopover && !openPopover.contains(e.target) && !e.target.closest('.ct-th-group')) {
        closePopover();
        document.removeEventListener('click', onOutside);
      }
    };

    // Helper: build checkbox list HTML
    const chkListHTML = (items, selected, accent, idPrefix) => {
      if (!items.length) return `<div class="ct-chk-empty">No options</div>`;
      return items.map(v => `
        <label class="ct-chk-item" style="--chk-accent:${accent}">
          <input type="checkbox" value="${v}" data-prefix="${idPrefix}"
            style="accent-color:${accent}"
            ${selected.includes(v) ? 'checked' : ''}>
          ${v}
        </label>
      `).join('');
    };

    // Chip × clear buttons
    this._container.querySelectorAll('.ct-th-chip-x').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const code = btn.dataset.clear;
        this._subjectFilters[code] = { sessions: [], batches: [] };
        this._renderBody();
      });
    });

    // Group header click → open popover
    this._container.querySelectorAll('.ct-th-group[data-code]').forEach((th, i) => {
      th.addEventListener('click', e => {
        if (e.target.closest('.ct-th-chip-x')) return;

        const code   = th.dataset.code;
        const accent = accents[i] || accents[0];
        const opts   = subjectOpts[code] || { sessions: [], batches: [] };
        const cur    = sf(code);

        // Toggle
        if (openPopover && openPopover.dataset.code === code) {
          closePopover(); return;
        }
        closePopover();
        document.addEventListener('click', onOutside);

        const pop = document.createElement('div');
        pop.className    = 'ct-popover';
        pop.dataset.code = code;
        pop.innerHTML = `
          <div class="ct-popover-title" style="color:${accent}">${code} Filter</div>

          <div class="ct-popover-row">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;">
              <label class="ct-popover-label">Session</label>
              <button class="ct-sel-all" data-group="sess" style="font-size:10px;color:${accent};background:none;border:none;cursor:pointer;padding:0;font-weight:700;">
                ${cur.sessions.length === opts.sessions.length && opts.sessions.length > 0 ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div class="ct-chk-list" id="ctChkSess-${code}">
              ${chkListHTML(opts.sessions, cur.sessions, accent, 'sess')}
            </div>
          </div>

          <div class="ct-popover-row">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;">
              <label class="ct-popover-label">Batch #</label>
              <button class="ct-sel-all" data-group="batch" style="font-size:10px;color:${accent};background:none;border:none;cursor:pointer;padding:0;font-weight:700;">
                ${cur.batches.length === opts.batches.length && opts.batches.length > 0 ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div class="ct-chk-list" id="ctChkBatch-${code}">
              ${chkListHTML(opts.batches, cur.batches, accent, 'batch')}
            </div>
          </div>

          <div class="ct-popover-actions">
            <button class="ct-popover-set" style="background:${accent};color:#fff;">
              Apply
            </button>
            <button class="ct-popover-clear">Clear</button>
          </div>
        `;

        th.appendChild(pop);
        openPopover = pop;

        // Lift overflow so popover isn't clipped
        const wrap = th.closest('.ct-table-wrap');
        if (wrap) wrap.style.overflow = 'visible';

        // "Select all / Deselect all" buttons
        pop.querySelectorAll('.ct-sel-all').forEach(btn => {
          btn.addEventListener('click', e => {
            e.stopPropagation();
            const group   = btn.dataset.group;
            const listEl  = pop.querySelector(group === 'sess' ? `#ctChkSess-${code}` : `#ctChkBatch-${code}`);
            const boxes   = listEl.querySelectorAll('input[type=checkbox]');
            const allChkd = [...boxes].every(b => b.checked);
            boxes.forEach(b => { b.checked = !allChkd; });
            btn.textContent = allChkd ? 'Select all' : 'Deselect all';
          });
        });

        // Apply
        pop.querySelector('.ct-popover-set').addEventListener('click', e => {
          e.stopPropagation();
          const sessions = [...pop.querySelectorAll(`#ctChkSess-${code} input:checked`)].map(b => b.value);
          const batches  = [...pop.querySelectorAll(`#ctChkBatch-${code} input:checked`)].map(b => b.value);
          this._subjectFilters[code] = { sessions, batches };
          closePopover();
          this._renderBody();
        });

        // Clear
        pop.querySelector('.ct-popover-clear').addEventListener('click', e => {
          e.stopPropagation();
          this._subjectFilters[code] = { sessions: [], batches: [] };
          closePopover();
          this._renderBody();
        });

        pop.addEventListener('click', e => e.stopPropagation());
      });
    });
  },

  // ── Export helpers ────────────────────────────────────────
  // Builds ONE row per student with subject columns side-by-side,
  // exactly matching the screen table layout.
  _buildReportRows(data, chain) {
    const subCols = ['Campus', 'Session', 'Batch #', 'Teacher', 'Status'];
    return data.students.map(st => {
      const row = {
        'Student':    st.studentName || '—',
        'Student ID': st.studentCode || '—',
      };
      chain.forEach(code => {
        const sub = st.subjects[code];
        row[`${code} Campus`]  = sub ? (sub.campus  || '—') : '—';
        row[`${code} Session`] = sub ? (sub.session || '—') : '—';
        row[`${code} Batch #`] = sub ? (sub.batchNo || '—') : '—';
        row[`${code} Teacher`] = sub ? (sub.teacher || '—') : '—';
        row[`${code} Status`]  = sub ? _statusLabel(sub.status) : '—';
      });
      return row;
    });
  },

  _exportCSV(data, track) {
    const exportChain = this._bfActive
      ? this._bfVisibleChain(track.chain)
      : track.chain;
    const rows = this._buildReportRows(data, exportChain);
    if (!rows.length) return;
    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

    let activeFilters = track.chain
      .filter(code => { const f = this._subjectFilters[code] || {}; return (f.sessions && f.sessions.length) || (f.batches && f.batches.length); })
      .map(code => { const f = this._subjectFilters[code]; const p = []; if (f.sessions && f.sessions.length) p.push(`Sessions: ${f.sessions.join(', ')}`); if (f.batches && f.batches.length) p.push(`Batches: ${f.batches.join(', ')}`); return `${code} — ${p.join(' | ')}`; });

    if (this._bfActive) {
      const bp = [];
      if (this._bfSubject)        bp.push(`Subject: ${this._bfSubject}`);
      if (this._bfCampuses.length) bp.push(`Campus: ${this._bfCampuses.join(', ')}`);
      if (this._bfSessions.length) bp.push(`Session: ${this._bfSessions.join(', ')}`);
      if (this._bfBatches.length)  bp.push(`Batch: ${this._bfBatches.join(', ')}`);
      if (bp.length) activeFilters = [bp.join(' | ')];
    }

    const metaLines = [
      `FDA Conversion Tracking Report — ${track.label}`,
      `Generated: ${dateStr} ${timeStr}`,
      activeFilters.length ? `Filters: ${activeFilters.join(' ; ')}` : 'Filters: None',
      `Total Students: ${data.students.length}`,
      '',
    ];

    // Row 1: group header — "Student Info" spanning 2, then each subject code spanning 5
    const subCols = ['Campus', 'Session', 'Batch #', 'Teacher', 'Status'];
    const groupRow = [
      '"Student Info"', '""',
      ...exportChain.flatMap(code => [`"${code}"`, '""', '""', '""', '""']),
    ];

    // Row 2: actual column headers
    const headerRow = [
      '"Student"', '"Student ID"',
      ...exportChain.flatMap(code =>
        subCols.map(c => `"${code} ${c}"`)
      ),
    ];

    const subCols2 = ['Campus', 'Session', 'Batch #', 'Teacher', 'Status'];
    const csvKeys = ['Student', 'Student ID', ...exportChain.flatMap(c => subCols2.map(s => `${c} ${s}`))];
    const dataRows = rows.map(r =>
      csvKeys.map(h => `"${(r[h] || '').replace(/"/g, '""')}"`).join(',')
    );

    const csvRows = [
      metaLines.join('\n'),
      groupRow.join(','),
      headerRow.join(','),
      ...dataRows,
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `Conversion-${track.label.replace(/\s+/g,'-')}-${dateStr.replace(/ /g,'-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  _exportPDF(data, track) {
    const pdfChain = this._bfActive
      ? this._bfVisibleChain(track.chain)
      : track.chain;
    const rows = this._buildReportRows(data, pdfChain);
    if (!rows.length) return;
    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

    const subCols      = ['Campus', 'Session', 'Batch #', 'Teacher', 'Status'];
    const colColors    = ['rgba(79,133,247,.13)', 'rgba(139,92,246,.13)', 'rgba(16,185,129,.13)'];
    const accentColors = ['#1d4ed8', '#6d28d9', '#065f46'];
    const headerBgs    = ['#dbeafe', '#ede9fe', '#d1fae5'];

    // Group header row (subject names spanning 5 cols each)
    const groupThCells = `
      <th rowspan="2" style="min-width:140px;background:#1e3a8a;border-right:2px solid #fff;vertical-align:middle">Student Info</th>
      <th rowspan="2" style="min-width:80px;background:#1e3a8a;border-right:2px solid rgba(255,255,255,.3);vertical-align:middle">Student ID</th>
      ${pdfChain.map((code, i) => `
        <th colspan="${subCols.length}"
            style="background:${headerBgs[i]};color:${accentColors[i]};
                   border-left:2px solid ${accentColors[i]}44;
                   text-align:center;font-size:11px;font-weight:800;
                   letter-spacing:.04em;padding:6px 8px">
          ${code}
        </th>
      `).join('')}
    `;

    // Sub-column header row
    const subThCells = pdfChain.map((code, i) =>
      subCols.map((col, j) => `
        <th style="background:${headerBgs[i]};color:${accentColors[i]};
                   font-weight:700;font-size:9.5px;
                   ${j === 0 ? `border-left:2px solid ${accentColors[i]}44;` : ''}">
          ${col}
        </th>
      `).join('')
    ).join('');

    // Data rows
    const tdRows = rows.map((r, idx) => {
      const keys = Object.keys(r);
      const cells = keys.map((h, ci) => {
        // Determine if this is the first column of a subject group
        const isStudentName = h === 'Student';
        const isStudentId   = h === 'Student ID';
        const subjectIdx    = pdfChain.findIndex(code => h.startsWith(code + ' '));
        const isFirstSubCol = subjectIdx >= 0 && h === `${track.chain[subjectIdx]} Campus`;

        let style = `padding:6px 8px;border-bottom:1px solid #e2e8f0;`;
        if (isStudentName) style += `font-weight:600;color:#1e293b;border-right:2px solid #cbd5e1;`;
        if (isStudentId)   style += `color:#64748b;font-size:10px;border-right:2px solid #e2e8f0;`;
        if (isFirstSubCol && subjectIdx > 0) style += `border-left:2px solid ${accentColors[subjectIdx]}44;`;
        if (subjectIdx >= 0) style += `background:${idx%2===0 ? colColors[subjectIdx] : 'transparent'};`;
        else style += idx%2===0 ? 'background:#fff;' : 'background:#f8faff;';

        return `<td style="${style}">${r[h] || '—'}</td>`;
      });
      return `<tr>${cells.join('')}</tr>`;
    }).join('');

    let activeFilters = pdfChain
      .filter(code => { const f = this._subjectFilters[code] || {}; return (f.sessions && f.sessions.length) || (f.batches && f.batches.length); })
      .map(code => { const f = this._subjectFilters[code]; const p = []; if (f.sessions && f.sessions.length) p.push(`Sessions: ${f.sessions.join(', ')}`); if (f.batches && f.batches.length) p.push(`Batches: ${f.batches.join(', ')}`); return `${code}: ${p.join(' | ')}`; });
    if (this._bfActive) {
      const bp = [];
      if (this._bfSubject)         bp.push(`Subject: ${this._bfSubject}`);
      if (this._bfCampuses.length) bp.push(`Campus: ${this._bfCampuses.join(', ')}`);
      if (this._bfSessions.length) bp.push(`Session: ${this._bfSessions.join(', ')}`);
      if (this._bfBatches.length)  bp.push(`Batch: ${this._bfBatches.join(', ')}`);
      if (bp.length) activeFilters = [bp.join(' | ')];
    }

    const filterHTML = activeFilters.length
      ? activeFilters.map(f => `<span class="filter-chip">${f}</span>`).join('')
      : '<span class="filter-chip" style="background:#f1f5f9;color:#64748b">No filters applied</span>';

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>FDA Conversion Tracking — ${track.label}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#1e293b;background:#fff;padding:20px 24px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #2563eb;padding-bottom:12px;margin-bottom:14px}
  .header-left .title{font-size:20px;font-weight:700;color:#1e40af}
  .header-left .subtitle{font-size:11px;color:#64748b;margin-top:2px}
  .header-right{text-align:right;font-size:10.5px;color:#64748b;line-height:1.6}
  .header-right .date{font-weight:600;color:#1e293b;font-size:11px}
  .meta-row{display:flex;align-items:center;gap:16px;margin-bottom:12px;flex-wrap:wrap}
  .stat-box{background:#f8faff;border:1px solid #dbeafe;border-radius:8px;padding:6px 14px;text-align:center}
  .stat-box .num{font-size:18px;font-weight:700;color:#2563eb;font-family:monospace}
  .stat-box .lbl{font-size:9.5px;color:#64748b;text-transform:uppercase;letter-spacing:.5px}
  .filters-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px}
  .filters-label{font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap}
  .filter-chip{background:#dbeafe;color:#1d4ed8;font-size:10px;font-weight:600;padding:2px 9px;border-radius:10px}
  table{width:100%;border-collapse:collapse;font-size:10.5px}
  thead th{color:#fff;font-weight:600;padding:7px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap;background:#1e40af}
  tbody td{vertical-align:middle;white-space:nowrap}
  .footer{margin-top:16px;padding-top:10px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9.5px;color:#94a3b8}
  @media print{body{padding:12px 14px}@page{size:A4 landscape;margin:10mm}.no-print{display:none}}
</style></head><body>
  <div class="header">
    <div class="header-left">
      <div class="title">FDA Conversion Tracking Report</div>
      <div class="subtitle">${track.label} &nbsp;·&nbsp; ${pdfChain.join(' → ')}</div>
    </div>
    <div class="header-right"><div class="date">${dateStr}</div><div>${timeStr}</div></div>
  </div>
  <div class="meta-row">
    <div class="stat-box"><div class="num">${data.students.length}</div><div class="lbl">Total Students</div></div>
    ${pdfChain.map(code=>`<div class="stat-box"><div class="num">${data.counts[code]||0}</div><div class="lbl">${code} Enrolled</div></div>`).join('')}
  </div>
  <div class="filters-row"><span class="filters-label">&#9660; Filters</span>${filterHTML}</div>
  <table>
    <thead>
      <tr>${groupThCells}</tr>
      <tr>${subThCells}</tr>
    </thead>
    <tbody>${tdRows}</tbody>
  </table>
  <div class="footer">
    <span>FDA Conversion Tracking &nbsp;|&nbsp; Exported ${dateStr} at ${timeStr}</span>
    <span>Total: ${data.students.length} student${data.students.length!==1?'s':''}</span>
  </div>
  <div style="margin-top:10px;text-align:center;font-size:10px;color:#94a3b8">Powered by <strong style="color:#2563eb">Learnomist</strong></div>
  <div class="no-print" style="margin-top:18px;text-align:center">
    <button onclick="window.print()" style="padding:9px 28px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Print / Save as PDF</button>
  </div>
</body></html>`;

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 600);
  },
};

// ── Session parser: "Dec-25" → sortable number ───────────────
const _MONTHS = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
function _parseSession(session) {
  if (!session || session === '—') return Infinity;
  const parts = session.toLowerCase().split('-');
  if (parts.length < 2) return Infinity;
  const mon  = _MONTHS[parts[0]] ?? 0;
  const year = parseInt(parts[1], 10) || 0;
  // Full year: "25" → 2025
  const fullYear = year < 100 ? 2000 + year : year;
  return fullYear * 12 + mon;
}

// ── Status label map ──────────────────────────────────────────
function _statusLabel(status) {
  return {
    active:        'Active',
    dormant:       'Dormant',
    left_study:    'Left Study',
    left_campus:   'Left Campus',
    change_campus: 'Change Campus',
    exempt:        'Exempt',
    completed:     'Completed',
  }[status] || status;
}
