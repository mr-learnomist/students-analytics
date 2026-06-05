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

  Table.render(body.querySelector('#teacher-table'), {
    columns: [
      { key: 'profilePicture', label: '', width: '48px',
        render: (pic, row) => _avatarHTML(pic, row.fullName, 32) },
      { key: 'fullName', label: 'Name',
        render: (val, row) => `
          <div>
            <div style="font-weight:600;color:var(--t1)">${val}</div>
            <div style="font-size:11.5px;color:var(--t3);margin-top:2px">${row.email}</div>
          </div>` },
      { key: 'qualification', label: 'Qualification', width: '160px',
        render: (v) => `<span style="color:var(--t2);font-size:12.5px">${v || '—'}</span>` },
      { key: 'disciplines', label: 'Disciplines', width: '160px',
        render: (ids) => _disciplinePills(ids) },
      { key: 'campuses', label: 'Campuses', width: '140px',
        render: (ids) => _campusPills(ids) },
      { key: 'contactNumber', label: 'Contact', width: '130px',
        render: (v) => `<span style="font-family:var(--font-mono);font-size:12px;color:var(--t2)">${v || '—'}</span>` },
      { key: 'isActive', label: 'Status', width: '80px',
        render: (v) => v !== false
          ? `<span class="badge badge--green">Active</span>`
          : `<span class="badge badge--red">Inactive</span>` },
    ],
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
    title: '✅ Teacher Add Ho Gaya',
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
    return d ? `<span class="badge badge--blue" style="font-size:10.5px;margin-right:3px">${d.abbreviation}</span>` : '';
  }).join('') + (ids.length > 2 ? `<span class="badge badge--grey" style="font-size:10.5px">+${ids.length - 2}</span>` : '');
}

function _campusPills(ids = []) {
  if (!ids?.length) return '<span style="color:var(--t4)">—</span>';
  return ids.slice(0, 2).map(id => {
    const c = AppState.findById('campuses', id);
    return c ? `<span class="badge badge--cyan" style="font-size:10.5px;margin-right:3px">${c.campusName}</span>` : '';
  }).join('') + (ids.length > 2 ? `<span class="badge badge--grey" style="font-size:10.5px">+${ids.length - 2}</span>` : '');
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

/* ── Inactive badge overlay ── */
.inactive-overlay {
  position: absolute; top: 12px; right: 12px;
  font-size: 10px; font-weight: 700; color: var(--t3);
  background: var(--surface3); border: 1px solid var(--border2);
  padding: 2px 7px; border-radius: 10px; letter-spacing: .04em;
}

/* ── Modal viewport fit ── */
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

/* Modal box: height auto, max-height keeps it inside viewport */
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

/* Header and footer: never shrink — always visible */
.modal-header,
.modal-footer,
.modal-actions {
  flex-shrink: 0 !important;
}

/* Body: scrolls internally */
.modal-body {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  overscroll-behavior: contain !important;
  -webkit-overflow-scrolling: touch !important;
}

/* Thin scrollbar inside modal body */
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
}
