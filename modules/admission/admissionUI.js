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
// TAB 6 — Bulk Import
// ─────────────────────────────────────────────────────────────

function _renderImport(body) {
  body.innerHTML = `
    <div style="max-width:820px">

      <!-- Header + Sample Download -->
      <div style="display:flex;align-items:center;justify-content:space-between;
                  flex-wrap:wrap;gap:12px;margin-bottom:20px">
        <div>
          <div style="font-size:16px;font-weight:700;color:var(--t1)">Bulk Student Import</div>
          <div style="font-size:12px;color:var(--t3);margin-top:3px">
            Upload a CSV file to add multiple students and enrolments at once
          </div>
        </div>
        <button id="impSampleBtn" class="btn btn-secondary" style="font-size:13px">
          ${_ico('download')} Sample CSV Download
        </button>
      </div>

      <!-- Instructions panel -->
      <div style="background:var(--bg2);border:1px solid var(--border1);border-radius:var(--r-md);
                  padding:14px 16px;margin-bottom:20px;font-size:12.5px;color:var(--t2);line-height:1.7">
        <div style="font-weight:700;margin-bottom:8px;color:var(--t1)">Two Import Modes</div>

        <div style="font-weight:600;color:var(--t1);margin-bottom:2px">Mode A — Batch Enrolment <span style="font-weight:400;color:var(--t3)">(fill batchName, leave subjectCode empty)</span></div>
        <div>• <b>New student:</b> Added to students, admissions, and enrolments</div>
        <div>• <b>Existing student, new batch:</b> Skipped in students — enrolment added for that batch</div>
        <div>• <b>Same student, different batches:</b> One row per batch — each creates a separate enrolment</div>
        <div>• <b>Already enrolled in same batch:</b> Skipped with error</div>

        <div style="margin-top:10px;font-weight:600;color:var(--t1);margin-bottom:2px">Mode B — Subject / Freeze Import <span style="font-weight:400;color:var(--t3)">(fill subjectCode; batchName optional)</span></div>
        <div>• Student must already exist (matched by CNIC)</div>
        <div>• Appends a subject entry to the student's existing enrolment</div>
        <div>• If batchName is given, attaches to that batch's enrolment; otherwise uses most recent active enrolment</div>
        <div>• Subject already present on that enrolment → skipped with error</div>
        <div>• subjectStatus values: <code>active | dormant | left_campus | change_campus | left_study | exempt</code></div>

        <div style="margin-top:10px;font-weight:600;color:var(--t1);margin-bottom:2px">General</div>
        <div>• <b>challanPaid = yes:</b> Admission confirmed + student set to active</div>
        <div>• <b>Missing optional field:</b> Warning shown, import continues</div>
        <div>• <b>Missing required field / Invalid CNIC / Batch not found:</b> Row skipped with error</div>
        <div style="margin-top:6px;color:var(--t3)">Always run <b>Preview (Dry Run)</b> first to catch errors before committing.</div>
      </div>

      <!-- File upload zone -->
      <div id="impDropZone" style="border:2px dashed var(--border2);border-radius:var(--r-lg);
                                    padding:36px;text-align:center;cursor:pointer;
                                    transition:border-color 0.2s,background 0.2s;
                                    background:var(--bg1);margin-bottom:20px">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="1.5" style="margin-bottom:10px">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <div style="font-size:14px;font-weight:600;color:var(--t2)">Drag a CSV file here or click to browse</div>
        <div style="font-size:12px;color:var(--t3);margin-top:4px">Sirf .csv files</div>
        <input id="impFileInput" type="file" accept=".csv,text/csv" style="display:none">
      </div>

      <!-- Preview + Import buttons (hidden initially) -->
      <div id="impActionBar" style="display:none;gap:10px;flex-wrap:wrap;margin-bottom:20px;align-items:center">
        <button id="impPreviewBtn" class="btn btn-secondary" style="font-size:13px">
          ${_ico('eye')} Preview (Dry Run)
        </button>
        <button id="impRunBtn" class="btn btn-primary" style="font-size:13px">
          ${_ico('upload')} Import Karo
        </button>
        <span id="impFileName" style="font-size:12px;color:var(--t3)"></span>
      </div>

      <!-- Results area -->
      <div id="impResults"></div>
    </div>`;

  let _csvText = '';

  // ── Sample download ────────────────────────────────────────
  body.querySelector('#impSampleBtn').addEventListener('click', () => {
    const csv  = generateSampleCSV();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url, download: 'BulkImport-Sample.csv',
    });
    a.click();
    URL.revokeObjectURL(url);
  });

  // ── Drop zone interactions ─────────────────────────────────
  const dropZone  = body.querySelector('#impDropZone');
  const fileInput = body.querySelector('#impFileInput');

  dropZone.addEventListener('click',    () => fileInput.click());
  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--primary)';
    dropZone.style.background  = 'var(--primary-bg,rgba(99,102,241,0.06))';
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
    const file = e.target.files[0];
    if (file) _loadFile(file);
  });

  function _loadFile(file) {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      Toast.error('Only .csv files are allowed.');
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      _csvText = ev.target.result;
      body.querySelector('#impFileName').textContent    = '📎 ' + file.name;
      body.querySelector('#impActionBar').style.display = 'flex';
      body.querySelector('#impResults').innerHTML       = '';
    };
    reader.readAsText(file, 'UTF-8');
  }

  // ── Preview (dry run) ──────────────────────────────────────
  body.querySelector('#impPreviewBtn').addEventListener('click', () => {
    if (!_csvText) return;
    const summary = processBulkImport(_csvText, { dryRun: true });
    _renderImportResults(body, summary, true);
  });

  // ── Actual import ──────────────────────────────────────────
  body.querySelector('#impRunBtn').addEventListener('click', () => {
    if (!_csvText) return;
    if (!confirm(
      'This will import data and make permanent changes.\n\nHave you run a Preview (Dry Run) first? Do you want to proceed?'
    )) return;

    const importedBy = Auth.getCurrentUser()?.userId || null;
    const summary    = processBulkImport(_csvText, { dryRun: false, importedBy });
    _renderImportResults(body, summary, false);

    // Reset file input
    _csvText = '';
    body.querySelector('#impActionBar').style.display = 'none';
    body.querySelector('#impFileName').textContent    = '';
    body.querySelector('#impFileInput').value         = '';
  });
}

