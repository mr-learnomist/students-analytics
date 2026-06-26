// ============================================================
// modules/admission/admissionUI.js — Admission Module UI
//
// Sidebar nav items handled here:
//   • New Admission  → 4-step wizard (AdmissionForm)
//   • All Students   → table of admitted students (filterable)
//   • Challans       → list of all challans with status
//   • Mark Payment   → quick challan lookup + mark paid
//   • Batch View     → students grouped by batch
//   • Lecture Plans  → navigates to existing lecturePlan route
//
// Mount:  AdmissionModule.mount(containerEl)
// Route:  registered in app.js as 'admissions'
// Permission: 'admissions' (admin + campusAdmin)
//             'admissions:read' (teacher — read-only)
// ============================================================

import { AppState }           from '../../utils/state.js';
import { Auth }               from '../../utils/auth.js';
import { Toast }              from '../../utils/helpers.js';
import { Router }             from '../../utils/router.js';
import {
  AdmissionService,
  ADMISSION_STATUS,
  CHALLAN_STATUS,
  getAdmissions,
  getChallans,
  getAccessibleCampuses,
  ensureAdmissionState,
}                             from './admissionService.js';
import { AdmissionForm }      from './admissionForm.js';
import {
  generateSampleCSV,
  processBulkImport,
  processBulkImportAsync,
  REQUIRED_COLUMNS,
}                             from './bulkImportService.js';

// ── Tabs available ────────────────────────────────────────────
const TABS = [
  { key: 'new',       label: '+ New Admission', icon: _ico('user-plus'),   perm: 'admissions:create' },
  { key: 'students',  label: 'All Students',    icon: _ico('users'),       perm: 'admissions' },
  { key: 'challans',  label: 'Challans',        icon: _ico('file-text'),   perm: 'admissions' },
  { key: 'payment',   label: 'Mark Payment',    icon: _ico('check-square'),perm: 'admissions:create' },
  { key: 'batchview', label: 'Batch View',      icon: _ico('layers'),      perm: 'admissions' },
  { key: 'import',    label: 'Import',          icon: _ico('upload'),      perm: 'admissions:create' },
];

// ── Module state ──────────────────────────────────────────────
let _activeTab  = 'new';
let _mountEl    = null;

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export const AdmissionModule = {

  mount(containerEl) {
    if (!containerEl) return;
    _mountEl = containerEl;
    ensureAdmissionState();

    // Default tab: if no create perm → fallback to students list
    if (!Auth.can('admissions:create')) _activeTab = 'students';

    _render();
  },
};

// ─────────────────────────────────────────────────────────────
// Core render
// ─────────────────────────────────────────────────────────────

function _render() {
  if (!_mountEl) return;

  // Filter tabs by permission
  const visibleTabs = TABS.filter(t => Auth.can(t.perm));

  _mountEl.innerHTML = `
    <nav class="tab-nav" id="admTabNav" style="margin-bottom:20px">
      ${visibleTabs.map(t => `
        <button class="tab-btn ${_activeTab === t.key ? 'active' : ''}" data-tab="${t.key}">
          ${t.icon} ${t.label}
        </button>`).join('')}
    </nav>
    <div id="admTabBody"></div>`;

  // Wire tab clicks
  _mountEl.querySelector('#admTabNav')?.addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn[data-tab]');
    if (!btn) return;
    _activeTab = btn.dataset.tab;
    _mountEl.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === _activeTab));
    _renderTab();
  });

  _renderTab();
}

function _renderTab() {
  const body = _mountEl?.querySelector('#admTabBody');
  if (!body) return;

  const fns = {
    new:       _renderNewAdmission,
    students:  _renderAllStudents,
    challans:  _renderChallans,
    payment:   _renderMarkPayment,
    batchview: _renderBatchView,
    import:    _renderImport,
  };

  (fns[_activeTab] || _renderAllStudents)(body);
}

// ─────────────────────────────────────────────────────────────
// TAB 1 — New Admission (wizard)
// ─────────────────────────────────────────────────────────────

function _renderNewAdmission(body) {
  body.innerHTML = '';
  AdmissionForm.open(body, {
    mode: 'new',
    onComplete({ admission, student, challan }) {
      // Auto-switch to challans tab after completion
      setTimeout(() => {
        _activeTab = 'challans';
        _render();
      }, 1500);
    },
  });
}

// ─────────────────────────────────────────────────────────────
// TAB 2 — All Students
// ─────────────────────────────────────────────────────────────

