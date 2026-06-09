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

    /* Multi-filter dropdown — same as batchTimelineReport tl-mf */
    .ba-mf { position:relative; flex-shrink:0; }
    .ba-mf-btn {
      display:flex; align-items:center; gap:5px; cursor:pointer;
      padding:0 10px; height:34px; border:1px solid var(--border);
      border-radius:8px; background:var(--surface2); color:var(--t2);
      font-size:12.5px; white-space:nowrap; user-select:none;
      min-width:90px; max-width:180px; font-family:inherit;
    }
    .ba-mf-btn:hover { border-color:var(--blue); color:var(--blue); }
    .ba-mf-btn.active { border-color:var(--blue); background:var(--blue-dim); color:var(--blue); font-weight:600; }
    .ba-mf-btn .mf-label { overflow:hidden; text-overflow:ellipsis; flex:1; }
    .ba-mf-btn .mf-caret { font-size:9px; flex-shrink:0; opacity:.6; }
    .ba-mf-btn .mf-badge { background:var(--blue); color:#fff; font-size:9.5px; font-weight:700; border-radius:10px; padding:1px 5px; flex-shrink:0; }
    .ba-mf-panel {
      position:absolute; top:calc(100% + 4px); left:0; z-index:999;
      background:var(--surface,#fff); border:1px solid var(--border);
      border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.12);
      min-width:180px; max-width:260px; overflow:hidden;
      display:none; flex-direction:column;
    }
    .ba-mf-panel.open { display:flex; }
    .ba-mf-search { padding:8px 10px 4px; border-bottom:1px solid var(--border); }
    .ba-mf-search input {
      width:100%; padding:4px 8px; font-size:12px;
      border:1px solid var(--border); border-radius:6px;
      background:var(--surface2); color:var(--t1); outline:none;
    }
    .ba-mf-list { overflow-y:auto; max-height:220px; padding:4px 0; }
    .ba-mf-item {
      display:flex; align-items:center; gap:9px; padding:7px 12px;
      cursor:pointer; font-size:12.5px; color:var(--t2);
      transition:background .1s,color .1s; user-select:none;
    }
    .ba-mf-item:hover { background:var(--blue-dim); color:var(--blue); }
    .ba-mf-item.checked { color:var(--blue); font-weight:600; }
    .ba-mf-chk {
      width:15px; height:15px; border-radius:4px; flex-shrink:0;
      border:1.5px solid var(--border2); display:inline-flex;
      align-items:center; justify-content:center;
      transition:all .12s; background:var(--surface);
    }
    .ba-mf-item.checked .ba-mf-chk { background:var(--blue); border-color:var(--blue); }
    .ba-mf-item.checked .ba-mf-chk::after {
      content:''; display:block; width:4px; height:7px;
      border:2px solid #fff; border-top:none; border-left:none;
      transform:rotate(45deg) translate(-1px,-1px);
    }
    .ba-mf-lbl { flex:1; }
    .ba-mf-footer {
      border-top:1px solid var(--border); padding:7px 10px;
      display:flex; justify-content:space-between; align-items:center;
      gap:6px; background:var(--surface2);
    }
    .ba-mf-count { font-size:11px; color:var(--t3); }
    .ba-mf-clear {
      font-size:11px; padding:3px 10px; border-radius:6px;
      cursor:pointer; border:1px solid var(--border);
      background:var(--surface); color:var(--t2); font-family:inherit; transition:all .12s;
    }
    .ba-mf-clear:hover { border-color:var(--red,#ef4444); color:var(--red,#ef4444); }

    /* Table */
    .ba-table-wrap {
      border:1px solid var(--border); border-radius:var(--r-sm);
      overflow:auto; max-height:calc(100vh - 340px);
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

// ── Multi-filter widget (same pattern as batchTimelineReport) ─
function _initMultiFilter(wrap, allLabel, items, onchange) {
  wrap._mfItems    = items;
  wrap._mfSelected = wrap._mfSelected || new Set();

  const btn   = document.createElement('div');
  btn.className = 'ba-mf-btn';
  const panel = document.createElement('div');
  panel.className = 'ba-mf-panel';
  wrap.appendChild(btn);
  wrap.appendChild(panel);

  const renderBtn = () => {
    const sel = wrap._mfSelected;
    if (sel.size === 0) {
      btn.className = 'ba-mf-btn';
      btn.innerHTML = `<span class="mf-label">${allLabel}</span><span class="mf-caret">▾</span>`;
    } else {
      btn.className = 'ba-mf-btn active';
      const lbl   = sel.size === 1
        ? (items.find(i => i.val === [...sel][0])?.label || '')
        : `${sel.size} selected`;
      const short = lbl.length > 18 ? lbl.slice(0, 16) + '…' : lbl;
      btn.innerHTML = `<span class="mf-label">${short}</span><span class="mf-badge">${sel.size}</span><span class="mf-caret">▾</span>`;
    }
  };

  const renderList = (q = '') => {
    const filtered = items.filter(i => !q || i.label.toLowerCase().includes(q.toLowerCase()));
    panel.innerHTML = `
      <div class="ba-mf-search"><input placeholder="Search…" value="${q}" autocomplete="off"/></div>
      <div class="ba-mf-list">
        ${filtered.length
          ? filtered.map(i => `
              <div class="ba-mf-item ${wrap._mfSelected.has(i.val) ? 'checked' : ''}" data-val="${i.val}">
                <span class="ba-mf-chk"></span>
                <span class="ba-mf-lbl">${i.label}</span>
              </div>`).join('')
          : '<div style="padding:12px;font-size:12px;color:var(--t4);text-align:center">No results</div>'}
      </div>
      <div class="ba-mf-footer">
        <span class="ba-mf-count">${wrap._mfSelected.size} selected</span>
        <button class="ba-mf-clear">✕ Clear</button>
      </div>`;

    const inp = panel.querySelector('.ba-mf-search input');
    inp.addEventListener('input', e => renderList(e.target.value));
    setTimeout(() => inp.focus(), 0);

    panel.querySelectorAll('.ba-mf-item').forEach(item => {
      item.addEventListener('click', e => {
        e.stopPropagation();
        const val = item.dataset.val;
        if (wrap._mfSelected.has(val)) wrap._mfSelected.delete(val);
        else                           wrap._mfSelected.add(val);
        item.classList.toggle('checked', wrap._mfSelected.has(val));
        const cnt = panel.querySelector('.ba-mf-count');
        if (cnt) cnt.textContent = `${wrap._mfSelected.size} selected`;
        renderBtn();
        onchange([...wrap._mfSelected]);
      });
    });

    panel.querySelector('.ba-mf-clear').addEventListener('click', e => {
      e.stopPropagation();
      wrap._mfSelected.clear();
      renderBtn();
      renderList(inp ? inp.value : '');
      onchange([]);
    });
  };

  wrap._mfRenderList = renderList;
  renderList();
  renderBtn();

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = panel.classList.contains('open');
    document.querySelectorAll('.ba-mf-panel.open').forEach(p => p.classList.remove('open'));
    if (!isOpen) { panel.classList.add('open'); renderList(''); }
  });
}

// ── Main render ──────────────────────────────────────────────
function renderBatchAllocation(el, state) {
  _injectStyles();

  const allBatches  = Auth.filterByCampus(AppState.get('batches')     || [], 'campusId');
  const campuses    = AppState.get('campuses')    || [];
  const teachers    = AppState.get('teachers')    || [];
  const subjects    = AppState.get('subjects')    || [];
  const levels      = AppState.get('levels')      || [];
  const disciplines = AppState.get('disciplines') || [];
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

  // ── Build filter option lists (same as batchTimelineReport) ──
  const campItems    = campuses.filter(c => assigned.some(b => b.campusId === c.id))
    .map(c => ({ val: c.id, label: c.campusName.replace(/\s*campus$/i, '').trim() }));
  const discItems    = disciplines.filter(d => assigned.some(b => b.disciplineId === d.id))
    .map(d => ({ val: d.id, label: `${d.abbreviation} — ${d.fullName}` }));
  const levelItems   = levels.filter(l => assigned.some(b => {
    const levelId = subjects.find(s => s.id === b.subjectId)?.levelId || b.levelId;
    return levelId === l.id;
  })).map(l => ({ val: l.id, label: l.levelName || l.name || l.id }));
  const subjItems    = subjects.filter(s => assigned.some(b => b.subjectId === s.id))
    .map(s => ({ val: s.id, label: `${s.subjectCode} — ${s.subjectName}` }));
  const sessionItems = uniqueSessions.map(s => ({ val: s, label: s }));

  const anyFilter = state.campFilter.length || state.discFilter.length ||
                    state.levelFilter.length || state.subjFilter.length ||
                    state.sessionFilter.length;

  // ── Apply filters to get filtered batches ────────────────────
  let filteredAssigned = assigned;
  if (state.campFilter.length)    filteredAssigned = filteredAssigned.filter(b => state.campFilter.includes(b.campusId));
  if (state.discFilter.length)    filteredAssigned = filteredAssigned.filter(b => state.discFilter.includes(b.disciplineId));
  if (state.levelFilter.length)   filteredAssigned = filteredAssigned.filter(b => {
    const levelId = subjects.find(s => s.id === b.subjectId)?.levelId || b.levelId;
    return state.levelFilter.includes(levelId);
  });
  if (state.subjFilter.length)    filteredAssigned = filteredAssigned.filter(b => state.subjFilter.includes(b.subjectId));
  if (state.sessionFilter.length) filteredAssigned = filteredAssigned.filter(b => state.sessionFilter.includes(b.sessionPeriod));

  // ── Build table data ─────────────────────────────────────────
  const buildTable = (session) => {
    const sessionBatches = filteredAssigned.filter(b => b.sessionPeriod === session);

    // Teacher name helper
    const teacherName = (b) => {
      const t = teachers.find(t => t.id === b.teacherId);
      if (!t) return '—';
      return t.fullName || t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim() || '—';
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

      <!-- Toolbar row 1: Filters -->
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <div class="ba-mf" id="baCampFilter"></div>
        <div class="ba-mf" id="baDiscFilter"></div>
        <div class="ba-mf" id="baLevelFilter"></div>
        <div class="ba-mf" id="baSubjFilter"></div>
        <div class="ba-mf" id="baSessFilter"></div>

        <button id="baApplyBtn" class="ba-apply-btn" ${!state.session ? 'disabled' : ''}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Apply
        </button>

        ${anyFilter ? `
          <button id="baClearAll" style="display:inline-flex;align-items:center;gap:5px;height:34px;padding:0 12px;
            border-radius:8px;border:1px solid rgba(239,68,68,.35);background:rgba(239,68,68,.06);
            color:var(--red,#ef4444);font-size:12px;font-weight:600;cursor:pointer;
            white-space:nowrap;font-family:inherit">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            Clear Filters
          </button>` : ''}

        <span style="font-size:12px;color:var(--t3);flex-shrink:0;white-space:nowrap;margin-left:auto">
          ${filteredAssigned.length} batch${filteredAssigned.length !== 1 ? 'es' : ''}
        </span>

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
          </button>` : ''}
      </div>

      <!-- Toolbar row 2: Session pills -->
      <div>
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

  // ── Init multi-filters ────────────────────────────────────────
  const campWrap  = el.querySelector('#baCampFilter');
  const discWrap  = el.querySelector('#baDiscFilter');
  const levelWrap = el.querySelector('#baLevelFilter');
  const subjWrap  = el.querySelector('#baSubjFilter');
  const sessWrap  = el.querySelector('#baSessFilter');

  _initMultiFilter(campWrap,  'All Campuses',    campItems,    vals => { state.campFilter    = vals; });
  _initMultiFilter(discWrap,  'All Disciplines', discItems,    vals => { state.discFilter    = vals; });
  _initMultiFilter(levelWrap, 'All Levels',      levelItems,   vals => { state.levelFilter   = vals; });
  _initMultiFilter(subjWrap,  'All Subjects',    subjItems,    vals => { state.subjFilter    = vals; });
  _initMultiFilter(sessWrap,  'All Sessions',    sessionItems, vals => { state.sessionFilter = vals; });

  // Restore selected values after re-render
  const restoreMF = (wrap, vals) => {
    if (!vals.length || !wrap?._mfSelected) return;
    vals.forEach(v => wrap._mfSelected.add(v));
    if (wrap._mfRenderList) wrap._mfRenderList('');
    const b = wrap.querySelector('.ba-mf-btn');
    if (b) {
      b.classList.add('active');
      const lbl   = vals.length === 1
        ? (wrap._mfItems?.find(i => i.val === vals[0])?.label || vals[0])
        : `${vals.length} selected`;
      const short = lbl.length > 18 ? lbl.slice(0, 16) + '…' : lbl;
      b.innerHTML = `<span class="mf-label">${short}</span><span class="mf-badge">${vals.length}</span><span class="mf-caret">▾</span>`;
    }
  };
  restoreMF(campWrap,  state.campFilter);
  restoreMF(discWrap,  state.discFilter);
  restoreMF(levelWrap, state.levelFilter);
  restoreMF(subjWrap,  state.subjFilter);
  restoreMF(sessWrap,  state.sessionFilter);

  // Close panels on outside click
  document.addEventListener('click', () => {
    document.querySelectorAll('.ba-mf-panel.open').forEach(p => p.classList.remove('open'));
  });

  // ── Events ───────────────────────────────────────────────────

  // Session pill click
  el.querySelector('#baSessionWrap')?.addEventListener('click', e => {
    const pill = e.target.closest('.ba-session-pill');
    if (!pill) return;
    state.session = pill.dataset.session;
    state.applied = false;
    el.querySelectorAll('.ba-session-pill').forEach(p =>
      p.classList.toggle('active', p.dataset.session === state.session)
    );
    const applyBtn = el.querySelector('#baApplyBtn');
    if (applyBtn) applyBtn.disabled = false;
  });

  // Apply
  el.querySelector('#baApplyBtn')?.addEventListener('click', () => {
    if (!state.session) return;
    state.applied = true;
    renderBatchAllocation(el, state);
  });

  // Clear all filters
  el.querySelector('#baClearAll')?.addEventListener('click', () => {
    state.campFilter = []; state.discFilter = []; state.levelFilter = [];
    state.subjFilter = []; state.sessionFilter = [];
    state.applied = false;
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
      ...dataRows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `batch-allocation-${state.session}-${dateStr.replace(/ /g, '-')}.csv`; a.click();
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
      No LP-assigned batches found for this session and selected filters.
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
    // Persist state across re-renders
    if (!this._state) {
      this._state = {
        session:       null,
        applied:       false,
        campFilter:    [],
        discFilter:    [],
        levelFilter:   [],
        subjFilter:    [],
        sessionFilter: [],
      };
    }
    renderBatchAllocation(container, this._state);
  }
};
