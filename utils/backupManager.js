// ============================================================
// utils/backupManager.js — Backup & Restore Manager
//
// ARCHITECTURE (jo system mein already hai):
//   MongoDB: 'sms' database
//     appstate         — main data (doc: { _id:'main', data:{...} })
//     appstate_backup  — backup copies (named docs)
//     attendance       — attendance records (alag collection)
//
// YE FILE KYA KARTA HAI:
//   Manual Backup  — user button dabaye → named snapshot MongoDB mein save ho
//   Auto Backup    — interval pe khud backup le (browser tab open rahe tab tak)
//   List Backups   — saved backups ki list dikhao (name, date, counts)
//   Restore        — kisi bhi backup se data wapas lao (confirm ke baad)
//   Download       — backup JSON file ke tor pe download karo (offline copy)
//   Upload/Import  — downloaded JSON wapas import karo
//
// SERVER ENDPOINTS (server.js mein add karne hain):
//   POST /api/backup/create     — manual backup banao
//   GET  /api/backup/list       — sari backup list lo
//   GET  /api/backup/get/:name  — ek backup ka data lo
//   POST /api/backup/restore    — kisi backup se restore karo
//   DELETE /api/backup/delete   — ek backup delete karo
// ============================================================

const SECRET_KEY = 'malik@2020'; // storage.js se same

// ── Internal fetch helper ─────────────────────────────────────
async function _apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': SECRET_KEY,
      ...(options.headers || {}),
    },
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// ── Auto-backup state ─────────────────────────────────────────
let _autoTimer   = null;
let _autoRunning = false;

export const BackupManager = {

  // ══════════════════════════════════════════════════════════
  // MANUAL BACKUP
  // ══════════════════════════════════════════════════════════

  /**
   * Ek named backup banao MongoDB mein.
   * @param {string} [label] — user-given name, e.g. "Before term change"
   *                           Default: auto timestamp
   * @returns {{ name, savedAt, counts }}
   */
  async createBackup(label = '') {
    const name = label.trim()
      || `backup_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;

    const json = await _apiFetch('/api/backup/create', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    return json; // { success, name, savedAt, counts }
  },

  // ══════════════════════════════════════════════════════════
  // LIST BACKUPS
  // ══════════════════════════════════════════════════════════

  /**
   * Sari backups ki list lo (newest first).
   * @returns {Array<{ name, savedAt, counts, sizeKB }>}
   */
  async listBackups() {
    const json = await _apiFetch('/api/backup/list');
    return json.backups || [];
  },

  // ══════════════════════════════════════════════════════════
  // RESTORE
  // ══════════════════════════════════════════════════════════

  /**
   * Kisi backup se data wapas lao.
   * @param {string} name — backup name
   * @returns {{ restoredFrom, savedAt }}
   */
  async restoreBackup(name) {
    const json = await _apiFetch('/api/backup/restore', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    return json;
  },

  // ══════════════════════════════════════════════════════════
  // DELETE
  // ══════════════════════════════════════════════════════════

  /**
   * Ek backup delete karo.
   * @param {string} name
   */
  async deleteBackup(name) {
    await _apiFetch('/api/backup/delete', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  // ══════════════════════════════════════════════════════════
  // DOWNLOAD (offline JSON copy)
  // ══════════════════════════════════════════════════════════

  /**
   * Backup data JSON file ke tor pe browser mein download karo.
   * @param {string} name — backup name
   */
  async downloadBackup(name) {
    const json = await _apiFetch(`/api/backup/get/${encodeURIComponent(name)}`);
    const blob = new Blob(
      [JSON.stringify({ _smsBackup: true, name, exportedAt: new Date().toISOString(), data: json.data }, null, 2)],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), {
      href:     url,
      download: `sms-backup-${name}.json`,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Live (current) state ko seedha JSON file mein download karo
   * bina MongoDB backup banaye — quick offline copy.
   */
  async downloadCurrentState() {
    const json = await _apiFetch('/api/data');
    const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const blob = new Blob(
      [JSON.stringify({ _smsBackup: true, name: `live_${ts}`, exportedAt: new Date().toISOString(), data: json.data }, null, 2)],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), {
      href:     url,
      download: `sms-live-${ts}.json`,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // ══════════════════════════════════════════════════════════
  // UPLOAD / IMPORT (JSON file se restore)
  // ══════════════════════════════════════════════════════════

  /**
   * User ke upload kiye JSON file ko parse karo aur server pe
   * import karo. Pehle MongoDB backup banta hai, phir import.
   * @param {File} file — user-selected .json file
   * @returns {{ importedName, savedAt }}
   */
  async importFromFile(file) {
    const text = await file.text();
    let parsed;
    try { parsed = JSON.parse(text); }
    catch { throw new Error('File valid JSON nahi hai.'); }

    if (!parsed._smsBackup || !parsed.data) {
      throw new Error('Yeh SMS backup file nahi lagti. _smsBackup flag missing hai.');
    }

    const json = await _apiFetch('/api/backup/import', {
      method: 'POST',
      body: JSON.stringify({ name: parsed.name || 'imported', data: parsed.data }),
    });
    return json;
  },

  // ══════════════════════════════════════════════════════════
  // AUTO BACKUP
  // ══════════════════════════════════════════════════════════

  /**
   * Auto backup shuru karo.
   * @param {number} intervalMinutes — kitne minute baad (default 30)
   */
  startAutoBackup(intervalMinutes = 30) {
    if (_autoRunning) return;
    _autoRunning = true;

    const ms = intervalMinutes * 60 * 1000;
    console.log(`[BackupManager] Auto backup shuru — har ${intervalMinutes} minute baad`);

    _autoTimer = setInterval(async () => {
      try {
        const result = await this.createBackup(`auto_${new Date().toISOString().slice(0,16).replace('T','_')}`);
        console.log('[BackupManager] Auto backup saved:', result.name);
      } catch (e) {
        console.error('[BackupManager] Auto backup failed:', e.message);
      }
    }, ms);
  },

  stopAutoBackup() {
    if (_autoTimer) clearInterval(_autoTimer);
    _autoTimer   = null;
    _autoRunning = false;
    console.log('[BackupManager] Auto backup band.');
  },

  isAutoRunning() {
    return _autoRunning;
  },

  // ══════════════════════════════════════════════════════════
  // AUTO BACKUP SETTINGS (localStorage mein persist)
  // ══════════════════════════════════════════════════════════

  loadAutoSettings() {
    try {
      return JSON.parse(localStorage.getItem('sms_autobackup') || 'null') || { enabled: false, intervalMinutes: 30 };
    } catch { return { enabled: false, intervalMinutes: 30 }; }
  },

  saveAutoSettings(settings) {
    localStorage.setItem('sms_autobackup', JSON.stringify(settings));
  },

  /** App boot pe call karo — agar auto backup on tha to resume karo */
  resumeIfEnabled() {
    const s = this.loadAutoSettings();
    if (s.enabled) {
      this.startAutoBackup(s.intervalMinutes);
    }
  },
};
