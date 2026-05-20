// ============================================================
// modules/analytics/analyticsUI.js
// Analytics Module — Main Entry Point
// Handles tab layout and mounts report groups
// ============================================================

import { BatchReportsTab }   from './tabs/batchReportsTab.js';
import { TestResultsTab }    from './tabs/testResultsTab.js';

// Tab registry — naye tabs yahan add karo
const TABS = [
  { id: 'batches',     label: 'Batches',          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>', module: BatchReportsTab },
  { id: 'testResults', label: 'Test & Results',   icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>', module: TestResultsTab },
  // { id: 'students',   label: 'Students',    icon: '...', module: StudentReportsTab },
  // { id: 'attendance', label: 'Attendance',  icon: '...', module: AttendanceReportsTab },
  // { id: 'performance',label: 'Performance', icon: '...', module: PerformanceReportsTab },
];

export const AnalyticsModule = {

  _activeTab: null,

  mount(container) {
    if (!container) return;
    container.innerHTML = this._html();
    this._bindTabs(container);
    this._activateTab(TABS[0].id, container);
  },

  _html() {
    return `
      <div class="analytics-wrap">
        <nav class="analytics-tab-nav">
          ${TABS.map(t => `
            <button class="analytics-tab-btn" data-tab="${t.id}">
              <span class="atb-icon">${t.icon}</span>
              <span>${t.label}</span>
            </button>
          `).join('')}
        </nav>
        <div class="analytics-tab-body" id="analyticsTabBody"></div>
      </div>

      <style>
        .analytics-wrap { display:flex; flex-direction:column; gap:20px; }
        .analytics-tab-nav {
          display:flex;
          gap:4px;
          border-bottom:1px solid var(--border);
          padding-bottom:0;
        }

        .analytics-tab-btn {
          display:flex;
          align-items:center;
          gap:7px;
          padding:9px 16px;
          border-radius:var(--r-sm) var(--r-sm) 0 0;
          color:var(--t2);
          font-size:13px;
          font-weight:500;
          background:none;
          border:none;
          border-bottom:2px solid transparent;
          margin-bottom:-1px;
          cursor:pointer;
          transition:color .15s, background .15s;
        }

        .analytics-tab-btn:hover { color:var(--t1); background:var(--surface2); }

        .analytics-tab-btn.active {
          color:var(--blue);
          border-bottom-color:var(--blue);
          background:var(--blue-dim);
        }

        .atb-icon { display:flex; align-items:center; color:inherit; }
        .analytics-tab-body { min-height:300px; }
      </style>
    `;
  },

  _bindTabs(container) {
    container.querySelectorAll('.analytics-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._activateTab(btn.dataset.tab, container);
      });
    });
  },

  _activateTab(tabId, container) {
    this._activeTab = tabId;

    // Active state update
    container.querySelectorAll('.analytics-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // Mount tab module
    const body = container.querySelector('#analyticsTabBody');
    if (!body) return;
    body.innerHTML = '';

    const tab = TABS.find(t => t.id === tabId);
    if (tab?.module) tab.module.mount(body);
  }

};
