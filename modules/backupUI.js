// ============================================================
// modules/backupUI.js — Backup & Restore UI Module
// Mounts into the Admin Panel "Backup" tab.
//
// FEATURES:
//  - Manual backup (with optional label)
//  - Auto backup on/off toggle + interval setting
//  - Backup list: name, date, record counts, size
//  - Restore from any backup (with confirm modal)
//  - Download backup as JSON (offline copy)
//  - Upload/Import JSON file
//  - Direct live state download
// ============================================================

import { BackupManager } from '../utils/backupManager.js';
import { Modal }         from '../utils/ui.js';
import { Toast }         from '../utils/helpers.js';
import { Auth }          from '../utils/auth.js';

// ── Mount ─────────────────────────────────────────────────────
export const BackupModule = {

  mount(container) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    el.innerHTML = _pageTemplate();
    _attachEvents(el);
    _loadBackupList(el);
    _syncAutoUI(el);
  },
};

// ── Page template ─────────────────────────────────────────────
function _pageTemplate() {
  return `
    <div class="module-page" style="max-width:860px">

      <!-- ── Header ── -->
      <div style="margin-bottom:20px">
        <h2 style="font-size:16px;font-weight:700;color:var(--t1);margin:0 0 4px">
          Backup &amp; Restore
        </h2>
        <p style="font-size:12.5px;color:var(--t3);margin:0">
          Data is stored in MongoDB. Restore any backup to recover previous data.
        </p>
      </div>

      <!-- ── Manual Backup card ── -->
      <div class="bk-card">
        <div class="bk-card-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
          </svg>
          Manual Backup
        </div>
        <p class="bk-hint">
          Save a named snapshot of all current data. Recommended before important changes.
        </p>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input id="bkLabelInput" class="form-input"
                 placeholder="Backup name (optional) — e.g. Before Term Change"
                 style="flex:1;min-width:220px;max-width:380px"/>
          <button id="bkCreateBtn" class="add-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Create Backup
          </button>
          <button id="bkDownloadLive"
                  style="display:inline-flex;align-items:center;gap:6px;padding:0 14px;height:34px;
                         border-radius:7px;border:1px solid var(--border);background:var(--surface2);
                         color:var(--t2);font-size:12.5px;cursor:pointer;white-space:nowrap">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Live JSON Download
          </button>
        </div>
      </div>

      <!-- ── Auto Backup card ── -->
      <div class="bk-card" style="margin-top:12px">
        <div class="bk-card-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          Auto Backup
        </div>
        <p class="bk-hint">Automatically creates backups at a set interval while the browser tab is open.</p>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--t1)">
            <input type="checkbox" id="bkAutoEnabled"
                   style="width:15px;height:15px;accent-color:var(--blue);cursor:pointer"/>
            Auto Backup On
          </label>
          <div style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--t2)">
            Every
            <select id="bkAutoInterval" class="form-select form-input"
                    style="width:90px;height:32px;padding:0 8px">
              <option value="15">15 min</option>
              <option value="30" selected>30 min</option>
              <option value="60">1 hour</option>
              <option value="120">2 hours</option>
              <option value="360">6 hours</option>
            </select>
            interval
          </div>
          <span id="bkAutoStatus" class="bk-status-badge bk-status--off">Off</span>
        </div>
      </div>

      <!-- ── Import card ── -->
      <div class="bk-card" style="margin-top:12px">
        <div class="bk-card-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          JSON File Import
        </div>
        <p class="bk-hint">
          Re-import a previously downloaded SMS backup file (.json).
          A backup will be created automatically before importing.
        </p>
        <div style="display:flex;gap:8px;align-items:center">
          <label class="add-btn" style="cursor:pointer;background:var(--surface2);border:1px solid var(--border);color:var(--t1)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Select JSON File
            <input type="file" id="bkImportFile" accept=".json" style="display:none"/>
          </label>
          <span id="bkImportFileName" style="font-size:12px;color:var(--t3)">No file selected</span>
        </div>
      </div>

      <!-- ── Backup List ── -->
      <div style="margin-top:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <span style="font-size:13px;font-weight:600;color:var(--t1)">Saved Backups</span>
          <button id="bkRefreshBtn"
                  style="display:inline-flex;align-items:center;gap:5px;font-size:12px;
                         color:var(--t3);background:none;border:none;cursor:pointer;padding:4px 8px">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            Refresh
          </button>
        </div>
        <div id="bkListWrap">
          <div class="bk-loading">Loading…</div>
        </div>
      </div>

    </div>

    <style>
      .bk-card {
        background: var(--surface2);
        border: 1px solid var(--border);
        border-radius: var(--r-md, 10px);
        padding: 16px 18px;
      }
      .bk-card-title {
        display: flex;
        align-items: center;
        gap: 7px;
        font-size: 13.5px;
        font-weight: 600;
        color: var(--t1);
        margin-bottom: 8px;
      }
      .bk-hint {
        font-size: 12px;
        color: var(--t3);
        margin: 0 0 12px;
        line-height: 1.5;
      }
      .bk-loading {
        font-size: 12.5px;
        color: var(--t3);
        padding: 20px 0;
        text-align: center;
      }
      .bk-empty {
        font-size: 12.5px;
        color: var(--t3);
        padding: 24px 0;
        text-align: center;
      }
      .bk-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface2);
        margin-bottom: 6px;
        flex-wrap: wrap;
      }
      .bk-row:hover { background: var(--surface3, var(--surface2)); }
      .bk-row-name {
        font-size: 12.5px;
        font-weight: 600;
        color: var(--t1);
        font-family: var(--font-mono);
        flex: 1;
        min-width: 160px;
      }
      .bk-row-meta {
        font-size: 11px;
        color: var(--t3);
        white-space: nowrap;
      }
      .bk-row-counts {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .bk-count-pill {
        font-size: 10.5px;
        color: var(--t2);
        background: var(--surface3, #f1f5f9);
        border: 1px solid var(--border);
        padding: 1px 8px;
        border-radius: 10px;
        white-space: nowrap;
      }
      .bk-row-actions {
        display: flex;
        gap: 5px;
        flex-shrink: 0;
      }
      .bk-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11.5px;
        padding: 4px 10px;
        border-radius: 6px;
        border: 1px solid var(--border);
        background: var(--surface2);
        color: var(--t2);
        cursor: pointer;
        white-space: nowrap;
        transition: all .12s;
      }
      .bk-btn:hover { border-color: var(--blue); color: var(--blue); background: var(--blue-dim); }
      .bk-btn--danger:hover { border-color: var(--red); color: var(--red); background: var(--red-dim); }
      .bk-btn--restore:hover { border-color: var(--green, #10b981); color: var(--green, #10b981); background: rgba(16,185,129,.08); }
      .bk-status-badge {
        font-size: 11px;
        font-weight: 600;
        padding: 2px 10px;
        border-radius: 20px;
        white-space: nowrap;
      }
      .bk-status--on  { background: rgba(16,185,129,.12); color: #10b981; border: 1px solid rgba(16,185,129,.3); }
      .bk-status--off { background: var(--surface3, #f1f5f9); color: var(--t3); border: 1px solid var(--border); }
      .bk-auto-badge {
        font-size: 10px;
        color: var(--blue);
        background: var(--blue-dim);
        padding: 1px 7px;
        border-radius: 8px;
        border: 1px solid rgba(79,133,247,.2);
        margin-left: 4px;
        vertical-align: middle;
      }
    </style>
  `;
}

