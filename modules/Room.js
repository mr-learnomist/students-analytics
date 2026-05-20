// ============================================================
// Room.js — Rooms Module
// Manage rooms per campus: floors, capacity, facilities
// Place this file in: modules/Room.js
// ============================================================

import { AppState } from '../utils/state.js';
import { Toast }    from '../utils/helpers.js';

// ── In-memory store (synced to AppState) ──────────────────────
function getRooms()        { return AppState.get('rooms') || []; }
function saveRooms(rooms)  { AppState.set('rooms', rooms); }

let _mounted = false;
let _el      = null;

// ── Public API ────────────────────────────────────────────────
export const RoomsModule = {
  mount(el) {
    _el = el;
    _mounted = true;
    _render();
  }
};

// ── Render shell ──────────────────────────────────────────────
function _render() {
  const rooms = _applyAvailabilityExpiry();
  _el.innerHTML = `
    <style>
      /* ── Rooms module styles ── */
      .rm-header        { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:24px; gap:16px; flex-wrap:wrap; }
      .rm-header-text h2{ font-family:var(--font-display); font-size:22px; font-weight:700; color:var(--t1); margin-bottom:4px; }
      .rm-header-text p { font-size:13px; color:var(--t3); }
      .rm-add-btn       { display:flex; align-items:center; gap:7px; background:var(--blue); color:#fff; padding:9px 18px; border-radius:var(--r-sm); font-size:13px; font-weight:600; transition:opacity 0.15s; flex-shrink:0; border:none; cursor:pointer; }
      .rm-add-btn:hover { opacity:0.88; }

      /* Table */
      .rm-table-wrap    { background:var(--surface); border:1px solid var(--border); border-radius:var(--r-lg); overflow:hidden; }
      .rm-empty         { text-align:center; padding:60px 20px; color:var(--t3); font-size:14px; }
      .rm-empty svg     { margin:0 auto 12px; opacity:0.35; }
      table.rm-table    { width:100%; border-collapse:collapse; font-size:13px; }
      table.rm-table th { background:var(--surface2); color:var(--t3); font-size:11.5px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; padding:11px 14px; text-align:left; border-bottom:1px solid var(--border); white-space:nowrap; }
      table.rm-table td { padding:12px 14px; border-bottom:1px solid var(--border); color:#000; vertical-align:middle; }
      table.rm-table tr:last-child td { border-bottom:none; }
      table.rm-table tr:hover td     { background:var(--surface2); }
      .rm-badge         { display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:600; padding:3px 8px; border-radius:20px; }
      .rm-badge-floor   { background:none; color:#000; }
      .rm-badge-yes     { background:none; color:#000; }
      .rm-badge-no      { background:var(--surface3);   color:#000; }
      .rm-badge-campus  { background:var(--blue-dim);   color:#000; }
      .rm-actions       { display:flex; gap:6px; }
      .rm-icon-btn      { width:30px; height:30px; border-radius:6px; display:flex; align-items:center; justify-content:center; color:var(--t3); transition:background 0.15s,color 0.15s; border:none; cursor:pointer; background:none; }
      .rm-icon-btn:hover{ background:var(--surface3); color:var(--t1); }
      .rm-icon-btn.del:hover{ background:rgba(239,68,68,0.12); color:var(--red); }

      /* Modal */
      .rm-overlay       { position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:200; display:flex; align-items:center; justify-content:center; padding:20px; animation:fadeUp 0.2s ease; }
      .rm-modal         { background:var(--surface); border:1px solid var(--border2); border-radius:var(--r-xl); width:100%; max-width:960px; max-height:90vh; overflow-y:auto; box-shadow:var(--shadow-lg); display:flex; flex-direction:column; }
      .rm-modal-head    { display:flex; align-items:center; justify-content:space-between; padding:20px 24px 16px; border-bottom:1px solid var(--border); flex-shrink:0; }
      .rm-modal-head h3 { font-family:var(--font-display); font-size:17px; font-weight:700; color:var(--t1); }
      .rm-modal-close   { width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; color:var(--t3); transition:background 0.15s; border:none; cursor:pointer; background:none; }
      .rm-modal-close:hover{ background:var(--surface3); color:var(--t1); }
      .rm-modal-body    { padding:24px; flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:20px; }
      .rm-modal-foot    { padding:16px 24px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:10px; flex-shrink:0; }

      /* Form fields */
      .rm-row           { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
      .rm-field         { display:flex; flex-direction:column; gap:6px; }
      .rm-field label   { font-size:12px; font-weight:600; color:var(--t2); text-transform:uppercase; letter-spacing:0.05em; }
      .rm-field select,
      .rm-field input   { background:var(--surface2); border:1px solid var(--border2); border-radius:var(--r-sm); padding:9px 12px; color:var(--t1); font-size:13.5px; outline:none; transition:border-color 0.15s; width:100%; }
      .rm-field select:focus,
      .rm-field input:focus { border-color:var(--blue); }
      .rm-field select option { background:var(--surface); }

      /* Floor name chips */
      .rm-floor-chips   { display:flex; flex-wrap:wrap; gap:8px; margin-top:6px; }
      .rm-floor-chip    { display:flex; align-items:center; gap:6px; background:var(--surface3); border:1px solid var(--border2); border-radius:20px; padding:4px 10px 4px 12px; font-size:12.5px; color:var(--t1); }
      .rm-floor-chip input { background:none; border:none; outline:none; color:var(--t1); font-size:12.5px; width:90px; padding:0; }
      .rm-chip-rm       { width:18px; height:18px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:var(--surface4); color:var(--t3); font-size:11px; cursor:pointer; transition:background 0.12s; border:none; }
      .rm-chip-rm:hover { background:var(--red); color:#fff; }
      .rm-section-title { font-size:12px; font-weight:700; color:var(--t3); text-transform:uppercase; letter-spacing:0.07em; padding-bottom:8px; border-bottom:1px solid var(--border); margin-bottom:4px; }

      /* Rooms input table */
      .rm-input-table-wrap { overflow-x:auto; border:1px solid var(--border); border-radius:var(--r); }
      table.rm-input-table { width:100%; border-collapse:collapse; font-size:13px; min-width:700px; }
      table.rm-input-table th { background:var(--surface2); color:var(--t3); font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; padding:10px 12px; text-align:left; border-bottom:1px solid var(--border); white-space:nowrap; }
      table.rm-input-table td { padding:7px 10px; border-bottom:1px solid var(--border); vertical-align:middle; }
      table.rm-input-table tr:last-child td { border-bottom:none; }
      table.rm-input-table input[type="text"],
      table.rm-input-table input[type="number"],
      table.rm-input-table select { background:var(--surface2); border:1px solid var(--border2); border-radius:6px; padding:6px 9px; color:var(--t1); font-size:12.5px; outline:none; width:100%; transition:border-color 0.15s; }
      table.rm-input-table input:focus,
      table.rm-input-table select:focus { border-color:var(--blue); }
      table.rm-input-table input[type="checkbox"] { width:16px; height:16px; accent-color:var(--blue); cursor:pointer; }
      table.rm-input-table select option { background:var(--surface); }
      .rm-add-row-btn   { display:flex; align-items:center; gap:6px; color:var(--blue); font-size:12.5px; font-weight:600; padding:8px 12px; border-radius:var(--r-sm); background:none; border:1px dashed var(--blue); cursor:pointer; transition:background 0.15s; margin-top:10px; }
      .rm-add-row-btn:hover { background:var(--blue-dim); }
      .rm-row-del       { width:26px; height:26px; border-radius:6px; display:flex; align-items:center; justify-content:center; color:var(--t3); cursor:pointer; background:none; border:none; transition:background 0.12s,color 0.12s; }
      .rm-row-del:hover { background:rgba(239,68,68,0.12); color:var(--red); }

      /* Save / cancel btns */
      .rm-btn           { padding:9px 20px; border-radius:var(--r-sm); font-size:13px; font-weight:600; border:none; cursor:pointer; transition:opacity 0.15s; }
      .rm-btn-primary   { background:var(--blue); color:#fff; }
      .rm-btn-primary:hover{ opacity:0.88; }
      .rm-btn-ghost     { background:var(--surface2); color:var(--t2); border:1px solid var(--border2); }
      .rm-btn-ghost:hover{ background:var(--surface3); }

      /* Group header rows in view table */
      .rm-group-row td  { background:var(--surface2); color:var(--t3); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.07em; padding:7px 14px; }

      /* ── Filter toolbar (LP batchtime style) ── */
      .rm-toolbar       { display:flex; align-items:center; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
      .rm-search-pill   { display:flex; align-items:center; gap:8px; height:36px; padding:0 12px; background:var(--surface1,#fff); border:1.5px solid var(--border); border-radius:20px; min-width:200px; max-width:280px; flex:1; transition:border-color .15s; box-shadow:0 1px 3px rgba(0,0,0,.06); }
      .rm-search-pill:focus-within { border-color:var(--blue); }
      .rm-search-pill input { border:none; outline:none; background:transparent; font-size:12.5px; color:var(--t1); width:100%; font-family:var(--font); }
      .rm-mf            { position:relative; flex-shrink:0; }
      .rm-mf-btn        { display:flex; align-items:center; gap:5px; cursor:pointer; padding:0 10px; height:34px; border:1px solid var(--border); border-radius:8px; background:var(--surface2); color:var(--t2); font-size:12.5px; white-space:nowrap; user-select:none; min-width:90px; max-width:180px; font-family:var(--font); }
      .rm-mf-btn:hover  { border-color:var(--blue); color:var(--blue); }
      .rm-mf-btn.active { border-color:var(--blue); background:var(--blue-dim); color:var(--blue); font-weight:600; }
      .rm-mf-btn .mf-label { overflow:hidden; text-overflow:ellipsis; flex:1; }
      .rm-mf-btn .mf-caret { font-size:9px; flex-shrink:0; opacity:0.6; }
      .rm-mf-btn .mf-badge { background:var(--blue); color:#fff; font-size:9.5px; font-weight:700; border-radius:10px; padding:1px 5px; flex-shrink:0; }
      .rm-mf-panel      { position:absolute; top:calc(100% + 4px); left:0; z-index:999; background:var(--surface1,#ffffff); border:1px solid var(--border,#e2e8f0); border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.12); min-width:180px; max-width:260px; overflow:hidden; display:none; flex-direction:column; }
      .rm-mf-panel.open { display:flex; }
      .rm-mf-search     { padding:8px 10px 4px; border-bottom:1px solid var(--border); }
      .rm-mf-search input { width:100%; padding:4px 8px; font-size:12px; border:1px solid var(--border); border-radius:6px; background:var(--surface2); color:var(--t1); outline:none; }
      .rm-mf-list       { overflow-y:auto; max-height:200px; padding:4px 0; }
      .rm-mf-item       { display:flex; align-items:center; gap:9px; padding:7px 12px; cursor:pointer; font-size:12.5px; color:var(--t2); transition:background .1s,color .1s; user-select:none; }
      .rm-mf-item:hover { background:var(--blue-dim,rgba(37,99,235,.07)); color:var(--blue); }
      .rm-mf-item.checked { color:var(--blue); font-weight:600; }
      .rm-mf-chk        { width:15px; height:15px; border-radius:4px; flex-shrink:0; border:1.5px solid var(--border2,#cbd5e1); display:inline-flex; align-items:center; justify-content:center; transition:all .12s; background:var(--surface1); }
      .rm-mf-item.checked .rm-mf-chk { background:var(--blue); border-color:var(--blue); }
      .rm-mf-item.checked .rm-mf-chk::after { content:''; display:block; width:4px; height:7px; border:2px solid #fff; border-top:none; border-left:none; transform:rotate(45deg) translate(-1px,-1px); }
      .rm-mf-lbl        { flex:1; }
      .rm-mf-footer     { border-top:1px solid var(--border); padding:7px 10px; display:flex; justify-content:space-between; align-items:center; gap:6px; background:var(--surface2); }
      .rm-mf-count      { font-size:11px; color:var(--t3); }
      .rm-mf-clear      { font-size:11px; padding:3px 10px; border-radius:6px; cursor:pointer; border:1px solid var(--border); background:var(--surface1); color:var(--t2); font-family:var(--font); transition:all .12s; }
      .rm-mf-clear:hover{ border-color:var(--red,#ef4444); color:var(--red,#ef4444); }
      .rm-export-btn    { display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:7px; border:1px solid var(--border); background:var(--surface2); color:var(--t3); cursor:pointer; transition:all .15s; }
      .rm-export-btn:hover { border-color:var(--blue); color:var(--blue); background:var(--blue-dim); }
      .rm-clear-filters { display:inline-flex; align-items:center; gap:5px; height:34px; padding:0 12px; border-radius:8px; border:1px solid rgba(239,68,68,.35); background:rgba(239,68,68,.06); color:var(--red,#ef4444); font-size:12px; font-weight:600; cursor:pointer; white-space:nowrap; font-family:var(--font); transition:all .15s; }
      .rm-clear-filters:hover { background:rgba(239,68,68,.12); }

      /* Inline edit row */
      .rm-row-editing td { background:var(--blue-dim,rgba(59,130,246,0.07)) !important; }
      .rm-inline-input  { background:var(--surface); border:1px solid var(--border2); border-radius:6px; padding:5px 8px; color:#000; font-size:12.5px; outline:none; width:100%; transition:border-color 0.15s; box-sizing:border-box; }
      .rm-inline-input:focus { border-color:var(--blue); }
      .rm-inline-select { background:var(--surface); border:1px solid var(--border2); border-radius:6px; padding:5px 8px; color:#000; font-size:12.5px; outline:none; width:100%; transition:border-color 0.15s; box-sizing:border-box; cursor:pointer; }
      .rm-inline-select:focus { border-color:var(--blue); }
      .rm-inline-check  { width:15px; height:15px; accent-color:var(--blue); cursor:pointer; }
      .rm-icon-btn.save { color:var(--green,#22c55e); }
      .rm-icon-btn.save:hover { background:rgba(34,197,94,0.12); color:var(--green,#22c55e); }
      .rm-icon-btn.cancel-edit:hover { background:rgba(239,68,68,0.12); color:var(--red); }

      /* Availability */
      .rm-avail-tick { color:var(--green,#22c55e); font-size:15px; font-weight:700; }
      .rm-avail-edit-wrap { display:flex; flex-direction:column; gap:6px; min-width:220px; }
      .rm-avail-radios { display:flex; gap:12px; align-items:center; }
      .rm-avail-radio  { display:flex; align-items:center; gap:5px; font-size:12.5px; color:var(--t1); cursor:pointer; }
      .rm-avail-radio input { accent-color:var(--blue); width:14px; height:14px; cursor:pointer; }
      .rm-avail-dates  { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
      .rm-avail-dates input[type="date"] {
        background:var(--surface); border:1px solid var(--border2); border-radius:6px;
        padding:4px 7px; color:var(--t1); font-size:12px; outline:none;
        transition:border-color 0.15s; font-family:inherit;
      }
      .rm-avail-dates input[type="date"]:focus { border-color:var(--blue); }
      .rm-avail-hint { font-size:10.5px; color:var(--t3); margin-top:2px; }
    </style>

    <!-- Page header -->
    <div class="rm-header">
      <div class="rm-header-text">
        <h2>Rooms</h2>
        <p>Manage rooms, floors, and facilities across campuses.</p>
      </div>
      <button class="rm-add-btn" id="rmAddBtn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Room
      </button>
    </div>

    <!-- Filter toolbar -->
    <div class="rm-toolbar" id="rmToolbar">
      <!-- Search pill -->
      <div class="rm-search-pill">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:var(--t3);flex-shrink:0">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input id="rmSearch" placeholder="Search rooms…" autocomplete="off"/>
      </div>
      <!-- Multi-select filters (JS will populate) -->
      <div class="rm-mf" id="rmInstFilter"></div>
      <div class="rm-mf" id="rmCampFilter"></div>
      <div class="rm-mf" id="rmFloorFilter"></div>
      <div class="rm-mf" id="rmCompFilter"></div>
      <!-- Clear Filters (shown only when active) -->
      <div id="rmClearWrap"></div>
      <!-- Spacer -->
      <span style="flex:1"></span>
      <!-- Count -->
      <span id="rmCount" style="font-size:12px;color:var(--t3);flex-shrink:0;white-space:nowrap">${rooms.length} room${rooms.length !== 1 ? 's' : ''}</span>
      <!-- Export CSV -->
      <button class="rm-export-btn" id="rmExportCSV" title="Export to CSV">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12l2.5 2.5L16 9"/>
        </svg>
      </button>
      <!-- Export PDF -->
      <button class="rm-export-btn" id="rmExportPDF" title="Export to PDF">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>
        </svg>
      </button>
    </div>

    <!-- Rooms table -->
    <div class="rm-table-wrap" id="rmTableWrap">
      ${_buildTable(rooms)}
    </div>
  `;

  // Wire add button
  _el.querySelector('#rmAddBtn').addEventListener('click', () => _openModal());

  // Wire table actions (edit / delete)
  _el.querySelector('#rmTableWrap').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id    = btn.dataset.id;
    const rooms = getRooms();
    const room  = rooms.find(r => r.id === id);
    if (btn.dataset.action === 'inline-edit' && room) _startInlineEdit(btn, room);
    if (btn.dataset.action === 'edit' && room)   _openModal(room);
    if (btn.dataset.action === 'delete' && room) _deleteRoom(id);
  });

  // Wire filters + export
  _initRoomFilters(_el);
}

