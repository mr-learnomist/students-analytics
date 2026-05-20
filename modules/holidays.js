// ============================================================
// modules/holidays.js — Public Holidays Module (CRUD)
// Fields: id, name, date, type, scope, campusId
// scope:  'global' | 'campus'
//   global   → applies to ALL campuses (campusId = null)
//   campus   → applies to ONE campus   (campusId = <id>)
// Types: public | religious | national | institutional | other
// Features: CSV import / export / sample download
// Campus-aware: generation & reschedule filter by campusId
// ============================================================

import { AppState, generateID } from '../utils/state.js';
import { Modal, Table, Form, injectUIStyles } from '../utils/ui.js';
import { Toast } from '../utils/helpers.js';

const KEY = 'holidays';

const HOLIDAY_TYPES  = ['public', 'religious', 'national', 'institutional', 'other'];
const HOLIDAY_SCOPES = ['global', 'campus'];

const TYPE_COLORS = {
  public:        { bg: 'rgba(79,133,247,0.12)',  color: '#4f85f7'  },
  religious:     { bg: 'rgba(139,92,246,0.12)',  color: '#8b5cf6'  },
  national:      { bg: 'rgba(16,185,129,0.12)',  color: '#10b981'  },
  institutional: { bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b'  },
  other:         { bg: 'rgba(136,146,180,0.12)', color: '#8892b4'  },
};

const RULES = {
  name: { required: true, minLen: 2, message: 'Holiday name must be at least 2 characters.' },
  date: { required: true,            message: 'Please select a date.'                       },
  type: { required: true,            message: 'Please select a holiday type.'               },
};

// ── Campus / Institute helpers ────────────────────────────────
function getCampuses() {
  return AppState.get('campuses') || [];
}

function getInstitutes() {
  return AppState.get('institutes') || [];
}

// Returns display name for a single campusId
function campusName(campusId) {
  if (!campusId) return '—';
  const c = getCampuses().find(c => c.id === campusId);
  return c ? (c.campusName || c.name || c.code || campusId) : campusId;
}

// Returns campuses filtered by instituteId (or all if none given)
function getCampusesByInstitute(instituteId) {
  const all = getCampuses();
  if (!instituteId) return all;
  return all.filter(c => c.instituteId === instituteId);
}

// ── Helpers ───────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric', weekday: 'short' });
}

function typeBadge(type) {
  const c = TYPE_COLORS[type] || TYPE_COLORS.other;
  const label = type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Other';
  return `<span style="display:inline-flex;align-items:center;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${c.bg};color:${c.color}">${label}</span>`;
}

function scopeBadge(scope, campusIds) {
  // Support both old single campusId (string) and new campusIds (array)
  const ids = Array.isArray(campusIds) ? campusIds : (campusIds ? [campusIds] : []);

  if (scope === 'campus' && ids.length) {
    const names = ids.map(id => campusName(id)).join(', ');
    const label = ids.length > 2
      ? `${ids.length} Campuses`
      : names;
    return `<span style="display:inline-flex;align-items:center;gap:5px;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;background:rgba(245,158,11,0.12);color:#f59e0b" title="${names}">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
      ${label}
    </span>`;
  }
  return `<span style="display:inline-flex;align-items:center;gap:5px;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;background:rgba(16,185,129,0.12);color:#10b981">
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
    Global
  </span>`;
}

function typeOptions(selected = '') {
  return HOLIDAY_TYPES.map(t =>
    `<option value="${t}" ${t === selected ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`
  ).join('');
}

function instituteOptions(selectedId = '') {
  const institutes = getInstitutes();
  if (!institutes.length) return '<option value="">No institutes found</option>';
  return institutes.map(i =>
    `<option value="${i.id}" ${i.id === selectedId ? 'selected' : ''}>${i.instituteName}</option>`
  ).join('');
}

function campusCheckboxes(selectedIds = [], instituteId = '') {
  const campuses = getCampusesByInstitute(instituteId);
  if (!campuses.length) {
    return `<p style="font-size:12px;color:var(--t3);margin:6px 0 0">
      ${instituteId ? 'No campuses found for this institute.' : 'Select an institute first.'}
    </p>`;
  }
  return campuses.map(c => {
    const checked = selectedIds.includes(c.id) ? 'checked' : '';
    return `<label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;font-size:13px;color:var(--t1)">
      <input type="checkbox" name="campusIds" value="${c.id}" ${checked}
             style="width:15px;height:15px;accent-color:var(--blue);cursor:pointer;flex-shrink:0"/>
      <span>${c.campusName || c.name || c.code}</span>
    </label>`;
  }).join('');
}

