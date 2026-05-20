// ============================================================
// modules/bank.js — Bank Accounts Module (CRUD)
// Fields: id, bankName, accountNo, iban, branchAddress, instituteIds[]
// Role-based: sirf admin CRUD kar sakta hai
// ============================================================

import { AppState, generateID } from '../utils/state.js';
import { Modal, Table, Form, injectUIStyles } from '../utils/ui.js';
import { Toast } from '../utils/helpers.js';
import { Auth } from '../utils/auth.js';

const KEY = 'bankAccounts';

// ── Validation rules ──────────────────────────────────────────
const RULES = {
  bankName:      { required: true,  minLen: 2,  message: 'Bank name is required.' },
  accountTitle:  { required: true,  minLen: 2,  message: 'Account title is required.' },
  accountNo:     { required: false },
  iban:          { required: false },
};

// ── Helpers ───────────────────────────────────────────────────
function getBanks() {
  return AppState.get(KEY) || [];
}

function getInstitutes() {
  return AppState.get('institutes') || [];
}

// Convert array of institute IDs → readable names
function formatInstitutes(ids = []) {
  if (!ids.length) return '<span style="color:var(--t3)">—</span>';
  const all = getInstitutes();
  const names = ids.map(id => {
    const inst = all.find(i => i.id === id);
    return inst ? inst.instituteName : '?';
  });
  return names
    .map(n => `<span class="badge badge--blue" style="margin-right:3px">${n}</span>`)
    .join('');
}