function _renderAllStudents(body) {
  const campuses    = getAccessibleCampuses();
  const disciplines = AppState.get('disciplines') || [];

  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      <input id="admStuSearch" class="search-input" placeholder="Search by name or CNIC…"
        style="flex:1;min-width:180px;max-width:280px">
      <select id="admStuCampus" class="filter-select">
        <option value="">All Campuses</option>
        ${campuses.map(c => `<option value="${c.id}">${c.campusName}</option>`).join('')}
      </select>
      <select id="admStuStatus" class="filter-select">
        <option value="">All Status</option>
        <option value="confirmed">Confirmed</option>
        <option value="pending">Pending</option>
        <option value="cancelled">Cancelled</option>
      </select>
    </div>
    <div id="admStuTableWrap"></div>`;

  const renderTable = () => {
    const q        = (body.querySelector('#admStuSearch')?.value  || '').toLowerCase();
    const campusId = body.querySelector('#admStuCampus')?.value   || '';
    const status   = body.querySelector('#admStuStatus')?.value   || '';

    let admissions = getAdmissions({ campusId: campusId || undefined, status: status || undefined });

    const wrap = body.querySelector('#admStuTableWrap');

    if (!admissions.length) {
      wrap.innerHTML = _emptyState('No admissions found.', 'Try adjusting filters or create a new admission.');
      return;
    }

    // Enrich with student + batch data
    let rows = admissions.map(a => {
      const student = AppState.findById('students',    a.studentId);
      const batch   = AppState.findById('batches',     a.batchId);
      const campus  = AppState.findById('campuses',    a.campusId);
      const disc    = AppState.findById('disciplines', a.disciplineId);
      return { a, student, batch, campus, disc };
    });

    // Text search
    if (q) {
      rows = rows.filter(({ student }) =>
        student?.studentName?.toLowerCase().includes(q) ||
        student?.cnic?.includes(q) ||
        student?.uniqueId?.includes(q)
      );
    }

    if (!rows.length) {
      wrap.innerHTML = _emptyState('No results found.', 'Try a different search term.');
      return;
    }

    wrap.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>CNIC</th>
              <th>Campus</th>
              <th>Discipline</th>
              <th>Batch</th>
              <th>Session</th>
              <th>Status</th>
              <th>Date</th>
              ${Auth.can('admissions:create') ? '<th>Action</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${rows.map(({ a, student, batch, campus, disc }) => `
              <tr>
                <td>
                  <div style="font-weight:600;color:var(--t1)">${student?.studentName || '—'}</div>
                  <div style="font-size:11px;color:var(--t3)">${student?.phone || ''}</div>
                </td>
                <td style="font-family:var(--font-mono);font-size:12px">${student?.cnic || student?.uniqueId || '—'}</td>
                <td>${campus?.campusName  || '—'}</td>
                <td>${disc?.abbreviation  || '—'}</td>
                <td>${batch?.batchName    || '—'}</td>
                <td>${a.session           || '—'}</td>
                <td>${_statusBadge(a.status)}</td>
                <td style="font-size:12px;color:var(--t3)">${_fmtDate(a.createdAt)}</td>
                ${Auth.can('admissions:create') ? `
                <td>
                  ${a.status !== ADMISSION_STATUS.CANCELLED && a.status !== ADMISSION_STATUS.CONFIRMED ? `
                  <button class="icon-btn" title="Cancel" data-cancel="${a.id}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  </button>` : '—'}
                </td>` : ''}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="font-size:12px;color:var(--t3);margin-top:8px">${rows.length} admission(s)</div>`;

    // Cancel admission
    wrap.querySelectorAll('[data-cancel]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Cancel this admission? This cannot be undone.')) return;
        const r = AdmissionService.cancelAdmission(btn.dataset.cancel);
        if (!r.success) { Toast.error(r.message); return; }
        Toast.info('Admission cancelled.');
        renderTable();
      });
    });
  };

  body.querySelector('#admStuSearch')?.addEventListener('input',  renderTable);
  body.querySelector('#admStuCampus')?.addEventListener('change', renderTable);
  body.querySelector('#admStuStatus')?.addEventListener('change', renderTable);

  renderTable();
}

// ─────────────────────────────────────────────────────────────
// TAB 3 — Challans
// ─────────────────────────────────────────────────────────────

