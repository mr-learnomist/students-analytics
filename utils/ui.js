// ============================================================
// utils/ui.js — Reusable UI Primitives
// Modal, Table renderer, Confirm dialog, Form helpers
// ============================================================

// ── Modal ─────────────────────────────────────────────────────
export const Modal = {
  _stack: [], // support nested modals

  /**
   * Open a modal
   * @param {Object} opts
   * @param {string} opts.title
   * @param {string} opts.body       — HTML string for body
   * @param {Array}  opts.actions    — [{ label, variant, handler, close }]
   * @param {string} opts.size       — 'sm' | 'md' | 'lg'
   * @param {Function} opts.onOpen   — called after DOM inject
   */
  open({ title = '', body = '', actions = [], size = 'md', onOpen = null } = {}) {
    const id = `modal_${Date.now()}`;

    const sizeMap = { sm: '400px', md: '540px', lg: '720px' };
    const width = sizeMap[size] || sizeMap.md;

    const actionHTML = actions.map((a, i) => `
      <button class="modal-btn modal-btn--${a.variant || 'ghost'}" data-action-idx="${i}">
        ${a.label}
      </button>
    `).join('');

    const html = `
      <div class="modal-backdrop" id="${id}" role="dialog" aria-modal="true">
        <div class="modal-box" style="max-width:${width}" role="document">
          <div class="modal-header">
            <h3 class="modal-title">${title}</h3>
            <button class="modal-close" data-close aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">${body}</div>
          ${actions.length ? `<div class="modal-footer">${actionHTML}</div>` : ''}
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    const el = document.getElementById(id);

    // Force reflow for transition
    requestAnimationFrame(() => el.classList.add('modal--open'));

    // Event delegation on backdrop
    el.addEventListener('click', (e) => {
      if (e.target.hasAttribute('data-close') || e.target.closest('[data-close]')) {
        this.close(id);
      }
      if (e.target === el) this.close(id); // click outside

      const btn = e.target.closest('[data-action-idx]');
      if (btn) {
        const idx = parseInt(btn.dataset.actionIdx, 10);
        const action = actions[idx];
        if (action?.handler) action.handler(el);
        if (action?.close !== false) this.close(id);
      }
    });

    // ESC key
    const onKey = (e) => { if (e.key === 'Escape') { this.close(id); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);

    this._stack.push({ id, onKey });
    if (onOpen) onOpen(el);
    return id;
  },

  close(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('modal--open');
    setTimeout(() => el.remove(), 220);
    this._stack = this._stack.filter(m => m.id !== id);
  },

  closeAll() {
    [...this._stack].forEach(m => this.close(m.id));
  },

  // Convenience: confirmation dialog
  confirm({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', danger = false } = {}) {
    return new Promise((resolve) => {
      this.open({
        title,
        size: 'sm',
        body: `<p style="color:var(--t2);font-size:13.5px;line-height:1.6;">${message}</p>`,
        actions: [
          { label: 'Cancel',       variant: 'ghost',                    handler: () => resolve(false) },
          { label: confirmLabel,   variant: danger ? 'danger' : 'primary', handler: () => resolve(true)  },
        ]
      });
    });
  }
};

// ── Table Renderer ────────────────────────────────────────────
export const Table = {
  /**
   * Render a data table
   * @param {HTMLElement|string} container
   * @param {Object} opts
   * @param {Array}  opts.columns  — [{ key, label, width?, render? }]
   * @param {Array}  opts.rows     — data array
   * @param {string} opts.emptyMsg
   * @param {Array}  opts.actions  — [{ label, icon, handler, danger? }]
   */
  render(container, { columns = [], rows = [], emptyMsg = 'No records found.', actions = [] } = {}) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;

    if (!rows.length) {
      el.innerHTML = `
        <div class="table-empty">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--t4);margin-bottom:10px;">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <p>${emptyMsg}</p>
        </div>`;
      return;
    }

    const colHeaders = columns.map(c =>
      `<th style="${c.width ? `width:${c.width}` : ''}">${c.label}</th>`
    ).join('');

    const actionCol = actions.length ? `<th style="width:100px;text-align:right">Actions</th>` : '';

    const bodyRows = rows.map((row, rowIdx) => {
      const cells = columns.map(col => {
        const val = col.render
          ? col.render(row[col.key], row)
          : (row[col.key] ?? '—');
        return `<td>${val}</td>`;
      }).join('');

      const actionBtns = actions.map(a => `
        <button class="tbl-action-btn ${a.danger ? 'tbl-action-btn--danger' : ''}"
                data-row-idx="${rowIdx}" data-action="${a.label}"
                title="${a.label}">
          ${a.icon || a.label}
        </button>
      `).join('');

      const actionsCell = actions.length
        ? `<td style="text-align:right"><div class="tbl-actions">${actionBtns}</div></td>`
        : '';

      return `<tr data-row-idx="${rowIdx}">${cells}${actionsCell}</tr>`;
    }).join('');

    el.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>${colHeaders}${actionCol}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    `;

    // Event delegation for row actions
    el.querySelector('tbody')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const rowIdx = parseInt(btn.dataset.rowIdx, 10);
      const actionLabel = btn.dataset.action;
      const action = actions.find(a => a.label === actionLabel);
      if (action?.handler) action.handler(rows[rowIdx], rowIdx);
    });
  }
};

