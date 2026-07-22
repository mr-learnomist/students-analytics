// ============================================================
// utils/state.js — Central State Management
// FIXED: Removed dangerous saveState() calls from loadState()
// UPDATED (students): 'students' alag collection/endpoint
//          (StudentsStorage) se load/save hote hain.
// UPDATED (batches + lecturePlans): 'batches' ab BatchesStorage
//          se, aur 'lecturePlans' + 'lpRows' + 'lpAssignments'
//          ab LecturePlanStorage se load/save hote hain — sab
//          taake main appstate document Vercel ki 4.5MB response
//          limit ke andar rahe.
//          batchUI.js / lecturePlanUI_.js / lecturePlanService.js
//          ko koi change nahi karni padi — wo abhi bhi
//          AppState.get/add/update/set use karte hain, routing
//          yahan andar hi transparently hoti hai.
// ============================================================

import Storage from './storage.js';
import StudentsStorage from './studentsStorage.js';
import BatchesStorage from './batchesStorage.js';
import LecturePlanStorage from './lecturePlanStorage.js';

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
let _lastSavePromise = Promise.resolve(true); // ✅ FIX: sabse recent saveState() ka asal result

// Lecture-plan related keys — inhe LecturePlanStorage handle karta hai
const LECTURE_KEYS = ['lecturePlans', 'lpRows', 'lpAssignments'];

function lectureDataIsEmpty(data) {
  const plansEmpty  = !Array.isArray(data.lecturePlans) || data.lecturePlans.length === 0;
  const rowsEmpty   = !data.lpRows || Object.keys(data.lpRows).length === 0;
  const assignEmpty = !data.lpAssignments || Object.keys(data.lpAssignments).length === 0;
  return plansEmpty && rowsEmpty && assignEmpty;
}