function _renderImportResults(body, summary, isDryRun) {
  const res = body.querySelector('#impResults');
  if (!res) return;

  const tag = isDryRun
    ? `<span style="font-size:11px;font-weight:700;color:#f59e0b;background:rgba(245,158,11,0.12);padding:2px 8px;border-radius:20px">DRY RUN — no data has been saved</span>`
    : `<span style="font-size:11px;font-weight:700;color:#10b981;background:rgba(16,185,129,0.12);padding:2px 8px;border-radius:20px">Import Complete</span>`;

  const statsHtml = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      ${_impPill('Total Rows',      summary.totalRows,     '#8892b4')}
      ${_impPill('Imported',        summary.imported,      '#10b981')}
      ${_impPill('Enrolment Added', summary.enrolmentOnly, '#6366f1')}
      ${_impPill('Subject Added',   summary.subjectAdded,  '#06b6d4')}
      ${_impPill('Skipped/Errors',  summary.skipped,       summary.skipped > 0 ? '#ef4444' : '#8892b4')}
    </div>`;

  const statusStyleMap = {
    imported_paid:    { color: '#10b981', label: '✓ Imported (Paid)'    },
    imported_pending: { color: '#6366f1', label: '✓ Imported (Pending)' },
    enrolment_added:  { color: '#8b5cf6', label: '↪ Enrolment Added'    },
    subject_added:    { color: '#06b6d4', label: '＋ Subject Added'      },
    duplicate:        { color: '#f59e0b', label: '⚠ Duplicate Skip'     },
    error:            { color: '#ef4444', label: '✗ Error'              },
  };

  const rowsHtml = summary.results.map(r => {
    const s = statusStyleMap[r.status] || { color: '#8892b4', label: r.status };
    return `
      <tr>
        <td style="font-size:12px;color:var(--t3)">${r.lineNo}</td>
        <td style="font-weight:600;color:var(--t1)">${r.studentName || '—'}</td>
        <td style="font-family:var(--font-mono);font-size:12px">${r.cnic || '—'}</td>
        <td><span style="font-size:11px;font-weight:700;color:${s.color}">${s.label}</span></td>
        <td style="font-size:11.5px;color:var(--t3);max-width:260px;word-break:break-word">${r.message || ''}</td>
      </tr>`;
  }).join('');

  res.innerHTML = `
    <div style="margin-bottom:10px;display:flex;align-items:center;gap:10px">
      <div style="font-size:14px;font-weight:700;color:var(--t1)">Import Summary</div>
      ${tag}
    </div>
    ${statsHtml}
    ${summary.results.length ? `
    <div class="table-wrap">
      <table class="data-table" style="font-size:12.5px">
        <thead>
          <tr>
            <th style="width:48px">Row</th>
            <th>Student</th>
            <th>CNIC</th>
            <th>Status</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>` : '<div style="color:var(--t3);font-size:13px">No rows were processed.</div>'}`;
}

function _impPill(label, count, color) {
  return `
    <div style="background:${color}18;border:1px solid ${color}30;border-radius:var(--r-md);
                padding:8px 14px;text-align:center;min-width:90px">
      <div style="font-size:20px;font-weight:800;color:${color}">${count}</div>
      <div style="font-size:11px;color:var(--t3);margin-top:2px">${label}</div>
    </div>`;
}