// ── Event wiring ──────────────────────────────────────────────
function _attachEvents(el) {

  // Manual backup
  el.querySelector('#bkCreateBtn')?.addEventListener('click', async () => {
    const label = el.querySelector('#bkLabelInput')?.value?.trim() || '';
    const btn   = el.querySelector('#bkCreateBtn');
    btn.disabled    = true;
    btn.textContent = 'Saving…';
    try {
      const r = await BackupManager.createBackup(label);
      Toast.success(`Backup saved: "${r.name}"`);
      if (el.querySelector('#bkLabelInput')) el.querySelector('#bkLabelInput').value = '';
      _loadBackupList(el);
    } catch (e) {
      Toast.error(`Backup failed: ${e.message}`);
    } finally {
      btn.disabled    = false;
      btn.innerHTML   = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Create Backup`;
    }
  });

  // Live JSON download
  el.querySelector('#bkDownloadLive')?.addEventListener('click', async () => {
    try {
      await BackupManager.downloadCurrentState();
      Toast.success('Live state downloaded.');
    } catch (e) {
      Toast.error(`Download failed: ${e.message}`);
    }
  });

  // Refresh list
  el.querySelector('#bkRefreshBtn')?.addEventListener('click', () => _loadBackupList(el));

  // Auto backup toggle
  el.querySelector('#bkAutoEnabled')?.addEventListener('change', (e) => {
    const s = BackupManager.loadAutoSettings();
    s.enabled = e.target.checked;
    BackupManager.saveAutoSettings(s);
    if (s.enabled) {
      BackupManager.startAutoBackup(s.intervalMinutes);
    } else {
      BackupManager.stopAutoBackup();
    }
    _syncAutoUI(el);
  });

  // Auto backup interval
  el.querySelector('#bkAutoInterval')?.addEventListener('change', (e) => {
    const s = BackupManager.loadAutoSettings();
    s.intervalMinutes = parseInt(e.target.value);
    BackupManager.saveAutoSettings(s);
    if (s.enabled) {
      // Restart with new interval
      BackupManager.stopAutoBackup();
      BackupManager.startAutoBackup(s.intervalMinutes);
    }
    _syncAutoUI(el);
  });

  // Import file select
  el.querySelector('#bkImportFile')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    el.querySelector('#bkImportFileName').textContent = file.name;

    const ok = await Modal.confirm({
      title:        'File Import — Current Data Will Be Replaced',
      message:      `<strong>${file.name}</strong> will <strong>replace all current data</strong> when imported.<br><br>A backup will be created automatically before importing. Do you want to continue?`,
      confirmLabel: 'Yes, Import',
      danger:       true,
    });
    if (!ok) {
      e.target.value = '';
      el.querySelector('#bkImportFileName').textContent = 'No file selected';
      return;
    }

    try {
      Toast.info('Importing…');
      const r = await BackupManager.importFromFile(file);
      Toast.success(`Import complete. Backup created: "${r.importedName}". Please refresh the page.`);
      _loadBackupList(el);
    } catch (err) {
      Toast.error(`Import failed: ${err.message}`);
    } finally {
      e.target.value = '';
      el.querySelector('#bkImportFileName').textContent = 'No file selected';
    }
  });
}

// ── Load & render backup list ─────────────────────────────────
async function _loadBackupList(el) {
  const wrap = el.querySelector('#bkListWrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="bk-loading">Loading backups…</div>';

  let backups;
  try {
    backups = await BackupManager.listBackups();
  } catch (e) {
    wrap.innerHTML = `<div class="bk-empty" style="color:var(--red)">Failed to load list: ${e.message}</div>`;
    return;
  }

  if (!backups.length) {
    wrap.innerHTML = '<div class="bk-empty">No backups found — create your first backup.</div>';
    return;
  }

  wrap.innerHTML = backups.map(b => {
    const dateStr = b.savedAt ? new Date(b.savedAt).toLocaleString('en-PK', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }) : '—';

    const isAuto = b.name?.startsWith('auto_');
    const countPills = Object.entries(b.counts || {})
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `<span class="bk-count-pill">${k}: ${v}</span>`)
      .join('');

    return `
      <div class="bk-row">
        <div class="bk-row-name">
          ${_escHtml(b.name)}
          ${isAuto ? '<span class="bk-auto-badge">auto</span>' : ''}
        </div>
        <div class="bk-row-meta">${dateStr}${b.sizeKB ? ` · ${b.sizeKB} KB` : ''}</div>
        <div class="bk-row-counts">${countPills || '<span class="bk-row-meta">counts unavailable</span>'}</div>
        <div class="bk-row-actions">
          <button class="bk-btn bk-btn--restore" data-action="restore" data-name="${_escHtml(b.name)}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 .49-4.65"/>
            </svg>
            Restore
          </button>
          <button class="bk-btn" data-action="download" data-name="${_escHtml(b.name)}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download
          </button>
          <button class="bk-btn bk-btn--danger" data-action="delete" data-name="${_escHtml(b.name)}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            </svg>
            Delete
          </button>
        </div>
      </div>`;
  }).join('');

  // Wire action buttons
  wrap.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => _handleAction(btn.dataset.action, btn.dataset.name, el));
  });
}

// ── Action handler ────────────────────────────────────────────
async function _handleAction(action, name, el) {
  if (action === 'restore') {
    const ok = await Modal.confirm({
      title:        'Restore Confirm',
      message:      `Are you sure you want to restore from <strong>"${name}"</strong>?<br><br>
                     Current data will be <strong>replaced</strong>. The page will reload automatically.`,
      confirmLabel: 'Yes, Restore',
      danger:       true,
    });
    if (!ok) return;
    try {
      Toast.info('Restoring…');
      await BackupManager.restoreBackup(name);
      Toast.success('Restore complete! Reloading page…');
      setTimeout(() => location.reload(), 1500);
    } catch (e) {
      Toast.error(`Restore failed: ${e.message}`);
    }

  } else if (action === 'download') {
    try {
      await BackupManager.downloadBackup(name);
      Toast.success('Downloaded.');
    } catch (e) {
      Toast.error(`Download failed: ${e.message}`);
    }

  } else if (action === 'delete') {
    const ok = await Modal.confirm({
      title:        'Delete Backup',
      message:      `<strong>"${name}"</strong> backup will be permanently deleted.`,
      confirmLabel: 'Delete',
      danger:       true,
    });
    if (!ok) return;
    try {
      await BackupManager.deleteBackup(name);
      Toast.success('Backup deleted.');
      _loadBackupList(el);
    } catch (e) {
      Toast.error(`Delete failed: ${e.message}`);
    }
  }
}

// ── Sync Auto Backup UI state ─────────────────────────────────
function _syncAutoUI(el) {
  const s          = BackupManager.loadAutoSettings();
  const chk        = el.querySelector('#bkAutoEnabled');
  const intSel     = el.querySelector('#bkAutoInterval');
  const badge      = el.querySelector('#bkAutoStatus');

  if (chk)    chk.checked    = s.enabled;
  if (intSel) intSel.value   = String(s.intervalMinutes || 30);
  if (badge) {
    badge.textContent = s.enabled ? `On — every ${s.intervalMinutes} min` : 'Off';
    badge.className   = `bk-status-badge ${s.enabled ? 'bk-status--on' : 'bk-status--off'}`;
  }
}

// ── Escape HTML helper ────────────────────────────────────────
function _escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
