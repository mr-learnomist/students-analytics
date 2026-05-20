// ============================================================
// modules/lecturePlan/lecturePlanService.js
// Business logic for Lecture Plans + LP Assignment to batches
// Adapted from courses_data__7_.html — vanilla JS, no frameworks
// Storage: AppState (state.js) — keys: lecturePlans, lpAssignments
// ============================================================

import { AppState, generateID } from '../../utils/state.js';

// ── Data model ────────────────────────────────────────────────
// LP Meta:  { id, code, title, desc, disciplineId, subjectId,
//             subjectName, subjectCode,             ← SNAPSHOT (frozen at save)
//             disciplineName, disciplineAbbr }      ← SNAPSHOT (frozen at save)
//   subjectName: customizable per-LP — user can override via "Custom Subject Name"
//                field in the form without touching the master subjects list.
//   Master renames do NOT affect these snapshots (same strategy as batch.js).
// LP Row:   { id, topic, type, date(''), status }
//   type:   'Lecture' | 'Test' | 'Midterm' | 'Mock' | 'Holiday' | 'Revision' | 'Other'
//   hours:  Lecture/Other=0.5 | Test/Midterm=1 | Mock=2 | Holiday=0 | Revision=varies
// LP Assignment (per batch):
//   { batchId, lpId, lpCode, lpTitle, rows: [...generatedRows] }
//   generatedRow: { id, topic, type, date, hours, status, remarks }

const LP_META_KEY    = 'lecturePlans';
const LP_ROWS_KEY    = 'lpRows';       // stored as lpRows_<lpId>
const LP_ASSIGN_KEY  = 'lpAssignments'; // { batchId: assignmentObj }

// ── LP Meta helpers ───────────────────────────────────────────
export function getLPMeta() {
  return AppState.get(LP_META_KEY) || [];
}

export function saveLPMeta(arr) {
  AppState.set(LP_META_KEY, arr);
}

export function getLPRows(lpId) {
  const all = AppState.get(LP_ROWS_KEY) || {};
  return all[lpId] || [];
}

export function saveLPRows(lpId, rows) {
  const all = AppState.get(LP_ROWS_KEY) || {};
  all[lpId] = rows;
  AppState.set(LP_ROWS_KEY, all);
}

export function deleteLPRows(lpId) {
  const all = AppState.get(LP_ROWS_KEY) || {};
  delete all[lpId];
  AppState.set(LP_ROWS_KEY, all);
}

// ── LP Assignment helpers ─────────────────────────────────────
export function getAllAssignments() {
  return AppState.get(LP_ASSIGN_KEY) || {};
}

export function saveAllAssignments(obj) {
  AppState.set(LP_ASSIGN_KEY, obj);
}

export function getAssignmentForBatch(batchId) {
  return getAllAssignments()[batchId] || null;
}

// ── Hours calculator ──────────────────────────────────────────
export function rowHours(row) {
  if (row?.hours != null && row.hours !== '') return parseFloat(row.hours) || 0;
  const t = (row?.type || 'Lecture').toLowerCase();
  if (t === 'mock')                    return 2;
  if (t === 'test' || t === 'midterm') return 1;
  if (t === 'holiday')                 return 0;
  return 0.5; // Lecture / Other / Revision default
}

export function calcHours(rows) {
  let teaching = 0, test = 0, mock = 0, revision = 0;
  (rows || []).forEach(r => {
    const t = (r.type || 'Lecture').toLowerCase();
    const h = rowHours(r);
    if (t === 'mock')                         mock     += h;
    else if (t === 'test' || t === 'midterm') test     += h;
    else if (t === 'revision')                revision += h;
    else if (t === 'lecture' || t === 'other') teaching += h;
    // holiday = 0, ignored
  });
  return {
    teaching: Math.round(teaching * 100) / 100,
    test:     Math.round(test     * 100) / 100,
    mock:     Math.round(mock     * 100) / 100,
    revision: Math.round(revision * 100) / 100,
    total:    Math.round((teaching + test + mock + revision) * 100) / 100,
  };
}

// ── Auto-detect row type from topic text ──────────────────────
export function autoDetectType(topic) {
  const t = (topic || '').toLowerCase().trim();
  if (/\bmock\b/.test(t))                                            return 'Mock';
  if (/\bmidterm\b/.test(t) || /\bmid.?term\b/.test(t))            return 'Midterm';
  if (/\btest\b/.test(t))                                           return 'Test';
  if (/\bholiday\b/.test(t) || /\bno.?class\b/.test(t) || /\beid\b/.test(t)) return 'Holiday';
  if (/\brevision\b/.test(t))                                       return 'Revision';
  return 'Lecture';
}

// ── CSV Import (master rows — no dates) ──────────────────────
// Format: Date(blank), Particulars, Status(ignored)
export function parseRowsCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n').filter(l => l.trim());
  const result = [];
  const errors = [];

  lines.forEach((line, i) => {
    // Simple CSV parse
    const parts = [];
    let cur = '', inQ = false;
    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { parts.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    parts.push(cur.trim());

    const col1 = (parts[1] || '').replace(/^"|"$/g, '').trim();
    const topic = col1;

    // Skip header
    if (i === 0 && ['particulars', 'topic', 'description'].includes(col1.toLowerCase())) return;
    if (!topic) return;

    result.push({
      id:     'row-' + Date.now() + '-' + i,
      date:   '',
      topic,
      type:   autoDetectType(topic),
      status: 'Pending',
    });
  });

  return { rows: result, errors };
}

// ── Sample CSV content ────────────────────────────────────────
export function getSampleCSV() {
  return [
    'Date,Particulars,Status',
    ',Introduction to the subject,',
    ',Core concept — Part 1,',
    ',Core concept — Part 2,',
    ',Chapter 2 overview,',
    ',Chapter 2 — detailed,',
    ',Test 1,',
    ',Chapter 3 — Part 1,',
    ',Chapter 3 — Part 2,',
    ',Midterm,',
    ',Chapter 4 — overview,',
    ',Chapter 4 — detailed,',
    ',Revision,',
    ',Mock,',
  ].join('\n');
}

