// ============================================================
// modules/testing/testSchedule.js — Test Schedule Tab
// Tab 1: Create / Edit / Delete / View scheduled tests
// ============================================================

import { AppState, generateID } from '../../utils/state.js';
import { Modal, Form }          from '../../utils/ui.js';
import { Toast }                from '../../utils/helpers.js';
import { Auth }                 from '../../utils/auth.js';
import {
  getSchedules, getScheduleById,
  addSchedule, updateSchedule, deleteSchedule,
  getScheduleStatus, STATUS_META,
  TEST_TYPES, TEST_TYPE_META,
  formatDuration, formatDate,
} from './testingService.js';

// ── Mount ─────────────────────────────────────────────────────
export const TestScheduleTab = {

  mount(container) {
    container.innerHTML = this._template();
    this._injectStyles();
    this._attachToolbar(container);
    this._render(container);
  },

  // ── HTML template ─────────────────────────────────────────
  _template() {
    const batches    = AppState.get('batches')    || [];
    const subjects   = AppState.get('subjects')   || [];
    const campuses   = AppState.get('campuses')   || [];

    const batchOpts = batches.map(b =>
      `<option value="${b.id}">${b.batchName}</option>`
    ).join('');

    const campusOpts = campuses.map(c =>
      `<option value="${c.id}">${c.campusName.replace(/\s*campus$/i,'').trim()}</option>`
    ).join('');

    return `
      <div class="ts-page">

        <!-- Toolbar -->
        <div class="ts-toolbar">
          <div class="ts-search-wrap">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input id="tsSearch" class="ts-search-input" placeholder="Search by test name or batch…"/>
          </div>

          <!-- Filters -->
          <select id="tsFilterBatch" class="ts-filter-sel">
            <option value="">All Batches</option>${batchOpts}
          </select>
          <select id="tsFilterCampus" class="ts-filter-sel">
            <option value="">All Campuses</option>${campusOpts}
          </select>
          <select id="tsFilterStatus" class="ts-filter-sel">
            <option value="">All Status</option>
            <option value="upcoming">Upcoming</option>
            <option value="today">Today</option>
            <option value="overdue">Overdue</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="draft">Draft</option>
          </select>
          <select id="tsFilterType" class="ts-filter-sel">
            <option value="">All Types</option>
            ${TEST_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
          </select>

          <span class="ts-count" id="tsCount">— tests</span>

          <div style="margin-left:auto;display:flex;gap:6px;align-items:center;flex-shrink:0">
            <button id="tsAddBtn" class="ts-add-btn" title="Schedule New Test">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              <span>Schedule Test</span>
            </button>
          </div>
        </div>

        <!-- Table -->
        <div class="ts-table-wrap" id="tsTableWrap">
          <!-- rendered by _render() -->
        </div>

      </div>
    `;
  },

  // ── Toolbar wiring ─────────────────────────────────────────
  _attachToolbar(container) {
    const canCreate = Auth.can('tests:create') || Auth.can('tests');

    const addBtn = container.querySelector('#tsAddBtn');
    if (!canCreate) { addBtn.disabled = true; addBtn.style.opacity = '0.4'; }
    else addBtn.addEventListener('click', () => this._openForm(null, container));

    const rerender = () => this._render(container);

    container.querySelector('#tsSearch')
      ?.addEventListener('input', rerender);
    container.querySelector('#tsFilterBatch')
      ?.addEventListener('change', rerender);
    container.querySelector('#tsFilterCampus')
      ?.addEventListener('change', rerender);
    container.querySelector('#tsFilterStatus')
      ?.addEventListener('change', rerender);
    container.querySelector('#tsFilterType')
      ?.addEventListener('change', rerender);
  },

  // ── Render table ───────────────────────────────────────────
  _render(container) {
    const search       = container.querySelector('#tsSearch')?.value?.toLowerCase().trim() || '';
    const filterBatch  = container.querySelector('#tsFilterBatch')?.value  || '';
    const filterCampus = container.querySelector('#tsFilterCampus')?.value || '';
    const filterStatus = container.querySelector('#tsFilterStatus')?.value || '';
    const filterType   = container.querySelector('#tsFilterType')?.value   || '';

    let rows = getSchedules();

    // ── Filters ───────────────────────────────────────────────
    if (filterBatch)  rows = rows.filter(r => r.batchId === filterBatch);
    if (filterType)   rows = rows.filter(r => r.testType === filterType);
    if (filterStatus) rows = rows.filter(r => getScheduleStatus(r) === filterStatus);
    if (filterCampus) {
      const batchIds = (AppState.get('batches') || [])
        .filter(b => b.campusId === filterCampus).map(b => b.id);
      rows = rows.filter(r => batchIds.includes(r.batchId));
    }
    if (search) {
      rows = rows.filter(r => {
        const batch = AppState.findById('batches', r.batchId);
        return (
          (r.testName  || '').toLowerCase().includes(search) ||
          (batch?.batchName || '').toLowerCase().includes(search) ||
          (r.testType  || '').toLowerCase().includes(search)
        );
      });
    }

    // Sort: today first → upcoming → overdue → completed → cancelled → draft
    const ORDER = { today:0, upcoming:1, overdue:2, completed:3, cancelled:4, draft:5 };
    rows = [...rows].sort((a, b) => {
      const sa = ORDER[getScheduleStatus(a)] ?? 9;
      const sb = ORDER[getScheduleStatus(b)] ?? 9;
      if (sa !== sb) return sa - sb;
      return (a.date || '').localeCompare(b.date || '');
    });

    // Count
    const countEl = container.querySelector('#tsCount');
    if (countEl) countEl.textContent = `${rows.length} test${rows.length !== 1 ? 's' : ''}`;

    const wrap = container.querySelector('#tsTableWrap');
    if (!wrap) return;

    if (!rows.length) {
      wrap.innerHTML = `
        <div class="ts-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" style="color:var(--t4);margin-bottom:12px">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <div style="font-size:14px;font-weight:600;color:var(--t2)">No tests scheduled yet</div>
          <div style="font-size:12.5px;color:var(--t3);margin-top:4px">Click "Schedule Test" to create the first test</div>
        </div>`;
      return;
    }

    const canEdit   = Auth.can('tests:edit')   || Auth.can('tests');
    const canDelete = Auth.can('tests:delete') || Auth.can('tests');

    wrap.innerHTML = `
      <table class="ts-table">
        <thead>
          <tr>
            <th>Test Name</th>
            <th>Type</th>
            <th>Batch</th>
            <th>Date</th>
            <th>Time</th>
            <th>Duration</th>
            <th>Marks</th>
            <th>Status</th>
            <th style="width:90px">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => this._rowHTML(row, canEdit, canDelete)).join('')}
        </tbody>
      </table>
    `;

    // Wire action buttons
    wrap.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = getScheduleById(btn.dataset.id);
        if (row) this._openForm(row, container);
      });
    });
    wrap.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = getScheduleById(btn.dataset.id);
        if (row) this._delete(row, container);
      });
    });
    wrap.querySelectorAll('[data-action="status"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = getScheduleById(btn.dataset.id);
        if (row) this._quickStatus(row, container);
      });
    });
  },

  // ── Single row HTML ────────────────────────────────────────
  _rowHTML(row, canEdit, canDelete) {
    const batch   = AppState.findById('batches',  row.batchId)   || null;
    const subject = AppState.findById('subjects', row.subjectId) || null;
    const status  = getScheduleStatus(row);
    const sm      = STATUS_META[status]    || STATUS_META.draft;
    const tm      = TEST_TYPE_META[row.testType] || TEST_TYPE_META.written;
    const typeLabel = TEST_TYPES.find(t => t.value === row.testType)?.label || row.testType || '—';

    const batchLabel = batch
      ? `<span style="font-family:var(--font-mono);font-size:11.5px;font-weight:700;color:var(--t1)">${batch.batchName}</span>`
      : `<span style="color:var(--t4)">—</span>`;

    const subjectLabel = subject
      ? `<div style="font-size:10.5px;color:var(--t3);margin-top:1px">${subject.subjectCode}</div>`
      : '';

    const timeLabel = row.startTime
      ? `<span style="font-family:var(--font-mono);font-size:12px;color:var(--t2)">${row.startTime}</span>`
      : `<span style="color:var(--t4)">—</span>`;

    return `
      <tr class="ts-row" data-id="${row.id}">
        <td>
          <div style="font-size:13px;font-weight:600;color:var(--t1)">${row.testName || '—'}</div>
          ${row.venue ? `<div style="font-size:10.5px;color:var(--t3);margin-top:1px">📍 ${row.venue}</div>` : ''}
        </td>
        <td>
          <span style="font-size:11.5px;font-weight:600;padding:2px 9px;border-radius:10px;
                       color:${tm.color};background:${tm.bg}">
            ${typeLabel}
          </span>
        </td>
        <td>${batchLabel}${subjectLabel}</td>
        <td>
          <span style="font-size:12px;color:var(--t2)">${formatDate(row.date)}</span>
        </td>
        <td>${timeLabel}</td>
        <td>
          <span style="font-family:var(--font-mono);font-size:12px;color:var(--t3)">
            ${formatDuration(row.durationMinutes)}
          </span>
        </td>
        <td>
          ${row.totalMarks
            ? `<span style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--blue)">${row.totalMarks}</span>`
            : `<span style="color:var(--t4)">—</span>`}
          ${row.passingMarks
            ? `<div style="font-size:10.5px;color:var(--t3)">Pass: ${row.passingMarks}</div>`
            : ''}
        </td>
        <td>
          <span style="font-size:11.5px;font-weight:600;padding:2px 9px;border-radius:10px;
                       color:${sm.color};background:${sm.bg};cursor:pointer"
                data-action="status" data-id="${row.id}" title="Click to change status">
            ${sm.label}
          </span>
        </td>
        <td>
          <div style="display:flex;gap:4px">
            ${canEdit ? `
            <button data-action="edit" data-id="${row.id}" class="ts-act-btn ts-edit-btn" title="Edit">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>` : ''}
            ${canDelete ? `
            <button data-action="delete" data-id="${row.id}" class="ts-act-btn ts-del-btn" title="Delete">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
              </svg>
            </button>` : ''}
          </div>
        </td>
      </tr>
    `;
  },

  // ── Quick status change ────────────────────────────────────
  _quickStatus(row, container) {
    const current = row.status || 'scheduled';
    const options = ['scheduled','completed','cancelled'];

    Modal.open({
      title: 'Change Status',
      size:  'sm',
      body: `
        <div style="display:flex;flex-direction:column;gap:8px">
          <p style="font-size:13px;color:var(--t2);margin-bottom:6px">
            Update status for: <strong style="color:var(--t1)">${row.testName}</strong>
          </p>
          ${options.map(opt => {
            const sm = STATUS_META[opt] || STATUS_META.draft;
            const label = { scheduled:'Scheduled', completed:'Completed', cancelled:'Cancelled' }[opt] || opt;
            return `
              <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;
                            border-radius:8px;border:1px solid var(--border);
                            cursor:pointer;transition:all .15s"
                     onmouseover="this.style.borderColor='var(--blue)';this.style.background='var(--blue-dim)'"
                     onmouseout="this.style.borderColor='var(--border)';this.style.background=''">
                <input type="radio" name="qStatus" value="${opt}" ${current===opt?'checked':''} style="accent-color:var(--blue)"/>
                <span style="font-size:12.5px;font-weight:600;color:${sm.color}">${label}</span>
              </label>`;
          }).join('')}
        </div>
      `,
      actions: [
        { label: 'Cancel', variant: 'ghost', close: true },
        {
          label: 'Save', variant: 'primary', close: false,
          handler: (modalEl) => {
            const sel = modalEl.querySelector('input[name="qStatus"]:checked')?.value;
            if (sel) {
              updateSchedule(row.id, { ...row, status: sel });
              Toast.success('Status updated.');
              Modal.closeAll();
              this._render(container);
            }
          }
        }
      ]
    });
  },

  // ── Add / Edit form ────────────────────────────────────────
  _openForm(existing, container) {
    const isEdit     = !!existing;
    const batches    = AppState.get('batches')    || [];
    const subjects   = AppState.get('subjects')   || [];
    const teachers   = (AppState.get('teachers')  || []).filter(t => t.isActive !== false);
    const campuses   = AppState.get('campuses')   || [];

    const selBatchId = existing?.batchId   || '';
    const selSubjId  = existing?.subjectId || '';

    // Filter subjects by selected batch's level
    const selBatch    = batches.find(b => b.id === selBatchId);
    const filtSubjects = selBatch?.levelId
      ? subjects.filter(s => s.levelId === selBatch.levelId)
      : subjects;

    const batchOptions = batches.map(b =>
      `<option value="${b.id}" ${b.id === selBatchId ? 'selected' : ''}>${b.batchName}</option>`
    ).join('');

    const subjectOptions = filtSubjects.map(s =>
      `<option value="${s.id}" ${s.id === selSubjId ? 'selected' : ''}>${s.subjectCode} — ${s.subjectName}</option>`
    ).join('');

    const typeOptions = TEST_TYPES.map(t =>
      `<option value="${t.value}" ${existing?.testType === t.value ? 'selected' : ''}>${t.label}</option>`
    ).join('');

    const teacherOptions = teachers.map(t =>
      `<option value="${t.id}" ${existing?.invigilatorId === t.id ? 'selected' : ''}>${t.fullName}</option>`
    ).join('');

    const campusOptions = campuses.map(c =>
      `<option value="${c.id}" ${existing?.campusOverride === c.id ? 'selected' : ''}>${c.campusName.replace(/\s*campus$/i,'').trim()}</option>`
    ).join('');

    Modal.open({
      title:      isEdit ? 'Edit Scheduled Test' : 'Schedule New Test',
      size:       'lg',
      scrollable: true,
      body: `
        <!-- Row 1: Test Name + Type -->
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Test Name <span class="req">*</span></label>
            <input name="testName" class="form-input" placeholder="e.g. Mid-Term Exam 2026"
                   value="${existing?.testName || ''}"/>
          </div>
          <div class="form-group">
            <label class="form-label">Test Type <span class="req">*</span></label>
            <select name="testType" class="form-select form-input">
              <option value="">Select type…</option>${typeOptions}
            </select>
          </div>
        </div>

        <!-- Row 2: Batch + Subject -->
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Batch <span class="req">*</span></label>
            <select name="batchId" class="form-select form-input" id="tsFormBatch">
              <option value="">Select a batch…</option>${batchOptions}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Subject</label>
            <select name="subjectId" class="form-select form-input" id="tsFormSubject">
              <option value="">All subjects / Not specific</option>${subjectOptions}
            </select>
            <span class="form-hint">Optional — leave blank for multi-subject test</span>
          </div>
        </div>

        <!-- Row 3: Date + Start Time -->
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Date <span class="req">*</span></label>
            <input name="date" type="date" class="form-input"
                   value="${existing?.date || ''}"
                   style="font-family:var(--font-mono)"/>
          </div>
          <div class="form-group">
            <label class="form-label">Start Time</label>
            <input name="startTime" type="time" class="form-input"
                   value="${existing?.startTime || ''}"
                   style="font-family:var(--font-mono)"/>
          </div>
        </div>

        <!-- Row 4: Duration + Total Marks + Passing Marks -->
        <div class="form-row cols-3">
          <div class="form-group">
            <label class="form-label">Duration (minutes)</label>
            <input name="durationMinutes" type="number" class="form-input"
                   placeholder="e.g. 90" min="5" max="480"
                   value="${existing?.durationMinutes || ''}"
                   style="font-family:var(--font-mono)"/>
          </div>
          <div class="form-group">
            <label class="form-label">Total Marks</label>
            <input name="totalMarks" type="number" class="form-input"
                   placeholder="e.g. 100" min="1"
                   value="${existing?.totalMarks || ''}"
                   style="font-family:var(--font-mono)"/>
          </div>
          <div class="form-group">
            <label class="form-label">Passing Marks</label>
            <input name="passingMarks" type="number" class="form-input"
                   placeholder="e.g. 40" min="0"
                   value="${existing?.passingMarks || ''}"
                   style="font-family:var(--font-mono)"/>
          </div>
        </div>

        <!-- Row 5: Venue + Invigilator -->
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Venue / Room</label>
            <input name="venue" class="form-input" placeholder="e.g. Hall A, Room 201"
                   value="${existing?.venue || ''}"/>
          </div>
          <div class="form-group">
            <label class="form-label">Invigilator</label>
            <select name="invigilatorId" class="form-select form-input">
              <option value="">Select invigilator…</option>${teacherOptions}
            </select>
          </div>
        </div>

        <!-- Notes -->
        <div class="form-group">
          <label class="form-label">Instructions / Notes</label>
          <textarea name="notes" class="form-input" rows="2"
                    placeholder="Any special instructions for students…"
                    style="resize:vertical">${existing?.notes || ''}</textarea>
        </div>
      `,
      actions: [
        { label: 'Cancel', variant: 'ghost', close: true },
        {
          label:   isEdit ? 'Save Changes' : 'Schedule Test',
          variant: 'primary',
          close:   false,
          handler: (modalEl) => this._handleSave(modalEl, existing, container),
        }
      ],
      onOpen: (modalEl) => {
        this._wireFormDropdowns(modalEl, existing);
      }
    });
  },

  // ── Form dropdown wiring ───────────────────────────────────
  _wireFormDropdowns(modalEl, existing) {
    const batchSel   = modalEl.querySelector('#tsFormBatch');
    const subjectSel = modalEl.querySelector('#tsFormSubject');
    const subjects   = AppState.get('subjects') || [];

    if (!batchSel || !subjectSel) return;

    batchSel.addEventListener('change', () => {
      const batch = AppState.findById('batches', batchSel.value);
      const filtSubjects = batch?.levelId
        ? subjects.filter(s => s.levelId === batch.levelId)
        : subjects;

      subjectSel.innerHTML =
        '<option value="">All subjects / Not specific</option>' +
        filtSubjects.map(s =>
          `<option value="${s.id}">${s.subjectCode} — ${s.subjectName}</option>`
        ).join('');
    });
  },

  // ── Save handler ───────────────────────────────────────────
  _handleSave(modalEl, existing, container) {
    const body = modalEl.querySelector('.modal-body') || modalEl;
    const data = Form.collect(body);

    // Validation
    if (!data.testName?.trim()) { Toast.error('Test name is required.');  return; }
    if (!data.testType)          { Toast.error('Please select test type.'); return; }
    if (!data.batchId)           { Toast.error('Please select a batch.');  return; }
    if (!data.date)              { Toast.error('Please select a date.');   return; }

    // Passing marks check
    if (data.totalMarks && data.passingMarks) {
      if (parseInt(data.passingMarks) > parseInt(data.totalMarks)) {
        Toast.error('Passing marks cannot exceed total marks.');
        return;
      }
    }

    // Clean numerics
    if (data.durationMinutes) data.durationMinutes = parseInt(data.durationMinutes);
    if (data.totalMarks)      data.totalMarks      = parseInt(data.totalMarks);
    if (data.passingMarks)    data.passingMarks    = parseInt(data.passingMarks);
    if (!data.subjectId)      delete data.subjectId;
    if (!data.invigilatorId)  delete data.invigilatorId;
    if (!data.venue?.trim())  delete data.venue;
    if (!data.notes?.trim())  delete data.notes;

    if (existing) {
      updateSchedule(existing.id, { ...existing, ...data });
      Toast.success(`Test "${data.testName}" updated successfully.`);
    } else {
      data.status = 'scheduled';
      addSchedule(data);
      Toast.success(`Test "${data.testName}" scheduled successfully.`);
    }

    Modal.closeAll();
    this._render(container);
  },

  // ── Delete ─────────────────────────────────────────────────
  async _delete(row, container) {
    const ok = await Modal.confirm({
      title:        'Delete Scheduled Test',
      message:      `Are you sure you want to delete <strong>${row.testName}</strong>? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger:       true,
    });
    if (!ok) return;
    deleteSchedule(row.id);
    Toast.success(`"${row.testName}" deleted.`);
    this._render(container);
  },

  // ── Styles ─────────────────────────────────────────────────
  _injectStyles() {
    if (document.getElementById('ts-styles')) return;
    const st = document.createElement('style');
    st.id = 'ts-styles';
    st.textContent = `
      .ts-page { display:flex; flex-direction:column; gap:16px; }

      /* Toolbar */
      .ts-toolbar {
        display:flex; align-items:center; gap:8px;
        flex-wrap:wrap;
        padding:12px 16px;
        background:var(--surface);
        border:1px solid var(--border);
        border-radius:12px;
      }
      .ts-search-wrap {
        display:flex; align-items:center; gap:7px;
        background:var(--surface2);
        border:1px solid var(--border2);
        border-radius:8px; padding:7px 10px; color:var(--t3);
        min-width:200px;
      }
      .ts-search-wrap:focus-within { border-color:var(--blue); }
      .ts-search-input {
        background:none; border:none; outline:none;
        color:var(--t1); font-size:12.5px; width:100%;
      }
      .ts-search-input::placeholder { color:var(--t3); }
      .ts-filter-sel {
        height:34px; padding:0 10px;
        background:var(--surface2); border:1px solid var(--border2);
        border-radius:8px; color:var(--t2); font-size:12.5px;
        cursor:pointer; outline:none; font-family:var(--font-body);
      }
      .ts-filter-sel:focus { border-color:var(--blue); color:var(--t1); }
      .ts-count {
        font-size:12px; color:var(--t3);
        white-space:nowrap; padding:0 4px;
      }
      .ts-add-btn {
        display:inline-flex; align-items:center; gap:6px;
        height:34px; padding:0 14px;
        background:var(--blue); color:#fff;
        border-radius:8px; font-size:13px; font-weight:600;
        font-family:var(--font-body); transition:opacity .15s;
        flex-shrink:0;
      }
      .ts-add-btn:hover { opacity:.88; }
      .ts-add-btn:disabled { opacity:.4; cursor:not-allowed; }

      /* Table */
      .ts-table-wrap {
        background:var(--surface);
        border:1px solid var(--border);
        border-radius:12px;
        overflow:hidden;
      }
      .ts-table {
        width:100%; border-collapse:collapse; font-size:12.5px;
      }
      .ts-table thead tr {
        background:var(--surface2);
        border-bottom:1px solid var(--border);
      }
      .ts-table th {
        padding:10px 14px; text-align:left;
        font-size:11px; font-weight:700;
        text-transform:uppercase; letter-spacing:.06em;
        color:var(--t3); white-space:nowrap;
      }
      .ts-table td {
        padding:11px 14px; border-bottom:1px solid var(--border);
        vertical-align:middle;
      }
      .ts-row:last-child td { border-bottom:none; }
      .ts-row:hover td { background:var(--surface2); }

      /* Action buttons */
      .ts-act-btn {
        width:28px; height:28px; border-radius:6px;
        display:inline-flex; align-items:center; justify-content:center;
        border:1px solid var(--border);
        color:var(--t3); transition:all .12s;
        cursor:pointer;
      }
      .ts-edit-btn:hover { border-color:var(--blue); color:var(--blue); background:var(--blue-dim); }
      .ts-del-btn:hover  { border-color:var(--red);  color:var(--red);  background:var(--red-dim);  }

      /* Empty state */
      .ts-empty {
        display:flex; flex-direction:column; align-items:center;
        justify-content:center; padding:64px 24px;
        color:var(--t3);
      }

      /* Form helpers */
      .form-row.cols-3 {
        display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px;
      }
    `;
    document.head.appendChild(st);
  },
};
