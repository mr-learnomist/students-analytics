// ============================================================
// app.js — Application Entry Point
// Bootstraps EduTrack: state → auth → UI → router
// v2: Attendance Module integrated
// ============================================================

import { AppState }          from './utils/state.js';
import { Auth }              from './utils/auth.js';
import { Router }            from './utils/router.js';
import { Toast }             from './utils/helpers.js';
import { injectUIStyles }    from './utils/ui.js';
import { DisciplineModule }  from './modules/discipline.js';
import { CampusModule }      from './modules/campus.js';
import { InstituteModule }   from './modules/institute.js';
import { LevelsModule }      from './modules/levels.js';
import { SubjectsModule }    from './modules/subjects.js';
import { BatchModule }       from './modules/batch.js';
import { UsersModule }       from './modules/users.js';
import { TeacherUI }         from './modules/teacher/teacherUI.js';
import { StudentModule }     from './modules/student/studentUI.js';
import { AttendanceModule }  from './modules/attendance/attendanceUI.js';
import { HolidaysModule }    from './modules/holidays.js';
import { LecturePlanModule } from './modules/lecturePlan/lecturePlanUI.js';
import { TimetableModule }   from './modules/timetable/timetableUI.js';
import { AdmissionModule }    from './modules/admission/admissionUI.js';
import { TestingModule }     from './modules/testing/testingUI.js';
import { FeeStructureModule } from './modules/admission/feeStructure.js';
import { PoliciesModule }    from './modules/policies.js';
import { BankModule }        from './modules/bank.js';
import { RoomsModule }       from './modules/Room.js';
import { EnrolmentModule }   from './modules/enrolment/enrolmentUI.js';
import { AnalyticsModule }  from './modules/analytics/analyticsUI.js';
import { BackupModule }     from './modules/backupUI.js';
import { BackupManager }    from './utils/backupManager.js';

// ── Boot sequence ─────────────────────────────────────────────
// ✅ FIX: doLogin() ka reference yahan rakhte hain taake showLogin()
// jab #loginPass field ko naye element se replace kare (Chrome
// password-manager popup se bachne ke liye), to naye field pe
// dobara Enter-key submit wire ho sake.
let _doLogin = null;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Step 1: Load all data from server into cache FIRST (async)
    // This MUST complete before any Storage.get() call — fixes the
    // "get() called before loadAll()" warning in storage.js
    await AppState.loadState();

    // Resume auto backup if it was enabled in a previous session
    BackupManager.resumeIfEnabled();

    injectUIStyles();

    // Step 2: Now safe to restore session — cache is populated
    let session = Auth.restoreSession();
    if (!session) {
      const stateUser = AppState.get('currentUser');
      if (stateUser && stateUser.username) {
        // Sync customPermissions from live users list
        const users = AppState.get('users') || [];
        const liveUser = users.find(u => u.id === stateUser.userId || u.username === stateUser.username);
        if (liveUser) {
          stateUser.customPermissions = liveUser.customPermissions || [];
          stateUser.role = liveUser.role;
          // ✅ FIX: campus access bhi live user se sync karo, warna
          // F8-restricted user purana/stale campus access carry karta rahega
          stateUser.campusId = liveUser.campusId || null;
          stateUser.campusIds = Array.isArray(liveUser.campusIds) && liveUser.campusIds.length
                                   ? liveUser.campusIds
                                   : (liveUser.campusId ? [liveUser.campusId] : []);
        } else if (!stateUser.customPermissions) {
          stateUser.customPermissions = [];
        }
        session = stateUser;
      }
    }

    if (session) {
      showApp(session);
    } else {
      AppState.set('currentUser', null);
      showLogin();
    }

    wireLogin();

    window.addEventListener('popstate', (e) => {
      if (!Auth.isLoggedIn()) return;
      const id = e.state?.route || _routeFromHash();
      if (id) Router.navigate(id);
    });

  } catch (err) {
    console.error('[EduTrack] Boot failed:', err);
    if (err?.message === 'EDUTRACK_LOAD_FAILED') {
      _showLoadFailedScreen();
    } else {
      _showLoginFallback();
    }
  }
});

// ── Helpers ───────────────────────────────────────────────────
function _routeFromHash() {
  return window.location.hash?.slice(1) || null;
}