// ── LP CRUD ───────────────────────────────────────────────────
export const LecturePlanService = {

  getAll(filters = {}) {
    let plans = getLPMeta();
    if (filters.disciplineId) plans = plans.filter(p => p.disciplineId === filters.disciplineId);
    if (filters.subjectId)    plans = plans.filter(p => p.subjectId    === filters.subjectId);
    return plans;
  },

  create(data) {
    if (!data.code?.trim())  return { success: false, message: 'Plan Code is required.' };
    if (!data.title?.trim()) return { success: false, message: 'Plan Title is required.' };
    if (!data.subjectId)     return { success: false, message: 'Subject is required.' };
    if (!data.disciplineId)  return { success: false, message: 'Discipline is required.' };

    const all = getLPMeta();

    // Allow multiple LPs per subject — only code must be unique.
    if (all.find(m => m.code === data.code.toUpperCase().trim())) {
      return { success: false, message: 'A lecture plan with this code already exists. Use a unique Plan Code.' };
    }

    // ── Snapshot: freeze subject/discipline names at creation time ─────────
    // Same pattern as batch.js _buildBatchObject() — if master subject is
    // renamed later, this LP keeps its original names frozen in history.
    // customSubjectName lets the user override per-LP without touching master.
    const subj = AppState.findById('subjects', data.subjectId);
    const disc = AppState.findById('disciplines', data.disciplineId);

    const plan = {
      id:           generateID('lp'),
      code:         data.code.toUpperCase().trim(),
      title:        data.title.trim(),
      desc:         data.desc?.trim() || '',
      disciplineId: data.disciplineId || null,
      subjectId:    data.subjectId    || null,

      // ── SNAPSHOT FIELDS (frozen at creation) ──────────────────────────────
      subjectName:     data.customSubjectName?.trim() || subj?.subjectName  || '',
      subjectCode:     subj?.subjectCode  || '',
      disciplineName:  disc?.fullName     || '',
      disciplineAbbr:  disc?.abbreviation || '',
      // ─────────────────────────────────────────────────────────────────────

      createdAt:    new Date().toISOString(),
    };

    saveLPMeta([...all, plan]);
    return { success: true, plan };
  },

  update(id, data) {
    const all = getLPMeta();
    const idx = all.findIndex(m => m.id === id);
    if (idx < 0) return { success: false, message: 'Plan not found.' };

    // Code uniqueness check (exclude self)
    if (data.code) {
      const newCode = data.code.toUpperCase().trim();
      const dup = all.find(m => m.code === newCode && m.id !== id);
      if (dup) return { success: false, message: 'Another LP already uses this code.' };
    }

    // Re-resolve snapshots on update (subject may have changed, or
    // customSubjectName may have been explicitly set/cleared by user).
    const newSubjId = data.subjectId ?? all[idx].subjectId;
    const newDiscId = data.disciplineId ?? all[idx].disciplineId;
    const subj = AppState.findById('subjects',     newSubjId);
    const disc = AppState.findById('disciplines',  newDiscId);

    // customSubjectName rules:
    //  1. User typed something → use it as custom override (lock it in)
    //  2. User left blank (customSubjectName === '') AND subject NOT changed
    //       → keep the existing snapshot (don't overwrite with master name)
    //  3. User left blank AND subject WAS changed to a new one
    //       → snapshot the new master subject name (fresh subject, fresh name)
    //  4. Not passed at all (undefined) → keep existing snapshot unchanged
    const subjChanged = data.subjectId !== undefined && data.subjectId !== all[idx].subjectId;
    let subjectName;
    if (data.customSubjectName !== undefined) {
      const typed = data.customSubjectName?.trim() || '';
      if (typed) {
        // User explicitly set a custom name
        subjectName = typed;
      } else if (subjChanged) {
        // Subject swapped, no custom name → use new master name as base snapshot
        subjectName = subj?.subjectName || '';
      } else {
        // Blank + same subject → preserve existing snapshot (don't let master rename leak in)
        subjectName = all[idx].subjectName || '';
      }
    } else {
      subjectName = all[idx].subjectName || '';
    }

    all[idx] = {
      ...all[idx],
      code:         (data.code  || all[idx].code).toUpperCase().trim(),
      title:        (data.title || all[idx].title).trim(),
      desc:         data.desc?.trim() ?? all[idx].desc,
      disciplineId: newDiscId,
      subjectId:    newSubjId,

      // ── Update snapshots ─────────────────────────────────────────────────
      subjectName:    subjectName,
      subjectCode:    subj?.subjectCode  || all[idx].subjectCode  || '',
      disciplineName: disc?.fullName     || all[idx].disciplineName || '',
      disciplineAbbr: disc?.abbreviation || all[idx].disciplineAbbr || '',
      // ────────────────────────────────────────────────────────────────────

      updatedAt:    new Date().toISOString(),
    };

    saveLPMeta(all);
    return { success: true, plan: all[idx] };
  },

  delete(id) {
    // Check if assigned to any batch
    const assignments = getAllAssignments();
    const usedIn = Object.values(assignments).filter(a => a.lpId === id);
    if (usedIn.length) {
      return { success: false, message: `This plan is assigned to ${usedIn.length} batch(es). Remove assignments first.` };
    }
    saveLPMeta(getLPMeta().filter(m => m.id !== id));
    deleteLPRows(id);
    return { success: true };
  },

  saveRows(lpId, rows) {
    // Auto-detect types before saving
    const cleaned = rows.map(r => ({ ...r, type: autoDetectType(r.topic) }));
    saveLPRows(lpId, cleaned);
    return { success: true, count: cleaned.length };
  },

  // ── Generate dated rows for batch assignment ───────────────
  generateDatedRows(lpId, opts = {}) {
    const masterRows = getLPRows(lpId);
    if (!masterRows.length) return { success: false, message: 'This plan has no rows. Add rows first.' };

    const {
      startDate,
      hoursPerDay   = 1.5,
      workDays      = [1, 2, 3, 4, 5],  // Mon–Fri
      inclRevision  = false,
      inclHolidays  = true,
      revisionDays  = [],                // array of day numbers e.g. [6] or [5,6]
      revisionDay   = 6,                 // legacy fallback (single number)
    } = opts;

    // Normalise: support both revisionDays (array from UI) and revisionDay (legacy single)
    const revDays = (Array.isArray(revisionDays) && revisionDays.length)
      ? revisionDays
      : (inclRevision ? [revisionDay] : []);

    if (!startDate) return { success: false, message: 'Start date is required.' };
    if (!workDays.length) return { success: false, message: 'Select at least one working day.' };

    const holidays   = getHolidaysForBatch(opts.batchId || null);
    const rowsPerDay = Math.max(1, Math.round(hoursPerDay / 0.5));
    const revisionHr = hoursPerDay;

    // Timezone-safe date helpers
    const lds  = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const pld  = s => { const p = s.split('-'); return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2])); };
    const addD = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
    const isWork  = d => workDays.includes(d.getDay());
    const isHol   = d => inclHolidays && holidays.includes(lds(d));
    const blocked = d => !isWork(d) || isHol(d);

    let iter = 0;
    const nextW = d => { let nd = addD(d, 1); while (blocked(nd) && iter < 800) { nd = addD(nd, 1); iter++; } return nd; };
    // Returns all revision-candidate dates between from (excl) and to (excl)
    const revDaysBetween = (from, to) => {
      const res = [];
      let d = addD(from, 1);
      const ts = lds(to);
      while (lds(d) < ts) {
        if (revDays.includes(d.getDay()) && !isHol(d)) res.push(new Date(d));
        d = addD(d, 1);
      }
      return res;
    };

    const defaultHr = tp => {
      const t = (tp || 'Lecture').toLowerCase();
      if (t === 'mock')                    return 2;
      if (t === 'test' || t === 'midterm') return hoursPerDay;
      if (t === 'holiday')                 return 0;
      if (t === 'revision')                return revisionHr;
      return 0.5;
    };

    let cur = pld(startDate);
    while (blocked(cur) && iter < 200) { cur = addD(cur, 1); iter++; }

    const pending = [...masterRows];
    const gen     = [];
    let pi        = 0;
    let totalLecturesPlaced = 0; // pehli revision se pehle kam az kam ek lecture hona chahiye

    while (pi < pending.length && iter < 1500) {
      iter++;

      // Agar current day revision day hai — sirf revision row add karo, lectures skip karo
      // Lekin pehli revision tab tak nahi aayegi jab tak kam az kam ek lecture place na ho jaye
      if (inclRevision && revDays.length && revDays.includes(cur.getDay()) && !isHol(cur) && totalLecturesPlaced > 0) {
        const ds = lds(cur);
        gen.push({ id: 'rev-' + ds + '-' + pi, topic: 'Weekly Revision', type: 'Revision', date: ds, hours: revisionHr, status: 'Pending', remarks: '' });
        cur = nextW(cur);
        continue; // lectures is din nahi, agle work day pe jayenge
      }

      const mr = pending[pi];
      const tp = (mr.type || 'Lecture').toLowerCase();

      if (tp === 'test' || tp === 'midterm' || tp === 'mock') {
        // Block rows — take entire day
        gen.push({ id: mr.id, topic: mr.topic, type: mr.type, date: lds(cur), hours: defaultHr(mr.type), status: 'Pending', remarks: '' });
        cur = nextW(cur);
        pi++;
        continue;
      }

      // Lecture / Other / master Revision — pack by hours-based slots
      // Each row's slots = ceil(rowHours / 0.5). rowsPerDay = hoursPerDay / 0.5.
      // We fill until the day's slots are used up, then move to next day.
      const dayRows = [];
      let slotsUsed = 0;
      while (slotsUsed < rowsPerDay && pi < pending.length) {
        const nr   = pending[pi];
        const nt   = (nr.type || 'Lecture').toLowerCase();
        if (nt === 'test' || nt === 'midterm' || nt === 'mock') break;
        // How many slots does this row consume?
        const rowHr    = nr.hours != null && nr.hours !== '' ? parseFloat(nr.hours) || 0.5 : 0.5;
        const rowSlots = Math.max(1, Math.round(rowHr / 0.5));
        if (slotsUsed + rowSlots > rowsPerDay && dayRows.length > 0) break; // doesn't fit today
        dayRows.push({ ...nr, _slots: rowSlots });
        slotsUsed += rowSlots;
        pi++;
      }

      const ds = lds(cur);
      dayRows.forEach(dr => gen.push({
        id:      dr.id,
        topic:   dr.topic,
        type:    dr.type,
        date:    ds,
        hours:   dr.hours != null && dr.hours !== '' ? parseFloat(dr.hours) || 0.5 : 0.5,
        status:  'Pending',
        remarks: '',
      }));
      totalLecturesPlaced += dayRows.length;

      cur = nextW(cur);
    }

    gen.sort((a, b) => a.date.localeCompare(b.date));
    if (!gen.length) return { success: false, message: 'No rows could be generated. Check settings.' };

    return { success: true, rows: gen };
  },

  // ── Save assignment to batch ───────────────────────────────
  assignToBatch(batchId, lpId, generatedRows, opts = {}) {
    const meta = getLPMeta().find(m => m.id === lpId);
    if (!meta) return { success: false, message: 'Lecture plan not found.' };

    const all = getAllAssignments();
    all[batchId] = {
      lpId,
      lpCode:      meta.code,
      lpTitle:     meta.title,
      batchId,
      rows:        generatedRows,
      workDays:    opts.workDays    || [1, 2, 3, 4, 5],
      hoursPerDay: opts.hoursPerDay || 1.5,
      assignedAt:  new Date().toISOString(),

      // ── SNAPSHOT: freeze LP's subject name at assignment time ─────────────
      // Same pattern as batch.js — master subject renames won't affect
      // the assigned LP display. Prefer LP's own custom snapshot if set.
      subjectName: meta.subjectName || '',
      subjectCode: meta.subjectCode || '',
      // ─────────────────────────────────────────────────────────────────────
    };
    saveAllAssignments(all);
    return { success: true };
  },

  removeAssignment(batchId) {
    const all = getAllAssignments();
    delete all[batchId];
    saveAllAssignments(all);
    return { success: true };
  },

  // ── Mark row done / update hours ──────────────────────────
  markRow(batchId, rowId, isDone) {
    const all = getAllAssignments();
    if (!all[batchId]) return;
    all[batchId].rows = all[batchId].rows.map(r =>
      r.id === rowId ? { ...r, status: isDone ? 'Done' : 'Pending' } : r
    );
    saveAllAssignments(all);
  },

  setRowHours(batchId, rowId, hours) {
    const all = getAllAssignments();
    if (!all[batchId]) return;
    all[batchId].rows = all[batchId].rows.map(r =>
      r.id === rowId ? { ...r, hours: parseFloat(hours) || 0 } : r
    );
    saveAllAssignments(all);
  },

  setRowRemark(batchId, rowId, remarks) {
    const all = getAllAssignments();
    if (!all[batchId]) return;
    all[batchId].rows = all[batchId].rows.map(r =>
      r.id === rowId ? { ...r, remarks } : r
    );
    saveAllAssignments(all);
  },

  // ── Reschedule pending rows from a given date ─────────────
  // Done rows are untouched. Rows before reDate keep their dates.
  // Rows from reDate onwards get new dates based on new settings.
  // Revision rows before reDate are kept; after reDate are dropped
  // and re-inserted based on inclRevision + revisionDays setting.
  //
  // opts: { reDate, hoursPerDay, workDays, inclRevision, revisionDays[] }
  //   revisionDays: array of day numbers e.g. [6] or [5,6]
  reschedule(batchId, opts = {}) {
    const all = getAllAssignments();
    if (!all[batchId]) return { success: false, message: 'LP assignment not found.' };

    const {
      reDate,
      hoursPerDay  = 1,
      workDays     = [1, 2, 3, 4, 5],
      inclRevision = false,
      revisionDays = [],  // array from UI checkboxes
      revisionDay  = 6,   // legacy fallback
    } = opts;

    // Normalise: support both revisionDays (array) and revisionDay (legacy single)
    const revDays = (Array.isArray(revisionDays) && revisionDays.length)
      ? revisionDays
      : (inclRevision ? [revisionDay] : []);

    if (!reDate)        return { success: false, message: 'Reschedule date is required.' };
    if (!workDays.length) return { success: false, message: 'Select at least one working day.' };

    const holidays = getHolidaysForBatch(all[batchId].batchId || batchId);
    const newRowsPerDay = Math.max(1, Math.round(hoursPerDay / 0.5));
    const revisionHr    = hoursPerDay;

    // Timezone-safe helpers
    const lds  = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const pld  = s => { const p = s.split('-'); return new Date(+p[0], +p[1]-1, +p[2]); };
    const addD = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
    const isWork  = d => workDays.includes(d.getDay());
    const isHol   = d => holidays.includes(lds(d));
    const blocked = d => !isWork(d) || isHol(d);

    let si = 0;
    const nxtW = d => { let nd = addD(d, 1); while (blocked(nd) && si < 800) { nd = addD(nd, 1); si++; } return nd; };
    // Returns all revision-candidate dates between from (excl) and to (excl)
    const revDaysBetween = (from, to) => {
      const res = [];
      let d = addD(from, 1);
      const ts = lds(to);
      while (lds(d) < ts) {
        if (revDays.includes(d.getDay()) && !isHol(d) && !workDays.includes(d.getDay())) res.push(new Date(d));
        d = addD(d, 1);
      }
      return res;
    };

    const rows = all[batchId].rows;

    // ── Split rows into three buckets ────────────────────────────────────────
    // 1. beforeRows   : Done rows + any pending rows whose date is before reDate
    //                   + "Weekly Revision" rows before reDate (auto-generated)
    // 2. toReschedule : All pending NON-weekly-revision rows from reDate onwards
    //                   (must exactly match master LP rows — no extras, no drops)
    // 3. Weekly Revision rows from reDate onwards are ALWAYS dropped here and
    //    re-inserted by the scheduling loop IF inclRevision=true.
    //    If inclRevision=false they are simply not re-added (they are auto rows,
    //    not master rows, so dropping them does NOT affect master row count).
    //
    // KEY INVARIANT: toReschedule contains ONLY master-LP rows (id not starting
    // with 'rev-'). Weekly Revision rows are identified by id prefix 'rev-' OR
    // by (type==='Revision' AND topic==='Weekly Revision'). All other Revision
    // rows that came from the master LP are treated as normal master rows and
    // placed into toReschedule so they are never lost.
    // ─────────────────────────────────────────────────────────────────────────

    const isWeeklyRevRow = r =>
      (r.id && r.id.startsWith('rev-')) ||
      ((r.type || '').toLowerCase() === 'revision' && (r.topic || '').trim() === 'Weekly Revision');

    const beforeRows    = [];
    const toReschedule  = [];

    rows.forEach(r => {
      if (r.status === 'Done') {
        // Done rows are never touched regardless of type
        beforeRows.push(r);
      } else if (isWeeklyRevRow(r)) {
        // Auto-generated Weekly Revision rows:
        //   before reDate → keep in place
        //   from reDate onwards → drop (loop will re-insert if inclRevision=true)
        if (!r.date || r.date < reDate) beforeRows.push(r);
        // else: drop — will be re-generated below if inclRevision=true
      } else {
        // All master LP rows (Lecture, Test, Mock, Midterm, Revision from master, Other):
        //   before reDate → keep in place
        //   from reDate onwards → reschedule (NEVER drop — preserves master row count)
        if (r.date && r.date < reDate) beforeRows.push(r);
        else toReschedule.push(r);
      }
    });

    if (!toReschedule.length) {
      return { success: false, message: 'No pending rows found from this date onwards.' };
    }

    let cur = pld(reDate);
    while (blocked(cur) && si < 200) { cur = addD(cur, 1); si++; }

    const newRows = [];
    let pi = 0;

    let totalLecturesPlacedR = beforeRows.filter(r => !isWeeklyRevRow(r)).length;

    while (pi < toReschedule.length && si < 1500) {
      si++;

      // If current day is a revision day and inclRevision is ON, insert a Weekly
      // Revision row first (before placing any master row on this day).
      // Guard: at least one non-revision row must already be placed.
      if (inclRevision && revDays.length && revDays.includes(cur.getDay()) && !isHol(cur) && totalLecturesPlacedR > 0) {
        const ds = lds(cur);
        newRows.push({ id: 'rev-' + ds + '-' + pi, topic: 'Weekly Revision', type: 'Revision', date: ds, hours: revisionHr, status: 'Pending', remarks: '' });
        cur = nxtW(cur);
        continue;
      }

      const mr = toReschedule[pi];
      const tp = (mr.type || 'Lecture').toLowerCase();

      // Block rows (Test / Midterm / Mock) — take entire day
      if (tp === 'test' || tp === 'midterm' || tp === 'mock') {
        newRows.push({
          id:      mr.id,
          topic:   mr.topic,
          type:    mr.type,
          date:    lds(cur),
          hours:   tp === 'mock' ? 2 : hoursPerDay,
          status:  'Pending',
          remarks: mr.remarks || '',
        });
        cur = nxtW(cur);
        pi++;
        totalLecturesPlacedR++;
        continue;
      }

      // Lecture / Other / master Revision — pack by hours-based slots
      // Each row's slots = ceil(rowHours / 0.5). newRowsPerDay = hoursPerDay / 0.5.
      const dayRows = [];
      let slotsUsed = 0;
      while (slotsUsed < newRowsPerDay && pi < toReschedule.length) {
        const nr  = toReschedule[pi];
        const nt  = (nr.type || 'Lecture').toLowerCase();
        if (nt === 'test' || nt === 'midterm' || nt === 'mock') break;
        const rowHr    = nr.hours != null && nr.hours !== '' ? parseFloat(nr.hours) || 0.5 : 0.5;
        const rowSlots = Math.max(1, Math.round(rowHr / 0.5));
        if (slotsUsed + rowSlots > newRowsPerDay && dayRows.length > 0) break;
        dayRows.push({ ...nr, _slots: rowSlots });
        slotsUsed += rowSlots;
        pi++;
      }

      const ds = lds(cur);
      dayRows.forEach(dr => newRows.push({
        id:      dr.id,
        topic:   dr.topic,
        type:    dr.type,
        date:    ds,
        hours:   dr.hours != null ? dr.hours : 0.5,
        status:  'Pending',
        remarks: dr.remarks || '',
      }));
      totalLecturesPlacedR += dayRows.length;

      cur = nxtW(cur);
    }

    // Merge and sort by date
    const merged = [...beforeRows, ...newRows].sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });

    all[batchId].rows = merged;
    saveAllAssignments(all);
    return { success: true, rescheduled: newRows.length, total: merged.length };
  },

  // ── Bulk update hours for a set of rows ───────────────────
  bulkSetHours(batchId, opts = {}) {
    const all = getAllAssignments();
    if (!all[batchId]) return { success: false };

    const { hours, typeFilter = 'All', range = 'pending', fromRow = 1, toRow = 999999 } = opts;
    const hrVal = parseFloat(hours) || 0.5;

    all[batchId].rows = all[batchId].rows.map((r, i) => {
      if (range === 'pending' && r.status === 'Done') return r;
      if (range === 'from'    && (i + 1 < fromRow || i + 1 > toRow)) return r;
      if (typeFilter !== 'All' && (r.type || 'Lecture') !== typeFilter) return r;
      return { ...r, hours: hrVal };
    });

    saveAllAssignments(all);
    return { success: true };
  },

  // ── Backfill missing snapshots on old LP records ──────────────────────────
  // Old LPs (created before snapshot feature) have empty subjectName/Code.
  // This runs once at tab load — only patches records where snapshot is missing.
  // Never overwrites a subjectName that was intentionally customised (non-empty).
  backfillSnapshots() {
    const all     = getLPMeta();
    let changed   = 0;
    const updated = all.map(plan => {
      const needsSubj = !plan.subjectCode && !plan.subjectName;
      const needsDisc = !plan.disciplineAbbr && !plan.disciplineName;
      if (!needsSubj && !needsDisc) return plan; // already has snapshots

      const subj = AppState.findById('subjects',     plan.subjectId);
      const disc = AppState.findById('disciplines',  plan.disciplineId);
      changed++;
      return {
        ...plan,
        subjectCode:    plan.subjectCode    || subj?.subjectCode  || '',
        subjectName:    plan.subjectName    || subj?.subjectName  || '',
        disciplineAbbr: plan.disciplineAbbr || disc?.abbreviation || '',
        disciplineName: plan.disciplineName || disc?.fullName     || '',
      };
    });
    if (changed > 0) saveLPMeta(updated);
    return changed;
  },
};