// ── Form helpers ──────────────────────────────────────────────
export const Form = {
  // Read all named inputs inside a container into a plain object
  collect(container) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    const data = {};
    el?.querySelectorAll('[name]').forEach(input => {
      data[input.name] = input.type === 'checkbox' ? input.checked : input.value.trim();
    });
    return data;
  },

  // Populate named inputs from a plain object
  populate(container, data = {}) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    Object.entries(data).forEach(([key, val]) => {
      const input = el?.querySelector(`[name="${key}"]`);
      if (!input) return;
      if (input.type === 'checkbox') input.checked = !!val;
      else input.value = val ?? '';
    });
  },

  // Basic client-side validation
  validate(container, rules = {}) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    const errors = {};
    Object.entries(rules).forEach(([name, rule]) => {
      const input = el?.querySelector(`[name="${name}"]`);
      const val = input?.value?.trim() || '';
      if (rule.required && !val) errors[name] = rule.message || 'This field is required.';
      if (rule.minLen && val.length < rule.minLen) errors[name] = `Minimum ${rule.minLen} characters.`;
      if (rule.pattern && !rule.pattern.test(val)) errors[name] = rule.message || 'Invalid format.';
    });

    // Show/clear errors
    el?.querySelectorAll('.field-error').forEach(e => e.remove());
    el?.querySelectorAll('.input--error').forEach(i => i.classList.remove('input--error'));
    Object.entries(errors).forEach(([name, msg]) => {
      const input = el?.querySelector(`[name="${name}"]`);
      input?.classList.add('input--error');
      input?.insertAdjacentHTML('afterend', `<span class="field-error">${msg}</span>`);
    });

    return { valid: Object.keys(errors).length === 0, errors };
  },

  // Build a <select> options string from array
  buildOptions(items, valueKey, labelKey, selectedVal = '') {
    return items.map(item =>
      `<option value="${item[valueKey]}" ${item[valueKey] === selectedVal ? 'selected' : ''}>
        ${item[labelKey]}
      </option>`
    ).join('');
  }
};

// ── Search / Filter helper ─────────────────────────────────────
export function attachSearch(inputSel, rows, keys, onResult) {
  const input = typeof inputSel === 'string' ? document.querySelector(inputSel) : inputSel;
  if (!input) return;
  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    const filtered = !q ? rows : rows.filter(row =>
      keys.some(k => String(row[k] ?? '').toLowerCase().includes(q))
    );
    onResult(filtered);
  });
}

