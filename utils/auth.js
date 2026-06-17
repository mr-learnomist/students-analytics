// ============================================================
// utils/auth.js — Authentication & RBAC
// v2: campusId session me save, granular permissions added
// PATCH: _sessionStore defined, restoreSession bug fixed
// ============================================================

import { AppState, generateID } from './state.js';
import Storage from './storage.js';

const SESSION_KEY = 'session';
const _sessionStore = Storage; // ✅ FIX 1: _sessionStore define kiya

// ── Permission map per role ────────────────────────────────────
const ROLE_PERMISSIONS = {
  admin: [
    'dashboard',
    'students', 'students:create', 'students:edit', 'students:delete',
    'attendance', 'attendance:create', 'attendance:edit',
    'tests', 'tests:create', 'tests:edit', 'tests:delete',
    'revision', 'revision:create', 'revision:edit',
    'batches', 'batches:create', 'batches:edit', 'batches:delete',
    'disciplines', 'disciplines:create', 'disciplines:edit', 'disciplines:delete',
    'campuses', 'campuses:create', 'campuses:edit', 'campuses:delete',
    'institutes', 'institutes:create', 'institutes:edit', 'institutes:delete',
    'levels', 'levels:create', 'levels:edit', 'levels:delete',
    'subjects', 'subjects:create', 'subjects:edit', 'subjects:delete',
    'holidays', 'holidays:create', 'holidays:edit', 'holidays:delete',
    'users', 'users:create', 'users:edit', 'users:delete',
    'teachers', 'teachers:create', 'teachers:edit', 'teachers:delete',
    'roles', 'admin',
    'analytics', 'analytics:reports',
    'timetable',
    'lecturePlan', 'lecturePlan:create', 'lecturePlan:edit', 'lecturePlan:delete',
    'admissions', 'admissions:create', 'admissions:edit', 'admissions:delete',
    'fee', 'fee:create', 'fee:edit', 'fee:delete', 'fee:payment',
    'rooms', 'rooms:create', 'rooms:edit', 'rooms:delete',
    'policies', 'policies:create', 'policies:edit', 'policies:delete',
    'bank', 'bank:create', 'bank:edit', 'bank:delete',
    'backup',
  ],

  // ── Campus Admin — apna campus manage kare ────────────────────
  campusAdmin: [
    'dashboard',
    'students', 'students:create', 'students:edit',
    'attendance', 'attendance:create', 'attendance:edit',
    'batches', 'batches:create', 'batches:edit',
    'teachers', 'teachers:create', 'teachers:edit',
    'disciplines',   // read-only
    'campuses',      // read-only — apna campus dekhe
    'institutes',    // read-only
    'levels',        // read-only
    'subjects',      // read-only
    'holidays',
    'lecturePlan', 'lecturePlan:create', 'lecturePlan:edit',
    'admissions', 'admissions:create', 'admissions:edit',
    'fee', 'fee:create', 'fee:edit', 'fee:payment',
  ],

  teacher: [
    'dashboard',
    'students', 'students:create', 'students:edit',
    'attendance', 'attendance:create', 'attendance:edit',
    'tests', 'tests:create', 'tests:edit',
    'revision', 'revision:create', 'revision:edit',
    'batches',
    'disciplines', 'levels', 'subjects', 'campuses', 'institutes',
    'teachers',
    'lecturePlan', 'lecturePlan:create', 'lecturePlan:edit',
    'admissions',  // read-only
  ],

  viewer: [
    'dashboard',
    'students',
    'attendance',
    'tests',
    'batches',
    'disciplines', 'levels', 'subjects', 'campuses', 'institutes',
    'lecturePlan',
  ],

  // ── Accounts — fee aur challan management ─────────────────────
  accounts: [
    'dashboard',
    'admissions',         // read-only — student admissions dekhe
    'fee',                // fee structures dekhe
    'fee:payment',        // payment mark kare
    'students',           // read-only
    'batches',            // read-only
    'disciplines', 'levels', 'campuses', 'institutes',
  ],

  // ── HOA (Head of Accounts) — fee/bank ki poori zimmedari ───────
  hoa: [
    'dashboard', 'analytics', 'analytics:reports',
    'fee', 'fee:create', 'fee:edit', 'fee:payment',
    'bank', 'bank:create', 'bank:edit',
    'admissions',          // read-only
    'students',            // read-only
    'batches',             // read-only
    'disciplines', 'levels', 'campuses', 'institutes', 'holidays',
  ],

  // ── Governance — board/oversight, zyada tar read-only ──────────
  governance: [
    'dashboard', 'analytics', 'analytics:reports',
    'students', 'attendance', 'tests', 'batches', 'admissions', 'fee',
    'disciplines', 'levels', 'subjects', 'campuses', 'institutes',
    'holidays', 'teachers', 'lecturePlan', 'timetable', 'enrolment',
  ],

  // ── Principal — institute-wide managerial access ───────────────
  principal: [
    'dashboard', 'analytics', 'analytics:reports',
    'students', 'students:create', 'students:edit',
    'attendance', 'attendance:create', 'attendance:edit',
    'tests', 'tests:create', 'tests:edit',
    'revision', 'revision:create', 'revision:edit',
    'batches', 'batches:create', 'batches:edit',
    'teachers', 'teachers:create', 'teachers:edit',
    'disciplines', 'campuses', 'institutes', 'levels', 'subjects',
    'holidays', 'holidays:create', 'holidays:edit',
    'lecturePlan', 'lecturePlan:create', 'lecturePlan:edit',
    'timetable', 'enrolment',
    'admissions', 'admissions:create', 'admissions:edit',
    'fee', 'fee:create', 'fee:edit', 'fee:payment',
  ],

  // ── Coordinator — academic scheduling/coordination ──────────────
  coordinator: [
    'dashboard',
    'students',
    'attendance', 'attendance:create', 'attendance:edit',
    'batches',
    'lecturePlan', 'lecturePlan:create', 'lecturePlan:edit',
    'timetable',
    'tests', 'revision',
    'disciplines', 'levels', 'subjects', 'campuses', 'institutes',
    'teachers',     // read-only
    'admissions',   // read-only
  ],
};

