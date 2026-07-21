// ============================================================
// modules/teacher/teacherNotificationUI.js — Notification page
// ============================================================

import { AppState } from '../../utils/state.js';
import {
  NotificationService,
  fetchAndSyncNotifications,
} from '../notification/notificationService.js';
import { updateNotifBadge } from '../notification/notifBadge.js';

let _stylesInjected = false;
function _injectStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const style = document.createElement('style');
  style.id = 'tn2-styles';
  style.textContent = `
    .tn2-toolbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
    .tn2-btn {
      height:32px; padding:0 12px; border-radius:8px; font-size:12px; font-weight:700;
      cursor:pointer; font-family:inherit; border:1.5px solid var(--border2); background:var(--surface2); color:var(--t2);
    }
    .tn2-btn:hover { color:var(--t1); }
    .tn2-empty { text-align:center; padding:40px 20px; color:var(--t3); font-size:13px; border:1px dashed var(--border2); border-radius:12px; }
    .tn2-item {
      display:flex; gap:12px; padding:13px 14px; border-radius:12px; border:1px solid var(--border2);
      background:var(--surface); margin-bottom:8px; cursor:pointer;
    }
    .tn2-item.unread { background:color-mix(in srgb, var(--blue) 6%, var(--surface)); border-color:color-mix(in srgb, var(--blue) 30%, var(--border2)); }
    .tn2-item:hover { border-color:var(--blue); }
    .tn2-item-dot { width:8px; height:8px; border-radius:50%; background:var(--blue); flex-shrink:0; margin-top:5px; visibility:hidden; }
    .tn2-item.unread .tn2-item-dot { visibility:visible; }
    .tn2-item-body { flex:1; min-width:0; }
    .tn2-item-title { font-size:13px; font-weight:700; color:var(--t1); }
    .tn2-item-msg { font-size:12px; color:var(--t2); margin-top:2px; }
    .tn2-item-time { font-size:10.5px; color:var(--t4); margin-top:5px; }
  `;
  document.head.appendChild(style);
}

function _esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _relTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1)   return 'just now';
  if (min < 60)  return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24)   return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7)   return `${day}d ago`;
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

export const TeacherNotificationModule = {

  async mount(el, ctx) {
    if (!el) return;
    _injectStyles();
    this._el = el;
    this._ctx = ctx; // { userId }

    el.innerHTML = `<div class="tn2-empty">Loading notifications…</div>`;
    await fetchAndSyncNotifications(ctx.userId);
    updateNotifBadge(ctx.userId); // opening this page shouldn't leave a stale badge once things are read

    this._render();
  },

  // Called by the polling loop (modules/notification/notifDropdown.js)
  // when new notifications arrive WHILE this page is already open —
  // re-renders from whatever's already in AppState (already synced by
  // the poll itself), no extra fetch needed here.
  refresh() {
    if (this._el && this._ctx) this._render();
  },

  _render() {
    const el = this._el;
    const userId = this._ctx.userId;
    const items = NotificationService.getAll(userId);

    el.innerHTML = `
      <div class="tn2-toolbar">
        <span style="font-size:12px;color:var(--t3)">${items.length} notification${items.length === 1 ? '' : 's'}</span>
        ${items.some(n => !n.read) ? `<button class="tn2-btn" id="tn2MarkAll">Mark all as read</button>` : ''}
      </div>
      ${items.length
        ? items.map(n => `
            <div class="tn2-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
              <span class="tn2-item-dot"></span>
              <div class="tn2-item-body">
                <div class="tn2-item-title">${_esc(n.title)}</div>
                ${n.message ? `<div class="tn2-item-msg">${_esc(n.message)}</div>` : ''}
                <div class="tn2-item-time">${_relTime(n.createdAt)}</div>
              </div>
            </div>`).join('')
        : `<div class="tn2-empty">You're all caught up — no notifications yet.</div>`}
    `;

    el.querySelectorAll('.tn2-item').forEach(item => {
      item.addEventListener('click', () => {
        const notif = items.find(n => n.id === item.dataset.id);
        if (!notif) return;
        if (!notif.read) {
          NotificationService.markRead(notif.id);
          updateNotifBadge(userId);
        }
        if (notif.link) {
          window.location.hash = notif.link.replace(/^#/, '');
        } else {
          this._render(); // just reflect the read state
        }
      });
    });

    el.querySelector('#tn2MarkAll')?.addEventListener('click', () => {
      NotificationService.markAllRead(userId);
      updateNotifBadge(userId);
      this._render();
    });
  },
};
