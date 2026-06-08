// ============================================================
// modules/analytics/reports/teachers/teacherListReport.js
// Teacher List Report — filtered teacher table with export
// Filter + table pattern same as batchTimelineReport
// ============================================================

import { AppState } from '../../../../utils/state.js';
import { Auth }     from '../../../../utils/auth.js';

// ── Style injection ──────────────────────────────────────────
function _injectStyles() {
  if (document.getElementById('tl-report-style')) return;
  const st = document.createElement('style');
  st.id = 'tl-report-style';
  st.textContent = `
    .tl-mf { position:relative; flex-shrink:0; }
    .tl-mf-btn {
      display:flex; align-items:center; gap:5px; cursor:pointer;
      padding:0 10px; height:34px; border:1px solid var(--border);
      border-radius:8px; background:var(--surface2); color:var(--t2);
      font-size:12.5px; white-space:nowrap; user-select:none;
      min-width:90px; max-width:180px; font-family:inherit;
    }
    .tl-mf-btn:hover { border-color:var(--blue); color:var(--blue); }
    .tl-mf-btn.active { border-color:var(--blue); background:var(--blue-dim); color:var(--blue); font-weight:600; }
    .tl-mf-btn .mf-label { overflow:hidden; text-overflow:ellipsis; flex:1; }
    .tl-mf-btn .mf-caret { font-size:9px; flex-shrink:0; opacity:0.6; }
    .tl-mf-btn .mf-badge { background:var(--blue); color:#fff; font-size:9.5px; font-weight:700; border-radius:10px; padding:1px 5px; flex-shrink:0; }
    .tl-mf-panel { position:absolute; top:calc(100% + 4px); left:0; z-index:999; background:var(--surface,#fff); border:1px solid var(--border); border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.12); min-width:180px; max-width:260px; overflow:hidden; display:none; flex-direction:column; }
    .tl-mf-panel.open { display:flex; }
    .tl-mf-search { padding:8px 10px 4px; border-bottom:1px solid var(--border); }
    .tl-mf-search input { width:100%; padding:4px 8px; font-size:12px; border:1px solid var(--border); border-radius:6px; background:var(--surface2); color:var(--t1); outline:none; }
    .tl-mf-list { overflow-y:auto; max-height:220px; padding:4px 0; }
    .tl-mf-item { display:flex; align-items:center; gap:9px; padding:7px 12px; cursor:pointer; font-size:12.5px; color:var(--t2); transition:background .1s,color .1s; user-select:none; }
    .tl-mf-item:hover { background:var(--blue-dim); color:var(--blue); }
    .tl-mf-item.checked { color:var(--blue); font-weight:600; }
    .tl-mf-chk { width:15px; height:15px; border-radius:4px; flex-shrink:0; border:1.5px solid var(--border2); display:inline-flex; align-items:center; justify-content:center; transition:all .12s; background:var(--surface); }
    .tl-mf-item.checked .tl-mf-chk { background:var(--blue); border-color:var(--blue); }
    .tl-mf-item.checked .tl-mf-chk::after { content:''; display:block; width:4px; height:7px; border:2px solid #fff; border-top:none; border-left:none; transform:rotate(45deg) translate(-1px,-1px); }
    .tl-mf-lbl { flex:1; }
    .tl-mf-footer { border-top:1px solid var(--border); padding:7px 10px; display:flex; justify-content:space-between; align-items:center; gap:6px; background:var(--surface2); }
    .tl-mf-count { font-size:11px; color:var(--t3); }
    .tl-mf-clear { font-size:11px; padding:3px 10px; border-radius:6px; cursor:pointer; border:1px solid var(--border); background:var(--surface); color:var(--t2); font-family:inherit; transition:all .12s; }
    .tl-mf-clear:hover { border-color:var(--red,#ef4444); color:var(--red,#ef4444); }
    .tl-export-btn { display:inline-flex;align-items:center;justify-content:center; width:32px;height:32px;border-radius:7px;border:1px solid var(--border); background:var(--surface2);color:var(--t3);cursor:pointer;transition:all .15s; }
    .tl-export-btn:hover { border-color:var(--blue);color:var(--blue);background:var(--blue-dim); }

    /* Status badge */
    .tl-status-active   { display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600;background:#dcfce7;color:#16a34a; }
    .tl-status-inactive { display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600;background:#fee2e2;color:#dc2626; }
    .tl-status-dot { width:6px;height:6px;border-radius:50%;display:inline-block; }
  `;
  document.head.appendChild(st);
}

