// ============================================================
// modules/notification/notifBadge.js — Top-ribbon bell badge
// Small shared helper so both app.js (on login) and the
// Notification page (after marking things read) can keep the
// bell icon's unread dot in sync without duplicating logic.
// ============================================================

import { NotificationService } from './notificationService.js';

export function updateNotifBadge(userId) {
  const dot = document.getElementById('nbNotifDot');
  if (!dot) return;
  const unread = userId ? NotificationService.getUnreadCount(userId) : 0;
  dot.style.display = unread > 0 ? '' : 'none';
}