function _showLoginFallback() {
  const loginScreen = document.getElementById('loginScreen');
  const appShell    = document.getElementById('appShell');
  if (loginScreen) loginScreen.style.display = 'flex';
  if (appShell)    appShell.style.display    = 'none';
}

// ✅ FIX: jab server se data load HI nahi ho saka (connection issue),
// to khaali/confusing login form dikhane ke bajaye saaf message
// dikhao + Retry button — taake user "ghalat password" na samjhe
function _showLoadFailedScreen() {
  const loginScreen = document.getElementById('loginScreen');
  const appShell     = document.getElementById('appShell');
  if (appShell) appShell.style.display = 'none';
  if (!loginScreen) return;
  loginScreen.style.display = 'flex';

  const errEl     = document.getElementById('loginErr');
  const resetWrap = document.getElementById('resetWrap');
  const formEls   = ['loginUser', 'loginPass', 'loginBtn'];
  formEls.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  if (resetWrap) resetWrap.style.display = 'none';
  if (errEl) {
    errEl.innerHTML = `Connection se data load nahi ho saka. Internet check karein aur
      <a href="#" id="ldRetryBtn" style="color:inherit;text-decoration:underline;font-weight:700">reload</a> karein.`;
    errEl.style.display = 'block';
    document.getElementById('ldRetryBtn')?.addEventListener('click', e => {
      e.preventDefault();
      window.location.reload();
    });
  }
}

// ── Login screen ──────────────────────────────────────────────
function showLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appShell').style.display    = 'none';
  document.title = 'EduTrack — Login';
  const old = document.getElementById('loginPass');
  if (old) {
    const fresh = document.createElement('input');
    fresh.id = 'loginPass';
    fresh.className = old.className;
    fresh.type = 'password';
    fresh.placeholder = 'Enter password';
    fresh.setAttribute('autocomplete', 'off');
    fresh.setAttribute('data-lpignore', 'true');
    // ✅ FIX: naye (swapped) password field pe Enter-key submit
    // dobara wire karo — yahan _doLogin ek live reference hai,
    // isliye chahe ye field kitni baar bhi replace ho, hamesha
    // sahi/current doLogin chalega
    fresh.addEventListener('keydown', e => { if (e.key === 'Enter') _doLogin?.(); });
    old.replaceWith(fresh);
  }
  // setTimeout(() => document.getElementById('loginUser')?.focus(), 100);
}

function wireLogin() {
  const btn   = document.getElementById('loginBtn');
  const errEl = document.getElementById('loginErr');

  const doLogin = () => {
    // ✅ FIX (root cause): pehle uInp/pInp wireLogin() ke shuru mein
    // sirf EK dafa capture hote thay. Lekin showLogin() har baar
    // (logout ke baad, ya navigation-fallback pe) #loginPass field ko
    // ek NAYE DOM element se replace karta hai (Chrome password-manager
    // popup se bachne ke liye). Is wajah se ye closure purane (detached)
    // node ko hi check karta rehta — jis ka value hamesha khali hota —
    // chahe screen pe password sahi dikh rahi ho. Isi se "Please enter
    // username and password" ghalat tareeqe se aata tha, ya button
    // click karne pe kuch hota hi nahi tha. Ab live lookup karte hain
    // taake hamesha CURRENT field hi check ho.
    const uInp = document.getElementById('loginUser');
    const pInp = document.getElementById('loginPass');
    if (!uInp || !pInp || !errEl) return;

    errEl.style.display = 'none';
    document.getElementById('resetWrap').style.display = 'none';
    uInp.classList.remove('error');
    pInp.classList.remove('error');

    if (!uInp.value.trim() || !pInp.value) {
      errEl.textContent = 'Please enter username and password.';
      errEl.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Signing in…';

    setTimeout(() => {
      const r = Auth.login(uInp.value, pInp.value);
      btn.disabled = false;
      btn.textContent = 'Sign In';

      if (r.success) {
        showApp(r.user);
      } else {
        errEl.textContent = r.message;
        errEl.style.display = 'block';
        document.getElementById('resetWrap').style.display = 'block';
        uInp.classList.add('error');
        pInp.classList.add('error');
        pInp.value = '';
      }
    }, 400);
  };

  _doLogin = doLogin; // ✅ showLogin() naye password field ke liye yehi reference use karega

  document.getElementById('resetDataBtn')?.addEventListener('click', () => {
    AppState.resetState();
    errEl.style.display = 'none';
    document.getElementById('resetWrap').style.display = 'none';
    const uInp = document.getElementById('loginUser');
    const pInp = document.getElementById('loginPass');
    uInp.classList.remove('error');
    pInp.classList.remove('error');
    uInp.value = 'admin';
    pInp.value = 'admin123';
    doLogin();
  });

  btn?.addEventListener('click', doLogin);
  document.getElementById('loginPass')?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('loginUser')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('loginPass')?.focus(); });

  document.querySelectorAll('.demo-btn').forEach(b =>
    b.addEventListener('click', () => {
      document.getElementById('loginUser').value = b.dataset.u;
      document.getElementById('loginPass').value = b.dataset.p;
      doLogin();
    })
  );
}

