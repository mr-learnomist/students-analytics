// ============================================================
// modules/timetable/timetableTableView.js
// Timetable Table View — with full Add Timetable form
// ============================================================

import { AppState } from '../../utils/state.js';
import { getAssignmentForBatch } from '../lecturePlan/lecturePlanService.js';

export const TimetableTableView = (() => {

  // ── Constants ─────────────────────────────────────────────
  const TIMETABLE_NAMES = [
    'FDA Timetable',
    'Skills Timetable',
    'Professional Timetable',
    'PRC Timetable',
    'CAF Group A Timetable',
    'CAF Group B Timetable',
  ];

  const TIME_SLOTS = (() => {
    const slots = [];
    for (let h = 7; h <= 21; h++) {
      ['00', '15', '30', '45'].forEach(m => {
        const hh = String(h).padStart(2, '0');
        slots.push(`${hh}:${m}`);
      });
    }
    return slots;
  })();

  // ── State ─────────────────────────────────────────────────
  const TT_KEY     = 'timetables';   // AppState persistence key
  let _rootEl      = null;
  let _searchQuery = '';
  let _timetables  = [];
  let _filterTt    = '';   // filter by timetable name
  let _filterCamp  = '';   // filter by campus id
  let _filterDisc  = '';   // filter by discipline id

  // ── Persist helpers ───────────────────────────────────────
  function _load()  { _timetables = AppState.get(TT_KEY) || []; }
  function _save()  { AppState.set(TT_KEY, _timetables); }

  // ── Helpers ───────────────────────────────────────────────
  const _today = () => new Date().toISOString().slice(0, 10);
  const _uid   = () => 'tt_' + Math.random().toString(36).slice(2, 9);

  function _escHtml(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _fmtDate(d) {
    if (!d) return '—';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  }

  function _fmtTime(t) {
    if (!t) return '—';
    const [h, m] = t.split(':');
    const hh = parseInt(h);
    const ampm = hh >= 12 ? 'PM' : 'AM';
    const h12  = hh % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  }

  // graceDays: optional extra days to keep the batch visible after endDate
  function _isBatchActive(batch, graceDays = 0) {
    if (!batch) return false;

    // Resolve effective end date — if mode is LP, fetch live from LP
    let effectiveEnd = batch.endDate || '';
    if (batch.endDateMode === 'lp' || !batch.endDateMode) {
      try {
        const assignment = getAssignmentForBatch(batch.id);
        const datedRows  = (assignment?.rows || []).filter(r => r.date);
        if (datedRows.length) effectiveEnd = datedRows[datedRows.length - 1].date;
      } catch(e) { /* no LP — fall back to stored endDate */ }
    }

    if (!effectiveEnd) return true;

    // Apply grace days — extend visibility beyond end date
    if (graceDays > 0) {
      const endMs    = new Date(effectiveEnd + 'T00:00:00').getTime();
      const graceMs  = graceDays * 24 * 60 * 60 * 1000;
      const graceEnd = new Date(endMs + graceMs).toISOString().slice(0, 10);
      return graceEnd >= _today();
    }

    return effectiveEnd >= _today();
  }

  // ── Teacher schedule availability check ───────────────────
  // Returns null if available, or error string if not available
  // Checks: 1) campus working days, 2) campus working hours, 3) existing timetable clashes
  // allowSameBatch: if true, same subject+batch at different time is allowed (only teacher/room clash matters)
  function _checkTeacherAvailability({ teacherId, campusId, day, startTime, endTime }, excludeGroupCode, allowSameBatch) {
    if (!teacherId || !campusId || !day || !startTime || !endTime) return null;

    const allTeachers = AppState.get('teachers') || [];
    const teacher = allTeachers.find(t => t.id === teacherId);
    if (!teacher) return null;

    // ── 1. Check campus schedule in teacher profile ────────
    const campSched = teacher.campusSchedules?.[campusId];
    if (campSched) {
      // Check working days
      const DAY_MAP = {
        'Monday':'mon','Tuesday':'tue','Wednesday':'wed',
        'Thursday':'thu','Friday':'fri','Saturday':'sat','Sunday':'sun'
      };
      const dayKey = DAY_MAP[day] || day.toLowerCase().slice(0,3);
      const workingDays = campSched.workingDays || [];
      if (workingDays.length && !workingDays.includes(dayKey)) {
        return `${teacher.fullName} is not available at this campus on ${day}s.`;
      }

      // Check working hours
      if (campSched.startTime && campSched.endTime) {
        if (startTime < campSched.startTime || endTime > campSched.endTime) {
          const fmt = t => {
            const [h, m] = t.split(':');
            const hr = +h;
            return `${hr % 12 || 12}:${m} ${hr < 12 ? 'AM' : 'PM'}`;
          };
          return `${teacher.fullName}'s hours at this campus are ${fmt(campSched.startTime)}–${fmt(campSched.endTime)}. Requested time is outside this window.`;
        }
      }
    }

    // ── 2. Check existing timetable clashes for this teacher ─
    for (const tt of _timetables) {
      for (const grp of (tt.groups || [])) {
        if (excludeGroupCode && grp.groupCode === excludeGroupCode) continue;
        for (const sub of (grp.subjects || [])) {
          if (sub.teacherId !== teacherId) continue;
          if (!sub.startTime || !sub.endTime) continue;
          const subDays = sub.days && sub.days.length ? sub.days : (sub.day ? [sub.day] : []);
          if (!subDays.includes(day)) continue;
          const overlap = sub.startTime < endTime && sub.endTime > startTime;
          if (!overlap) continue;
          const batch = (AppState.get('batches') || []).find(b => b.id === sub.batchId);
          const graceDays = sub.graceDays || 0;
          if (!_isBatchActive(batch, graceDays)) continue;
          return `${teacher.fullName} already has a class ${_fmtTime(sub.startTime)}–${_fmtTime(sub.endTime)} on ${day}`;
        }
      }
    }
    return null;
  }

  // ── Clash detection ───────────────────────────────────────
  // Returns error string or null
  // excludeGroupCode: skip this group when checking saved timetables (edit mode)
  function _checkClash({ campusId, teacherId, roomId, day, startTime, endTime }, excludeSubjectId, fs, excludeGroupCode) {
    // 1. Check within current form (same group)
    //    Rule: same group me sirf TIME overlap allowed nahi — room/teacher same ho sakte hain
    if (fs) {
      for (const [sid, sched] of Object.entries(fs.schedules)) {
        if (excludeSubjectId && (sid === excludeSubjectId)) continue;  // skip self
        if (!sched.startTime || !sched.endTime) continue;
        const sDays = sched.days || [];
        if (!sDays.includes(day)) continue;
        const overlap = sched.startTime < endTime && sched.endTime > startTime;
        if (!overlap) continue;
        const allSubs = AppState.get('subjects') || [];
        const sName = allSubs.find(s => s.id === (sched.subjectId || sid))?.subjectCode || sid;
        // Only block time overlap — room & teacher CAN be shared within same group
        return `Time overlaps with "${sName}" (${_fmtTime(sched.startTime)}–${_fmtTime(sched.endTime)}) on ${day}. Subjects in the same group cannot run at the same time.`;
      }
    }

    // 2. Check against all saved timetables (skip the group being edited)
    for (const tt of _timetables) {
      for (const grp of (tt.groups || [])) {
        // Skip the group currently being edited — its old data is being replaced
        if (excludeGroupCode && grp.groupCode === excludeGroupCode) continue;

        for (const sub of (grp.subjects || [])) {
          if (!sub.startTime || !sub.endTime) continue;
          const subDays = sub.days && sub.days.length ? sub.days : (sub.day ? [sub.day] : []);
          if (!subDays.includes(day)) continue;

          const overlap = sub.startTime < endTime && sub.endTime > startTime;
          if (!overlap) continue;

          const batch = (AppState.get('batches') || []).find(b => b.id === sub.batchId);
          const graceDays = sub.graceDays || 0;
          if (!_isBatchActive(batch, graceDays)) continue;

          if (tt.campusId === campusId && sub.teacherId === teacherId && teacherId) {
            return `Teacher already assigned ${_fmtTime(sub.startTime)}–${_fmtTime(sub.endTime)} on ${day}.`;
          }
          if (tt.campusId === campusId && sub.roomId === roomId && roomId) {
            return `Room occupied ${_fmtTime(sub.startTime)}–${_fmtTime(sub.endTime)} on ${day}.`;
          }
        }
      }
    }
    return null;
  }

  // ── Styles ────────────────────────────────────────────────
  const STYLES = `
    <style id="ttv2Styles">
      /* ── Toolbar ── */
      .tt-toolbar { display:flex; align-items:center; gap:12px; margin-bottom:18px; flex-wrap:wrap; }
      .tt-search-wrap {
        display:flex; align-items:center; gap:8px;
        background:var(--surface2); border:1px solid var(--border2);
        border-radius:var(--r-sm); padding:8px 12px;
        min-width:200px; max-width:300px; flex:1;
      }
      .tt-search-wrap:focus-within { border-color:var(--blue); }
      .tt-search-wrap input { background:none; border:none; outline:none; color:var(--t1); font-size:13px; width:100%; font-family:inherit; }
      .tt-search-wrap svg  { color:var(--t3); flex-shrink:0; }

      .tt-filter-select {
        appearance:none; -webkit-appearance:none;
        background:var(--surface2) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2394a3b8' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat right 10px center;
        border:1px solid var(--border2); border-radius:var(--r-sm);
        color:var(--t1); font-size:12.5px; font-family:inherit;
        padding:8px 28px 8px 12px; cursor:pointer; outline:none;
        min-width:130px; max-width:180px;
        transition:border-color .15s;
      }
      .tt-filter-select:focus { border-color:var(--blue); }
      .tt-filter-select.active { border-color:var(--blue); background-color:var(--blue-dim,rgba(37,99,235,.08)); color:var(--blue); font-weight:600; }
      .tt-filters-wrap { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }

      .tt-add-btn {
        display:flex; align-items:center; gap:8px;
        padding:9px 18px; background:var(--blue); color:#fff;
        border:none; border-radius:var(--r-sm);
        font-size:13.5px; font-weight:600; cursor:pointer;
        font-family:inherit; transition:opacity .15s, transform .15s;
        white-space:nowrap; margin-left:auto; flex-shrink:0;
      }
      .tt-add-btn:hover { opacity:.88; transform:translateY(-1px); }

      .tt-count { font-size:12px; color:var(--t3); margin-bottom:14px; }
      .tt-count strong { color:var(--t2); }

      /* ── Table ── */
      .tt-table-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--r-lg); overflow:auto; }
      .tt-table { width:100%; border-collapse:collapse; font-size:13px; min-width:900px; }
      .tt-table thead tr { background:var(--surface2); border-bottom:1px solid var(--border); }
      .tt-table th { text-align:left; padding:11px 14px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.06em; color:var(--t3); white-space:nowrap; }
      .tt-table td { padding:12px 14px; color:var(--t1); vertical-align:middle; border-bottom:1px solid var(--border); }
      .tt-table tbody tr:last-child td { border-bottom:none; }
      .tt-table tbody tr:hover td { background:var(--surface2); }
      .tt-bname { font-weight:600; color:var(--t1); }
      .tt-mono  { font-family:var(--font-mono,monospace); font-size:12px; font-weight:700; color:var(--violet); }
      .tt-subject-chip { display:inline-flex; align-items:center; gap:5px; background:var(--blue-dim); color:var(--blue); border:1px solid rgba(79,133,247,.25); border-radius:20px; padding:2px 9px; font-size:11px; font-weight:600; margin:2px; }
      .tt-time-chip    { display:inline-flex; align-items:center; gap:4px; background:var(--surface3); color:var(--t2); border-radius:6px; padding:2px 8px; font-size:11px; font-weight:600; margin:2px; }

      /* Inline edit selects in table */
      .tt-ie-sel {
        background:var(--surface2); border:1px solid var(--border2);
        border-radius:6px; padding:5px 8px; color:var(--t1);
        font-size:12px; outline:none; font-family:inherit;
        transition:border-color .15s; width:100%; max-width:160px;
      }
      .tt-ie-sel:focus { border-color:var(--blue); background:var(--surface); }
      .tt-ie-time { max-width:110px; }
      .tt-ie-sel option { background:var(--surface); }

      /* Day chips inside table */
      .tt-day-chips-wrap { display:flex; gap:3px; flex-wrap:nowrap; }
      .tt-day-chip {
        padding:2px 7px; border-radius:20px; border:1px solid var(--border2);
        background:var(--surface2); color:var(--t3); font-size:10.5px; font-weight:600;
        cursor:pointer; transition:all .12s; user-select:none; font-family:inherit;
        white-space:nowrap;
      }
      .tt-day-chip:hover { border-color:var(--blue); color:var(--blue); }
      .tt-day-chip.on { background:var(--blue); color:#fff; border-color:var(--blue); }

      .tt-cell-tt { min-width:140px; }
      .tt-sub-row td { vertical-align:middle; }

      .tt-status { display:inline-flex; align-items:center; gap:5px; padding:3px 9px; border-radius:20px; font-size:11px; font-weight:600; white-space:nowrap; }
      .tt-status.active   { background:var(--green-dim); color:var(--green); }
      .tt-status.inactive { background:var(--surface3);  color:var(--t3); }
      .tt-status-dot { width:6px; height:6px; border-radius:50%; background:currentColor; }

      .tt-actions { display:flex; align-items:center; gap:4px; }
      .tt-icon-btn { width:30px; height:30px; display:flex; align-items:center; justify-content:center; border-radius:var(--r-sm); border:none; background:none; color:var(--t3); cursor:pointer; transition:background .15s, color .15s; font-family:inherit; }
      .tt-icon-btn:hover      { background:var(--surface3); color:var(--t1); }
      .tt-icon-btn.del:hover  { background:rgba(239,68,68,.12); color:var(--red); }

      /* ── Empty ── */
      .tt-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; padding:70px 20px; color:var(--t3); text-align:center; }
      .tt-empty svg { opacity:.3; }
      .tt-empty h3  { font-size:15px; font-weight:700; color:var(--t2); }
      .tt-empty p   { font-size:13px; }

      /* ═══════════════════════════════════════════════════════
         ADD TIMETABLE MODAL — Full-screen style
      ══════════════════════════════════════════════════════════ */
      .ttm-overlay {
        position:fixed; inset:0; background:rgba(0,0,0,.55);
        display:flex; align-items:center; justify-content:center;
        z-index:1000; animation:ttmFadeIn .18s ease;
        padding:20px; box-sizing:border-box;
      }
      @keyframes ttmFadeIn { from{opacity:0} to{opacity:1} }

      .ttm-drawer {
        background:var(--surface);
        width:min(1100px, calc(100vw - 40px));
        max-height:calc(100vh - 40px);
        display:flex; flex-direction:column;
        border-radius:var(--r-xl);
        box-shadow:0 8px 48px rgba(0,0,0,.28);
        animation:ttmPopIn .22s cubic-bezier(.34,1.1,.64,1);
        overflow:hidden; flex-shrink:0;
      }
      @keyframes ttmPopIn { from{transform:scale(.96);opacity:.4} to{transform:none;opacity:1} }

      .ttm-head {
        display:flex; align-items:center; justify-content:space-between;
        padding:20px 28px; border-bottom:1px solid var(--border); flex-shrink:0;
      }
      .ttm-title { font-size:17px; font-weight:800; color:var(--t1); font-family:var(--font-display,sans-serif); }
      .ttm-close { width:32px; height:32px; display:flex; align-items:center; justify-content:center; border:none; background:none; border-radius:var(--r-sm); color:var(--t3); cursor:pointer; font-size:18px; transition:background .15s; }
      .ttm-close:hover { background:var(--surface2); color:var(--t1); }

      .ttm-body { flex:1; overflow-y:auto; padding:24px 28px; display:flex; flex-direction:column; gap:22px; }

      .ttm-foot {
        padding:16px 28px; border-top:1px solid var(--border); flex-shrink:0;
        display:flex; align-items:center; justify-content:flex-end; gap:12px;
      }

      /* ── Form sections ── */
      .ttm-section {
        background:var(--surface2); border:1px solid var(--border);
        border-radius:var(--r-lg); padding:18px 20px;
      }
      .ttm-section-title {
        font-size:11px; font-weight:700; text-transform:uppercase;
        letter-spacing:.07em; color:var(--t3); margin-bottom:14px;
        display:flex; align-items:center; gap:8px;
      }
      .ttm-section-title svg { opacity:.6; }

      .ttm-row { display:grid; gap:14px; margin-bottom:14px; }
      .ttm-row.cols-2 { grid-template-columns:1fr 1fr; }
      .ttm-row.cols-3 { grid-template-columns:1fr 1fr 1fr; }
      .ttm-row:last-child { margin-bottom:0; }

      .ttm-field { display:flex; flex-direction:column; gap:5px; }
      .ttm-label { font-size:12px; font-weight:600; color:var(--t2); display:flex; align-items:center; gap:4px; }
      .ttm-label .req { color:var(--red); }
      .ttm-hint  { font-size:11px; color:var(--t3); margin-top:3px; }

      .ttm-select, .ttm-input {
        background:var(--surface); border:1px solid var(--border2);
        border-radius:var(--r-sm); padding:9px 12px;
        color:var(--t1); font-size:13px; outline:none;
        font-family:inherit; transition:border-color .15s; width:100%;
      }
      .ttm-select:focus, .ttm-input:focus { border-color:var(--blue); }
      .ttm-select option { background:var(--surface); }
      .ttm-select:disabled, .ttm-input:disabled { opacity:.5; cursor:not-allowed; }

      /* Search-select combo */
      .ttm-search-combo { position:relative; }
      .ttm-search-combo input { padding-right:32px; }
      .ttm-search-combo .ttm-dd {
        position:absolute; top:100%; left:0; right:0; z-index:50;
        background:var(--surface); border:1px solid var(--border2);
        border-radius:var(--r-sm); box-shadow:var(--shadow);
        max-height:200px; overflow-y:auto; margin-top:4px; display:none;
      }
      .ttm-search-combo .ttm-dd.open { display:block; }
      .ttm-dd-item { padding:9px 13px; font-size:13px; color:var(--t1); cursor:pointer; transition:background .12s; }
      .ttm-dd-item:hover { background:var(--blue-dim); color:var(--blue); }
      .ttm-dd-item.selected { background:var(--blue-dim); color:var(--blue); font-weight:600; }
      .ttm-dd-empty { padding:10px 13px; font-size:12.5px; color:var(--t3); }

      /* Subject chips */
      .ttm-sub-chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:4px; min-height:36px; }
      .ttm-sub-chip {
        display:inline-flex; align-items:center; gap:6px;
        background:var(--blue-dim); color:var(--blue);
        border:1px solid rgba(79,133,247,.3); border-radius:20px;
        padding:4px 10px; font-size:12px; font-weight:600; cursor:pointer;
        transition:background .12s, border-color .12s;
        user-select:none;
      }
      .ttm-sub-chip:hover { background:rgba(79,133,247,.22); }
      .ttm-sub-chip.selected { background:var(--blue); color:#fff; border-color:var(--blue); }
      .ttm-sub-chip.selected:hover { background:var(--blue); opacity:.88; }

      /* Group code badge */
      .ttm-group-badge {
        display:inline-flex; align-items:center; gap:6px;
        background:var(--violet-dim,rgba(124,58,237,.1)); color:var(--violet,#7c3aed);
        border:1px solid rgba(124,58,237,.25); border-radius:var(--r-sm);
        padding:6px 14px; font-size:12px; font-weight:700;
        font-family:var(--font-mono,monospace); margin-bottom:12px;
      }

      /* Per-subject schedule rows */
      .ttm-sched-table { width:100%; border-collapse:collapse; }
      .ttm-sched-table th { font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--t3); padding:6px 10px; text-align:left; background:var(--surface3); border-bottom:1px solid var(--border); }
      .ttm-sched-table th:first-child { border-radius:var(--r-sm) 0 0 0; }
      .ttm-sched-table th:last-child  { border-radius:0 var(--r-sm) 0 0; }
      .ttm-sched-table td { padding:8px 10px; border-bottom:1px solid var(--border); vertical-align:middle; }
      .ttm-sched-table tr:last-child td { border-bottom:none; }
      .ttm-sched-table td:first-child { font-size:12px; font-weight:600; color:var(--t2); min-width:120px; }

      .ttm-sub-label { display:inline-flex; align-items:center; gap:6px; }
      .ttm-sub-code  { font-family:var(--font-mono,monospace); font-size:11px; font-weight:700; color:var(--violet,#7c3aed); background:var(--violet-dim,rgba(124,58,237,.1)); border-radius:4px; padding:2px 6px; }

      /* Error flash */
      .ttm-error-flash { border-color:var(--red) !important; animation:ttmShake .3s ease; }
      @keyframes ttmShake { 0%,100%{transform:none} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
      .ttm-field-error { font-size:11px; color:var(--red); margin-top:3px; }

      /* Clash warning */
      .ttm-clash-warn {
        display:flex; align-items:flex-start; gap:8px;
        background:rgba(239,68,68,.08); border:1px solid rgba(239,68,68,.3);
        border-radius:var(--r-sm); padding:9px 12px;
        font-size:12px; color:var(--red); margin-top:6px; line-height:1.45;
      }
      .ttm-clash-warn svg { flex-shrink:0; margin-top:1px; }

      /* Footer buttons */
      .ttm-btn-cancel {
        padding:9px 20px; border:1px solid var(--border2); border-radius:var(--r-sm);
        background:none; color:var(--t2); font-size:13px; font-weight:600;
        cursor:pointer; font-family:inherit; transition:background .15s;
      }
      .ttm-btn-cancel:hover { background:var(--surface2); }
      .ttm-btn-save {
        padding:9px 26px; background:var(--blue); border:none;
        border-radius:var(--r-sm); color:#fff;
        font-size:13px; font-weight:700; cursor:pointer;
        font-family:inherit; transition:opacity .15s;
      }
      .ttm-btn-save:hover { opacity:.85; }
      .ttm-btn-save:disabled { opacity:.5; cursor:not-allowed; }

      /* Step indicator */
      .ttm-steps { display:flex; align-items:center; gap:0; margin-bottom:6px; }
      .ttm-step {
        display:flex; align-items:center; gap:7px;
        font-size:12px; font-weight:600; color:var(--t3);
      }
      .ttm-step-num {
        width:22px; height:22px; border-radius:50%;
        display:flex; align-items:center; justify-content:center;
        font-size:11px; font-weight:700;
        background:var(--surface3); color:var(--t3);
        border:1px solid var(--border2);
      }
      .ttm-step.done .ttm-step-num { background:var(--green-dim); color:var(--green); border-color:var(--green); }
      .ttm-step.active .ttm-step-num { background:var(--blue); color:#fff; border-color:var(--blue); }
      .ttm-step.active { color:var(--t1); }
      .ttm-step-divider { flex:1; height:1px; background:var(--border); margin:0 8px; min-width:20px; }

      /* Name dropdown */
      .ttm-name-wrap { position:relative; }
      .ttm-name-dd {
        position:absolute; top:100%; left:0; right:0; z-index:50;
        background:var(--surface); border:1px solid var(--border2);
        border-radius:var(--r-sm); box-shadow:var(--shadow);
        margin-top:4px; display:none;
      }
      .ttm-name-dd.open { display:block; }
      .ttm-name-opt { padding:9px 13px; font-size:13px; color:var(--t1); cursor:pointer; transition:background .12s; }
      .ttm-name-opt:hover { background:var(--blue-dim); color:var(--blue); }

      /* Time input native */
      .ttm-time-input {
        background:var(--surface); border:1px solid var(--border2);
        border-radius:var(--r-sm); padding:7px 10px;
        color:var(--t1); font-size:13px; outline:none;
        font-family:inherit; transition:border-color .15s; width:100%;
        cursor:pointer;
      }
      .ttm-time-input:focus { border-color:var(--blue); box-shadow:0 0 0 2px color-mix(in srgb,var(--blue) 18%,transparent); }

      /* Duration preset buttons */
      .ttm-dur-presets {
        display:flex; gap:4px; margin-top:5px; flex-wrap:nowrap;
      }
      .ttm-dur-btn {
        padding:2px 8px; border-radius:12px; border:1px solid var(--border2);
        background:var(--surface2); color:var(--t3); font-size:10.5px; font-weight:700;
        cursor:pointer; transition:all .12s; white-space:nowrap; font-family:inherit;
      }
      .ttm-dur-btn:hover { background:var(--blue-dim); color:var(--blue); border-color:var(--blue); }
      .ttm-dur-btn.active { background:var(--blue); color:#fff; border-color:var(--blue); }
      .ttm-teacher-badge {
        display:inline-flex; align-items:center; gap:5px;
        background:var(--blue-dim); color:var(--blue);
        border:1px solid rgba(79,133,247,.25); border-radius:20px;
        padding:4px 10px; font-size:12px; font-weight:600; white-space:nowrap;
      }
      .ttm-teacher-lock-hint { font-size:10px; color:var(--t3); padding-left:4px; }

      /* Small select inside table */
      .ttm-sm-select {
        background:var(--surface); border:1px solid var(--border2);
        border-radius:6px; padding:6px 9px; color:var(--t1);
        font-size:12px; outline:none; font-family:inherit;
        transition:border-color .15s; width:100%;
      }
      .ttm-sm-select:focus { border-color:var(--blue); }
      .ttm-sm-select option { background:var(--surface); }

      /* Day multi-select chips inside schedule table */
      .ttm-day-chips { display:flex; flex-wrap:nowrap; gap:4px; min-width:320px; }
      .ttm-day-btn {
        padding:3px 9px; border-radius:20px; border:1px solid var(--border2);
        background:var(--surface2); color:var(--t3); font-size:11px; font-weight:600;
        cursor:pointer; transition:all .12s; user-select:none; font-family:inherit;
      }
      .ttm-day-btn:hover { border-color:var(--blue); color:var(--blue); background:var(--blue-dim); }
      .ttm-day-btn.on { background:var(--blue); color:#fff; border-color:var(--blue); }

      /* Subject code only pill */
      .ttm-sub-code-pill {
        font-family:var(--font-mono,monospace); font-size:11.5px; font-weight:700;
        color:var(--violet,#7c3aed); background:var(--violet-dim,rgba(124,58,237,.1));
        border-radius:5px; padding:3px 8px; white-space:nowrap;
      }
    </style>
  `;

  // ── Main Render ───────────────────────────────────────────
  function _render() {
    if (!_rootEl) return;

    const q        = _searchQuery.toLowerCase().trim();
    const filtered = _timetables.filter(tt => {
      // Dropdown filters
      if (_filterTt   && (tt.name || '') !== _filterTt)    return false;
      if (_filterCamp && tt.campusId     !== _filterCamp)   return false;
      if (_filterDisc && tt.disciplineId !== _filterDisc)   return false;
      // Search query
      if (!q) return true;
      if ((tt.name || '').toLowerCase().includes(q)) return true;
      if (_getCampusName(tt.campusId).toLowerCase().includes(q)) return true;
      if (_getDiscName(tt.disciplineId).toLowerCase().includes(q)) return true;
      const _allBatches  = AppState.get('batches')  || [];
      const _allTeachers = AppState.get('teachers') || [];
      const _allSubjects = AppState.get('subjects') || [];
      const _allRooms    = AppState.get('rooms')    || [];
      for (const grp of (tt.groups || [])) {
        if ((grp.groupCode || '').toLowerCase().includes(q)) return true;
        for (const sub of (grp.subjects || [])) {
          const _subj = _allSubjects.find(s => s.id === sub.subjectId);
          if ((_subj?.subjectCode || '').toLowerCase().includes(q)) return true;
          if ((_subj?.subjectName || '').toLowerCase().includes(q)) return true;
          const _bat = _allBatches.find(b => b.id === sub.batchId);
          if ((_bat?.batchName || '').toLowerCase().includes(q)) return true;
          const _tea = _allTeachers.find(t => t.id === sub.teacherId);
          if ((_tea?.fullName || '').toLowerCase().includes(q)) return true;
          const _rm = _allRooms.find(r => r.id === sub.roomId);
          if ((_rm?.name || '').toLowerCase().includes(q)) return true;
        }
      }
      return false;
    });

    _rootEl.innerHTML = STYLES + `
      <div class="tt-toolbar">
        <div class="tt-search-wrap">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" id="ttSearch" placeholder="Search timetables…" value="${_escHtml(_searchQuery)}"/>
        </div>
        <div class="tt-filters-wrap">
          <select class="tt-filter-select" id="ttFilterTt">
            <option value="">All Timetables</option>
            ${[...new Set(_timetables.map(t => t.name).filter(Boolean))].map(n => `<option value="${n}" ${_filterTt===n?'selected':''}>${n}</option>`).join('')}
          </select>
          <select class="tt-filter-select" id="ttFilterCamp">
            <option value="">All Campuses</option>
            ${(AppState.get('campuses')||[]).map(c => `<option value="${c.id}" ${_filterCamp===c.id?'selected':''}>${c.campusName.replace(/\s*campus$/i,'').trim()}</option>`).join('')}
          </select>
          <select class="tt-filter-select" id="ttFilterDisc">
            <option value="">All Disciplines</option>
            ${(AppState.get('disciplines')||[]).map(d => `<option value="${d.id}" ${_filterDisc===d.id?'selected':''}>${d.abbreviation}</option>`).join('')}
          </select>
        </div>
        <div class="tt-export-grp">
          <button class="tt-icon-export" id="ttExportCSV" title="Export CSV">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12l2.5 2.5L16 9"/>
            </svg>
          </button>
          <button class="tt-icon-export" id="ttExportPDF" title="Export PDF">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="8" y1="13" x2="16" y2="13"/>
              <line x1="8" y1="17" x2="16" y2="17"/>
            </svg>
          </button>
        </div>
        <button class="tt-add-btn" id="ttAddBtn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Timetable
        </button>
      </div>

      <div class="tt-count">
        Showing <strong>${filtered.length}</strong> of <strong>${_timetables.length}</strong> timetables
      </div>

      <div class="tt-table-card">
        ${filtered.length === 0 ? _emptyHTML() : `
          <table class="tt-table">
            <thead>
              <tr>
                <th>Timetable</th>
                <th>Campus</th>
                <th>Discipline</th>
                <th>Group</th>
                <th>Subject</th>
                <th>Batch</th>
                <th>Teacher</th>
                <th>Days</th>
                <th>Start</th>
                <th>End</th>
                <th>Room</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(tt => _rowHTML(tt)).join('')}
            </tbody>
          </table>
        `}
      </div>
    `;

    _rootEl.querySelector('#ttSearch')?.addEventListener('input', e => {
      _searchQuery = e.target.value;
      const cursorPos = e.target.selectionStart;
      _render();
      const newInput = _rootEl.querySelector('#ttSearch');
      if (newInput) {
        newInput.focus();
        newInput.setSelectionRange(cursorPos, cursorPos);
      }
    });
    _rootEl.querySelector('#ttFilterTt')?.addEventListener('change', e => {
      _filterTt = e.target.value; _render();
    });
    _rootEl.querySelector('#ttFilterCamp')?.addEventListener('change', e => {
      _filterCamp = e.target.value; _render();
    });
    _rootEl.querySelector('#ttFilterDisc')?.addEventListener('change', e => {
      _filterDisc = e.target.value; _render();
    });
    _rootEl.querySelector('#ttAddBtn')?.addEventListener('click', _openAddModal);
    // Mark active filters
    ['ttFilterTt','ttFilterCamp','ttFilterDisc'].forEach(id => {
      const el = _rootEl.querySelector('#' + id);
      if (el && el.value) el.classList.add('active');
    });
    _rootEl.querySelector('#ttExportCSV')?.addEventListener('click', () => _exportCSV(filtered));
    _rootEl.querySelector('#ttExportPDF')?.addEventListener('click', () => _exportPDF(filtered));

    // Edit entire group
    _rootEl.querySelectorAll('[data-tt-edit-grp]').forEach(btn =>
      btn.addEventListener('click', () => {
        const ttId    = btn.dataset.ttEditGrp;
        const grpCode = btn.dataset.ttEditGrpc;
        _openEditGroupModal(ttId, grpCode);
      })
    );

    // Delete entire timetable
    _rootEl.querySelectorAll('[data-tt-del]').forEach(btn =>
      btn.addEventListener('click', () => {
        const id = btn.dataset.ttDel;
        if (confirm('Delete this timetable and all its subjects?')) {
          _timetables = _timetables.filter(tt => tt.id !== id);
          _save();
          _render();
        }
      })
    );
  }

  // ── Row HTML — read-only display, one row per subject ────
  function _rowHTML(tt) {
    const campus      = _getCampusName(tt.campusId);
    const disc        = _getDiscName(tt.disciplineId);
    const allSubjects = AppState.get('subjects') || [];
    const allBatches  = AppState.get('batches')  || [];
    const allTeachers = AppState.get('teachers') || [];
    const allRooms    = AppState.get('rooms')    || [];
    const groups      = tt.groups || [];

    const SHORT_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const FULL_DAYS  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

    const rows = [];
    groups.forEach(grp => {
      (grp.subjects || []).forEach((sub, subIdx) => {
        const subject   = allSubjects.find(s => s.id === sub.subjectId) || {};
        const batch     = allBatches.find(b => b.id === sub.batchId)    || {};
        const teacher   = allTeachers.find(t => t.id === sub.teacherId) || {};
        const room      = allRooms.find(r => r.id === sub.roomId)       || {};
        const days      = sub.days || [];
        const isFirst   = subIdx === 0;
        const totalSubs = (grp.subjects || []).length;

        // Read-only day pills
        const dayPills = SHORT_DAYS.map((d, i) => {
          const active = days.includes(FULL_DAYS[i]);
          return active
            ? `<span class="tt-day-chip on" title="${FULL_DAYS[i]}">${d}</span>`
            : '';
        }).filter(Boolean).join('');

        // Determine if this batch is closed (expired with no remaining grace)
        const isClosed = batch.id ? !_isBatchActive(batch, sub.graceDays || 0) : false;

        rows.push(`
          <tr class="tt-sub-row" data-tt-id="${tt.id}"${isClosed ? ' style="opacity:0.7"' : ''}>
            ${isFirst ? `
              <td rowspan="${totalSubs}" class="tt-cell-tt" style="vertical-align:middle;border-right:1px solid var(--border)">
                <div class="tt-bname">${_escHtml(tt.name || grp.groupCode)}</div>
                <div style="font-size:11px;color:var(--t3);margin-top:2px">${tt.createdAt ? _fmtDate(tt.createdAt.slice(0,10)) : ''}</div>
              </td>
              <td rowspan="${totalSubs}" style="vertical-align:middle;border-right:1px solid var(--border)">
                <div style="font-size:12.5px;font-weight:600">${_escHtml(campus)}</div>
              </td>
              <td rowspan="${totalSubs}" style="vertical-align:middle;border-right:1px solid var(--border)">
                <span class="tt-subject-chip" style="font-family:var(--font-mono,monospace)">${_escHtml(disc)}</span>
              </td>
              <td rowspan="${totalSubs}" style="vertical-align:middle;border-right:1px solid var(--border)">
                <span class="tt-subject-chip">${_escHtml(grp.groupCode)}</span>
              </td>` : ''}
            <td style="white-space:nowrap">
              <span class="tt-sub-code-pill">${_escHtml(subject.subjectCode || sub.subjectId)}</span>
            </td>
            <td style="white-space:nowrap;font-size:12.5px;color:var(--t2)">
              ${_escHtml(batch.batchName || '—')}
              ${isClosed ? `<span style="display:inline-flex;align-items:center;gap:3px;margin-left:5px;padding:1px 7px;border-radius:20px;font-size:10px;font-weight:700;background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;vertical-align:middle;white-space:nowrap;">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                CLOSED
              </span>` : ''}
            </td>
            <td style="white-space:nowrap">
              ${teacher.fullName
                ? `<span class="ttm-teacher-badge">
                     <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                       <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                     </svg>
                     ${_escHtml(teacher.fullName)}
                   </span>`
                : '<span style="color:var(--t4);font-size:12px">—</span>'}
            </td>
            <td>
              <div class="tt-day-chips-wrap" style="flex-wrap:wrap;gap:3px">
                ${dayPills || '<span style="color:var(--t4);font-size:12px">—</span>'}
              </div>
            </td>
            <td style="white-space:nowrap;font-size:12.5px;font-weight:600;color:var(--t1)">
              ${sub.startTime ? _fmtTime(sub.startTime) : '<span style="color:var(--t4)">—</span>'}
            </td>
            <td style="white-space:nowrap;font-size:12.5px;font-weight:600;color:var(--t1)">
              ${sub.endTime ? _fmtTime(sub.endTime) : '<span style="color:var(--t4)">—</span>'}
            </td>
            <td style="white-space:nowrap;font-size:12.5px;color:var(--t2)">
              ${_escHtml(room.name || '—')}
            </td>
            <td style="vertical-align:middle">
              ${isFirst ? `
              <div class="tt-actions" style="display:flex;align-items:center;gap:6px;justify-content:flex-end">
                <button class="tt-icon-btn"
                        data-tt-edit-grp="${tt.id}"
                        data-tt-edit-grpc="${grp.groupCode}"
                        title="Edit group"
                        style="color:var(--blue);background:var(--blue-dim);border:1px solid rgba(79,133,247,.3)">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button class="tt-icon-btn del" data-tt-del="${tt.id}" title="Delete entire timetable">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
                  </svg>
                </button>
              </div>` : ''}
            </td>
          </tr>
        `);
      });
    });

    return rows.join('');
  }

  // ── Empty State ───────────────────────────────────────────
  function _emptyHTML() {
    const msg = _searchQuery
      ? 'No timetables match your search.'
      : 'No timetables yet. Click "Add Timetable" to create one.';
    return `
      <div class="tt-empty">
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <div>
          <h3>${_searchQuery ? 'No Results' : 'No Timetables Yet'}</h3>
          <p>${msg}</p>
        </div>
      </div>`;
  }

  // ═══════════════════════════════════════════════════════════
  //  EDIT GROUP MODAL — reuse add-form with pre-filled data
  // ═══════════════════════════════════════════════════════════
  function _openEditGroupModal(ttId, groupCode) {
    const tt = _timetables.find(t => t.id === ttId);
    if (!tt) return;
    const grp = (tt.groups || []).find(g => g.groupCode === groupCode);
    if (!grp) return;

    // Build fs from existing group data
    const fs = {
      campusId:     tt.campusId,
      disciplineId: tt.disciplineId,
      selectedSubs: (grp.subjects || []).map((s, i) => ({ subId: s.subjectId, instanceId: s.subjectId + '_' + i })),
      groupCode:    grp.groupCode,
      ttName:       tt.name || '',
      schedules:    {},
      _editMode:    true,
      _editTtId:    ttId,
      _editGrpCode: groupCode,
    };

    // Pre-fill schedules from existing subjects
    (grp.subjects || []).forEach((sub, i) => {
      const iid = sub.subjectId + '_' + i;
      fs.schedules[iid] = {
        batchId:   sub.batchId   || '',
        teacherId: sub.teacherId || '',
        roomId:    sub.roomId    || '',
        days:      sub.days      || [],
        startTime: sub.startTime || '',
        endTime:   sub.endTime   || '',
        graceDays: sub.graceDays != null ? sub.graceDays : 0,
      };
    });

    const overlay = document.createElement('div');
    overlay.className = 'ttm-overlay';
    overlay.innerHTML = `
      <div class="ttm-drawer" id="ttmDrawer">
        <div class="ttm-head">
          <div>
            <div class="ttm-title">Edit Group — <span style="font-family:var(--font-mono,monospace);color:var(--violet)">${_escHtml(groupCode)}</span></div>
            <div style="font-size:12px;color:var(--t3);margin-top:3px">Update schedule, teacher, room and time for each subject in this group</div>
          </div>
          <button class="ttm-close" id="ttmClose">✕</button>
        </div>
        <div class="ttm-body" id="ttmBody">
          ${_buildFormHTML(fs)}
        </div>
        <div class="ttm-foot">
          <button class="ttm-btn-cancel" id="ttmCancel">Cancel</button>
          <button class="ttm-btn-save" id="ttmSave" style="background:var(--violet,#7c3aed)">Update Group</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('#ttmClose').addEventListener('click', close);
    overlay.querySelector('#ttmCancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    _wireForm(overlay, fs, close);

    // Override save to UPDATE instead of create
    overlay.querySelector('#ttmSave').addEventListener('click', () => {
      if (!fs.campusId) { _flashError(overlay.querySelector('#ttmCampus'), 'Please select a campus.'); return; }
      if (!fs.disciplineId) { _flashError(overlay.querySelector('#ttmDisc'), 'Please select a discipline.'); return; }
      if (fs.selectedSubs.length === 0) { _toast('Please select at least one subject.'); return; }

      for (const entry of fs.selectedSubs) {
        const iid = entry.instanceId || entry;
        const sid = entry.subId || entry;
        const s = fs.schedules[iid] || {};
        if (!s.batchId)               { _toast('Please select a batch for each subject.'); return; }
        if (!s.teacherId)             { _toast('Please select a teacher for each subject.'); return; }
        if (!s.days || !s.days.length){ _toast('Please select at least one day for each subject.'); return; }
        if (!s.startTime)             { _toast('Please select a start time for each subject.'); return; }
        if (!s.endTime)               { _toast('Please select an end time for each subject.'); return; }
        if (!s.roomId)                { _toast('Please select a room for each subject.'); return; }
        if (s.startTime >= s.endTime) { _toast('End time must be after start time.'); return; }
        for (const day of s.days) {
          const teacherErr = _checkTeacherAvailability({ teacherId: s.teacherId, campusId: fs.campusId, day, startTime: s.startTime, endTime: s.endTime }, fs._editGrpCode);
          if (teacherErr) { _toast('⚠ ' + teacherErr); return; }
          const clash = _checkClash({
            campusId:  fs.campusId,
            teacherId: s.teacherId,
            roomId:    s.roomId,
            day,
            startTime: s.startTime,
            endTime:   s.endTime,
          }, iid, fs, fs._editGrpCode);  // iid = instanceId so same row is excluded
          if (clash) { _toast('⚠ Clash on ' + day + ': ' + clash); return; }
        }
      }

      // Apply update to existing timetable group
      const targetTt  = _timetables.find(t => t.id === fs._editTtId);
      const targetGrp = (targetTt?.groups || []).find(g => g.groupCode === fs._editGrpCode);
      if (!targetTt || !targetGrp) { _toast('Group not found.'); return; }

      targetTt.name         = fs.ttName || targetTt.name;
      targetTt.campusId     = fs.campusId;
      targetTt.disciplineId = fs.disciplineId;
      targetGrp.subjects    = fs.selectedSubs.map(e => {
        const iid = e.instanceId || e;
        const sid2 = e.subId || e;
        return {
          subjectId: sid2,
          days:      fs.schedules[iid]?.days || [],
          batchId:   fs.schedules[iid]?.batchId,
          teacherId: fs.schedules[iid]?.teacherId,
          roomId:    fs.schedules[iid]?.roomId,
          startTime: fs.schedules[iid]?.startTime,
          endTime:   fs.schedules[iid]?.endTime,
          graceDays: fs.schedules[iid]?.graceDays || 0,
        };
      });

      _save();
      close();
      _render();
      _toast('✅ Group updated successfully!');
    }, { once: true }); // once:true so original _wireForm save doesn't double-fire
  }

  // ═══════════════════════════════════════════════════════════
  //  ADD TIMETABLE MODAL
  // ═══════════════════════════════════════════════════════════
  function _openAddModal() {
    // Form state
    const fs = {
      campusId:     '',
      disciplineId: '',
      selectedSubs: [],      // array of subjectIds
      groupCode:    '',      // auto-generated
      // Per-subject schedule: { [subjectId]: { batchId, teacherId, roomId, day, startTime, endTime } }
      schedules:    {},
      ttName:       '',
    };

    const overlay = document.createElement('div');
    overlay.className = 'ttm-overlay';
    overlay.innerHTML = `
      <div class="ttm-drawer" id="ttmDrawer">
        <div class="ttm-head">
          <div>
            <div class="ttm-title">Add Timetable</div>
            <div style="font-size:12px;color:var(--t3);margin-top:3px">Configure subject groups with time, teacher &amp; room assignments</div>
          </div>
          <button class="ttm-close" id="ttmClose">✕</button>
        </div>
        <div class="ttm-body" id="ttmBody">
          ${_buildFormHTML(fs)}
        </div>
        <div class="ttm-foot">
          <button class="ttm-btn-cancel" id="ttmCancel">Cancel</button>
          <button class="ttm-btn-save"   id="ttmSave">Save Timetable</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#ttmClose').addEventListener('click', close);
    overlay.querySelector('#ttmCancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    // Wire the form
    _wireForm(overlay, fs, close);
  }

  // ── Build Form HTML ───────────────────────────────────────
  function _buildFormHTML(fs) {
    const campuses    = AppState.get('campuses')    || [];
    const disciplines = AppState.get('disciplines') || [];

    // Campus options
    const campOpts = campuses.map(c =>
      `<option value="${c.id}" ${c.id === fs.campusId ? 'selected' : ''}>${_escHtml(c.campusName)}</option>`
    ).join('');

    // Discipline options (filtered by campus if selected)
    let filteredDiscs = disciplines;
    if (fs.campusId) {
      // disciplines that have at least one batch in this campus
      const batches = AppState.get('batches') || [];
      const discIds = [...new Set(batches.filter(b => b.campusId === fs.campusId).map(b => b.disciplineId))];
      filteredDiscs = disciplines.filter(d => discIds.includes(d.id));
    }
    const discOpts = filteredDiscs.map(d =>
      `<option value="${d.id}" ${d.id === fs.disciplineId ? 'selected' : ''}>${_escHtml(d.fullName)} (${_escHtml(d.abbreviation)})</option>`
    ).join('');

    // Subjects for selected discipline
    let subjectChips = '';
    if (fs.campusId && fs.disciplineId) {
      const allSubjects = AppState.get('subjects') || [];
      const allLevels   = AppState.get('levels')   || [];
      const levelIds    = allLevels.filter(l => l.disciplineId === fs.disciplineId).map(l => l.id);
      const subs        = allSubjects.filter(s => levelIds.includes(s.levelId));
      if (subs.length) {
        subjectChips = subs.map(s => {
          const instanceCount = fs.selectedSubs.filter(e => e.subId === s.id).length;
          const badge = instanceCount > 0
            ? `<span style="background:#fff;color:var(--blue);border-radius:10px;padding:0 5px;font-size:10px;font-weight:800;margin-left:3px">${instanceCount}</span>`
            : '';
          return `
            <span class="ttm-sub-chip ${instanceCount > 0 ? 'selected' : ''}"
                  data-sub-id="${s.id}" title="Click to add ${_escHtml(s.subjectName)} — can add multiple times for different batches">
              ${_escHtml(s.subjectCode)}${badge}
            </span>
          `;
        }).join('');
      } else {
        subjectChips = '<span style="font-size:12.5px;color:var(--t3)">No subjects found for this discipline.</span>';
      }
    }

    // Schedule section
    const schedSection = (fs.selectedSubs.length > 0 && fs.campusId && fs.disciplineId)
      ? _buildScheduleHTML(fs)
      : '';

    // Name field (optional, at bottom)
    const nameOpts = TIMETABLE_NAMES.map(n =>
      `<div class="ttm-name-opt" data-name-opt="${_escHtml(n)}">${_escHtml(n)}</div>`
    ).join('');

    return `
      <!-- ① Campus + Discipline -->
      <div class="ttm-section">
        <div class="ttm-section-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
          Step 1 — Campus &amp; Discipline
        </div>
        <div class="ttm-row cols-2">
          <div class="ttm-field">
            <label class="ttm-label">Campus <span class="req">*</span></label>
            <select class="ttm-select" id="ttmCampus">
              <option value="">— Select Campus —</option>
              ${campOpts}
            </select>
          </div>
          <div class="ttm-field">
            <label class="ttm-label">Discipline <span class="req">*</span></label>
            <select class="ttm-select" id="ttmDisc" ${!fs.campusId ? 'disabled' : ''}>
              <option value="">— Select Discipline —</option>
              ${discOpts}
            </select>
          </div>
        </div>
      </div>

      <!-- ② Subject selection -->
      ${fs.campusId && fs.disciplineId ? `
      <div class="ttm-section" id="ttmSubSection">
        <div class="ttm-section-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/></svg>
          Step 2 — Select Subjects
          <span style="font-size:11px;font-weight:400;color:var(--t3);text-transform:none;letter-spacing:0">
            — click to select multiple; they form one group
          </span>
        </div>
        <div class="ttm-sub-chips" id="ttmSubChips">${subjectChips}</div>
        ${fs.selectedSubs.length > 0 ? `
        <div style="margin-top:10px;display:flex;align-items:center;gap:8px">
          <div class="ttm-group-badge">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            Group Code: <span id="ttmGroupCodeDisplay">${_escHtml(fs.groupCode || _makeGroupCode(fs))}</span>
          </div>
          <span style="font-size:11.5px;color:var(--t3)">${fs.selectedSubs.length} slot(s) added — same subject can appear multiple times with different batches — these subjects share no time/room clashes</span>
        </div>` : ''}
      </div>` : ''}

      <!-- ③ Per-subject schedule -->
      ${schedSection ? `
      <div class="ttm-section" id="ttmSchedSection">
        <div class="ttm-section-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Step 3 — Schedule per Subject
          <span style="font-size:11px;font-weight:400;color:var(--t3);text-transform:none;letter-spacing:0">
            — assign batch, teacher, room &amp; time for each subject
          </span>
        </div>
        ${schedSection}
      </div>` : ''}

      <!-- ④ Timetable Name (optional) -->
      ${fs.selectedSubs.length > 0 ? `
      <div class="ttm-section">
        <div class="ttm-section-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Step 4 — Timetable Name <span style="font-size:10.5px;font-weight:400;color:var(--t3);text-transform:none;letter-spacing:0">(optional)</span>
        </div>
        <div class="ttm-field">
          <label class="ttm-label">Name</label>
          <div class="ttm-name-wrap">
            <input class="ttm-input" id="ttmNameInput" placeholder="e.g. FDA Timetable or custom name…"
                   value="${_escHtml(fs.ttName)}" autocomplete="off"/>
            <div class="ttm-name-dd" id="ttmNameDd">${nameOpts}</div>
          </div>
          <span class="ttm-hint">Pick a preset or type a custom name.</span>
        </div>
      </div>` : ''}
    `;
  }

  // ── Build Schedule Rows ───────────────────────────────────
  function _buildScheduleHTML(fs) {
    const allSubjects = AppState.get('subjects') || [];
    const allBatches  = AppState.get('batches')  || [];
    const allTeachers = AppState.get('teachers') || [];
    const allRooms    = AppState.get('rooms')    || [];

    const levelIds = (AppState.get('levels') || [])
      .filter(l => l.disciplineId === fs.disciplineId).map(l => l.id);

    const SHORT_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const FULL_DAYS  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

    const rows = fs.selectedSubs.map(entry => {
      // entry = { subId, instanceId } — same subject can appear multiple times
      const subId      = entry.subId || entry;  // backward compat
      const instanceId = entry.instanceId || subId;
      const sub   = allSubjects.find(s => s.id === subId) || {};
      const sched = fs.schedules[instanceId] || {};
      const selDays = sched.days || [];

      // Batch: strict subjectId match + campus + active
      const activeBatches = allBatches.filter(b => {
        if (b.campusId !== fs.campusId) return false;
        if (!_isBatchActive(b)) return false;
        if (b.subjectId) return b.subjectId === subId;
        return levelIds.includes(b.levelId) || b.disciplineId === fs.disciplineId;
      });

      // In edit mode: if saved batch is now closed, show it as a disabled CLOSED option
      const savedBatchObj   = sched.batchId ? allBatches.find(b => b.id === sched.batchId) : null;
      const savedBatchClosed = savedBatchObj && !_isBatchActive(savedBatchObj, sched.graceDays || 0);

      const batchOpts = [
        ...(savedBatchClosed
          ? [`<option value="${savedBatchObj.id}" selected disabled style="color:#b91c1c;font-weight:700">${_escHtml(savedBatchObj.batchName)} (CLOSED — add grace days below)</option>`]
          : []),
        ...activeBatches.map(b =>
          `<option value="${b.id}" ${!savedBatchClosed && b.id === sched.batchId ? 'selected' : ''}>${_escHtml(b.batchName)}</option>`
        ),
      ].join('');

      // Teacher: for active batch pull from activeBatches; for closed batch still show saved teacher
      const selectedBatch = sched.batchId
        ? (activeBatches.find(b => b.id === sched.batchId) || (savedBatchClosed ? savedBatchObj : null))
        : null;
      const batchTeacherId = selectedBatch
        ? (selectedBatch.teacherId || (selectedBatch.teachers && selectedBatch.teachers[0]) || '')
        : '';
      if (batchTeacherId && (!sched.teacherId || sched.teacherId !== batchTeacherId)) {
        if (!fs.schedules[subId]) fs.schedules[subId] = { days: [] };
        fs.schedules[subId].teacherId = batchTeacherId;
        sched.teacherId = batchTeacherId;
      }
      const batchTeacher = batchTeacherId ? allTeachers.find(t => t.id === batchTeacherId) : null;
      const teacherSelectHTML = batchTeacher
        ? `<div class="ttm-teacher-locked" data-sf="${instanceId}">
             <span class="ttm-teacher-badge">
               <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                 <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
               </svg>
               ${_escHtml(batchTeacher.fullName)}
             </span>
             <span class="ttm-teacher-lock-hint">From batch</span>
             <input type="hidden" class="ttm-sm-select" data-sf="${instanceId}" data-field="teacherId" value="${batchTeacherId}"/>
           </div>`
        : `<select class="ttm-sm-select" data-sf="${instanceId}" data-field="teacherId">
             <option value="">— Select batch first —</option>
           </select>`;

      // Rooms: r.campus holds campusId — name only, sorted by room number
      // Filter: only show rooms that are currently available (check availability field)
      const today = new Date().toISOString().slice(0, 10);
      const isRoomAvailable = (r) => {
        const av = r.availability;
        if (!av) return true;
        if (av.endDate && av.endDate < today) return true; // auto-expired
        return (av.status || 'available') === 'available';
      };

      const campusRooms = allRooms
        .filter(r => (r.campus === fs.campusId || r.campusId === fs.campusId) && isRoomAvailable(r))
        .sort((a, b) => {
          const numA = parseInt((a.name || '').replace(/\D/g, '')) || 0;
          const numB = parseInt((b.name || '').replace(/\D/g, '')) || 0;
          return numA !== numB ? numA - numB : (a.name || '').localeCompare(b.name || '');
        });

      // Available rooms = not occupied at the selected time on any selected day
      const selDaysForRoom = sched.days || [];
      const selStart = sched.startTime || '';
      const selEnd   = sched.endTime   || '';
      const occupiedRoomIds = new Set();
      if (selStart && selEnd && selDaysForRoom.length) {
        for (const tt of _timetables) {
          for (const grp of (tt.groups || [])) {
            // Skip the group currently being edited — its saved data is stale (being replaced)
            if (fs._editGrpCode && grp.groupCode === fs._editGrpCode) continue;
            for (const existSub of (grp.subjects || [])) {
              if (!existSub.roomId || !existSub.startTime || !existSub.endTime) continue;
              // Don't mark room as occupied if its batch is expired
              const existBatch = allBatches.find(b => b.id === existSub.batchId);
              if (!_isBatchActive(existBatch, existSub.graceDays || 0)) continue;
              const existDays = existSub.days || [];
              const dayClash = selDaysForRoom.some(d => existDays.includes(d));
              if (!dayClash) continue;
              const overlap = existSub.startTime < selEnd && existSub.endTime > selStart;
              if (!overlap) continue;
              occupiedRoomIds.add(existSub.roomId);
            }
          }
        }
        // Same-group subjects: do NOT mark their rooms as occupied — allow room swapping within group.
        // Room conflicts within same group are caught at save time.
      }

      const roomOpts = (() => {
        const hasTimeFilter = selStart && selEnd && selDaysForRoom.length;
        let opts = `<option value="">— Select Room —</option>`;
        if (!campusRooms.length) {
          opts += `<option disabled>No rooms for this campus</option>`;
        } else {
          opts += campusRooms.map(r => {
            const isOccupied = occupiedRoomIds.has(r.id);
            const isSelected = r.id === sched.roomId;
            const disabled = isOccupied && !isSelected && hasTimeFilter;
            return `<option value="${r.id}" ${isSelected ? 'selected' : ''} ${disabled ? 'disabled style="color:var(--t4,#999)"' : ''}>${_escHtml(r.name)}${disabled ? ' (Occupied)' : ''}</option>`;
          }).join('');
        }
        return opts;
      })();

      const timeInput = (field, val) =>
        `<input type="time" class="ttm-time-input ttm-sm-select" 
                data-sf="${instanceId}" data-field="${field}"
                value="${val || ''}" step="900"/>`;

      // Day multi-select buttons
      const dayBtns = SHORT_DAYS.map((d, i) => `
        <button type="button"
                class="ttm-day-btn ${selDays.includes(FULL_DAYS[i]) ? 'on' : ''}"
                data-day-btn="${instanceId}" data-day-val="${FULL_DAYS[i]}"
                title="${FULL_DAYS[i]}">${d}</button>
      `).join('');

      return `
        <tr data-sched-sub="${subId}" data-instance-id="${instanceId}">
          <td style="white-space:nowrap">
            <div style="display:flex;align-items:center;gap:5px">
              <span class="ttm-sub-code-pill" title="${_escHtml(sub.subjectName || '')}">${_escHtml(sub.subjectCode || subId)}</span>
              <button type="button" class="ttm-remove-instance" data-instance-id="${instanceId}"
                title="Remove this row"
                style="width:18px;height:18px;display:flex;align-items:center;justify-content:center;border:none;background:none;color:var(--t4);cursor:pointer;border-radius:4px;flex-shrink:0;font-size:14px;line-height:1"
                onmouseover="this.style.color='var(--red)';this.style.background='rgba(239,68,68,.1)'"
                onmouseout="this.style.color='var(--t4)';this.style.background='none'">✕</button>
            </div>
          </td>
          <td style="min-width:145px">
            <select class="ttm-sm-select" data-sf="${instanceId}" data-field="batchId">
              <option value="">— Batch —</option>
              ${batchOpts || '<option disabled>No active batches</option>'}
            </select>
          </td>
          <td style="min-width:145px">
            ${teacherSelectHTML}
          </td>
          <td style="min-width:230px">
            <div class="ttm-day-chips" data-days-wrap="${instanceId}">${dayBtns}</div>
            ${selDays.length === 0 ? '<span style="font-size:10.5px;color:var(--t3);display:block;margin-top:3px">Select days</span>' : ''}
          </td>
          <td style="min-width:105px">
            ${timeInput('startTime', sched.startTime)}
          </td>
          <td style="min-width:105px">
            ${timeInput('endTime', sched.endTime)}
          </td>
          <td style="min-width:160px">
            <select class="ttm-sm-select" data-sf="${instanceId}" data-field="roomId"
              ${selStart && selEnd && selDaysForRoom.length ? `style="border-color:var(--green,#22c55e)" title="Showing only rooms available ${selStart}–${selEnd}"` : `title="Select days and times to filter available rooms"`}>
              ${roomOpts || '<option disabled>No rooms for this campus</option>'}
            </select>
          </td>
          <td style="min-width:95px">
            <div style="display:flex;flex-direction:column;gap:3px">
              <input type="number" min="0" max="365"
                class="ttm-sm-select ttm-grace-input" data-sf="${instanceId}" data-field="graceDays"
                value="${sched.graceDays || 0}"
                placeholder="0"
                title="Extra days to show in timetable after batch end date"
                style="width:70px;text-align:center"/>
              <span style="font-size:9.5px;color:var(--t3);text-align:center">days</span>
            </div>
          </td>
        </tr>
      `;
    });

    return `
      <div style="
        overflow-x:auto; border:1px solid var(--border); border-radius:var(--r-sm);
        scrollbar-width:thin; scrollbar-color:var(--border2) transparent;
        scroll-behavior:smooth;
      ">
        <style>
          #ttmSchedSection div::-webkit-scrollbar { height:5px; }
          #ttmSchedSection div::-webkit-scrollbar-track { background:transparent; }
          #ttmSchedSection div::-webkit-scrollbar-thumb { background:var(--border2); border-radius:10px; }
        </style>
        <table class="ttm-sched-table" style="min-width:1100px;width:100%">
          <thead>
            <tr>
              <th style="position:sticky;left:0;z-index:2;background:var(--surface3);width:110px">Subject</th>
              <th style="width:150px">Batch</th>
              <th style="width:160px">Teacher</th>
              <th>Days</th>
              <th style="width:115px">Start</th>
              <th style="width:115px">End</th>
              <th style="min-width:160px">Room</th>
              <th style="width:100px" title="Days visible after batch end date">Grace Days</th>
            </tr>
          </thead>
          <tbody id="ttmSchedBody">
            ${rows.join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ── Wire Form Events ──────────────────────────────────────
  function _wireForm(overlay, fs, close) {
    const body = overlay.querySelector('#ttmBody');

    function _rebuild() {
      if (!fs.groupCode || fs.groupCode === '') {
        fs.groupCode = _makeGroupCode(fs);
      }
      body.innerHTML = _buildFormHTML(fs);
      _attachEvents();
    }

    function _attachEvents() {
      // Campus change
      body.querySelector('#ttmCampus')?.addEventListener('change', e => {
        fs.campusId     = e.target.value;
        fs.disciplineId = '';
        fs.selectedSubs = [];
        fs.schedules    = {};
        fs.groupCode    = '';
        _rebuild();
      });

      // Discipline change
      body.querySelector('#ttmDisc')?.addEventListener('change', e => {
        fs.disciplineId = e.target.value;
        fs.selectedSubs = [];
        fs.schedules    = {};
        fs.groupCode    = '';
        _rebuild();
      });

      // Subject chip — each click ADDS a new instance (different batch same subject allowed)
      body.querySelectorAll('.ttm-sub-chip[data-sub-id]').forEach(chip => {
        chip.addEventListener('click', () => {
          const sid = chip.dataset.subId;
          // Always add a new instance with unique key = subjectId + _ + timestamp
          const instanceId = sid + '_' + Date.now();
          fs.selectedSubs = [...fs.selectedSubs, { subId: sid, instanceId }];
          fs.schedules[instanceId] = {
            subjectId: sid,
            days: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
          };
          fs.groupCode = _makeGroupCode(fs);
          _rebuild();
        });
      });

      // Remove-instance buttons (X on each schedule row)
      body.querySelectorAll('.ttm-remove-instance[data-instance-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          const iid = btn.dataset.instanceId;
          fs.selectedSubs = fs.selectedSubs.filter(e => e.instanceId !== iid);
          delete fs.schedules[iid];
          fs.groupCode = _makeGroupCode(fs);
          _rebuild();
        });
      });

      // Day multi-select buttons (no rebuild — just toggle + clash check)
      body.querySelectorAll('.ttm-day-btn[data-day-btn]').forEach(btn => {
        btn.addEventListener('click', () => {
          const sid = btn.dataset.dayBtn;
          const day = btn.dataset.dayVal;
          if (!fs.schedules[sid]) fs.schedules[sid] = { days: [] };
          const days = fs.schedules[sid].days || [];
          if (days.includes(day)) {
            fs.schedules[sid].days = days.filter(d => d !== day);
          } else {
            fs.schedules[sid].days = [...days, day];
          }
          btn.classList.toggle('on', fs.schedules[sid].days.includes(day));
          // Update hint below day chips
          const wrap = body.querySelector(`[data-days-wrap="${sid}"]`);
          if (wrap) {
            let hint = wrap.nextElementSibling;
            if (hint && hint.tagName === 'SPAN') hint.remove();
            if (fs.schedules[sid].days.length === 0) {
              const sp = document.createElement('span');
              sp.style.cssText = 'font-size:10.5px;color:var(--t3);display:block;margin-top:3px';
              sp.textContent = 'Select days';
              wrap.after(sp);
            }
          }
          // Refresh room dropdown — available rooms depend on selected days
          _refreshRoomDropdown(body, sid, fs);
          _updateClashCell(body, sid, fs);
        });
      });

      // Schedule field changes — time inputs + selects + grace days
      body.querySelectorAll('.ttm-sm-select[data-sf]').forEach(sel => {
        sel.addEventListener('change', () => {
          const sid   = sel.dataset.sf;
          const field = sel.dataset.field;
          if (!fs.schedules[sid]) fs.schedules[sid] = { days: [] };
          // Grace days: parse as integer
          if (field === 'graceDays') {
            fs.schedules[sid].graceDays = parseInt(sel.value) || 0;
            return;
          }
          fs.schedules[sid][field] = sel.value;
          if (field === 'batchId') {
            const batch = (AppState.get('batches') || []).find(b => b.id === sel.value);
            const tId = batch ? (batch.teacherId || (batch.teachers && batch.teachers[0]) || '') : '';
            fs.schedules[sid].teacherId = tId;
            _rebuild();
            return;
          }
          if (field === 'startTime' && sel.value) {
            // Auto-set end time to start + 1 hour if endTime not set
            const sched = fs.schedules[sid];
            if (!sched.endTime) {
              const [h, m] = sel.value.split(':').map(Number);
              const totalMins = h * 60 + m + 60;
              const endH = String(Math.floor(totalMins / 60) % 24).padStart(2, '0');
              const endM = String(totalMins % 60).padStart(2, '0');
              const autoEnd = `${endH}:${endM}`;
              fs.schedules[sid].endTime = autoEnd;
              const endInput = body.querySelector(`.ttm-time-input[data-sf="${sid}"][data-field="endTime"]`);
              if (endInput) endInput.value = autoEnd;
            }
            // Show next-available suggestion based on other subjects in group
            _showNextAvailHint(body, sid, fs);
          }
          // Refresh available rooms whenever time or days change
          if (field === 'startTime' || field === 'endTime') {
            _refreshRoomDropdown(body, sid, fs);
          }
        });
      });

      // Grace days: also wire input event (for direct typing)
      body.querySelectorAll('.ttm-grace-input[data-sf]').forEach(inp => {
        inp.addEventListener('input', () => {
          const sid = inp.dataset.sf;
          if (!fs.schedules[sid]) fs.schedules[sid] = { days: [] };
          fs.schedules[sid].graceDays = parseInt(inp.value) || 0;
        });
      });

      // Timetable name input + dropdown
      const nameInput = body.querySelector('#ttmNameInput');
      const nameDd    = body.querySelector('#ttmNameDd');
      if (nameInput && nameDd) {
        nameInput.addEventListener('input', e => { fs.ttName = e.target.value; });
        nameInput.addEventListener('focus', () => nameDd.classList.add('open'));
        nameInput.addEventListener('blur',  () => setTimeout(() => nameDd.classList.remove('open'), 180));
        nameDd.querySelectorAll('.ttm-name-opt').forEach(opt => {
          opt.addEventListener('mousedown', e => {
            e.preventDefault();
            fs.ttName = opt.dataset.nameOpt;
            nameInput.value = fs.ttName;
            nameDd.classList.remove('open');
          });
        });
      }
    }

    _attachEvents();

    // Save (only wire for Add mode — edit mode overrides with its own handler)
    if (fs._editMode) return;
    overlay.querySelector('#ttmSave').addEventListener('click', () => {
      // Validate campus + discipline
      if (!fs.campusId) {
        _flashError(overlay.querySelector('#ttmCampus'), 'Please select a campus.');
        return;
      }
      if (!fs.disciplineId) {
        _flashError(overlay.querySelector('#ttmDisc'), 'Please select a discipline.');
        return;
      }
      if (fs.selectedSubs.length === 0) {
        _toast('Please select at least one subject.');
        return;
      }

      // Validate schedules & clash check
      for (const entry of fs.selectedSubs) {
        const iid = entry.instanceId || entry;
        const sid = entry.subId || entry;
        const s = fs.schedules[iid] || {};
        if (!s.batchId)               { _toast('Please select a batch for each subject.'); return; }
        if (!s.teacherId)             { _toast('Please select a teacher for each subject.'); return; }
        if (!s.days || !s.days.length){ _toast('Please select at least one day for each subject.'); return; }
        if (!s.startTime)             { _toast('Please select a start time for each subject.'); return; }
        if (!s.endTime)               { _toast('Please select an end time for each subject.'); return; }
        if (!s.roomId)                { _toast('Please select a room for each subject.'); return; }
        if (s.startTime >= s.endTime) { _toast('End time must be after start time.'); return; }
        for (const day of s.days) {
          const teacherErr = _checkTeacherAvailability({ teacherId: s.teacherId, campusId: fs.campusId, day, startTime: s.startTime, endTime: s.endTime }, null);
          if (teacherErr) { _toast('⚠ ' + teacherErr); return; }
        }
        for (const day of s.days) {
          const clash = _checkClash({
            campusId:  fs.campusId,
            teacherId: s.teacherId,
            roomId:    s.roomId,
            day,
            startTime: s.startTime,
            endTime:   s.endTime,
          }, iid, fs, fs._editGrpCode);
          if (clash) { _toast('⚠ Clash on ' + day + ': ' + clash); return; }
        }
      }

      // ── Within-group room duplicate check ──────────────────
      // Two subjects in same group cannot share a room at overlapping times
      const grpEntries = fs.selectedSubs.map(e => ({ iid: e.instanceId || e, s: fs.schedules[e.instanceId || e] || {} }));
      for (let i = 0; i < grpEntries.length; i++) {
        for (let j = i + 1; j < grpEntries.length; j++) {
          const a = grpEntries[i].s, b = grpEntries[j].s;
          if (!a.roomId || !b.roomId || a.roomId !== b.roomId) continue;
          if (!a.startTime || !a.endTime || !b.startTime || !b.endTime) continue;
          const sharedDay = (a.days || []).find(d => (b.days || []).includes(d));
          if (!sharedDay) continue;
          const overlap = a.startTime < b.endTime && a.endTime > b.startTime;
          if (!overlap) continue;
          const allSubjs = AppState.get('subjects') || [];
          const allRooms = AppState.get('rooms') || [];
          const subA = allSubjs.find(s => s.id === (grpEntries[i].s.subjectId || fs.selectedSubs[i]?.subId || fs.selectedSubs[i]))?.subjectCode || '?';
          const subB = allSubjs.find(s => s.id === (grpEntries[j].s.subjectId || fs.selectedSubs[j]?.subId || fs.selectedSubs[j]))?.subjectCode || '?';
          const roomName = allRooms.find(r => r.id === a.roomId)?.name || a.roomId;
          _toast(`⚠ Room conflict: ${subA} and ${subB} both assigned to ${roomName} on ${sharedDay} (${_fmtTime(a.startTime)}–${_fmtTime(a.endTime)} vs ${_fmtTime(b.startTime)}–${_fmtTime(b.endTime)})`);
          return;
        }
      }


      // Build timetable object
      const groupCode = fs.groupCode || _makeGroupCode(fs);
      const newTT = {
        id:           _uid(),
        name:         fs.ttName || groupCode,
        campusId:     fs.campusId,
        disciplineId: fs.disciplineId,
        createdAt:    new Date().toISOString(),
        groups: [{
          groupCode,
          subjects: fs.selectedSubs.map(e => {
            const iid = e.instanceId || e;
            const sid2 = e.subId || e;
            return {
              subjectId: sid2,
              days:      fs.schedules[iid]?.days || [],
              batchId:   fs.schedules[iid]?.batchId,
              teacherId: fs.schedules[iid]?.teacherId,
              roomId:    fs.schedules[iid]?.roomId,
              startTime: fs.schedules[iid]?.startTime,
              endTime:   fs.schedules[iid]?.endTime,
              graceDays: fs.schedules[iid]?.graceDays || 0,
            };
          }),
        }],
      };

      _timetables.push(newTT);
      _save();       // ← persist
      close();
      _render();
      _toast('✅ Timetable saved successfully!');
    });
  }

  // ── Next-available slot hint ──────────────────────────────
  // After setting startTime, show what earliest next slot is based on other subjects
  function _showNextAvailHint(body, sid, fs) {
    const row = body.querySelector(`tr[data-sched-sub="${sid}"]`);
    if (!row) return;
    const startInput = row.querySelector(`.ttm-time-input[data-field="startTime"]`);
    if (!startInput) return;
    // Remove old hint
    let oldHint = row.querySelector('.ttm-next-avail-hint');
    if (oldHint) oldHint.remove();

    const sched = fs.schedules[sid] || {};
    const myDays = sched.days || [];
    if (!myDays.length || !sched.startTime) return;

    // Find the latest endTime of any other subject that overlaps my days
    let latestEnd = null;
    for (const [otherSid, otherSched] of Object.entries(fs.schedules)) {
      if (otherSid === sid) continue;
      if (!otherSched.endTime) continue;
      const sharedDays = (otherSched.days || []).filter(d => myDays.includes(d));
      if (!sharedDays.length) continue;
      if (!latestEnd || otherSched.endTime > latestEnd) latestEnd = otherSched.endTime;
    }

    if (latestEnd) {
      const hint = document.createElement('div');
      hint.className = 'ttm-next-avail-hint';
      hint.style.cssText = 'font-size:10.5px;color:var(--blue);margin-top:4px;display:flex;align-items:center;gap:4px;cursor:pointer';
      hint.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Next free: <strong>${_fmtTime(latestEnd)}</strong> — click to use`;
      hint.addEventListener('click', () => {
        startInput.value = latestEnd;
        fs.schedules[sid].startTime = latestEnd;
        // Auto-set end to +1 hour
        const [h, m] = latestEnd.split(':').map(Number);
        const totalMins = h * 60 + m + 60;
        const endH = String(Math.floor(totalMins / 60) % 24).padStart(2, '0');
        const endM = String(totalMins % 60).padStart(2, '0');
        const autoEnd = `${endH}:${endM}`;
        fs.schedules[sid].endTime = autoEnd;
        const endInput = row.querySelector(`.ttm-time-input[data-field="endTime"]`);
        if (endInput) endInput.value = autoEnd;
        hint.remove();
      });
      startInput.parentNode.appendChild(hint);
    }
  }

  // ── Refresh room dropdown for a single subject row ───────
  // Called whenever days / startTime / endTime change — no full rebuild needed
  function _refreshRoomDropdown(body, instanceId, fs) {
    const sel = body.querySelector(`.ttm-sm-select[data-sf="${instanceId}"][data-field="roomId"]`);
    if (!sel) return;

    const allRooms   = AppState.get('rooms') || [];
    const sched      = fs.schedules[instanceId] || {};
    const selDays    = sched.days      || [];
    const selStart   = sched.startTime || '';
    const selEnd     = sched.endTime   || '';

    // Same availability check as _buildScheduleHTML — exclude unavailable rooms
    const today = new Date().toISOString().slice(0, 10);
    const isRoomAvailable = (r) => {
      const av = r.availability;
      if (!av) return true;
      if (av.endDate && av.endDate < today) return true; // auto-expired
      return (av.status || 'available') === 'available';
    };

    // Campus rooms sorted naturally — unavailable rooms excluded
    const campusRooms = allRooms
      .filter(r => (r.campus === fs.campusId || r.campusId === fs.campusId) && isRoomAvailable(r))
      .sort((a, b) => {
        const numA = parseInt((a.name || '').replace(/\D/g, '')) || 0;
        const numB = parseInt((b.name || '').replace(/\D/g, '')) || 0;
        return numA !== numB ? numA - numB : (a.name || '').localeCompare(b.name || '');
      });

    // Compute occupied rooms (saved timetables + current form, excluding this row)
    const occupiedRoomIds = new Set();
    if (selStart && selEnd && selDays.length) {
      for (const tt of _timetables) {
        for (const grp of (tt.groups || [])) {
          // Skip the group currently being edited — its data is stale (being replaced)
          if (fs._editGrpCode && grp.groupCode === fs._editGrpCode) continue;
          for (const existSub of (grp.subjects || [])) {
            if (!existSub.roomId || !existSub.startTime || !existSub.endTime) continue;
            const existDays = existSub.days || [];
            const dayClash  = selDays.some(d => existDays.includes(d));
            if (!dayClash) continue;
            const overlap = existSub.startTime < selEnd && existSub.endTime > selStart;
            if (!overlap) continue;
            occupiedRoomIds.add(existSub.roomId);
          }
        }
      }
      // Same-group subjects excluded from occupiedRoomIds — room swapping within group is allowed.
      // Duplicate-room validation happens at save time.
    }

    const hasTimeFilter = selStart && selEnd && selDays.length;

    // If current room became occupied after time change, clear it
    if (hasTimeFilter && sched.roomId && occupiedRoomIds.has(sched.roomId)) {
      fs.schedules[instanceId].roomId = '';
    }

    // Auto-assign first available room if none selected and time is set
    if (hasTimeFilter && !fs.schedules[instanceId].roomId) {
      const firstAvail = campusRooms.find(r => !occupiedRoomIds.has(r.id));
      if (firstAvail) {
        fs.schedules[instanceId].roomId = firstAvail.id;
      }
    }

    const currentVal = fs.schedules[instanceId].roomId || '';

    // Rebuild options
    let optsHTML = `<option value="">— Room —</option>`;
    if (!campusRooms.length) {
      optsHTML += `<option disabled>No rooms for this campus</option>`;
    } else {
      optsHTML += campusRooms.map(r => {
        const isOccupied = occupiedRoomIds.has(r.id);
        const isSelected = r.id === currentVal;
        const disabled   = isOccupied && !isSelected && hasTimeFilter;
        return `<option value="${r.id}"
          ${isSelected ? 'selected' : ''}
          ${disabled ? 'disabled style="color:var(--t4,#999)"' : ''}>
          ${_escHtml(r.name)}${disabled ? ' (Occupied)' : ''}
        </option>`;
      }).join('');
    }

    sel.innerHTML = optsHTML;
    // Sync select element value explicitly
    sel.value = currentVal;

    // Visual cue — green border when filtering is active
    if (hasTimeFilter) {
      sel.title = `Auto-assigned — change if needed (${selStart}–${selEnd})`;
      sel.style.borderColor = 'var(--green,#22c55e)';
    } else {
      sel.title = 'Select days and times to filter available rooms';
      sel.style.borderColor = '';
    }
  }

  // ── No-op stubs (clash check is save-time only now) ──────
  function _refreshDurationPresets() {}
  function _updateClashCell() {}

  // ── Group code generator ──────────────────────────────────
  function _makeGroupCode(fs) {
    if (!fs.disciplineId) return '';
    const discs = AppState.get('disciplines') || [];
    const d = discs.find(x => x.id === fs.disciplineId);
    const abbr = d ? d.abbreviation : 'GRP';
    return abbr + '-' + Math.random().toString(36).slice(2, 5).toUpperCase();
  }

  function _getCampusName(id) {
    const c = (AppState.get('campuses') || []).find(x => x.id === id);
    // Strip trailing " Campus" / " campus" word
    return c ? c.campusName.replace(/\s*campus$/i, '').trim() : '—';
  }

  function _getDiscName(id) {
    const d = (AppState.get('disciplines') || []).find(x => x.id === id);
    // Return abbreviation only
    return d ? d.abbreviation : '—';
  }

  function _flashError(el, msg) {
    if (!el) return;
    el.classList.add('ttm-error-flash');
    el.focus();
    setTimeout(() => el.classList.remove('ttm-error-flash'), 1200);
    _toast(msg);
  }

  function _toast(msg) {
    const t = document.createElement('div');
    t.style.cssText = [
      'position:fixed','bottom:24px','right:24px','z-index:9999',
      'background:var(--surface3)','color:var(--t1)',
      'border:1px solid var(--border2)','border-radius:10px',
      'padding:12px 18px','font-size:13px','font-weight:500',
      'box-shadow:var(--shadow)','max-width:360px',
      'animation:toastIn .3s cubic-bezier(.34,1.56,.64,1)',
      'line-height:1.45',
    ].join(';');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  // ── Export helpers ────────────────────────────────────────
  function _fmtTimeTT(t) {
    if (!t) return '—';
    const [h, m] = t.split(':');
    const hh = parseInt(h);
    return `${hh % 12 || 12}:${m} ${hh >= 12 ? 'PM' : 'AM'}`;
  }

  // ── All available columns definition ──────────────────────
  const ALL_COLS = [
    { key:'ttName',      label:'Timetable',    def:true  },
    { key:'campus',      label:'Campus',        def:true  },
    { key:'disc',        label:'Discipline',    def:true  },
    { key:'groupCode',   label:'Group',         def:true  },
    { key:'subjectCode', label:'Subject Code',  def:true  },
    { key:'subjectName', label:'Subject Name',  def:false },
    { key:'batchName',   label:'Batch',         def:true  },
    { key:'teacherName', label:'Teacher',       def:true  },
    { key:'days',        label:'Days',          def:true  },
    { key:'startTime',   label:'Start Time',    def:true  },
    { key:'endTime',     label:'End Time',      def:true  },
    { key:'duration',    label:'Duration (hrs)',def:false },
    { key:'roomName',    label:'Room',          def:true  },
  ];

  function _flatRows(timetables) {
    const allSubjects = AppState.get('subjects') || [];
    const allBatches  = AppState.get('batches')  || [];
    const allTeachers = AppState.get('teachers') || [];
    const allRooms    = AppState.get('rooms')    || [];
    const SHORT = { Monday:'Mon', Tuesday:'Tue', Wednesday:'Wed', Thursday:'Thu', Friday:'Fri', Saturday:'Sat', Sunday:'Sun' };
    const rows = [];
    timetables.forEach(tt => {
      const campus = _getCampusName(tt.campusId);
      const disc   = _getDiscName(tt.disciplineId);
      (tt.groups || []).forEach(grp => {
        (grp.subjects || []).forEach(sub => {
          const subj    = allSubjects.find(s => s.id === sub.subjectId) || {};
          const batch   = allBatches.find(b => b.id === sub.batchId)   || {};
          const teacher = allTeachers.find(t => t.id === sub.teacherId)|| {};
          const room    = allRooms.find(r => r.id === sub.roomId)      || {};
          const days    = (sub.days || []).map(d => SHORT[d] || d).join(', ');
          const durMins = sub.startTime && sub.endTime
            ? (() => { const [sh,sm]=sub.startTime.split(':').map(Number); const [eh,em]=sub.endTime.split(':').map(Number); return (eh*60+em)-(sh*60+sm); })()
            : 0;
          rows.push({
            ttName:      tt.name || grp.groupCode,
            campus,
            disc,
            groupCode:   grp.groupCode,
            subjectCode: subj.subjectCode || sub.subjectId || '—',
            subjectName: subj.subjectName || '—',
            batchName:   batch.batchName  || '—',
            teacherName: teacher.fullName || '—',
            days,
            startTime:   _fmtTimeTT(sub.startTime),
            endTime:     _fmtTimeTT(sub.endTime),
            duration:    durMins ? (durMins / 60).toFixed(1) : '—',
            roomName:    room.name || '—',
          });
        });
      });
    });
    return rows;
  }

  // ── Column picker modal ────────────────────────────────────
  function _openColPicker(timetables, mode) {
    if (!timetables.length) { alert('No data to export.'); return; }

    // Remove existing picker if any
    document.getElementById('ttColPickerOverlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'ttColPickerOverlay';
    overlay.style.cssText = [
      'position:fixed','inset:0','z-index:2000',
      'background:rgba(0,0,0,.45)',
      'display:flex','align-items:center','justify-content:center',
      'padding:20px','box-sizing:border-box',
      'animation:ttmFadeIn .18s ease',
    ].join(';');

    const modeLabel = mode === 'csv' ? 'CSV' : 'PDF';
    const modeColor = mode === 'csv' ? '#16a34a' : '#2563eb';
    const modeIcon  = mode === 'csv'
      ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12l2.5 2.5L16 9"/></svg>`
      : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>`;

    overlay.innerHTML = `
      <div style="
        background:var(--surface,#fff);
        border-radius:14px;
        box-shadow:0 8px 48px rgba(0,0,0,.28);
        width:min(500px,calc(100vw - 40px));
        max-height:calc(100vh - 80px);
        display:flex;flex-direction:column;
        overflow:hidden;
        animation:ttmPopIn .22s cubic-bezier(.34,1.1,.64,1);
      ">
        <!-- Header -->
        <div style="padding:18px 22px;border-bottom:1px solid var(--border,#e2e8f0);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:32px;height:32px;border-radius:8px;background:${modeColor}22;color:${modeColor};display:flex;align-items:center;justify-content:center">
              ${modeIcon}
            </div>
            <div>
              <div style="font-size:15px;font-weight:700;color:var(--t1,#1e293b)">Export ${modeLabel}</div>
              <div style="font-size:11.5px;color:var(--t3,#94a3b8);margin-top:1px">Choose columns to include</div>
            </div>
          </div>
          <button id="ttColPickerClose" style="width:30px;height:30px;border:none;background:none;border-radius:6px;cursor:pointer;font-size:17px;color:var(--t3,#94a3b8);display:flex;align-items:center;justify-content:center">✕</button>
        </div>

        <!-- Column checkboxes -->
        <div style="padding:18px 22px;overflow-y:auto;flex:1">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--t3,#94a3b8)">Columns</span>
            <div style="display:flex;gap:8px">
              <button id="ttColSelectAll" style="font-size:11px;font-weight:600;color:var(--blue,#2563eb);background:none;border:none;cursor:pointer;padding:2px 6px;border-radius:4px">Select All</button>
              <button id="ttColSelectNone" style="font-size:11px;font-weight:600;color:var(--t3,#94a3b8);background:none;border:none;cursor:pointer;padding:2px 6px;border-radius:4px">Clear</button>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px" id="ttColGrid">
            ${ALL_COLS.map(col => `
              <label style="display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:8px;border:1px solid var(--border,#e2e8f0);background:var(--surface2,#f8fafc);cursor:pointer;transition:border-color .12s;user-select:none" class="ttcp-row">
                <input type="checkbox" data-col="${col.key}" ${col.def ? 'checked' : ''}
                  style="width:15px;height:15px;accent-color:var(--blue,#2563eb);cursor:pointer;flex-shrink:0"/>
                <span style="font-size:12.5px;font-weight:500;color:var(--t1,#1e293b)">${col.label}</span>
              </label>
            `).join('')}
          </div>
          <div id="ttColWarn" style="margin-top:10px;font-size:11.5px;color:#ef4444;display:none">⚠ Select at least one column.</div>
        </div>

        <!-- Footer -->
        <div style="padding:14px 22px;border-top:1px solid var(--border,#e2e8f0);display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-shrink:0">
          <button id="ttColPickerCancel" style="padding:8px 18px;border:1px solid var(--border2,#cbd5e1);border-radius:7px;background:none;color:var(--t2,#475569);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Cancel</button>
          <button id="ttColPickerExport" style="padding:8px 22px;background:${modeColor};border:none;border-radius:7px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:7px">
            ${modeIcon} Export ${modeLabel}
          </button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    // Hover effect on rows
    overlay.querySelectorAll('.ttcp-row').forEach(row => {
      row.addEventListener('mouseenter', () => row.style.borderColor = 'var(--blue,#2563eb)');
      row.addEventListener('mouseleave', () => {
        const cb = row.querySelector('input[type=checkbox]');
        row.style.borderColor = cb?.checked ? 'var(--blue,#2563eb)' : 'var(--border,#e2e8f0)';
      });
    });
    // Sync border on check change
    overlay.querySelectorAll('input[type=checkbox]').forEach(cb => {
      const row = cb.closest('.ttcp-row');
      cb.addEventListener('change', () => {
        row.style.borderColor = cb.checked ? 'var(--blue,#2563eb)' : 'var(--border,#e2e8f0)';
        overlay.querySelector('#ttColWarn').style.display = 'none';
      });
    });

    const close = () => overlay.remove();
    overlay.querySelector('#ttColPickerClose').addEventListener('click', close);
    overlay.querySelector('#ttColPickerCancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    overlay.querySelector('#ttColSelectAll').addEventListener('click', () => {
      overlay.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.checked = true;
        cb.closest('.ttcp-row').style.borderColor = 'var(--blue,#2563eb)';
      });
      overlay.querySelector('#ttColWarn').style.display = 'none';
    });
    overlay.querySelector('#ttColSelectNone').addEventListener('click', () => {
      overlay.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.checked = false;
        cb.closest('.ttcp-row').style.borderColor = 'var(--border,#e2e8f0)';
      });
    });

    overlay.querySelector('#ttColPickerExport').addEventListener('click', () => {
      const selectedCols = [...overlay.querySelectorAll('input[type=checkbox]')]
        .filter(cb => cb.checked)
        .map(cb => cb.dataset.col);

      if (!selectedCols.length) {
        overlay.querySelector('#ttColWarn').style.display = 'block';
        return;
      }
      close();
      _buildExportHTML(timetables, mode, selectedCols);
    });
  }

  // ── Shared export HTML builder ─────────────────────────────
  function _buildExportHTML(timetables, mode, selectedColKeys) {
    const cols    = ALL_COLS.filter(c => selectedColKeys.includes(c.key));
    const rows    = _flatRows(timetables);
    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

    const ttCount  = timetables.length;
    const grpCount = timetables.reduce((n, tt) => n + (tt.groups || []).length, 0);
    const subCount = rows.length;

    const filterLabel = _searchQuery.trim()
      ? `<span class="filter-chip">Search: "${_escHtml(_searchQuery.trim())}"</span>`
      : '<span class="filter-chip no-filter">No filters — showing all timetables</span>';

    const colsLabel = cols.map(c => `<span class="filter-chip">${c.label}</span>`).join('');

    // ── Determine which "grouped" cols are active (for rowspan logic)
    const hasTt   = selectedColKeys.includes('ttName');
    const hasCamp = selectedColKeys.includes('campus');
    const hasDisc = selectedColKeys.includes('disc');
    const hasGrp  = selectedColKeys.includes('groupCode');

    // ── Build tbody with rowspans only for active grouped columns ──
    let tbodyHTML = '';
    const allSubjects = AppState.get('subjects') || [];
    const allBatches  = AppState.get('batches')  || [];
    const allTeachers = AppState.get('teachers') || [];
    const allRooms    = AppState.get('rooms')    || [];
    const SHORT = { Monday:'Mon', Tuesday:'Tue', Wednesday:'Wed', Thursday:'Thu', Friday:'Fri', Saturday:'Sat', Sunday:'Sun' };

    timetables.forEach(tt => {
      const campus = _getCampusName(tt.campusId);
      const disc   = _getDiscName(tt.disciplineId);
      const groups = tt.groups || [];
      const ttSubCount = groups.reduce((n, g) => n + (g.subjects || []).length, 0);
      let ttFirst = true;

      groups.forEach(grp => {
        const subs = grp.subjects || [];
        let grpFirst = true;

        subs.forEach(sub => {
          const subj    = allSubjects.find(s => s.id === sub.subjectId) || {};
          const batch   = allBatches.find(b => b.id === sub.batchId)   || {};
          const teacher = allTeachers.find(t => t.id === sub.teacherId)|| {};
          const room    = allRooms.find(r => r.id === sub.roomId)      || {};
          const days = (sub.days || []).map(d => SHORT[d] || d).join(', ');
          const durMins = sub.startTime && sub.endTime
            ? (() => { const [sh,sm]=sub.startTime.split(':').map(Number); const [eh,em]=sub.endTime.split(':').map(Number); return (eh*60+em)-(sh*60+sm); })()
            : 0;
          const rowData = {
            ttName: tt.name || grp.groupCode, campus, disc,
            groupCode: grp.groupCode,
            subjectCode: subj.subjectCode || sub.subjectId || '—',
            subjectName: subj.subjectName || '—',
            batchName: batch.batchName || '—',
            teacherName: teacher.fullName || '—',
            days,
            startTime: _fmtTimeTT(sub.startTime),
            endTime: _fmtTimeTT(sub.endTime),
            duration: durMins ? (durMins / 60).toFixed(1) : '—',
            roomName: room.name || '—',
          };

          let tds = '';
          cols.forEach(col => {
            const isRowspanTT  = hasTt   && col.key === 'ttName'    && !ttFirst;
            const isRowspanCp  = hasCamp && col.key === 'campus'    && !ttFirst;
            const isRowspanDi  = hasDisc && col.key === 'disc'      && !ttFirst;
            const isRowspanGrp = hasGrp  && col.key === 'groupCode' && !grpFirst;
            if (isRowspanTT || isRowspanCp || isRowspanDi || isRowspanGrp) return; // covered by rowspan

            let tdClass = 'td-base';
            if (col.key === 'ttName')    tdClass = 'td-tt';
            if (col.key === 'groupCode') tdClass = 'td-grp';
            if (col.key === 'subjectCode') tdClass = 'td-sub';
            if (col.key === 'days')      tdClass = 'td-days';
            if (col.key === 'startTime' || col.key === 'endTime') tdClass = 'td-time';

            const rsAttr =
              col.key === 'ttName'    && hasTt   ? ` rowspan="${ttSubCount}"` :
              col.key === 'campus'    && hasCamp  ? ` rowspan="${ttSubCount}"` :
              col.key === 'disc'      && hasDisc  ? ` rowspan="${ttSubCount}"` :
              col.key === 'groupCode' && hasGrp   ? ` rowspan="${subs.length}"` : '';

            const val = col.key === 'groupCode'
              ? `<span class="grp-badge">${_escHtml(rowData[col.key])}</span>`
              : _escHtml(rowData[col.key]);

            tds += `<td class="${tdClass}"${rsAttr}>${val}</td>`;
          });

          const isLastSub = sub === subs[subs.length - 1];
          const isLastGrp = grp === groups[groups.length - 1];
          tbodyHTML += `<tr>${tds}</tr>`;
          if (isLastSub) {
            const sepClass = isLastGrp ? 'sep-tt' : 'sep-grp';
            tbodyHTML += `<tr class="${sepClass}"><td colspan="${cols.length}"></td></tr>`;
          }
          ttFirst  = false;
          grpFirst = false;
        });
      });
    });

    // ── CSV flat data (only selected cols) ─────────────────
    const csvHeaders = cols.map(c => c.label);
    const csvRows    = rows.map(r => cols.map(c => r[c.key]));
    const csvDataJson = JSON.stringify({ headers: csvHeaders, rows: csvRows });

    const actionBar = mode === 'csv'
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
             var data=${csvDataJson};
             document.getElementById('csvDlBtn').onclick=function(){
               var lines=[data.headers.join(',')].concat(data.rows.map(function(r){
                 return r.map(function(v){return '"'+String(v).replace(/"/g,'""')+'"';}).join(',');
               }));
               var blob=new Blob([lines.join('\\n')],{type:'text/csv;charset=utf-8;'});
               var url=URL.createObjectURL(blob);
               var a=document.createElement('a');
               a.href=url; a.download='Timetable-${dateStr.replace(/ /g,'-')}.csv';
               document.body.appendChild(a); a.click();
               document.body.removeChild(a); URL.revokeObjectURL(url);
             };
           })();
         <\/script>`
      : `<div class="no-print" style="margin-top:18px;text-align:center">
           <button onclick="window.print()" style="padding:9px 28px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">
             Print / Save as PDF
           </button>
         </div>`;

    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Timetable Report</title>
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
  .filters-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px}
  .filters-label{font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap}
  .filter-chip{background:#dbeafe;color:#1d4ed8;font-size:10px;font-weight:600;padding:2px 9px;border-radius:10px}
  .filter-chip.no-filter{background:#f1f5f9;color:#64748b}
  .cols-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:14px;padding:6px 12px}
  .cols-label{font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap}
  .tbl-wrap{overflow-x:auto}
  table{width:100%;border-collapse:collapse;font-size:10.5px}
  thead tr{background:#1e40af}
  thead th{color:#fff;font-weight:700;padding:9px 8px;text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;border-right:1px solid rgba(255,255,255,.15)}
  thead th:last-child{border-right:none}
  tbody tr{border-bottom:1px solid #e2e8f0;background:#fff}
  tbody tr.sep-grp td{padding:0;height:1px;background:#94a3b8;border:none;line-height:0;font-size:0}
  tbody tr.sep-tt td{padding:0;height:2px;background:#94a3b8;border:none;line-height:0;font-size:0}
  .td-tt{padding:10px 12px;font-weight:700;font-size:12px;color:#1e293b;border-right:2px solid #e2e8f0;vertical-align:middle;min-width:120px}
  .td-base{padding:8px 10px;color:#334155;border-right:1px solid #e2e8f0;vertical-align:middle;white-space:nowrap}
  .td-grp{padding:8px 10px;border-right:2px solid #e2e8f0;vertical-align:middle;text-align:center}
  .td-sub{padding:8px 10px;font-weight:700;color:#1e293b;border-right:1px solid #e2e8f0;vertical-align:middle;white-space:nowrap;font-family:monospace}
  .td-days{padding:8px 10px;color:#334155;border-right:1px solid #e2e8f0;vertical-align:middle}
  .td-time{padding:8px 10px;font-weight:600;color:#1e293b;border-right:1px solid #e2e8f0;vertical-align:middle;white-space:nowrap;font-family:monospace}
  .grp-badge{display:inline-block;background:#ede9fe;color:#5b21b6;border:1px solid #c4b5fd;border-radius:20px;padding:2px 10px;font-size:10px;font-weight:700;font-family:monospace;white-space:nowrap}
  .footer{margin-top:14px;padding-top:10px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9.5px;color:#94a3b8}
  .powered{margin-top:10px;text-align:center;font-size:10px;color:#94a3b8;letter-spacing:0.3px}
  @media print{body{padding:10px 12px}@page{size:A4 landscape;margin:8mm}.no-print{display:none}}
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <div class="title">Timetable Report</div>
      <div class="subtitle">Full Timetable — All Groups &amp; Subjects</div>
    </div>
    <div class="header-right">
      <div class="date">${dateStr}</div>
      <div>${timeStr}</div>
    </div>
  </div>
  <div class="meta-row">
    <div class="stat-box"><div class="num">${ttCount}</div><div class="lbl">Timetables</div></div>
    <div class="stat-box"><div class="num">${grpCount}</div><div class="lbl">Groups</div></div>
    <div class="stat-box"><div class="num">${subCount}</div><div class="lbl">Entries</div></div>
    <div class="stat-box"><div class="num">${cols.length}</div><div class="lbl">Columns</div></div>
  </div>
  <div class="filters-row">
    <span class="filters-label">&#9660; Filter</span>
    ${filterLabel}
  </div>
  <div class="cols-row">
    <span class="cols-label">&#9656; Columns</span>
    ${colsLabel}
  </div>
  <div class="tbl-wrap">
    <table>
      <thead><tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
      <tbody>${tbodyHTML}</tbody>
    </table>
  </div>
  <div class="footer">
    <span>Timetable Report &nbsp;|&nbsp; Exported on ${dateStr} at ${timeStr}</span>
    <span>${ttCount} timetable${ttCount !== 1 ? 's' : ''} &nbsp;|&nbsp; ${subCount} entries &nbsp;|&nbsp; ${cols.length} columns</span>
  </div>
  <div class="powered">Powered by <strong style="color:#2563eb">Learnomist</strong></div>
  ${actionBar}
</body>
</html>`);
    w.document.close();
    if (mode === 'pdf') setTimeout(() => w.print(), 600);
  }

  function _exportCSV(timetables) {
    if (!timetables.length) { alert('No data to export.'); return; }
    _openColPicker(timetables, 'csv');
  }

  function _exportPDF(timetables) {
    if (!timetables.length) { alert('No data to export.'); return; }
    _openColPicker(timetables, 'pdf');
  }


  // ── Public API ────────────────────────────────────────────
  return {
    mount(el) {
      if (!el) return;
      _rootEl      = el;
      _searchQuery = '';
      _load();       // ← load persisted timetables from AppState
      _render();
    }
  };

})();