// ── Table renderer ─────────────────────────────────────────────
function _buildTable(rooms) {
  if (!rooms.length) {
    return `<div class="rm-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/></svg>
      <p>No rooms added yet.<br>Click <strong>Add Room</strong> to get started.</p>
    </div>`;
  }

  // Auto-expire unavailable rooms whose endDate has passed
  const today = new Date().toISOString().slice(0, 10);

  // Group rows by campus
  const grouped = {};
  rooms.forEach(r => {
    const inst  = (AppState.get('institutes') || []).find(i => i.id === r.institute);
    const camp  = (AppState.get('campuses')   || []).find(c => c.id === r.campus);
    const instName = inst?.instituteName || r.institute || '—';
    const campName = camp?.campusName    || r.campus    || '—';
    const key = `${instName} — ${campName}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  });

  let rows = '';
  Object.entries(grouped).forEach(([group, list]) => {
    rows += `<tr class="rm-group-row"><td colspan="10">${group}</td></tr>`;
    list.forEach(r => {
      // Build floor options for inline select
      const floors = r._floors || [r.floor];
      const floorOpts = floors.map(f => `<option value="${f}" ${f === r.floor ? 'selected' : ''}>${f}</option>`).join('');
      const effStatus = _resolveAvailability(r);

      rows += `<tr data-id="${r.id}">
        <td class="rm-td-name">${r.name}</td>
        <td class="rm-td-code"><span style="font-family:var(--font-mono);font-size:12px">${r.code}</span></td>
        <td class="rm-td-floor"><span class="rm-badge rm-badge-floor">${r.floor}</span></td>
        <td class="rm-td-cap">${r.capacity}</td>
        <td class="rm-td-chairs">${r.chairs}</td>
        <td class="rm-td-multi"><span class="rm-badge ${r.multimedia ? 'rm-badge-yes' : 'rm-badge-no'}">${r.multimedia ? '✓ Yes' : '— No'}</span></td>
        <td class="rm-td-comp">${r.computers > 0 ? r.computers : '—'}</td>
        <td class="rm-td-ac"><span class="rm-badge ${r.ac ? 'rm-badge-yes' : 'rm-badge-no'}">${r.ac ? '✓ Yes' : '— No'}</span></td>
        <td class="rm-td-avail" style="text-align:center">
          ${effStatus === 'available' ? '<span class="rm-avail-tick" title="Available">✓</span>' : ''}
        </td>
        <td>
          <div class="rm-actions" data-view-actions>
            <button class="rm-icon-btn" data-action="inline-edit" data-id="${r.id}" title="Quick Edit Row"
              data-name="${r.name}" data-code="${r.code}" data-floor="${r.floor}"
              data-capacity="${r.capacity}" data-chairs="${r.chairs}"
              data-multimedia="${r.multimedia}" data-computers="${r.computers}" data-ac="${r.ac}"
              data-floors='${JSON.stringify(floors)}'>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="rm-icon-btn del" data-action="delete" data-id="${r.id}" title="Delete">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
    });
  });

  return `<table class="rm-table">
    <thead>
      <tr>
        <th>Room Name</th>
        <th>Code</th>
        <th>Floor</th>
        <th>Capacity</th>
        <th>Chairs</th>
        <th>Multimedia</th>
        <th>Computers</th>
        <th>AC</th>
        <th style="text-align:center">Available</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── Modal ──────────────────────────────────────────────────────
function _openModal(existing = null) {
  const institutes = AppState.get('institutes') || [];
  const campuses   = AppState.get('campuses')   || [];

  // If editing, pre-select institute & campus to get floor list
  const preInst   = existing?.institute || '';
  const preCampus = existing?.campus    || '';
  const preFloors = existing?._floors   || [];   // array of floor name strings
  const preRooms  = existing?._rooms    || [];   // array of room row objects

  const instOptions = institutes.map(i =>
    `<option value="${i.id}" ${i.id === preInst ? 'selected' : ''}>${i.instituteName}</option>`
  ).join('');

  // Campus options filtered by institute
  const filteredCampuses = preInst
    ? campuses.filter(c => c.instituteId === preInst)
    : campuses;
  const campusOptions = filteredCampuses.map(c =>
    `<option value="${c.id}" ${c.id === preCampus ? 'selected' : ''}>${c.campusName}</option>`
  ).join('');

  // Floor chips
  const floorChips = _renderFloorChips(preFloors);

  // Room rows table
  const roomRows = _renderRoomRows(preRooms, preFloors);

  const overlay = document.createElement('div');
  overlay.className = 'rm-overlay';
  overlay.innerHTML = `
    <div class="rm-modal" role="dialog" aria-modal="true">
      <div class="rm-modal-head">
        <h3>${existing ? 'Edit Rooms' : 'Add Rooms'}</h3>
        <button class="rm-modal-close" id="rmModalClose">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="rm-modal-body">

        <!-- Institute + Campus row -->
        <div class="rm-row">
          <div class="rm-field">
            <label>Institute</label>
            <select id="rmInstitute">
              <option value="">— Select Institute —</option>
              ${instOptions}
            </select>
          </div>
          <div class="rm-field">
            <label>Campus</label>
            <select id="rmCampus">
              <option value="">— Select Campus —</option>
              ${campusOptions}
            </select>
          </div>
        </div>

        <!-- Floors -->
        <div>
          <div class="rm-section-title">Floors</div>
          <div class="rm-row" style="grid-template-columns:180px 1fr;align-items:start;gap:14px">
            <div class="rm-field">
              <label>Number of Floors</label>
              <input type="number" id="rmFloorCount" min="1" max="50" value="${preFloors.length || ''}" placeholder="e.g. 3" />
            </div>
            <div class="rm-field">
              <label>Floor Names <span style="text-transform:none;font-weight:400;color:var(--t3)">(editable)</span></label>
              <div class="rm-floor-chips" id="rmFloorChips">${floorChips}</div>
            </div>
          </div>
        </div>

        <!-- Room rows table -->
        <div id="rmRoomSection" ${preFloors.length === 0 ? 'style="display:none"' : ''}>
          <div class="rm-section-title">Room Details</div>
          <div class="rm-input-table-wrap">
            <table class="rm-input-table">
              <thead>
                <tr>
                  <th>Room Name</th>
                  <th>Room Code</th>
                  <th>Floor</th>
                  <th style="width:90px">Capacity</th>
                  <th style="width:80px">Chairs</th>
                  <th style="width:90px;text-align:center">Multimedia</th>
                  <th style="width:100px">Computers</th>
                  <th style="width:70px;text-align:center">AC</th>
                  <th style="width:36px"></th>
                </tr>
              </thead>
              <tbody id="rmRoomRows">${roomRows}</tbody>
            </table>
          </div>
          <button class="rm-add-row-btn" id="rmAddRow">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Row
          </button>
        </div>

      </div><!-- /rm-modal-body -->

      <div class="rm-modal-foot">
        <button class="rm-btn rm-btn-ghost" id="rmModalCancel">Cancel</button>
        <button class="rm-btn rm-btn-primary" id="rmModalSave">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline-block;vertical-align:middle;margin-right:5px"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          Save Rooms
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // ── Close handlers
  const close = () => overlay.remove();
  overlay.querySelector('#rmModalClose').addEventListener('click', close);
  overlay.querySelector('#rmModalCancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  // ── Institute → reload campuses
  const instSel = overlay.querySelector('#rmInstitute');
  const campSel = overlay.querySelector('#rmCampus');

  instSel.addEventListener('change', () => {
    const inst = instSel.value;
    const camps = (AppState.get('campuses') || []).filter(c => c.instituteId === inst);
    campSel.innerHTML = '<option value="">— Select Campus —</option>' +
      camps.map(c => `<option value="${c.id}">${c.campusName}</option>`).join('');
  });

  // ── Floor count → generate chips
  const floorCountInput = overlay.querySelector('#rmFloorCount');
  const floorChipsEl    = overlay.querySelector('#rmFloorChips');
  const roomSection     = overlay.querySelector('#rmRoomSection');
  const roomRowsTbody   = overlay.querySelector('#rmRoomRows');

  function getFloorNames() {
    return [...floorChipsEl.querySelectorAll('.rm-floor-chip input')]
      .map(i => i.value.trim()).filter(Boolean);
  }

  function rebuildFloorDropdowns() {
    const floors = getFloorNames();
    roomRowsTbody.querySelectorAll('select.rm-floor-sel').forEach(sel => {
      const cur = sel.value;
      sel.innerHTML = '<option value="">— Floor —</option>' +
        floors.map(f => `<option value="${f}" ${f === cur ? 'selected' : ''}>${f}</option>`).join('');
    });
  }

  function addFloorChip(name = '') {
    const chip = document.createElement('div');
    chip.className = 'rm-floor-chip';
    chip.innerHTML = `<input type="text" placeholder="Floor name" value="${name}" maxlength="40"/>
      <button class="rm-chip-rm" title="Remove">✕</button>`;
    chip.querySelector('.rm-chip-rm').addEventListener('click', () => {
      chip.remove();
      rebuildFloorDropdowns();
      if (!getFloorNames().length) roomSection.style.display = 'none';
    });
    chip.querySelector('input').addEventListener('input', rebuildFloorDropdowns);
    floorChipsEl.appendChild(chip);
  }

  floorCountInput.addEventListener('change', () => {
    const n = Math.max(1, Math.min(50, parseInt(floorCountInput.value) || 0));
    floorCountInput.value = n || '';
    if (!n) return;
    // Clear existing chips and generate n chips
    floorChipsEl.innerHTML = '';
    for (let i = 1; i <= n; i++) addFloorChip(`Floor ${i}`);
    rebuildFloorDropdowns();
    roomSection.style.display = '';
  });

  // Restore existing chips (edit mode)
  if (preFloors.length) {
    floorChipsEl.innerHTML = '';
    preFloors.forEach(f => addFloorChip(f));
  }

  // ── Add room row
  function addRoomRow(data = {}) {
    const floors = getFloorNames();
    const floorOpts = '<option value="">— Floor —</option>' +
      floors.map(f => `<option value="${f}" ${f === data.floor ? 'selected' : ''}>${f}</option>`).join('');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text"   class="rm-r-name"  placeholder="e.g. Seminar Hall" value="${data.name || ''}" /></td>
      <td><input type="text"   class="rm-r-code"  placeholder="e.g. R-101"        value="${data.code || ''}" /></td>
      <td><select class="rm-floor-sel">${floorOpts}</select></td>
      <td><input type="number" class="rm-r-cap"   placeholder="30" min="1" value="${data.capacity || ''}" /></td>
      <td><input type="number" class="rm-r-chairs" placeholder="30" min="0" value="${data.chairs || ''}" /></td>
      <td style="text-align:center"><input type="checkbox" class="rm-r-multi" ${data.multimedia ? 'checked' : ''} /></td>
      <td><input type="number" class="rm-r-comp"  placeholder="0" min="0" value="${data.computers || ''}" /></td>
      <td style="text-align:center"><input type="checkbox" class="rm-r-ac" ${data.ac ? 'checked' : ''} /></td>
      <td><button class="rm-row-del" title="Remove row">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button></td>
    `;
    tr.querySelector('.rm-row-del').addEventListener('click', () => tr.remove());
    roomRowsTbody.appendChild(tr);
  }

  overlay.querySelector('#rmAddRow').addEventListener('click', () => addRoomRow());

  // Restore existing rows (edit mode)
  if (preRooms.length) {
    roomRowsTbody.innerHTML = '';
    preRooms.forEach(r => addRoomRow(r));
    rebuildFloorDropdowns();
  }

  // ── Save
  overlay.querySelector('#rmModalSave').addEventListener('click', () => {
    const institute = instSel.value.trim();
    const campus    = campSel.value.trim();
    if (!institute) { Toast.warning('Please select an institute.'); return; }
    if (!campus)    { Toast.warning('Please select a campus.'); return; }

    const floors = getFloorNames();
    if (!floors.length) { Toast.warning('Please add at least one floor.'); return; }

    const rows = [...roomRowsTbody.querySelectorAll('tr')];
    if (!rows.length) { Toast.warning('Please add at least one room row.'); return; }

    const newRooms = [];
    let valid = true;
    rows.forEach((tr, idx) => {
      const name = tr.querySelector('.rm-r-name').value.trim();
      const code = tr.querySelector('.rm-r-code').value.trim();
      const floor= tr.querySelector('.rm-floor-sel').value;
      if (!name) { Toast.warning(`Row ${idx+1}: Room name is required.`); valid = false; return; }
      if (!code) { Toast.warning(`Row ${idx+1}: Room code is required.`); valid = false; return; }
      if (!floor){ Toast.warning(`Row ${idx+1}: Please select a floor.`); valid = false; return; }
      newRooms.push({
        id:         existing ? (existing._rooms?.[idx]?.id || _uid()) : _uid(),
        institute,
        campus,
        floor,
        name,
        code,
        capacity:   parseInt(tr.querySelector('.rm-r-cap').value)    || 0,
        chairs:     parseInt(tr.querySelector('.rm-r-chairs').value)  || 0,
        multimedia: tr.querySelector('.rm-r-multi').checked,
        computers:  parseInt(tr.querySelector('.rm-r-comp').value)    || 0,
        ac:         tr.querySelector('.rm-r-ac').checked,
        _floors:    floors,   // keep for edit round-trip
      });
    });

    if (!valid) return;

    let allRooms = getRooms();

    if (existing) {
      // Remove old rooms that belonged to this group (same institute+campus)
      allRooms = allRooms.filter(r => !(r.institute === existing.institute && r.campus === existing.campus));
    }

    // Tag floors on each room for edit round-trip
    newRooms.forEach(r => { r._floors = floors; });

    allRooms.push(...newRooms);
    saveRooms(allRooms);

    close();
    _refreshTable();
    Toast.success(`${newRooms.length} room(s) saved successfully.`);
  });
}

// ── Helper: render floor chips HTML (initial) ──────────────────
function _renderFloorChips(floors) {
  return floors.map(f => `
    <div class="rm-floor-chip">
      <input type="text" placeholder="Floor name" value="${f}" maxlength="40"/>
      <button class="rm-chip-rm" title="Remove">✕</button>
    </div>`).join('');
}

// ── Helper: render initial room rows HTML ──────────────────────
function _renderRoomRows(rooms, floors) {
  if (!rooms.length) return '';
  const floorOpts = (sel) => '<option value="">— Floor —</option>' +
    floors.map(f => `<option value="${f}" ${f === sel ? 'selected' : ''}>${f}</option>`).join('');
  return rooms.map(r => `
    <tr>
      <td><input type="text"   class="rm-r-name"   value="${r.name}"      placeholder="e.g. Seminar Hall" /></td>
      <td><input type="text"   class="rm-r-code"   value="${r.code}"      placeholder="e.g. R-101" /></td>
      <td><select class="rm-floor-sel">${floorOpts(r.floor)}</select></td>
      <td><input type="number" class="rm-r-cap"    value="${r.capacity}"  placeholder="30" min="1" /></td>
      <td><input type="number" class="rm-r-chairs" value="${r.chairs}"    placeholder="30" min="0" /></td>
      <td style="text-align:center"><input type="checkbox" class="rm-r-multi" ${r.multimedia ? 'checked' : ''} /></td>
      <td><input type="number" class="rm-r-comp"   value="${r.computers}" placeholder="0" min="0" /></td>
      <td style="text-align:center"><input type="checkbox" class="rm-r-ac" ${r.ac ? 'checked' : ''} /></td>
      <td><button class="rm-row-del" title="Remove row">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button></td>
    </tr>`).join('');
}

// ── Delete room group ──────────────────────────────────────────
function _deleteRoom(id) {
  const rooms = getRooms();
  const target = rooms.find(r => r.id === id);
  if (!target) return;
  // Delete all rooms in same campus group
  const updated = rooms.filter(r => !(r.institute === target.institute && r.campus === target.campus));
  saveRooms(updated);
  _refreshTable();
  Toast.success('Room group deleted.');
}

// ── Refresh just the table area ────────────────────────────────
function _refreshTable() {
  const wrap = _el?.querySelector('#rmTableWrap');
  if (wrap) wrap.innerHTML = _buildTable(_applyAvailabilityExpiry());
  wrap?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id   = btn.dataset.id;
    const room = getRooms().find(r => r.id === id);
    if (btn.dataset.action === 'inline-edit' && room) _startInlineEdit(btn, room);
    if (btn.dataset.action === 'edit'   && room) _openModal(room);
    if (btn.dataset.action === 'delete' && room) _deleteRoom(id);
  });
}

// ── Filter toolbar wiring ──────────────────────────────────────
function _initRoomFilters(el) {
  // Filter state
  let _instFilter  = [];
  let _campFilter  = [];
  let _floorFilter = [];
  let _compFilter  = [];
  let _search      = '';

  const rooms     = getRooms();
  const institutes = AppState.get('institutes') || [];
  const campuses   = AppState.get('campuses')   || [];

  // Unique values from room data
  const usedInsts  = [...new Set(rooms.map(r => r.institute).filter(Boolean))];
  const usedCamps  = [...new Set(rooms.map(r => r.campus).filter(Boolean))];
  const usedFloors = [...new Set(rooms.map(r => r.floor).filter(Boolean))].sort();

  const instItems  = usedInsts.map(id => {
    const obj = institutes.find(i => i.id === id);
    return { val: id, label: obj?.instituteName || id };
  });
  const campItems  = usedCamps.map(id => {
    const obj = campuses.find(c => c.id === id);
    return { val: id, label: obj?.campusName || id };
  });
  const floorItems = usedFloors.map(f => ({ val: f, label: f }));
  // Computer filter: "Has Computers" vs "No Computers"
  const compItems  = [
    { val: 'yes', label: 'Has Computers' },
    { val: 'no',  label: 'No Computers'  },
  ];

  // Apply all filters and rebuild table
  function applyFilters() {
    let filtered = getRooms();
    if (_instFilter.length)  filtered = filtered.filter(r => _instFilter.includes(r.institute));
    if (_campFilter.length)  filtered = filtered.filter(r => _campFilter.includes(r.campus));
    if (_floorFilter.length) filtered = filtered.filter(r => _floorFilter.includes(r.floor));
    if (_compFilter.length) {
      filtered = filtered.filter(r => {
        const has = (r.computers || 0) > 0;
        if (_compFilter.includes('yes') && _compFilter.includes('no')) return true;
        if (_compFilter.includes('yes')) return has;
        if (_compFilter.includes('no'))  return !has;
        return true;
      });
    }
    if (_search) {
      const q = _search.toLowerCase();
      filtered = filtered.filter(r =>
        [r.name, r.code, r.floor].join(' ').toLowerCase().includes(q)
      );
    }
    const wrap = el.querySelector('#rmTableWrap');
    if (wrap) wrap.innerHTML = _buildTable(filtered);
    // Re-wire inline actions
    wrap?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id   = btn.dataset.id;
      const room = getRooms().find(r => r.id === id);
      if (btn.dataset.action === 'inline-edit' && room) _startInlineEdit(btn, room);
      if (btn.dataset.action === 'edit'   && room) _openModal(room);
      if (btn.dataset.action === 'delete' && room) _deleteRoom(id);
    });
    // Update count
    const countEl = el.querySelector('#rmCount');
    if (countEl) countEl.textContent = `${filtered.length} room${filtered.length !== 1 ? 's' : ''}`;
    // Show/hide clear button
    const clearWrap = el.querySelector('#rmClearWrap');
    const anyActive = _instFilter.length || _campFilter.length || _floorFilter.length || _compFilter.length || _search;
    if (clearWrap) {
      clearWrap.innerHTML = anyActive
        ? `<button class="rm-clear-filters" id="rmClearAll">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            Clear Filters
          </button>`
        : '';
      clearWrap.querySelector('#rmClearAll')?.addEventListener('click', () => {
        _instFilter = []; _campFilter = []; _floorFilter = []; _compFilter = []; _search = '';
        el.querySelector('#rmSearch').value = '';
        [instWrap, campWrap, floorWrap, compWrap].forEach(w => {
          if (w._mfSelected) { w._mfSelected.clear(); w._mfRenderBtn?.(); }
        });
        applyFilters();
      });
    }
    // Store filtered rows for export
    el._rmFilteredRooms = filtered;
  }

  // Init multi-filters
  const instWrap  = el.querySelector('#rmInstFilter');
  const campWrap  = el.querySelector('#rmCampFilter');
  const floorWrap = el.querySelector('#rmFloorFilter');
  const compWrap  = el.querySelector('#rmCompFilter');

  if (instItems.length)  _initRoomMultiFilter(instWrap,  'Institute',  instItems,  sel => { _instFilter  = sel; applyFilters(); });
  if (campItems.length)  _initRoomMultiFilter(campWrap,  'Campus',     campItems,  sel => { _campFilter  = sel; applyFilters(); });
  if (floorItems.length) _initRoomMultiFilter(floorWrap, 'Floor',      floorItems, sel => { _floorFilter = sel; applyFilters(); });
  _initRoomMultiFilter(compWrap, 'Computers', compItems, sel => { _compFilter = sel; applyFilters(); });

  // Search
  el.querySelector('#rmSearch')?.addEventListener('input', e => {
    _search = e.target.value.trim();
    applyFilters();
  });

  // Close panels on outside click
  document.addEventListener('click', () => {
    el.querySelectorAll('.rm-mf-panel.open').forEach(p => p.classList.remove('open'));
  }, { capture: true });

  // Store initial filtered set
  el._rmFilteredRooms = rooms;

  // Export CSV
  el.querySelector('#rmExportCSV')?.addEventListener('click', () => _exportRoomsCSV(el._rmFilteredRooms || getRooms()));

  // Export PDF
  el.querySelector('#rmExportPDF')?.addEventListener('click', () => _exportRoomsPDF(el._rmFilteredRooms || getRooms()));
}

// ── Multi-select widget (LP batchtime style) ───────────────────
function _initRoomMultiFilter(wrap, allLabel, items, onchange) {
  wrap._mfItems    = items;
  wrap._mfSelected = new Set();

  const btn   = document.createElement('div');
  btn.className = 'rm-mf-btn';
  const panel = document.createElement('div');
  panel.className = 'rm-mf-panel';
  wrap.appendChild(btn);
  wrap.appendChild(panel);

  const renderBtn = () => {
    const sel = wrap._mfSelected;
    if (sel.size === 0) {
      btn.className = 'rm-mf-btn';
      btn.innerHTML = `<span class="mf-label">${allLabel}</span><span class="mf-caret">▾</span>`;
    } else {
      btn.className = 'rm-mf-btn active';
      const lbl   = sel.size === 1
        ? (wrap._mfItems.find(i => i.val === [...sel][0])?.label || '')
        : `${sel.size} selected`;
      const short = lbl.length > 18 ? lbl.slice(0,16)+'…' : lbl;
      btn.innerHTML = `<span class="mf-label">${short}</span><span class="mf-badge">${sel.size}</span><span class="mf-caret">▾</span>`;
    }
  };
  wrap._mfRenderBtn = renderBtn;

  const renderList = (q = '') => {
    const filtered = wrap._mfItems.filter(i => !q || i.label.toLowerCase().includes(q.toLowerCase()));
    panel.innerHTML = `
      <div class="rm-mf-search"><input placeholder="Search…" value="${q}" autocomplete="off"/></div>
      <div class="rm-mf-list">
        ${filtered.length ? filtered.map(i => `
          <div class="rm-mf-item ${wrap._mfSelected.has(i.val) ? 'checked' : ''}" data-val="${i.val}">
            <span class="rm-mf-chk"></span>
            <span class="rm-mf-lbl">${i.label}</span>
          </div>`).join('') : '<div style="padding:12px;font-size:12px;color:var(--t4);text-align:center">No results</div>'}
      </div>
      <div class="rm-mf-footer">
        <span class="rm-mf-count">${wrap._mfSelected.size} selected</span>
        <button class="rm-mf-clear">✕ Clear</button>
      </div>`;

    const inp = panel.querySelector('.rm-mf-search input');
    inp.addEventListener('input', e => renderList(e.target.value));
    setTimeout(() => inp.focus(), 0);

    panel.querySelectorAll('.rm-mf-item').forEach(item => {
      item.addEventListener('click', e => {
        e.stopPropagation();
        const val = item.dataset.val;
        if (wrap._mfSelected.has(val)) wrap._mfSelected.delete(val);
        else                           wrap._mfSelected.add(val);
        item.classList.toggle('checked', wrap._mfSelected.has(val));
        const cnt = panel.querySelector('.rm-mf-count');
        if (cnt) cnt.textContent = `${wrap._mfSelected.size} selected`;
        renderBtn();
        onchange([...wrap._mfSelected]);
      });
    });

    panel.querySelector('.rm-mf-clear').addEventListener('click', e => {
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
    document.querySelectorAll('.rm-mf-panel.open').forEach(p => p.classList.remove('open'));
    if (!isOpen) { panel.classList.add('open'); renderList(''); }
  });
  panel.addEventListener('click', e => e.stopPropagation());
}

// ── Export: CSV ────────────────────────────────────────────────
function _exportRoomsCSV(rooms) {
  if (!rooms.length) { Toast.warning('No rooms to export.'); return; }
  const institutes = AppState.get('institutes') || [];
  const campuses   = AppState.get('campuses')   || [];

  const header = ['Room Name','Code','Floor','Capacity','Chairs','Multimedia','Computers','AC','Availability','Unavailable From','Unavailable To','Institute','Campus'];
  const rows = rooms.map(r => {
    const inst      = institutes.find(i => i.id === r.institute);
    const camp      = campuses.find(c => c.id === r.campus);
    const esc       = v => `"${String(v ?? '').replace(/"/g,'""')}"`;
    const effStatus = _resolveAvailability(r);
    const av        = r.availability || {};
    return [
      esc(r.name), esc(r.code), esc(r.floor),
      r.capacity, r.chairs,
      r.multimedia ? 'Yes' : 'No',
      r.computers,
      r.ac ? 'Yes' : 'No',
      effStatus === 'available' ? 'Available' : 'Unavailable',
      esc(av.startDate || ''),
      esc(av.endDate   || ''),
      esc(inst?.instituteName || r.institute || ''),
      esc(camp?.campusName    || r.campus    || ''),
    ].join(',');
  });

  const csv  = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'Rooms_Export.csv' });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  Toast.success(`${rooms.length} room(s) exported to CSV.`);
}

