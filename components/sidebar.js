// ============================================================
// components/sidebar.js — Reusable Sidebar Component
// Hover = open, Mouse leave = close (60px icon-only collapsed)
// ============================================================

export const Sidebar = {
  _activeRoute: 'dashboard',

  navItems: [
    {
      group: 'Overview',
      items: [
        { id: 'dashboard', label: 'Dashboard', href: '../index.html', icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>` },
      ]
    },
    {
      group: 'Academics',
      items: [
        { id: 'students', label: 'Students', href: 'pages/students.html', icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`, badge: '1,284' },
        { id: 'attendance', label: 'Attendance', href: 'pages/attendance.html', icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>` },
        { id: 'tests', label: 'Tests & Results', href: 'pages/tests.html', icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>` },
        { id: 'revision', label: 'Weekly Revision', href: 'pages/revision.html', icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>` },
      ]
    },
    {
      group: 'Management',
      items: [
        { id: 'batch', label: 'Batches', href: '#', icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>` },
        { id: 'subjects', label: 'Subjects', href: '#', icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>` },
        { id: 'holidays', label: 'Holidays', href: '#', icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>` },
      ]
    },
    {
      group: 'Configuration',
      items: [
        { id: 'admin', label: 'Admin Panel', href: 'pages/admin.html', icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>` },
        { id: 'campus', label: 'Campus', href: '#', icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>` },
        { id: 'discipline', label: 'Disciplines', href: '#', icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>` },
      ]
    }
  ],

  getActiveFromPath() {
    const path = window.location.pathname;
    const file = path.split('/').pop().replace('.html', '') || 'index';
    return file === 'index' ? 'dashboard' : file;
  },

  render(container, activeId = null) {
    this._activeRoute = activeId || this.getActiveFromPath();
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    el.innerHTML = this._template();
    this._attachEvents(el);
  },

  _template() {
    return `
      <aside class="sidebar collapsed" id="sidebar">
        <div class="sidebar-brand">
          <div class="sidebar-logo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
            </svg>
          </div>
          <div class="sidebar-brand-text">
            <span class="sidebar-brand-name">EduTrack</span>
            <span class="sidebar-brand-sub">Management Suite</span>
          </div>
        </div>

        <div class="sidebar-search">
          <div class="sidebar-search-inner">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" placeholder="Search modules…" id="sidebarSearch"/>
          </div>
        </div>

        <nav class="sidebar-nav" id="sidebarNav">
          ${this.navItems.map(group => `
            <div class="nav-group" data-group="${group.group}">
              <span class="nav-group-label">${group.group}</span>
              ${group.items.map(item => `
                <a href="${item.href}" class="nav-item ${item.id === this._activeRoute ? 'active' : ''}" data-id="${item.id}" data-label="${item.label}">
                  <span class="nav-icon">${item.icon}</span>
                  <span class="nav-label">${item.label}</span>
                  ${item.badge ? `<span class="nav-badge">${item.badge}</span>` : ''}
                </a>
              `).join('')}
            </div>
          `).join('')}
        </nav>

        <div class="sidebar-footer">
          <div class="sidebar-user" id="sidebarUser">
            <div class="sidebar-avatar" id="sidebarAvatar">UM</div>
            <div class="sidebar-user-info">
              <span class="sidebar-user-name" id="sidebarUserName">Loading…</span>
              <span class="sidebar-user-role" id="sidebarUserRole">—</span>
            </div>
            <button class="sidebar-user-menu" title="Account menu" id="sidebarMenuBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
              </svg>
            </button>
          </div>

          <!-- User context menu popup -->
          <div class="sidebar-user-popup" id="sidebarUserPopup">
            <div class="sup-header">
              <div class="sup-avatar" id="supAvatar">UM</div>
              <div class="sup-info">
                <span class="sup-name" id="supName">Loading…</span>
                <span class="sup-role" id="supRole">—</span>
              </div>
            </div>
            <div class="sup-divider"></div>
            <button class="sup-item" id="supProfileBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              My Profile
            </button>
            <button class="sup-item" id="supSettingsBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              Settings
            </button>
            <div class="sup-divider"></div>
            <button class="sup-item sup-logout" id="supLogoutBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Logout
            </button>
          </div>
        </div>
      </aside>
    `;
  },

  _attachEvents(el) {
    const sidebar = el.querySelector('#sidebar');
    let closeTimer = null;

    sidebar?.addEventListener('mouseenter', () => {
      clearTimeout(closeTimer);
      sidebar.classList.remove('collapsed');
    });

    sidebar?.addEventListener('mouseleave', (e) => {
      clearTimeout(closeTimer);
      // Agar mouse tooltip area mein ja raha hai (sidebar ke right side)
      // toh sidebar collapse mat karo
      const toX = e.clientX;
      const rect = sidebar.getBoundingClientRect();
      // Agar mouse right side se bahar gaya (tooltip direction) aur sidebar collapsed hai
      // toh turant collapse karo, warna normal delay
      const delay = (toX > rect.right + 60) ? 0 : 300;
      closeTimer = setTimeout(() => {
        sidebar.classList.add('collapsed');
      }, delay);
    });

    // Mobile toggle (navbar hamburger button se)
    document.addEventListener('click', (e) => {
      if (e.target.closest('#mobileMenuBtn')) {
        sidebar.classList.toggle('mobile-open');
      }
    });

    const searchInput = el.querySelector('#sidebarSearch');
    searchInput?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      el.querySelectorAll('.nav-item').forEach(item => {
        const label = item.querySelector('.nav-label')?.textContent?.toLowerCase() || '';
        item.style.display = !q || label.includes(q) ? '' : 'none';
      });
      el.querySelectorAll('.nav-group').forEach(group => {
        const visible = [...group.querySelectorAll('.nav-item')].some(i => i.style.display !== 'none');
        group.style.display = visible ? '' : 'none';
      });
    });

    // ── User popup menu ─────────────────────────────────────────
    const menuBtn   = el.querySelector('#sidebarMenuBtn');
    const popup     = el.querySelector('#sidebarUserPopup');

    const _togglePopup = (e) => {
      e.stopPropagation();
      // If sidebar is collapsed, expand it first so popup has room
      sidebar.classList.remove('collapsed');
      popup?.classList.toggle('open');
    };

    menuBtn?.addEventListener('click', _togglePopup);
    // Also allow clicking on the whole user row to open popup
    el.querySelector('#sidebarUser')?.addEventListener('click', _togglePopup);

    // Close popup on outside click
    document.addEventListener('click', (e) => {
      if (!popup?.contains(e.target) && e.target !== menuBtn) {
        popup?.classList.remove('open');
      }
    });

    // Logout
    el.querySelector('#supLogoutBtn')?.addEventListener('click', () => {
      popup?.classList.remove('open');
      // Fire a global logout event — app.js can listen
      document.dispatchEvent(new CustomEvent('app:logout'));
      // Fallback: clear auth + reload
      try {
        localStorage.removeItem('sms_auth');
        localStorage.removeItem('sms_user');
        sessionStorage.clear();
      } catch(_) {}
      // Short delay so any save-on-logout logic can run
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 120);
    });

    // Profile / Settings stubs
    el.querySelector('#supProfileBtn')?.addEventListener('click', () => {
      popup?.classList.remove('open');
      document.dispatchEvent(new CustomEvent('app:navigate', { detail: { page: 'profile' } }));
    });
    el.querySelector('#supSettingsBtn')?.addEventListener('click', () => {
      popup?.classList.remove('open');
      document.dispatchEvent(new CustomEvent('app:navigate', { detail: { page: 'settings' } }));
    });
  },

  updateUser(user) {
    const name   = document.getElementById('sidebarUserName');
    const role   = document.getElementById('sidebarUserRole');
    const avatar = document.getElementById('sidebarAvatar');
    const supName   = document.getElementById('supName');
    const supRole   = document.getElementById('supRole');
    const supAvatar = document.getElementById('supAvatar');
    const initials  = user.avatar || (user.name || '').slice(0, 2).toUpperCase();
    if (name)      name.textContent   = user.name;
    if (role)      role.textContent   = user.role;
    if (avatar)    avatar.textContent = initials;
    if (supName)   supName.textContent   = user.name;
    if (supRole)   supRole.textContent   = user.role;
    if (supAvatar) supAvatar.textContent = initials;
  }
};
