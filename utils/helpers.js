// ============================================================
// utils/helpers.js — Shared utility functions
// ============================================================

export const Helpers = {
  // Format numbers with commas
  formatNumber(n) {
    return n?.toLocaleString() ?? '—';
  },

  // Format percentage
  formatPercent(n, decimals = 1) {
    return `${Number(n).toFixed(decimals)}%`;
  },

  // Truncate text
  truncate(str, len = 40) {
    return str?.length > len ? str.slice(0, len) + '…' : str;
  },

  // Debounce
  debounce(fn, ms = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  },

  // Generate unique ID
  uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  },

  // Deep clone
  clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  // Format date
  formatDate(date = new Date()) {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long', year: 'numeric',
      month: 'long', day: 'numeric'
    }).format(date instanceof Date ? date : new Date(date));
  },

  // Escape HTML
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

// ── Toast Notification System ───────────────────────────────
export const Toast = {
  container: null,

  init() {
    if (this.container) return;
    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    this.container.style.cssText = `
      position:fixed; bottom:24px; right:24px; z-index:9999;
      display:flex; flex-direction:column; gap:10px; pointer-events:none;
    `;
    document.body.appendChild(this.container);
  },

  show(message, type = 'info', duration = 3500) {
    this.init();
    const icons = {
      success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
      error: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
      warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>`,
      info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    };
    const colors = {
      success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#4f85f7'
    };
    const toast = document.createElement('div');
    toast.style.cssText = `
      pointer-events:auto; display:flex; align-items:center; gap:10px;
      background:#1e2433; color:#e8eaf6; border:1px solid rgba(255,255,255,0.08);
      border-left:3px solid ${colors[type]}; border-radius:10px;
      padding:12px 16px; font-size:13.5px; font-weight:500;
      box-shadow:0 8px 32px rgba(0,0,0,0.4);
      animation:toastIn 0.3s cubic-bezier(0.34,1.56,0.64,1);
      max-width:320px; min-width:220px;
    `;
    toast.innerHTML = `
      <span style="color:${colors[type]};flex-shrink:0">${icons[type]}</span>
      <span style="flex:1">${Helpers.escapeHtml(message)}</span>
    `;
    if (!document.getElementById('toast-style')) {
      const style = document.createElement('style');
      style.id = 'toast-style';
      style.textContent = `
        @keyframes toastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
        @keyframes toastOut{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(20px)}}
      `;
      document.head.appendChild(style);
    }
    this.container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'toastOut 0.25s ease forwards';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  },

  success: (msg) => Toast.show(msg, 'success'),
  error: (msg) => Toast.show(msg, 'error'),
  warning: (msg) => Toast.show(msg, 'warning'),
  info: (msg) => Toast.show(msg, 'info')
};

// ── State Management ────────────────────────────────────────
export const State = (() => {
  const _state = {};
  const _listeners = {};

  return {
    set(key, value) {
      _state[key] = value;
      (_listeners[key] || []).forEach(fn => fn(value));
    },
    get(key) {
      return _state[key];
    },
    on(key, fn) {
      if (!_listeners[key]) _listeners[key] = [];
      _listeners[key].push(fn);
    },
    off(key, fn) {
      if (_listeners[key]) {
        _listeners[key] = _listeners[key].filter(f => f !== fn);
      }
    }
  };
})();