// ── Multi-filter (same as batchTimeline) ─────────────────────
function _initMultiFilter(wrap, allLabel, items, onchange) {
  wrap._mfItems    = items;
  wrap._mfSelected = new Set();

  const btn   = document.createElement('div');
  btn.className = 'tl-mf-btn';
  const panel = document.createElement('div');
  panel.className = 'tl-mf-panel';
  wrap.appendChild(btn);
  wrap.appendChild(panel);

  const renderBtn = () => {
    const sel = wrap._mfSelected;
    if (sel.size === 0) {
      btn.className = 'tl-mf-btn';
      btn.innerHTML = `<span class="mf-label">${allLabel}</span><span class="mf-caret">▾</span>`;
    } else {
      btn.className = 'tl-mf-btn active';
      const lbl   = sel.size === 1 ? (wrap._mfItems.find(i => i.val === [...sel][0])?.label || '') : `${sel.size} selected`;
      const short = lbl.length > 18 ? lbl.slice(0, 16) + '…' : lbl;
      btn.innerHTML = `<span class="mf-label">${short}</span><span class="mf-badge">${sel.size}</span><span class="mf-caret">▾</span>`;
    }
  };

  const renderList = (q = '') => {
    const filtered = wrap._mfItems.filter(i => !q || i.label.toLowerCase().includes(q.toLowerCase()));
    panel.innerHTML = `
      <div class="tl-mf-search"><input placeholder="Search…" value="${q}" autocomplete="off"/></div>
      <div class="tl-mf-list">
        ${filtered.length
          ? filtered.map(i => `
              <div class="tl-mf-item ${wrap._mfSelected.has(i.val) ? 'checked' : ''}" data-val="${i.val}">
                <span class="tl-mf-chk"></span>
                <span class="tl-mf-lbl">${i.label}</span>
              </div>`).join('')
          : '<div style="padding:12px;font-size:12px;color:var(--t4);text-align:center">No results</div>'
        }
      </div>
      <div class="tl-mf-footer">
        <span class="tl-mf-count">${wrap._mfSelected.size} selected</span>
        <button class="tl-mf-clear">✕ Clear</button>
      </div>`;

    const inp = panel.querySelector('.tl-mf-search input');
    inp.addEventListener('input', e => renderList(e.target.value));
    setTimeout(() => inp.focus(), 0);

    panel.querySelectorAll('.tl-mf-item').forEach(item => {
      item.addEventListener('click', e => {
        e.stopPropagation();
        const val = item.dataset.val;
        if (wrap._mfSelected.has(val)) wrap._mfSelected.delete(val);
        else                           wrap._mfSelected.add(val);
        item.classList.toggle('checked', wrap._mfSelected.has(val));
        const cnt = panel.querySelector('.tl-mf-count');
        if (cnt) cnt.textContent = `${wrap._mfSelected.size} selected`;
        renderBtn();
        onchange([...wrap._mfSelected]);
      });
    });

    panel.querySelector('.tl-mf-clear').addEventListener('click', e => {
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
    document.querySelectorAll('.tl-mf-panel.open').forEach(p => p.classList.remove('open'));
    if (!isOpen) { panel.classList.add('open'); renderList(''); }
  });
}

function _restoreMF(wrap, vals) {
  if (!vals.length || !wrap?._mfSelected) return;
  vals.forEach(v => wrap._mfSelected.add(v));
  if (wrap._mfRenderList) wrap._mfRenderList('');
  const b = wrap.querySelector('.tl-mf-btn');
  if (b) {
    b.classList.add('active');
    const lbl   = vals.length === 1 ? (wrap._mfItems?.find(i => i.val === vals[0])?.label || vals[0]) : `${vals.length} selected`;
    const short = lbl.length > 18 ? lbl.slice(0, 16) + '…' : lbl;
    b.innerHTML = `<span class="mf-label">${short}</span><span class="mf-badge">${vals.length}</span><span class="mf-caret">▾</span>`;
  }
}

// ── Column selector modal ─────────────────────────────────────
function _showExportColModal(type, ALL_COLS, visibleCols, onConfirm) {
  const defaultKeys = ALL_COLS.filter(c => visibleCols.has(c.key)).map(c => c.key);
  let picked = new Set(defaultKeys);

  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center`;

  overlay.innerHTML = `
    <div style="background:var(--surface,#fff);border-radius:14px;box-shadow:0 16px 48px rgba(0,0,0,.22);
                padding:24px 24px 20px;min-width:320px;max-width:420px;width:90vw">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div style="font-size:15px;font-weight:700;color:var(--t1)">
          ${type === 'csv' ? '📄' : '🖨️'} ${type.toUpperCase()} — Select Columns
        </div>
        <button id="expModalClose" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;
          border:none;background:var(--surface2);border-radius:6px;cursor:pointer;color:var(--t3);font-size:16px">✕</button>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:12px">
        <button id="expSelAll" style="flex:1;padding:5px 0;border-radius:6px;border:1px solid var(--border);
          background:var(--surface2);color:var(--t2);font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit">
          ✔ Select All
        </button>
        <button id="expSelNone" style="flex:1;padding:5px 0;border-radius:6px;border:1px solid var(--border);
          background:var(--surface2);color:var(--t2);font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit">
          ✕ Deselect All
        </button>
      </div>

      <div id="expColList" style="display:flex;flex-direction:column;gap:5px;margin-bottom:18px;
        max-height:300px;overflow-y:auto;padding-right:4px">
        ${ALL_COLS.map(c => `
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:7px 10px;
                        border-radius:8px;border:1px solid var(--border);background:var(--surface2);
                        font-size:13px;color:var(--t1);user-select:none;transition:background .1s"
                 onmouseover="this.style.background='var(--blue-dim)'" onmouseout="this.style.background='var(--surface2)'">
            <input type="checkbox" value="${c.key}" ${picked.has(c.key) ? 'checked' : ''}
                   style="width:15px;height:15px;cursor:pointer;accent-color:var(--blue);flex-shrink:0"/>
            <span>${c.label}</span>
          </label>`).join('')}
      </div>

      <div style="display:flex;gap:10px">
        <button id="expModalCancel" style="flex:1;padding:9px 0;border-radius:8px;border:1px solid var(--border);
          background:var(--surface2);color:var(--t2);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">
          Cancel
        </button>
        <button id="expModalConfirm" style="flex:2;padding:9px 0;border-radius:8px;border:none;
          background:var(--blue);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">
          ${type === 'csv' ? '⬇ Export CSV' : '🖨 Export PDF'}
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  overlay.querySelectorAll('#expColList input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => cb.checked ? picked.add(cb.value) : picked.delete(cb.value));
  });

  const close = () => document.body.removeChild(overlay);
  overlay.querySelector('#expModalClose').addEventListener('click', close);
  overlay.querySelector('#expModalCancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  overlay.querySelector('#expSelAll').addEventListener('click', () => {
    picked = new Set(ALL_COLS.map(c => c.key));
    overlay.querySelectorAll('#expColList input[type=checkbox]').forEach(cb => cb.checked = true);
  });
  overlay.querySelector('#expSelNone').addEventListener('click', () => {
    picked.clear();
    overlay.querySelectorAll('#expColList input[type=checkbox]').forEach(cb => cb.checked = false);
  });

  overlay.querySelector('#expModalConfirm').addEventListener('click', () => {
    if (!picked.size) { alert('Please select at least one column!'); return; }
    close();
    onConfirm([...picked]);
  });
}

