// ============================================================
// modules/admission/admissionForm.js — 4-Step Admission Wizard
//
// Steps:
//   1. Student Info  (personal details + CNIC + campus)
//   2. Select Courses (discipline → level → subject → batch + session)
//   3. Fee Summary   (auto-generated challan preview)
//   4. Challan       (printable challan + mark paid)
//
// Usage:
//   AdmissionForm.open(containerEl, { mode: 'new' | 'existing', onComplete })
//   AdmissionForm.open(containerEl, { mode: 'existing', studentId, onComplete })
// ============================================================

import { AppState }         from '../../utils/state.js';
import { Auth }             from '../../utils/auth.js';
import { Toast }            from '../../utils/helpers.js';
import {
  AdmissionService,
  ADMISSION_STATUS,
  CHALLAN_STATUS,
  getAccessibleCampuses,
  getFilteredBatchesForAdmission,
  findStudentByCNIC,
  generateSessions,
  ensureAdmissionState,
  lookupTuitionFee,
  lookupFeesForSubjects,
  lookupRegistrationFee,
  lookupLateFee,
  calcLateFee,
  getAllChallansForPayment,
} from './admissionService.js';
import { validateCNIC }     from '../student/studentService.js';

// ── CSS injected once ─────────────────────────────────────────
let _stylesInjected = false;
function _injectStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const s = document.createElement('style');
  s.textContent = `
/* ── Admission Wizard Styles ─────────────────────────── */
.adm-wizard { max-width: 860px; margin: 0 auto; }

/* Stepper */
.adm-stepper { display: flex; align-items: center; margin-bottom: 28px; gap: 0; }
.adm-step {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  flex: 1; position: relative; cursor: default;
}
.adm-step:not(:last-child)::after {
  content: ''; position: absolute; top: 15px; left: 60%; width: 80%; height: 2px;
  background: var(--border2); z-index: 0;
}
.adm-step.done:not(:last-child)::after { background: var(--blue); }
.adm-step-circle {
  width: 32px; height: 32px; border-radius: 50%; border: 2px solid var(--border2);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: var(--t3);
  background: var(--surface2); z-index: 1; transition: all .2s;
}
.adm-step.active .adm-step-circle { border-color: var(--blue); background: var(--blue); color: #fff; }
.adm-step.done   .adm-step-circle { border-color: var(--blue); background: var(--blue-dim); color: var(--blue); }
.adm-step-label { font-size: 11px; font-weight: 600; color: var(--t3); white-space: nowrap; }
.adm-step.active .adm-step-label { color: var(--blue); }
.adm-step.done   .adm-step-label { color: var(--t2); }
.adm-step.done:hover .adm-step-circle { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(79,133,247,.18); transform: scale(1.08); transition: all .15s; }
.adm-step.done:hover .adm-step-label  { color: var(--blue); }

/* Card */
.adm-card {
  background: var(--surface); border: 1px solid var(--border2);
  border-radius: var(--r-lg); padding: 28px; margin-bottom: 16px;
}
.adm-card-title { font-size: 15px; font-weight: 700; color: var(--t1); margin-bottom: 4px; }
.adm-card-sub   { font-size: 12.5px; color: var(--t3); margin-bottom: 20px; }

/* Tab toggle (New / Existing) */
.adm-tab-group { display: flex; background: var(--surface2); border-radius: var(--r-sm); padding: 3px; gap: 3px; width: fit-content; margin-bottom: 20px; }
.adm-tab { padding: 7px 18px; border-radius: 7px; font-size: 13px; font-weight: 600; color: var(--t3); transition: all .15s; cursor: pointer; }
.adm-tab.active { background: var(--blue); color: #fff; }
.adm-tab:not(.active):hover { color: var(--t1); }

/* Form grid */
.adm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.adm-grid.full { grid-template-columns: 1fr; }
.adm-grid.col3  { grid-template-columns: 1fr 1fr 1fr; }
@media (max-width: 640px) { .adm-grid, .adm-grid.col3 { grid-template-columns: 1fr; } }
.adm-span2 { grid-column: span 2; }

/* Field */
.adm-field { display: flex; flex-direction: column; gap: 5px; }
.adm-label {
  font-size: 11.5px; font-weight: 600; color: var(--t2);
  text-transform: uppercase; letter-spacing: .05em;
}
.adm-label .req { color: var(--red); margin-left: 2px; }
.adm-input, .adm-select {
  background: var(--surface2); border: 1px solid var(--border2);
  border-radius: var(--r-sm); color: var(--t1); font-size: 13.5px;
  padding: 9px 12px; outline: none; width: 100%;
  transition: border-color .15s, box-shadow .15s; font-family: inherit;
}
.adm-input:focus, .adm-select:focus {
  border-color: var(--blue); box-shadow: 0 0 0 3px rgba(79,133,247,.12);
}
.adm-input.err, .adm-select.err { border-color: var(--red); }
.adm-input::placeholder { color: var(--t3); }
.adm-select option { background: var(--surface2); }
.adm-field-err { font-size: 11.5px; color: var(--red); display: none; }
.adm-field-err.show { display: block; }
.adm-hint { font-size: 11px; color: var(--t3); }

/* CNIC search box */
.adm-cnic-wrap { position: relative; }
.adm-cnic-wrap .adm-input { padding-right: 80px; }
.adm-cnic-search-btn {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  padding: 4px 10px; background: var(--blue-dim); color: var(--blue);
  border-radius: 5px; font-size: 11.5px; font-weight: 700; cursor: pointer;
}

/* Existing student card */
.adm-student-found {
  background: var(--green-dim); border: 1px solid rgba(16,185,129,0.25);
  border-radius: var(--r-sm); padding: 14px 16px; display: none; gap: 12px;
  align-items: flex-start; margin-bottom: 16px;
}
.adm-student-found.show { display: flex; }
.adm-student-found-icon { color: var(--green); flex-shrink: 0; margin-top: 2px; }
.adm-student-found-name { font-size: 14px; font-weight: 700; color: var(--t1); }
.adm-student-found-meta { font-size: 12px; color: var(--t3); margin-top: 2px; }

/* Fee summary */
.adm-fee-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.adm-fee-table td { padding: 9px 12px; border-bottom: 1px solid var(--border); color: var(--t2); }
.adm-fee-table td:last-child { text-align: right; color: var(--t1); font-weight: 600; }
.adm-fee-table tr:last-child td { border-bottom: none; font-size: 15px; color: var(--t1); }
.adm-fee-total { background: var(--surface2); border-radius: var(--r-sm); padding: 14px 16px; margin-top: 14px; display: flex; align-items: center; justify-content: space-between; }
.adm-fee-total-label { font-size: 13px; font-weight: 600; color: var(--t2); }
.adm-fee-total-val   { font-size: 22px; font-weight: 800; color: var(--blue); font-family: var(--font-mono); }

/* Challan card (step 4) */
.adm-challan-box {
  background: var(--surface2); border: 1px solid var(--border2);
  border-radius: var(--r); padding: 24px; margin-bottom: 20px;
}
.adm-challan-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
.adm-challan-title  { font-size: 16px; font-weight: 800; color: var(--t1); }
.adm-challan-no     { font-family: var(--font-mono); font-size: 12px; color: var(--t3); margin-top: 3px; }
.adm-challan-badge  {
  padding: 4px 12px; border-radius: 20px; font-size: 11.5px; font-weight: 700;
  background: var(--yellow-dim); color: var(--yellow);
}
.adm-challan-badge.paid    { background: var(--green-dim); color: var(--green); }
.adm-challan-badge.waived  { background: var(--blue-dim);  color: var(--blue);  }
.adm-challan-row { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
.adm-challan-row:last-child { border-bottom: none; }
.adm-challan-key { color: var(--t3); }
.adm-challan-val { color: var(--t1); font-weight: 600; }

/* Action bar */
.adm-actions { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.adm-btn {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 10px 20px; border-radius: var(--r-sm);
  font-size: 13.5px; font-weight: 700; cursor: pointer; transition: all .15s;
}
.adm-btn-primary { background: var(--blue); color: #fff; }
.adm-btn-primary:hover { opacity: .88; transform: translateY(-1px); }
.adm-btn-ghost   { background: var(--surface2); color: var(--t2); border: 1px solid var(--border2); }
.adm-btn-ghost:hover   { color: var(--t1); border-color: var(--border2); }
.adm-btn-success { background: var(--green); color: #fff; }
.adm-btn-success:hover { opacity: .88; }
.adm-btn-danger  { background: var(--red-dim); color: var(--red); border: 1px solid rgba(239,68,68,.2); }
.adm-btn:disabled { opacity: .45; cursor: not-allowed; transform: none !important; }
  `;
  document.head.appendChild(s);
}

// ─────────────────────────────────────────────────────────────
// AdmissionForm public API
// ─────────────────────────────────────────────────────────────

export const AdmissionForm = {

  // ── Open wizard inside containerEl ────────────────────────────
  // opts: { mode: 'new'|'existing', onComplete, onCancel }
  open(containerEl, opts = {}) {
    _injectStyles();
    ensureAdmissionState();

    const state = {
      step:      1,
      mode:      opts.mode || 'new',  // 'new' | 'existing'
      formData:  {},                   // accumulated across steps
      studentId: opts.studentId || null,
      admission: null,
      student:   null,
      challan:   null,
    };

    const render = () => {
      containerEl.innerHTML = _buildWizard(state);
      _wireStep(containerEl, state, render, opts);
    };

    render();
  },
};

// ─────────────────────────────────────────────────────────────
// STEP RENDERERS
// ─────────────────────────────────────────────────────────────

function _buildWizard(state) {
  const steps = [
    { n: 1, label: 'Student Info'  },
    { n: 2, label: 'Select Courses'},
    { n: 3, label: 'Fee Summary'   },
    { n: 4, label: 'Challan'       },
  ];

  const stepperHTML = `
    <div class="adm-stepper">
      ${steps.map(s => `
        <div class="adm-step ${state.step === s.n ? 'active' : ''} ${state.step > s.n ? 'done' : ''}"
             ${state.step > s.n ? `data-goto="${s.n}" title="${s.label} — go back" style="cursor:pointer"` : ''}>
          <div class="adm-step-circle">
            ${state.step > s.n
              ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
              : s.n}
          </div>
          <span class="adm-step-label">${s.label}</span>
        </div>`).join('')}
    </div>`;

  const bodyFns = [null, _step1HTML, _step2HTML, _step3HTML, _step4HTML];
  const body    = bodyFns[state.step]?.(state) || '';

  return `<div class="adm-wizard">${stepperHTML}${body}</div>`;
}

