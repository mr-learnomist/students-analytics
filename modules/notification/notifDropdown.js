// ============================================================
// modules/notification/notifDropdown.js — Bell icon dropdown +
// polling for near-real-time updates (no manual page refresh).
//
// True push (WebSocket/SSE) isn't practical on this Vercel +
// MongoDB serverless setup without extra infrastructure, so this
// polls the backend every intervalMs while the app is open — new
// notifications show up within that window automatically, with a
// toast popup and a badge update, no refresh needed.
// ============================================================

import { NotificationService, fetchAndSyncNotifications } from './notificationService.js';
import { updateNotifBadge } from './notifBadge.js';
import { Toast } from '../../utils/helpers.js';
import { Router } from '../../utils/router.js';
import { TeacherNotificationModule } from '../teacher/teacherNotificationUI.js';

function _esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _relTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1)  return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24)  return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7)  return `${day}d ago`;
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

let _seenIds  = null; // notification ids already accounted for (seen this session)
let _pollTimer = null;

function _renderDropdown(userId) {
  const list = document.getElementById('nbNotifDropdownList');
  if (!list) return;
  const items = NotificationService.getAll(userId).slice(0, 6); // most recent first (service already sorts)

  if (!items.length) {
    list.innerHTML = `<div class="nb-notif-empty">No notifications yet.</div>`;
    return;
  }

  list.innerHTML = items.map(n => `
    <div class="nb-notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
      <div class="nb-notif-item-title">${_esc(n.title)}</div>
      ${n.message ? `<div class="nb-notif-item-msg">${_esc(n.message)}</div>` : ''}
      <div class="nb-notif-item-time">${_relTime(n.createdAt)}</div>
    </div>`).join('');

  list.querySelectorAll('.nb-notif-item').forEach(item => {
    item.addEventListener('click', () => {
      const notif = items.find(x => x.id === item.dataset.id);
      if (notif && !notif.read) {
        NotificationService.markRead(notif.id);
        updateNotifBadge(userId);
      }
      closeDropdown();
      Router.navigate('teacherNotification');
    });
  });
}

export function openDropdown(userId) {
  const dd = document.getElementById('nbNotifDropdown');
  const bellBtn = document.getElementById('nbBellBtn');
  if (!dd || !bellBtn) return;

  // Position via fixed + computed coordinates instead of relying on
  // CSS absolute positioning inside the navbar — the navbar (or some
  // ancestor) may clip/stack in a way that makes an absolutely
  // positioned dropdown invisible or unclickable even though it's
  // technically in the DOM with display:block.
  const rect = bellBtn.getBoundingClientRect();
  dd.style.position = 'fixed';
  dd.style.top   = `${rect.bottom + 8}px`;
  dd.style.right = `${window.innerWidth - rect.right}px`;
  dd.style.left  = 'auto';

  // Show the panel FIRST — if rendering the list below throws for any
  // reason, the panel still opens (just possibly empty) instead of an
  // exception silently aborting this whole function before display
  // ever gets set, which would make clicking the bell look like it
  // does nothing at all.
  dd.style.display = 'block';

  try {
    _renderDropdown(userId);
  } catch (err) {
    console.error('[notifDropdown] Failed to render list:', err);
    const list = document.getElementById('nbNotifDropdownList');
    if (list) list.innerHTML = `<div class="nb-notif-empty">Couldn't load notifications.</div>`;
  }
}

export function closeDropdown() {
  const dd = document.getElementById('nbNotifDropdown');
  if (dd) dd.style.display = 'none';
}

export function toggleDropdown(userId) {
  const dd = document.getElementById('nbNotifDropdown');
  if (!dd) return;
  if (dd.style.display === 'block') closeDropdown();
  else openDropdown(userId);
}

// Wire click-outside-to-close and the "View all" footer link. Call
// once, after login.
export function initNotifDropdown() {
  if (document.body.dataset.notifDropdownInit) return; // already wired — never attach twice
  document.body.dataset.notifDropdownInit = 'true';

  document.addEventListener('click', (e) => {
    const dd = document.getElementById('nbNotifDropdown');
    const bellBtn = document.getElementById('nbBellBtn');
    if (!dd || dd.style.display !== 'block') return;
    if (dd.contains(e.target) || bellBtn?.contains(e.target)) return;
    closeDropdown();
  });

  document.getElementById('nbNotifViewAll')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeDropdown();
    Router.navigate('teacherNotification');
  });
}

// ── Polling — checks for new notifications every intervalMs. On
// finding any that weren't seen before, pops a toast per new item,
// updates the bell badge, and refreshes the dropdown if it's open.
export function startNotifPolling(userId, intervalMs = 20000) {
  _seenIds = new Set(NotificationService.getAll(userId).map(n => n.id));

  if (_pollTimer) clearInterval(_pollTimer);
  _pollTimer = setInterval(async () => {
    await fetchAndSyncNotifications(userId);
    const current = NotificationService.getAll(userId);
    const fresh = current.filter(n => !_seenIds.has(n.id));

    if (fresh.length) {
      fresh.forEach(n => Toast.success(n.title));
      updateNotifBadge(userId);
      const dd = document.getElementById('nbNotifDropdown');
      if (dd && dd.style.display === 'block') _renderDropdown(userId);
      if (Router.current() === 'teacherNotification') TeacherNotificationModule.refresh();
    }
    current.forEach(n => _seenIds.add(n.id));
  }, intervalMs);
}

export function stopNotifPolling() {
  if (_pollTimer) clearInterval(_pollTimer);
  _pollTimer = null;
}
