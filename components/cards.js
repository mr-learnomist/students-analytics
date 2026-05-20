// ============================================================
// components/cards.js — KPI Cards + Chart Cards
// ============================================================

export const Cards = {
  // Render KPI cards into container
  renderKPIs(container, data) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el || !data) return;

    const cards = [
      {
        id: 'total-students',
        label: 'Total Students',
        value: data.totalStudents?.toLocaleString() || '—',
        trend: data.trends?.students || '+0%',
        trendUp: !data.trends?.students?.startsWith('-'),
        color: 'blue',
        icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
        sub: 'Enrolled this year'
      },
      {
        id: 'attendance',
        label: 'Attendance Rate',
        value: `${data.attendancePercent || 0}%`,
        trend: data.trends?.attendance || '+0%',
        trendUp: !data.trends?.attendance?.startsWith('-'),
        color: data.attendancePercent >= 85 ? 'green' : 'yellow',
        icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
        sub: 'Monthly average'
      },
      {
        id: 'active-batches',
        label: 'Active Batches',
        value: data.activeBatches || '—',
        trend: data.trends?.batches || '+0',
        trendUp: !data.trends?.batches?.startsWith('-'),
        color: 'violet',
        icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
        sub: 'Across all campuses'
      },
      {
        id: 'performance',
        label: 'Performance Index',
        value: `${data.performanceIndex || 0}`,
        trend: data.trends?.performance || '+0%',
        trendUp: !data.trends?.performance?.startsWith('-'),
        color: 'cyan',
        icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
        sub: 'Composite score /100'
      }
    ];

    el.innerHTML = cards.map(card => this._kpiTemplate(card)).join('');

    // Animate counters
    el.querySelectorAll('.kpi-value[data-count]').forEach(el => {
      this._animateCount(el);
    });
  },

  _kpiTemplate({ id, label, value, trend, trendUp, color, icon, sub }) {
    const colorMap = {
      blue: '#4f85f7', green: '#10b981', yellow: '#f59e0b',
      violet: '#8b5cf6', cyan: '#06b6d4', red: '#ef4444'
    };
    const c = colorMap[color] || colorMap.blue;
    const trendColor = trendUp ? '#10b981' : '#ef4444';
    const trendArrow = trendUp
      ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>`
      : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`;

    return `
      <div class="kpi-card" id="kpi-${id}">
        <div class="kpi-card-header">
          <div class="kpi-icon-wrap" style="background:${c}18; color:${c};">${icon}</div>
          <div class="kpi-trend" style="color:${trendColor}; background:${trendColor}18;">
            ${trendArrow} ${trend}
          </div>
        </div>
        <div class="kpi-value">${value}</div>
        <div class="kpi-label">${label}</div>
        <div class="kpi-sub">${sub}</div>
        <div class="kpi-bar"><div class="kpi-bar-fill" style="background:${c};width:0%" data-width="72%"></div></div>
      </div>
    `;
  },

  // Skeleton loader for KPIs
  renderSkeletons(container, count = 4) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    el.innerHTML = Array(count).fill(`
      <div class="kpi-card skeleton-card">
        <div class="skeleton-line w-40"></div>
        <div class="skeleton-line w-60 h-36 mt-8"></div>
        <div class="skeleton-line w-80 mt-8"></div>
        <div class="skeleton-line w-full h-4 mt-12"></div>
      </div>
    `).join('');
  },

  // Animate KPI bar fills
  animateBars() {
    document.querySelectorAll('.kpi-bar-fill[data-width]').forEach(bar => {
      setTimeout(() => {
        bar.style.transition = 'width 0.9s cubic-bezier(0.16,1,0.3,1)';
        bar.style.width = bar.dataset.width;
      }, 200);
    });
  },

  _animateCount(el) {
    const raw = el.textContent.trim();
    const num = parseFloat(raw.replace(/[^0-9.]/g, ''));
    if (isNaN(num)) return;
    const suffix = raw.replace(/[0-9.,]/g, '');
    const duration = 1200;
    const steps = 60;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      const progress = step / steps;
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = num * ease;
      el.textContent = (current >= 1000 ? current.toLocaleString(undefined, { maximumFractionDigits: 0 }) : current.toFixed(1)) + suffix;
      if (step >= steps) clearInterval(timer);
    }, duration / steps);
  }
};
