// ============================================================
// modules/timetable/timetableUI.js
// Timetable Module — Main entry point
// Tabs: Timetable | Rooms | Teachers | Batches
// ============================================================

import { TimetableTableView }  from './timetableTableView.js';
import { TimetableTeacherView } from './timetableTeacherView.js';
import { TimetableRoomView }   from './timetableRoomView.js';

export const TimetableModule = (() => {

  // ── Tab definitions ───────────────────────────────────────
  const TABS = [
    {
      id: 'timetable',
      label: 'Timetable',
      icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
               <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
             </svg>`,
    },
    {
      id: 'rooms',
      label: 'Rooms',
      icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <rect x="3" y="3" width="18" height="18" rx="2"/>
               <path d="M3 9h18M9 21V9"/>
             </svg>`,
    },
    {
      id: 'teachers',
      label: 'Teachers',
      icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
               <circle cx="9" cy="7" r="4"/>
               <line x1="23" y1="11" x2="17" y2="11"/>
               <line x1="20" y1="8" x2="20" y2="14"/>
             </svg>`,
    },
    {
      id: 'batches',
      label: 'Batches',
      icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <polygon points="12 2 2 7 12 12 22 7 12 2"/>
               <polyline points="2 17 12 22 22 17"/>
               <polyline points="2 12 12 17 22 12"/>
             </svg>`,
    },
  ];

  // ── State ─────────────────────────────────────────────────
  let _activeTab = 'timetable';
  let _rootEl    = null;

  // ── Render shell ──────────────────────────────────────────
  function _render(el) {
    el.innerHTML = `
      <style>
        .tt-tab-nav {
          display: flex;
          gap: 2px;
          border-bottom: 1px solid var(--border);
          margin-bottom: 24px;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .tt-tab-nav::-webkit-scrollbar { display: none; }

        .tt-tab-btn {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 10px 16px;
          border-radius: var(--r-sm) var(--r-sm) 0 0;
          color: var(--t2);
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
          transition: color .15s, background .15s;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          position: relative;
          z-index: 1;
          cursor: pointer;
          background: none;
          border-top: none;
          border-left: none;
          border-right: none;
          font-family: inherit;
        }
        .tt-tab-btn:hover  { color: var(--t1); background: var(--surface2); }
        .tt-tab-btn.active { color: var(--blue); border-bottom-color: var(--blue); background: var(--blue-dim); }

        .tt-panel { display: none; }
        .tt-panel.active { display: block; }

        /* Coming soon placeholder */
        .tt-coming-soon {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 14px;
          padding: 80px 20px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--r-lg);
          color: var(--t3);
          text-align: center;
        }
        .tt-coming-soon svg { opacity: .35; }
        .tt-coming-soon h3 { font-size: 15px; font-weight: 700; color: var(--t2); }
        .tt-coming-soon p  { font-size: 13px; margin-top: 4px; }
      </style>

      <!-- Tab Navigation -->
      <nav class="tt-tab-nav" id="ttTabNav">
        ${TABS.map(t => `
          <button class="tt-tab-btn${t.id === _activeTab ? ' active' : ''}" data-tab="${t.id}">
            ${t.icon} ${t.label}
          </button>
        `).join('')}
      </nav>

      <!-- Tab Panels -->
      ${TABS.map(t => `
        <div class="tt-panel${t.id === _activeTab ? ' active' : ''}" id="tt-panel-${t.id}"></div>
      `).join('')}
    `;

    // Wire tab clicks
    el.querySelector('#ttTabNav').addEventListener('click', e => {
      const btn = e.target.closest('.tt-tab-btn');
      if (!btn) return;
      _switchTab(btn.dataset.tab, el);
    });

    // Mount active tab
    _mountTab(_activeTab, el);
  }

  // ── Tab switching ─────────────────────────────────────────
  function _switchTab(tabId, el) {
    _activeTab = tabId;
    localStorage.setItem('sms_timetable_tab', tabId);

    el.querySelectorAll('.tt-tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === tabId)
    );
    el.querySelectorAll('.tt-panel').forEach(p =>
      p.classList.toggle('active', p.id === 'tt-panel-' + tabId)
    );

    _mountTab(tabId, el);
  }

  // ── Mount individual tab panels ───────────────────────────
  function _mountTab(tabId, el) {
    const panel = el.querySelector('#tt-panel-' + tabId);
    if (!panel) return;

    // Teachers tab: if already mounted just refresh (live sync)
    if (tabId === 'teachers' && panel.dataset.mounted) {
      TimetableTeacherView.refresh();
      return;
    }

    // Rooms tab: if already mounted just refresh (live sync)
    if (tabId === 'rooms' && panel.dataset.mounted) {
      TimetableRoomView.refresh();
      return;
    }

    if (panel.dataset.mounted) return;
    panel.dataset.mounted = 'true';

    switch (tabId) {
      case 'timetable':
        TimetableTableView.mount(panel);
        break;

      case 'rooms':
        TimetableRoomView.mount(panel);
        break;
      case 'teachers':
        TimetableTeacherView.mount(panel);
        break;
      case 'batches':
        _comingSoon(panel, 'Batch View',
          'Batch-wise timetable — full weekly schedule per batch.');
        break;
    }
  }

  // ── Coming-soon placeholder ───────────────────────────────
  function _comingSoon(panel, title, desc) {
    panel.innerHTML = `
      <div class="tt-coming-soon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <div>
          <h3>${title}</h3>
          <p>${desc}</p>
          <p style="margin-top:6px;font-size:12px;color:var(--t3)">Programming coming soon…</p>
        </div>
      </div>`;
  }

  // ── Public API ────────────────────────────────────────────
  return {
    mount(el) {
      if (!el) return;
      _rootEl = el;
      _activeTab = localStorage.getItem('sms_timetable_tab') || 'timetable';
      _render(el);
    }
  };

})();