// ── App shell ─────────────────────────────────────────────────
function showApp(user) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appShell').style.display    = 'block';

  const init = user.avatar || user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const G = id => document.getElementById(id);

  G('sbAvatar').textContent  = init;
  G('sbName').textContent    = user.name;
  G('sbRole').textContent    = Auth.getRoleLabel(user.role);
  G('nbAvatar').textContent  = init;
  G('nbName').textContent    = user.name;
  G('nbRolePill').innerHTML  = Auth.getRoleBadgeHTML(user.role);
  G('navDate').textContent   = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  G('wInst').textContent     = user.institute || 'EduTrack';

  const hr = new Date().getHours();
  const gr = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  G('welcomeHd').textContent = gr + ', ' + user.name.split(' ')[0] + '!';
  G('wDate').textContent     = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  Auth.applyToDOM();
  wireSidebar();
  wireNavbar();
  registerRoutes();

  window.history.replaceState({}, '', window.location.pathname);

  try {
    Router.navigate('dashboard');
  } catch (navErr) {
    console.error('[Router] Navigation failed:', navErr);
    showLogin();
    return;
  }

  initDashboard();
  AppState.subscribe('batches', updateBadges);
  updateBadges();

  setTimeout(() => Toast.success('Welcome back, ' + user.name.split(' ')[0] + '!'), 600);
}

function updateBadges() {
  const b  = AppState.get('batches') || [];
  const el = document.getElementById('sbBatchBadge');
  if (el) el.textContent = b.length || '0';
}

// ── Route registration ────────────────────────────────────────
function registerRoutes() {
  Router
    .register('dashboard',  { permission: 'dashboard',  title: 'Dashboard',   mount: null })
    .register('batches',    { permission: 'batches',    title: 'Batches',     mount: (el) => BatchModule.mount(el.querySelector('#batchMount')) })
    .register('admin',      { permission: 'admin',      title: 'Admin Panel', mount: () => initAdminTabs() })
    .register('students',   { permission: 'students',   title: 'Students',    mount: (el) => StudentModule.mount(el.querySelector('#studentMount')) })
    // ── Attendance: mount into #attendanceMount ────────────────
    .register('attendance', {
      permission: 'attendance',
      title: 'Attendance',
      mount: (el) => {
        const mountEl = el.querySelector('#attendanceMount');
        if (mountEl) AttendanceModule.mount(mountEl);
      }
    })
    .register('tests',      { permission: 'tests',      title: 'Tests & Results', mount: (el) => TestingModule.mount(el.querySelector('#testMount')) })
    .register('lecturePlan',{ permission: 'lecturePlan', title: 'Lecture Plans', mount: (el) => LecturePlanModule.mount(el.querySelector('#lecturePlanMount')) })
    .register('timetable',  { permission: 'timetable',   title: 'Timetable',     mount: (el) => {
        const mountEl = el.querySelector('#timetableMount');
        if (mountEl) TimetableModule.mount(mountEl);
      }
    })
    .register('admissions', { permission: 'admissions',  title: 'Admissions',   mount: (el) => AdmissionModule.mount(el.querySelector('#admissionMount')) })
    .register('enrolment',  { permission: 'enrolment',   title: 'Enrolment',    mount: (el) => {
        const mountEl = el.querySelector('#enrolmentMount');
        if (mountEl) EnrolmentModule.mount(mountEl);
      }
    })
    .register('analytics', { permission: 'analytics',   title: 'Analytics',    mount: (el) => {
        const mountEl = el.querySelector('#analyticsMount');
        if (mountEl) AnalyticsModule.mount(mountEl);
      }
    });

  Router.onChange((id, route) => {
    document.getElementById('pageTitle').textContent = route.title || id;
    document.getElementById('pageBc').textContent    = route.title || id;

    if (window.location.hash.slice(1) !== id) {
      window.history.replaceState({ route: id }, '', `#${id}`);
    }
  });
}

