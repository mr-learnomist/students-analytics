// ============================================================
// utils/state.js — Central State Management
// FIXED: Removed dangerous saveState() calls from loadState()
// ============================================================

import Storage from './storage.js';

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
const _subscribers = {};
let _state = DEFAULT_STATE;
let _loaded = false; // ✅ guard: load complete hua ya nahi

export const AppState = {

  async loadState() {
    const fileData = await Storage.loadAll();

    // ✅ FIX: agar server se data load HI nahi ho saka (network down,
    // flaky connection, server timeout) to Storage.loadAll() ab `null`
    // deta hai — is case mein HARGIZ fresh-install samajh ke seed
    // default data mat banao, warna real users/students/sab data
    // server pe overwrite ho jata (yehi wajah thi "kabhi password
    // accept karta kabhi nahi" ki). _loaded ko false hi rehne do
    // taake galti se koi saveState() bhi na chal jaye.
    if (fileData === null) {
      console.error('[AppState] Server se data load nahi ho saka — seed/save BLOCKED hai. Connection check karke page reload karein.');
      _state = structuredClone(DEFAULT_STATE);
      throw new Error('EDUTRACK_LOAD_FAILED');
    }

    const saved = fileData[STORAGE_KEY] || null;

    if (saved) {
      // ✅ Merge with defaults — missing keys fill ho jayein
      _state = { ...DEFAULT_STATE, ...saved };

      // ✅ Migration: naye keys add karo agar purani state mein nahi hain
      const migrations = {
        batchSchedules:    [],
        attendanceRecords: [],
        students:          [],
        teachers:          [],
        lecturePlans:      [],
        lpRows:            {},
        lpAssignments:     {},
        holidays:          [],
        admissions:        [],
        challans:          [],
        feeStructures:     [],
      };
      let migrated = false;
      Object.entries(migrations).forEach(([key, defaultVal]) => {
        if (_state[key] === undefined || _state[key] === null) {
          _state[key] = defaultVal;
          migrated = true;
        }
      });

      // ✅ Users missing hain toh sirf users seed karo — POORA data nahi
      if (!_state.users || _state.users.length === 0) {
        this._seedUsersOnly();
        migrated = true;
      }

      // ✅ Sirf tab save karo jab actually kuch migrate hua ho
      // KABHI bhi full state load pe save mat karo
      if (migrated) {
        this.saveState();
      }

    } else {
      // ✅ Fresh install — pehli baar hi seed karo
      _state = structuredClone(DEFAULT_STATE);
      this._seedDefaultData();
      // saveState() seedDefaultData ke andar call hoti hai — sirf fresh install pe
    }

    _loaded = true;
    return _state;
  },

  resetState() {
    Storage.clear();
    _state = structuredClone(DEFAULT_STATE);
    this._seedDefaultData();
    return _state;
  },

  saveState() {
    // ✅ Guard: load complete hone se pehle save mat karo
    if (!_loaded) {
      console.warn('[AppState] saveState() called before loadState() — skipped!');
      return;
    }

    // ✅ currentUser kabhi save mat karo — session alag handle hoti hai
    const toSave = { ..._state };
    delete toSave.currentUser;

    Storage.set(STORAGE_KEY, toSave);
  },

  get(key) {
    return _state[key] ?? null;
  },

  set(key, value) {
    _state[key] = value;
    this.saveState();
    this._notify(key, value);
  },

  subscribe(key, fn) {
    if (!_subscribers[key]) _subscribers[key] = [];
    _subscribers[key].push(fn);
    return () => {
      _subscribers[key] = _subscribers[key].filter(f => f !== fn);
    };
  },

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

  // ✅ Silent set — sirf memory update, no saveState, no notify
  // Attendance sync ke liye use hota hai
  _silentSet(key, value) {
    _state[key] = value;
  },

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

  _notify(key, value) {
    (_subscribers[key] || []).forEach(fn => {
      try { fn(value); } catch(e) { console.error('[AppState] Subscriber error:', e); }
    });
  },

  // ✅ Sirf users seed karo — baaki data touch mat karo
  _seedUsersOnly() {
    _state.users = [
      { id: 'user_1', username: 'admin',   password: 'admin123',   role: 'admin',   name: 'Usman Malik',    avatar: 'UM', institute: 'FAST National University', campusId: null,     customPermissions: [] },
      { id: 'user_2', username: 'teacher', password: 'teacher123', role: 'teacher', name: 'Dr. Sara Ahmed', avatar: 'SA', institute: 'FAST National University', campusId: 'camp_1', customPermissions: [] },
      { id: 'user_3', username: 'viewer',  password: 'viewer123',  role: 'viewer',  name: 'Ali Hassan',     avatar: 'AH', institute: 'FAST National University', campusId: 'camp_2', customPermissions: [] },
    ];
  },

  // ✅ Sirf fresh install pe call hota hai
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
      { id: 'disc_1', abbreviation: 'CS',  fullName: 'Computer Science'        },
      { id: 'disc_2', abbreviation: 'BBA', fullName: 'Business Administration'  },
      { id: 'disc_3', abbreviation: 'EE',  fullName: 'Electrical Engineering'   },
      { id: 'disc_4', abbreviation: 'MTH', fullName: 'Mathematics'              },
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
      { id: 'sub_1', levelId: 'lvl_1', subjectCode: 'CS101',  subjectName: 'Intro to Programming'  },
      { id: 'sub_2', levelId: 'lvl_1', subjectCode: 'CS102',  subjectName: 'Discrete Mathematics'  },
      { id: 'sub_3', levelId: 'lvl_2', subjectCode: 'CS201',  subjectName: 'Data Structures'       },
      { id: 'sub_4', levelId: 'lvl_2', subjectCode: 'CS202',  subjectName: 'Object Oriented Prog.' },
      { id: 'sub_5', levelId: 'lvl_4', subjectCode: 'BBA101', subjectName: 'Principles of Mgmt.'  },
      { id: 'sub_6', levelId: 'lvl_6', subjectCode: 'EE101',  subjectName: 'Circuit Analysis'      },
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

    _state.teachers          = [];
    _state.students          = [];
    _state.batches           = [];
    _state.batchSchedules    = [];
    _state.attendanceRecords = [];
    _state.lecturePlans      = [];
    _state.lpRows            = {};
    _state.lpAssignments     = {};

    // ✅ Fresh install pe save — ye theek hai
    this.saveState();
  },
};

export function generateID(prefix = 'rec') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
