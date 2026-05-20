// ============================================================
// modules/timetable/Planning_new.js
// Batch Planning Tab — Full Wizard
//
// Flow:
//   Step 1 → Select Campus → Discipline → Subjects (multi)
//   Step 2 → Set class duration per subject
//   Step 3 → Generate Plan (teacher match + free slot + room)
//           → Save Plan to AppState
//
// Engine logic:
//   - Finds teachers at selected campus who teach each subject
//   - Prefers consecutive hours for grouped subjects
//   - Falls back to minimum-gap scheduling
//   - Checks existing timetables for teacher & room availability
// ============================================================

import { AppState } from '../../utils/state.js';

export const BatchPlanningTab = (() => {

  // ── Inject styles once ──────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('bp-styles')) return;
    const s = document.createElement('style');
    s.id = 'bp-styles';
    s.textContent = `
      #bpPlanList { padding: 24px; }

      .bp-toolbar {
        display: flex; align-items: center;
        justify-content: space-between; margin-bottom: 20px;
      }

      .bp-plans-grid { display: flex; flex-direction: column; gap: 10px; }

      .bp-plan-card {
        background: var(--surface2); border: 1px solid var(--border);
        border-radius: 10px; padding: 14px 16px;
        display: flex; align-items: center; gap: 14px;
        cursor: pointer; transition: border-color .15s, box-shadow .15s;
      }
      .bp-plan-card:hover {
        border-color: var(--blue);
        box-shadow: 0 2px 8px rgba(0,0,0,.07);
      }
      .bp-plan-icon {
        width: 36px; height: 36px; border-radius: 8px;
        background: var(--blue-dim); display: flex;
        align-items: center; justify-content: center;
        color: var(--blue); flex-shrink: 0;
      }
      .bp-plan-info { flex: 1; min-width: 0; }
      .bp-plan-name { font-size: 13.5px; font-weight: 600; color: var(--t1); }
      .bp-plan-meta { font-size: 11.5px; color: var(--t3); margin-top: 2px; }
      .bp-plan-actions { display: flex; gap: 6px; }

      .bp-icon-btn {
        width: 28px; height: 28px; border-radius: 6px;
        border: 1px solid var(--border); background: var(--surface);
        color: var(--t2); display: flex; align-items: center;
        justify-content: center; cursor: pointer; transition: all .15s;
      }
      .bp-icon-btn:hover { border-color: var(--blue); color: var(--blue); }
      .bp-icon-btn.danger:hover { border-color: #ef4444; color: #ef4444; }

      .bp-empty { text-align: center; padding: 60px 20px; color: var(--t3); }
      .bp-empty svg { opacity: .3; margin-bottom: 12px; }
      .bp-empty h3 { font-size: 14px; font-weight: 600; color: var(--t2); }
      .bp-empty p { font-size: 12.5px; margin-top: 4px; }

      /* ── Modal ── */
      .bp-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,.5);
        z-index: 1000; display: flex; align-items: center;
        justify-content: center; padding: 16px;
        animation: bpFadeIn .15s ease;
      }
      @keyframes bpFadeIn { from { opacity:0 } to { opacity:1 } }

      .bp-modal {
        background: var(--surface); border: 1px solid var(--border);
        border-radius: 14px; width: 100%; max-width: 900px;
        /* Key: fits viewport — never overflows screen */
        height: min(92vh, 780px);
        display: flex; flex-direction: column;
        box-shadow: 0 24px 64px rgba(0,0,0,.3); overflow: hidden;
        animation: bpSlideUp .18s ease;
      }
      @keyframes bpSlideUp {
        from { transform: translateY(12px); opacity: 0 }
        to   { transform: translateY(0);    opacity: 1 }
      }

      .bp-modal-head {
        padding: 16px 20px 14px; border-bottom: 1px solid var(--border);
        display: flex; align-items: center;
        justify-content: space-between; flex-shrink: 0;
      }
      .bp-modal-title { font-size: 15px; font-weight: 700; color: var(--t1); }

      .bp-modal-body {
        padding: 20px; overflow-y: auto; flex: 1;
        display: flex; flex-direction: column; gap: 14px;
        /* Smooth scrolling inside modal */
        scroll-behavior: smooth;
      }

      .bp-modal-foot {
        padding: 13px 20px; border-top: 1px solid var(--border);
        flex-shrink: 0; display: flex;
        justify-content: flex-end; gap: 8px; align-items: center;
      }

      .bp-close-btn {
        background: none; border: none; cursor: pointer; color: var(--t3);
        padding: 4px; border-radius: 6px;
        display: flex; align-items: center; justify-content: center;
      }
      .bp-close-btn:hover { color: var(--t1); background: var(--surface2); }

      /* ── Steps bar ── */
      .bp-steps-bar {
        display: flex; gap: 0; border-bottom: 1px solid var(--border);
        margin: -20px -20px 0; padding: 0 20px; flex-shrink: 0;
      }
      .bp-step-tab {
        padding: 11px 16px; font-size: 12px; font-weight: 500;
        color: var(--t3); border-bottom: 2px solid transparent;
        margin-bottom: -1px; white-space: nowrap;
        transition: color .15s, border-color .15s;
      }
      .bp-step-tab.done  { color: var(--t2); }
      .bp-step-tab.done::before { content: '✓ '; }
      .bp-step-tab.current {
        color: var(--blue); border-bottom-color: var(--blue);
        font-weight: 600;
      }

      /* ── Step content ── */
      .bp-step { display: none; flex-direction: column; gap: 14px; }
      .bp-step.active { display: flex; }

      /* ── Form controls ── */
      .bp-form-group { display: flex; flex-direction: column; gap: 5px; }
      .bp-label {
        font-size: 11px; font-weight: 700; color: var(--t2);
        text-transform: uppercase; letter-spacing: .06em;
      }
      .bp-select, .bp-input {
        width: 100%; padding: 9px 12px;
        border: 1px solid var(--border); border-radius: 8px;
        background: var(--surface2); color: var(--t1);
        font-size: 13px; font-family: inherit;
        transition: border-color .15s; outline: none;
        box-sizing: border-box;
      }
      .bp-select:focus, .bp-input:focus { border-color: var(--blue); }
      .bp-select:disabled { opacity: .45; cursor: not-allowed; }
      .bp-hint { font-size: 11.5px; color: var(--t3); }

      /* ── Subject chips ── */
      .bp-subj-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
      .bp-subj-chip {
        padding: 5px 12px; border-radius: 20px;
        border: 1.5px solid var(--border); font-size: 12px;
        font-weight: 500; cursor: pointer; color: var(--t2);
        background: var(--surface2); transition: all .15s;
        user-select: none;
      }
      .bp-subj-chip:hover { border-color: var(--blue); color: var(--blue); }
      .bp-subj-chip.selected {
        border-color: var(--blue); background: var(--blue-dim);
        color: var(--blue); font-weight: 600;
      }
      .bp-subj-count {
        font-size: 11px; color: var(--blue); margin-top: 4px; font-weight: 500;
      }

      /* ── Duration rows ── */
      .bp-dur-row {
        display: flex; align-items: center; gap: 10px;
        padding: 10px 12px; background: var(--surface2);
        border-radius: 8px; border: 1px solid var(--border);
      }
      .bp-dur-code { font-size: 12.5px; font-weight: 700; color: var(--blue); min-width: 44px; }
      .bp-dur-name { font-size: 12px; color: var(--t2); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .bp-dur-label { font-size: 11.5px; color: var(--t3); white-space: nowrap; }
      .bp-dur-input {
        width: 72px; padding: 7px 10px;
        border: 1px solid var(--border); border-radius: 6px;
        background: var(--surface); color: var(--t1);
        font-size: 13px; font-family: inherit;
        outline: none; text-align: center;
      }
      .bp-dur-input:focus { border-color: var(--blue); }

      /* ── Subject day selector ── */
      .bp-dur-row {
        flex-wrap: wrap;
      }
      .bp-day-row {
        display: flex; align-items: center; gap: 6px;
        width: 100%; margin-top: 6px; padding-top: 8px;
        border-top: 1px dashed var(--border);
        flex-wrap: wrap;
      }
      .bp-day-label-hd {
        font-size: 11px; color: var(--t3); white-space: nowrap;
        min-width: 90px; font-weight: 500;
      }
      .bp-day-chips { display: flex; gap: 4px; flex-wrap: wrap; }
      .bp-day-chip {
        display: inline-flex; align-items: center; justify-content: center;
        width: 34px; height: 26px; border-radius: 5px;
        border: 1.5px solid var(--border); font-size: 11px; font-weight: 600;
        cursor: pointer; user-select: none; color: var(--t3);
        background: var(--surface); transition: all .12s;
      }
      .bp-day-chip:hover { border-color: var(--blue); color: var(--blue); }
      .bp-day-chip.on {
        border-color: var(--blue); background: var(--blue-dim);
        color: var(--blue);
      }
      .bp-day-any {
        font-size: 10.5px; color: var(--t3); font-style: italic;
        margin-left: 4px;
      }

      /* ── Result table ── */
      .bp-result-wrap {
        overflow-x: auto; border: 1px solid var(--border);
        border-radius: 10px; flex: 1;
      }
      .bp-result-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
      .bp-result-table th {
        padding: 9px 12px; background: var(--surface3);
        color: var(--t3); font-size: 10.5px; font-weight: 600;
        text-transform: uppercase; letter-spacing: .05em;
        text-align: left; border-bottom: 1px solid var(--border);
        white-space: nowrap;
      }
      .bp-result-table td {
        padding: 9px 12px; border-bottom: 1px solid var(--border);
        color: var(--t1); vertical-align: middle;
      }
      .bp-result-table tr:last-child td { border-bottom: none; }
      .bp-result-table tr:hover td { background: var(--surface2); }

      .bp-warn { color: #f59e0b; font-size: 11.5px; }
      .bp-ok   { color: #10b981; font-size: 11.5px; }
      .bp-err  { color: #ef4444; font-size: 11.5px; }

      /* ── Alerts ── */
      .bp-alert {
        padding: 10px 14px; border-radius: 8px;
        font-size: 12.5px; line-height: 1.5;
      }
      .bp-alert-warn  { background: #fef3c7; border: 1px solid #f59e0b; color: #92400e; }
      .bp-alert-info  { background: var(--blue-dim); border: 1px solid rgba(79,133,247,.25); color: var(--blue); }
      .bp-alert-error { background: #fee2e2; border: 1px solid #ef4444; color: #7f1d1d; }

      /* ── Buttons ── */
      .bp-btn {
        padding: 9px 18px; border-radius: 8px; font-size: 13px;
        font-weight: 600; cursor: pointer; border: 1px solid transparent;
        transition: all .15s; font-family: inherit;
        display: inline-flex; align-items: center; gap: 6px;
      }
      .bp-btn-primary { background: var(--blue); color: #fff; border-color: var(--blue); }
      .bp-btn-primary:hover { opacity: .88; }
      .bp-btn-secondary {
        background: var(--surface2); color: var(--t1); border-color: var(--border);
      }
      .bp-btn-secondary:hover { border-color: var(--blue); color: var(--blue); }
      .bp-btn-success { background: #10b981; color: #fff; border-color: #10b981; }
      .bp-btn-success:hover { opacity: .88; }
      .bp-btn-danger  { background: #ef4444; color: #fff; border-color: #ef4444; }
      .bp-btn-danger:hover { opacity: .88; }
      .bp-btn:disabled { opacity: .4; cursor: not-allowed; }

      /* ── Generating spinner ── */
      .bp-spinner {
        display: inline-block; width: 14px; height: 14px;
        border: 2px solid rgba(255,255,255,.35);
        border-top-color: #fff; border-radius: 50%;
        animation: bpSpin .6s linear infinite;
      }
      @keyframes bpSpin { to { transform: rotate(360deg) } }

      /* ── Plan result header ── */
      .bp-result-header {
        display: flex; align-items: center; gap: 10px;
        padding: 10px 14px; background: var(--blue-dim);
        border: 1px solid rgba(79,133,247,.2); border-radius: 8px;
        font-size: 12.5px; color: var(--blue); font-weight: 500;
      }

      /* ── Teacher badge in result ── */
      .bp-teacher-badge {
        display: inline-flex; align-items: center; gap: 4px;
        font-size: 12px; color: var(--t1);
      }
      .bp-teacher-badge small { font-size: 10.5px; color: var(--t3); display: block; }

      /* ── No-data chip ── */
      .bp-none { font-size: 12px; color: var(--t3); font-style: italic; }

      /* ── Saved plan badge ── */
      .bp-saved-badge {
        font-size: 10px; font-weight: 600; padding: 2px 6px;
        border-radius: 4px; background: #d1fae5; color: #065f46;
        border: 1px solid #6ee7b7;
      }
    `;
    document.head.appendChild(s);
  }

  // ── Plans stored in AppState ─────────────────────────────────
  const PLANS_KEY = 'batchPlans';
  const _getPlans = () => AppState.get(PLANS_KEY) || [];
  const _setPlans = (arr) => AppState.set(PLANS_KEY, arr);

  // ── Helpers ──────────────────────────────────────────────────
  const _timeToMins = t => {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const _minsToTime = m =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  const _fmtTime = t => {
    if (!t) return '—';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  const _isSlotFree = (busyMap, id, day, startM, endM) => {
    if (!busyMap[id]) return true;
    return !busyMap[id].some(s =>
      s.day === day &&
      _timeToMins(s.start) < endM &&
      _timeToMins(s.end) > startM
    );
  };

  // ── Seeded shuffle (Fisher-Yates) — deterministic per seed ───
  const _seededShuffle = (arr, seed) => {
    const a = [...arr];
    let s = seed || 0;
    const _rng = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(_rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // ── Plan Generation Engine ───────────────────────────────────
  //
  // KEY RULES:
  //   1. Teacher must work on that day at the campus (campusSchedules)
  //   2. Slot must be within teacher's working hours for that campus
  //   3. Teacher must be FREE — checked against:
  //        (a) saved timetables (groups → subjects structure), date-range filtered
  //        (b) saved batch plans (manualRows + auto result), date-range filtered
  //        (c) slots already assigned in THIS generation run (intra-plan)
  //   4. No two subjects in this plan share the SAME day+time slot
  //      (students cannot be in two classes simultaneously)
  //   5. Room must be free at that day+time (same three layers)
  //   6. Room must be available (not marked unavailable) during planDate–planEndDate
  //
  // EQUAL CHANCE FOR TEACHERS:
  //   Each call builds a full candidate list: every teacher × every day × every
  //   valid start-time × every free room.  The list is scored and the best is
  //   picked.  regenSeed rotates the shuffle order so re-generate gives new combos.
  //   Teachers are never pre-filtered; every eligible teacher gets equal consideration.
  //
  // SPREAD ACROSS DAYS (no day-pile-up):
  //   dayUsageCount tracks how many subjects are already on each day.
  //   Candidates on a less-used day score lower (better) so subjects naturally
  //   spread across the week even without explicit day preferences.
  //
  const _generatePlan = (campusId, disciplineId, subjIds, durations, subjDays = {}, regenSeed = 0, planDate = '', planEndDate = '') => {

    const allTeachers = AppState.get('teachers')   || [];
    const allSubjects = AppState.get('subjects')   || [];
    const allRooms    = AppState.get('rooms')       || [];
    const timetables  = AppState.get('timetables') || [];
    const batchPlans  = AppState.get('batchPlans') || [];
    const allBatches  = AppState.get('batches')    || [];

    const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const DAY_NORM = {
      monday:'mon', tuesday:'tue', wednesday:'wed', thursday:'thu',
      friday:'fri', saturday:'sat', sunday:'sun',
      mon:'mon', tue:'tue', wed:'wed', thu:'thu', fri:'fri', sat:'sat', sun:'sun',
    };
    const _normDay = d => DAY_NORM[(d || '').toLowerCase()] || d;
    const DAY_LABELS = {
      mon:'Monday', tue:'Tuesday', wed:'Wednesday',
      thu:'Thursday', fri:'Friday', sat:'Saturday', sun:'Sunday',
    };

    // ── Date-range overlap: does [aS,aE] overlap [bS,bE]? ──────────────────
    // Missing dates default to "open-ended" (worst-case busy assumption).
    const _datesOverlap = (aS, aE, bS, bE) => {
      const as = aS || '0000-01-01', ae = aE || '9999-12-31';
      const bs = bS || '0000-01-01', be = bE || '9999-12-31';
      return as <= be && ae >= bs;
    };

    // ── Does an existing timetable batch overlap our new plan? ─────────────
    // Returns true  → batch already ENDED before our plan starts → slot is FREE
    // Returns false → overlap exists → slot is BUSY
    const _batchExpiredBeforePlan = (batchId, graceDays = 0) => {
      if (!planDate) return false; // no planDate set → conservative: treat as busy
      const batch = allBatches.find(b => b.id === batchId);
      if (!batch) return false;
      let effectiveEnd = batch.endDate || '';
      if (!effectiveEnd) return false; // endless batch → always busy
      if (graceDays > 0) {
        const ms = new Date(effectiveEnd + 'T00:00:00').getTime() + graceDays * 86400000;
        effectiveEnd = new Date(ms).toISOString().slice(0, 10);
      }
      // Slot is free only if the batch's effective end is BEFORE our plan start
      return effectiveEnd < planDate;
    };

    // ── Busy maps (teacher / room) populated from external data ────────────
    // teacherBusy[id] = [{day, start, end}, …]   — teacher blocked globally
    // roomBusy[id]    = [{day, start, end}, …]   — room blocked same-campus only
    const teacherBusy = {};
    const roomBusy    = {};

    const _markBusy = (tId, rId, days, start, end) => {
      if (tId) {
        if (!teacherBusy[tId]) teacherBusy[tId] = [];
        days.forEach(d => teacherBusy[tId].push({ day: d, start, end }));
      }
      if (rId) {
        if (!roomBusy[rId]) roomBusy[rId] = [];
        days.forEach(d => roomBusy[rId].push({ day: d, start, end }));
      }
    };

    // ── Populate busy maps from saved timetables ───────────────────────────
    // Structure: timetable → groups[] → subjects[]
    for (const tt of timetables) {
      for (const grp of (tt.groups || [])) {
        for (const sub of (grp.subjects || [])) {
          if (!sub.startTime || !sub.endTime) continue;

          // Skip if this batch has fully ended before our plan starts
          if (_batchExpiredBeforePlan(sub.batchId, sub.graceDays || 0)) continue;

          // Also skip if the existing batch's date range doesn't overlap our plan at all
          const existBatch = allBatches.find(b => b.id === sub.batchId);
          if (planDate && existBatch?.endDate) {
            if (!_datesOverlap(planDate, planEndDate || '9999-12-31', existBatch.startDate, existBatch.endDate)) continue;
          }

          // Teacher blocked globally; room blocked same-campus only
          const rId   = (tt.campusId === campusId) ? sub.roomId : null;
          // IMPORTANT: only mark busy on days we KNOW the class runs.
          // If no day info → skip (don't block all 6 days by default).
          const rawDays = sub.days?.length ? sub.days : (sub.day ? [sub.day] : null);
          if (!rawDays) continue; // no day info — can't determine conflict, skip safely
          const days = rawDays.map(_normDay);
          _markBusy(sub.teacherId, rId, days, sub.startTime, sub.endTime);
        }
      }
    }

    // ── Populate busy maps from saved batch plans ──────────────────────────
    const newS = planDate       || '0000-01-01';
    const newE = planEndDate    || '9999-12-31';

    for (const plan of batchPlans) {
      const planS = plan.planDate    || plan.startDate || '0000-01-01';
      const planE = plan.planEndDate || plan.endDate   || '9999-12-31';
      if (!_datesOverlap(newS, newE, planS, planE)) continue; // no date overlap → skip

      // Auto-generated result rows
      for (const r of (plan.result || [])) {
        if (!r.start || !r.end || r.warn) continue;
        const tId  = r.teacher?.id;
        const rId  = plan.campusId === campusId ? r.room?.id : null;
        const days = r.day ? [_normDay(r.day)] : [];
        if (days.length) _markBusy(tId, rId, days, r.start, r.end);
      }

      // Manual plan rows
      for (const r of (plan.manualRows || [])) {
        if (!r.startTime || !r.endTime) continue;
        // Per-row date range check
        const rowS = r.startDate || plan.startDate || '0000-01-01';
        const rowE = r.endDate   || plan.endDate   || '9999-12-31';
        if (!_datesOverlap(newS, newE, rowS, rowE)) continue;
        const tId  = r.teacherId;
        const rId  = plan.campusId === campusId ? r.roomId : null;
        const days = (r.days?.length ? r.days : r.day ? [r.day] : []).map(_normDay);
        if (days.length) _markBusy(tId, rId, days, r.startTime, r.endTime);
      }
    }

    // ── Campus room pool ───────────────────────────────────────────────────
    // A room is in the pool if it belongs to this campus AND is available
    // during our plan date range (availability.endDate check uses planDate).
    const campusRooms = allRooms.filter(r => {
      if (r.campus !== campusId && r.campusId !== campusId) return false;
      const av = r.availability;
      if (!av) return true;
      // If unavailability has ended before our plan starts → room is available again
      if (av.endDate && planDate && av.endDate < planDate) return true;
      return (av.status || 'available') === 'available';
    });

    // ── Teacher finder ─────────────────────────────────────────────────────
    // Returns all active teachers at this campus who teach the given subject.
    // ── Teacher finder — tolerant of multiple data shapes ────────────────
    // Checks all common field names so teachers are never silently skipped.
    const _teacherAtCampus = t => {
      const id = campusId;
      return (
        (t.campuses            || []).includes(id) ||
        (t.campusIds           || []).includes(id) ||
        (t.assignedCampuses    || []).includes(id) ||
        t.campusId === id ||
        // campusSchedules key presence also implies assignment
        (t.campusSchedules && Object.prototype.hasOwnProperty.call(t.campusSchedules, id))
      );
    };

    const _teachesSubject = (t, subjId) =>
      (t.teachingSubjects || t.subjects || t.subjectIds || []).includes(subjId);

    const _findTeachers = subjId =>
      allTeachers.filter(t =>
        t.isActive !== false &&
        _teacherAtCampus(t) &&
        _teachesSubject(t, subjId)
      );

    // ── Campus schedule for a teacher ─────────────────────────────────────
    // Falls back gracefully: tries campusSchedules[campusId], then global
    // schedule fields, then safe defaults so scan always covers full day.
    const _getCampSched = teacher => {
      const s = teacher.campusSchedules?.[campusId];
      // Global-level fallbacks (some data models store these at teacher root)
      const globalStart = teacher.startTime || teacher.workStartTime || null;
      const globalEnd   = teacher.endTime   || teacher.workEndTime   || null;
      const globalDays  = teacher.workingDays || teacher.days || null;
      return {
        workingDays: ((s?.workingDays || globalDays) || ['mon','tue','wed','thu','fri','sat']).map(_normDay),
        startTime:   s?.startTime || globalStart || '08:00',
        endTime:     s?.endTime   || globalEnd   || '20:00',
      };
    };

    // ── Intra-plan busy tracker ────────────────────────────────────────────
    // Tracks what THIS generation run has already assigned.
    // Separate from teacherBusy/roomBusy (those are external data).
    // Rule: same teacher cannot teach two subjects at the same day+time.
    //       same room cannot host two subjects at the same day+time.
    //       ALSO: students can only be in ONE class at a time — so no two
    //       subjects in this plan can share the same day+time regardless of teacher/room.
    const intraPlan = []; // { teacherId, roomId, day, startM, endM }

    const _intraPlanTeacherFree = (tid, day, sM, eM) =>
      !intraPlan.some(b => b.teacherId === tid && b.day === day && b.startM < eM && b.endM > sM);

    const _intraPlanRoomFree = (rid, day, sM, eM) =>
      !intraPlan.some(b => b.roomId === rid && b.day === day && b.startM < eM && b.endM > sM);

    // CRITICAL: no two subjects at the SAME DAY+TIME in this plan
    const _intraPlanSlotFree = (day, sM, eM) =>
      !intraPlan.some(b => b.day === day && b.startM < eM && b.endM > sM);

    const _markIntraPlan = (tid, rid, day, sM, eM) =>
      intraPlan.push({ teacherId: tid, roomId: rid, day, startM: sM, endM: eM });

    // ── Day spread tracker ─────────────────────────────────────────────────
    // Lower dayUsageCount → preferred day for next subject (promotes spread)
    const dayUsageCount = {};

    // ── Results ────────────────────────────────────────────────────────────
    const results       = [];
    const subjBatchCount = {};

    // ── Used-times tracker for time variation ────────────────────────────
    // Tracks start times already committed in this plan run.
    // Used to score candidates: unused times are strongly preferred so each
    // subject lands at a different time, not all piled at 08:00.
    const usedStartTimes = new Set();

    // ── Main scheduling loop ───────────────────────────────────────────────
    //
    // LOGIC (matches uploaded reference file structure but adds subjDays support):
    //
    //   Each subject gets ONE fixed time slot (one startTime).
    //   If the user selected days → that same time repeats on all selected days.
    //   If no days selected → auto mode: pick the best single day.
    //
    //   Slot search (like reference file):
    //     • Build tryStarts list: all 30-min steps in teacher's working hours.
    //     • Reorder so unused start times come FIRST (time variation).
    //     • For each teacher (shuffled) → for each day → for each startM:
    //         check teacher free + room free + no student conflict → take it.
    //     • outer: label + break outer on first valid slot found.
    //
    //   KEY: no artificial restriction that limits scan to 08–11.
    //        The full working-hours window is always scanned.
    //
    for (const subjId of subjIds) {
      const subj    = allSubjects.find(s => s.id === subjId);
      const durMins = Math.round((durations[subjId] || 1) * 60);

      // Seeded shuffle — regenSeed rotates teacher order on re-generate
      const _subjHash = subjId.split('').reduce(
        (h, c) => Math.imul(31, h) + c.charCodeAt(0) | 0, 0
      );
      let teachers = _seededShuffle(
        _findTeachers(subjId),
        Math.abs((regenSeed * 2654435761) ^ _subjHash)
      );

      if (!teachers.length) {
        results.push({
          subjId, subj, teacher: null, room: null,
          day: null, dayLabel: null, start: null, end: null,
          warn: `No teacher found at this campus who teaches ${subj?.subjectCode || subjId}`,
        });
        continue;
      }

      // Preferred days from Step-2 chips (empty = auto)
      const preferredDays = (subjDays[subjId] || []).map(_normDay).filter(d => DAYS.includes(d));

      // Day scan order: if days selected, only those days; else all days
      const dayOrder = preferredDays.length > 0 ? preferredDays : DAYS;

      let slotFound = null;

      outer:
      for (const teacher of teachers) {
        const sched  = _getCampSched(teacher);
        const normWorkingDays = sched.workingDays.map(_normDay);
        const tStart = _timeToMins(sched.startTime);
        const tEnd   = _timeToMins(sched.endTime);

        // Build full start-time list for this teacher's working hours
        const allStarts = [];
        for (let t = tStart; t + durMins <= tEnd; t += 30) allStarts.push(t);

        // Reorder: unused times first, used times after — promotes time variation
        const unusedStarts = allStarts.filter(t => !usedStartTimes.has(t));
        const usedStarts   = allStarts.filter(t =>  usedStartTimes.has(t));
        const tryStarts    = [...unusedStarts, ...usedStarts];

        for (const startM of tryStarts) {
          const endM = startM + durMins;

          // Days to check: preferred days filtered to teacher's working days
          const validDays = dayOrder.filter(d => normWorkingDays.includes(d));
          if (validDays.length === 0) continue;

          if (preferredDays.length > 0) {
            // ── FIXED-DAYS mode ──────────────────────────────────────────
            // Teacher & room must be free on ALL selected days at this time.
            // Student conflict must not exist on ANY of those days.

            const teacherFreeAll = validDays.every(day =>
              _isSlotFree(teacherBusy, teacher.id, day, startM, endM) &&
              _intraPlanTeacherFree(teacher.id, day, startM, endM)
            );
            if (!teacherFreeAll) continue;

            const noStudentConflict = validDays.every(day =>
              _intraPlanSlotFree(day, startM, endM)
            );
            if (!noStudentConflict) continue;

            // Find a room free on ALL target days
            const roomSeed = Math.abs(
              (regenSeed * 2654435761) ^ (startM * 31) ^
              (teacher.id.charCodeAt(0) || 0) ^ (_subjHash & 0xffff)
            );
            const freeRoom = _seededShuffle(campusRooms, roomSeed).find(r =>
              validDays.every(day =>
                _isSlotFree(roomBusy, r.id, day, startM, endM) &&
                _intraPlanRoomFree(r.id, day, startM, endM)
              )
            );
            if (!freeRoom) continue;

            // ✓ Found — commit for all selected days
            const startStr = _minsToTime(startM);
            const endStr   = _minsToTime(endM);

            for (const day of validDays) {
              if (!teacherBusy[teacher.id]) teacherBusy[teacher.id] = [];
              teacherBusy[teacher.id].push({ day, start: startStr, end: endStr });
              if (!roomBusy[freeRoom.id]) roomBusy[freeRoom.id] = [];
              roomBusy[freeRoom.id].push({ day, start: startStr, end: endStr });
              _markIntraPlan(teacher.id, freeRoom.id, day, startM, endM);
              dayUsageCount[day] = (dayUsageCount[day] || 0) + 1;
            }

            usedStartTimes.add(startM);
            slotFound = { teacher, room: freeRoom, days: validDays, startM, endM, startStr, endStr };
            break outer;

          } else {
            // ── AUTO mode ────────────────────────────────────────────────
            // Find any single day where teacher + room + students are all free.
            // Prefer days with fewer subjects already assigned (spread).

            // Sort days by usage count ascending so least-used day tried first
            const sortedDays = [...validDays].sort(
              (a, b) => (dayUsageCount[a] || 0) - (dayUsageCount[b] || 0)
            );

            for (const day of sortedDays) {
              if (!_isSlotFree(teacherBusy, teacher.id, day, startM, endM)) continue;
              if (!_intraPlanTeacherFree(teacher.id, day, startM, endM)) continue;
              if (!_intraPlanSlotFree(day, startM, endM)) continue;

              const roomSeed = Math.abs(
                (regenSeed * 2654435761) ^ (startM * 31) ^
                (teacher.id.charCodeAt(0) || 0) ^ (_subjHash & 0xffff)
              );
              const freeRoom = _seededShuffle(campusRooms, roomSeed).find(r =>
                _isSlotFree(roomBusy, r.id, day, startM, endM) &&
                _intraPlanRoomFree(r.id, day, startM, endM)
              );
              if (!freeRoom) continue;

              // ✓ Found
              const startStr = _minsToTime(startM);
              const endStr   = _minsToTime(endM);

              if (!teacherBusy[teacher.id]) teacherBusy[teacher.id] = [];
              teacherBusy[teacher.id].push({ day, start: startStr, end: endStr });
              if (!roomBusy[freeRoom.id]) roomBusy[freeRoom.id] = [];
              roomBusy[freeRoom.id].push({ day, start: startStr, end: endStr });
              _markIntraPlan(teacher.id, freeRoom.id, day, startM, endM);
              dayUsageCount[day] = (dayUsageCount[day] || 0) + 1;

              usedStartTimes.add(startM);
              slotFound = { teacher, room: freeRoom, days: [day], startM, endM, startStr, endStr };
              break outer;
            }
          }
        }
      }

      if (!slotFound) {
        const dayNote = preferredDays.length ? ` on days: ${preferredDays.join(', ')}` : '';
        // ── Debug: collect why each teacher+time failed ──────────────────
        const debugReasons = [];
        for (const teacher of teachers.slice(0, 3)) {
          const sched = _getCampSched(teacher);
          const normWD = sched.workingDays.map(_normDay);
          const tS = _timeToMins(sched.startTime);
          const tE = _timeToMins(sched.endTime);
          debugReasons.push(
            `${teacher.fullName || teacher.id}: schedule=${sched.startTime}–${sched.endTime} days=[${normWD.join(',')}] ` +
            `scans ${Math.floor((tE - tS - durMins) / 30) + 1} slots`
          );
          // Sample first 4 start times and show why they fail
          for (let t = tS; t + durMins <= tE && debugReasons.length < 20; t += 30) {
            const eM = t + durMins;
            const dayOrder2 = preferredDays.length > 0 ? preferredDays : DAYS;
            const validD = dayOrder2.filter(d => normWD.includes(d));
            for (const day of validD.slice(0,2)) {
              const tFree = _isSlotFree(teacherBusy, teacher.id, day, t, eM);
              const tPFree = _intraPlanTeacherFree(teacher.id, day, t, eM);
              const sFree = _intraPlanSlotFree(day, t, eM);
              const roomOk = campusRooms.some(r => _isSlotFree(roomBusy, r.id, day, t, eM) && _intraPlanRoomFree(r.id, day, t, eM));
              if (!tFree || !tPFree || !sFree || !roomOk) {
                debugReasons.push(
                  `  ✗ ${_minsToTime(t)}–${_minsToTime(eM)} ${day}: ` +
                  `teacherExtBusy=${!tFree} teacherPlanBusy=${!tPFree} studentConflict=${!sFree} noRoom=${!roomOk}`
                );
              }
            }
          }
        }
        console.warn('[BatchPlanning] No slot for', subj?.subjectCode || subjId, '\n' + debugReasons.join('\n'));
        results.push({
          subjId, subj, teacher: null, room: null,
          day: null, dayLabel: null, start: null, end: null,
          warn: `No available slot found for ${subj?.subjectCode || subjId}${dayNote}`,
          _debug: debugReasons,
        });
      } else {
        subjBatchCount[subjId] = (subjBatchCount[subjId] || 0) + 1;
        const daysLabel = slotFound.days.map(d => DAY_LABELS[d] || d).join(', ');
        results.push({
          subjId, subj,
          teacher:     slotFound.teacher,
          room:        slotFound.room,
          day:         slotFound.days.join(','),
          dayLabel:    daysLabel,
          start:       slotFound.startStr,
          end:         slotFound.endStr,
          batchNumber: subjBatchCount[subjId],
          warn:        null,
        });
      }
    }

    return results;
  };

  // ── Render plan result table ─────────────────────────────────
  const _renderPlanResult = (results, regenSeed = 0, planDate = '', planEndDate = '') => {
    const scheduled = results.filter(r => !r.warn);
    const failed    = results.filter(r => r.warn);
    const comboLabel = regenSeed > 0
      ? `<span style="font-size:11px;opacity:.75;margin-left:8px">Combination #${regenSeed + 1}</span>`
      : '';

    const _fmtDate = d => {
      if (!d) return '';
      const dt = new Date(d + 'T00:00:00');
      return dt.toLocaleDateString('en-PK', { day:'numeric', month:'short', year:'numeric' });
    };

    const dateLabel = planDate
      ? `<span style="font-size:11px;background:rgba(16,185,129,.15);color:#065f46;padding:2px 8px;border-radius:20px;margin-left:8px;font-weight:600">
           📅 ${_fmtDate(planDate)}${planEndDate ? ` → ${_fmtDate(planEndDate)}` : ''}
         </span>`
      : '';

    const summaryHtml = `
      <div class="bp-result-header">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
        </svg>
        <span>
          <strong>${scheduled.length}</strong> scheduled
          ${failed.length ? ` · <span style="color:#f59e0b"><strong>${failed.length}</strong> could not be scheduled</span>` : ''}
          ${comboLabel}
          ${dateLabel}
        </span>
        ${regenSeed > 0
          ? `<span style="font-size:11px;color:var(--t3);margin-left:auto">
               ↺ Re-generate to try another combination
             </span>`
          : ''
        }
      </div>
    `;

    const warnHtml = failed.length ? `
      <div class="bp-alert bp-alert-warn">
        ⚠ ${failed.map(r => r.warn).join(' &nbsp;|&nbsp; ')}
      </div>
    ` : '';

    const tableHtml = `
      <div class="bp-result-wrap">
        <table class="bp-result-table">
          <thead>
            <tr>
              <th>Subject</th>
              <th>Batch #</th>
              <th>Teacher</th>
              <th>Day</th>
              <th>Time</th>
              <th>Room</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${results.map(r => `
              <tr>
                <td>
                  <strong>${r.subj?.subjectCode || r.subjId}</strong>
                  <div style="font-size:11px;color:var(--t3)">${r.subj?.subjectName || ''}</div>
                </td>
                <td>
                  <span style="font-size:12px;font-weight:700;color:var(--blue);background:var(--blue-dim);padding:2px 8px;border-radius:12px;white-space:nowrap">
                    B${r.batchNumber || 1}
                  </span>
                </td>
                <td>
                  ${r.teacher
                    ? `<div class="bp-teacher-badge">
                        <span>${r.teacher.fullName}</span>
                      </div>
                      <small style="font-size:11px;color:var(--t3)">${r.teacher.qualification || ''}</small>`
                    : `<span class="bp-none">No teacher</span>`
                  }
                </td>
                <td style="white-space:nowrap">${r.dayLabel || '<span class="bp-none">—</span>'}</td>
                <td style="white-space:nowrap">
                  ${r.start
                    ? `${_fmtTime(r.start)} – ${_fmtTime(r.end)}`
                    : '<span class="bp-none">—</span>'
                  }
                </td>
                <td>${r.room?.name || r.room?.roomName || '<span class="bp-none">—</span>'}</td>
                <td>
                  ${r.warn
                    ? `<span class="bp-warn">⚠ Unscheduled</span>`
                    : `<span class="bp-ok">✓ Scheduled</span>`
                  }
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    return summaryHtml + warnHtml + tableHtml;
  };

  // ── Modal Wizard ─────────────────────────────────────────────
  const _openModal = (existingPlan = null, onSave = null) => {
    let step       = 1;
    let selCampId  = existingPlan?.campusId      || '';
    let selDiscId  = existingPlan?.disciplineId  || '';
    let selSubjIds = existingPlan?.subjects ? [...existingPlan.subjects] : [];
    let durations  = existingPlan?.durations ? { ...existingPlan.durations } : {};
    let subjDays   = existingPlan?.subjDays   ? { ...existingPlan.subjDays   } : {}; // preferred days per subject
    let planResult = existingPlan?.result || null;
    let planDate   = existingPlan?.planDate || '';      // start date (kept for backward compat)
    let planEndDate= existingPlan?.planEndDate || '';   // NEW: expected end date
    let regenSeed  = 0; // ← incremented each Re-generate to try new teacher combos

    const overlay = document.createElement('div');
    overlay.className = 'bp-overlay';

    const _render = () => {
      const campuses    = AppState.get('campuses')    || [];
      const disciplines = AppState.get('disciplines') || [];
      const allSubjects = AppState.get('subjects')    || [];
      const allLevels   = AppState.get('levels')      || [];

      // Subjects for selected discipline at this campus
      const discLevelIds = allLevels
        .filter(l => l.disciplineId === selDiscId)
        .map(l => l.id);
      const discSubjs = allSubjects.filter(s => discLevelIds.includes(s.levelId));

      const stepLabels = [
        { n: 1, label: 'Select' },
        { n: 2, label: 'Duration' },
        { n: 3, label: 'Plan' },
      ];

      const stepsBar = stepLabels.map(({ n, label }) => {
        const cls = n < step ? 'done' : n === step ? 'current' : '';
        return `<div class="bp-step-tab ${cls}">${label}</div>`;
      }).join('');

      overlay.innerHTML = `
        <div class="bp-modal">
          <div class="bp-modal-head">
            <span class="bp-modal-title">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:-2px;margin-right:5px">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
              </svg>
              Batch Planning Wizard
            </span>
            <button class="bp-close-btn" id="bpCloseBtn" title="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div class="bp-modal-body">
            <!-- Step bar inside body -->
            <div class="bp-steps-bar">${stepsBar}</div>

            <!-- ── Step 1: Campus → Discipline → Subjects ── -->
            <div class="bp-step ${step === 1 ? 'active' : ''}" id="bpStep1">

              <!-- Campus -->
              <div class="bp-form-group">
                <label class="bp-label">Campus <span style="color:#ef4444">*</span></label>
                <select class="bp-select" id="bpCampSelect">
                  <option value="">— Select Campus —</option>
                  ${campuses.map(c => `
                    <option value="${c.id}" ${selCampId === c.id ? 'selected' : ''}>
                      ${c.campusName}
                    </option>
                  `).join('')}
                </select>
                <span class="bp-hint">Select the campus for this plan.</span>
              </div>

              <!-- Discipline (shown after campus selected) -->
              <div class="bp-form-group">
                <label class="bp-label">Discipline <span style="color:#ef4444">*</span></label>
                <select class="bp-select" id="bpDiscSelect" ${!selCampId ? 'disabled' : ''}>
                  <option value="">— Select Discipline —</option>
                  ${disciplines.map(d => `
                    <option value="${d.id}" ${selDiscId === d.id ? 'selected' : ''}>
                      ${d.abbreviation} — ${d.fullName}
                    </option>
                  `).join('')}
                </select>
                ${!selCampId
                  ? `<span class="bp-hint">Select a campus first.</span>`
                  : `<span class="bp-hint">Choose the discipline/program.</span>`
                }
              </div>

              <!-- Plan Start + End Date -->
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div class="bp-form-group">
                  <label class="bp-label">
                    Plan Start Date
                    <span style="font-size:10px;font-weight:400;color:var(--t3);margin-left:4px;text-transform:none">
                      — from when classes begin
                    </span>
                  </label>
                  <input type="date" class="bp-select" id="bpPlanDate"
                         value="${planDate}"
                         style="cursor:pointer"
                         min="${new Date().toISOString().slice(0,10)}"/>
                  <span class="bp-hint">
                    Batches ending before this date will free up their teacher &amp; room slots.
                  </span>
                </div>
                <div class="bp-form-group">
                  <label class="bp-label">
                    Expected End Date
                    <span style="font-size:10px;font-weight:400;color:var(--t3);margin-left:4px;text-transform:none">
                      — when this batch finishes
                    </span>
                  </label>
                  <input type="date" class="bp-select" id="bpPlanEndDate"
                         value="${planEndDate}"
                         style="cursor:pointer"
                         ${planDate ? `min="${planDate}"` : `min="${new Date().toISOString().slice(0,10)}"`}/>
                  <span class="bp-hint">
                    Checks teacher &amp; room availability for full batch duration.
                  </span>
                </div>
              </div>

              <!-- Subjects (shown after discipline selected) -->
              ${selDiscId ? (
                discSubjs.length ? `
                  <div class="bp-form-group">
                    <label class="bp-label">Subjects <span style="color:#ef4444">*</span></label>
                    <div class="bp-subj-chips">
                      ${discSubjs.map(s => `
                        <div class="bp-subj-chip ${selSubjIds.includes(s.id) ? 'selected' : ''}"
                             data-subj-id="${s.id}" title="${s.subjectName}">
                          ${s.subjectCode}
                          <span style="font-size:10.5px;font-weight:400;opacity:.7;margin-left:2px">${s.subjectName.length > 20 ? s.subjectName.slice(0, 20) + '…' : s.subjectName}</span>
                        </div>
                      `).join('')}
                    </div>
                    <div class="bp-subj-count">
                      ${selSubjIds.length
                        ? `${selSubjIds.length} subject${selSubjIds.length > 1 ? 's' : ''} selected`
                        : 'Click subjects to select them'
                      }
                    </div>
                  </div>
                ` : `
                  <div class="bp-alert bp-alert-warn">
                    ⚠ No subjects found for this discipline. Add subjects first.
                  </div>
                `
              ) : ''}
            </div>

            <!-- ── Step 2: Class Durations + Preferred Days ── -->
            <div class="bp-step ${step === 2 ? 'active' : ''}" id="bpStep2">
              <div class="bp-alert bp-alert-info">
                Set the class <strong>duration</strong> and <strong>class days</strong> for each subject.
                Selecting days means <strong>one class per selected day per week</strong> (e.g. Mon + Wed + Fri = 3 classes/week).
                Each class will get a <strong>different time</strong> automatically. If no days are selected, the engine picks the best available day.
              </div>
              ${(() => {
                const ALL_DAYS = [
                  { k: 'mon', l: 'Mon' }, { k: 'tue', l: 'Tue' },
                  { k: 'wed', l: 'Wed' }, { k: 'thu', l: 'Thu' },
                  { k: 'fri', l: 'Fri' }, { k: 'sat', l: 'Sat' },
                  { k: 'sun', l: 'Sun' },
                ];
                return selSubjIds.map(sid => {
                  const s = (AppState.get('subjects') || []).find(x => x.id === sid);
                  if (!s) return '';
                  const selDays = subjDays[sid] || [];
                  const dayChips = ALL_DAYS.map(d =>
                    '<span class="bp-day-chip' + (selDays.includes(d.k) ? ' on' : '') + '"' +
                    ' data-subjid="' + sid + '" data-day="' + d.k + '">' + d.l + '</span>'
                  ).join('');
                  const anyLabel = selDays.length === 0
                    ? '<span class="bp-day-any">auto (1 class, best day)</span>' : '';
                  return (
                    '<div class="bp-dur-row" id="durrow_' + sid + '">' +
                      '<div class="bp-dur-code">' + s.subjectCode + '</div>' +
                      '<div class="bp-dur-name" title="' + s.subjectName + '">' + s.subjectName + '</div>' +
                      '<span class="bp-dur-label">Duration:</span>' +
                      '<input type="number" class="bp-dur-input" id="dur_' + sid + '"' +
                        ' min="0.5" max="8" step="0.5"' +
                        ' value="' + (durations[sid] || 1) + '"/>' +
                      '<span class="bp-dur-label">hrs</span>' +
                      '<div class="bp-day-row">' +
                        '<span class="bp-day-label-hd">Class Days/Week:</span>' +
                        '<div class="bp-day-chips">' + dayChips + '</div>' +
                        anyLabel +
                      '</div>' +
                    '</div>'
                  );
                }).join('');
              })()}
            </div>

            <!-- ── Step 3: Generated Plan ── -->
            <div class="bp-step ${step === 3 ? 'active' : ''}" id="bpStep3">
              ${planResult
                ? _renderPlanResult(planResult, regenSeed, planDate, planEndDate)
                : `<div style="color:var(--t3);font-size:13px;text-align:center;padding:20px">
                     Click <strong>Generate Plan</strong> to find available slots for selected subjects.
                   </div>`
              }
            </div>
          </div>

          <!-- Footer -->
          <div class="bp-modal-foot">
            ${step > 1
              ? `<button class="bp-btn bp-btn-secondary" id="bpBackBtn">
                   ← Back
                 </button>`
              : ''
            }

            ${step === 1
              ? `<button class="bp-btn bp-btn-primary" id="bpNextBtn">
                   Next →
                 </button>`
              : ''
            }

            ${step === 2
              ? `<button class="bp-btn bp-btn-primary" id="bpPlanBtn">
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                     <circle cx="12" cy="12" r="10"/>
                     <line x1="12" y1="8" x2="12" y2="12"/>
                     <line x1="12" y1="16" x2="12.01" y2="16"/>
                   </svg>
                   Generate Plan
                 </button>`
              : ''
            }

            ${step === 3 && planResult
              ? `<button class="bp-btn bp-btn-primary" id="bpRegenBtn">
                   ↺ Re-generate
                 </button>
                 <button class="bp-btn bp-btn-success" id="bpSaveBtn">
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                     <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                     <polyline points="17 21 17 13 7 13 7 21"/>
                     <polyline points="7 3 7 8 15 8"/>
                   </svg>
                   Save Plan
                 </button>`
              : ''
            }
          </div>
        </div>
      `;

      // ── Wire events ──────────────────────────────────────────
      overlay.querySelector('#bpCloseBtn').onclick = () => overlay.remove();
      overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

      // Day chip toggles in Step 2 — delegated on the modal body
      overlay.querySelectorAll('.bp-day-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          // Save current duration inputs before re-render
          selSubjIds.forEach(sid => {
            const inp = overlay.querySelector('#dur_' + sid);
            if (inp) durations[sid] = parseFloat(inp.value) || 1;
          });

          const sid = chip.dataset.subjid;
          const day = chip.dataset.day;
          if (!sid || !day) return;

          if (!subjDays[sid]) subjDays[sid] = [];
          const idx = subjDays[sid].indexOf(day);
          if (idx > -1) subjDays[sid].splice(idx, 1);
          else           subjDays[sid].push(day);

          planResult = null; // invalidate result when days change
          _render();
        });
      });

      // Plan date change
      overlay.querySelector('#bpPlanDate')?.addEventListener('change', e => {
        planDate   = e.target.value;
        planResult = null;
        // Update end date min constraint
        const endInp = overlay.querySelector('#bpPlanEndDate');
        if (endInp) endInp.min = planDate;
        if (endInp && planEndDate && planEndDate < planDate) {
          planEndDate = '';
          endInp.value = '';
        }
      });

      // Plan end date change
      overlay.querySelector('#bpPlanEndDate')?.addEventListener('change', e => {
        planEndDate = e.target.value;
        planResult  = null;
      });

      // Campus change
      overlay.querySelector('#bpCampSelect')?.addEventListener('change', e => {
        selCampId  = e.target.value;
        selDiscId  = '';
        selSubjIds = [];
        planResult = null;
        _render();
      });

      // Discipline change
      overlay.querySelector('#bpDiscSelect')?.addEventListener('change', e => {
        selDiscId  = e.target.value;
        selSubjIds = [];
        planResult = null;
        _render();
      });

      // Subject chip toggle
      overlay.querySelectorAll('.bp-subj-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const id = chip.dataset.subjId;
          if (selSubjIds.includes(id)) {
            selSubjIds = selSubjIds.filter(x => x !== id);
          } else {
            selSubjIds.push(id);
          }
          _render();
        });
      });

      // Back
      overlay.querySelector('#bpBackBtn')?.addEventListener('click', () => {
        step--;
        _render();
      });

      // Next (Step 1 → 2)
      overlay.querySelector('#bpNextBtn')?.addEventListener('click', () => {
        if (!selCampId)      { alert('Please select a campus.');           return; }
        if (!selDiscId)      { alert('Please select a discipline.');       return; }
        if (!selSubjIds.length) { alert('Please select at least one subject.'); return; }
        step = 2;
        _render();
      });

      // Generate Plan (Step 2 → 3)
      overlay.querySelector('#bpPlanBtn')?.addEventListener('click', () => {
        // Save durations from inputs
        selSubjIds.forEach(sid => {
          const inp = overlay.querySelector('#dur_' + sid);
          durations[sid] = parseFloat(inp?.value) || 1;
          // subjDays already updated via chip clicks — no extra read needed
        });

        // Show loading state briefly
        const btn = overlay.querySelector('#bpPlanBtn');
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = `<span class="bp-spinner"></span> Generating…`;
        }

        setTimeout(() => {
          planResult = _generatePlan(selCampId, selDiscId, selSubjIds, durations, subjDays, regenSeed, planDate, planEndDate);
          step = 3;
          _render();
        }, 300);
      });

      // Re-generate — increment seed so teacher order rotates → new combination
      overlay.querySelector('#bpRegenBtn')?.addEventListener('click', () => {
        regenSeed++;
        planResult = _generatePlan(selCampId, selDiscId, selSubjIds, durations, subjDays, regenSeed, planDate, planEndDate);
        _render();
      });

      // Save Plan
      overlay.querySelector('#bpSaveBtn')?.addEventListener('click', () => {
        if (!planResult) return;

        const allSubjects  = AppState.get('subjects')    || [];
        const disciplines  = AppState.get('disciplines') || [];
        const campuses     = AppState.get('campuses')    || [];

        const disc = disciplines.find(d => d.id === selDiscId);
        const camp = campuses.find(c => c.id === selCampId);
        const subCodes = selSubjIds
          .map(id => allSubjects.find(s => s.id === id)?.subjectCode || id);

        const campShort = (camp?.campusName || '').replace(/\s*campus$/i, '').trim();

        const plan = {
          id:           existingPlan?.id || ('bp_' + Date.now()),
          name:         `${campShort} · ${disc?.abbreviation || ''} · ${subCodes.join(', ')}`,
          campusId:     selCampId,
          campusName:   camp?.campusName || '',
          disciplineId: selDiscId,
          discAbbr:     disc?.abbreviation || '',
          subjects:     selSubjIds,
          durations,
          subjDays,
          planDate,
          planEndDate,
          result:       planResult,
          createdAt:    existingPlan?.createdAt || Date.now(),
          updatedAt:    Date.now(),
        };

        const existing2 = _getPlans().filter(p => p.id !== plan.id);
        existing2.unshift(plan);
        _setPlans(existing2);

        overlay.remove();
        if (typeof onSave === 'function') onSave();
      });
    };

    _render();
    document.body.appendChild(overlay);
  };

  // ── Manual Plan Modal ────────────────────────────────────────
  // Flow: Campus → Discipline → pick subjects (chips) → each subject card
  //       gets: days (multi-chip), start time, end time, teacher, room
  // Validates: no teacher/room clash, no intra-plan clash
  const _openManualModal = (existingPlan = null, onSave = null) => {
    const isEdit = !!existingPlan;

    // Each subject row: { id, subjectId, subjectCode, subjectName,
    //   days:[], startTime, endTime, teacherId, roomId }
    let subjectRows = existingPlan?.manualRows
      ? existingPlan.manualRows.map(r => ({ ...r, days: Array.isArray(r.days) ? [...r.days] : (r.day ? [r.day] : []) }))
      : [];

    let planName    = existingPlan?.name         || '';
    let campusId    = existingPlan?.campusId     || '';
    let disciplineId= existingPlan?.disciplineId || '';
    let startDate   = existingPlan?.startDate    || '';
    let endDate     = existingPlan?.endDate      || '';

    const overlay = document.createElement('div');
    overlay.className = 'bp-overlay';

    const DAYS_LIST = [
      { val: 'mon', label: 'Mon' },
      { val: 'tue', label: 'Tue' },
      { val: 'wed', label: 'Wed' },
      { val: 'thu', label: 'Thu' },
      { val: 'fri', label: 'Fri' },
      { val: 'sat', label: 'Sat' },
    ];
    const DAY_FULL = { mon:'Monday', tue:'Tuesday', wed:'Wednesday', thu:'Thursday', fri:'Friday', sat:'Saturday' };

    // ── Conflict helpers ─────────────────────────────────────────
    const DAY_NORM_MAP = {
      monday:'mon', tuesday:'tue', wednesday:'wed', thursday:'thu',
      friday:'fri', saturday:'sat', sunday:'sun',
      mon:'mon', tue:'tue', wed:'wed', thu:'thu', fri:'fri', sat:'sat',
    };
    const normDay = d => DAY_NORM_MAP[(d||'').toLowerCase()] || d;

    // ── Date-range overlap check ──────────────────────────────────
    // Returns true if plan date range [pStart,pEnd] overlaps with timetable batch date range
    // If either range is missing, assume overlap (safe default = busy)
    const _dateRangesOverlap = (planStart, planEnd, batchStart, batchEnd) => {
      if (!planStart || !planEnd) return true;   // no plan date → always treat as conflict
      if (!batchStart && !batchEnd) return true; // batch has no dates → runs forever → conflict
      const ps = planStart, pe = planEnd;
      const bs = batchStart || '0000-00-00';
      const be = batchEnd   || '9999-12-31';
      // Overlap if plan starts before batch ends AND plan ends after batch starts
      return ps <= be && pe >= bs;
    };

    // ── Check if a timetable subject's batch is active during [planStart, planEnd] ──
    const _batchActiveInRange = (sub, planStart, planEnd) => {
      const allBatches = AppState.get('batches') || [];
      const batch = allBatches.find(b => b.id === sub.batchId);
      // No batch info → be conservative → treat as active
      if (!batch) return true;
      const batchStart = batch.startDate || '';
      const batchEnd   = batch.endDate   || '';
      return _dateRangesOverlap(planStart, planEnd, batchStart, batchEnd);
    };

    // ── Check if a saved batchPlan's row overlaps our date range ──
    const _planRowActiveInRange = (plan, row, planStart, planEnd) => {
      // Manual plans have their own startDate/endDate
      const rowStart = row.startDate || plan.startDate || '';
      const rowEnd   = row.endDate   || plan.endDate   || '';
      return _dateRangesOverlap(planStart, planEnd, rowStart, rowEnd);
    };

    // ── Teacher busy check ────────────────────────────────────────
    // excludeRowId: skip this specific intra-plan row (same plan self-check)
    // excludePlanId: skip this whole plan (edit mode)
    const _isTeacherBusy = (teacherId, days, startM, endM, excludePlanId = null, excludeRowId = null) => {
      if (!teacherId || !days?.length) return false;
      const timetables = AppState.get('timetables') || [];
      const batchPlans = AppState.get('batchPlans') || [];

      // ── Check main timetables (groups → subjects structure) ──
      for (const tt of timetables) {
        for (const grp of (tt.groups || [])) {
          for (const sub of (grp.subjects || [])) {
            if (sub.teacherId !== teacherId) continue;
            if (!sub.startTime || !sub.endTime) continue;
            // Normalize days — timetable saves full names ('Monday'), we use short ('mon')
            const subDays = (sub.days?.length ? sub.days : sub.day ? [sub.day] : []).map(normDay);
            if (!days.some(d => subDays.includes(d))) continue;
            const sM = _timeToMins(sub.startTime), eM = _timeToMins(sub.endTime);
            if (!(sM < endM && eM > startM)) continue;
            // Date-range check: is this timetable's batch active during our plan period?
            if (!_batchActiveInRange(sub, startDate, endDate)) continue;
            return true;
          }
        }
      }

      // ── Check saved batch plans ──
      for (const plan of batchPlans) {
        if (plan.id === excludePlanId) continue;
        for (const r of (plan.manualRows || plan.result || [])) {
          if ((r.teacherId || r.teacher?.id) !== teacherId) continue;
          if (!_planRowActiveInRange(plan, r, startDate, endDate)) continue;
          const rDays = (r.days?.length ? r.days : r.day ? [r.day] : []).map(normDay);
          if (!days.some(d => rDays.includes(d))) continue;
          const sM = _timeToMins(r.startTime || r.start);
          const eM = _timeToMins(r.endTime   || r.end);
          if (sM < endM && eM > startM) return true;
        }
      }

      // ── Check intra-plan rows (same plan being edited) ──
      for (const r of subjectRows) {
        if (r.id === excludeRowId) continue;  // skip self
        if ((r.teacherId) !== teacherId) continue;
        if (!r.startTime || !r.endTime || !r.days?.length) continue;
        const rDays = r.days.map(normDay);
        if (!days.some(d => rDays.includes(d))) continue;
        const sM = _timeToMins(r.startTime), eM = _timeToMins(r.endTime);
        if (sM < endM && eM > startM) return true;
      }

      return false;
    };

    // ── Room busy check ───────────────────────────────────────────
    const _isRoomBusy = (roomId, days, startM, endM, excludePlanId = null, excludeRowId = null) => {
      if (!roomId || !days?.length) return false;
      const timetables = AppState.get('timetables') || [];
      const batchPlans = AppState.get('batchPlans') || [];

      // ── Check main timetables (groups → subjects) ──
      for (const tt of timetables) {
        for (const grp of (tt.groups || [])) {
          for (const sub of (grp.subjects || [])) {
            if (sub.roomId !== roomId) continue;
            if (!sub.startTime || !sub.endTime) continue;
            const subDays = (sub.days?.length ? sub.days : sub.day ? [sub.day] : []).map(normDay);
            if (!days.some(d => subDays.includes(d))) continue;
            const sM = _timeToMins(sub.startTime), eM = _timeToMins(sub.endTime);
            if (!(sM < endM && eM > startM)) continue;
            if (!_batchActiveInRange(sub, startDate, endDate)) continue;
            return true;
          }
        }
      }

      // ── Check saved batch plans ──
      for (const plan of batchPlans) {
        if (plan.id === excludePlanId) continue;
        for (const r of (plan.manualRows || plan.result || [])) {
          const rRoom = r.roomId || r.room?.id;
          if (rRoom !== roomId) continue;
          if (!_planRowActiveInRange(plan, r, startDate, endDate)) continue;
          const rDays = (r.days?.length ? r.days : r.day ? [r.day] : []).map(normDay);
          if (!days.some(d => rDays.includes(d))) continue;
          const sM = _timeToMins(r.startTime || r.start);
          const eM = _timeToMins(r.endTime   || r.end);
          if (sM < endM && eM > startM) return true;
        }
      }

      // ── Check intra-plan rows ──
      for (const r of subjectRows) {
        if (r.id === excludeRowId) continue;
        if (r.roomId !== roomId) continue;
        if (!r.startTime || !r.endTime || !r.days?.length) continue;
        const rDays = r.days.map(normDay);
        if (!days.some(d => rDays.includes(d))) continue;
        const sM = _timeToMins(r.startTime), eM = _timeToMins(r.endTime);
        if (sM < endM && eM > startM) return true;
      }

      return false;
    };

    // ── Campus rooms: only truly available rooms (checks timetables + batchPlans) ──
    // Returns rooms with an extra `_busy` flag based on currently selected days/time of a row
    const _getCampusRooms = (cId, forRow = null) => {
      if (!cId) return [];
      const allRooms = AppState.get('rooms') || [];

      // Step 1: filter by campus + room.availability field
      const campusRooms = allRooms.filter(r => {
        if ((r.campus || r.campusId) !== cId) return false;
        const av = r.availability;
        if (!av) return true;
        // Check if room's unavailability period overlaps our plan date range
        if (av.status && av.status !== 'available') {
          const avStart = av.startDate || '';
          const avEnd   = av.endDate   || '';
          // If unavailability has ended before our plan starts → room is free
          if (avEnd && startDate && avEnd < startDate) return true;
          // If unavailability starts after our plan ends → room is free
          if (avStart && endDate && avStart > endDate) return true;
          return false; // unavailable during our plan period
        }
        return true;
      });

      // Step 2: if a specific row is provided, mark rooms busy at that row's time
      if (forRow && forRow.days?.length && forRow.startTime && forRow.endTime) {
        const startM = _timeToMins(forRow.startTime);
        const endM   = _timeToMins(forRow.endTime);
        return campusRooms.map(r => ({
          ...r,
          _busy: _isRoomBusy(r.id, forRow.days, startM, endM, existingPlan?.id, forRow.id),
        }));
      }

      return campusRooms.map(r => ({ ...r, _busy: false }));
    };

    const _getCampusTeachers = (cId, subjId) => {
      if (!cId) return [];
      return (AppState.get('teachers') || []).filter(t =>
        t.isActive !== false &&
        (!t.campuses?.length || t.campuses.includes(cId)) &&
        (!subjId || !t.teachingSubjects?.length || t.teachingSubjects.includes(subjId))
      );
    };

    // Get subjects for discipline
    const _getDiscSubjects = (discId) => {
      if (!discId) return [];
      const allLevels   = AppState.get('levels')   || [];
      const allSubjects = AppState.get('subjects') || [];
      const levelIds = allLevels.filter(l => l.disciplineId === discId).map(l => l.id);
      return allSubjects.filter(s => levelIds.includes(s.levelId));
    };

    // ── Main render ──────────────────────────────────────────────
    const _render = () => {
      const campuses    = AppState.get('campuses')    || [];
      const disciplines = AppState.get('disciplines') || [];
      const discSubjs   = _getDiscSubjects(disciplineId);

      const campusOptions = campuses.map(c =>
        `<option value="${c.id}" ${c.id === campusId ? 'selected' : ''}>${c.campusName}</option>`
      ).join('');

      const discOptions = disciplines.map(d =>
        `<option value="${d.id}" ${d.id === disciplineId ? 'selected' : ''}>${d.abbreviation} — ${d.fullName}</option>`
      ).join('');

      // Day chip for a row
      const _dayChips = (row) => DAYS_LIST.map(d => {
        const sel = (row.days || []).includes(d.val);
        return `<span class="mp-day-chip ${sel ? 'mp-day-sel' : ''}"
                      data-row-id="${row.id}" data-day="${d.val}"
                      title="${DAY_FULL[d.val]}">${d.label}</span>`;
      }).join('');

      // Teacher options filtered by subject — marks busy teachers
      const _teacherOpts = (row) => {
        const teachers = _getCampusTeachers(campusId, row.subjectId);
        if (!campusId) return `<option value="">Select campus first</option>`;
        if (!teachers.length) return `<option value="">No teachers available</option>`;
        const hasDays  = row.days?.length > 0;
        const hasTime  = row.startTime && row.endTime;
        return `<option value="">— Teacher —</option>` +
          teachers.map(t => {
            let busy = false;
            if (hasDays && hasTime) {
              const sM = _timeToMins(row.startTime), eM = _timeToMins(row.endTime);
              busy = _isTeacherBusy(t.id, row.days, sM, eM, existingPlan?.id, row.id);
            }
            const sel = row.teacherId === t.id;
            return `<option value="${t.id}" ${sel ? 'selected' : ''} ${busy && !sel ? 'disabled style="color:var(--t4,#999)"' : ''}>
              ${t.fullName}${t.qualification ? ' — ' + t.qualification : ''}${busy ? ' (Busy)' : ''}
            </option>`;
          }).join('');
      };

      // Room options — only available rooms shown, occupied ones shown disabled with reason
      const _roomOpts = (row) => {
        if (!campusId) return `<option value="">Select campus first</option>`;
        // Get rooms with busy flag for this row's time slot
        const rooms = _getCampusRooms(campusId, row);
        if (!rooms.length) return `<option value="">No rooms available</option>`;
        const hasDays = row.days?.length > 0;
        const hasTime = row.startTime && row.endTime;
        return `<option value="">— Room —</option>` +
          rooms.map(r => {
            const sel     = row.roomId === r.id;
            const occupied = r._busy && !sel && hasDays && hasTime;
            return `<option value="${r.id}" ${sel ? 'selected' : ''} ${occupied ? 'disabled style="color:var(--t4,#999)"' : ''}>
              ${r.name || r.roomName || r.id}${occupied ? ' (Occupied)' : ''}
            </option>`;
          }).join('');
      };

      overlay.innerHTML = `
        <style>
          .mp-day-chip {
            display:inline-flex;align-items:center;justify-content:center;
            padding:4px 9px;border-radius:20px;font-size:11.5px;font-weight:600;
            border:1.5px solid var(--border);color:var(--t3);background:var(--surface);
            cursor:pointer;user-select:none;transition:all .12s;white-space:nowrap;
          }
          .mp-day-chip:hover { border-color:var(--blue);color:var(--blue); }
          .mp-day-chip.mp-day-sel {
            border-color:var(--blue);background:var(--blue-dim);
            color:var(--blue);font-weight:700;
          }
          .mp-subj-chip {
            display:inline-flex;align-items:center;gap:4px;
            padding:5px 12px;border-radius:20px;font-size:12px;font-weight:500;
            border:1.5px solid var(--border);color:var(--t2);background:var(--surface2);
            cursor:pointer;user-select:none;transition:all .14s;
          }
          .mp-subj-chip:hover { border-color:var(--blue);color:var(--blue); }
          .mp-subj-chip.mp-subj-sel {
            border-color:var(--blue);background:var(--blue-dim);
            color:var(--blue);font-weight:600;
          }
          .mp-subject-card {
            background:var(--surface2);border:1px solid var(--border);
            border-radius:10px;padding:13px 14px;margin-bottom:8px;
          }
          .mp-subject-card.has-conflict { border-color:#ef4444; }
          .mp-conflict-msg {
            margin-top:8px;padding:7px 11px;border-radius:7px;font-size:11.5px;
            background:#fee2e2;color:#7f1d1d;border:1px solid #ef4444;display:none;
          }
          .mp-avail-ok   { font-size:10.5px;font-weight:600;color:#065f46;background:#d1fae5;border:1px solid #6ee7b7;padding:2px 7px;border-radius:10px;margin-left:4px; }
          .mp-avail-busy { font-size:10.5px;font-weight:600;color:#7f1d1d;background:#fee2e2;border:1px solid #ef4444;padding:2px 7px;border-radius:10px;margin-left:4px; }
        </style>

        <div class="bp-modal" style="max-width:740px;height:min(92vh,820px)">
          <div class="bp-modal-head">
            <span class="bp-modal-title">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:-2px;margin-right:5px">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              ${isEdit ? 'Edit Manual Plan' : 'Add Manual Plan'}
            </span>
            <button class="bp-close-btn" id="mpCloseBtn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div class="bp-modal-body">

            <!-- ── Row 1: Plan name ── -->
            <div class="bp-form-group">
              <label class="bp-label">Plan Name <span style="color:#ef4444">*</span></label>
              <input type="text" class="bp-input" id="mpPlanName"
                     placeholder="e.g. CS Morning Batch — Spring 2026"
                     value="${planName}"/>
            </div>

            <!-- ── Row 2: Campus · Discipline · Dates ── -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div class="bp-form-group">
                <label class="bp-label">Campus <span style="color:#ef4444">*</span></label>
                <select class="bp-select" id="mpCampus">
                  <option value="">— Select Campus —</option>
                  ${campusOptions}
                </select>
              </div>
              <div class="bp-form-group">
                <label class="bp-label">Discipline <span style="color:#ef4444">*</span></label>
                <select class="bp-select" id="mpDisc" ${!campusId ? 'disabled' : ''}>
                  <option value="">— Select Discipline —</option>
                  ${discOptions}
                </select>
                ${!campusId ? `<span class="bp-hint">Select campus first.</span>` : ''}
              </div>
              <div class="bp-form-group">
                <label class="bp-label">Start Date <span style="color:#ef4444">*</span></label>
                <input type="date" class="bp-input" id="mpStartDate" value="${startDate}"/>
              </div>
              <div class="bp-form-group">
                <label class="bp-label">End Date <span style="color:#ef4444">*</span></label>
                <input type="date" class="bp-input" id="mpEndDate" value="${endDate}" ${startDate ? `min="${startDate}"` : ''}/>
              </div>
            </div>

            <!-- ── Subjects multi-select chips ── -->
            ${disciplineId ? `
              <div class="bp-form-group" style="border-top:1px solid var(--border);padding-top:14px;margin-top:2px">
                <label class="bp-label">
                  Subjects
                  <span style="font-size:10px;font-weight:400;color:var(--t3);text-transform:none;margin-left:6px">
                    — select one or more to add as class slots
                  </span>
                </label>
                ${discSubjs.length ? `
                  <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
                    ${discSubjs.map(s => {
                      const addedCount = subjectRows.filter(r => r.subjectId === s.id).length;
                      return `<span class="mp-subj-chip ${addedCount > 0 ? 'mp-subj-sel' : ''}"
                                    data-subj-id="${s.id}"
                                    title="${s.subjectName} — click to add another slot">
                                ${s.subjectCode}
                                <span style="font-size:10.5px;font-weight:400;opacity:.75">${s.subjectName.length > 18 ? s.subjectName.slice(0,18)+'…' : s.subjectName}</span>
                                ${addedCount > 0 ? `<span style="font-size:10px;font-weight:700;background:var(--blue);color:#fff;border-radius:10px;padding:1px 6px;margin-left:2px">×${addedCount}</span>` : ''}
                              </span>`;
                    }).join('')}
                  </div>
                  <div style="font-size:11px;color:var(--blue);margin-top:5px;font-weight:500">
                    ${subjectRows.length
                      ? `${subjectRows.length} slot${subjectRows.length > 1 ? 's' : ''} added — configure each below · <span style="color:var(--t3);font-weight:400">click a subject chip again to add another batch</span>`
                      : 'Click subjects to add class slots (click multiple times for multiple batches)'
                    }
                  </div>
                ` : `<div class="bp-alert bp-alert-warn" style="margin-top:6px">⚠ No subjects found for this discipline.</div>`}
              </div>
            ` : (campusId ? `
              <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:2px">
                <div style="font-size:12.5px;color:var(--t3);padding:16px;text-align:center;border:1.5px dashed var(--border);border-radius:8px">
                  Select a discipline to see available subjects.
                </div>
              </div>
            ` : '')}

            <!-- ── Subject schedule cards ── -->
            ${subjectRows.length ? `
              <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:2px">
                <div style="font-size:12px;font-weight:700;color:var(--t1);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">
                  Schedule Configuration
                </div>
                <div id="mpSubjectCards">
                  ${subjectRows.map((row, idx) => {
                    // Count how many rows exist for this subject (for batch label)
                    const sameSubjRows = subjectRows.filter(r => r.subjectId === row.subjectId);
                    const batchIdx = sameSubjRows.findIndex(r => r.id === row.id);
                    const showBatchNum = sameSubjRows.length > 1;
                    return `
                    <div class="mp-subject-card" data-row-id="${row.id}" id="mpCard_${row.id}">

                      <!-- Card header -->
                      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                          <span style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--blue)">${row.subjectCode}</span>
                          <span style="font-size:12px;color:var(--t3)">${row.subjectName || ''}</span>
                          <div style="display:flex;align-items:center;gap:5px">
                            <span style="font-size:10.5px;color:var(--t3);font-weight:600;text-transform:uppercase;letter-spacing:.05em">Batch #</span>
                            <input type="number" class="bp-input mp-batch-num" data-row-id="${row.id}"
                                   min="1" max="99" step="1"
                                   value="${row.batchNumber || (batchIdx + 1)}"
                                   style="width:54px;padding:4px 8px;font-size:12px;font-weight:700;color:var(--blue);text-align:center"
                                   title="Batch number for this subject slot"/>
                          </div>
                        </div>
                        <button class="bp-icon-btn danger mp-del-row" data-del-id="${row.id}" title="Remove this slot">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          </svg>
                        </button>
                      </div>

                      <!-- Days chips -->
                      <div class="bp-form-group" style="margin-bottom:10px">
                        <label class="bp-label">Days <span style="color:#ef4444">*</span>
                          <span style="font-size:10px;font-weight:400;color:var(--t3);text-transform:none;margin-left:4px">— select which days this class runs</span>
                        </label>
                        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:5px" class="mp-days-wrap" data-row-id="${row.id}">
                          ${_dayChips(row)}
                        </div>
                        ${!(row.days||[]).length ? `<div style="font-size:11px;color:#f59e0b;margin-top:4px">⚠ Select at least one day</div>` : ''}
                      </div>

                      <!-- Time + Teacher + Room -->
                      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px">
                        <div class="bp-form-group">
                          <label class="bp-label">Start <span style="color:#ef4444">*</span></label>
                          <input type="time" class="bp-input mp-start-time" data-row-id="${row.id}"
                                 value="${row.startTime || ''}" style="font-size:12px;padding:7px 8px"/>
                        </div>
                        <div class="bp-form-group">
                          <label class="bp-label">End <span style="color:#ef4444">*</span></label>
                          <input type="time" class="bp-input mp-end-time" data-row-id="${row.id}"
                                 value="${row.endTime || ''}" style="font-size:12px;padding:7px 8px"/>
                        </div>
                        <div class="bp-form-group">
                          <label class="bp-label">Teacher</label>
                          <select class="bp-select mp-teacher" data-row-id="${row.id}" style="font-size:12px;padding:7px 8px">
                            ${_teacherOpts(row)}
                          </select>
                        </div>
                        <div class="bp-form-group">
                          <label class="bp-label">Room</label>
                          <select class="bp-select mp-room" data-row-id="${row.id}" style="font-size:12px;padding:7px 8px">
                            ${_roomOpts(row)}
                          </select>
                        </div>
                      </div>

                      <div class="mp-conflict-msg" data-row-id="${row.id}"></div>
                    </div>
                  `; }).join('')}
                </div>
              </div>
            ` : ''}

          </div><!-- /modal-body -->

          <div class="bp-modal-foot">
            <button class="bp-btn bp-btn-secondary" id="mpCancelBtn">Cancel</button>
            <button class="bp-btn bp-btn-success" id="mpSaveBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
              Save Plan
            </button>
          </div>
        </div>
      `;

      // ── Wire events ──────────────────────────────────────────

      overlay.querySelector('#mpCloseBtn').onclick  = () => overlay.remove();
      overlay.querySelector('#mpCancelBtn').onclick = () => overlay.remove();
      overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

      // Plan name
      overlay.querySelector('#mpPlanName')?.addEventListener('input', e => { planName = e.target.value; });

      // Campus change
      overlay.querySelector('#mpCampus')?.addEventListener('change', e => {
        campusId     = e.target.value;
        disciplineId = '';
        subjectRows  = [];
        _render();
      });

      // Discipline change
      overlay.querySelector('#mpDisc')?.addEventListener('change', e => {
        disciplineId = e.target.value;
        // Remove subject rows that don't belong to new discipline
        const validSubjIds = _getDiscSubjects(disciplineId).map(s => s.id);
        subjectRows = subjectRows.filter(r => validSubjIds.includes(r.subjectId));
        _render();
      });

      // Dates
      overlay.querySelector('#mpStartDate')?.addEventListener('change', e => {
        startDate = e.target.value;
        const mpEnd = overlay.querySelector('#mpEndDate');
        if (mpEnd) mpEnd.min = startDate;
      });
      overlay.querySelector('#mpEndDate')?.addEventListener('change', e => { endDate = e.target.value; });

      // Subject chip toggle — each click ADDS a new row (multiple allowed per subject)
      overlay.querySelectorAll('.mp-subj-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const subjId = chip.dataset.subjId;
          const subj = (AppState.get('subjects') || []).find(s => s.id === subjId);
          // Count existing rows for this subject to auto-assign next batch number
          const existingCount = subjectRows.filter(r => r.subjectId === subjId).length;
          subjectRows.push({
            id:          'mr_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
            subjectId:   subjId,
            subjectCode: subj?.subjectCode || '',
            subjectName: subj?.subjectName || '',
            batchNumber: existingCount + 1,  // auto-increment batch number
            days:        [],
            startTime:   '',
            endTime:     '',
            teacherId:   '',
            roomId:      '',
          });
          _render();
        });
      });

      // Day chip toggle per subject row — full re-render needed so room/teacher dropdowns update
      overlay.querySelectorAll('.mp-day-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const rowId = chip.dataset.rowId;
          const day   = chip.dataset.day;
          const row   = subjectRows.find(r => r.id === rowId);
          if (!row) return;
          if (!row.days) row.days = [];
          if (row.days.includes(day)) {
            row.days = row.days.filter(d => d !== day);
          } else {
            row.days.push(day);
          }
          // Re-render so room/teacher dropdowns reflect new day selection
          _render();
        });
      });

      // Delete subject row
      overlay.querySelectorAll('.mp-del-row').forEach(btn => {
        btn.addEventListener('click', () => {
          subjectRows = subjectRows.filter(r => r.id !== btn.dataset.delId);
          _render();
        });
      });

      // Time / teacher / room field sync
      const _syncInput = (sel, field, rerender = false) => {
        overlay.querySelectorAll(sel).forEach(el => {
          el.addEventListener('change', e => {
            const row = subjectRows.find(r => r.id === el.dataset.rowId);
            if (row) {
              row[field] = e.target.value;
              if (rerender) {
                _render(); // re-render so room/teacher dropdowns refresh with busy status
              } else {
                _validateRow(row);
              }
            }
          });
        });
      };
      _syncInput('.mp-start-time', 'startTime', true);  // re-render: room dropdown changes
      _syncInput('.mp-end-time',   'endTime',   true);  // re-render: room dropdown changes
      _syncInput('.mp-teacher',    'teacherId', false);
      _syncInput('.mp-room',       'roomId',    false);

      // Batch number sync
      overlay.querySelectorAll('.mp-batch-num').forEach(el => {
        el.addEventListener('change', e => {
          const row = subjectRows.find(r => r.id === el.dataset.rowId);
          if (row) row.batchNumber = parseInt(e.target.value) || 1;
        });
      });

      // Validate one row → show conflict msg
      const _validateRow = (row) => {
        const msgEl  = overlay.querySelector(`.mp-conflict-msg[data-row-id="${row.id}"]`);
        const cardEl = overlay.querySelector(`#mpCard_${row.id}`);
        if (!msgEl) return;

        const { days, startTime, endTime, teacherId, roomId, subjectCode } = row;
        if (!days?.length || !startTime || !endTime) {
          msgEl.style.display = 'none';
          if (cardEl) cardEl.classList.remove('has-conflict');
          return;
        }

        const startM = _timeToMins(startTime);
        const endM   = _timeToMins(endTime);

        if (endM <= startM) {
          msgEl.textContent = '⚠ End time must be after start time.';
          msgEl.style.display = 'block';
          if (cardEl) cardEl.classList.add('has-conflict');
          return;
        }

        const msgs = [];

        // ── Intra-plan time clash (same plan, different subject) ──
        const timeClash = subjectRows.find(r => {
          if (r.id === row.id) return false;
          if (!r.startTime || !r.endTime || !r.days?.length) return false;
          if (!days.some(d => r.days.includes(d))) return false;
          const sM = _timeToMins(r.startTime), eM = _timeToMins(r.endTime);
          return sM < endM && eM > startM;
        });
        if (timeClash) {
          msgs.push(`⚠ Time clash within this plan with <strong>${timeClash.subjectCode || 'another subject'}</strong> on same days.`);
        }

        // ── Intra-plan same teacher clash ──
        if (teacherId) {
          const teacherClash = subjectRows.find(r => {
            if (r.id === row.id || r.teacherId !== teacherId) return false;
            if (!r.startTime || !r.endTime || !r.days?.length) return false;
            if (!days.some(d => r.days.includes(d))) return false;
            const sM = _timeToMins(r.startTime), eM = _timeToMins(r.endTime);
            return sM < endM && eM > startM;
          });
          if (teacherClash) {
            const t = (AppState.get('teachers') || []).find(t => t.id === teacherId);
            msgs.push(`🔴 Teacher "<strong>${t?.fullName || teacherId}</strong>" already assigned to <strong>${teacherClash.subjectCode}</strong> in this plan at overlapping time.`);
          } else {
            // Check external timetables + other batchPlans (date-range aware)
            const busy = _isTeacherBusy(teacherId, days, startM, endM, existingPlan?.id, row.id);
            if (busy) {
              const t = (AppState.get('teachers') || []).find(t => t.id === teacherId);
              const dateHint = startDate && endDate ? ` during ${startDate} – ${endDate}` : '';
              msgs.push(`🔴 Teacher "<strong>${t?.fullName || teacherId}</strong>" is busy${dateHint}.`);
            }
          }
        }

        // ── Intra-plan same room clash ──
        if (roomId) {
          const roomClash = subjectRows.find(r => {
            if (r.id === row.id || r.roomId !== roomId) return false;
            if (!r.startTime || !r.endTime || !r.days?.length) return false;
            if (!days.some(d => r.days.includes(d))) return false;
            const sM = _timeToMins(r.startTime), eM = _timeToMins(r.endTime);
            return sM < endM && eM > startM;
          });
          if (roomClash) {
            const rm = (AppState.get('rooms') || []).find(r => r.id === roomId);
            msgs.push(`🔴 Room "<strong>${rm?.name || rm?.roomName || roomId}</strong>" already used for <strong>${roomClash.subjectCode}</strong> in this plan at same time.`);
          } else {
            // Check external (date-range aware)
            const busy = _isRoomBusy(roomId, days, startM, endM, existingPlan?.id, row.id);
            if (busy) {
              const rm = (AppState.get('rooms') || []).find(r => r.id === roomId);
              const dateHint = startDate && endDate ? ` during ${startDate} – ${endDate}` : '';
              msgs.push(`🔴 Room "<strong>${rm?.name || rm?.roomName || roomId}</strong>" is occupied${dateHint}.`);
            }
          }
        }

        if (msgs.length) {
          msgEl.innerHTML = msgs.join('<br/>');
          msgEl.style.display = 'block';
          if (cardEl) cardEl.classList.add('has-conflict');
        } else {
          msgEl.style.display = 'none';
          if (cardEl) cardEl.classList.remove('has-conflict');
        }
      };

      // Run initial validation for all rows (edit mode)
      subjectRows.forEach(_validateRow);

      // ── Save ──────────────────────────────────────────────────
      overlay.querySelector('#mpSaveBtn')?.addEventListener('click', () => {
        // Collect latest DOM values
        planName     = overlay.querySelector('#mpPlanName')?.value?.trim()  || '';
        campusId     = overlay.querySelector('#mpCampus')?.value            || '';
        disciplineId = overlay.querySelector('#mpDisc')?.value              || '';
        startDate    = overlay.querySelector('#mpStartDate')?.value         || '';
        endDate      = overlay.querySelector('#mpEndDate')?.value           || '';

        overlay.querySelectorAll('.mp-start-time').forEach(el => {
          const row = subjectRows.find(r => r.id === el.dataset.rowId); if (row) row.startTime = el.value;
        });
        overlay.querySelectorAll('.mp-end-time').forEach(el => {
          const row = subjectRows.find(r => r.id === el.dataset.rowId); if (row) row.endTime = el.value;
        });
        overlay.querySelectorAll('.mp-teacher').forEach(el => {
          const row = subjectRows.find(r => r.id === el.dataset.rowId); if (row) row.teacherId = el.value;
        });
        overlay.querySelectorAll('.mp-room').forEach(el => {
          const row = subjectRows.find(r => r.id === el.dataset.rowId); if (row) row.roomId = el.value;
        });
        overlay.querySelectorAll('.mp-batch-num').forEach(el => {
          const row = subjectRows.find(r => r.id === el.dataset.rowId); if (row) row.batchNumber = parseInt(el.value) || 1;
        });

        // Validation
        if (!planName)     { alert('Please enter a plan name.'); return; }
        if (!campusId)     { alert('Please select a campus.'); return; }
        if (!disciplineId) { alert('Please select a discipline.'); return; }
        if (!startDate)    { alert('Please set a start date.'); return; }
        if (!endDate)      { alert('Please set an end date.'); return; }
        if (endDate < startDate) { alert('End date cannot be before start date.'); return; }
        if (!subjectRows.length) { alert('Please add at least one subject.'); return; }

        for (const row of subjectRows) {
          if (!row.days?.length) {
            alert(`Please select at least one day for "${row.subjectCode}".`); return;
          }
          if (!row.startTime || !row.endTime) {
            alert(`Please set start and end time for "${row.subjectCode}".`); return;
          }
          if (_timeToMins(row.endTime) <= _timeToMins(row.startTime)) {
            alert(`End time must be after start time for "${row.subjectCode}".`); return;
          }
        }

        // Conflict check — full date-range aware check before saving
        let hasConflict = false;
        const conflictMsgs = [];

        for (const row of subjectRows) {
          const startM = _timeToMins(row.startTime), endM = _timeToMins(row.endTime);

          // Intra-plan time clash
          const timeClash = subjectRows.find(r => {
            if (r.id === row.id || !r.days?.length || !r.startTime || !r.endTime) return false;
            return row.days.some(d => r.days.includes(d)) &&
                   _timeToMins(r.startTime) < endM && _timeToMins(r.endTime) > startM;
          });
          if (timeClash) {
            conflictMsgs.push(`"${row.subjectCode}" time clash with "${timeClash.subjectCode}" on same days.`);
            hasConflict = true;
          }

          // Teacher: intra-plan + external (date-range aware, self-excluded)
          if (row.teacherId) {
            const busy = _isTeacherBusy(row.teacherId, row.days, startM, endM, existingPlan?.id, row.id);
            if (busy) {
              const t = (AppState.get('teachers') || []).find(t => t.id === row.teacherId);
              const dateHint = startDate && endDate ? ` (${startDate} – ${endDate})` : '';
              conflictMsgs.push(`Teacher "${t?.fullName || row.teacherId}" busy during "${row.subjectCode}"${dateHint}.`);
              hasConflict = true;
            }
          }

          // Room: intra-plan + external (date-range aware, self-excluded)
          if (row.roomId) {
            const busy = _isRoomBusy(row.roomId, row.days, startM, endM, existingPlan?.id, row.id);
            if (busy) {
              const rm = (AppState.get('rooms') || []).find(r => r.id === row.roomId);
              const dateHint = startDate && endDate ? ` (${startDate} – ${endDate})` : '';
              conflictMsgs.push(`Room "${rm?.name || rm?.roomName || row.roomId}" occupied during "${row.subjectCode}"${dateHint}.`);
              hasConflict = true;
            }
          }
        }

        if (hasConflict) {
          if (!confirm(`Conflicts found:\n\n${conflictMsgs.join('\n')}\n\nSave anyway?`)) return;
        }

        // Enrich rows for storage
        const allRooms    = AppState.get('rooms')       || [];
        const allTeachers = AppState.get('teachers')    || [];
        const campuses    = AppState.get('campuses')    || [];
        const disciplines = AppState.get('disciplines') || [];
        const campus      = campuses.find(c => c.id === campusId);
        const disc        = disciplines.find(d => d.id === disciplineId);

        const enrichedRows = subjectRows.map(row => ({
          ...row,
          batchNumber: row.batchNumber || 1,
          teacher:  allTeachers.find(t => t.id === row.teacherId) || null,
          room:     allRooms.find(r => r.id === row.roomId)       || null,
          // Compat fields for existing result-table rendering
          start:    row.startTime,
          end:      row.endTime,
          day:      (row.days || [])[0] || '',
          dayLabel: (row.days || []).map(d => DAY_FULL[d] || d).join(', '),
          subj:     { subjectCode: row.subjectCode, subjectName: row.subjectName },
          warn:     null,
        }));

        const plan = {
          id:           existingPlan?.id || ('mp_' + Date.now()),
          name:         planName,
          type:         'manual',
          campusId,
          campusName:   campus?.campusName    || '',
          disciplineId,
          discAbbr:     disc?.abbreviation    || '',
          startDate,
          endDate,
          manualRows:   enrichedRows,
          result:       enrichedRows,
          subjects:     subjectRows.map(r => r.subjectId),
          durations:    {},
          createdAt:    existingPlan?.createdAt || Date.now(),
          updatedAt:    Date.now(),
        };

        const existing2 = _getPlans().filter(p => p.id !== plan.id);
        existing2.unshift(plan);
        _setPlans(existing2);

        overlay.remove();
        if (typeof onSave === 'function') onSave();
      });
    }; // end _render

    _render();
    document.body.appendChild(overlay);
  };

  // ── Render plan list (main view) ─────────────────────────────
  const _renderList = (container) => {
    const plans = _getPlans();

    container.innerHTML = `
      <div id="bpPlanList">
        <div class="bp-toolbar">
          <div style="font-size:13px;color:var(--t3)">
            ${plans.length} plan${plans.length !== 1 ? 's' : ''}
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="bp-btn bp-btn-secondary" id="bpAddManualBtn" title="Add Manual Plan — set date, time, room, teacher manually">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Manual Plan
            </button>
            <button class="bp-btn bp-btn-primary" id="bpAddBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New Plan
            </button>
          </div>
        </div>

        ${plans.length === 0
          ? `<div class="bp-empty">
               <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
                 <rect x="3" y="4" width="18" height="18" rx="2"/>
                 <line x1="16" y1="2" x2="16" y2="6"/>
                 <line x1="8" y1="2" x2="8" y2="6"/>
                 <line x1="3" y1="10" x2="21" y2="10"/>
               </svg>
               <h3>No batch plans yet</h3>
               <p>Click <strong>New Plan</strong> to create your first automated timetable plan.</p>
             </div>`
          : `<div class="bp-plans-grid">
               ${plans.map(p => {
                 const isManual  = p.type === 'manual';
                 const campShort = (p.campusName || '').replace(/\s*campus$/i, '').trim() || p.campusId || '—';
                 const dateStr   = p.updatedAt
                   ? new Date(p.updatedAt).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
                   : '';

                 // Manual plan meta
                 const manualMeta = isManual ? (() => {
                   const slots = (p.manualRows || []).length;
                   const dateRange = (p.startDate && p.endDate)
                     ? `${p.startDate} → ${p.endDate}`
                     : p.startDate || '';
                   return `${campShort} · ${slots} slot${slots !== 1 ? 's' : ''} · ${dateRange}`;
                 })() : (() => {
                   const discName  = p.discAbbr || p.disciplineId || '—';
                   const subjCount = (p.subjects || []).length;
                   const scheduled = (p.result || []).filter(r => !r.warn).length;
                   const failed    = (p.result || []).filter(r => r.warn).length;
                   const autoDateStr = (p.planDate && p.planEndDate)
                     ? `${p.planDate} → ${p.planEndDate}`
                     : (p.planDate || '');
                   return `${campShort} · ${discName} · ${subjCount} subjects`
                     + (autoDateStr ? ` · ${autoDateStr}` : '')
                     + (scheduled ? ` · <span style="color:#10b981">${scheduled} scheduled</span>` : '')
                     + (failed    ? ` · <span style="color:#f59e0b">${failed} failed</span>` : '');
                 })();

                 return `
                   <div class="bp-plan-card" data-plan-id="${p.id}" data-plan-type="${isManual ? 'manual' : 'auto'}">
                     <div class="bp-plan-icon" style="${isManual ? 'background:rgba(139,92,246,.12);color:#7c3aed' : ''}">
                       ${isManual
                         ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>`
                         : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <rect x="3" y="4" width="18" height="18" rx="2"/>
                              <line x1="3" y1="10" x2="21" y2="10"/>
                              <line x1="8" y1="2" x2="8" y2="6"/>
                              <line x1="16" y1="2" x2="16" y2="6"/>
                            </svg>`
                       }
                     </div>
                     <div class="bp-plan-info">
                       <div class="bp-plan-name" style="display:flex;align-items:center;gap:6px">
                         ${p.name || 'Untitled Plan'}
                         ${isManual
                           ? `<span style="font-size:9.5px;font-weight:700;padding:1px 7px;border-radius:8px;background:rgba(139,92,246,.12);color:#7c3aed;border:1px solid rgba(139,92,246,.25)">MANUAL</span>`
                           : `<span style="font-size:9.5px;font-weight:700;padding:1px 7px;border-radius:8px;background:var(--blue-dim);color:var(--blue);border:1px solid rgba(79,133,247,.2)">AUTO</span>`
                         }
                       </div>
                       <div class="bp-plan-meta">
                         ${manualMeta}
                         ${dateStr ? `· ${dateStr}` : ''}
                       </div>
                     </div>
                     <div class="bp-plan-actions">
                       <button class="bp-icon-btn" data-view-plan="${p.id}" title="View / Edit">
                         <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                           <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                           <circle cx="12" cy="12" r="3"/>
                         </svg>
                       </button>
                       <button class="bp-icon-btn danger" data-del-plan="${p.id}" title="Delete">
                         <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                           <polyline points="3 6 5 6 21 6"/>
                           <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                         </svg>
                       </button>
                     </div>
                   </div>
                 `;
               }).join('')}
             </div>`
        }
      </div>
    `;

    // New Plan button
    container.querySelector('#bpAddBtn')?.addEventListener('click', () => {
      _openModal(null, () => _renderList(container));
    });

    // Manual Plan button
    container.querySelector('#bpAddManualBtn')?.addEventListener('click', () => {
      _openManualModal(null, () => _renderList(container));
    });

    // View/Edit plan — route to correct modal based on type
    container.querySelectorAll('[data-view-plan]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const plan = _getPlans().find(p => p.id === btn.dataset.viewPlan);
        if (!plan) return;
        if (plan.type === 'manual') {
          _openManualModal(plan, () => _renderList(container));
        } else {
          _openModal(plan, () => _renderList(container));
        }
      });
    });

    // Card click → also opens view
    container.querySelectorAll('.bp-plan-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('[data-del-plan]') || e.target.closest('[data-view-plan]')) return;
        const plan = _getPlans().find(p => p.id === card.dataset.planId);
        if (!plan) return;
        if (plan.type === 'manual') {
          _openManualModal(plan, () => _renderList(container));
        } else {
          _openModal(plan, () => _renderList(container));
        }
      });
    });

    // Delete plan
    container.querySelectorAll('[data-del-plan]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (!confirm('Delete this plan? This cannot be undone.')) return;
        _setPlans(_getPlans().filter(p => p.id !== btn.dataset.delPlan));
        _renderList(container);
      });
    });
  };

  // ── Public API ───────────────────────────────────────────────
  return {
    /**
     * Mount the Batch Planning tab into a container element.
     * Called by timetableUI.js when the "Batches" tab is clicked.
     * @param {HTMLElement} el
     */
    mount(el) {
      if (!el) return;
      _injectStyles();
      _renderList(el);
    },

    /**
     * Refresh the list view (e.g. after external state changes).
     * @param {HTMLElement} el
     */
    refresh(el) {
      if (!el) return;
      _renderList(el);
    },
  };

})();