// ── Export: PDF (print window) ─────────────────────────────────
function _exportRoomsPDF(rooms) {
  if (!rooms.length) { Toast.warning('No rooms to export.'); return; }
  const institutes = AppState.get('institutes') || [];
  const campuses   = AppState.get('campuses')   || [];

  // Group by campus for display
  const grouped = {};
  rooms.forEach(r => {
    const inst     = institutes.find(i => i.id === r.institute);
    const camp     = campuses.find(c => c.id === r.campus);
    const instName = inst?.instituteName || r.institute || '—';
    const campName = camp?.campusName    || r.campus    || '—';
    const key = `${instName} — ${campName}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  });

  const now     = new Date();
  const dateStr = now.toLocaleDateString('en-PK', { day:'2-digit', month:'short', year:'numeric' });
  const timeStr = now.toLocaleTimeString('en-PK', { hour:'2-digit', minute:'2-digit' });

  let bodyRows = '';
  let rowIdx   = 0;
  Object.entries(grouped).forEach(([group, list]) => {
    bodyRows += `<tr style="background:#eff6ff"><td colspan="9" style="padding:7px 10px;font-size:10.5px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #e2e8f0">${group}</td></tr>`;
    list.forEach(r => {
      const bg        = rowIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
      const effStatus = _resolveAvailability(r);
      const av        = r.availability || {};
      const availLabel = effStatus === 'available'
        ? '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:#d1fae5;color:#065f46">✓ Available</span>'
        : (() => {
            let detail = '';
            if (av.startDate || av.endDate) detail = `<div style="font-size:9px;color:#6b7280;margin-top:2px">${av.startDate || ''}${av.endDate && av.endDate !== av.startDate ? ' → ' + av.endDate : ''}</div>`;
            return `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:#fee2e2;color:#991b1b">✗ Unavailable</span>${detail}`;
          })();
      rowIdx++;
      bodyRows += `<tr style="background:${bg}">
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#111">${r.name}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;font-family:monospace;color:#374151">${r.code}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#111">${r.floor}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:12px;color:#111">${r.capacity}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:12px;color:#111">${r.chairs}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center">
          <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;
            ${r.multimedia ? 'background:#d1fae5;color:#065f46' : 'background:#f3f4f6;color:#6b7280'}">
            ${r.multimedia ? '✓ Yes' : '— No'}
          </span>
        </td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:12px;color:#111">${r.computers > 0 ? r.computers : '—'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center">
          <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;
            ${r.ac ? 'background:#d1fae5;color:#065f46' : 'background:#f3f4f6;color:#6b7280'}">
            ${r.ac ? '✓ Yes' : '— No'}
          </span>
        </td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center">${availLabel}</td>
      </tr>`;
    });
  });

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Rooms Export</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,sans-serif;font-size:13px;color:#111827;background:#fff;padding:28px}
    .header{border-bottom:2px solid #2563eb;padding-bottom:14px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:flex-start}
    .title{font-size:20px;font-weight:700;color:#111827}
    .subtitle{font-size:12px;color:#6b7280;margin-top:3px}
    .meta{text-align:right;font-size:11px;color:#6b7280}
    .stat-row{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap}
    .stat{flex:1;min-width:100px;padding:10px 12px;border-radius:8px;background:#eff6ff;border-left:3px solid #2563eb}
    .stat .num{font-size:20px;font-weight:700;color:#2563eb}
    .stat .lbl{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;font-weight:600}
    table{width:100%;border-collapse:collapse;font-size:12px}
    thead tr{background:#f1f5f9}
    th{padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;font-weight:600;border-bottom:2px solid #e2e8f0}
    .footer{margin-top:20px;font-size:10px;color:#9ca3af;text-align:right;border-top:1px solid #e5e7eb;padding-top:10px;display:flex;justify-content:space-between}
    @media print{body{padding:16px}@page{size:A4 landscape;margin:10mm}.no-print{display:none}}
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">Rooms Report</div>
      <div class="subtitle">Rooms, Floors &amp; Facilities</div>
    </div>
    <div class="meta">
      <div>${dateStr}</div>
      <div>${timeStr}</div>
    </div>
  </div>
  <div class="stat-row">
    <div class="stat" style="border-left-color:#2563eb;background:#eff6ff">
      <div class="num" style="color:#2563eb">${rooms.filter(r=>/room/i.test(r.name||'')).length}</div>
      <div class="lbl" style="color:#2563eb">Total Rooms</div>
    </div>
    <div class="stat" style="border-left-color:#059669;background:#ecfdf5">
      <div class="num" style="color:#059669">${rooms.filter(r=>/L\d+/i.test(r.code||'')).length}</div>
      <div class="lbl" style="color:#059669">Labs</div>
      <div style="font-size:10px;color:#6b7280;margin-top:2px">(code: L1, L2, L3…)</div>
    </div>
    <div class="stat" style="border-left-color:#8b5cf6;background:#f5f3ff">
      <div class="num" style="color:#8b5cf6">${rooms.filter(r=>(r.computers||0)>0).length}</div>
      <div class="lbl" style="color:#8b5cf6">With Lab</div>
      <div style="font-size:11px;color:#8b5cf6;font-weight:700;margin-top:3px">${rooms.filter(r=>(r.computers||0)>0).reduce((s,r)=>s+(r.computers||0),0)} computers</div>
    </div>
    <div class="stat" style="border-left-color:#64748b;background:#f8fafc">
      <div class="num" style="color:#64748b">${rooms.filter(r=>!(r.computers>0)).length}</div>
      <div class="lbl" style="color:#64748b">Without Lab</div>
    </div>
    <div class="stat" style="border-left-color:#f59e0b;background:#fffbeb">
      <div class="num" style="color:#f59e0b">${rooms.filter(r=>r.multimedia).length}</div>
      <div class="lbl" style="color:#f59e0b">Multimedia</div>
    </div>
    <div class="stat" style="border-left-color:#06b6d4;background:#ecfeff">
      <div class="num" style="color:#06b6d4">${rooms.filter(r=>r.ac).length}</div>
      <div class="lbl" style="color:#06b6d4">AC Rooms</div>
    </div>
    <div class="stat" style="border-left-color:#ef4444;background:#fef2f2">
      <div class="num" style="color:#ef4444">${rooms.filter(r=>_resolveAvailability(r)==='unavailable').length}</div>
      <div class="lbl" style="color:#ef4444">Unavailable</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Room Name</th><th>Code</th><th>Floor</th>
        <th style="text-align:center">Capacity</th><th style="text-align:center">Chairs</th>
        <th style="text-align:center">Multimedia</th><th style="text-align:center">Computers</th><th style="text-align:center">AC</th>
        <th style="text-align:center">Availability</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <div class="footer">
    <span>Rooms Export · ${dateStr} at ${timeStr}</span>
    <span>Total: ${rooms.length} room${rooms.length !== 1 ? 's' : ''}</span>
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
}

// ── Inline row edit ────────────────────────────────────────────
function _startInlineEdit(btn, room) {
  const tr = btn.closest('tr');
  if (!tr || tr.classList.contains('rm-row-editing')) return;

  const floors = room._floors || [room.floor];
  const floorOpts = floors.map(f =>
    `<option value="${f}" ${f === room.floor ? 'selected' : ''}>${f}</option>`
  ).join('');

  // Current availability
  const av        = room.availability || { status: 'available', startDate: '', endDate: '' };
  const effStatus = _resolveAvailability(room);
  const isUnavail = effStatus === 'unavailable';

  // Save original cell HTML for cancel
  const cells = {
    name:    tr.querySelector('.rm-td-name').innerHTML,
    code:    tr.querySelector('.rm-td-code').innerHTML,
    floor:   tr.querySelector('.rm-td-floor').innerHTML,
    cap:     tr.querySelector('.rm-td-cap').innerHTML,
    chairs:  tr.querySelector('.rm-td-chairs').innerHTML,
    multi:   tr.querySelector('.rm-td-multi').innerHTML,
    comp:    tr.querySelector('.rm-td-comp').innerHTML,
    ac:      tr.querySelector('.rm-td-ac').innerHTML,
    avail:   tr.querySelector('.rm-td-avail').innerHTML,
  };

  tr.classList.add('rm-row-editing');

  // Replace cells with inputs
  tr.querySelector('.rm-td-name').innerHTML   = `<input class="rm-inline-input" value="${room.name}" placeholder="Room Name" />`;
  tr.querySelector('.rm-td-code').innerHTML   = `<input class="rm-inline-input" value="${room.code}" placeholder="Code" style="font-family:var(--font-mono)" />`;
  tr.querySelector('.rm-td-floor').innerHTML  = `<select class="rm-inline-select">${floorOpts}</select>`;
  tr.querySelector('.rm-td-cap').innerHTML    = `<input class="rm-inline-input" type="number" min="1" value="${room.capacity}" placeholder="0" />`;
  tr.querySelector('.rm-td-chairs').innerHTML = `<input class="rm-inline-input" type="number" min="0" value="${room.chairs}" placeholder="0" />`;
  tr.querySelector('.rm-td-multi').innerHTML  = `<input class="rm-inline-check" type="checkbox" ${room.multimedia ? 'checked' : ''} />`;
  tr.querySelector('.rm-td-comp').innerHTML   = `<input class="rm-inline-input" type="number" min="0" value="${room.computers}" placeholder="0" />`;
  tr.querySelector('.rm-td-ac').innerHTML     = `<input class="rm-inline-check" type="checkbox" ${room.ac ? 'checked' : ''} />`;

  // Availability cell
  tr.querySelector('.rm-td-avail').innerHTML = `
    <div class="rm-avail-edit-wrap">
      <div class="rm-avail-radios">
        <label class="rm-avail-radio">
          <input type="radio" name="rm-avail-${room.id}" value="available" ${!isUnavail ? 'checked' : ''}> Available
        </label>
        <label class="rm-avail-radio">
          <input type="radio" name="rm-avail-${room.id}" value="unavailable" ${isUnavail ? 'checked' : ''}> Unavailable
        </label>
      </div>
      <div class="rm-avail-dates" id="rmAvailDates-${room.id}" style="display:${isUnavail ? 'flex' : 'none'}">
        <input type="date" id="rmAvailStart-${room.id}" value="${av.startDate || ''}" title="Start date" />
        <span style="font-size:11px;color:var(--t3)">to</span>
        <input type="date" id="rmAvailEnd-${room.id}"   value="${av.endDate   || ''}" title="End date (blank = same as start)" />
      </div>
      <div class="rm-avail-hint" id="rmAvailHint-${room.id}"></div>
    </div>
  `;

  // Show/hide date fields on radio change
  const availCell  = tr.querySelector('.rm-td-avail');
  const datesWrap  = availCell.querySelector(`#rmAvailDates-${room.id}`);
  const hintEl     = availCell.querySelector(`#rmAvailHint-${room.id}`);
  const startInput = availCell.querySelector(`#rmAvailStart-${room.id}`);
  const endInput   = availCell.querySelector(`#rmAvailEnd-${room.id}`);

  function _updateHint() {
    const sel = availCell.querySelector(`input[name="rm-avail-${room.id}"]:checked`)?.value;
    if (sel !== 'unavailable') { hintEl.textContent = ''; return; }
    const s = startInput.value;
    const e = endInput.value;
    if (!s && !e) { hintEl.textContent = 'Manually unavailable (no auto-restore)'; return; }
    if (s && !e)  { hintEl.textContent = `Unavailable on ${s} only`; return; }
    if (s && e)   { hintEl.textContent = `Unavailable ${s} → ${e}`; return; }
  }

  availCell.querySelectorAll(`input[name="rm-avail-${room.id}"]`).forEach(radio => {
    radio.addEventListener('change', () => {
      datesWrap.style.display = radio.value === 'unavailable' ? 'flex' : 'none';
      _updateHint();
    });
  });
  startInput.addEventListener('change', _updateHint);
  endInput.addEventListener('change',   _updateHint);
  _updateHint();

  // Replace action buttons with Save + Cancel
  const actionsDiv = tr.querySelector('[data-view-actions]');
  actionsDiv.innerHTML = `
    <button class="rm-icon-btn save" data-action="inline-save" title="Save changes">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
    </button>
    <button class="rm-icon-btn cancel-edit" data-action="inline-cancel" title="Cancel">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;

  // Focus first input
  tr.querySelector('.rm-inline-input')?.focus();

  // Save handler
  actionsDiv.querySelector('[data-action="inline-save"]').addEventListener('click', () => {
    const name     = tr.querySelector('.rm-td-name input').value.trim();
    const code     = tr.querySelector('.rm-td-code input').value.trim();
    const floor    = tr.querySelector('.rm-td-floor select').value;
    const capacity = parseInt(tr.querySelector('.rm-td-cap input').value)    || 0;
    const chairs   = parseInt(tr.querySelector('.rm-td-chairs input').value)  || 0;
    const multimedia = tr.querySelector('.rm-td-multi input').checked;
    const computers  = parseInt(tr.querySelector('.rm-td-comp input').value) || 0;
    const ac         = tr.querySelector('.rm-td-ac input').checked;

    if (!name) { Toast.warning('Room name is required.'); return; }
    if (!code) { Toast.warning('Room code is required.'); return; }
    if (!floor){ Toast.warning('Please select a floor.'); return; }

    // Availability
    const availStatus = availCell.querySelector(`input[name="rm-avail-${room.id}"]:checked`)?.value || 'available';
    let   startDate   = startInput.value || '';
    let   endDate     = endInput.value   || '';
    // If start set but end blank → end = start (same day)
    if (availStatus === 'unavailable' && startDate && !endDate) endDate = startDate;

    const availability = { status: availStatus, startDate, endDate };

    const allRooms = getRooms();
    const idx = allRooms.findIndex(r => r.id === room.id);
    if (idx !== -1) {
      allRooms[idx] = { ...allRooms[idx], name, code, floor, capacity, chairs, multimedia, computers, ac, availability };
      saveRooms(allRooms);
    }

    _refreshTable();
    Toast.success('Room updated successfully.');
  });

  // Cancel handler
  actionsDiv.querySelector('[data-action="inline-cancel"]').addEventListener('click', () => {
    tr.classList.remove('rm-row-editing');
    tr.querySelector('.rm-td-name').innerHTML   = cells.name;
    tr.querySelector('.rm-td-code').innerHTML   = cells.code;
    tr.querySelector('.rm-td-floor').innerHTML  = cells.floor;
    tr.querySelector('.rm-td-cap').innerHTML    = cells.cap;
    tr.querySelector('.rm-td-chairs').innerHTML = cells.chairs;
    tr.querySelector('.rm-td-multi').innerHTML  = cells.multi;
    tr.querySelector('.rm-td-comp').innerHTML   = cells.comp;
    tr.querySelector('.rm-td-ac').innerHTML     = cells.ac;
    tr.querySelector('.rm-td-avail').innerHTML  = cells.avail;
    actionsDiv.innerHTML = `
      <button class="rm-icon-btn" data-action="inline-edit" data-id="${room.id}" title="Quick Edit Row"
        data-floors='${JSON.stringify(floors)}'>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="rm-icon-btn del" data-action="delete" data-id="${room.id}" title="Delete">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    `;
    actionsDiv.removeAttribute('data-view-actions');
    actionsDiv.setAttribute('data-view-actions', '');
  });
}

// ── Tiny ID helper ─────────────────────────────────────────────
function _uid() {
  return 'rm_' + Math.random().toString(36).slice(2, 9);
}
// ── Availability resolver ──────────────────────────────────────
// Returns effective status: if endDate is set and < today → 'available'
// If both dates blank → respect manual status
// Default (no avail field) → 'available'
function _resolveAvailability(room) {
  const av = room.availability;
  if (!av) return 'available';
  const today = new Date().toISOString().slice(0, 10);
  if (av.endDate && av.endDate < today) return 'available';
  return av.status || 'available';
}

// Apply auto-expiry and persist if anything changed
function _applyAvailabilityExpiry() {
  const rooms = getRooms();
  const today = new Date().toISOString().slice(0, 10);
  let changed = false;
  rooms.forEach(r => {
    if (!r.availability) return;
    if (r.availability.endDate && r.availability.endDate < today && r.availability.status === 'unavailable') {
      r.availability.status = 'available';
      changed = true;
    }
  });
  if (changed) saveRooms(rooms);
  return rooms;
}