// ── Main render ──────────────────────────────────────────────
function renderTeacherList(el, state) {
  _injectStyles();

  const allTeachers = Auth.filterByCampus(AppState.get('teachers') || [], 'campusId');
  const campuses    = AppState.get('campuses')    || [];
  const disciplines = AppState.get('disciplines') || [];
  const subjects    = AppState.get('subjects')    || [];
  const batches     = AppState.get('batches')     || [];
  const allAssign   = AppState.get('lpAssignments') || {};

  // ── ALL_COLS — must be before el.innerHTML (vis() used in template) ──
  const ALL_COLS = [
    { key: 'sno',        label: '#',            def: true  },
    { key: 'name',       label: 'Teacher Name', def: true  },
    { key: 'campus',     label: 'Campus',       def: true  },
    { key: 'discipline', label: 'Discipline',   def: true  },
    { key: 'subjects',   label: 'Subjects',     def: true  },
    { key: 'batches',    label: 'Batches',      def: true  },
    { key: 'phone',      label: 'Phone',        def: false },
    { key: 'email',      label: 'Email',        def: false },
    { key: 'status',     label: 'Status',       def: true  },
  ];

  if (!state.visibleCols) {
    state.visibleCols = new Set(ALL_COLS.filter(c => c.def).map(c => c.key));
  }
  const vis = key => state.visibleCols.has(key);

  // ── Build rows ───────────────────────────────────────────────
  let rows = allTeachers.map(t => {
    const campus    = campuses.find(c => c.id === t.campusId);
    const disc      = disciplines.find(d => d.id === t.disciplineId);
    const teacherSubjects = subjects.filter(s => s.teacherId === t.id || (t.subjectIds || []).includes(s.id));
    const assignedBatches = batches.filter(b => b.teacherId === t.id && allAssign[b.id]);

    const name = t.fullName || t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim() || '—';

    return {
      id:           t.id,
      name,
      campusId:     t.campusId    || '',
      disciplineId: t.disciplineId || '',
      campus:       campus ? (campus.campusName || '—') : '—',
      discipline:   disc   ? (disc.abbreviation  || disc.fullName || '—') : '—',
      subjects:     teacherSubjects.map(s => s.subjectCode || s.subjectName || '').filter(Boolean),
      batchCount:   assignedBatches.length,
      phone:        t.phone  || t.mobile || '—',
      email:        t.email  || '—',
      status:       t.status || (t.isActive === false ? 'inactive' : 'active'),
    };
  });

  // ── Apply filters ────────────────────────────────────────────
  if (state.campFilter.length)   rows = rows.filter(r => state.campFilter.includes(r.campusId));
  if (state.discFilter.length)   rows = rows.filter(r => state.discFilter.includes(r.disciplineId));
  if (state.subjFilter.length)   rows = rows.filter(r => r.subjects.some(s => state.subjFilter.includes(s)));
  if (state.statusFilter.length) rows = rows.filter(r => state.statusFilter.includes(r.status.toLowerCase()));

  const q = (state.search || '').toLowerCase();
  if (q) rows = rows.filter(r => [r.name, r.campus, r.discipline, r.email, r.phone].join(' ').toLowerCase().includes(q));

  // Sort alphabetically
  rows.sort((a, b) => a.name.localeCompare(b.name));

  state._filteredRows = rows;

  // ── Filter option lists ──────────────────────────────────────
  const campItems   = campuses.filter(c => allTeachers.some(t => t.campusId === c.id))
                              .map(c => ({ val: c.id, label: c.campusName.replace(/\s*campus$/i, '').trim() }));
  const discItems   = disciplines.filter(d => allTeachers.some(t => t.disciplineId === d.id))
                                 .map(d => ({ val: d.id, label: `${d.abbreviation} — ${d.fullName}` }));
  const subjItems   = [...new Set(allTeachers.flatMap(t => {
    const ts = subjects.filter(s => s.teacherId === t.id || (t.subjectIds || []).includes(s.id));
    return ts.map(s => s.subjectCode || s.subjectName || '').filter(Boolean);
  }))].sort().map(s => ({ val: s, label: s }));
  const statusItems = [
    { val: 'active',   label: 'Active'   },
    { val: 'inactive', label: 'Inactive' },
  ];

  const anyFilter = state.campFilter.length || state.discFilter.length ||
                    state.subjFilter.length  || state.statusFilter.length || state.search;

  const rerender = () => renderTeacherList(el, state);

  // ── Shell HTML ───────────────────────────────────────────────
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:0">

      <!-- Toolbar -->
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap">

        <!-- Search -->
        <div style="display:flex;align-items:center;gap:8px;height:36px;padding:0 12px;
                    background:var(--surface);border:1.5px solid var(--border);border-radius:20px;
                    min-width:220px;max-width:280px;flex:1;transition:border-color .15s"
             onfocusin="this.style.borderColor='var(--blue)'" onfocusout="this.style.borderColor='var(--border)'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:var(--t3);flex-shrink:0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input id="tlSearch" placeholder="Search teacher, campus…" value="${state.search || ''}"
                 style="border:none;outline:none;background:transparent;font-size:12.5px;color:var(--t1);width:100%;font-family:inherit"/>
        </div>

        <!-- Multi-filters -->
        <div class="tl-mf" id="tlCampFilter"></div>
        <div class="tl-mf" id="tlDiscFilter"></div>
        <div class="tl-mf" id="tlSubjFilter"></div>
        <div class="tl-mf" id="tlStatusFilter"></div>

        <!-- Apply -->
        <button id="tlApplyBtn" style="display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 16px;
          border-radius:8px;border:none;background:var(--blue);color:#fff;
          font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;
          box-shadow:0 1px 6px rgba(59,130,246,.2);transition:opacity .15s">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Apply
        </button>

        ${anyFilter ? `
          <button id="tlClearAll" style="display:inline-flex;align-items:center;gap:5px;height:34px;padding:0 12px;
            border-radius:8px;border:1px solid rgba(239,68,68,.35);background:rgba(239,68,68,.06);
            color:var(--red,#ef4444);font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:inherit">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Clear Filters
          </button>` : ''}

        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:auto;position:relative">
          <span style="font-size:12px;color:var(--t3);white-space:nowrap">${rows.length} teacher${rows.length !== 1 ? 's' : ''}</span>

          <!-- Column toggle -->
          <button class="tl-export-btn" id="tlColsBtn" title="Choose Columns">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
          </button>
          <!-- CSV -->
          <button class="tl-export-btn" id="tlExportCSV" title="Export CSV">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>
            </svg>
          </button>
          <!-- PDF -->
          <button class="tl-export-btn" id="tlExportPDF" title="Export PDF">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
          </button>

          <!-- Column panel -->
          <div id="tlColPanel" style="display:none;position:absolute;right:0;top:calc(100% + 6px);
            z-index:999;background:var(--surface);border:1px solid var(--border);border-radius:12px;
            box-shadow:0 8px 24px rgba(0,0,0,.14);padding:14px 16px;min-width:200px">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
                        color:var(--t3);margin-bottom:10px">Visible Columns</div>
            <div id="tlColList" style="display:flex;flex-direction:column;gap:6px"></div>
            <div style="margin-top:12px;display:flex;gap:6px">
              <button id="tlColSelAll" style="flex:1;padding:5px 0;border-radius:6px;border:1px solid var(--border);
                background:var(--surface2);color:var(--t2);font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit">All</button>
              <button id="tlColReset" style="flex:1;padding:5px 0;border-radius:6px;border:1px solid var(--border);
                background:var(--surface2);color:var(--t2);font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit">Reset</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Table -->
      <div style="border:1px solid var(--border);border-radius:var(--r-sm);overflow:hidden;overflow-x:auto;overflow-y:auto;max-height:calc(100vh - 320px)">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:var(--surface2);border-bottom:2px solid var(--border);position:sticky;top:0;z-index:3">
              ${vis('sno')        ? `<th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:600;color:var(--t3);width:44px;border-right:1px solid var(--border)">#</th>` : ''}
              ${vis('name')       ? `<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3)">Teacher Name</th>` : ''}
              ${vis('campus')     ? `<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3)">Campus</th>` : ''}
              ${vis('discipline') ? `<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3)">Discipline</th>` : ''}
              ${vis('subjects')   ? `<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3)">Subjects</th>` : ''}
              ${vis('batches')    ? `<th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:600;color:var(--t3)">Batches</th>` : ''}
              ${vis('phone')      ? `<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3)">Phone</th>` : ''}
              ${vis('email')      ? `<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3)">Email</th>` : ''}
              ${vis('status')     ? `<th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:600;color:var(--t3)">Status</th>` : ''}
            </tr>
          </thead>
          <tbody>
            ${!state.applied
              ? `<tr><td colspan="9" style="padding:60px;text-align:center">
                  <div style="display:flex;flex-direction:column;align-items:center;gap:14px;color:var(--t3)">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                    </svg>
                    <div style="font-size:13.5px;font-weight:600;color:var(--t2)">Select filters and click Apply to load report</div>
                    <div style="font-size:12px;color:var(--t3)">Use Campus, Discipline, Subject or Status filters above</div>
                  </div>
                </td></tr>`
              : rows.length
                ? rows.map((r, i) => {
                    const statusBadge = r.status.toLowerCase() === 'active'
                      ? `<span class="tl-status-active"><span class="tl-status-dot" style="background:#16a34a"></span>Active</span>`
                      : `<span class="tl-status-inactive"><span class="tl-status-dot" style="background:#dc2626"></span>Inactive</span>`;
                    const subjTags = r.subjects.slice(0, 4).map(s =>
                      `<span style="display:inline-block;padding:1px 7px;border-radius:5px;font-size:11px;font-weight:600;
                                    background:var(--blue-dim);color:var(--blue);margin:1px">${s}</span>`
                    ).join('') + (r.subjects.length > 4 ? `<span style="font-size:11px;color:var(--t3)"> +${r.subjects.length - 4}</span>` : '');

                    return `
                      <tr style="border-bottom:1px solid var(--border);transition:background .12s"
                          onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
                        ${vis('sno')        ? `<td style="padding:10px 12px;text-align:center;color:var(--t3);font-size:12px;border-right:1px solid var(--border)">${i + 1}</td>` : ''}
                        ${vis('name')       ? `<td style="padding:10px 14px;font-size:13px;font-weight:700;color:var(--t1)">${r.name}</td>` : ''}
                        ${vis('campus')     ? `<td style="padding:10px 12px;font-size:12.5px;color:var(--t2)">${r.campus}</td>` : ''}
                        ${vis('discipline') ? `<td style="padding:10px 12px;font-size:12.5px;color:var(--t2)">${r.discipline}</td>` : ''}
                        ${vis('subjects')   ? `<td style="padding:8px 12px">${subjTags || '<span style="color:var(--t4)">—</span>'}</td>` : ''}
                        ${vis('batches')    ? `<td style="padding:10px 12px;text-align:center;font-size:13px;font-weight:700;color:${r.batchCount ? 'var(--blue)' : 'var(--t4)'}">${r.batchCount || '—'}</td>` : ''}
                        ${vis('phone')      ? `<td style="padding:10px 12px;font-size:12.5px;color:var(--t2)">${r.phone}</td>` : ''}
                        ${vis('email')      ? `<td style="padding:10px 12px;font-size:12px;color:var(--t2)">${r.email}</td>` : ''}
                        ${vis('status')     ? `<td style="padding:10px 12px;text-align:center">${statusBadge}</td>` : ''}
                      </tr>`;
                  }).join('')
                : `<tr><td colspan="9" style="padding:40px;text-align:center;color:var(--t3);font-size:13px">
                     No teachers found for selected filters.
                   </td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>`;

  // ── Init filters ─────────────────────────────────────────────
  const campWrap   = el.querySelector('#tlCampFilter');
  const discWrap   = el.querySelector('#tlDiscFilter');
  const subjWrap   = el.querySelector('#tlSubjFilter');
  const statWrap   = el.querySelector('#tlStatusFilter');

  _initMultiFilter(campWrap,  'All Campuses',    campItems,   vals => { state.campFilter   = vals; });
  _initMultiFilter(discWrap,  'All Disciplines', discItems,   vals => { state.discFilter   = vals; });
  _initMultiFilter(subjWrap,  'All Subjects',    subjItems,   vals => { state.subjFilter   = vals; });
  _initMultiFilter(statWrap,  'All Statuses',    statusItems, vals => { state.statusFilter = vals; });

  // Restore selections
  _restoreMF(campWrap,  state.campFilter);
  _restoreMF(discWrap,  state.discFilter);
  _restoreMF(subjWrap,  state.subjFilter);
  _restoreMF(statWrap,  state.statusFilter);

  // Apply
  el.querySelector('#tlApplyBtn')?.addEventListener('click', () => {
    state.applied = true;
    rerender();
  });

  // Clear all
  el.querySelector('#tlClearAll')?.addEventListener('click', () => {
    state.campFilter = []; state.discFilter = [];
    state.subjFilter = []; state.statusFilter = [];
    state.search = ''; state.applied = false;
    rerender();
  });

  // Search
  el.querySelector('#tlSearch')?.addEventListener('input', e => {
    state.search = e.target.value;
    const sq = state.search.toLowerCase();
    el.querySelectorAll('tbody tr').forEach(tr => {
      tr.style.display = !sq || tr.textContent.toLowerCase().includes(sq) ? '' : 'none';
    });
    const vis2 = [...el.querySelectorAll('tbody tr')].filter(tr => tr.style.display !== 'none').length;
    const cnt  = [...el.querySelectorAll('span')].find(s => /\d+ teacher/.test(s.textContent));
    if (cnt) cnt.textContent = `${vis2} teacher${vis2 !== 1 ? 's' : ''}`;
  });

  // Close panels on outside click
  document.addEventListener('click', () => {
    document.querySelectorAll('.tl-mf-panel.open').forEach(p => p.classList.remove('open'));
    const colPanel = el.querySelector('#tlColPanel');
    if (colPanel) colPanel.style.display = 'none';
  });

  // ── Column panel ─────────────────────────────────────────────
  const colPanel = el.querySelector('#tlColPanel');
  const colList  = el.querySelector('#tlColList');
  const colsBtn  = el.querySelector('#tlColsBtn');

  const renderColList = () => {
    colList.innerHTML = ALL_COLS.map(c => `
      <label style="display:flex;align-items:center;gap:9px;cursor:pointer;
                    font-size:12.5px;color:var(--t1);padding:3px 0;user-select:none">
        <input type="checkbox" value="${c.key}"
          style="width:14px;height:14px;cursor:pointer;accent-color:var(--blue)"
          ${state.visibleCols.has(c.key) ? 'checked' : ''}>
        ${c.label}
      </label>`).join('');
    colList.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) state.visibleCols.add(cb.value);
        else            state.visibleCols.delete(cb.value);
        rerender();
      });
    });
  };
  renderColList();

  colsBtn?.addEventListener('click', e => {
    e.stopPropagation();
    const open = colPanel.style.display !== 'none';
    colPanel.style.display = open ? 'none' : 'block';
    if (!open) renderColList();
  });

  el.querySelector('#tlColSelAll')?.addEventListener('click', () => {
    ALL_COLS.forEach(c => state.visibleCols.add(c.key));
    rerender();
  });
  el.querySelector('#tlColReset')?.addEventListener('click', () => {
    state.visibleCols = new Set(ALL_COLS.filter(c => c.def).map(c => c.key));
    rerender();
  });

  // ── Export helpers ────────────────────────────────────────────
  const getExportData = (selectedKeys) => {
    const exportRows = state._filteredRows || [];
    const COL_MAP = {
      sno:        (r, i) => i + 1,
      name:       r => r.name,
      campus:     r => r.campus,
      discipline: r => r.discipline,
      subjects:   r => r.subjects.join(', ') || '—',
      batches:    r => r.batchCount || 0,
      phone:      r => r.phone,
      email:      r => r.email,
      status:     r => r.status,
    };
    const activeCols = ALL_COLS.filter(c => selectedKeys.includes(c.key));
    const headers    = activeCols.map(c => c.label);
    const dataRows   = exportRows.map((r, i) => activeCols.map(c => String(COL_MAP[c.key](r, i) ?? '—')));
    return { headers, dataRows, exportRows };
  };

  // CSV export
  el.querySelector('#tlExportCSV')?.addEventListener('click', () => {
    if (!(state._filteredRows || []).length) return;
    _showExportColModal('csv', ALL_COLS, state.visibleCols, selectedKeys => {
      const { headers, dataRows, exportRows } = getExportData(selectedKeys);
      const now     = new Date();
      const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const csv = [
        `Teacher List Report — Generated: ${dateStr}`,
        `Total Teachers: ${exportRows.length}`,
        '',
        headers.join(','),
        ...dataRows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `teacher-list-${dateStr.replace(/ /g, '-')}.csv`; a.click();
      URL.revokeObjectURL(url);
    });
  });

  // PDF export
  el.querySelector('#tlExportPDF')?.addEventListener('click', () => {
    if (!(state._filteredRows || []).length) return;
    _showExportColModal('pdf', ALL_COLS, state.visibleCols, selectedKeys => {
      const { headers, dataRows, exportRows } = getExportData(selectedKeys);
      const now     = new Date();
      const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

      const thCells = headers.map(h =>
        `<th style="background:#1e40af;color:#fff;font-size:10px;font-weight:700;
                    text-transform:uppercase;letter-spacing:.4px;padding:8px 10px;
                    white-space:nowrap;text-align:left">${h}</th>`
      ).join('');

      const tdRows = dataRows.map((row, idx) =>
        `<tr>${row.map((cell, ci) => {
          const bg = idx % 2 === 0 ? '#f8faff' : '#fff';
          return `<td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;
                              color:#334155;background:${bg};${ci === 0 ? 'font-weight:700;color:#1e293b;' : ''}">${cell}</td>`;
        }).join('')}</tr>`
      ).join('');

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Teacher List Report</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#1e293b;background:#fff;padding:20px 24px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #2563eb;padding-bottom:12px;margin-bottom:14px}
  .title{font-size:20px;font-weight:700;color:#1e40af}
  .subtitle{font-size:11px;color:#64748b;margin-top:2px}
  .meta{text-align:right;font-size:10.5px;color:#64748b;line-height:1.6}
  .stat-row{display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap}
  .stat{background:#f8faff;border:1px solid #dbeafe;border-radius:8px;padding:6px 14px;text-align:center}
  .stat-n{font-size:18px;font-weight:700;color:#2563eb}
  .stat-l{font-size:9.5px;color:#64748b;text-transform:uppercase;letter-spacing:.4px}
  table{width:100%;border-collapse:collapse}
  .footer{margin-top:14px;padding-top:10px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9.5px;color:#94a3b8}
  @media print{body{padding:12px 14px}@page{size:A4 landscape;margin:10mm}.no-print{display:none}}
</style></head><body>
  <div class="header">
    <div>
      <div class="title">Teacher List Report</div>
      <div class="subtitle">Columns: ${headers.join(' · ')}</div>
    </div>
    <div class="meta"><strong>${dateStr}</strong><br>${timeStr}</div>
  </div>
  <div class="stat-row">
    <div class="stat"><div class="stat-n">${exportRows.length}</div><div class="stat-l">Total Teachers</div></div>
  </div>
  <table>
    <thead><tr>${thCells}</tr></thead>
    <tbody>${tdRows}</tbody>
  </table>
  <div class="footer">
    <span>Teacher List Report &nbsp;|&nbsp; ${dateStr} at ${timeStr}</span>
    <span>${exportRows.length} teacher${exportRows.length !== 1 ? 's' : ''}</span>
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
  });
}

// ── Export ───────────────────────────────────────────────────
export const TeacherListReport = {
  mount(container) {
    if (!container) return;
    // Fresh state every mount — filters clear on each open
    this._state = {
      search: '',
      campFilter: [], discFilter: [], subjFilter: [], statusFilter: [],
      _filteredRows: [],
      applied: false,
      visibleCols: null,
    };
    renderTeacherList(container, this._state);
  }
};
