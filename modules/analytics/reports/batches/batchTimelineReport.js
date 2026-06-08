// ============================================================
// modules/analytics/reports/batches/batchTimelineReport.js
// Batch Timeline Report — Analytics mein LP Timeline as-is
// ============================================================

import { AppState } from '../../../../utils/state.js';
import { Auth }     from '../../../../utils/auth.js';

// ── Helpers (copied from lecturePlanUI) ──────────────────────

function getAllAssignments() {
  const lps  = AppState.get('lpAssignments') || {};
  return lps;
}

function calcHours(rows = []) {
  const h = { teaching: 0, test: 0, mock: 0, revision: 0 };
  rows.forEach(r => {
    const hrs = parseFloat(r.hours || r.hrs || 0);
    const t   = (r.type || '').toLowerCase();
    if (t.includes('test'))                h.test     += hrs;
    else if (t.includes('mock'))           h.mock     += hrs;
    else if (t.includes('revision'))       h.revision += hrs;
    else                                   h.teaching += hrs;
  });
  h.teaching = Math.round(h.teaching * 100) / 100;
  h.test     = Math.round(h.test     * 100) / 100;
  h.mock     = Math.round(h.mock     * 100) / 100;
  h.revision = Math.round(h.revision * 100) / 100;
  return h;
}

function calcDuration(startStr, endStr) {
  if (!startStr || !endStr) return null;
  const s = new Date(startStr + 'T00:00:00');
  const e = new Date(endStr   + 'T00:00:00');
  const days = Math.round((e - s) / 86400000);
  if (days < 0) return null;
  if (days < 7)  return `${days}d`;
  if (days < 30) return `${Math.round(days / 7)}w`;
  const months = Math.floor(days / 30);
  const rem    = days % 30;
  return rem > 0 ? `${months}m ${rem}d` : `${months}m`;
}