// ── Main Module ───────────────────────────────────────────────
export const BankModule = {

  mount(container) {
    injectUIStyles();
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    el.innerHTML = this._pageTemplate();
    this._render(el);
    this._attachToolbar(el);

    // Sirf admin ko Add button dikhao
    const addBtn = el.querySelector('#bankAddBtn');
    if (addBtn) {
      addBtn.style.display = Auth.can('bank:create') ? '' : 'none';
    }
  },

  // ── Table render ─────────────────────────────────────────────
  _render(container, filter = '') {
    const el  = typeof container === 'string' ? document.querySelector(container) : container;
    const all = getBanks();

    const rows = filter
      ? all.filter(b =>
          (b.bankName     || '').toLowerCase().includes(filter) ||
          (b.accountNo    || '').toLowerCase().includes(filter) ||
          (b.iban         || '').toLowerCase().includes(filter) ||
          (b.branchAddress|| '').toLowerCase().includes(filter)
        )
      : all;

    // Record count
    const countEl = el.querySelector('.record-count');
    if (countEl) countEl.textContent = `${rows.length} record${rows.length !== 1 ? 's' : ''}`;

    const canEdit   = Auth.can('bank:edit');
    const canDelete = Auth.can('bank:delete');

    const actions = [];
    if (canEdit) {
      actions.push({
        label: 'Edit',
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                 <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                 <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
               </svg>`,
        handler: (row) => this._openForm(row, el),
      });
    }
    if (canDelete) {
      actions.push({
        label: 'Delete', danger: true,
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                 <polyline points="3 6 5 6 21 6"/>
                 <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                 <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
               </svg>`,
        handler: (row) => this._delete(row, el),
      });
    }

    Table.render(el.querySelector('#bank-table'), {
      columns: [
        {
          key: 'bankName',
          label: 'Bank Name',
          render: (v, row) => `
            <div style="display:flex;align-items:center;gap:10px">
              <div style="
                width:34px;height:34px;border-radius:8px;flex-shrink:0;
                background:var(--blue-dim);color:var(--blue);
                display:flex;align-items:center;justify-content:center;
                font-size:11px;font-weight:700;font-family:var(--font-mono)">
                ${(v || '?').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div style="font-weight:600;color:var(--t1)">${v || '—'}</div>
                <div style="font-size:11.5px;color:var(--t3);margin-top:1px">
                  ${row.branchAddress || '—'}
                </div>
              </div>
            </div>`,
        },
        {
          key: 'accountTitle',
          label: 'Account Title',
          width: '180px',
          render: v => `<span style="color:var(--t1);font-size:13px">${v || '—'}</span>`,
        },
        {
          key: 'accountNo',
          label: 'Account No.',
          width: '170px',
          render: v => `<span style="font-family:var(--font-mono);font-size:12.5px;color:var(--t1)">${v || '—'}</span>`,
        },
        {
          key: 'iban',
          label: 'IBAN',
          width: '240px',
          render: v => v
            ? `<span style="font-family:var(--font-mono);font-size:12px;color:var(--t2);letter-spacing:.04em">${v}</span>`
            : '<span style="color:var(--t3)">—</span>',
        },
        {
          key: 'instituteIds',
          label: 'Assigned To',
          width: '220px',
          render: (ids) => formatInstitutes(ids || []),
        },
      ],
      rows,
      emptyMsg: 'No bank accounts added yet. Click "Add Bank" to get started.',
      actions,
    });
  },

  // ── Add / Edit form ──────────────────────────────────────────
  _openForm(existing = null, container) {
    const isEdit = !!existing;

    if ( isEdit && !Auth.can('bank:edit'))   return Toast.warning('Permission denied.');
    if (!isEdit && !Auth.can('bank:create')) return Toast.warning('Permission denied.');

    const institutes = getInstitutes();
    const selectedIds = existing?.instituteIds || [];

    // Multi-select checkboxes for institutes
    const instCheckboxes = institutes.length
      ? `<div style="
            display:flex;flex-direction:column;gap:6px;
            max-height:160px;overflow-y:auto;
            padding:8px 10px;
            background:var(--surface2);
            border:1px solid var(--border2);
            border-radius:var(--r-sm)">
          ${institutes.map(inst => `
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--t1)">
              <input
                type="checkbox"
                class="bank-inst-chk"
                value="${inst.id}"
                style="accent-color:var(--blue);width:14px;height:14px;cursor:pointer"
                ${selectedIds.includes(inst.id) ? 'checked' : ''}
              />
              ${inst.instituteName}
              ${inst.city ? `<span style="font-size:11px;color:var(--t3)">(${inst.city})</span>` : ''}
            </label>`).join('')}
        </div>`
      : `<div style="font-size:12.5px;color:var(--t3);padding:10px;background:var(--surface2);border-radius:var(--r-sm)">
           No institutes found. Add institutes first.
         </div>`;

    Modal.open({
      title: isEdit ? 'Edit Bank Account' : 'Add Bank Account',
      body: `
        <!-- Bank Name -->
        <div class="form-group">
          <label class="form-label">
            Bank Name <span class="req">*</span>
          </label>
          <input
            name="bankName"
            class="form-input"
            placeholder="e.g. Meezan Bank"
            value="${existing?.bankName || ''}"
          />
        </div>

        <!-- Account Title -->
        <div class="form-group">
          <label class="form-label">
            Account Title <span class="req">*</span>
          </label>
          <input
            name="accountTitle"
            class="form-input"
            placeholder="e.g. FAST National University"
            value="${existing?.accountTitle || ''}"
          />
        </div>

        <!-- Account No + IBAN -->
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">
              Account No. <span class="req">*</span>
            </label>
            <input
              name="accountNo"
              class="form-input"
              placeholder="e.g. 01234567890123"
              value="${existing?.accountNo || ''}"
            />
          </div>
          <div class="form-group">
            <label class="form-label">IBAN</label>
            <input
              name="iban"
              class="form-input"
              placeholder="e.g. PK36SCBL0000001123456702"
              value="${existing?.iban || ''}"
              style="font-family:var(--font-mono);font-size:12.5px;letter-spacing:.04em"
            />
          </div>
        </div>

        <!-- Branch Address -->
        <div class="form-group">
          <label class="form-label">Branch Address</label>
          <input
            name="branchAddress"
            class="form-input"
            placeholder="e.g. Blue Area, Islamabad"
            value="${existing?.branchAddress || ''}"
          />
        </div>

        <!-- Assign to Institutes -->
        <div class="form-group">
          <label class="form-label" style="margin-bottom:6px;display:flex;align-items:center;justify-content:space-between">
            <span>Assign to Institutes</span>
            ${institutes.length > 1 ? `
              <button type="button" id="bankSelectAll"
                style="font-size:11px;color:var(--blue);background:none;border:none;cursor:pointer;padding:0">
                Select All
              </button>` : ''}
          </label>
          ${instCheckboxes}
        </div>
      `,
      actions: [
        { label: 'Cancel', variant: 'ghost', close: true },
        {
          label: isEdit ? 'Save Changes' : 'Add Bank',
          variant: 'primary',
          close: false,
          handler: (modalEl) => {
            // Validate required fields
            const { valid } = Form.validate(modalEl.querySelector('.modal-body'), RULES);
            if (!valid) return;

            const data = Form.collect(modalEl.querySelector('.modal-body'));

            // IBAN uppercase + trim
            if (data.iban) data.iban = data.iban.trim().toUpperCase();

            // Collect checked institutes
            const checkedIds = [...modalEl.querySelectorAll('.bank-inst-chk:checked')]
              .map(c => c.value);
            data.instituteIds = checkedIds;

            if (isEdit) {
              AppState.update(KEY, existing.id, data);
              Toast.success(`Bank "${data.bankName}" updated.`);
            } else {
              AppState.add(KEY, { ...data, id: generateID('bank') });
              Toast.success(`Bank "${data.bankName}" added.`);
            }

            Modal.closeAll();
            this._render(container);
          },
        },
      ],

      // Wire "Select All" button after modal opens
      onOpen: (modalEl) => {
        modalEl.querySelector('#bankSelectAll')?.addEventListener('click', () => {
          const allChks = modalEl.querySelectorAll('.bank-inst-chk');
          const allChecked = [...allChks].every(c => c.checked);
          allChks.forEach(c => { c.checked = !allChecked; });
          // Toggle label
          const btn = modalEl.querySelector('#bankSelectAll');
          if (btn) btn.textContent = allChecked ? 'Select All' : 'Deselect All';
        });
      },
    });
  },

  // ── Delete ───────────────────────────────────────────────────
  async _delete(row, container) {
    if (!Auth.can('bank:delete')) return Toast.warning('Permission denied.');

    const ok = await Modal.confirm({
      title: 'Delete Bank Account',
      message: `Delete <strong>${row.bankName}</strong> (A/C: ${row.accountNo})? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;

    AppState.remove(KEY, row.id);
    Toast.success(`Bank "${row.bankName}" deleted.`);
    this._render(container);
  },

  // ── Toolbar wiring ───────────────────────────────────────────
  _attachToolbar(container) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;

    el.querySelector('#bankAddBtn')?.addEventListener('click', () => {
      if (!Auth.can('bank:create')) return Toast.warning('Permission denied.');
      this._openForm(null, el);
    });

    el.querySelector('#bankSearch')?.addEventListener('input', (e) => {
      this._render(el, e.target.value.toLowerCase().trim());
    });
  },

  // ── Page template ────────────────────────────────────────────
  _pageTemplate() {
    return `
      <div class="module-page">
        <div class="module-toolbar">
          <div class="search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input id="bankSearch" class="search-input" placeholder="Search banks…"/>
          </div>
          <span class="record-count">— records</span>
          <button id="bankAddBtn" class="add-btn" style="margin-left:auto">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Bank
          </button>
        </div>
        <div id="bank-table"></div>
      </div>
    `;
  },
};
