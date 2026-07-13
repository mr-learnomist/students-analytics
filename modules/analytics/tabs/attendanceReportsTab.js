// ============================================================
// modules/analytics/tabs/attendanceReportsTab.js
// Attendance Reports Tab — report cards
// ============================================================

import { AppState }              from '../../../utils/state.js';
import { Auth }                  from '../../../utils/auth.js';
import { mountAttendanceSheet }  from '../reports/attendance/attendanceSheet.js';
import { mountBatchwiseDetailAttendance } from '../reports/attendance/batchwiseDetailAttendance.js';

// ── Report registry ───────────────────────────────────────────
// Naya report add karna ho: yahan ek entry add karo aur
// _renderAttendanceSheet() jaisi ek render function likho.
const REPORTS = [
  {
    id:          'attendanceSheet',
    label:       'Attendance Sheet',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
             <path d="M9 11l3 3L22 4"/>
             <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
           </svg>`,
    render: mountAttendanceSheet,
  },
  {
    id:          'batchwiseDetailAttendance',
    label:       'Batchwise Detail Attendance',
    description: 'Full date-wise sheet for a batch, filled with attendance already marked in Daily Attendance.',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
             <rect x="3" y="4" width="18" height="18" rx="2"/>
             <path d="M16 2v4M8 2v4M3 10h18"/>
             <path d="M7 15h2M11 15h2M15 15h2M7 18h2M11 18h2"/>
           </svg>`,
    render: mountBatchwiseDetailAttendance,
  },
  // Future reports — uncomment and implement when ready:
  // { id: 'absenteeReport', label: 'Absentee Report', description: '...', icon: '...', render: _renderAbsenteeReport },
  // { id: 'monthlyTrend',   label: 'Monthly Trend',   description: '...', icon: '...', render: _renderMonthlyTrend   },
];

// ── Module entry point ────────────────────────────────────────
export const AttendanceReportsTab = {

  _active: null,

  mount(container) {
    if (!container) return;
    this._active = null;
    this._renderList(container);
  },

  // ── Report card list ────────────────────────────────────────
  _renderList(container) {
    container.innerHTML = `
      <div id="attRepList">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;padding:4px 0">
          ${REPORTS.map(r => `
            <div class="att-rep-card" data-rep="${r.id}" style="
                background:var(--surface);border:1px solid var(--border);
                border-radius:var(--r-lg);padding:20px;cursor:pointer;
                transition:border-color .15s,box-shadow .15s;
                display:flex;flex-direction:column;gap:12px">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
                <div style="width:44px;height:44px;border-radius:var(--r-sm);flex-shrink:0;
                            display:flex;align-items:center;justify-content:center;
                            background:rgba(59,130,246,.1);color:var(--blue)">
                  ${r.icon}
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--t4)" stroke-width="2" style="margin-top:4px;flex-shrink:0">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
              <div>
                <div style="font-size:14px;font-weight:700;color:var(--t1);margin-bottom:4px">${r.label}</div>
                <div style="font-size:12px;color:var(--t3);line-height:1.55">${r.description}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <div id="attRepPanel" style="display:none"></div>

      <style>
        .att-rep-card:hover {
          border-color: var(--blue);
          box-shadow: 0 0 0 3px rgba(59,130,246,.08);
        }
      </style>`;

    container.querySelectorAll('.att-rep-card').forEach(card => {
      card.addEventListener('click', () => {
        const rep = REPORTS.find(r => r.id === card.dataset.rep);
        if (!rep) return;
        this._active = rep.id;
        container.querySelector('#attRepList').style.display  = 'none';
        const panel = container.querySelector('#attRepPanel');
        panel.style.display = 'block';
        panel.innerHTML = '';
        rep.render(panel, () => {
          // back callback
          this._active = null;
          panel.style.display = 'none';
          panel.innerHTML     = '';
          container.querySelector('#attRepList').style.display = '';
        });
      });
    });
  },
};

// ── Future reports add karne ka tarika ────────────────────────
// 1. reports/attendance/ folder mein naya file banao
//    (e.g. absenteeReport.js) — mountAttendanceSheet jaise structure mein
// 2. Upar import karo
// 3. REPORTS array mein entry add karo: { id, label, description, icon, render: mountXxx }
