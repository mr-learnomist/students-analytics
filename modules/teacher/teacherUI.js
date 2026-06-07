// ============================================================
// modules/teacher/teacherUI.js — Teacher Management UI
// Card-based layout with table toggle, profile picture upload,
// multi-select disciplines/campuses, auto password generation
// ============================================================

import { AppState }       from '../../utils/state.js';
import { Modal, Table, injectUIStyles } from '../../utils/ui.js';
import { Toast }          from '../../utils/helpers.js';
import { Auth }           from '../../utils/auth.js';
import { TeacherService } from '../../utils/teacherService.js';
import { renderTeacherForm } from './teacherForm.js';
import { renderTeacherCard } from './teacherCard.js';

// ── View mode: 'card' | 'table' ───────────────────────────────
let _viewMode    = localStorage.getItem('sms_teacher_view') || 'card';
let _searchVal   = '';
let _discFilter  = '';
let _campFilter  = '';

// ── Visible columns (table view) ──────────────────────────────
const _DEFAULT_COLS = ['name','qualification','disciplines','subjects','campuses','contact','status'];
let _visibleCols = new Set(
  JSON.parse(localStorage.getItem('sms_teacher_cols') || 'null') || _DEFAULT_COLS
);

export const TeacherUI = {

  mount(container) {
    injectUIStyles();
    _injectTeacherStyles();
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    el.innerHTML = _pageTemplate();
    _attachToolbar(el);
    _render(el);
  },
};

// ── Render ────────────────────────────────────────────────────
function _render(container) {
  const el     = typeof container === 'string' ? document.querySelector(container) : container;
  const all    = AppState.get('teachers') || [];

  let rows = all.filter(t => {
    const q = _searchVal;
    const matchSearch = !q ||
      (t.fullName      || '').toLowerCase().includes(q) ||
      (t.email         || '').toLowerCase().includes(q) ||
      (t.qualification || '').toLowerCase().includes(q);
    const matchDisc = !_discFilter || (t.disciplines || []).includes(_discFilter);
    const matchCamp = !_campFilter || (t.campuses    || []).includes(_campFilter);
    return matchSearch && matchDisc && matchCamp;
  });

  // Count
  const countEl = el.querySelector('.record-count');
  if (countEl) countEl.textContent = `${rows.length} teacher${rows.length !== 1 ? 's' : ''}`;

  const body = el.querySelector('#teacher-body');
  if (!body) return;

  if (_viewMode === 'card') {
    _renderCards(body, rows, el);
  } else {
    _renderTable(body, rows, el);
  }
}

// ── Card view ─────────────────────────────────────────────────
function _renderCards(body, rows, container) {
  if (!rows.length) {
    body.innerHTML = `
      <div class="teacher-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <p>No teachers found.</p>
        <span>Click "Add Teacher" above to add your first teacher.</span>
      </div>`;
    return;
  }

  body.innerHTML = `<div class="teacher-grid">${rows.map(t => renderTeacherCard(t)).join('')}</div>`;

  // Wire card buttons
  body.querySelectorAll('[data-teacher-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = rows.find(r => r.id === btn.dataset.teacherEdit);
      if (t) _openForm(t, container);
    });
  });
  body.querySelectorAll('[data-teacher-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = rows.find(r => r.id === btn.dataset.teacherDelete);
      if (t) _deleteTeacher(t, container);
    });
  });
  body.querySelectorAll('[data-teacher-reset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = rows.find(r => r.id === btn.dataset.teacherReset);
      if (t) _resetPassword(t);
    });
  });
  body.querySelectorAll('[data-teacher-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = rows.find(r => r.id === btn.dataset.teacherToggle);
      if (t) _toggleActive(t, container);
    });
  });
}

