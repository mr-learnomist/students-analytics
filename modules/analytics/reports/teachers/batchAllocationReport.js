// ============================================================
// modules/analytics/reports/teachers/batchAllocationReport.js
// Batch Allocation Report — Teacher × Batch grid, session-wise
// Data source: lpAssignments (same as batchTimelineReport)
// ============================================================

import { AppState } from '../../../../utils/state.js';
import { Auth }     from '../../../../utils/auth.js';

// ── Style injection ──────────────────────────────────────────
function _injectStyles() {
  if (document.getElementById('ba-report-style')) return;
  const st = document.createElement('style');
  st.id = 'ba-report-style';
  st.textContent = `
    /* Session pill selector */
    .ba-session-wrap {
      display:flex; flex-wrap:wrap; gap:8px; align-items:center;
    }
    .ba-session-pill {
      display:inline-flex; align-items:center; gap:6px;
      padding:6px 14px; border-radius:20px;
      border:1.5px solid var(--border);
      background:var(--surface2); color:var(--t2);
      font-size:12.5px; font-weight:500; cursor:pointer;
      transition:all .15s; user-select:none; font-family:inherit;
      white-space:nowrap;
    }
    .ba-session-pill:hover   { border-color:var(--blue); color:var(--blue); }
    .ba-session-pill.active  { border-color:var(--blue); background:var(--blue); color:#fff; font-weight:700; }

    /* Apply btn */
    .ba-apply-btn {
      display:inline-flex; align-items:center; gap:6px;
      height:34px; padding:0 18px; border-radius:8px;
      border:none; background:var(--blue); color:#fff;
      font-size:12.5px; font-weight:700; cursor:pointer;
      font-family:inherit; box-shadow:0 1px 6px rgba(59,130,246,.2);
      transition:opacity .15s;
    }
    .ba-apply-btn:hover { opacity:.88; }
    .ba-apply-btn:disabled { opacity:.45; cursor:not-allowed; }

    /* Export btns */
    .ba-export-btn {
      display:inline-flex; align-items:center; justify-content:center;
      width:32px; height:32px; border-radius:7px;
      border:1px solid var(--border); background:var(--surface2);
      color:var(--t3); cursor:pointer; transition:all .15s;
    }
    .ba-export-btn:hover { border-color:var(--blue); color:var(--blue); background:var(--blue-dim); }

    /* Table */
    .ba-table-wrap {
      border:1px solid var(--border); border-radius:var(--r-sm);
      overflow:auto; max-height:calc(100vh - 300px);
    }
    .ba-table {
      width:100%; border-collapse:collapse; font-size:13px;
    }
    .ba-table thead th {
      position:sticky; top:0; z-index:3;
      background:#1e3a8a; color:#fff;
      font-size:11px; font-weight:700; text-transform:uppercase;
      letter-spacing:.04em; padding:10px 12px;
      border-right:1px solid rgba(255,255,255,.12);
      white-space:nowrap;
    }
    .ba-table thead th:last-child { border-right:none; }
    .ba-table thead th.ba-th-teacher { text-align:left; min-width:180px; }
    .ba-table thead th.ba-th-batch   { text-align:center; min-width:90px; }
    .ba-table thead th.ba-th-total   { text-align:center; min-width:70px; background:#1e293b; }

    .ba-table tbody tr {
      border-bottom:1px solid var(--border);
      transition:background .12s;
    }
    .ba-table tbody tr:hover { background:var(--surface2); }
    .ba-table tbody tr:last-child { border-bottom:none; }

    .ba-td-teacher {
      padding:10px 14px; font-size:13px; font-weight:600; color:var(--t1);
      border-right:1px solid var(--border); white-space:nowrap;
    }
    .ba-td-batch {
      padding:10px 12px; text-align:center;
      font-size:12.5px; color:var(--t1);
      border-right:1px solid var(--border);
    }
    .ba-td-total {
      padding:10px 12px; text-align:center;
      font-size:13px; font-weight:700; color:var(--blue);
    }
    .ba-batch-tag {
      display:inline-block; padding:3px 9px;
      border-radius:6px; font-size:11.5px; font-weight:600;
      background:var(--blue-dim); color:var(--blue);
      white-space:nowrap;
    }
    .ba-dash { color:var(--t4); font-size:13px; }

    /* Summary bar */
    .ba-summary {
      display:flex; gap:12px; flex-wrap:wrap;
    }
    .ba-stat {
      display:flex; flex-direction:column; align-items:center;
      padding:8px 18px; border-radius:10px;
      border:1px solid var(--border); background:var(--surface2);
      min-width:80px;
    }
    .ba-stat-n { font-size:20px; font-weight:700; color:var(--blue); }
    .ba-stat-l { font-size:10px; color:var(--t3); text-transform:uppercase; letter-spacing:.04em; margin-top:1px; }
  `;
  document.head.appendChild(st);
}

