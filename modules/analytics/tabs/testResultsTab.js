// ============================================================
// modules/analytics/tabs/testResultsTab.js
// Test & Results Tab — groups all test/result report cards
// Each card mounts one report from reports/testResults/
// ============================================================

import { ResultProfile } from '../reports/testResults/resultProfile.js';

// Test & Results report card registry
// Naya report add karna ho to yahan push karo — bas
const TEST_RESULTS_REPORTS = [
  {
    id:       'resultProfile',
    title:    'Result Profile',
    subtitle: '',
    icon:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    color:    'var(--purple)',
    colorDim: 'var(--purple-dim)',
    module:   ResultProfile,
  },
  // Naye reports yahan add hote jayenge:
  // { id: 'examSchedule',  title: 'Exam Schedule',  ... module: ExamSchedule  },
  // { id: 'gradeAnalysis', title: 'Grade Analysis', ... module: GradeAnalysis },
  // { id: 'passRates',     title: 'Pass Rates',     ... module: PassRates     },
];

export const TestResultsTab = {

  _expanded: false,
  _PREVIEW_COUNT: 3, // default mein kitne cards dikhao

  mount(container) {
    container.innerHTML = this._html();
    this._bindEvents(container);
    this._mountPreviews(container);
  },

  _html() {
    const preview = TEST_RESULTS_REPORTS.slice(0, this._PREVIEW_COUNT);
    const hasMore  = TEST_RESULTS_REPORTS.length > this._PREVIEW_COUNT;

    return `
      <div class="tr-tab-wrap">

        <!-- Report Cards Grid -->
        <div class="tr-cards-grid" id="trCardsGrid">
          ${preview.map(r => this._cardHTML(r)).join('')}
        </div>

        <!-- See All button -->
        ${hasMore ? `
          <div class="tr-see-all-wrap">
            <button class="tr-see-all-btn" id="trSeeAllBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              See All Reports (${TEST_RESULTS_REPORTS.length})
            </button>
          </div>
        ` : ''}

        <!-- Report Detail Panel (opens when card clicked) -->
        <div class="tr-detail-panel" id="trDetailPanel" style="display:none">
          <div class="tr-detail-header">
            <button class="tr-back-btn" id="trBackBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
              Back to Reports
            </button>
            <h3 class="tr-detail-title" id="trDetailTitle"></h3>
          </div>
          <div class="tr-detail-body" id="trDetailBody"></div>
        </div>

      </div>

      <style>
        .tr-tab-wrap { display:flex; flex-direction:column; gap:20px; }

        /* Cards Grid */
        .tr-cards-grid {
          display:grid;
          grid-template-columns: repeat(3, 1fr);
          gap:16px;
        }
        @media(max-width:1100px){ .tr-cards-grid{ grid-template-columns:repeat(2,1fr); } }
        @media(max-width:680px){  .tr-cards-grid{ grid-template-columns:1fr; } }

        .tr-card {
          background:var(--surface);
          border:1px solid var(--border);
          border-radius:var(--r-lg);
          padding:20px;
          cursor:pointer;
          transition:transform .18s, box-shadow .18s, border-color .18s;
          display:flex;
          flex-direction:column;
          align-items:center;
          text-align:center;
          gap:10px;
        }
        .tr-card:hover {
          transform:translateY(-2px);
          box-shadow:var(--shadow);
          border-color:var(--border2);
        }

        .tr-card-top {
          display:flex;
          align-items:center;
          justify-content:center;
          width:100%;
        }

        .tr-card-icon {
          width:40px; height:40px;
          border-radius:var(--r-sm);
          display:flex; align-items:center; justify-content:center;
        }

        .tr-card-arrow {
          display:none;
        }

        .tr-card-title {
          font-family:var(--font-display);
          font-size:14px;
          font-weight:700;
          color:var(--t1);
        }

        .tr-card-sub {
          font-size:12px;
          color:var(--t3);
          line-height:1.5;
        }

        /* See All */
        .tr-see-all-wrap { display:flex; justify-content:center; }
        .tr-see-all-btn {
          display:flex; align-items:center; gap:7px;
          padding:9px 20px;
          border-radius:var(--r-sm);
          font-size:13px; font-weight:600;
          color:var(--purple);
          background:var(--purple-dim);
          border:1px solid rgba(139,92,246,.18);
          cursor:pointer;
          transition:opacity .15s;
        }
        .tr-see-all-btn:hover { opacity:.8; }

        /* Detail Panel */
        .tr-detail-panel { display:flex; flex-direction:column; gap:20px; }

        .tr-detail-header {
          display:flex; align-items:center; gap:16px;
          padding-bottom:16px;
          border-bottom:1px solid var(--border);
        }

        .tr-back-btn {
          display:flex; align-items:center; gap:6px;
          font-size:12.5px; font-weight:600;
          color:var(--t2);
          background:var(--surface2);
          border:1px solid var(--border2);
          border-radius:var(--r-sm);
          padding:7px 12px;
          cursor:pointer;
          transition:color .15s;
          flex-shrink:0;
        }
        .tr-back-btn:hover { color:var(--t1); }

        .tr-detail-title {
          font-family:var(--font-display);
          font-size:16px; font-weight:700;
          color:var(--t1);
        }
      </style>
    `;
  },

  _cardHTML(r) {
    return `
      <div class="tr-card" data-report="${r.id}">
        <div class="tr-card-top">
          <div class="tr-card-icon" style="background:${r.colorDim};color:${r.color}">
            ${r.icon}
          </div>
          <span class="tr-card-arrow">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </span>
        </div>
        <div class="tr-card-title">${r.title}</div>
        ${r.subtitle ? `<div class="tr-card-sub">${r.subtitle}</div>` : ''}
      </div>
    `;
  },

  _bindEvents(container) {
    // Card click → open detail
    container.querySelector('#trCardsGrid')?.addEventListener('click', e => {
      const card = e.target.closest('.tr-card[data-report]');
      if (!card) return;
      this._openReport(card.dataset.report, container);
    });

    // See All → show all cards
    container.querySelector('#trSeeAllBtn')?.addEventListener('click', () => {
      this._showAll(container);
    });

    // Back button
    container.querySelector('#trBackBtn')?.addEventListener('click', () => {
      this._closeReport(container);
    });
  },

  _mountPreviews(container) {
    // Future use: live previews ya mini-charts cards k andar
  },

  _openReport(reportId, container) {
    const report = TEST_RESULTS_REPORTS.find(r => r.id === reportId);
    if (!report) return;

    container.querySelector('#trCardsGrid').style.display    = 'none';
    container.querySelector('#trSeeAllBtn')?.closest('.tr-see-all-wrap') &&
      (container.querySelector('.tr-see-all-wrap').style.display = 'none');

    const panel = container.querySelector('#trDetailPanel');
    panel.style.display = 'flex';

    container.querySelector('#trDetailTitle').textContent = report.title;

    const body = container.querySelector('#trDetailBody');
    body.innerHTML = '';
    report.module.mount(body);
  },

  _closeReport(container) {
    container.querySelector('#trDetailPanel').style.display  = 'none';
    container.querySelector('#trCardsGrid').style.display    = 'grid';
    const seeAll = container.querySelector('.tr-see-all-wrap');
    if (seeAll) seeAll.style.display = 'flex';
  },

  _showAll(container) {
    const grid = container.querySelector('#trCardsGrid');
    grid.innerHTML = TEST_RESULTS_REPORTS.map(r => this._cardHTML(r)).join('');
    const seeAll = container.querySelector('.tr-see-all-wrap');
    if (seeAll) seeAll.style.display = 'none';

    // Re-bind card clicks after re-render
    grid.addEventListener('click', e => {
      const card = e.target.closest('.tr-card[data-report]');
      if (!card) return;
      this._openReport(card.dataset.report, container);
    });
  }

};
