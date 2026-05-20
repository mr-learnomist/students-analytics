// ============================================================
// modules/testing/testingUI.js — Testing Module Entry Point
// Tab shell: Schedule | Assessment Calendar | Results | Reports | Settings
// ============================================================

import { injectUIStyles }          from '../../utils/ui.js';
import { Auth }                    from '../../utils/auth.js';
import { TestScheduleTab }         from './testSchedule.js';
import { AssessmentCalendarTab }   from './assessmentCalendar.js';
import { ResultsTab }              from './resultsTab.js';

// ── Tab definitions ───────────────────────────────────────────
const TABS = [
  {
    id:    'schedule',
    label: 'Test Schedule',
    icon:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8"  y1="2" x2="8"  y2="6"/>
              <line x1="3"  y1="10" x2="21" y2="10"/>
            </svg>`,
    mount: (el, container) => TestScheduleTab.mount(el, container),
    ready: true,
  },
  {
    id:    'assessment-calendar',              // ← NEW TAB
    label: 'Assessment Calendar',
    icon:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8"  y1="2" x2="8"  y2="6"/>
              <line x1="3"  y1="10" x2="21" y2="10"/>
              <line x1="8"  y1="14" x2="8"  y2="14" stroke-width="3" stroke-linecap="round"/>
              <line x1="12" y1="14" x2="12" y2="14" stroke-width="3" stroke-linecap="round"/>
              <line x1="16" y1="14" x2="16" y2="14" stroke-width="3" stroke-linecap="round"/>
            </svg>`,
    mount: (el) => AssessmentCalendarTab.mount(el),
    ready: true,
  },
  {
    id:    'results',
    label: 'Results',
    icon:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>`,
    mount: (el) => ResultsTab.mount(el),
    ready: true,
  },
  {
    id:    'reports',
    label: 'Reports',
    icon:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="20" x2="18" y2="10"/>
              <line x1="12" y1="20" x2="12" y2="4"/>
              <line x1="6"  y1="20" x2="6"  y2="14"/>
            </svg>`,
    ready: false,
  },
  {
    id:    'settings',
    label: 'Test Settings',
    icon:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>`,
    ready: false,
  },
];

// ── Module export ─────────────────────────────────────────────
export const TestingModule = {

  _activeTab: null,

  mount(container) {
    injectUIStyles();

    const el = typeof container === 'string'
      ? document.querySelector(container)
      : container;
    if (!el) return;

    el.innerHTML = this._shellTemplate();
    this._attachTabSwitcher(el);

    // Restore last active tab or default to first
    const saved = localStorage.getItem('sms_testing_tab') || TABS[0].id;
    this._activateTab(saved, el);
  },

  // ── Shell HTML (tab nav + panel area) ─────────────────────
  _shellTemplate() {
    const tabBtns = TABS.map(t => `
      <button class="tab-btn" data-tab="${t.id}">
        ${t.icon}
        ${t.label}
        ${!t.ready ? `<span style="font-size:9.5px;font-weight:700;
          background:var(--yellow-dim);color:var(--yellow);
          padding:1px 6px;border-radius:8px;margin-left:2px">Soon</span>` : ''}
      </button>
    `).join('');

    const panels = TABS.map(t =>
      `<div id="testing-panel-${t.id}" class="module-panel testing-panel"></div>`
    ).join('');

    return `
      <div class="testing-shell">
        <nav class="tab-nav" id="testingTabs">${tabBtns}</nav>
        <div id="testingPanelArea">${panels}</div>
      </div>
    `;
  },

  // ── Tab switcher ───────────────────────────────────────────
  _attachTabSwitcher(el) {
    el.querySelector('#testingTabs')?.addEventListener('click', e => {
      const btn = e.target.closest('.tab-btn[data-tab]');
      if (btn) this._activateTab(btn.dataset.tab, el);
    });
  },

  // ── Activate a tab ─────────────────────────────────────────
  _activateTab(tabId, el) {
    const tab = TABS.find(t => t.id === tabId) || TABS[0];

    // Update button states
    el.querySelectorAll('#testingTabs .tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === tab.id)
    );

    // Show correct panel
    el.querySelectorAll('.testing-panel').forEach(p => {
      p.classList.toggle('active', p.id === `testing-panel-${tab.id}`);
    });

    const panel = el.querySelector(`#testing-panel-${tab.id}`);
    if (!panel) return;

    // Mount tab content if not already mounted
    if (!panel.dataset.mounted) {
      if (tab.ready && tab.mount) {
        tab.mount(panel, el);
        panel.dataset.mounted = 'true';
      } else {
        panel.innerHTML = this._comingSoon(tab.label);
        panel.dataset.mounted = 'true';
      }
    }

    this._activeTab = tab.id;
    localStorage.setItem('sms_testing_tab', tab.id);
  },

  // ── Coming soon placeholder ────────────────────────────────
  _comingSoon(label) {
    return `
      <div style="display:flex;flex-direction:column;align-items:center;
                  justify-content:center;min-height:320px;gap:12px;
                  border:1px dashed var(--border2);border-radius:12px;
                  margin-top:8px">
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.2" style="color:var(--t4)">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8"  y1="2" x2="8"  y2="6"/>
          <line x1="3"  y1="10" x2="21" y2="10"/>
        </svg>
        <div style="font-size:14.5px;font-weight:700;color:var(--t2)">${label}</div>
        <div style="font-size:12.5px;color:var(--t3)">This tab is under development — coming soon</div>
      </div>
    `;
  },
};
