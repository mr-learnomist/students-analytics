// ============================================================
// modules/notification/notificationService.js — Generic
// notification system (bell icon badge + Notification page).
// Works for any logged-in user — scoped by userId throughout.
//
// Any module can send a notification without touching app.js
// or index.html — just:
//   import { NotificationService } from '../notification/notificationService.js';
//   NotificationService.create({ userId, title, message, link });
// ============================================================

import { AppState } from '../../utils/state.js';

const API_BASE   = '/api/notifications';
const SECRET_KEY = 'malik@2020';
const NOTIF_KEY  = 'notifications'; // AppState key

function _genId() {
  return 'notif_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

async function _apiUpsert(records) {
  try {
    const res = await fetch(API_BASE, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': SECRET_KEY },
      body:    JSON.stringify({ records }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Save failed');
    return true;
  } catch (err) {
    console.error('[NotificationStorage] Save failed:', err.message);
    return false;
  }
}

async function _apiDelete(id, userId) {
  try {
    const qs  = `id=${encodeURIComponent(id)}&userId=${encodeURIComponent(userId)}`;
    const res = await fetch(`${API_BASE}?${qs}`, {
      method:  'DELETE',
      headers: { 'x-api-key': SECRET_KEY },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Delete failed');
    return true;
  } catch (err) {
    console.error('[NotificationStorage] Delete failed:', err.message);
    return false;
  }
}

// ── fetchAndSyncNotifications(userId) — pull this user's notifications
// from the backend and merge into AppState. Call on login and whenever
// the Notification page mounts.
export async function fetchAndSyncNotifications(userId) {
  try {
    const res = await fetch(`${API_BASE}?userId=${encodeURIComponent(userId)}`, {
      headers: { 'x-api-key': SECRET_KEY },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Fetch failed');

    const existing = AppState.get(NOTIF_KEY) || [];
    const map = {};
    existing.forEach(r => { map[r.id] = r; });
    (json.records || []).forEach(r => { map[r.id] = r; });
    AppState._silentSet(NOTIF_KEY, Object.values(map));
    return true;
  } catch (err) {
    console.error('[NotificationStorage] Sync failed:', err.message);
    return false;
  }
}

export const NotificationService = {
  getAll(userId) {
    return (AppState.get(NOTIF_KEY) || [])
      .filter(n => n.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  getUnreadCount(userId) {
    return this.getAll(userId).filter(n => !n.read).length;
  },

  // create({ userId, type, title, message, link }) — used by any part
  // of the app (e.g. batch assignment) to notify a user. Fire-and-forget:
  // writes locally immediately (so the bell badge can update instantly
  // if the target user is the current session) and syncs to the backend.
  create(notif) {
    const record = {
      id:        _genId(),
      read:      false,
      createdAt: new Date().toISOString(),
      ...notif,
    };
    const all = AppState.get(NOTIF_KEY) || [];
    AppState._silentSet(NOTIF_KEY, [...all, record]);
    _apiUpsert([record]);
    return record;
  },

  markRead(id) {
    const all = AppState.get(NOTIF_KEY) || [];
    let updated = null;
    const next = all.map(n => {
      if (n.id !== id) return n;
      updated = { ...n, read: true };
      return updated;
    });
    AppState._silentSet(NOTIF_KEY, next);
    if (updated) _apiUpsert([updated]);
    return updated;
  },

  markAllRead(userId) {
    const all = AppState.get(NOTIF_KEY) || [];
    const changed = [];
    const next = all.map(n => {
      if (n.userId !== userId || n.read) return n;
      const upd = { ...n, read: true };
      changed.push(upd);
      return upd;
    });
    AppState._silentSet(NOTIF_KEY, next);
    if (changed.length) _apiUpsert(changed);
    return changed;
  },

  remove(id, userId) {
    const all = AppState.get(NOTIF_KEY) || [];
    AppState._silentSet(NOTIF_KEY, all.filter(n => n.id !== id));
    _apiDelete(id, userId);
  },
};