// ── Admin tab → required permission map ─────────────────────
// Har admin tab ki apni granular permission hoti hai. Agar user ke
// paas wo permission nahi hai to tab ka button hi hide ho jata hai
// — koi "access denied" message nahi dikhta.
const ADMIN_TAB_PERMISSIONS = {
  institutes:    'institutes',
  campuses:      'campuses',
  disciplines:   'disciplines',
  levels:        'levels',
  subjects:      'subjects',
  rooms:         'rooms',
  users:         'users',
  teachers:      'teachers',
  holidays:      'holidays',
  feeStructures: 'fee',
  policies:      'policies',
  bank:          'bank',
  backup:        'backup',
};

function initAdminTabs() {
  // ── Sirf wahi tabs dikhao jin ki permission user ke paas hai ──
  document.querySelectorAll('#adminTabs .tab-btn[data-tab]').forEach(btn => {
    const perm    = ADMIN_TAB_PERMISSIONS[btn.dataset.tab];
    const allowed = !perm || Auth.can(perm);
    btn.style.display = allowed ? '' : 'none';
  });

  document.getElementById('adminTabs')?.addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (btn?.dataset.tab) activateAdminTab(btn.dataset.tab);
  });

  // Saved tab tabhi use karo agar abhi bhi permitted hai, warna
  // pehla visible tab default ban jaye
  const saved        = localStorage.getItem('sms_admin_tab');
  const savedPerm     = saved && ADMIN_TAB_PERMISSIONS[saved];
  const savedAllowed  = saved && (!savedPerm || Auth.can(savedPerm));
  const firstVisible  = [...document.querySelectorAll('#adminTabs .tab-btn[data-tab]')]
                           .find(b => b.style.display !== 'none');

  activateAdminTab(savedAllowed ? saved : (firstVisible?.dataset.tab || 'institutes'));
}

function activateAdminTab(tab) {
  // ✅ FIX: agar permission nahi hai to silently kuch na karo —
  // koi error/denied message nahi, tab simply switch nahi hoga
  const perm = ADMIN_TAB_PERMISSIONS[tab];
  if (perm && !Auth.can(perm)) return;

  document.querySelectorAll('#adminTabs .tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  document.querySelectorAll('#viewContainer .module-panel').forEach(p =>
    p.classList.toggle('active', p.id === 'panel-' + tab)
  );

  const el   = document.getElementById('panel-' + tab);
  const mods = {
    institutes:    () => InstituteModule.mount(el),
    campuses:      () => CampusModule.mount(el),
    disciplines:   () => DisciplineModule.mount(el),
    levels:        () => LevelsModule.mount(el),
    subjects:      () => SubjectsModule.mount(el),
    rooms:         () => RoomsModule.mount(el),
    users:         () => UsersModule.mount(el),
    teachers:      () => TeacherUI.mount(el),
    holidays:      () => HolidaysModule.mount(el),
    feeStructures: () => FeeStructureModule.mount(el),
    policies:      () => PoliciesModule.mount(el),
    bank:          () => BankModule.mount(el),
    backup:        () => BackupModule.mount(el),
  };
  mods[tab]?.();

  localStorage.setItem('sms_admin_tab', tab);
}

// ── Sidebar wiring ────────────────────────────────────────────
function wireSidebar() {
  document.getElementById('collapseBtn')?.addEventListener('click', () => {
    const sb = document.getElementById('sidebar');
    sb.classList.toggle('collapsed');
    localStorage.setItem('sms_sidebar_collapsed', sb.classList.contains('collapsed'));
  });

  if (localStorage.getItem('sms_sidebar_collapsed') === 'true')
    document.getElementById('sidebar')?.classList.add('collapsed');

  document.getElementById('sbNav')?.addEventListener('click', e => {
    const item = e.target.closest('.nav-item[data-route]');
    if (!item) return;
    e.preventDefault();
    Router.navigate(item.dataset.route);
  });

  document.getElementById('sbSearch')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.nav-item[data-route]').forEach(i => {
      // Never reveal permission-hidden items during search
      if (i.dataset.permHidden === 'true') return;
      const lbl = i.querySelector('.nav-label')?.textContent?.toLowerCase() || '';
      i.style.display = (!q || lbl.includes(q)) ? '' : 'none';
    });
  });

  document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('mobile-open');
  });
}

