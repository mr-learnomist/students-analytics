// ============================================================
// modules/users.js — User Management Module (Admin only)
// Fields: id, username, password, name, role, avatar, institute
// PATCH: MongoDB response structure fix for save confirmation
// ============================================================

import { AppState, generateID } from '../utils/state.js';
import { Modal, Table, Form, injectUIStyles } from '../utils/ui.js';
import { Toast } from '../utils/helpers.js';
import { Auth } from '../utils/auth.js';

const KEY = 'users';

const ROLES = ['admin', 'campusAdmin', 'teacher', 'viewer'];

const ROLE_COLORS = {
  admin:       { bg: 'rgba(79,133,247,0.12)',  color: '#4f85f7' },
  campusAdmin: { bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b' },
  teacher:     { bg: 'rgba(16,185,129,0.12)',  color: '#10b981' },
  viewer:      { bg: 'rgba(136,146,180,0.12)', color: '#8892b4' },
};

const RULES = {
  name:     { required: true, minLen: 2, message: 'Full name must be at least 2 characters.' },
  username: { required: true, minLen: 3, message: 'Username must be at least 3 characters.' },
  role:     { required: true, message: 'Please select a role.' },
};

// ── Module ────────────────────────────────────────────────────
export const UsersModule = {

  mount(container) {
    injectUIStyles();
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    el.innerHTML = this._pageTemplate();
    this._render(el);
    this._attachToolbar(el);
  },

  // ── Render table ────────────────────────────────────────────
  _render(container, filter = '') {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    const all = AppState.get(KEY) || [];
    const rows = filter
      ? all.filter(u =>
          (u.name     || '').toLowerCase().includes(filter) ||
          (u.username || '').toLowerCase().includes(filter) ||
          (u.role     || '').toLowerCase().includes(filter))
      : all;

    const countEl = el.querySelector('.record-count');
    if (countEl) countEl.textContent = `${rows.length} user${rows.length !== 1 ? 's' : ''}`;

    const currentUser = Auth.getCurrentUser();

    Table.render(el.querySelector('#users-table'), {
      columns: [
        {
          key: 'avatar',
          label: '',
          width: '48px',
          render: (val, row) => {
            const initials = val || (row.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
            return `<div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--blue),var(--violet));display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff">${initials}</div>`;
          }
        },
        {
          key: 'name',
          label: 'Full Name',
          render: (val, row) => {
            const isMe = currentUser && (currentUser.id === row.id || currentUser.username === row.username);
            return `<span style="font-weight:600;color:var(--t1)">${val}</span>${isMe ? ' <span style="font-size:10px;background:var(--blue-dim);color:var(--blue);padding:1px 7px;border-radius:10px;font-weight:600;margin-left:4px">You</span>' : ''}`;
          }
        },
        {
          key: 'username',
          label: 'Username',
          render: (val) => `<span style="font-family:var(--font-mono);font-size:12.5px;color:var(--t2)">@${val}</span>`
        },
        {
          key: 'role',
          label: 'Role',
          width: '120px',
          render: (val) => {
            const c = ROLE_COLORS[val] || ROLE_COLORS.viewer;
            const labelMap = { admin: 'Admin', campusAdmin: 'Campus Admin', teacher: 'Teacher', viewer: 'Viewer' };
            const label = labelMap[val] || (val ? val.charAt(0).toUpperCase() + val.slice(1) : 'Viewer');
            return `<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:11.5px;font-weight:600;background:${c.bg};color:${c.color}">${label}</span>`;
          }
        },
        {
          key: 'customPermissions',
          label: 'Access',
          render: (val, row) => {
            if (row.role === 'admin') {
              return `<span style="font-size:11.5px;color:#10b981;font-weight:600">✦ Full Access</span>`;
            }
            const count = Array.isArray(val) && val.length > 0 ? val.length : null;
            if (count) {
              return `<span style="font-size:11.5px;color:#4f85f7;font-weight:600">${count} custom</span>`;
            }
            return `<span style="font-size:11.5px;color:var(--t3)">Role default</span>`;
          }
        },
        {
          key: 'institute',
          label: 'Institute',
          render: (val) => `<span style="font-size:12.5px;color:var(--t3)">${val || '—'}</span>`
        },
        {
          key: 'campusIds',
          label: 'Campus Access',
          render: (val, row) => {
            const campuses = AppState.get('campuses') || [];
            const ids = Array.isArray(val) && val.length ? val : (row.campusId ? [row.campusId] : []);
            if (!ids.length) return '<span style="font-size:11.5px;color:#10b981;font-weight:600">All Campuses</span>';
            const names = ids.map(id => campuses.find(c => c.id === id)?.campusName || id).join(', ');
            return `<span style="font-size:11.5px;color:var(--t2)">${names}</span>`;
          }
        },
      ],
      rows,
      emptyMsg: 'No users found. Click "Add User" to create one.',
      actions: [
        {
          label: 'Edit',
          icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
          handler: (row) => this._openForm(row, el)
        },
        {
          label: 'Delete',
          danger: true,
          icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
          handler: (row) => this._delete(row, el)
        }
      ]
    });
  },

  // ── Add / Edit form ─────────────────────────────────────────
  _openForm(existing = null, container) {
    const isEdit = !!existing;
    const institutes = (AppState.get('institutes') || []).map(i => i.instituteName);
    const instituteOptions = institutes.map(n =>
      `<option value="${n}" ${existing?.institute === n ? 'selected' : ''}>${n}</option>`
    ).join('');

    const existingCustomPerms = existing?.customPermissions || [];
    const isAdminRole = existing?.role === 'admin';

    const permGroupsHTML = Auth.ALL_PERMISSIONS.map(group => {
      const checkboxes = group.perms.map(perm => {
        const checked = existingCustomPerms.includes(perm) ? 'checked' : '';
        const shortLabel = perm.includes(':') ? perm.split(':')[1] : 'View';
        return `
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:var(--t2);padding:3px 0">
            <input type="checkbox" class="perm-checkbox" data-perm="${perm}" ${checked}
                   style="width:14px;height:14px;accent-color:#4f85f7;cursor:pointer;flex-shrink:0"/>
            <span>${shortLabel}</span>
          </label>`;
      }).join('');

      return `
        <div class="perm-group" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <span style="font-size:11.5px;font-weight:700;color:var(--t1);text-transform:uppercase;letter-spacing:0.05em">${group.group}</span>
            <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11px;color:var(--t3)">
              <input type="checkbox" class="perm-group-toggle" data-group="${group.group}"
                     style="width:12px;height:12px;accent-color:#4f85f7;cursor:pointer"
                     ${group.perms.every(p => existingCustomPerms.includes(p)) ? 'checked' : ''}/>
              All
            </label>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:2px 16px">${checkboxes}</div>
        </div>`;
    }).join('');

    const campuses = AppState.get('campuses') || [];
    const allInstitutes = (AppState.get('institutes') || []);
    const existingCampusIds = existing?.campusIds || (existing?.campusId ? [existing.campusId] : []);

    const campusCheckboxesHTML = campuses.length === 0
      ? '<span style="font-size:12px;color:var(--t3)">No campuses available.</span>'
      : campuses.map(c => {
          const inst = allInstitutes.find(i => i.id === c.instituteId);
          const instName = inst ? ` <span style="font-size:10.5px;color:var(--t3)">(${inst.instituteName})</span>` : '';
          const checked = existingCampusIds.includes(c.id) ? 'checked' : '';
          return `<label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:12.5px;color:var(--t2)">
            <input type="checkbox" class="campus-checkbox" data-campus-id="${c.id}" ${checked}
                   style="width:14px;height:14px;accent-color:#4f85f7;cursor:pointer;flex-shrink:0"/>
            <span>${c.campusName}${instName}</span>
          </label>`;
        }).join('');

    Modal.open({
      title: isEdit ? 'Edit User' : 'Add New User',
      size: 'lg',
      body: `
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Full Name <span class="req">*</span></label>
            <input name="name" class="form-input" placeholder="e.g. Dr. Ali Hassan"
                   value="${existing?.name || ''}"/>
          </div>
          <div class="form-group">
            <label class="form-label">Username <span class="req">*</span></label>
            <input name="username" class="form-input" placeholder="e.g. ali.hassan"
                   value="${existing?.username || ''}"
                   style="font-family:var(--font-mono)"
                   ${isEdit ? 'readonly' : ''}/>
            ${isEdit ? '<span class="form-hint">Username cannot be changed.</span>' : '<span class="form-hint">Lowercase, no spaces recommended.</span>'}
          </div>
        </div>
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">${isEdit ? 'New Password' : 'Password'} ${isEdit ? '' : '<span class="req">*</span>'}</label>
            <div style="position:relative">
              <input name="password" id="passwordField" class="form-input" type="password"
                     placeholder="${isEdit ? 'Leave blank to keep existing' : 'Set a password'}"
                     value="${isEdit ? (existing?.password || '') : ''}"
                     style="padding-right:40px"/>
              <button type="button" id="togglePassword"
                      style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--t3);padding:0;display:flex;align-items:center"
                      title="Show/Hide password">
                <svg id="eyeIcon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
            </div>
            ${isEdit ? '<span class="form-hint">Current password shown. Leave as-is or change it.</span>' : ''}
          </div>
          <div class="form-group">
            <label class="form-label">Role <span class="req">*</span></label>
            <select name="role" id="userRoleSelect" class="form-input">
              <option value="">— Select a role —</option>
              ${ROLES.map(r => {
                const labelMap = { admin: 'Admin', campusAdmin: 'Campus Admin', teacher: 'Teacher', viewer: 'Viewer' };
                return `<option value="${r}" ${existing?.role === r ? 'selected' : ''}>${labelMap[r] || r}</option>`;
              }).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Institute</label>
          <select name="institute" class="form-input">
            <option value="">— Select (optional) —</option>
            ${instituteOptions}
          </select>
        </div>

        <!-- Campus Access -->
        <div class="form-group">
          <label class="form-label">Campus Access
            <span style="font-size:11px;font-weight:400;color:var(--t3);margin-left:6px">(Leave empty = all campuses)</span>
          </label>
          <div id="campusCheckboxes" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;background:var(--surface2);border:1px solid var(--border2);border-radius:var(--r-sm);padding:10px 12px">
            ${campusCheckboxesHTML}
          </div>
        </div>

        <!-- ── Permissions Panel ── -->
        <div id="permsSection" style="${isAdminRole ? 'display:none' : ''}">
          <div style="display:flex;align-items:center;justify-content:space-between;margin:18px 0 10px;">
            <div>
              <span style="font-size:13px;font-weight:700;color:var(--t1)">Module Access</span>
              <span style="font-size:11.5px;color:var(--t3);margin-left:8px">
                Leave all unchecked to use role defaults
              </span>
            </div>
            <div style="display:flex;gap:8px">
              <button type="button" id="selectAllPerms"
                      style="font-size:11px;padding:4px 10px;border-radius:6px;background:var(--blue-dim);color:var(--blue);font-weight:600;border:none;cursor:pointer">
                Select All
              </button>
              <button type="button" id="clearAllPerms"
                      style="font-size:11px;padding:4px 10px;border-radius:6px;background:var(--surface3);color:var(--t2);font-weight:600;border:none;cursor:pointer">
                Clear All
              </button>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;max-height:340px;overflow-y:auto;padding-right:4px">
            ${permGroupsHTML}
          </div>
          <p id="permsSummary" style="font-size:11.5px;color:var(--t3);margin-top:8px;text-align:right"></p>
        </div>
      `,
      onOpen: (modalEl) => {
        const toggleBtn   = modalEl.querySelector('#togglePassword');
        const passwordFld = modalEl.querySelector('#passwordField');
        const eyeIcon     = modalEl.querySelector('#eyeIcon');
        if (toggleBtn && passwordFld) {
          toggleBtn.addEventListener('click', () => {
            const isHidden = passwordFld.type === 'password';
            passwordFld.type = isHidden ? 'text' : 'password';
            const eyeOpen  = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
            const eyeClosed = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
            eyeIcon.innerHTML = isHidden ? eyeClosed : eyeOpen;
          });
        }

        const roleSelect   = modalEl.querySelector('#userRoleSelect');
        const permsSection = modalEl.querySelector('#permsSection');
        const summaryEl    = modalEl.querySelector('#permsSummary');

        const updatePermsVisibility = () => {
          const isAdmin = roleSelect.value === 'admin';
          permsSection.style.display = isAdmin ? 'none' : '';
          if (!isAdmin) updateSummary();
        };
        roleSelect?.addEventListener('change', updatePermsVisibility);

        const updateSummary = () => {
          const checked = modalEl.querySelectorAll('.perm-checkbox:checked').length;
          summaryEl.textContent = checked > 0
            ? `${checked} permission${checked !== 1 ? 's' : ''} selected (overrides role default)`
            : 'No custom permissions — role default will apply';
        };

        modalEl.querySelectorAll('.perm-checkbox').forEach(cb => {
          cb.addEventListener('change', () => {
            const perm  = cb.dataset.perm;
            const group = Auth.ALL_PERMISSIONS.find(g => g.perms.includes(perm));
            if (group) {
              const groupToggle = modalEl.querySelector(`.perm-group-toggle[data-group="${group.group}"]`);
              if (groupToggle) {
                groupToggle.checked = group.perms.every(
                  p => modalEl.querySelector(`.perm-checkbox[data-perm="${p}"]`)?.checked
                );
              }
            }
            updateSummary();
          });
        });

        modalEl.querySelectorAll('.perm-group-toggle').forEach(toggle => {
          toggle.addEventListener('change', () => {
            const group = Auth.ALL_PERMISSIONS.find(g => g.group === toggle.dataset.group);
            if (group) {
              group.perms.forEach(p => {
                const cb = modalEl.querySelector(`.perm-checkbox[data-perm="${p}"]`);
                if (cb) cb.checked = toggle.checked;
              });
            }
            updateSummary();
          });
        });

        modalEl.querySelector('#selectAllPerms')?.addEventListener('click', () => {
          modalEl.querySelectorAll('.perm-checkbox,.perm-group-toggle').forEach(cb => cb.checked = true);
          updateSummary();
        });
        modalEl.querySelector('#clearAllPerms')?.addEventListener('click', () => {
          modalEl.querySelectorAll('.perm-checkbox,.perm-group-toggle').forEach(cb => cb.checked = false);
          updateSummary();
        });

        updateSummary();
      },
      actions: [
        { label: 'Cancel', variant: 'ghost', close: true },
        {
          label: isEdit ? 'Save Changes' : 'Add User',
          variant: 'primary',
          close: false,
          handler: async (modalEl) => {
            const rules = { ...RULES };
            if (!isEdit) rules.password = { required: true, minLen: 4, message: 'Password must be at least 4 characters.' };
            const { valid } = Form.validate(modalEl.querySelector('.modal-body'), rules);
            if (!valid) return;

            const data = Form.collect(modalEl.querySelector('.modal-body'));

            const selectedCampusIds = [...modalEl.querySelectorAll('.campus-checkbox:checked')]
              .map(cb => cb.dataset.campusId);
            data.campusIds = selectedCampusIds;
            data.campusId = data.role === 'admin' ? null : (selectedCampusIds.length === 1 ? selectedCampusIds[0] : null);

            if (data.role !== 'admin') {
              const checkedPerms = [...modalEl.querySelectorAll('.perm-checkbox:checked')]
                .map(cb => cb.dataset.perm);
              data.customPermissions = checkedPerms;
            } else {
              data.customPermissions = [];
            }

            const all = AppState.get(KEY) || [];
            const duplicate = all.find(u => u.username.toLowerCase() === data.username.toLowerCase() && u.id !== existing?.id);
            if (duplicate) { Toast.error('This username already exists.'); return; }

            data.avatar = data.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

            if (isEdit) {
              if (!data.password) data.password = existing.password;
              AppState.update(KEY, existing.id, data);

              const currentUser = AppState.get('currentUser');
              if (currentUser && (currentUser.id === existing.id || currentUser.username === existing.username)) {
                const updatedUser = { ...currentUser, ...data };
                AppState.set('currentUser', updatedUser);
                const newInitials = data.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                const G = id => document.getElementById(id);
                if (G('sbAvatar')) G('sbAvatar').textContent = newInitials;
                if (G('sbName'))   G('sbName').textContent   = data.name;
                if (G('nbAvatar')) G('nbAvatar').textContent = newInitials;
                if (G('nbName'))   G('nbName').textContent   = data.name;
                if (G('sbRole'))   G('sbRole').textContent   = data.role.charAt(0).toUpperCase() + data.role.slice(1);
              }
              Toast.success(`User "${data.name}" updated successfully.`);
            } else {
              AppState.add(KEY, { ...data, id: generateID('user') });
            }

            const saveBtn = [...modalEl.querySelectorAll('button')].find(b =>
              b.textContent.includes('Save') || b.textContent.includes('Add User'));
            if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

            try {
              await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('timeout')), 4000);
                const check = async () => {
                  try {
                    const res  = await fetch('/api/data');
                    const json = await res.json();
                    // ✅ FIX: Handle all possible MongoDB response structures
                    const users = json.data?.appState?.users
                               || json.data?.users
                               || json.appState?.users
                               || [];
                    const saved = isEdit
                      ? users.find(u => u.id === existing.id)
                      : users.find(u => u.username?.toLowerCase() === data.username?.toLowerCase());
                    if (saved) { clearTimeout(timeout); resolve(); }
                    else setTimeout(check, 500);
                  } catch { setTimeout(check, 500); }
                };
                check();
              });
              Toast.success(isEdit
                ? `User "${data.name}" updated successfully.`
                : `User "${data.name}" added successfully. They can now log in.`);
              Modal.closeAll();
              this._render(container);
            } catch {
              Toast.error('Save failed. Please check your connection and try again.');
              if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = isEdit ? 'Save Changes' : 'Add User'; }
            }
          }
        }
      ]
    });
  },

  // ── Delete ───────────────────────────────────────────────────
  async _delete(row, container) {
    const currentUser = Auth.getCurrentUser();
    if (currentUser && currentUser.username === row.username) {
      Toast.error('You cannot delete your own account.');
      return;
    }

    const confirmed = await Modal.confirm({
      title: 'User Delete Karo',
      message: `Are you sure you want to delete <strong>${row.name} (@${row.username})</strong>? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true
    });
    if (!confirmed) return;

    AppState.remove(KEY, row.id);
    Toast.success(`User "${row.name}" deleted successfully.`);
    this._render(container);
  },

  // ── Toolbar ──────────────────────────────────────────────────
  _attachToolbar(container) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;

    el.querySelector('#usersAddBtn')?.addEventListener('click', () => {
      this._openForm(null, el);
    });

    const searchInput = el.querySelector('#usersSearch');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this._render(el, searchInput.value.toLowerCase().trim());
      });
    }
  },

  // ── Template ─────────────────────────────────────────────────
  _pageTemplate() {
    return `
      <div class="module-page">
        <div class="module-toolbar">
          <div class="search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input id="usersSearch" class="search-input" placeholder="Search by name or username…"/>
          </div>
          <span class="record-count">— users</span>
          <button id="usersAddBtn" class="add-btn" style="margin-left:auto">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add User
          </button>
        </div>
        <div id="users-table"></div>
      </div>
    `;
  }
};