// ── Step 1: Student Info ──────────────────────────────────────
function _step1HTML(state) {
  const fd       = state.formData;
  const isNew    = state.mode === 'new';

  const tabToggle = `
    <div class="adm-tab-group">
      <button class="adm-tab ${isNew ? 'active' : ''}" data-tab="new">+ New Student</button>
      <button class="adm-tab ${!isNew ? 'active' : ''}" data-tab="existing">Existing Student</button>
    </div>`;

  // Existing student CNIC lookup
  const existingPanel = !isNew ? `
    <div class="adm-card" style="margin-bottom:12px">
      <div class="adm-card-title">Find Existing Student</div>
      <div class="adm-card-sub">Enter the student's CNIC to look them up.</div>
      <div class="adm-field">
        <label class="adm-label">CNIC <span class="req">*</span></label>
        <div class="adm-cnic-wrap">
          <input id="admCnicLookup" class="adm-input" placeholder="XXXXX-XXXXXXX-X" value="${fd.cnicLookup || ''}">
          <button class="adm-cnic-search-btn" id="admCnicSearchBtn">Search</button>
        </div>
        <span class="adm-field-err" id="admCnicLookupErr"></span>
      </div>
      <div class="adm-student-found" id="admStudentFound">
        <div class="adm-student-found-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>
        </div>
        <div>
          <div class="adm-student-found-name" id="admFoundName"></div>
          <div class="adm-student-found-meta" id="admFoundMeta"></div>
        </div>
      </div>
    </div>` : '';

  // Personal info form (shown for new; shown readonly for existing after lookup)
  const infoForm = isNew ? `
    <div class="adm-card">
      <div class="adm-card-title">Student Information</div>
      <div class="adm-card-sub">Fill in the new student's personal details.</div>
      <div class="adm-grid">

        <div class="adm-field">
          <label class="adm-label">First Name <span class="req">*</span></label>
          <input class="adm-input" id="admFirstName" placeholder="First Name" value="${fd.firstName || ''}">
          <span class="adm-field-err" id="errFirstName"></span>
        </div>

        <div class="adm-field">
          <label class="adm-label">Last Name <span class="req">*</span></label>
          <input class="adm-input" id="admLastName" placeholder="Last Name" value="${fd.lastName || ''}">
          <span class="adm-field-err" id="errLastName"></span>
        </div>

        <div class="adm-field">
          <label class="adm-label">Father Name <span class="req">*</span></label>
          <input class="adm-input" id="admFatherName" placeholder="Father Name" value="${fd.fatherName || ''}">
          <span class="adm-field-err" id="errFatherName"></span>
        </div>

        <div class="adm-field">
          <label class="adm-label">CNIC <span class="req">*</span></label>
          <input class="adm-input" id="admCnic" placeholder="XXXXX-XXXXXXX-X" value="${fd.cnic || ''}">
          <span class="adm-field-err" id="errCnic"></span>
        </div>

        <div class="adm-field">
          <label class="adm-label">Date of Birth</label>
          <input class="adm-input" type="date" id="admDob" value="${fd.dob || ''}">
        </div>

        <div class="adm-field">
          <label class="adm-label">Gender <span class="req">*</span></label>
          <select class="adm-select" id="admGender">
            <option value="">-- Select --</option>
            <option value="Male"   ${fd.gender === 'Male'   ? 'selected' : ''}>Male</option>
            <option value="Female" ${fd.gender === 'Female' ? 'selected' : ''}>Female</option>
            <option value="Other"  ${fd.gender === 'Other'  ? 'selected' : ''}>Other</option>
          </select>
          <span class="adm-field-err" id="errGender"></span>
        </div>

        <div class="adm-field">
          <label class="adm-label">Phone <span class="req">*</span></label>
          <input class="adm-input" id="admPhone" placeholder="03XX-XXXXXXX" value="${fd.phone || ''}">
          <span class="adm-field-err" id="errPhone"></span>
        </div>

        <div class="adm-field">
          <label class="adm-label">Email</label>
          <input class="adm-input" type="email" id="admEmail" placeholder="email@example.com" value="${fd.email || ''}">
        </div>

        <div class="adm-field">
          <label class="adm-label">Qualification</label>
          <input class="adm-input" id="admQualification" placeholder="e.g. Intermediate" value="${fd.qualification || ''}">
        </div>

        <div class="adm-field adm-span2">
          <label class="adm-label">Address</label>
          <input class="adm-input" id="admAddress" placeholder="Home Address" value="${fd.address || ''}">
        </div>

      </div>
    </div>` : '';

  return `
    ${tabToggle}
    ${existingPanel}
    ${infoForm}
    <div class="adm-actions">
      <span style="font-size:12px;color:var(--t3)">Step 1 of 4</span>
      <button class="adm-btn adm-btn-primary" id="admNext1">
        Next: Select Courses
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>`;
}