// ── Theme CSS variables ───────────────────────────────────────
const THEMES = {
  dark: {
    '--bg':         '#0b0d14',
    '--surface':    '#111520',
    '--surface2':   '#171c2e',
    '--surface3':   '#1e2438',
    '--surface4':   '#252c44',
    '--border':     'rgba(255,255,255,0.055)',
    '--border2':    'rgba(255,255,255,0.09)',
    '--t1':         '#e8eaf6',
    '--t2':         '#8892b4',
    '--t3':         '#4a5270',
    '--t4':         '#272d47',
    '--blue':       '#4f85f7',
    '--blue-dim':   'rgba(79,133,247,0.12)',
    '--green':      '#10b981',
    '--green-dim':  'rgba(16,185,129,0.12)',
    '--yellow':     '#f59e0b',
    '--yellow-dim': 'rgba(245,158,11,0.12)',
    '--violet':     '#8b5cf6',
    '--violet-dim': 'rgba(139,92,246,0.12)',
    '--cyan':       '#06b6d4',
    '--cyan-dim':   'rgba(6,182,212,0.12)',
    '--red':        '#ef4444',
    '--red-dim':    'rgba(239,68,68,0.12)',
    '--shadow':     '0 4px 24px rgba(0,0,0,0.35)',
    '--shadow-lg':  '0 12px 48px rgba(0,0,0,0.45)',
  },
  light: {
    '--bg':         '#f0f2f8',
    '--surface':    '#ffffff',
    '--surface2':   '#f5f6fa',
    '--surface3':   '#ebedf5',
    '--surface4':   '#e0e3ef',
    '--border':     'rgba(0,0,0,0.08)',
    '--border2':    'rgba(0,0,0,0.13)',
    '--t1':         '#0d1020',
    '--t2':         '#3a4060',
    '--t3':         '#7a82a0',
    '--t4':         '#c5c9da',
    '--blue':       '#2563eb',
    '--blue-dim':   'rgba(37,99,235,0.10)',
    '--green':      '#059669',
    '--green-dim':  'rgba(5,150,105,0.10)',
    '--yellow':     '#d97706',
    '--yellow-dim': 'rgba(217,119,6,0.10)',
    '--violet':     '#7c3aed',
    '--violet-dim': 'rgba(124,58,237,0.10)',
    '--cyan':       '#0891b2',
    '--cyan-dim':   'rgba(8,145,178,0.10)',
    '--red':        '#dc2626',
    '--red-dim':    'rgba(220,38,38,0.10)',
    '--shadow':     '0 4px 24px rgba(0,0,0,0.10)',
    '--shadow-lg':  '0 12px 48px rgba(0,0,0,0.15)',
  }
};

// ── Navbar wiring ─────────────────────────────────────────────
function wireNavbar() {
  const tBtn = document.getElementById('themeToggle');
  const moon = tBtn?.querySelector('.icon-moon');
  const sun  = tBtn?.querySelector('.icon-sun');

  const applyTheme = t => {
    const vars = THEMES[t] || THEMES.dark;
    const root = document.documentElement;
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
    if (moon) moon.style.display = t === 'light' ? 'none' : '';
    if (sun)  sun.style.display  = t === 'light' ? ''     : 'none';
    document.body.style.background = '';
    document.body.style.color      = '';
    const banner = document.querySelector('.welcome-banner');
    if (banner) {
      banner.style.background = t === 'light'
        ? 'linear-gradient(120deg, #e8edf8 0%, #dde4f5 50%, #e2e8f6 100%)'
        : 'linear-gradient(120deg, #1a2240 0%, #141b30 50%, #151d38 100%)';
    }
    const loginScreen = document.getElementById('loginScreen');
    if (loginScreen) {
      loginScreen.style.background = t === 'light'
        ? 'radial-gradient(ellipse at 20% 50%,rgba(37,99,235,0.07) 0%,transparent 60%), radial-gradient(ellipse at 80% 20%,rgba(124,58,237,0.05) 0%,transparent 60%), #f0f2f8'
        : '';
    }
  };

  applyTheme(localStorage.getItem('sms_theme') || 'dark');

  tBtn?.addEventListener('click', () => {
    const next = (localStorage.getItem('sms_theme') || 'dark') === 'dark' ? 'light' : 'dark';
    localStorage.setItem('sms_theme', next);
    applyTheme(next);
  });

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    Auth.logout();
    Toast.info('Logged out successfully.');
    setTimeout(() => {
      document.getElementById('loginUser').value = '';
      document.getElementById('loginPass').value = '';
      window.history.replaceState({}, '', window.location.pathname + window.location.search);
      showLogin();
    }, 400);
  });
}