function fmt(ds) {
  if (!ds) return '—';
  const d    = new Date(ds + 'T00:00:00');
  const mons = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${mons[d.getMonth()]} ${d.getFullYear()}`;
}

// ── Filter styles (injected once) ────────────────────────────
function _injectStyles() {
  if (document.getElementById('bt-report-style')) return;
  const st = document.createElement('style');
  st.id = 'bt-report-style';
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
    .bt-export-btn { display:inline-flex;align-items:center;justify-content:center; width:32px;height:32px;border-radius:7px;border:1px solid var(--border); background:var(--surface2);color:var(--t3);cursor:pointer;transition:all .15s; }
    .bt-export-btn:hover { border-color:var(--blue);color:var(--blue);background:var(--blue-dim); }
  `;
  document.head.appendChild(st);
}

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
      const short = lbl.length > 18 ? lbl.slice(0,16)+'…' : lbl;
      btn.innerHTML = `<span class="mf-label">${short}</span><span class="mf-badge">${sel.size}</span><span class="mf-caret">▾</span>`;
    }
  };

  const renderList = (q = '') => {
    const filtered = wrap._mfItems.filter(i => !q || i.label.toLowerCase().includes(q.toLowerCase()));
    panel.innerHTML = `
      <div class="tl-mf-search"><input placeholder="Search…" value="${q}" autocomplete="off"/></div>
      <div class="tl-mf-list">
        ${filtered.length ? filtered.map(i => `
          <div class="tl-mf-item ${wrap._mfSelected.has(i.val)?'checked':''}" data-val="${i.val}">
            <span class="tl-mf-chk"></span>
            <span class="tl-mf-lbl">${i.label}</span>
          </div>`).join('') : '<div style="padding:12px;font-size:12px;color:var(--t4);text-align:center">No results</div>'}
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

// ── Main render function ──────────────────────────────────────
function renderBatchTimeline(el, state) {
  _injectStyles();

  const allBatches  = Auth.filterByCampus(AppState.get('batches')     || [], 'campusId');
  const campuses    = AppState.get('campuses')    || [];
  const subjects    = AppState.get('subjects')    || [];
  const levels      = AppState.get('levels')      || [];
  const teachers    = AppState.get('teachers')    || [];
  const disciplines = AppState.get('disciplines') || [];
  const allAssign   = getAllAssignments();
  const REMARKS_KEY = 'lpTimelineRemarks';
  const getRemarks  = () => AppState.get(REMARKS_KEY) || {};
  const saveRemarks = (obj) => AppState.set(REMARKS_KEY, obj);

  const assigned = allBatches.filter(b => allAssign[b.id]);

  const today = new Date(); today.setHours(0,0,0,0);

  const pct = (rows) => {
    if (!rows?.length) return 0;
    const dated  = rows.filter(r => r.date);
    if (!dated.length) return 0;
    const passed = dated.filter(r => new Date(r.date+'T00:00:00') <= today).length;
    return Math.round((passed / dated.length) * 100);
  };

  const pctBar = (p) => {
    const color = p >= 80 ? '#10b981' : p >= 40 ? '#f59e0b' : '#6366f1';
    return `<div style="display:flex;align-items:center;gap:7px">
      <div style="flex:1;height:5px;background:var(--surface3);border-radius:3px;overflow:hidden;min-width:60px">
        <div style="height:100%;width:${p}%;background:${color};border-radius:3px;transition:width .3s"></div>
      </div>
      <span style="font-size:12px;font-weight:600;color:${color};min-width:32px">${p}%</span>
    </div>`;
  };

  // Build rows
  let rows = assigned.map(b => {
    const lpa     = allAssign[b.id];
    const campus  = campuses.find(c => c.id === b.campusId);
    const subj    = subjects.find(s => s.id === b.subjectId);
    const teacher = teachers.find(t => t.id === b.teacherId);
    const disc    = disciplines.find(d => d.id === b.disciplineId);
    const dated   = (lpa.rows||[]).filter(r => r.date).sort((a,b) => a.date.localeCompare(b.date));
    const levelId = subj?.levelId || b.levelId || '';
    const level   = levels.find(l => l.id === levelId);
    const hrs     = calcHours(lpa.rows||[]);
    return {
      batchId:      b.id,
      campusId:     b.campusId||'',
      subjectId:    b.subjectId||'',
      disciplineId: b.disciplineId||'',
      levelId,
      sessionPeriod: b.sessionPeriod||'',
      campus:   campus ? (campus.campusName||'—') : '—',
      subject:  b.subjectCode || lpa?.subjectCode || subj?.subjectCode || lpa.lpCode || '—',
      batchName: b.batchName||b.id,
      batchNo:  b.batchNo != null ? String(b.batchNo).padStart(2,'0') : '—',
      teacher:  teacher ? (teacher.fullName||teacher.name||`${teacher.firstName||''} ${teacher.lastName||''}`.trim()) : '—',
      startDate: dated[0]?.date||null,
      endDate:   dated[dated.length-1]?.date||null,
      completion: pct(lpa.rows||[]),
      rows:      lpa.rows||[],
      hrs,
      _disc: disc, _subj: subj, _level: level,
    };
  });

  // Apply filters
  if (state.campFilter.length)    rows = rows.filter(r => state.campFilter.includes(r.campusId));
  if (state.discFilter.length)    rows = rows.filter(r => state.discFilter.includes(r.disciplineId));
  if (state.levelFilter.length)   rows = rows.filter(r => state.levelFilter.includes(r.levelId));
  if (state.subjFilter.length)    rows = rows.filter(r => state.subjFilter.includes(r.subjectId));
  if (state.sessionFilter.length) rows = rows.filter(r => state.sessionFilter.includes(r.sessionPeriod));
  const q = (state.search||'').toLowerCase();
  if (q) rows = rows.filter(r => [r.campus,r.subject,r.batchName,r.teacher,r.sessionPeriod].join(' ').toLowerCase().includes(q));
  rows.sort((a,b) => {
    const sa = a.startDate||'', sb = b.startDate||'';
    return state.sort === 'oldest' ? sa.localeCompare(sb) : sb.localeCompare(sa);
  });

  state._filteredRows = rows;

  // Build filter option lists
  const uniqueSessions = [...new Set(assigned.map(b => b.sessionPeriod).filter(Boolean))].sort((a,b) => {
    const parse = v => { const [n,yy] = v.split('-'); return parseInt(yy)*2+(n==='June'?1:0); };
    return parse(b) - parse(a);
  });
  const campItems    = campuses.filter(c => assigned.some(b => b.campusId===c.id)).map(c => ({ val:c.id, label:c.campusName.replace(/\s*campus$/i,'').trim() }));
  const discItems    = disciplines.filter(d => assigned.some(b => b.disciplineId===d.id)).map(d => ({ val:d.id, label:`${d.abbreviation} — ${d.fullName}` }));
  const levelItems   = levels.filter(l => assigned.some(b => (subjects.find(s=>s.id===b.subjectId)?.levelId||b.levelId)===l.id)).map(l => ({ val:l.id, label:l.levelName||l.name||l.id }));
  const subjItems    = subjects.filter(s => assigned.some(b => b.subjectId===s.id)).map(s => ({ val:s.id, label:`${s.subjectCode} — ${s.subjectName}` }));
  const sessionItems = uniqueSessions.map(s => ({ val:s, label:s }));
  const anyFilter    = state.campFilter.length||state.discFilter.length||state.levelFilter.length||state.subjFilter.length||state.sessionFilter.length||state.search;

  const remarksMap = getRemarks();

  el.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:0">
      <!-- Toolbar -->
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap">
        <!-- Search -->
        <div style="display:flex;align-items:center;gap:8px;height:36px;padding:0 12px;background:var(--surface);border:1.5px solid var(--border);border-radius:20px;min-width:220px;max-width:280px;flex:1;transition:border-color .15s"
             onfocusin="this.style.borderColor='var(--blue)'" onfocusout="this.style.borderColor='var(--border)'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:var(--t3);flex-shrink:0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input id="btSearch" placeholder="Search batch or teacher…" value="${state.search||''}"
                 style="border:none;outline:none;background:transparent;font-size:12.5px;color:var(--t1);width:100%;font-family:inherit"/>
        </div>

        <!-- Filter dropdowns -->
        <div class="tl-mf" id="btCampFilter"></div>
        <div class="tl-mf" id="btDiscFilter"></div>
        <div class="tl-mf" id="btLevelFilter"></div>
        <div class="tl-mf" id="btSubjFilter"></div>
        <div class="tl-mf" id="btSessFilter"></div>

        <button id="btApplyBtn" style="display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 16px;
          border-radius:8px;border:none;background:var(--blue);color:#fff;
          font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;
          box-shadow:0 1px 6px rgba(59,130,246,.2);transition:opacity .15s">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Apply
        </button>

        ${anyFilter ? `
          <button id="btClearAll" style="display:inline-flex;align-items:center;gap:5px;height:34px;padding:0 12px;border-radius:8px;border:1px solid rgba(239,68,68,.35);background:rgba(239,68,68,.06);color:var(--red,#ef4444);font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:inherit">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Clear Filters
          </button>` : ''}

        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:auto">
          <select id="btSort" style="padding:6px 10px;height:34px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;font-size:12.5px;color:var(--t1);cursor:pointer;font-family:inherit">
            <option value="oldest" ${state.sort==='oldest'?'selected':''}>Oldest First</option>
            <option value="newest" ${state.sort==='newest'?'selected':''}>Newest First</option>
          </select>
        </div>
        <span style="font-size:12px;color:var(--t3);flex-shrink:0;white-space:nowrap">${rows.length} batch${rows.length!==1?'es':''}</span>
        <button class="bt-export-btn" id="btExportCSV" title="Export CSV">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12l2.5 2.5L16 9"/></svg>
        </button>
      </div>

      <!-- Table -->
      <div style="border:1px solid var(--border);border-radius:var(--r-sm);overflow:hidden;overflow-x:auto;overflow-y:auto;max-height:calc(100vh - 320px)">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:var(--surface2);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:3">
              <th rowspan="2" style="padding:9px 12px;text-align:center;font-size:11px;font-weight:600;color:var(--t3);width:44px;border-right:1px solid var(--border)">#</th>
              <th rowspan="2" style="padding:9px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3)">Campus</th>
              <th rowspan="2" style="padding:9px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3)">Subject</th>
              <th rowspan="2" style="padding:9px 12px;text-align:center;font-size:11px;font-weight:600;color:var(--t3);width:52px">Batch</th>
              <th rowspan="2" style="padding:9px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3)">Teacher</th>
              <th rowspan="2" style="padding:9px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3)">Start</th>
              <th rowspan="2" style="padding:9px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3)">End</th>
              <th rowspan="2" style="padding:9px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3)">Duration</th>
              <th colspan="4" style="padding:6px 12px;text-align:center;font-size:11px;font-weight:700;color:var(--t1);border-bottom:1px solid var(--border);border-left:1px solid var(--border)">Hours</th>
              <th rowspan="2" style="padding:9px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3);min-width:120px">Completion</th>
              <th rowspan="2" style="padding:9px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--t3);min-width:160px">Remarks</th>
            </tr>
            <tr style="background:var(--surface2);border-bottom:2px solid var(--border);position:sticky;top:39px;z-index:3">
              <th style="padding:5px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--t2);border-left:1px solid var(--border)">Teaching</th>
              <th style="padding:5px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--t2)">Test</th>
              <th style="padding:5px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--t2)">Mock</th>
              <th style="padding:5px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--t2)">Revision</th>
            </tr>
          </thead>
          <tbody>
            ${!state.applied ? `<tr><td colspan="14" style="padding:60px;text-align:center">
              <div style="display:flex;flex-direction:column;align-items:center;gap:14px;color:var(--t3)">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                <div style="font-size:13.5px;font-weight:600;color:var(--t2)">Select filters and click Apply to load report</div>
              </div>
            </td></tr>` : rows.length ? rows.map((r,i) => {
              const rem = remarksMap[r.batchId]||'';
              return `
                <tr style="border-bottom:1px solid var(--border);transition:background .12s"
                    onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
                  <td style="padding:10px 12px;text-align:center;color:var(--t3);font-size:12px;border-right:1px solid var(--border)">${i+1}</td>
                  <td style="padding:10px 12px;font-size:12.5px;color:var(--t1)">${r.campus}</td>
                  <td style="padding:10px 12px;font-size:12.5px;font-weight:700;color:var(--blue)">${r.subject}</td>
                  <td style="padding:10px 12px;text-align:center;font-size:13px;font-weight:700;color:var(--t1)">${r.batchNo}</td>
                  <td style="padding:10px 12px;font-size:12.5px;color:var(--t2)">${r.teacher}</td>
                  <td style="padding:10px 12px;font-size:12.5px;color:var(--t2);white-space:nowrap">${fmt(r.startDate)}</td>
                  <td style="padding:10px 12px;font-size:12.5px;color:var(--t2);white-space:nowrap">${fmt(r.endDate)}</td>
                  <td style="padding:10px 12px;white-space:nowrap">${(() => {
                    const dur = calcDuration(r.startDate, r.endDate);
                    return dur ? `<span style="font-size:11.5px;font-weight:600;color:var(--blue);background:var(--blue-dim);padding:2px 8px;border-radius:8px">${dur}</span>` : '<span style="color:var(--t4)">—</span>';
                  })()}</td>
                  <td style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;color:var(--blue);border-left:1px solid var(--border)">${r.hrs.teaching}</td>
                  <td style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;color:var(--yellow)">${r.hrs.test}</td>
                  <td style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;color:var(--violet)">${r.hrs.mock}</td>
                  <td style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;color:var(--cyan)">${r.hrs.revision||0}</td>
                  <td style="padding:10px 12px">${pctBar(r.completion)}</td>
                  <td style="padding:10px 12px">
                    <div style="display:flex;align-items:center;gap:6px">
                      <span class="bt-rem-text" data-bid="${r.batchId}"
                            style="font-size:12.5px;color:${rem?'var(--t1)':'var(--t4)'};font-style:${rem?'normal':'italic'};flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px" title="${rem||''}">
                        ${rem||'Add note…'}
                      </span>
                      <button class="bt-rem-edit" data-bid="${r.batchId}" title="Edit"
                              style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:var(--surface2);border:1px solid var(--border);border-radius:6px;cursor:pointer;color:var(--t3);flex-shrink:0">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      ${rem ? `<button class="bt-rem-del" data-bid="${r.batchId}" title="Clear"
                              style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:var(--surface2);border:1px solid var(--border);border-radius:6px;cursor:pointer;color:var(--t3);flex-shrink:0">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                      </button>` : ''}
                    </div>
                  </td>
                </tr>`;
            }).join('') : `<tr><td colspan="14" style="padding:40px;text-align:center;color:var(--t3);font-size:13px">No LP-assigned batches found for selected filters.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;

  // ── Init filters ─────────────────────────────────────────────
  const rerender = () => renderBatchTimeline(el, state);

  const campWrap  = el.querySelector('#btCampFilter');
  const discWrap  = el.querySelector('#btDiscFilter');
  const levelWrap = el.querySelector('#btLevelFilter');
  const subjWrap  = el.querySelector('#btSubjFilter');
  const sessWrap  = el.querySelector('#btSessFilter');

  _initMultiFilter(campWrap,  'All Campuses',    campItems,    vals => { state.campFilter    = vals; });
  _initMultiFilter(discWrap,  'All Disciplines', discItems,    vals => { state.discFilter    = vals; });
  _initMultiFilter(levelWrap, 'All Levels',      levelItems,   vals => { state.levelFilter   = vals; });
  _initMultiFilter(subjWrap,  'All Subjects',    subjItems,    vals => { state.subjFilter    = vals; });
  _initMultiFilter(sessWrap,  'All Sessions',    sessionItems, vals => { state.sessionFilter = vals; });

  // Restore selected values
  const restoreMF = (wrap, vals) => {
    if (!vals.length || !wrap?._mfSelected) return;
    vals.forEach(v => wrap._mfSelected.add(v));
    if (wrap._mfRenderList) wrap._mfRenderList('');
    const b = wrap.querySelector('.tl-mf-btn');
    if (b) {
      b.classList.add('active');
      const lbl   = vals.length === 1 ? (wrap._mfItems?.find(i => i.val===vals[0])?.label||vals[0]) : `${vals.length} selected`;
      const short = lbl.length > 18 ? lbl.slice(0,16)+'…' : lbl;
      b.innerHTML = `<span class="mf-label">${short}</span><span class="mf-badge">${vals.length}</span><span class="mf-caret">▾</span>`;
    }
  };
  restoreMF(campWrap,  state.campFilter);
  restoreMF(discWrap,  state.discFilter);
  restoreMF(levelWrap, state.levelFilter);
  restoreMF(subjWrap,  state.subjFilter);
  restoreMF(sessWrap,  state.sessionFilter);

  // Apply button
  el.querySelector('#btApplyBtn')?.addEventListener('click', () => {
    state.applied = true;
    rerender();
  });

  // Clear all
  el.querySelector('#btClearAll')?.addEventListener('click', () => {
    state.campFilter = []; state.discFilter = []; state.levelFilter = [];
    state.subjFilter = []; state.sessionFilter = []; state.search = '';
    state.applied = false;
    rerender();
  });

  // Close panels on outside click
  document.addEventListener('click', () => {
    document.querySelectorAll('.tl-mf-panel.open').forEach(p => p.classList.remove('open'));
  });

  // Search
  el.querySelector('#btSearch')?.addEventListener('input', e => {
    state.search = e.target.value;
    const sq = state.search.toLowerCase();
    el.querySelectorAll('tbody tr').forEach(tr => {
      tr.style.display = !sq || tr.textContent.toLowerCase().includes(sq) ? '' : 'none';
    });
    const vis = [...el.querySelectorAll('tbody tr')].filter(tr => tr.style.display !== 'none').length;
    const cnt = [...el.querySelectorAll('span')].find(s => /\d+ batch/.test(s.textContent));
    if (cnt) cnt.textContent = `${vis} batch${vis!==1?'es':''}`;
  });

  // Sort
  el.querySelector('#btSort')?.addEventListener('change', e => {
    state.sort = e.target.value;
    if (state.applied) rerender();
  });

  // Remarks edit
  el.querySelectorAll('.bt-rem-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const bid = btn.dataset.bid;
      const map = getRemarks();
      const cur = map[bid] || '';
      const val = prompt('Edit remark:', cur);
      if (val === null) return;
      map[bid] = val.trim();
      saveRemarks(map);
      rerender();
    });
  });

  // Remarks delete
  el.querySelectorAll('.bt-rem-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const bid = btn.dataset.bid;
      const map = getRemarks();
      delete map[bid];
      saveRemarks(map);
      rerender();
    });
  });

  // Export CSV
  el.querySelector('#btExportCSV')?.addEventListener('click', () => {
    const exportRows = state._filteredRows || [];
    if (!exportRows.length) return;
    const remarksExp = getRemarks();
    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const headers = ['Campus','Discipline','Subject','Batch #','Teacher','Session','Start Date','End Date','Duration','Teaching h','Test h','Mock h','Revision h','Completion %','Remarks'];
    const dataRows = exportRows.map(r => {
      const discLabel = r._disc ? r._disc.abbreviation : '—';
      const rem = remarksExp[r.batchId] || '';
      const h   = r.hrs || calcHours(r.rows||[]);
      return [r.campus, discLabel, r.subject, r.batchNo||'—', r.teacher, r.sessionPeriod||'—',
              r.startDate||'—', r.endDate||'—', calcDuration(r.startDate, r.endDate)||'—',
              h.teaching, h.test, h.mock, h.revision||0, `${r.completion}%`, rem];
    });
    const csv = [
      `Batch Timeline Report — Generated: ${dateStr}`,
      `Total Batches: ${exportRows.length}`,
      '',
      headers.join(','),
      ...dataRows.map(row => row.map(cell => `"${(cell||'').toString().replace(/"/g,'""')}"`).join(','))
    ].join('\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `batch-timeline-${dateStr.replace(/ /g,'-')}.csv`; a.click();
    URL.revokeObjectURL(url);
  });
}

// ── Export ────────────────────────────────────────────────────
export const BatchTimelineReport = {
  mount(container) {
    if (!container) return;
    // Persistent filter state across re-renders
    if (!this._state) {
      this._state = {
        sort: 'oldest', search: '',
        campFilter: [], discFilter: [], levelFilter: [],
        subjFilter: [], sessionFilter: [], _filteredRows: [],
        applied: false,
      };
    }
    renderBatchTimeline(container, this._state);
  }
};
