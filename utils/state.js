// ============================================================
// utils/state.js — Central State Management (Single Source of Truth)
// v4: Async boot — loadState() now awaits Storage.loadAll() first
//
// CHANGE FROM v3: loadState() is now async.
// Your app entry point (main.js / app.js / index.html <script>)
// must await AppState.loadState() before mounting any modules.
//
// Example in main.js:
//   import { AppState } from './utils/state.js';
//   await AppState.loadState();
//   // now mount your modules...
// ============================================================

import Storage from './storage.js';

// ── Default shape ─────────────────────────────────────────────
const DEFAULT_STATE = {
  disciplines:      [],
  campuses:         [],
  institutes:       [],
  levels:           [],
  subjects:         [],
  batches:          [],
  roles:            [],
  users:            [],
  teachers:         [],
  holidays:         [],
  batchSchedules:   [],
  attendanceRecords:[],
  students:         [],
  lecturePlans:     [],
  lpRows:           {},
  lpAssignments:    {},
  admissions:       [],
  challans:         [],
  feeStructures:    [],
  currentUser:      null,
};

const STORAGE_KEY = 'appState';

// ── Reactive subscriber registry ──────────────────────────────
const _subscribers = {};

// ── Internal state object ─────────────────────────────────────
let _state = DEFAULT_STATE;

