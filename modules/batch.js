// ============================================================
// modules/batch.js — Batch Management Module (CRUD)
// v5: Snapshot strategy + Change Impact Management added
//
// KEY CHANGES FROM v4:
//   - _buildBatchObject() helper — all saves now include snapshot
//     fields (disciplineName, disciplineAbbr, campusName,
//     levelName, subjectName, subjectCode) frozen at creation time
//   - Table columns prefer snapshot over live lookup (historical safety)
//   - Export builder prefers snapshots (accurate historical reports)
//   - Hierarchy edit (campus/discipline/level) now calls ChangeManager
//     before writing — user sees impact + chooses mode
//   - batchImpact.js handlers applied after hierarchy edits
//   - Bulk import also uses _buildBatchObject() for consistency
//
// KEY CHANGES FROM v3:
//   - Bulk Import button added to toolbar
//   - CSV upload with preview, error reporting, and auto batch-name
//   - Campus matched by abbreviation (Pr, Pt, St, F8 etc.)
//   - Teacher matched by full name
//   - No fee field
//
// KEY CHANGES FROM v2:
//   - buildBatchName now uses subjectCode (e.g. FA1) as prefix
//   - Falls back to discipline abbreviation if no subject selected
//   - Batch name auto-updates on subject change
//   - Modal body is scrollable (max-height:70vh) — no more clipping
// ============================================================

import { AppState, generateID } from '../utils/state.js';
import { Modal, Table, Form, injectUIStyles } from '../utils/ui.js';
import { Toast } from '../utils/helpers.js';
import { Auth } from '../utils/auth.js';
import { getAssignmentForBatch } from './lecturePlan/lecturePlanService.js';
import { ChangeManager } from '../utils/changeManager.js';
import {
  applyCampusImpact,
  applyDisciplineImpact,
  applyLevelImpact,
} from './batchImpact.js';
import { BatchPlanningTab } from './Batch Planning.js';

const KEY = 'batches';

// ══════════════════════════════════════════════════════════════
// BULK IMPORT — CSV helpers
// ══════════════════════════════════════════════════════════════

// Match campus by abbreviation (Pr, Pt, St, F8 etc.)
function _bi_findCampusByAbbr(abbr) {
  if (!abbr) return null;
  const campuses = AppState.get('campuses') || [];
  const needle = abbr.trim().toLowerCase();
  return campuses.find(c => {
    if (c.abbreviation && c.abbreviation.trim().toLowerCase() === needle) return true;
    const short = (c.campusName || '').replace(/\s*campus$/i, '').trim().toLowerCase();
    return short === needle;
  }) || null;
}

function _bi_findDiscipline(name) {
  if (!name) return null;
  const disciplines = AppState.get('disciplines') || [];
  const needle = name.trim().toLowerCase();
  return disciplines.find(d =>
    (d.fullName     || '').toLowerCase() === needle ||
    (d.abbreviation || '').toLowerCase() === needle
  ) || null;
}

function _bi_findLevel(name) {
  if (!name) return null;
  const levels = AppState.get('levels') || [];
  const needle = name.trim().toLowerCase();
  return levels.find(l => (l.levelName || '').toLowerCase() === needle) || null;
}

function _bi_findSubjectByCode(code) {
  if (!code) return null;
  const subjects = AppState.get('subjects') || [];
  const needle = code.trim().toLowerCase();
  return subjects.find(s => (s.subjectCode || '').toLowerCase() === needle) || null;
}

function _bi_findTeacherByName(name) {
  if (!name) return null;
  const teachers = (AppState.get('teachers') || []).filter(t => t.isActive !== false);
  const needle = name.trim().toLowerCase();
  return teachers.find(t => (t.fullName || '').toLowerCase() === needle) || null;
}

function _bi_getNextBatchNo(sessionPeriod, subjectId, campusId, alreadyAdded = []) {
  const existing = AppState.get(KEY) || [];
  const all = [...existing, ...alreadyAdded];
  const relevant = all.filter(b =>
    b.sessionPeriod === sessionPeriod &&
    (b.subjectId || null) === (subjectId || null) &&
    (b.campusId  || null) === (campusId  || null)
  );
  const maxNo = relevant.reduce((max, b) => Math.max(max, parseInt(b.batchNo) || 0), 0);
  return maxNo + 1;
}

function _bi_parseCSV(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map((line, i) => {
    const cols = [];
    let cur = ''; let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    cols.push(cur.trim());
    const row = { _line: i + 2 };
    headers.forEach((h, idx) => { row[h] = cols[idx] || ''; });
    return row;
  });
}

// Normalize sessionPeriod to exact system format: Dec-YY or June-YY
// Accepts: Dec-25, dec-25, 26-Dec, DEC-26, June-26, JUNE-26, 26-June etc.
// Also accepts full year: Dec-2025 → Dec-25
function _bi_normalizeSession(raw) {
  if (!raw) return null;
  const s = raw.trim();

  // Split on dash
  const parts = s.split('-');
  if (parts.length !== 2) return null;

  let [a, b] = parts;
  a = a.trim(); b = b.trim();

  // Determine which part is month-name and which is year
  let monthPart, yearPart;
  if (/^\d+$/.test(a) && /[a-zA-Z]/.test(b)) {
    // format: 26-Dec  or  2025-Dec
    monthPart = b; yearPart = a;
  } else if (/[a-zA-Z]/.test(a) && /^\d+$/.test(b)) {
    // format: Dec-26  or  Dec-2025
    monthPart = a; yearPart = b;
  } else {
    return null;
  }

  // Normalize year to 2-digit
  const yy = yearPart.length === 4 ? yearPart.slice(2) : yearPart.padStart(2, '0');

  // Normalize month name
  const m = monthPart.toLowerCase();
  if (m === 'dec' || m === 'december')  return `Dec-${yy}`;
  if (m === 'june' || m === 'jun')      return `June-${yy}`;
  return null;
}

// Derive sessionPeriod from startDate (same logic as main module)
// Jul-Dec of year Y → Dec-YY,  Jan-Jun → June-YY
function _bi_sessionFromDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  const y = parseInt(parts[0]); const m = parseInt(parts[1]);
  if (!y || !m) return null;
  const yy = String(y).slice(2);
  if (m >= 7) return `Dec-${yy}`;
  return `June-${yy}`;
}

function _bi_processCSV(csvText) {
  const rows = _bi_parseCSV(csvText);
  if (!rows.length) return { success: [], errors: [{ line: '-', msg: 'CSV is empty or has no data rows.' }] };

  const success = [];
  const errors  = [];
  const alreadyAdded = [];

  rows.forEach(row => {
    const line = row._line;

    const discipline = _bi_findDiscipline(row.disciplineName);
    if (!discipline) { errors.push({ line, msg: `Discipline not found: "${row.disciplineName}"` }); return; }

    const campus = _bi_findCampusByAbbr(row.campusAbbr);
    if (!campus) { errors.push({ line, msg: `Campus not found for abbreviation: "${row.campusAbbr}"` }); return; }

    const level = _bi_findLevel(row.levelName);
    if (!level) { errors.push({ line, msg: `Level not found: "${row.levelName}"` }); return; }

    // ── startDate / endDate (needed before sessionPeriod derivation) ──
    const startDate = row.startDate?.trim();
    const endDate   = row.endDate?.trim();
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      errors.push({ line, msg: `Invalid startDate: "${row.startDate}". Use YYYY-MM-DD format.` }); return;
    }
    if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      errors.push({ line, msg: `Invalid endDate: "${row.endDate}". Use YYYY-MM-DD format.` }); return;
    }
    if (endDate < startDate) {
      errors.push({ line, msg: `endDate (${endDate}) cannot be before startDate (${startDate}).` }); return;
    }

    // ── sessionPeriod: normalize CSV value OR auto-detect from startDate ──
    let sessionPeriod = null;
    if (row.sessionPeriod?.trim()) {
      sessionPeriod = _bi_normalizeSession(row.sessionPeriod);
      if (!sessionPeriod) {
        errors.push({ line, msg: `Invalid sessionPeriod format: "${row.sessionPeriod}". Use Dec-25 or June-26.` }); return;
      }
    } else {
      // Auto-detect from startDate
      sessionPeriod = _bi_sessionFromDate(startDate);
      if (!sessionPeriod) {
        errors.push({ line, msg: `Could not detect session from startDate "${startDate}". Please provide sessionPeriod column.` }); return;
      }
    }

    const subject   = _bi_findSubjectByCode(row.subjectCode);
    const subjectId = subject?.id || null;

    let teacherId = '', teacherName = '', teachersArr = [];
    if (row.teacherName?.trim()) {
      const teacher = _bi_findTeacherByName(row.teacherName);
      if (teacher) {
        teacherId   = teacher.id;
        teacherName = teacher.fullName;
        teachersArr = [{ teacherId, teacherName, fromDate: startDate, toDate: '', isActive: true }];
      } else {
        errors.push({ line, msg: `⚠ Teacher "${row.teacherName}" not found in system. Stored as name-only.`, warn: true });
        teacherName = row.teacherName.trim();
      }
    }

    // batchNo — use CSV value if provided, otherwise auto
    const csvBatchNo = row.batchNo ? parseInt(row.batchNo) : NaN;
    const batchNo    = (!isNaN(csvBatchNo) && csvBatchNo > 0)
      ? csvBatchNo
      : _bi_getNextBatchNo(sessionPeriod, subjectId, campus.id, alreadyAdded);

    const prefix    = subject?.subjectCode || row.subjectCode?.trim() || discipline.abbreviation;
    const batchName = `${prefix.toUpperCase()}-${sessionPeriod}-${fmt2(batchNo)}`;

    const allBatches = AppState.get(KEY) || [];
    const isDuplicate = [...allBatches, ...alreadyAdded].some(b =>
      b.sessionPeriod === sessionPeriod &&
      (b.subjectId || null) === subjectId &&
      (b.campusId  || null) === campus.id &&
      (parseInt(b.batchNo) || 1) === batchNo
    );
    if (isDuplicate) {
      errors.push({ line, msg: `Duplicate: Batch #${fmt2(batchNo)} already exists for "${batchName}" in session "${sessionPeriod}".` }); return;
    }

    // _buildBatchObject captures snapshot fields alongside ids.
    // If discipline/campus/level/subject is renamed later, this
    // batch record keeps its original names frozen in history.
    const batch = _buildBatchObject({
      id:          generateID('batch'),
      discipline,
      campus,
      level,
      subject,
      teacherId,
      teacherName,
      teachersArr,
      batchName,
      batchNo,
      sessionPeriod,
      startDate,
      endDate,
      maxStudents: row.totalSeats ? parseInt(row.totalSeats) : null,
      endDateMode: 'manual',
      status:      'active',
    });

    alreadyAdded.push(batch);
    success.push(batch);
  });

  return { success, errors };
}

// ── Session generator ─────────────────────────────────────────
function generateSessions() {
  const sessions = [];
  const y0 = new Date().getFullYear();
  for (let y = y0 - 1; y <= y0 + 2; y++) {
    const ys = String(y).slice(2);
    const yn = String(y + 1).slice(2);
    sessions.push({
      value: `Dec-${ys}`,
      label: `Dec-${ys}  (Jul ${y} — Dec ${y})`,
      startDate: `${y}-07-01`,
      endDate:   `${y}-12-31`,
    });
    sessions.push({
      value: `June-${yn}`,
      label: `June-${yn}  (Jan ${y + 1} — Jun ${y + 1})`,
      startDate: `${y + 1}-01-01`,
      endDate:   `${y + 1}-06-30`,
    });
  }
  return sessions;
}

function getNextBatchNo(sessionPeriod, subjectId, campusId) {
  // Use strict null-equality for both subjectId and campusId so this
  // matches the same uniqueness scope as the duplicate-check in
  // _handleSave() and _bi_getNextBatchNo() in bulk import.
  // Previously, passing no subjectId caused ALL batches in the session
  // to be counted regardless of subject, producing wrong auto-numbers.
  const batches = AppState.get(KEY) || [];
  const sid = subjectId || null;
  const cid = campusId  || null;
  const relevant = batches.filter(b =>
    b.sessionPeriod === sessionPeriod &&
    (b.subjectId || null) === sid &&
    (b.campusId  || null) === cid
  );
  const maxNo = relevant.reduce((max, b) => Math.max(max, parseInt(b.batchNo) || 0), 0);
  return maxNo + 1;
}

// ── Date helpers ───────────────────────────────────────────────
function getDaysInMonth(year, month) {
  // month is 1-based
  return new Date(year, month, 0).getDate();
}

// Given a date string YYYY-MM-DD, detect session:
//   Jul–Dec of year Y → Dec-YY  (e.g. 2025-09-01 → Dec-25)
//   Jan–Jun of year Y → June-YY (e.g. 2026-04-01 → June-26)
function detectSessionFromDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  const y = parseInt(parts[0]); const m = parseInt(parts[1]);
  if (!y || !m) return '';
  const yy = String(y).slice(2);
  if (m >= 7)  return 'Dec-' + yy;
  if (m >= 1)  return 'June-' + yy;
  return '';
}

function getSessionLabel(sv) {
  if (!sv) return '';
  const parts = sv.split('-'); const name = parts[0]; const yy = parseInt(parts[1]);
  const y = 2000 + yy;
  if (name === 'Dec')  return 'Jul ' + y + ' — Dec ' + y;
  if (name === 'June') return 'Jan ' + y + ' — Jun ' + y;
  return '';
}