// ── Dashboard ─────────────────────────────────────────────────
const KPI = {
  totalStudents: 1284, attendancePercent: 87.4, activeBatches: 34, performanceIndex: 79.2,
  trends: { students: '+12%', attendance: '-2.1%', batches: '+3', performance: '+4.6%' }
};
const ATT = {
  labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  data:   [82, 85, 88, 84, 79, 91, 87, 90, 85, 88, 86, 87]
};
const GRW = {
  labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  data:   [950, 980, 1010, 1045, 1080, 1100, 1130, 1160, 1195, 1230, 1258, 1284]
};
const INS = [
  { label: 'Top Performing Batch', value: 'CS-401',  sub: '94.2% avg attendance'  },
  { label: 'Lowest Attendance',    value: 'BBA-102', sub: '71.3% — needs attention' },
  { label: 'Tests This Week',      value: '7',       sub: '3 pending results'      },
  { label: 'Active Teachers',      value: '42',      sub: 'Out of 48 total'        },
];
const ACT = [
  { type: 'attendance', msg: 'Batch CS-301 attendance marked',          user: 'Dr. Sarah Ahmed', time: '2 min ago'  },
  { type: 'student',    msg: 'New student enrolled: Ali Hassan',        user: 'Admin',           time: '14 min ago' },
  { type: 'test',       msg: 'Mid-term results uploaded for BBA-201',   user: 'Prof. Zaid Khan', time: '1 hr ago'   },
  { type: 'batch',      msg: 'New batch created: MATH-401',             user: 'Admin',           time: '3 hr ago'   },
  { type: 'holiday',    msg: 'Holiday added: Eid ul Adha',              user: 'Admin',           time: 'Yesterday'  },
];

let _ac, _gc;

