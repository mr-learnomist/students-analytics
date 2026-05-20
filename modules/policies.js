// ============================================================
// modules/policies.js — System Policies Module
// Manages enrollment, fee waiver, and discount policies
// per batch / campus / level / global scope
// ============================================================

import { AppState, generateID } from '../utils/state.js';
import { Modal }    from '../utils/ui.js';
import { Toast }    from '../utils/helpers.js';

// ── Helpers ───────────────────────────────────────────────────
function uid() {
  return 'pol_' + Math.random().toString(36).slice(2, 12);
}
function fmt(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
}
function getPolicies() {
  return AppState.get('policies') || [];
}
function savePolicies(list) {
  AppState.set('policies', list);
}

// ── Policy Type Config ────────────────────────────────────────
const POLICY_TYPES = {
  enrollment: {
    label: 'Enrollment Deadline',
    color: 'var(--blue)',
    dim:   'var(--blue-dim)',
    icon:  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>`,
    fields: ['deadlineDate', 'gracedays'],
    desc: 'Set enrollment cutoff date and grace period for late admissions.',
  },
  feeWaiver: {
    label: 'Fee Waiver',
    color: 'var(--green)',
    dim:   'var(--green-dim)',
    icon:  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>`,
    fields: ['waiveType', 'waiveValue'],
    desc: 'Waive full or partial registration fee for qualifying students.',
  },
  discount: {
    label: 'Fee Discount',
    color: 'var(--yellow)',
    dim:   'var(--yellow-dim)',
    icon:  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
              <line x1="7" y1="7" x2="7.01" y2="7"/>
            </svg>`,
    fields: ['discountPercent', 'discountCondition', 'maxAmount'],
    desc: 'Apply percentage or fixed discounts based on conditions.',
  },
  lateFee: {
    label: 'Late Fee',
    color: 'var(--red)',
    dim:   'rgba(239,68,68,0.12)',
    icon:  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>`,
    fields: ['lateFeeAmount', 'lateFeePer', 'lateFeeGrace'],
    desc: 'Charge penalty for late fee submission after due date.',
  },
  enrollmentClose: {
    label: 'Enrollment Close',
    color: 'var(--purple, #7c3aed)',
    dim:   'rgba(124,58,237,0.12)',
    icon:  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
              <line x1="12" y1="14" x2="12" y2="18"/>
              <line x1="10" y1="16" x2="14" y2="16"/>
            </svg>`,
    fields: ['closeDate', 'closeMode'],
    desc: 'Set the date and mode for closing enrollment.',
  },

};

// ── Scope helpers ─────────────────────────────────────────────
function getScopeLabel(policy) {
  const batches  = AppState.get('batches')  || [];
  const campuses = AppState.get('campuses') || [];
  const levels   = AppState.get('levels')   || [];

  if (policy.scope === 'global') return 'All Batches (Global)';

  if (policy.scope === 'campus') {
    // New cascade format: campusIds array
    if (policy.campusIds?.length) {
      const names = policy.campusIds.map(id => {
        const c = campuses.find(x => x.id === id);
        return c ? c.campusName.replace(/\s*campus$/i,'').trim() : '?';
      });
      let label = names.join(', ');
      if (policy.batchIds?.length)  label += ` · ${policy.batchIds.length} batch${policy.batchIds.length>1?'es':''}`;
      else if (policy.levelIds?.length) label += ` · ${policy.levelIds.length} level${policy.levelIds.length>1?'s':''}`;
      return label;
    }
    // Legacy single campusId
    const c = campuses.find(x => x.id === policy.campusId);
    return c ? c.campusName : 'Unknown Campus';
  }
  if (policy.scope === 'level') {
    const l = levels.find(x => x.id === policy.levelId);
    return l ? l.levelName : 'Unknown Level';
  }
  if (policy.scope === 'batch') {
    const b = batches.find(x => x.id === policy.batchId);
    return b ? (b.batchName || b.name) : 'Unknown Batch';
  }
  return '—';
}

function getPolicyDetails(pol) {
  const lines = [];
  if (pol.type === 'enrollment') {
    if (pol.deadlineDate) lines.push(`Deadline: ${fmt(pol.deadlineDate)}`);
    if (pol.gracedays)    lines.push(`Grace: ${pol.gracedays} days`);
  }
  if (pol.type === 'feeWaiver') {
    if (pol.waiveType === 'full')    lines.push('100% Registration Fee Waived');
    if (pol.waiveType === 'partial') lines.push(`Partial Waiver: Rs. ${(pol.waiveValue||0).toLocaleString()}`);
  }
  if (pol.type === 'discount') {
    if (pol.discountPercent) lines.push(`${pol.discountPercent}% Discount`);
    if (pol.maxAmount)       lines.push(`Max: Rs. ${Number(pol.maxAmount).toLocaleString()}`);
    if (pol.discountCondition) lines.push(`Condition: ${pol.discountCondition}`);
  }
  if (pol.type === 'lateFee') {
    if (pol.lateFeeAmount) {
      const p = pol.lateFeePer;
      const perLabel = p === 'once' ? '(One Time)' : p === 'day' ? 'Per Day' : p === 'week' ? 'Per Week' : p === 'month' ? 'Per Month' : 'Per Day';
      lines.push(`Rs. ${Number(pol.lateFeeAmount).toLocaleString()} ${perLabel}`);
    }
    if (pol.lateFeeGrace)  lines.push(`Grace: ${pol.lateFeeGrace} days`);
    if (pol.lateFeeSlabs?.length) lines.push(`${pol.lateFeeSlabs.length} slab${pol.lateFeeSlabs.length > 1 ? 's' : ''}`);
  }
  if (pol.type === 'enrollmentClose') {
    if (pol.closeDate) lines.push(`Close Date: ${fmt(pol.closeDate)}`);
    if (pol.closeMode) lines.push(`Mode: ${pol.closeMode === 'auto' ? 'Auto' : 'Manual'}`);
  }
  return lines.join(' · ') || '—';
}

// ── Main Module ───────────────────────────────────────────────
export const PoliciesModule = {

  _el:       null,
  _editing:  null,  // policy id being edited, or null for new
  _filter:   'all',

  mount(el) {
    if (!el) return;
    this._el = el;
    this._activeTab = 'policies';
    this._render();
    this._wireEvents();
  },

  // ── Top-level render ────────────────────────────────────────
  _render() {
    const el = this._el;
    el.innerHTML = `
      <div class="pol-root">
        ${this._renderStyles()}

        <!-- Policies -->
        <div id="polTabPolicies">
          <div class="pol-filters" id="polFilters">
            <button class="pol-pill active" data-filter="all">All</button>
            <button class="pol-pill" data-filter="enrollment">Enrollment</button>
            <button class="pol-pill" data-filter="feeWaiver">Fee Waiver</button>
            <button class="pol-pill" data-filter="discount">Discount</button>
            <button class="pol-pill" data-filter="lateFee">Late Fee</button>
            <button class="pol-pill" data-filter="enrollmentClose">Enrollment Close</button>
          </div>
          <div class="pol-list" id="polList"></div>
          <div class="pol-overlay" id="polOverlay" style="display:none">
            <div class="pol-modal" id="polModal"></div>
          </div>
        </div>

      </div>
    `;

    this._renderList();
  },

  // ── Policy list ─────────────────────────────────────────────
  _renderList() {
    const listEl = this._el.querySelector('#polList');

    // Enrollment Close filter — show enrolmentRules hierarchy
    if (this._filter === 'enrollmentClose') {
      listEl.innerHTML = '<div id="polEcContainer"></div>';
      this.mountEnrollmentClose(listEl.querySelector('#polEcContainer'));
      return;
    }

    // Late Fee filter — dedicated inline section
    if (this._filter === 'lateFee') {
      this._renderLateFeeSection(listEl);
      return;
    }

    let policies = getPolicies();

    if (this._filter !== 'all') {
      policies = policies.filter(p => p.type === this._filter);
    }

    if (!policies.length) {
      listEl.innerHTML = `
        <div class="pol-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".3">
            <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
          <div>No policies found. Click <strong>New Policy</strong> to create one.</div>
        </div>`;
      return;
    }

    listEl.innerHTML = policies.map(pol => {
      const cfg    = POLICY_TYPES[pol.type] || {};
      const scope  = getScopeLabel(pol);
      const detail = getPolicyDetails(pol);
      const active = pol.active !== false;

      return `
        <div class="pol-card fade-up" data-id="${pol.id}">
          <div class="pol-card-left">
            <div class="pol-type-badge" style="background:${cfg.dim};color:${cfg.color}">
              ${cfg.icon} ${cfg.label}
            </div>
            <div class="pol-card-name">${pol.name || 'Untitled Policy'}</div>
            <div class="pol-card-detail">${detail}</div>
          </div>
          <div class="pol-card-meta">
            <div class="pol-scope-chip">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              ${scope}
            </div>
            ${pol.notes ? `<div class="pol-notes">${pol.notes}</div>` : ''}
          </div>
          <div class="pol-card-actions">
            <label class="pol-toggle" title="${active ? 'Active — click to disable' : 'Inactive — click to enable'}">
              <input type="checkbox" class="pol-toggle-chk" data-id="${pol.id}" ${active ? 'checked' : ''}>
              <span class="pol-toggle-track"><span class="pol-toggle-thumb"></span></span>
            </label>
            <button class="pol-btn-icon pol-edit" data-id="${pol.id}" title="Edit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="pol-btn-icon pol-del" data-id="${pol.id}" title="Delete">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
            </button>
          </div>
        </div>`;
    }).join('');
  },

  // ── Dedicated Late Fee Section ──────────────────────────────
  _renderLateFeeSection(listEl) {
    const policies = getPolicies().filter(p => p.type === 'lateFee');
    const cfg      = POLICY_TYPES.lateFee;

    const renderCards = () => policies.map(pol => {
      const active = pol.active !== false;
      const detail = getPolicyDetails(pol);
      const scope  = getScopeLabel(pol);
      const slabs  = pol.lateFeeSlabs || [];
      const slabHTML = slabs.length ? `
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px">
          <thead>
            <tr style="background:rgba(239,68,68,0.08)">
              <th style="padding:5px 10px;text-align:left;color:var(--t2);font-weight:600;border:1px solid var(--border)">From Day</th>
              <th style="padding:5px 10px;text-align:left;color:var(--t2);font-weight:600;border:1px solid var(--border)">To Day</th>
              <th style="padding:5px 10px;text-align:left;color:var(--t2);font-weight:600;border:1px solid var(--border)">Late Fee (Rs.)</th>
            </tr>
          </thead>
          <tbody>
            ${slabs.map(s => `
              <tr>
                <td style="padding:5px 10px;border:1px solid var(--border);color:var(--t1)">${s.fromDay}</td>
                <td style="padding:5px 10px;border:1px solid var(--border);color:var(--t1)">${s.toDay === null ? '∞' : s.toDay}</td>
                <td style="padding:5px 10px;border:1px solid var(--border);color:var(--red);font-weight:600">Rs. ${Number(s.fee).toLocaleString()}</td>
              </tr>`).join('')}
          </tbody>
        </table>` : '';
      return `
        <div class="pol-card fade-up" data-id="${pol.id}">
          <div class="pol-card-left" style="flex:1">
            <div class="pol-type-badge" style="background:${cfg.dim};color:${cfg.color}">${cfg.icon} ${cfg.label}</div>
            <div class="pol-card-name">${pol.name || 'Untitled Policy'}</div>
            <div class="pol-card-detail">${detail}</div>
            ${slabHTML}
          </div>
          <div class="pol-card-meta">
            <div class="pol-scope-chip">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              ${scope}
            </div>
            ${pol.notes ? `<div class="pol-notes">${pol.notes}</div>` : ''}
          </div>
          <div class="pol-card-actions">
            <label class="pol-toggle" title="${active ? 'Active — click to disable' : 'Inactive — click to enable'}">
              <input type="checkbox" class="pol-toggle-chk" data-id="${pol.id}" ${active ? 'checked' : ''}>
              <span class="pol-toggle-track"><span class="pol-toggle-thumb"></span></span>
            </label>
            <button class="pol-btn-icon pol-edit" data-id="${pol.id}" title="Edit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="pol-btn-icon pol-del" data-id="${pol.id}" title="Delete">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
            </button>
          </div>
        </div>`;
    }).join('');

    listEl.innerHTML = `
      <div style="margin-bottom:10px">

        <!-- Add Late Fee Button -->
        <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
          <button class="pol-add-btn" id="lfAddBtn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Late Fee
          </button>
        </div>

        <!-- Inline Add/Edit Form (hidden by default) -->
        <div id="lfFormWrap" style="display:none;margin-bottom:20px;border-radius:10px;overflow:hidden;border:0.5px solid var(--border);box-shadow:0 4px 16px rgba(0,0,0,0.08)">

          <!-- Form Header -->
          <div style="background:#2563eb;padding:13px 20px;display:flex;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:9px;color:#fff;font-size:14px;font-weight:500">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <span id="lfFormTitle">Add Late Fee Policy</span>
            </div>
            <button id="lfFormClose" style="background:rgba(255,255,255,0.18);border:none;cursor:pointer;color:#fff;padding:5px 7px;border-radius:6px;display:flex;align-items:center;line-height:1">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <!-- Section: Basic Info -->
          <div style="padding:14px 20px;border-bottom:0.5px solid var(--border)">
            <div style="font-size:10.5px;font-weight:500;color:#2563eb;text-transform:uppercase;letter-spacing:0.08em;display:flex;align-items:center;gap:5px;margin-bottom:12px">
              <span style="width:7px;height:7px;background:#2563eb;border-radius:50%;display:inline-block;flex-shrink:0"></span>
              Basic Information
            </div>
            <div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">
              <div style="display:flex;flex-direction:column;gap:4px;flex:2;min-width:180px">
                <label style="font-size:12px;color:var(--t2);font-weight:500">Policy Name <span style="color:#e24b4a">*</span></label>
                <input class="pol-input" id="lfName" type="text" placeholder="e.g. Challan Late Fee 2026">
              </div>
              <div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:120px;max-width:220px">
                <label style="font-size:12px;color:var(--t2);font-weight:500">Apply To <span style="color:#e24b4a">*</span></label>
                <div style="display:flex;gap:8px">
                  <label id="lfScopeGlobalLabel" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 12px;border:0.5px solid var(--border);border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;background:var(--surface2);color:var(--t2);transition:all 0.15s;user-select:none">
                    <input type="radio" name="lfScopeType" value="global" id="lfScopeGlobalRadio" checked style="display:none">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                    Global
                  </label>
                  <label id="lfScopeCampusLabel" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 12px;border:0.5px solid var(--border);border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;background:var(--surface2);color:var(--t2);transition:all 0.15s;user-select:none">
                    <input type="radio" name="lfScopeType" value="campus" id="lfScopeCampusRadio" style="display:none">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                    Campus
                  </label>
                </div>
              </div>
            </div>
            <div style="font-size:11.5px;color:var(--t3);margin-top:6px" id="lfScopeHint">Global scope applies this policy to all batches across all campuses.</div>
          </div>

          <!-- Section: Scope Cascade -->
          <div id="lfCampusStep" style="display:none;padding:14px 20px;border-bottom:0.5px solid var(--border)">
            <div style="font-size:10.5px;font-weight:500;color:#2563eb;text-transform:uppercase;letter-spacing:0.08em;display:flex;align-items:center;gap:5px;margin-bottom:10px">
              <span style="width:7px;height:7px;background:#2563eb;border-radius:50%;display:inline-block;flex-shrink:0"></span>
              Scope
            </div>
            <p style="font-size:11.5px;color:var(--t3);margin-bottom:10px">Select campus(es), then narrow down by discipline, level, and batch.</p>

            <!-- Cascade row — same structure as HTML reference -->
            <div style="display:flex;gap:0;align-items:stretch;border:0.5px solid var(--border);border-radius:8px;overflow:visible;position:relative;flex-wrap:nowrap">

              <!-- Campus cell -->
              <div style="flex:1;min-width:0;position:relative">
                <span style="font-size:10px;font-weight:500;color:var(--t3);padding:0 12px;margin-top:6px;display:block;text-transform:uppercase;letter-spacing:0.06em">Campus</span>
                <div class="lf-searchable-dd" id="lfCampusDd">
                  <div class="lf-dd-trigger" id="lfCampusTrigger" style="width:100%;padding:7px 10px 7px 12px;display:flex;align-items:center;justify-content:space-between;gap:6px;background:var(--surface2);cursor:pointer;font-size:12.5px;color:var(--t2);border:none;text-align:left;min-height:36px;border-radius:0 0 0 8px">
                    <span class="lf-dd-placeholder" id="lfCampusPlaceholder" style="color:var(--t3)">Select campus(es)…</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0;opacity:0.5"><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                  <div class="lf-dd-panel" id="lfCampusPanel" style="display:none;position:absolute;top:calc(100% + 5px);left:0;min-width:200px;max-width:280px;background:var(--surface);border:0.5px solid var(--border);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.1);z-index:999">
                    <div style="display:flex;align-items:center;gap:7px;padding:8px 12px;border-bottom:0.5px solid var(--border)">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.4;flex-shrink:0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <input class="lf-dd-search" id="lfCampusSearch" placeholder="Search campus…" autocomplete="off" style="border:none;background:transparent;outline:none;font-size:12.5px;color:var(--t1);flex:1;width:100%">
                    </div>
                    <div class="lf-dd-options" id="lfCampusOptions" style="max-height:180px;overflow-y:auto"></div>
                  </div>
                </div>
              </div>

              <!-- Discipline cell -->
              <div id="lfDiscStep" style="display:none;flex:1;min-width:0;position:relative;border-left:0.5px solid var(--border)">
                <span style="font-size:10px;font-weight:500;color:var(--t3);padding:0 12px;margin-top:6px;display:block;text-transform:uppercase;letter-spacing:0.06em">Discipline</span>
                <div class="lf-searchable-dd" id="lfDiscDd">
                  <div class="lf-dd-trigger" id="lfDiscTrigger" style="width:100%;padding:7px 10px 7px 12px;display:flex;align-items:center;justify-content:space-between;gap:6px;background:var(--surface2);cursor:pointer;font-size:12.5px;color:var(--t2);border:none;text-align:left;min-height:36px">
                    <span class="lf-dd-placeholder" id="lfDiscPlaceholder" style="color:var(--t3)">Select discipline(s)…</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0;opacity:0.5"><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                  <div class="lf-dd-panel" id="lfDiscPanel" style="display:none;position:absolute;top:calc(100% + 5px);left:0;min-width:200px;max-width:280px;background:var(--surface);border:0.5px solid var(--border);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.1);z-index:999">
                    <div style="display:flex;align-items:center;gap:7px;padding:8px 12px;border-bottom:0.5px solid var(--border)">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.4;flex-shrink:0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <input class="lf-dd-search" id="lfDiscSearch" placeholder="Search discipline…" autocomplete="off" style="border:none;background:transparent;outline:none;font-size:12.5px;color:var(--t1);flex:1;width:100%">
                    </div>
                    <div class="lf-dd-options" id="lfDiscOptions" style="max-height:180px;overflow-y:auto"></div>
                  </div>
                </div>
              </div>

              <!-- Level cell -->
              <div id="lfLevelStep" style="display:none;flex:1;min-width:0;position:relative;border-left:0.5px solid var(--border)">
                <span style="font-size:10px;font-weight:500;color:var(--t3);padding:0 12px;margin-top:6px;display:block;text-transform:uppercase;letter-spacing:0.06em">Level</span>
                <div class="lf-searchable-dd" id="lfLevelDd">
                  <div class="lf-dd-trigger" id="lfLevelTrigger" style="width:100%;padding:7px 10px 7px 12px;display:flex;align-items:center;justify-content:space-between;gap:6px;background:var(--surface2);cursor:pointer;font-size:12.5px;color:var(--t2);border:none;text-align:left;min-height:36px">
                    <span class="lf-dd-placeholder" id="lfLevelPlaceholder" style="color:var(--t3)">Select level(s)…</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0;opacity:0.5"><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                  <div class="lf-dd-panel" id="lfLevelPanel" style="display:none;position:absolute;top:calc(100% + 5px);left:0;min-width:200px;max-width:280px;background:var(--surface);border:0.5px solid var(--border);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.1);z-index:999">
                    <div style="display:flex;align-items:center;gap:7px;padding:8px 12px;border-bottom:0.5px solid var(--border)">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.4;flex-shrink:0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <input class="lf-dd-search" id="lfLevelSearch" placeholder="Search level…" autocomplete="off" style="border:none;background:transparent;outline:none;font-size:12.5px;color:var(--t1);flex:1;width:100%">
                    </div>
                    <div class="lf-dd-options" id="lfLevelOptions" style="max-height:180px;overflow-y:auto"></div>
                  </div>
                </div>
              </div>

              <!-- Batch cell -->
              <div id="lfBatchStep" style="display:none;flex:1;min-width:0;position:relative;border-left:0.5px solid var(--border)">
                <span style="font-size:10px;font-weight:500;color:var(--t3);padding:0 12px;margin-top:6px;display:block;text-transform:uppercase;letter-spacing:0.06em">Batch</span>
                <div class="lf-searchable-dd" id="lfBatchDd">
                  <div class="lf-dd-trigger" id="lfBatchTrigger" style="width:100%;padding:7px 10px 7px 12px;display:flex;align-items:center;justify-content:space-between;gap:6px;background:var(--surface2);cursor:pointer;font-size:12.5px;color:var(--t2);border:none;text-align:left;min-height:36px;border-radius:0 0 8px 0">
                    <span class="lf-dd-placeholder" id="lfBatchPlaceholder" style="color:var(--t3)">Select batch(es)…</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0;opacity:0.5"><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                  <div class="lf-dd-panel" id="lfBatchPanel" style="display:none;position:absolute;top:calc(100% + 5px);left:0;min-width:200px;max-width:280px;background:var(--surface);border:0.5px solid var(--border);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.1);z-index:999">
                    <div style="display:flex;align-items:center;gap:7px;padding:8px 12px;border-bottom:0.5px solid var(--border)">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.4;flex-shrink:0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <input class="lf-dd-search" id="lfBatchSearch" placeholder="Search batch…" autocomplete="off" style="border:none;background:transparent;outline:none;font-size:12.5px;color:var(--t1);flex:1;width:100%">
                    </div>
                    <div class="lf-dd-options" id="lfBatchOptions" style="max-height:180px;overflow-y:auto"></div>
                  </div>
                </div>
              </div>

            </div>
          </div>

          <!-- Section: Fee Configuration -->
          <div style="padding:14px 20px;border-bottom:0.5px solid var(--border)">
            <div style="font-size:10.5px;font-weight:500;color:#2563eb;text-transform:uppercase;letter-spacing:0.08em;display:flex;align-items:center;gap:5px;margin-bottom:12px">
              <span style="width:7px;height:7px;background:#2563eb;border-radius:50%;display:inline-block;flex-shrink:0"></span>
              Fee Configuration
            </div>
            <div style="display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap">

              <!-- Amount + Currency -->
              <div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:140px">
                <label style="font-size:12px;color:var(--t2);font-weight:500">Late Fee Amount <span style="color:#e24b4a">*</span></label>
                <div style="display:flex;align-items:stretch;border:0.5px solid var(--border);border-radius:6px;overflow:hidden;background:var(--surface2)">
                  <select id="lfCurrency" style="border:none;background:transparent;padding:7px 8px 7px 10px;font-size:12.5px;font-weight:500;color:var(--t2);cursor:pointer;outline:none;border-right:0.5px solid var(--border)">
                    <option value="PKR">PKR</option>
                    <option value="USD">USD</option>
                    <option value="AED">AED</option>
                    <option value="SAR">SAR</option>
                    <option value="GBP">GBP</option>
                    <option value="EUR">EUR</option>
                  </select>
                  <input type="number" id="lfAmount" min="0" placeholder="500" style="border:none;background:transparent;padding:7px 11px;font-size:13px;color:var(--t1);outline:none;width:100px;flex:1">
                </div>
              </div>

              <!-- Charge Type -->
              <div style="display:flex;flex-direction:column;gap:4px;flex:2;min-width:220px">
                <label style="font-size:12px;color:var(--t2);font-weight:500">Charge Type <span style="color:#e24b4a">*</span></label>
                <div style="display:flex;align-items:center;gap:14px;padding-top:6px;flex-wrap:wrap">
                  <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--t1)">
                    <input type="radio" name="lfPerRadio" value="once" id="lfRadioOnce" checked style="accent-color:#2563eb;width:14px;height:14px;cursor:pointer"> One Time
                  </label>
                  <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--t1)">
                    <input type="radio" name="lfPerRadio" value="day" id="lfRadioDay" style="accent-color:#2563eb;width:14px;height:14px;cursor:pointer"> Per Day
                  </label>
                  <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--t1)">
                    <input type="radio" name="lfPerRadio" value="week" style="accent-color:#2563eb;width:14px;height:14px;cursor:pointer"> Per Week
                  </label>
                  <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--t1)">
                    <input type="radio" name="lfPerRadio" value="month" style="accent-color:#2563eb;width:14px;height:14px;cursor:pointer"> Per Month
                  </label>
                </div>
              </div>

              <!-- Grace Period -->
              <div style="display:flex;flex-direction:column;gap:4px;min-width:110px">
                <label style="font-size:12px;color:var(--t2);font-weight:500">Grace Period</label>
                <div style="position:relative;display:inline-flex;align-items:center">
                  <input type="number" class="pol-input" id="lfGrace" min="0" placeholder="0" style="padding-right:40px;width:110px">
                  <span style="position:absolute;right:10px;font-size:11.5px;color:var(--t3);pointer-events:none;font-weight:500">Days</span>
                </div>
              </div>

            </div>
          </div>

          <!-- Section: Slab Table -->
          <div style="padding:14px 20px;border-bottom:0.5px solid var(--border)">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
              <div>
                <div style="font-size:10.5px;font-weight:500;color:#2563eb;text-transform:uppercase;letter-spacing:0.08em;display:flex;align-items:center;gap:5px;margin-bottom:2px">
                  <span style="width:7px;height:7px;background:#2563eb;border-radius:50%;display:inline-block;flex-shrink:0"></span>
                  Challan Submission Late Fee (Slab-wise)
                </div>
                <p style="font-size:11.5px;color:var(--t3)">Define day-range slabs with corresponding penalty amounts</p>
              </div>
              <button type="button" id="lfSlabAdd" style="display:flex;align-items:center;gap:5px;padding:6px 14px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:12.5px;font-weight:500;cursor:pointer">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Row
              </button>
            </div>
            <div style="border:0.5px solid var(--border);border-radius:6px;overflow:hidden">
              <table style="width:100%;border-collapse:collapse;font-size:12.5px">
                <thead>
                  <tr style="background:var(--surface2)">
                    <th style="padding:7px 12px;text-align:left;font-weight:500;color:var(--t2);font-size:11.5px;border-bottom:0.5px solid var(--border);width:36px">#</th>
                    <th style="padding:7px 12px;text-align:left;font-weight:500;color:var(--t2);font-size:11.5px;border-bottom:0.5px solid var(--border)">From Day</th>
                    <th style="padding:7px 12px;text-align:left;font-weight:500;color:var(--t2);font-size:11.5px;border-bottom:0.5px solid var(--border)">To Day <span style="font-weight:400;color:var(--t3);font-size:10.5px">(blank = ∞)</span></th>
                    <th style="padding:7px 12px;text-align:left;font-weight:500;color:var(--t2);font-size:11.5px;border-bottom:0.5px solid var(--border)">Late Fee</th>
                    <th style="padding:7px 12px;text-align:center;font-weight:500;color:var(--t2);font-size:11.5px;border-bottom:0.5px solid var(--border);width:36px"></th>
                  </tr>
                </thead>
                <tbody id="lfSlabBody">
                  <tr id="lfSlabEmpty">
                    <td colspan="5" style="text-align:center;padding:24px 12px;color:var(--t3);font-size:12.5px">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.25;display:block;margin:0 auto 6px"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                      No slabs yet — click <strong>Add Row</strong> to define ranges
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p style="font-size:11.5px;color:var(--t3);margin-top:7px;display:flex;align-items:center;gap:5px">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Example: Days 1–5 → Rs. 200 &nbsp;·&nbsp; Days 6–10 → Rs. 500 &nbsp;·&nbsp; Days 11+ → Rs. 1000
            </p>
          </div>

          <!-- Section: Notes -->
          <div style="padding:14px 20px">
            <div style="font-size:10.5px;font-weight:500;color:#2563eb;text-transform:uppercase;letter-spacing:0.08em;display:flex;align-items:center;gap:5px;margin-bottom:10px">
              <span style="width:7px;height:7px;background:#2563eb;border-radius:50%;display:inline-block;flex-shrink:0"></span>
              Notes
            </div>
            <textarea class="pol-input pol-textarea" id="lfNotes" placeholder="Optional — add any extra conditions or notes…" style="min-height:64px;width:100%;resize:vertical"></textarea>
          </div>

          <!-- Form Footer -->
          <div style="background:var(--surface2);border-top:0.5px solid var(--border);padding:11px 20px;display:flex;align-items:center;justify-content:flex-end;gap:10px">
            <button class="pol-btn-ghost" id="lfCancelBtn">Cancel</button>
            <button class="pol-btn-primary" id="lfSaveBtn" style="display:flex;align-items:center;gap:6px">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
              Save Policy
            </button>
          </div>
        </div>

        <!-- Existing Late Fee Cards -->
        <div id="lfCards">${renderCards()}</div>
        ${!policies.length ? `<div class="pol-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".3">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <div>No late fee policies yet. Click <strong>Add Late Fee</strong> to create one.</div>
        </div>` : ''}
      </div>`;

    // ── Wire Late Fee Section Events ──
    const wrap      = listEl;
    const formWrap  = wrap.querySelector('#lfFormWrap');
    const slabBody  = wrap.querySelector('#lfSlabBody');
    let   lfEditing = null;

    // ── Cascade Dropdown State ──
    let lfSelectedCampusIds = [];
    let lfSelectedDiscIds   = [];
    let lfSelectedLevelIds  = [];
    let lfSelectedBatchIds  = [];

    // ── Searchable Multi-Select Dropdown Helper ──
    const buildSearchableDd = (cfg) => {
      // cfg: { triggerId, panelId, searchId, optionsId, placeholderId, items, selectedIds, onSelChange }
      const trigger     = wrap.querySelector(`#${cfg.triggerId}`);
      const panel       = wrap.querySelector(`#${cfg.panelId}`);
      const searchInput = wrap.querySelector(`#${cfg.searchId}`);
      const optionsEl   = wrap.querySelector(`#${cfg.optionsId}`);
      if (!trigger || !panel || !optionsEl) return;

      let selected = [...cfg.selectedIds];

      // ── Render selected as colored tags inside trigger ──
      const updateTrigger = () => {
        const freshTrig = wrap.querySelector(`#${cfg.triggerId}`);
        if (!freshTrig) return;
        // Remove old tags
        freshTrig.querySelectorAll('.lf-sel-tag').forEach(t => t.remove());
        const phEl = freshTrig.querySelector('.lf-dd-placeholder');
        const chevron = freshTrig.querySelector('svg');

        if (!selected.length) {
          if (phEl) { phEl.textContent = cfg.placeholderText || 'Select…'; phEl.style.display = ''; }
        } else {
          if (phEl) phEl.style.display = 'none';
          selected.forEach(id => {
            const item = cfg.items.find(i => i.id === id);
            if (!item) return;
            const tag = document.createElement('span');
            tag.className = 'lf-sel-tag';
            // Short label: first word before dash or space
            const shortLabel = item.label.split('—')[0].trim().split(' ')[0];
            tag.textContent = shortLabel;
            tag.style.cssText = [
              'display:inline-flex', 'align-items:center',
              'padding:2px 7px', 'border-radius:20px',
              'font-size:11px', 'font-weight:600',
              'background:rgba(79,133,247,0.15)', 'color:#4f85f7',
              'white-space:nowrap', 'max-width:90px',
              'overflow:hidden', 'text-overflow:ellipsis', 'flex-shrink:0',
            ].join(';');
            if (chevron) freshTrig.insertBefore(tag, chevron);
            else freshTrig.appendChild(tag);
          });
        }
      };

      const closePanel = () => {
        panel.style.display = 'none';
        if (searchInput) searchInput.value = '';
        renderOptions(''); // reset options filter
      };

      const renderOptions = (filter = '') => {
        const q = filter.toLowerCase();
        const filtered = cfg.items.filter(i => !q || i.label.toLowerCase().includes(q));
        if (!filtered.length) {
          optionsEl.innerHTML = `<div style="padding:10px 14px;font-size:12px;color:var(--t3);text-align:center">${cfg.items.length ? 'No results' : 'No options available'}</div>`;
          return;
        }
        const allChecked = filtered.every(i => selected.includes(i.id));
        optionsEl.innerHTML =
          `<label class="lf-dd-item lf-dd-select-all" data-all="1" style="${allChecked ? 'background:rgba(79,133,247,0.1);color:#4f85f7;font-weight:600' : ''}">
            <span class="lf-dd-chk">${allChecked ? '☑' : '☐'}</span><span>Select All</span>
          </label>` +
          filtered.map(i => {
            const chk = selected.includes(i.id);
            return `<label class="lf-dd-item" data-id="${i.id}" style="${chk ? 'background:rgba(79,133,247,0.1);color:#4f85f7;font-weight:600' : ''}">
              <span class="lf-dd-chk">${chk ? '☑' : '☐'}</span><span>${i.label}</span>
            </label>`;
          }).join('');

        // Use mousedown so it fires before blur/outside-click
        optionsEl.querySelectorAll('.lf-dd-item').forEach(item => {
          item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (item.dataset.all) {
              const allIds = filtered.map(i => i.id);
              const nowAll = filtered.every(i => selected.includes(i.id));
              if (nowAll) selected = selected.filter(id => !allIds.includes(id));
              else        allIds.forEach(id => { if (!selected.includes(id)) selected.push(id); });
            } else {
              const id = item.dataset.id;
              if (selected.includes(id)) selected = selected.filter(x => x !== id);
              else                       selected.push(id);
            }
            updateTrigger();
            renderOptions(searchInput?.value || '');
            cfg.onSelChange(selected);
          });
        });
      };

      // Clone trigger to remove stale listeners from previous rebuilds
      const newTrigger = trigger.cloneNode(true);
      trigger.parentNode.replaceChild(newTrigger, trigger);

      const freshTrigger = wrap.querySelector(`#${cfg.triggerId}`);
      freshTrigger?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = panel.style.display !== 'none';
        // Close ALL other lf-dd-panels on the document
        document.querySelectorAll('.lf-dd-panel').forEach(p => {
          if (p !== panel) p.style.display = 'none';
        });
        if (isOpen) {
          closePanel();
        } else {
          renderOptions(searchInput?.value || '');
          panel.style.display = 'block';
          searchInput?.focus();
        }
      });

      searchInput?.addEventListener('input', () => renderOptions(searchInput.value));
      searchInput?.addEventListener('click', e => e.stopPropagation());

      // Outside click: close if click is outside both trigger AND panel
      const ddWrap = freshTrigger?.closest('.lf-searchable-dd') || freshTrigger?.parentElement;
      const outsideHandler = (e) => {
        if (panel.style.display === 'none') return;
        if (ddWrap && ddWrap.contains(e.target)) return;
        if (panel.contains(e.target)) return;
        closePanel();
      };
      if (panel._outsideHandler) document.removeEventListener('click', panel._outsideHandler);
      panel._outsideHandler = outsideHandler;
      document.addEventListener('click', outsideHandler);

      // Init display
      updateTrigger();

      return {
        setSelected: (ids) => { selected = [...ids]; updateTrigger(); },
        getSelected: () => selected,
      };
    };

    // ── Scope Radio Toggle ──
    const lfScopeGlobalLabel = wrap.querySelector('#lfScopeGlobalLabel');
    const lfScopeCampusLabel = wrap.querySelector('#lfScopeCampusLabel');
    const lfScopeHint        = wrap.querySelector('#lfScopeHint');

    const updateScopeRadioStyles = (val) => {
      const activeStyle   = 'flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 12px;border:0.5px solid #2563eb;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;background:#eff6ff;color:#2563eb;transition:all 0.15s;user-select:none';
      const inactiveStyle = 'flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 12px;border:0.5px solid var(--border);border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;background:var(--surface2);color:var(--t2);transition:all 0.15s;user-select:none';
      if (lfScopeGlobalLabel) lfScopeGlobalLabel.style.cssText = val === 'global' ? activeStyle : inactiveStyle;
      if (lfScopeCampusLabel) lfScopeCampusLabel.style.cssText = val === 'campus' ? activeStyle : inactiveStyle;
      if (lfScopeHint) lfScopeHint.textContent = val === 'global'
        ? 'Global scope applies this policy to all batches across all campuses.'
        : 'Select campus(es), then narrow down by discipline, level, and batch.';
      wrap.querySelector('#lfCampusStep').style.display = val === 'campus' ? 'block' : 'none';
      // Reset downstream when switching to global
      if (val === 'global') {
        lfSelectedCampusIds = []; lfSelectedDiscIds = []; lfSelectedLevelIds = []; lfSelectedBatchIds = [];
        wrap.querySelector('#lfDiscStep').style.display  = 'none';
        wrap.querySelector('#lfLevelStep').style.display = 'none';
        wrap.querySelector('#lfBatchStep').style.display = 'none';
        if (campusDd)  campusDd.setSelected([]);
        if (discDd)    discDd.setSelected([]);
        if (levelDd)   levelDd.setSelected([]);
        if (batchDd)   batchDd.setSelected([]);
      }
    };

    wrap.querySelectorAll('input[name="lfScopeType"]').forEach(r => {
      r.addEventListener('change', () => updateScopeRadioStyles(r.value));
    });

    // ── Build cascade dropdowns ──
    const allCampuses     = AppState.get('campuses')     || [];
    const allDisciplines  = AppState.get('disciplines')  || [];
    const allLevels       = AppState.get('levels')       || [];
    const allBatches      = AppState.get('batches')      || [];

    // Campus dd
    let campusDd = buildSearchableDd({
      triggerId: 'lfCampusTrigger', panelId: 'lfCampusPanel',
      searchId: 'lfCampusSearch',   optionsId: 'lfCampusOptions',
      placeholderId: 'lfCampusPlaceholder', placeholderText: 'Select campus(es)…',
      items: allCampuses.map(c => ({ id: c.id, label: c.campusName.replace(/\s*campus$/i,'').trim() })),
      selectedIds: [],
      onSelChange: (ids) => {
        lfSelectedCampusIds = ids;
        // Disciplines are NOT campus-specific — always show all disciplines
        const discItems = allDisciplines
          .map(d => ({ id: d.id, label: d.fullName ? `${d.abbreviation} — ${d.fullName}` : (d.disciplineName || d.name || d.id) }));
        lfSelectedDiscIds = []; lfSelectedLevelIds = []; lfSelectedBatchIds = [];
        if (discDd)  discDd.setSelected([]);
        if (levelDd) levelDd.setSelected([]);
        if (batchDd) batchDd.setSelected([]);
        rebuildDiscDd(discItems);
        wrap.querySelector('#lfDiscStep').style.display  = ids.length ? 'block' : 'none';
        wrap.querySelector('#lfLevelStep').style.display = 'none';
        wrap.querySelector('#lfBatchStep').style.display = 'none';
      },
    });

    // Discipline dd (rebuilt dynamically)
    let discDd = null;
    const rebuildDiscDd = (items) => {
      const optEl = wrap.querySelector('#lfDiscOptions');
      if (optEl) optEl.innerHTML = '';
      discDd = buildSearchableDd({
        triggerId: 'lfDiscTrigger', panelId: 'lfDiscPanel',
        searchId: 'lfDiscSearch',   optionsId: 'lfDiscOptions',
        placeholderId: 'lfDiscPlaceholder', placeholderText: 'Select discipline(s)…',
        items,
        selectedIds: lfSelectedDiscIds,
        onSelChange: (ids) => {
          lfSelectedDiscIds = ids;
          // Rebuild level dropdown
          const levelItems = allLevels
            .filter(l => ids.includes(l.disciplineId))
            .map(l => ({ id: l.id, label: l.levelName || l.name || l.id }));
          lfSelectedLevelIds = []; lfSelectedBatchIds = [];
          if (levelDd) levelDd.setSelected([]);
          if (batchDd) batchDd.setSelected([]);
          rebuildLevelDd(levelItems);
          wrap.querySelector('#lfLevelStep').style.display = ids.length ? 'block' : 'none';
          wrap.querySelector('#lfBatchStep').style.display = 'none';
        },
      });
    };
    rebuildDiscDd(allDisciplines.map(d => ({ id: d.id, label: d.fullName ? `${d.abbreviation} — ${d.fullName}` : (d.disciplineName || d.name || d.id) })));

    // Level dd (rebuilt dynamically)
    let levelDd = null;
    const rebuildLevelDd = (items) => {
      const optEl = wrap.querySelector('#lfLevelOptions');
      if (optEl) optEl.innerHTML = '';
      levelDd = buildSearchableDd({
        triggerId: 'lfLevelTrigger', panelId: 'lfLevelPanel',
        searchId: 'lfLevelSearch',   optionsId: 'lfLevelOptions',
        placeholderId: 'lfLevelPlaceholder', placeholderText: 'Select level(s)…',
        items,
        selectedIds: lfSelectedLevelIds,
        onSelChange: (ids) => {
          lfSelectedLevelIds = ids;
          // Rebuild batch dropdown filtered by campus + disc + level
          const batchItems = allBatches.filter(b => {
            const campOk  = !lfSelectedCampusIds.length || lfSelectedCampusIds.includes(b.campusId);
            const discOk  = !lfSelectedDiscIds.length   || lfSelectedDiscIds.includes(b.disciplineId);
            const levelOk = !ids.length                 || ids.includes(b.levelId);
            return campOk && discOk && levelOk;
          }).map(b => ({ id: b.id, label: b.batchName || b.name || b.id }));
          lfSelectedBatchIds = [];
          if (batchDd) batchDd.setSelected([]);
          rebuildBatchDd(batchItems);
          wrap.querySelector('#lfBatchStep').style.display = ids.length ? 'block' : 'none';
        },
      });
    };
    rebuildLevelDd([]);

    // Batch dd (rebuilt dynamically)
    let batchDd = null;
    const rebuildBatchDd = (items) => {
      const optEl = wrap.querySelector('#lfBatchOptions');
      if (optEl) optEl.innerHTML = '';
      batchDd = buildSearchableDd({
        triggerId: 'lfBatchTrigger', panelId: 'lfBatchPanel',
        searchId: 'lfBatchSearch',   optionsId: 'lfBatchOptions',
        placeholderId: 'lfBatchPlaceholder', placeholderText: 'Select batch(es)…',
        items,
        selectedIds: lfSelectedBatchIds,
        onSelChange: (ids) => { lfSelectedBatchIds = ids; },
      });
    };
    rebuildBatchDd([]);

    // ── Radio highlight helper (fee type) — no-op, using native radio styling now ──
    const updateRadioHighlight = () => {};
    wrap.querySelectorAll('input[name="lfPerRadio"]').forEach(r => r.addEventListener('change', updateRadioHighlight));

    // ── showForm (populate form for add/edit) ──
    const showForm = (pol = null) => {
      lfEditing = pol ? pol.id : null;
      wrap.querySelector('#lfFormTitle').textContent = pol ? 'Edit Late Fee Policy' : 'Add Late Fee Policy';
      wrap.querySelector('#lfName').value   = pol?.name          || '';
      wrap.querySelector('#lfAmount').value = pol?.lateFeeAmount || '';
      wrap.querySelector('#lfGrace').value  = pol?.lateFeeGrace  || '';
      wrap.querySelector('#lfNotes').value  = pol?.notes         || '';
      const currSel = wrap.querySelector('#lfCurrency');
      if (currSel) currSel.value = pol?.lateFeeCurrency || 'PKR';

      // Scope radio
      const isGlobal = !pol || pol.scope === 'global';
      const scopeVal = isGlobal ? 'global' : 'campus';
      wrap.querySelector(isGlobal ? '#lfScopeGlobalRadio' : '#lfScopeCampusRadio').checked = true;
      updateScopeRadioStyles(scopeVal);

      if (!isGlobal) {
        // Pre-populate cascade
        lfSelectedCampusIds = pol?.campusIds || (pol?.campusId ? [pol.campusId] : []);
        lfSelectedDiscIds   = pol?.disciplineIds || [];
        lfSelectedLevelIds  = pol?.levelIds  || (pol?.levelId  ? [pol.levelId]  : []);
        lfSelectedBatchIds  = pol?.batchIds  || (pol?.batchId  ? [pol.batchId]  : []);

        if (campusDd) campusDd.setSelected(lfSelectedCampusIds);

        // Rebuild disc items
        const discItems = allDisciplines.map(d => ({ id: d.id, label: d.fullName ? `${d.abbreviation} — ${d.fullName}` : (d.disciplineName || d.name || d.id) }));
        rebuildDiscDd(discItems);
        if (discDd) discDd.setSelected(lfSelectedDiscIds);

        // Rebuild level items
        const levelItems = allLevels
          .filter(l => !lfSelectedDiscIds.length || lfSelectedDiscIds.includes(l.disciplineId))
          .map(l => ({ id: l.id, label: l.levelName || l.name || l.id }));
        rebuildLevelDd(levelItems);
        if (levelDd) levelDd.setSelected(lfSelectedLevelIds);

        // Rebuild batch items
        const batchItems = allBatches.filter(b => {
          const campOk  = !lfSelectedCampusIds.length || lfSelectedCampusIds.includes(b.campusId);
          const discOk  = !lfSelectedDiscIds.length   || lfSelectedDiscIds.includes(b.disciplineId);
          const levelOk = !lfSelectedLevelIds.length  || lfSelectedLevelIds.includes(b.levelId);
          return campOk && discOk && levelOk;
        }).map(b => ({ id: b.id, label: b.batchName || b.name || b.id }));
        rebuildBatchDd(batchItems);
        if (batchDd) batchDd.setSelected(lfSelectedBatchIds);

        wrap.querySelector('#lfCampusStep').style.display = 'block';
        wrap.querySelector('#lfDiscStep').style.display   = lfSelectedCampusIds.length ? 'block' : 'none';
        wrap.querySelector('#lfLevelStep').style.display  = lfSelectedDiscIds.length   ? 'block' : 'none';
        wrap.querySelector('#lfBatchStep').style.display  = lfSelectedLevelIds.length  ? 'block' : 'none';
      }

      // Radio
      const radioVal = pol?.lateFeePer || 'once';
      wrap.querySelectorAll('input[name="lfPerRadio"]').forEach(r => { r.checked = r.value === radioVal; });
      updateRadioHighlight();
      // Slabs
      slabBody.innerHTML = '';
      const slabs = pol?.lateFeeSlabs || [];
      if (slabs.length) slabs.forEach(s => addSlabRow(s));
      else slabBody.innerHTML = emptySlabHTML();
      formWrap.style.display = 'block';
      formWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    const hideForm = () => {
      formWrap.style.display = 'none';
      lfEditing = null;
      // Close any open dropdowns
      wrap.querySelectorAll('.lf-dd-panel').forEach(p => { p.style.display = 'none'; });
    };

    const emptySlabHTML = () => `<tr id="lfSlabEmpty"><td colspan="5" style="text-align:center;padding:30px 16px">
      <div style="display:flex;flex-direction:column;align-items:center;gap:7px">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".2">
          <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
        </svg>
        <span style="font-size:12.5px;color:var(--t3)">No slabs yet — click <strong style="color:var(--t2)">Add Row</strong> to define ranges</span>
      </div>
    </td></tr>`;

    const addSlabRow = (s = {}) => {
      const empty = slabBody.querySelector('#lfSlabEmpty');
      if (empty) empty.remove();
      const rowNum = slabBody.querySelectorAll('[data-slab]').length + 1;
      const tr = document.createElement('tr');
      tr.setAttribute('data-slab', '1');
      tr.style.borderBottom = '1px solid var(--border)';
      tr.innerHTML = `
        <td style="padding:8px 12px;font-size:12px;font-weight:600;color:var(--t3);text-align:center">${rowNum}</td>
        <td style="padding:6px 10px"><input type="number" class="pol-input lf-from" value="${s.fromDay ?? ''}" min="0" placeholder="1" style="width:100%;max-width:90px;text-align:center"></td>
        <td style="padding:6px 10px"><input type="number" class="pol-input lf-to"   value="${s.toDay   ?? ''}" min="0" placeholder="∞" style="width:100%;max-width:90px;text-align:center"></td>
        <td style="padding:6px 10px">
          <div style="position:relative;max-width:140px">
            <span style="position:absolute;left:9px;top:50%;transform:translateY(-50%);font-size:11.5px;font-weight:600;color:var(--t3);pointer-events:none">Rs.</span>
            <input type="number" class="pol-input lf-fee" value="${s.fee ?? ''}" min="0" placeholder="0" style="width:100%;padding-left:30px;font-weight:600">
          </div>
        </td>
        <td style="text-align:center;padding:6px 10px">
          <button type="button" class="pol-btn-icon lf-slab-del" title="Delete" style="color:var(--t3)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </td>`;
      slabBody.appendChild(tr);
      tr.querySelector('.lf-slab-del').addEventListener('click', () => {
        tr.remove();
        if (!slabBody.querySelector('[data-slab]')) slabBody.innerHTML = emptySlabHTML();
        // Re-number
        slabBody.querySelectorAll('[data-slab]').forEach((row, i) => {
          const numCell = row.querySelector('td:first-child');
          if (numCell) numCell.textContent = i + 1;
        });
      });
    };

    const saveLateFee = () => {
      const name   = wrap.querySelector('#lfName').value.trim();
      const isGlobal = wrap.querySelector('#lfScopeGlobalRadio')?.checked;
      const scope  = isGlobal ? 'global' : 'campus';
      const amount = parseFloat(wrap.querySelector('#lfAmount').value) || 0;
      const per    = wrap.querySelector('input[name="lfPerRadio"]:checked')?.value || 'once';
      const grace  = parseInt(wrap.querySelector('#lfGrace').value) || 0;
      const notes  = wrap.querySelector('#lfNotes').value.trim();
      const currency = wrap.querySelector('#lfCurrency')?.value || 'PKR';

      if (!name)   { Toast.error('Policy name is required.');    return; }
      if (!amount) { Toast.error('Late fee amount is required.'); return; }

      if (!isGlobal && !lfSelectedCampusIds.length) {
        Toast.error('Please select at least one campus.'); return;
      }

      const slabRows     = [...slabBody.querySelectorAll('[data-slab]')];
      const lateFeeSlabs = slabRows.map(tr => ({
        fromDay: parseInt(tr.querySelector('.lf-from').value) || 0,
        toDay:   tr.querySelector('.lf-to').value !== '' ? parseInt(tr.querySelector('.lf-to').value) : null,
        fee:     parseFloat(tr.querySelector('.lf-fee').value) || 0,
      }));

      const campusIds    = isGlobal ? [] : [...lfSelectedCampusIds];
      const disciplineIds= isGlobal ? [] : [...lfSelectedDiscIds];
      const levelIds     = isGlobal ? [] : [...lfSelectedLevelIds];
      const batchIds     = isGlobal ? [] : [...lfSelectedBatchIds];

      const pol = {
        id: lfEditing || uid(), type: 'lateFee',
        name, scope, active: true, notes,
        lateFeeAmount: amount, lateFeePer: per, lateFeeGrace: grace, lateFeeSlabs,
        lateFeeCurrency: currency,
        campusIds, disciplineIds, levelIds, batchIds,
        createdAt: lfEditing ? undefined : new Date().toISOString(),
      };

      let list = getPolicies();

      if (lfEditing) {
        // Edit existing
        const ex = list.find(p => p.id === lfEditing);
        pol.active = ex?.active ?? true; pol.createdAt = ex?.createdAt;
        list = list.map(p => p.id === lfEditing ? pol : p);
        Toast.success('Late fee policy updated.');
      } else {
        // Check for duplicate: same scope signature → overwrite, else add new
        const isDuplicate = (a, b) => {
          if (a.scope !== b.scope) return false;
          if (a.scope === 'global') return true;
          const sameC = JSON.stringify([...a.campusIds].sort()) === JSON.stringify([...b.campusIds].sort());
          const sameD = JSON.stringify([...(a.disciplineIds||[])].sort()) === JSON.stringify([...(b.disciplineIds||[])].sort());
          const sameL = JSON.stringify([...(a.levelIds||[])].sort())     === JSON.stringify([...(b.levelIds||[])].sort());
          const sameB = JSON.stringify([...(a.batchIds||[])].sort())     === JSON.stringify([...(b.batchIds||[])].sort());
          return sameC && sameD && sameL && sameB;
        };
        const existingIdx = list.findIndex(p => p.type === 'lateFee' && isDuplicate(p, pol));
        if (existingIdx !== -1) {
          pol.id        = list[existingIdx].id;
          pol.active    = list[existingIdx].active ?? true;
          pol.createdAt = list[existingIdx].createdAt;
          list[existingIdx] = pol;
          Toast.success('Existing policy overwritten with new settings.');
        } else {
          list.push(pol);
          Toast.success('Late fee policy created.');
        }
      }
      savePolicies(list);
      hideForm();
      this._renderLateFeeSection(listEl);
    };

    // Button events
    wrap.querySelector('#lfAddBtn').addEventListener('click', () => showForm());
    wrap.querySelector('#lfFormClose').addEventListener('click', hideForm);
    wrap.querySelector('#lfCancelBtn').addEventListener('click', hideForm);
    wrap.querySelector('#lfSaveBtn').addEventListener('click', saveLateFee);
    wrap.querySelector('#lfSlabAdd').addEventListener('click', () => addSlabRow());

    // Edit / Delete / Toggle on cards (delegated)
    wrap.querySelector('#lfCards').addEventListener('click', e => {
      const editBtn = e.target.closest('.pol-edit');
      const delBtn  = e.target.closest('.pol-del');
      if (editBtn) {
        const pol = getPolicies().find(p => p.id === editBtn.dataset.id);
        if (pol) showForm(pol);
      }
      if (delBtn) {
        if (!confirm('Delete this late fee policy? This cannot be undone.')) return;
        savePolicies(getPolicies().filter(p => p.id !== delBtn.dataset.id));
        Toast.success('Policy deleted.');
        this._renderLateFeeSection(listEl);
      }
    });

    wrap.querySelector('#lfCards').addEventListener('change', e => {
      if (!e.target.classList.contains('pol-toggle-chk')) return;
      const id   = e.target.dataset.id;
      const list = getPolicies().map(p => p.id === id ? { ...p, active: e.target.checked } : p);
      savePolicies(list);
      Toast.info(e.target.checked ? 'Policy activated.' : 'Policy deactivated.');
    });
  },

  // ── Modal form ───────────────────────────────────────────────
  _openModal(id = null) {
    this._editing = id;
    const pol = id ? (getPolicies().find(p => p.id === id) || {}) : {};

    const batches  = AppState.get('batches')  || [];
    const campuses = AppState.get('campuses') || [];
    const levels   = AppState.get('levels')   || [];

    const selOpt = (arr, val, labelFn, valFn) =>
      arr.map(x => `<option value="${valFn(x)}" ${valFn(x)===val?'selected':''}>${labelFn(x)}</option>`).join('');

    const overlay = this._el.querySelector('#polOverlay');
    const modal   = this._el.querySelector('#polModal');

    modal.innerHTML = `
      <div class="pol-modal-hdr">
        <div class="pol-modal-title">${id ? 'Edit Policy' : 'New Policy'}</div>
        <button class="pol-modal-close" id="polModalClose">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="pol-modal-body">

        <!-- Type selector -->
        <div class="pol-field">
          <label class="pol-label">Policy Type <span class="pol-req">*</span></label>
          <div class="pol-type-grid" id="polTypeGrid">
            ${Object.entries(POLICY_TYPES).map(([key, cfg]) => `
              <button type="button" class="pol-type-opt ${pol.type===key?'active':''}" data-type="${key}"
                style="${pol.type===key ? `border-color:${cfg.color};background:${cfg.dim}` : ''}">
                <span style="color:${cfg.color}">${cfg.icon}</span>
                <span>${cfg.label}</span>
              </button>`).join('')}
          </div>
        </div>

        <!-- Policy name -->
        <div class="pol-field">
          <label class="pol-label">Policy Name <span class="pol-req">*</span></label>
          <input class="pol-input" id="polName" placeholder="e.g. ACCA Foundation Enrollment 2026" value="${pol.name||''}">
        </div>

        <!-- Scope -->
        <div class="pol-field">
          <label class="pol-label">Applies To <span class="pol-req">*</span></label>
          <select class="pol-input" id="polScope">
            <option value="global"  ${pol.scope==='global' ?'selected':''}>🌐 Global (all batches)</option>
            <option value="campus"  ${pol.scope==='campus' ?'selected':''}>🏫 Specific Campus</option>
            <option value="level"   ${pol.scope==='level'  ?'selected':''}>📚 Specific Level</option>
            <option value="batch"   ${pol.scope==='batch'  ?'selected':''}>📋 Specific Batch</option>
          </select>
        </div>

        <!-- Scope sub-selects -->
        <div class="pol-field" id="polCampusWrap" style="display:${pol.scope==='campus'?'block':'none'}">
          <label class="pol-label">Campus</label>
          <select class="pol-input" id="polCampus">
            <option value="">— Select Campus —</option>
            ${selOpt(campuses, pol.campusId, c=>c.campusName, c=>c.id)}
          </select>
        </div>
        <div class="pol-field" id="polLevelWrap" style="display:${pol.scope==='level'?'block':'none'}">
          <label class="pol-label">Level</label>
          <select class="pol-input" id="polLevel">
            <option value="">— Select Level —</option>
            ${selOpt(levels, pol.levelId, l=>l.levelName, l=>l.id)}
          </select>
        </div>
        <div class="pol-field" id="polBatchWrap" style="display:${pol.scope==='batch'?'block':'none'}">
          <label class="pol-label">Batch</label>
          <select class="pol-input" id="polBatch">
            <option value="">— Select Batch —</option>
            ${selOpt(batches, pol.batchId, b=>(b.batchName||b.name), b=>b.id)}
          </select>
        </div>

        <!-- Dynamic type-specific fields -->
        <div id="polTypeFields"></div>

        <!-- Notes -->
        <div class="pol-field">
          <label class="pol-label">Notes / Conditions</label>
          <textarea class="pol-input pol-textarea" id="polNotes" placeholder="Optional — add any extra conditions or notes…">${pol.notes||''}</textarea>
        </div>

      </div>
      <div class="pol-modal-footer">
        <button class="pol-btn-ghost" id="polCancelBtn">Cancel</button>
        <button class="pol-btn-primary" id="polSaveBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
          </svg>
          ${id ? 'Save Changes' : 'Create Policy'}
        </button>
      </div>
    `;

    // Render type-specific fields for existing policy
    if (pol.type) this._renderTypeFields(pol.type, pol);

    overlay.style.display = 'flex';
    setTimeout(() => modal.classList.add('open'), 10);
    this._wireModalEvents(pol);
  },

  _renderTypeFields(type, pol = {}) {
    const modal = this._el.querySelector('#polModal');
    const wrap  = modal ? modal.querySelector('#polTypeFields') : this._el.querySelector('#polTypeFields');
    if (!wrap) return;

    if (type === 'enrollment') {
      wrap.innerHTML = `
        <div class="pol-row">
          <div class="pol-field">
            <label class="pol-label">Enrollment Deadline <span class="pol-req">*</span></label>
            <input type="date" class="pol-input" id="polDeadline" value="${pol.deadlineDate||''}">
          </div>
          <div class="pol-field">
            <label class="pol-label">Grace Period (days)</label>
            <input type="number" class="pol-input" id="polGrace" min="0" placeholder="0" value="${pol.gracedays||''}">
          </div>
        </div>`;
    } else if (type === 'feeWaiver') {
      wrap.innerHTML = `
        <div class="pol-field">
          <label class="pol-label">Waiver Type <span class="pol-req">*</span></label>
          <select class="pol-input" id="polWaiveType" onchange="document.getElementById('polWaiveAmtWrap').style.display=this.value==='partial'?'block':'none'">
            <option value="full"    ${pol.waiveType==='full'   ?'selected':''}>Full Waiver (100%)</option>
            <option value="partial" ${pol.waiveType==='partial'?'selected':''}>Partial Waiver (fixed amount)</option>
          </select>
        </div>
        <div class="pol-field" id="polWaiveAmtWrap" style="display:${pol.waiveType==='partial'?'block':'none'}">
          <label class="pol-label">Waiver Amount (Rs.)</label>
          <input type="number" class="pol-input" id="polWaiveVal" min="0" placeholder="0" value="${pol.waiveValue||''}">
        </div>`;
    } else if (type === 'discount') {
      wrap.innerHTML = `
        <div class="pol-row">
          <div class="pol-field">
            <label class="pol-label">Discount % <span class="pol-req">*</span></label>
            <input type="number" class="pol-input" id="polDiscPct" min="0" max="100" placeholder="e.g. 25" value="${pol.discountPercent||''}">
          </div>
          <div class="pol-field">
            <label class="pol-label">Max Discount (Rs.)</label>
            <input type="number" class="pol-input" id="polDiscMax" min="0" placeholder="Optional cap" value="${pol.maxAmount||''}">
          </div>
        </div>
        <div class="pol-field">
          <label class="pol-label">Eligibility Condition</label>
          <input class="pol-input" id="polDiscCond" placeholder="e.g. Siblings, Early bird, Merit-based" value="${pol.discountCondition||''}">
        </div>`;
    } else if (type === 'lateFee') {
      const existingSlabs = pol.lateFeeSlabs || [];
      const slabRows = existingSlabs.map((s, i) => `
        <tr data-slab-idx="${i}">
          <td><input type="number" class="pol-input pol-slab-from" value="${s.fromDay}" min="0" placeholder="1" style="width:100%;min-width:60px"></td>
          <td><input type="number" class="pol-slab-to pol-input" value="${s.toDay === null ? '' : s.toDay}" min="0" placeholder="∞" style="width:100%;min-width:60px"></td>
          <td><input type="number" class="pol-slab-fee pol-input" value="${s.fee}" min="0" placeholder="0" style="width:100%;min-width:80px"></td>
          <td style="text-align:center">
            <button type="button" class="pol-slab-del pol-btn-icon" title="Delete row" style="color:var(--red)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
            </button>
          </td>
        </tr>`).join('');

      wrap.innerHTML = `
        <div class="pol-row">
          <div class="pol-field">
            <label class="pol-label">Late Fee Amount (Rs.) <span class="pol-req">*</span></label>
            <input type="number" class="pol-input" id="polLateAmt" min="0" placeholder="e.g. 500" value="${pol.lateFeeAmount||''}">
          </div>
          <div class="pol-field">
            <label class="pol-label">Charge Type <span class="pol-req">*</span></label>
            <div style="display:flex;gap:16px;align-items:center;margin-top:8px">
              <label style="display:inline-flex;align-items:center;gap:7px;font-size:13px;cursor:pointer;font-weight:500;color:var(--t1)">
                <input type="radio" name="polLatePerRadio" id="polLatePerOnce" value="once"
                  ${(pol.lateFeePer==='once'||!pol.lateFeePer)?'checked':''}
                  style="accent-color:var(--red);width:15px;height:15px">
                One Time
              </label>
              <label style="display:inline-flex;align-items:center;gap:7px;font-size:13px;cursor:pointer;font-weight:500;color:var(--t1)">
                <input type="radio" name="polLatePerRadio" id="polLatePerDay" value="day"
                  ${pol.lateFeePer==='day'?'checked':''}
                  style="accent-color:var(--red);width:15px;height:15px">
                Per Day
              </label>
            </div>
          </div>
        </div>
        <div class="pol-field">
          <label class="pol-label">Grace Period (days before late fee applies)</label>
          <input type="number" class="pol-input" id="polLateGrace" min="0" placeholder="0" value="${pol.lateFeeGrace||''}">
        </div>

        <!-- Challan Submission Late Fee Table -->
        <div class="pol-field" style="margin-top:6px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <label class="pol-label" style="margin-bottom:0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2" style="vertical-align:-2px;margin-right:4px">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              Challan Submission Late Fee (Slab-wise)
            </label>
            <button type="button" id="polSlabAddBtn" class="pol-add-btn" style="padding:5px 12px;font-size:12px;gap:5px">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Row
            </button>
          </div>
          <div style="border:1px solid var(--border);border-radius:var(--r);overflow:hidden">
            <table id="polSlabTable" style="width:100%;border-collapse:collapse;font-size:13px">
              <thead>
                <tr style="background:rgba(239,68,68,0.08);border-bottom:1px solid var(--border)">
                  <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--t2);font-size:12px;white-space:nowrap">From Day</th>
                  <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--t2);font-size:12px;white-space:nowrap">To Day <span style="font-weight:400;color:var(--t3)">(blank=∞)</span></th>
                  <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--t2);font-size:12px;white-space:nowrap">Late Fee (Rs.)</th>
                  <th style="padding:9px 12px;text-align:center;font-weight:600;color:var(--t2);font-size:12px;width:40px">Del</th>
                </tr>
              </thead>
              <tbody id="polSlabBody" style="background:var(--surface)">
                ${slabRows || `<tr id="polSlabEmpty"><td colspan="4" style="text-align:center;padding:18px;color:var(--t3);font-size:12.5px">No slabs added. Click <strong>Add Row</strong> to define late fee ranges.</td></tr>`}
              </tbody>
            </table>
          </div>
          <div style="font-size:11.5px;color:var(--t3);margin-top:6px">
            💡 Example: Days 1–5 → Rs. 200, Days 6–10 → Rs. 500, Days 11+ → Rs. 1000
          </div>
        </div>`;

      // Wire slab CRUD events immediately after rendering
      const slabBody = wrap.querySelector('#polSlabBody');
      const addSlabRow = () => {
        const empty = wrap.querySelector('#polSlabEmpty');
        if (empty) empty.remove();
        const idx = wrap.querySelectorAll('tr[data-slab-idx]').length;
        const tr  = document.createElement('tr');
        tr.dataset.slabIdx = idx;
        tr.innerHTML = `
          <td><input type="number" class="pol-input pol-slab-from" value="" min="0" placeholder="1" style="width:100%;min-width:60px"></td>
          <td><input type="number" class="pol-slab-to pol-input" value="" min="0" placeholder="∞" style="width:100%;min-width:60px"></td>
          <td><input type="number" class="pol-slab-fee pol-input" value="" min="0" placeholder="0" style="width:100%;min-width:80px"></td>
          <td style="text-align:center">
            <button type="button" class="pol-slab-del pol-btn-icon" title="Delete row" style="color:var(--red)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
            </button>
          </td>`;
        slabBody.appendChild(tr);
        tr.querySelector('.pol-slab-del').addEventListener('click', () => {
          tr.remove();
          if (!slabBody.querySelector('tr[data-slab-idx]')) {
            slabBody.innerHTML = `<tr id="polSlabEmpty"><td colspan="4" style="text-align:center;padding:18px;color:var(--t3);font-size:12.5px">No slabs added. Click <strong>Add Row</strong> to define late fee ranges.</td></tr>`;
          }
        });
      };

      // Wire delete on existing rows
      wrap.querySelectorAll('.pol-slab-del').forEach(btn => {
        btn.addEventListener('click', () => {
          btn.closest('tr').remove();
          if (!slabBody.querySelector('tr[data-slab-idx]')) {
            slabBody.innerHTML = `<tr id="polSlabEmpty"><td colspan="4" style="text-align:center;padding:18px;color:var(--t3);font-size:12.5px">No slabs added. Click <strong>Add Row</strong> to define late fee ranges.</td></tr>`;
          }
        });
      });

      wrap.querySelector('#polSlabAddBtn')?.addEventListener('click', addSlabRow);
    } else if (type === 'enrollmentClose') {
      wrap.innerHTML = `
        <div class="pol-row">
          <div class="pol-field">
            <label class="pol-label">Close Date <span class="pol-req">*</span></label>
            <input type="date" class="pol-input" id="polCloseDate" value="${pol.closeDate||''}">
          </div>
          <div class="pol-field">
            <label class="pol-label">Close Mode</label>
            <select class="pol-input" id="polCloseMode">
              <option value="auto"   ${pol.closeMode==='auto'  ?'selected':''}>Auto (closes on date)</option>
              <option value="manual" ${pol.closeMode==='manual'?'selected':''}>Manual (admin closes)</option>
            </select>
          </div>
        </div>`;
    } else {
      wrap.innerHTML = '';
    }
  },

  // ── Modal events ─────────────────────────────────────────────
  _wireModalEvents(existing = {}) {
    const el = this._el;
    let selectedType = existing.type || null;

    // Type grid selection
    el.querySelectorAll('.pol-type-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedType = btn.dataset.type;
        el.querySelectorAll('.pol-type-opt').forEach(b => {
          const cfg = POLICY_TYPES[b.dataset.type];
          b.classList.remove('active');
          b.style.borderColor = '';
          b.style.background  = '';
        });
        const cfg = POLICY_TYPES[selectedType];
        btn.classList.add('active');
        btn.style.borderColor = cfg.color;
        btn.style.background  = cfg.dim;
        this._renderTypeFields(selectedType, existing);
      });
    });

    // Scope change
    el.querySelector('#polScope')?.addEventListener('change', function() {
      el.querySelector('#polCampusWrap').style.display = this.value === 'campus' ? 'block' : 'none';
      el.querySelector('#polLevelWrap').style.display  = this.value === 'level'  ? 'block' : 'none';
      el.querySelector('#polBatchWrap').style.display  = this.value === 'batch'  ? 'block' : 'none';
    });

    // Close
    const close = () => {
      el.querySelector('#polModal').classList.remove('open');
      setTimeout(() => { el.querySelector('#polOverlay').style.display = 'none'; }, 250);
    };
    el.querySelector('#polModalClose')?.addEventListener('click', close);
    el.querySelector('#polCancelBtn')?.addEventListener('click', close);
    el.querySelector('#polOverlay')?.addEventListener('click', e => { if (e.target === el.querySelector('#polOverlay')) close(); });

    // Save
    el.querySelector('#polSaveBtn')?.addEventListener('click', () => {
      this._save(selectedType);
    });
  },

  // ── Save / validate ──────────────────────────────────────────
  _save(type) {
    const el    = this._el;
    const name  = el.querySelector('#polName')?.value.trim();
    const scope = el.querySelector('#polScope')?.value;

    if (!type)  { Toast.error('Please select a policy type.');  return; }
    if (!name)  { Toast.error('Policy name is required.');      return; }
    if (!scope) { Toast.error('Please select scope.');          return; }

    const pol = {
      id:    this._editing || uid(),
      type,
      name,
      scope,
      active: true,
      notes:  el.querySelector('#polNotes')?.value.trim() || '',
      createdAt: this._editing ? undefined : new Date().toISOString(),
    };

    if (scope === 'campus') pol.campusId = el.querySelector('#polCampus')?.value || '';
    if (scope === 'level')  pol.levelId  = el.querySelector('#polLevel')?.value  || '';
    if (scope === 'batch')  pol.batchId  = el.querySelector('#polBatch')?.value  || '';

    // Type-specific fields
    if (type === 'enrollment') {
      pol.deadlineDate = el.querySelector('#polDeadline')?.value || '';
      pol.gracedays    = parseInt(el.querySelector('#polGrace')?.value) || 0;
      if (!pol.deadlineDate) { Toast.error('Deadline date is required.'); return; }
    }
    if (type === 'feeWaiver') {
      pol.waiveType  = el.querySelector('#polWaiveType')?.value || 'full';
      pol.waiveValue = parseFloat(el.querySelector('#polWaiveVal')?.value) || 0;
    }
    if (type === 'discount') {
      pol.discountPercent   = parseFloat(el.querySelector('#polDiscPct')?.value) || 0;
      pol.maxAmount         = parseFloat(el.querySelector('#polDiscMax')?.value) || 0;
      pol.discountCondition = el.querySelector('#polDiscCond')?.value.trim() || '';
      if (!pol.discountPercent) { Toast.error('Discount % is required.'); return; }
    }
    if (type === 'lateFee') {
      pol.lateFeeAmount = parseFloat(el.querySelector('#polLateAmt')?.value) || 0;
      pol.lateFeePer    = el.querySelector('input[name="polLatePerRadio"]:checked')?.value || 'once';
      pol.lateFeeGrace  = parseInt(el.querySelector('#polLateGrace')?.value) || 0;
      const slabRows = [...el.querySelectorAll('#polSlabBody tr[data-slab-idx]')];
      pol.lateFeeSlabs = slabRows.map(tr => ({
        fromDay: parseInt(tr.querySelector('.pol-slab-from')?.value) || 0,
        toDay:   tr.querySelector('.pol-slab-to')?.value !== '' ? parseInt(tr.querySelector('.pol-slab-to')?.value) : null,
        fee:     parseFloat(tr.querySelector('.pol-slab-fee')?.value) || 0,
      }));
      if (!pol.lateFeeAmount) { Toast.error('Late fee amount is required.'); return; }
    }
    if (type === 'enrollmentClose') {
      pol.closeDate = el.querySelector('#polCloseDate')?.value || '';
      pol.closeMode = el.querySelector('#polCloseMode')?.value || 'auto';
      if (!pol.closeDate) { Toast.error('Close date is required.'); return; }
    }

    // Update or insert
    let list = getPolicies();
    if (this._editing) {
      const existing = list.find(p => p.id === this._editing);
      pol.active    = existing?.active ?? true;
      pol.createdAt = existing?.createdAt;
      list = list.map(p => p.id === this._editing ? pol : p);
      Toast.success('Policy updated.');
    } else {
      list.push(pol);
      Toast.success('Policy created.');
    }

    savePolicies(list);

    // Close modal and re-render
    el.querySelector('#polModal').classList.remove('open');
    setTimeout(() => { el.querySelector('#polOverlay').style.display = 'none'; }, 250);
    this._renderList();
  },

  // ── Wire events on root ───────────────────────────────────────
  _wireEvents() {
    const el = this._el;

    // Filter pills
    el.querySelector('#polFilters')?.addEventListener('click', e => {
      const pill = e.target.closest('.pol-pill');
      if (!pill) return;
      el.querySelectorAll('.pol-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      this._filter = pill.dataset.filter;
      this._renderList();
    });

    // List actions (delegated) — lateFee has its own section, skip here
    el.querySelector('#polList')?.addEventListener('click', e => {
      const editBtn = e.target.closest('.pol-edit');
      const delBtn  = e.target.closest('.pol-del');
      if (editBtn) {
        const pol = getPolicies().find(p => p.id === editBtn.dataset.id);
        if (pol?.type === 'lateFee') return; // handled by _renderLateFeeSection
        this._openModal(editBtn.dataset.id);
      }
      if (delBtn) {
        const pol = getPolicies().find(p => p.id === delBtn.dataset.id);
        if (pol?.type === 'lateFee') return; // handled by _renderLateFeeSection
        this._delete(delBtn.dataset.id);
      }
    });

    // Toggle active
    el.querySelector('#polList')?.addEventListener('change', e => {
      if (!e.target.classList.contains('pol-toggle-chk')) return;
      const id   = e.target.dataset.id;
      const list = getPolicies().map(p => p.id === id ? { ...p, active: e.target.checked } : p);
      savePolicies(list);
      Toast.info(e.target.checked ? 'Policy activated.' : 'Policy deactivated.');
    });
  },

  _delete(id) {
    if (!confirm('Delete this policy? This cannot be undone.')) return;
    savePolicies(getPolicies().filter(p => p.id !== id));
    Toast.success('Policy deleted.');
    this._renderList();
  },

  // ── Styles ────────────────────────────────────────────────────
  _renderStyles() {
    return `<style>
/* ── Policies Module Styles ── */
.pol-root { display:flex; flex-direction:column; gap:20px; }

/* Tab bar */
.pol-tab-bar {
  display:flex; align-items:center; gap:2px;
  border-bottom:1px solid var(--border);
  margin-bottom:4px;
}
.pol-tab-btn {
  display:flex; align-items:center; gap:6px;
  padding:10px 16px; font-size:13px; font-weight:500;
  color:var(--t3); background:none; border:none;
  border-bottom:2px solid transparent;
  cursor:pointer; margin-bottom:-1px;
  transition:color 0.15s, border-color 0.15s;
  white-space:nowrap;
}
.pol-tab-btn:hover { color:var(--t1); }
.pol-tab-btn.active { color:var(--blue); border-bottom-color:var(--blue); font-weight:600; }
.pol-tab-btn svg { flex-shrink:0; opacity:0.7; }
.pol-tab-btn.active svg { opacity:1; }

/* Header */
.pol-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap; }
.pol-title  { font-family:var(--font-display); font-size:20px; font-weight:700; color:var(--t1); }
.pol-subtitle { font-size:13px; color:var(--t3); margin-top:3px; }
.pol-add-btn {
  display:flex; align-items:center; gap:7px;
  padding:9px 18px; border-radius:var(--r-sm);
  background:var(--blue); color:#fff;
  font-size:13px; font-weight:600; flex-shrink:0;
  transition:opacity 0.15s, transform 0.15s;
}
.pol-add-btn:hover { opacity:0.88; transform:translateY(-1px); }

/* Filter pills */
.pol-filters { display:flex; gap:6px; flex-wrap:wrap; }
.pol-pill {
  padding:6px 14px; border-radius:20px; font-size:12.5px; font-weight:500;
  background:var(--surface2); color:var(--t2);
  border:1px solid var(--border); transition:all 0.15s;
}
.pol-pill:hover { border-color:var(--blue); color:var(--blue); }
.pol-pill.active { background:var(--blue-dim); color:var(--blue); border-color:var(--blue); }

/* Policy cards */
.pol-list { display:flex; flex-direction:column; gap:10px; }
.pol-card {
  background:var(--surface); border:1px solid var(--border);
  border-radius:var(--r); padding:16px 18px;
  display:flex; align-items:center; gap:16px; flex-wrap:wrap;
  transition:border-color 0.15s, box-shadow 0.15s;
}
.pol-card:hover { border-color:var(--border2); box-shadow:var(--shadow); }
.pol-card-left { flex:1; min-width:200px; display:flex; flex-direction:column; gap:5px; }
.pol-type-badge {
  display:inline-flex; align-items:center; gap:5px;
  padding:3px 9px; border-radius:20px; font-size:11.5px; font-weight:600;
  width:fit-content;
}
.pol-card-name   { font-size:14px; font-weight:600; color:var(--t1); }
.pol-card-detail { font-size:12px; color:var(--t3); font-family:var(--font-mono); }
.pol-card-meta   { display:flex; flex-direction:column; gap:4px; min-width:160px; }
.pol-scope-chip  {
  display:inline-flex; align-items:center; gap:5px;
  font-size:11.5px; color:var(--t2);
  background:var(--surface2); border:1px solid var(--border);
  padding:3px 9px; border-radius:20px; width:fit-content;
}
.pol-notes { font-size:11.5px; color:var(--t3); max-width:220px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pol-card-actions { display:flex; align-items:center; gap:8px; flex-shrink:0; }

/* Toggle */
.pol-toggle { display:inline-flex; align-items:center; cursor:pointer; }
.pol-toggle-chk { display:none; }
.pol-toggle-track {
  width:36px; height:20px; border-radius:20px;
  background:var(--surface3); border:1px solid var(--border2);
  position:relative; transition:background 0.2s;
}
.pol-toggle-chk:checked + .pol-toggle-track { background:var(--green); border-color:var(--green); }
.pol-toggle-thumb {
  position:absolute; top:2px; left:2px;
  width:14px; height:14px; border-radius:50%; background:#fff;
  transition:transform 0.2s; box-shadow:0 1px 3px rgba(0,0,0,0.25);
}
.pol-toggle-chk:checked + .pol-toggle-track .pol-toggle-thumb { transform:translateX(16px); }

.pol-btn-icon {
  width:30px; height:30px; border-radius:var(--r-sm);
  display:flex; align-items:center; justify-content:center;
  color:var(--t3); background:var(--surface2); border:1px solid var(--border);
  transition:all 0.15s;
}
.pol-btn-icon:hover { color:var(--t1); border-color:var(--border2); }
.pol-del:hover { color:var(--red)!important; border-color:var(--red)!important; background:rgba(239,68,68,0.08)!important; }
.pol-edit:hover { color:var(--blue)!important; border-color:var(--blue)!important; background:var(--blue-dim)!important; }

/* Empty state */
.pol-empty {
  display:flex; flex-direction:column; align-items:center; gap:12px;
  padding:50px 0; color:var(--t3); font-size:13.5px; text-align:center;
}

/* Modal overlay */
.pol-overlay {
  position:fixed; inset:0; z-index:1000;
  background:rgba(0,0,0,0.55); backdrop-filter:blur(4px);
  display:flex; align-items:center; justify-content:center; padding:20px;
}
.pol-modal {
  background:var(--surface); border:1px solid var(--border2);
  border-radius:var(--r-xl); width:100%; max-width:560px;
  max-height:90vh; display:flex; flex-direction:column;
  box-shadow:var(--shadow-lg);
  transform:translateY(16px) scale(0.98); opacity:0;
  transition:transform 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s;
}
.pol-modal.open { transform:translateY(0) scale(1); opacity:1; }
.pol-modal-hdr {
  display:flex; align-items:center; justify-content:space-between;
  padding:20px 24px 16px; border-bottom:1px solid var(--border); flex-shrink:0;
}
.pol-modal-title { font-family:var(--font-display); font-size:17px; font-weight:700; color:var(--t1); }
.pol-modal-close {
  width:28px; height:28px; border-radius:6px;
  display:flex; align-items:center; justify-content:center;
  color:var(--t3); transition:background 0.15s, color 0.15s;
}
.pol-modal-close:hover { background:var(--surface3); color:var(--t1); }
.pol-modal-body { flex:1; overflow-y:auto; padding:20px 24px; display:flex; flex-direction:column; gap:16px; scrollbar-width:thin; }
.pol-modal-footer {
  display:flex; justify-content:flex-end; gap:10px;
  padding:16px 24px; border-top:1px solid var(--border); flex-shrink:0;
}

/* Form elements */
.pol-field { display:flex; flex-direction:column; gap:6px; }
.pol-label { font-size:12.5px; font-weight:600; color:var(--t2); }
.pol-req   { color:var(--red); }
.pol-input {
  background:var(--surface2); border:1px solid var(--border2);
  border-radius:var(--r-sm); padding:9px 12px;
  color:var(--t1); font-size:13.5px; outline:none;
  transition:border-color 0.15s;
}
.pol-input:focus { border-color:var(--blue); }
.pol-textarea { resize:vertical; min-height:72px; }
.pol-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
@media(max-width:480px) { .pol-row { grid-template-columns:1fr; } }

/* Type selector grid */
.pol-type-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:8px; }
.pol-type-opt {
  display:flex; align-items:center; gap:8px;
  padding:10px 12px; border-radius:var(--r-sm);
  background:var(--surface2); border:1.5px solid var(--border2);
  color:var(--t2); font-size:13px; font-weight:500;
  transition:all 0.15s; text-align:left;
}
.pol-type-opt:hover { border-color:var(--border3); color:var(--t1); }
.pol-type-opt.active { font-weight:600; }

/* Action buttons */
.pol-btn-primary {
  display:flex; align-items:center; gap:7px;
  padding:9px 20px; border-radius:var(--r-sm);
  background:var(--blue); color:#fff;
  font-size:13px; font-weight:600;
  transition:opacity 0.15s;
}
.pol-btn-primary:hover { opacity:0.88; }
.pol-btn-ghost {
  padding:9px 18px; border-radius:var(--r-sm);
  background:var(--surface2); color:var(--t2);
  border:1px solid var(--border2); font-size:13px; font-weight:500;
  transition:background 0.15s, color 0.15s;
}
.pol-btn-ghost:hover { background:var(--surface3); color:var(--t1); }

/* ── Searchable Multi-Select Dropdown ── */
.lf-searchable-dd { position:relative; }
.lf-dd-trigger {
  display:flex; align-items:center; flex-wrap:wrap; gap:4px;
  padding:6px 10px; border-radius:var(--r-sm);
  background:var(--surface2); border:1px solid var(--border2);
  cursor:pointer; min-height:40px; transition:border-color 0.15s;
}
.lf-dd-trigger:hover { border-color:var(--blue); }
.lf-dd-trigger svg { margin-left:auto; flex-shrink:0; }
.lf-dd-placeholder { font-size:13px; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.lf-dd-panel {
  position:absolute; top:calc(100% + 4px); left:0; right:0; z-index:200;
  background:var(--surface); border:1px solid var(--border2);
  border-radius:var(--r-sm); box-shadow:0 4px 20px rgba(0,0,0,0.15);
  overflow:hidden;
}
.lf-dd-search-wrap {
  display:flex; align-items:center; gap:8px;
  padding:8px 12px; border-bottom:1px solid var(--border);
  background:var(--surface2);
}
.lf-dd-search {
  flex:1; border:none; background:transparent; outline:none;
  font-size:13px; color:var(--t1);
}
.lf-dd-options { max-height:200px; overflow-y:auto; }
.lf-dd-item {
  display:flex; align-items:center; gap:8px;
  padding:8px 14px; cursor:pointer; font-size:13px;
  color:var(--t1); transition:background 0.1s;
}
.lf-dd-item:hover { background:var(--surface2); }
.lf-dd-chk { font-size:14px; flex-shrink:0; color:var(--blue); }
.lf-dd-select-all { border-bottom:1px solid var(--border); font-weight:600; color:var(--t2); }

/* ── Enrolment Rules (Enrollment Close tab) ─────────────────── */
.er-section { background:var(--surface1,var(--surface)); border:1px solid var(--border); border-radius:10px; overflow:hidden; }
.er-section-head { display:flex; align-items:center; justify-content:space-between; padding:14px 18px; border-bottom:1px solid var(--border); }
.er-add-btn {
  width:30px; height:30px; display:flex; align-items:center; justify-content:center;
  background:var(--blue); color:#fff; border:none; border-radius:7px; cursor:pointer;
  flex-shrink:0; transition:opacity .15s;
}
.er-add-btn:hover { opacity:.85; }
.er-actions { display:flex; gap:4px; min-width:68px; justify-content:flex-end; }
.er-icon-btn {
  width:28px; height:28px; display:flex; align-items:center; justify-content:center;
  background:none; border:1px solid var(--border); border-radius:6px;
  cursor:pointer; color:var(--t3); transition:all .12s;
}
.er-edit-btn:hover { border-color:var(--blue); color:var(--blue); background:var(--blue-dim); }
.er-del-btn:hover  { border-color:var(--red);  color:var(--red);  background:var(--red-dim);  }

/* Hierarchy nodes */
.er-inst-node  { margin-bottom:12px; }
.er-inst-head  { display:flex; align-items:center; gap:8px; padding:10px 16px;
                 background:var(--surface2); border-radius:8px 8px 0 0;
                 border:1px solid var(--border); border-bottom:none; }
.er-inst-name  { font-size:15px; font-weight:700; color:var(--t1); flex:1; letter-spacing:-0.01em; }
.er-camp-list  { border:1px solid var(--border); border-radius:0 0 8px 8px; overflow:hidden; }
.er-camp-node  { border-bottom:1px solid var(--border); }
.er-camp-node:last-child { border-bottom:none; }
.er-camp-head  { display:flex; align-items:center; gap:7px; padding:9px 16px 9px 24px;
                 background:var(--surface1,var(--surface)); }
.er-camp-name  { font-size:13.5px; font-weight:600; color:var(--t1); flex:1; }
.er-disc-list  { border-top:1px solid var(--border); }
.er-disc-node  { border-bottom:1px solid var(--border); }
.er-disc-node:last-child { border-bottom:none; }
.er-disc-head  { display:flex; align-items:center; gap:7px; padding:8px 16px 8px 36px;
                 background:var(--surface2); }
.er-disc-badge { font-family:var(--font-mono,monospace); font-size:12.5px; font-weight:800;
                 color:var(--blue); min-width:38px; letter-spacing:0.02em; }
.er-disc-name  { font-size:13px; font-weight:500; color:var(--t2); flex:1; }
.er-level-list { }
.er-level-row  { display:flex; align-items:center; gap:8px; padding:9px 16px 9px 48px;
                 border-bottom:1px solid var(--border); transition:background .1s; }
.er-level-row:last-child { border-bottom:none; }
.er-level-row:hover { background:var(--blue-dim); }
.er-level-name { font-size:14px; font-weight:500; color:var(--t1); flex:1; }
.er-close-badge{ font-size:12.5px; color:var(--t2); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
                 font-weight:500; white-space:nowrap; min-width:150px; }
.er-chev { margin-right:2px; }
.er-collapsible:hover { background:var(--surface2); border-radius:6px; }

</style>`;
  },

  // ══════════════════════════════════════════════════════════════
  // ENROLLMENT CLOSE SECTION
  // Moved from batch.js Configuration tab → policies.js
  // Data key: 'enrolmentRules' in AppState (unchanged)
  // batch.js still reads enrolmentRules — no data migration needed
  // ══════════════════════════════════════════════════════════════

  mountEnrollmentClose(el) {
    if (!el) return;
    this._ecEl = el;
    // Safe-init key
    if (!Array.isArray(AppState.get('enrolmentRules'))) {
      AppState.set?.('enrolmentRules', []);
    }
    requestAnimationFrame(() => {
      el.innerHTML = this._ecTemplate();
      this._ecWireEvents(el);
    });
  },

  _ecTemplate() {
    const rules      = (AppState.get('enrolmentRules') || []).filter(r => r && r.id);
    const institutes = AppState.get('institutes')  || [];
    const campuses   = AppState.get('campuses')    || [];
    const discs      = AppState.get('disciplines') || [];

    let hierHTML = '';
    if (!rules.length) {
      hierHTML = `<div style="padding:40px 24px;text-align:center;color:var(--t3);font-size:13px">
        No enrolment rules yet — click <strong>+</strong> to add the first rule.
      </div>`;
    } else {
      const byInst = {};
      rules.forEach(r => {
        const key = r.instituteId || '__none__';
        if (!byInst[key]) byInst[key] = [];
        byInst[key].push(r);
      });

      hierHTML = Object.entries(byInst).map(([instId, instRules]) => {
        const inst = AppState.findById('institutes', instId) || { instituteName: '—' };

        const byCamp = {};
        instRules.forEach(r => {
          const key = r.campusId || '__all__';
          if (!byCamp[key]) byCamp[key] = [];
          byCamp[key].push(r);
        });

        const campHTML = Object.entries(byCamp).map(([campId, campRules]) => {
          const camp = campId === '__all__' ? null : AppState.findById('campuses', campId);
          const campLabel = camp ? camp.campusName.replace(/\s*campus$/i,'').trim() : 'All Campuses';

          const byDisc = {};
          campRules.forEach(r => {
            const key = r.disciplineId || '__none__';
            if (!byDisc[key]) byDisc[key] = [];
            byDisc[key].push(r);
          });

          const discHTML = Object.entries(byDisc).map(([discId, discRules]) => {
            const disc = AppState.findById('disciplines', discId);
            const levelRows = discRules.map(r => {
              const closeTxt = r.closeMode === 'same' ? 'Same as batch start' : `${r.closeDays}d after batch start`;
              const lvl = AppState.findById('levels', r.levelId)
                       || (r.levelIds?.length ? AppState.findById('levels', r.levelIds[0]) : null);
              const lvlName = lvl?.levelName || '—';
              const lvlId   = lvl?.id || '';
              return `
                <div class="er-level-row" data-er-id="${r.id}" data-level-id="${lvlId}">
                  <span class="er-level-name">${lvlName}</span>
                  <span class="er-close-badge">${closeTxt}</span>
                  <div class="er-actions">
                    <button class="er-icon-btn er-edit-btn" title="Edit" data-er-id="${r.id}" data-level-id="${lvlId}">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="er-icon-btn er-del-btn" title="Delete" data-er-id="${r.id}">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
                    </button>
                  </div>
                </div>`;
            }).join('');

            return `
              <div class="er-disc-node">
                <div class="er-disc-head">
                  <span class="er-disc-badge">${disc?.abbreviation || '?'}</span>
                  <span class="er-disc-name">${disc?.fullName || '—'}</span>
                </div>
                <div class="er-level-list">${levelRows}</div>
              </div>`;
          }).join('');

          const campColId = `ec-camp-${campId}-${instId}`;
          return `
            <div class="er-camp-node">
              <div class="er-camp-head er-collapsible" data-er-target="${campColId}" style="cursor:pointer">
                <svg class="er-chev" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="transition:transform .2s;flex-shrink:0;opacity:.4"><polyline points="9 18 15 12 9 6"/></svg>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                <span class="er-camp-name">${campLabel}</span>
              </div>
              <div class="er-disc-list" id="${campColId}">${discHTML}</div>
            </div>`;
        }).join('');

        const instColId = `ec-inst-${instId}`;
        return `
          <div class="er-inst-node">
            <div class="er-inst-head er-collapsible" data-er-target="${instColId}" style="cursor:pointer">
              <svg class="er-chev" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="transition:transform .2s;flex-shrink:0;opacity:.5"><polyline points="9 18 15 12 9 6"/></svg>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:.6"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
              <span class="er-inst-name">${inst.instituteName}</span>
            </div>
            <div class="er-camp-list" id="${instColId}">${campHTML}</div>
          </div>`;
      }).join('');
    }

    return `
      <div style="padding:24px">
        <div class="er-section">
          <div class="er-section-head">
            <div>
              <div style="font-size:14px;font-weight:600;color:var(--t1)">Enrolment Rules</div>
              <div style="font-size:12px;color:var(--t3);margin-top:2px">Define when enrolment closes — grouped by institute → campus → discipline → level.</div>
            </div>
            <div style="display:flex;gap:6px;align-items:center">
              <button id="ecClearAllBtn" title="Clear all rules"
                style="display:inline-flex;align-items:center;justify-content:center;
                       width:32px;height:32px;border-radius:7px;cursor:pointer;
                       background:var(--surface2);border:1px solid var(--border);
                       color:var(--t3);transition:all .15s;"
                onmouseover="this.style.background='var(--red-dim)';this.style.borderColor='var(--red)';this.style.color='var(--red)'"
                onmouseout="this.style.background='var(--surface2)';this.style.borderColor='var(--border)';this.style.color='var(--t3)'">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
                </svg>
              </button>
              <button id="ecAddBtn" title="Add Rule"
                style="display:inline-flex;align-items:center;justify-content:center;
                       width:32px;height:32px;border-radius:7px;cursor:pointer;
                       background:var(--blue);border:1px solid var(--blue);
                       color:#fff;transition:all .15s;"
                onmouseover="this.style.opacity='.85'"
                onmouseout="this.style.opacity='1'">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
            </div>
          </div>
          <div id="ecHierarchy">${hierHTML}</div>
        </div>
      </div>`;
  },

  _ecWireEvents(el) {
    const savedOpen = el._ecOpenIds || new Set();

    el.querySelectorAll('.er-collapsible').forEach(row => {
      const targetId = row.dataset.erTarget;
      const children = el.querySelector('#' + targetId);
      const chev     = row.querySelector('.er-chev');
      const shouldOpen = savedOpen.has(targetId);
      if (children) children.style.display = shouldOpen ? '' : 'none';
      if (chev) chev.style.transform = shouldOpen ? 'rotate(90deg)' : 'rotate(0deg)';
      row.addEventListener('click', () => {
        if (!children) return;
        const isOpen = children.style.display !== 'none';
        children.style.display = isOpen ? 'none' : '';
        if (chev) chev.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
        if (!el._ecOpenIds) el._ecOpenIds = new Set();
        if (isOpen) el._ecOpenIds.delete(targetId);
        else        el._ecOpenIds.add(targetId);
      });
    });

    el.querySelector('#ecAddBtn')?.addEventListener('click', () => {
      this._ecOpenForm(null, el);
    });

    el.querySelector('#ecClearAllBtn')?.addEventListener('click', async () => {
      const rules = AppState.get('enrolmentRules') || [];
      if (!rules.length) { Toast.error('No rules to clear.'); return; }
      const ok = await Modal.confirm({
        title: 'Clear All Rules',
        message: `Are you sure you want to delete ALL ${rules.length} enrolment rule${rules.length !== 1 ? 's' : ''}? This action cannot be undone.`,
        confirmLabel: 'Delete All', danger: true,
      });
      if (!ok) return;
      AppState.set('enrolmentRules', []);
      Toast.success('All enrolment rules cleared.');
      this._ecRefresh(el);
    });

    el.querySelectorAll('.er-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const rule = (AppState.get('enrolmentRules') || []).find(r => r.id === btn.dataset.erId);
        const focusLevelId = btn.dataset.levelId || null;
        if (rule) this._ecOpenForm(rule, el, focusLevelId);
      });
    });

    el.querySelectorAll('.er-del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ruleId = btn.dataset.erId;
        const rule   = (AppState.get('enrolmentRules') || []).find(r => r.id === ruleId);
        if (!rule) return;
        const lvlId = rule.levelId || (rule.levelIds?.[0]);
        const lvl   = lvlId ? AppState.findById('levels', lvlId) : null;
        const ok = await Modal.confirm({
          title: 'Delete Rule',
          message: `Delete enrolment rule for "${lvl?.levelName || 'this level'}"?`,
          confirmLabel: 'Delete', danger: true,
        });
        if (!ok) return;
        AppState.remove('enrolmentRules', ruleId);
        Toast.success('Rule deleted.');
        this._ecRefresh(el);
      });
    });
  },

  _ecRefresh(el) {
    if (!el._ecOpenIds) el._ecOpenIds = new Set();
    el.querySelectorAll('.er-collapsible').forEach(row => {
      const targetId = row.dataset.erTarget;
      const children = el.querySelector('#' + targetId);
      if (children && children.style.display !== 'none') el._ecOpenIds.add(targetId);
    });
    requestAnimationFrame(() => {
      el.innerHTML = this._ecTemplate();
      this._ecWireEvents(el);
    });
  },

  _ecOpenForm(existing, container, focusLevelId = null) {
    const isEdit     = !!existing;
    const institutes = AppState.get('institutes')  || [];
    const campuses   = AppState.get('campuses')    || [];
    const discs      = AppState.get('disciplines') || [];
    const allLevels  = AppState.get('levels')      || [];

    const selInst     = existing?.instituteId  || '';
    const selCampus   = existing?.campusId     || '';
    const selDisc     = existing?.disciplineId || '';
    const ruleLevelId = existing?.levelId || existing?.levelIds?.[0] || focusLevelId || '';
    const selLevels   = ruleLevelId ? [ruleLevelId] : [];

    const filtCampuses = selInst ? campuses.filter(c => c.instituteId === selInst) : campuses;
    const filtLevels   = selDisc ? allLevels.filter(l => l.disciplineId === selDisc) : allLevels;

    const instOpts  = institutes.map(i =>
      `<option value="${i.id}" ${i.id === selInst ? 'selected' : ''}>${i.instituteName}</option>`).join('');
    const campOpts  = filtCampuses.map(c =>
      `<option value="${c.id}" ${c.id === selCampus ? 'selected' : ''}>${c.campusName.replace(/\s*campus$/i,'').trim()}</option>`).join('');
    const discOpts  = discs.map(d =>
      `<option value="${d.id}" ${d.id === selDisc ? 'selected' : ''}>${d.abbreviation} — ${d.fullName}</option>`).join('');

    const focusedLevel = AppState.findById('levels', ruleLevelId) || null;

    const campCheckboxes = !isEdit ? `
      <div class="form-group">
        <label class="form-label">Campuses <span class="req">*</span>
          <span style="font-size:11px;font-weight:400;color:var(--t3);margin-left:6px">select one or more</span>
        </label>
        <div id="ecCampChecks" style="display:flex;flex-wrap:wrap;gap:6px;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);min-height:42px">
          <span style="font-size:12px;color:var(--t3);padding:4px 2px">Select institute first…</span>
        </div>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--t3);margin-top:6px;cursor:pointer">
          <input type="checkbox" id="ecAllCampus" style="accent-color:var(--blue)"/>
          Select all campuses
        </label>
      </div>` : `
      <div class="form-group">
        <label class="form-label">Campus</label>
        <select id="ecCampSel" class="pol-input" ${!selInst ? 'disabled' : ''}>
          <option value="">All campuses</option>${campOpts}
        </select>
      </div>`;

    const discCheckboxes = !isEdit ? `
      <div class="form-group">
        <label class="form-label">Disciplines <span class="req">*</span>
          <span style="font-size:11px;font-weight:400;color:var(--t3);margin-left:6px">select one or more</span>
        </label>
        <div id="ecDiscChecks" style="display:flex;flex-wrap:wrap;gap:6px;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--surface2)">
          ${discs.map(d => `
            <label class="ec-check-pill" style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border:1px solid var(--border);border-radius:20px;cursor:pointer;font-size:12.5px;background:var(--surface)">
              <input type="checkbox" class="ec-disc-chk" value="${d.id}" style="accent-color:var(--blue)"/>
              ${d.abbreviation}
            </label>`).join('')}
        </div>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--t3);margin-top:6px;cursor:pointer">
          <input type="checkbox" id="ecAllDisc" style="accent-color:var(--blue)"/>
          Select all disciplines
        </label>
      </div>` : `
      <div class="form-group">
        <label class="form-label">Discipline <span class="req">*</span></label>
        <select id="ecDiscSel" class="pol-input">
          <option value="">Select discipline…</option>${discOpts}
        </select>
      </div>`;

    const levelsField = !isEdit ? `
      <div class="form-group">
        <label class="form-label">Levels <span class="req">*</span>
          <span style="font-size:11px;font-weight:400;color:var(--t3);margin-left:6px">select one or more</span>
        </label>
        <div id="ecLevelChecks" style="display:flex;flex-wrap:wrap;gap:6px;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);min-height:42px">
          <span style="font-size:12px;color:var(--t3);padding:4px 2px">Select discipline(s) first…</span>
        </div>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--t3);margin-top:6px;cursor:pointer">
          <input type="checkbox" id="ecAllLevel" style="accent-color:var(--blue)"/>
          Select all levels
        </label>
      </div>` : `
      <div class="form-group">
        <label class="form-label">Level</label>
        <div style="padding:9px 14px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);
                    font-size:13px;color:var(--t1);font-weight:500;display:flex;align-items:center;gap:8px">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--blue);flex-shrink:0"></span>
          ${focusedLevel?.levelName || '—'}
          <span style="font-size:11px;color:var(--t3);margin-left:4px">(editing close date only)</span>
        </div>
      </div>`;

    Modal.open({
      title: isEdit ? 'Edit Enrolment Rule' : 'Add Enrolment Rules',
      size: 'md',
      body: `
        ${!isEdit ? `<div style="padding:8px 12px;background:var(--blue-dim);border:1px solid rgba(59,130,246,.2);border-radius:7px;font-size:12.5px;color:var(--blue);margin-bottom:16px">
          Bulk mode — select multiple campuses, disciplines and levels. A separate rule will be saved for each combination.
        </div>` : ''}
        <div class="form-group">
          <label class="pol-label">Institute <span class="pol-req">*</span></label>
          <select id="ecInstSel" class="pol-input">
            <option value="">Select institute…</option>${instOpts}
          </select>
        </div>
        ${campCheckboxes}
        ${discCheckboxes}
        ${levelsField}
        <div class="form-group">
          <label class="pol-label">Enrolment Close Date</label>
          <div style="display:flex;flex-direction:column;gap:8px;padding:10px 14px;border:1px solid var(--border);border-radius:8px;background:var(--surface2)">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">
              <input type="radio" name="ecCloseMode" value="same" id="ecModeSame"
                     ${(!existing || existing.closeMode === 'same') ? 'checked' : ''}
                     style="accent-color:var(--blue)"/>
              <span>Same as batch start</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">
              <input type="radio" name="ecCloseMode" value="manual" id="ecModeManual"
                     ${existing?.closeMode === 'manual' ? 'checked' : ''}
                     style="accent-color:var(--blue)"/>
              <span>Manual —</span>
              <input id="ecCloseDays" type="number" min="0" max="365" value="${existing?.closeDays ?? 3}"
                     style="width:60px;padding:3px 8px;border:1px solid var(--border);border-radius:6px;
                            background:var(--surface);color:var(--t1);font-size:13px;text-align:center;
                            font-family:var(--font-mono,monospace);font-weight:600"
                     ${existing?.closeMode !== 'manual' ? 'disabled' : ''}/>
              <span style="font-size:12px;color:var(--t3)">days after batch start</span>
            </label>
          </div>
        </div>
      `,
      actions: [
        { label: 'Cancel', variant: 'ghost', close: true },
        {
          label: isEdit ? 'Save Changes' : 'Add Rules',
          variant: 'primary', close: false,
          handler: (modalEl) => {
            const instId = modalEl.querySelector('#ecInstSel')?.value;
            const mode   = modalEl.querySelector('input[name="ecCloseMode"]:checked')?.value || 'same';
            const days   = parseInt(modalEl.querySelector('#ecCloseDays')?.value) || 3;

            if (!instId) { Toast.error('Please select an institute.'); return; }

            if (isEdit) {
              AppState.update('enrolmentRules', existing.id, {
                closeMode: mode, closeDays: mode === 'manual' ? days : null,
              });
              Toast.success('Rule updated.');
              Modal.closeAll();
              this._ecRefresh(container);
            } else {
              const campIds  = [...modalEl.querySelectorAll('.ec-camp-chk:checked')].map(c => c.value);
              const discIds  = [...modalEl.querySelectorAll('.ec-disc-chk:checked')].map(c => c.value);
              const levelIds = [...modalEl.querySelectorAll('.ec-level-chk:checked')].map(c => c.value);

              if (!campIds.length)  { Toast.error('Please select at least one campus.'); return; }
              if (!discIds.length)  { Toast.error('Please select at least one discipline.'); return; }
              if (!levelIds.length) { Toast.error('Please select at least one level.'); return; }

              let added = 0, updated = 0;
              const allRules = AppState.get('enrolmentRules') || [];
              campIds.forEach(campId => {
                discIds.forEach(discId => {
                  levelIds.forEach(levelId => {
                    const lv = AppState.findById('levels', levelId);
                    if (!lv || lv.disciplineId !== discId) return;
                    const existingRule = allRules.find(r =>
                      r.instituteId === instId && r.campusId === campId &&
                      r.disciplineId === discId && r.levelId === levelId
                    );
                    if (existingRule) {
                      AppState.update('enrolmentRules', existingRule.id, {
                        closeMode: mode, closeDays: mode === 'manual' ? days : null,
                      });
                      updated++;
                    } else {
                      AppState.add('enrolmentRules', {
                        id: generateID('er'),
                        instituteId: instId, campusId: campId,
                        disciplineId: discId, levelId: levelId,
                        closeMode: mode, closeDays: mode === 'manual' ? days : null,
                      });
                      added++;
                    }
                  });
                });
              });

              if (!added && !updated) { Toast.error('No valid discipline-level combinations found.'); return; }
              const msg = [added && `${added} added`, updated && `${updated} updated`].filter(Boolean).join(', ');
              Toast.success(`Rules: ${msg}.`);
              Modal.closeAll();
              this._ecRefresh(container);
            }
          }
        }
      ],
      onOpen: (modalEl) => {
        const rebuildCampuses = (iId) => {
          const wrap = modalEl.querySelector('#ecCampChecks');
          if (!wrap) return;
          const all  = AppState.get('campuses') || [];
          const filt = iId ? all.filter(c => c.instituteId === iId) : [];
          if (!filt.length) {
            wrap.innerHTML = `<span style="font-size:12px;color:var(--t3);padding:4px 2px">${iId ? 'No campuses for this institute.' : 'Select institute first…'}</span>`;
          } else {
            wrap.innerHTML = filt.map(c => `
              <label class="ec-check-pill" style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border:1px solid var(--border);border-radius:20px;cursor:pointer;font-size:12.5px;background:var(--surface)">
                <input type="checkbox" class="ec-camp-chk" value="${c.id}" style="accent-color:var(--blue)"/>
                ${c.campusName.replace(/\s*campus$/i,'').trim()}
              </label>`).join('');
            modalEl.querySelectorAll('.ec-camp-chk').forEach(chk => {
              chk.addEventListener('change', () => {
                const allChk = modalEl.querySelector('#ecAllCampus');
                if (allChk) allChk.checked = [...modalEl.querySelectorAll('.ec-camp-chk')].every(c => c.checked);
              });
            });
          }
        };

        const rebuildLevels = () => {
          const wrap    = modalEl.querySelector('#ecLevelChecks');
          if (!wrap) return;
          const discIds = [...modalEl.querySelectorAll('.ec-disc-chk:checked')].map(c => c.value);
          const all     = AppState.get('levels') || [];
          const filt    = discIds.length ? all.filter(l => discIds.includes(l.disciplineId)) : [];
          if (!filt.length) {
            wrap.innerHTML = `<span style="font-size:12px;color:var(--t3);padding:4px 2px">${discIds.length ? 'No levels found.' : 'Select discipline(s) first…'}</span>`;
          } else {
            wrap.innerHTML = filt.map(l => `
              <label class="ec-check-pill" style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border:1px solid var(--border);border-radius:20px;cursor:pointer;font-size:12.5px;background:var(--surface)">
                <input type="checkbox" class="ec-level-chk" value="${l.id}" style="accent-color:var(--blue)"/>
                ${l.levelName}
              </label>`).join('');
            modalEl.querySelectorAll('.ec-level-chk').forEach(chk => {
              chk.addEventListener('change', () => {
                const allChk = modalEl.querySelector('#ecAllLevel');
                if (allChk) allChk.checked = [...modalEl.querySelectorAll('.ec-level-chk')].every(c => c.checked);
              });
            });
          }
        };

        modalEl.querySelector('#ecInstSel')?.addEventListener('change', e => {
          rebuildCampuses(e.target.value);
          const campSel = modalEl.querySelector('#ecCampSel');
          if (campSel) {
            const all  = AppState.get('campuses') || [];
            const filt = e.target.value ? all.filter(c => c.instituteId === e.target.value) : all;
            campSel.innerHTML = `<option value="">All campuses</option>` +
              filt.map(c => `<option value="${c.id}">${c.campusName.replace(/\s*campus$/i,'').trim()}</option>`).join('');
            campSel.disabled = !e.target.value;
          }
        });

        modalEl.querySelector('#ecAllCampus')?.addEventListener('change', e => {
          modalEl.querySelectorAll('.ec-camp-chk').forEach(c => { c.checked = e.target.checked; });
        });

        modalEl.querySelectorAll('.ec-disc-chk').forEach(chk => {
          chk.addEventListener('change', rebuildLevels);
        });

        modalEl.querySelector('#ecAllDisc')?.addEventListener('change', e => {
          modalEl.querySelectorAll('.ec-disc-chk').forEach(c => { c.checked = e.target.checked; });
          rebuildLevels();
        });

        modalEl.querySelector('#ecAllLevel')?.addEventListener('change', e => {
          modalEl.querySelectorAll('.ec-level-chk').forEach(c => { c.checked = e.target.checked; });
        });

        modalEl.querySelector('#ecDiscSel')?.addEventListener('change', e => {
          const wrap = modalEl.querySelector('#ecLevelChecks');
          if (!wrap) return;
          const all  = AppState.get('levels') || [];
          const filt = e.target.value ? all.filter(l => l.disciplineId === e.target.value) : [];
          if (!filt.length) {
            wrap.innerHTML = `<span style="font-size:12px;color:var(--t3);padding:4px 2px">${e.target.value ? 'No levels for this discipline.' : 'Select discipline first…'}</span>`;
          } else {
            wrap.innerHTML = filt.map(l => `
              <label class="ec-check-pill" style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border:1px solid var(--border);border-radius:20px;cursor:pointer;font-size:12.5px;background:var(--surface)">
                <input type="checkbox" class="ec-level-chk" value="${l.id}" style="accent-color:var(--blue)"/>
                ${l.levelName}
              </label>`).join('');
          }
        });

        modalEl.querySelectorAll('input[name="ecCloseMode"]').forEach(radio => {
          radio.addEventListener('change', () => {
            modalEl.querySelector('#ecCloseDays').disabled = modalEl.querySelector('#ecModeSame').checked;
          });
        });
      }
    });
  },


};