// ── Table view ────────────────────────────────────────────────
function _renderTable(body, rows, container) {
  body.innerHTML = `<div id="teacher-table"></div>`;

  const canEdit   = Auth.can('teachers:edit');
  const canDelete = Auth.can('teachers:delete');
  const actions   = [];

  if (canEdit) actions.push({
    label: 'Edit',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    handler: (row) => _openForm(row, container),
  });
  if (canDelete) actions.push({
    label: 'Delete',
    danger: true,
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>`,
    handler: (row) => _deleteTeacher(row, container),
  });

  // Only show visible columns
  const allCols = [
    { id: 'name',          label: 'Name',          key: 'fullName',      always: true, width: '210px',
      render: (val, row) => `<div><div style="font-weight:600;color:var(--t1)">${val}</div><div style="font-size:11.5px;color:var(--t3);margin-top:2px">${row.email}</div></div>` },
    { id: 'qualification', label: 'Qualification', key: 'qualification', width: '140px',
      render: (v) => `<span style="color:var(--t2);font-size:12.5px">${v || '—'}</span>` },
    { id: 'disciplines',   label: 'Disciplines',   key: 'disciplines',   width: '150px',
      render: (ids) => _disciplinePills(ids) },
    { id: 'subjects',      label: 'Subjects',      key: 'teachingSubjects', width: '160px',
      render: (ids) => _subjectPills(ids) },
    { id: 'campuses',      label: 'Campuses',      key: 'campuses',      width: '130px',
      render: (ids) => _campusPills(ids) },
    { id: 'contact',       label: 'Contact',       key: 'contactNumber', width: '120px',
      render: (v) => `<span style="font-family:var(--font-mono);font-size:12px;color:var(--t2)">${v || '—'}</span>` },
    { id: 'status',        label: 'Status',        key: 'isActive',      width: '80px',
      render: (v) => v !== false ? `<span class="badge badge--green">Active</span>` : `<span class="badge badge--red">Inactive</span>` },
  ];

  const visibleCols = allCols.filter(c => c.always || _visibleCols.has(c.id));
  const avatarCol   = { key: 'profilePicture', label: '', width: '48px', render: (pic, row) => _avatarHTML(pic, row.fullName, 32) };

  Table.render(body.querySelector('#teacher-table'), {
    columns: [avatarCol, ...visibleCols.map(c => ({ key: c.key, label: c.label, width: c.width, render: c.render }))],
    rows,
    emptyMsg: 'No teachers found. Click "Add Teacher" to add one.',
    actions,
  });
}

// ── Add / Edit form ───────────────────────────────────────────
function _openForm(existing = null, container) {
  const isEdit    = !!existing;
  const canCreate = Auth.can('teachers:create');
  const canEdit   = Auth.can('teachers:edit');
  if (!isEdit && !canCreate) { Toast.error('You do not have permission.'); return; }
  if (isEdit  && !canEdit)   { Toast.error('You do not have permission.'); return; }

  let currentPicture = existing?.profilePicture || null;

  Modal.open({
    title: isEdit ? 'Edit Teacher' : 'Add New Teacher',
    size:  'lg',
    body:  `<div id="teacherModalInner" style="padding:20px;">${renderTeacherForm(existing)}</div>`,
    actions: [
      { label: 'Cancel', variant: 'ghost', close: true },
      {
        label:   isEdit ? 'Save Changes' : 'Add Teacher',
        variant: 'primary',
        close:   false,
        handler: (modalEl) => _handleFormSubmit(modalEl, existing, currentPicture, container),
      }
    ],
    onOpen: (modalEl) => {
      _wireFormInteractions(modalEl, (pic) => { currentPicture = pic; });
    },
  });
}

// ── Form submit handler ───────────────────────────────────────
function _handleFormSubmit(modalEl, existing, profilePicture, container) {
  const body = modalEl.querySelector('.modal-body');

  // Collect basic fields
  const fullName      = body.querySelector('[name="fullName"]')?.value.trim()      || '';
  const qualification = body.querySelector('[name="qualification"]')?.value.trim() || '';
  const contactNumber = body.querySelector('[name="contactNumber"]')?.value.trim() || '';
  const email         = body.querySelector('[name="email"]')?.value.trim()         || '';

  // Multi-select: disciplines
  const disciplines = Array.from(
    body.querySelectorAll('.ms-chip[data-disc-id].ms-chip--selected')
  ).map(c => c.dataset.discId);

  // Multi-select: campuses
  const campuses = Array.from(
    body.querySelectorAll('.ms-chip[data-camp-id].ms-chip--selected')
  ).map(c => c.dataset.campId);

  // Teaching subjects (discipline-wise checkboxes)
  const teachingSubjects = Array.from(
    body.querySelectorAll('.ts-subject-cb')
  ).map(cb => cb.value);

  // ── Validate ──────────────────────────────────────────────
  const errors = [];
  if (!fullName)      errors.push('Full name is required.');
  if (!qualification) errors.push('Qualification is required.');
  if (!email)         errors.push('Email is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Please enter a valid email address.');

  if (errors.length) {
    // Clear old errors
    body.querySelectorAll('.field-error').forEach(e => e.remove());
    body.querySelectorAll('.input--error').forEach(i => i.classList.remove('input--error'));

    // Show first error via Toast + highlight fields
    Toast.error(errors[0]);

    if (!fullName)      body.querySelector('[name="fullName"]')?.classList.add('input--error');
    if (!qualification) body.querySelector('[name="qualification"]')?.classList.add('input--error');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      body.querySelector('[name="email"]')?.classList.add('input--error');
    return;
  }

  const data = { fullName, qualification, contactNumber, email, disciplines, campuses, profilePicture, teachingSubjects };

  // ── Collect campus schedules ──────────────────────────────
  const campusSchedules = {};
  campuses.forEach(cid => {
    const workingDays = [...body.querySelectorAll(`#sched-${cid} .day-btn--on`)]
                          .map(b => b.dataset.day);
    const startTime   = body.querySelector(`[name="startTime_${cid}"]`)?.value || '';
    const endTime     = body.querySelector(`[name="endTime_${cid}"]`)?.value   || '';
    campusSchedules[cid] = { workingDays, startTime, endTime };
  });
  data.campusSchedules = campusSchedules;

  // ── Time overlap check across campuses ────────────────────
  // Convert "HH:MM" to minutes for easy comparison
  function _toMin(t) {
    if (!t) return null;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  const schedEntries = Object.entries(campusSchedules)
    .map(([cid, sched]) => {
      const c     = AppState.findById('campuses', cid);
      const start = _toMin(sched.startTime);
      const end   = _toMin(sched.endTime);
      return { cid, name: c?.campusName || cid, days: sched.workingDays, start, end };
    })
    .filter(e => e.start !== null && e.end !== null);

  // Validate: end must be after start within same campus
  for (const e of schedEntries) {
    if (e.end <= e.start) {
      Toast.error(`${e.name}: End time must be after start time.`);
      return;
    }
  }

  // Validate: overlapping times on shared working days across campuses
  for (let i = 0; i < schedEntries.length; i++) {
    for (let j = i + 1; j < schedEntries.length; j++) {
      const a = schedEntries[i];
      const b = schedEntries[j];
      const sharedDays = a.days.filter(d => b.days.includes(d));
      if (!sharedDays.length) continue;

      // Overlap: a.start < b.end  &&  b.start < a.end
      const overlaps = a.start < b.end && b.start < a.end;
      if (overlaps) {
        const dayLabels = { mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat', sun:'Sun' };
        const dayStr = sharedDays.map(d => dayLabels[d] || d).join(', ');
        Toast.error(
          `Schedule overlap: "${a.name}" and "${b.name}" share overlapping hours on ${dayStr}. Please adjust the timings.`
        );
        // Highlight the conflicting time inputs
        [a.cid, b.cid].forEach(cid => {
          body.querySelector(`[name="startTime_${cid}"]`)?.classList.add('input--error');
          body.querySelector(`[name="endTime_${cid}"]`)?.classList.add('input--error');
        });
        return;
      }
    }
  }

  if (existing) {
    // ── Edit ────────────────────────────────────────────────
    const result = TeacherService.updateTeacher(existing.id, data);
    if (!result.success) { Toast.error(result.message); return; }
    Toast.success(`"${fullName}" updated successfully.`);
    Modal.closeAll();
    _render(container);
  } else {
    // ── Add ─────────────────────────────────────────────────
    const result = TeacherService.addTeacher(data);
    if (!result.success) { Toast.error(result.message); return; }
    Modal.closeAll();
    // Show credentials modal
    _showCredentials(result.teacher, result.plainPassword);
    _render(container);
  }
}

// ── Credentials reveal modal (shown once after add) ───────────
function _showCredentials(teacher, plainPassword) {
  Modal.open({
    title: '✅ Teacher Added',
    size:  'sm',
    body: `
      <div style="display:flex;flex-direction:column;gap:16px">
        <div style="display:flex;align-items:center;gap:12px;padding:14px;background:var(--green-dim);border:1px solid rgba(16,185,129,0.2);border-radius:var(--r-sm)">
          ${_avatarHTML(teacher.profilePicture, teacher.fullName, 40)}
          <div>
            <div style="font-weight:700;color:var(--t1)">${teacher.fullName}</div>
            <div style="font-size:12px;color:var(--t3)">${teacher.qualification}</div>
          </div>
        </div>
        <p style="font-size:13px;color:var(--t2);line-height:1.6">
          Share these credentials with the teacher <strong>now</strong>. The password cannot be shown again.
        </p>
        <div style="background:var(--surface2);border:1px solid var(--border2);border-radius:var(--r-sm);padding:16px;display:flex;flex-direction:column;gap:10px">
          <div class="cred-row">
            <span class="cred-label">Login Email</span>
            <span class="cred-val" style="font-family:var(--font-mono)">${teacher.email}</span>
            <button class="cred-copy" data-copy="${teacher.email}" title="Copy">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
          </div>
          <div class="cred-row">
            <span class="cred-label">Password</span>
            <span class="cred-val" style="font-family:var(--font-mono);font-size:15px;font-weight:700;letter-spacing:2px;color:var(--blue)">${plainPassword}</span>
            <button class="cred-copy" data-copy="${plainPassword}" title="Copy">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
          </div>
          <div class="cred-row">
            <span class="cred-label">Role</span>
            <span class="badge badge--green">Teacher</span>
          </div>
        </div>
      </div>
    `,
    actions: [{ label: 'Done, Credentials Shared', variant: 'primary', close: true }],
    onOpen: (modalEl) => {
      modalEl.querySelectorAll('.cred-copy').forEach(btn => {
        btn.addEventListener('click', () => {
          navigator.clipboard?.writeText(btn.dataset.copy)
            .then(() => Toast.success('Copied!'))
            .catch(() => Toast.info('Copy: ' + btn.dataset.copy));
        });
      });
    },
  });
}

// ── Delete ────────────────────────────────────────────────────
async function _deleteTeacher(teacher, container) {
  if (!Auth.can('teachers:delete')) { Toast.error('You do not have permission.'); return; }

  const ok = await Modal.confirm({
    title:        'Delete Teacher',
    message:      `Are you sure you want to delete <strong>${teacher.fullName}</strong>? Their login account will also be removed.`,
    confirmLabel: 'Delete',
    danger:       true,
  });
  if (!ok) return;

  const result = TeacherService.deleteTeacher(teacher.id);
  if (!result.success) { Toast.error(result.message); return; }
  Toast.success(`"${teacher.fullName}" deleted successfully.`);
  _render(container);
}

// ── Reset password ────────────────────────────────────────────
function _resetPassword(teacher) {
  if (!Auth.can('teachers:edit')) { Toast.error('You do not have permission.'); return; }

  Modal.confirm({
    title:        'Reset Password',
    message:      `<strong>${teacher.fullName}</strong> — reset their password? A new password will be generated.`,
    confirmLabel: 'Reset Password',
    danger:       false,
  }).then(ok => {
    if (!ok) return;
    const result = TeacherService.resetPassword(teacher.id);
    if (!result.success) { Toast.error(result.message); return; }
    _showResetPassword(teacher, result.plainPassword);
  });
}

function _showResetPassword(teacher, newPassword) {
  Modal.open({
    title: '🔑 Password Reset Ho Gaya',
    size:  'sm',
    body: `
      <div style="display:flex;flex-direction:column;gap:14px">
        <p style="font-size:13px;color:var(--t2)">
          New password for <strong>${teacher.fullName}</strong>. Share it with the teacher:
        </p>
        <div style="background:var(--surface2);border:1px solid var(--border2);border-radius:var(--r-sm);padding:16px">
          <div class="cred-row">
            <span class="cred-label">New Password</span>
            <span style="font-family:var(--font-mono);font-size:15px;font-weight:700;letter-spacing:2px;color:var(--blue)">${newPassword}</span>
            <button class="cred-copy" data-copy="${newPassword}" title="Copy">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
          </div>
        </div>
        <p style="font-size:12px;color:var(--t3)">⚠️ This password is shown only once.</p>
      </div>
    `,
    actions: [{ label: 'Done', variant: 'primary', close: true }],
    onOpen: (modalEl) => {
      modalEl.querySelectorAll('.cred-copy').forEach(btn => {
        btn.addEventListener('click', () => {
          navigator.clipboard?.writeText(btn.dataset.copy)
            .then(() => Toast.success('Copied!'))
            .catch(() => {});
        });
      });
    },
  });
}

// ── Toggle active ─────────────────────────────────────────────
function _toggleActive(teacher, container) {
  if (!Auth.can('teachers:edit')) { Toast.error('You do not have permission.'); return; }
  const newState = teacher.isActive === false ? true : false;
  TeacherService.setActive(teacher.id, newState);
  Toast.info(`"${teacher.fullName}" ${newState ? 'activated' : 'deactivated'} successfully.`);
  _render(container);
}

// ── Form interaction wiring ───────────────────────────────────
function _wireFormInteractions(modalEl, onPictureChange) {
  // Profile picture upload
  const picInput   = modalEl.querySelector('#teacherPicInput');
  const picPreview = modalEl.querySelector('#teacherPicPreview');
  const picBtn     = modalEl.querySelector('#teacherPicBtn');

  picBtn?.addEventListener('click', () => picInput?.click());

  picInput?.addEventListener('change', () => {
    const file = picInput.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { Toast.warning('Image must not exceed 2MB.'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result;
      onPictureChange(base64);
      if (picPreview) {
        picPreview.innerHTML = `<img src="${base64}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:2px solid var(--blue)"/>`;
      }
    };
    reader.readAsDataURL(file);
  });

  // Multi-select chips — disciplines → also toggle teaching-subjects panel
  modalEl.querySelectorAll('.ms-chip[data-disc-id]').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('ms-chip--selected');
      const did   = chip.dataset.discId;
      const panel = modalEl.querySelector(`.ts-panel[data-ts-disc="${did}"]`);
      if (panel) {
        const isOn = chip.classList.contains('ms-chip--selected');
        panel.style.display = isOn ? '' : 'none';
        if (!isOn) {
          // clear all selected subjects for this disc
          panel.querySelectorAll('.ts-tag').forEach(t => t.remove());
          _updateTsCount(panel, did);
        }
      }
    });
  });

  // Teaching subjects: search input wiring
  modalEl.querySelectorAll('.ts-search-input').forEach(input => {
    const did      = input.dataset.discId;
    const dropdown = modalEl.querySelector(`#tsDrop_${did}`);
    const tagsWrap = modalEl.querySelector(`#tsTags_${did}`);
    const dataEl   = modalEl.querySelector(`#tsData_${did}`);
    if (!dropdown || !tagsWrap || !dataEl) return;

    let subjects = [];
    try { subjects = JSON.parse(dataEl.textContent); } catch {}

    function getSelectedIds() {
      return [...tagsWrap.querySelectorAll('.ts-subject-cb')].map(h => h.value);
    }

    function renderDropdown(query) {
      const q    = query.toLowerCase().trim();
      const selectedIds = getSelectedIds();
      const hits = q
        ? subjects.filter(s =>
            s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
          )
        : [];

      if (!hits.length) {
        dropdown.innerHTML = q
          ? `<div class="ts-drop-empty">No subjects found for "<strong>${query}</strong>"</div>`
          : '';
        dropdown.style.display = q ? 'block' : 'none';
        return;
      }

      dropdown.innerHTML = hits.map(s => {
        const isSel = selectedIds.includes(s.id);
        return `<div class="ts-drop-item ${isSel ? 'selected' : ''}" data-sub-id="${s.id}" data-sub-code="${s.code}" data-sub-name="${s.name}">
          <span class="ts-drop-code">${s.code}</span>
          <span>${s.name}</span>
          ${isSel ? '<span style="margin-left:auto;font-size:11px;color:var(--t3)">✓ Added</span>' : ''}
        </div>`;
      }).join('');
      dropdown.style.display = 'block';

      dropdown.querySelectorAll('.ts-drop-item:not(.selected)').forEach(item => {
        item.addEventListener('click', () => {
          const subId   = item.dataset.subId;
          const subCode = item.dataset.subCode;
          const subName = item.dataset.subName;

          // Add tag — code only, full name in tooltip
          const tag = document.createElement('span');
          tag.className     = 'ts-tag';
          tag.dataset.subId = subId;
          tag.title         = subName;
          tag.innerHTML = `
            <span class="ts-tag-code">${subCode}</span>
            <button type="button" class="ts-tag-remove" title="Remove">✕</button>
            <input type="hidden" class="ts-subject-cb" value="${subId}"/>
          `;
          tag.querySelector('.ts-tag-remove').addEventListener('click', () => {
            tag.remove();
            _updateTsCount(modalEl.querySelector(`.ts-panel[data-ts-disc="${did}"]`), did);
            // re-render dropdown to re-enable item
            renderDropdown(input.value);
          });
          tagsWrap.appendChild(tag);
          _updateTsCount(modalEl.querySelector(`.ts-panel[data-ts-disc="${did}"]`), did);

          // refresh dropdown
          renderDropdown(input.value);
        });
      });
    }

    input.addEventListener('input', () => renderDropdown(input.value));
    input.addEventListener('focus', () => { if (input.value) renderDropdown(input.value); });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    }, { capture: true });
  });

  // Wire pre-existing remove buttons (edit mode)
  modalEl.querySelectorAll('.ts-tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag  = btn.closest('.ts-tag');
      const did  = btn.dataset.disc;
      tag?.remove();
      if (did) _updateTsCount(modalEl.querySelector(`.ts-panel[data-ts-disc="${did}"]`), did);
    });
  });

  // Multi-select chips — campuses → also toggle schedule row
  modalEl.querySelectorAll('.ms-chip[data-camp-id]').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('ms-chip--selected');
      const cid  = chip.dataset.campId;
      const srow = modalEl.querySelector(`#sched-${cid}`);
      if (srow) {
        const on = chip.classList.contains('ms-chip--selected');
        srow.classList.toggle('campus-schedule-row--hidden', !on);
      }
    });
  });

  // Day toggle buttons
  modalEl.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('day-btn--on'));
  });
}