// ── Core API ──────────────────────────────────────────────────
export const AppState = {

  // ── loadState() — NOW ASYNC ──────────────────────────────────
  // Fetches database.json via Storage.loadAll(), then merges with
  // defaults exactly as before. Must be awaited at app boot.
  async loadState() {
    // 1. Pull everything from database.json into Storage cache
    const fileData = await Storage.loadAll();

    // 2. Extract the appState slice (same key as before)
    const saved = fileData[STORAGE_KEY] || null;

    if (saved) {
      _state = { ...DEFAULT_STATE, ...saved };

      if (!_state.users || _state.users.length === 0) {
        this._seedDefaultData();
      }

      // Ensure new keys exist in migrated state
      if (!_state.batchSchedules)    _state.batchSchedules    = [];
      if (!_state.attendanceRecords) _state.attendanceRecords = [];
      if (!_state.students)          _state.students          = [];
      if (!_state.teachers)          _state.teachers          = [];
      if (!_state.lecturePlans)      _state.lecturePlans      = [];
      if (!_state.lpRows)            _state.lpRows            = {};
      if (!_state.lpAssignments)     _state.lpAssignments     = {};
      if (!_state.holidays)          _state.holidays          = [];
      if (!_state.admissions)        _state.admissions        = [];
      if (!_state.challans)          _state.challans          = [];
      if (!_state.feeStructures)     _state.feeStructures     = [];

      this.saveState();
    } else {
      // Fresh install — seed everything
      _state = structuredClone(DEFAULT_STATE);
      this._seedDefaultData();
    }

    return _state;
  },

  // Wipe and re-seed fresh data
  resetState() {
    Storage.clear();
    _state = structuredClone(DEFAULT_STATE);
    this._seedDefaultData();
    return _state;
  },

  // Persist full state to database.json via Storage
  saveState() {
    Storage.set(STORAGE_KEY, _state);
  },

  // Read a slice of state
  get(key) {
    return _state[key] ?? null;
  },

  // Replace a full slice and save
  set(key, value) {
    _state[key] = value;
    this.saveState();
    this._notify(key, value);
  },

  // Subscribe to changes on a key
  subscribe(key, fn) {
    if (!_subscribers[key]) _subscribers[key] = [];
    _subscribers[key].push(fn);
    return () => {
      _subscribers[key] = _subscribers[key].filter(f => f !== fn);
    };
  },

  // ── CRUD helpers ────────────────────────────────────────────

  add(key, item) {
    const list    = this.get(key) || [];
    const newItem = { ...item, id: item.id || generateID() };
    this.set(key, [...list, newItem]);
    return newItem;
  },

  update(key, id, patch) {
    const list    = this.get(key) || [];
    const updated = list.map(item => item.id === id ? { ...item, ...patch } : item);
    this.set(key, updated);
    return updated.find(i => i.id === id);
  },

  remove(key, id) {
    const list = this.get(key) || [];
    this.set(key, list.filter(item => item.id !== id));
  },

  findById(key, id) {
    return (this.get(key) || []).find(item => item.id === id) ?? null;
  },

  // ── Referential integrity check ──────────────────────────────
  getDependents(key, id) {
    const deps = {
      disciplines: [
        { key: 'levels',   field: 'disciplineId', label: 'Level'   },
        { key: 'teachers', field: 'disciplines',  label: 'Teacher', isArray: true }
      ],
      levels: [
        { key: 'subjects', field: 'levelId', label: 'Subject' },
        { key: 'batches',  field: 'levelId', label: 'Batch'   }
      ],
      campuses: [
        { key: 'batches',  field: 'campusId', label: 'Batch'   },
        { key: 'teachers', field: 'campuses', label: 'Teacher', isArray: true }
      ],
      institutes: [],
      subjects: [
        { key: 'batches', field: 'subjectId', label: 'Batch' }
      ],
      batches: [
        { key: 'students',          field: 'batchId', label: 'Student'             },
        { key: 'batchSchedules',    field: 'batchId', label: 'Attendance Schedule' },
        { key: 'attendanceRecords', field: 'batchId', label: 'Attendance Record'   },
      ],
    };
    const relations = deps[key] || [];
    const found = [];
    relations.forEach(({ key: rKey, field, label, isArray }) => {
      const count = (this.get(rKey) || []).filter(r =>
        isArray ? (Array.isArray(r[field]) && r[field].includes(id)) : r[field] === id
      ).length;
      if (count > 0) found.push({ label, count });
    });
    return found;
  },

  // ── Private ──────────────────────────────────────────────────
  _notify(key, value) {
    (_subscribers[key] || []).forEach(fn => {
      try { fn(value); } catch(e) { console.error('[AppState] Subscriber error:', e); }
    });
  },

  _seedDefaultData() {
    _state.institutes = [
      { id: 'inst_1', instituteName: 'FAST National University', city: 'Islamabad', estYear: '2000' },
      { id: 'inst_2', instituteName: 'COMSATS University',       city: 'Lahore',    estYear: '1998' },
    ];
    _state.campuses = [
      { id: 'camp_1', campusName: 'Main Campus',  instituteId: 'inst_1', city: 'Islamabad'  },
      { id: 'camp_2', campusName: 'City Campus',  instituteId: 'inst_1', city: 'Rawalpindi' },
      { id: 'camp_3', campusName: 'North Campus', instituteId: 'inst_2', city: 'Lahore'     },
    ];
    _state.disciplines = [
      { id: 'disc_1', abbreviation: 'CS',  fullName: 'Computer Science'       },
      { id: 'disc_2', abbreviation: 'BBA', fullName: 'Business Administration' },
      { id: 'disc_3', abbreviation: 'EE',  fullName: 'Electrical Engineering'  },
      { id: 'disc_4', abbreviation: 'MTH', fullName: 'Mathematics'             },
    ];
    _state.levels = [
      { id: 'lvl_1', disciplineId: 'disc_1', levelName: 'Semester 1' },
      { id: 'lvl_2', disciplineId: 'disc_1', levelName: 'Semester 2' },
      { id: 'lvl_3', disciplineId: 'disc_1', levelName: 'Semester 3' },
      { id: 'lvl_4', disciplineId: 'disc_2', levelName: 'Year 1'     },
      { id: 'lvl_5', disciplineId: 'disc_2', levelName: 'Year 2'     },
      { id: 'lvl_6', disciplineId: 'disc_3', levelName: 'Term 1'     },
    ];
    _state.subjects = [
      { id: 'sub_1', levelId: 'lvl_1', subjectCode: 'CS101',  subjectName: 'Intro to Programming' },
      { id: 'sub_2', levelId: 'lvl_1', subjectCode: 'CS102',  subjectName: 'Discrete Mathematics' },
      { id: 'sub_3', levelId: 'lvl_2', subjectCode: 'CS201',  subjectName: 'Data Structures'      },
      { id: 'sub_4', levelId: 'lvl_2', subjectCode: 'CS202',  subjectName: 'Object Oriented Prog.'},
      { id: 'sub_5', levelId: 'lvl_4', subjectCode: 'BBA101', subjectName: 'Principles of Mgmt.' },
      { id: 'sub_6', levelId: 'lvl_6', subjectCode: 'EE101',  subjectName: 'Circuit Analysis'     },
    ];
    _state.roles = [
      { id: 'role_1', roleName: 'Admin',   permissions: ['all'] },
      { id: 'role_2', roleName: 'Teacher', permissions: ['attendance','tests','revision','students:read'] },
      { id: 'role_3', roleName: 'Viewer',  permissions: ['students:read','attendance:read'] },
    ];
    _state.holidays = [
      { id: 'hol_1', name: 'Pakistan Day',     date: '2025-03-23', type: 'public'    },
      { id: 'hol_2', name: 'Eid ul Fitr',      date: '2025-03-31', type: 'religious' },
      { id: 'hol_3', name: 'Labour Day',       date: '2025-05-01', type: 'public'    },
      { id: 'hol_4', name: 'Eid ul Adha',      date: '2025-06-07', type: 'religious' },
      { id: 'hol_5', name: 'Independence Day', date: '2025-08-14', type: 'public'    },
    ];
    _state.users = [
      { id: 'user_1', username: 'admin',   password: 'admin123',   role: 'admin',   name: 'Usman Malik',    avatar: 'UM', institute: 'FAST National University', campusId: null,     customPermissions: [] },
      { id: 'user_2', username: 'teacher', password: 'teacher123', role: 'teacher', name: 'Dr. Sara Ahmed', avatar: 'SA', institute: 'FAST National University', campusId: 'camp_1', customPermissions: [] },
      { id: 'user_3', username: 'viewer',  password: 'viewer123',  role: 'viewer',  name: 'Ali Hassan',     avatar: 'AH', institute: 'FAST National University', campusId: 'camp_2', customPermissions: [] },
    ];

    if (!_state.teachers)          _state.teachers          = [];
    if (!_state.students)          _state.students          = [];
    if (!_state.batchSchedules)    _state.batchSchedules    = [];
    if (!_state.attendanceRecords) _state.attendanceRecords = [];
    if (!_state.lecturePlans)      _state.lecturePlans      = [];
    if (!_state.lpRows)            _state.lpRows            = {};
    if (!_state.lpAssignments)     _state.lpAssignments     = {};

    this.saveState();
  },
};

// ── Standalone utility ────────────────────────────────────────
export function generateID(prefix = 'rec') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
