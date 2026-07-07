// ============================================================
// modules/analytics/reports/batches/prcConversionTracking.js
// Report: PRC → CAF Conversion Tracking  (Discipline: CA only)
// Tracks students starting in PRC:
//   BEI (P3), FA (P1), ECS, QAB
// and follows how many progress into CAF —
//   Group A: FAR (C1), TPC (C2), DSR (C3), BLD (C4)
//   Group B: MA  (C5), CR  (C6), BIA (C7), AAE (C8)
// Data source: AppState enrolments + batches + students
// ============================================================

import { AppState } from '../../../../utils/state.js';

// ── Subject registry ──────────────────────────────────────────
const PRC_SUBJECTS = [
  { code: 'BEI', label: 'BEI (P3)' },
  { code: 'FA',  label: 'FA (P1)'  },
  { code: 'ECS', label: 'ECS'      },
  { code: 'QAB', label: 'QAB (P2)' },
];

const CAF_GROUP_A = [
  { code: 'FAR', label: 'FAR (C1)' },
  { code: 'TPC', label: 'TPC (C2)' },
  { code: 'DSR', label: 'DSR (C3)' },
  { code: 'BLD', label: 'BLD (C4)' },
];

const CAF_GROUP_B = [
  { code: 'MA',  label: 'MA (C5)'  },
  { code: 'CR',  label: 'CR (C6)'  },
  { code: 'BIA', label: 'BIA (C7)' },
  { code: 'AAE', label: 'AAE (C8)' },
];

const ALL_SUBJECTS  = [...PRC_SUBJECTS, ...CAF_GROUP_A, ...CAF_GROUP_B];
const ALL_CODES     = ALL_SUBJECTS.map(s => s.code);
const GROUP_A_CODES = CAF_GROUP_A.map(s => s.code);
const GROUP_B_CODES = CAF_GROUP_B.map(s => s.code);

const PROGRESS_OPTIONS = [
  { id: 'all',      label: 'All Students'      },
  { id: 'moved',    label: 'Moved to CAF'      },
  { id: 'notmoved', label: 'Not Moved Yet'     },
  { id: 'groupA',   label: 'Group A Enrolled'  },
  { id: 'groupB',   label: 'Group B Enrolled'  },
  { id: 'both',     label: 'Both Groups'       },
];