// ── Step 2: Course Selection ──────────────────────────────────
function _step2HTML(state) {
  const fd          = state.formData;
  const campuses    = getAccessibleCampuses();
  const today       = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Auto-select campus if only one is accessible. Store as String always.
  if (campuses.length === 1 && !fd.campusId) {
    fd.campusId = String(campuses[0].id);
  }
  // Normalize IDs to strings so DOM vs state comparisons don't fail
  if (fd.campusId)     fd.campusId     = String(fd.campusId);
  if (fd.disciplineId) fd.disciplineId = String(fd.disciplineId);
  if (fd.levelId)      fd.levelId      = String(fd.levelId);

  // Disciplines filtered by campus — String comparison to avoid type mismatch
  const allDisciplines = AppState.get('disciplines') || [];
  const disciplines = fd.campusId
    ? allDisciplines.filter(d => !d.campusIds?.length || d.campusIds.map(String).includes(fd.campusId))
    : [];

  // Levels filtered by discipline — String comparison
  const levels = fd.disciplineId
    ? (AppState.get('levels') || []).filter(l => String(l.disciplineId) === fd.disciplineId)
    : [];

  // Subjects filtered by level — String comparison
  const allSubjects = fd.levelId
    ? (AppState.get('subjects') || []).filter(s => String(s.levelId) === fd.levelId)
    : [];

  // Selected subjects array (multi-select)
  const selectedSubjectIds = fd.subjectIds || [];

  // Batches: filter by campus + discipline + level + today <= enrolmentCloseDate
  // Show available batches for each selected subject
  const allBatches = AppState.get('batches') || [];

  // ── Fallback: derive enrolment close date from startDate + enrolmentRules ──
  // (mirrors the same calc used in batch.js) — used only when the batch
  // record itself has no enrolmentCloseDate saved (e.g. older batches).
  const _normalizeDate = (s) => {
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const pd = new Date(s + 'T00:00:00');
    if (isNaN(pd)) return s;
    return pd.getFullYear() + '-' + String(pd.getMonth() + 1).padStart(2, '0') + '-' + String(pd.getDate()).padStart(2, '0');
  };
  const _addWorkingDays = (startDateStr, days) => {
    const holidays = new Set((AppState.get('holidays') || []).map(h => _normalizeDate(h.date)));
    let d = new Date(startDateStr + 'T00:00:00');
    let added = 0;
    while (added < days) {
      d.setDate(d.getDate() + 1);
      const dow = d.getDay();
      const ymd = _normalizeDate(d.toISOString().slice(0, 10));
      if (dow !== 0 && !holidays.has(ymd)) added++;
    }
    return _normalizeDate(d.toISOString().slice(0, 10));
  };
  const _deriveCloseDate = (b) => {
    if (!b.startDate) return '';
    const rules = AppState.get('enrolmentRules') || [];
    const rule = rules.find(r =>
      r.disciplineId === b.disciplineId &&
      (!r.campusId || r.campusId === b.campusId) &&
      (r.levelId === b.levelId || (r.levelIds || []).includes(b.levelId))
    );
    if (!rule) return '';
    if (rule.closeMode === 'same') return b.startDate;
    return _addWorkingDays(b.startDate, rule.closeDays || 3);
  };

  const getAvailableBatches = (subjectId) => allBatches.filter(b => {
    if (fd.campusId     && String(b.campusId)     !== fd.campusId)       return false;
    if (fd.disciplineId && String(b.disciplineId) !== fd.disciplineId)   return false;
    if (fd.levelId      && String(b.levelId)      !== fd.levelId)        return false;
    if (subjectId       && String(b.subjectId)    !== String(subjectId)) return false;
    // Enrollment close date: use the saved value if present, otherwise derive
    // it from startDate + enrolmentRules (same logic batch.js uses). Only if
    // neither is available do we treat the batch as open (no restriction).
    const closeDate = b.enrolmentCloseDate || _deriveCloseDate(b);
    if (closeDate && closeDate < today) return false;  // date guzar gayi → hide
    return true;
  });

  // Subjects jin ke liye koi open batch available nahi (so we don't force
  // a batch selection on them later — they should still flow into the
  // fee summary / challan, just shown without an assigned batch).
  fd._noBatchSubjectIds = selectedSubjectIds.filter(sid => getAvailableBatches(sid).length === 0);

  // Build batch cards HTML for selected subjects (search filter + teacher name)
  const batchCardsHTML = selectedSubjectIds.length === 0 ? '' : `
    <div class="adm-field adm-span2" style="margin-top:8px">
      <label class="adm-label">Available Batches</label>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:4px">
        ${selectedSubjectIds.map(sid => {
          const subj    = (AppState.get('subjects') || []).find(s => s.id === sid);
          const batches = getAvailableBatches(sid);
          const searchId = 'batchSearch_' + sid;
          const listId   = 'batchList_' + sid;
          return `
            <div style="border:1px solid var(--border2);border-radius:var(--r-sm);overflow:hidden">
              <div style="padding:8px 12px;background:var(--surface2);font-size:12px;font-weight:700;color:var(--t2);border-bottom:1px solid var(--border2);display:flex;align-items:center;justify-content:space-between;gap:10px">
                <span>${subj ? subj.subjectCode + ' — ' + subj.subjectName : sid}</span>
                <input id="${searchId}" placeholder="Search batch or teacher..." class="adm-input"
                       style="font-size:11.5px;padding:4px 8px;max-width:200px;background:var(--surface)">
              </div>
              ${batches.length === 0
                ? `<div style="padding:12px;font-size:12.5px;color:var(--t3)">No open batches available for this subject.
                     <span style="color:var(--yellow)">It will still be added to the fee challan; a batch can be assigned later.</span>
                   </div>`
                : `<div id="${listId}">
                  ${batches.map(b => {
                    const isSelected = fd.batchSelections?.[sid] === b.id;
                    const teacher    = b.teacherId ? (AppState.get('teachers') || []).find(t => String(t.id) === String(b.teacherId)) : null;
                    const teacherName = teacher?.fullName || b.teacherName || '';
                    const searchLabel = (b.batchName + ' ' + teacherName).toLowerCase();
                    return `
                      <label data-batch-label="${searchLabel}"
                             style="display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;
                                    border-bottom:1px solid var(--border);transition:background .1s;
                                    background:${isSelected ? 'var(--blue-dim)' : 'var(--surface)'}"
                             onmouseover="if(!this.querySelector('input').checked)this.style.background='var(--surface2)'"
                             onmouseout="if(!this.querySelector('input').checked)this.style.background='var(--surface)'">
                        <input type="radio" name="batch_${sid}" value="${b.id}"
                               ${isSelected ? 'checked' : ''}
                               data-subject="${sid}"
                               class="adm-batch-radio"
                               style="width:15px;height:15px;accent-color:var(--blue);flex-shrink:0">
                        <div style="flex:1">
                          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                            <span style="font-family:var(--font-mono);font-size:12.5px;font-weight:700;color:var(--t1)">${b.batchName}</span>
                            ${teacherName
                              ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11.5px;color:var(--t2);
                                             background:var(--surface2);border:1px solid var(--border);
                                             border-radius:20px;padding:2px 8px;font-weight:500">
                                   <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                     <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                     <circle cx="9" cy="7" r="4"/>
                                   </svg>
                                   ${teacherName}
                                 </span>`
                              : `<span style="font-size:11px;color:var(--t3);font-style:italic">No teacher assigned</span>`}
                          </div>
                          <div style="font-size:11px;color:var(--t3);margin-top:3px">
                            ${b.startDate ? 'Start: ' + b.startDate : ''}
                            ${(b.enrolmentCloseDate || _deriveCloseDate(b)) ? ' &nbsp;·&nbsp; Enrol by: <span style="color:var(--green);font-weight:600">' + (b.enrolmentCloseDate || _deriveCloseDate(b)) + '</span>' : ''}
                            ${b.maxStudents ? ' &nbsp;·&nbsp; Capacity: ' + b.maxStudents : ''}
                          </div>
                        </div>
                        ${isSelected ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
                      </label>`;
                  }).join('')}
                </div>`}
            </div>`;
        }).join('')}
      </div>
      <span class="adm-field-err" id="errBatchId"></span>
    </div>`;

  return `
    <div class="adm-card">
      <div class="adm-card-title">Course Selection</div>
      <div class="adm-card-sub">Select a campus, then choose discipline, level and subjects.</div>
      <div class="adm-grid">

        <!-- Campus -->
        <div class="adm-field">
          <label class="adm-label">Campus <span class="req">*</span></label>
          <select class="adm-select" id="admCampus">
            <option value="">-- Select Campus --</option>
            ${campuses.map(c => `<option value="${c.id}" ${String(fd.campusId) === String(c.id) ? 'selected' : ''}>${c.campusName}</option>`).join('')}
          </select>
          <span class="adm-field-err" id="errCampusId"></span>
        </div>

        <!-- Discipline (filtered by campus via campusIds) -->
        <div class="adm-field">
          <label class="adm-label">Discipline <span class="req">*</span></label>
          <select class="adm-select" id="admDiscipline" ${!fd.campusId ? 'disabled' : ''}>
            <option value="">${!fd.campusId ? '-- Select Campus First --' : '-- Select Discipline --'}</option>
            ${disciplines.map(d => `<option value="${d.id}" ${String(fd.disciplineId) === String(d.id) ? 'selected' : ''}>${d.fullName} (${d.abbreviation})</option>`).join('')}
          </select>
          <span class="adm-field-err" id="errDisciplineId"></span>
        </div>

        <!-- Level (filtered by discipline) -->
        <div class="adm-field">
          <label class="adm-label">Level <span class="req">*</span></label>
          <select class="adm-select" id="admLevel" ${!fd.disciplineId ? 'disabled' : ''}>
            <option value="">${!fd.disciplineId ? '-- Select Discipline First --' : '-- Select Level --'}</option>
            ${levels.map(l => `<option value="${l.id}" ${String(fd.levelId) === String(l.id) ? 'selected' : ''}>${l.levelName}</option>`).join('')}
          </select>
          <span class="adm-field-err" id="errLevelId"></span>
        </div>

        <!-- Subject Multi-Select with Search + Select All -->
        <div class="adm-field adm-span2">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <label class="adm-label" style="margin-bottom:0">Subject(s) <span class="req">*</span> <span style="font-size:10.5px;font-weight:400;color:var(--t3);text-transform:none">(Multiple selection allowed)</span></label>
            ${fd.levelId && allSubjects.length > 0 ? `
            <button type="button" id="admSelectAllSubjects"
              style="font-size:11.5px;font-weight:700;color:var(--blue);background:var(--blue-dim);
                     border:none;border-radius:5px;padding:4px 10px;cursor:pointer">
              ${selectedSubjectIds.length === allSubjects.length ? 'Deselect All' : 'Select All'}
            </button>` : ''}
          </div>
          ${!fd.levelId
            ? `<div style="padding:10px 12px;border:1px solid var(--border2);border-radius:var(--r-sm);font-size:12.5px;color:var(--t3)">Select a level first to see subjects.</div>`
            : allSubjects.length === 0
              ? `<div style="padding:10px 12px;border:1px solid var(--border2);border-radius:var(--r-sm);font-size:12.5px;color:var(--t3)">No subjects found for this level.</div>`
              : `<div style="border:1px solid var(--border2);border-radius:var(--r-sm);overflow:hidden">
                   <div style="padding:8px 10px;background:var(--surface2);border-bottom:1px solid var(--border2)">
                     <input id="admSubjectSearch" class="adm-input" placeholder="Search subjects..."
                            style="font-size:12.5px;padding:6px 10px;background:var(--surface);border-color:var(--border)">
                   </div>
                   <div id="admSubjectList" style="display:flex;flex-wrap:wrap;gap:8px;padding:10px;background:var(--surface2);max-height:180px;overflow-y:auto">
                     ${allSubjects.map(s => {
                       const isChecked = selectedSubjectIds.includes(s.id);
                       return `
                         <label data-subject-label="${s.subjectCode} ${s.subjectName}".toLowerCase()
                                style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;
                                       padding:5px 12px;border-radius:20px;
                                       border:1px solid ${isChecked ? 'var(--blue)' : 'var(--border)'};
                                       background:${isChecked ? 'var(--blue-dim)' : 'var(--surface)'};
                                       font-size:12.5px;color:${isChecked ? 'var(--blue)' : 'var(--t1)'};
                                       transition:all .15s"
                                class="adm-subject-pill">
                           <input type="checkbox" class="adm-subject-chk" value="${s.id}"
                                  ${isChecked ? 'checked' : ''}
                                  style="width:13px;height:13px;accent-color:var(--blue)">
                           <span style="font-weight:600">${s.subjectCode}</span>
                           <span style="color:var(--t3);font-size:11.5px">— ${s.subjectName}</span>
                         </label>`;
                     }).join('')}
                   </div>
                 </div>`}
          <span class="adm-field-err" id="errSubjectId"></span>
        </div>

        <!-- Batch Cards per subject -->
        ${batchCardsHTML}

      </div>
    </div>
    <div class="adm-actions">
      <button class="adm-btn adm-btn-ghost" id="admBack2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </button>
      <button class="adm-btn adm-btn-primary" id="admNext2">
        Next: Fee Summary
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>`;
}

// ── Step 3: Fee Summary ───────────────────────────────────────
function _step3HTML(state) {
  const fd      = state.formData;
  const disc    = AppState.findById('disciplines', fd.disciplineId);
  const level   = AppState.findById('levels',      fd.levelId);
  const campus  = AppState.findById('campuses',    fd.campusId);
  const student = state.student ||
    { studentName: `${fd.firstName || ''} ${fd.lastName || ''}`.trim() };

  const subjectIds      = fd.subjectIds || (fd.subjectId ? [fd.subjectId] : []);
  const batchSelections = fd.batchSelections || {};

  // ── TUITION FEE: per-subject auto lookup ─────────────────────
  const feeResults = lookupFeesForSubjects({
    campusId:     fd.campusId,
    disciplineId: fd.disciplineId,
    levelId:      fd.levelId,
    subjectIds,
  });

  const tuitionTotal   = feeResults.reduce((s, r) => s + (r.found ? r.amount : 0), 0);
  const anyTuitionFound = feeResults.some(r => r.found);
  const allTuitionFound = feeResults.length > 0 && feeResults.every(r => r.found);
  const tuitionSymbol   = feeResults.find(r => r.found)?.symbol || 'Rs.';
  const tuitionCurrency = feeResults.find(r => r.found)?.currency || 'PKR';

  // ── REGISTRATION FEE: campus → discipline → level + date ─────
  // Existing student (re-admission) → waived automatically
  const regResult = lookupRegistrationFee({
    campusId:     fd.campusId,
    disciplineId: fd.disciplineId,
    levelId:      fd.levelId,
    studentId:    state.studentId || null,
  });

  const regAmount   = regResult.waived ? 0 : (regResult.found ? regResult.amount : 0);
  const regSymbol   = regResult.symbol  || 'Rs.';
  const regCurrency = regResult.currency || 'PKR';

  // ── GRAND TOTAL ───────────────────────────────────────────────
  const grandTotal = tuitionTotal + regAmount;

  // Store into formData so submit picks it up
  fd.feeAmount      = grandTotal;
  fd.tuitionAmount  = tuitionTotal;
  fd.regFeeAmount   = regAmount;
  fd.feeCurrency    = tuitionCurrency;
  fd._feeResults    = feeResults;   // subject-wise breakdown for challan print

  // ── Subject + batch rows ──────────────────────────────────────
  const subjectBatchRows = subjectIds.map((sid, idx) => {
    const subj        = AppState.findById('subjects', sid);
    const batch       = AppState.findById('batches',  batchSelections[sid]);
    const teacher     = batch?.teacherId
      ? (AppState.get('teachers') || []).find(t => String(t.id) === String(batch.teacherId))
      : null;
    const teacherName = teacher?.fullName || batch?.teacherName || '';
    const feeRes      = feeResults.find(r => r.subjectId === sid) || feeResults[idx] || {};

    const feeCell = feeRes.found
      ? `<span style="font-family:var(--font-mono);font-weight:700;color:#10b981">
           ${feeRes.symbol} ${Number(feeRes.amount).toLocaleString()}
         </span>`
      : `<span style="font-size:11px;color:#f59e0b;font-style:italic;background:rgba(245,158,11,.08);
                      padding:2px 8px;border-radius:10px;border:1px solid rgba(245,158,11,.2)">
           Not in fee structure
         </span>`;

    return `
      <tr>
        <td style="padding:8px 12px;color:var(--t3);font-size:12.5px;width:38%">Subject</td>
        <td style="padding:8px 12px;border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
            <span style="font-size:13px;color:var(--t1);font-weight:500">
              ${subj ? `<span style="font-weight:700;color:var(--violet);margin-right:5px">${subj.subjectCode}</span>${subj.subjectName}` : '—'}
            </span>
            ${feeCell}
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:4px 12px 10px 28px;color:var(--t3);font-size:11.5px;border-bottom:1px solid var(--border)">↳ Batch</td>
        <td style="padding:4px 12px 10px;font-size:12px;color:var(--t2);border-bottom:1px solid var(--border);font-family:var(--font-mono)">
          ${batch?.batchName || '<span style="color:var(--t3);font-style:italic;font-family:inherit">—</span>'}
          ${teacherName ? `<span style="font-family:inherit;font-size:11px;color:var(--t3);font-weight:400;margin-left:6px">· ${teacherName}</span>` : ''}
        </td>
      </tr>`;
  }).join('');

  // ── Fee status banner ─────────────────────────────────────────
  let tuitionBanner = '';
  if (allTuitionFound) {
    tuitionBanner = `<div style="display:flex;align-items:center;gap:8px;padding:9px 13px;
        background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.2);
        border-radius:8px;font-size:12px;color:#10b981;margin-bottom:12px">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      <span><strong>Tuition fee auto-detected</strong> from fee structure (campus → discipline → subject match).</span>
    </div>`;
  } else if (anyTuitionFound) {
    tuitionBanner = `<div style="display:flex;align-items:center;gap:8px;padding:9px 13px;
        background:rgba(245,158,11,.07);border:1px solid rgba(245,158,11,.2);
        border-radius:8px;font-size:12px;color:#d97706;margin-bottom:12px">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <span><strong>Partial match</strong> — some subjects not found in fee structure.</span>
    </div>`;
  } else {
    tuitionBanner = `<div style="display:flex;align-items:center;gap:8px;padding:9px 13px;
        background:var(--surface2);border:1px solid var(--border2);
        border-radius:8px;font-size:12px;color:var(--t3);margin-bottom:12px">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span>No matching tuition fee structure found for this campus/discipline/subject.</span>
    </div>`;
  }

  // ── Registration fee row HTML ─────────────────────────────────
  let regFeeRow = '';
  if (regResult.waived) {
    regFeeRow = `
      <tr>
        <td style="padding:10px 12px;color:var(--t3);font-size:12.5px;border-bottom:1px solid var(--border)">Registration Fee</td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:10.5px;font-weight:700;padding:2px 9px;border-radius:10px;
                         background:rgba(37,99,235,.08);color:var(--blue);border:1px solid rgba(37,99,235,.15)">
              Existing Student — Waived
            </span>
          </div>
        </td>
      </tr>`;
  } else if (regResult.found) {
    regFeeRow = `
      <tr>
        <td style="padding:10px 12px;color:var(--t3);font-size:12.5px;border-bottom:1px solid var(--border)">Registration Fee</td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-family:var(--font-mono);font-weight:700;color:var(--t1)">
              ${regSymbol} ${Number(regAmount).toLocaleString()}
            </span>
            <span style="font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:10px;
                         background:rgba(245,158,11,.08);color:#d97706;border:1px solid rgba(245,158,11,.2)">
              One-time
            </span>
          </div>
        </td>
      </tr>`;
  } else {
    regFeeRow = `
      <tr>
        <td style="padding:10px 12px;color:var(--t3);font-size:12.5px;border-bottom:1px solid var(--border)">Registration Fee</td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border)">
          <span style="font-size:11px;color:var(--t3);font-style:italic">Not found in fee structure</span>
        </td>
      </tr>`;
  }

  // Smart due date from challanDueSettings (dueDays + bankWorkingDays + holidays)
  if (!fd.dueDate) {
    const _today = new Date(); const _todayStr = `${_today.getFullYear()}-${String(_today.getMonth()+1).padStart(2,'0')}-${String(_today.getDate()).padStart(2,'0')}`; fd.dueDate = _calcDueDate(fd.admissionDate || _todayStr);
  }
  const dueDate = fd.dueDate;

  return `
    <div class="adm-card">
      <div class="adm-card-title">Fee Summary</div>
      <div class="adm-card-sub">Fees are automatically calculated from the fee structure. No manual entry required.</div>

      ${tuitionBanner}

      <!-- Admission details table -->
      <table style="width:100%;border-collapse:collapse;border:1px solid var(--border);border-radius:var(--r-sm);overflow:hidden;margin-bottom:16px">
        <tr>
          <td style="padding:9px 12px;color:var(--t3);font-size:12.5px;border-bottom:1px solid var(--border);width:38%">Student</td>
          <td style="padding:9px 12px;border-bottom:1px solid var(--border);font-size:13px;font-weight:600;color:var(--t1)">${student.studentName || '—'}</td>
        </tr>
        <tr>
          <td style="padding:9px 12px;color:var(--t3);font-size:12.5px;border-bottom:1px solid var(--border)">Campus</td>
          <td style="padding:9px 12px;border-bottom:1px solid var(--border);font-size:13px;color:var(--t1)">${campus?.campusName || '—'}</td>
        </tr>
        <tr>
          <td style="padding:9px 12px;color:var(--t3);font-size:12.5px;border-bottom:1px solid var(--border)">Discipline</td>
          <td style="padding:9px 12px;border-bottom:1px solid var(--border);font-size:13px;color:var(--t1)">${disc?.fullName || '—'} <span style="color:var(--t3);font-size:11.5px">(${disc?.abbreviation || ''})</span></td>
        </tr>
        <tr>
          <td style="padding:9px 12px;color:var(--t3);font-size:12.5px;border-bottom:1px solid var(--border)">Level</td>
          <td style="padding:9px 12px;border-bottom:1px solid var(--border);font-size:13px;color:var(--t1)">${level?.levelName || '—'}</td>
        </tr>
        ${subjectBatchRows}
        ${regFeeRow}
      </table>

      <!-- Challan Due Date -->
      <div style="max-width:280px;margin-bottom:20px">
        <div class="adm-field">
          <label class="adm-label">Challan Due Date</label>
          <input class="adm-input" type="date" id="admDueDate" value="${dueDate}" readonly style="cursor:default;opacity:.75;pointer-events:none">
        </div>
      </div>

      <!-- Fee breakdown + total -->
      <div style="background:var(--surface2);border:1px solid var(--border2);border-radius:var(--r-sm);overflow:hidden">
        ${anyTuitionFound ? `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid var(--border)">
          <span style="font-size:12.5px;color:var(--t2)">Tuition Fee ${subjectIds.length > 1 ? `(${subjectIds.length} subjects)` : ''}</span>
          <span style="font-family:var(--font-mono);font-weight:700;color:var(--t1);font-size:13.5px">
            ${tuitionSymbol} ${tuitionTotal.toLocaleString()}
          </span>
        </div>` : ''}
        ${regResult.found ? `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid var(--border)">
          <span style="font-size:12.5px;color:var(--t2)">Registration Fee
            ${regResult.waived ? `<span style="font-size:10.5px;color:var(--blue);margin-left:6px">(Waived)</span>` : ''}
          </span>
          <span style="font-family:var(--font-mono);font-weight:700;font-size:13.5px;color:${regResult.waived ? 'var(--t3)' : 'var(--t1)'}">
            ${regResult.waived ? '—' : `${regSymbol} ${Number(regAmount).toLocaleString()}`}
          </span>
        </div>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px">
          <span style="font-size:13px;font-weight:700;color:var(--t1)">Total Fee Payable</span>
          <span style="font-family:var(--font-mono);font-weight:800;font-size:22px;color:var(--t1)">
            ${tuitionCurrency === 'PKR' ? 'Rs.' : tuitionSymbol} ${grandTotal.toLocaleString()}
          </span>
        </div>
      </div>

    </div>
    <div class="adm-actions">
      <button class="adm-btn adm-btn-ghost" id="admBack3">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </button>
      <button class="adm-btn adm-btn-primary" id="admSubmit">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="18" x2="12" y2="12"/>
          <line x1="9" y1="15" x2="15" y2="15"/>
        </svg>
        Generate Challan
      </button>
    </div>`;
}