// ── Teaching subjects count badge updater ─────────────────────
function _updateTsCount(panel, did) {
  if (!panel) return;
  const count   = panel.querySelectorAll('.ts-subject-cb').length;
  const badge   = panel.querySelector('.ts-count-badge');
  if (badge) badge.textContent = count ? `${count} selected` : '';
}

// ── Toolbar wiring ────────────────────────────────────────────
function _attachToolbar(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;

  // Add button
  el.querySelector('#teacherAddBtn')?.addEventListener('click', () => _openForm(null, el));

  // Search
  el.querySelector('#teacherSearch')?.addEventListener('input', e => {
    _searchVal = e.target.value.toLowerCase().trim();
    _render(el);
  });

  // Discipline filter
  el.querySelector('#teacherDiscFilter')?.addEventListener('change', e => {
    _discFilter = e.target.value;
    _render(el);
  });

  // Campus filter
  el.querySelector('#teacherCampFilter')?.addEventListener('change', e => {
    _campFilter = e.target.value;
    _render(el);
  });

  // View toggle
  el.querySelector('#viewCard')?.addEventListener('click', () => {
    _viewMode = 'card';
    localStorage.setItem('sms_teacher_view', 'card');
    _updateViewToggle(el);
    _render(el);
  });
  el.querySelector('#viewTable')?.addEventListener('click', () => {
    _viewMode = 'table';
    localStorage.setItem('sms_teacher_view', 'table');
    _updateViewToggle(el);
    _render(el);
  });

  _updateViewToggle(el);

  // ── Export button ────────────────────────────────────────
  const exportBtn  = el.querySelector('#teacherExportBtn');
  const exportMenu = el.querySelector('#teacherExportMenu');
  exportBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu.style.display = exportMenu.style.display === 'none' ? 'block' : 'none';
  });
  document.addEventListener('click', () => {
    if (exportMenu) exportMenu.style.display = 'none';
  });
  el.querySelectorAll('.teacher-export-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      exportMenu.style.display = 'none';
      _exportTeachers(btn.dataset.fmt, el);
    });
  });

  // ── Column chooser ───────────────────────────────────────
  el.querySelector('#teacherColBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    _openColChooser(el);
  });
}