// ── Main render ──────────────────────────────────────────────
function renderBatchAllocation(el, state) {
  _injectStyles();

  const allBatches  = Auth.filterByCampus(AppState.get('batches')  || [], 'campusId');
  const teachers    = AppState.get('teachers')    || [];
  const subjects    = AppState.get('subjects')    || [];
  const allAssign   = AppState.get('lpAssignments') || {};

  // Only LP-assigned batches
  const assigned = allBatches.filter(b => allAssign[b.id]);

  // Unique sessions sorted newest first
  const uniqueSessions = [...new Set(assigned.map(b => b.sessionPeriod).filter(Boolean))].sort((a, b) => {
    const parse = v => {
      const [n, yy] = (v || '').split('-');
      return parseInt(yy || 0) * 2 + (n === 'June' ? 1 : 0);
    };
    return parse(b) - parse(a);
  });

  // ── Build table data for selected session ────────────────────
  const buildTable = (session) => {
    const sessionBatches = assigned.filter(b => b.sessionPeriod === session);

    // Teacher name helper
    const teacherName = (b) => {
      const t = teachers.find(t => t.id === b.teacherId);
      if (!t) return '—';
      return t.fullName || t.name || `${t.firstName||''} ${t.lastName||''}`.trim() || '—';
    };

    // Subject code helper
    const subjectCode = (b) => {
      const lpa  = allAssign[b.id];
      const subj = subjects.find(s => s.id === b.subjectId);
      return b.subjectCode || lpa?.subjectCode || subj?.subjectCode || lpa?.lpCode || '?';
    };

    // Batch number (padded)
    const batchNo = (b) => b.batchNo != null ? String(b.batchNo).padStart(2, '0') : null;

    // Group by teacher
    const byTeacher = {};
    sessionBatches.forEach(b => {
      const name = teacherName(b);
      if (!byTeacher[name]) byTeacher[name] = [];
      byTeacher[name].push({
        code: subjectCode(b),
        no:   batchNo(b),
        tag:  batchNo(b) ? `${subjectCode(b)}-${batchNo(b)}` : subjectCode(b),
      });
    });

    // Sort teachers: Ms first, then Sir, then others — alphabetically within group
    const sortedTeachers = Object.keys(byTeacher).sort((a, b) => {
      const rank = n => n.startsWith('Ms') ? 0 : n.startsWith('Sir') ? 1 : 2;
      return rank(a) - rank(b) || a.localeCompare(b);
    });

    // Max batches any teacher has → number of columns
    const maxBatches = Math.max(...sortedTeachers.map(t => byTeacher[t].length), 0);

    return { byTeacher, sortedTeachers, maxBatches, sessionBatches };
  };

  // ── Render shell ─────────────────────────────────────────────
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:16px">

      <!-- Toolbar -->
      <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">

        <!-- Session pills -->
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;
                      letter-spacing:.05em;margin-bottom:8px">Select Session</div>
          <div class="ba-session-wrap" id="baSessionWrap">
            ${uniqueSessions.length
              ? uniqueSessions.map(s => `
                  <button class="ba-session-pill${state.session === s ? ' active' : ''}"
                          data-session="${s}">${s}</button>
                `).join('')
              : `<span style="font-size:13px;color:var(--t3)">No sessions found</span>`
            }
          </div>
        </div>

        <!-- Apply + Export -->
        <div style="display:flex;align-items:flex-end;gap:8px;padding-top:26px;flex-shrink:0">
          <button class="ba-apply-btn" id="baApplyBtn" ${!state.session ? 'disabled' : ''}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Apply
          </button>
          ${state.applied ? `
            <button class="ba-export-btn" id="baExportCSV" title="Export CSV">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>
              </svg>
            </button>
            <button class="ba-export-btn" id="baExportPDF" title="Export PDF">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="9" y1="15" x2="15" y2="15"/>
              </svg>
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Content -->
      <div id="baContent">
        ${!state.applied
          ? `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                         min-height:220px;gap:14px;color:var(--t3);
                         border:1px dashed var(--border2);border-radius:var(--r-lg)">
               <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                 <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                 <circle cx="9" cy="7" r="4"/>
                 <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                 <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
               </svg>
               <div style="font-size:13.5px;font-weight:600;color:var(--t2)">Select a session and click Apply</div>
             </div>`
          : _tableHTML(buildTable(state.session))
        }
      </div>
    </div>
  `;

  // ── Events ───────────────────────────────────────────────────

  // Session pill click
  el.querySelector('#baSessionWrap')?.addEventListener('click', e => {
    const pill = e.target.closest('.ba-session-pill');
    if (!pill) return;
    state.session = pill.dataset.session;
    state.applied = false;
    el.querySelectorAll('.ba-session-pill').forEach(p => p.classList.toggle('active', p.dataset.session === state.session));
    const applyBtn = el.querySelector('#baApplyBtn');
    if (applyBtn) applyBtn.disabled = false;
  });

  // Apply
  el.querySelector('#baApplyBtn')?.addEventListener('click', () => {
    if (!state.session) return;
    state.applied = true;
    renderBatchAllocation(el, state);
  });

  // CSV export
  el.querySelector('#baExportCSV')?.addEventListener('click', () => {
    if (!state.applied || !state.session) return;
    const { byTeacher, sortedTeachers, maxBatches, sessionBatches } = buildTable(state.session);
    const headers = ['Teacher', ...Array.from({ length: maxBatches }, (_, i) => `Batch ${i + 1}`), 'Total'];
    const dataRows = sortedTeachers.map(name => {
      const batches = byTeacher[name];
      const cells   = Array.from({ length: maxBatches }, (_, i) => batches[i]?.tag || '—');
      return [name, ...cells, batches.length];
    });
    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const csv = [
      `Batch Allocation Report — Session: ${state.session} — Generated: ${dateStr}`,
      `Total Teachers: ${sortedTeachers.length}  |  Total Batches: ${sessionBatches.length}`,
      '',
      headers.join(','),
      ...dataRows.map(row => row.map(c => `"${String(c).replace(/"/g,'""')}"`).join(','))
    ].join('\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `batch-allocation-${state.session}-${dateStr.replace(/ /g,'-')}.csv`; a.click();
    URL.revokeObjectURL(url);
  });

  // PDF export
  el.querySelector('#baExportPDF')?.addEventListener('click', () => {
    if (!state.applied || !state.session) return;
    const { byTeacher, sortedTeachers, maxBatches, sessionBatches } = buildTable(state.session);
    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

    const thCells = [
      `<th style="background:#1e3a8a;color:#fff;padding:10px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;min-width:160px">Teacher</th>`,
      ...Array.from({ length: maxBatches }, (_, i) =>
        `<th style="background:#1e3a8a;color:#fff;padding:10px 12px;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;min-width:80px">${i + 1}</th>`
      ),
      `<th style="background:#1e293b;color:#fff;padding:10px 12px;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">Total</th>`,
    ].join('');

    const tdRows = sortedTeachers.map((name, idx) => {
      const batches = byTeacher[name];
      const bg = idx % 2 === 0 ? '#f8faff' : '#fff';
      const tdName = `<td style="padding:9px 14px;border-bottom:1px solid #e2e8f0;font-size:11.5px;font-weight:600;color:#1e293b;background:${bg};border-right:1px solid #e2e8f0;white-space:nowrap">${name}</td>`;
      const tdBatches = Array.from({ length: maxBatches }, (_, i) => {
        const tag = batches[i]?.tag;
        return `<td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:11px;background:${bg};border-right:1px solid #e2e8f0">
          ${tag ? `<span style="background:#eff6ff;color:#2563eb;padding:2px 8px;border-radius:5px;font-weight:600;font-size:11px">${tag}</span>` : `<span style="color:#cbd5e1">—</span>`}
        </td>`;
      }).join('');
      const tdTotal = `<td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:13px;font-weight:700;color:#2563eb;background:${bg}">${batches.length}</td>`;
      return `<tr>${tdName}${tdBatches}${tdTotal}</tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Batch Allocation Report</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#1e293b;background:#fff;padding:20px 24px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #2563eb;padding-bottom:12px;margin-bottom:14px}
  .title{font-size:20px;font-weight:700;color:#1e40af}
  .subtitle{font-size:11px;color:#64748b;margin-top:3px}
  .meta{text-align:right;font-size:10.5px;color:#64748b;line-height:1.6}
  .meta strong{color:#1e293b;font-size:11px}
  .stat-row{display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap}
  .stat{background:#f8faff;border:1px solid #dbeafe;border-radius:8px;padding:6px 16px;text-align:center}
  .stat-n{font-size:18px;font-weight:700;color:#2563eb}
  .stat-l{font-size:9.5px;color:#64748b;text-transform:uppercase;letter-spacing:.4px}
  table{width:100%;border-collapse:collapse}
  .footer{margin-top:14px;padding-top:10px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9.5px;color:#94a3b8}
  @media print{body{padding:12px 14px}@page{size:A4 landscape;margin:10mm}.no-print{display:none}}
</style></head><body>
  <div class="header">
    <div>
      <div class="title">Batch Allocation Report</div>
      <div class="subtitle">Session: ${state.session}</div>
    </div>
    <div class="meta"><strong>${dateStr}</strong><br>${timeStr}</div>
  </div>
  <div class="stat-row">
    <div class="stat"><div class="stat-n">${sortedTeachers.length}</div><div class="stat-l">Teachers</div></div>
    <div class="stat"><div class="stat-n">${sessionBatches.length}</div><div class="stat-l">Total Batches</div></div>
    <div class="stat"><div class="stat-n">${maxBatches}</div><div class="stat-l">Max per Teacher</div></div>
  </div>
  <table>
    <thead><tr>${thCells}</tr></thead>
    <tbody>${tdRows}</tbody>
  </table>
  <div class="footer">
    <span>Batch Allocation Report &nbsp;|&nbsp; Session: ${state.session} &nbsp;|&nbsp; ${dateStr} at ${timeStr}</span>
    <span>${sortedTeachers.length} teacher${sortedTeachers.length !== 1 ? 's' : ''} · ${sessionBatches.length} batch${sessionBatches.length !== 1 ? 'es' : ''}</span>
  </div>
  <div class="no-print" style="margin-top:18px;text-align:center">
    <button onclick="window.print()"
      style="padding:9px 28px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">
      Print / Save as PDF
    </button>
  </div>
</body></html>`;

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 500);
  });
}

// ── Table HTML builder ───────────────────────────────────────
function _tableHTML({ byTeacher, sortedTeachers, maxBatches, sessionBatches }) {
  if (!sortedTeachers.length) {
    return `<div style="padding:40px;text-align:center;color:var(--t3);font-size:13px">
      No LP-assigned batches found for this session.
    </div>`;
  }

  const totalBatches = sessionBatches.length;
  const maxLoad      = Math.max(...sortedTeachers.map(t => byTeacher[t].length));

  return `
    <!-- Summary -->
    <div class="ba-summary" style="margin-bottom:14px">
      <div class="ba-stat">
        <span class="ba-stat-n">${sortedTeachers.length}</span>
        <span class="ba-stat-l">Teachers</span>
      </div>
      <div class="ba-stat">
        <span class="ba-stat-n">${totalBatches}</span>
        <span class="ba-stat-l">Total Batches</span>
      </div>
      <div class="ba-stat">
        <span class="ba-stat-n">${maxLoad}</span>
        <span class="ba-stat-l">Max Load</span>
      </div>
    </div>

    <!-- Table -->
    <div class="ba-table-wrap">
      <table class="ba-table">
        <thead>
          <tr>
            <th class="ba-th-teacher">Teacher</th>
            ${Array.from({ length: maxBatches }, (_, i) =>
              `<th class="ba-th-batch">${i + 1}</th>`
            ).join('')}
            <th class="ba-th-total">Total</th>
          </tr>
        </thead>
        <tbody>
          ${sortedTeachers.map(name => {
            const batches = byTeacher[name];
            return `
              <tr>
                <td class="ba-td-teacher">${name}</td>
                ${Array.from({ length: maxBatches }, (_, i) => {
                  const b = batches[i];
                  return `<td class="ba-td-batch">
                    ${b ? `<span class="ba-batch-tag">${b.tag}</span>` : `<span class="ba-dash">—</span>`}
                  </td>`;
                }).join('')}
                <td class="ba-td-total">${batches.length}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── Export ───────────────────────────────────────────────────
export const BatchAllocationReport = {
  mount(container) {
    if (!container) return;
    // Fresh state every mount — session must be selected each time
    this._state = {
      session: null,
      applied: false,
    };
    renderBatchAllocation(container, this._state);
  }
};