// ── Step 4: Challan ───────────────────────────────────────────
function _step4HTML(state) {
  const challan   = state.challan;
  const admission = state.admission;
  const student   = state.student;
  const fd        = state.formData;

  if (!challan) return `<div class="adm-card"><p style="color:var(--t3)">Challan not found.</p></div>`;

  const campus     = AppState.findById('campuses',     challan.campusId);
  const batch      = AppState.findById('batches',      challan.batchId);
  const institute  = campus?.instituteId ? AppState.findById('institutes', campus.instituteId) : null;
  const isPaid     = challan.status === CHALLAN_STATUS.PAID;
  const isWaive    = challan.status === CHALLAN_STATUS.WAIVED;
  const isDone     = isPaid || isWaive;

  const badgeClass = isPaid ? 'paid' : isWaive ? 'waived' : '';
  const badgeLabel = isPaid ? '✓ Paid' : isWaive ? 'Waived' : 'Pending Payment';

  // Format due date
  const dueDateFmt = challan.dueDate
    ? new Date(challan.dueDate + 'T00:00:00').toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' })
    : '—';

  // ── Bank detail (first bank assigned to this institute) ────────
  const allBanks   = AppState.get('bankAccounts') || [];
  const bank       = allBanks.find(b =>
    !campus?.instituteId || (b.instituteIds || []).includes(campus.instituteId)
  ) || allBanks[0] || null;

  // ── Fee breakdown rows ──────────────────────────────────────────
  const subjectIds      = fd.subjectIds || (fd.subjectId ? [fd.subjectId] : []);
  const batchSelections = fd.batchSelections || {};
  const feeResults      = (fd._feeResults) || [];

  const feeBreakdownRows = subjectIds.map((sid, idx) => {
    const subj   = AppState.findById('subjects', sid);
    const feeRes = feeResults.find(r => r.subjectId === sid) || feeResults[idx] || {};
    const amt    = feeRes.found ? Number(feeRes.amount) : 0;
    const sym    = feeRes.symbol || 'Rs.';
    return `
      <div class="adm-challan-row">
        <span class="adm-challan-key">${subj?.subjectName || 'Subject'}</span>
        <span class="adm-challan-val" style="font-family:var(--font-mono)">
          ${feeRes.found ? sym + ' ' + amt.toLocaleString() : '<span style="color:var(--t3);font-size:12px">Not in fee structure</span>'}
        </span>
      </div>`;
  }).join('');

  // Registration fee row
  const regAmount  = Number(fd.regFeeAmount  || 0);
  const tuitionAmt = Number(fd.tuitionAmount || challan.feeAmount || 0);
  const grandTotal = Number(challan.feeAmount || 0);
  const currency   = fd.feeCurrency || 'PKR';
  const sym        = currency === 'PKR' ? 'Rs.' : currency;

  const regFeeRow = fd.regFeeAmount > 0
    ? `<div class="adm-challan-row">
         <span class="adm-challan-key">Registration Fee</span>
         <span class="adm-challan-val" style="font-family:var(--font-mono)">${sym} ${regAmount.toLocaleString()}</span>
       </div>`
    : (fd.regFeeAmount === 0 && fd.tuitionAmount > 0)
      ? `<div class="adm-challan-row">
           <span class="adm-challan-key" style="color:var(--t3)">Registration Fee</span>
           <span class="adm-challan-val" style="color:var(--green);font-size:12px">Waived</span>
         </div>`
      : '';

  // ── Late Fee: compute from policy (campus + level match) ──────
  const _stu4        = state.student || AppState.findById('students', challan.studentId);
  const lateFeeInfo  = (challan.status === CHALLAN_STATUS.PENDING)
    ? calcLateFee({ campusId: challan.campusId, levelId: _stu4?.levelId || fd.levelId, dueDate: challan.dueDate })
    : { isLate: false, daysLate: 0, lateFeeAmount: 0 };
  const lateFeeAmt   = lateFeeInfo.lateFeeAmount || 0;
  const totalPayable = grandTotal + lateFeeAmt;

  const lateFeeRow = lateFeeAmt > 0
    ? `<div class="adm-challan-row" style="background:rgba(239,68,68,.04);border-radius:6px;padding:8px 0">
         <span class="adm-challan-key" style="color:var(--red);font-weight:700">
           ⚠ Late Fee
           <span style="font-size:10.5px;font-weight:400;margin-left:4px">(${lateFeeInfo.daysLate} days overdue${lateFeeInfo.breakdown ? ' · ' + lateFeeInfo.breakdown : ''})</span>
         </span>
         <span class="adm-challan-val" style="font-family:var(--font-mono);color:var(--red)">${sym} ${lateFeeAmt.toLocaleString()}</span>
       </div>`
    : (lateFeeInfo.isLate && lateFeeInfo.withinGrace)
      ? `<div class="adm-challan-row">
           <span class="adm-challan-key" style="color:var(--yellow);font-size:12px">Late (within grace period)</span>
           <span class="adm-challan-val" style="color:var(--green);font-size:12px">No penalty yet</span>
         </div>`
      : '';

  // Amount in words (simple PKR)
  function amountInWords(n) {
    const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
                  'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen',
                  'Seventeen','Eighteen','Nineteen'];
    const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
    if (n === 0) return 'Zero';
    if (n < 20)  return ones[n];
    if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? ' ' + ones[n%10] : '');
    if (n < 1000) return ones[Math.floor(n/100)] + ' Hundred' + (n%100 ? ' ' + amountInWords(n%100) : '');
    if (n < 100000) return amountInWords(Math.floor(n/1000)) + ' Thousand' + (n%1000 ? ' ' + amountInWords(n%1000) : '');
    if (n < 10000000) return amountInWords(Math.floor(n/100000)) + ' Lakh' + (n%100000 ? ' ' + amountInWords(n%100000) : '');
    return amountInWords(Math.floor(n/10000000)) + ' Crore' + (n%10000000 ? ' ' + amountInWords(n%10000000) : '');
  }
  const inWords = totalPayable > 0 ? amountInWords(Math.floor(totalPayable)) + ' Rupees Only' : '—';

  return `
    <div class="adm-card">
      <div class="adm-card-title">Admission Challan</div>
      <div class="adm-card-sub">
        ${isDone
          ? 'Admission confirmed. Student has been activated and added to the batch.'
          : 'Challan generated. Mark as paid once the fee is received to activate the student.'}
      </div>

      <div class="adm-challan-box" id="challanPrintArea">

        <!-- ── BANK + INSTITUTE HEADER ──────────────────────── -->
        <div style="border-bottom:2px solid var(--border2);padding-bottom:14px;margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">

            <!-- Institute info -->
            <div>
              <div style="font-size:17px;font-weight:800;color:var(--t1);font-family:var(--font-display)">
                ${institute?.instituteName || campus?.campusName || 'EduTrack'}
              </div>
              ${campus ? `<div style="font-size:12px;color:var(--t3);margin-top:2px">${campus.campusName}</div>` : ''}
            </div>

            <!-- Bank info -->
            ${bank ? `
            <div style="text-align:right">
              <div style="font-size:13px;font-weight:700;color:var(--t1)">${bank.bankName}</div>
              ${bank.accountTitle ? `<div style="font-size:11.5px;color:var(--t2)">A/C Title: ${bank.accountTitle}</div>` : ''}
              ${bank.accountNo    ? `<div style="font-size:11.5px;color:var(--t2);font-family:var(--font-mono)">A/C No: ${bank.accountNo}</div>` : ''}
              ${bank.iban         ? `<div style="font-size:11px;color:var(--t3);font-family:var(--font-mono)">IBAN: ${bank.iban}</div>` : ''}
              ${bank.branchAddress? `<div style="font-size:11px;color:var(--t3)">Branch: ${bank.branchAddress}</div>` : ''}
            </div>` : ''}
          </div>

          <!-- Challan title + badge -->
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
            <div>
              <div style="font-size:15px;font-weight:700;color:var(--t1)">Fee Challan</div>
              <div style="font-size:11.5px;color:var(--t3);font-family:var(--font-mono);margin-top:2px"># ${challan.challanNo}</div>
            </div>
            <div class="adm-challan-badge ${badgeClass}">${badgeLabel}</div>
          </div>
        </div>

        <!-- ── STUDENT INFO ──────────────────────────────────── -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;margin-bottom:14px">
          <div class="adm-challan-row"><span class="adm-challan-key">Student Name</span><span class="adm-challan-val">${student?.studentName || '—'}</span></div>
          <div class="adm-challan-row"><span class="adm-challan-key">Father Name</span><span class="adm-challan-val">${student?.fatherName || '—'}</span></div>
          <div class="adm-challan-row"><span class="adm-challan-key">CNIC</span><span class="adm-challan-val" style="font-family:var(--font-mono)">${student?.cnic || student?.uniqueId || '—'}</span></div>
          <div class="adm-challan-row"><span class="adm-challan-key">Campus</span><span class="adm-challan-val">${campus?.campusName || '—'}</span></div>
          <div class="adm-challan-row"><span class="adm-challan-key">Batch</span><span class="adm-challan-val">${batch?.batchName || '—'}</span></div>
          <div class="adm-challan-row"><span class="adm-challan-key">Session</span><span class="adm-challan-val">${challan.session || '—'}</span></div>
          <div class="adm-challan-row"><span class="adm-challan-key">Issue Date</span><span class="adm-challan-val">${_fmtDate(challan.issuedAt)}</span></div>
          <div class="adm-challan-row">
            <span class="adm-challan-key">Due Date</span>
            <span class="adm-challan-val" style="color:${isDone ? 'var(--t1)' : 'var(--red)'}">
              ${dueDateFmt}
            </span>
          </div>
        </div>

        <!-- ── FEE BREAKDOWN ─────────────────────────────────── -->
        <div style="border-top:1px solid var(--border2);padding-top:12px;margin-bottom:4px">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--t3);margin-bottom:8px">Fee Breakdown</div>
          ${feeBreakdownRows || `<div class="adm-challan-row"><span class="adm-challan-key">Tuition Fee</span><span class="adm-challan-val" style="font-family:var(--font-mono)">${sym} ${tuitionAmt.toLocaleString()}</span></div>`}
          ${regFeeRow}
          ${lateFeeRow}
        </div>

        <!-- ── TOTAL ─────────────────────────────────────────── -->
        <div style="background:${lateFeeAmt > 0 ? 'rgba(239,68,68,.06)' : 'var(--surface2)'};border-radius:var(--r-sm);padding:12px 14px;margin-top:10px;border:1px solid ${lateFeeAmt > 0 ? 'rgba(239,68,68,.25)' : 'var(--border2)'}">
          ${lateFeeAmt > 0 ? `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid rgba(239,68,68,.15)">
            <span style="font-size:12.5px;color:var(--t2)">Base Fee</span>
            <span style="font-family:var(--font-mono);font-size:13.5px;color:var(--t2)">${sym} ${grandTotal.toLocaleString()}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid rgba(239,68,68,.15)">
            <span style="font-size:12.5px;color:var(--red)">Late Fee Penalty</span>
            <span style="font-family:var(--font-mono);font-size:13.5px;color:var(--red)">+ ${sym} ${lateFeeAmt.toLocaleString()}</span>
          </div>` : ''}
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:13px;font-weight:700;color:var(--t1)">Total Payable</span>
            <span style="font-size:20px;font-weight:800;color:${lateFeeAmt > 0 ? 'var(--red)' : 'var(--blue)'};font-family:var(--font-mono)">${sym} ${totalPayable.toLocaleString()}</span>
          </div>
          <div style="font-size:11.5px;color:var(--t3);margin-top:4px;font-style:italic">${inWords}</div>
        </div>

        ${isPaid ? `
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border2)">
          <div class="adm-challan-row" style="color:var(--green)">
            <span class="adm-challan-key">Paid On</span>
            <span class="adm-challan-val">${_fmtDate(challan.paidAt)}</span>
          </div>
          <div class="adm-challan-row" style="color:var(--green)">
            <span class="adm-challan-key">Receipt No.</span>
            <span class="adm-challan-val" style="font-family:var(--font-mono)">${challan.receiptNo || '—'}</span>
          </div>
        </div>` : ''}
      </div>

      <div class="adm-actions">
        <div style="display:flex;gap:10px">
          <button class="adm-btn adm-btn-ghost" id="admPrintChallan">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Print
          </button>
          ${!isDone ? `
          <button class="adm-btn adm-btn-danger" id="admWaiveFee">
            Waive Fee
          </button>` : ''}
        </div>

        <div style="display:flex;gap:10px">
          ${!isDone ? `
          <button class="adm-btn adm-btn-success" id="admMarkPaid">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Mark as Paid
          </button>` : ''}
          <button class="adm-btn ${isDone ? 'adm-btn-primary' : 'adm-btn-ghost'}" id="admDone">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Done
          </button>
        </div>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────
// EVENT WIRING
// ─────────────────────────────────────────────────────────────

function _wireStep(el, state, render, opts) {
  const $ = id => el.querySelector('#' + id);

  // ── Tab toggle (New / Existing) ───────────────────────────────
  el.querySelectorAll('.adm-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.mode = btn.dataset.tab;
      state.studentId = null;
      render();
    });
  });

  // ── Stepper: click on completed steps to navigate back ─────────
  // Only works on already-completed steps (done class).
  // Does not allow forward navigation — only back to review/edit saved data.
  el.querySelectorAll('.adm-step[data-goto]').forEach(stepEl => {
    stepEl.addEventListener('click', () => {
      const targetStep = parseInt(stepEl.dataset.goto);
      if (targetStep >= state.step) return; // no forward navigation
      // Step 4 (Challan) is locked — admission already submitted
      if (state.step === 4) return;
      state.step = targetStep;
      render();
    });
  });

  // ── Step 1 wiring ─────────────────────────────────────────────
  if (state.step === 1) {

    // CNIC auto-format on blur (new mode)
    $('admCnic')?.addEventListener('blur', e => {
      const r = validateCNIC(e.target.value);
      if (r.valid) e.target.value = r.formatted;
    });

    // Existing student CNIC lookup
    $('admCnicSearchBtn')?.addEventListener('click', () => {
      const raw = $('admCnicLookup')?.value;
      const r   = validateCNIC(raw || '');
      const errEl = $('admCnicLookupErr');
      if (!r.valid) {
        errEl.textContent = r.message; errEl.classList.add('show'); return;
      }
      errEl.classList.remove('show');
      const found = findStudentByCNIC(raw);
      const foundEl = $('admStudentFound');
      if (found) {
        state.studentId = found.id;
        state.formData  = { ...state.formData, campusId: found.campusId };
        $('admFoundName').textContent = found.studentName;
        $('admFoundMeta').textContent = `CNIC: ${found.cnic || found.uniqueId}  ·  Campus: ${AppState.findById('campuses', found.campusId)?.campusName || '—'}`;
        foundEl.classList.add('show');
      } else {
        state.studentId = null;
        foundEl.classList.remove('show');
        errEl.textContent = 'No student found with this CNIC. Please use the "New Student" tab.';
        errEl.classList.add('show');
      }
    });

    // Next button — step 1 → 2
    $('admNext1')?.addEventListener('click', () => {
      if (state.mode === 'existing') {
        if (!state.studentId) {
          Toast.error('Please search and select an existing student first.');
          return;
        }
        state.step = 2;
        render();
        return;
      }

      // Collect new student data (no campusId here — that's step 2)
      const data = {
        firstName:     $('admFirstName')?.value.trim()     || '',
        lastName:      $('admLastName')?.value.trim()      || '',
        fatherName:    $('admFatherName')?.value.trim()    || '',
        cnic:          $('admCnic')?.value.trim()          || '',
        gender:        $('admGender')?.value               || '',
        dob:           $('admDob')?.value                  || '',
        phone:         $('admPhone')?.value.trim()         || '',
        email:         $('admEmail')?.value.trim()         || '',
        qualification: $('admQualification')?.value.trim() || '',
        address:       $('admAddress')?.value.trim()       || '',
      };

      // Validate only personal info fields — handle missing service gracefully
      let valid = true;
      let errors = {};
      try {
        const result = AdmissionService.validateStudentInfo(data);
        valid  = result.valid;
        errors = result.errors || {};
      } catch (e) {
        // If service unavailable, do basic client-side validation
        if (!data.firstName)  errors.firstName  = 'First name is required.';
        if (!data.lastName)   errors.lastName   = 'Last name is required.';
        if (!data.fatherName) errors.fatherName = 'Father name is required.';
        if (!data.cnic)       errors.cnic       = 'CNIC is required.';
        if (!data.gender)     errors.gender     = 'Gender is required.';
        if (!data.phone)      errors.phone      = 'Phone is required.';
        valid = Object.keys(errors).length === 0;
      }

      _clearFieldErrors(el);
      if (!valid) { _showFieldErrors(el, errors); return; }

      state.formData = { ...state.formData, ...data };
      state.step     = 2;
      render();
    });
  }

  // ── Step 2 wiring ─────────────────────────────────────────────
  if (state.step === 2) {

    $('admBack2')?.addEventListener('click', () => { state.step = 1; render(); });

    // ✅ FIX: Sync dropdown values into state immediately on Step 2 render.
    // 'change' events only fire on user interaction — if campus was auto-selected
    // or pre-filled, state.formData would be empty and Next validation would fail.
    const _campusDom = $('admCampus');
    if (_campusDom?.value) {
      state.formData.campusId = _campusDom.value;
    }

    // Campus → reset discipline/level/subjects/batches
    $('admCampus')?.addEventListener('change', e => {
      state.formData.campusId      = e.target.value;
      state.formData.disciplineId  = '';
      state.formData.levelId       = '';
      state.formData.subjectIds    = [];
      state.formData.batchSelections = {};
      render();
    });

    // Discipline → reset level/subjects/batches
    $('admDiscipline')?.addEventListener('change', e => {
      state.formData.disciplineId  = e.target.value;
      state.formData.levelId       = '';
      state.formData.subjectIds    = [];
      state.formData.batchSelections = {};
      render();
    });

    // Level → reset subjects/batches
    $('admLevel')?.addEventListener('change', e => {
      state.formData.levelId    = e.target.value;
      state.formData.subjectIds = [];
      state.formData.batchSelections = {};
      render();
    });

    // Subject search filter — live filter pills by code/name
    $('admSubjectSearch')?.addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      el.querySelectorAll('.adm-subject-pill').forEach(pill => {
        const label = (pill.dataset.subjectLabel || pill.textContent).toLowerCase();
        pill.style.display = label.includes(q) ? '' : 'none';
      });
    });

    // Select All / Deselect All subjects
    $('admSelectAllSubjects')?.addEventListener('click', () => {
      const allChk = [...el.querySelectorAll('.adm-subject-chk')];
      const allChecked = allChk.every(ch => ch.checked);
      allChk.forEach(ch => { ch.checked = !allChecked; });
      const checked = allChecked ? [] : allChk.map(ch => ch.value);
      const prev = state.formData.batchSelections || {};
      const newSel = {};
      checked.forEach(sid => { if (prev[sid]) newSel[sid] = prev[sid]; });
      state.formData.subjectIds      = checked;
      state.formData.batchSelections = newSel;
      render();
    });

    // Subject checkboxes — multi select, re-render batch cards on change
    el.querySelectorAll('.adm-subject-chk').forEach(chk => {
      chk.addEventListener('change', () => {
        const checked = [...el.querySelectorAll('.adm-subject-chk:checked')].map(c => c.value);
        // Remove deselected subjects from batchSelections
        const prev = state.formData.batchSelections || {};
        const newSel = {};
        checked.forEach(sid => { if (prev[sid]) newSel[sid] = prev[sid]; });
        state.formData.subjectIds      = checked;
        state.formData.batchSelections = newSel;
        render();
      });
    });

    // Batch search filters — one per subject block
    el.querySelectorAll('[id^="batchSearch_"]').forEach(input => {
      const sid    = input.id.replace('batchSearch_', '');
      const listEl = el.querySelector('#batchList_' + sid);
      if (!listEl) return;
      input.addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        listEl.querySelectorAll('label[data-batch-label]').forEach(row => {
          row.style.display = row.dataset.batchLabel.includes(q) ? '' : 'none';
        });
      });
    });

    // Batch radio buttons — store per subject
    el.querySelectorAll('.adm-batch-radio').forEach(radio => {
      radio.addEventListener('change', e => {
        const subjectId = e.target.dataset.subject;
        if (!state.formData.batchSelections) state.formData.batchSelections = {};
        state.formData.batchSelections[subjectId] = e.target.value;
      });
    });

    // Next button — step 2 → 3
    $('admNext2')?.addEventListener('click', () => {
      // ✅ FIX: Read directly from DOM and convert to string to avoid type mismatch
      // (campus IDs may be numbers in state but strings in DOM values)
      const campusId     = String(state.formData.campusId     || $('admCampus')?.value     || '').trim();
      const disciplineId = String(state.formData.disciplineId || $('admDiscipline')?.value  || '').trim();
      const levelId      = String(state.formData.levelId      || $('admLevel')?.value       || '').trim();
      const subjectIds  = state.formData.subjectIds || [];
      const batchSelections = state.formData.batchSelections || {};

      _clearFieldErrors(el);
      let hasError = false;

      if (!campusId)     { _showFieldErrors(el, { campusId: 'Please select a campus.' });           hasError = true; }
      if (!disciplineId) { _showFieldErrors(el, { disciplineId: 'Please select a discipline.' });   hasError = true; }
      if (!levelId)      { _showFieldErrors(el, { levelId: 'Please select a level.' });             hasError = true; }
      if (subjectIds.length === 0) {
        _showFieldErrors(el, { subjectId: 'Please select at least one subject.' });
        hasError = true;
      }

      // Check batch selection for each subject — but skip subjects that
      // genuinely have NO open batch available at all. Those should still
      // proceed to the fee challan (batch can be assigned to them later)
      // instead of permanently blocking the admission flow.
      const noBatchSubjects = state.formData._noBatchSubjectIds || [];
      if (!hasError) {
        const missingBatch = subjectIds.find(
          sid => !batchSelections[sid] && !noBatchSubjects.includes(sid)
        );
        if (missingBatch) {
          _showFieldErrors(el, { batchId: 'Please select a batch for each subject.' });
          hasError = true;
        }
      }

      if (hasError) return;

      state.formData = {
        ...state.formData,
        campusId, disciplineId, levelId,
        subjectIds, batchSelections,
        // backward compat: single subjectId / batchId = first selection
        subjectId: subjectIds[0] || '',
        batchId:   batchSelections[subjectIds[0]] || '',
      };
      state.step = 3;
      render();
    });
  }

  // ── Step 3 wiring ─────────────────────────────────────────────
  if (state.step === 3) {

    $('admBack3')?.addEventListener('click', () => {
      // Cancel auto-saved challan if user goes back (they may change subjects/campus)
      if (state.challan?.id) {
        AdmissionService.cancelAdmission(state.admission?.id || '', 'User went back to edit');
        state.challan   = null;
        state.admission = null;
        state.student   = null;
      }
      state._challanSaving = false;
      state.step = 2;
      render();
    });

    // Sync dueDate from DOM into state (already calculated by _step3HTML)
    const dueDateInput = $('admDueDate');
    if (dueDateInput?.value) {
      state.formData.dueDate = dueDateInput.value;
    }

    // If user manually changes due date, store override
    dueDateInput?.addEventListener('change', e => {
      state.formData.dueDate = e.target.value;
    });

    $('admSubmit')?.addEventListener('click', () => {
      // Challan already saved — just navigate to step 4
      if (state.challan) {
        // Update due date if user changed it
        const dueDate = $('admDueDate')?.value || state.formData.dueDate || '';
        if (dueDate && state.challan.dueDate !== dueDate) {
          AppState.update('challans', state.challan.id, { dueDate, updatedAt: new Date().toISOString() });
          state.challan = (AppState.get('challans') || []).find(c => c.id === state.challan.id) || state.challan;
        }
        state.step = 4;
        render();
        Toast.success('Admission submitted. Challan generated successfully.');
        return;
      }

      // Fallback: challan not yet created (edge case) — create now
      const feeAmount = state.formData.feeAmount || 0;
      const dueDate   = $('admDueDate')?.value || state.formData.dueDate || '';
      state.formData.feeAmount = feeAmount;
      state.formData.dueDate   = dueDate;

      let result;
      if (state.mode === 'existing' && state.studentId) {
        result = AdmissionService.submitReAdmission(state.studentId, state.formData);
      } else {
        result = AdmissionService.submitNewAdmission(state.formData);
      }

      if (!result.success) {
        Toast.error(result.message || 'Admission failed.');
        return;
      }

      state.admission = result.admission;
      state.student   = result.student;
      state.challan   = result.challan;
      state.step      = 4;

      const freshChallan = (AppState.get('challans') || []).find(c => c.id === result.challan.id);
      if (freshChallan) state.challan = freshChallan;

      render();
      Toast.success('Admission submitted. Challan generated successfully.');
    });
  }

  // ── Step 4 wiring ─────────────────────────────────────────────
  if (state.step === 4) {

    $('admMarkPaid')?.addEventListener('click', () => {
      if (!state.challan?.id) return;
      const result = AdmissionService.markChallanPaid(state.challan.id);
      if (!result.success) { Toast.error(result.message); return; }
      // Refresh challan from state
      state.challan = (AppState.get('challans') || []).find(c => c.id === state.challan.id) || state.challan;
      render();
      Toast.success('Challan marked as paid. Student is now active.');
    });

    $('admWaiveFee')?.addEventListener('click', () => {
      if (!state.challan?.id) return;
      const result = AdmissionService.waiveChallan(state.challan.id, 'Waived by admin');
      if (!result.success) { Toast.error(result.message); return; }
      state.challan = (AppState.get('challans') || []).find(c => c.id === state.challan.id) || state.challan;
      render();
      Toast.success('Fee waived. Student has been activated.');
    });

    $('admPrintChallan')?.addEventListener('click', () => {
      const ch      = state.challan;
      const st      = state.student;
      const fd      = state.formData;
      if (!ch) return;

      const campus    = AppState.findById('campuses',    ch.campusId);
      const batch     = AppState.findById('batches',     ch.batchId);
      const institute = campus?.instituteId ? AppState.findById('institutes', campus.instituteId) : null;
      const allBanks  = AppState.get('bankAccounts') || [];
      const bank      = allBanks.find(b => !campus?.instituteId || (b.instituteIds||[]).includes(campus.instituteId)) || allBanks[0] || null;

      const subjectIds      = fd.subjectIds || (fd.subjectId ? [fd.subjectId] : []);
      const feeResults      = fd._feeResults || [];
      const regAmount       = Number(fd.regFeeAmount || 0);
      const grandTotal      = Number(ch.feeAmount || 0);
      const sym             = (fd.feeCurrency === 'PKR' || !fd.feeCurrency) ? 'Rs.' : fd.feeCurrency;

      const dueDateFmt = ch.dueDate
        ? new Date(ch.dueDate + 'T00:00:00').toLocaleDateString('en-PK', { day:'2-digit', month:'short', year:'numeric' })
        : '—';
      const issueDateFmt = ch.issuedAt
        ? new Date(ch.issuedAt).toLocaleDateString('en-PK', { day:'2-digit', month:'short', year:'numeric' })
        : '—';

      // Amount in words
      function amtWords(n) {
        const ones=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
        const tensArr=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
        if(n===0) return 'Zero';
        if(n<20) return ones[n];
        if(n<100) return tensArr[Math.floor(n/10)]+(n%10?' '+ones[n%10]:'');
        if(n<1000) return ones[Math.floor(n/100)]+' Hundred'+(n%100?' '+amtWords(n%100):'');
        if(n<100000) return amtWords(Math.floor(n/1000))+' Thousand'+(n%1000?' '+amtWords(n%1000):'');
        if(n<10000000) return amtWords(Math.floor(n/100000))+' Lakh'+(n%100000?' '+amtWords(n%100000):'');
        return amtWords(Math.floor(n/10000000))+' Crore'+(n%10000000?' '+amtWords(n%10000000):'');
      }
      // Late fee for print (re-compute since state may differ in print closure)
      const _printStu    = state.student || AppState.findById('students', ch.studentId);
      const _printLF     = (ch.status === 'pending')
        ? calcLateFee({ campusId: ch.campusId, levelId: _printStu?.levelId || fd.levelId, dueDate: ch.dueDate })
        : { isLate: false, lateFeeAmount: 0 };
      const printLateFee = _printLF.lateFeeAmount || 0;
      const printTotal   = grandTotal + printLateFee;
      const inWords = printTotal > 0 ? amtWords(Math.floor(printTotal)) + ' Rupees Only' : 'Zero';

      // Build fee rows
      const feeRows = subjectIds.map((sid, idx) => {
        const subj   = AppState.findById('subjects', sid);
        const feeRes = feeResults.find(r => r.subjectId === sid) || feeResults[idx] || {};
        const amt    = feeRes.found ? Number(feeRes.amount) : 0;
        return `<tr><td>${subj?.subjectName || 'Tuition Fee'}</td><td style="text-align:right;font-weight:700">${feeRes.found ? sym+' '+amt.toLocaleString()+'.00' : '—'}</td></tr>`;
      }).join('') || `<tr><td>Tuition Fee</td><td style="text-align:right;font-weight:700">${sym} ${(grandTotal - regAmount).toLocaleString()}.00</td></tr>`;

      const regRow = regAmount > 0
        ? `<tr><td>Registration Fee</td><td style="text-align:right;font-weight:700">${sym} ${regAmount.toLocaleString()}.00</td></tr>`
        : (fd.regFeeAmount === 0 ? `<tr><td>Registration Fee</td><td style="text-align:right;color:#059669">Waived</td></tr>` : '');

      const bankHTML = bank ? `
        <div style="font-size:12px;color:#444;margin-top:2px">${bank.bankName}${bank.branchAddress ? ' — ' + bank.branchAddress : ''}</div>
        ${bank.accountTitle ? `<div style="font-size:11.5px;color:#555">A/C Title: <b>${bank.accountTitle}</b></div>` : ''}
        ${bank.accountNo    ? `<div style="font-size:11.5px;color:#555">A/C No: <b>${bank.accountNo}</b></div>` : ''}
        ${bank.iban         ? `<div style="font-size:11px;color:#777">IBAN: ${bank.iban}</div>` : ''}
      ` : '<div style="font-size:12px;color:#aaa">No bank configured</div>';

      // One copy template
      const makeCopy = (copyLabel) => `
        <div class="copy">
          <!-- Header -->
          <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:10px">
            <div style="font-size:18px;font-weight:900;letter-spacing:.5px">${institute?.instituteName || campus?.campusName || 'EduTrack'}</div>
            ${campus ? `<div style="font-size:12px;color:#555">${campus.campusName}</div>` : ''}
            <div style="font-size:13px;font-weight:700;margin-top:6px">Student Fee Challan</div>
            ${bankHTML}
          </div>

          <!-- Copy label -->
          <div style="text-align:right;font-size:11px;font-weight:700;color:#555;margin-bottom:6px;text-transform:uppercase;letter-spacing:.08em">${copyLabel}</div>

          <!-- Student info grid -->
          <table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:10px">
            <tr>
              <td style="color:#555;padding:3px 0;width:38%">Challan #</td>
              <td style="font-weight:700;font-family:monospace">${ch.challanNo}</td>
            </tr>
            <tr>
              <td style="color:#555;padding:3px 0">Student Name</td>
              <td style="font-weight:700">${st?.studentName || '—'}</td>
            </tr>
            <tr>
              <td style="color:#555;padding:3px 0">Father Name</td>
              <td>${st?.fatherName || '—'}</td>
            </tr>
            <tr>
              <td style="color:#555;padding:3px 0">CNIC</td>
              <td style="font-family:monospace">${st?.cnic || st?.uniqueId || '—'}</td>
            </tr>
            <tr>
              <td style="color:#555;padding:3px 0">Campus</td>
              <td>${campus?.campusName || '—'}</td>
            </tr>
            <tr>
              <td style="color:#555;padding:3px 0">Batch</td>
              <td>${batch?.batchName || '—'}</td>
            </tr>
            <tr>
              <td style="color:#555;padding:3px 0">Session</td>
              <td>${ch.session || '—'}</td>
            </tr>
            <tr>
              <td style="color:#555;padding:3px 0">Issue Date</td>
              <td>${issueDateFmt}</td>
            </tr>
            <tr>
              <td style="color:#555;padding:3px 0">Due Date</td>
              <td style="font-weight:700;color:#c00">${dueDateFmt}</td>
            </tr>
          </table>

          <!-- Fee breakdown table -->
          <table style="width:100%;border-collapse:collapse;font-size:12.5px;border:1px solid #ddd;margin-bottom:8px">
            <thead>
              <tr style="background:#f5f5f5">
                <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #ddd">Description</th>
                <th style="text-align:right;padding:6px 8px;border-bottom:1px solid #ddd">Amount (${sym})</th>
              </tr>
            </thead>
            <tbody>
              ${feeRows}
              ${regRow}
              ${printLateFee > 0 ? `<tr style="color:#c00;background:#fff5f5">
                <td style="padding:5px 8px">Late Fee Penalty (${_printLF.daysLate} days overdue)</td>
                <td style="text-align:right;padding:5px 8px;font-weight:700">${sym} ${printLateFee.toLocaleString()}.00</td>
              </tr>` : ''}
              <tr style="background:#f0f0f0;font-weight:700">
                <td style="padding:7px 8px;border-top:2px solid #bbb">Total Payable</td>
                <td style="text-align:right;padding:7px 8px;border-top:2px solid #bbb">${sym} ${printTotal.toLocaleString()}.00</td>
              </tr>
            </tbody>
          </table>

          <!-- In words -->
          <div style="font-size:11.5px;color:#444;margin-bottom:12px">
            <b>In Words:</b> ${inWords}
          </div>

          <!-- Signatures -->
          <div style="display:flex;justify-content:space-between;margin-top:20px;font-size:11px;color:#555">
            <div style="text-align:center">
              <div style="border-top:1px solid #999;width:100px;margin-bottom:3px"></div>
              Bank Stamp
            </div>
            <div style="text-align:center">
              <div style="border-top:1px solid #999;width:120px;margin-bottom:3px"></div>
              Head of Institution
            </div>
          </div>
        </div>`;

      const w = window.open('', '_blank', 'width=900,height:700');
      w.document.write(`<!DOCTYPE html>