function _updateViewToggle(el) {
  el.querySelector('#viewCard')?.classList.toggle('view-btn--active',  _viewMode === 'card');
  el.querySelector('#viewTable')?.classList.toggle('view-btn--active', _viewMode === 'table');
}

// ── Helpers ───────────────────────────────────────────────────
export function _avatarHTML(pic, name = '', size = 40) {
  const initials = (name || 'T').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  if (pic) {
    return `<img src="${pic}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:2px solid var(--border2);flex-shrink:0" alt="${name}"/>`;
  }
  const colors = ['#4f85f7','#10b981','#8b5cf6','#06b6d4','#f59e0b'];
  const color  = colors[name.charCodeAt(0) % colors.length] || '#4f85f7';
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.35)}px;font-weight:700;color:#fff;flex-shrink:0">${initials}</div>`;
}

function _disciplinePills(ids = []) {
  if (!ids?.length) return '<span style="color:var(--t4)">—</span>';
  return ids.slice(0, 2).map(id => {
    const d = AppState.findById('disciplines', id);
    return d ? `<span class="badge badge--plain" style="font-size:10.5px;margin-right:3px">${d.abbreviation}</span>` : '';
  }).join('') + (ids.length > 2 ? `<span class="badge badge--plain" style="font-size:10.5px">+${ids.length - 2}</span>` : '');
}

function _campusPills(ids = []) {
  if (!ids?.length) return '<span style="color:var(--t4)">—</span>';
  // Show short name: strip " Campus" suffix (e.g. "PR Campus" → "PR", "F8 Campus" → "F8")
  function _shortCampus(name = '') {
    return name.replace(/\s*campus\s*/gi, '').trim() || name;
  }
  return ids.slice(0, 2).map(id => {
    const c = AppState.findById('campuses', id);
    return c ? `<span class="badge badge--plain" style="font-size:10.5px;margin-right:3px" title="${c.campusName}">${_shortCampus(c.campusName)}</span>` : '';
  }).join('') + (ids.length > 2 ? `<span class="badge badge--plain" style="font-size:10.5px">+${ids.length - 2}</span>` : '');
}

function _subjectPills(ids = []) {
  if (!ids?.length) return '<span style="color:var(--t4)">—</span>';
  const subjects = AppState.get('subjects') || [];
  const found = (ids || []).map(id => subjects.find(s => s.id === id)).filter(Boolean);
  return found.map(s =>
    `<span class="badge badge--plain" style="font-size:10.5px;margin-right:3px;cursor:default" title="${s.subjectName}">${_subjectCode(s)}</span>`
  ).join('');
}

// ── Helper: get subject code (subjectCode → code → abbreviate name) ──
function _subjectCode(s) {
  if (!s) return '?';
  if (s.subjectCode && s.subjectCode.trim()) return s.subjectCode.trim();
  if (s.code        && s.code.trim())        return s.code.trim();
  // Auto-abbreviate: take first letters of each word, max 5 chars
  const words = (s.subjectName || '').split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.map(w => w[0]).join('').toUpperCase().slice(0, 5);
}

