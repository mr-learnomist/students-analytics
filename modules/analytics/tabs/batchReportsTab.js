// ============================================================
// modules/analytics/tabs/batchReportsTab.js
// Batch Tab — groups all batch-related report cards
// Each card mounts one report from reports/batches/
// ============================================================

import { ConversionTracking }    from '../reports/batches/conversionTracking.js';
import { BatchTimelineReport }  from '../reports/batches/batchTimelineReport.js';

// Batch report card registry
// Naya report add karna ho to yahan push karo — bas
const BATCH_REPORTS = [
  {
    id:       'conversionTracking',
    title:    'FDA Conversion Tracking',
    subtitle: '',
    icon:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    color:    'var(--blue)',
    colorDim: 'var(--blue-dim)',
    module:   ConversionTracking,
  },
  {
    id:       'batchTimeline',
    title:    'Batch Timeline',
    subtitle: 'LP progress, hours & completion across all batches',
    icon:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="8" y2="18"/><line x1="12" y1="14" x2="12" y2="18"/></svg>',
    color:    'var(--violet)',
    colorDim: 'var(--violet-dim)',
    module:   BatchTimelineReport,
  },
  // Naye reports yahan add hote jayenge:
  // { id: 'batchStrength',    title: 'Batch Strength',    ... module: BatchStrength    },
  // { id: 'dropoutRate',      title: 'Dropout Rate',      ... module: DropoutRate      },
  // { id: 'batchTimeline',    title: 'Batch Timeline',    ... module: BatchTimeline    },
];

export const BatchReportsTab = {

  _expanded: false,
  _PREVIEW_COUNT: 3, // default mein kitne cards dikhao

  mount(container) {
    container.innerHTML = this._html();
    this._bindEvents(container);
    this._mountPreviews(container);
  },

  _html() {
    const preview = BATCH_REPORTS.slice(0, this._PREVIEW_COUNT);
    const hasMore  = BATCH_REPORTS.length > this._PREVIEW_COUNT;

    return `
      <div class="br-tab-wrap">

        <!-- Report Cards Grid -->
        <div class="br-cards-grid" id="brCardsGrid">
          ${preview.map(r => this._cardHTML(r)).join('')}
        </div>

        <!-- See All button -->
        ${hasMore ? `
          <div class="br-see-all-wrap">
            <button class="br-see-all-btn" id="brSeeAllBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              See All Reports (${BATCH_REPORTS.length})
            </button>
          </div>
        ` : ''}

        <!-- Report Detail Panel (opens when card clicked) -->
        <div class="br-detail-panel" id="brDetailPanel" style="display:none">
          <div class="br-detail-header">
            <button class="br-back-btn" id="brBackBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
              Back to Reports
            </button>
            <h3 class="br-detail-title" id="brDetailTitle"></h3>
          </div>
          <div class="br-detail-body" id="brDetailBody"></div>
        </div>

      </div>

      <style>
        .br-tab-wrap { display:flex; flex-direction:column; gap:20px; }

        /* Cards Grid */
        .br-cards-grid {
          display:grid;
          grid-template-columns: repeat(3, 1fr);
          gap:16px;
        }
        @media(max-width:1100px){ .br-cards-grid{ grid-template-columns:repeat(2,1fr); } }
        @media(max-width:680px){  .br-cards-grid{ grid-template-columns:1fr; } }

        .br-card {
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
        .br-card:hover {
          transform:translateY(-2px);
          box-shadow:var(--shadow);
          border-color:var(--border2);
        }

        .br-card-top {
          display:flex;
          align-items:center;
          justify-content:center;
          width:100%;
        }

        .br-card-icon {
          width:40px; height:40px;
          border-radius:var(--r-sm);
          display:flex; align-items:center; justify-content:center;
        }

        .br-card-arrow {
          display:none;
        }

        .br-card-title {
          font-family:var(--font-display);
          font-size:14px;
          font-weight:700;
          color:var(--t1);
        }

        .br-card-sub {
          font-size:12px;
          color:var(--t3);
          line-height:1.5;
        }

        /* See All */
        .br-see-all-wrap { display:flex; justify-content:center; }
        .br-see-all-btn {
          display:flex; align-items:center; gap:7px;
          padding:9px 20px;
          border-radius:var(--r-sm);
          font-size:13px; font-weight:600;
          color:var(--blue);
          background:var(--blue-dim);
          border:1px solid rgba(79,133,247,.18);
          cursor:pointer;
          transition:opacity .15s;
        }
        .br-see-all-btn:hover { opacity:.8; }

        /* Detail Panel */
        .br-detail-panel { display:flex; flex-direction:column; gap:20px; }

        .br-detail-header {
          display:flex; align-items:center; gap:16px;
          padding-bottom:16px;
          border-bottom:1px solid var(--border);
        }

        .br-back-btn {
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
        .br-back-btn:hover { color:var(--t1); }

        .br-detail-title {
          font-family:var(--font-display);
          font-size:16px; font-weight:700;
          color:var(--t1);
        }
      </style>
    `;
  },

  _cardHTML(r) {
    return `
      <div class="br-card" data-report="${r.id}">
        <div class="br-card-top">
          <div class="br-card-icon" style="background:${r.colorDim};color:${r.color}">
            ${r.icon}
          </div>
          <span class="br-card-arrow">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </span>
        </div>
        <div class="br-card-title">${r.title}</div>
        ${r.subtitle ? `<div class="br-card-sub">${r.subtitle}</div>` : ''}
      </div>
    `;
  },

  _bindEvents(container) {
    // Card click → open detail
    container.querySelector('#brCardsGrid')?.addEventListener('click', e => {
      const card = e.target.closest('.br-card[data-report]');
      if (!card) return;
      this._openReport(card.dataset.report, container);
    });

    // See All → show all cards
    container.querySelector('#brSeeAllBtn')?.addEventListener('click', () => {
      this._showAll(container);
    });

    // Back button
    container.querySelector('#brBackBtn')?.addEventListener('click', () => {
      this._closeReport(container);
    });
  },

  _openReport(reportId, container) {
    const report = BATCH_REPORTS.find(r => r.id === reportId);
    if (!report) return;

    container.querySelector('#brCardsGrid').style.display    = 'none';
    container.querySelector('#brSeeAllBtn')?.closest('.br-see-all-wrap') &&
      (container.querySelector('.br-see-all-wrap').style.display = 'none');

    const panel = container.querySelector('#brDetailPanel');
    panel.style.display = 'flex';

    container.querySelector('#brDetailTitle').textContent = report.title;

    const body = container.querySelector('#brDetailBody');
    body.innerHTML = '';
    report.module.mount(body);
  },

  _closeReport(container) {
    container.querySelector('#brDetailPanel').style.display  = 'none';
    container.querySelector('#brCardsGrid').style.display    = 'grid';
    const seeAll = container.querySelector('.br-see-all-wrap');
    if (seeAll) seeAll.style.display = 'flex';
  },

  _showAll(container) {
    const grid = container.querySelector('#brCardsGrid');
    grid.innerHTML = BATCH_REPORTS.map(r => this._cardHTML(r)).join('');
    const seeAll = container.querySelector('.br-see-all-wrap');
    if (seeAll) seeAll.style.display = 'none';

    // Re-bind card clicks after re-render
    grid.addEventListener('click', e => {
      const card = e.target.closest('.br-card[data-report]');
      if (!card) return;
      this._openReport(card.dataset.report, container);
    });
  }

};