<html><head>
<title>Fee Challan — ${ch.challanNo}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Segoe UI',Arial,sans-serif; background:#fff; color:#111; }
  .page { display:flex; gap:0; }
  .copy {
    flex:1; padding:16px 14px;
    border-right:1px dashed #bbb;
    page-break-inside:avoid;
  }
  .copy:last-child { border-right:none; }
  @media print {
    body { margin:0; }
    .page { display:flex; }
    .no-print { display:none; }
  }
  .no-print {
    text-align:center; padding:14px;
    background:#f5f5f5; border-bottom:1px solid #ddd;
  }
  .no-print button {
    padding:8px 24px; background:#1d4ed8; color:#fff;
    border:none; border-radius:6px; cursor:pointer; font-size:13px; font-weight:600;
  }
</style>
</head><body>
<div class="no-print">
  <button onclick="window.print()">🖨 Print Challan</button>
</div>
<div class="page">
  ${makeCopy('Student Copy')}
  ${makeCopy('Office Copy')}
  ${makeCopy('Bank Copy')}
</div>
</body></html>`);
      w.document.close();
    });

    // Done button — closes wizard / calls onComplete / resets for new admission
    $('admDone')?.addEventListener('click', () => {
      // Capture completed data before reset
      const completedAdmission = state.admission;
      const completedStudent   = state.student;
      const completedChallan   = state.challan;

      // Reset wizard for a fresh new admission
      state.step      = 1;
      state.formData  = {};
      state.admission = null;
      state.student   = null;
      state.challan   = null;
      state.studentId = null;
      state.mode      = 'new';
      render();

      // Fire onComplete only when user explicitly clicks Done (not on auto-render)
      opts.onComplete?.({ admission: completedAdmission, student: completedStudent, challan: completedChallan });
    });
  }
}

// ─────────────────────────────────────────────────────────────
// Field error helpers
// ─────────────────────────────────────────────────────────────

function _clearFieldErrors(el) {
  el.querySelectorAll('.adm-input.err, .adm-select.err').forEach(e => e.classList.remove('err'));
  el.querySelectorAll('.adm-field-err.show').forEach(e => { e.classList.remove('show'); e.textContent = ''; });
}

function _showFieldErrors(el, errors) {
  const fieldMap = {
    firstName:    ['admFirstName',    'errFirstName'],
    lastName:     ['admLastName',     'errLastName'],
    fatherName:   ['admFatherName',   'errFatherName'],
    cnic:         ['admCnic',         'errCnic'],
    gender:       ['admGender',       'errGender'],
    phone:        ['admPhone',        'errPhone'],
    campusId:     ['admCampus',       'errCampusId'],
    disciplineId: ['admDiscipline',   'errDisciplineId'],
    levelId:      ['admLevel',        'errLevelId'],
    subjectId:    ['admDiscipline',   'errSubjectId'],
    batchId:      ['admDiscipline',   'errBatchId'],
  };

  Object.entries(errors).forEach(([field, msg]) => {
    const pair = fieldMap[field];
    if (!pair) return;
    const [inputId, errId] = pair;
    const input = el.querySelector('#' + inputId);
    const errEl = el.querySelector('#' + errId);
    if (input)  input.classList.add('err');
    if (errEl)  { errEl.textContent = msg; errEl.classList.add('show'); }
    // If errEl doesn't exist in DOM (wrong step), show as toast instead
    if (!errEl && msg) Toast.warning(msg);
  });

  // Scroll first error into view
  const firstErr = el.querySelector('.adm-input.err, .adm-select.err');
  if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ─────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────

function _fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}

// ─────────────────────────────────────────────────────────────
// Smart Due Date Calculator
// Reads challanDueSettings (dueDays + bankWorkingDays) + holidays[]
// Counts only bank working days, skips holidays
// ─────────────────────────────────────────────────────────────
// admissionDate: ISO string (e.g. "2025-04-19") — counting starts AFTER this date.
// If omitted, today is used as the base (admission day = today, also excluded).
function _calcDueDate(admissionDate) {
  const settings        = AppState.get("challanDueSettings") || {};
  const dueDays         = Number(settings.dueDays) || 15;
  const bankWorkingDays = settings.bankWorkingDays || {
    mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false,
  };

  // JS getDay(): 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
  const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

  // Holiday date set for O(1) lookup
  const holidays   = AppState.get("holidays") || [];
  const holidaySet = new Set(holidays.map(h => h.date).filter(Boolean));

  // Parse admissionDate in LOCAL time (avoid UTC midnight timezone shift)
  // e.g. '2025-04-19' -> local April 19, not April 18 in UTC+5
  let base;
  if (admissionDate) {
    const [y, m, d] = admissionDate.split('-').map(Number);
    base = new Date(y, m - 1, d, 0, 0, 0, 0);
  } else {
    base = new Date();
    base.setHours(0, 0, 0, 0);
  }
  const cursor = new Date(base);
  let counted = 0;

  // Count banking working days AFTER the admission date (admission day itself excluded)
  while (counted < dueDays) {
    cursor.setDate(cursor.getDate() + 1);
    const dayKey  = DAY_KEYS[cursor.getDay()];
    const dateStr = cursor.toISOString().split("T")[0];
    // Count only if: bank working day AND not a holiday
    if (bankWorkingDays[dayKey] && !holidaySet.has(dateStr)) {
      counted++;
    }
  }

  // Format as YYYY-MM-DD in local time (avoid UTC shift)
  const yy = cursor.getFullYear();
  const mm = String(cursor.getMonth() + 1).padStart(2, '0');
  const dd = String(cursor.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// ─────────────────────────────────────────────────────────────
// MARK PAYMENT PANEL
// A standalone panel (mountable in any container) that shows
// ALL challans with search + status filter + mark-paid action.
//
// Usage:
//   MarkPaymentPanel.mount(containerEl)
//   MarkPaymentPanel.unmount()
// ─────────────────────────────────────────────────────────────

export const MarkPaymentPanel = {

  _el:       null,
  _search:   '',
  _status:   'pending',   // default: show pending only
  _campusId: '',

  mount(el) {
    if (!el) return;
    this._el = el;
    ensureAdmissionState();
    this._render();
  },

  unmount() {
    if (this._el) this._el.innerHTML = '';
    this._el = null;
  },

  _render() {
    const el = this._el;
    if (!el) return;

    const challans  = getAllChallansForPayment({
      search:   this._search,
      status:   this._status,
      campusId: this._campusId,
    });

    const campuses     = (AppState.get('campuses') || []);
    const user         = (typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null);
    const showCampusFil = !user?.campusId && campuses.length > 1;

    // Status counts for filter badges
    const all     = getAllChallansForPayment({ search: this._search });
    const counts  = {
      all:     all.length,
      pending: all.filter(c => c.status === 'pending').length,
      paid:    all.filter(c => c.status === 'paid').length,
      waived:  all.filter(c => c.status === 'waived').length,
    };

    el.innerHTML = `
      <div class="mp-root">
        <style>
          .mp-root { font-family: inherit; }
          .mp-toolbar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:16px; }
          .mp-search-wrap { position:relative; flex:1; min-width:200px; }
          .mp-search-wrap svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:var(--t3); pointer-events:none; }
          .mp-search { width:100%; padding:9px 12px 9px 34px; background:var(--surface2); border:1px solid var(--border2); border-radius:var(--r-sm); color:var(--t1); font-size:13.5px; outline:none; font-family:inherit; }
          .mp-search:focus { border-color:var(--blue); box-shadow:0 0 0 3px rgba(79,133,247,.12); }
          .mp-filter-group { display:flex; gap:4px; background:var(--surface2); border-radius:var(--r-sm); padding:3px; }
          .mp-filter-btn { padding:6px 14px; border-radius:6px; font-size:12.5px; font-weight:600; color:var(--t3); cursor:pointer; transition:all .15s; white-space:nowrap; }
          .mp-filter-btn.active { background:var(--blue); color:#fff; }
          .mp-filter-btn:not(.active):hover { color:var(--t1); }
          .mp-badge { display:inline-block; min-width:18px; height:18px; border-radius:9px; font-size:10.5px; font-weight:700; line-height:18px; text-align:center; padding:0 5px; margin-left:5px; background:rgba(255,255,255,.25); }
          .mp-filter-btn:not(.active) .mp-badge { background:var(--surface); color:var(--t3); }
          .mp-table-wrap { overflow-x:auto; border:1px solid var(--border2); border-radius:var(--r-sm); }
          .mp-table { width:100%; border-collapse:collapse; font-size:13px; }
          .mp-table thead tr { background:var(--surface2); }
          .mp-table th { padding:10px 14px; text-align:left; font-size:11.5px; font-weight:700; color:var(--t3); text-transform:uppercase; letter-spacing:.05em; white-space:nowrap; border-bottom:1px solid var(--border2); }
          .mp-table tbody tr { border-bottom:1px solid var(--border); transition:background .1s; }
          .mp-table tbody tr:last-child { border-bottom:none; }
          .mp-table tbody tr:hover { background:var(--surface2); }
          .mp-table td { padding:10px 14px; color:var(--t1); vertical-align:middle; }
          .mp-status-badge { display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; }
          .mp-status-pending { background:var(--yellow-dim); color:var(--yellow); }
          .mp-status-paid    { background:var(--green-dim);  color:var(--green);  }
          .mp-status-waived  { background:var(--blue-dim);   color:var(--blue);   }
          .mp-status-overdue { background:rgba(239,68,68,.12); color:var(--red); }
          .mp-btn-paid { padding:5px 13px; background:var(--green); color:#fff; border:none; border-radius:var(--r-sm); font-size:12px; font-weight:700; cursor:pointer; transition:opacity .15s; }
          .mp-btn-paid:hover { opacity:.85; }
          .mp-late-tag { font-size:10.5px; color:var(--red); font-weight:600; margin-left:5px; }
          .mp-empty { text-align:center; padding:40px 20px; color:var(--t3); font-size:13.5px; }
          .mp-campus-sel { padding:8px 12px; background:var(--surface2); border:1px solid var(--border2); border-radius:var(--r-sm); color:var(--t1); font-size:13px; outline:none; }
        </style>

        <!-- Toolbar -->
        <div class="mp-toolbar">
          <!-- Search -->
          <div class="mp-search-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input class="mp-search" id="mpSearch" placeholder="Search by name, CNIC, challan #, session…" value="${this._search}">
          </div>

          ${showCampusFil ? `
          <select class="mp-campus-sel" id="mpCampusSel">
            <option value="">All Campuses</option>
            ${campuses.map(c => `<option value="${c.id}" ${this._campusId === c.id ? 'selected':''}>
              ${c.campusName.replace(/\s*campus$/i,'').trim()}
            </option>`).join('')}
          </select>` : ''}

          <!-- Status filter -->
          <div class="mp-filter-group">
            ${[
              { val: '',        label: 'All',     count: counts.all },
              { val: 'pending', label: 'Pending', count: counts.pending },
              { val: 'paid',    label: 'Paid',    count: counts.paid },
              { val: 'waived',  label: 'Waived',  count: counts.waived },
            ].map(f => `
              <button class="mp-filter-btn ${this._status === f.val ? 'active' : ''}" data-status="${f.val}">
                ${f.label}<span class="mp-badge">${f.count}</span>
              </button>`).join('')}
          </div>
        </div>

        <!-- Table -->
        <div class="mp-table-wrap">
          ${challans.length === 0
            ? `<div class="mp-empty">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.3;margin-bottom:8px"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <div>No challans found${this._search ? ' matching "' + this._search + '"' : ''}.</div>
               </div>`
            : `<table class="mp-table">
                <thead>
                  <tr>
                    <th>Challan #</th>
                    <th>Student</th>
                    <th>CNIC</th>
                    <th>Campus</th>
                    <th>Session</th>
                    <th>Due Date</th>
                    <th>Base Fee</th>
                    <th>Late Fee</th>
                    <th>Total Payable</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${challans.map(c => {
                    const lf        = c.lateFeeInfo || {};
                    const isOverdue = lf.isLate && lf.lateFeeAmount > 0;
                    const isGrace   = lf.isLate && lf.withinGrace;
                    const dueStr    = c.dueDate
                      ? new Date(c.dueDate + 'T00:00:00').toLocaleDateString('en-PK', { day:'2-digit', month:'short', year:'numeric' })
                      : '—';

                    let statusBadge;
                    if (c.status === 'paid')   statusBadge = `<span class="mp-status-badge mp-status-paid">✓ Paid</span>`;
                    else if (c.status === 'waived') statusBadge = `<span class="mp-status-badge mp-status-waived">Waived</span>`;
                    else if (isOverdue)         statusBadge = `<span class="mp-status-badge mp-status-overdue">Overdue</span>`;
                    else if (isGrace)           statusBadge = `<span class="mp-status-badge mp-status-pending">Grace Period</span>`;
                    else                        statusBadge = `<span class="mp-status-badge mp-status-pending">Pending</span>`;

                    const lateFeeCell = isOverdue
                      ? `<span style="color:var(--red);font-family:var(--font-mono);font-weight:700">Rs. ${lf.lateFeeAmount.toLocaleString()}</span>
                         <div style="font-size:10.5px;color:var(--red);opacity:.7">${lf.daysLate}d overdue</div>`
                      : isGrace
                        ? `<span style="font-size:11px;color:var(--yellow)">Grace (${lf.daysLate}d)</span>`
                        : `<span style="color:var(--t3);font-size:12px">—</span>`;

                    const totalCell = (c.status === 'pending')
                      ? `<span style="font-family:var(--font-mono);font-weight:800;color:${isOverdue ? 'var(--red)' : 'var(--t1)'}">Rs. ${(c.totalPayable || c.feeAmount || 0).toLocaleString()}</span>`
                      : `<span style="font-family:var(--font-mono);color:var(--t2)">Rs. ${(c.feeAmount || 0).toLocaleString()}</span>`;

                    const actionBtn = (c.status === 'pending')
                      ? `<button class="mp-btn-paid" data-challan-id="${c.id}">Mark Paid</button>`
                      : `<span style="font-size:12px;color:var(--t3)">${c.status === 'paid' ? _fmtDate(c.paidAt) : '—'}</span>`;

                    return `<tr>
                      <td style="font-family:var(--font-mono);font-weight:700;color:var(--blue)">${c.challanNo}</td>
                      <td>
                        <div style="font-weight:600">${c.studentName || c.student?.studentName || '—'}</div>
                        ${c.student?.fatherName ? `<div style="font-size:11.5px;color:var(--t3)">${c.student.fatherName}</div>` : ''}
                      </td>
                      <td style="font-family:var(--font-mono);font-size:12px;color:var(--t2)">${c.student?.cnic || c.student?.uniqueId || '—'}</td>
                      <td style="font-size:12.5px">${c.campus?.campusName?.replace(/\s*campus$/i,'').trim() || '—'}</td>
                      <td style="font-size:12.5px">${c.session || '—'}</td>
                      <td style="font-size:12.5px;color:${isOverdue ? 'var(--red)' : 'var(--t2)'}">${dueStr}</td>
                      <td style="font-family:var(--font-mono)">Rs. ${(c.feeAmount || 0).toLocaleString()}</td>
                      <td>${lateFeeCell}</td>
                      <td>${totalCell}</td>
                      <td>${statusBadge}</td>
                      <td>${actionBtn}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>`}
        </div>
      </div>`;

    // ── Wire events ───────────────────────────────────────────────
    const self = this;

    // Search input (debounced)
    let _searchTimer = null;
    el.querySelector('#mpSearch')?.addEventListener('input', e => {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => {
        self._search = e.target.value;
        self._render();
      }, 250);
    });

    // Campus filter
    el.querySelector('#mpCampusSel')?.addEventListener('change', e => {
      self._campusId = e.target.value;
      self._render();
    });

    // Status filter buttons
    el.querySelectorAll('.mp-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        self._status = btn.dataset.status;
        self._render();
      });
    });

    // Mark Paid buttons
    el.querySelectorAll('.mp-btn-paid').forEach(btn => {
      btn.addEventListener('click', () => {
        const challanId = btn.dataset.challanId;
        const challan   = (AppState.get('challans') || []).find(c => c.id === challanId);
        if (!challan) return;

        // Show payment mode prompt via simple confirm for now
        const modes = ['cash', 'bank_transfer', 'cheque', 'online'];
        const mode  = prompt(
          `Mark Challan #${challan.challanNo} as PAID\n\nPayment mode:\n1. Cash\n2. Bank Transfer\n3. Cheque\n4. Online\n\nEnter 1-4:`,
          '1'
        );
        if (mode === null) return; // cancelled
        const modeMap = { '1':'cash', '2':'bank_transfer', '3':'cheque', '4':'online' };
        const payMode = modeMap[mode?.trim()] || 'cash';

        const result = AdmissionService.markChallanPaid(challanId, { mode: payMode });
        if (result.success) {
          if (typeof Toast !== 'undefined') Toast.success(`Challan #${challan.challanNo} marked as Paid.`);
          self._render();
        } else {
          if (typeof Toast !== 'undefined') Toast.error(result.message || 'Failed to mark paid.');
        }
      });
    });
  },
};