function initDashboard() {
  const liveBatches  = (AppState.get('batches')   || []).length;
  const liveStudents = (AppState.get('students')  || []).length;
  const kpi = { ...KPI, activeBatches: liveBatches || KPI.activeBatches, totalStudents: liveStudents || KPI.totalStudents };

  // ── Permission-aware welcome stats ──────────────────────────
  const wS = document.getElementById('wS');
  const wB = document.getElementById('wB');
  const wA = document.getElementById('wA');

  // Hide entire stat if user has no access to that module
  wS?.closest('.w-stat') && (wS.closest('.w-stat').style.display = Auth.can('students')   ? '' : 'none');
  wB?.closest('.w-stat') && (wB.closest('.w-stat').style.display = Auth.can('batches')    ? '' : 'none');
  wA?.closest('.w-stat') && (wA.closest('.w-stat').style.display = Auth.can('attendance') ? '' : 'none');

  if (Auth.can('students'))   wS && (wS.textContent = kpi.totalStudents.toLocaleString());
  if (Auth.can('batches'))    wB && (wB.textContent = kpi.activeBatches);
  if (Auth.can('attendance')) wA && (wA.textContent = kpi.attendancePercent + '%');

  // ── KPI cards — only show permitted ones ────────────────────
  const kpiPermMap = [
    { perm: 'students',   key: 'students'   },
    { perm: 'attendance', key: 'attendance' },
    { perm: 'batches',    key: 'batches'    },
    { perm: 'dashboard',  key: 'performance'},  // performance always if dashboard
  ];

  // Filter KPI defs based on permissions
  const kpiDefs = [
    { perm: 'students',   lbl:'Total Students',  val: kpi.totalStudents.toLocaleString(), trend: kpi.trends.students,    up: true,  c:'#4f85f7', w:'85%', sub:'Enrolled this year',   icon:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' },
    { perm: 'attendance', lbl:'Attendance Rate', val: kpi.attendancePercent + '%',        trend: kpi.trends.attendance,  up: false, c:'#f59e0b', w:'87%', sub:'Monthly average',      icon:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>' },
    { perm: 'batches',    lbl:'Active Batches',  val: kpi.activeBatches,                  trend: kpi.trends.batches,     up: true,  c:'#8b5cf6', w:'68%', sub:'Across all campuses', icon:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>' },
    { perm: 'dashboard',  lbl:'Performance',     val: kpi.performanceIndex,               trend: kpi.trends.performance, up: true,  c:'#06b6d4', w:'79%', sub:'Composite /100',       icon:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' },
  ];

  // Only render KPIs user can see
  const visibleKpis = kpiDefs.filter(d => Auth.can(d.perm));
  setTimeout(() => renderKPIs(kpi, visibleKpis), 500);

  // ── Charts — hide if no relevant permission ──────────────────
  const chartsRow = document.querySelector('.charts-row');
  const attChart  = document.getElementById('attendanceChart')?.closest('.chart-card');
  const grwChart  = document.getElementById('growthChart')?.closest('.chart-card');

  if (attChart) attChart.style.display = Auth.can('attendance') ? '' : 'none';
  if (grwChart) grwChart.style.display = Auth.can('students')   ? '' : 'none';

  // Hide charts row entirely if both hidden
  if (chartsRow && !Auth.can('attendance') && !Auth.can('students')) {
    chartsRow.style.display = 'none';
  }

  // ── Insights & Activity — hide if no meaningful access ───────
  const brow = document.querySelector('.brow');
  if (brow) {
    const hasAnyAccess = Auth.canAny('students','attendance','batches','tests');
    brow.style.display = hasAnyAccess ? '' : 'none';
  }

  if (Auth.can('attendance') || Auth.can('students')) renderCharts();
  renderInsights(INS);
  renderActivity(ACT);

  document.getElementById('refreshBtn')?.addEventListener('click', () => {
    renderInsights(INS);
    Toast.info('Insights refreshed.');
  });

  AppState.subscribe('batches', () => {
    const b = (AppState.get('batches') || []).length;
    if (Auth.can('batches')) document.getElementById('wB') && (document.getElementById('wB').textContent = b || kpi.activeBatches);
    renderKPIs({ ...kpi, activeBatches: b || kpi.activeBatches }, visibleKpis);
  });

  AppState.subscribe('students', () => {
    const s = (AppState.get('students') || []).length;
    if (Auth.can('students')) document.getElementById('wS') && (document.getElementById('wS').textContent = s || kpi.totalStudents);
  });
}

function renderKPIs(kpi, defs = null) {
  // Use passed defs (permission-filtered) or fall back to all
  const allDefs = [
    { perm: 'students',   lbl:'Total Students',  val: kpi.totalStudents.toLocaleString(), trend: kpi.trends.students,    up: true,  c:'#4f85f7', w:'85%', sub:'Enrolled this year',   icon:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' },
    { perm: 'attendance', lbl:'Attendance Rate', val: kpi.attendancePercent + '%',        trend: kpi.trends.attendance,  up: false, c:'#f59e0b', w:'87%', sub:'Monthly average',      icon:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>' },
    { perm: 'batches',    lbl:'Active Batches',  val: kpi.activeBatches,                  trend: kpi.trends.batches,     up: true,  c:'#8b5cf6', w:'68%', sub:'Across all campuses', icon:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>' },
    { perm: 'dashboard',  lbl:'Performance',     val: kpi.performanceIndex,               trend: kpi.trends.performance, up: true,  c:'#06b6d4', w:'79%', sub:'Composite /100',       icon:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' },
  ];
  const activeDefs = defs || allDefs.filter(d => Auth.can(d.perm));

  document.getElementById('kpiGrid').innerHTML = activeDefs.map(d => {
    const tc = d.up ? '#10b981' : '#ef4444';
    const ar = d.up
      ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>'
      : '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>';
    return `<div class="kpi-card">
      <div class="kpi-hdr">
        <div class="kpi-icon" style="background:${d.c}18;color:${d.c}">${d.icon}</div>
        <span class="kpi-trend" style="background:${tc}18;color:${tc}">${ar} ${d.trend}</span>
      </div>
      <div class="kpi-val">${d.val}</div>
      <div class="kpi-lbl">${d.lbl}</div>
      <div class="kpi-sub">${d.sub}</div>
      <div class="kpi-bar-wrap"><div class="kpi-bar" style="background:${d.c}" data-w="${d.w}"></div></div>
    </div>`;
  }).join('');

  requestAnimationFrame(() =>
    document.querySelectorAll('.kpi-bar[data-w]').forEach(b =>
      setTimeout(() => { b.style.width = b.dataset.w; }, 120)
    )
  );
}

function renderCharts() {
  if (typeof Chart === 'undefined') {
    console.warn('[EduTrack] Chart.js not loaded — charts skipped.');
    return;
  }

  const t = { grid: 'rgba(255,255,255,0.05)', text: '#4a5270', bg: '#1a2030', border: 'rgba(255,255,255,0.08)' };

  const ac = document.getElementById('attendanceChart')?.getContext('2d');
  if (ac) {
    if (_ac) _ac.destroy();
    const g = ac.createLinearGradient(0, 0, 0, 200);
    g.addColorStop(0, 'rgba(79,133,247,0.25)');
    g.addColorStop(1, 'rgba(79,133,247,0)');
    _ac = new Chart(ac, {
      type: 'line',
      data: { labels: ATT.labels, datasets: [{ data: ATT.data, borderColor: '#4f85f7', backgroundColor: g, borderWidth: 2.5, tension: 0.4, fill: true, pointBackgroundColor: '#4f85f7', pointRadius: 3, pointHoverRadius: 5 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: t.bg, borderColor: t.border, borderWidth: 1, titleColor: '#e8eaf6', bodyColor: '#8892b4', padding: 10, callbacks: { label: c => '  ' + c.parsed.y + '%' } } },
        scales: { x: { grid: { color: t.grid }, ticks: { color: t.text, font: { size: 11 } } }, y: { min: 60, max: 100, grid: { color: t.grid }, ticks: { color: t.text, font: { size: 11 }, callback: v => v + '%' } } }
      }
    });
  }

  const gc = document.getElementById('growthChart')?.getContext('2d');
  if (gc) {
    if (_gc) _gc.destroy();
    _gc = new Chart(gc, {
      type: 'bar',
      data: { labels: GRW.labels, datasets: [{ data: GRW.data, backgroundColor: GRW.data.map((_, i) => i === GRW.data.length - 1 ? '#10b981' : 'rgba(16,185,129,0.2)'), borderRadius: 6, borderSkipped: false }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: t.bg, borderColor: t.border, borderWidth: 1, titleColor: '#e8eaf6', bodyColor: '#8892b4', padding: 10, callbacks: { label: c => '  ' + c.parsed.y.toLocaleString() + ' students' } } },
        scales: { x: { grid: { display: false }, ticks: { color: t.text, font: { size: 11 } } }, y: { grid: { color: t.grid }, ticks: { color: t.text, font: { size: 11 }, callback: v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v } } }
      }
    });
  }
}

function renderInsights(items) {
  document.getElementById('insightGrid').innerHTML = items.map(i =>
    `<div class="insight-item"><div class="il">${i.label}</div><div class="iv">${i.value}</div><div class="is">${i.sub}</div></div>`
  ).join('');
}

function renderActivity(items) {
  const cm = {
    attendance: { bg: 'rgba(16,185,129,0.12)',  fg: '#10b981' },
    student:    { bg: 'rgba(79,133,247,0.12)',  fg: '#4f85f7' },
    test:       { bg: 'rgba(245,158,11,0.12)',  fg: '#f59e0b' },
    batch:      { bg: 'rgba(139,92,246,0.12)',  fg: '#8b5cf6' },
    holiday:    { bg: 'rgba(6,182,212,0.12)',   fg: '#06b6d4' },
  };
  document.getElementById('actList').innerHTML = items.map(a => {
    const c = cm[a.type] || cm.student;
    return `<div class="act-item">
      <div class="act-icon" style="background:${c.bg};color:${c.fg}">
        <div style="width:8px;height:8px;border-radius:50%;background:currentColor"></div>
      </div>
      <div style="flex:1;min-width:0">
        <div class="act-msg">${a.msg}</div>
        <div class="act-meta">
          <span class="act-user">${a.user}</span>
          <span class="act-sep"></span>
          <span class="act-time">${a.time}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}