function _renderChallans(body) {
  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      <input id="admChlSearch" class="search-input" placeholder="Search challan no or student…"
        style="flex:1;min-width:180px;max-width:280px">
      <select id="admChlStatus" class="filter-select">
        <option value="">All Status</option>
        <option value="pending">Pending</option>
        <option value="paid">Paid</option>
        <option value="waived">Waived</option>
        <option value="overdue">Overdue</option>
      </select>
    </div>
    <div id="admChlTableWrap"></div>`;

  const renderTable = () => {
    const q      = (body.querySelector('#admChlSearch')?.value || '').toLowerCase();
    const status = body.querySelector('#admChlStatus')?.value  || '';

    // Campus-filtered challans
    const user      = Auth.getCurrentUser();
    let challans    = AppState.get('challans') || [];
    if (user?.campusId) challans = challans.filter(c => c.campusId === user.campusId);
    if (status) challans = challans.filter(c => c.status === status);
    if (q) challans = challans.filter(c =>
      c.challanNo?.toLowerCase().includes(q) ||
      c.studentName?.toLowerCase().includes(q)
    );

    const wrap = body.querySelector('#admChlTableWrap');

    // Stats bar
    const all       = (() => {
      let list = AppState.get('challans') || [];
      if (user?.campusId) list = list.filter(c => c.campusId === user.campusId);
      return list;
    })();
    const pendingAmt = all.filter(c => c.status === CHALLAN_STATUS.PENDING).reduce((s, c) => s + (c.feeAmount || 0), 0);
    const paidAmt    = all.filter(c => c.status === CHALLAN_STATUS.PAID).reduce((s, c) => s + (c.feeAmount || 0), 0);

    const statsHTML = `
      <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
        ${_statPill('Pending', all.filter(c => c.status === CHALLAN_STATUS.PENDING).length, '#f59e0b')}
        ${_statPill('Paid',    all.filter(c => c.status === CHALLAN_STATUS.PAID).length,    '#10b981')}
        ${_statPill('Waived',  all.filter(c => c.status === CHALLAN_STATUS.WAIVED).length,  '#8b5cf6')}
        <div style="margin-left:auto;font-size:12px;color:var(--t3);display:flex;gap:16px;align-items:center">
          <span>Pending: <strong style="color:var(--yellow)">PKR ${pendingAmt.toLocaleString()}</strong></span>
          <span>Collected: <strong style="color:var(--green)">PKR ${paidAmt.toLocaleString()}</strong></span>
        </div>
      </div>`;

    if (!challans.length) {
      wrap.innerHTML = statsHTML + _emptyState('No challans found.', 'Challans are generated during the admission process.');
      return;
    }

    wrap.innerHTML = statsHTML + `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Challan #</th>
              <th>Student</th>
              <th>Batch</th>
              <th>Amount</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Issued</th>
              ${Auth.can('admissions:create') ? '<th>Action</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${challans.map(c => {
              const batch   = AppState.findById('batches', c.batchId);
              const isPaid  = c.status === CHALLAN_STATUS.PAID;
              const isWaive = c.status === CHALLAN_STATUS.WAIVED;
              return `
                <tr>
                  <td style="font-family:var(--font-mono);font-size:12px">${c.challanNo}</td>
                  <td>
                    <div style="font-weight:600;color:var(--t1)">${c.studentName || '—'}</div>
                    <div style="font-size:11px;color:var(--t3)">${c.session || ''}</div>
                  </td>
                  <td>${batch?.batchName || '—'}</td>
                  <td style="font-family:var(--font-mono);font-weight:700;color:var(--t1)">
                    PKR ${Number(c.feeAmount || 0).toLocaleString()}
                  </td>
                  <td style="font-size:12px;${_isOverdue(c) ? 'color:var(--red)' : 'color:var(--t3)'}">${c.dueDate || '—'}</td>
                  <td>${_challanBadge(c.status)}</td>
                  <td style="font-size:12px;color:var(--t3)">${_fmtDate(c.issuedAt)}</td>
                  ${Auth.can('admissions:create') ? `
                  <td>
                    ${!isPaid && !isWaive ? `
                    <div style="display:flex;gap:6px">
                      <button class="btn btn-xs btn-success" data-markpaid="${c.id}" title="Mark Paid">Paid</button>
                      <button class="btn btn-xs" data-waive="${c.id}" title="Waive" style="background:var(--violet-dim);color:var(--violet)">Waive</button>
                    </div>` : '—'}
                  </td>` : ''}
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div style="font-size:12px;color:var(--t3);margin-top:8px">${challans.length} challan(s)</div>`;

    // Mark paid
    wrap.querySelectorAll('[data-markpaid]').forEach(btn => {
      btn.addEventListener('click', () => {
        const r = AdmissionService.markChallanPaid(btn.dataset.markpaid);
        if (!r.success) { Toast.error(r.message); return; }
        Toast.success('Challan marked as paid. Student activated!');
        renderTable();
      });
    });

    // Waive
    wrap.querySelectorAll('[data-waive]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Waive this challan? Student will be activated without payment.')) return;
        const r = AdmissionService.waiveChallan(btn.dataset.waive, 'Manual waiver');
        if (!r.success) { Toast.error(r.message); return; }
        Toast.success('Challan waived. Student activated.');
        renderTable();
      });
    });
  };

  body.querySelector('#admChlSearch')?.addEventListener('input',  renderTable);
  body.querySelector('#admChlStatus')?.addEventListener('change', renderTable);
  renderTable();
}

// ─────────────────────────────────────────────────────────────
// TAB 4 — Mark Payment (quick challan search)
// ─────────────────────────────────────────────────────────────