export const AppState = {

  async loadState() {
    // ✅ Main appstate, students, batches, aur lecture-data ab
    // alag-alag jagah se aate hain — sab parallel mein fetch karo
    // taake load speed slow na ho.
    const [fileData, studentsData, batchesData, lectureData] = await Promise.all([
      Storage.loadAll(),
      StudentsStorage.loadStudents(),
      BatchesStorage.loadBatches(),
      LecturePlanStorage.loadLectureData(),
    ]);

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

    // ✅ Same guard — students, batches, lecture-data teeno endpoints
    // ke liye. Agar koi bhi load fail ho, to save block rakho warna
    // khali data save ho ke real records delete ho sakte hain.
    if (studentsData === null) {
      console.error('[AppState] Students server se load nahi ho sake — seed/save BLOCKED hai. Connection check karke page reload karein.');
      _state = structuredClone(DEFAULT_STATE);
      throw new Error('EDUTRACK_STUDENTS_LOAD_FAILED');
    }
    if (batchesData === null) {
      console.error('[AppState] Batches server se load nahi ho sake — seed/save BLOCKED hai. Connection check karke page reload karein.');
      _state = structuredClone(DEFAULT_STATE);
      throw new Error('EDUTRACK_BATCHES_LOAD_FAILED');
    }
    if (lectureData === null) {
      console.error('[AppState] Lecture-plan data server se load nahi ho saka — seed/save BLOCKED hai. Connection check karke page reload karein.');
      _state = structuredClone(DEFAULT_STATE);
      throw new Error('EDUTRACK_LECTUREDATA_LOAD_FAILED');
    }

    const saved = fileData[STORAGE_KEY] || null;

    if (saved) {
      // ✅ Merge with defaults — missing keys fill ho jayein
      _state = { ...DEFAULT_STATE, ...saved };

      // ── Students routing ──────────────────────────────────
      // Naye 'students' collection ko authoritative maano agar
      // us mein data hai. Agar naya collection abhi khali hai
      // (migration abhi nahi chali) lekin purane appstate.students
      // mein data mojood hai, to purana hi use karo.
      if (studentsData.length > 0) {
        _state.students = studentsData;
      } else if (Array.isArray(_state.students) && _state.students.length > 0) {
        console.warn('[AppState] Students collection abhi khali hai — purane appstate.students data use ho raha hai. Migration script chalayein.');
      } else {
        _state.students = [];
      }

      // ── Batches routing ────────────────────────────────────
      // Bilkul students jese hi fallback logic.
      if (batchesData.length > 0) {
        _state.batches = batchesData;
      } else if (Array.isArray(_state.batches) && _state.batches.length > 0) {
        console.warn('[AppState] Batches collection abhi khali hai — purane appstate.batches data use ho raha hai. Migration script chalayein.');
      } else {
        _state.batches = [];
      }

      // ── Lecture-plan routing (lecturePlans + lpRows + lpAssignments) ──
      if (!lectureDataIsEmpty(lectureData)) {
        _state.lecturePlans  = lectureData.lecturePlans;
        _state.lpRows        = lectureData.lpRows;
        _state.lpAssignments = lectureData.lpAssignments;
      } else if (!lectureDataIsEmpty(_state)) {
        console.warn('[AppState] Lecture-plan collection abhi khali hai — purana appstate.lecturePlans/lpRows/lpAssignments data use ho raha hai. Migration script chalayein.');
      } else {
        _state.lecturePlans  = [];
        _state.lpRows        = {};
        _state.lpAssignments = {};
      }

      // ✅ Migration: naye keys add karo agar purani state mein nahi hain
      const migrations = {
        batchSchedules:    [],
        attendanceRecords: [],
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
      _state.students      = studentsData;               // usually [] on fresh install
      _state.batches       = batchesData;                // usually [] on fresh install
      _state.lecturePlans  = lectureData.lecturePlans;    // usually [] on fresh install
      _state.lpRows        = lectureData.lpRows;          // usually {} on fresh install
      _state.lpAssignments = lectureData.lpAssignments;   // usually {} on fresh install
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

  // ── saveState(changedKey) ──────────────────────────────────
  // changedKey optional hai — agar diya gaya hai to sirf usi ke
  // hisaab se decide karte hain kaunse dedicated endpoint ko save
  // bhejna hai (main appstate hamesha save hoti hai; students,
  // batches, aur lecture-data ab alag jagah save hoti hain).
  saveState(changedKey) {
    // ✅ Guard: load complete hone se pehle save mat karo
    if (!_loaded) {
      console.warn('[AppState] saveState() called before loadState() — skipped!');
      return Promise.resolve(false);
    }

    // ✅ currentUser kabhi save mat karo — session alag handle hoti hai
    // ✅ students/batches/lecture-keys ab main payload mein nahi jaate
    const toSave = { ..._state };
    delete toSave.currentUser;
    delete toSave.students;
    delete toSave.batches;
    delete toSave.lecturePlans;
    delete toSave.lpRows;
    delete toSave.lpAssignments;

    // ✅ FIX: har save call ka actual result collect karo — pehle ye
    // sab fire-and-forget thay, kisi ko pata nahi chalta tha ke save
    // waqai kamyab hua ya nahi. Ab AppState.waitForSave() se koi bhi
    // caller (jese users.js) is result ka reliably wait kar sakta hai,
    // bajaye /api/data ko manually poll karne ke.
    const savePromises = [Storage.set(STORAGE_KEY, toSave)];

    // Students ko alag save karo — sirf jab changedKey na diya gaya ho
    // (e.g. migration/seed ke waqt, jab sab kuch save hota hai) ya
    // jab specifically 'students' change hua ho.
    if (changedKey === undefined || changedKey === 'students') {
      savePromises.push(StudentsStorage.setStudents(_state.students || []));
    }

    // Batches ko alag save karo — bilkul students jesa hi.
    if (changedKey === undefined || changedKey === 'batches') {
      savePromises.push(BatchesStorage.setBatches(_state.batches || []));
    }

    // Lecture-plan data (teeno keys ek saath) ko alag save karo.
    if (changedKey === undefined || LECTURE_KEYS.includes(changedKey)) {
      savePromises.push(LecturePlanStorage.setLectureData({
        lecturePlans:  _state.lecturePlans  || [],
        lpRows:        _state.lpRows        || {},
        lpAssignments: _state.lpAssignments || {},
      }));
    }

    // ✅ Sab writes ko Promise.all mein resolve karo. `.setStudents()`
    // jese functions agar purane style mein kuch return na karein
    // (undefined), to unhe truthy treat karte hain — taake behavior
    // in dedicated storages ke liye backward-compatible rahe, jab tak
    // wo bhi apna real result return karna shuru na kar dein.
    _lastSavePromise = Promise.all(savePromises)
      .then(results => results.every(r => r !== false))
      .catch(err => {
        console.error('[AppState] saveState error:', err.message);
        return false;
      });

    return _lastSavePromise;
  },

  // ✅ FIX: naya method — koi bhi caller sabse recent save operation
  // ka asal (retries ke baad ka) result await kar sakta hai, bajaye
  // /api/data ko manually poll karne ke.
  async waitForSave() {
    return _lastSavePromise;
  },

  get(key) {
    return _state[key] ?? null;
  },

  set(key, value) {
    _state[key] = value;
    this.saveState(key);
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
    _state.students          = _state.students || [];
    _state.batches           = _state.batches  || [];
    _state.batchSchedules    = [];
    _state.attendanceRecords = [];
    _state.lecturePlans      = _state.lecturePlans  || [];
    _state.lpRows            = _state.lpRows        || {};
    _state.lpAssignments     = _state.lpAssignments || {};

    // ✅ Fresh install pe save — ye theek hai
    this.saveState();
  },
};

export function generateID(prefix = 'rec') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
