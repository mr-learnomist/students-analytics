// ============================================================
// utils/router.js — SPA Client-side Router
// Controls which view/section is visible — zero page reloads
// ============================================================

import { Auth } from './auth.js';

// ── Route registry ────────────────────────────────────────────
// Each route: { id, permission, mount: async fn, title }
const _routes = new Map();
let _currentRoute = null;
let _onRouteChange = null; // callback for nav highlight

export const Router = {

  // ── Register a route ───────────────────────────────────────
  register(id, { permission = null, mount, title = '' } = {}) {
    _routes.set(id, { id, permission, mount, title });
    return this;
  },

  // ── Navigate to a route ────────────────────────────────────
  async navigate(id, params = {}) {
    const route = _routes.get(id);
    if (!route) { console.warn(`[Router] Unknown route: ${id}`); return; }

    // Permission check — ✅ FIX: koi "Access Denied" message nahi dikhana.
    // Agar permission nahi hai to silently dashboard pe le jao (jahan
    // permission ho), warna current view ko hi rehne do. User ko kabhi
    // feel nahi hona chahiye ke usay kisi cheez se rok diya gaya hai.
    if (route.permission && !Auth.can(route.permission)) {
      console.warn(`[Router] "${id}" blocked silently — user lacks "${route.permission}" permission.`);
      if (id !== 'dashboard' && Auth.can('dashboard')) {
        this.navigate('dashboard');
      }
      return;
    }

    // Hide all views
    document.querySelectorAll('[data-view]').forEach(el => {
      el.style.display = 'none';
      el.classList.remove('view--active');
    });

    // Show target view
    const viewEl = document.querySelector(`[data-view="${id}"]`);
    if (viewEl) {
      viewEl.style.display = '';
      viewEl.classList.add('view--active');
    }

    // Update page title
    if (route.title) {
      document.title = `EduTrack — ${route.title}`;
      const titleEl = document.getElementById('pageTitle');
      if (titleEl) titleEl.textContent = route.title;
      const subtitleEl = document.getElementById('pageBreadcrumb');
      if (subtitleEl) subtitleEl.textContent = route.title;
    }

    // Mount the module (lazy — only if view el exists and not yet mounted)
    if (route.mount && viewEl) {
      const alreadyMounted = viewEl.dataset.mounted === 'true';
      if (!alreadyMounted) {
        await route.mount(viewEl, params);
        viewEl.dataset.mounted = 'true';
      }
    }

    _currentRoute = id;

    // Update sidebar active state
    document.querySelectorAll('.nav-item[data-route]').forEach(el => {
      el.classList.toggle('active', el.dataset.route === id);
    });

    // External callback (e.g. update breadcrumb)
    if (_onRouteChange) _onRouteChange(id, route);

    // Save to history (optional — enables back button)
    if (window.history?.pushState) {
      window.history.pushState({ route: id }, '', `#${id}`);
    }
  },

  // ── Get current route id ───────────────────────────────────
  current() { return _currentRoute; },

  // ── Set change callback ────────────────────────────────────
  onChange(fn) { _onRouteChange = fn; },

  // ── Handle browser back/forward ───────────────────────────
  initHistory() {
    window.addEventListener('popstate', (e) => {
      const id = e.state?.route || this._routeFromHash();
      if (id) this.navigate(id);
    });
    // Initial load from hash
    const initial = this._routeFromHash();
    if (initial && _routes.has(initial)) this.navigate(initial);
  },

  _routeFromHash() {
    return window.location.hash?.slice(1) || null;
  },
};