// ── Styles (injected once) ────────────────────────────────────
let _stylesInjected = false;
function injectStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const s = document.createElement('style');
  s.textContent = `
.pct-wrap { display:flex; flex-direction:column; gap:20px; }

.pct-header-row {
  display:flex; align-items:center; justify-content:space-between;
  gap:12px; flex-wrap:wrap;
}
.pct-header-title {
  font-family:var(--font-display);
  font-size:15px; font-weight:700; color:var(--t1);
}
.pct-header-sub { font-size:12px; color:var(--t3); margin-top:2px; }

.pct-export-btn {
  display:inline-flex; align-items:center; gap:6px;
  padding:7px 16px;
  border-radius:var(--r-sm);
  font-size:12.5px; font-weight:700;
  color:var(--blue); background:var(--blue-dim);
  border:1px solid rgba(79,133,247,.18);
  cursor:pointer; transition:opacity .15s; white-space:nowrap;
}
.pct-export-btn:hover { opacity:.85; }

/* KPI cards */
.pct-kpi-row {
  display:grid;
  grid-template-columns: repeat(6, 1fr);
  gap:12px;
}
@media(max-width:1200px){ .pct-kpi-row{ grid-template-columns:repeat(3,1fr); } }
@media(max-width:640px){  .pct-kpi-row{ grid-template-columns:1fr 1fr; } }

.pct-kpi {
  background:var(--surface);
  border:1px solid var(--border);
  border-radius:var(--r-lg);
  padding:14px 16px;
  display:flex; flex-direction:column; gap:4px;
}
.pct-kpi-val { font-family:var(--font-display); font-size:24px; font-weight:800; color:var(--t1); line-height:1.1; }
.pct-kpi-lbl { font-size:11.5px; color:var(--t2); font-weight:500; }
.pct-kpi-sub { font-size:10.5px; color:var(--t3); margin-top:2px; }
.pct-kpi-bar-wrap { height:3px; background:var(--surface3); border-radius:3px; margin-top:6px; overflow:hidden; }
.pct-kpi-bar      { height:100%; border-radius:3px; width:0; transition:width .9s cubic-bezier(.16,1,.3,1); }

/* Funnel */
.pct-funnel-wrap {
  background:var(--surface);
  border:1px solid var(--border);
  border-radius:var(--r-lg);
  padding:20px 24px;
}
.pct-funnel-title { font-family:var(--font-display); font-size:13.5px; font-weight:700; color:var(--t1); margin-bottom:16px; }
.pct-funnel-steps { display:flex; flex-direction:column; gap:10px; }
.pct-funnel-step  { display:flex; align-items:center; gap:12px; }
.pct-funnel-lbl   { font-size:12px; font-weight:600; color:var(--t2); min-width:110px; }
.pct-funnel-bar-bg { flex:1; height:28px; background:var(--surface2); border-radius:6px; overflow:hidden; }
.pct-funnel-bar-fill {
  height:100%; border-radius:6px;
  display:flex; align-items:center; padding-left:12px;
  font-size:11.5px; font-weight:700; color:#fff;
  transition:width .9s cubic-bezier(.16,1,.3,1);
  width:0; white-space:nowrap; min-width:0;
}
.pct-funnel-pct { font-size:11px; color:var(--t3); min-width:38px; text-align:right; }

/* Filter bar */
.pct-filter-bar {
  display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end;
  background:var(--surface);
  border:1px solid var(--border);
  border-radius:var(--r-lg);
  padding:14px 16px;
}
.pct-filter-group { display:flex; flex-direction:column; gap:4px; flex:1; min-width:150px; }
.pct-filter-label { font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--t3); }
.pct-filter-input,
.pct-filter-select {
  padding:6px 10px;
  border-radius:var(--r-sm);
  border:1px solid var(--border);
  background:var(--surface2);
  color:var(--t1);
  font-size:12.5px;
  outline:none;
  width:100%;
  font-family:inherit;
}
.pct-filter-select { cursor:pointer; }
.pct-filter-input:focus, .pct-filter-select:focus { border-color:var(--blue); }
.pct-filter-reset {
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
.pct-filter-reset:hover { background:var(--red-dim); color:var(--red); border-color:var(--red); }

/* Table */
.pct-table-wrap { overflow-x:auto; border:1px solid var(--border); border-radius:var(--r-lg); }
.pct-table { width:100%; border-collapse:collapse; font-size:13px; min-width:980px; }
.pct-th-group {
  padding:10px 14px;
  font-size:11px; font-weight:700;
  text-transform:uppercase; letter-spacing:.07em;
  text-align:center;
  border-bottom:1px solid var(--border);
  border-right:2px solid var(--border2);
  white-space:nowrap;
}
.pct-th-group:last-child { border-right:none; }
.pct-table th {
  background:var(--surface2);
  color:var(--t3);
  font-size:10.5px; font-weight:600;
  text-transform:uppercase; letter-spacing:.06em;
  padding:9px 10px;
  text-align:left;
  border-bottom:1px solid var(--border);
  white-space:nowrap;
}
.pct-table td {
  padding:9px 10px;
  border-bottom:1px solid var(--border);
  color:var(--t2);
  vertical-align:middle;
  white-space:nowrap;
}
.pct-table tbody tr:last-child td { border-bottom:none; }
.pct-table tbody tr:hover td { background:var(--surface2); }
.pct-col-sep { border-left:2px solid var(--border2); }

.pct-student-name { font-weight:600; color:var(--t1); font-size:13px; }
.pct-student-id   { font-size:11px; color:var(--t3); margin-top:2px; }
.pct-dash { color:var(--t4); font-size:13px; }

.pct-sub-cell { display:flex; flex-direction:column; gap:2px; }
.pct-session-pill {
  display:inline-flex; align-items:center;
  padding:2px 8px; border-radius:20px;
  font-size:10.5px; font-weight:600;
  background:var(--blue-dim); color:var(--blue);
  white-space:nowrap; align-self:flex-start;
}
.pct-batch-no { font-size:11px; color:var(--t3); }

.pct-badge {
  display:inline-flex; align-items:center;
  padding:2px 8px; border-radius:20px;
  font-size:10.5px; font-weight:600;
  white-space:nowrap;
}
.pct-badge-active        { background:var(--green-dim);      color:var(--green); }
.pct-badge-dormant       { background:rgba(136,146,180,.12);  color:var(--t2);    }
.pct-badge-left_study    { background:var(--red-dim);         color:var(--red);   }
.pct-badge-left_campus   { background:var(--red-dim);         color:var(--red);   }
.pct-badge-change_campus { background:var(--yellow-dim);      color:var(--yellow);}
.pct-badge-exempt        { background:var(--blue-dim);        color:var(--blue);  }
.pct-badge-completed     { background:var(--cyan-dim);        color:var(--cyan);  }

.pct-group-pill {
  display:inline-flex; align-items:center;
  padding:2px 9px; border-radius:20px;
  font-size:10.5px; font-weight:700;
}

.pct-empty {
  display:flex; flex-direction:column; align-items:center;
  justify-content:center; gap:12px;
  padding:60px 20px; color:var(--t3); text-align:center;
}
.pct-empty p    { font-size:13.5px; font-weight:500; color:var(--t2); }
.pct-empty span { font-size:12.5px; }
`;
  document.head.appendChild(s);
}

