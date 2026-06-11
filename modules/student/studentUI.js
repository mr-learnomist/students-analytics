// ============================================================
// modules/student/studentUI.js — Student Module UI
// Simplified: Student ID · CNIC · Name · Discipline ·
//             Date of Admission · Session (auto)
// ============================================================

import { AppState }                     from '../../utils/state.js';
import { Modal, Table, injectUIStyles } from '../../utils/ui.js';
import { Toast }                        from '../../utils/helpers.js';
import { Auth }                         from '../../utils/auth.js';
import {
  StudentService,
  sessionFromDate,
  sessionLabel,
  formatCNIC,
  validateCNIC,
  cnicDigitsOnly,
  migrateStudentIds,
  ROUTE_OPTIONS,
  getDiscRoutes,
} from './studentService.js';

const KEY = 'students';

// ── Icons ─────────────────────────────────────────────────────
const ICONS = {
  add:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  edit:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>`,
  trash:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>`,
  csv:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  upload: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  dl:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  pdf:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>`,
};

// ── CSS ───────────────────────────────────────────────────────
function injectStudentStyles() {
  const existing = document.getElementById('student-module-css');
  if (existing) existing.remove();
  const s = document.createElement('style');
  s.id = 'student-module-css';
  s.textContent = `
    /* ── Toolbar ── */
    .stu-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:20px}
    .stu-search{flex:1;min-width:180px;max-width:300px;height:36px;padding:0 12px 0 36px;
      background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm);
      color:var(--t1);font-size:13px;outline:none;transition:border .15s}
    .stu-search:focus{border-color:var(--blue)}
    .stu-search-wrap{position:relative}
    .stu-search-wrap svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);
      color:var(--t4);pointer-events:none}
    .stu-filter{height:36px;padding:0 10px;background:var(--surface2);
      border:1px solid var(--border);border-radius:var(--r-sm);color:var(--t1);
      font-size:12.5px;outline:none;cursor:pointer}
    .stu-btn{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;
      border-radius:var(--r-sm);font-size:12.5px;font-weight:600;border:none;
      cursor:pointer;transition:opacity .15s,transform .1s;white-space:nowrap}
    .stu-btn:active{transform:scale(.97)}
    .stu-btn--primary{background:var(--blue);color:#fff}
    .stu-btn--primary:hover{opacity:.9}
    .stu-btn--ghost{background:var(--surface2);color:var(--t2);border:1px solid var(--border)}
    .stu-btn--ghost:hover{color:var(--t1);background:var(--surface3)}
    .stu-btn--icon{width:36px;padding:0;justify-content:center}
    .stu-count{font-size:12px;color:var(--t3);white-space:nowrap}

    /* ── Form ── */
    .stu-form .form-group{margin-bottom:16px}
    .stu-form .form-label{display:block;font-size:11.5px;font-weight:600;
      color:var(--t2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
    .stu-form .req{color:#ef4444}
    .stu-form .form-input,.stu-form .form-select{
      width:100%;height:38px;padding:0 12px;box-sizing:border-box;
      background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm);
      color:var(--t1);font-size:13px;outline:none;transition:border .15s}
    .stu-form .form-input:focus,.stu-form .form-select:focus{border-color:var(--blue)}
    .stu-form .form-input.inp-err{border-color:#ef4444!important}
    .stu-form .form-hint{font-size:11.5px;color:var(--t3);margin-top:4px;display:block}
    .stu-form .form-row-2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .stu-form .form-row-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
    .stu-form .readonly-field{height:38px;padding:0 12px;background:var(--surface3);
      border:1px solid var(--border);border-radius:var(--r-sm);color:var(--t2);
      font-size:13px;display:flex;align-items:center;gap:6px}
    .stu-form .session-badge{display:inline-block;padding:2px 10px;border-radius:10px;
      background:var(--blue-dim);color:var(--blue);font-weight:700;font-size:12px;
      font-family:'Inter','Segoe UI',system-ui,sans-serif}
    .stu-form .err-msg{font-size:12px;color:#ef4444;margin-top:4px;display:block}

    /* ── CNIC field ── */
    .cnic-wrap{position:relative}
    .cnic-wrap .form-input{font-family:'Inter','Segoe UI',system-ui,sans-serif;letter-spacing:.06em;padding-right:108px}
    .cnic-preview{position:absolute;right:10px;top:50%;transform:translateY(-50%);
      font-size:10.5px;font-family:'Inter','Segoe UI',system-ui,sans-serif;font-weight:700;
      padding:2px 8px;border-radius:10px;pointer-events:none;transition:all .2s}
    .cnic-preview.ok {background:rgba(16,185,129,.12);color:#10b981}
    .cnic-preview.bad{background:rgba(239,68,68,.10);color:#ef4444}
    .cnic-hint{font-size:11px;color:var(--t3);margin-top:4px;display:block;
      font-family:'Inter','Segoe UI',system-ui,sans-serif}

    /* ── Table badges ── */
    .stu-id-badge{font-family:'Inter','Segoe UI',system-ui,sans-serif;font-size:11px;font-weight:700;
      color:var(--t1);background:none;letter-spacing:.03em}
    .cnic-badge{font-family:'Inter','Segoe UI',system-ui,sans-serif;font-size:11.5px;font-weight:700;
      color:var(--t1);letter-spacing:.04em;background:var(--surface3);
      padding:3px 8px;border-radius:6px;border:1px solid var(--border)}

    /* ── Empty state ── */
    .stu-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;
      min-height:260px;gap:12px;color:var(--t3);border:1px dashed var(--border2);border-radius:var(--r-lg)}
    .stu-empty svg{opacity:.4}
    .stu-empty p{font-size:14px;font-weight:600;color:var(--t2);margin:0}
    .stu-empty span{font-size:12.5px;color:var(--t3);margin:0}

    /* ── Import ── */
    .import-drop{padding:28px 20px;border:2px dashed var(--border2);border-radius:var(--r-sm);
      text-align:center;cursor:pointer;transition:all .15s;background:var(--surface)}
    .import-drop:hover,.import-drop.drag-over{border-color:var(--blue);background:var(--blue-dim)}
    .import-preview{border:1px solid var(--border);border-radius:var(--r-sm);overflow:hidden;margin-top:12px}
    .import-preview table{width:100%;border-collapse:collapse;font-size:12px}
    .import-preview th{background:var(--surface3);color:var(--t2);font-size:10.5px;
      font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:8px 12px;
      border-bottom:1px solid var(--border);text-align:left}
    .import-preview td{padding:7px 12px;border-bottom:1px solid var(--border);color:var(--t1)}
    .import-preview tr:last-child td{border-bottom:none}
    .import-preview tr:hover td{background:var(--surface2)}
    .import-err-list{margin-top:10px;padding:12px 14px;background:rgba(239,68,68,.06);
      border:1px solid rgba(239,68,68,.2);border-radius:var(--r-sm)}
    .import-err-list li{font-size:12px;color:#ef4444;margin-bottom:3px;line-height:1.5}
    .import-summary-bar{display:flex;align-items:center;gap:12px;padding:8px 12px;
      background:var(--surface2);border-radius:var(--r-sm);margin-bottom:10px;font-size:12.5px}
    .import-ok{color:#10b981;font-weight:700}
    .import-bad{color:#ef4444;font-weight:700}
  `;
  document.head.appendChild(s);
}

// ── Page skeleton ─────────────────────────────────────────────
function _pageTemplate() {
  const disciplines = AppState.get('disciplines') || [];
  // Build unique session list from existing students
  const sessions = [...new Set(
    (AppState.get(KEY) || []).map(function(s) { return s.session; }).filter(Boolean)
  )].sort(function(a, b) {
    // Sort chronologically
    const parse = function(v) {
      const [n, yy] = v.split('-');
      return parseInt(yy) * 2 + (n === 'June' ? 1 : 0);
    };
    return parse(b) - parse(a);
  });

  return `
    <div class="stu-toolbar">
      <div class="stu-search-wrap">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input class="stu-search" id="stuSearch" placeholder="Search by name, CNIC or Student ID…" autocomplete="off"/>
      </div>

      <select class="stu-filter" id="stuFilterDisc">
        <option value="">All Disciplines</option>
        ${disciplines.map(function(d) {
          return '<option value="' + d.id + '">' + d.abbreviation + ' — ' + d.fullName + '</option>';
        }).join('')}
      </select>

      <select class="stu-filter" id="stuFilterSession">
        <option value="">All Sessions</option>
        ${sessions.map(function(sv) {
          return '<option value="' + sv + '">' + sv + '  (' + sessionLabel(sv) + ')</option>';
        }).join('')}
      </select>

      <button class="stu-btn stu-btn--ghost" id="stuImportBtn">${ICONS.upload} Import CSV</button>
      <button class="stu-btn stu-btn--ghost" id="stuExportCSVBtn">${ICONS.dl} Export CSV</button>
      <button class="stu-btn stu-btn--ghost" id="stuExportPDFBtn">${ICONS.pdf} Export PDF</button>
      <button class="stu-btn stu-btn--ghost" id="stuTemplateBtn">${ICONS.csv} Template</button>
      <button class="stu-btn stu-btn--primary" id="stuAddBtn">${ICONS.add} Add Student</button>
      <span class="stu-count" id="stuCount"></span>
    </div>
    <div id="stuTableWrap"></div>`;
}

// ── Table render ──────────────────────────────────────────────
function _render(container, search, discFilter, sessionFilter) {
  search        = (search        || '').toLowerCase();
  discFilter    = discFilter    || '';
  sessionFilter = sessionFilter || '';

  let rows = AppState.get(KEY) || [];
  if (discFilter)    rows = rows.filter(function(s) { return s.disciplineId === discFilter; });
  if (sessionFilter) rows = rows.filter(function(s) { return s.session      === sessionFilter; });

  if (search) {
    rows = rows.filter(function(s) {
      const disc = AppState.findById('disciplines', s.disciplineId);
      const cnicPlain = (s.cnic || '').replace(/-/g, '');
      return (
        (s.studentName    || '').toLowerCase().includes(search) ||
        (s.cnic           || '').toLowerCase().includes(search) ||
        cnicPlain.includes(search.replace(/-/g, ''))            ||
        (s.studentId      || '').toLowerCase().includes(search) ||
        (s.session        || '').toLowerCase().includes(search) ||
        (s.admissionBatch || '').toLowerCase().includes(search) ||
        (disc?.abbreviation || '').toLowerCase().includes(search) ||
        (disc?.fullName     || '').toLowerCase().includes(search)
      );
    });
  }

  // Store for export
  container._filteredRows = rows;

  const countEl = container.querySelector('#stuCount');
  if (countEl) countEl.textContent = rows.length + ' student' + (rows.length !== 1 ? 's' : '');

  const wrap = container.querySelector('#stuTableWrap');
  if (!wrap) return;

  if (!rows.length) {
    wrap.innerHTML = `
      <div class="stu-empty">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <p>${(search || discFilter || sessionFilter) ? 'No students match your filters.' : 'No students yet.'}</p>
        <span>Click "Add Student" to enroll the first student.</span>
      </div>`;
    return;
  }

  const canEdit   = Auth.can('students:edit')   !== false;
  const canDelete = Auth.can('students:delete') !== false;
  const actions   = [];
  if (canEdit)   actions.push({ label: 'Edit',   icon: ICONS.edit,  handler: function(row) { _openForm(row, container); } });
  if (canDelete) actions.push({ label: 'Delete', danger: true, icon: ICONS.trash, handler: function(row) { _delete(row, container); } });

  Table.render(wrap, {
    columns: [
      {
        key: 'studentId', label: 'Student ID', width: '170px',
        render: function(v) {
          return v
            ? '<span style="font-family:Inter,\'Segoe UI\',system-ui,sans-serif;font-size:11px;font-weight:700;color:var(--t1);letter-spacing:.03em">' + v + '</span>'
            : '<span style="color:var(--t4);font-size:11px">—</span>';
        },
      },
      {
        key: 'cnic', label: 'CNIC', width: '160px',
        render: function(v) {
          if (!v) return '<span style="font-size:10.5px;color:var(--t4);font-style:italic;' +
            'background:var(--surface3);padding:2px 8px;border-radius:5px;border:1px dashed var(--border2)">Not provided</span>';
          return '<span class="cnic-badge">' + v + '</span>';
        },
      },
      {
        key: 'studentName', label: 'Student Name',
        render: function(v) {
          return '<span style="font-weight:600;color:var(--t1)">' + (v || '—') + '</span>';
        },
      },
      {
        key: 'gender', label: 'Gender', width: '100px',
        render: function(v) {
          if (!v) return '<span style="color:var(--t4)">—</span>';
          return '<span style="font-size:12px;color:#1e293b;font-weight:500">' +
            (v === 'male' ? 'Male' : 'Female') + '</span>';
        },
      },
      {
        key: 'disciplineId', label: 'Discipline', width: '120px',
        render: function(id) {
          const d = AppState.findById('disciplines', id);
          if (!d) return '<span style="color:var(--t4)">—</span>';
          return '<span style="font-size:12px;font-weight:700;color:var(--t1)">' + d.abbreviation + '</span>';
        },
      },
      {
        key: 'route', label: 'Route', width: '170px',
        render: function(v, row) {
          if (!v) return '<span style="color:var(--t4)">—</span>';
          let html = '<span style="font-size:12.5px;color:var(--t1)">' + v + '</span>';
          if (row.exemptedPapers?.count) {
            const papers = row.exemptedPapers.papers || [];
            const codeList = papers.length
              ? papers.map(function(p) { return p.subjectCode; }).join(', ')
              : (row.exemptedPapers.codes || []).join(', ');
            html += '<br><span style="font-size:10.5px;color:var(--t3);margin-top:2px;display:block">' +
              row.exemptedPapers.count + ' exempt: ' + codeList +
              '</span>';
          }
          return html;
        },
      },
      {
        key: 'dateOfAdmission', label: 'Date of Admission', width: '148px',
        render: function(v) {
          if (!v) return '<span style="color:var(--t4)">—</span>';
          const [y, m, d] = v.split('-');
          const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const label  = parseInt(d) + ' ' + MONTHS[parseInt(m) - 1] + ' ' + y;
          return '<span style="font-size:12.5px;color:var(--t1)">' + label + '</span>';
        },
      },
      {
        key: 'session', label: 'Session', width: '105px',
        render: function(v) {
          if (!v) return '<span style="color:var(--t4)">—</span>';
          return '<span style="font-size:12px;color:var(--t1);font-weight:600">' + v + '</span>';
        },
      },
      {
        key: 'admissionBatch', label: 'Admission Batch', width: '130px',
        render: function(v) {
          if (!v) return '<span style="color:var(--t4)">—</span>';
          return '<span style="font-size:12px;color:var(--t1);font-weight:600">' + v + '</span>';
        },
      },
    ],
    rows:    rows,
    actions: actions,
    rowKey:  'id',
  });

}

// ── CNIC live-format helper ───────────────────────────────────
function _wireCNICInput(input, previewEl, hintEl) {
  input.addEventListener('input', function() {
    const raw    = input.value;
    const digits = cnicDigitsOnly(raw);
    const result = validateCNIC(raw);

    if (!raw.includes('-') && digits.length >= 5) {
      let f = digits.slice(0, 5);
      if (digits.length > 5)  f += '-' + digits.slice(5, 12);
      if (digits.length > 12) f += '-' + digits.slice(12, 13);
      if (f !== raw) input.value = f;
    }

    if (!digits.length) {
      previewEl.textContent = ''; previewEl.className = 'cnic-preview';
      hintEl.textContent = 'Format: XXXXX-XXXXXXX-X  (13 digits)';
    } else if (result.valid) {
      previewEl.textContent = '✓ ' + result.formatted;
      previewEl.className   = 'cnic-preview ok';
      hintEl.textContent    = '';
      input.value           = result.formatted;
      input.classList.remove('inp-err');
    } else {
      previewEl.textContent = digits.length + '/13';
      previewEl.className   = 'cnic-preview bad';
      hintEl.textContent    = digits.length < 13 ? 'Keep typing…' : result.message;
    }
  });

  input.addEventListener('blur', function() {
    const raw = input.value.trim();
    if (!raw) { input.classList.remove('inp-err'); return; }
    const result = validateCNIC(raw);
    if (result.valid) {
      input.value = result.formatted;
      input.classList.remove('inp-err');
      previewEl.textContent = '✓ ' + result.formatted;
      previewEl.className   = 'cnic-preview ok';
      hintEl.textContent    = '';
    } else {
      input.classList.add('inp-err');
      previewEl.textContent = '✗ Invalid';
      previewEl.className   = 'cnic-preview bad';
      hintEl.textContent    = result.message;
    }
  });
}

// ── Form HTML ─────────────────────────────────────────────────
function _buildFormHTML(existing) {
  existing = existing || null;
  const disciplines = AppState.get('disciplines') || [];
  const cnicVal     = existing?.cnic || '';
  const admDate     = existing?.dateOfAdmission || '';
  const session     = existing ? existing.session : (admDate ? sessionFromDate(admDate) : '');

  return `
  <div class="stu-form">

    <!-- Student ID (read-only, auto-generated) -->
    ${existing ? `
    <div class="form-group">
      <label class="form-label">Student ID
        <span style="font-size:10px;color:var(--t4);font-weight:400;text-transform:none">(system-generated)</span>
      </label>
      <div class="readonly-field">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--violet)" stroke-width="2.5">
          <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <span style="font-family:'Inter','Segoe UI',system-ui,sans-serif;font-weight:700;color:var(--violet);letter-spacing:.03em">${existing.studentId || '—'}</span>
      </div>
    </div>` : `
    <div class="form-group" style="padding:8px 12px;background:var(--blue-dim);border-radius:var(--r-sm);
         font-size:12px;color:var(--blue);display:flex;align-items:center;gap:8px">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      Student ID will be auto-generated on save (10-digit: Discipline + Month + Year + Sequence + Gender)
    </div>`}

    <!-- CNIC -->
    <div class="form-group">
      <label class="form-label">CNIC
        <span style="font-size:10px;color:var(--t4);font-weight:400;text-transform:none">(optional — can be added later)</span>
      </label>
      <div class="cnic-wrap">
        <input name="cnicRaw" id="frmCNIC" class="form-input"
               placeholder="3520212345678  or  35202-1234567-8"
               value="${cnicVal}" autocomplete="off" maxlength="15"/>
        <span class="cnic-preview" id="cnicPreview">${cnicVal ? '✓ ' + cnicVal : ''}</span>
      </div>
      <span class="cnic-hint" id="cnicHint">Format: XXXXX-XXXXXXX-X &nbsp;(dashes auto-added)</span>
    </div>

    <!-- Name -->
    <div class="form-group">
      <label class="form-label">Full Name <span class="req">*</span></label>
      <input name="studentName" class="form-input" placeholder="e.g. Muhammad Ali"
             value="${existing?.studentName || ''}"/>
    </div>

    <!-- Gender + Discipline (side by side) -->
    <div class="form-row-2">
      <div class="form-group">
        <label class="form-label">Gender <span class="req">*</span></label>
        <select name="gender" class="form-select">
          <option value="">Select gender…</option>
          <option value="male"   ${(existing?.gender || '') === 'male'   ? 'selected' : ''}>Male</option>
          <option value="female" ${(existing?.gender || '') === 'female' ? 'selected' : ''}>Female</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Discipline <span class="req">*</span></label>
        <select name="disciplineId" class="form-select">
          <option value="">Select discipline…</option>
          ${disciplines.map(function(d) {
            return '<option value="' + d.id + '"' + (d.id === existing?.disciplineId ? ' selected' : '') + '>' +
                   d.abbreviation + ' — ' + d.fullName + '</option>';
          }).join('')}
        </select>
      </div>
    </div>

    <!-- Date of Admission + Session (auto) -->
    <div class="form-row-2">
      <div class="form-group">
        <label class="form-label">Date of Admission <span class="req">*</span></label>
        <input type="date" name="dateOfAdmission" id="frmAdmDate" class="form-input"
               value="${admDate}"/>
        <span class="form-hint">Session is auto-detected from this date</span>
      </div>
      <div class="form-group">
        <label class="form-label">Session
          <span style="font-size:10px;color:var(--t4);font-weight:400;text-transform:none">(auto)</span>
        </label>
        <div class="readonly-field" id="frmSession">
          ${session
            ? '<span class="session-badge">' + session + '</span><span style="font-size:11px;color:var(--t3);margin-left:6px">' + sessionLabel(session) + '</span>'
            : '<span style="color:var(--t4);font-style:italic">Fill admission date</span>'}
        </div>
      </div>
    </div>

    <!-- Admission Batch -->
    <div class="form-group">
      <label class="form-label">Admission Batch
        <span style="font-size:10px;color:var(--t4);font-weight:400;text-transform:none">(optional)</span>
      </label>
      <input name="admissionBatch" class="form-input" placeholder="e.g. Batch-1, Fall-2025, Morning"
             value="${existing?.admissionBatch || ''}"/>
      <span class="form-hint">Group students by batch for easy filtering and reporting</span>
    </div>

    <!-- Route (shown only when discipline has routes) -->
    <div class="form-group" id="frmRouteGroup" style="display:none">
      <label class="form-label">Route <span class="req">*</span></label>
      <select name="route" id="frmRoute" class="form-select">
        <option value="">Select route…</option>
      </select>
      <span class="form-hint" id="frmRouteHint">Routes are defined in the discipline settings.</span>
    </div>

    <!-- Exemption checkbox (shown after route is selected) -->
    <div class="form-group" id="frmExemptChkGroup" style="display:none">
      <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" id="frmExemptChk"
               style="width:14px;height:14px;accent-color:#4f85f7"/>
        <span class="form-label" style="margin:0">Has Exemption</span>
      </label>
      <span class="form-hint" style="margin-top:4px;display:block">
        Tick if this student has subject exemptions based on their route.
      </span>
    </div>

    <!-- Exemption paper selects (one per exemption type, shown when checkbox ticked) -->
    <div class="form-group" id="frmExemptGroup" style="display:none">
      <label class="form-label">Exempted Subjects
        <span id="frmExemptCountBadge" style="font-size:10px;color:var(--t4);font-weight:400;text-transform:none;margin-left:4px"></span>
      </label>
      <div id="frmExemptSelects" style="display:flex;flex-direction:column;gap:8px;margin-top:4px">
        <!-- Dynamically populated: one <select> per subject in the selected route -->
      </div>
      <span class="form-hint" style="margin-top:6px;display:block">
        Each row corresponds to one exempt subject slot. Select the subject for each.
      </span>
      <div id="frmExemptSelected" style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;min-height:0"></div>
    </div>

    <span id="frmErrMsg" class="err-msg" style="display:none"></span>
  </div>`;
}

// Wire date → session auto-fill + discipline → route options + route → exemption paper picker
function _wireForm(modalEl, existing) {
  const cnicInput    = modalEl.querySelector('#frmCNIC');
  const cnicPrev     = modalEl.querySelector('#cnicPreview');
  const cnicHint     = modalEl.querySelector('#cnicHint');
  const admDate      = modalEl.querySelector('#frmAdmDate');
  const sessionDiv   = modalEl.querySelector('#frmSession');
  const discSel      = modalEl.querySelector('[name="disciplineId"]');
  const routeGroup   = modalEl.querySelector('#frmRouteGroup');
  const routeSel     = modalEl.querySelector('#frmRoute');
  const routeHint    = modalEl.querySelector('#frmRouteHint');
  const exemptGrp    = modalEl.querySelector('#frmExemptGroup');
  const selectedWrap = modalEl.querySelector('#frmExemptSelected');

  // Currently selected paper snapshots
  let selectedPapers = (existing?.exemptedPapers?.papers || []).slice();

  // ── CNIC ──
  if (cnicInput && cnicPrev && cnicHint) {
    _wireCNICInput(cnicInput, cnicPrev, cnicHint);
    if (cnicInput.value) cnicInput.dispatchEvent(new Event('input'));
  }

  // ── Session auto-detect ──
  if (admDate && sessionDiv) {
    admDate.addEventListener('change', function() {
      const s = sessionFromDate(admDate.value);
      sessionDiv.innerHTML = s
        ? '<span class="session-badge">' + s + '</span><span style="font-size:11px;color:var(--t3);margin-left:6px">' + sessionLabel(s) + '</span>'
        : '<span style="color:var(--t4);font-style:italic">Fill admission date</span>';
    });
  }


    function renderSelectedTags() {
    if (!selectedWrap) return;
    if (!selectedPapers.length) {
      selectedWrap.innerHTML = '<span style="font-size:11.5px;color:var(--t4);font-style:italic">No papers selected yet</span>';
      return;
    }
    selectedWrap.innerHTML = selectedPapers.map(function(p) {
      return '<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;' +
        'background:var(--blue-dim);border:1px solid var(--blue);border-radius:12px;' +
        'font-size:11.5px;font-weight:700;color:var(--blue)">' +
        p.subjectCode +
        '<button type="button" data-id="' + p.id + '" style="background:none;border:none;' +
          'cursor:pointer;color:var(--blue);padding:0;line-height:1;font-size:13px" title="Remove">×</button>' +
        '</span>';
    }).join('');
    // Wire remove buttons
    selectedWrap.querySelectorAll('button[data-id]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        selectedPapers = selectedPapers.filter(function(p) { return p.id !== btn.dataset.id; });
        renderSelectedTags();
        const discId = discSel?.value;
        if (discId) renderPicker(discId);
      });
    });
  }

  // ── Route options (dynamic from discipline.routes[]) ──
  function updateRouteOptions(discId) {
    if (!routeGroup || !routeSel) return;
    const routes = getDiscRoutes(discId);
    if (!routes.length) {
      routeGroup.style.display = 'none';
      routeSel.innerHTML = '<option value="">Select route…</option>';
      _hideExemptChk();
      _hideExemptGroup();
      return;
    }
    routeGroup.style.display = '';
    // Snapshot: on edit use saved route value, but rebuild options from live discipline
    const savedRoute = existing?.route || '';
    routeSel.innerHTML = '<option value="">Select route…</option>' +
      routes.map(function(r) {
        return '<option value="' + r + '"' + (r === savedRoute ? ' selected' : '') + '>' + r + '</option>';
      }).join('');
    // Restore exemption state if editing
    _onRouteChange(routeSel.value, discId);
  }

  function _hideExemptChk() {
    const chkGrp = modalEl.querySelector('#frmExemptChkGroup');
    if (chkGrp) chkGrp.style.display = 'none';
    const chk = modalEl.querySelector('#frmExemptChk');
    if (chk) chk.checked = false;
  }

  function _hideExemptGroup() {
    if (exemptGrp) exemptGrp.style.display = 'none';
    selectedPapers = [];
  }

  // Build one <select> per route-subject slot
  function _buildExemptSelects(discId, routeName) {
    const selectsWrap = modalEl.querySelector('#frmExemptSelects');
    if (!selectsWrap) return;

    // Get subjects that belong to this discipline AND have this route assigned
    const levels = AppState.get('levels') || [];
    const discLevelIds = levels
      .filter(function(l) { return l.disciplineId === discId; })
      .map(function(l) { return l.id; });
    const allSubjects = (AppState.get('subjects') || [])
      .filter(function(s) { return discLevelIds.includes(s.levelId); });

    // Filter: subjects whose routes[] includes the selected route
    const routeSubjects = allSubjects.filter(function(s) {
      return Array.isArray(s.routes) && s.routes.includes(routeName);
    });

    if (!routeSubjects.length) {
      selectsWrap.innerHTML = '<span style="font-size:12px;color:var(--t4);padding:4px 0;display:block">' +
        'No subjects found for route "' + routeName + '". Assign subjects to this route first.</span>';
      return;
    }

    // Restore saved snapshots for edit mode
    const savedPapers = existing?.exemptedPapers?.papers || [];

    // One select per subject slot (number of route subjects = number of selects)
    selectsWrap.innerHTML = routeSubjects.map(function(sub, i) {
      const savedForSlot = savedPapers[i];
      const selectedId   = savedForSlot ? savedForSlot.id : '';
      return '<div style="display:flex;align-items:center;gap:8px">' +
        '<span style="font-size:11px;color:var(--t3);min-width:22px;text-align:right">' + (i + 1) + '.</span>' +
        '<select data-slot="' + i + '" class="frm-exempt-sel form-select" ' +
          'style="flex:1;height:36px;background:var(--surface2);border:1px solid var(--border);' +
          'border-radius:var(--r-sm);color:var(--t1);font-size:12.5px;outline:none">' +
          '<option value="">— select subject —</option>' +
          routeSubjects.map(function(s) {
            return '<option value="' + s.id + '"' + (s.id === selectedId ? ' selected' : '') + '>' +
              s.subjectCode + ' — ' + s.subjectName + '</option>';
          }).join('') +
        '</select>' +
      '</div>';
    }).join('');

    // Rebuild selectedPapers from current selects
    _syncSelectedFromSelects(routeSubjects);

    // Wire change on each select
    selectsWrap.querySelectorAll('.frm-exempt-sel').forEach(function(sel) {
      sel.addEventListener('change', function() {
        _syncSelectedFromSelects(routeSubjects);
        renderSelectedTags();
      });
    });

    renderSelectedTags();
  }

  function _syncSelectedFromSelects(routeSubjects) {
    selectedPapers = [];
    const selectsWrap = modalEl.querySelector('#frmExemptSelects');
    if (!selectsWrap) return;
    selectsWrap.querySelectorAll('.frm-exempt-sel').forEach(function(sel) {
      const subId = sel.value;
      if (!subId) return;
      const sub = routeSubjects.find(function(s) { return s.id === subId; });
      const live = AppState.findById('subjects', subId);
      if (sub && !selectedPapers.some(function(p) { return p.id === subId; })) {
        selectedPapers.push({
          id:          subId,
          subjectCode: (live?.subjectCode || sub.subjectCode || '').toUpperCase(),
          subjectName:  live?.subjectName  || sub.subjectName || '',
        });
      }
    });
  }

  function _onRouteChange(routeName, discId) {
    const chkGrp = modalEl.querySelector('#frmExemptChkGroup');
    const chk    = modalEl.querySelector('#frmExemptChk');
    if (!routeName || !discId) {
      _hideExemptChk();
      _hideExemptGroup();
      return;
    }
    // Show exemption checkbox for any route
    if (chkGrp) chkGrp.style.display = '';
    // Restore checked state on edit
    const hadExemption = !!(existing?.exemptedPapers?.count);
    if (chk && hadExemption && existing?.route === routeName) {
      chk.checked = true;
      if (exemptGrp) exemptGrp.style.display = '';
      _buildExemptSelects(discId, routeName);
    } else if (chk && !hadExemption) {
      chk.checked = false;
      _hideExemptGroup();
    }
    if (chk) {
      // Re-wire checkbox (remove old listener first by cloning)
      const newChk = chk.cloneNode(true);
      chk.parentNode.replaceChild(newChk, chk);
      newChk.addEventListener('change', function() {
        if (newChk.checked) {
          if (exemptGrp) exemptGrp.style.display = '';
          _buildExemptSelects(discId, routeName);
        } else {
          _hideExemptGroup();
        }
      });
    }
  }

  if (discSel) {
    discSel.addEventListener('change', function() {
      selectedPapers = [];
      updateRouteOptions(discSel.value);
    });
    if (discSel.value) updateRouteOptions(discSel.value);
  }

  if (routeSel) {
    routeSel.addEventListener('change', function() {
      _onRouteChange(routeSel.value, discSel?.value);
    });
  }

  // Expose selectedPapers to _collectForm via the DOM
  modalEl._getSelectedPapers = function() { return selectedPapers; };
}

function _collectForm(modalEl) {
  const g = function(name) {
    const el = modalEl.querySelector('[name="' + name + '"]');
    return el ? el.value.trim() : '';
  };
  const route = g('route');
  let exemptedPapers = null;
  const exemptChk = modalEl.querySelector('#frmExemptChk');
  const hasExemption = !!(exemptChk && exemptChk.checked);
  if (hasExemption) {
    const papers = modalEl._getSelectedPapers ? modalEl._getSelectedPapers() : [];
    // Save as snapshot: { id, subjectCode, subjectName } so future subject edits don't corrupt data
    const snapshots = papers.map(function(p) {
      const live = AppState.findById('subjects', p.id);
      return {
        id:          p.id,
        subjectCode: (live?.subjectCode || p.subjectCode || '').toUpperCase(),
        subjectName:  live?.subjectName  || p.subjectName  || '',
      };
    }).filter(function(p) { return p.id; });
    exemptedPapers = {
      count:  snapshots.length,
      codes:  snapshots.map(function(p) { return p.subjectCode; }),
      papers: snapshots,
    };
  }
  return {
    cnicRaw:         g('cnicRaw'),
    studentName:     g('studentName'),
    gender:          g('gender'),
    disciplineId:    g('disciplineId'),
    dateOfAdmission: g('dateOfAdmission'),
    admissionBatch:  g('admissionBatch'),
    route,
    exemptedPapers,
  };
}

function _showFormErr(modalEl, msg) {
  const el = modalEl.querySelector('#frmErrMsg');
  if (!el) return;
  el.textContent   = msg;
  el.style.display = 'block';
}

// ── Open Add / Edit modal ─────────────────────────────────────
function _openForm(existing, container) {
  existing = existing || null;
  const isEdit = !!existing;
  let _mid;

  _mid = Modal.open({
    title:   isEdit ? 'Edit Student — ' + existing.studentName : 'Add New Student',
    size:    'md',
    body:    _buildFormHTML(existing),
    actions: [
      { label: 'Cancel', variant: 'ghost', close: true },
      {
        label:   isEdit ? 'Save Changes' : 'Add Student',
        variant: 'primary',
        close:   false,
        handler: function(modalEl) {
          const errEl = modalEl.querySelector('#frmErrMsg');
          if (errEl) errEl.style.display = 'none';

          const data   = _collectForm(modalEl);
          const result = isEdit
            ? StudentService.updateStudent(existing.id, data)
            : StudentService.addStudent(data);

          if (!result.success) { _showFormErr(modalEl, result.message); return; }
          Modal.close(_mid);
          _rerender(container);
          Toast.success(isEdit ? 'Student updated.' : 'Student added successfully.');
        },
      },
    ],
    onOpen: function(modalEl) { _wireForm(modalEl, existing); },
  });
}

// ── Delete ────────────────────────────────────────────────────
function _delete(student, container) {
  Modal.confirm({
    title:        'Delete Student',
    message:      'Delete <strong>' + student.studentName + '</strong>' +
                  ' (CNIC: ' + (student.cnic || '—') + ')? This cannot be undone.',
    confirmLabel: 'Delete',
    danger:       true,
  }).then(function(confirmed) {
    if (!confirmed) return;
    StudentService.deleteStudent(student.id);
    _rerender(container);
    Toast.success('Student deleted.');
  });
}

// ── CSV Import modal ──────────────────────────────────────────
function _openImportModal(container) {
  let parsedData = null;
  let _mid;

  const bodyHTML = `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="import-drop" id="dropZone">
        ${ICONS.upload}
        <p style="margin:10px 0 4px;font-size:13.5px;font-weight:600;color:var(--t1)">
          Drop CSV file here or click to browse
        </p>
        <span style="font-size:12px;color:var(--t3)">
          Required columns: cnic, studentName, discipline, dateOfAdmission &nbsp;|&nbsp; Optional: admissionBatch
        </span>
        <input type="file" id="csvFileInput" accept=".csv" style="display:none"/>
      </div>
      <div id="importResult"></div>
    </div>`;

  _mid = Modal.open({
    title:   'Import Students from CSV',
    size:    'lg',
    body:    bodyHTML,
    actions: [
      { label: 'Cancel', variant: 'ghost', close: true },
      {
        label:   'Import Students',
        variant: 'primary',
        close:   false,
        handler: function() {
          if (!parsedData?.valid?.length) { Toast.error('No valid rows to import.'); return; }
          const count = StudentService.importStudents(parsedData.valid);
          Modal.close(_mid);
          _rerender(container);
          Toast.success(count + ' student' + (count !== 1 ? 's' : '') + ' imported successfully.');
        },
      },
    ],
    onOpen: function(modalEl) {
      const dropZone  = modalEl.querySelector('#dropZone');
      const csvInput  = modalEl.querySelector('#csvFileInput');
      const resultDiv = modalEl.querySelector('#importResult');

      dropZone.addEventListener('click', function() { csvInput.click(); });
      dropZone.addEventListener('dragover', function(e) {
        e.preventDefault(); dropZone.classList.add('drag-over');
      });
      dropZone.addEventListener('dragleave', function() {
        dropZone.classList.remove('drag-over');
      });
      dropZone.addEventListener('drop', function(e) {
        e.preventDefault(); dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
      });
      csvInput.addEventListener('change', function() {
        if (csvInput.files[0]) processFile(csvInput.files[0]);
      });

      function processFile(file) {
        if (!file.name.endsWith('.csv')) { Toast.error('Please select a .csv file.'); return; }
        const reader = new FileReader();
        reader.onload = function(e) {
          parsedData = StudentService.parseCSV(e.target.result);
          _renderImportPreview(resultDiv, parsedData, file.name);
        };
        reader.readAsText(file);
      }
    },
  });
}

function _renderImportPreview(el, data, fileName) {
  const valid  = data.valid  || [];
  const errors = data.errors || [];
  let html = '';

  if (!valid.length && !errors.length) {
    html = '<p style="color:var(--t3);font-size:13px;padding:12px 0">No data found in file.</p>';
    el.innerHTML = html;
    return;
  }

  // ── File info card ──
  html += `<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;
      background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm);margin-bottom:10px">
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="1.8">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
    <div>
      <div style="font-size:13px;font-weight:700;color:var(--t1)">${fileName || 'File selected'}</div>
      <div style="font-size:11.5px;color:var(--t3);margin-top:2px">File loaded and ready to import</div>
    </div>
  </div>`;

  // ── Summary counts ──
  html += `<div style="display:flex;gap:10px;margin-bottom:${errors.length ? '10px' : '0'}">`;

  if (valid.length) {
    html += `<div style="flex:1;display:flex;align-items:center;gap:10px;padding:12px 16px;
        background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.25);border-radius:var(--r-sm)">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      <div>
        <div style="font-size:18px;font-weight:800;color:#059669;line-height:1">${valid.length}</div>
        <div style="font-size:11px;color:#059669;margin-top:1px">student${valid.length !== 1 ? 's' : ''} ready to import</div>
      </div>
    </div>`;
  }

  if (errors.length) {
    html += `<div style="flex:1;display:flex;align-items:center;gap:10px;padding:12px 16px;
        background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.2);border-radius:var(--r-sm)">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <div>
        <div style="font-size:18px;font-weight:800;color:#ef4444;line-height:1">${errors.length}</div>
        <div style="font-size:11px;color:#ef4444;margin-top:1px">row${errors.length !== 1 ? 's' : ''} with errors</div>
      </div>
    </div>`;
  }

  html += '</div>';

  // ── Errors detail (collapsible) ──
  if (errors.length) {
    html += `<div class="import-err-list" style="margin-top:10px;max-height:140px;overflow-y:auto">
      <div style="font-size:12px;font-weight:700;color:#ef4444;margin-bottom:6px">
        Fix these rows and re-upload:
      </div>
      <ul style="margin:0;padding-left:16px">`;
    errors.forEach(function(e) { html += '<li style="font-size:11.5px;margin-bottom:3px">' + e + '</li>'; });
    html += '</ul></div>';
  }

  el.innerHTML = html;
}

// ── PDF Export ────────────────────────────────────────────────
function _exportPDF(rows, filterLabels) {
  if (!rows.length) { Toast.error('No students to export.'); return; }

  const now     = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

  const filterHTML = filterLabels.length
    ? filterLabels.map(function(f) { return '<span class="chip">' + f + '</span>'; }).join('')
    : '<span class="chip no-filter">No filters applied — showing all students</span>';

  const tbody = rows.map(function(s, i) {
    const disc   = AppState.findById('disciplines', s.disciplineId);
    const [y, m, d] = (s.dateOfAdmission || '').split('-');
    const MONTHS    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const admLabel  = (y && m && d) ? parseInt(d) + ' ' + MONTHS[parseInt(m) - 1] + ' ' + y : '—';

    return '<tr class="' + (i % 2 === 0 ? 'even' : 'odd') + '">' +
      '<td class="mono">' + (s.studentId || '—') + '</td>' +
      '<td class="mono">' + (s.cnic      || '—') + '</td>' +
      '<td><strong>' + (s.studentName || '—') + '</strong></td>' +
      '<td>' + (disc?.abbreviation || '—') + '</td>' +
      '<td>' + (s.route || '—') +
        (s.route === 'Exemption' && s.exemptedPapers?.count
          ? '<br><small style="color:#64748b">' + s.exemptedPapers.count + ' exempt' +
            (s.exemptedPapers.codes?.length ? ': ' + s.exemptedPapers.codes.join(', ') : '') + '</small>'
          : '') +
      '</td>' +
      '<td>' + admLabel + '</td>' +
      '<td><strong>' + (s.session || '—') + '</strong></td>' +
      '<td>' + (s.admissionBatch || '—') + '</td>' +
    '</tr>';
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Student Report</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#1e293b;background:#fff;padding:20px 24px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;
    border-bottom:2.5px solid #2563eb;padding-bottom:12px;margin-bottom:14px}
  .header-left .title{font-size:20px;font-weight:700;color:#1e40af}
  .header-left .subtitle{font-size:11px;color:#64748b;margin-top:2px}
  .header-right{text-align:right;font-size:10.5px;color:#64748b;line-height:1.6}
  .header-right .date{font-weight:600;color:#1e293b;font-size:11px}
  .stat-row{display:flex;gap:12px;margin-bottom:12px}
  .stat{background:#f8faff;border:1px solid #dbeafe;border-radius:8px;padding:6px 16px;text-align:center}
  .stat .num{font-size:18px;font-weight:700;color:#2563eb;font-family:'Segoe UI',Arial,sans-serif}
  .stat .lbl{font-size:9.5px;color:#64748b;text-transform:uppercase;letter-spacing:.5px}
  .filters{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:14px;
    background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px}
  .filters-lbl{font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;
    letter-spacing:.5px;white-space:nowrap;margin-right:4px}
  .chip{background:#dbeafe;color:#1d4ed8;font-size:10px;font-weight:600;
    padding:2px 9px;border-radius:10px}
  .no-filter{background:#f1f5f9;color:#64748b}
  table{width:100%;border-collapse:collapse;font-size:10.5px}
  thead tr{background:#1e40af}
  thead th{color:#fff;font-weight:600;padding:7px 9px;text-align:left;
    font-size:10px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap}
  tbody tr.even{background:#fff}
  tbody tr.odd{background:#f8faff}
  tbody td{padding:6px 9px;border-bottom:1px solid #e2e8f0;color:#334155;vertical-align:middle}
  td.mono{font-family:'Segoe UI',Arial,sans-serif;font-size:10.5px;font-weight:700;letter-spacing:.03em}
  .footer{margin-top:16px;padding-top:10px;border-top:1px solid #e2e8f0;
    display:flex;justify-content:space-between;font-size:9.5px;color:#94a3b8}
  .brand{margin-top:10px;text-align:center;font-size:10px;color:#94a3b8}
  @media print{body{padding:12px 14px} @page{size:A4 landscape;margin:10mm} .no-print{display:none}}
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <div class="title">Student Register</div>
      <div class="subtitle">Academic Student Records</div>
    </div>
    <div class="header-right">
      <div class="date">${dateStr}</div>
      <div>${timeStr}</div>
    </div>
  </div>

  <div class="stat-row">
    <div class="stat">
      <div class="num">${rows.length}</div>
      <div class="lbl">Total Students</div>
    </div>
  </div>

  <div class="filters">
    <span class="filters-lbl">▾ Filters</span>
    ${filterHTML}
  </div>

  <table>
    <thead>
      <tr>
        <th>Student ID</th>
        <th>CNIC</th>
        <th>Student Name</th>
        <th>Discipline</th>
        <th>Route</th>
        <th>Date of Admission</th>
        <th>Session</th>
        <th>Admission Batch</th>
      </tr>
    </thead>
    <tbody>${tbody}</tbody>
  </table>

  <div class="footer">
    <span>Learnomist — Exported on ${dateStr} at ${timeStr}</span>
    <span>Total: ${rows.length} student${rows.length !== 1 ? 's' : ''}</span>
  </div>
  <div class="brand">Powered by <strong style="color:#2563eb">Learnomist</strong></div>

  <div class="no-print" style="margin-top:18px;text-align:center">
    <button onclick="window.print()"
      style="padding:9px 28px;background:#2563eb;color:#fff;border:none;
             border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">
      Print / Save as PDF
    </button>
  </div>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) { Toast.error('Allow pop-ups to export PDF.'); return; }
  w.document.write(html);
  w.document.close();
  setTimeout(function() { w.print(); }, 600);
}

// ── Helpers ───────────────────────────────────────────────────
function _getFilters(container) {
  return {
    search:  (container.querySelector('#stuSearch')?.value        || '').toLowerCase(),
    disc:     container.querySelector('#stuFilterDisc')?.value    || '',
    session:  container.querySelector('#stuFilterSession')?.value || '',
  };
}

function _rerender(container) {
  const f = _getFilters(container);
  _render(container, f.search, f.disc, f.session);
}

// ── Toolbar wiring ────────────────────────────────────────────
function _attachToolbar(container) {
  const search  = container.querySelector('#stuSearch');
  const discSel = container.querySelector('#stuFilterDisc');
  const sessSel = container.querySelector('#stuFilterSession');

  const rerender = function() { _rerender(container); };
  search?.addEventListener('input',   rerender);
  discSel?.addEventListener('change', rerender);
  sessSel?.addEventListener('change', rerender);

  container.querySelector('#stuAddBtn')?.addEventListener('click', function() {
    _openForm(null, container);
  });

  container.querySelector('#stuImportBtn')?.addEventListener('click', function() {
    _openImportModal(container);
  });

  container.querySelector('#stuExportCSVBtn')?.addEventListener('click', function() {
    const rows = container._filteredRows || AppState.get(KEY) || [];
    if (!rows.length) { Toast.error('No students to export.'); return; }
    StudentService.exportCSV(rows);
    Toast.success('Exported ' + rows.length + ' student' + (rows.length !== 1 ? 's' : '') + '.');
  });

  container.querySelector('#stuExportPDFBtn')?.addEventListener('click', function() {
    const rows   = container._filteredRows || AppState.get(KEY) || [];
    const f      = _getFilters(container);
    const labels = [];
    if (f.disc) {
      const d = AppState.findById('disciplines', f.disc);
      if (d) labels.push('Discipline: ' + d.abbreviation);
    }
    if (f.session) labels.push('Session: ' + f.session);
    if (f.search)  labels.push('Search: "' + f.search + '"');
    _exportPDF(rows, labels);
  });

  container.querySelector('#stuTemplateBtn')?.addEventListener('click', function() {
    StudentService.downloadTemplate();
  });

  AppState.subscribe(KEY, rerender);
}

// ── Module entry point ────────────────────────────────────────
export const StudentModule = {
  mount: function(container) {
    injectUIStyles();
    injectStudentStyles();
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) { console.error('[StudentModule] Container not found'); return; }

    // Render page immediately — do not block on migration
    el.innerHTML = _pageTemplate();
    _render(el, '', '', '');
    _attachToolbar(el);

    // Run migration after first paint (deferred) so UI opens instantly.
    // migrateStudentIds() has a run-once guard — it is a no-op on
    // subsequent mounts once the flag is set in AppState.
    setTimeout(function() {
      const migrated = migrateStudentIds();
      if (migrated > 0) {
        console.info('[StudentModule] Migrated ' + migrated + ' student ID(s) to new format.');
        _render(el, '', '', '');   // re-render once with updated IDs
      }
    }, 0);
  },
};
