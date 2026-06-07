// ============================================================
// modules/analytics/tabs/teacherReportsTab.js
// Teachers Tab — groups all teacher report cards
// Each card mounts one report from reports/teachers/
// ============================================================

// Teacher report card registry
// Naya report add karna ho to yahan push karo — bas
const TEACHER_REPORTS = [
  // Reports yahan add hote jayenge, example:
  // {
  //   id:       'teacherPerformance',
  //   title:    'Teacher Performance',
  //   subtitle: 'Subject-wise analysis',
  //   icon:     '<svg .../>',
  //   color:    'var(--blue)',
  //   colorDim: 'var(--blue-dim)',
  //   module:   TeacherPerformance,
  // },
];

export const TeacherReportsTab = {

  _expanded: false,
  _PREVIEW_COUNT: 3, // default mein kitne cards dikhao

  mount(container) {
    container.innerHTML = this._html();
    this._bindEvents(container);
  },

  _html() {
    const preview = TEACHER_REPORTS.slice(0, this._PREVIEW_COUNT);
    const hasMore  = TEACHER_REPORTS.length > this._PREVIEW_COUNT;

    return `
      <div class="trt-tab-wrap">

        <!-- Empty state — jab tak reports add nahi hote -->
        ${TEACHER_REPORTS.length === 0 ? `
          <div class="trt-empty">
            <div class="trt-empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <p class="trt-empty-title">Teacher Reports</p>
            <span class="trt-empty-sub">Reports yahan show honge — abhi koi report add nahi hui.</span>
          </div>
        ` : `
          <!-- Report Cards Grid -->
          <div class="trt-cards-grid" id="trtCardsGrid">
            ${preview.map(r => this._cardHTML(r)).join('')}
          </div>

          <!-- See All button -->
          ${hasMore ? `
            <div class="trt-see-all-wrap">
              <button class="trt-see-all-btn" id="trtSeeAllBtn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                See All Reports (${TEACHER_REPORTS.length})
              </button>
            </div>
          ` : ''}
        `}

        <!-- Report Detail Panel (opens when card clicked) -->
        <div class="trt-detail-panel" id="trtDetailPanel" style="display:none">
          <div class="trt-detail-header">
            <button class="trt-back-btn" id="trtBackBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
              Back to Reports
            </button>
            <h3 class="trt-detail-title" id="trtDetailTitle"></h3>
          </div>
          <div class="trt-detail-body" id="trtDetailBody"></div>
        </div>

      </div>

      <style>
        .trt-tab-wrap { display:flex; flex-direction:column; gap:20px; }

        /* Empty state */
        .trt-empty {
          display:flex; flex-direction:column; align-items:center;
          justify-content:center; gap:12px;
          min-height:260px;
          border:1px dashed var(--border2);
          border-radius:var(--r-lg);
          color:var(--t3);
          text-align:center;
          padding:40px;
        }
        .trt-empty-icon {
          width:72px; height:72px;
          border-radius:50%;
          background:var(--surface2);
          display:flex; align-items:center; justify-content:center;
          color:var(--t3);
        }
        .trt-empty-title {
          font-size:15px; font-weight:700; color:var(--t2); margin:0;
        }
        .trt-empty-sub {
          font-size:12.5px; color:var(--t3); max-width:320px; line-height:1.6;
        }

        /* Cards Grid */
        .trt-cards-grid {
          display:grid;
          grid-template-columns: repeat(3, 1fr);
          gap:16px;
        }
        @media(max-width:1100px){ .trt-cards-grid{ grid-template-columns:repeat(2,1fr); } }
        @media(max-width:680px){  .trt-cards-grid{ grid-template-columns:1fr; } }

        .trt-card {
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
        .trt-card:hover {
          transform:translateY(-2px);
          box-shadow:var(--shadow);
          border-color:var(--border2);
        }

        .trt-card-top {
          display:flex;
          align-items:center;
          justify-content:center;
          width:100%;
        }

        .trt-card-icon {
          width:40px; height:40px;
          border-radius:var(--r-sm);
          display:flex; align-items:center; justify-content:center;
        }

        .trt-card-title {
          font-family:var(--font-display);
          font-size:14px; font-weight:700;
          color:var(--t1);
        }

        .trt-card-sub {
          font-size:12px; color:var(--t3); line-height:1.5;
        }

        /* See All */
        .trt-see-all-wrap { display:flex; justify-content:center; }
        .trt-see-all-btn {
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
        .trt-see-all-btn:hover { opacity:.8; }

        /* Detail Panel */
        .trt-detail-panel { display:flex; flex-direction:column; gap:20px; }

        .trt-detail-header {
          display:flex; align-items:center; gap:16px;
          padding-bottom:16px;
          border-bottom:1px solid var(--border);
        }

        .trt-back-btn {
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
        .trt-back-btn:hover { color:var(--t1); }

        .trt-detail-title {
          font-family:var(--font-display);
          font-size:16px; font-weight:700;
          color:var(--t1);
        }
      </style>
    `;
  },

  _cardHTML(r) {
    return `
      <div class="trt-card" data-report="${r.id}">
        <div class="trt-card-top">
          <div class="trt-card-icon" style="background:${r.colorDim};color:${r.color}">
            ${r.icon}
          </div>
        </div>
        <div class="trt-card-title">${r.title}</div>
        ${r.subtitle ? `<div class="trt-card-sub">${r.subtitle}</div>` : ''}
      </div>
    `;
  },

  _bindEvents(container) {
    // Card click → open detail
    container.querySelector('#trtCardsGrid')?.addEventListener('click', e => {
      const card = e.target.closest('.trt-card[data-report]');
      if (!card) return;
      this._openReport(card.dataset.report, container);
    });

    // See All → show all cards
    container.querySelector('#trtSeeAllBtn')?.addEventListener('click', () => {
      this._showAll(container);
    });

    // Back button
    container.querySelector('#trtBackBtn')?.addEventListener('click', () => {
      this._closeReport(container);
    });
  },

  _openReport(reportId, container) {
    const report = TEACHER_REPORTS.find(r => r.id === reportId);
    if (!report) return;

    container.querySelector('#trtCardsGrid').style.display = 'none';
    const seeAll = container.querySelector('.trt-see-all-wrap');
    if (seeAll) seeAll.style.display = 'none';

    const panel = container.querySelector('#trtDetailPanel');
    panel.style.display = 'flex';

    container.querySelector('#trtDetailTitle').textContent = report.title;

    const body = container.querySelector('#trtDetailBody');
    body.innerHTML = '';
    report.module.mount(body);
  },

  _closeReport(container) {
    container.querySelector('#trtDetailPanel').style.display = 'none';
    container.querySelector('#trtCardsGrid').style.display   = 'grid';
    const seeAll = container.querySelector('.trt-see-all-wrap');
    if (seeAll) seeAll.style.display = 'flex';
  },

  _showAll(container) {
    const grid = container.querySelector('#trtCardsGrid');
    grid.innerHTML = TEACHER_REPORTS.map(r => this._cardHTML(r)).join('');
    const seeAll = container.querySelector('.trt-see-all-wrap');
    if (seeAll) seeAll.style.display = 'none';

    grid.addEventListener('click', e => {
      const card = e.target.closest('.trt-card[data-report]');
      if (!card) return;
      this._openReport(card.dataset.report, container);
    });
  },

};