// ── Main export ───────────────────────────────────────────────
export const PrcConversionTracking = {

  _container: null,
  _search:         '',
  _sessionFilter:  'all',
  _batchFilter:    'all',
  _progressFilter: 'all',

  mount(container) {
    if (!container) return;
    injectStyles();
    this._container = container;
    this._render();
  },

  _render() {
    const c = this._container;
    const allData = this._buildData();

    c.innerHTML = `
      <div class="pct-wrap">

        <div class="pct-header-row">
          <div>
            <div class="pct-header-title">PRC → CAF Conversion Tracking</div>
            <div class="pct-header-sub">Discipline: CA &nbsp;·&nbsp; PRC (BEI, FA, ECS, QAB) → CAF Group A / Group B</div>
          </div>
          <button class="pct-export-btn" id="pctExportBtn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export PDF
          </button>
        </div>

        <div id="pctKpiRow"></div>
        <div id="pctFunnel"></div>
        <div id="pctFilterBar"></div>
        <div id="pctTableWrap"></div>
      </div>
    `;

    c.querySelector('#pctExportBtn').addEventListener('click', () => this._exportPDF(allData));

    this._renderBody(allData);
  },

  _renderBody(allData) {
    const c = this._container;
    c.querySelector('#pctKpiRow').innerHTML   = this._kpiHTML(allData);
    c.querySelector('#pctFunnel').innerHTML   = this._funnelHTML(allData);
    c.querySelector('#pctFilterBar').innerHTML = this._filterBarHTML(allData);
    this._renderTable(allData);
    this._bindFilterEvents(allData);
    this._animateBars();
  },

  _animateBars() {
    requestAnimationFrame(() => {
      this._container.querySelectorAll('[data-w]').forEach(el => {
        el.style.width = el.dataset.w;
      });
    });
  },

  // ── Data ───────────────────────────────────────────────────
  _buildData() {
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

        const batchName    = sub.batchName || batchRec.batchName || '';
        const parts        = batchName.split('-');
        // Subject may be stored with a paper suffix, e.g. "BEI (P3)", "FA (P1)", "QAB (P2)".
        // Strip the "(...)" part so it matches the plain code (BEI, FA, QAB, ...).
        const rawSubject   = (parts[0] || '').trim();
        const subjectCode  = rawSubject.split('(')[0].trim().toUpperCase();
        // Scope to CA-only subject codes used in this report (PRC + CAF Group A/B)
        if (!ALL_CODES.includes(subjectCode)) return;

        const rawSession = parts.length >= 3
          ? parts.slice(1, parts.length - 1).join('-')
          : '—';
        const session = rawSession === '—' ? '—' : _normalizeSession(rawSession);
        const batchNo = parts[parts.length - 1] || '—';

        if (!map[enr.studentId]) {
          const campusRec = batchRec.campusId ? campuses.find(c => c.id === batchRec.campusId) : null;
          const campusName = campusRec
            ? (campusRec.campusName || '').replace(/\s*campus$/i, '').trim() || campusRec.campusName
            : (student.campus || student.campusName || '');

          map[enr.studentId] = {
            studentId:   enr.studentId,
            studentName: student.studentName || '—',
            studentCode: student.studentCode || student.admissionNo || '',
            campusName:  campusName || '—',
            subjects:    {},
          };
        }

        if (!map[enr.studentId].subjects[subjectCode]) {
          map[enr.studentId].subjects[subjectCode] = {
            session,
            batchNo,
            status: sub.status || enr.status || 'active',
          };
        }
      });
    });

    // Base population: students with at least one PRC subject
    const rows = Object.values(map).filter(r =>
      PRC_SUBJECTS.some(s => r.subjects[s.code])
    );

    rows.forEach(r => {
      r.prcCount    = PRC_SUBJECTS.filter(s => r.subjects[s.code]).length;
      r.groupACount = CAF_GROUP_A.filter(s => r.subjects[s.code]).length;
      r.groupBCount = CAF_GROUP_B.filter(s => r.subjects[s.code]).length;
      r.movedToCAF  = r.groupACount > 0 || r.groupBCount > 0;
    });

    rows.sort((a, b) => a.studentName.localeCompare(b.studentName));

    const counts = {
      prcTotal: rows.length,
      movedCAF: rows.filter(r => r.movedToCAF).length,
      groupA:   rows.filter(r => r.groupACount > 0).length,
      groupB:   rows.filter(r => r.groupBCount > 0).length,
      both:     rows.filter(r => r.groupACount > 0 && r.groupBCount > 0).length,
    };

    return { rows, counts };
  },

  // ── Filtering (search / session / batch / progress) ────────
  _filteredRows(allData) {
    const q = this._search.trim().toLowerCase();
    return allData.rows.filter(r => {
      if (q && !(`${r.studentName} ${r.studentCode}`.toLowerCase().includes(q))) return false;

      if (this._sessionFilter !== 'all') {
        const hasSession = ALL_CODES.some(code =>
          r.subjects[code] && r.subjects[code].session === this._sessionFilter
        );
        if (!hasSession) return false;
      }

      if (this._batchFilter !== 'all') {
        const hasBatch = ALL_CODES.some(code =>
          r.subjects[code] && r.subjects[code].batchNo === this._batchFilter
        );
        if (!hasBatch) return false;
      }

      switch (this._progressFilter) {
        case 'moved':    if (!r.movedToCAF) return false; break;
        case 'notmoved': if (r.movedToCAF) return false; break;
        case 'groupA':   if (r.groupACount === 0) return false; break;
        case 'groupB':   if (r.groupBCount === 0) return false; break;
        case 'both':     if (!(r.groupACount > 0 && r.groupBCount > 0)) return false; break;
      }
      return true;
    });
  },

  // ── KPI cards ────────────────────────────────────────────────
  _kpiHTML(data) {
    const { counts } = data;
    const pct = (n, base) => base ? Math.round((n / base) * 100) : 0;

    const kpis = [
      { val: counts.prcTotal, lbl: 'PRC Students', sub: 'Total in PRC batches', color: '#4f85f7', w: '100%' },
      { val: counts.movedCAF, lbl: 'Moved to CAF',  sub: `${pct(counts.movedCAF, counts.prcTotal)}% of PRC`, color: '#f59e0b', w: pct(counts.movedCAF, counts.prcTotal) + '%' },
      { val: counts.groupA,   lbl: 'Group A Enrolled', sub: `${pct(counts.groupA, counts.prcTotal)}% of PRC`, color: '#8b5cf6', w: pct(counts.groupA, counts.prcTotal) + '%' },
      { val: counts.groupB,   lbl: 'Group B Enrolled', sub: `${pct(counts.groupB, counts.prcTotal)}% of PRC`, color: '#10b981', w: pct(counts.groupB, counts.prcTotal) + '%' },
      { val: counts.both,     lbl: 'Both Groups',   sub: `${pct(counts.both, counts.prcTotal)}% of PRC`, color: '#06b6d4', w: pct(counts.both, counts.prcTotal) + '%' },
      { val: pct(counts.movedCAF, counts.prcTotal) + '%', lbl: 'Overall Conversion', sub: 'PRC → CAF reach', color: '#ef4444', w: pct(counts.movedCAF, counts.prcTotal) + '%' },
    ];

    return `
      <div class="pct-kpi-row">
        ${kpis.map(k => `
          <div class="pct-kpi">
            <div class="pct-kpi-val">${k.val}</div>
            <div class="pct-kpi-lbl">${k.lbl}</div>
            <div class="pct-kpi-sub">${k.sub}</div>
            <div class="pct-kpi-bar-wrap">
              <div class="pct-kpi-bar" style="background:${k.color}" data-w="${k.w}"></div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  // ── Funnel ───────────────────────────────────────────────────
  _funnelHTML(data) {
    const { counts } = data;
    const max = counts.prcTotal || 1;
    const steps = [
      { lbl: 'PRC',            count: counts.prcTotal, color: '#4f85f7' },
      { lbl: 'Moved to CAF',   count: counts.movedCAF, color: '#f59e0b' },
      { lbl: 'CAF Group A',    count: counts.groupA,   color: '#8b5cf6' },
      { lbl: 'CAF Group B',    count: counts.groupB,   color: '#10b981' },
      { lbl: 'Both Groups',    count: counts.both,     color: '#06b6d4' },
    ];

    return `
      <div class="pct-funnel-wrap">
        <div class="pct-funnel-title">PRC → CAF Conversion Funnel</div>
        <div class="pct-funnel-steps">
          ${steps.map(st => {
            const pct = Math.round((st.count / max) * 100);
            return `
              <div class="pct-funnel-step">
                <span class="pct-funnel-lbl">${st.lbl}</span>
                <div class="pct-funnel-bar-bg">
                  <div class="pct-funnel-bar-fill" style="background:${st.color}" data-w="${pct}%">${st.count}</div>
                </div>
                <span class="pct-funnel-pct">${pct}%</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  },

  // ── Filter bar ────────────────────────────────────────────────
  _filterBarHTML(allData) {
    const sessions = [...new Set(
      allData.rows.flatMap(r => ALL_CODES.map(code => r.subjects[code]?.session)).filter(s => s && s !== '—')
    )].sort((a, b) => _parseSession(a) - _parseSession(b));

    const batchNos = [...new Set(
      allData.rows.flatMap(r => ALL_CODES.map(code => r.subjects[code]?.batchNo)).filter(b => b && b !== '—')
    )].sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));

    return `
      <div class="pct-filter-bar">
        <div class="pct-filter-group">
          <label class="pct-filter-label">Search Student</label>
          <input type="text" class="pct-filter-input" id="pctSearch" placeholder="Name or ID..." value="${this._search}" />
        </div>
        <div class="pct-filter-group">
          <label class="pct-filter-label">Session</label>
          <select class="pct-filter-select" id="pctSessionFilter">
            <option value="all">All Sessions</option>
            ${sessions.map(s => `<option value="${s}" ${this._sessionFilter === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="pct-filter-group">
          <label class="pct-filter-label">Batch #</label>
          <select class="pct-filter-select" id="pctBatchFilter">
            <option value="all">All Batches</option>
            ${batchNos.map(b => `<option value="${b}" ${this._batchFilter === b ? 'selected' : ''}>Batch ${b}</option>`).join('')}
          </select>
        </div>
        <div class="pct-filter-group">
          <label class="pct-filter-label">Progress</label>
          <select class="pct-filter-select" id="pctProgressFilter">
            ${PROGRESS_OPTIONS.map(o => `<option value="${o.id}" ${this._progressFilter === o.id ? 'selected' : ''}>${o.label}</option>`).join('')}
          </select>
        </div>
        <button class="pct-filter-reset" id="pctFilterReset">Reset Filters</button>
      </div>
    `;
  },

  _bindFilterEvents(allData) {
    const c = this._container;

    c.querySelector('#pctSearch')?.addEventListener('input', e => {
      this._search = e.target.value;
      this._renderTable(allData);
    });
    c.querySelector('#pctSessionFilter')?.addEventListener('change', e => {
      this._sessionFilter = e.target.value;
      this._renderTable(allData);
    });
    c.querySelector('#pctBatchFilter')?.addEventListener('change', e => {
      this._batchFilter = e.target.value;
      this._renderTable(allData);
    });
    c.querySelector('#pctProgressFilter')?.addEventListener('change', e => {
      this._progressFilter = e.target.value;
      this._renderTable(allData);
    });
    c.querySelector('#pctFilterReset')?.addEventListener('click', () => {
      this._search         = '';
      this._sessionFilter  = 'all';
      this._batchFilter    = 'all';
      this._progressFilter = 'all';
      c.querySelector('#pctFilterBar').innerHTML = this._filterBarHTML(allData);
      this._bindFilterEvents(allData);
      this._renderTable(allData);
    });
  },

  // ── Table ──────────────────────────────────────────────────
  _renderTable(allData) {
    const wrap = this._container.querySelector('#pctTableWrap');
    const rows = this._filteredRows(allData);

    if (!rows.length) {
      wrap.innerHTML = `
        <div class="pct-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <p>No students match the current filters</p>
          <span>Try adjusting or resetting the filters above</span>
        </div>
      `;
      return;
    }

    wrap.innerHTML = `
      <div class="pct-table-wrap">
        <table class="pct-table">
          <thead>
            <tr>
              <th rowspan="2" style="vertical-align:middle;width:40px;text-align:center">Sr#</th>
              <th rowspan="2" style="vertical-align:middle">Student Info</th>
              <th colspan="${PRC_SUBJECTS.length}" class="pct-th-group" style="background:var(--blue-dim);color:var(--blue)">PRC</th>
              <th colspan="${CAF_GROUP_A.length}" class="pct-th-group" style="background:rgba(139,92,246,.12);color:#8b5cf6">CAF — Group A</th>
              <th colspan="${CAF_GROUP_B.length}" class="pct-th-group" style="background:rgba(16,185,129,.12);color:#10b981">CAF — Group B</th>
            </tr>
            <tr>
              ${PRC_SUBJECTS.map((s, i) => `<th ${i === 0 ? 'class="pct-col-sep"' : ''}>${s.label}</th>`).join('')}
              ${CAF_GROUP_A.map((s, i) => `<th ${i === 0 ? 'class="pct-col-sep"' : ''}>${s.label}</th>`).join('')}
              ${CAF_GROUP_B.map((s, i) => `<th ${i === 0 ? 'class="pct-col-sep"' : ''}>${s.label}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, i) => this._rowHTML(r, i + 1)).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  _rowHTML(r, sr) {
    const subjCell = (code, sepFirst) => {
      const sub = r.subjects[code];
      const cls = sepFirst ? 'pct-col-sep' : '';
      if (!sub) return `<td class="${cls}"><span class="pct-dash">—</span></td>`;
      return `
        <td class="${cls}">
          <div class="pct-sub-cell">
            <span class="pct-session-pill">${sub.session}${sub.batchNo !== '—' ? ` · B${sub.batchNo}` : ''}</span>
            <span class="pct-badge pct-badge-${sub.status}">${_statusLabel(sub.status)}</span>
          </div>
        </td>
      `;
    };

    return `
      <tr>
        <td style="text-align:center;color:var(--t3);font-weight:600">${sr}</td>
        <td>
          <div class="pct-student-name">${r.studentName}</div>
          ${r.studentCode ? `<div class="pct-student-id">${r.studentCode} &nbsp;·&nbsp; ${r.campusName}</div>` : `<div class="pct-student-id">${r.campusName}</div>`}
        </td>
        ${PRC_SUBJECTS.map((s, i) => subjCell(s.code, i === 0)).join('')}
        ${CAF_GROUP_A.map((s, i) => subjCell(s.code, i === 0)).join('')}
        ${CAF_GROUP_B.map((s, i) => subjCell(s.code, i === 0)).join('')}
      </tr>
    `;
  },

  // ── PDF Export ────────────────────────────────────────────
  _exportPDF(allData) {
    const rows = this._filteredRows(allData);
    const now  = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const groupHeaderRow = `
      <tr>
        <th rowspan="2" style="background:#1e3a8a;width:30px;text-align:center;vertical-align:middle">Sr#</th>
        <th rowspan="2" style="background:#1e3a8a;min-width:150px;border-right:2px solid #fff;vertical-align:middle;text-align:left;padding-left:8px">Student Info</th>
        <th colspan="${PRC_SUBJECTS.length}" style="background:#1e40af;text-align:center">PRC</th>
        <th colspan="${CAF_GROUP_A.length}" style="background:#5b21b6;text-align:center">CAF — Group A</th>
        <th colspan="${CAF_GROUP_B.length}" style="background:#047857;text-align:center">CAF — Group B</th>
      </tr>
      <tr>
        ${PRC_SUBJECTS.map(s => `<th style="background:#1e40af;font-size:9.5px">${s.label}</th>`).join('')}
        ${CAF_GROUP_A.map(s => `<th style="background:#5b21b6;font-size:9.5px">${s.label}</th>`).join('')}
        ${CAF_GROUP_B.map(s => `<th style="background:#047857;font-size:9.5px">${s.label}</th>`).join('')}
      </tr>
    `;

    const cell = (r, code) => {
      const sub = r.subjects[code];
      if (!sub) return `<td style="text-align:center;color:#cbd5e1">—</td>`;
      return `<td>${sub.session}${sub.batchNo !== '—' ? ` · B${sub.batchNo}` : ''}<br><span style="font-size:8.5px;color:#64748b">${_statusLabel(sub.status)}</span></td>`;
    };

    const bodyRows = rows.map((r, idx) => `
      <tr style="background:${idx % 2 === 0 ? '#fff' : '#f8faff'}">
        <td style="text-align:center;color:#64748b;font-weight:600">${idx + 1}</td>
        <td style="text-align:left;padding-left:8px;font-weight:600;color:#1e293b;border-right:2px solid #cbd5e1">${r.studentName}<br><span style="font-size:8.5px;font-weight:400;color:#64748b">${r.studentCode || ''} ${r.campusName ? '· ' + r.campusName : ''}</span></td>
        ${PRC_SUBJECTS.map(s => cell(r, s.code)).join('')}
        ${CAF_GROUP_A.map(s => cell(r, s.code)).join('')}
        ${CAF_GROUP_B.map(s => cell(r, s.code)).join('')}
      </tr>
    `).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>PRC to CAF Conversion Tracking</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:10.5px;color:#1e293b;background:#fff;padding:20px 24px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #2563eb;padding-bottom:12px;margin-bottom:14px}
  .header-left .title{font-size:19px;font-weight:700;color:#1e40af}
  .header-left .subtitle{font-size:11px;color:#64748b;margin-top:2px}
  .header-right{text-align:right;font-size:10.5px;color:#64748b;line-height:1.6}
  .meta-row{display:flex;align-items:center;gap:14px;margin-bottom:14px;flex-wrap:wrap}
  .stat-box{background:#f8faff;border:1px solid #dbeafe;border-radius:8px;padding:6px 14px;text-align:center}
  .stat-box .num{font-size:17px;font-weight:700;color:#2563eb}
  .stat-box .lbl{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.5px}
  table{width:100%;border-collapse:collapse;font-size:10px}
  thead th{color:#fff;font-weight:600;padding:6px 7px;text-align:center;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap}
  tbody td{padding:5px 7px;border-bottom:1px solid #e2e8f0;text-align:center;white-space:nowrap}
  .footer{margin-top:14px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8}
  @media print{body{padding:12px 14px}@page{size:A4 landscape;margin:10mm}.no-print{display:none}}
</style></head><body>
  <div class="header">
    <div class="header-left">
      <div class="title">PRC → CAF Conversion Tracking</div>
      <div class="subtitle">Discipline: CA &nbsp;·&nbsp; PRC → CAF Group A / Group B</div>
    </div>
    <div class="header-right"><div style="font-weight:600;color:#1e293b">${dateStr}</div><div>${timeStr}</div></div>
  </div>
  <div class="meta-row">
    <div class="stat-box"><div class="num">${allData.counts.prcTotal}</div><div class="lbl">PRC Total</div></div>
    <div class="stat-box"><div class="num">${allData.counts.movedCAF}</div><div class="lbl">Moved to CAF</div></div>
    <div class="stat-box"><div class="num">${allData.counts.groupA}</div><div class="lbl">Group A</div></div>
    <div class="stat-box"><div class="num">${allData.counts.groupB}</div><div class="lbl">Group B</div></div>
    <div class="stat-box"><div class="num">${allData.counts.both}</div><div class="lbl">Both Groups</div></div>
  </div>
  <table>
    <thead>${groupHeaderRow}</thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <div class="footer">
    <span>PRC → CAF Conversion Tracking &nbsp;|&nbsp; Exported ${dateStr} at ${timeStr}</span>
    <span>Total: ${rows.length} student${rows.length !== 1 ? 's' : ''}</span>
  </div>
  <div style="margin-top:10px;text-align:center;font-size:10px;color:#94a3b8">Powered by <strong style="color:#2563eb">Learnomist</strong></div>
  <div class="no-print" style="margin-top:18px;text-align:center">
    <button onclick="window.print()" style="padding:9px 28px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Print / Save as PDF</button>
  </div>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const w    = window.open(url, '_blank');
    if (!w) window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  },
};

// ── Session normalizer: "JUNE-26" / "june-26" → "Jun-26" ────
function _normalizeSession(s) {
  if (!s || s === '—') return s;
  return s.split('-').map((p, i) =>
    i === 0 ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p
  ).join('-');
}

// ── Session parser: "Dec-25" → sortable number ───────────────
const _MONTHS = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
function _parseSession(session) {
  if (!session || session === '—') return Infinity;
  const parts = session.toLowerCase().split('-');
  if (parts.length < 2) return Infinity;
  const mon  = _MONTHS[parts[0]] ?? 0;
  const year = parseInt(parts[1], 10) || 0;
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