// ── Campus-aware holiday resolver ────────────────────────────
// Returns flat array of date strings applicable to a batchId
export function getHolidaysForBatch(batchId) {
  const batch    = (AppState.get('batches') || []).find(b => b.id === batchId);
  const campusId = batch?.campusId || null;
  const all      = AppState.get('holidays') || [];

  return all
    .filter(h => {
      if (!h.scope || h.scope === 'global') return true;
      if (h.scope === 'campus') {
        // Support new campusIds array and old campusId string
        const ids = Array.isArray(h.campusIds) ? h.campusIds : (h.campusId ? [h.campusId] : []);
        return campusId && ids.includes(campusId);
      }
      return true;
    })
    .map(h => h.date);
}

// ── Holiday Watcher ───────────────────────────────────────────
// Scans all LP assignments and detects which ones need updating
// when holidays are added/changed.
//
// Affected = a batch whose LP has at least one Pending row whose
//            date matches a holiday applicable to that batch's campus.
//
// Storage key: 'lpHolidayNotifs'
//   { batchId: { batchId, batchName, lpCode, lpTitle, campusId,
//                affectedDates: ['2025-03-23', ...], excluded: false } }

const NOTIF_KEY = 'lpHolidayNotifs';

export const HolidayWatcher = {

  // ── Load/save notifications ──────────────────────────────
  getNotifs() {
    return AppState.get(NOTIF_KEY) || {};
  },
  saveNotifs(obj) {
    AppState.set(NOTIF_KEY, obj);
  },

  // ── Full scan ─────────────────────────────────────────────
  // Call this whenever holidays change. Returns count of newly affected.
  scan() {
    const assignments = getAllAssignments();
    const batches     = AppState.get('batches') || [];
    const existing    = this.getNotifs();
    const updated     = {};

    for (const batchId of Object.keys(assignments)) {
      // Skip if user has manually excluded this batch
      if (existing[batchId]?.excluded) {
        updated[batchId] = existing[batchId];
        continue;
      }

      const lpa       = assignments[batchId];
      const batch     = batches.find(b => b.id === batchId);
      if (!batch) continue;

      const holidays  = new Set(getHolidaysForBatch(batchId));
      const affected  = lpa.rows.filter(r =>
        r.status !== 'Done' &&
        r.type   !== 'Holiday' &&
        r.date   && holidays.has(r.date)
      );

      if (affected.length) {
        updated[batchId] = {
          batchId,
          batchName:     batch.batchName || batchId,
          campusId:      batch.campusId  || null,
          lpCode:        lpa.lpCode,
          lpTitle:       lpa.lpTitle,
          affectedDates: [...new Set(affected.map(r => r.date))].sort(),
          affectedCount: affected.length,
          excluded:      false,
          detectedAt:    existing[batchId]?.detectedAt || new Date().toISOString(),
        };
      }
      // If no affected rows → remove old notif for this batch
    }

    this.saveNotifs(updated);
    return Object.keys(updated).filter(k => !updated[k].excluded).length;
  },

  // ── Reverse-shift rows when a holiday is DELETED ─────────
  //
  // When a holiday date is removed, any pending row that was previously
  // shifted AWAY from that date (to escape the holiday) should move back.
  //
  // How we detect "shifted" rows: after deletion, that date is now a valid
  // workday. We look for pending rows whose date is AFTER a removed-holiday
  // date AND whose date would not have been their natural slot — i.e. there
  // is now an empty workday slot (the removed holiday) before them that
  // belongs to the same "run" of consecutive rows on the same original date.
  //
  // Simpler reliable rule used here:
  //   For each removed holiday date D:
  //     Find all pending non-Holiday rows whose date > D (shifted away).
  //     Among those, find rows that were originally ON D — we can't know for
  //     sure, so we pull back rows equal to the number of rows that WERE on
  //     the next workday after D at the time of the shift (i.e. rows sharing
  //     that next-workday date that have no other "natural" reason to be there).
  //
  // PRACTICAL RULE (clean & safe):
  //   For each removed holiday D, for each batch:
  //     - workday immediately after D (call it W) — this is where shifted rows went
  //     - collect pending rows on W that share the same date (they were packed there)
  //     - if W has MORE rows than the batch's rowsPerDay setting → the extras
  //       were shifted there from D → move them back to D
  //     - if W has rows AND D is now a valid workday → move rows back to D
  //       up to rowsPerDay limit, leaving remainder on W
  //
  scanDeleted(removedDates = []) {
    if (!removedDates.length) return { affected: 0 };

    const all     = getAllAssignments();
    const batches = AppState.get('batches') || [];
    let affected  = 0;

    const lds  = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const pld  = s => { const p = s.split('-'); return new Date(+p[0], +p[1]-1, +p[2]); };
    const addD = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

    for (const batchId of Object.keys(all)) {
      const lpa   = all[batchId];
      const batch = batches.find(b => b.id === batchId);
      if (!batch) continue;

      const workDays   = lpa.workDays || [1, 2, 3, 4, 5];
      const rowsPerDay = Math.max(1, Math.round((lpa.hoursPerDay || 1.5) / 0.5));
      const holidays   = new Set(getHolidaysForBatch(batchId));

      const isWork    = d => workDays.includes(d.getDay());
      const isBlocked = d => !isWork(d) || holidays.has(lds(d));

      let rows    = [...lpa.rows];
      let changed = false;

      for (const removedDate of removedDates) {
        const rd = pld(removedDate);
        if (!isWork(rd)) continue;  // still blocked (weekend) — nothing to do

        // ── CASE 1: rows were packed onto next workday by fixBatch ───────
        // Detect: removedDate empty AND next workday has MORE than rowsPerDay rows
        let nextDay = addD(rd, 1);
        let g = 0;
        while (isBlocked(nextDay) && g < 60) { nextDay = addD(nextDay, 1); g++; }
        const nextDayStr = lds(nextDay);

        const onRemoved = rows.filter(r => r.status !== 'Done' && r.type !== 'Holiday' && r.date === removedDate);
        const onNext    = rows.filter(r => r.status !== 'Done' && r.type !== 'Holiday' && r.date === nextDayStr);

        if (onRemoved.length === 0 && onNext.length > rowsPerDay) {
          // Move excess rows back to removedDate
          const toMove  = onNext.slice(rowsPerDay);
          const moveIds = new Set(toMove.map(r => r.id));
          rows    = rows.map(r => moveIds.has(r.id) ? { ...r, date: removedDate } : r);
          changed = true;
          continue;
        }

        // ── CASE 2: removedDate was skipped at generation time ───────────
        // Gap-fill: walk forward from removedDate and for every empty workday,
        // pull rowsPerDay rows from the next populated workday into it.
        // This repairs ALL the gaps created when holiday deletion reveals
        // a chain of skipped dates.
        if (onRemoved.length === 0 && onNext.length > 0) {
          // Build a date-map for quick lookup: dateStr → [rows]
          // IMPORTANT: store original row objects (no date mutation inside dateMap)
          const dateMap = {};
          rows.forEach(r => {
            if (r.status === 'Done' || r.type === 'Holiday' || !r.date) return;
            if (!dateMap[r.date]) dateMap[r.date] = [];
            dateMap[r.date].push(r);
          });

          // Track new date for each moved row ID — set ONCE, never overwrite
          // This prevents the same row being registered twice when multiple
          // removedDates are processed in the same batch loop iteration.
          const updatedDates = {};

          // Find the last date that has any pending rows
          const allDates = Object.keys(dateMap).sort();
          if (!allDates.length) continue;
          const lastDate = allDates[allDates.length - 1];

          // Walk from removedDate to lastDate, fill any empty workday
          let cur = pld(removedDate);
          const lastD = pld(lastDate);
          let fillGuard = 0;

          while (lds(cur) <= lds(lastD) && fillGuard < 500) {
            fillGuard++;
            const curStr = lds(cur);

            if (isBlocked(cur)) { cur = addD(cur, 1); continue; }

            const here = (dateMap[curStr] || []).filter(r => r.status !== 'Done' && r.type !== 'Holiday');

            if (here.length < rowsPerDay) {
              // This workday is empty or underfilled — find next populated workday
              const need = rowsPerDay - here.length;
              let donor = addD(cur, 1);
              let dg = 0;
              while (dg < 60) {
                const donorStr = lds(donor);
                if (donorStr > lds(lastD)) break;
                const there = (dateMap[donorStr] || []).filter(r => r.status !== 'Done' && r.type !== 'Holiday');
                if (there.length > 0) {
                  // Pull up to `need` rows from donor into cur
                  const pulling = there.slice(0, need);
                  pulling.forEach(r => {
                    // FIX 1: Only register a row's new date ONCE — first assignment wins.
                    // If a row ID was already moved by a previous removedDate iteration,
                    // do NOT overwrite it here (last-write-wins caused wrong hours totals).
                    if (!(r.id in updatedDates)) {
                      updatedDates[r.id] = curStr;
                    }
                    // Remove from donor in dateMap (use original r, not a mutated copy)
                    dateMap[donorStr] = dateMap[donorStr].filter(x => x.id !== r.id);
                    // Add to cur in dateMap — keep original r object, date tracked separately
                    if (!dateMap[curStr]) dateMap[curStr] = [];
                    dateMap[curStr].push(r);
                  });
                  changed = true;
                  break;
                }
                donor = addD(donor, 1);
                dg++;
              }
            }
            cur = addD(cur, 1);
          }

          if (changed) {
            // FIX 2: Apply updatedDates to the rows array.
            // Only rows whose ID appears in updatedDates AND whose current date
            // differs from the new target date are touched — all other rows stay
            // exactly as they are. This prevents accidental hours/topic mutations.
            rows = rows.map(r => {
              const newDate = updatedDates[r.id];
              if (!newDate || newDate === r.date) return r;   // FIX 3: skip unchanged rows
              return { ...r, date: newDate };                  // only date changes, never hours/topic
            });
          }
          continue;
        }
      }

      if (changed) {
        rows.sort((a, b) => {
          if (!a.date && !b.date) return 0;
          if (!a.date) return 1;
          if (!b.date) return -1;
          return a.date.localeCompare(b.date);
        });
        all[batchId].rows = rows;
        affected++;
      }
    }

    if (affected > 0) saveAllAssignments(all);
    return { affected };
  },

  // ── Fix one batch ─────────────────────────────────────────
  // For every pending row whose date falls on a holiday,
  // shift ONLY that row's date to the next available workday.
  // Original row order is fully preserved — no sorting at all.
  // Topics, types, hours, remarks — nothing changes.
  fixBatch(batchId) {
    const all = getAllAssignments();
    const lpa = all[batchId];
    if (!lpa) return { success: false, message: 'Assignment not found.' };

    const holidays    = new Set(getHolidaysForBatch(batchId));
    const workDays    = lpa.workDays    || [1, 2, 3, 4, 5];
    const hoursPerDay = lpa.hoursPerDay || 1.5;
    // How many 0.5-hr lecture slots fit in one day
    const rowsPerDay  = Math.max(1, Math.round(hoursPerDay / 0.5));

    // Timezone-safe helpers
    const lds  = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const pld  = s => { const [y,m,d] = s.split('-'); return new Date(+y, +m-1, +d); };
    const addD = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
    const isWork    = d => workDays.includes(d.getDay());
    const isBlocked = d => !isWork(d) || holidays.has(lds(d));

    // Next valid workday after a given Date object
    const nextWorkDay = (fromDate) => {
      let d = addD(fromDate, 1);
      let guard = 0;
      while (isBlocked(d) && guard++ < 800) d = addD(d, 1);
      return d;
    };

    // ── Separate untouchable rows from pending rows ───────────────
    const doneOrHoliday = lpa.rows.filter(r =>
      r.status === 'Done' || r.type === 'Holiday' || !r.date
    );
    let pending = lpa.rows.filter(r =>
      r.status !== 'Done' && r.type !== 'Holiday' && r.date
    );

    // Sort pending by existing date to preserve original order
    pending.sort((a, b) => a.date.localeCompare(b.date));

    // ── Find first pending row that sits on a holiday ─────────────
    const firstAffected = pending.find(r => holidays.has(r.date));
    if (!firstAffected) {
      return { success: true, shifted: 0 };
    }

    // Rows before the first affected date: keep as-is
    const untouched = pending.filter(r => r.date < firstAffected.date);
    const toRepack  = pending.filter(r => r.date >= firstAffected.date);

    // ── Repack rows respecting rowsPerDay capacity ────────────────
    // Walk forward from firstAffected.date, filling each valid slot:
    //   - Lecture/Other: up to rowsPerDay per day
    //   - Test/Mock/Midterm/Revision: one per day (block row)
    let cur        = pld(firstAffected.date);
    while (isBlocked(cur)) cur = addD(cur, 1);

    let slotFilled = 0;
    const repacked = [];

    for (const r of toRepack) {
      const rowType = (r.type || 'Lecture').toLowerCase();
      const isBlock = rowType === 'test'     || rowType === 'midterm' ||
                      rowType === 'mock'     || rowType === 'revision';

      if (isBlock) {
        // Block row takes whole day — advance if today already has rows
        if (slotFilled > 0) { cur = nextWorkDay(cur); slotFilled = 0; }
        while (isBlocked(cur)) { cur = addD(cur, 1); }
        repacked.push({ ...r, date: lds(cur) });
        cur = nextWorkDay(cur);
        slotFilled = 0;
      } else {
        // Lecture/Other — fill up to rowsPerDay per day
        if (slotFilled >= rowsPerDay) {
          cur = nextWorkDay(cur);
          slotFilled = 0;
        }
        while (isBlocked(cur)) { cur = addD(cur, 1); slotFilled = 0; }
        repacked.push({ ...r, date: lds(cur) });
        slotFilled++;
      }
    }

    // ── Merge & stable-sort ───────────────────────────────────────
    const allFixed = [...doneOrHoliday, ...untouched, ...repacked];
    allFixed.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });

    const shiftedCount = repacked.filter((r, i) => r.date !== toRepack[i]?.date).length;

    all[batchId].rows = allFixed;
    saveAllAssignments(all);

    // Remove notif for this batch
    const notifs = this.getNotifs();
    delete notifs[batchId];
    this.saveNotifs(notifs);

    return { success: true, shifted: shiftedCount };
  },

  // ── Sort rows of one batch by date (one-time repair) ─────
  // Use this to fix any existing assignment whose rows are out of
  // chronological order (e.g. after a previous buggy holiday fix).
  // Done rows, undated rows, and topic/hours/status are never touched —
  // only the position of rows in the array changes.
  sortBatchRows(batchId) {
    const all = getAllAssignments();
    const lpa = all[batchId];
    if (!lpa) return { success: false, message: 'Assignment not found.' };

    const before = JSON.stringify(lpa.rows.map(r => r.id));

    lpa.rows.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });

    const after = JSON.stringify(lpa.rows.map(r => r.id));
    if (before === after) return { success: true, changed: false };

    all[batchId] = lpa;
    saveAllAssignments(all);
    return { success: true, changed: true };
  },

  // ── Sort rows of ALL batches (bulk one-time repair) ───────
  sortAllBatchRows() {
    const all = getAllAssignments();
    let changed = 0;
    for (const batchId of Object.keys(all)) {
      const r = this.sortBatchRows(batchId);
      if (r.success && r.changed) changed++;
    }
    return { success: true, changed };
  },

  // ── Fix all non-excluded batches ──────────────────────────
  fixAll() {
    const notifs  = this.getNotifs();
    const toFix   = Object.keys(notifs).filter(id => !notifs[id].excluded);
    let fixed = 0;
    toFix.forEach(batchId => {
      const r = this.fixBatch(batchId);
      if (r.success) fixed++;
    });
    return { fixed, total: toFix.length };
  },

  // ── Exclude a batch from notifications ────────────────────
  excludeBatch(batchId) {
    const notifs = this.getNotifs();
    if (notifs[batchId]) {
      notifs[batchId].excluded = true;
      this.saveNotifs(notifs);
    }
  },

  // ── Re-include a batch ────────────────────────────────────
  includeBatch(batchId) {
    const notifs = this.getNotifs();
    if (notifs[batchId]) {
      notifs[batchId].excluded = false;
      this.saveNotifs(notifs);
    }
  },

  // ── Clear all notifications ───────────────────────────────
  clearAll() {
    this.saveNotifs({});
  },

  // ── Active (non-excluded) count ───────────────────────────
  activeCount() {
    const notifs = this.getNotifs();
    return Object.values(notifs).filter(n => !n.excluded).length;
  },

  // ── REPAIR: Restore Holiday rows by matching row.id → master LP row ──
  //
  // Assignment rows keep the same `id` as their master LP row.
  // So for each assignment row where type='Holiday' AND remarks is non-empty:
  //   1. Look up master LP rows via lpa.lpId
  //   2. Find master row whose id === assignment row.id
  //   3. Restore topic, type, hours EXACTLY from that master row
  //   4. Clear remarks
  //
  // Row ORDER is never changed — rows are mapped in place.
  // dryRun=true → preview only, nothing saved.
  //
  revertHolidayRemarksToTopic(dryRun = false) {
    const all        = getAllAssignments();
    let totalFixed   = 0;
    const batchSummary = [];

    for (const batchId of Object.keys(all)) {
      const lpa        = all[batchId];
      const masterRows = getLPRows(lpa.lpId || '');

      // Build a quick lookup: master row id → row object
      const masterById = {};
      masterRows.forEach(mr => { masterById[mr.id] = mr; });

      let batchFixed = 0;
      const detail   = [];

      // ── map in place — NO sort, NO reorder ──────────────────
      const newRows = lpa.rows.map(r => {
        const isHolidayType = (r.type || '').toLowerCase() === 'holiday';
        const hasRemarks    = (r.remarks || '').trim() !== '';

        if (!isHolidayType || !hasRemarks) return r;

        // Find master row by id
        const master = masterById[r.id];

        batchFixed++;
        detail.push({
          rowId:       r.id,
          remarks:     r.remarks,
          masterFound: !!master,
          masterTopic: master?.topic || null,
        });

        if (dryRun) return r;

        if (master) {
          // Exact restore from master LP
          return {
            ...r,
            topic:   master.topic,
            type:    master.type   || autoDetectType(master.topic),
            hours:   master.hours  != null ? master.hours : r.hours,
            remarks: '',
          };
        } else {
          // Master row not found (revision row or manually added) —
          // fall back: put remarks text as topic, auto-detect type
          return {
            ...r,
            topic:   r.remarks.trim(),
            type:    autoDetectType(r.remarks.trim()),
            remarks: '',
          };
        }
      });

      if (batchFixed > 0) {
        totalFixed += batchFixed;
        batchSummary.push({
          batchId,
          batchName:     lpa.lpTitle || lpa.lpCode || batchId,
          lpId:          lpa.lpId,
          lpCode:        lpa.lpCode,
          rowsFixed:     batchFixed,
          masterMatched: detail.filter(d => d.masterFound).length,
          fallback:      detail.filter(d => !d.masterFound).length,
          detail,
        });

        if (!dryRun) {
          all[batchId].rows = newRows;
        }
      }
    }

    if (!dryRun && totalFixed > 0) {
      saveAllAssignments(all);
    }

    return {
      success:  totalFixed > 0,
      dryRun,
      fixed:    totalFixed,
      batches:  batchSummary,
      message:  totalFixed > 0
        ? `${dryRun ? '[DRY RUN] Would repair' : 'Repaired'} ${totalFixed} row(s) across ${batchSummary.length} batch(es).`
        : 'No rows needed repair — no Holiday rows with topics in remarks found.',
    };
  },
};