// ── Page template ─────────────────────────────────────────────
function _pageTemplate() {
  const disciplines = AppState.get('disciplines') || [];
  const campuses    = AppState.get('campuses')    || [];

  const discOpts = disciplines.map(d =>
    `<option value="${d.id}">${d.abbreviation} — ${d.fullName}</option>`
  ).join('');
  const campOpts = campuses.map(c =>
    `<option value="${c.id}">${c.campusName}</option>`
  ).join('');

  return `
    <div class="module-page">
      <!-- Toolbar -->
      <div class="module-toolbar" style="flex-wrap:wrap;gap:8px">
        <div class="search-wrap" style="min-width:200px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input id="teacherSearch" class="search-input" placeholder="Naam, email, qualification…"/>
        </div>

        <select id="teacherDiscFilter" class="form-input form-select" style="max-width:180px">
          <option value="">All Disciplines</option>${discOpts}
        </select>

        <select id="teacherCampFilter" class="form-input form-select" style="max-width:160px">
          <option value="">All Campuses</option>${campOpts}
        </select>

        <span class="record-count">— teachers</span>

        <!-- View toggle -->
        <div class="view-toggle" style="margin-left:auto">
          <button id="viewCard"  class="view-btn" title="Card view">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
            </svg>
          </button>
          <button id="viewTable" class="view-btn" title="Table view">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
              <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
              <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- Column chooser (table view only) -->
        <button id="teacherColBtn" class="view-btn" title="Choose columns" style="width:auto;padding:0 10px;gap:5px;font-size:12px;font-weight:500">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
            <line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
          Columns
        </button>

        <!-- Export button -->
        <div style="position:relative;display:inline-block" id="teacherExportWrap">
          <button id="teacherExportBtn" class="view-btn" title="Export" style="width:auto;padding:0 10px;gap:5px;font-size:12px;font-weight:500">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export
          </button>
          <div id="teacherExportMenu" style="display:none;position:absolute;right:0;top:calc(100% + 4px);background:var(--surface);border:1px solid var(--border2);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.1);z-index:200;min-width:150px;overflow:hidden">
            <button class="teacher-export-opt" data-fmt="csv" style="display:flex;align-items:center;gap:8px;width:100%;padding:10px 14px;font-size:13px;font-weight:500;color:var(--t1);background:none;text-align:left;border:none;cursor:pointer;font-family:inherit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Export as CSV
            </button>
            <button class="teacher-export-opt" data-fmt="pdf" style="display:flex;align-items:center;gap:8px;width:100%;padding:10px 14px;font-size:13px;font-weight:500;color:var(--t1);background:none;text-align:left;border:none;cursor:pointer;font-family:inherit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              Export as PDF
            </button>
          </div>
        </div>

        <button id="teacherAddBtn" class="add-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Teacher
        </button>
      </div>

      <!-- Body (cards or table) -->
      <div id="teacher-body"></div>
    </div>
  `;
}

// ── Export — with column chooser modal ───────────────────────
function _exportTeachers(fmt, container) {
  // Build the full filtered row set first
  const all = AppState.get('teachers') || [];
  const rows = all.filter(t => {
    const q = _searchVal;
    const matchSearch = !q || (t.fullName||'').toLowerCase().includes(q) || (t.email||'').toLowerCase().includes(q);
    const matchDisc = !_discFilter || (t.disciplines||[]).includes(_discFilter);
    const matchCamp = !_campFilter || (t.campuses||[]).includes(_campFilter);
    return matchSearch && matchDisc && matchCamp;
  });

  const subjects = AppState.get('subjects')    || [];
  const discs    = AppState.get('disciplines') || [];
  const camps    = AppState.get('campuses')    || [];

  function _shortCampusName(name = '') {
    return name.replace(/\s*campus\s*/gi, '').trim() || name;
  }

  const ALL_EXPORT_COLS = [
    { id: 'name',          label: 'Full Name',      get: r => r.fullName || '' },
    { id: 'email',         label: 'Email',          get: r => r.email || '' },
    { id: 'qualification', label: 'Qualification',  get: r => r.qualification || '' },
    { id: 'disciplines',   label: 'Disciplines',    get: r => (r.disciplines||[]).map(id => discs.find(d=>d.id===id)?.abbreviation||id).join(', ') },
    { id: 'subjects',      label: 'Subjects',       get: r => (r.teachingSubjects||[]).map(id => { const s = subjects.find(x=>x.id===id); return s ? _subjectCode(s) : id; }).join(', ') },
    { id: 'campuses',      label: 'Campuses',       get: r => (r.campuses||[]).map(id => { const c = camps.find(x=>x.id===id); return c ? _shortCampusName(c.campusName) : id; }).join(', ') },
    { id: 'contact',       label: 'Contact',        get: r => r.contactNumber || '' },
    { id: 'status',        label: 'Status',         get: r => r.isActive === false ? 'Inactive' : 'Active' },
  ];

  // ── Build filter info for PDF ────────────────────────────────
  const filterParts = [];
  if (_discFilter) {
    const d = discs.find(x => x.id === _discFilter);
    if (d) filterParts.push(`<span class="filter-chip"><span class="fk">Discipline:</span> ${d.abbreviation} — ${d.fullName}</span>`);
  }
  if (_campFilter) {
    const c = camps.find(x => x.id === _campFilter);
    if (c) filterParts.push(`<span class="filter-chip"><span class="fk">Campus:</span> ${c.campusName}</span>`);
  }
  if (_searchVal) {
    filterParts.push(`<span class="filter-chip"><span class="fk">Search:</span> ${_searchVal}</span>`);
  }
  const filterHTML = filterParts.length
    ? `<span class="filters-label">&#9660; Filters</span> ${filterParts.join('')}`
    : `<span class="filter-chip filter-none">No filters applied — showing all teachers</span>`;

  // ── Show column chooser modal before export ──────────────────
  _openExportColChooser(ALL_EXPORT_COLS, fmt, rows, filterHTML);
}