function _renderMarkPayment(body) {
  body.innerHTML = `
    <div style="max-width:520px;margin:0 auto">
      <div class="panel" style="padding:24px">
        <div class="pt" style="margin-bottom:4px">Mark Challan Payment</div>
        <div style="font-size:12.5px;color:var(--t3);margin-bottom:20px">
          Enter the challan number or student name to find and mark as paid.
        </div>

        <div style="display:flex;gap:8px;margin-bottom:16px">
          <input id="admPaySearch" class="adm-input"
            placeholder="Challan # or student name…"
            style="flex:1;background:var(--surface2);border:1px solid var(--border2);
                   border-radius:var(--r-sm);color:var(--t1);font-size:13.5px;padding:9px 12px;
                   outline:none;font-family:inherit">
          <button class="btn btn-primary" id="admPaySearchBtn">Search</button>
        </div>

        <div id="admPayResult"></div>
      </div>
    </div>`;

  // Inject adm-input style locally if not already present
  const doSearch = () => {
    const q    = body.querySelector('#admPaySearch')?.value.trim().toLowerCase() || '';
    const res  = body.querySelector('#admPayResult');
    if (!q) { res.innerHTML = ''; return; }

    const user     = Auth.getCurrentUser();
    let challans   = AppState.get('challans') || [];
    if (user?.campusId) challans = challans.filter(c => c.campusId === user.campusId);

    const matches = challans.filter(c =>
      c.challanNo?.toLowerCase().includes(q) ||
      c.studentName?.toLowerCase().includes(q)
    );

    if (!matches.length) {
      res.innerHTML = `<div style="color:var(--t3);font-size:13px;text-align:center;padding:24px">
        No challan found for "<strong>${q}</strong>".
      </div>`;
      return;
    }

    res.innerHTML = matches.map(c => {
      const batch   = AppState.findById('batches', c.batchId);
      const isPaid  = c.status === CHALLAN_STATUS.PAID;
      const isWaive = c.status === CHALLAN_STATUS.WAIVED;
      return `
        <div style="background:var(--surface2);border:1px solid var(--border2);border-radius:var(--r);
                    padding:16px;margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;margin-bottom:10px">
            <div>
              <div style="font-weight:700;color:var(--t1)">${c.studentName}</div>
              <div style="font-size:11.5px;font-family:var(--font-mono);color:var(--t3)">${c.challanNo}</div>
            </div>
            ${_challanBadge(c.status)}
          </div>
          <div style="font-size:13px;color:var(--t2);display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px">
            <span>Batch: <strong>${batch?.batchName || '—'}</strong></span>
            <span>Session: <strong>${c.session || '—'}</strong></span>
            <span>Due: <strong>${c.dueDate || '—'}</strong></span>
          </div>
          <div style="font-size:18px;font-weight:800;font-family:var(--font-mono);color:var(--blue);margin-bottom:12px">
            PKR ${Number(c.feeAmount || 0).toLocaleString()}
          </div>
          ${!isPaid && !isWaive ? `
          <div style="display:flex;gap:8px">
            <button class="btn btn-success" data-pay="${c.id}" style="flex:1">
              ✓ Mark as Paid
            </button>
            <button class="btn" data-waive="${c.id}"
              style="background:var(--violet-dim);color:var(--violet)">
              Waive
            </button>
          </div>` : `
          <div style="color:var(--green);font-size:13px;font-weight:600">
            ${isPaid ? '✓ Already paid' : '✓ Fee waived'}
          </div>`}
        </div>`;
    }).join('');

    // Bind pay
    res.querySelectorAll('[data-pay]').forEach(btn => {
      btn.addEventListener('click', () => {
        const r = AdmissionService.markChallanPaid(btn.dataset.pay);
        if (!r.success) { Toast.error(r.message); return; }
        Toast.success('Payment recorded. Student activated!');
        doSearch();
      });
    });

    res.querySelectorAll('[data-waive]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Waive this challan?')) return;
        const r = AdmissionService.waiveChallan(btn.dataset.waive, 'Manual waiver');
        if (!r.success) { Toast.error(r.message); return; }
        Toast.success('Fee waived. Student activated.');
        doSearch();
      });
    });
  };

  body.querySelector('#admPaySearchBtn')?.addEventListener('click', doSearch);
  body.querySelector('#admPaySearch')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
  });
}

// ─────────────────────────────────────────────────────────────
// TAB 5 — Batch View
// ─────────────────────────────────────────────────────────────

