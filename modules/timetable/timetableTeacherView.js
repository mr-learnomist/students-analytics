// ============================================================
// modules/timetable/timetableTeacherView.js
// Teacher-wise Timetable View  v3
// Changes from v2:
//  - Screen table formatting 100% restored (original styles)
//  - Separate CSV + PDF icon buttons (batch.js style)
//  - PDF: new window with full color-coded timetable grid
//  - CSV: same styled grid page + "Download CSV" button
// ============================================================

import { AppState } from '../../utils/state.js';
import { getAssignmentForBatch } from '../lecturePlan/lecturePlanService.js';

export const TimetableTeacherView = (() => {

  let _rootEl        = null;
  let _filterCampus  = '';
  let _filterDisc    = '';
  let _filterTeacher = '';

  // ── Helpers ───────────────────────────────────────────────
  function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function _fmtTime(t) {
    if (!t) return '';
    const [h,m] = t.split(':'); const hh=parseInt(h);
    return `${hh%12||12}:${m} ${hh>=12?'PM':'AM'}`;
  }
  function _toMins(t) {
    if (!t) return 0; const [h,m]=t.split(':').map(Number); return h*60+m;
  }
  function _slotLabel(s,e) {
    const fmt=mins=>{const h=Math.floor(mins/60),m=mins%60,ap=h>=12?'PM':'AM',h12=h%12||12;return m?`${h12}:${String(m).padStart(2,'0')} ${ap}`:`${h12} ${ap}`;};
    return `${fmt(s)}–${fmt(e)}`;
  }

  function _batchShort(name) {
    if (!name) return '—';
    const parts = name.split('-');
    for (let i=parts.length-1;i>=0;i--) { if (/^\d+$/.test(parts[i])) return parts[i]; }
    return parts[parts.length-1]||name;
  }

  const SLOT_STEP = 60;

  function _buildSlots(entries) {
    if (!entries.length) {
      const s=[]; for(let m=8*60;m<17*60;m+=SLOT_STEP) s.push(m); return s;
    }
    let mn=Infinity,mx=0;
    entries.forEach(e=>{const s=_toMins(e.startTime),n=_toMins(e.endTime);if(s<mn)mn=s;if(n>mx)mx=n;});
    mn=Math.floor(mn/SLOT_STEP)*SLOT_STEP; mx=Math.ceil(mx/SLOT_STEP)*SLOT_STEP;
    const s=[]; for(let m=mn;m<mx;m+=SLOT_STEP) s.push(m);
    s.sort((a,b)=>a-b);
    return s;
  }

  const PALETTE = [
    {bg:'#dbeafe', bd:'#3b82f6', tx:'#1e3a8a'},
    {bg:'#ffedd5', bd:'#f97316', tx:'#7c2d12'},
    {bg:'#dcfce7', bd:'#22c55e', tx:'#14532d'},
    {bg:'#fce7f3', bd:'#ec4899', tx:'#831843'},
    {bg:'#ccfbf1', bd:'#14b8a6', tx:'#134e4a'},
    {bg:'#fef9c3', bd:'#ca8a04', tx:'#713f12'},
    {bg:'#ede9fe', bd:'#8b5cf6', tx:'#3b0764'},
    {bg:'#fee2e2', bd:'#ef4444', tx:'#7f1d1d'},
    {bg:'#e0e7ff', bd:'#6366f1', tx:'#1e1b4b'},
    {bg:'#d1fae5', bd:'#10b981', tx:'#064e3b'},
    {bg:'#fef3c7', bd:'#f59e0b', tx:'#78350f'},
    {bg:'#f3e8ff', bd:'#a855f7', tx:'#4a044e'},
    {bg:'#cffafe', bd:'#06b6d4', tx:'#164e63'},
    {bg:'#fbcfe8', bd:'#db2777', tx:'#500724'},
    {bg:'#a7f3d0', bd:'#059669', tx:'#022c22'},
    {bg:'#fde68a', bd:'#d97706', tx:'#451a03'},
  ];

  // Hash groupCode to a stable integer so same group always gets same color,
  // and groups that appear together cycle through maximally-spread palette slots.
  function _hashCode(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function _buildColorMap(allEntries) {
    const map = {};
    allEntries.forEach(e => {
      if(e.groupCode&&!(e.groupCode in map)){
        map[e.groupCode] = PALETTE[_hashCode(e.groupCode) % PALETTE.length];
      }
    });
    return map;
  }

  // ── Batch active check — exact mirror of timetableTableView ─
  const _today = () => new Date().toISOString().slice(0, 10);
  function _isBatchActive(batch, graceDays = 0) {
    if (!batch) return false;
    let effectiveEnd = batch.endDate || '';
    if (batch.endDateMode === 'lp' || !batch.endDateMode) {
      try {
        const assignment = getAssignmentForBatch(batch.id);
        const datedRows  = (assignment?.rows || []).filter(r => r.date);
        if (datedRows.length) effectiveEnd = datedRows[datedRows.length - 1].date;
      } catch(e) { /* fall back to stored endDate */ }
    }
    if (!effectiveEnd) return true;
    if (graceDays > 0) {
      const endMs    = new Date(effectiveEnd + 'T00:00:00').getTime();
      const graceMs  = graceDays * 24 * 60 * 60 * 1000;
      const graceEnd = new Date(endMs + graceMs).toISOString().slice(0, 10);
      return graceEnd >= _today();
    }
    return effectiveEnd >= _today();
  }

  function _collectEntries() {
    const timetables=AppState.get('timetables')||[];
    const teachers=AppState.get('teachers')||[];
    const batches=AppState.get('batches')||[];
    const subjects=AppState.get('subjects')||[];
    const rooms=AppState.get('rooms')||[];
    const campuses=AppState.get('campuses')||[];
    const discs=AppState.get('disciplines')||[];
    const entries=[];
    timetables.forEach(tt=>{
      const campus=campuses.find(c=>c.id===tt.campusId);
      const disc=discs.find(d=>d.id===tt.disciplineId);
      (tt.groups||[]).forEach(grp=>{
        (grp.subjects||[]).forEach(sub=>{
          if(!sub.teacherId||!sub.startTime||!sub.endTime) return;
          const teacher=teachers.find(t=>t.id===sub.teacherId);
          const batch=batches.find(b=>b.id===sub.batchId);
          const subject=subjects.find(s=>s.id===sub.subjectId);
          const room=rooms.find(r=>r.id===sub.roomId);

          // Skip expired batches — teacher slot should be free
          if (!_isBatchActive(batch, sub.graceDays || 0)) return;

          entries.push({
            campusId:   tt.campusId,
            campusName: campus?campus.campusName.replace(/\s*campus$/i,'').trim():'—',
            discId:     tt.disciplineId,
            discAbbr:   disc?.abbreviation||'—',
            groupCode:  grp.groupCode||'',
            teacherId:  sub.teacherId,
            teacherName:teacher?.fullName||'—',
            subjectCode:subject?.subjectCode||sub.subjectId||'—',
            batchName:  batch?.batchName||'—',
            batchShort: _batchShort(batch?.batchName||''),
            roomCode:   room?.name||'—',
            startTime:  sub.startTime,
            endTime:    sub.endTime,
            days:       sub.days||(sub.day?[sub.day]:[]),
          });
        });
      });
    });
    return entries;
  }

  function _filter(entries) {
    return entries.filter(e=>{
      if(_filterCampus  && e.campusId  !==_filterCampus)  return false;
      if(_filterDisc    && e.discId    !==_filterDisc)    return false;
      if(_filterTeacher && e.teacherId !==_filterTeacher) return false;
      return true;
    });
  }

  function _totalHrsDay(teacherEntries, day) {
    const seen=new Set(); let mins=0;
    teacherEntries.filter(e=>e.days.includes(day)).forEach(e=>{
      const k=`${e.startTime}|${e.endTime}`;
      if(!seen.has(k)){seen.add(k);mins+=_toMins(e.endTime)-_toMins(e.startTime);}
    });
    if(!mins) return '—';
    const h=mins/60; return Number.isInteger(h)?String(h):h.toFixed(1);
  }

  // ── STYLES — original v2, zero changes ───────────────────
  const STYLES=`
  <style id="ttTeacherStyles">
    .ttv-wrap{font-size:13px;font-variant-numeric:normal;}
    .ttv-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px;}
    .ttv-lbl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--t3);}
    .ttv-sel{background:var(--surface2);border:1px solid var(--border2);border-radius:var(--r-sm);padding:7px 11px;color:var(--t1);font-size:12.5px;outline:none;font-family:inherit;cursor:pointer;}
    .ttv-sel:focus{border-color:var(--blue);}
    .ttv-sel option{background:var(--surface);}
    .ttv-export-grp{margin-left:auto;display:flex;align-items:center;gap:6px;}
    .ttv-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:7px;border:1px solid var(--border);background:var(--surface2);color:var(--t3);cursor:pointer;transition:all .15s;}
    .ttv-icon-btn:hover{border-color:var(--blue);color:var(--blue);background:var(--blue-dim);}
    .ttv-day-pills{display:flex;gap:5px;margin-bottom:14px;flex-wrap:wrap;}
    .ttv-dp{padding:5px 14px;border-radius:20px;border:1px solid var(--border2);background:var(--surface2);color:var(--t3);font-size:12px;font-weight:600;cursor:pointer;transition:all .12s;font-family:inherit;}
    .ttv-dp:hover{border-color:var(--blue);color:var(--blue);}
    .ttv-dp.on{background:var(--blue);color:#fff;border-color:var(--blue);}
    .ttv-scroll{overflow-x:auto;overflow-y:auto;max-height:72vh;border:1px solid var(--border);border-radius:var(--r-lg);background:var(--surface);}
    .ttv-tbl{border-collapse:collapse;font-size:12px;width:100%;}
    .ttv-tbl thead tr{background:var(--surface2);border-bottom:2px solid var(--border);}
    .ttv-tbl thead th{position:sticky;top:0;z-index:2;background:var(--surface2);}
    .ttv-tbl th{padding:10px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--t3);white-space:nowrap;border-right:1px solid var(--border);text-align:center;min-width:90px;}
    .ttv-tbl th.th-name{text-align:left;min-width:160px;position:sticky;left:0;top:0;z-index:5;background:var(--surface2);border-right:2px solid var(--border);}
    .ttv-tbl th.th-total{background:rgba(79,133,247,.07);color:var(--blue,#4f85f7);border-left:2px solid var(--border);min-width:76px;position:sticky;right:0;z-index:2;}
    .ttv-tbl tbody tr{border-bottom:1px solid var(--border);}
    .ttv-tbl tbody tr:last-child{border-bottom:none;}
    .ttv-tbl tbody tr:hover .td-name{background:var(--surface2);}
    .td-name{padding:12px 14px;font-weight:700;font-size:13px;color:var(--t1);white-space:nowrap;position:sticky;left:0;z-index:1;background:var(--surface);border-right:2px solid var(--border);vertical-align:middle;}
    .td-slot{padding:4px;text-align:center;vertical-align:middle;border-right:1px solid var(--border);}
    .ttv-cell{border-radius:7px;padding:6px 8px;line-height:1.45;display:flex;flex-direction:column;gap:1px;min-height:56px;justify-content:center;border-width:1px;border-style:solid;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-variant-numeric:normal;font-feature-settings:'zero' 0,'tnum' 0;}
    .ttv-cell .cs{font-size:12.5px;font-weight:800;color:#111;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-variant-numeric:normal;font-feature-settings:'zero' 0;}
    .ttv-cell .cb{font-size:11px;font-weight:600;color:#111;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-variant-numeric:normal;font-feature-settings:'zero' 0;background:none;border:none;padding:0;border-radius:0;}
    .ttv-cell .cr{font-size:10px;color:#444;font-style:italic;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-variant-numeric:normal;font-feature-settings:'zero' 0;}
    .ttv-cell .ct{font-size:9.5px;color:#555;margin-top:2px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-variant-numeric:normal;font-feature-settings:'zero' 0;}
    .td-total{padding:10px 12px;font-size:13px;font-weight:800;color:var(--blue,#4f85f7);text-align:center;border-left:2px solid var(--border);background:rgba(79,133,247,.05);vertical-align:middle;white-space:nowrap;}
    .ttv-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:70px 20px;color:var(--t3);text-align:center;}
    .ttv-empty svg{opacity:.3;}.ttv-empty h3{font-size:15px;font-weight:700;color:var(--t2);}.ttv-empty p{font-size:13px;}
    @keyframes ttv-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
    .ttv-wrap{animation:ttv-in .22s ease;}
  </style>`;

  const ALL_DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const SHORT={'Monday':'Mon','Tuesday':'Tue','Wednesday':'Wed','Thursday':'Thu','Friday':'Fri','Saturday':'Sat','Sunday':'Sun'};

  // ── Main render ───────────────────────────────────────────
  function _render() {
    if(!_rootEl) return;
    const campuses=AppState.get('campuses')||[];
    const discs=AppState.get('disciplines')||[];
    const teachers=AppState.get('teachers')||[];
    const allEntries=_collectEntries();
    const colorMap=_buildColorMap(allEntries);
    const filtered=_filter(allEntries);
    const daysPresent=ALL_DAYS.filter(d=>filtered.some(e=>e.days.includes(d)));
    if(!_rootEl._dayFilter||!daysPresent.includes(_rootEl._dayFilter))
      _rootEl._dayFilter=daysPresent[0]||'Monday';
    const day=_rootEl._dayFilter;
    const dayEntries=filtered.filter(e=>e.days.includes(day));
    const slots=_buildSlots(dayEntries);
    const teacherIds=[...new Set(filtered.map(e=>e.teacherId))];

    _rootEl.innerHTML=STYLES+`
    <div class="ttv-wrap">
      <div class="ttv-toolbar">
        <span class="ttv-lbl">Campus</span>
        <select class="ttv-sel" id="ttvCampus">
          <option value="">All Campuses</option>
          ${campuses.map(c=>`<option value="${_esc(c.id)}"${_filterCampus===c.id?' selected':''}>${_esc(c.campusName.replace(/\s*campus$/i,'').trim())}</option>`).join('')}
        </select>
        <span class="ttv-lbl">Discipline</span>
        <select class="ttv-sel" id="ttvDisc">
          <option value="">All Disciplines</option>
          ${discs.map(d=>`<option value="${_esc(d.id)}"${_filterDisc===d.id?' selected':''}>${_esc(d.abbreviation||d.name||d.id)}</option>`).join('')}
        </select>
        <span class="ttv-lbl">Teacher</span>
        <select class="ttv-sel" id="ttvTeacher">
          <option value="">All Teachers</option>
          ${teachers.map(t=>`<option value="${_esc(t.id)}"${_filterTeacher===t.id?' selected':''}>${_esc(t.fullName)}</option>`).join('')}
        </select>
        <div class="ttv-export-grp">
          <button class="ttv-icon-btn" id="ttvExportCSV" title="Export CSV">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12l2.5 2.5L16 9"/>
            </svg>
          </button>
          <button class="ttv-icon-btn" id="ttvExportPDF" title="Export PDF">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="8" y1="13" x2="16" y2="13"/>
              <line x1="8" y1="17" x2="16" y2="17"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="ttv-day-pills" id="ttvPills">
        ${ALL_DAYS.map(d=>{
          if(!filtered.some(e=>e.days.includes(d))) return '';
          return `<button class="ttv-dp${d===day?' on':''}" data-day="${d}">${SHORT[d]}</button>`;
        }).join('')}
      </div>

      <div class="ttv-scroll">
        ${teacherIds.length===0
          ?`<div class="ttv-empty">
              <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              <div><h3>No Teachers Found</h3><p>Add timetable entries with teacher assignments to see the schedule here.</p></div>
            </div>`
          :`<table class="ttv-tbl">
              <thead><tr>
                <th class="th-name">Teacher</th>
                ${slots.map(s=>`<th>${_esc(_slotLabel(s,s+SLOT_STEP))}</th>`).join('')}
                <th class="th-total">Total Hrs</th>
              </tr></thead>
              <tbody>
                ${teacherIds.map(tid=>_teacherRow(tid,slots,dayEntries,filtered,day,colorMap)).join('')}
              </tbody>
            </table>`
        }
      </div>
    </div>`;

    _rootEl.querySelector('#ttvCampus')?.addEventListener('change',e=>{_filterCampus=e.target.value;_render();});
    _rootEl.querySelector('#ttvDisc')?.addEventListener('change',e=>{_filterDisc=e.target.value;_render();});
    _rootEl.querySelector('#ttvTeacher')?.addEventListener('change',e=>{_filterTeacher=e.target.value;_render();});
    _rootEl.querySelector('#ttvPills')?.addEventListener('click',e=>{
      const p=e.target.closest('.ttv-dp'); if(!p) return;
      _rootEl._dayFilter=p.dataset.day; _render();
    });
    _rootEl.querySelector('#ttvExportCSV')?.addEventListener('click',()=>{
      _exportCSV(filtered,day,slots,teacherIds,colorMap);
    });
    _rootEl.querySelector('#ttvExportPDF')?.addEventListener('click',()=>{
      _exportPDF(filtered,day,slots,teacherIds,colorMap);
    });
  }

  // ── Teacher row (screen) — original, untouched ────────────
  function _teacherRow(tid,slots,dayEntries,allFiltered,day,colorMap) {
    const tde=dayEntries.filter(e=>e.teacherId===tid);
    const tae=allFiltered.filter(e=>e.teacherId===tid);
    const name=tae[0]?.teacherName||tid;
    const totalHrs=_totalHrsDay(tae,day);

    const cells=[]; let skip=0;
    for(let i=0;i<slots.length;i++){
      if(skip>0){cells.push({skip:true});skip--;continue;}
      const ss=slots[i];
      const entry=tde.find(e=>_toMins(e.startTime)===ss);
      if(entry){
        const dur=_toMins(entry.endTime)-_toMins(entry.startTime);
        const span=Math.max(1,Math.round(dur/SLOT_STEP));
        cells.push({entry,span}); skip=span-1;
      } else { cells.push({empty:true}); }
    }

    const tds=cells.map(c=>{
      if(c.skip) return '';
      if(c.empty) return `<td class="td-slot"></td>`;
      const e=c.entry;
      const col=colorMap[e.groupCode]||PALETTE[0];
      return `<td class="td-slot" colspan="${c.span}">
        <div class="ttv-cell" style="background:${col.bg};border-color:${col.bd};color:${col.tx}">
          <span class="cs">${_esc(e.subjectCode)}</span>
          <span class="cb">${_esc(e.batchShort)}</span>
          <span class="cr">${_esc(e.roomCode)}</span>
          <span class="ct">${_fmtTime(e.startTime)}–${_fmtTime(e.endTime)}</span>
        </div>
      </td>`;
    }).join('');

    return `<tr><td class="td-name">${_esc(name)}</td>${tds}<td class="td-total">${_esc(totalHrs)}</td></tr>`;
  }

  // ── Shared HTML builder — same layout for CSV & PDF ───────
  function _buildExportHTML(filtered, day, slots, teacherIds, colorMap, mode) {
    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
    const timeStr = now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});

    // Filter labels
    const labelParts=[];
    if(_filterCampus){
      const c=(AppState.get('campuses')||[]).find(x=>x.id===_filterCampus);
      if(c) labelParts.push(`Campus: ${c.campusName.replace(/\s*campus$/i,'').trim()}`);
    }
    if(_filterDisc){
      const d=(AppState.get('disciplines')||[]).find(x=>x.id===_filterDisc);
      if(d) labelParts.push(`Discipline: ${d.abbreviation||d.name}`);
    }
    if(_filterTeacher){
      const t=(AppState.get('teachers')||[]).find(x=>x.id===_filterTeacher);
      if(t) labelParts.push(`Teacher: ${t.fullName}`);
    }
    const filterHTML=labelParts.length
      ? labelParts.map(f=>`<span class="filter-chip">${f}</span>`).join('')
      : '<span class="filter-chip no-filter">No filters — showing all teachers</span>';

    // Thead
    const thCells=[
      `<th class="th-name">Teacher</th>`,
      ...slots.map(s=>`<th>${_slotLabel(s,s+SLOT_STEP)}</th>`),
      `<th class="th-total">Total Hrs</th>`,
    ].join('');

    // Tbody — same cell logic as screen
    const dayEntries=filtered.filter(e=>e.days.includes(day));
    const tbodyRows=teacherIds.map(tid=>{
      const tde=dayEntries.filter(e=>e.teacherId===tid);
      const tae=filtered.filter(e=>e.teacherId===tid);
      const name=tae[0]?.teacherName||tid;
      const totalHrs=_totalHrsDay(tae,day);

      const cells=[]; let skip=0;
      for(let i=0;i<slots.length;i++){
        if(skip>0){cells.push({skip:true});skip--;continue;}
        const ss=slots[i];
        const entry=tde.find(e=>_toMins(e.startTime)===ss);
        if(entry){
          const dur=_toMins(entry.endTime)-_toMins(entry.startTime);
          const span=Math.max(1,Math.round(dur/SLOT_STEP));
          cells.push({entry,span}); skip=span-1;
        } else { cells.push({empty:true}); }
      }

      const tds=cells.map(c=>{
        if(c.skip) return '';
        if(c.empty) return `<td class="td-slot"></td>`;
        const e=c.entry;
        const col=colorMap[e.groupCode]||PALETTE[0];
        return `<td class="td-slot" colspan="${c.span}">
          <div class="ttv-cell" style="background:${col.bg};border:1px solid ${col.bd};color:${col.tx}">
            <span class="cs">${_esc(e.subjectCode)}</span>
            <span class="cb">${_esc(e.batchShort)}</span>
            <span class="cr">${_esc(e.roomCode)}</span>
            <span class="ct">${_fmtTime(e.startTime)}–${_fmtTime(e.endTime)}</span>
          </div>
        </td>`;
      }).join('');

      return `<tr><td class="td-name">${_esc(name)}</td>${tds}<td class="td-total">${_esc(totalHrs)}</td></tr>`;
    }).join('');

    // CSV also builds flat data for download
    const csvDataJson = JSON.stringify(
      teacherIds.flatMap(tid=>{
        const tde=dayEntries.filter(e=>e.teacherId===tid);
        const tae=filtered.filter(e=>e.teacherId===tid);
        const name=tae[0]?.teacherName||tid;
        const totalHrs=_totalHrsDay(tae,day);
        return tde.map(e=>[
          name,
          e.subjectCode,
          e.batchShort,
          e.batchName,
          e.roomCode,
          _fmtTime(e.startTime),
          _fmtTime(e.endTime),
          ((_toMins(e.endTime)-_toMins(e.startTime))/60).toFixed(1),
          day,
          totalHrs,
        ]);
      })
    );

    const actionBar = mode==='csv'
      ? `<div class="no-print" style="margin-top:18px;text-align:center;display:flex;align-items:center;justify-content:center;gap:12px">
           <button id="csvDlBtn" style="padding:9px 28px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:7px">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
             Download CSV
           </button>
           <button onclick="window.print()" style="padding:9px 28px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">
             Print / Save as PDF
           </button>
         </div>
         <script>
           (function(){
             var rows=${csvDataJson};
             var hdr=['Teacher','Subject','Batch No.','Batch Name','Room','Start','End','Duration(hrs)','Day','Total Hrs'];
             document.getElementById('csvDlBtn').onclick=function(){
               var lines=[hdr.join(',')].concat(rows.map(function(r){
                 return r.map(function(v){return '"'+String(v).replace(/"/g,'""')+'"';}).join(',');
               }));
               var blob=new Blob([lines.join('\\n')],{type:'text/csv;charset=utf-8;'});
               var url=URL.createObjectURL(blob);
               var a=document.createElement('a');
               a.href=url;
               a.download='Teacher-Timetable-${dateStr.replace(/ /g,'-')}.csv';
               document.body.appendChild(a);
               a.click();
               document.body.removeChild(a);
               URL.revokeObjectURL(url);
             };
           })();
         <\/script>`
      : `<div class="no-print" style="margin-top:18px;text-align:center">
           <button onclick="window.print()" style="padding:9px 28px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">
             Print / Save as PDF
           </button>
         </div>`;

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Teacher Timetable — ${day}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#1e293b;background:#fff;padding:18px 22px}

  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #2563eb;padding-bottom:12px;margin-bottom:14px}
  .header-left .title{font-size:20px;font-weight:700;color:#1e40af;letter-spacing:-0.3px}
  .header-left .subtitle{font-size:11px;color:#64748b;margin-top:2px}
  .header-right{text-align:right;font-size:10.5px;color:#64748b;line-height:1.6}
  .header-right .date{font-weight:600;color:#1e293b;font-size:11px}

  .meta-row{display:flex;align-items:center;gap:14px;margin-bottom:12px;flex-wrap:wrap}
  .stat-box{background:#f8faff;border:1px solid #dbeafe;border-radius:8px;padding:6px 14px;text-align:center;min-width:80px}
  .stat-box .num{font-size:18px;font-weight:700;color:#2563eb;font-family:monospace}
  .stat-box .lbl{font-size:9.5px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px}
  .day-badge{background:#2563eb;color:#fff;font-size:13px;font-weight:700;padding:5px 18px;border-radius:20px;letter-spacing:0.3px}

  .filters-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px}
  .filters-label{font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap}
  .filter-chip{background:#dbeafe;color:#1d4ed8;font-size:10px;font-weight:600;padding:2px 9px;border-radius:10px}
  .filter-chip.no-filter{background:#f1f5f9;color:#64748b}

  .tbl-wrap{overflow-x:auto}
  table{width:100%;border-collapse:collapse;font-size:10.5px}

  thead tr{background:#1e40af}
  thead th{color:#fff;font-weight:700;padding:9px 8px;text-align:center;font-size:9.5px;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;border-right:1px solid rgba(255,255,255,.15)}
  thead th.th-name{text-align:left;min-width:140px;border-right:2px solid rgba(255,255,255,.3)}
  thead th.th-total{background:#1e3a8a;border-left:2px solid rgba(255,255,255,.3);min-width:64px}

  tbody tr{border-bottom:1px solid #e2e8f0}
  tbody tr:nth-child(even){background:#f8faff}
  tbody tr:nth-child(odd){background:#fff}

  .td-name{padding:10px 14px;font-weight:700;font-size:12.5px;color:#1e293b;white-space:nowrap;border-right:2px solid #e2e8f0;vertical-align:middle}
  .td-slot{padding:3px;text-align:center;vertical-align:middle;border-right:1px solid #e2e8f0;min-width:90px}
  .td-total{padding:9px 12px;font-size:13px;font-weight:800;color:#2563eb;text-align:center;border-left:2px solid #e2e8f0;background:rgba(37,99,235,.05);vertical-align:middle;white-space:nowrap}

  /* Cells — exact same as screen (all font settings preserved) */
  .ttv-cell{border-radius:7px;padding:6px 8px;line-height:1.45;display:flex;flex-direction:column;gap:1px;min-height:56px;justify-content:center;border-width:1px;border-style:solid;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-variant-numeric:normal;font-feature-settings:'zero' 0,'tnum' 0;}
  .ttv-cell .cs{font-size:12.5px;font-weight:800;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-variant-numeric:normal;font-feature-settings:'zero' 0;}
  .ttv-cell .cb{font-size:11px;font-weight:600;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-variant-numeric:normal;font-feature-settings:'zero' 0;background:none;border:none;padding:0;border-radius:0;}
  .ttv-cell .cr{font-size:10px;font-style:italic;color:#444;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-variant-numeric:normal;font-feature-settings:'zero' 0;}
  .ttv-cell .ct{font-size:9.5px;color:#555;margin-top:2px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-variant-numeric:normal;font-feature-settings:'zero' 0;}

  .footer{margin-top:14px;padding-top:10px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9.5px;color:#94a3b8}
  .powered{margin-top:10px;text-align:center;font-size:10px;color:#94a3b8;letter-spacing:0.3px}

  @media print{
    body{padding:10px 12px}
    @page{size:A4 landscape;margin:8mm}
    .no-print{display:none}
  }
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <div class="title">Teacher Timetable Report</div>
      <div class="subtitle">Teacher-wise Weekly Schedule</div>
    </div>
    <div class="header-right">
      <div class="date">${dateStr}</div>
      <div>${timeStr}</div>
    </div>
  </div>

  <div class="meta-row">
    <span class="day-badge">${day}</span>
    <div class="stat-box"><div class="num">${teacherIds.length}</div><div class="lbl">Teachers</div></div>
    <div class="stat-box"><div class="num">${slots.length}</div><div class="lbl">Time Slots</div></div>
    <div class="stat-box"><div class="num">${filtered.length}</div><div class="lbl">Entries</div></div>
  </div>

  <div class="filters-row">
    <span class="filters-label">&#9660; Filters</span>
    ${filterHTML}
  </div>

  <div class="tbl-wrap">
    <table>
      <thead><tr>${thCells}</tr></thead>
      <tbody>${tbodyRows}</tbody>
    </table>
  </div>

  <div class="footer">
    <span>Teacher Timetable &nbsp;|&nbsp; Exported on ${dateStr} at ${timeStr}</span>
    <span>${teacherIds.length} teacher${teacherIds.length!==1?'s':''} &nbsp;|&nbsp; ${day}</span>
  </div>
  <div class="powered">Powered by <strong style="color:#2563eb">Learnomist</strong></div>

  ${actionBar}
</body>
</html>`;
  }

  // ── CSV Export — opens same grid page + Download CSV button
  function _exportCSV(filtered, day, slots, teacherIds, colorMap) {
    if(!filtered.length){alert('No data to export.');return;}
    const html=_buildExportHTML(filtered,day,slots,teacherIds,colorMap,'csv');
    const w=window.open('','_blank');
    w.document.write(html);
    w.document.close();
  }

  // ── PDF Export — opens same grid page + Print button (auto-triggers print)
  function _exportPDF(filtered, day, slots, teacherIds, colorMap) {
    if(!filtered.length){alert('No data to export.');return;}
    const html=_buildExportHTML(filtered,day,slots,teacherIds,colorMap,'pdf');
    const w=window.open('','_blank');
    w.document.write(html);
    w.document.close();
    setTimeout(()=>w.print(),600);
  }

  // ── Live sync ─────────────────────────────────────────────
  let _syncBound = false;

  function _bindSync() {
    if (_syncBound) return;
    _syncBound = true;

    let _debTimer = null;
    function _debouncedRender() {
      clearTimeout(_debTimer);
      _debTimer = setTimeout(() => { if (_rootEl && _rootEl.isConnected) _render(); }, 120);
    }

    if (typeof AppState.subscribe === 'function') {
      AppState.subscribe('timetables', _debouncedRender);
    }
    window.addEventListener('storage', e => {
      if (!e.key || e.key.toLowerCase().includes('timetable')) _debouncedRender();
    });
    window.addEventListener('appstate:change', e => {
      if (!e.detail?.key || e.detail.key === 'timetables') _debouncedRender();
    });
    window.addEventListener('sms:statechange', _debouncedRender);

    if (typeof AppState.set === 'function' && !AppState._ttViewPatched) {
      const _origSet = AppState.set.bind(AppState);
      AppState.set = function(key, value) {
        const result = _origSet(key, value);
        if (key === 'timetables') _debouncedRender();
        return result;
      };
      AppState._ttViewPatched = true;
    }
  }

  return {
    mount(el) {
      if (!el) return;
      _rootEl        = el;
      _filterCampus  = '';
      _filterDisc    = '';
      _filterTeacher = '';
      _render();
      _bindSync();
    },
    refresh() { _render(); },
    unmount()  { _rootEl = null; }
  };
})();