// ── Export column chooser modal ───────────────────────────────
function _openExportColChooser(ALL_EXPORT_COLS, fmt, rows, filterHTML) {
  // Default: all checked
  document.getElementById('teacher-export-col-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'teacher-export-col-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';

  overlay.innerHTML = `
    <div style="background:var(--surface,#fff);border-radius:16px;width:100%;max-width:400px;
                box-shadow:0 20px 60px rgba(0,0,0,.2);overflow:hidden;border:1px solid var(--border,#e5e7eb)">
      <div style="display:flex;align-items:center;justify-content:space-between;
                  padding:16px 20px 12px;border-bottom:1px solid var(--border,#e5e7eb)">
        <div>
          <div style="font-size:14px;font-weight:700;color:var(--t1,#111)">Choose Export Columns</div>
          <div style="font-size:11.5px;color:var(--t3,#888);margin-top:2px">Select which columns to include in the ${fmt.toUpperCase()}</div>
        </div>
        <button id="expColClose" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--t3,#888);padding:0 4px;line-height:1">✕</button>
      </div>
      <div style="padding:14px 20px;display:flex;flex-direction:column;gap:6px;max-height:320px;overflow-y:auto">
        ${ALL_EXPORT_COLS.map(c => `
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;
                        padding:7px 10px;border-radius:8px;transition:background .12s;
                        background:var(--surface2,#f9f9f9);border:1px solid var(--border,#e5e7eb)">
            <input type="checkbox" data-exp-col="${c.id}" checked
              style="width:15px;height:15px;accent-color:#2563eb;flex-shrink:0;cursor:pointer">
            <span style="font-size:13px;font-weight:500;color:var(--t1,#111)">${c.label}</span>
          </label>
        `).join('')}
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;
                  padding:12px 20px;border-top:1px solid var(--border,#e5e7eb);background:var(--surface2,#f9f9f9)">
        <button id="expColSelectAll" style="font-size:12px;font-weight:600;color:#2563eb;background:none;border:none;cursor:pointer;padding:0">Select All</button>
        <div style="display:flex;gap:8px">
          <button id="expColCancel" style="padding:8px 16px;border-radius:8px;border:1px solid var(--border,#e5e7eb);
                  background:var(--surface,#fff);font-size:13px;font-weight:600;cursor:pointer;
                  color:var(--t2,#444);font-family:inherit">Cancel</button>
          <button id="expColExport" style="padding:8px 20px;border-radius:8px;border:none;
                  background:#2563eb;color:#fff;font-size:13px;font-weight:600;cursor:pointer;
                  font-family:inherit">Export ${fmt.toUpperCase()}</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#expColClose').onclick  = close;
  overlay.querySelector('#expColCancel').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  overlay.querySelector('#expColSelectAll').addEventListener('click', () => {
    overlay.querySelectorAll('[data-exp-col]').forEach(cb => cb.checked = true);
  });

  overlay.querySelector('#expColExport').addEventListener('click', () => {
    const chosen = [...overlay.querySelectorAll('[data-exp-col]:checked')].map(i => i.dataset.expCol);
    if (!chosen.length) { alert('Please select at least one column.'); return; }
    const activeCols = ALL_EXPORT_COLS.filter(c => chosen.includes(c.id));
    close();
    if (fmt === 'csv') _doExportCSV(activeCols, rows);
    else               _doExportPDF(activeCols, rows, filterHTML);
  });
}

// ── CSV export ────────────────────────────────────────────────
function _doExportCSV(activeCols, rows) {
  const header = ['#', ...activeCols.map(c => c.label)].join(',');
  const body = rows.map((r, i) =>
    [i + 1, ...activeCols.map(c => `"${(c.get(r)||'').replace(/"/g,'""')}"`)]
    .join(',')
  ).join('\n');
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `teachers_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  Toast.success('CSV exported!');
}

// ── PDF export — ass.js-style professional formatting ─────────
function _doExportPDF(activeCols, rows, filterHTML) {
  const now     = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const activeCount   = rows.filter(r => r.isActive !== false).length;
  const inactiveCount = rows.length - activeCount;

  const thCells = ['#', ...activeCols.map(c => c.label)]
    .map(h => `<th>${h}</th>`).join('');

  const tdRows = rows.map((r, i) => {
    const cells = [
      `<td>${i + 1}</td>`,
      ...activeCols.map(c => {
        const val = c.get(r) || '—';
        if (c.id === 'status') {
          const cls = val === 'Active' ? 'badge-active' : 'badge-inactive';
          return `<td><span class="${cls}">${val}</span></td>`;
        }
        return `<td>${val}</td>`;
      }),
    ].join('');
    return `<tr class="${i % 2 === 0 ? 'even' : 'odd'}">${cells}</tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Teachers Report</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#1e293b;background:#fff;padding:18px 20px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #2563eb;padding-bottom:10px;margin-bottom:12px}
  .header-left .title{font-size:18px;font-weight:700;color:#1e40af;letter-spacing:-0.3px}
  .header-left .subtitle{font-size:10.5px;color:#64748b;margin-top:2px}
  .header-right{text-align:right;font-size:10px;color:#64748b;line-height:1.6}
  .header-right .date{font-weight:600;color:#1e293b;font-size:10.5px}
  .meta-row{display:flex;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap}
  .stat-box{background:#f8faff;border:1px solid #dbeafe;border-radius:8px;padding:5px 12px;text-align:center}
  .stat-box .num{font-size:16px;font-weight:700;color:#2563eb;font-family:monospace}
  .stat-box .lbl{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px}
  .cols-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;
            background:#f0f7ff;border:1px solid #bfdbfe;border-radius:8px;
            padding:7px 12px;margin-bottom:10px}
  .filters-label{font-size:9px;font-weight:700;color:#1e40af;text-transform:uppercase;
                 letter-spacing:0.6px;white-space:nowrap;margin-right:2px}
  .filter-chip{background:#dbeafe;color:#1d4ed8;font-size:9.5px;font-weight:500;
               padding:2px 9px;border-radius:10px;white-space:nowrap}
  .filter-chip .fk{font-weight:700}
  .filter-none{background:#f1f5f9;color:#64748b}
  table{width:100%;border-collapse:collapse;font-size:9.5px}
  thead tr{background:#1e40af}
  thead th{color:#fff;font-weight:600;padding:6px 6px;text-align:left;font-size:8.5px;
           text-transform:uppercase;letter-spacing:0.3px;white-space:nowrap}
  tbody tr.even{background:#fff}
  tbody tr.odd{background:#f8faff}
  tbody td{padding:5px 6px;border-bottom:1px solid #e2e8f0;color:#334155;vertical-align:top}
  tbody td:first-child{font-weight:600;color:#1e293b;text-align:center;width:28px}
  .badge-active{color:#03543f;background:#def7ec;padding:2px 7px;border-radius:10px;font-size:9px;font-weight:600}
  .badge-inactive{color:#9b1c1c;background:#fde8e8;padding:2px 7px;border-radius:10px;font-size:9px;font-weight:600}
  .footer{margin-top:12px;padding-top:8px;border-top:1px solid #e2e8f0;
          display:flex;justify-content:space-between;font-size:9px;color:#94a3b8}
  .powered{margin-top:8px;text-align:center;font-size:9px;color:#94a3b8}
  @media print{
    body{padding:10px 12px}
    @page{size:A4 landscape;margin:8mm}
    .no-print{display:none}
  }
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <div class="title">Teachers Report</div>
      <div class="subtitle">Staff Directory &nbsp;|&nbsp; EduTrack — Learnomist</div>
    </div>
    <div class="header-right">
      <div class="date">${dateStr}</div>
      <div>${timeStr}</div>
    </div>
  </div>

  <div class="meta-row">
    <div class="stat-box">
      <div class="num">${rows.length}</div>
      <div class="lbl">Total</div>
    </div>
    <div class="stat-box">
      <div class="num">${activeCount}</div>
      <div class="lbl">Active</div>
    </div>
    <div class="stat-box">
      <div class="num">${inactiveCount}</div>
      <div class="lbl">Inactive</div>
    </div>
  </div>

  <div class="cols-row">
    ${filterHTML}
  </div>

  <table>
    <thead><tr>${thCells}</tr></thead>
    <tbody>${tdRows}</tbody>
  </table>

  <div class="footer">
    <span>Teachers Report &nbsp;|&nbsp; Exported ${dateStr} at ${timeStr}</span>
    <span>Total: ${rows.length} teacher${rows.length !== 1 ? 's' : ''}</span>
  </div>
  <div class="powered">Powered by <strong style="color:#2563eb">Learnomist</strong></div>

  <div class="no-print" style="margin-top:16px;text-align:center">
    <button onclick="window.print()"
      style="padding:8px 26px;background:#2563eb;color:#fff;border:none;border-radius:8px;
             font-size:13px;font-weight:600;cursor:pointer">
      Print / Save as PDF
    </button>
  </div>
</body>
</html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 600);
  Toast.success('PDF ready to print!');
}

// ── Column chooser modal ───────────────────────────────────────
function _openColChooser(container) {
  const allCols = [
    { id: 'name',          label: 'Name',          locked: true },
    { id: 'qualification', label: 'Qualification' },
    { id: 'disciplines',   label: 'Disciplines' },
    { id: 'subjects',      label: 'Subjects' },
    { id: 'campuses',      label: 'Campuses' },
    { id: 'contact',       label: 'Contact' },
    { id: 'status',        label: 'Status' },
  ];

  // Remove existing
  document.getElementById('teacher-col-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'teacher-col-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:100%;max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,.15);overflow:hidden">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px 14px;border-bottom:1px solid #e5e7eb">
        <div style="font-size:15px;font-weight:700;color:#111928">Choose Columns</div>
        <button id="col-modal-close" style="background:none;border:none;font-size:18px;cursor:pointer;color:#9ca3af;padding:0 4px">✕</button>
      </div>
      <div style="padding:16px 20px;display:flex;flex-direction:column;gap:8px">
        ${allCols.map(c => `
          <label style="display:flex;align-items:center;gap:10px;cursor:${c.locked ? 'default' : 'pointer'};padding:6px 8px;border-radius:8px;transition:background .15s">
            <input type="checkbox" data-col-id="${c.id}"
              ${_visibleCols.has(c.id) ? 'checked' : ''}
              ${c.locked ? 'disabled' : ''}
              style="width:16px;height:16px;accent-color:#1a56db;flex-shrink:0">
            <span style="font-size:13.5px;font-weight:500;color:${c.locked ? '#9ca3af' : '#374151'}">${c.label}</span>
            ${c.locked ? '<span style="margin-left:auto;font-size:11px;color:#9ca3af">Always on</span>' : ''}
          </label>
        `).join('')}
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;padding:12px 20px;border-top:1px solid #e5e7eb;background:#f9fafb">
        <button id="col-modal-cancel" style="padding:8px 16px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Cancel</button>
        <button id="col-modal-apply" style="padding:8px 16px;border-radius:8px;border:none;background:#1a56db;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Apply</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#col-modal-close').onclick  = () => overlay.remove();
  overlay.querySelector('#col-modal-cancel').onclick = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#col-modal-apply').onclick = () => {
    const checked = [...overlay.querySelectorAll('input[data-col-id]:checked')].map(i => i.dataset.colId);
    _visibleCols = new Set(checked.length ? checked : _DEFAULT_COLS);
    localStorage.setItem('sms_teacher_cols', JSON.stringify([..._visibleCols]));
    overlay.remove();
    // Re-render table if in table mode
    if (_viewMode === 'table') _render(container);
  };
}

// ── CSS injection ─────────────────────────────────────────────
function _injectTeacherStyles() {
  if (document.getElementById('teacher-ui-styles')) return;
  const s = document.createElement('style');
  s.id = 'teacher-ui-styles';
  s.textContent = `
/* ── Teacher Grid ── */
.teacher-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}
/* ── Teacher Empty ── */
.teacher-empty {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 64px 24px; text-align: center;
  border: 1px dashed var(--border2); border-radius: var(--r-lg);
  color: var(--t3);
}
.teacher-empty p    { font-size: 14px; font-weight: 600; color: var(--t2); margin: 12px 0 4px; }
.teacher-empty span { font-size: 12.5px; }

/* ── Teacher Card ── */
.teacher-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: 20px;
  display: flex; flex-direction: column; gap: 14px;
  transition: transform .18s, box-shadow .18s, border-color .18s;
  position: relative; overflow: hidden;
}
.teacher-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
  border-color: var(--border2);
}
.teacher-card.teacher-card--inactive { opacity: 0.6; }
.teacher-card-top {
  display: flex; align-items: center; gap: 12px;
}
.teacher-card-info { flex: 1; min-width: 0; }
.teacher-card-name {
  font-family: var(--font-display); font-size: 14px; font-weight: 700;
  color: var(--t1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.teacher-card-qual {
  font-size: 11.5px; color: var(--t3); margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.teacher-card-email {
  font-size: 12px; color: var(--blue); font-family: var(--font-mono);
  margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.teacher-card-badges {
  display: flex; flex-wrap: wrap; gap: 5px;
}
.teacher-card-contact {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: var(--t2); font-family: var(--font-mono);
}
.teacher-card-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding-top: 12px; border-top: 1px solid var(--border);
}
.teacher-card-actions { display: flex; gap: 4px; }
.tc-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 10px; border-radius: 6px;
  font-size: 11.5px; font-weight: 600;
  transition: background .15s, color .15s;
}
.tc-btn--edit   { color: var(--t2); background: var(--surface2); }
.tc-btn--edit:hover { background: var(--surface3); color: var(--t1); }
.tc-btn--delete { color: var(--red); background: var(--red-dim); }
.tc-btn--delete:hover { opacity: .8; }
.tc-btn--reset  { color: var(--yellow); background: var(--yellow-dim); }
.tc-btn--reset:hover { opacity: .8; }
.tc-btn--toggle { color: var(--t3); background: var(--surface2); font-size: 11px; padding: 4px 8px; }
.tc-btn--toggle:hover { background: var(--surface3); }

/* ── Multi-select chips ── */
.ms-label { font-size: 12.5px; font-weight: 600; color: var(--t2); margin-bottom: 8px; }
.ms-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.ms-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 11px; border-radius: 20px;
  font-size: 12px; font-weight: 500;
  background: var(--surface3); color: var(--t2);
  border: 1px solid var(--border2);
  cursor: pointer; transition: all .15s; user-select: none;
}
.ms-chip:hover { border-color: var(--blue); color: var(--blue); }
.ms-chip--selected {
  background: var(--blue-dim); color: var(--blue);
  border-color: var(--blue);
}
.ms-chip--selected::before { content: '✓ '; font-weight: 700; }

/* ── Picture upload ── */
.pic-upload-wrap {
  display: flex; align-items: center; gap: 14px;
  padding: 14px; background: var(--surface2);
  border: 1px solid var(--border2); border-radius: var(--r-sm);
}
.pic-upload-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: var(--r-sm);
  font-size: 12.5px; font-weight: 600; color: var(--t2);
  background: var(--surface3); border: 1px solid var(--border2);
  transition: background .15s; cursor: pointer;
}
.pic-upload-btn:hover { background: var(--surface4); color: var(--t1); }
.pic-upload-hint { font-size: 11.5px; color: var(--t3); }

/* ── Credentials modal ── */
.cred-row {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 0; border-bottom: 1px solid var(--border);
}
.cred-row:last-child { border-bottom: none; }
.cred-label { font-size: 11.5px; font-weight: 600; color: var(--t3); min-width: 90px; }
.cred-val   { flex: 1; font-size: 13px; color: var(--t1); }
.cred-copy  {
  width: 26px; height: 26px; border-radius: 5px;
  display: flex; align-items: center; justify-content: center;
  color: var(--t3); background: var(--surface3);
  transition: background .15s; flex-shrink: 0;
}
.cred-copy:hover { background: var(--surface4); color: var(--blue); }

/* ── View toggle ── */
.view-toggle {
  display: flex; gap: 2px;
  background: var(--surface2); border: 1px solid var(--border2);
  border-radius: var(--r-sm); padding: 3px;
}
.view-btn {
  width: 30px; height: 28px; border-radius: 5px;
  display: flex; align-items: center; justify-content: center;
  color: var(--t3); transition: background .15s, color .15s;
}
.view-btn:hover { color: var(--t1); }
.view-btn--active { background: var(--surface4); color: var(--t1); }

/* ── Plain badge (no colored background) ── */
.badge--plain {
  display: inline-flex; align-items: center;
  padding: 2px 7px; border-radius: 10px;
  background: var(--surface3); border: 1px solid var(--border2);
  color: var(--t2); font-size: 10.5px; font-weight: 500;
  white-space: nowrap;
}

/* ── Sticky / frozen column headers ── */
.data-table thead th {
  position: sticky !important;
  top: 0 !important;
  z-index: 10 !important;
  background: var(--surface2) !important;
  box-shadow: 0 1px 0 var(--border2) !important;
}
.data-table-wrap, #teacher-table {
  overflow-y: auto;
  max-height: calc(100vh - 260px);
}

/* ── Inactive badge overlay ── */
.inactive-overlay {
  position: absolute; top: 12px; right: 12px;
  font-size: 10px; font-weight: 700; color: var(--t3);
  background: var(--surface3); border: 1px solid var(--border2);
  padding: 2px 7px; border-radius: 10px; letter-spacing: .04em;
}

/* ── Modal viewport fix (teacher-specific overrides) ── */
.modal-overlay {
  position: fixed !important;
  inset: 0 !important;
  z-index: 9999 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 16px !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
}

.modal {
  height: auto !important;
  max-height: calc(100vh - 32px) !important;
  max-width: min(860px, calc(100vw - 32px)) !important;
  width: 100% !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
}

.modal.modal--lg {
  max-width: min(1200px, calc(100vw - 32px)) !important;
  width: calc(100vw - 32px) !important;
}
.modal.modal--sm {
  max-width: min(480px, calc(100vw - 32px)) !important;
}

.modal-header,
.modal-footer,
.modal-actions {
  flex-shrink: 0 !important;
}

.modal-body {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  height: 0 !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  overscroll-behavior: contain !important;
}

.modal-body::-webkit-scrollbar       { width: 5px; }
.modal-body::-webkit-scrollbar-track { background: transparent; }
.modal-body::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 10px; }
.modal-body::-webkit-scrollbar-thumb:hover { background: var(--border3, var(--border2)); }

/* ── Campus Schedule ── */
.campus-schedules-wrap {
  display: flex; flex-direction: column; gap: 10px; margin-top: 6px;
}
.campus-schedule-row {
  border: 1px solid var(--border); border-radius: 10px; overflow: hidden;
  transition: opacity .15s;
}
.campus-schedule-row--hidden { display: none; }
.campus-schedule-header {
  display: flex; align-items: center; gap: 7px;
  padding: 8px 14px; background: var(--surface2);
  font-size: 12.5px; font-weight: 600; color: var(--t1);
  border-bottom: 1px solid var(--border);
}
.campus-schedule-body {
  padding: 12px 14px; display: flex; flex-direction: column; gap: 12px;
}
.campus-schedule-days, .campus-schedule-times {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}
.campus-schedule-times { gap: 16px; }
.campus-schedule-label {
  font-size: 11px; font-weight: 600; color: var(--t3);
  text-transform: uppercase; letter-spacing: .06em;
  min-width: 80px; flex-shrink: 0;
}
.campus-time-field {
  display: flex; align-items: center; gap: 8px;
}
.campus-time-input { height: 32px; padding: 0 10px; font-size: 13px; }
.day-btns-wrap { display: flex; gap: 5px; flex-wrap: wrap; }
.day-btn {
  min-width: 38px; height: 30px; border-radius: 7px;
  border: 1px solid var(--border); background: var(--surface2);
  font-size: 12px; font-weight: 500; color: var(--t3);
  cursor: pointer; transition: all .15s; padding: 0 6px;
}
.day-btn:hover { border-color: var(--blue); color: var(--blue); }
.day-btn--on {
  background: var(--blue); border-color: var(--blue);
  color: #fff; font-weight: 700;
}

/* ── Teaching Subjects — search selector ── */
.ts-panel {
  border: 1px solid var(--border); border-radius: 10px;
  overflow: visible; margin-bottom: 8px; position: relative;
}
.ts-panel-header {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 12px; background: var(--surface2);
  border-bottom: 1px solid var(--border);
  border-radius: 10px 10px 0 0;
}
.ts-count-badge {
  font-size: 10.5px; font-weight: 600; color: var(--blue);
  background: var(--blue-dim); padding: 2px 8px; border-radius: 10px;
  white-space: nowrap;
}
.ts-search-wrap {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-bottom: 1px solid var(--border);
}
.ts-search-input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: 13px; color: var(--t1);
}
.ts-search-input::placeholder { color: var(--t3); }
.ts-dropdown {
  position: absolute; left: 0; right: 0; z-index: 999;
  background: var(--surface); border: 1px solid var(--border2);
  border-radius: 0 0 10px 10px; box-shadow: 0 8px 24px rgba(0,0,0,.12);
  max-height: 200px; overflow-y: auto;
}
.ts-drop-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; cursor: pointer; transition: background .12s;
  font-size: 13px; color: var(--t2);
}
.ts-drop-item:hover { background: var(--surface2); color: var(--t1); }
.ts-drop-item.selected { opacity: .4; pointer-events: none; }
.ts-drop-code {
  font-family: var(--font-mono); font-size: 11px; color: var(--cyan);
  background: var(--surface3); padding: 2px 6px; border-radius: 4px; flex-shrink: 0;
}
.ts-drop-empty {
  padding: 10px 12px; font-size: 12.5px; color: var(--t3); text-align: center;
}
.ts-tags-wrap {
  display: flex; flex-wrap: wrap; gap: 5px; padding: 8px 12px; min-height: 38px;
}
.ts-tag {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 6px 3px 7px; border-radius: 6px;
  background: var(--blue-dim); border: 1px solid rgba(79,133,247,.3);
  font-size: 11px; color: var(--blue); font-weight: 600;
  cursor: default;
}
.ts-tag-code {
  font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: .02em;
}
.ts-tag-remove {
  width: 14px; height: 14px; border-radius: 50%; display: flex;
  align-items: center; justify-content: center;
  font-size: 8px; color: var(--blue); background: rgba(79,133,247,.2);
  cursor: pointer; transition: background .12s; flex-shrink: 0; line-height: 1;
}
.ts-tag-remove:hover { background: rgba(79,133,247,.4); }
.ts-empty-msg {
  padding: 10px 12px; font-size: 12px; color: var(--t3); margin: 0;
}
`;
  document.head.appendChild(s);

  // Extra override — force modal size after any other CSS loads
  const fix = document.createElement('style');
  fix.id = 'teacher-modal-fix';
  fix.textContent = `
    .modal-backdrop {
      position: fixed !important; inset: 0 !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      padding: 16px !important; box-sizing: border-box !important;
      overflow: hidden !important; z-index: 1000 !important;
    }
    .modal-box {
      max-height: calc(100vh - 32px) !important;
      display: flex !important; flex-direction: column !important;
      overflow: hidden !important; box-sizing: border-box !important;
      margin: 0 !important;
    }
    .modal-header { flex-shrink: 0 !important; }
    .modal-footer { flex-shrink: 0 !important; }
    .modal-body {
      flex: 1 1 0% !important; min-height: 0 !important; height: 0 !important;
      overflow-y: auto !important; overflow-x: hidden !important;
      overscroll-behavior: contain !important;
    }
  `;
  // Remove existing and re-add to ensure it's last (highest priority)
  document.getElementById('teacher-modal-fix')?.remove();
  document.head.appendChild(fix);
}