// Build YYYY-MM-DD from year/month/day parts
function buildDateStr(year, month, day) {
  if (!year || !month || !day) return '';
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

function fmt2(n) { return String(n).padStart(2, '0'); }

// ── _buildBatchObject ─────────────────────────────────────────
// Central factory for batch records.
// Stores BOTH ids (for live lookups) AND name snapshots (for
// historical accuracy when master data is renamed/deleted).
// Every code path that creates or updates a batch MUST use this.
function _buildBatchObject({
  id,
  discipline, campus, level, subject,
  teacherId, teacherName, teachersArr,
  batchName, batchNo, sessionPeriod,
  startDate, endDate, maxStudents, endDateMode,
  status,
}) {
  const obj = {
    // ── Operational fields
    batchName:     batchName || '',
    batchNo:       batchNo   || 1,
    sessionPeriod: sessionPeriod || '',

    // ── Master IDs (for live lookups, filtering, relations)
    disciplineId:  discipline?.id  || null,
    campusId:      campus?.id      || null,
    levelId:       level?.id       || null,

    // ── SNAPSHOT FIELDS ──────────────────────────────────────
    // Frozen at creation time. UI prefers these over live lookups
    // so historical records are never affected by master renames.
    disciplineName: discipline?.fullName     || '',
    disciplineAbbr: discipline?.abbreviation || '',
    campusName:     campus?.campusName       || '',
    levelName:      level?.levelName         || '',
    subjectName:    subject?.subjectName     || '',
    subjectCode:    subject?.subjectCode     || '',
    // ─────────────────────────────────────────────────────────

    // ── Teacher (already mixed strategy — id + name)
    teacherId:   teacherId   || '',
    teacherName: teacherName || '',
    teachers:    teachersArr || [],

    // ── Dates
    // Only include if truthy — empty string in a patch would silently
    // overwrite the existing saved date via AppState.update({ ...item, ...patch })
    ...(startDate ? { startDate } : {}),
    ...(endDate   ? { endDate }   : {}),
    endDateMode: endDateMode || 'lp',

    // ── Status
    status: status || 'active',
  };

  // subjectId is optional (multi-subject batches have none)
  if (subject?.id) obj.subjectId = subject.id;

  // maxStudents is optional
  if (maxStudents) obj.maxStudents = maxStudents;

  // id is only set when creating a new record (not on update patches)
  if (id) obj.id = id;

  return obj;
}

// ── Duration calculator ───────────────────────────────────────
// Returns "X M Y D" string from two YYYY-MM-DD date strings
// Returns null if either date is missing
function calcDuration(startStr, endStr) {
  if (!startStr || !endStr) return null;
  const s = new Date(startStr);
  const e = new Date(endStr);
  if (isNaN(s) || isNaN(e) || e < s) return null;
  // Make end date inclusive (add 1 day)
  e.setDate(e.getDate() + 1);

  let years  = e.getFullYear() - s.getFullYear();
  let months = e.getMonth()    - s.getMonth();
  let days   = e.getDate()     - s.getDate();

  if (days < 0) {
    months--;
    // Days in the month before end date
    const prevMonth = new Date(e.getFullYear(), e.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }

  const totalMonths = years * 12 + months;
  if (totalMonths === 0 && days === 0) return '0 D';
  const parts = [];
  if (totalMonths > 0) parts.push(`${totalMonths} M`);
  if (days > 0)        parts.push(`${days} D`);
  return parts.join(' ');
}

function buildBatchName(subjectId, disciplineId, sessionPeriod, batchNo, frozenSubjectCode) {
  // On edit: use frozen snapshot code — never re-derive from live master
  // (master may have been renamed after batch was created)
  if (frozenSubjectCode) return `${frozenSubjectCode}-${sessionPeriod}-${fmt2(batchNo)}`;
  if (subjectId) {
    const s = AppState.findById('subjects', subjectId);
    if (s?.subjectCode) return `${s.subjectCode}-${sessionPeriod}-${fmt2(batchNo)}`;
  }
  const d = AppState.findById('disciplines', disciplineId);
  return `${d ? d.abbreviation : 'XX'}-${sessionPeriod}-${fmt2(batchNo)}`;
}

// ── Teacher resolution ────────────────────────────────────────
// Returns teacher object or null — handles deleted teachers
function resolveTeacher(teacherId) {
  if (!teacherId) return null;
  return AppState.findById('teachers', teacherId) || null;
}

// ── Get active teacher from a batch ─────────────────────────
function getActiveTeacher(row) {
  // New multi-teacher system: teachers array with active flag
  if (row.teachers && row.teachers.length) {
    const active = row.teachers.find(t => t.isActive);
    return active ? resolveTeacher(active.teacherId) : null;
  }
  // Legacy single teacher
  if (row.teacherId) return resolveTeacher(row.teacherId);
  return null;
}

// Render teacher cell — shows active teacher + multi-teacher badge
function teacherCellHTML(row) {
  const multiCount = row.teachers?.length || 0;
  // Always re-derive active teacher from teachers array isActive flag.
  // Also keep row.teacherId in sync so legacy paths stay correct.
  if (row.teachers && row.teachers.length) {
    const activeEntry = row.teachers.find(t => t.isActive);
    if (activeEntry) {
      row.teacherId   = activeEntry.teacherId;
      row.teacherName = activeEntry.teacherName || '';
    }
  }
  const activeTeacher = getActiveTeacher(row);

  if (activeTeacher) {
    const initials = activeTeacher.fullName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const multiBadge = multiCount > 1
      ? `<span style="font-size:9.5px;font-weight:700;background:var(--blue-dim);color:var(--blue);
                      padding:1px 6px;border-radius:8px;margin-left:4px">${multiCount} teachers</span>`
      : '';
    return `
      <div style="display:flex;align-items:center;gap:7px">
        <div style="width:24px;height:24px;border-radius:50%;background:var(--blue-dim);
             color:var(--blue);display:flex;align-items:center;justify-content:center;
             font-size:9px;font-weight:700;flex-shrink:0">${initials}</div>
        <div>
          <div style="font-size:12.5px;color:var(--t1);font-weight:500">
            ${activeTeacher.fullName}${multiBadge}
          </div>
          <div style="font-size:10.5px;color:var(--t3)">${activeTeacher.qualification || ''}</div>
        </div>
      </div>`;
  }
  // Deleted teacher warning
  if ((row.teachers?.length || 0) > 0 || row.teacherId) {
    return `<span style="font-size:11.5px;background:var(--yellow-dim);color:var(--yellow);
             padding:2px 8px;border-radius:10px;font-weight:600">⚠ Teacher Removed</span>`;
  }
  // Legacy name fallback
  if (row.teacherName) {
    return `<span style="color:var(--t2);font-size:12.5px">${row.teacherName}</span>`;
  }
  return '<span style="color:var(--t4)">—</span>';
}

// ── Smart teacher filter ──────────────────────────────────────
// Returns teachers that match selected discipline AND campus
// Falls back gracefully if no teachers registered yet
function getFilteredTeachers(disciplineId, campusId) {
  const all = (AppState.get('teachers') || []).filter(t => t.isActive !== false);

  if (!all.length) return { teachers: [], reason: 'no_teachers' };

  let filtered = all;

  if (disciplineId) {
    filtered = filtered.filter(t =>
      !t.disciplines?.length || t.disciplines.includes(disciplineId)
    );
  }

  if (campusId) {
    filtered = filtered.filter(t =>
      !t.campuses?.length || t.campuses.includes(campusId)
    );
  }

  return { teachers: filtered, reason: filtered.length ? 'ok' : 'no_match' };
}

// Build teacher <option> HTML for a given discipline + campus
function buildTeacherOptions(disciplineId, campusId, selectedId = '') {
  const { teachers, reason } = getFilteredTeachers(disciplineId, campusId);

  if (reason === 'no_teachers') {
    return `<option value="">Please add a teacher in the Teachers module first</option>`;
  }
  if (reason === 'no_match') {
    return `<option value="">No teacher found for this discipline/campus</option>`;
  }

  return `<option value="">Select a teacher…</option>` +
    teachers.map(t =>
      `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>
        ${t.fullName}${t.qualification ? ` — ${t.qualification}` : ''}
      </option>`
    ).join('');
}

// ── Module export ─────────────────────────────────────────────
export const BatchModule = {

  mount(container) {
    injectUIStyles();
    this._injectTabStyles();
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    el.innerHTML = this._shellTemplate();
    this._attachTabSwitcher(el);
    // Defer until AppState.loadAll() is guaranteed complete — fixes "get() before loadAll()" warning
    const doMount = () => {
      this._migrateSnapshots(); // backfill missing snapshot fields silently
      if (Auth.can('batches:management') || Auth.can('batches')) {
        this._mountTab(el, 'management');
      }
    };
    if (typeof AppState.ready === 'function') {
      AppState.ready().then(doMount).catch(doMount);
    } else if (typeof AppState.loadAll === 'function') {
      Promise.resolve(AppState.loadAll()).then(doMount).catch(doMount);
    } else {
      requestAnimationFrame(doMount);
    }
  },



  // ── Switch tab content ───────────────────────────────────────
  _mountTab(el, tab = 'management') {
    const body = el.querySelector('#batchTabBody');
    if (!body) return;
    if (tab === 'planning') {
      this._mountPlanningTab(body);
    } else {
      body.innerHTML = this._pageTemplate();
      this._attachToolbar(el);
      requestAnimationFrame(() => { this._render(el); });
    }
  },

  // ── Batch Planning tab ───────────────────────────────────────
  _mountPlanningTab(body) {
    BatchPlanningTab.mount(body);
  },

  // ── Wire tab buttons ─────────────────────────────────────────
  _attachTabSwitcher(el) {
    const bar = el.querySelector('#batchTabBar');
    if (!bar) return;
    bar.addEventListener('click', e => {
      const btn = e.target.closest('.batch-tab-btn');
      if (!btn) return;
      const tab = btn.dataset.tab;
      bar.querySelectorAll('.batch-tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      this._mountTab(el, tab);
    });
  },

  // ── Render table ────────────────────────────────────────────
  _render(container, filter = '', discFilter = [], campusFilter = [], sessionFilter = [], levelFilter = []) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    let rows = AppState.get(KEY) || [];

    if (discFilter.length)   rows = rows.filter(b => discFilter.includes(b.disciplineId));
    if (campusFilter.length)  rows = rows.filter(b => campusFilter.includes(b.campusId || ''));
    if (sessionFilter.length) rows = rows.filter(b => sessionFilter.includes(b.sessionPeriod || ''));
    if (levelFilter.length)   rows = rows.filter(b => levelFilter.includes(b.levelId || ''));
    if (filter) rows = rows.filter(b => {
      // Resolve teacher name for search
      const teacher = resolveTeacher(b.teacherId);
      const tName   = teacher?.fullName || b.teacherName || '';
      return (
        (b.batchName     || '').toLowerCase().includes(filter) ||
        tName.toLowerCase().includes(filter) ||
        (b.sessionPeriod || '').toLowerCase().includes(filter)
      );
    });

    // Sort: if level filter active → sort by level's order in AppState (same order as dropdown)
    //       otherwise → default: latest startDate first
    if (levelFilter.length) {
      const allLevels = AppState.get('levels') || [];
      const levelOrder = {};
      allLevels.forEach((l, i) => { levelOrder[l.id] = i; });
      rows = [...rows].sort((a, b) => {
        const ia = levelOrder[a.levelId] ?? 9999;
        const ib = levelOrder[b.levelId] ?? 9999;
        if (ia !== ib) return ia - ib;
        // same level → sort by batchName within that level
        return (a.batchName || '').localeCompare(b.batchName || '', undefined, { numeric: true, sensitivity: 'base' });
      });
    } else {
      rows = [...rows].sort((a, b) => {
        const da = a.startDate || '';
        const db = b.startDate || '';
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return db.localeCompare(da);
      });
    }

    // Store current filtered rows for export access
    el._filteredRows = rows;

    const countEl = el.querySelector('.record-count');
    if (countEl) countEl.textContent = `${rows.length} batch${rows.length !== 1 ? 'es' : ''}`;

    const canEdit   = Auth.can('batches:edit');
    const canDelete = Auth.can('batches:delete');
    const actions   = [];
    if (canEdit)   actions.push({ label: 'Edit',   icon: ICONS.edit,  handler: (row) => this._openForm(row, el) });
    if (canDelete) actions.push({ label: 'Delete', danger: true, icon: ICONS.trash, handler: (row) => this._delete(row, el) });

    Table.render(el.querySelector('#batch-table'), {
      columns: [
        { key: 'batchName',     label: 'Batch Name',  width: '170px',
          render: (v, row) => {
            // ── Stale snapshot warning ─────────────────────────────────────────
            // If this batch's frozen subjectCode differs from the current master
            // subject code, show an amber badge so admin knows the snapshot is
            // from an old subject name (can fix via Edit Batch → re-select subject).
            let staleBadge = '';
            if (row.subjectId && row.subjectCode) {
              const masterSubj = AppState.findById('subjects', row.subjectId);
              const masterCode = (masterSubj?.subjectCode || '').trim().toUpperCase();
              const snapCode   = (row.subjectCode || '').trim().toUpperCase();
              if (masterCode && snapCode && snapCode !== masterCode) {
                staleBadge = `<span title="Subject was renamed: ${snapCode} → ${masterCode}. Open Edit and re-save to refresh."
                  style="display:inline-flex;align-items:center;gap:3px;font-size:9.5px;font-weight:700;
                         color:#b45309;background:#fef3c7;padding:1px 6px;border-radius:8px;
                         border:1px solid #fcd34d;margin-left:5px;cursor:help;vertical-align:middle">
                  ⚠ ${snapCode}→${masterCode}
                </span>`;
              }
            }
            return `<span style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--t1)">${v}</span>${staleBadge}`;
          }
        },
        { key: 'sessionPeriod', label: 'Session',      width: '100px',
          render: (v) => v ? `<span class="badge badge--grey" style="font-family:var(--font-mono)">${v}</span>` : '—' },
        { key: 'batchNo',       label: '#',            width: '46px',
          render: (v) => `<span style="font-family:var(--font-mono);color:var(--t3);font-size:12px">${fmt2(v || 1)}</span>` },
        { key: 'disciplineId',  label: 'Discipline',   width: '120px',
          render: (id, row) => {
            // Prefer snapshot first — survives master renames
            const abbr = row.disciplineAbbr
              || AppState.findById('disciplines', id)?.abbreviation;
            return abbr
              ? `<span class="badge badge--blue" style="font-family:var(--font-mono);font-size:10.5px">${abbr}</span>`
              : '<span style="color:var(--t4)">—</span>';
          }
        },
        { key: 'levelId',       label: 'Level',        width: '110px',
          render: (id, row) => {
            const name = row.levelName
              || AppState.findById('levels', id)?.levelName;
            return name
              ? `<span style="color:var(--t2);font-size:12.5px">${name}</span>`
              : '<span style="color:var(--t4)">—</span>';
          }
        },
        { key: 'campusId', label: 'Campus', width: '70px',
          render: (id, row) => {
            // Prefer snapshot; live fallback for old records without snapshot
            const rawName = row.campusName
              || AppState.findById('campuses', id)?.campusName;
            if (!rawName) return '<span style="color:var(--t4)">—</span>';
            const short = rawName.replace(/\s*campus$/i, '').trim();
            return `<span class="badge badge--grey" style="font-family:var(--font-mono);font-size:10.5px">${short}</span>`;
          }
        },
        // Teacher column — resolves teacherId or falls back to teacherName
        { key: 'teacherId',     label: 'Teacher',      width: '180px',
          render: (_, row) => teacherCellHTML(row) },
        { key: 'startDate',     label: 'Start',        width: '100px',
          render: (v) => v ? `<span style="font-size:12px;color:var(--t3)">${v}</span>` : '<span style="color:var(--t4)">—</span>' },
        { key: 'endDate',       label: 'End',          width: '100px',
          render: (v, row) => {
            // If mode is LP, show live LP date (not stored snapshot)
            let displayDate = v;
            if (row.endDateMode === 'lp' || !row.endDateMode) {
              try {
                const assignment = getAssignmentForBatch(row.id);
                const datedRows  = (assignment?.rows || []).filter(r => r.date);
                if (datedRows.length) displayDate = datedRows[datedRows.length - 1].date;
              } catch(e) { /* no LP assigned */ }
            }
            return displayDate
              ? `<span style="font-size:12px;color:var(--t3)">${displayDate}</span>`
              : '<span style="color:var(--t4)">—</span>';
          }
        },
        { key: 'endDate',       label: 'Duration',     width: '100px',
          render: (_, row) => {
            // Duration also uses live LP date when mode is LP
            let effectiveEnd = row.endDate;
            if (row.endDateMode === 'lp' || !row.endDateMode) {
              try {
                const assignment = getAssignmentForBatch(row.id);
                const datedRows  = (assignment?.rows || []).filter(r => r.date);
                if (datedRows.length) effectiveEnd = datedRows[datedRows.length - 1].date;
              } catch(e) { /* no LP assigned */ }
            }
            const dur = calcDuration(row.startDate, effectiveEnd);
            if (!dur) return '<span style="color:var(--t4)">—</span>';
            return `<span style="font-family:var(--font-mono);font-size:11.5px;font-weight:600;
                      color:var(--blue);background:var(--blue-dim);
                      padding:2px 8px;border-radius:8px;white-space:nowrap">${dur}</span>`;
          }
        },
        { key: 'maxStudents',   label: 'Capacity',     width: '90px',
          render: (v) => v ? `<span style="color:var(--t2);font-size:12.5px">${v} seats</span>` : '<span style="color:var(--t4)">—</span>' },
      ],
      rows,
      emptyMsg: 'No batches found. Click "Add Batch" to create the first batch.',
      actions,
    });
  },

  // ── Add / Edit form ─────────────────────────────────────────
  _openForm(existing = null, container) {
    const isEdit      = !!existing;
    const disciplines = AppState.get('disciplines') || [];
    const allLevels   = AppState.get('levels')      || [];
    const allSubjects = AppState.get('subjects')    || [];
    const campuses    = AppState.get('campuses')    || [];
    const sessions    = generateSessions();

    const selDiscId  = existing?.disciplineId  || '';
    const selLvlId   = existing?.levelId       || '';
    const selCampId  = existing?.campusId      || '';
    const selSession = existing?.sessionPeriod || '';
    const selTeachId = existing?.teacherId     || '';
    const nextNo     = isEdit ? existing.batchNo : getNextBatchNo(selSession, existing?.subjectId || null, existing?.campusId || null);

    // Campus-filtered discipline options
    const discForCampus = selCampId
      ? disciplines.filter(d => !d.campusIds?.length || d.campusIds.includes(selCampId))
      : disciplines;
    const discOptions    = discForCampus.map(d =>
      `<option value="${d.id}" ${d.id === selDiscId ? 'selected' : ''}>${d.abbreviation} — ${d.fullName}</option>`
    ).join('');
    const levelOptions   = allLevels.filter(l => l.disciplineId === selDiscId).map(l =>
      `<option value="${l.id}" ${l.id === selLvlId ? 'selected' : ''}>${l.levelName}</option>`
    ).join('');
    // Build subject dropdown.
    // On EDIT: the selected option label must show the frozen snapshot
    // (subjectCode / subjectName stored on the batch), NOT the live
    // master name — otherwise a master rename shows the new name in
    // the dropdown even though the batch record still holds the old one.
    // We inject a synthetic "selected" option using snapshot values,
    // then list all live subjects for the user to switch to if needed.
    const _frozenSubjCode = existing?.subjectCode || '';
    const _frozenSubjName = existing?.subjectName || '';
    const _frozenSubjId   = existing?.subjectId   || null;
    const subjectOptions = (() => {
      const liveOpts = allSubjects
        .filter(s => s.levelId === selLvlId)
        .map(s => {
          // If this option matches the frozen subject, show frozen label
          // so the dropdown opens with the historically-correct name.
          if (isEdit && s.id === _frozenSubjId) {
            const frozenLabel = _frozenSubjCode
              ? `${_frozenSubjCode}${_frozenSubjName ? ' — ' + _frozenSubjName : ''} (saved)`
              : `${s.subjectCode} — ${s.subjectName}`;
            return `<option value="${s.id}" selected>${frozenLabel}</option>`;
          }
          return `<option value="${s.id}">${s.subjectCode} — ${s.subjectName}</option>`;
        }).join('');
      // If editing and subject exists but wasn't found in live list
      // (deleted subject edge case), still show frozen label as selected
      if (isEdit && _frozenSubjId && !allSubjects.find(s => s.id === _frozenSubjId)) {
        const ghostLabel = _frozenSubjCode
          ? `${_frozenSubjCode}${_frozenSubjName ? ' — ' + _frozenSubjName : ''} (saved)`
          : `[saved subject — id: ${_frozenSubjId}]`;
        return `<option value="${_frozenSubjId}" selected>${ghostLabel}</option>` + liveOpts;
      }
      return liveOpts;
    })();
    const sessionOptions = sessions.map(s =>
      `<option value="${s.value}" data-start="${s.startDate}" data-end="${s.endDate}" ${s.value === selSession ? 'selected' : ''}>${s.label}</option>`
    ).join('');
    const campusOptions  = campuses.map(c =>
      `<option value="${c.id}" ${c.id === selCampId ? 'selected' : ''}>${c.campusName}</option>`
    ).join('');

    const autoBatchName = isEdit
      ? existing.batchName  // show stored name as-is on open
      : (selDiscId && selSession ? buildBatchName(existing?.subjectId || '', selDiscId, selSession, nextNo) : '');
    const teacherOptions  = buildTeacherOptions(selDiscId, selCampId, selTeachId);
    const teacherCount    = getFilteredTeachers(selDiscId, selCampId).teachers.length;
    const teacherHint     = selDiscId || selCampId
      ? `${teacherCount} teacher${teacherCount !== 1 ? 's' : ''} match`
      : 'Select discipline and campus first — list will be filtered';

    Modal.open({
      title: isEdit ? 'Edit Batch' : 'Add Batch',
      size:  'lg',
      scrollable: true,
      bodyStyle: 'overflow-y:auto;padding-right:4px;',
      body: `
        <!-- Row 1: Session (auto-detected) + Batch No -->
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Session <span class="req">*</span></label>
            <div id="sessionAutoDisplay" style="
              display:flex;align-items:center;gap:8px;padding:8px 12px;
              border:1px solid var(--border);border-radius:8px;background:var(--surface2);
              min-height:38px">
              <span id="sessionBadge" style="
                font-family:var(--font-mono);font-size:12px;font-weight:700;
                background:var(--blue-dim);color:var(--blue);
                padding:2px 10px;border-radius:10px">
                —
              </span>
              <span id="sessionLabel" style="font-size:12px;color:var(--t3)">
                Set a start date to auto-detect
              </span>
            </div>
            <input type="hidden" name="sessionPeriod" id="sessionHidden" value="${selSession}"/>
            <span class="form-hint">Auto-detected from Start Date. &nbsp;
              <a href="#" id="sessionManualToggle" style="color:var(--blue);font-size:11px">Override manually</a>
            </span>
            <select name="_sessionOverride" id="sessionManualSelect" class="form-select form-input"
                    style="display:none;margin-top:6px">
              <option value="">Auto (from date)…</option>${sessionOptions}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Batch #</label>
            <input id="batchNoDisplay" class="form-input" type="number" name="batchNo"
                   value="${nextNo}" min="1"
                   style="font-family:var(--font-mono);font-weight:700"/>
            <span class="form-hint" id="batchNoHint">Batch #${nextNo} in this session.</span>
          </div>
        </div>

        <!-- Batch Name (auto-generated) -->
        <div class="form-group">
          <label class="form-label">Batch Name <span class="req">*</span></label>
          <!-- To allow manual editing: remove "readonly" attribute below -->
          <input name="batchName" id="batchNameInput" class="form-input"
                 placeholder="Select discipline and session — will auto-fill"
                 value="${autoBatchName}"
                 readonly
                 style="font-family:var(--font-mono);background:var(--surface2);cursor:default"
                 title="Auto-generated from discipline, session and batch number"/>
          <span class="form-hint">Auto-generated.</span>
        </div>

        <!-- Row 2: Campus (mandatory) + Discipline (filtered by campus) -->
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Campus <span class="req">*</span></label>
            <select name="campusId" class="form-select form-input" id="batchCampSelect">
              <option value="">Select a campus…</option>${campusOptions}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Discipline <span class="req">*</span></label>
            <select name="disciplineId" class="form-select form-input" id="batchDiscSelect"
                    ${!selCampId ? 'disabled' : ''}>
              <option value="">${selCampId ? 'Select a discipline…' : 'Select a campus first…'}</option>${discOptions}
            </select>
            <span class="form-hint" id="discHintText">${selCampId ? `${discForCampus.length} discipline${discForCampus.length !== 1 ? 's' : ''} available` : 'Select campus to filter disciplines'}</span>
          </div>
        </div>

        <!-- Row 3: Level + Subject -->
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Level <span class="req">*</span></label>
            <select name="levelId" class="form-select form-input" id="batchLevelSelect"
                    ${!selDiscId ? 'disabled' : ''}>
              <option value="">Select a discipline first…</option>${levelOptions}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" style="display:flex;align-items:center;justify-content:space-between;gap:6px">
              <span>Subject</span>
              ${isEdit ? `
                <button type="button" id="syncSubjectSnapshotBtn"
                  title="Pull latest subjectCode &amp; subjectName from master into this batch"
                  style="display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:600;
                         padding:2px 9px;border-radius:8px;cursor:pointer;font-family:var(--font);
                         border:1px solid var(--blue);background:var(--blue-dim);color:var(--blue);
                         white-space:nowrap;line-height:1.6;transition:all .15s"
                  onmouseover="this.style.background='var(--blue)';this.style.color='#fff'"
                  onmouseout="this.style.background='var(--blue-dim)';this.style.color='var(--blue)'">
                  ↻ Sync from Master
                </button>` : ''}
            </label>
            <select name="subjectId" class="form-select form-input" id="batchSubjectSelect"
                    ${!selLvlId ? 'disabled' : ''}>
              <option value="">Select a level first…</option>${subjectOptions}
            </select>
            ${isEdit ? `
              <div id="subjectSnapshotInfo" style="
                margin-top:5px;padding:5px 10px;border-radius:7px;font-size:11px;
                background:var(--surface2);border:1px solid var(--border);
                color:var(--t3);font-family:var(--font-mono);line-height:1.7">
                <span style="color:var(--t4);font-size:10px">SAVED SNAPSHOT</span><br/>
                Code: <strong style="color:var(--t2)">${_frozenSubjCode || '—'}</strong>
                &nbsp;|&nbsp;
                Name: <strong style="color:var(--t2)">${_frozenSubjName || '—'}</strong>
              </div>` : ''}
            <span class="form-hint">Optional — leave blank for a multi-subject batch.</span>
          </div>
        </div>

        <!-- Row 4: Teacher (dropdown → chips) + Max Students -->
        <div class="form-row cols-2" style="align-items:start">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label" style="display:flex;align-items:center;gap:8px">
              Teacher
              <span id="teacherFilterBadge" style="
                font-size:10.5px;font-weight:600;
                background:var(--blue-dim);color:var(--blue);
                padding:1px 7px;border-radius:10px;font-family:var(--font-mono)">
                ${teacherHint}
              </span>
            </label>

            <!-- Same dropdown as before — selecting adds to list below -->
            <select id="batchTeacherSelect" class="form-select form-input"
                    style="width:100%">
              ${teacherOptions}
            </select>
            <span class="form-hint" id="teacherHintText">
              Select to add. Multiple teachers allowed.
            </span>

            <!-- Selected teachers list (chips / rows) -->
            <div id="teacherChipList" style="display:flex;flex-direction:column;gap:4px;margin-top:6px"></div>

            <!-- Date popover (hidden, shown near clicked row) -->
            <div id="teacherDatePopover" style="
              display:none;position:fixed;z-index:99999;
              background:#ffffff;border:1.5px solid #d0d5dd;
              border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.22);
              padding:14px 16px;min-width:260px">
              <div style="font-size:12px;font-weight:700;color:var(--t1);margin-bottom:10px"
                   id="popoverTeacherName">Set Dates</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <div>
                  <div style="font-size:10.5px;color:var(--t3);margin-bottom:3px">Start Date</div>
                  <input type="date" id="popoverFromDate" class="form-input"
                         style="font-family:var(--font-mono);font-size:12px;padding:5px 7px;width:100%"/>
                </div>
                <div>
                  <div style="font-size:10.5px;color:var(--t3);margin-bottom:3px">End Date</div>
                  <input type="date" id="popoverToDate" class="form-input"
                         style="font-family:var(--font-mono);font-size:12px;padding:5px 7px;width:100%"/>
                </div>
              </div>
              <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:10px">
                <button type="button" id="popoverCancelBtn" style="
                  font-size:11.5px;padding:4px 12px;border-radius:7px;cursor:pointer;font-family:var(--font);
                  border:1px solid var(--border);background:var(--surface2);color:var(--t2)">Cancel</button>
                <button type="button" id="popoverSaveBtn" style="
                  font-size:11.5px;padding:4px 12px;border-radius:7px;cursor:pointer;font-family:var(--font);
                  border:none;background:var(--blue);color:#fff;font-weight:600">Save</button>
              </div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Max Students</label>
            <input name="maxStudents" class="form-input" type="number"
                   placeholder="e.g. 30" min="1" max="300"
                   value="${existing?.maxStudents || ''}"/>
          </div>
        </div>

        <!-- Row 5: Start + End Date (side by side, compact) -->
        <div class="form-row cols-2" style="align-items:start">

          <!-- START DATE -->
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label" style="display:flex;align-items:center;gap:6px">
              Start Date
              <span style="font-size:10px;font-weight:400;color:var(--t3)">— auto-detects session</span>
            </label>
            <div style="display:grid;grid-template-columns:80px 1fr 64px;gap:6px">
              <div>
                <div style="font-size:10px;color:var(--t3);margin-bottom:2px">Year</div>
                <input id="startYear" class="form-input" type="number" min="2000" max="2099"
                       placeholder="2026"
                       style="font-family:var(--font-mono);font-weight:700;text-align:center;padding:6px 4px"
                       value="${existing?.startDate ? existing.startDate.slice(0,4) : new Date().getFullYear()}"/>
              </div>
              <div>
                <div style="font-size:10px;color:var(--t3);margin-bottom:2px">Month</div>
                <select id="startMonth" class="form-select form-input" style="padding:6px 4px">
                  ${Array.from({length:12},(_,i)=>{
                    const mn=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i];
                    const curM = existing?.startDate ? parseInt(existing.startDate.slice(5,7)) : new Date().getMonth()+1;
                    return `<option value="${i+1}" ${i+1===curM?'selected':''}>${mn}</option>`;
                  }).join('')}
                </select>
              </div>
              <div>
                <div style="font-size:10px;color:var(--t3);margin-bottom:2px">Day</div>
                <select id="startDay" class="form-select form-input" style="font-family:var(--font-mono);padding:6px 4px">
                </select>
              </div>
            </div>
            <span id="startDatePreview" style="font-size:11px;font-family:var(--font-mono);color:var(--blue);margin-top:3px;display:block"></span>
          </div>

          <!-- END DATE -->
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              End Date
              <span style="display:flex;align-items:center;gap:12px;font-weight:400">
                <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11.5px;color:var(--t2)">
                  <input type="radio" name="endDateMode" id="endModeLP"     value="lp"     style="accent-color:var(--blue)" checked/>
                  As per LP
                </label>
                <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11.5px;color:var(--t2)">
                  <input type="radio" name="endDateMode" id="endModeManual" value="manual" style="accent-color:var(--blue)" ${existing?.endDateMode === 'manual' ? 'checked' : ''}/>
                  Manual
                </label>
              </span>
            </label>

            <!-- LP mode display -->
            <div id="endDateLPDisplay" style="display:flex;align-items:center;gap:8px;padding:8px 10px;
                 border:1px solid var(--border);border-radius:8px;background:var(--surface2);min-height:38px">
              <span id="endDateLPValue" style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--t1)">—</span>
              <span id="endDateLPHint"  style="font-size:11px;color:var(--t3)">Loading…</span>
            </div>

            <!-- Manual mode pickers -->
            <div id="endDateManualPickers" style="display:none">
              <div style="display:grid;grid-template-columns:80px 1fr 64px;gap:6px">
                <div>
                  <div style="font-size:10px;color:var(--t3);margin-bottom:2px">Year</div>
                  <input id="endYear" class="form-input" type="number" min="2000" max="2099"
                         placeholder="2026"
                         style="font-family:var(--font-mono);font-weight:700;text-align:center;padding:6px 4px"
                         value="${existing?.endDate ? existing.endDate.slice(0,4) : new Date().getFullYear()}"/>
                </div>
                <div>
                  <div style="font-size:10px;color:var(--t3);margin-bottom:2px">Month</div>
                  <select id="endMonth" class="form-select form-input" style="padding:6px 4px">
                    ${Array.from({length:12},(_,i)=>{
                      const mn=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i];
                      const curM = existing?.endDate ? parseInt(existing.endDate.slice(5,7)) : new Date().getMonth()+1;
                      return `<option value="${i+1}" ${i+1===curM?'selected':''}>${mn}</option>`;
                    }).join('')}
                  </select>
                </div>
                <div>
                  <div style="font-size:10px;color:var(--t3);margin-bottom:2px">Day</div>
                  <select id="endDay" class="form-select form-input" style="font-family:var(--font-mono);padding:6px 4px">
                  </select>
                </div>
              </div>
              <span id="endDatePreview" style="font-size:11px;font-family:var(--font-mono);color:var(--t3);margin-top:3px;display:block"></span>
            </div>
          </div>

        </div>

        <!-- Enrolment Close Date section -->
        <div style="margin-top:4px;padding:14px 16px;border:1px solid var(--border);border-radius:10px;background:var(--surface2)">
          <label class="form-label" style="display:flex;align-items:center;gap:7px;margin-bottom:10px">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2.2">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Enrolment Close Date
          </label>

          <!-- Criteria chips — show which fields are filled/missing -->
          <div id="enrolCriteriaRow" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
            <span id="enrolChipCampus"    class="enrol-chip enrol-chip-miss">Campus</span>
            <span id="enrolChipDisc"      class="enrol-chip enrol-chip-miss">Discipline</span>
            <span id="enrolChipLevel"     class="enrol-chip enrol-chip-miss">Level</span>
            <span id="enrolChipStart"     class="enrol-chip enrol-chip-miss">Start Date</span>
          </div>

          <!-- Result display — same style as start date preview -->
          <div id="enrolAutoDisplay"
               style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;
                      background:var(--surface1);font-size:12.5px;color:var(--t3);
                      font-family:var(--font-mono);min-height:36px;display:flex;align-items:center">
            —
          </div>
          <span id="enrolRuleHint" style="font-size:11px;color:var(--t3);margin-top:4px;display:block"></span>
          <input type="hidden" name="enrolmentCloseDate" id="enrolDateHidden" value="${existing?.enrolmentCloseDate || ''}"/>

          <!-- Enrol chip styles (injected inline to avoid needing separate CSS) -->
          <style>
            .enrol-chip { font-size:10.5px;font-weight:600;padding:2px 9px;border-radius:10px;transition:all .2s; }
            .enrol-chip-miss { background:var(--surface3);color:var(--t4); }
            .enrol-chip-ok   { background:var(--green-dim);color:var(--green); }
          </style>
        </div>

        <!-- Hidden date inputs for form collection -->
        <input type="hidden" name="startDate" id="startDateHidden"/>
        <input type="hidden" name="endDate"   id="endDateHidden"/>
      `,
      actions: [
        { label: 'Cancel', variant: 'ghost', close: true },
        {
          label:   isEdit ? 'Save Changes' : 'Add Batch',
          variant: 'primary',
          close:   false,
          handler: (modalEl) => this._handleSave(modalEl, existing, container),
        }
      ],
      onOpen: (modalEl) => {
        // ── Viewport-fit fix (100% zoom) ─────────────────────────
        // ui.js Modal structure is unknown — we walk the DOM tree
        // aggressively: up to find the fixed/absolute overlay,
        // then down to find scrollable body and footer.
        const fixModal = () => {
          // Exact class names confirmed via DevTools console
          const backdrop = document.querySelector('.modal-backdrop');
          const box      = document.querySelector('.modal-box');
          const header   = document.querySelector('.modal-header');
          const body     = document.querySelector('.modal-body');
          const footer   = document.querySelector('.modal-footer');

          if (backdrop) {
            backdrop.style.setProperty('display',          'flex',       'important');
            backdrop.style.setProperty('align-items',      'center',     'important');
            backdrop.style.setProperty('justify-content',  'center',     'important');
            backdrop.style.setProperty('padding',          '16px',       'important');
            backdrop.style.setProperty('box-sizing',       'border-box', 'important');
            backdrop.style.setProperty('overflow',         'hidden',     'important');
          }
          if (box) {
            box.style.setProperty('display',        'flex',                 'important');
            box.style.setProperty('flex-direction', 'column',              'important');
            box.style.setProperty('max-height',     'calc(100dvh - 32px)', 'important');
            box.style.setProperty('overflow',       'hidden',              'important');
            box.style.setProperty('margin',         '0',                   'important');
          }
          if (header) header.style.setProperty('flex-shrink', '0',        'important');
          if (footer) footer.style.setProperty('flex-shrink', '0',        'important');
          if (body) {
            body.style.setProperty('flex',       '1 1 auto', 'important');
            body.style.setProperty('overflow-y', 'auto',     'important');
            body.style.setProperty('min-height', '0',        'important');
            body.style.setProperty('max-height', 'none',     'important');
          }
        };

        requestAnimationFrame(() => {
          fixModal();
          setTimeout(fixModal, 100);
        });

                this._wireDynamicDropdowns(modalEl, existing);
      },
    });
  },

  // ── Save handler ─────────────────────────────────────────────
  _handleSave(modalEl, existing, container) {
    const body = modalEl.querySelector('.modal-body');
    const data = Form.collect(body);

    // ── Read startDate: hidden input is primary, pickers are fallback ──
    // #startDateHidden is kept in sync by updateStartDate() on every
    // picker change AND on init (requestAnimationFrame).  Reading it
    // here captures whatever the user last selected — including an
    // edited date — rather than the old saved value from existing.startDate.
    // Pickers are used as fallback in case the hidden input is blank
    // (e.g. modal opened and saved extremely quickly before the first
    // requestAnimationFrame fired).
    const _startHiddenEl = modalEl.querySelector('#startDateHidden');
    if (_startHiddenEl?.value) {
      data.startDate = _startHiddenEl.value;
    } else {
      const _sY = modalEl.querySelector('#startYear')?.value?.trim();
      const _sM = modalEl.querySelector('#startMonth')?.value;
      const _sD = modalEl.querySelector('#startDay')?.value;
      if (_sY && _sM && _sD) {
        data.startDate = `${_sY}-${String(_sM).padStart(2,'0')}-${String(_sD).padStart(2,'0')}`;
      }
    }
    // endDate: hidden input is fine (set synchronously on mode switch)
    const _endHiddenEl = modalEl.querySelector('#endDateHidden');
    if (_endHiddenEl?.value) data.endDate = _endHiddenEl.value;

    // ── Re-derive sessionPeriod from the confirmed startDate ──────
    if (data.startDate) {
      const _sess = detectSessionFromDate(data.startDate);
      if (_sess) data.sessionPeriod = _sess;
    }
    // Fallback to sessionHidden (covers manual override)
    if (!data.sessionPeriod) {
      const _sessEl = modalEl.querySelector('#sessionHidden');
      if (_sessEl?.value) data.sessionPeriod = _sessEl.value;
    }

    // ── Required field validation ─────────────────────────────
    let err = false;
    if (!data.campusId)         { Toast.error('Please select a campus.');      err = true; }
    if (!data.disciplineId)     { Toast.error('Please select a discipline.');  err = true; }
    if (!data.levelId)          { Toast.error('Please select a level.');       err = true; }
    if (!data.sessionPeriod)    { Toast.error('Start date does not fall in any known session. Please check the date or use manual override.'); err = true; }
    if (!data.batchName?.trim()){ Toast.error('Please enter a batch name.');   err = true; }
    if (err) return;

    // Remove internal override field — not part of batch record
    delete data._sessionOverride;

    // ── Cleanup first ──────────────────────────────────────────
    data.batchName = data.batchName.toUpperCase().trim();
    data.batchNo   = parseInt(data.batchNo) || 1;

    // ── Duplicate batch number check ───────────────────────────
    // Rule: batch number must be unique within the same
    //       subject + session + campus combination.
    //
    // Allowed (different in ANY of these 3) → batch no can repeat:
    //   ✅ Same subject, different session
    //   ✅ Same subject, same session, different campus
    //
    // Blocked (all 3 same):
    //   ❌ Same subject + same session + same campus → batch no must differ
    {
      const existingId = existing?.id || null;
      const allBatches = AppState.get(KEY) || [];
      const newSubject = data.subjectId  || null;
      const newCampus  = data.campusId   || null;

      const conflict = allBatches.some(b => {
        if (b.id === existingId)              return false; // skip self in edit mode
        if (b.sessionPeriod !== data.sessionPeriod) return false; // different session → ok
        if ((b.subjectId  || null) !== newSubject)  return false; // different subject → ok
        if ((b.campusId   || null) !== newCampus)   return false; // different campus → ok
        // All 3 match — now check batch number
        return (parseInt(b.batchNo) || 1) === data.batchNo;
      });

      if (conflict) {
        const subj  = AppState.findById('subjects',  newSubject);
        const camp  = AppState.findById('campuses',  newCampus);
        const disc  = AppState.findById('disciplines', data.disciplineId);
        const label = subj  ? `"${subj.subjectCode}"` : `"${disc?.abbreviation}"`;
        const where = camp  ? ` — ${camp.campusName}` : '';
        Toast.error(
          `Batch #${fmt2(data.batchNo)} already exists for ${label}${where} ` +
          `in session "${data.sessionPeriod}". Use a different batch number.`
        );
        return;
      }
    }

    // ── Multi-teacher: read from _selectedTeachers (set by chip UI) ─
    const selTeachers = modalEl._selectedTeachers || [];
    if (selTeachers.length > 0) {
      const teachersArr = selTeachers.map(e => {
        const t = resolveTeacher(e.teacherId);
        return {
          teacherId:   e.teacherId,
          // Preserve frozen teacherName snapshot if teacher is no longer
          // resolvable (deleted from master).  Previously this wrote '' which
          // silently wiped the historical name on the next save.
          teacherName: t ? t.fullName : (e.teacherName || ''),
          fromDate:    e.fromDate || '',
          toDate:      e.toDate   || '',
          isActive:    !!e.isActive,
        };
      });
      // Ensure exactly one active
      if (!teachersArr.some(t => t.isActive) && teachersArr.length)
        teachersArr[teachersArr.length - 1].isActive = true;
      data.teachers = teachersArr;
      const activeT = teachersArr.find(t => t.isActive);
      data.teacherId   = activeT?.teacherId   || '';
      data.teacherName = activeT?.teacherName || '';
    } else {
      data.teacherId   = '';
      data.teacherName = '';
      data.teachers    = [];
    }

    // Store end date mode and resolve actual endDate
    const endModeEl = modalEl.querySelector('input[name="endDateMode"]:checked');
    data.endDateMode = endModeEl?.value || 'lp';

    // Always save actual endDate from the hidden input regardless of mode
    // For LP mode: endHidden.value is set by applyLPEndDate()
    // For manual mode: endHidden.value is set by updateEndDate()
    const endHiddenEl = modalEl.querySelector('#endDateHidden');
    if (endHiddenEl?.value) {
      data.endDate = endHiddenEl.value;
    } else if (data.endDateMode === 'lp') {
      // Try to resolve LP end date at save time
      try {
        const assignment = getAssignmentForBatch(existing?.id || null);
        const rows       = assignment?.rows || [];
        const datedRows  = rows.filter(r => r.date);
        const lpEnd      = datedRows.length ? datedRows[datedRows.length - 1].date : '';
        if (lpEnd) data.endDate = lpEnd;
      } catch(e) { /* no assignment yet */ }
    }

    if (!data.subjectId)   delete data.subjectId;
    if (!data.campusId)    delete data.campusId;
    if (!data.maxStudents) delete data.maxStudents;
    // Fix: if hidden startDate is blank (race on init), fall back to
    // the existing saved date so an edit never silently clears startDate.
    if (!data.startDate) {
      if (existing?.startDate) data.startDate = existing.startDate;
      else delete data.startDate;
    }
    if (!data.endDate)     delete data.endDate;
    delete data._sessionOverride;

    // ── Resolve live master records to capture snapshots ────────
    const _disc    = AppState.findById('disciplines', data.disciplineId);
    const _campus  = AppState.findById('campuses',    data.campusId);
    const _level   = AppState.findById('levels',      data.levelId);
    const _subject = AppState.findById('subjects',    data.subjectId);
    const _teacher = resolveTeacher(data.teacherId);

    // ── Protect existing snapshots on edit ───────────────────────
    // Snapshot fields (disciplineName, campusName, levelName,
    // subjectName, subjectCode) must only be re-stamped when the
    // user actually changed that FK in the form.
    // If the FK is unchanged, we preserve the original frozen
    // snapshot so a master rename never silently alters
    // already-created batch records.
    let snapshotDisc    = _disc;
    let snapshotCampus  = _campus;
    let snapshotLevel   = _level;
    let snapshotSubject = _subject;

    if (existing) {
      if (data.disciplineId === existing.disciplineId) {
        snapshotDisc = {
          id:           existing.disciplineId,
          fullName:     existing.disciplineName || _disc?.fullName,
          abbreviation: existing.disciplineAbbr || _disc?.abbreviation,
        };
      }
      if (data.campusId === existing.campusId) {
        snapshotCampus = {
          id:         existing.campusId,
          campusName: existing.campusName || _campus?.campusName,
        };
      }
      if (data.levelId === existing.levelId) {
        snapshotLevel = {
          id:        existing.levelId,
          levelName: existing.levelName || _level?.levelName,
        };
      }
      // subjectId can be null (multi-subject batch) — compare carefully
      const oldSubjectId = existing.subjectId || null;
      const newSubjectId = data.subjectId     || null;
      if (newSubjectId === oldSubjectId) {
        snapshotSubject = oldSubjectId ? {
          id:          existing.subjectId,
          subjectName: existing.subjectName || _subject?.subjectName,
          subjectCode: existing.subjectCode || _subject?.subjectCode,
        } : null;
      }
    }

    // ── Build full batch object with snapshot fields ───────────
    const batchObj = _buildBatchObject({
      discipline:    snapshotDisc,
      campus:        snapshotCampus,
      level:         snapshotLevel,
      subject:       snapshotSubject,
      teacherId:     data.teacherId,
      teacherName:   data.teacherName,
      teachersArr:   data.teachers,
      batchName:     data.batchName,
      batchNo:       data.batchNo,
      sessionPeriod: data.sessionPeriod,
      startDate:     data.startDate,
      endDate:       data.endDate,
      maxStudents:   data.maxStudents,
      endDateMode:   data.endDateMode,
      status:        data.status || (existing?.status || 'active'),
    });

    if (existing) {
      // Safe merge: AppState.update does { ...item, ...patch } internally.
      // batchObj already omits blank dates (via _buildBatchObject spread fix),
      // but we add one final safety net here too.
      if (!batchObj.startDate) delete batchObj.startDate; // never patch with undefined/blank
      if (!batchObj.endDate)   delete batchObj.endDate;
      AppState.update(KEY, existing.id, batchObj);
      Toast.success(`Batch "${batchObj.batchName}" has been updated.`);
    } else {
      AppState.add(KEY, { ...batchObj, id: generateID('batch') });
      Toast.success(`Batch "${batchObj.batchName}" has been created.`);
    }

    Modal.closeAll();
    this._render(container);
  },

  // ── Dynamic dropdowns + smart teacher filter ─────────────────
  _wireDynamicDropdowns(modalEl, existing = null) {
    const isEdit = !!existing;   // derived here — _openForm's isEdit is out of scope
    const discSel      = modalEl.querySelector('#batchDiscSelect');
    const levelSel     = modalEl.querySelector('#batchLevelSelect');
    const subjectSel   = modalEl.querySelector('#batchSubjectSelect');
    const campSel      = modalEl.querySelector('#batchCampSelect');
    const teacherSel   = modalEl.querySelector('#batchTeacherSelect');
    const batchNoInp   = modalEl.querySelector('#batchNoDisplay');
    const batchNoHint  = modalEl.querySelector('#batchNoHint');
    const batchNameInp = modalEl.querySelector('#batchNameInput');
    const teacherBadge = modalEl.querySelector('#teacherFilterBadge');
    const allLevels    = AppState.get('levels')   || [];
    const allSubjects  = AppState.get('subjects') || [];

    // ── Date picker elements ───────────────────────────────────
    const startYear  = modalEl.querySelector('#startYear');
    const startMonth = modalEl.querySelector('#startMonth');
    const startDay   = modalEl.querySelector('#startDay');
    const endYear    = modalEl.querySelector('#endYear');
    const endMonth   = modalEl.querySelector('#endMonth');
    const endDay     = modalEl.querySelector('#endDay');
    const startHidden = modalEl.querySelector('#startDateHidden');
    const endHidden   = modalEl.querySelector('#endDateHidden');
    const startPreview = modalEl.querySelector('#startDatePreview');
    const endPreview   = modalEl.querySelector('#endDatePreview');

    // ── Session auto-detect elements ───────────────────────────
    const sessionHidden  = modalEl.querySelector('#sessionHidden');
    const sessionBadge   = modalEl.querySelector('#sessionBadge');
    const sessionLabel   = modalEl.querySelector('#sessionLabel');
    const sessionManualToggle = modalEl.querySelector('#sessionManualToggle');
    const sessionManualSelect = modalEl.querySelector('#sessionManualSelect');

    const MONTH_NAMES = ['January','February','March','April','May','June',
                         'July','August','September','October','November','December'];

    // ── Populate day dropdown ──────────────────────────────────
    const populateDays = (yearEl, monthEl, dayEl, existingDay) => {
      const y = parseInt(yearEl.value) || new Date().getFullYear();
      const m = parseInt(monthEl.value) || 1;
      const maxDay = getDaysInMonth(y, m);
      const curVal = existingDay || parseInt(dayEl.value) || new Date().getDate();
      dayEl.innerHTML = Array.from({length: maxDay}, (_,i) => {
        const d = i + 1;
        const sel = d === Math.min(curVal, maxDay) ? 'selected' : '';
        return `<option value="${d}" ${sel}>${String(d).padStart(2,'0')}</option>`;
      }).join('');
    };

    // ── Build date string from pickers ─────────────────────────
    const getDateStr = (yearEl, monthEl, dayEl) => {
      const y = yearEl.value?.trim();
      const m = monthEl.value;
      const d = dayEl.value;
      if (!y || !m || !d) return '';
      return buildDateStr(parseInt(y), parseInt(m), parseInt(d));
    };

    // ── Update session auto-detect ─────────────────────────────
    const updateSession = () => {
      // If manual override is active, use that
      if (sessionManualSelect.style.display !== 'none' && sessionManualSelect.value) {
        sessionHidden.value = sessionManualSelect.value;
        refreshBatchNo();
        updateName();
        return;
      }
      const dateStr = getDateStr(startYear, startMonth, startDay);
      const detected = detectSessionFromDate(dateStr);
      sessionHidden.value = detected;

      if (detected) {
        sessionBadge.textContent = detected;
        sessionBadge.style.background = 'var(--green-dim)';
        sessionBadge.style.color = 'var(--green)';
        sessionLabel.textContent = getSessionLabel(detected);
      } else if (dateStr) {
        sessionBadge.textContent = '?';
        sessionBadge.style.background = 'var(--yellow-dim)';
        sessionBadge.style.color = 'var(--yellow)';
        sessionLabel.textContent = 'Date does not fall in any known session';
      } else {
        sessionBadge.textContent = '—';
        sessionBadge.style.background = 'var(--surface3)';
        sessionBadge.style.color = 'var(--t3)';
        sessionLabel.textContent = 'Set a start date to auto-detect';
      }
      refreshBatchNo();
      updateName();
    };

    // ── Update hidden date inputs + preview ────────────────────
    const updateStartDate = () => {
      const ds = getDateStr(startYear, startMonth, startDay);
      startHidden.value = ds;
      if (ds) {
        const [y,m,d] = ds.split('-');
        startPreview.textContent = `${parseInt(d)} ${MONTH_NAMES[parseInt(m)-1]} ${y}`;
      } else {
        startPreview.textContent = '';
      }
      updateSession();
    };

    const updateEndDate = () => {
      const ds = getDateStr(endYear, endMonth, endDay);
      endHidden.value = ds;
      if (ds) {
        const [y,m,d] = ds.split('-');
        endPreview.textContent = `${parseInt(d)} ${MONTH_NAMES[parseInt(m)-1]} ${y}`;
      } else {
        endPreview.textContent = '';
      }
    };

    // ── Batch number smart refresh ─────────────────────────────
    const refreshBatchNo = () => {
      if (existing) return; // don't auto-change on edit
      const session = sessionHidden.value;
      const subjectId = subjectSel?.value || null;
      if (!session) return;
      const campusId = campSel?.value || null;
      const next = getNextBatchNo(session, subjectId || null, campusId);
      batchNoInp.value = next;
      if (batchNoHint) batchNoHint.textContent = `Batch #${next} in this session${subjectId ? ' for this subject' : ''}.`;
    };

    // ── Update batch name ──────────────────────────────────────
    const updateName = () => {
      const discId    = discSel?.value;
      const subjectId = subjectSel?.value;
      const session   = sessionHidden?.value;
      const no        = parseInt(batchNoInp?.value) || 1;
      if (!discId || !session) return;

      // On edit: if subject hasn't changed, preserve frozen snapshot code
      // so master renames don't bleed into the batch name
      const frozenCode = (isEdit && subjectId === existing?.subjectId)
        ? (existing?.subjectCode || null)
        : null;

      batchNameInp.value = buildBatchName(subjectId, discId, session, no, frozenCode);
    };

    // ── Re-populate teacher dropdown ───────────────────────────
    const refreshTeacherDropdown = () => {
      const discId   = discSel?.value   || '';
      const campId   = campSel?.value   || '';
      const prevSel  = teacherSel?.value || '';

      const { teachers, reason } = getFilteredTeachers(discId, campId);

      if (teacherSel) {
        if (reason === 'no_teachers') {
          teacherSel.innerHTML = `<option value="">Please add a teacher in the Teachers module first</option>`;
        } else if (reason === 'no_match') {
          teacherSel.innerHTML = `<option value="">No teacher found for this discipline/campus</option>`;
        } else {
          teacherSel.innerHTML =
            `<option value="">Select a teacher…</option>` +
            teachers.map(t =>
              `<option value="${t.id}" ${t.id === prevSel ? 'selected' : ''}>
                ${t.fullName}${t.qualification ? ` — ${t.qualification}` : ''}
              </option>`
            ).join('');
        }
      }

      // Update badge
      if (teacherBadge) {
        const count = teachers.length;
        if (reason === 'no_teachers') {
          teacherBadge.textContent = 'Please add a teacher first';
          teacherBadge.style.background = 'var(--red-dim)';
          teacherBadge.style.color = 'var(--red)';
        } else if (!discId && !campId) {
          teacherBadge.textContent = 'Filter: all teachers';
          teacherBadge.style.background = 'var(--surface3)';
          teacherBadge.style.color = 'var(--t3)';
        } else if (reason === 'no_match') {
          teacherBadge.textContent = 'No match found';
          teacherBadge.style.background = 'var(--yellow-dim)';
          teacherBadge.style.color = 'var(--yellow)';
        } else {
          teacherBadge.textContent = `${count} teacher${count !== 1 ? 's' : ''} match`;
          teacherBadge.style.background = 'var(--green-dim)';
          teacherBadge.style.color = 'var(--green)';
        }
      }
    };

    // ── Wire date picker events ────────────────────────────────
    // Year input: enforce 4-digit mask feel (clamp range)
    startYear.addEventListener('input', () => {
      if (startYear.value.length > 4) startYear.value = startYear.value.slice(0,4);
      populateDays(startYear, startMonth, startDay);
      updateStartDate();
    });
    endYear.addEventListener('input', () => {
      if (endYear.value.length > 4) endYear.value = endYear.value.slice(0,4);
      populateDays(endYear, endMonth, endDay);
      updateEndDate();
    });

    startMonth.addEventListener('change', () => {
      populateDays(startYear, startMonth, startDay);
      updateStartDate();
    });
    endMonth.addEventListener('change', () => {
      populateDays(endYear, endMonth, endDay);
      updateEndDate();
    });

    startDay.addEventListener('change', updateStartDate);
    endDay.addEventListener('change',   updateEndDate);

    // ── End Date mode: As per LP vs Manual ───────────────────────
    const endModeLP      = modalEl.querySelector('#endModeLP');
    const endModeManual  = modalEl.querySelector('#endModeManual');
    const endDateLPDisp  = modalEl.querySelector('#endDateLPDisplay');
    const endDateManPick = modalEl.querySelector('#endDateManualPickers');
    const endDateLPVal   = modalEl.querySelector('#endDateLPValue');
    const endDateLPHint  = modalEl.querySelector('#endDateLPHint');

    const applyLPEndDate = () => {
      const batchId = existing?.id || null;
      let lpDate = '';
      if (batchId) {
        try {
          const assignment = getAssignmentForBatch(batchId);
          const rows = assignment?.rows || [];
          // Last row with a date
          const datedRows = rows.filter(r => r.date);
          lpDate = datedRows.length ? datedRows[datedRows.length - 1].date : '';
        } catch(e) { lpDate = ''; }
      }

      if (!batchId) {
        // New batch — LP not assigned yet
        endDateLPVal.textContent  = '—';
        endDateLPHint.textContent = 'Date will show after assigning LP';
        endDateLPHint.style.color = 'var(--t3)';
        endHidden.value = '';
      } else if (!lpDate) {
        endDateLPVal.textContent  = '—';
        endDateLPHint.textContent = 'LP not assigned yet — end date will auto-fill after LP is set';
        endDateLPHint.style.color = 'var(--t3)';
        // Don't clear endHidden — keep existing saved date as fallback
      } else {
        const [y,m,d] = lpDate.split('-');
        const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        endDateLPVal.textContent  = `${parseInt(d)} ${MONTHS[parseInt(m)-1]} ${y}`;
        endDateLPHint.textContent = 'Last date from assigned LP';
        endDateLPHint.style.color = 'var(--green)';
        endHidden.value = lpDate;
      }
    };

    const switchEndMode = () => {
      const isLP = endModeLP?.checked;
      endDateLPDisp.style.display  = isLP ? 'flex' : 'none';
      endDateManPick.style.display = isLP ? 'none' : 'block';
      if (isLP) {
        applyLPEndDate();
      } else {
        // Manual — sync hidden from pickers
        updateEndDate();
      }
    };

    endModeLP?.addEventListener('change',     switchEndMode);
    endModeManual?.addEventListener('change', switchEndMode);

    batchNoInp?.addEventListener('input', updateName);

    // ── Session manual override toggle ─────────────────────────
    sessionManualToggle?.addEventListener('click', (e) => {
      e.preventDefault();
      const isShown = sessionManualSelect.style.display !== 'none';
      sessionManualSelect.style.display = isShown ? 'none' : 'block';
      sessionManualToggle.textContent = isShown ? 'Override manually' : 'Use auto-detect';
      if (isShown) {
        // switched back to auto — re-detect
        sessionManualSelect.value = '';
        updateSession();
      }
    });
    sessionManualSelect?.addEventListener('change', updateSession);

    // ── Campus change → filter disciplines ────────────────────
    campSel?.addEventListener('change', () => {
      const campId = campSel.value;
      const allDiscs = AppState.get('disciplines') || [];
      const filtered = campId
        ? allDiscs.filter(d => !d.campusIds?.length || d.campusIds.includes(campId))
        : allDiscs;

      const discHint = modalEl.querySelector('#discHintText');
      if (discSel) {
        discSel.innerHTML = filtered.length
          ? `<option value="">Select a discipline…</option>` +
            filtered.map(d => `<option value="${d.id}">${d.abbreviation} — ${d.fullName}</option>`).join('')
          : `<option value="">No disciplines for this campus</option>`;
        discSel.disabled = !campId || !filtered.length;
      }
      if (discHint) {
        discHint.textContent = campId
          ? `${filtered.length} discipline${filtered.length !== 1 ? 's' : ''} available`
          : 'Select campus to filter disciplines';
      }

      // Reset level + subject
      if (levelSel) {
        levelSel.innerHTML = `<option value="">Select a discipline first…</option>`;
        levelSel.disabled = true;
      }
      if (subjectSel) {
        subjectSel.innerHTML = `<option value="">Select a level first…</option>`;
        subjectSel.disabled = true;
      }

      refreshTeacherDropdown();
      updateEnrolDate();
    });

    // ── Discipline change → levels + teacher filter ────────────
    discSel?.addEventListener('change', () => {
      const levels = allLevels.filter(l => l.disciplineId === discSel.value);
      levelSel.innerHTML = levels.length
        ? `<option value="">Select a level…</option>` +
          levels.map(l => `<option value="${l.id}">${l.levelName}</option>`).join('')
        : `<option value="">No levels found for this discipline</option>`;
      levelSel.disabled    = !discSel.value || !levels.length;
      subjectSel.innerHTML = `<option value="">Select a level first…</option>`;
      subjectSel.disabled  = true;
      updateName();
      refreshTeacherDropdown();
    });

    // ── Level change → subjects ────────────────────────────────
    levelSel?.addEventListener('change', () => {
      const subs = allSubjects.filter(s => s.levelId === levelSel.value);
      subjectSel.innerHTML =
        `<option value="">None (multi-subject batch)</option>` +
        subs.map(s => `<option value="${s.id}">${s.subjectCode} — ${s.subjectName}</option>`).join('');
      subjectSel.disabled = !levelSel.value;
      updateName();
    });

    // ── Subject change → update batch name + batch no ─────────
    subjectSel?.addEventListener('change', () => {
      refreshBatchNo();
      updateName();
    });

    // ── Initial population ─────────────────────────────────────
    const initDay = existing?.startDate ? parseInt(existing.startDate.slice(8,10)) : new Date().getDate();
    const initEndDay = existing?.endDate ? parseInt(existing.endDate.slice(8,10)) : new Date().getDate();
    populateDays(startYear, startMonth, startDay, initDay);
    populateDays(endYear, endMonth, endDay, initEndDay);
    // Apply correct end date mode on open
    // endDateMode: 'manual' → manual radio, anything else (lp / undefined / null) → LP radio
    const _initEndMode = existing?.endDateMode === 'manual' ? 'manual' : 'lp';
    if (_initEndMode === 'manual') {
      if (endModeManual) { endModeManual.checked = true; endModeLP.checked = false; }
    } else {
      if (endModeLP) { endModeLP.checked = true; if (endModeManual) endModeManual.checked = false; }
    }
    // Defer to next frame so all picker DOMs are fully rendered before we
    // read their values — prevents startDateHidden being set to a stale/blank
    // value which caused the old startDate to persist after an edit.
    requestAnimationFrame(() => {
      updateStartDate();
      switchEndMode();
    });
    refreshTeacherDropdown();

    // If editing, show existing session in badge
    if (existing?.sessionPeriod) {
      sessionHidden.value = existing.sessionPeriod;
      sessionBadge.textContent = existing.sessionPeriod;
      sessionBadge.style.background = 'var(--blue-dim)';
      sessionBadge.style.color = 'var(--blue)';
      sessionLabel.textContent = getSessionLabel(existing.sessionPeriod);
    }

    // ── Enrolment Close Date: smart auto-fill ──────────────────
    const enrolAutoDisplay  = modalEl.querySelector('#enrolAutoDisplay');
    const enrolDateHidden   = modalEl.querySelector('#enrolDateHidden');
    const enrolRuleHint     = modalEl.querySelector('#enrolRuleHint');

    // Add N working days after startDate
    // Skips: Sunday (dow=0) + public holidays
    // Holiday dates are normalized to YYYY-MM-DD for safe comparison
    const addWorkingDays = (startDateStr, days) => {
      const normalize = s => {
        if (!s) return '';
        // Already YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        // Try parsing and re-formatting
        const pd = new Date(s + 'T00:00:00');
        if (isNaN(pd)) return s;
        return pd.getFullYear() + '-' +
          String(pd.getMonth()+1).padStart(2,'0') + '-' +
          String(pd.getDate()).padStart(2,'0');
      };
      const holidays = new Set(
        (AppState.get('holidays') || []).map(h => normalize(h.date))
      );
      let d = new Date(startDateStr + 'T00:00:00');
      let added = 0;
      while (added < days) {
        d.setDate(d.getDate() + 1);
        const dow = d.getDay();
        const ymd = normalize(d.toISOString().slice(0, 10));
        if (dow !== 0 && !holidays.has(ymd)) added++;
      }
      return normalize(d.toISOString().slice(0, 10));
    };

    const updateEnrolDate = () => {
      const discId   = modalEl.querySelector('#batchDiscSelect')?.value;
      const levelId  = modalEl.querySelector('#batchLevelSelect')?.value;
      const campusId = modalEl.querySelector('#batchCampSelect')?.value;
      const startStr = modalEl.querySelector('#startDateHidden')?.value;

      // ── Update criteria chips ─────────────────────────────
      const chipCampus = modalEl.querySelector('#enrolChipCampus');
      const chipDisc   = modalEl.querySelector('#enrolChipDisc');
      const chipLevel  = modalEl.querySelector('#enrolChipLevel');
      const chipStart  = modalEl.querySelector('#enrolChipStart');

      const setChip = (chip, ok, label) => {
        if (!chip) return;
        chip.textContent  = ok ? '✓ ' + label : label;
        chip.className    = 'enrol-chip ' + (ok ? 'enrol-chip-ok' : 'enrol-chip-miss');
      };
      setChip(chipCampus, !!campusId, 'Campus');
      setChip(chipDisc,   !!discId,   'Discipline');
      setChip(chipLevel,  !!levelId,  'Level');
      setChip(chipStart,  !!startStr, 'Start Date');

      // Hide criteria row when all fields are filled
      const criteriaRow = modalEl.querySelector('#enrolCriteriaRow');
      const allFilled = !!campusId && !!discId && !!levelId && !!startStr;
      if (criteriaRow) criteriaRow.style.display = allFilled ? 'none' : 'flex';

      // ── Guard: need at least disc + start ────────────────
      if (!startStr || !discId) {
        if (enrolAutoDisplay) {
          const missing = [];
          if (!discId)   missing.push('Discipline');
          if (!levelId)  missing.push('Level');
          if (!startStr) missing.push('Start Date');
          enrolAutoDisplay.textContent = '— ' + missing.join(', ') + ' required';
          enrolAutoDisplay.style.color = 'var(--t3)';
        }
        if (enrolRuleHint)   enrolRuleHint.textContent = '';
        if (enrolDateHidden) enrolDateHidden.value = '';
        return;
      }

      const rules = AppState.get('enrolmentRules') || [];
      const rule  = rules.find(r =>
        r.disciplineId === discId &&
        (!r.campusId   || r.campusId === campusId) &&
        (r.levelId === levelId || (r.levelIds || []).includes(levelId))
      );

      let closeDate = '', hintText = '';
      if (!rule) {
        hintText  = 'No enrolment rule found for this combination';
        closeDate = '';
      } else if (rule.closeMode === 'same') {
        closeDate = startStr;
        hintText  = 'As per policy';
      } else {
        const days = rule.closeDays || 3;
        closeDate  = addWorkingDays(startStr, days);
        const hols = (AppState.get('holidays') || []).length;
        hintText   = 'As per policy';
      }

      if (enrolAutoDisplay) {
        enrolAutoDisplay.textContent = closeDate
          ? new Date(closeDate + 'T00:00:00').toLocaleDateString('en-PK', { day:'numeric', month:'short', year:'numeric', weekday:'short' })
          : '— no matching rule';
        enrolAutoDisplay.style.color = closeDate ? 'var(--t1)' : 'var(--t3)';
      }
      if (enrolRuleHint)   enrolRuleHint.textContent = hintText;
      if (enrolDateHidden) enrolDateHidden.value      = closeDate;
    };

    // No manual override — enrolment date is always auto-calculated

    discSel?.addEventListener('change',    updateEnrolDate);
    levelSel?.addEventListener('change',   updateEnrolDate);
    campSel?.addEventListener('change',    updateEnrolDate);
    startYear?.addEventListener('change',  updateEnrolDate);
    startMonth?.addEventListener('change', updateEnrolDate);
    startDay?.addEventListener('change',   updateEnrolDate);
    updateEnrolDate();

    // ── Multi-teacher wiring (clean chip UI) ────────────────────
    const teacherDropdown  = modalEl.querySelector('#batchTeacherSelect');
    const teacherChipList  = modalEl.querySelector('#teacherChipList');
    const teacherFilterBdg = modalEl.querySelector('#teacherFilterBadge');
    const datePopover      = modalEl.querySelector('#teacherDatePopover');
    const popoverFromDate  = modalEl.querySelector('#popoverFromDate');
    const popoverToDate    = modalEl.querySelector('#popoverToDate');
    const popoverSaveBtn   = modalEl.querySelector('#popoverSaveBtn');
    const popoverCancelBtn = modalEl.querySelector('#popoverCancelBtn');
    const popoverTitle     = modalEl.querySelector('#popoverTeacherName');

    // State
    let selectedTeachers = [];   // [{teacherId, fromDate, toDate, isActive}]
    let popoverTargetIdx = null; // which row's dates we're editing

    // ── Build chip row for one teacher entry ──────────────────
    const renderChips = () => {
      if (!teacherChipList) return;
      teacherChipList.innerHTML = '';
      selectedTeachers.forEach((entry, idx) => {
        const t = resolveTeacher(entry.teacherId);
        if (!t) return;
        const initials = t.fullName.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
        const hasDate  = entry.fromDate || entry.toDate;
        const dateLbl  = hasDate
          ? `<span style="font-size:10.5px;font-family:var(--font-mono);color:var(--t3);margin-left:4px">
               ${entry.fromDate || '?'} → ${entry.toDate || 'Present'}
             </span>`
          : '';

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 10px;' +
          'border-radius:8px;border:1px solid ' + (entry.isActive ? 'var(--blue)' : 'var(--border)') + ';' +
          'background:' + (entry.isActive ? 'var(--blue-dim)' : 'var(--surface2)') + ';' +
          'transition:all .15s;cursor:default';

        row.innerHTML = `
          <!-- Radio: set active -->
          <input type="radio" name="activeTeacher" class="bt-active-radio"
                 data-idx="${idx}"
                 style="accent-color:var(--blue);width:14px;height:14px;flex-shrink:0;cursor:pointer"
                 ${entry.isActive ? 'checked' : ''} title="Set as active teacher"/>

          <!-- Avatar + name -->
          <div style="width:26px;height:26px;border-radius:50%;background:var(--blue-dim);
               color:var(--blue);display:flex;align-items:center;justify-content:center;
               font-size:9px;font-weight:700;flex-shrink:0">${initials}</div>
          <div style="flex:1;min-width:0">
            <span style="font-size:12.5px;font-weight:500;color:var(--t1)">${t.fullName}</span>
            ${t.qualification ? `<span style="font-size:10.5px;color:var(--t3);margin-left:5px">${t.qualification}</span>` : ''}
            ${dateLbl}
          </div>

          <!-- Action icons (visible on hover) -->
          <div class="tc-actions" style="display:flex;gap:4px;opacity:0;transition:opacity .15s">
            <button type="button" data-action="dates" data-idx="${idx}"
              title="Set start / end dates"
              style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;
                     border:1px solid var(--border);border-radius:6px;background:var(--surface1);
                     cursor:pointer;color:var(--t3);transition:all .12s"
              onmouseover="this.style.borderColor='var(--blue)';this.style.color='var(--blue)';this.style.background='var(--blue-dim)'"
              onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--t3)';this.style.background='var(--surface1)'">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </button>
            <button type="button" data-action="remove" data-idx="${idx}"
              title="Remove teacher"
              style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;
                     border:1px solid var(--border);border-radius:6px;background:var(--surface1);
                     cursor:pointer;color:var(--t3);transition:all .12s"
              onmouseover="this.style.borderColor='var(--red)';this.style.color='var(--red)';this.style.background='var(--red-dim)'"
              onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--t3)';this.style.background='var(--surface1)'">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
              </svg>
            </button>
          </div>`;

        // Show action icons on hover
        row.addEventListener('mouseenter', () => row.querySelector('.tc-actions').style.opacity = '1');
        row.addEventListener('mouseleave', () => row.querySelector('.tc-actions').style.opacity = '0');

        // Radio change → update active + auto-dates
        row.querySelector('.bt-active-radio').addEventListener('change', () => {
          const today = new Date().toISOString().slice(0,10);
          selectedTeachers.forEach((e, i) => {
            if (i === idx) {
              e.isActive = true;
              if (!e.fromDate) e.fromDate = today;
            } else {
              if (e.isActive && !e.toDate) e.toDate = today;
              e.isActive = false;
            }
          });
          renderChips();
        });

        // Date / Remove button clicks
        row.querySelector('[data-action="dates"]').addEventListener('click', (ev) => {
          ev.stopPropagation();
          openPopover(idx, row.querySelector('[data-action="dates"]'));
        });
        row.querySelector('[data-action="remove"]').addEventListener('click', () => {
          const wasActive = selectedTeachers[idx]?.isActive;
          selectedTeachers.splice(idx, 1);
          if (wasActive && selectedTeachers.length)
            selectedTeachers[selectedTeachers.length - 1].isActive = true;
          renderChips();
          // Re-add to dropdown
          rebuildDropdown();
        });

        teacherChipList.appendChild(row);
      });
    };

    // ── Date popover ──────────────────────────────────────────
    // Move popover to document.body so it's never clipped by modal overflow
    if (datePopover && datePopover.parentNode !== document.body) {
      document.body.appendChild(datePopover);
    }

    const openPopover = (idx, anchorEl) => {
      popoverTargetIdx = idx;
      const t = resolveTeacher(selectedTeachers[idx].teacherId);
      if (popoverTitle) popoverTitle.textContent = t ? t.fullName : 'Set Dates';
      popoverFromDate.value = selectedTeachers[idx].fromDate || '';
      popoverToDate.value   = selectedTeachers[idx].toDate   || '';

      // Show first so we can measure its size
      datePopover.style.display = 'block';

      // Use fixed positioning relative to viewport
      const rect = anchorEl.getBoundingClientRect();
      const pw = datePopover.offsetWidth  || 280;
      const ph = datePopover.offsetHeight || 160;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Try left of the button, fallback to right
      let left = rect.left - pw - 8;
      if (left < 8) left = rect.right + 8;
      // Clamp so it doesn't go off-screen right
      if (left + pw > vw - 8) left = vw - pw - 8;

      // Align top with button, clamp vertically
      let top = rect.top - 10;
      if (top + ph > vh - 8) top = vh - ph - 8;
      if (top < 8) top = 8;

      datePopover.style.left = left + 'px';
      datePopover.style.top  = top  + 'px';
    };

    const closePopover = () => {
      if (datePopover) datePopover.style.display = 'none';
      popoverTargetIdx = null;
    };

    popoverSaveBtn?.addEventListener('click', () => {
      if (popoverTargetIdx === null) return;
      selectedTeachers[popoverTargetIdx].fromDate = popoverFromDate.value || '';
      selectedTeachers[popoverTargetIdx].toDate   = popoverToDate.value   || '';
      closePopover();
      renderChips();
    });
    popoverCancelBtn?.addEventListener('click', closePopover);

    // Close popover on outside click
    document.addEventListener('click', (e) => {
      if (datePopover && datePopover.style.display !== 'none') {
        if (!datePopover.contains(e.target) && !e.target.closest('[data-action="dates"]'))
          closePopover();
      }
    }, { capture: true });

    // ── Rebuild teacher dropdown (remove already-selected) ────
    const rebuildDropdown = () => {
      if (!teacherDropdown) return;
      const discId = modalEl.querySelector('#batchDiscSelect')?.value  || '';
      const campId = modalEl.querySelector('#batchCampSelect')?.value  || '';
      const { teachers } = getFilteredTeachers(discId, campId);
      const selectedIds  = new Set(selectedTeachers.map(e => e.teacherId));
      teacherDropdown.innerHTML =
        '<option value="">Select a teacher…</option>' +
        teachers.map(t =>
          selectedIds.has(t.id) ? '' :
          `<option value="${t.id}">${t.fullName}${t.qualification ? ' — ' + t.qualification : ''}</option>`
        ).join('');
    };

    // ── Selecting from dropdown adds a chip ───────────────────
    teacherDropdown?.addEventListener('change', () => {
      const tid = teacherDropdown.value;
      if (!tid) return;
      const alreadyAdded = selectedTeachers.some(e => e.teacherId === tid);
      if (alreadyAdded) { teacherDropdown.value = ''; return; }

      const isFirst = selectedTeachers.length === 0;
      selectedTeachers.push({
        teacherId: tid,
        fromDate:  '',
        toDate:    '',
        isActive:  isFirst,   // first one auto-active
      });
      teacherDropdown.value = '';   // reset dropdown
      rebuildDropdown();
      renderChips();
    });

    // ── Init: load existing teachers from batch data ──────────
    {
      const existingTeachers = existing?.teachers
        || (existing?.teacherId ? [{
              teacherId:   existing.teacherId,
              teacherName: existing.teacherName || '',
              fromDate:    existing.startDate   || '',
              toDate:      '',
              isActive:    true,
           }]
        : []);

      existingTeachers.forEach(et => {
        selectedTeachers.push({
          teacherId: et.teacherId,
          fromDate:  et.fromDate || '',
          toDate:    et.toDate   || '',
          isActive:  !!et.isActive,
        });
      });

      // Ensure one active
      if (selectedTeachers.length && !selectedTeachers.some(e => e.isActive))
        selectedTeachers[0].isActive = true;

      rebuildDropdown();
      renderChips();
    }

    // ── Sync Subject Snapshot button ──────────────────────────
    // Pulls live subjectCode + subjectName from master into THIS batch only.
    // FIX: subjectSel.value is unreliable when dropdown is disabled (returns "").
    // We read the dropdown's value only when it is NOT disabled — otherwise
    // fall back to existing.subjectId (what is actually saved on the record).
    const syncBtn = modalEl.querySelector('#syncSubjectSnapshotBtn');
    if (syncBtn && existing) {
      syncBtn.addEventListener('click', () => {
        // Read from dropdown only when it is enabled and has a real selection.
        // Disabled dropdowns always return "" even when options are present.
        const dropdownVal   = (subjectSel && !subjectSel.disabled && subjectSel.value)
                              ? subjectSel.value
                              : null;
        const currentSubjId = dropdownVal || existing.subjectId || null;

        if (!currentSubjId) {
          Toast.error('Is batch mein koi subject set nahi — pehle level select karo phir subject choose karo.');
          return;
        }

        const liveSubject = AppState.findById('subjects', currentSubjId);
        if (!liveSubject) {
          Toast.error('Yeh subject master data mein nahi mila — shayad delete ho gaya.');
          return;
        }

        const newCode = liveSubject.subjectCode || '';
        const newName = liveSubject.subjectName || '';

        // Rebuild batchName using synced code
        const currentSession = sessionHidden?.value || existing.sessionPeriod || '';
        const currentNo      = parseInt(batchNoInp?.value) || existing.batchNo || 1;
        const newBatchName   = newCode
          ? `${newCode.toUpperCase()}-${currentSession}-${fmt2(currentNo)}`
          : batchNameInp?.value || existing.batchName || '';

        // Write snapshot + subjectId into the saved batch record immediately
        AppState.update(KEY, existing.id, {
          subjectId:   currentSubjId,
          subjectCode: newCode,
          subjectName: newName,
          batchName:   newBatchName,
        });

        // Update form display immediately
        if (batchNameInp) batchNameInp.value = newBatchName;

        // Refresh the snapshot info strip so user sees new frozen values
        const infoStrip = modalEl.querySelector('#subjectSnapshotInfo');
        if (infoStrip) {
          infoStrip.innerHTML = `
            <span style="color:var(--t4);font-size:10px">SAVED SNAPSHOT</span><br/>
            Code: <strong style="color:var(--green)">${newCode || '—'}</strong>
            &nbsp;|&nbsp;
            Name: <strong style="color:var(--green)">${newName || '—'}</strong>
            &nbsp;<span style="color:var(--green);font-size:10px">✓ synced</span>
          `;
        }

        Toast.success(
          `Snapshot synced → ${newCode}${newName ? ' — ' + newName : ''}. ` +
          `Batch name updated to "${newBatchName}".`
        );
      });
    }

    // Expose selectedTeachers on modalEl for save handler
    modalEl._selectedTeachers = selectedTeachers;
  },

  // ── Delete ───────────────────────────────────────────────────
  async _delete(row, container) {
    const ok = await Modal.confirm({
      title:        'Delete Batch',
      message:      `Are you sure you want to delete batch <strong>${row.batchName}</strong>? This action cannot be undone.`,
      confirmLabel: 'Delete',
      danger:       true,
    });
    if (!ok) return;
    AppState.remove(KEY, row.id);
    Toast.success(`Batch "${row.batchName}" has been deleted.`);
    this._render(container);
  },

  // ── Toolbar ──────────────────────────────────────────────────
  _attachToolbar(container) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    const canCreate = Auth.can('batches:create');
    const addBtn    = el.querySelector('#batchAddBtn');

    if (addBtn) {
      if (!canCreate) { addBtn.disabled = true; addBtn.style.opacity = '0.4'; }
      else addBtn.addEventListener('click', () => this._openForm(null, el));
    }

    let searchVal = '';
    let discVals = [], campusVals = [], sessionVals = [], levelVals = [];

    const rerender = () => this._render(el, searchVal, discVals, campusVals, sessionVals, levelVals);

    el.querySelector('#batchSearch')?.addEventListener('input', e => {
      searchVal = e.target.value.toLowerCase().trim();
      rerender();
    });

    // ── Init custom multi-select dropdowns ─────────────────────
    this._initMultiFilters(el, {
      onDisc:    vals => { discVals = vals; levelVals = []; this._refreshLevelOpts(el, vals); rerender(); },
      onCampus:  vals => { campusVals  = vals; rerender(); },
      onSession: vals => { sessionVals = vals; rerender(); },
      onLevel:   vals => { levelVals   = vals; rerender(); },
    });

    // ── Export buttons ─────────────────────────────────────────
    const getFilterLabels = () => {
      const labels = [];
      if (searchVal) labels.push(`Search: "${searchVal}"`);
      if (discVals.length) {
        const names = discVals.map(id => AppState.findById('disciplines', id)?.abbreviation).filter(Boolean);
        labels.push(`Discipline: ${names.join(', ')}`);
      }
      if (campusVals.length) {
        const names = campusVals.map(id => AppState.findById('campuses', id)?.campusName.replace(/\s*campus$/i,'').trim()).filter(Boolean);
        labels.push(`Campus: ${names.join(', ')}`);
      }
      if (sessionVals.length) labels.push(`Session: ${sessionVals.join(', ')}`);
      if (levelVals.length) {
        const names = levelVals.map(id => AppState.findById('levels', id)?.levelName).filter(Boolean);
        labels.push(`Level: ${names.join(', ')}`);
      }
      return labels;
    };

    el.querySelector('#batchExportExcel')?.addEventListener('click', () => {
      this._exportExcel(el._filteredRows || [], getFilterLabels());
    });
    el.querySelector('#batchExportPDF')?.addEventListener('click', () => {
      this._exportPDF(el._filteredRows || [], getFilterLabels());
    });

    // ── Bulk Import button ─────────────────────────────────────
    el.querySelector('#batchBulkImportBtn')?.addEventListener('click', () => {
      this._openBulkImportModal(el);
    });
  },

  // ── Bulk Import Modal ────────────────────────────────────────
  _openBulkImportModal(container) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;

    const overlay = document.createElement('div');
    overlay.id = 'batchBulkImportOverlay';
    overlay.innerHTML = `
      <div style="
        position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;
        display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box
      ">
        <div style="
          background:var(--surface1,#fff);border-radius:14px;width:100%;max-width:640px;
          max-height:90dvh;display:flex;flex-direction:column;overflow:hidden;
          box-shadow:0 20px 60px rgba(0,0,0,.25)
        ">
          <!-- Header -->
          <div style="padding:18px 22px 14px;border-bottom:1px solid var(--border,#e5e7eb);flex-shrink:0">
            <div style="display:flex;align-items:center;justify-content:space-between">
              <div>
                <div style="font-size:16px;font-weight:700;color:var(--t1,#111)">Bulk Import Batches</div>
                <div style="font-size:12px;color:var(--t3,#888);margin-top:2px">Upload a CSV file to add multiple batches at once</div>
              </div>
              <button id="biBulkClose" style="
                width:30px;height:30px;border-radius:50%;border:1px solid var(--border,#e5e7eb);
                background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;
                color:var(--t3,#888);font-size:18px;line-height:1;font-family:inherit
              ">×</button>
            </div>
          </div>

          <!-- Body -->
          <div style="flex:1;overflow-y:auto;padding:18px 22px;display:flex;flex-direction:column;gap:14px">

            <!-- CSV format hint -->
            <div style="
              background:var(--blue-dim,#eff6ff);border:1px solid var(--blue,#3b82f6);
              border-radius:8px;padding:12px 14px
            ">
              <div style="font-size:12px;font-weight:700;color:var(--blue,#3b82f6);margin-bottom:6px">
                📋 CSV Columns (in order)
              </div>
              <div style="font-family:monospace;font-size:11px;color:var(--t2,#555);word-break:break-all;line-height:1.8">
                subjectCode, sessionPeriod, disciplineName, campusAbbr, levelName, teacherName, startDate, endDate, totalSeats, batchNo
              </div>
              <div style="font-size:11px;color:var(--t3,#888);margin-top:8px;line-height:1.7">
                • <b>campusAbbr</b>: short code defined in your system (e.g. Pr, Pt, St, F8)<br>
                • <b>sessionPeriod</b>: Dec-25 or June-26<br>
                • <b>startDate / endDate</b>: YYYY-MM-DD format<br>
                • <b>batchNo</b>: optional — agar chhorein toh auto assign hoga<br>
                • <b>subjectCode, teacherName, totalSeats</b>: optional
              </div>
            </div>

            <!-- Download template -->
            <div style="display:flex;gap:8px;align-items:center">
              <button id="biBulkDownloadTpl" style="
                font-size:12px;color:var(--blue,#3b82f6);background:none;
                border:1px dashed var(--blue,#3b82f6);border-radius:7px;
                padding:6px 14px;cursor:pointer;font-family:inherit
              ">⬇ Download CSV Template</button>
              <span style="font-size:11px;color:var(--t3,#888)">Fill it and upload below</span>
            </div>

            <!-- Drop zone -->
            <label id="biBulkDropZone" style="
              border:2px dashed var(--border2,#d1d5db);border-radius:10px;
              padding:28px;text-align:center;cursor:pointer;transition:all .15s;display:block
            ">
              <div style="font-size:22px;margin-bottom:6px">📂</div>
              <div style="font-size:13px;font-weight:600;color:var(--t2,#555)">Click to select CSV file</div>
              <div style="font-size:11px;color:var(--t4,#aaa);margin-top:4px">or drag and drop here</div>
              <input id="biBulkFileInput" type="file" accept=".csv,text/csv" style="display:none"/>
            </label>

            <!-- File name indicator -->
            <div id="biBulkFileInfo" style="display:none;font-size:12px;color:var(--t2,#555);
              background:var(--surface2,#f9fafb);border-radius:7px;padding:8px 12px">
            </div>

            <!-- Results -->
            <div id="biBulkResults" style="display:none;flex-direction:column;gap:8px"></div>

          </div>

          <!-- Footer -->
          <div style="
            padding:14px 22px;border-top:1px solid var(--border,#e5e7eb);
            display:flex;gap:8px;justify-content:flex-end;flex-shrink:0
          ">
            <button id="biBulkCancelBtn" style="
              padding:8px 18px;border-radius:8px;border:1px solid var(--border,#e5e7eb);
              background:none;color:var(--t2,#555);cursor:pointer;font-size:13px;font-family:inherit
            ">Cancel</button>
            <button id="biBulkImportBtn" disabled style="
              padding:8px 20px;border-radius:8px;border:none;
              background:var(--blue,#3b82f6);color:#fff;cursor:not-allowed;
              font-size:13px;font-weight:600;font-family:inherit;opacity:.5
            ">Import Batches</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    let parsedResult = null;

    const closeModal = () => overlay.remove();

    overlay.querySelector('#biBulkClose')  .addEventListener('click', closeModal);
    overlay.querySelector('#biBulkCancelBtn').addEventListener('click', closeModal);

    // Template download
    overlay.querySelector('#biBulkDownloadTpl').addEventListener('click', () => {
      const header  = 'subjectCode,sessionPeriod,disciplineName,campusAbbr,levelName,teacherName,startDate,endDate,totalSeats,batchNo';
      const example = 'FA1,Dec-25,Computer Science,Pr,Level 1,Ali Hassan,2025-07-01,2025-12-31,20,';
      const blob = new Blob([header + '\n' + example], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'batch_import_template.csv';
      a.click();
    });

    // Drag & drop
    const dropZone = overlay.querySelector('#biBulkDropZone');
    dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--blue,#3b82f6)';
      dropZone.style.background  = 'var(--blue-dim,#eff6ff)';
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = '';
      dropZone.style.background  = '';
    });
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.style.borderColor = '';
      dropZone.style.background  = '';
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFile(file);
    });

    const fileInput = overlay.querySelector('#biBulkFileInput');
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) handleFile(fileInput.files[0]);
    });

    const fileInfo   = overlay.querySelector('#biBulkFileInfo');
    const resultsDiv = overlay.querySelector('#biBulkResults');
    const importBtn  = overlay.querySelector('#biBulkImportBtn');

    const handleFile = (file) => {
      fileInfo.style.display = 'block';
      fileInfo.textContent = `📄 ${file.name}  (${(file.size / 1024).toFixed(1)} KB)`;
      const reader = new FileReader();
      reader.onload = e => {
        parsedResult = _bi_processCSV(e.target.result);
        showPreview(parsedResult);
      };
      reader.readAsText(file);
    };

    const showPreview = ({ success, errors }) => {
      resultsDiv.style.display = 'flex';
      resultsDiv.innerHTML = '';

      // Summary
      const summary = document.createElement('div');
      summary.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:var(--surface2,#f9fafb);border-radius:8px;padding:10px 14px';
      const hardErrors = errors.filter(e => !e.warn).length;
      const warns      = errors.filter(e =>  e.warn).length;
      summary.innerHTML = `
        <span style="font-size:13px;font-weight:700;color:var(--t1,#111)">Preview</span>
        <span style="background:var(--green-dim,#dcfce7);color:var(--green,#16a34a);font-size:11.5px;font-weight:700;padding:2px 10px;border-radius:10px">
          ✓ ${success.length} ready to import
        </span>
        ${hardErrors ? `<span style="background:var(--red-dim,#fee2e2);color:var(--red,#dc2626);font-size:11.5px;font-weight:700;padding:2px 10px;border-radius:10px">✗ ${hardErrors} error(s)</span>` : ''}
        ${warns      ? `<span style="background:var(--yellow-dim,#fef9c3);color:var(--yellow,#ca8a04);font-size:11.5px;font-weight:700;padding:2px 10px;border-radius:10px">⚠ ${warns} warning(s)</span>` : ''}
      `;
      resultsDiv.appendChild(summary);

      // Errors list
      if (errors.length) {
        const errBox = document.createElement('div');
        errBox.style.cssText = 'border:1px solid var(--border,#e5e7eb);border-radius:8px;max-height:150px;overflow-y:auto;font-size:11.5px';
        errBox.innerHTML = errors.map(e => `
          <div style="padding:7px 12px;border-bottom:1px solid var(--border,#e5e7eb);
            color:${e.warn ? 'var(--yellow,#ca8a04)' : 'var(--red,#dc2626)'};display:flex;gap:8px">
            <span style="flex-shrink:0;font-family:monospace;color:var(--t4,#aaa)">Row ${e.line}</span>
            <span>${e.msg}</span>
          </div>
        `).join('');
        resultsDiv.appendChild(errBox);
      }

      // Success table preview — editable batchNo
      if (success.length) {
        const previewBox = document.createElement('div');
        previewBox.style.cssText = 'border:1px solid var(--border,#e5e7eb);border-radius:8px;overflow:auto;max-height:220px';

        const rebuildBatchName = (b, newNo) => {
          // Use snapshot fields already present on the batch object
          // (set by _buildBatchObject during CSV processing).
          // Live lookups would reflect post-rename master data and
          // produce a name inconsistent with the stored record.
          const prefix = b.subjectCode || b.disciplineAbbr || 'XX';
          return `${prefix.toUpperCase()}-${b.sessionPeriod}-${fmt2(newNo)}`;
        };

        const renderTable = () => {
          previewBox.innerHTML = `
            <table style="width:100%;border-collapse:collapse;font-size:11.5px">
              <thead>
                <tr style="background:var(--surface2,#f9fafb)">
                  <th style="padding:7px 10px;text-align:left;color:var(--t3,#888);font-weight:600;white-space:nowrap">Batch #</th>
                  <th style="padding:7px 10px;text-align:left;color:var(--t3,#888);font-weight:600;white-space:nowrap">Batch Name</th>
                  <th style="padding:7px 10px;text-align:left;color:var(--t3,#888);font-weight:600">Session</th>
                  <th style="padding:7px 10px;text-align:left;color:var(--t3,#888);font-weight:600">Campus</th>
                  <th style="padding:7px 10px;text-align:left;color:var(--t3,#888);font-weight:600">Level</th>
                  <th style="padding:7px 10px;text-align:left;color:var(--t3,#888);font-weight:600">Teacher</th>
                </tr>
              </thead>
              <tbody>
                ${parsedResult.success.map((b, idx) => {
                  // Use snapshot fields set by _buildBatchObject — avoids live
                  // lookup inconsistency and prevents raw IDs showing in UI.
                  const short = (b.campusName || '').replace(/\s*campus$/i, '').trim() || '—';
                  const lvlDisplay = b.levelName || '—';
                  return `
                    <tr style="border-top:1px solid var(--border,#e5e7eb)" data-bi-idx="${idx}">
                      <td style="padding:4px 8px;width:70px">
                        <input
                          type="number" min="1" value="${b.batchNo}"
                          data-bi-no="${idx}"
                          style="width:54px;padding:3px 6px;font-family:monospace;font-weight:700;
                                 font-size:12px;border:1px solid var(--border,#e5e7eb);
                                 border-radius:5px;background:var(--surface2,#f9fafb);
                                 color:var(--t1,#111);outline:none;text-align:center"
                        />
                      </td>
                      <td style="padding:6px 10px;font-family:monospace;font-weight:700;color:var(--blue,#3b82f6)" data-bi-name="${idx}">${b.batchName}</td>
                      <td style="padding:6px 10px;color:var(--t2,#555)">${b.sessionPeriod}</td>
                      <td style="padding:6px 10px;color:var(--t2,#555)">${short}</td>
                      <td style="padding:6px 10px;color:var(--t2,#555)">${lvlDisplay}</td>
                      <td style="padding:6px 10px;color:var(--t2,#555)">${b.teacherName || '—'}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          `;

          // Wire batchNo inputs — live update batchName cell
          previewBox.querySelectorAll('input[data-bi-no]').forEach(inp => {
            inp.addEventListener('input', () => {
              const idx    = parseInt(inp.dataset.biNo);
              const newNo  = parseInt(inp.value) || 1;
              parsedResult.success[idx].batchNo   = newNo;
              parsedResult.success[idx].batchName = rebuildBatchName(parsedResult.success[idx], newNo);
              const nameCell = previewBox.querySelector(`[data-bi-name="${idx}"]`);
              if (nameCell) nameCell.textContent = parsedResult.success[idx].batchName;

              // Highlight duplicate within this import batch
              const nos = parsedResult.success.map((b, i) =>
                `${b.sessionPeriod}|${b.subjectId||''}|${b.campusId}|${b.batchNo}`
              );
              previewBox.querySelectorAll('input[data-bi-no]').forEach(i2 => {
                const i2idx = parseInt(i2.dataset.biNo);
                const key   = `${parsedResult.success[i2idx].sessionPeriod}|${parsedResult.success[i2idx].subjectId||''}|${parsedResult.success[i2idx].campusId}|${parsedResult.success[i2idx].batchNo}`;
                const isDup = nos.filter(k => k === key).length > 1;
                i2.style.borderColor = isDup ? 'var(--red,#dc2626)' : 'var(--border,#e5e7eb)';
                i2.style.background  = isDup ? 'var(--red-dim,#fee2e2)' : 'var(--surface2,#f9fafb)';
                i2.title             = isDup ? '⚠ Duplicate batch number in this import!' : '';
              });
            });
          });
        };

        renderTable();
        resultsDiv.appendChild(previewBox);

        // Hint text
        const hint = document.createElement('div');
        hint.style.cssText = 'font-size:11px;color:var(--t3,#888);text-align:right;margin-top:-8px';
        hint.textContent = '✏ Batch # column mein change kar sakte hain — batch name live update hoga';
        resultsDiv.appendChild(hint);
      }

      // Toggle import button
      importBtn.disabled = success.length === 0;
      importBtn.style.opacity = success.length ? '1' : '.5';
      importBtn.style.cursor  = success.length ? 'pointer' : 'not-allowed';
    };

    importBtn.addEventListener('click', () => {
      if (!parsedResult?.success?.length) return;
      parsedResult.success.forEach(b => AppState.add(KEY, b));
      Toast.success(`✓ ${parsedResult.success.length} batch${parsedResult.success.length > 1 ? 'es' : ''} imported successfully!`);
      closeModal();
      this._render(el);
    });
  },

  // ── Multi-select filter init ─────────────────────────────────
  _initMultiFilters(el, { onDisc, onCampus, onSession, onLevel }) {
    const configs = [
      { id: 'batchDiscFilter',    cb: onDisc    },
      { id: 'batchCampusFilter',  cb: onCampus  },
      { id: 'batchSessionFilter', cb: onSession },
      { id: 'batchLevelFilter',   cb: onLevel   },
    ];

    // Inject styles once
    if (!document.getElementById('batch-mf-style')) {
      const st = document.createElement('style');
      st.id = 'batch-mf-style';
      st.textContent = `
        .batch-mf { position:relative; flex-shrink:0; }
        .batch-mf-btn {
          display:flex; align-items:center; gap:5px; cursor:pointer;
          padding:0 10px; height:34px; border:1px solid var(--border);
          border-radius:8px; background:var(--surface2); color:var(--t2);
          font-size:12.5px; white-space:nowrap; user-select:none;
          min-width:90px; max-width:180px;
        }
        .batch-mf-btn:hover { border-color:var(--blue); color:var(--blue); }
        .batch-mf-btn.active { border-color:var(--blue); background:var(--blue-dim); color:var(--blue); font-weight:600; }
        .batch-mf-btn .mf-label { overflow:hidden; text-overflow:ellipsis; flex:1; }
        .batch-mf-btn .mf-caret { font-size:9px; flex-shrink:0; opacity:0.6; }
        .batch-mf-btn .mf-badge {
          background:var(--blue); color:#fff; font-size:9.5px; font-weight:700;
          border-radius:10px; padding:1px 5px; flex-shrink:0;
        }
        .batch-mf-panel {
          position:absolute; top:calc(100% + 4px); left:0; z-index:999;
          background:var(--surface1, #ffffff); border:1px solid var(--border, #e2e8f0);
          border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.12);
          min-width:180px; max-width:260px; overflow:hidden;
          display:none; flex-direction:column;
        }
        .batch-mf-panel.open { display:flex; }
        .batch-mf-search {
          padding:8px 10px 4px; border-bottom:1px solid var(--border);
        }
        .batch-mf-search input {
          width:100%; padding:4px 8px; font-size:12px;
          border:1px solid var(--border); border-radius:6px;
          background:var(--surface2); color:var(--t1); outline:none;
        }
        .batch-mf-list { overflow-y:auto; max-height:220px; padding:4px 0; }
        .batch-mf-item {
          display:flex; align-items:center; gap:8px;
          padding:6px 12px; cursor:pointer; font-size:12.5px; color:var(--t2);
        }
        .batch-mf-item:hover { background:var(--blue-dim); color:var(--blue); }
        .batch-mf-item.checked { color:var(--blue); font-weight:600; }
        .batch-mf-item input[type=checkbox] { accent-color:var(--blue); flex-shrink:0; }
        .batch-mf-footer {
          border-top:1px solid var(--border); padding:6px 10px;
          display:flex; gap:6px; justify-content:flex-end;
        }
        .batch-mf-footer button {
          font-size:11px; padding:3px 10px; border-radius:6px; cursor:pointer; border:1px solid var(--border);
          background:var(--surface2); color:var(--t2);
        }
        .batch-mf-footer button.primary {
          background:var(--blue); color:#fff; border-color:var(--blue);
        }
      `;
      document.head.appendChild(st);
    }

    configs.forEach(({ id, cb }) => {
      const wrap = el.querySelector('#' + id);
      if (!wrap) return;

      const isMono  = wrap.dataset.mono === '1';
      const label   = wrap.dataset.label || 'Filter';
      wrap._mfItems = [...wrap.children]
        .filter(s => s.dataset && s.dataset.val !== undefined)
        .map(s => ({ val: s.dataset.val, label: s.textContent.trim() }));
      wrap.innerHTML = '';
      let selected = new Set();
      wrap._mfSelected = selected;

      // Build DOM
      const btn = document.createElement('div');
      btn.className = 'batch-mf-btn';
      btn.innerHTML = `<span class="mf-label">All ${label}s</span><span class="mf-caret">▾</span>`;

      const panel = document.createElement('div');
      panel.className = 'batch-mf-panel';

      // Search box inside panel
      const searchWrap = document.createElement('div');
      searchWrap.className = 'batch-mf-search';
      const searchInp = document.createElement('input');
      searchInp.placeholder = `Search ${label.toLowerCase()}…`;
      searchWrap.appendChild(searchInp);
      panel.appendChild(searchWrap);

      const list = document.createElement('div');
      list.className = 'batch-mf-list';
      panel.appendChild(list);

      const footer = document.createElement('div');
      footer.className = 'batch-mf-footer';
      const clearBtn = document.createElement('button');
      clearBtn.textContent = 'Clear';
      footer.appendChild(clearBtn);
      panel.appendChild(footer);

      wrap.appendChild(btn);
      wrap.appendChild(panel);

      const renderList = (q = '') => {
        const liveItems = wrap._mfItems;
        const filtered = q ? liveItems.filter(i => i.label.toLowerCase().includes(q.toLowerCase())) : liveItems;
        list.innerHTML = filtered.map(i => `
          <label class="batch-mf-item ${selected.has(i.val) ? 'checked' : ''}">
            <input type="checkbox" value="${i.val}" ${selected.has(i.val) ? 'checked' : ''}/>
            <span style="${isMono ? 'font-family:var(--font-mono)' : ''}">${i.label}</span>
          </label>
        `).join('');
        list.querySelectorAll('input[type=checkbox]').forEach(chk => {
          chk.addEventListener('change', () => {
            if (chk.checked) selected.add(chk.value);
            else             selected.delete(chk.value);
            updateBtn();
            cb([...selected]);
          });
        });
      };
      wrap._mfRenderList = renderList;

      const updateBtn = () => {
        const count = selected.size;
        if (count === 0) {
          btn.className = 'batch-mf-btn';
          btn.innerHTML = `<span class="mf-label">All ${label}s</span><span class="mf-caret">▾</span>`;
        } else if (count === 1) {
          const lbl = wrap._mfItems.find(i => i.val === [...selected][0])?.label || '';
          btn.className = 'batch-mf-btn active';
          btn.innerHTML = `<span class="mf-label">${lbl}</span><span class="mf-caret">▾</span>`;
        } else {
          btn.className = 'batch-mf-btn active';
          btn.innerHTML = `<span class="mf-label">${label}</span><span class="mf-badge">${count}</span><span class="mf-caret">▾</span>`;
        }
      };

      clearBtn.addEventListener('click', () => {
        selected.clear();
        renderList(searchInp.value);
        updateBtn();
        cb([]);
      });

      searchInp.addEventListener('input', () => renderList(searchInp.value));

      btn.addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = panel.classList.contains('open');
        // Close all other panels first
        document.querySelectorAll('.batch-mf-panel.open').forEach(p => p.classList.remove('open'));
        if (!isOpen) {
          panel.classList.add('open');
          searchInp.value = '';
          renderList();
          searchInp.focus();
        }
      });

      renderList();
    });

    // Close panels on outside click
    document.addEventListener('click', () => {
      document.querySelectorAll('.batch-mf-panel.open').forEach(p => p.classList.remove('open'));
    });
  },

  // Refresh level options when discipline filter changes
  _refreshLevelOpts(el, discVals) {
    const wrap = el.querySelector('#batchLevelFilter');
    if (!wrap) return;
    const allLevels = AppState.get('levels') || [];
    const filtered  = discVals.length
      ? allLevels.filter(l => discVals.includes(l.disciplineId))
      : allLevels;
    wrap._mfItems = filtered.map(l => ({ val: l.id, label: l.levelName }));
    if (wrap._mfSelected) wrap._mfSelected.clear();
    const btn = wrap.querySelector('.batch-mf-btn');
    if (btn) { btn.className = 'batch-mf-btn'; btn.innerHTML = `<span class="mf-label">All Levels</span><span class="mf-caret">▾</span>`; }
    if (wrap._mfRenderList) wrap._mfRenderList('');
  },

  // ── One-time migration: backfill snapshot fields on pre-v5 records ─────
  // Idempotent — only patches records that are actually missing fields.
  // Runs silently on mount so export/display never shows [unsnapshotted].
  _migrateSnapshots() {
    const batches     = AppState.get(KEY) || [];
    const subjects    = AppState.get('subjects')    || [];
    const disciplines = AppState.get('disciplines') || [];
    const campuses    = AppState.get('campuses')    || [];
    const levels      = AppState.get('levels')      || [];

    let patched = 0;
    batches.forEach(b => {
      const patch = {};

      if (b.subjectId && (!b.subjectCode || !b.subjectName)) {
        const s = subjects.find(x => x.id === b.subjectId);
        if (s) {
          if (!b.subjectCode) patch.subjectCode = s.subjectCode || '';
          if (!b.subjectName) patch.subjectName = s.subjectName || '';
        }
      }
      if (b.disciplineId && (!b.disciplineAbbr || !b.disciplineName)) {
        const d = disciplines.find(x => x.id === b.disciplineId);
        if (d) {
          if (!b.disciplineAbbr) patch.disciplineAbbr = d.abbreviation || '';
          if (!b.disciplineName) patch.disciplineName = d.fullName     || '';
        }
      }
      if (b.campusId && !b.campusName) {
        const c = campuses.find(x => x.id === b.campusId);
        if (c) patch.campusName = c.campusName || '';
      }
      if (b.levelId && !b.levelName) {
        const l = levels.find(x => x.id === b.levelId);
        if (l) patch.levelName = l.levelName || '';
      }

      if (Object.keys(patch).length > 0) {
        AppState.update(KEY, b.id, patch);
        patched++;
      }
    });

    if (patched > 0) {
      console.info(`[batch] Migrated snapshot fields on ${patched} batch record(s).`);
    }
  },

  // ── Export helpers ──────────────────────────────────────────────
  _buildReportRows(rows) {
    return rows.map(b => {
      // Snapshot preferred — accurate for historical exports even
      // after master data has been renamed.  Live lookup is only
      // a fallback for records created before v5 (no snapshots).
      const discAbbr  = b.disciplineAbbr
        || AppState.findById('disciplines', b.disciplineId)?.abbreviation || '—';
      const levelName = b.levelName
        || AppState.findById('levels',      b.levelId)?.levelName         || '—';
      const rawCampus = b.campusName
        || AppState.findById('campuses',    b.campusId)?.campusName       || '';
      const campShort = rawCampus.replace(/\s*campus$/i,'').trim() || '—';

      // Subject: snapshot fields are the source of truth.
      // For pre-snapshot records that only have subjectId and no
      // subjectCode/subjectName stored, we show a safe placeholder
      // rather than doing a live master lookup — a live lookup would
      // silently reflect any master rename and break historical accuracy.
      // Subject: snapshot preferred; live lookup fallback for pre-v5 records
      let subjLabel = '—';
      if (b.subjectCode && b.subjectName) {
        subjLabel = `${b.subjectCode} — ${b.subjectName}`;
      } else if (b.subjectCode) {
        subjLabel = b.subjectCode;
      } else if (b.subjectId) {
        // Pre-snapshot: do live lookup as fallback (better than showing error text)
        const liveSubj = AppState.findById('subjects', b.subjectId);
        if (liveSubj) {
          subjLabel = liveSubj.subjectCode
            ? `${liveSubj.subjectCode} — ${liveSubj.subjectName}`
            : liveSubj.subjectName || b.subjectId;
        }
      }

      const teacher = resolveTeacher(b.teacherId);

      return {
        'Batch Name':   b.batchName     || '—',
        'Session':      b.sessionPeriod || '—',
        '#':            fmt2(b.batchNo  || 1),
        'Discipline':   discAbbr,
        'Level':        levelName,
        'Subject':      subjLabel,
        'Campus':       campShort,
        'Teacher':      teacher ? teacher.fullName : (b.teacherName || '—'),
        'Start Date':   b.startDate || '—',
        'End Date':     b.endDate   || '—',
        'Duration':     calcDuration(b.startDate, b.endDate) || '—',
        'Capacity':     b.maxStudents ? `${b.maxStudents} seats` : '—',
      };
    });
  },

  _exportExcel(rows, filterLabels) {
    if (!rows.length) { Toast.error('No data to export.'); return; }
    const data    = this._buildReportRows(rows);
    const headers = Object.keys(data[0]);
    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });

    // Build CSV (opens in Excel perfectly)
    const metaLines = [
      `Batch Report`,
      `Generated: ${dateStr} ${now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`,
      filterLabels.length ? `Filters: ${filterLabels.join(' | ')}` : 'Filters: None',
      `Total Batches: ${rows.length}`,
      '',
    ];
    const csvRows = [
      metaLines.join('\n'),
      headers.join(','),
      ...data.map(r => headers.map(h => `"${(r[h]||'').replace(/"/g,'""')}"`).join(',')),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `Batch-Report-${dateStr.replace(/ /g,'-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    Toast.success(`Exported ${rows.length} batch${rows.length!==1?'es':''} to Excel.`);
  },

  _exportPDF(rows, filterLabels) {
    if (!rows.length) { Toast.error('No data to export.'); return; }
    const data    = this._buildReportRows(rows);
    const headers = Object.keys(data[0]);
    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

    const colWidths = {
      'Batch Name': 110, 'Session': 65, '#': 28, 'Discipline': 70, 'Level': 75,
      'Subject': 130, 'Campus': 50, 'Teacher': 110, 'Start Date': 72, 'End Date': 72, 'Duration': 65, 'Capacity': 55,
    };

    const thCells = headers.map(h =>
      `<th style="width:${colWidths[h]||80}px">${h}</th>`
    ).join('');

    const tdRows = data.map((r, i) =>
      `<tr class="${i%2===0?'even':'odd'}">` +
        headers.map(h => `<td>${r[h]||'—'}</td>`).join('') +
      `</tr>`
    ).join('');

    const filterHTML = filterLabels.length
      ? filterLabels.map(f => `<span class="filter-chip">${f}</span>`).join('')
      : '<span class="filter-chip" style="background:#f1f5f9;color:#64748b">No filters applied — showing all batches</span>';

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Batch Report</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#1e293b;background:#fff;padding:20px 24px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #2563eb;padding-bottom:12px;margin-bottom:14px}
  .header-left .title{font-size:20px;font-weight:700;color:#1e40af;letter-spacing:-0.3px}
  .header-left .subtitle{font-size:11px;color:#64748b;margin-top:2px}
  .header-right{text-align:right;font-size:10.5px;color:#64748b;line-height:1.6}
  .header-right .date{font-weight:600;color:#1e293b;font-size:11px}
  .meta-row{display:flex;align-items:center;gap:16px;margin-bottom:12px;flex-wrap:wrap}
  .stat-box{background:#f8faff;border:1px solid #dbeafe;border-radius:8px;padding:6px 14px;text-align:center}
  .stat-box .num{font-size:18px;font-weight:700;color:#2563eb;font-family:monospace}
  .stat-box .lbl{font-size:9.5px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px}
  .filters-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px}
  .filters-label{font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap}
  .filter-chip{background:#dbeafe;color:#1d4ed8;font-size:10px;font-weight:600;padding:2px 9px;border-radius:10px}
  table{width:100%;border-collapse:collapse;font-size:10.5px}
  thead tr{background:#1e40af}
  thead th{color:#fff;font-weight:600;padding:7px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.4px;white-space:nowrap}
  tbody tr.even{background:#fff}
  tbody tr.odd{background:#f8faff}
  tbody tr:hover{background:#eff6ff}
  tbody td{padding:6px 8px;border-bottom:1px solid #e2e8f0;color:#334155;vertical-align:middle}
  tbody td:first-child{font-family:monospace;font-weight:700;color:#1e293b;font-size:11px}
  .footer{margin-top:16px;padding-top:10px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9.5px;color:#94a3b8}
  @media print{
    body{padding:12px 14px}
    @page{size:A4 landscape;margin:10mm}
    .no-print{display:none}
  }
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <div class="title">Batch Management Report</div>
      <div class="subtitle">Academic Batch Register</div>
    </div>
    <div class="header-right">
      <div class="date">${dateStr}</div>
      <div>${timeStr}</div>
    </div>
  </div>

  <div class="meta-row">
    <div class="stat-box">
      <div class="num">${rows.length}</div>
      <div class="lbl">Total Batches</div>
    </div>
  </div>

  <div class="filters-row">
    <span class="filters-label">&#9660; Filters</span>
    ${filterHTML}
  </div>

  <table>
    <thead><tr>${thCells}</tr></thead>
    <tbody>${tdRows}</tbody>
  </table>

  <div class="footer">
    <span>Batch Management System &nbsp;|&nbsp; Exported on ${dateStr} at ${timeStr}</span>
    <span>Total: ${rows.length} batch${rows.length!==1?'es':''}</span>
  </div>
  <div style="margin-top:10px;text-align:center;font-size:10px;color:#94a3b8;letter-spacing:0.3px">
    Powered by <strong style="color:#2563eb">Learnomist</strong>
  </div>

  <div class="no-print" style="margin-top:18px;text-align:center">
    <button onclick="window.print()" style="padding:9px 28px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">
      Print / Save as PDF
    </button>
  </div>
</body>
</html>`;

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 600);
  },

  // ── Shell template (tabs wrapper) ──────────────────────────────

  // ══════════════════════════════════════════════════════════════
  // HIERARCHY TAB — Institute → Campus → Discipline → Level
  // Collapsible tree with CRUD at every level
  // ══════════════════════════════════════════════════════════════
  _hierarchyTemplate() {
    const institutes = AppState.get('institutes')  || [];
    const campuses   = AppState.get('campuses')    || [];
    const discs      = AppState.get('disciplines') || [];
    const levels     = AppState.get('levels')      || [];

    const esc = s => (s||'').replace(/"/g,'&quot;').replace(/</g,'&lt;');

    // ── Count helpers ──
    const campCount  = inst => campuses.filter(c => c.instituteId === inst.id).length;
    const discCount  = () => discs.length;
    const levelCount = disc => levels.filter(l => l.disciplineId === disc.id).length;
    // Batches under a level
    const batchCount = lvl => (AppState.get('batches')||[]).filter(b => b.levelId === lvl.id).length;

    // SVG icons inline
    const icoEdit  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    const icoDel   = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>`;
    const icoAdd   = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    const icoChev  = `<svg class="ht-chev" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="transition:transform .2s;flex-shrink:0"><polyline points="9 18 15 12 9 6"/></svg>`;

    const actionBtns = (type, id, name) => `
      <div class="ht-actions">
        <button class="ht-btn ht-edit" data-ht-type="${type}" data-ht-id="${id}" title="Edit ${type}">
          ${icoEdit}
        </button>
        <button class="ht-btn ht-del" data-ht-type="${type}" data-ht-id="${id}" data-ht-name="${esc(name)}" title="Delete ${type}">
          ${icoDel}
        </button>
      </div>`;

    const addBtn = (type, parentId, parentType, label) => `
      <button class="ht-add-row" data-ht-add="${type}" data-ht-parent-id="${parentId||''}" data-ht-parent-type="${parentType||''}" title="Add ${label}">
        ${icoAdd} ${label}
      </button>`;

    // ── Build tree ──
    let treeHTML = '';

    if (!institutes.length) {
      treeHTML = `<div class="ht-empty">No institutes yet. Add one to begin.</div>`;
    } else {
      treeHTML = institutes.map(inst => {
        const instCamps = campuses.filter(c => c.instituteId === inst.id);

        const campsHTML = instCamps.map(camp => {
          // Disciplines are global — not linked to campus, show all
          const discsHTML = discs.map(disc => {
            const discLevels = levels.filter(l => l.disciplineId === disc.id);

            const levelsHTML = discLevels.map(lvl => {
              const bc = batchCount(lvl);
              return `
                <div class="ht-row ht-level-row">
                  <span class="ht-indent4"></span>
                  ${icoChev}
                  <span class="ht-icon-dot" style="background:var(--cyan)"></span>
                  <span class="ht-label">${esc(lvl.levelName)}</span>
                  ${bc ? `<span class="ht-pill ht-pill-cyan">${bc} batch${bc!==1?'es':''}</span>` : ''}
                  ${actionBtns('level', lvl.id, lvl.levelName)}
                </div>`;
            }).join('');

            return `
              <div class="ht-node">
                <div class="ht-row ht-disc-row ht-collapsible" data-ht-target="disc-${disc.id}-camp-${camp.id}">
                  <span class="ht-indent3"></span>
                  ${icoChev}
                  <span class="ht-icon-dot" style="background:var(--violet)"></span>
                  <span class="ht-mono">${esc(disc.abbreviation)}</span>
                  <span class="ht-label" style="color:var(--t2)">${esc(disc.fullName)}</span>
                  <span class="ht-pill">${discLevels.length} level${discLevels.length!==1?'s':''}</span>
                  ${actionBtns('discipline', disc.id, disc.fullName)}
                </div>
                <div class="ht-children" id="disc-${disc.id}-camp-${camp.id}">
                  ${levelsHTML}
                  <div class="ht-row ht-add-row-wrap">
                    <span class="ht-indent4"></span>
                    ${addBtn('level', disc.id, 'discipline', '+ Add Level')}
                  </div>
                </div>
              </div>`;
          }).join('');

          return `
            <div class="ht-node">
              <div class="ht-row ht-camp-row ht-collapsible" data-ht-target="camp-${camp.id}">
                <span class="ht-indent2"></span>
                ${icoChev}
                <span class="ht-icon-dot" style="background:var(--blue)"></span>
                <span class="ht-label">${esc(camp.campusName)}</span>
                <span class="ht-pill">${discs.length} discipline${discs.length!==1?'s':''}</span>
                ${actionBtns('campus', camp.id, camp.campusName)}
              </div>
              <div class="ht-children" id="camp-${camp.id}">
                ${discsHTML}
                <div class="ht-row ht-add-row-wrap">
                  <span class="ht-indent3"></span>
                  ${addBtn('discipline', camp.id, 'campus', '+ Add Discipline')}
                </div>
              </div>
            </div>`;
        }).join('');

        return `
          <div class="ht-node ht-inst-node">
            <div class="ht-row ht-inst-row ht-collapsible" data-ht-target="inst-${inst.id}">
              ${icoChev}
              <span class="ht-icon-inst">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
              </span>
              <span class="ht-label ht-inst-label">${esc(inst.instituteName)}</span>
              ${inst.city ? `<span class="ht-pill">${esc(inst.city)}</span>` : ''}
              <span class="ht-pill ht-pill-blue">${campCount(inst)} campus${campCount(inst)!==1?'es':''}</span>
              ${actionBtns('institute', inst.id, inst.instituteName)}
            </div>
            <div class="ht-children" id="inst-${inst.id}">
              ${campsHTML}
              <div class="ht-row ht-add-row-wrap">
                <span class="ht-indent2"></span>
                ${addBtn('campus', inst.id, 'institute', '+ Add Campus')}
              </div>
            </div>
          </div>`;
      }).join('');
    }

    return `
      <div class="ht-wrap">
        <div class="ht-toolbar">
          <div>
            <span style="font-size:14px;font-weight:600;color:var(--t1)">Data Hierarchy</span>
            <span style="font-size:12px;color:var(--t3);margin-left:10px">Institute → Campus → Discipline → Level</span>
          </div>
          <button class="ht-add-inst-btn" data-ht-add="institute" title="Add Institute">
            ${icoAdd} Add Institute
          </button>
        </div>
        <div class="ht-tree">${treeHTML}</div>
      </div>`;
  },

  _refreshHierarchy(el) {
    const body = el.querySelector('#batchTabBody');
    if (!body) return;
    requestAnimationFrame(() => {
      body.innerHTML = this._hierarchyTemplate();
      this._attachHierarchyHandlers(el);
    });
  },

  _attachHierarchyHandlers(el) {
    const body = el.querySelector('#batchTabBody');

    // ── Collapsible rows ──────────────────────────────────────
    body.querySelectorAll('.ht-collapsible').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.ht-actions')) return; // don't collapse on action click
        const targetId = row.dataset.htTarget;
        const children = body.querySelector('#' + targetId);
        const chev     = row.querySelector('.ht-chev');
        if (!children) return;
        const isOpen = children.style.display !== 'none';
        children.style.display = isOpen ? 'none' : '';
        if (chev) chev.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
      });
      // Start expanded
      const targetId = row.dataset.htTarget;
      const children = body.querySelector('#' + targetId);
      const chev     = row.querySelector('.ht-chev');
      if (children) children.style.display = '';
      if (chev) chev.style.transform = 'rotate(90deg)';
    });

    // ── Add buttons ───────────────────────────────────────────
    body.querySelectorAll('[data-ht-add]').forEach(btn => {
      btn.addEventListener('click', () => {
        const type     = btn.dataset.htAdd;
        const parentId = btn.dataset.htParentId || '';
        this._htOpenForm(type, null, parentId, el);
      });
    });

    // ── Edit buttons ──────────────────────────────────────────
    body.querySelectorAll('.ht-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.htType;
        const id   = btn.dataset.htId;
        const key  = type === 'institute' ? 'institutes' : type === 'campus' ? 'campuses' : type === 'discipline' ? 'disciplines' : 'levels';
        const item = AppState.findById(key, id);
        if (item) this._htOpenForm(type, item, null, el);
      });
    });

    // ── Delete buttons ────────────────────────────────────────
    body.querySelectorAll('.ht-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const type = btn.dataset.htType;
        const id   = btn.dataset.htId;
        const name = btn.dataset.htName;
        const key  = type === 'institute' ? 'institutes' : type === 'campus' ? 'campuses' : type === 'discipline' ? 'disciplines' : 'levels';

        // Check dependents
        const deps = AppState.getDependents(key, id);
        let msg = `Delete <strong>${name}</strong>?`;
        if (deps.length) {
          msg += `<br><br><span style="color:var(--red);font-size:12px">⚠ This will affect: ${deps.map(d => `${d.count} ${d.label}(s)`).join(', ')}</span>`;
        }

        const ok = await Modal.confirm({ title: `Delete ${type}`, message: msg, confirmLabel: 'Delete', danger: true });
        if (!ok) return;
        AppState.remove(key, id);
        Toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted.`);
        this._refreshHierarchy(el);
      });
    });
  },

  _htOpenForm(type, existing, parentId, container) {
    const isEdit = !!existing;
    const institutes = AppState.get('institutes')  || [];
    const campuses   = AppState.get('campuses')    || [];
    const discs      = AppState.get('disciplines') || [];

    // ── Build form body per type ──
    let formBody = '';
    let title    = '';

    if (type === 'institute') {
      title = isEdit ? 'Edit Institute' : 'Add Institute';
      formBody = `
        <div class="form-group">
          <label class="form-label">Institute Name <span class="req">*</span></label>
          <input id="htInstName" class="form-input" value="${existing?.instituteName||''}" placeholder="e.g. FAST National University"/>
        </div>
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">City</label>
            <input id="htInstCity" class="form-input" value="${existing?.city||''}" placeholder="e.g. Islamabad"/>
          </div>
          <div class="form-group">
            <label class="form-label">Est. Year</label>
            <input id="htInstYear" class="form-input" type="number" value="${existing?.estYear||''}" placeholder="e.g. 2000"/>
          </div>
        </div>`;

    } else if (type === 'campus') {
      const instOpts = institutes.map(i => `<option value="${i.id}" ${(existing?.instituteId||parentId)===i.id?'selected':''}>${i.instituteName}</option>`).join('');
      title = isEdit ? 'Edit Campus' : 'Add Campus';
      formBody = `
        <div class="form-group">
          <label class="form-label">Institute <span class="req">*</span></label>
          <select id="htCampInst" class="form-select form-input">
            <option value="">Select institute…</option>${instOpts}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Campus Name <span class="req">*</span></label>
          <input id="htCampName" class="form-input" value="${existing?.campusName||''}" placeholder="e.g. Main Campus"/>
        </div>
        <div class="form-group">
          <label class="form-label">City</label>
          <input id="htCampCity" class="form-input" value="${existing?.city||''}" placeholder="e.g. Rawalpindi"/>
        </div>`;

    } else if (type === 'discipline') {
      title = isEdit ? 'Edit Discipline' : 'Add Discipline';
      formBody = `
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Abbreviation <span class="req">*</span></label>
            <input id="htDiscAbbr" class="form-input" value="${existing?.abbreviation||''}" placeholder="e.g. ACCA" style="font-family:var(--font-mono);font-weight:700"/>
          </div>
          <div class="form-group">
            <label class="form-label">Full Name <span class="req">*</span></label>
            <input id="htDiscName" class="form-input" value="${existing?.fullName||''}" placeholder="e.g. Association of Chartered Accountants"/>
          </div>
        </div>`;

    } else if (type === 'level') {
      const discOpts = discs.map(d => `<option value="${d.id}" ${(existing?.disciplineId||parentId)===d.id?'selected':''}>${d.abbreviation} — ${d.fullName}</option>`).join('');
      title = isEdit ? 'Edit Level' : 'Add Level';
      formBody = `
        <div class="form-group">
          <label class="form-label">Discipline <span class="req">*</span></label>
          <select id="htLvlDisc" class="form-select form-input">
            <option value="">Select discipline…</option>${discOpts}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Level Name <span class="req">*</span></label>
          <input id="htLvlName" class="form-input" value="${existing?.levelName||''}" placeholder="e.g. FA1, F5, P1"/>
        </div>`;
    }

    Modal.open({
      title,
      size: 'sm',
      body: formBody,
      actions: [
        { label: 'Cancel', variant: 'ghost', close: true },
        {
          label: isEdit ? 'Save Changes' : 'Add',
          variant: 'primary', close: false,
          handler: (modalEl) => {
            let data = {};
            let key  = '';

            if (type === 'institute') {
              const name = modalEl.querySelector('#htInstName')?.value?.trim();
              if (!name) { Toast.error('Institute name is required.'); return; }
              data = { instituteName: name, city: modalEl.querySelector('#htInstCity')?.value?.trim()||'', estYear: modalEl.querySelector('#htInstYear')?.value?.trim()||'' };
              key  = 'institutes';

            } else if (type === 'campus') {
              const instId = modalEl.querySelector('#htCampInst')?.value;
              const name   = modalEl.querySelector('#htCampName')?.value?.trim();
              if (!instId) { Toast.error('Please select an institute.'); return; }
              if (!name)   { Toast.error('Campus name is required.'); return; }
              data = { instituteId: instId, campusName: name, city: modalEl.querySelector('#htCampCity')?.value?.trim()||'' };
              key  = 'campuses';

            } else if (type === 'discipline') {
              const abbr = modalEl.querySelector('#htDiscAbbr')?.value?.trim().toUpperCase();
              const name = modalEl.querySelector('#htDiscName')?.value?.trim();
              if (!abbr) { Toast.error('Abbreviation is required.'); return; }
              if (!name) { Toast.error('Full name is required.'); return; }
              data = { abbreviation: abbr, fullName: name };
              key  = 'disciplines';

            } else if (type === 'level') {
              const discId = modalEl.querySelector('#htLvlDisc')?.value;
              const name   = modalEl.querySelector('#htLvlName')?.value?.trim();
              if (!discId) { Toast.error('Please select a discipline.'); return; }
              if (!name)   { Toast.error('Level name is required.'); return; }
              data = { disciplineId: discId, levelName: name };
              key  = 'levels';
            }

            if (isEdit) {
              // ── ChangeManager: show impact before writing ─────────
              // This is async so we use an IIFE to handle the await
              // inside a sync handler. Modal stays open until resolved.
              (async () => {
                const result = await ChangeManager.handleUpdate({
                  entity:  key,           // 'campuses' | 'disciplines' | 'levels'
                  id:      existing.id,
                  oldData: existing,
                  newData: data,
                });

                if (result.cancelled) return; // user pressed Cancel

                // Write the master record first
                AppState.update(key, existing.id, data);

                // Then apply snapshot refresh to linked batches
                // based on mode the user chose.
                if (key === 'campuses') {
                  applyCampusImpact(existing.id, data, result.mode);
                } else if (key === 'disciplines') {
                  applyDisciplineImpact(existing.id, data, result.mode);
                } else if (key === 'levels') {
                  applyLevelImpact(existing.id, data, result.mode);
                }
                // 'institutes': batches do not store instituteId directly —
                // no snapshot refresh is needed for institute edits.

                Toast.success(`${type.charAt(0).toUpperCase()+type.slice(1)} updated.`);
                Modal.closeAll();
                this._refreshHierarchy(container);
              })();
              return; // prevent fall-through to old closeAll below
            } else {
              AppState.add(key, data);
              Toast.success(`${type.charAt(0).toUpperCase()+type.slice(1)} added.`);
            }
            Modal.closeAll();
            this._refreshHierarchy(container);
          }
        }
      ]
    });
  },

  _shellTemplate() {
    const canManage = Auth.can('batches:management') || Auth.can('batches');

    if (!canManage) {
      return `<div style="display:flex;align-items:center;justify-content:center;min-height:300px;flex-direction:column;gap:12px">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4a5270" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
        <p style="color:#4a5270;font-size:13px">You don\'t have permission to view this section.</p>
      </div>`;
    }

    return `
      <div class="batch-shell">
        <nav class="batch-tab-bar" id="batchTabBar">
          <button class="batch-tab-btn active" data-tab="management">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 2 7 12 12 22 7 12 2"/>
              <polyline points="2 17 12 22 22 17"/>
              <polyline points="2 12 12 17 22 12"/>
            </svg>
            Batches
          </button>
          <button class="batch-tab-btn" data-tab="planning">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
              <line x1="8" y1="14" x2="8" y2="14"/>
              <line x1="12" y1="14" x2="12" y2="14"/>
              <line x1="16" y1="14" x2="16" y2="14"/>
            </svg>
            Batch Planning
          </button>
        </nav>
        <div id="batchTabBody"></div>
      </div>
    `;
  },


  // ── Tab styles ────────────────────────────────────────────────
  _injectTabStyles() {
    if (document.getElementById('batch-tab-styles')) return;
    const st = document.createElement('style');
    st.id = 'batch-tab-styles';
    st.textContent = `
      /* ── Modal viewport fit fix (100% zoom) ─────────────────────
         Exact class names confirmed via DevTools:
           .modal-backdrop  → fixed overlay
           .modal-box       → white dialog card
           .modal-header    → title bar
           .modal-body      → scrollable content
           .modal-footer    → buttons
      ─────────────────────────────────────────────────────────────── */

      /* Overlay: centres the box, no overflow */
      .modal-backdrop {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 16px !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
      }

      /* Dialog card: flex column, never taller than viewport */
      .modal-box {
        display: flex !important;
        flex-direction: column !important;
        max-height: calc(100dvh - 32px) !important;
        overflow: hidden !important;
        margin: 0 !important;
      }

      /* Header & footer: always visible, never shrink */
      .modal-header { flex-shrink: 0 !important; }
      .modal-footer { flex-shrink: 0 !important; }

      /* Body: takes all remaining space and scrolls */
      .modal-body {
        flex: 1 1 auto !important;
        overflow-y: auto !important;
        min-height: 0 !important;
        max-height: none !important;
      }

      /* Compact form spacing so content fits comfortably */
      .modal-body .form-group  { margin-bottom: 10px !important; }
      .modal-body .form-row    { gap: 10px !important; margin-bottom: 10px !important; }
      .modal-body .form-label  { margin-bottom: 3px !important; font-size: 11.5px !important; }
      .modal-body .form-hint   { margin-top: 2px !important; font-size: 10.5px !important; }
      .modal-body .form-input,
      .modal-body .form-select { padding-top: 5px !important; padding-bottom: 5px !important; font-size: 12.5px !important; }

      .batch-shell { display:flex; flex-direction:column; height:100%; }

      .batch-tab-bar {
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 0 20px;
        border-bottom: 1px solid var(--border);
        background: var(--surface1);
        flex-shrink: 0;
      }

      .batch-tab-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 10px 16px;
        font-size: 13px;
        font-weight: 500;
        color: var(--t3);
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        cursor: pointer;
        margin-bottom: -1px;
        transition: color 0.15s, border-color 0.15s;
        white-space: nowrap;
      }

      .batch-tab-btn:hover {
        color: var(--t1);
      }

      .batch-tab-btn.active {
        color: var(--blue);
        border-bottom-color: var(--blue);
        font-weight: 600;
      }

      .batch-tab-btn svg {
        flex-shrink: 0;
        opacity: 0.7;
      }

      .batch-tab-btn.active svg {
        opacity: 1;
      }

      #batchTabBody {
        flex: 1;
        overflow: auto;
      }

      /* ── Enrolment Rules ─────────────────────────── */
      .er-section { background:var(--surface1,#fff); border:1px solid var(--border); border-radius:10px; overflow:hidden; }
      .er-section-head { display:flex; align-items:center; justify-content:space-between; padding:14px 18px; border-bottom:1px solid var(--border); }
      .er-add-btn {
        width:30px; height:30px; display:flex; align-items:center; justify-content:center;
        background:var(--blue); color:#fff; border:none; border-radius:7px; cursor:pointer;
        flex-shrink:0; transition:opacity .15s;
      }
      .er-add-btn:hover { opacity:.85; }
      .er-table { width:100%; }
      .er-header {
        display:flex; align-items:center; gap:0;
        padding:7px 18px; background:var(--surface2);
        border-bottom:1px solid var(--border);
        font-size:10.5px; font-weight:600; color:var(--t3);
        text-transform:uppercase; letter-spacing:.05em;
      }
      .er-header > div { padding-right:12px; }
      .er-row {
        display:flex; align-items:center; gap:0;
        padding:10px 18px; border-bottom:1px solid var(--border);
        transition:background .12s;
      }
      .er-row:last-child { border-bottom:none; }
      .er-row:hover { background:var(--surface2); }
      .er-cell { padding-right:12px; }
      .er-val { font-size:13px; color:var(--t1); }
      .er-actions { display:flex; gap:4px; min-width:68px; justify-content:flex-end; }
      .er-icon-btn {
        width:28px; height:28px; display:flex; align-items:center; justify-content:center;
        background:none; border:1px solid var(--border); border-radius:6px;
        cursor:pointer; color:var(--t3); transition:all .12s;
      }
      .er-edit-btn:hover { border-color:var(--blue); color:var(--blue); background:var(--blue-dim); }
      .er-del-btn:hover  { border-color:var(--red);  color:var(--red);  background:var(--red-dim);  }

      /* ── Hierarchy nodes ──────────────────────────── */
      .er-inst-node  { margin-bottom:12px; }
      .er-inst-head  { display:flex; align-items:center; gap:8px; padding:10px 16px;
                       background:var(--surface2); border-radius:8px 8px 0 0;
                       border:1px solid var(--border); border-bottom:none; }
      .er-inst-name  { font-size:13.5px; font-weight:600; color:var(--t1); flex:1; }
      .er-camp-list  { border:1px solid var(--border); border-radius:0 0 8px 8px; overflow:hidden; }
      .er-camp-node  { border-bottom:1px solid var(--border); }
      .er-camp-node:last-child { border-bottom:none; }
      .er-camp-head  { display:flex; align-items:center; gap:7px; padding:8px 16px 8px 24px;
                       background:var(--surface1,#fff); }
      .er-camp-name  { font-size:12.5px; font-weight:500; color:var(--t2); flex:1; }
      .er-disc-list  { border-top:1px solid var(--border); }
      .er-disc-node  { border-bottom:1px solid var(--border); }
      .er-disc-node:last-child { border-bottom:none; }
      .er-disc-head  { display:flex; align-items:center; gap:7px; padding:7px 16px 7px 36px;
                       background:var(--surface2); }
      .er-disc-badge { font-family:var(--font-mono); font-size:11px; font-weight:700;
                       color:var(--blue); min-width:32px; }
      .er-disc-name  { font-size:12px; color:var(--t3); flex:1; }
      .er-level-list { }
      .er-level-row  { display:flex; align-items:center; gap:8px; padding:7px 16px 7px 48px;
                       border-bottom:1px solid var(--border); transition:background .1s; }
      .er-level-row:last-child { border-bottom:none; }
      .er-level-row:hover { background:var(--blue-dim); }
      .er-level-name { font-size:12.5px; color:var(--t1); flex:1; }
      .er-close-badge{ font-size:11px; color:var(--t3); font-family:var(--font-mono);
                       white-space:nowrap; min-width:130px; }
      .er-count-pill { font-size:10.5px; font-weight:600; color:var(--t3);
                       background:var(--surface3); padding:1px 7px; border-radius:10px; }
      .er-chev { margin-right:2px; }
      .er-collapsible:hover { background:var(--surface2); border-radius:6px; }

      /* ── Hierarchy Tree ───────────────────────────── */
      .ht-wrap { padding:20px 24px; }
      .ht-toolbar {
        display:flex; align-items:center; justify-content:space-between;
        margin-bottom:16px; padding-bottom:14px; border-bottom:1px solid var(--border);
      }
      .ht-add-inst-btn {
        display:inline-flex; align-items:center; gap:5px;
        padding:0 14px; height:32px; border-radius:7px;
        border:1px solid var(--border); background:var(--surface2);
        color:var(--t2); font-size:12px; font-weight:600; cursor:pointer;
        font-family:var(--font); transition:all .15s;
      }
      .ht-add-inst-btn:hover { border-color:var(--blue); color:var(--blue); background:var(--blue-dim); }

      .ht-tree { display:flex; flex-direction:column; gap:4px; }
      .ht-node { }
      .ht-children { padding-left:0; }
      .ht-empty { padding:40px; text-align:center; color:var(--t3); font-size:13px; }

      .ht-row {
        display:flex; align-items:center; gap:7px;
        padding:7px 10px; border-radius:7px;
        cursor:pointer; transition:background .1s;
        position:relative;
      }
      .ht-row:hover { background:var(--surface2); }
      .ht-row:hover .ht-actions { opacity:1; }

      /* Indent spacers */
      .ht-indent2 { display:inline-block; width:24px; flex-shrink:0; }
      .ht-indent3 { display:inline-block; width:48px; flex-shrink:0; }
      .ht-indent4 { display:inline-block; width:72px; flex-shrink:0; }

      /* Row type styles */
      .ht-inst-row { background:var(--surface2); border:1px solid var(--border); margin-bottom:2px; }
      .ht-inst-row:hover { background:var(--surface3); }
      .ht-camp-row { }
      .ht-disc-row { }
      .ht-level-row { cursor:default; }

      .ht-icon-inst {
        display:inline-flex; align-items:center; justify-content:center;
        width:24px; height:24px; border-radius:6px;
        background:var(--blue-dim); color:var(--blue); flex-shrink:0;
      }
      .ht-icon-dot {
        width:8px; height:8px; border-radius:50%; flex-shrink:0;
      }
      .ht-mono { font-family:var(--font-mono); font-size:11.5px; font-weight:700; color:var(--violet); min-width:36px; }
      .ht-label { font-size:13px; color:var(--t1); flex:1; }
      .ht-inst-label { font-size:13.5px; font-weight:600; }

      .ht-pill {
        font-size:10.5px; font-weight:600; color:var(--t3);
        background:var(--surface3); padding:2px 8px; border-radius:10px;
        white-space:nowrap; flex-shrink:0;
      }
      .ht-pill-blue { color:var(--blue); background:var(--blue-dim); }
      .ht-pill-cyan { color:var(--cyan,#06b6d4); background:rgba(6,182,212,.1); }

      .ht-actions {
        display:flex; gap:3px; opacity:0; transition:opacity .15s; flex-shrink:0;
      }
      .ht-btn {
        width:26px; height:26px; display:flex; align-items:center; justify-content:center;
        background:none; border:1px solid var(--border); border-radius:5px;
        cursor:pointer; color:var(--t3); transition:all .12s;
      }
      .ht-edit:hover { border-color:var(--blue); color:var(--blue); background:var(--blue-dim); }
      .ht-del:hover  { border-color:var(--red);  color:var(--red);  background:var(--red-dim);  }

      .ht-add-row-wrap { cursor:default; padding:4px 10px; }
      .ht-add-row-wrap:hover { background:none; }
      .ht-add-row {
        display:inline-flex; align-items:center; gap:4px;
        font-size:11.5px; color:var(--t3); background:none;
        border:1px dashed var(--border2); border-radius:6px;
        padding:3px 10px; cursor:pointer; transition:all .15s;
        font-family:var(--font);
      }
      .ht-add-row:hover { color:var(--blue); border-color:var(--blue); background:var(--blue-dim); }

      .ht-chev { color:var(--t3); flex-shrink:0; }
    `;
    document.head.appendChild(st);
  },

  // ── Page template ─────────────────────────────────────────────
  _pageTemplate() {
    const disciplines = AppState.get('disciplines') || [];
    const campuses    = AppState.get('campuses')    || [];
    const discOpts = disciplines.map(d =>
      `<option value="${d.id}">${d.abbreviation} — ${d.fullName}</option>`
    ).join('');
    const allLevels  = AppState.get('levels') || [];
    const sessionSet = new Set();
    (AppState.get('batches') || []).forEach(b => { if (b.sessionPeriod) sessionSet.add(b.sessionPeriod); });
    const sessionOpts = [...sessionSet]
      .sort((a, b) => {
        const parse = v => { const [n, yy] = v.split('-'); return parseInt(yy) * 2 + (n === 'June' ? 1 : 0); };
        return parse(b) - parse(a);
      })
      .map(s => `<option value="${s}">${s}</option>`).join('');
    const levelOpts = allLevels.map(l =>
      `<option value="${l.id}">${l.levelName}</option>`
    ).join('');
    const campusOpts = campuses.map(c => {
      const short = c.campusName.replace(/\s*campus$/i, '').trim();
      return `<option value="${c.id}">${short}</option>`;
    }).join('');

    // data attrs for custom multi-select widget — format: "value||label" per item
    const discOpts2    = disciplines.map(d =>
      `<span data-val="${d.id}">${d.abbreviation}</span>`).join('');
    const campusOpts2  = campuses.map(c => {
      const short = c.campusName.replace(/\s*campus$/i,'').trim();
      return `<span data-val="${c.id}">${short}</span>`;
    }).join('');
    const sessionOpts2 = [...sessionSet]
      .sort((a,b)=>{ const p=v=>{const[n,yy]=v.split('-');return parseInt(yy)*2+(n==='June'?1:0);}; return p(b)-p(a); })
      .map(s=>`<span data-val="${s}">${s}</span>`).join('');
    const levelOpts2   = allLevels.map(l =>
      `<span data-val="${l.id}">${l.levelName}</span>`).join('');

    return `
      <div class="module-page">
        <div class="module-toolbar">
          <div class="search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input id="batchSearch" class="search-input"
                   placeholder="Search by batch name or teacher…"/>
          </div>
          <div class="batch-mf" id="batchDiscFilter"    data-label="Discipline">${discOpts2}</div>
          <div class="batch-mf" id="batchCampusFilter"  data-label="Campus">${campusOpts2}</div>
          <div class="batch-mf" id="batchSessionFilter" data-label="Session" data-mono="1">${sessionOpts2}</div>
          <div class="batch-mf" id="batchLevelFilter"   data-label="Level">${levelOpts2}</div>
          <span class="record-count">— batches</span>
          <div style="display:flex;gap:6px;margin-left:auto;flex-shrink:0;align-items:center">
            <button id="batchExportExcel" title="Export to Excel"
              style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;
                     border-radius:7px;border:1px solid var(--border);background:var(--surface2);
                     color:var(--t3);cursor:pointer;transition:all .15s"
              onmouseover="this.style.borderColor='var(--blue)';this.style.color='var(--blue)';this.style.background='var(--blue-dim)'"
              onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--t3)';this.style.background='var(--surface2)'">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12l2.5 2.5L16 9"/>
              </svg>
            </button>
            <button id="batchExportPDF" title="Export to PDF"
              style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;
                     border-radius:7px;border:1px solid var(--border);background:var(--surface2);
                     color:var(--t3);cursor:pointer;transition:all .15s"
              onmouseover="this.style.borderColor='var(--blue)';this.style.color='var(--blue)';this.style.background='var(--blue-dim)'"
              onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--t3)';this.style.background='var(--surface2)'">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>
              </svg>
            </button>
            <button id="batchBulkImportBtn"
              style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;
                     border-radius:7px;border:1px solid var(--border);background:var(--surface2);
                     color:var(--t3);cursor:pointer;transition:all .15s"
              onmouseover="this.style.borderColor='var(--blue)';this.style.color='var(--blue)';this.style.background='var(--blue-dim)'"
              onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--t3)';this.style.background='var(--surface2)'"
              title="Bulk Import CSV">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </button>
            <button id="batchAddBtn"
              style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;
                     border-radius:7px;border:1px solid var(--blue);background:var(--blue);
                     color:#fff;cursor:pointer;transition:all .15s"
              onmouseover="this.style.opacity='.85'"
              onmouseout="this.style.opacity='1'" title="Add Batch">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          </div>
        </div>
        <div id="batch-table"></div>
      </div>
    `;
  },
};

// ── Icons ─────────────────────────────────────────────────────
const ICONS = {
  edit:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>`,
};