// ============================================================
// modules/governance/governanceUsersUI.js — Governance Access
// Admin-only tool: grant/revoke ADDITIVE governance access to any
// existing user (admin, campusAdmin, teacher, etc.) without
// changing their primary role, and scope which campuses they see
// WITHIN governance specifically (independent of their normal
// role's campus scope).
//
// Users whose primary role IS 'governance' already have full
// access via that role (managed in the normal Users module) — they
// show here as reference only, not editable, since the additive
// flag would be redundant for them.
// ============================================================

import { AppState } from '../../utils/state.js';
import { Toast }    from '../../utils/helpers.js';

let _stylesInjected = false;
function _injectStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const style = document.createElement('style');
  style.id = 'gam-styles';
  style.textContent = `
    .gam-wrap { display:flex; flex-direction:column; gap:12px; }
    .gam-note {
      font-size:12px; color:var(--t3); background:var(--surface2); border:1px solid var(--border2);
      border-radius:10px; padding:12px 14px; line-height:1.5;
    }
    .gam-search {
      width:100%; max-width:320px; height:34px; padding:0 12px; border-radius:9px;
      border:1px solid var(--border2); background:var(--surface); color:var(--t1); font-size:12.5px;
    }
    .gam-row { border:1px solid var(--border2); border-radius:12px; background:var(--surface); overflow:hidden; }
    .gam-row-hdr { display:flex; align-items:center; gap:12px; padding:12px 14px; }
    .gam-row-name { font-size:13px; font-weight:700; color:var(--t1); }
    .gam-row-role {
      font-size:10.5px; font-weight:700; padding:2px 8px; border-radius:20px;
      background:var(--surface2); color:var(--t3); text-transform:capitalize;
    }
    .gam-row-role.governance { background:color-mix(in srgb, var(--blue) 15%, transparent); color:var(--blue); }
    .gam-spacer { flex:1; }
    .gam-toggle {
      position:relative; width:38px; height:22px; border-radius:20px; border:none;
      background:var(--border2); cursor:pointer; flex-shrink:0;
    }
    .gam-toggle.on { background:var(--green); }
    .gam-toggle-dot {
      position:absolute; top:2px; left:2px; width:18px; height:18px; border-radius:50%;
      background:#fff; transition:transform .15s;
    }
    .gam-toggle.on .gam-toggle-dot { transform:translateX(16px); }
    .gam-row-body { padding:0 14px 14px; border-top:1px solid var(--border2); }
    .gam-campus-grid {
      display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:6px; margin-top:12px;
    }
    .gam-campus-item { display:flex; align-items:center; gap:7px; font-size:12px; color:var(--t2); cursor:pointer; }
    .gam-campus-item input { width:14px; height:14px; accent-color:var(--blue); cursor:pointer; }
    .gam-empty { text-align:center; padding:36px 20px; color:var(--t3); font-size:13px; border:1px dashed var(--border2); border-radius:12px; }
    .gam-locked { font-size:11px; color:var(--t3); font-style:italic; }
  `;
  document.head.appendChild(style);
}