function _renderBatchView(body) {
  const campuses = getAccessibleCampuses();

  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      <select id="admBvCampus" class="filter-select">
        <option value="">All Campuses</option>
        ${campuses.map(c => `<option value="${c.id}">${c.campusName}</option>`).join('')}
      </select>
    </div>
    <div id="admBvContent"></div>`;

  const render = () => {
    const campusId = body.querySelector('#admBvCampus')?.value || '';
    const content  = body.querySelector('#admBvContent');

    let batches = AppState.get('batches') || [];
    if (campusId) batches = batches.filter(b => b.campusId === campusId);

    // Only batches that have admitted students
    const admissions = getAdmissions({ campusId: campusId || undefined });
    const activeBatchIds = [...new Set(admissions.map(a => a.batchId))];
    batches = batches.filter(b => activeBatchIds.includes(b.id));

    if (!batches.length) {
      content.innerHTML = _emptyState('No batches with admissions.', 'Admissions will appear here once students are enrolled.');
      return;
    }

    content.innerHTML = batches.map(batch => {
      const campus  = AppState.findById('campuses',    batch.campusId);
      const disc    = AppState.findById('disciplines', batch.disciplineId);
      const batchAdm = admissions.filter(a => a.batchId === batch.id);
      const confirmed = batchAdm.filter(a => a.status === ADMISSION_STATUS.CONFIRMED).length;
      const pending   = batchAdm.filter(a => a.status === ADMISSION_STATUS.PENDING).length;

      // Get student records for this batch
      const students = (AppState.get('students') || []).filter(s => s.batchId === batch.id);

      return `
        <div class="panel" style="margin-bottom:16px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
            <div>
              <div style="font-size:15px;font-weight:700;color:var(--t1)">${batch.batchName}</div>
              <div style="font-size:12px;color:var(--t3);margin-top:2px">
                ${campus?.campusName || '—'}  ·  ${disc?.abbreviation || '—'}
              </div>
            </div>
            <div style="display:flex;gap:8px">
              ${_statPill('Confirmed', confirmed, '#10b981')}
              ${_statPill('Pending',   pending,   '#f59e0b')}
            </div>
          </div>

          ${students.length ? `
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Student Name</th>
                  <th>CNIC</th>
                  <th>Phone</th>
                  <th>Session</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                ${students.map((s, i) => `
                  <tr>
                    <td style="color:var(--t3);font-size:12px">${i + 1}</td>
                    <td style="font-weight:600;color:var(--t1)">${s.studentName}</td>
                    <td style="font-family:var(--font-mono);font-size:12px">${s.cnic || s.uniqueId || '—'}</td>
                    <td style="font-size:12.5px">${s.phone || '—'}</td>
                    <td>${s.session || '—'}</td>
                    <td>
                      <span style="color:${s.isActive ? 'var(--green)' : 'var(--yellow)'};font-size:12px;font-weight:600">
                        ${s.isActive ? '● Active' : '○ Pending'}
                      </span>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>` : `
          <div style="color:var(--t3);font-size:13px;padding:12px 0">
            No students enrolled yet.
          </div>`}
        </div>`;
    }).join('');
  };

  body.querySelector('#admBvCampus')?.addEventListener('change', render);
  render();
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function _statusBadge(status) {
  const map = {
    [ADMISSION_STATUS.CONFIRMED]: { label: 'Confirmed', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
    [ADMISSION_STATUS.PENDING]:   { label: 'Pending',   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
    [ADMISSION_STATUS.CANCELLED]: { label: 'Cancelled', color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
    [ADMISSION_STATUS.DRAFT]:     { label: 'Draft',     color: '#8892b4', bg: 'rgba(136,146,180,0.12)' },
  };
  const s = map[status] || map[ADMISSION_STATUS.DRAFT];
  return `<span style="display:inline-flex;align-items:center;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;background:${s.bg};color:${s.color}">${s.label}</span>`;
}

function _challanBadge(status) {
  const map = {
    [CHALLAN_STATUS.PAID]:    { label: 'Paid',    color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
    [CHALLAN_STATUS.PENDING]: { label: 'Pending', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
    [CHALLAN_STATUS.WAIVED]:  { label: 'Waived',  color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)'  },
    [CHALLAN_STATUS.OVERDUE]: { label: 'Overdue', color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
  };
  const s = map[status] || map[CHALLAN_STATUS.PENDING];
  return `<span style="display:inline-flex;align-items:center;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;background:${s.bg};color:${s.color}">${s.label}</span>`;
}

function _statPill(label, count, color) {
  return `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600;background:${color}18;color:${color}">
    ${label}: ${count}
  </span>`;
}

function _emptyState(title, sub) {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                min-height:200px;color:var(--t3);gap:8px;border:1px dashed var(--border2);
                border-radius:var(--r-lg);padding:32px">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
      <div style="font-size:14px;font-weight:600;color:var(--t2)">${title}</div>
      <div style="font-size:12px">${sub}</div>
    </div>`;
}

function _isOverdue(challan) {
  if (!challan.dueDate || challan.status !== CHALLAN_STATUS.PENDING) return false;
  return new Date(challan.dueDate) < new Date();
}

function _fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}

function _ico(name) {
  const icons = {
    'user-plus':   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>`,
    'users':       `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    'file-text':   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    'check-square':`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
    'layers':      `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
    'upload':      `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
    'download':    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    'eye':         `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  };
  return icons[name] || '';
}

// ─────────────────────────────────────────────────────────────
// TAB 6 — Bulk Import  (clean rewrite)
// ─────────────────────────────────────────────────────────────

function _renderImport(body) {
  body.innerHTML = `
    <div style="max-width:860px;margin:0 auto">

      <!-- ── Page Header ── -->
      <div style="display:flex;align-items:flex-start;justify-content:space-between;
                  flex-wrap:wrap;gap:12px;margin-bottom:24px">
        <div>
          <div style="font-size:17px;font-weight:700;color:var(--t1);margin-bottom:4px">
            Bulk Student Import
          </div>
          <div style="font-size:12.5px;color:var(--t3)">
            Upload a CSV file to add multiple students, enrolments and subjects at once
          </div>
        </div>
        <button id="impSampleBtn" style="
            display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 16px;
            border-radius:var(--r-sm);border:1px solid var(--border2);
            background:var(--surface2);color:var(--t2);font-size:12.5px;font-weight:600;
            cursor:pointer;white-space:nowrap;transition:background .15s">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Sample CSV
        </button>
      </div>

      <!-- ── Mode Cards ── -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px">

        <!-- Mode A -->
        <div style="padding:14px 16px;border-radius:var(--r-md);
                    background:rgba(99,102,241,.06);border:1px solid rgba(99,102,241,.2)">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="font-size:11px;font-weight:700;color:#6366f1;
                         background:rgba(99,102,241,.12);padding:2px 8px;border-radius:20px">
              MODE A
            </span>
            <span style="font-size:12px;font-weight:700;color:var(--t1)">Student Info Only</span>
          </div>
          <div style="font-size:11.5px;color:var(--t2);line-height:1.65">
            <code style="font-size:10.5px;background:var(--surface3);padding:1px 5px;border-radius:3px">
              batchName</code> and
            <code style="font-size:10.5px;background:var(--surface3);padding:1px 5px;border-radius:3px">
              subjectCode</code> both empty
          </div>
          <div style="margin-top:8px;font-size:11px;color:var(--t3);line-height:1.6">
            • Saves to Students module only<br>
            • CNIC already exists → row skipped (no duplicate)<br>
            • No enrolment or admission created
          </div>
        </div>

        <!-- Mode B -->
        <div style="padding:14px 16px;border-radius:var(--r-md);
                    background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.2)">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="font-size:11px;font-weight:700;color:#10b981;
                         background:rgba(16,185,129,.12);padding:2px 8px;border-radius:20px">
              MODE B
            </span>
            <span style="font-size:12px;font-weight:700;color:var(--t1)">Batch Enrolment</span>
          </div>
          <div style="font-size:11.5px;color:var(--t2);line-height:1.65">
            Fill <code style="font-size:10.5px;background:var(--surface3);padding:1px 5px;border-radius:3px">
              batchName</code>, leave
            <code style="font-size:10.5px;background:var(--surface3);padding:1px 5px;border-radius:3px">
              subjectCode</code> empty
          </div>
          <div style="margin-top:8px;font-size:11px;color:var(--t3);line-height:1.6">
            • New student → Students + Admissions + Enrolments<br>
            • Existing student → enrolment added only<br>
            • Batch not in system → <b style="color:#ef4444">hard error</b>
          </div>
        </div>

        <!-- Mode C -->
        <div style="padding:14px 16px;border-radius:var(--r-md);
                    background:rgba(6,182,212,.06);border:1px solid rgba(6,182,212,.2)">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="font-size:11px;font-weight:700;color:#06b6d4;
                         background:rgba(6,182,212,.12);padding:2px 8px;border-radius:20px">
              MODE C
            </span>
            <span style="font-size:12px;font-weight:700;color:var(--t1)">Subject / Freeze</span>
          </div>
          <div style="font-size:11.5px;color:var(--t2);line-height:1.65">
            Fill <code style="font-size:10.5px;background:var(--surface3);padding:1px 5px;border-radius:3px">
              subjectCode</code> (batchName optional)
          </div>
          <div style="margin-top:8px;font-size:11px;color:var(--t3);line-height:1.6">
            • Student must already exist (matched by CNIC)<br>
            • Subject added to existing enrolment<br>
            • Default status: <code style="font-size:10px">suspended</code>
          </div>
        </div>
      </div>

      <!-- ── Drop Zone ── -->
      <div id="impDropZone" style="
          border:2px dashed var(--border2);border-radius:var(--r-lg);
          padding:40px 24px;text-align:center;cursor:pointer;
          transition:border-color .2s,background .2s;
          background:var(--surface);margin-bottom:16px">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--t4)"
             stroke-width="1.5" style="margin-bottom:12px">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <div style="font-size:14px;font-weight:600;color:var(--t2)">
          Drop a CSV file here or click to browse
        </div>
        <div style="font-size:11.5px;color:var(--t4);margin-top:5px">
          .csv files only • UTF-8 encoding recommended
        </div>
        <input id="impFileInput" type="file" accept=".csv,text/csv" style="display:none">
      </div>

      <!-- ── File Info + Action Bar (hidden until file loaded) ── -->
      <div id="impActionBar" style="display:none;margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;
                    background:var(--surface2);border:1px solid var(--border);
                    border-radius:var(--r-md);margin-bottom:12px">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span id="impFileName" style="font-size:13px;font-weight:600;color:var(--t1);flex:1"></span>
          <button id="impClearBtn" style="
              height:28px;padding:0 12px;border-radius:var(--r-sm);
              border:1px solid var(--border);background:transparent;
              color:var(--t3);font-size:11.5px;cursor:pointer">
            Remove
          </button>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button id="impPreviewBtn" style="
              display:inline-flex;align-items:center;gap:8px;height:38px;padding:0 20px;
              border-radius:var(--r-sm);border:1px solid var(--border2);
              background:var(--surface2);color:var(--t1);font-size:13px;font-weight:600;
              cursor:pointer;transition:background .15s">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            Preview (Dry Run)
          </button>
          <button id="impRunBtn" style="
              display:inline-flex;align-items:center;gap:8px;height:38px;padding:0 20px;
              border-radius:var(--r-sm);border:none;
              background:var(--blue,#3b82f6);color:#fff;font-size:13px;font-weight:600;
              cursor:pointer;transition:opacity .15s">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Import Now
          </button>
        </div>
      </div>

      <!-- ── Results area ── -->
      <div id="impResults"></div>
    </div>`;

  let _csvText  = '';
  let _fileName = '';

  // ── Sample CSV download ────────────────────────────────────
  body.querySelector('#impSampleBtn').addEventListener('click', () => {
    const csv  = generateSampleCSV();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {
      href: url, download: 'BulkImport-Sample.csv',
    }).click();
    URL.revokeObjectURL(url);
  });

  // ── Drop zone ─────────────────────────────────────────────
  const dropZone  = body.querySelector('#impDropZone');
  const fileInput = body.querySelector('#impFileInput');

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--blue,#3b82f6)';
    dropZone.style.background  = 'rgba(59,130,246,.04)';
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = '';
    dropZone.style.background  = '';
  });
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.style.borderColor = '';
    dropZone.style.background  = '';
    const file = e.dataTransfer.files[0];
    if (file) _loadFile(file);
  });
  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) _loadFile(e.target.files[0]);
  });

  body.querySelector('#impClearBtn').addEventListener('click', () => {
    _csvText  = '';
    _fileName = '';
    fileInput.value = '';
    body.querySelector('#impActionBar').style.display = 'none';
    body.querySelector('#impResults').innerHTML = '';
  });

  function _loadFile(file) {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      Toast.error('Only .csv files are allowed.');
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      _csvText  = ev.target.result;
      _fileName = file.name;
      body.querySelector('#impFileName').textContent    = file.name;
      body.querySelector('#impActionBar').style.display = 'block';
      body.querySelector('#impResults').innerHTML       = '';
    };
    reader.readAsText(file, 'UTF-8');
  }

  // ── Progress bar helper ────────────────────────────────────
  function _showProgress(label) {
    const res = body.querySelector('#impResults');
    res.innerHTML = `
      <div style="padding:24px 0;text-align:center">
        <div style="font-size:13px;font-weight:600;color:var(--t1);margin-bottom:14px" id="impProgressLabel">
          ${label}
        </div>
        <div style="background:var(--surface2);border:1px solid var(--border);
                    border-radius:20px;height:10px;overflow:hidden;max-width:420px;margin:0 auto">
          <div id="impProgressBar"
               style="height:100%;width:0%;background:var(--blue,#3b82f6);
                      border-radius:20px;transition:width .15s ease"></div>
        </div>
        <div style="font-size:11.5px;color:var(--t3);margin-top:10px" id="impProgressCount">0 / 0 rows</div>
      </div>`;
  }

  function _updateProgress(done, total) {
    const pct  = total > 0 ? Math.round((done / total) * 100) : 0;
    const bar  = body.querySelector('#impProgressBar');
    const cnt  = body.querySelector('#impProgressCount');
    if (bar) bar.style.width = pct + '%';
    if (cnt) cnt.textContent  = done + ' / ' + total + ' rows (' + pct + '%)';
  }

  function _setButtons(disabled) {
    const previewBtn = body.querySelector('#impPreviewBtn');
    const runBtn     = body.querySelector('#impRunBtn');
    if (previewBtn) previewBtn.disabled = disabled;
    if (runBtn)     runBtn.disabled     = disabled;
    if (runBtn)     runBtn.style.opacity = disabled ? '0.6' : '1';
  }

  // ── Preview (dry run) ──────────────────────────────────────
  body.querySelector('#impPreviewBtn').addEventListener('click', async () => {
    if (!_csvText) return;
    _setButtons(true);
    _showProgress('Previewing rows…');
    const summary = await processBulkImportAsync(
      _csvText,
      { dryRun: true },
      (done, total) => _updateProgress(done, total),
    );
    _renderImportResults(body, summary, true);
    _setButtons(false);
  });

  // ── Actual import ──────────────────────────────────────────
  body.querySelector('#impRunBtn').addEventListener('click', async () => {
    if (!_csvText) return;

    // Single dry-run to check for errors — no double processing on actual import
    _setButtons(true);
    _showProgress('Checking rows…');
    const dryResult = await processBulkImportAsync(
      _csvText,
      { dryRun: true },
      (done, total) => _updateProgress(done, total),
    );

    const hasCriticalErrors = dryResult.errors.length > 0;
    const confirmMsg = hasCriticalErrors
      ? 'Some rows have errors.\n\nOnly valid rows will be imported; error rows will be skipped.\n\nProceed?'
      : 'Data will be permanently saved.\n\nProceed with import?';

    if (!confirm(confirmMsg)) {
      body.querySelector('#impResults').innerHTML = '';
      _setButtons(false);
      return;
    }

    const importedBy = Auth.getCurrentUser()?.userId || null;
    _showProgress('Importing students…');
    const summary = await processBulkImportAsync(
      _csvText,
      { dryRun: false, importedBy },
      (done, total) => _updateProgress(done, total),
    );
    _renderImportResults(body, summary, false);

    // Reset file state
    _csvText  = '';
    _fileName = '';
    body.querySelector('#impActionBar').style.display = 'none';
    body.querySelector('#impFileName').textContent    = '';
    fileInput.value = '';
    _setButtons(false);
  });
}

// ── Import Results Renderer ────────────────────────────────────
function _renderImportResults(body, summary, isDryRun) {
  const res = body.querySelector('#impResults');
  if (!res) return;

  // ── Status config ─────────────────────────────────────────
  const STATUS = {
    imported_paid:    { color: '#10b981', icon: '✓', label: 'Imported (Paid)'    },
    imported_pending: { color: '#6366f1', icon: '✓', label: 'Imported (Pending)' },
    info_only:        { color: '#8b5cf6', icon: '●', label: 'Info Saved'         },
    enrolment_added:  { color: '#3b82f6', icon: '↪', label: 'Enrolment Added'    },
    subject_added:    { color: '#06b6d4', icon: '+', label: 'Subject Added'       },
    duplicate:        { color: '#f59e0b', icon: '⚠', label: 'Duplicate Skip'     },
    not_found:        { color: '#f97316', icon: '?', label: 'Not Found'           },
    error:            { color: '#ef4444', icon: '✗', label: 'Error'              },
  };

  // ── Header tag ───────────────────────────────────────────
  const dryRunTag = isDryRun
    ? `<span style="font-size:11px;font-weight:700;color:#f59e0b;
           background:rgba(245,158,11,.12);padding:3px 10px;border-radius:20px;
           letter-spacing:.02em">DRY RUN — no data has been saved</span>`
    : `<span style="font-size:11px;font-weight:700;color:#10b981;
           background:rgba(16,185,129,.12);padding:3px 10px;border-radius:20px;
           letter-spacing:.02em">✓ Import Complete</span>`;

  // ── Stat pills ───────────────────────────────────────────
  const statItems = [
    { label: 'Total Rows',      value: summary.totalRows,         color: '#64748b' },
    { label: 'New Students',    value: summary.imported,          color: '#10b981' },
    { label: 'Info Only',       value: summary.infoOnly || 0,     color: '#8b5cf6' },
    { label: 'Enrolment Added', value: summary.enrolmentOnly,     color: '#3b82f6' },
    { label: 'Subject Added',   value: summary.subjectAdded,      color: '#06b6d4' },
    { label: 'Not Found',       value: summary.notFound || 0,     color: (summary.notFound || 0) > 0 ? '#f97316' : '#64748b' },
    { label: 'Skipped/Errors',  value: summary.skipped,           color: summary.skipped > 0 ? '#ef4444' : '#64748b' },
  ];

  const statsHtml = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">
      ${statItems.map(s => `
        <div style="background:${s.color}12;border:1px solid ${s.color}28;
                    border-radius:var(--r-md);padding:10px 16px;text-align:center;min-width:100px">
          <div style="font-size:22px;font-weight:800;color:${s.color};line-height:1">${s.value}</div>
          <div style="font-size:10.5px;color:var(--t3);margin-top:3px;white-space:nowrap">${s.label}</div>
        </div>`).join('')}
    </div>`;

  // ── Results table ─────────────────────────────────────────
  const rowsHtml = summary.results.map(r => {
    const s = STATUS[r.status] || { color: '#64748b', icon: '·', label: r.status };
    return `
      <tr>
        <td style="font-size:11.5px;color:var(--t4);text-align:center;padding:9px 12px">${r.lineNo}</td>
        <td style="font-weight:600;color:var(--t1);padding:9px 12px">${r.studentName || '—'}</td>
        <td style="font-family:monospace;font-size:11.5px;color:var(--t2);padding:9px 12px">${r.cnic || '—'}</td>
        <td style="padding:9px 12px">
          <span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;
                       color:${s.color};background:${s.color}12;padding:2px 8px;border-radius:20px;
                       white-space:nowrap">
            <span>${s.icon}</span> ${s.label}
          </span>
        </td>
        <td style="font-size:11.5px;color:var(--t3);padding:9px 12px;max-width:280px;
                   word-break:break-word;line-height:1.5">${r.message || ''}</td>
      </tr>`;
  }).join('');

  // ── Error summary (if any) ────────────────────────────────
  const errorCount = summary.results.filter(r => r.status === 'error').length;
  const errorBanner = errorCount > 0 ? `
    <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;
                background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.2);
                border-radius:var(--r-sm);margin-bottom:16px">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <div style="font-size:12.5px;color:#ef4444;font-weight:600">
        ${errorCount} row${errorCount !== 1 ? 's' : ''} have errors — fix them and re-upload
      </div>
    </div>` : '';

  res.innerHTML = `
    <div style="margin-bottom:16px;display:flex;align-items:center;gap:10px;
                border-bottom:1px solid var(--border);padding-bottom:14px">
      <div style="font-size:14px;font-weight:700;color:var(--t1)">Import Summary</div>
      ${dryRunTag}
    </div>
    ${statsHtml}
    ${errorBanner}
    ${summary.results.length ? `
    <div style="border:1px solid var(--border);border-radius:var(--r-md);overflow:hidden">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead>
          <tr style="background:var(--surface2);border-bottom:1px solid var(--border)">
            <th style="padding:9px 12px;font-size:11px;font-weight:600;color:var(--t3);text-align:center;width:48px">Row</th>
            <th style="padding:9px 12px;font-size:11px;font-weight:600;color:var(--t3);text-align:left">Student</th>
            <th style="padding:9px 12px;font-size:11px;font-weight:600;color:var(--t3);text-align:left">CNIC</th>
            <th style="padding:9px 12px;font-size:11px;font-weight:600;color:var(--t3);text-align:left">Status</th>
            <th style="padding:9px 12px;font-size:11px;font-weight:600;color:var(--t3);text-align:left">Detail</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>` : '<div style="color:var(--t3);font-size:13px;padding:12px 0">No rows were processed.</div>'}`;
}