// ── Seed default users ─────────────────────────────────────────
export function seedDefaultUsers(state) {
  state.users = [
    {
      id: 'user_1', username: 'admin', password: 'admin123',
      role: 'admin', name: 'Usman Malik', avatar: 'UM',
      institute: 'FAST National University',
      campusId: null,       // null = sab campuses
    },
    {
      id: 'user_2', username: 'teacher', password: 'teacher123',
      role: 'teacher', name: 'Dr. Sara Ahmed', avatar: 'SA',
      institute: 'FAST National University',
      campusId: 'camp_1',   // sirf Main Campus
    },
    {
      id: 'user_3', username: 'viewer', password: 'viewer123',
      role: 'viewer', name: 'Ali Hassan', avatar: 'AH',
      institute: 'FAST National University',
      campusId: 'camp_2',   // sirf City Campus
    },
  ];
  return state;
}

// ── Auth API ──────────────────────────────────────────────────
export const Auth = {

  login(username, password) {
    const input = (username || '').toLowerCase().trim();

    // Regular users check
    const users = AppState.get('users') || [];
    const user  = users.find(
      u => u.username.toLowerCase() === input && u.password === password
    );

    if (user) {
      const session = {
        userId:           user.id,
        username:         user.username,
        name:             user.name,
        role:             user.role,
        avatar:           user.avatar,
        institute:        user.institute,
        campusId:         user.campusId || null,
        // ✅ FIX: carry the full multi-campus list into the session.
        // Falls back to wrapping the legacy single campusId so old user
        // records keep working without any data migration.
        campusIds:        Array.isArray(user.campusIds) && user.campusIds.length
                             ? user.campusIds
                             : (user.campusId ? [user.campusId] : []),
        customPermissions: user.customPermissions || [],   // ← granular perms
        loginAt:          Date.now(),
      };
      _sessionStore.set(SESSION_KEY, session);
      AppState.set('currentUser', session);
      return { success: true, user: session };
    }

    // Teacher login (email se)
    const teachers = AppState.get('teachers') || [];
    const teacher  = teachers.find(
      t => (t.email || '').toLowerCase() === input && t.loginPassword === password
    );

    if (teacher) {
      // Teacher ka primary campus — pehla campus jo assign hai
      const teacherCampusId = teacher.campuses?.[0] || null;

      const session = {
        userId:    teacher.id,
        username:  teacher.email,
        name:      teacher.fullName,
        role:      'teacher',
        avatar:    teacher.fullName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
        institute: '',
        campusId:  teacherCampusId,          // ← teacher ka campus
        campusIds: Array.isArray(teacher.campuses) ? teacher.campuses : [],
        loginAt:   Date.now(),
        isTeacher: true,
      };
      _sessionStore.set(SESSION_KEY, session);
      AppState.set('currentUser', session);
      return { success: true, user: session };
    }

    return { success: false, message: 'Invalid username/email or password.' };
  },

  logout() {
    _sessionStore.remove(SESSION_KEY);
    AppState.set('currentUser', null);
  },

  restoreSession() {
    const session = _sessionStore.get(SESSION_KEY);
    if (session) {
      const users = AppState.get('users') || [];
      const liveUser = users.find(u => u.id === session.userId || u.username === session.username);

      // ── If user was deleted — force logout immediately ──────────
      if (!liveUser && session.role !== 'admin') { // ✅ FIX 2: !session.role === 'admin' → session.role !== 'admin'
        _sessionStore.remove(SESSION_KEY);
        AppState.set('currentUser', null);
        return null;
      }
      // Also handle non-admin deleted users
      if (!liveUser && users.length > 0) {
        _sessionStore.remove(SESSION_KEY);
        AppState.set('currentUser', null);
        return null;
      }

      if (liveUser) {
        session.customPermissions = liveUser.customPermissions || [];
        session.role = liveUser.role;
        // ✅ FIX: keep campus access in sync with the live user record
        session.campusId = liveUser.campusId || null;
        session.campusIds = Array.isArray(liveUser.campusIds) && liveUser.campusIds.length
                               ? liveUser.campusIds
                               : (liveUser.campusId ? [liveUser.campusId] : []);
      } else if (!session.customPermissions) {
        session.customPermissions = [];
      }
      _sessionStore.set(SESSION_KEY, session);
      AppState.set('currentUser', session);
      return session;
    }
    return null;
  },

  getCurrentUser() {
    return AppState.get('currentUser') || _sessionStore.get(SESSION_KEY);
  },

  // ── Campus-aware data filter ──────────────────────────────────
  // Kisi bhi list ko current user ke allowed campus(es) se filter karo
  // campusKey = us list me campus field ka naam (default: 'campusId')
  // ✅ FIX: ab campusIds (multi-campus) ko bhi support karta hai —
  // pehle sirf single campusId check hota tha, isi wajah se jin
  // users ko multiple ya specific campus (e.g. F8) allow kiya gaya
  // tha unhe dusre campuses ka data (jaise Tests) bhi dikh raha tha.
  filterByCampus(list, campusKey = 'campusId') {
    const user = this.getCurrentUser();
    if (!user || user.role === 'admin') return list; // admin = sab
    const ids = this.getCampusIds();
    if (ids.length === 0) return list; // koi restriction nahi = sab campuses
    return list.filter(item => ids.includes(item[campusKey]));
  },

  // Current user ke allowed campus IDs ki list (empty array = restriction nahi, sab allowed)
  getCampusIds() {
    const user = this.getCurrentUser();
    if (!user) return [];
    if (Array.isArray(user.campusIds) && user.campusIds.length) return user.campusIds;
    if (user.campusId) return [user.campusId];
    return [];
  },

  // Check karo ke current user ko ek specific campus ka access hai ya nahi
  hasCampusAccess(campusId) {
    const user = this.getCurrentUser();
    if (!user) return false;
    if (user.role === 'admin') return true;
    const ids = this.getCampusIds();
    if (ids.length === 0) return true; // restriction nahi = sab campuses allowed
    return ids.includes(campusId);
  },

  // ── Permission checks ─────────────────────────────────────────
  // Priority: admin 'all' → customPermissions (if set) → role defaults
  can(permission) {
    const user = this.getCurrentUser();
    if (!user) return false;

    // ── Deleted user check — agar user ab exist nahi karta ──────
    const users = AppState.get('users') || [];
    if (users.length > 0) {
      const liveUser = users.find(u => u.id === user.userId || u.username === user.username);
      if (!liveUser) {
        // User delete ho gaya — session clear karo aur access deny karo
        _sessionStore.remove(SESSION_KEY);
        AppState.set('currentUser', null);
        return false;
      }
    }

    // Admin always has everything
    if (user.role === 'admin') return true;

    // If user has custom permissions defined, use ONLY those
    if (Array.isArray(user.customPermissions) && user.customPermissions.length > 0) {
      return user.customPermissions.includes(permission);
    }

    // Fall back to role defaults
    const perms = ROLE_PERMISSIONS[user.role] || [];
    return perms.includes(permission) || perms.includes('all');
  },

  canAny(...permissions) {
    return permissions.some(p => this.can(p));
  },

  getPermissions() {
    const user = this.getCurrentUser();
    if (!user) return [];

    // Admin always gets full list
    if (user.role === 'admin') return ROLE_PERMISSIONS['admin'];

    // Custom permissions override role defaults
    if (Array.isArray(user.customPermissions) && user.customPermissions.length > 0) {
      return user.customPermissions;
    }

    return ROLE_PERMISSIONS[user.role] || [];
  },

  // All available permissions grouped for checkbox UI
  ALL_PERMISSIONS: [
    { group: 'Dashboard',      perms: ['dashboard'] },
    { group: 'Analytics',      perms: ['analytics'] },
    { group: 'Admissions',     perms: ['admissions', 'admissions:create', 'admissions:edit', 'admissions:delete'] },
    { group: 'Students',       perms: ['students', 'students:create', 'students:edit', 'students:delete'] },
    { group: 'Enrolment',      perms: ['enrolment'] },
    { group: 'Attendance',     perms: ['attendance', 'attendance:create', 'attendance:edit'] },
    { group: 'Tests',          perms: ['tests', 'tests:create', 'tests:edit', 'tests:delete'] },
    { group: 'Batches',        perms: ['batches', 'batches:create', 'batches:edit', 'batches:delete', 'batches:management', 'batches:configuration'] },
    { group: 'Lecture Plan',   perms: ['lecturePlan', 'lecturePlan:create', 'lecturePlan:edit', 'lecturePlan:delete'] },
    { group: 'Timetable',      perms: ['timetable'] },
    { group: 'Teachers',       perms: ['teachers', 'teachers:create', 'teachers:edit', 'teachers:delete'] },
    { group: 'Fee',            perms: ['fee', 'fee:create', 'fee:edit', 'fee:payment'] },
    { group: 'Revision',       perms: ['revision', 'revision:create', 'revision:edit'] },
    { group: 'Disciplines',    perms: ['disciplines', 'disciplines:create', 'disciplines:edit', 'disciplines:delete'] },
    { group: 'Levels',         perms: ['levels', 'levels:create', 'levels:edit', 'levels:delete'] },
    { group: 'Subjects',       perms: ['subjects', 'subjects:create', 'subjects:edit', 'subjects:delete'] },
    { group: 'Campuses',       perms: ['campuses', 'campuses:create', 'campuses:edit', 'campuses:delete'] },
    { group: 'Institutes',     perms: ['institutes', 'institutes:create', 'institutes:edit', 'institutes:delete'] },
    { group: 'Holidays',       perms: ['holidays', 'holidays:create', 'holidays:edit', 'holidays:delete'] },
    { group: 'Users (Admin)',  perms: ['users', 'users:create', 'users:edit', 'users:delete'] },
    { group: 'Admin Panel',    perms: ['admin'] },
    { group: 'Rooms',          perms: ['rooms', 'rooms:create', 'rooms:edit', 'rooms:delete'] },
    { group: 'Policies',       perms: ['policies', 'policies:create', 'policies:edit', 'policies:delete'] },
    { group: 'Bank',           perms: ['bank', 'bank:create', 'bank:edit', 'bank:delete'] },
    { group: 'Backup',         perms: ['backup'] },
  ],

  applyToDOM() {
    // ── data-requires: hide elements user can't access ──────────
    document.querySelectorAll('[data-requires]').forEach(el => {
      const perm    = el.dataset.requires;
      const allowed = this.can(perm);
      el.style.display       = allowed ? '' : 'none';
      el.dataset.permHidden  = allowed ? 'false' : 'true';
    });

    // ── data-role: show only for matching roles ──────────────────
    document.querySelectorAll('[data-role]').forEach(el => {
      const roles   = el.dataset.role.split(',').map(r => r.trim());
      const user    = this.getCurrentUser();
      const allowed = user && roles.includes(user.role);
      el.style.display      = allowed ? '' : 'none';
      el.dataset.permHidden = allowed ? 'false' : 'true';
    });

    // ── data-requires-disable: disable instead of hide ──────────
    document.querySelectorAll('[data-requires-disable]').forEach(el => {
      const perm = el.dataset.requiresDisable;
      el.disabled = !this.can(perm);
      if (!this.can(perm)) el.title = 'You do not have permission for this action.';
    });

    // ── Hide nav-group-label if ALL items under it are hidden ────
    document.querySelectorAll('.nav-group-label[data-requires]').forEach(label => {
      // Already handled by data-requires above
    });
    // Hide group labels with no visible siblings
    document.querySelectorAll('.nav-group-label:not([data-requires])').forEach(label => {
      // Find next siblings until next group label or end
      let sibling = label.nextElementSibling;
      let hasVisible = false;
      while (sibling && !sibling.classList.contains('nav-group-label')) {
        if (sibling.dataset.permHidden !== 'true') { hasVisible = true; break; }
        sibling = sibling.nextElementSibling;
      }
      label.style.display      = hasVisible ? '' : 'none';
      label.dataset.permHidden = hasVisible ? 'false' : 'true';
    });
  },

  isLoggedIn() {
    return !!this.getCurrentUser();
  },

  getRoleBadgeHTML(role) {
    const r = this._roleMeta(role);
    return `<span style="display:inline-flex;align-items:center;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600;background:${r.bg};color:${r.color}">${r.label}</span>`;
  },

  // ✅ FIX: sidebar wala role text (naam ke neeche) bhi isi se label le —
  // taake "campusAdmin" → "CampusAdmin" ya "hoa" → "Hoa" jaisi ghalat
  // capitalization na ho, aur topbar pill ke label se hamesha match kare
  getRoleLabel(role) {
    return this._roleMeta(role).label;
  },

  _roleMeta(role) {
    const map = {
      admin:       { label: 'Admin',        color: '#4f85f7', bg: 'rgba(79,133,247,0.12)'  },
      campusAdmin: { label: 'Campus Admin', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
      teacher:     { label: 'Teacher',      color: '#10b981', bg: 'rgba(16,185,129,0.12)'  },
      accounts:    { label: 'Accounts',     color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)'  },
      viewer:      { label: 'Viewer',       color: '#8892b4', bg: 'rgba(136,146,180,0.12)' },
      // ✅ FIX: ye 4 naye roles map mein missing thay, isliye har
      // naye role wale user ko "Viewer" dikhta tha (fallback hit ho
      // raha tha) chahe usay Governance/HOA/Principal/Coordinator
      // assign kiya gaya ho.
      hoa:         { label: 'HOA',          color: '#7c3aed', bg: 'rgba(124,58,237,0.12)' },
      governance:  { label: 'Governance',   color: '#06b6d4', bg: 'rgba(6,182,212,0.12)'  },
      principal:   { label: 'Principal',    color: '#ef4444', bg: 'rgba(239,68,68,0.12)'  },
      coordinator: { label: 'Coordinator',  color: '#ec4899', bg: 'rgba(236,72,153,0.12)' },
    };
    return map[role] || map.viewer;
  },
};

// ── Password & ID Utilities ───────────────────────────────────
export function generatePassword() {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower   = 'abcdefghjkmnpqrstuvwxyz';
  const digits  = '23456789';
  const special = '@#$!';
  const rand    = (str) => str[Math.floor(Math.random() * str.length)];
  const parts   = [
    rand(upper), rand(upper), rand(upper),
    rand(lower), rand(lower), rand(lower),
    rand(digits), rand(digits),
    rand(special),
  ];
  return parts.sort(() => Math.random() - 0.5).join('');
}

export function generateTeacherID() {
  return `tch_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ── Teacher Service ───────────────────────────────────────────
export const TeacherService = {

  addTeacher(data) {
    const {
      fullName, qualification, contactNumber,
      email, disciplines = [], campuses = [],
      profilePicture = null,
    } = data;

    if (!fullName?.trim())      return { success: false, message: 'Full name is required.' };
    if (!email?.trim())         return { success: false, message: 'Email is required.' };
    if (!qualification?.trim()) return { success: false, message: 'Qualification is required.' };

    const normalizedEmail = email.toLowerCase().trim();

    const existingTeachers = AppState.get('teachers') || [];
    if (existingTeachers.some(t => t.email.toLowerCase() === normalizedEmail)) {
      return { success: false, message: 'A teacher with this email already exists.' };
    }

    const existingUsers = AppState.get('users') || [];
    if (existingUsers.some(u => (u.email || '').toLowerCase() === normalizedEmail)) {
      return { success: false, message: 'This email is already registered as a user.' };
    }

    const plainPassword = generatePassword();

    const teacher = {
      id:             generateTeacherID(),
      fullName:       fullName.trim(),
      qualification:  qualification.trim(),
      contactNumber:  (contactNumber || '').trim(),
      email:          normalizedEmail,
      loginPassword:  plainPassword,
      disciplines,
      campuses,
      profilePicture: profilePicture || null,
      createdAt:      new Date().toISOString(),
      isActive:       true,
    };

    AppState.add('teachers', teacher);
    return { success: true, teacher, plainPassword };
  },

  updateTeacher(id, patch) {
    const teachers = AppState.get('teachers') || [];
    const existing = teachers.find(t => t.id === id);
    if (!existing) return { success: false, message: 'Teacher not found.' };

    if (patch.email && patch.email.toLowerCase() !== existing.email) {
      const newEmail = patch.email.toLowerCase().trim();
      if (teachers.some(t => t.id !== id && t.email.toLowerCase() === newEmail)) {
        return { success: false, message: 'Email already in use by another teacher.' };
      }
      patch.email = newEmail;
    }

    delete patch.loginPassword;
    delete patch.id;
    delete patch.createdAt;

    const updated = AppState.update('teachers', id, { ...patch, updatedAt: new Date().toISOString() });
    return { success: true, teacher: updated };
  },

  deleteTeacher(id) {
    const teachers = AppState.get('teachers') || [];
    const teacher  = teachers.find(t => t.id === id);
    if (!teacher) return { success: false, message: 'Teacher not found.' };

    const current = AppState.get('currentUser');
    if (current && current.isTeacher && current.userId === id) {
      Auth.logout();
    }

    AppState.remove('teachers', id);
    return { success: true };
  },

  getTeachers({ disciplineId, campusId, activeOnly = false } = {}) {
    let list = AppState.get('teachers') || [];
    if (activeOnly)   list = list.filter(t => t.isActive);
    if (disciplineId) list = list.filter(t => t.disciplines.includes(disciplineId));
    if (campusId)     list = list.filter(t => t.campuses.includes(campusId));
    return list;
  },

  getTeacherById(id) {
    return AppState.findById('teachers', id);
  },

  resetPassword(id) {
    const teacher = AppState.findById('teachers', id);
    if (!teacher) return { success: false, message: 'Teacher not found.' };
    const newPassword = generatePassword();
    AppState.update('teachers', id, { loginPassword: newPassword, updatedAt: new Date().toISOString() });
    return { success: true, plainPassword: newPassword };
  },

  setActive(id, isActive) {
    const teacher = AppState.findById('teachers', id);
    if (!teacher) return { success: false, message: 'Teacher not found.' };
    AppState.update('teachers', id, { isActive, updatedAt: new Date().toISOString() });
    return { success: true };
  },

  getCredentials(id) {
    const teacher = AppState.findById('teachers', id);
    if (!teacher) return null;
    return { email: teacher.email, password: teacher.loginPassword, role: 'teacher' };
  },
};