function _esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const GovernanceUsersModule = {

  mount(el) {
    if (!el) return;
    _injectStyles();
    this._el = el;
    this._search = '';
    this._expanded = new Set();
    this._render();
  },

  _render() {
    const el = this._el;
    const allUsers = AppState.get('users') || [];
    const campuses = AppState.get('campuses') || [];

    const q = this._search.trim().toLowerCase();
    const users = !q ? allUsers : allUsers.filter(u =>
      (u.name || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q)
    );

    const rowHTML = (u) => {
      const isPureGovernance = u.role === 'governance';
      const enabled = isPureGovernance || !!(u.governanceAccess && u.governanceAccess.enabled);
      const govCampusIds = isPureGovernance ? (u.campusIds || []) : ((u.governanceAccess && u.governanceAccess.campusIds) || []);
      const isOpen = this._expanded.has(u.id);

      return `
        <div class="gam-row" data-id="${u.id}">
          <div class="gam-row-hdr" ${isPureGovernance ? '' : `data-toggle-expand="${u.id}" style="cursor:pointer"`}>
            <span class="gam-row-name">${_esc(u.name || u.username)}</span>
            <span class="gam-row-role ${u.role}">${_esc(u.role)}</span>
            <span class="gam-spacer"></span>
            ${isPureGovernance
              ? `<span class="gam-locked">Full access via role</span>`
              : `<button class="gam-toggle ${enabled ? 'on' : ''}" data-toggle-access="${u.id}" title="${enabled ? 'Revoke' : 'Grant'} governance access">
                   <span class="gam-toggle-dot"></span>
                 </button>`}
          </div>
          ${(!isPureGovernance && enabled && isOpen) ? `
            <div class="gam-row-body">
              <div style="font-size:11.5px;color:var(--t3);font-weight:700;text-transform:uppercase">Governance campus access</div>
              <div class="gam-campus-grid">
                ${campuses.length ? campuses.map(c => `
                  <label class="gam-campus-item">
                    <input type="checkbox" data-campus-for="${u.id}" data-campus-id="${c.id}" ${govCampusIds.includes(c.id) ? 'checked' : ''} />
                    ${_esc(c.campusName)}
                  </label>`).join('') : `<span style="font-size:12px;color:var(--t3)">No campuses available.</span>`}
              </div>
            </div>` : ''}
        </div>`;
    };

    el.innerHTML = `
      <div class="gam-wrap">
        <div class="gam-note">
          Grant governance access to any existing account (admin, campus admin, teacher, etc.) without changing their normal role.
          Toggle a user on, then pick which campuses they can see <strong>within Governance</strong> — separate from whatever campus access their regular role already has.
        </div>
        <input type="text" class="gam-search" id="gamSearch" placeholder="Search users…" value="${_esc(this._search)}" />
        <div id="gamList">
          ${users.length ? users.map(rowHTML).join('') : `<div class="gam-empty">No users match your search.</div>`}
        </div>
      </div>`;

    el.querySelector('#gamSearch')?.addEventListener('input', (e) => {
      this._search = e.target.value;
      this._render();
      const s = el.querySelector('#gamSearch');
      if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    });

    el.querySelectorAll('[data-toggle-expand]').forEach(hdr => {
      hdr.addEventListener('click', (e) => {
        if (e.target.closest('[data-toggle-access]')) return; // don't expand when clicking the toggle itself
        const id = hdr.dataset.toggleExpand;
        if (this._expanded.has(id)) this._expanded.delete(id);
        else this._expanded.add(id);
        this._render();
      });
    });

    el.querySelectorAll('[data-toggle-access]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const userId = btn.dataset.toggleAccess;
        const user = allUsers.find(u => u.id === userId);
        if (!user) return;

        const currentlyEnabled = !!(user.governanceAccess && user.governanceAccess.enabled);
        const nextEnabled = !currentlyEnabled;

        AppState.update('users', userId, {
          governanceAccess: {
            enabled: nextEnabled,
            campusIds: (user.governanceAccess && user.governanceAccess.campusIds) || [],
          },
        });

        Toast.success(nextEnabled ? `Governance access granted to ${user.name || user.username}.` : `Governance access revoked from ${user.name || user.username}.`);
        if (nextEnabled) this._expanded.add(userId); // open campus picker right away for convenience
        else this._expanded.delete(userId);
        this._render();
      });
    });

    el.querySelectorAll('[data-campus-for]').forEach(cb => {
      cb.addEventListener('change', () => {
        const userId = cb.dataset.campusFor;
        const user = allUsers.find(u => u.id === userId);
        if (!user) return;

        const checkedIds = [...el.querySelectorAll(`[data-campus-for="${userId}"]:checked`)]
          .map(c => c.dataset.campusId);

        AppState.update('users', userId, {
          governanceAccess: {
            enabled: true,
            campusIds: checkedIds,
          },
        });
        // No full re-render needed here — checkbox state already
        // reflects the change, and re-rendering would just repaint
        // the same thing. Silent save.
      });
    });
  },
};