// ── CSS for UI primitives (injected once) ─────────────────────
export function injectUIStyles() {
  if (document.getElementById('ui-primitives-style')) return;
  const style = document.createElement('style');
  style.id = 'ui-primitives-style';
  style.textContent = `
/* ── Modal ── */
.modal-backdrop {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
  box-sizing: border-box;
  opacity: 0; pointer-events: none;
  transition: opacity 0.2s;
}
.modal-backdrop.modal--open { opacity: 1; pointer-events: auto; }
.modal-box {
  background: var(--surface);
  border: 1px solid var(--border2);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-lg);
  width: 100%;
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  transform: translateY(12px) scale(0.98);
  transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1);
}
.modal-backdrop.modal--open .modal-box { transform: translateY(0) scale(1); }
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.modal-title { font-family: var(--font-display); font-size: 15px; font-weight: 700; color: var(--t1); }
.modal-close {
  width: 30px; height: 30px; border-radius: 7px;
  display: flex; align-items: center; justify-content: center;
  color: var(--t3); transition: background 0.15s, color 0.15s;
}
.modal-close:hover { background: var(--surface2); color: var(--t1); }
.modal-body {
  padding: 20px 24px;
  flex: 1 1 0%;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}
.modal-body::-webkit-scrollbar { width: 5px; }
.modal-body::-webkit-scrollbar-track { background: transparent; }
.modal-body::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 10px; }
.modal-footer {
  display: flex; gap: 8px; justify-content: flex-end;
  padding: 14px 24px;
  border-top: 1px solid var(--border);
  background: var(--surface2);
  flex-shrink: 0;
}

/* ── Modal Buttons ── */
.modal-btn {
  padding: 9px 18px; border-radius: var(--r-sm); font-size: 13px;
  font-weight: 600; font-family: var(--font-body);
  transition: opacity 0.15s, transform 0.15s;
}
.modal-btn:hover { opacity: 0.88; transform: translateY(-1px); }
.modal-btn--primary { background: var(--blue); color: #fff; }
.modal-btn--danger  { background: var(--red);  color: #fff; }
.modal-btn--ghost   {
  background: var(--surface3); color: var(--t2);
  border: 1px solid var(--border2);
}
.modal-btn--ghost:hover { color: var(--t1); }

/* ── Form Inputs ── */
.form-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.form-group:last-child { margin-bottom: 0; }
.form-label { font-size: 12.5px; font-weight: 600; color: var(--t2); }
.form-label .req { color: var(--red); margin-left: 3px; }
.form-input, .form-select, .form-textarea {
  width: 100%;
  background: var(--surface2);
  border: 1px solid var(--border2);
  border-radius: var(--r-sm);
  color: var(--t1);
  font-family: var(--font-body);
  font-size: 13.5px;
  padding: 9px 12px;
  transition: border-color 0.15s, box-shadow 0.15s;
  outline: none;
}
.form-input:focus, .form-select:focus, .form-textarea:focus {
  border-color: var(--blue);
  box-shadow: 0 0 0 3px rgba(79,133,247,0.15);
}
.form-input.input--error { border-color: var(--red); }
.form-select { appearance: none; cursor: pointer; }
.form-input::placeholder { color: var(--t3); }
.field-error { font-size: 11.5px; color: var(--red); margin-top: 3px; }
.form-row { display: grid; gap: 14px; }
.form-row.cols-2 { grid-template-columns: 1fr 1fr; }
.form-hint { font-size: 11.5px; color: var(--t3); margin-top: 3px; }

/* ── Data Table ── */
.table-wrap { overflow-x: auto; border-radius: var(--r-lg); border: 1px solid var(--border); }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table thead tr {
  background: var(--surface2);
  border-bottom: 1px solid var(--border2);
}
.data-table th {
  padding: 11px 14px; text-align: left;
  font-size: 11.5px; font-weight: 600; letter-spacing: 0.03em;
  color: var(--t2); white-space: nowrap;
}
.data-table td { padding: 11px 14px; color: var(--t1); border-bottom: 1px solid var(--border); }
.data-table tbody tr:last-child td { border-bottom: none; }
.data-table tbody tr { transition: background 0.12s; }
.data-table tbody tr:hover { background: var(--surface2); }
.tbl-actions { display: flex; gap: 4px; justify-content: flex-end; }
.tbl-action-btn {
  width: 30px; height: 30px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  color: var(--t2); transition: background 0.15s, color 0.15s;
}
.tbl-action-btn:hover { background: var(--surface3); color: var(--t1); }
.tbl-action-btn--danger:hover { background: rgba(239,68,68,0.1); color: var(--red); }
.table-empty {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 48px 24px;
  color: var(--t3); font-size: 13.5px; text-align: center;
  border: 1px solid var(--border); border-radius: var(--r-lg);
}

/* ── Badges ── */
.badge {
  display: inline-flex; align-items: center;
  padding: 3px 9px; border-radius: 20px;
  font-size: 11.5px; font-weight: 600;
}
.badge--blue   { background: var(--blue-dim);   color: var(--blue);  }
.badge--green  { background: var(--green-dim);  color: var(--green); }
.badge--yellow { background: var(--yellow-dim); color: var(--yellow);}
.badge--violet { background: var(--violet-dim); color: var(--violet);}
.badge--cyan   { background: var(--cyan-dim);   color: var(--cyan);  }
.badge--red    { background: rgba(239,68,68,0.1); color: var(--red); }
.badge--grey   { background: var(--surface3);   color: var(--t2);   }

/* ── Module page layout ── */
.module-page { display: flex; flex-direction: column; gap: 20px; }
.module-toolbar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}
.module-toolbar .search-wrap {
  flex: 1; min-width: 180px; max-width: 340px;
  display: flex; align-items: center; gap: 8px;
  background: var(--surface2); border: 1px solid var(--border2);
  border-radius: var(--r-sm); padding: 7px 11px; color: var(--t3);
}
.module-toolbar .search-wrap:focus-within { border-color: var(--blue); }
.module-toolbar .search-input {
  background: none; border: none; outline: none;
  color: var(--t1); font-size: 13px; width: 100%;
}
.module-toolbar .search-input::placeholder { color: var(--t3); }
.add-btn {
  display: flex; align-items: center; gap: 7px;
  padding: 9px 16px; background: var(--blue); color: #fff;
  border-radius: var(--r-sm); font-size: 13px; font-weight: 600;
  transition: opacity 0.15s, transform 0.15s;
}
.add-btn:hover { opacity: 0.88; transform: translateY(-1px); }
.add-btn:active { transform: translateY(0); }
.record-count {
  font-size: 12px; color: var(--t3);
  padding: 0 10px; border-left: 1px solid var(--border2);
}
`;
  document.head.appendChild(style);
}
