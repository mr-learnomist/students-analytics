// ============================================================
// components/navbar.js — Top Navbar Component
// ============================================================

export const Navbar = {
  render(container, options = {}) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    el.innerHTML = this._template(options);
    this._attachEvents(el, options);
  },

  _template({ title = 'Dashboard', breadcrumb = [] } = {}) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    return `
      <header class="navbar" id="mainNavbar">
        <!-- Left: Page title + breadcrumb -->
        <div class="navbar-left">
          <button class="navbar-menu-btn" id="mobileMenuBtn" title="Toggle menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div class="navbar-title-block">
            <h1 class="navbar-title">${title}</h1>
            ${breadcrumb.length ? `
              <div class="breadcrumb">
                <span class="breadcrumb-item">EduTrack</span>
                ${breadcrumb.map(b => `<span class="breadcrumb-sep">›</span><span class="breadcrumb-item">${b}</span>`).join('')}
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Right: Actions -->
        <div class="navbar-right">
          <!-- Date -->
          <div class="navbar-date">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span>${dateStr}</span>
          </div>

          <!-- Theme toggle -->
          <button class="navbar-icon-btn" id="themeToggle" title="Toggle theme">
            <svg class="icon-moon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
            <svg class="icon-sun" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none">
              <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          </button>

          <!-- Notifications -->
          <button class="navbar-icon-btn notif-btn" id="notifBtn" title="Notifications">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <span class="notif-dot"></span>
          </button>

          <!-- Quick Add -->
          <button class="navbar-action-btn" id="quickAddBtn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Quick Add
          </button>

          <!-- Profile -->
          <div class="navbar-profile" id="navProfile">
            <div class="navbar-avatar" id="navAvatar">UM</div>
            <div class="navbar-profile-info">
              <span class="navbar-profile-name" id="navProfileName">Loading…</span>
              <span class="navbar-profile-role" id="navProfileRole">—</span>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--t3)">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
        </div>
      </header>
    `;
  },

  _attachEvents(el) {
    // Mobile menu toggle
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.toggle('mobile-open');
    });

    // Theme toggle
    const themeBtn = document.getElementById('themeToggle');
    const moon = themeBtn?.querySelector('.icon-moon');
    const sun = themeBtn?.querySelector('.icon-sun');

    const applyTheme = (theme) => {
      document.body.classList.toggle('light', theme === 'light');
      if (moon) moon.style.display = theme === 'light' ? 'none' : '';
      if (sun) sun.style.display = theme === 'light' ? '' : 'none';
    };

    const saved = localStorage.getItem('sms_theme') || 'light';
    applyTheme(saved);

    themeBtn?.addEventListener('click', () => {
      const current = document.body.classList.contains('light') ? 'light' : 'dark';
      const next = current === 'light' ? 'dark' : 'light';
      localStorage.setItem('sms_theme', next);
      applyTheme(next);
    });
  },

  updateUser(user) {
    const name = document.getElementById('navProfileName');
    const role = document.getElementById('navProfileRole');
    const avatar = document.getElementById('navAvatar');
    if (name) name.textContent = user.name;
    if (role) role.textContent = user.role;
    if (avatar) avatar.textContent = user.avatar || user.name.slice(0, 2).toUpperCase();
  }
};