// ── CSV helpers ───────────────────────────────────────────────
function parseCSVLine(line) {
  const parts = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { parts.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  parts.push(cur.trim());
  return parts.map(p => p.replace(/^"|"$/g, '').trim());
}

function isValidDate(str) {
  if (!str) return false;
  const d = new Date(str + 'T00:00:00');
  return !isNaN(d.getTime());
}

// ── Public utility: get holidays applicable to a campusId ─────
// Returns holidays that apply to this campus:
//   - All global holidays (scope = 'global' or scope missing)
//   - Campus-specific holidays where campusId matches
// Usage in lecturePlanService.js:
//   import { getHolidaysForCampus } from '../holidays.js';
//   const holidays = getHolidaysForCampus(batch.campusId).map(h => h.date);
export function getHolidaysForCampus(campusId = null) {
  const all = AppState.get(KEY) || [];
  return all.filter(h => {
    if (!h.scope || h.scope === 'global') return true;
    if (h.scope === 'campus') {
      // Support both old campusId (string) and new campusIds (array)
      const ids = Array.isArray(h.campusIds) ? h.campusIds : (h.campusId ? [h.campusId] : []);
      return ids.includes(campusId);
    }
    return true;
  });
}

// ── Module ────────────────────────────────────────────────────
export const HolidaysModule = {

  mount(container) {
    injectUIStyles();
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    el.innerHTML = this._pageTemplate();
    this._render(el);
    this._attachToolbar(el);
  },

  // ── Render table ────────────────────────────────────────────
  _render(container, filter = '', typeFilter = '', campusFilter = '') {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    let all = (AppState.get(KEY) || []).sort((a, b) => a.date.localeCompare(b.date));

    if (typeFilter) all = all.filter(h => h.type === typeFilter);
    if (campusFilter === '__global__') {
      all = all.filter(h => !h.scope || h.scope === 'global');
    } else if (campusFilter) {
      all = all.filter(h => {
        if (h.scope !== 'campus') return false;
        const ids = Array.isArray(h.campusIds) ? h.campusIds : (h.campusId ? [h.campusId] : []);
        return ids.includes(campusFilter);
      });
    }
    if (filter) all = all.filter(h => {
      const ids = Array.isArray(h.campusIds) ? h.campusIds : (h.campusId ? [h.campusId] : []);
      const campusNames = ids.map(campusName).join(' ').toLowerCase();
      return (
        (h.name || '').toLowerCase().includes(filter) ||
        (h.date || '').includes(filter) ||
        (h.type || '').toLowerCase().includes(filter) ||
        campusNames.includes(filter)
      );
    });

    const countEl = el.querySelector('.record-count');
    if (countEl) countEl.textContent = `${all.length} holiday${all.length !== 1 ? 's' : ''}`;

    Table.render(el.querySelector('#holidays-table'), {
      columns: [
        { key: 'date', label: 'Date', width: '180px',
          render: (val) => `<span style="font-family:var(--font-mono);font-size:12px;color:var(--t1)">${formatDate(val)}</span>` },
        { key: 'name', label: 'Holiday Name',
          render: (val) => `<span style="font-weight:600;color:var(--t1)">${val}</span>` },
        { key: 'type', label: 'Type', width: '140px',
          render: (val) => typeBadge(val) },
        { key: 'scope', label: 'Scope / Campus', width: '180px',
          render: (val, row) => {
            const ids = Array.isArray(row.campusIds) ? row.campusIds : (row.campusId ? [row.campusId] : []);
            return scopeBadge(row.scope, ids);
          } },
      ],
      rows: all,
      emptyMsg: 'No holidays configured. Add your first holiday or import from CSV.',
      actions: [
        {
          label: 'Edit',
          icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
          handler: (row) => this._openForm(row, el)
        },
        {
          label: 'Delete', danger: true,
          icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>`,
          handler: (row) => this._delete(row, el)
        },
      ],
    });
  },

  // ── Add / Edit form ─────────────────────────────────────────
  _openForm(existing = null, container) {
    const isEdit      = !!existing;
    const initScope   = existing?.scope || 'global';
    // Support both old campusId (string) and new campusIds (array)
    const initCampusIds = Array.isArray(existing?.campusIds)
      ? existing.campusIds
      : (existing?.campusId ? [existing.campusId] : []);

    // Determine institute from first selected campus (for edit mode)
    let initInstituteId = '';
    if (initCampusIds.length) {
      const firstCampus = getCampuses().find(c => c.id === initCampusIds[0]);
      initInstituteId = firstCampus?.instituteId || '';
    }

    Modal.open({
      title: isEdit ? 'Edit Holiday' : 'Add Holiday',
      body: `
        <div class="form-group">
          <label class="form-label">Holiday Name <span class="req">*</span></label>
          <input name="name" class="form-input" placeholder="e.g. Independence Day"
                 value="${existing?.name || ''}"/>
        </div>
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Date <span class="req">*</span></label>
            <input name="date" class="form-input" type="date"
                   value="${existing?.date || ''}"/>
          </div>
          <div class="form-group">
            <label class="form-label">Type <span class="req">*</span></label>
            <select name="type" class="form-select form-input">
              <option value="">Select type…</option>
              ${typeOptions(existing?.type || '')}
            </select>
          </div>
        </div>

        <div class="form-group" style="margin-top:4px">
          <label class="form-label">Scope <span class="req">*</span></label>
          <select name="scope" id="holScopeSelect" class="form-select form-input">
            <option value="global" ${initScope === 'global' ? 'selected' : ''}>🌐 Global — all campuses</option>
            <option value="campus" ${initScope === 'campus' ? 'selected' : ''}>🏫 Campus-specific</option>
          </select>
        </div>

        <div id="holCampusGroup" style="display:${initScope === 'campus' ? 'block' : 'none'};
             border:1px solid var(--border);border-radius:var(--r-sm);padding:14px;margin-top:4px;background:var(--surface2)">

          <div class="form-row cols-2" style="margin-bottom:10px">
            <div class="form-group" style="margin:0">
              <label class="form-label">Institute <span class="req">*</span></label>
              <select id="holInstituteSelect" class="form-select form-input">
                <option value="">Select institute…</option>
                ${instituteOptions(initInstituteId)}
              </select>
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label" style="display:flex;align-items:center;justify-content:space-between">
                <span>Campuses <span class="req">*</span></span>
                <span id="holCampusCount" style="font-size:11px;font-weight:400;color:var(--t3)">0 selected</span>
              </label>
              <div id="holCampusCheckboxes"
                   style="border:1px solid var(--border);border-radius:var(--r-sm);padding:6px 10px;
                          min-height:38px;max-height:140px;overflow-y:auto;background:var(--surface1)">
                ${campusCheckboxes(initCampusIds, initInstituteId)}
              </div>
            </div>
          </div>

          <p style="margin:0;font-size:11.5px;color:var(--t3)">
            💡 Select institute first, then tick one or more campuses.
          </p>
        </div>
      `,
      onOpen: (modalEl) => {
        const scopeSel      = modalEl.querySelector('#holScopeSelect');
        const campusGroup   = modalEl.querySelector('#holCampusGroup');
        const instituteSel  = modalEl.querySelector('#holInstituteSelect');
        const checkboxWrap  = modalEl.querySelector('#holCampusCheckboxes');
        const countEl       = modalEl.querySelector('#holCampusCount');

        const updateCount = () => {
          const checked = checkboxWrap.querySelectorAll('input[type=checkbox]:checked').length;
          countEl.textContent = `${checked} selected`;
          countEl.style.color = checked ? 'var(--blue)' : 'var(--t3)';
        };

        const refreshCheckboxes = (instituteId, selectedIds = []) => {
          checkboxWrap.innerHTML = campusCheckboxes(selectedIds, instituteId);
          checkboxWrap.querySelectorAll('input[type=checkbox]').forEach(cb => {
            cb.addEventListener('change', updateCount);
          });
          updateCount();
        };

        // Initial count for edit mode
        updateCount();
        checkboxWrap.querySelectorAll('input[type=checkbox]').forEach(cb => {
          cb.addEventListener('change', updateCount);
        });

        instituteSel.addEventListener('change', () => {
          refreshCheckboxes(instituteSel.value);
        });

        scopeSel.addEventListener('change', () => {
          const isCampus = scopeSel.value === 'campus';
          campusGroup.style.display = isCampus ? 'block' : 'none';
          if (!isCampus) {
            instituteSel.value = '';
            refreshCheckboxes('');
          }
        });
      },
      actions: [
        { label: 'Cancel', variant: 'ghost', close: true },
        {
          label: isEdit ? 'Save Changes' : 'Add Holiday',
          variant: 'primary',
          close: false,
          handler: (modalEl) => {
            const { valid } = Form.validate(modalEl.querySelector('.modal-body'), RULES);
            if (!valid) return;
            const data = Form.collect(modalEl.querySelector('.modal-body'));

            // Collect campusIds from checkboxes
            const checkedBoxes = modalEl.querySelectorAll('input[name="campusIds"]:checked');
            const campusIds = Array.from(checkedBoxes).map(cb => cb.value);

            if (data.scope === 'campus') {
              if (!modalEl.querySelector('#holInstituteSelect')?.value) {
                Toast.error('Please select an institute.');
                return;
              }
              if (!campusIds.length) {
                Toast.error('Please select at least one campus.');
                return;
              }
            }

            // Build final record
            const record = {
              name:      data.name,
              date:      data.date,
              type:      data.type,
              scope:     data.scope,
              campusIds: data.scope === 'campus' ? campusIds : [],
              campusId:  null, // legacy field cleared
            };

            // Duplicate check per date+scope+campusIds overlap
            const all = AppState.get(KEY) || [];
            if (data.scope === 'campus') {
              const clash = all.find(h =>
                h.date === record.date &&
                h.id !== existing?.id &&
                h.scope === 'campus' &&
                (Array.isArray(h.campusIds) ? h.campusIds : (h.campusId ? [h.campusId] : []))
                  .some(id => campusIds.includes(id))
              );
              if (clash) {
                Toast.error(`A campus holiday already exists on ${formatDate(record.date)}: "${clash.name}".`);
                return;
              }
            } else {
              const clash = all.find(h =>
                h.date === record.date && h.id !== existing?.id && (!h.scope || h.scope === 'global')
              );
              if (clash) {
                Toast.error(`A global holiday already exists on ${formatDate(record.date)}: "${clash.name}".`);
                return;
              }
            }

            if (isEdit) {
              AppState.update(KEY, existing.id, record);
              Toast.success(`Holiday "${record.name}" updated.`);
            } else {
              AppState.add(KEY, { ...record, id: generateID('hol') });
              Toast.success(`Holiday "${record.name}" added.`);
            }
            Modal.closeAll();
            this._render(container);
          }
        }
      ]
    });
  },

  // ── Delete ───────────────────────────────────────────────────
  async _delete(row, container) {
    const ok = await Modal.confirm({
      title: 'Delete Holiday',
      message: `Delete <strong>${row.name}</strong> (${formatDate(row.date)})? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    AppState.remove(KEY, row.id);
    Toast.success(`Holiday "${row.name}" deleted.`);
    this._render(container);
  },

  // ── CSV Export ───────────────────────────────────────────────
  _exportCSV(container) {
    const all = (AppState.get(KEY) || []).sort((a, b) => a.date.localeCompare(b.date));
    if (!all.length) { Toast.error('No holidays to export.'); return; }

    const headers = ['name', 'date', 'type', 'scope', 'campusIds'];
    const rows = all.map(h => {
      const ids = Array.isArray(h.campusIds) ? h.campusIds : (h.campusId ? [h.campusId] : []);
      return [h.name, h.date, h.type, h.scope || 'global', ids.join('|')]
        .map(v => `"${String(v || '').replace(/"/g, '""')}"`)
        .join(',');
    });

    const csv  = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url,
      download: `holidays_${new Date().toISOString().slice(0, 10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
    Toast.success(`Exported ${all.length} holidays.`);
  },

  // ── CSV Sample Download ──────────────────────────────────────
  _downloadSample() {
    const csv = [
      'name,date,type,scope,campusIds',
      'Pakistan Day,2025-03-23,national,global,',
      'Eid ul Fitr,2025-03-31,religious,global,',
      'Labour Day,2025-05-01,public,global,',
      'Eid ul Adha,2025-06-07,religious,global,',
      'Independence Day,2025-08-14,national,global,',
      'Quaid-e-Azam Day,2025-12-25,national,global,',
      'Winter Break,2025-12-24,institutional,global,',
      'Campus Founder Day,2025-11-10,institutional,campus,<campusId1>|<campusId2>',
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url,
      download: 'holidays_sample.csv',
    });
    a.click();
    URL.revokeObjectURL(url);
    Toast.success('Sample CSV downloaded.');
  },

  // ── CSV Import ───────────────────────────────────────────────
  _openImportModal(container) {
    let parsedData = null;
    let _mid;

    _mid = Modal.open({
      title: 'Import Holidays from CSV',
      size: 'lg',
      body: `
        <div style="margin-bottom:14px;padding:12px;background:var(--blue-dim);border:1px solid rgba(79,133,247,0.2);border-radius:var(--r-sm)">
          <p style="font-size:12.5px;color:var(--blue);margin:0;line-height:1.6">
            <strong>Required columns:</strong> <code style="font-family:var(--font-mono)">name, date, type</code><br/>
            <strong>Optional columns:</strong> <code style="font-family:var(--font-mono)">scope (global/campus), campusId</code><br/>
            <strong>Date format:</strong> YYYY-MM-DD &nbsp;|&nbsp;
            <strong>Type values:</strong> public, religious, national, institutional, other
          </p>
        </div>

        <div id="holDropZone" style="padding:24px 20px;border:2px dashed var(--border2);border-radius:var(--r-sm);
             text-align:center;cursor:pointer;transition:border .15s">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
               style="color:var(--t3);margin-bottom:8px">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <p style="font-size:13px;font-weight:600;color:var(--t1);margin:0 0 4px">Drop CSV file here or click to browse</p>
          <span style="font-size:12px;color:var(--t3)">Only .csv files accepted</span>
          <input type="file" id="holCsvInput" accept=".csv" style="display:none"/>
        </div>

        <div id="holImportResult" style="margin-top:14px"></div>
      `,
      actions: [
        { label: 'Cancel', variant: 'ghost', close: true },
        {
          label: 'Import Holidays',
          variant: 'primary',
          close: false,
          handler: () => {
            if (!parsedData?.valid?.length) {
              Toast.error('No valid rows to import.');
              return;
            }
            let added = 0;
            const existing = AppState.get(KEY) || [];
            parsedData.valid.forEach(h => {
              const dup = existing.find(e => {
                if (e.date !== h.date) return false;
                if ((e.scope || 'global') !== (h.scope || 'global')) return false;
                if (h.scope === 'campus') {
                  const eIds = Array.isArray(e.campusIds) ? e.campusIds : (e.campusId ? [e.campusId] : []);
                  return h.campusIds.some(id => eIds.includes(id));
                }
                return true;
              });
              if (!dup) {
                AppState.add(KEY, { ...h, id: generateID('hol') });
                added++;
              }
            });
            Modal.close(_mid);
            this._render(container);
            Toast.success(`${added} holiday${added !== 1 ? 's' : ''} imported${parsedData.valid.length - added > 0 ? `, ${parsedData.valid.length - added} duplicate(s) skipped` : ''}.`);
          }
        }
      ],
      onOpen: (modalEl) => {
        const dropZone = modalEl.querySelector('#holDropZone');
        const csvInput = modalEl.querySelector('#holCsvInput');
        const resultEl = modalEl.querySelector('#holImportResult');

        dropZone.addEventListener('click', () => csvInput.click());
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--blue)'; });
        dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = ''; });
        dropZone.addEventListener('drop', (e) => {
          e.preventDefault(); dropZone.style.borderColor = '';
          if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
        });
        csvInput.addEventListener('change', () => {
          if (csvInput.files[0]) processFile(csvInput.files[0]);
        });

        const processFile = (file) => {
          if (!file.name.endsWith('.csv')) { Toast.error('Please select a .csv file.'); return; }
          const reader = new FileReader();
          reader.onload = (e) => {
            parsedData = this._parseCSV(e.target.result);
            this._renderImportPreview(resultEl, parsedData);
          };
          reader.readAsText(file);
        };
      }
    });
  },

  // ── Parse CSV ────────────────────────────────────────────────
  _parseCSV(text) {
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return { valid: [], errors: ['CSV file is empty or has no data rows.'] };

    const headers   = parseCSVLine(lines[0]).map(h => h.toLowerCase());
    const nameIdx    = headers.indexOf('name');
    const dateIdx    = headers.indexOf('date');
    const typeIdx    = headers.indexOf('type');
    const scopeIdx   = headers.indexOf('scope');
    const campusIdx  = headers.indexOf('campusids'); // new array column
    const campusIdx1 = headers.indexOf('campusid');  // legacy single column

    if (nameIdx === -1 || dateIdx === -1) {
      return { valid: [], errors: ['Missing required columns: "name" and "date" are required.'] };
    }

    const valid  = [];
    const errors = [];

    lines.slice(1).forEach((line, i) => {
      const rowNum   = i + 2;
      const cols     = parseCSVLine(line);
      const name     = cols[nameIdx]   || '';
      const date     = cols[dateIdx]   || '';
      const type     = typeIdx   !== -1 ? (cols[typeIdx]   || '').toLowerCase() : 'public';
      const scope    = scopeIdx  !== -1 ? (cols[scopeIdx]  || '').toLowerCase() : 'global';
      // Support new campusIds (pipe-separated) or legacy campusId
      let campusIds = [];
      if (campusIdx !== -1 && cols[campusIdx]) {
        campusIds = cols[campusIdx].split('|').map(s => s.trim()).filter(Boolean);
      } else if (campusIdx1 !== -1 && cols[campusIdx1]) {
        campusIds = [cols[campusIdx1].trim()].filter(Boolean);
      }

      const rowErrors = [];
      if (!name)                                    rowErrors.push('name is required');
      if (!date)                                    rowErrors.push('date is required');
      else if (!isValidDate(date))                  rowErrors.push(`invalid date format "${date}" — use YYYY-MM-DD`);
      if (type  && !HOLIDAY_TYPES.includes(type))   rowErrors.push(`invalid type "${type}" — use: ${HOLIDAY_TYPES.join(', ')}`);
      if (scope && !HOLIDAY_SCOPES.includes(scope)) rowErrors.push(`invalid scope "${scope}" — use: global or campus`);
      if (scope === 'campus' && !campusIds.length)  rowErrors.push('campusIds is required when scope is "campus"');

      if (rowErrors.length) {
        errors.push(`Row ${rowNum}: ${rowErrors.join('; ')}`);
      } else {
        valid.push({
          name,
          date,
          type:      HOLIDAY_TYPES.includes(type)   ? type  : 'public',
          scope:     HOLIDAY_SCOPES.includes(scope)  ? scope : 'global',
          campusIds: scope === 'campus' ? campusIds : [],
          campusId:  null,
        });
      }
    });

    return { valid, errors };
  },

  // ── Import preview ───────────────────────────────────────────
  _renderImportPreview(container, { valid, errors }) {
    let html = '';

    if (valid.length) {
      html += `
        <div style="font-size:12px;font-weight:600;color:#10b981;margin-bottom:8px">
          ✓ ${valid.length} valid row${valid.length !== 1 ? 's' : ''} ready to import
        </div>
        <div style="border:1px solid var(--border);border-radius:var(--r-sm);overflow:hidden">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="background:var(--surface3)">
                <th style="padding:8px 12px;text-align:left;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--t2);border-bottom:1px solid var(--border)">Name</th>
                <th style="padding:8px 12px;text-align:left;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--t2);border-bottom:1px solid var(--border)">Date</th>
                <th style="padding:8px 12px;text-align:left;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--t2);border-bottom:1px solid var(--border)">Type</th>
                <th style="padding:8px 12px;text-align:left;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--t2);border-bottom:1px solid var(--border)">Scope</th>
              </tr>
            </thead>
            <tbody>
              ${valid.slice(0, 12).map((h, i) => `
                <tr style="${i % 2 === 0 ? '' : 'background:var(--surface2)'}">
                  <td style="padding:7px 12px;border-bottom:1px solid var(--border);color:var(--t1);font-weight:500">${h.name}</td>
                  <td style="padding:7px 12px;border-bottom:1px solid var(--border);font-family:var(--font-mono);font-size:11px;color:var(--t2)">${h.date}</td>
                  <td style="padding:7px 12px;border-bottom:1px solid var(--border)">${typeBadge(h.type)}</td>
                  <td style="padding:7px 12px;border-bottom:1px solid var(--border)">${scopeBadge(h.scope, h.campusId)}</td>
                </tr>`).join('')}
              ${valid.length > 12 ? `<tr><td colspan="4" style="padding:7px 12px;color:var(--t3);font-style:italic;font-size:11px">… and ${valid.length - 12} more rows</td></tr>` : ''}
            </tbody>
          </table>
        </div>`;
    }

    if (errors.length) {
      html += `
        <div style="margin-top:${valid.length ? '14px' : '0'};padding:12px;background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.2);border-radius:var(--r-sm)">
          <div style="font-size:12px;font-weight:600;color:#ef4444;margin-bottom:6px">✗ ${errors.length} error${errors.length !== 1 ? 's' : ''} found</div>
          <ul style="margin:0;padding-left:16px">
            ${errors.map(e => `<li style="font-size:12px;color:#ef4444;margin-bottom:3px">${e}</li>`).join('')}
          </ul>
        </div>`;
    }

    if (!valid.length && !errors.length) {
      html = `<p style="color:var(--t3);font-size:13px">No data found in CSV.</p>`;
    }

    container.innerHTML = html;
  },

  // ── Toolbar ──────────────────────────────────────────────────
  _attachToolbar(container) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;

    let searchVal = '';
    let typeVal   = '';
    let campusVal = '';

    const rerender = () => this._render(el, searchVal, typeVal, campusVal);

    el.querySelector('#holidayAddBtn')?.addEventListener('click', () => this._openForm(null, el));

    el.querySelector('#holidaySearch')?.addEventListener('input', (e) => {
      searchVal = e.target.value.toLowerCase().trim();
      rerender();
    });

    el.querySelector('#holidayTypeFilter')?.addEventListener('change', (e) => {
      typeVal = e.target.value;
      rerender();
    });

    el.querySelector('#holidayCampusFilter')?.addEventListener('change', (e) => {
      campusVal = e.target.value;
      rerender();
    });

    el.querySelector('#holidayExportBtn')?.addEventListener('click', () => this._exportCSV(el));
    el.querySelector('#holidayImportBtn')?.addEventListener('click', () => this._openImportModal(el));
    el.querySelector('#holidaySampleBtn')?.addEventListener('click', () => this._downloadSample());
  },

  // ── Page template ─────────────────────────────────────────────
  _pageTemplate() {
    const typeFilterOptions = HOLIDAY_TYPES.map(t =>
      `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`
    ).join('');

    const institutes = getInstitutes();
    const campuses   = getCampuses();
    const campusFilterOptions = institutes.map(inst => {
      const instCampuses = campuses.filter(c => c.instituteId === inst.id);
      if (!instCampuses.length) return '';
      return `<optgroup label="${inst.instituteName}">
        ${instCampuses.map(c =>
          `<option value="${c.id}">${c.campusName || c.name || c.code}</option>`
        ).join('')}
      </optgroup>`;
    }).join('');

    return `
      <div class="module-page">
        <div class="module-toolbar">
          <div class="search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input id="holidaySearch" class="search-input" placeholder="Search holidays…"/>
          </div>

          <select id="holidayTypeFilter" class="form-select form-input" style="max-width:150px;flex-shrink:0">
            <option value="">All Types</option>
            ${typeFilterOptions}
          </select>

          <select id="holidayCampusFilter" class="form-select form-input" style="max-width:180px;flex-shrink:0">
            <option value="">All Scopes</option>
            <option value="__global__">🌐 Global only</option>
            ${campusFilterOptions}
          </select>

          <span class="record-count">— holidays</span>

          <button id="holidaySampleBtn" class="add-btn" style="margin-left:auto;background:var(--surface2);color:var(--t2);border:1px solid var(--border)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            Sample
          </button>

          <button id="holidayImportBtn" class="add-btn" style="background:var(--surface2);color:var(--t2);border:1px solid var(--border)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Import CSV
          </button>

          <button id="holidayExportBtn" class="add-btn" style="background:var(--surface2);color:var(--t2);border:1px solid var(--border)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export
          </button>

          <button id="holidayAddBtn" class="add-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Holiday
          </button>
        </div>

        <div id="holidays-table"></div>
      </div>
    `;
  },
};
