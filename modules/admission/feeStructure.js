// ============================================================
// modules/admission/feeStructure.js — Fee Structure Module
// v3: Per-campus records (no data loss), compact UI, wider modal
// ============================================================

import { AppState, generateID } from '../../utils/state.js';
import { Modal, Form, injectUIStyles } from '../../utils/ui.js';
import { Toast } from '../../utils/helpers.js';
import { Auth } from '../../utils/auth.js';

const KEY = 'feeStructures';

const CURRENCIES = [
  { code: 'PKR', symbol: 'Rs.' },
  { code: 'USD', symbol: '$'   },
  { code: 'GBP', symbol: '£'   },
  { code: 'EUR', symbol: '€'   },
  { code: 'SAR', symbol: 'SR'  },
  { code: 'AED', symbol: 'AED' },
];

const fmt       = (n, sym = 'Rs.') => `${sym} ${Number(n || 0).toLocaleString()}`;
const getSymbol = (code) => CURRENCIES.find(c => c.code === code)?.symbol || 'Rs.';

function buildTitle(from, to) {
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (!from) return '—';
  const fd = new Date(from);
  const fromStr = `${M[fd.getMonth()]}-${String(fd.getFullYear()).slice(2)}`;
  if (!to) return fromStr;
  const td = new Date(to);
  const toStr = `${M[td.getMonth()]}-${String(td.getFullYear()).slice(2)}`;
  return fromStr === toStr ? fromStr : `${fromStr} to ${toStr}`;
}

// ── ROOT FIX ──────────────────────────────────────────────────
// Each record = ONE campus + ONE discipline
function savePerCampus(baseData, campusIds, isEdit, editId) {
  campusIds.forEach(campusId => {
    const recordData = { ...baseData, campusId, campusIds: [campusId] };

    if (isEdit && editId) {
      AppState.update(KEY, editId, recordData);
      return;
    }

    const all   = AppState.get(KEY) || [];
    const match = all.find(r =>
      r.campusId       === campusId &&
      r.disciplineId   === baseData.disciplineId &&
      r.instituteId    === baseData.instituteId &&
      r.applicableFrom === baseData.applicableFrom &&
      (r.applicableTo || '') === (baseData.applicableTo || '')
    );

    if (match) {
      AppState.update(KEY, match.id, recordData);
    } else {
      AppState.add(KEY, { ...recordData, id: generateID('fee') });
    }
  });
}

export const FeeStructureModule = {

  mount(container) {
    injectUIStyles(`
      .fi-amt, .fi-curr-sel, .fee-num-font,
      [style*="font-family:var(--font-mono)"],
      input[type="number"] {
        font-family: 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
        font-feature-settings: "tnum" on, "lnum" on !important;
        letter-spacing: 0.02em;
      }
      td[style*="text-align:right"], td[style*="text-align: right"] {
        font-family: 'Inter', 'Segoe UI', Roboto, sans-serif !important;
        font-weight: 600 !important;
      }
    `);

    // Dedicated style tag — bypasses injectUIStyles dedup
    {
      const old = document.getElementById('fs-tab-styles');
      if (old) old.remove();
      const st = document.createElement('style');
      st.id = 'fs-tab-styles';
      st.textContent = `
        .fs-tab-bar {
          display: inline-flex !important;
          align-items: center !important;
          gap: 4px !important;
          background: #f0f2f8 !important;
          padding: 4px !important;
          border-radius: 10px !important;
          border: 1px solid #dde2ee !important;
          box-shadow: inset 0 1px 3px rgba(16,24,40,0.07) !important;
          margin-bottom: 20px !important;
        }
        .fs-tab-btn {
          display: inline-flex !important;
          align-items: center !important;
          gap: 7px !important;
          padding: 8px 18px !important;
          font-size: 13px !important;
          font-weight: 500 !important;
          color: #667085 !important;
          background: transparent !important;
          border: 1px solid transparent !important;
          border-radius: 7px !important;
          cursor: pointer !important;
          white-space: nowrap !important;
          transition: all 0.2s ease !important;
          letter-spacing: 0.01em !important;
          line-height: 1 !important;
          outline: none !important;
        }
        .fs-tab-btn:hover {
          background: rgba(255,255,255,0.7) !important;
          color: #344054 !important;
        }
        .fs-tab-btn.active {
          background: #ffffff !important;
          color: #2563eb !important;
          font-weight: 600 !important;
          border-color: #c7d7fd !important;
          box-shadow: 0 1px 4px rgba(16,24,40,0.12), 0 0 0 1px rgba(37,99,235,0.08) !important;
        }
        .fs-tab-btn:active { transform: scale(0.97) !important; }
      `;
      document.head.appendChild(st);
    }

    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;

    el.innerHTML = `
      <div class="module-page" style="padding-top:0">
        <div class="fs-tab-bar">
          <button class="fs-tab-btn active" data-tab="tuition-exam">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;opacity:.85">
              <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
            </svg>
            Tuition &amp; Exam Fee
          </button>
          <button class="fs-tab-btn" data-tab="reg-fee">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;opacity:.85">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
            Registration Fee
          </button>
          <button class="fs-tab-btn" data-tab="challan-due">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;opacity:.85">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            Challan Due
          </button>
        </div>
        <div id="fs-panel-tuition-exam" style="display:block"></div>
        <div id="fs-panel-reg-fee"      style="display:none"></div>
        <div id="fs-panel-challan-due"  style="display:none"></div>
      </div>`;

    const feePanel = el.querySelector('#fs-panel-tuition-exam');
    feePanel.innerHTML = this._pageTemplate();
    this._render(feePanel);
    this._attachToolbar(feePanel);

    let regMounted = false;
    const regPanel = el.querySelector('#fs-panel-reg-fee');

    let challanDueMounted = false;
    const challanDuePanel = el.querySelector('#fs-panel-challan-due');

    el.querySelectorAll('.fs-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.fs-tab-btn').forEach(b => b.classList.remove('active'));
        // Hide ALL panels via inline style
        el.querySelectorAll('#fs-panel-tuition-exam, #fs-panel-reg-fee, #fs-panel-challan-due').forEach(p => {
          p.style.display = 'none';
        });
        btn.classList.add('active');
        const activePanel = el.querySelector(`#fs-panel-${btn.dataset.tab}`);
        if (activePanel) activePanel.style.display = 'block';
        if (btn.dataset.tab === 'reg-fee' && !regMounted) {
          regMounted = true;
          RegistrationFeeModule.mount(regPanel);
        }
        if (btn.dataset.tab === 'challan-due' && !challanDueMounted) {
          challanDueMounted = true;
          ChallanDueModule.mount(challanDuePanel);
        }
      });
    });
  },

  _getFiltered(filters = {}) {
    let fees = AppState.get(KEY) || [];
    if (filters.instituteId)  fees = fees.filter(f => f.instituteId  === filters.instituteId);
    if (filters.campusId)     fees = fees.filter(f => f.campusId     === filters.campusId);
    if (filters.disciplineId) fees = fees.filter(f => f.disciplineId === filters.disciplineId);
    return fees;
  },

  _render(el, filters = {}) {
    const records     = this._getFiltered(filters);
    const campuses    = AppState.get('campuses')    || [];
    const disciplines = AppState.get('disciplines') || [];
    const levels      = AppState.get('levels')      || [];
    const subjects    = AppState.get('subjects')    || [];
    const canEdit     = Auth.can('fee:edit');
    const canDelete   = Auth.can('fee:delete');

    const countEl = el.querySelector('.record-count');
    if (countEl) countEl.textContent = `${records.length} record${records.length !== 1 ? 's' : ''}`;

    const treeEl = el.querySelector('#fee-tree');
    if (!treeEl) return;

    if (records.length === 0) {
      treeEl.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                    min-height:280px;gap:12px;color:var(--t3);
                    border:1px dashed var(--border2);border-radius:var(--r-lg)">
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
            <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
          </svg>
          <span style="font-size:14px;font-weight:600;color:var(--t2)">No fee structures defined yet.</span>
          <span style="font-size:12.5px">Click "+ Add Fee" to define your first fee structure.</span>
        </div>`;
      return;
    }

    const titleMap = {};
    records.forEach(rec => {
      const title  = buildTitle(rec.applicableFrom, rec.applicableTo);
      const campId = rec.campusId || '__';
      if (!titleMap[title])         titleMap[title] = {};
      if (!titleMap[title][campId]) titleMap[title][campId] = [];
      titleMap[title][campId].push(rec);
    });

    const sortedTitles = Object.entries(titleMap).sort((a, b) => {
      const da = Object.values(a[1]).flat()[0]?.applicableFrom || '';
      const db = Object.values(b[1]).flat()[0]?.applicableFrom || '';
      return db.localeCompare(da);
    });

    let html = '';

    sortedTitles.forEach(([title, campMap], ti) => {
      const titleId   = `t${ti}`;
      const totalRecs = Object.values(campMap).flat().length;
      // Collect all record IDs under this title for bulk edit/delete
      const titleRecs = Object.values(campMap).flat();
      const firstRec  = titleRecs[0];

      html += `
        <div class="fee-block" style="margin-bottom:14px">
          ${_hdr({ id: titleId, depth: 0, color: '#4f85f7', label: title, count: totalRecs,
            icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                     <rect x="3" y="4" width="18" height="18" rx="2"/>
                     <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                     <line x1="3" y1="10" x2="21" y2="10"/>
                   </svg>`,
            extraRight: `
              <div style="display:flex;align-items:center;gap:5px;margin-left:8px;flex-shrink:0">
                ${canEdit && firstRec ? `<button class="fee-edit-btn" data-id="${firstRec.id}"
                  data-period-ids="${titleRecs.map(r => r.id).join(',')}"
                  style="${_ab()}" title="Edit this fee period">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg></button>` : ''}
                ${canDelete && firstRec ? `<button class="fee-title-del-btn"
                  data-ids="${titleRecs.map(r => r.id).join(',')}"
                  data-title="${title}"
                  style="${_ab(true)}" title="Delete this fee period">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
                  </svg></button>` : ''}
              </div>`
          })}
          <div id="${titleId}" style="padding-left:14px;margin-top:2px;display:none">`;

      Object.entries(campMap).forEach(([campId, recs], ci) => {
        const camp     = campuses.find(c => c.id === campId);
        const campName = camp ? camp.campusName : '(Unknown Campus)';
        const cNodeId  = `${titleId}c${ci}`;

        html += `
          <div class="fee-block" style="margin-bottom:8px">
            ${_hdr({ id: cNodeId, depth: 1, color: '#06b6d4', label: campName, count: recs.length,
              icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                       <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                     </svg>` })}
            <div id="${cNodeId}" style="padding-left:12px;margin-top:2px;display:none">`;

        recs.forEach((rec, ri) => {
          const disc     = disciplines.find(d => d.id === rec.disciplineId);
          const discLbl  = disc ? disc.fullName : '(Unknown)';
          const discAbbr = disc ? disc.abbreviation : '?';
          const dNodeId  = `${cNodeId}d${ri}`;
          const discLvls = levels.filter(l => l.disciplineId === rec.disciplineId);
          const tSym     = getSymbol(rec.tuitionCurrency || 'PKR');
          const eSym     = getSymbol(rec.examCurrency    || 'PKR');
          const hasTuit  = rec.tuitionEnabled !== false;
          const hasExam  = rec.examEnabled    !== false;
          const freq     = rec.tuitionFrequency === 'monthly' ? '🔁 Monthly' : '1× One-time';

          const feeCols = [
            ...(hasTuit ? [{ key: 'tuition', label: 'Tuition', color: '#10b981', sym: tSym }] : []),
            ...(hasExam ? [{ key: 'exam',    label: 'Exam',    color: '#f59e0b', sym: eSym }] : []),
          ];

          html += `
            <div class="fee-block" style="margin-bottom:6px">
              ${_hdr({ id: dNodeId, depth: 2, color: '#8b5cf6', label: discLbl, count: null,
                badge: `<span class="fee-num-font" style="background:rgba(139,92,246,.15);color:#8b5cf6;font-size:10px;
                               font-weight:700;padding:1px 7px;border-radius:10px">${discAbbr}</span>`,
                icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                         <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                         <line x1="8" y1="18" x2="21" y2="18"/>
                       </svg>`,
                extraRight: `
                  <div style="display:flex;align-items:center;gap:6px;margin-left:auto;flex-shrink:0">
                    ${hasTuit ? `<span style="font-size:10.5px;font-weight:600;color:#10b981;
                      background:rgba(16,185,129,.1);padding:1px 7px;border-radius:10px">${freq}</span>` : ''}
                    ${canEdit ? `<button class="fee-edit-btn" data-id="${rec.id}" style="${_ab()}" title="Edit fee structure">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg></button>` : ''}
                    ${canDelete ? `<button class="fee-del-btn" data-id="${rec.id}" style="${_ab(true)}" title="Delete fee structure">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
                      </svg></button>` : ''}
                  </div>`,
              })}
              <div id="${dNodeId}" style="padding-left:8px;margin-top:2px;display:none">`;

          discLvls.forEach((lvl, li) => {
            const lvlSubjs = subjects.filter(s => s.levelId === lvl.id);
            if (!lvlSubjs.length) return;
            const lNodeId = `${dNodeId}l${li}`;

            html += `
              <div style="margin-bottom:6px">
                ${_hdr({ id: lNodeId, depth: 3, color: '#f59e0b', label: lvl.levelName, count: lvlSubjs.length,
                  icon: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                           <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                           <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                         </svg>` })}
                <div id="${lNodeId}" style="padding-left:6px;margin-top:2px">
                  <table style="width:100%;border-collapse:collapse;border:1px solid var(--border);overflow:hidden;border-radius:7px">
                    <thead>
                      <tr style="background:var(--surface2)">
                        <th style="${_th()}">Subject</th>
                        ${feeCols.map(f => `
                          <th style="${_th('center')};border-left:1px solid var(--border)">
                            <span style="color:${f.color};font-size:11px;font-weight:700">${f.label}</span>
                            <span class="fee-num-font" style="color:var(--t3);margin-left:3px;font-size:10px">${f.sym}</span>
                          </th>`).join('')}
                        ${canEdit ? `<th style="${_th('center')};border-left:1px solid var(--border);width:38px"></th>` : ''}
                      </tr>
                    </thead>
                    <tbody>
                      ${lvlSubjs.map(subj => {
                        const feeRow = rec.fees?.[subj.id] || {};
                        return `
                          <tr style="border-top:1px solid var(--border)">
                            <td style="${_td()}">
                              <span class="fee-num-font" style="font-size:10.5px;font-weight:700;
                                           color:var(--violet);margin-right:7px">${subj.subjectCode || ''}</span>
                              <span style="color:var(--t1);font-size:12.5px">${subj.subjectName || ''}</span>
                            </td>
                            ${feeCols.map(f => {
                              const val = feeRow[f.key];
                              return `<td style="${_td('right')};border-left:1px solid var(--border);
                                          font-size:12.5px;font-weight:700;color:${f.color}">
                                ${val != null ? fmt(val, f.sym) : '<span style="color:var(--t4);font-weight:400">—</span>'}
                              </td>`;
                            }).join('')}
                            ${canEdit ? `
                            <td style="${_td('center')};border-left:1px solid var(--border)">
                              <button class="fee-subj-edit-btn" data-rec="${rec.id}" data-subj="${subj.id}"
                                      style="${_ab()}" title="Edit fee">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                              </button>
                            </td>` : ''}
                          </tr>`;
                      }).join('')}
                    </tbody>
                  </table>
                </div>
              </div>`;
          });

          html += `</div></div>`;
        });

        html += `</div></div>`;
      });

      html += `</div></div>`;
    });

    treeEl.innerHTML = html;
    this._wireTree(treeEl, el, filters);
  },

  _wireTree(treeEl, container, filters) {
    treeEl.querySelectorAll('.fee-hdr').forEach(hdr => {
      hdr.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        const body    = document.getElementById(hdr.dataset.target);
        const chevron = hdr.querySelector('.fee-chevron');
        if (!body) return;
        const isOpen = body.style.display !== 'none';
        body.style.display      = isOpen ? 'none' : '';
        chevron.style.transform = isOpen ? 'rotate(-90deg)' : '';
      });
    });
    treeEl.querySelectorAll('.fee-edit-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const periodIds = btn.dataset.periodIds;
        if (periodIds) {
          // Title-level edit: open form with all records of this period
          const allFees = AppState.get(KEY) || [];
          const recs = periodIds.split(',').map(id => allFees.find(f => f.id === id)).filter(Boolean);
          if (recs.length) this._openFormForPeriod(recs, container, filters);
        } else {
          const fee = (AppState.get(KEY) || []).find(f => f.id === btn.dataset.id);
          if (fee) this._openForm(fee, container, filters);
        }
      });
    });
    treeEl.querySelectorAll('.fee-subj-edit-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const rec  = (AppState.get(KEY) || []).find(f => f.id === btn.dataset.rec);
        const subj = (AppState.get('subjects') || []).find(s => s.id === btn.dataset.subj);
        if (rec && subj) this._openSubjectFeeEdit(rec, subj, container, filters);
      });
    });
    treeEl.querySelectorAll('.fee-del-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const fee = (AppState.get(KEY) || []).find(f => f.id === btn.dataset.id);
        if (fee) this._delete(fee, container, filters);
      });
    });

    treeEl.querySelectorAll('.fee-title-del-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const ids   = btn.dataset.ids.split(',').filter(Boolean);
        const title = btn.dataset.title || 'this period';
        const ok = await Modal.confirm({
          title: '⚠️ Delete Entire Fee Period',
          message: `
            <div style="display:flex;flex-direction:column;gap:10px">
              <p style="margin:0">Are you sure you want to delete <strong>all fee structures</strong> for
                the period <strong>${title}</strong>?
                This will remove <strong>${ids.length}</strong> record${ids.length !== 1 ? 's' : ''}.
              </p>
              <div style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);
                          border-radius:8px;padding:10px 12px;display:flex;gap:8px;align-items:flex-start">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"
                     style="flex-shrink:0;margin-top:1px">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span style="font-size:12.5px;color:#ef4444;font-weight:500;line-height:1.5">
                  This will remove fees for ALL campuses and disciplines in this period.
                  Fees will no longer appear in Admissions. This action cannot be undone.
                </span>
              </div>
            </div>`,
          confirmLabel: 'Yes, Delete All', danger: true,
        });
        if (!ok) return;
        ids.forEach(id => AppState.remove(KEY, id));
        Toast.success(`Fee period "${title}" deleted.`);
        this._render(container, filters);
      });
    });
  },

  _openSubjectFeeEdit(rec, subj, container, filters) {
    const hasTuition = rec.tuitionEnabled !== false;
    const hasExam    = rec.examEnabled    !== false;
    const tSym  = getSymbol(rec.tuitionCurrency || 'PKR');
    const eSym  = getSymbol(rec.examCurrency    || 'PKR');
    const saved = rec.fees?.[subj.id] || {};
    Modal.open({
      title: `Edit — ${subj.subjectCode || ''} ${subj.subjectName}`,
      size: 'sm',
      body: `
        <p style="font-size:12px;color:var(--t3);margin-bottom:14px">
          Period: <strong style="color:var(--t1)">${buildTitle(rec.applicableFrom, rec.applicableTo)}</strong>
        </p>
        ${hasTuition ? `
        <div class="form-group">
          <label class="form-label" style="color:#10b981">Tuition Fee
            <span class="fee-num-font" style="font-weight:400;font-size:11px">(${tSym})</span>
          </label>
          <input id="sfe_t" type="number" min="0" class="form-input fi-amt"
                 value="${saved.tuition ?? ''}" placeholder="0"/>
        </div>` : ''}
        ${hasExam ? `
        <div class="form-group">
          <label class="form-label" style="color:#f59e0b">Exam Fee
            <span class="fee-num-font" style="font-weight:400;font-size:11px">(${eSym})</span>
          </label>
          <input id="sfe_e" type="number" min="0" class="form-input fi-amt"
                 value="${saved.exam ?? ''}" placeholder="0"/>
        </div>` : ''}`,
      actions: [
        { label: 'Cancel', variant: 'ghost' },
        {
          label: 'Save', variant: 'primary', close: false,
          handler: (modalEl) => {
            const tVal = modalEl.querySelector('#sfe_t')?.value;
            const eVal = modalEl.querySelector('#sfe_e')?.value;
            const allFees = { ...(rec.fees || {}) };
            if (!allFees[subj.id]) allFees[subj.id] = {};
            if (tVal !== '' && tVal != null) allFees[subj.id].tuition = Number(tVal);
            if (eVal !== '' && eVal != null) allFees[subj.id].exam    = Number(eVal);
            AppState.update(KEY, rec.id, { fees: allFees });
            Toast.success(`Fee updated — ${subj.subjectCode || subj.subjectName}`);
            Modal.closeAll();
            this._render(container, filters);
          }
        }
      ]
    });
  },

  _openForm(existing = null, container, filters = {}) {
    const isEdit = !!existing;
    if (isEdit  && !Auth.can('fee:edit'))   return Toast.warning('Permission denied.');
    if (!isEdit && !Auth.can('fee:create')) return Toast.warning('Permission denied.');

    const institutes  = AppState.get('institutes')  || [];
    const campuses    = AppState.get('campuses')    || [];
    const disciplines = AppState.get('disciplines') || [];
    const levels      = AppState.get('levels')      || [];
    const subjects    = AppState.get('subjects')    || [];

    let prefill = existing;
    if (!isEdit) {
      const all = AppState.get(KEY) || [];
      if (all.length > 0) prefill = all[all.length - 1];
    }

    const initInst  = prefill?.instituteId  || '';
    const initDisc  = prefill?.disciplineId || '';
    const initCamps = isEdit
      ? [existing?.campusId].filter(Boolean)
      : [prefill?.campusId].filter(Boolean);

    const instOpts = () => institutes.map(i =>
      `<option value="${i.id}" ${i.id === initInst ? 'selected' : ''}>${i.instituteName}</option>`
    ).join('');
    const discOptsFor = (instId) => disciplines
      .filter(d => !instId || !d.instituteId || d.instituteId === instId)
      .map(d => `<option value="${d.id}" ${d.id === initDisc ? 'selected' : ''}>${d.abbreviation} — ${d.fullName}</option>`)
      .join('');
    const currOpts = (sel = 'PKR') => CURRENCIES.map(c =>
      `<option value="${c.code}" ${c.code === sel ? 'selected' : ''}>${c.symbol} — ${c.code}</option>`
    ).join('');

    let activeFeeTypes = new Set(
      prefill
        ? [...(prefill.tuitionEnabled !== false ? ['tuition'] : []), ...(prefill.examEnabled !== false ? ['exam'] : [])]
        : ['tuition', 'exam']
    );
    let feeCurrencies = {
      tuition: prefill?.tuitionCurrency || 'PKR',
      exam:    prefill?.examCurrency    || 'PKR',
    };

    Modal.open({
      title: isEdit ? 'Edit Fee Structure' : 'Add Fee Structure',
      size: 'xl',
      width: '900px',
      scrollable: true,
      bodyStyle: 'max-height:80vh;overflow-y:auto;padding-right:4px',
      body: `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px;align-items:end">
          <div class="form-group" style="margin:0">
            <label class="form-label">Applicable From <span class="req">*</span></label>
            <input id="fi_from" type="date" class="form-input" value="${prefill?.applicableFrom || ''}"/>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">Applicable To</label>
            <input id="fi_to" type="date" class="form-input" value="${prefill?.applicableTo || ''}"/>
          </div>
          <div>
            <span style="font-size:10.5px;font-weight:700;color:var(--t3);
                         text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:6px">
              Period Title
            </span>
            <div style="display:flex;align-items:center;gap:7px;padding:8px 11px;
                        border-radius:7px;background:var(--surface2);border:1px solid var(--border);height:36px">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span id="fi_title_prev" style="font-size:13px;font-weight:700;color:#4f85f7">
                ${prefill?.applicableFrom ? buildTitle(prefill.applicableFrom, prefill.applicableTo) : '—'}
              </span>
            </div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
          <div class="form-group" style="margin:0">
            <label class="form-label">Institute <span class="req">*</span></label>
            <select id="fi_inst" class="form-select form-input">
              <option value="">Select…</option>${instOpts()}
            </select>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">Discipline <span class="req">*</span></label>
            <select id="fi_disc" class="form-select form-input">
              <option value="">Select…</option>
              ${initInst ? discOptsFor(initInst) : discOptsFor('')}
            </select>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:auto 1fr;gap:16px;margin-bottom:14px;align-items:start">
          <div>
            <span style="font-size:10.5px;font-weight:700;color:var(--t3);
                         text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:6px">Fee Types</span>
            <div style="display:flex;gap:8px">
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;
                             padding:5px 11px;border-radius:7px;border:1px solid rgba(16,185,129,.4)">
                <input type="checkbox" id="fi_tuf_chk" ${activeFeeTypes.has('tuition') ? 'checked' : ''}
                       style="width:13px;height:13px;accent-color:#10b981"/>
                <span style="font-size:12.5px;font-weight:600;color:#10b981">Tuition</span>
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;
                             padding:5px 11px;border-radius:7px;border:1px solid rgba(245,158,11,.4)">
                <input type="checkbox" id="fi_exf_chk" ${activeFeeTypes.has('exam') ? 'checked' : ''}
                       style="width:13px;height:13px;accent-color:#f59e0b"/>
                <span style="font-size:12.5px;font-weight:600;color:#f59e0b">Exam</span>
              </label>
            </div>
          </div>
          <div id="fi_freq_row" style="${!activeFeeTypes.has('tuition') ? 'display:none' : ''}">
            <span style="font-size:10.5px;font-weight:700;color:var(--t3);
                         text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:6px">Tuition Frequency</span>
            <div style="display:flex;gap:8px">
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;
                             padding:5px 11px;border-radius:7px;border:1px solid var(--border)">
                <input type="radio" name="tuitionFreq" value="onetime"
                       ${prefill?.tuitionFrequency !== 'monthly' ? 'checked' : ''}
                       style="accent-color:#10b981"/>
                <span style="font-size:12px;color:var(--t1)">One-time</span>
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;
                             padding:5px 11px;border-radius:7px;border:1px solid var(--border)">
                <input type="radio" name="tuitionFreq" value="monthly"
                       ${prefill?.tuitionFrequency === 'monthly' ? 'checked' : ''}
                       style="accent-color:#10b981"/>
                <span style="font-size:12px;color:var(--t1)">Monthly</span>
              </label>
            </div>
          </div>
        </div>

        <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:14px">
          <div id="fi_table_empty" style="padding:20px;text-align:center;color:var(--t3);font-size:12.5px">
            Select institute and discipline to load subjects.
          </div>
          <div id="fi_table_wrap" style="display:none;overflow-y:auto;max-height:320px;position:relative">
            <table style="width:100%;border-collapse:collapse;table-layout:auto">
              <thead id="fi_thead" style="position:sticky;top:0;z-index:10"></thead>
              <tbody id="fi_tbody"></tbody>
            </table>
          </div>
        </div>

        <div>
          <span style="font-size:10.5px;font-weight:700;color:var(--t3);
                       text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:6px">
            Apply to Campuses
            <span style="font-weight:400;font-size:10px;color:var(--t3);text-transform:none">
              ${isEdit ? '— editing this campus only' : '— select all that apply'}
            </span>
          </span>
          <div id="fi_camps" style="display:flex;gap:8px;flex-wrap:wrap">
            <span style="font-size:12px;color:var(--t3)">Select discipline to see relevant campuses.</span>
          </div>
        </div>
      `,

      onOpen: (modalEl) => {
        // Force wider modal box
        const box = modalEl.querySelector('.modal-box') || modalEl.closest('.modal-box') || modalEl;
        if (box) box.style.maxWidth = '900px';

        const instSel    = modalEl.querySelector('#fi_inst');
        const discSel    = modalEl.querySelector('#fi_disc');
        const tufChk     = modalEl.querySelector('#fi_tuf_chk');
        const exfChk     = modalEl.querySelector('#fi_exf_chk');
        const freqRow    = modalEl.querySelector('#fi_freq_row');
        const campWrap   = modalEl.querySelector('#fi_camps');
        const tableEmpty = modalEl.querySelector('#fi_table_empty');
        const tableWrap  = modalEl.querySelector('#fi_table_wrap');
        const thead      = modalEl.querySelector('#fi_thead');
        const tbody      = modalEl.querySelector('#fi_tbody');

        ['#fi_from','#fi_to'].forEach(sel => {
          modalEl.querySelector(sel)?.addEventListener('change', () => {
            const f = modalEl.querySelector('#fi_from').value;
            const t = modalEl.querySelector('#fi_to').value;
            const p = modalEl.querySelector('#fi_title_prev');
            if (p) p.textContent = f ? buildTitle(f, t) : '—';
          });
        });

        const buildCamps = (instId, discId) => {
          // Step 1: institute filter
          let list = campuses.filter(c => !instId || c.instituteId === instId);

          // Step 2: if discipline selected, further filter to only campuses in that discipline's campusIds
          if (discId) {
            const disc = disciplines.find(d => d.id === discId);
            if (disc?.campusIds?.length) {
              const discCampSet = new Set(disc.campusIds);
              list = list.filter(c => discCampSet.has(c.id));
            }
          }

          if (!list.length) {
            campWrap.innerHTML = discId
              ? `<span style="font-size:12px;color:var(--t3)">No campuses linked to this discipline. <span style="color:var(--t4)">Go to Disciplines module to assign campuses.</span></span>`
              : `<span style="font-size:12px;color:var(--t3)">Select a discipline first to see relevant campuses.</span>`;
            return;
          }

          campWrap.innerHTML = list.map(c => `
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;
                           padding:5px 11px;border-radius:6px;
                           border:1px solid var(--border);background:var(--surface2)">
              <input type="checkbox" name="campusIds" value="${c.id}"
                     ${initCamps.includes(c.id) || (!isEdit && list.length === 1) ? 'checked' : ''}
                     ${isEdit ? 'disabled style="opacity:.5"' : ''}
                     style="width:13px;height:13px;accent-color:#4f85f7"/>
              <span style="font-size:12.5px;color:var(--t1)">${c.campusName}</span>
            </label>`).join('');
        };

        const buildTable = () => {
          const discId = discSel.value;
          if (!discId || activeFeeTypes.size === 0) {
            tableEmpty.style.display = 'block';
            tableEmpty.textContent   = !discId
              ? 'Select institute and discipline to load subjects.'
              : 'Enable at least one fee type.';
            tableWrap.style.display = 'none';
            return;
          }
          const discLvls    = levels.filter(l => l.disciplineId === discId);
          const anySubjects = discLvls.some(l => subjects.some(s => s.levelId === l.id));
          if (!anySubjects) {
            tableEmpty.textContent   = 'No subjects found for this discipline.';
            tableEmpty.style.display = 'block';
            tableWrap.style.display  = 'none';
            return;
          }
          tableEmpty.style.display = 'none';
          tableWrap.style.display  = 'block';

          const FEE_COL = [
            { key: 'tuition', label: 'Tuition Fee', color: '#10b981' },
            { key: 'exam',    label: 'Exam Fee',    color: '#f59e0b' },
          ].filter(f => activeFeeTypes.has(f.key));

          // Update colgroup widths dynamically
          thead.innerHTML = `
            <tr>
              <th style="text-align:left;padding:8px 14px;font-size:11px;font-weight:700;
                         color:var(--t3);text-transform:uppercase;letter-spacing:.05em;
                         background:var(--surface2);border-bottom:1px solid var(--border);
                         width:100%">Course</th>
              ${FEE_COL.map(f => `
                <th style="text-align:center;padding:6px 10px;font-size:11px;
                           background:var(--surface2);border-bottom:1px solid var(--border);
                           border-left:1px solid var(--border);white-space:nowrap;min-width:140px">
                  <div style="display:flex;flex-direction:column;gap:4px;align-items:center">
                    <span style="font-weight:700;color:${f.color};font-size:11px;
                                 text-transform:uppercase;letter-spacing:.04em">${f.label}</span>
                    <select class="fi-curr-sel" data-fee="${f.key}"
                            style="font-size:11px;padding:2px 5px;border-radius:5px;
                                   border:1px solid var(--border);background:var(--surface1);
                                   color:var(--t2);cursor:pointer">
                      ${currOpts(feeCurrencies[f.key])}
                    </select>
                  </div>
                </th>`).join('')}
            </tr>`;

          thead.querySelectorAll('.fi-curr-sel').forEach(sel => {
            sel.addEventListener('change', () => {
              feeCurrencies[sel.dataset.fee] = sel.value;
              const sym = getSymbol(sel.value);
              tbody.querySelectorAll(`input[data-fee="${sel.dataset.fee}"]`).forEach(inp => {
                inp.placeholder = `${sym} 0`;
              });
            });
          });

          const savedFees = prefill?.fees || {};
          let bodyHtml = '';
          discLvls.forEach(lvl => {
            const lvlSubjs = subjects.filter(s => s.levelId === lvl.id);
            if (!lvlSubjs.length) return;
            bodyHtml += `
              <tr>
                <td colspan="${1 + FEE_COL.length}"
                    style="padding:5px 14px;background:var(--surface2);
                           border-top:1px solid var(--border);
                           font-size:11.5px;font-weight:700;color:var(--t2)">${lvl.levelName}</td>
              </tr>`;
            lvlSubjs.forEach(subj => {
              const sym_t = getSymbol(feeCurrencies.tuition);
              const sym_e = getSymbol(feeCurrencies.exam);
              bodyHtml += `
                <tr style="border-top:1px solid var(--border)">
                  <td style="padding:6px 14px;font-size:12.5px;color:var(--t1)">
                    <span class="fee-num-font" style="font-size:10.5px;font-weight:700;
                                 color:var(--violet);margin-right:7px">${subj.subjectCode || ''}</span>
                    ${subj.subjectName || ''}
                  </td>
                  ${FEE_COL.map(f => {
                    const saved = savedFees[subj.id]?.[f.key] ?? '';
                    const sym   = f.key === 'tuition' ? sym_t : sym_e;
                    return `
                      <td style="padding:4px 8px;border-left:1px solid var(--border);text-align:center;white-space:nowrap">
                        <input type="number" min="0" step="1" class="fi-amt form-input"
                               data-fee="${f.key}" data-subject="${subj.id}"
                               placeholder="${sym} 0" value="${saved}"
                               style="width:120px;max-width:130px;text-align:right;
                                      font-size:12.5px;padding:4px 8px;border-radius:6px"/>
                      </td>`;
                  }).join('')}
                </tr>`;
            });
          });
          tbody.innerHTML = bodyHtml;
        };

        instSel.addEventListener('change', () => {
          discSel.innerHTML = `<option value="">Select…</option>${discOptsFor(instSel.value)}`;
          buildCamps(instSel.value, discSel.value);
          buildTable();
        });
        discSel.addEventListener('change', () => {
          buildCamps(instSel.value, discSel.value);
          buildTable();
        });
        tufChk.addEventListener('change', () => {
          tufChk.checked ? activeFeeTypes.add('tuition') : activeFeeTypes.delete('tuition');
          freqRow.style.display = tufChk.checked ? '' : 'none';
          buildTable();
        });
        exfChk.addEventListener('change', () => {
          exfChk.checked ? activeFeeTypes.add('exam') : activeFeeTypes.delete('exam');
          buildTable();
        });

        if (initInst) buildCamps(initInst, initDisc);
        buildTable();
      },

      actions: [
        { label: 'Cancel', variant: 'ghost' },
        {
          label: isEdit ? 'Save Changes' : 'Add Fee',
          variant: 'primary', close: false,
          handler: (modalEl) => {
            const body = modalEl.querySelector('.modal-body');
            const instituteId    = body.querySelector('#fi_inst').value;
            const disciplineId   = body.querySelector('#fi_disc').value;
            const applicableFrom = body.querySelector('#fi_from').value;
            const applicableTo   = body.querySelector('#fi_to').value;
            const tuitionFreq    = body.querySelector('input[name="tuitionFreq"]:checked')?.value || 'onetime';
            const tufOn = body.querySelector('#fi_tuf_chk')?.checked;
            const exfOn = body.querySelector('#fi_exf_chk')?.checked;

            const campusIds = isEdit
              ? [existing.campusId].filter(Boolean)
              : [...body.querySelectorAll('input[name="campusIds"]:checked')].map(cb => cb.value);

            if (!instituteId)      return Toast.warning('Please select an institute.');
            if (!disciplineId)     return Toast.warning('Please select a discipline.');
            if (!tufOn && !exfOn)  return Toast.warning('Please enable at least one fee type.');
            if (!applicableFrom)   return Toast.warning('Please enter Applicable From date.');
            if (!campusIds.length) return Toast.warning('Please select at least one campus.');

            const fees = {};
            const newCurr = {};
            body.querySelectorAll('.fi-curr-sel').forEach(sel => { newCurr[sel.dataset.fee] = sel.value; });

            // Edit mode: start with existing fees so unchecked fee types are preserved
            if (isEdit && existing?.fees) {
              Object.entries(existing.fees).forEach(([subjId, feeObj]) => {
                fees[subjId] = { ...feeObj };
              });
            }

            // Only overwrite fee keys that are currently visible (active fee types)
            body.querySelectorAll('.fi-amt').forEach(inp => {
              const v       = inp.value.trim();
              const subjId  = inp.dataset.subject;
              const feeKey  = inp.dataset.fee;
              if (!fees[subjId]) fees[subjId] = {};
              if (v !== '') {
                fees[subjId][feeKey] = Number(v);
              } else if (!isEdit) {
                // Add mode: skip empty
              }
              // Edit mode + empty field: keep existing value (already copied above)
            });

            const baseData = {
              instituteId, disciplineId,
              year:             new Date(applicableFrom).getFullYear().toString(),
              title:            buildTitle(applicableFrom, applicableTo),
              tuitionEnabled:   !!tufOn,
              examEnabled:      !!exfOn,
              tuitionFrequency: tufOn ? tuitionFreq : null,
              tuitionCurrency:  newCurr.tuition || (isEdit ? existing.tuitionCurrency : 'PKR') || 'PKR',
              examCurrency:     newCurr.exam    || (isEdit ? existing.examCurrency    : 'PKR') || 'PKR',
              fees, applicableFrom, applicableTo,
            };

            savePerCampus(baseData, campusIds, isEdit, existing?.id);
            Modal.closeAll();
            this._render(container, filters);
          }
        }
      ]
    });
  },

  // ── Period-level edit: update dates/fees across ALL records of a period ──
  _openFormForPeriod(recs, container, filters = {}) {
    if (!Auth.can('fee:edit')) return Toast.warning('Permission denied.');

    const campuses    = AppState.get('campuses')    || [];
    const disciplines = AppState.get('disciplines') || [];
    const institutes  = AppState.get('institutes')  || [];
    const levels      = AppState.get('levels')      || [];
    const subjects    = AppState.get('subjects')    || [];

    // Use first rec as reference for shared fields
    const ref = recs[0];
    const allCampusIds = recs.map(r => r.campusId).filter(Boolean);

    // Build merged fees: per-campus fees merged (last write wins per subject)
    const mergedFees = {};
    recs.forEach(r => {
      Object.entries(r.fees || {}).forEach(([subjId, feeObj]) => {
        if (!mergedFees[subjId]) mergedFees[subjId] = {};
        Object.assign(mergedFees[subjId], feeObj);
      });
    });

    let activeFeeTypes = new Set([
      ...(ref.tuitionEnabled !== false ? ['tuition'] : []),
      ...(ref.examEnabled    !== false ? ['exam']    : []),
    ]);
    let feeCurrencies = {
      tuition: ref.tuitionCurrency || 'PKR',
      exam:    ref.examCurrency    || 'PKR',
    };
    const currOpts = (sel = 'PKR') => CURRENCIES.map(c =>
      `<option value="${c.code}" ${c.code === sel ? 'selected' : ''}>${c.symbol} — ${c.code}</option>`
    ).join('');

    const instName  = institutes.find(i  => i.id  === ref.instituteId)?.instituteName  || '—';
    const discName  = disciplines.find(d => d.id  === ref.disciplineId)?.fullName       || '—';
    const campNames = allCampusIds.map(id => campuses.find(c => c.id === id)?.campusName || id);

    Modal.open({
      title: `Edit Fee Period — ${ref.title || buildTitle(ref.applicableFrom, ref.applicableTo)}`,
      size: 'xl',
      scrollable: true,
      bodyStyle: 'max-height:80vh;overflow-y:auto;padding-right:4px',
      body: `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px;align-items:end">
          <div class="form-group" style="margin:0">
            <label class="form-label">Applicable From <span class="req">*</span></label>
            <input id="fp_from" type="date" class="form-input" value="${ref.applicableFrom || ''}"/>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">Applicable To</label>
            <input id="fp_to" type="date" class="form-input" value="${ref.applicableTo || ''}"/>
          </div>
          <div>
            <span style="font-size:10.5px;font-weight:700;color:var(--t3);
                         text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:6px">Period Title</span>
            <div style="display:flex;align-items:center;gap:7px;padding:8px 11px;
                        border-radius:7px;background:var(--surface2);border:1px solid var(--border);height:36px">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span id="fp_title_prev" style="font-size:13px;font-weight:700;color:#4f85f7">
                ${buildTitle(ref.applicableFrom, ref.applicableTo)}
              </span>
            </div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
          <div class="form-group" style="margin:0">
            <label class="form-label">Institute</label>
            <div class="form-input" style="background:var(--surface2);color:var(--t2);cursor:default">${instName}</div>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">Discipline</label>
            <div class="form-input" style="background:var(--surface2);color:var(--t2);cursor:default">${discName}</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:auto 1fr;gap:16px;margin-bottom:14px;align-items:start">
          <div>
            <span style="font-size:10.5px;font-weight:700;color:var(--t3);
                         text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:6px">Fee Types</span>
            <div style="display:flex;gap:8px">
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;
                             padding:5px 11px;border-radius:7px;border:1px solid rgba(16,185,129,.4)">
                <input type="checkbox" id="fp_tuf_chk" ${activeFeeTypes.has('tuition') ? 'checked' : ''}
                       style="width:13px;height:13px;accent-color:#10b981"/>
                <span style="font-size:12.5px;font-weight:600;color:#10b981">Tuition</span>
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;
                             padding:5px 11px;border-radius:7px;border:1px solid rgba(245,158,11,.4)">
                <input type="checkbox" id="fp_exf_chk" ${activeFeeTypes.has('exam') ? 'checked' : ''}
                       style="width:13px;height:13px;accent-color:#f59e0b"/>
                <span style="font-size:12.5px;font-weight:600;color:#f59e0b">Exam</span>
              </label>
            </div>
          </div>
          <div id="fp_freq_row" style="${!activeFeeTypes.has('tuition') ? 'display:none' : ''}">
            <span style="font-size:10.5px;font-weight:700;color:var(--t3);
                         text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:6px">Tuition Frequency</span>
            <div style="display:flex;gap:8px">
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;
                             padding:5px 11px;border-radius:7px;border:1px solid var(--border)">
                <input type="radio" name="fp_tuitionFreq" value="onetime"
                       ${ref.tuitionFrequency !== 'monthly' ? 'checked' : ''}
                       style="accent-color:#10b981"/>
                <span style="font-size:12px;color:var(--t1)">One-time</span>
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;
                             padding:5px 11px;border-radius:7px;border:1px solid var(--border)">
                <input type="radio" name="fp_tuitionFreq" value="monthly"
                       ${ref.tuitionFrequency === 'monthly' ? 'checked' : ''}
                       style="accent-color:#10b981"/>
                <span style="font-size:12px;color:var(--t1)">Monthly</span>
              </label>
            </div>
          </div>
        </div>

        <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:14px">
          <div id="fp_table_wrap" style="overflow-y:auto;max-height:320px;position:relative">
            <table style="width:100%;border-collapse:collapse;table-layout:auto">
              <thead id="fp_thead" style="position:sticky;top:0;z-index:10"></thead>
              <tbody id="fp_tbody"></tbody>
            </table>
          </div>
        </div>

        <div>
          <span style="font-size:10.5px;font-weight:700;color:var(--t3);
                       text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:6px">
            Apply to Campuses
            <span style="font-weight:400;font-size:10px;color:var(--t3);text-transform:none">— uncheck to exclude from update</span>
          </span>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${allCampusIds.map(id => {
              const name = campuses.find(c => c.id === id)?.campusName || id;
              return `
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;
                               padding:5px 11px;border-radius:6px;
                               border:1px solid #4f85f7;background:rgba(79,133,247,.08)">
                  <input type="checkbox" name="fp_campusIds" value="${id}" checked
                         style="width:13px;height:13px;accent-color:#4f85f7"/>
                  <span style="font-size:12.5px;color:#4f85f7;font-weight:600">${name}</span>
                </label>`;
            }).join('')}
          </div>
        </div>
      `,

      onOpen: (modalEl) => {
        const box = modalEl.querySelector('.modal-box') || modalEl.closest('.modal-box') || modalEl;
        if (box) box.style.maxWidth = '900px';

        const tufChk  = modalEl.querySelector('#fp_tuf_chk');
        const exfChk  = modalEl.querySelector('#fp_exf_chk');
        const freqRow = modalEl.querySelector('#fp_freq_row');
        const thead   = modalEl.querySelector('#fp_thead');
        const tbody   = modalEl.querySelector('#fp_tbody');

        ['#fp_from','#fp_to'].forEach(sel => {
          modalEl.querySelector(sel)?.addEventListener('change', () => {
            const f = modalEl.querySelector('#fp_from').value;
            const t = modalEl.querySelector('#fp_to').value;
            const p = modalEl.querySelector('#fp_title_prev');
            if (p) p.textContent = f ? buildTitle(f, t) : '—';
          });
        });

        const FEE_COLS = () => [
          { key: 'tuition', label: 'Tuition Fee', color: '#10b981' },
          { key: 'exam',    label: 'Exam Fee',    color: '#f59e0b' },
        ].filter(f => activeFeeTypes.has(f.key));

        const buildTable = () => {
          const cols = FEE_COLS();
          thead.innerHTML = `
            <tr>
              <th style="text-align:left;padding:8px 14px;font-size:11px;font-weight:700;
                         color:var(--t3);text-transform:uppercase;letter-spacing:.05em;
                         background:var(--surface2);border-bottom:1px solid var(--border);
                         width:100%">Subject</th>
              ${cols.map(f => `
                <th style="text-align:center;padding:6px 10px;font-size:11px;
                           background:var(--surface2);border-bottom:1px solid var(--border);
                           border-left:1px solid var(--border);white-space:nowrap;min-width:140px">
                  <div style="display:flex;flex-direction:column;gap:4px;align-items:center">
                    <span style="font-weight:700;color:${f.color};font-size:11px;
                                 text-transform:uppercase;letter-spacing:.04em">${f.label}</span>
                    <select class="fp-curr-sel" data-fee="${f.key}"
                            style="font-size:11px;padding:2px 5px;border-radius:5px;
                                   border:1px solid var(--border);background:var(--surface1);
                                   color:var(--t2);cursor:pointer">
                      ${currOpts(feeCurrencies[f.key])}
                    </select>
                  </div>
                </th>`).join('')}
            </tr>`;

          thead.querySelectorAll('.fp-curr-sel').forEach(sel => {
            sel.addEventListener('change', () => { feeCurrencies[sel.dataset.fee] = sel.value; });
          });

          const discLvls = levels.filter(l => l.disciplineId === ref.disciplineId);
          let bodyHtml = '';
          discLvls.forEach(lvl => {
            const lvlSubjs = subjects.filter(s => s.levelId === lvl.id);
            if (!lvlSubjs.length) return;
            bodyHtml += `
              <tr>
                <td colspan="${1 + cols.length}"
                    style="padding:5px 14px;background:var(--surface2);
                           border-top:1px solid var(--border);
                           font-size:11.5px;font-weight:700;color:var(--t2)">${lvl.levelName}</td>
              </tr>`;
            lvlSubjs.forEach(subj => {
              bodyHtml += `
                <tr style="border-top:1px solid var(--border)">
                  <td style="padding:6px 14px;font-size:12.5px;color:var(--t1)">
                    <span class="fee-num-font" style="font-size:10.5px;font-weight:700;
                                 color:var(--violet);margin-right:7px">${subj.subjectCode || ''}</span>
                    ${subj.subjectName || ''}
                  </td>
                  ${cols.map(f => {
                    const saved = mergedFees[subj.id]?.[f.key] ?? '';
                    const sym   = getSymbol(feeCurrencies[f.key]);
                    return `
                      <td style="padding:4px 8px;border-left:1px solid var(--border);text-align:center;white-space:nowrap">
                        <input type="number" min="0" step="1" class="fp-amt form-input"
                               data-fee="${f.key}" data-subject="${subj.id}"
                               placeholder="${sym} 0" value="${saved}"
                               style="width:120px;text-align:right;font-size:12.5px;
                                      padding:4px 8px;border-radius:6px"/>
                      </td>`;
                  }).join('')}
                </tr>`;
            });
          });
          tbody.innerHTML = bodyHtml;
        };

        tufChk.addEventListener('change', () => {
          tufChk.checked ? activeFeeTypes.add('tuition') : activeFeeTypes.delete('tuition');
          freqRow.style.display = tufChk.checked ? '' : 'none';
          buildTable();
        });
        exfChk.addEventListener('change', () => {
          exfChk.checked ? activeFeeTypes.add('exam') : activeFeeTypes.delete('exam');
          buildTable();
        });

        buildTable();
      },

      actions: [
        { label: 'Cancel', variant: 'ghost' },
        {
          label: 'Save Changes', variant: 'primary', close: false,
          handler: (modalEl) => {
            const body = modalEl.querySelector('.modal-body');
            const applicableFrom = body.querySelector('#fp_from').value;
            const applicableTo   = body.querySelector('#fp_to').value;
            const tuitionFreq    = body.querySelector('input[name="fp_tuitionFreq"]:checked')?.value || 'onetime';
            const tufOn = body.querySelector('#fp_tuf_chk')?.checked;
            const exfOn = body.querySelector('#fp_exf_chk')?.checked;

            if (!applicableFrom)   return Toast.warning('Please enter Applicable From date.');
            if (!tufOn && !exfOn)  return Toast.warning('Please enable at least one fee type.');

            const newCurr = {};
            body.querySelectorAll('.fp-curr-sel').forEach(sel => { newCurr[sel.dataset.fee] = sel.value; });

            // Collect only the fee keys currently visible in the form
            const visibleFeeInputs = {};
            body.querySelectorAll('.fp-amt').forEach(inp => {
              const v      = inp.value.trim();
              const subjId = inp.dataset.subject;
              const feeKey = inp.dataset.fee;
              if (!visibleFeeInputs[subjId]) visibleFeeInputs[subjId] = {};
              if (v !== '') visibleFeeInputs[subjId][feeKey] = Number(v);
            });

            const newTitle = buildTitle(applicableFrom, applicableTo);
            // Get selected campus IDs
            const selectedCampIds = new Set(
              [...body.querySelectorAll('input[name="fp_campusIds"]:checked')].map(cb => cb.value)
            );
            if (!selectedCampIds.size) return Toast.warning('Please select at least one campus.');

            // Update only selected campus records
            const recsToUpdate = recs.filter(r => selectedCampIds.has(r.campusId));
            recsToUpdate.forEach(rec => {
              // Preserve existing fees, then merge only visible fee type inputs
              const mergedFees = {};
              Object.entries(rec.fees || {}).forEach(([subjId, feeObj]) => {
                mergedFees[subjId] = { ...feeObj };
              });
              Object.entries(visibleFeeInputs).forEach(([subjId, feeObj]) => {
                if (!mergedFees[subjId]) mergedFees[subjId] = {};
                Object.assign(mergedFees[subjId], feeObj);
              });

              AppState.update(KEY, rec.id, {
                applicableFrom, applicableTo,
                title:            newTitle,
                year:             new Date(applicableFrom).getFullYear().toString(),
                tuitionEnabled:   !!tufOn,
                examEnabled:      !!exfOn,
                tuitionFrequency: tufOn ? tuitionFreq : null,
                tuitionCurrency:  newCurr.tuition || rec.tuitionCurrency || 'PKR',
                examCurrency:     newCurr.exam    || rec.examCurrency    || 'PKR',
                fees: mergedFees,
              });
            });
            Toast.success(`Fee period "${newTitle}" updated for ${recsToUpdate.length} campus${recsToUpdate.length !== 1 ? 'es' : ''}.`);
            Modal.closeAll();
            this._render(container, filters);
          }
        }
      ]
    });
  },

  async _delete(fee, container, filters) {
    if (!Auth.can('fee:delete')) return Toast.warning('Permission denied.');
    const camp = (AppState.get('campuses') || []).find(c => c.id === fee.campusId);
    const disc = (AppState.get('disciplines') || []).find(d => d.id === fee.disciplineId);
    const ok = await Modal.confirm({
      title:   '⚠️ Delete Fee Structure',
      message: `
        <div style="display:flex;flex-direction:column;gap:10px">
          <p style="margin:0">Are you sure you want to delete the fee structure for
            <strong>${fee.title || buildTitle(fee.applicableFrom, fee.applicableTo)}</strong>
            ${disc ? `— <strong>${disc.fullName}</strong>` : ''}
            ${camp ? ` at <strong>${camp.campusName}</strong>` : ''}?
          </p>
          <div style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);
                      border-radius:8px;padding:10px 12px;display:flex;gap:8px;align-items:flex-start">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"
                 style="flex-shrink:0;margin-top:1px">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span style="font-size:12.5px;color:#ef4444;font-weight:500;line-height:1.5">
              This may cause fees to not appear in Admissions for students enrolled in this discipline.
              This action cannot be undone.
            </span>
          </div>
        </div>`,
      confirmLabel: 'Yes, Delete', danger: true,
    });
    if (!ok) return;
    AppState.remove(KEY, fee.id);
    Toast.success('Fee structure deleted.');
    this._render(container, filters);
  },

  _attachToolbar(container) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    let filters = {};

    el.querySelector('#feeAddBtn')?.addEventListener('click', () => {
      if (!Auth.can('fee:create')) return Toast.warning('Permission denied.');
      this._openForm(null, el, filters);
    });
    el.querySelector('#feeInstFilter')?.addEventListener('change', (e) => {
      filters.instituteId = e.target.value || undefined;
      this._render(el, filters);
    });
    el.querySelector('#feeDiscFilter')?.addEventListener('change', (e) => {
      filters.disciplineId = e.target.value || undefined;
      this._render(el, filters);
    });
  },

  _pageTemplate() {
    const institutes  = AppState.get('institutes')  || [];
    const disciplines = AppState.get('disciplines') || [];
    const canCreate   = Auth.can('fee:create');
    return `
      <div class="module-page" style="padding-top:0">
        <div class="module-toolbar" style="flex-wrap:wrap;gap:10px;align-items:flex-end;padding-top:0;margin-top:0">
          <div style="display:flex;flex-direction:column;gap:3px">
            <span style="font-size:10.5px;font-weight:600;color:var(--t3);text-transform:uppercase">Institute</span>
            <select id="feeInstFilter" class="form-select form-input" style="min-width:190px">
              <option value="">All Institutes</option>
              ${institutes.map(i => `<option value="${i.id}">${i.instituteName}</option>`).join('')}
            </select>
          </div>
          <div style="display:flex;flex-direction:column;gap:3px">
            <span style="font-size:10.5px;font-weight:600;color:var(--t3);text-transform:uppercase">Discipline</span>
            <select id="feeDiscFilter" class="form-select form-input" style="min-width:210px">
              <option value="">All Disciplines</option>
              ${disciplines.map(d => `<option value="${d.id}">${d.abbreviation} — ${d.fullName}</option>`).join('')}
            </select>
          </div>
          <span class="record-count" style="color:var(--t3);font-size:12.5px;padding-bottom:6px">— records</span>
          ${canCreate ? `<div style="margin-left:auto"><button id="feeAddBtn" class="add-btn" title="Add Fee" style="width:34px;height:34px;padding:0;display:inline-flex;align-items:center;justify-content:center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button></div>` : ''}
        </div>
        <div id="fee-tree" style="margin-top:12px"></div>
      </div>`;
  }
};

// ── Helper functions ──────────────────────────────────────────
function _hdr({ id, depth, icon, badge = null, label, count, color, extraRight = '' }) {
  const bgMap  = ['var(--surface2)','var(--surface2)','var(--surface3)','var(--surface3)'];
  const fsMap  = ['13.5px','13px','12.5px','12px'];
  const padMap = ['9px 12px','8px 11px','7px 10px','6px 9px'];
  const countHtml = count != null
    ? `<span style="font-size:11px;color:var(--t3);flex-shrink:0;margin-left:auto">${count} records</span>`
    : '';
  // If no count, spacer so extraRight goes to far right
  const spacer = count == null && extraRight ? `<span style="flex:1"></span>` : '';
  return `
    <div class="fee-hdr" data-target="${id}"
         style="display:flex;align-items:center;gap:7px;padding:${padMap[depth]||'6px 9px'};
                background:${bgMap[depth]||'var(--surface3)'};
                border:1px solid var(--border);border-radius:var(--r-sm);
                margin-bottom:4px;cursor:pointer;user-select:none">
      <svg class="fee-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="transition:transform .2s;color:var(--t3);transform:rotate(-90deg)"><polyline points="6 9 12 15 18 9"/></svg>
      <span style="color:${color};flex-shrink:0;display:flex;align-items:center">${icon}</span>
      ${badge || ''}
      <span style="font-size:${fsMap[depth]||'12px'};font-weight:600;color:var(--t1)">${label}</span>
      ${countHtml}
      ${spacer}
      ${extraRight}
    </div>`;
}
function _th(align = 'left') {
  return `text-align:${align};font-size:11px;font-weight:600;color:var(--t3);padding:6px 12px;text-transform:uppercase;background:var(--surface2)`;
}
function _td(align = 'left') {
  return `text-align:${align};padding:7px 12px;vertical-align:middle`;
}
function _ab(danger = false) {
  return danger
    ? `width:26px;height:26px;border-radius:6px;display:flex;align-items:center;justify-content:center;background:var(--red-dim);color:var(--red);border:1px solid rgba(239,68,68,.2);cursor:pointer`
    : `width:26px;height:26px;border-radius:6px;display:flex;align-items:center;justify-content:center;background:var(--surface3);color:var(--t2);border:1px solid var(--border);cursor:pointer`;
}

// ============================================================
// RegistrationFeeModule — Registration Fee Tab
// Features:
//   • Add/Edit/Delete registration fee entries
//   • Currency selector + amount field
//   • Animated "Applicable To" accordion:
//       Institute → Campus → Discipline → Level (all checked by default)
//   • Smart save: only updates selected scope, overwrites if already exists
//   • Scheduled future changes: auto-apply on effective date
// ============================================================

const REG_KEY      = 'registrationFees';
const REG_SCHED_LS = 'regFees_scheduled_v1';

// Scheduled changes use localStorage directly (no AppState.set needed)
function _schedSave(arr) {
  try { localStorage.setItem(REG_SCHED_LS, JSON.stringify(arr)); } catch(e) {}
}
function _schedLoad() {
  try { return JSON.parse(localStorage.getItem(REG_SCHED_LS) || '[]'); } catch(e) { return []; }
}

// ── Scheduled fee auto-apply ──────────────────────────────────
// Call this once at app startup: RegistrationFeeModule.applyScheduled()
// It checks all pending scheduled changes and applies them if date has passed.

export const RegistrationFeeModule = {

  // Call this at app boot to auto-apply any scheduled future changes
  applyScheduled() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const scheduled = _schedLoad() || [];
    const remaining = [];

    scheduled.forEach(sc => {
      const effDate = new Date(sc.effectiveDate);
      effDate.setHours(0, 0, 0, 0);
      if (effDate <= today) {
        // Apply: overwrite matching records or add new
        _regSaveEntries(sc.entries, false, null);
      } else {
        remaining.push(sc);
      }
    });

    _schedSave(remaining);
  },

  mount(container) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;

    // Inject styles for animated accordion
    injectUIStyles(`
      .reg-accordion-body {
        overflow: hidden;
        max-height: 0;
        transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1),
                    opacity 0.25s ease,
                    padding 0.25s ease;
        opacity: 0;
      }
      .reg-accordion-body.open {
        max-height: 1200px;
        opacity: 1;
      }
      .reg-acc-chevron {
        transition: transform 0.25s ease;
        flex-shrink: 0;
      }
      .reg-acc-chevron.open {
        transform: rotate(180deg);
      }
      .reg-scope-section {
        border: 1px solid var(--border);
        border-radius: 8px;
        overflow: hidden;
        margin-bottom: 8px;
      }
      .reg-scope-hdr {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: var(--surface2);
        cursor: pointer;
        user-select: none;
        font-size: 12px;
        font-weight: 600;
        color: var(--t2);
      }
      .reg-scope-hdr:hover { background: var(--surface3); }
      .reg-cb-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 10px 12px;
      }
      .reg-cb-item {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 4px 10px;
        border-radius: 6px;
        border: 1px solid var(--border);
        background: var(--surface1);
        cursor: pointer;
        font-size: 12px;
        color: var(--t1);
        transition: border-color 0.15s, background 0.15s;
      }
      .reg-cb-item:has(input:checked) {
        border-color: #4f85f7;
        background: rgba(79,133,247,.08);
      }
      .reg-select-all-btn {
        font-size: 10.5px;
        color: #4f85f7;
        cursor: pointer;
        text-decoration: underline;
        background: none;
        border: none;
        padding: 0 4px;
      }
      .reg-future-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 10px;
        background: rgba(245,158,11,.12);
        color: #f59e0b;
        border: 1px solid rgba(245,158,11,.3);
      }
    `);

    el.innerHTML = this._pageTemplate();
    this._render(el);
    this._attachToolbar(el);
    this.applyScheduled();
  },

  _pageTemplate() {
    const canCreate = Auth.can('fee:create');
    return `
      <div class="module-page" style="padding-top:0">
        <div class="module-toolbar" style="flex-wrap:wrap;gap:10px;align-items:flex-end;padding-top:0;margin-top:0">
          <div style="display:flex;flex-direction:column;gap:3px">
            <span style="font-size:10.5px;font-weight:600;color:var(--t3);text-transform:uppercase">Search</span>
            <input id="regSearchInput" class="form-input" type="text" placeholder="Search by campus / discipline…"
                   style="min-width:220px"/>
          </div>
          <span class="reg-record-count" style="color:var(--t3);font-size:12.5px;padding-bottom:6px">— records</span>
          ${canCreate ? `
          <div style="margin-left:auto;display:flex;gap:8px">
            <button id="regAddBtn" class="add-btn" title="Add Registration Fee" style="width:34px;height:34px;padding:0;display:inline-flex;align-items:center;justify-content:center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          </div>` : ''}
        </div>
        <div id="reg-list" style="margin-top:12px"></div>
      </div>`;
  },

  _render(el) {
    const records     = AppState.get(REG_KEY) || [];
    const scheduled   = _schedLoad() || [];
    const campuses    = AppState.get('campuses')    || [];
    const disciplines = AppState.get('disciplines') || [];
    const levels      = AppState.get('levels')      || [];
    const institutes  = AppState.get('institutes')  || [];
    const canEdit     = Auth.can('fee:edit');
    const canDelete   = Auth.can('fee:delete');

    const countEl = el.querySelector('.reg-record-count');
    const listEl  = el.querySelector('#reg-list');
    if (!listEl) return;

    const searchVal = (el.querySelector('#regSearchInput')?.value || '').toLowerCase();

    // Filter by search
    let shown = records.filter(r => {
      if (!searchVal) return true;
      const camp = campuses.find(c => c.id === r.campusId)?.campusName || '';
      const disc = disciplines.find(d => d.id === r.disciplineId)?.fullName || '';
      const lvl  = levels.find(l => l.id === r.levelId)?.levelName || '';
      return (camp + disc + lvl).toLowerCase().includes(searchVal);
    });

    if (countEl) countEl.textContent = `${shown.length} record${shown.length !== 1 ? 's' : ''}`;

    if (shown.length === 0 && scheduled.length === 0) {
      listEl.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                    min-height:260px;gap:12px;color:var(--t3);
                    border:1px dashed var(--border2);border-radius:var(--r-lg)">
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
            <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
          </svg>
          <span style="font-size:14px;font-weight:600;color:var(--t2)">No registration fees defined yet.</span>
          <span style="font-size:12.5px">Click "+ Add Registration Fee" to get started.</span>
        </div>`;
      return;
    }

    const sym = (code) => getSymbol(code || 'PKR');

    // Attach _idx to scheduled for wiring
    scheduled.forEach((sc, idx) => { sc._idx = idx; });

    // Group by institute → campus → discipline → level
    // Each cell: { active: [...], scheduled: [...] }
    const grouped = {};

    shown.forEach(r => {
      const inst = r.instituteId  || '__';
      const camp = r.campusId     || '__';
      const disc = r.disciplineId || '__';
      const lvl  = r.levelId      || '__all';
      if (!grouped[inst])              grouped[inst] = {};
      if (!grouped[inst][camp])        grouped[inst][camp] = {};
      if (!grouped[inst][camp][disc])  grouped[inst][camp][disc] = {};
      if (!grouped[inst][camp][disc][lvl]) grouped[inst][camp][disc][lvl] = { active: [], scheduled: [] };
      grouped[inst][camp][disc][lvl].active.push(r);
    });

    // Merge scheduled entries into same per-level cell
    scheduled.forEach(sc => {
      (sc.entries || []).forEach(e => {
        const inst = e.instituteId  || '__';
        const camp = e.campusId     || '__';
        const disc = e.disciplineId || '__';
        const lvl  = e.levelId      || '__all';
        if (!grouped[inst])              grouped[inst] = {};
        if (!grouped[inst][camp])        grouped[inst][camp] = {};
        if (!grouped[inst][camp][disc])  grouped[inst][camp][disc] = {};
        if (!grouped[inst][camp][disc][lvl]) grouped[inst][camp][disc][lvl] = { active: [], scheduled: [] };
        grouped[inst][camp][disc][lvl].scheduled.push({ ...e, _schedEffectiveDate: sc.effectiveDate, _schedIdx: sc._idx });
      });
    });

    let html = '';

    Object.entries(grouped).forEach(([instId, campMap], ii) => {
      const instName = institutes.find(i => i.id === instId)?.instituteName || 'Unknown Institute';
      const instNodeId = `ri${ii}`;
      const instCount = Object.values(campMap).flatMap(d => Object.values(d)).flatMap(d => Object.values(d)).reduce((s, cell) => s + (cell.active||[]).length + (cell.scheduled||[]).length, 0);

      const instAllRecs = Object.values(campMap).flatMap(d => Object.values(d)).flatMap(d => (d.active||[]));
      const instAllIds  = instAllRecs.map(r => r.id).join(',');

      html += `
        <div class="fee-block" style="margin-bottom:14px">
          <div class="fee-hdr" data-target="${instNodeId}"
               style="display:flex;align-items:center;gap:7px;padding:9px 12px;
                      background:var(--surface2);border:1px solid var(--border);
                      border-radius:var(--r-sm);margin-bottom:4px;cursor:pointer;user-select:none">
            <svg class="fee-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.5" style="transition:transform .2s;color:var(--t3);transform:rotate(-90deg)">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4f85f7" stroke-width="2" style="flex-shrink:0">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <span style="font-size:13.5px;font-weight:700;color:var(--t1)">${instName}</span>
            <span style="font-size:11px;color:var(--t3);margin-left:auto">${instCount} record${instCount!==1?'s':''}</span>
            ${canDelete ? `<button class="reg-bulk-del-btn" data-ids="${instAllIds}" data-label="${instName}"
              style="${_ab(true)};margin-left:8px" title="Delete all fees for ${instName}">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
              </svg></button>` : ''}
          </div>
          <div id="${instNodeId}" style="padding-left:14px;margin-top:2px;display:none">`;

      Object.entries(campMap).forEach(([campId, discMap], ci) => {
        const campName   = campuses.find(c => c.id === campId)?.campusName || 'Unknown Campus';
        const campNodeId = `${instNodeId}c${ci}`;
        const campCount  = Object.values(discMap).flatMap(d => Object.values(d)).reduce((s, cell) => s + (cell.active||[]).length + (cell.scheduled||[]).length, 0);
        const campAllIds = Object.values(discMap).flatMap(d => Object.values(d)).flatMap(d => (d.active||[])).map(r => r.id).join(',');

        html += `
          <div class="fee-block" style="margin-bottom:8px">
            <div class="fee-hdr" data-target="${campNodeId}"
                 style="display:flex;align-items:center;gap:7px;padding:8px 11px;
                        background:var(--surface2);border:1px solid var(--border);
                        border-radius:var(--r-sm);margin-bottom:4px;cursor:pointer;user-select:none">
              <svg class="fee-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2.5" style="transition:transform .2s;color:var(--t3);transform:rotate(-90deg)">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              </svg>
              <span style="font-size:13px;font-weight:600;color:var(--t1)">${campName}</span>
              <span style="font-size:11px;color:var(--t3);margin-left:auto">${campCount} record${campCount!==1?'s':''}</span>
              ${canDelete ? `<button class="reg-bulk-del-btn" data-ids="${campAllIds}" data-label="${campName}"
                style="${_ab(true)};margin-left:8px" title="Delete all fees for ${campName}">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
                </svg></button>` : ''}
            </div>
            <div id="${campNodeId}" style="padding-left:12px;margin-top:2px;display:none">`;

        Object.entries(discMap).forEach(([discId, lvlMap], di) => {
          const disc       = disciplines.find(d => d.id === discId);
          const discName   = disc?.fullName || 'Unknown Discipline';
          const discAbbr   = disc?.abbreviation || '?';
          const discNodeId = `${campNodeId}d${di}`;
          const discAllIds = Object.values(lvlMap).flatMap(cell => (cell.active||[])).map(r => r.id).join(',');

          html += `
            <div class="fee-block" style="margin-bottom:6px">
              <div class="fee-hdr" data-target="${discNodeId}"
                   style="display:flex;align-items:center;gap:7px;padding:7px 10px;
                          background:var(--surface2);border:1px solid var(--border);
                          border-radius:var(--r-sm);margin-bottom:4px;cursor:pointer;user-select:none">
                <svg class="fee-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2.5" style="transition:transform .2s;color:var(--t3);transform:rotate(-90deg)">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
                <span style="background:rgba(139,92,246,.15);color:#8b5cf6;font-size:10px;
                             font-weight:700;padding:1px 7px;border-radius:10px">${discAbbr}</span>
                <span style="font-size:12.5px;font-weight:600;color:var(--t1)">${discName}</span>
                ${canDelete ? `<button class="reg-bulk-del-btn" data-ids="${discAllIds}" data-label="${discName}"
                  style="${_ab(true)};margin-left:auto" title="Delete all fees for ${discName}">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
                  </svg></button>` : ''}
              </div>
              <div id="${discNodeId}" style="padding-left:8px;margin-top:2px;display:none">`;

          Object.entries(lvlMap).forEach(([lvlId, cell], li) => {
            const lvl        = levels.find(l => l.id === lvlId);
            const lvlName    = lvl ? lvl.levelName : 'All Levels';
            const activeRecs = cell.active   || [];
            const schedRecs  = cell.scheduled || [];
            const totalRows  = activeRecs.length + schedRecs.length;

            const renderRow = (r, isScheduled) => {
              const today = new Date(); today.setHours(0,0,0,0);
              const from  = r.effectiveFrom ? new Date(r.effectiveFrom) : null;
              const to    = r.effectiveTo   ? new Date(r.effectiveTo)   : null;
              if (from) from.setHours(0,0,0,0);
              if (to)   to.setHours(0,0,0,0);

              let status, statusColor, statusBg;
              if (isScheduled) {
                status = 'Scheduled'; statusColor = '#f59e0b'; statusBg = 'rgba(245,158,11,.1)';
              } else {
                status = 'Active'; statusColor = '#10b981'; statusBg = 'rgba(16,185,129,.1)';
                if (from && from > today) { status = 'Upcoming'; statusColor = '#f59e0b'; statusBg = 'rgba(245,158,11,.1)'; }
                if (to   && to   < today) { status = 'Expired';  statusColor = '#ef4444'; statusBg = 'rgba(239,68,68,.1)'; }
              }

              const rowBg = isScheduled ? 'background:rgba(245,158,11,.03)' : '';

              return `
                <tr style="border-top:1px solid var(--border);${rowBg}">
                  <td style="${_td()};font-size:13.5px;font-weight:700;color:var(--t1)">
                    ${sym(r.currency)} ${Number(r.amount||0).toLocaleString()}
                    ${isScheduled ? `<div style="font-size:10px;font-weight:500;color:#f59e0b;margin-top:1px">
                      applies ${r._schedEffectiveDate}</div>` : ''}
                  </td>
                  <td style="${_td('center')}">
                    <span style="font-size:11.5px;font-weight:600;color:var(--t2);
                                 background:var(--surface3);padding:2px 8px;border-radius:5px;
                                 border:1px solid var(--border)">${r.currency || 'PKR'}</span>
                  </td>
                  <td style="${_td('center')};font-size:12px;color:var(--t2)">
                    ${r.effectiveFrom || '—'}
                  </td>
                  <td style="${_td('center')};font-size:12px;color:var(--t2)">
                    ${r.effectiveTo || '—'}
                  </td>
                  <td style="${_td('center')}">
                    <span style="font-size:10.5px;font-weight:700;padding:2px 9px;border-radius:10px;
                                 background:${statusBg};color:${statusColor};border:1px solid ${statusColor}40">
                      ${status}
                    </span>
                  </td>
                  ${canEdit || canDelete ? `
                  <td style="${_td('center')}">
                    <div style="display:flex;align-items:center;justify-content:center;gap:5px">
                      ${isScheduled ? `
                        ${canEdit   ? `<button class="reg-sched-edit-btn" data-idx="${r._schedIdx}" style="${_ab()}" title="Edit scheduled">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg></button>` : ''}
                        ${canDelete ? `<button class="reg-sched-del-btn" data-idx="${r._schedIdx}" style="${_ab(true)}" title="Delete scheduled">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
                          </svg></button>` : ''}
                      ` : `
                        ${canEdit   ? `<button class="reg-edit-btn" data-id="${r.id}" style="${_ab()}" title="Edit">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg></button>` : ''}
                        ${canDelete ? `<button class="reg-del-btn" data-id="${r.id}" style="${_ab(true)}" title="Delete">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
                          </svg></button>` : ''}
                      `}
                    </div>
                  </td>` : ''}
                </tr>`;
            };

            html += `
              <div style="margin-bottom:6px">
                <div style="display:flex;align-items:center;gap:6px;padding:5px 10px;
                            background:var(--surface3);border:1px solid var(--border);
                            border-radius:6px;margin-bottom:3px">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                  </svg>
                  <span style="font-size:12px;font-weight:600;color:var(--t2)">${lvlName}</span>
                  ${schedRecs.length > 0 ? `<span style="margin-left:auto;font-size:10px;font-weight:700;
                    padding:1px 7px;border-radius:10px;background:rgba(245,158,11,.12);color:#f59e0b;
                    border:1px solid rgba(245,158,11,.3)">+${schedRecs.length} scheduled</span>` : ''}
                </div>
                <table style="width:100%;border-collapse:collapse;border:1px solid var(--border);
                              overflow:hidden;border-radius:7px;margin-bottom:2px">
                  <thead>
                    <tr style="background:var(--surface2)">
                      <th style="${_th()}">Amount</th>
                      <th style="${_th('center')}">Currency</th>
                      <th style="${_th('center')}">Effective From</th>
                      <th style="${_th('center')}">Effective To</th>
                      <th style="${_th('center')}">Status</th>
                      ${canEdit || canDelete ? `<th style="${_th('center')};width:70px">Actions</th>` : ''}
                    </tr>
                  </thead>
                  <tbody>
                    ${activeRecs.map(r => renderRow(r, false)).join('')}
                    ${schedRecs.map(r  => renderRow(r, true)).join('')}
                  </tbody>
                </table>
              </div>`;
          });

          html += `</div></div>`;
        });

        html += `</div></div>`;
      });

      html += `</div></div>`;
    });

    // Scheduled entries are now shown inline within each level's table above

    listEl.innerHTML = html;
    this._wireList(listEl, el);
  },

  _wireList(listEl, container) {
    // Accordion toggle
    listEl.querySelectorAll('.fee-hdr').forEach(hdr => {
      hdr.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        const body    = document.getElementById(hdr.dataset.target);
        const chevron = hdr.querySelector('.fee-chevron');
        if (!body) return;
        const isOpen = body.style.display !== 'none';
        body.style.display      = isOpen ? 'none' : '';
        chevron.style.transform = isOpen ? 'rotate(-90deg)' : '';
      });
    });

    // Bulk delete (institute / campus / discipline level)
    listEl.querySelectorAll('.reg-bulk-del-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const ids   = (btn.dataset.ids || '').split(',').filter(Boolean);
        const label = btn.dataset.label || 'this group';
        if (!ids.length) return;
        const ok = await Modal.confirm({
          title: '⚠️ Delete All Fees',
          message: `<p style="margin:0">Delete all registration fees under <strong>${label}</strong>?<br>This cannot be undone.</p>`,
          confirmLabel: 'Yes, Delete All', danger: true,
        });
        if (!ok) return;
        ids.forEach(id => AppState.remove(REG_KEY, id));
        Toast.success(`Deleted all fees under "${label}".`);
        this._render(container);
      });
    });

    // Edit buttons
    listEl.querySelectorAll('.reg-edit-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const rec = (AppState.get(REG_KEY) || []).find(r => r.id === btn.dataset.id);
        if (rec) this._openForm(rec, container);
      });
    });

    // Delete buttons
    listEl.querySelectorAll('.reg-del-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const rec = (AppState.get(REG_KEY) || []).find(r => r.id === btn.dataset.id);
        if (!rec) return;
        const ok = await Modal.confirm({
          title: '⚠️ Delete Registration Fee',
          message: `<p style="margin:0">Are you sure you want to delete this registration fee entry? This action cannot be undone.</p>`,
          confirmLabel: 'Yes, Delete', danger: true,
        });
        if (!ok) return;
        AppState.remove(REG_KEY, rec.id);
        Toast.success('Registration fee deleted.');
        this._render(container);
      });
    });

    // Scheduled: edit
    listEl.querySelectorAll('.reg-sched-edit-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        const scheduled = _schedLoad() || [];
        if (scheduled[idx]) this._openForm(null, container, scheduled[idx], idx);
      });
    });

    // Scheduled: delete
    listEl.querySelectorAll('.reg-sched-del-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        const ok = await Modal.confirm({
          title: '⚠️ Delete Scheduled Change',
          message: `<p style="margin:0">Remove this scheduled future fee change?</p>`,
          confirmLabel: 'Yes, Remove', danger: true,
        });
        if (!ok) return;
        const scheduled = _schedLoad() || [];
        scheduled.splice(idx, 1);
        _schedSave(scheduled);
        Toast.success('Scheduled change removed.');
        this._render(container);
      });
    });
  },

  _attachToolbar(container) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;

    el.querySelector('#regAddBtn')?.addEventListener('click', () => {
      if (!Auth.can('fee:create')) return Toast.warning('Permission denied.');
      this._openForm(null, el);
    });

    el.querySelector('#regSearchInput')?.addEventListener('input', () => {
      this._render(el);
    });
  },

  // ── Main Add/Edit Form ─────────────────────────────────────
  _openForm(existing = null, container, schedExisting = null, schedIdx = null) {
    const isEdit  = !!existing;
    const isSched = schedExisting !== null;

    const institutes  = AppState.get('institutes')  || [];
    const campuses    = AppState.get('campuses')    || [];
    const disciplines = AppState.get('disciplines') || [];
    const levels      = AppState.get('levels')      || [];

    const pre = existing || (schedExisting?.entries?.[0]) || {};

    const currOpts = (sel = 'PKR') => CURRENCIES.map(c =>
      `<option value="${c.code}" ${c.code === sel ? 'selected' : ''}>${c.symbol} — ${c.code}</option>`
    ).join('');

    // Build discipline→levels map
    const discLevelMap = {};
    disciplines.forEach(d => {
      discLevelMap[d.id] = levels.filter(l => l.disciplineId === d.id);
    });

    // Section builder helper
    const sectionHdr = (accId, iconSvg, color, label) => `
      <div style="display:flex;align-items:center;gap:8px;padding:9px 13px;
                  background:var(--surface2);border-bottom:1px solid var(--border);
                  cursor:pointer;user-select:none" data-acc="${accId}">
        <svg class="rg-chevron" width="11" height="11" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.5"
             style="transition:transform .2s;flex-shrink:0">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
        ${iconSvg}
        <span style="font-size:12px;font-weight:700;color:var(--t1)">${label}</span>
        <span class="rg-cnt-${accId}" style="margin-left:auto;font-size:10.5px;color:var(--t3)"></span>
      </div>`;

    const cbItem = (name, value, label, accentColor, extraHtml = '') => `
      <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;
                    padding:5px 10px;border-radius:6px;border:1px solid var(--border);
                    background:var(--surface1);font-size:12px;color:var(--t1);
                    transition:border-color .12s,background .12s"
             onmouseover="this.style.borderColor='${accentColor}40'"
             onmouseout="this.style.borderColor='var(--border-color, #e5e7eb)'">
        <input type="checkbox" name="${name}" value="${value}" checked
               style="accent-color:${accentColor};width:13px;height:13px;flex-shrink:0"/>
        ${extraHtml}${label}
      </label>`;

    // Disciplines grouped under their levels for the Applicable To section
    const discWithLevels = disciplines.map(d => ({
      d,
      lvls: discLevelMap[d.id] || []
    }));

    Modal.open({
      title: isSched ? '🕐 Schedule Future Fee Change'
           : isEdit  ? 'Edit Registration Fee'
           :           'Add Registration Fee',
      size: 'xl',
      width: '800px',
      scrollable: true,
      bodyStyle: 'max-height:84vh;overflow-y:auto',

      body: `
        <style>
          .rg-card {
            border:1px solid var(--border);
            border-radius:10px;
            overflow:hidden;
            margin-bottom:14px;
          }
          .rg-card-hdr {
            display:flex;
            align-items:center;
            gap:8px;
            padding:9px 13px;
            background:var(--surface2);
            border-bottom:1px solid var(--border);
            font-size:11px;
            font-weight:700;
            color:var(--t3);
            text-transform:uppercase;
            letter-spacing:.05em;
          }
          .rg-card-body { padding:14px; }
          .rg-acc-body {
            overflow:hidden;
            max-height:0;
            opacity:0;
            transition:max-height .3s cubic-bezier(.4,0,.2,1), opacity .2s ease;
          }
          .rg-acc-body.open { max-height:800px; opacity:1; }
          .rg-chevron.open  { transform:rotate(0deg) !important; }
          .rg-chips { display:flex;flex-wrap:wrap;gap:6px;padding:12px; }
          .rg-disc-group { padding:10px 12px 6px;border-top:1px solid var(--border); }
          .rg-disc-group:first-child { border-top:none; }
          .rg-disc-lbl {
            display:inline-flex;align-items:center;gap:5px;
            font-size:11px;font-weight:700;color:var(--t2);
            margin-bottom:6px;
          }
        </style>

        <!-- ① Fee Amount Card -->
        <div class="rg-card">
          <div class="rg-card-hdr">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2">
              <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
            </svg>
            Registration Fee Amount
          </div>
          <div class="rg-card-body">
            <div style="display:grid;grid-template-columns:1fr 170px;gap:12px;align-items:end">
              <div class="form-group" style="margin:0">
                <label class="form-label">Amount <span class="req">*</span></label>
                <input id="rg_amount" type="number" min="0" step="1" class="form-input"
                       value="${pre.amount ?? ''}" placeholder="0"
                       style="font-size:18px;font-weight:700;letter-spacing:.02em"/>
              </div>
              <div class="form-group" style="margin:0">
                <label class="form-label">Currency</label>
                <select id="rg_currency" class="form-select form-input">${currOpts(pre.currency || 'PKR')}</select>
              </div>
            </div>
          </div>
        </div>

        <!-- ② Effective Period Card -->
        <div class="rg-card">
          <div class="rg-card-hdr">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4f85f7" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Effective Period
          </div>
          <div class="rg-card-body">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div class="form-group" style="margin:0">
                <label class="form-label">Effective From</label>
                <input id="rg_from" type="date" class="form-input" value="${pre.effectiveFrom || ''}"/>
              </div>
              <div class="form-group" style="margin:0">
                <label class="form-label">Effective To
                  <span style="font-weight:400;color:var(--t3);font-size:10.5px">(optional)</span>
                </label>
                <input id="rg_to" type="date" class="form-input" value="${pre.effectiveTo || ''}"/>
              </div>
            </div>
          </div>
        </div>

        <!-- ③ Schedule Future Change Card -->
        <div class="rg-card" style="border-color:${isSched ? '#f59e0b60' : 'var(--border)'}">
          <div class="rg-card-hdr" style="${isSched ? 'background:rgba(245,158,11,.07)' : ''}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:0;font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em">
              <input type="checkbox" id="rg_is_future" ${isSched ? 'checked' : ''}
                     style="accent-color:#f59e0b;width:13px;height:13px"/>
              Schedule as Future Change
            </label>
            <span style="font-weight:400;font-size:10.5px;color:var(--t3);text-transform:none;letter-spacing:0;margin-left:4px">
              — auto-apply on a set date
            </span>
          </div>
          <div id="rg_future_panel" class="rg-card-body" style="${isSched ? '' : 'display:none'}">
            <div class="form-group" style="margin:0;max-width:260px">
              <label class="form-label">Auto-Apply Date <span class="req">*</span></label>
              <input id="rg_effective_date" type="date" class="form-input"
                     value="${schedExisting?.effectiveDate || ''}"
                     style="border-color:#f59e0b80"/>
              <p style="font-size:11px;color:var(--t3);margin:5px 0 0;line-height:1.5">
                On this date, this fee will automatically replace matching existing entries.
              </p>
            </div>
          </div>
        </div>

        <!-- ④ Applicable To Card -->
        <div class="rg-card">
          <div class="rg-card-hdr" style="justify-content:space-between">
            <div style="display:flex;align-items:center;gap:8px">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              Applicable To
            </div>
            <div style="display:flex;gap:10px">
              <button type="button" id="rg_sel_all"
                      style="font-size:11px;font-weight:600;color:#4f85f7;background:none;
                             border:none;cursor:pointer;padding:0;text-transform:none">
                ✓ Select All
              </button>
              <button type="button" id="rg_desel_all"
                      style="font-size:11px;font-weight:600;color:var(--t3);background:none;
                             border:none;cursor:pointer;padding:0;text-transform:none">
                ✕ Deselect All
              </button>
            </div>
          </div>

          <!-- Institutes -->
          <div style="border-bottom:1px solid var(--border)">
            ${sectionHdr('rg_inst_body',
              `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4f85f7" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
              '#4f85f7', 'Institutes')}
            <div class="rg-acc-body open" id="rg_inst_body">
              <div class="rg-chips">
                ${institutes.map(i => cbItem('rg_inst', i.id, i.instituteName, '#4f85f7')).join('')}
              </div>
            </div>
          </div>

          <!-- Campuses -->
          <div style="border-bottom:1px solid var(--border)">
            ${sectionHdr('rg_camp_body',
              `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`,
              '#06b6d4', 'Campuses')}
            <div class="rg-acc-body open" id="rg_camp_body">
              <div class="rg-chips">
                ${campuses.map(c => cbItem('rg_camp', c.id, c.campusName, '#06b6d4')).join('')}
              </div>
            </div>
          </div>

          <!-- Disciplines + their Levels grouped -->
          <div>
            ${sectionHdr('rg_disc_body',
              `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg>`,
              '#8b5cf6', 'Disciplines &amp; Levels')}
            <div class="rg-acc-body open" id="rg_disc_body">
              ${discWithLevels.map(({ d, lvls }) => `
                <div class="rg-disc-group">
                  <div class="rg-disc-lbl">
                    <input type="checkbox" name="rg_disc" value="${d.id}" checked
                           style="accent-color:#8b5cf6;width:13px;height:13px"
                           id="rg_disc_${d.id}"/>
                    <span style="background:rgba(139,92,246,.15);color:#8b5cf6;
                                 padding:1px 7px;border-radius:10px;font-size:10px">${d.abbreviation}</span>
                    <label for="rg_disc_${d.id}" style="cursor:pointer;color:var(--t1)">${d.fullName}</label>
                  </div>
                  ${lvls.length ? `
                  <div class="rg-chips" style="padding:4px 0 4px 20px;gap:5px"
                       id="rg_lvls_of_${d.id}">
                    ${lvls.map(l => cbItem('rg_lvl', l.id, l.levelName, '#f59e0b',
                        `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" style="flex-shrink:0"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`
                      )).join('')}
                  </div>` : `<p style="font-size:11px;color:var(--t3);margin:0 0 4px 20px">No levels defined</p>`}
                </div>`).join('')}
            </div>
          </div>
        </div>
      `,

      onOpen: (modalEl) => {
        const box = modalEl.querySelector('.modal-box') || modalEl.closest('.modal-box') || modalEl;
        if (box) box.style.maxWidth = '800px';

        // If editing single record, pre-check only its scope
        if (isEdit) {
          modalEl.querySelectorAll('input[name="rg_inst"],input[name="rg_camp"],input[name="rg_disc"],input[name="rg_lvl"]')
            .forEach(cb => { cb.checked = false; });
          if (existing.instituteId)  modalEl.querySelector(`input[name="rg_inst"][value="${existing.instituteId}"]`)  && (modalEl.querySelector(`input[name="rg_inst"][value="${existing.instituteId}"]`).checked = true);
          if (existing.campusId)     modalEl.querySelector(`input[name="rg_camp"][value="${existing.campusId}"]`)     && (modalEl.querySelector(`input[name="rg_camp"][value="${existing.campusId}"]`).checked = true);
          if (existing.disciplineId) modalEl.querySelector(`input[name="rg_disc"][value="${existing.disciplineId}"]`) && (modalEl.querySelector(`input[name="rg_disc"][value="${existing.disciplineId}"]`).checked = true);
          if (existing.levelId)      modalEl.querySelector(`input[name="rg_lvl"][value="${existing.levelId}"]`)       && (modalEl.querySelector(`input[name="rg_lvl"][value="${existing.levelId}"]`).checked = true);
        }

        if (isSched && schedExisting?.entries?.length) {
          const instIds = [...new Set(schedExisting.entries.map(e => e.instituteId).filter(Boolean))];
          const campIds = [...new Set(schedExisting.entries.map(e => e.campusId).filter(Boolean))];
          const discIds = [...new Set(schedExisting.entries.map(e => e.disciplineId).filter(Boolean))];
          const lvlIds  = [...new Set(schedExisting.entries.map(e => e.levelId).filter(Boolean))];
          modalEl.querySelectorAll('input[name="rg_inst"]').forEach(cb => { cb.checked = !instIds.length || instIds.includes(cb.value); });
          modalEl.querySelectorAll('input[name="rg_camp"]').forEach(cb => { cb.checked = !campIds.length || campIds.includes(cb.value); });
          modalEl.querySelectorAll('input[name="rg_disc"]').forEach(cb => { cb.checked = !discIds.length || discIds.includes(cb.value); });
          modalEl.querySelectorAll('input[name="rg_lvl"]') .forEach(cb => { cb.checked = !lvlIds.length  || lvlIds.includes(cb.value); });
        }

        // Discipline checkbox toggles its levels
        modalEl.querySelectorAll('input[name="rg_disc"]').forEach(cb => {
          const lvlWrap = modalEl.querySelector(`#rg_lvls_of_${cb.value}`);
          const syncLvls = () => {
            if (lvlWrap) lvlWrap.querySelectorAll('input[name="rg_lvl"]')
              .forEach(lc => { lc.checked = cb.checked; lc.disabled = !cb.checked; });
          };
          syncLvls();
          cb.addEventListener('change', () => { syncLvls(); updateCounts(); });
        });

        // Count badges
        const updateCounts = () => {
          [['rg_inst','rg_inst_body'],['rg_camp','rg_camp_body'],['rg_disc','rg_disc_body']].forEach(([name, accId]) => {
            const all     = modalEl.querySelectorAll(`input[name="${name}"]`);
            const checked = [...all].filter(c => c.checked).length;
            const span = modalEl.querySelector(`.rg-cnt-${accId}`);
            if (span) span.textContent = `${checked}/${all.length}`;
          });
        };
        updateCounts();
        modalEl.querySelectorAll('input[name^="rg_"]').forEach(cb => cb.addEventListener('change', updateCounts));

        // Accordion section headers
        modalEl.querySelectorAll('[data-acc]').forEach(hdr => {
          hdr.addEventListener('click', e => {
            if (e.target.closest('input,button,label')) return;
            const body    = modalEl.querySelector(`#${hdr.dataset.acc}`);
            const chevron = hdr.querySelector('.rg-chevron');
            if (!body) return;
            const isOpen = body.classList.contains('open');
            body.classList.toggle('open', !isOpen);
            if (chevron) chevron.style.transform = isOpen ? 'rotate(-90deg)' : 'rotate(0deg)';
          });
        });

        // Select / Deselect all
        modalEl.querySelector('#rg_sel_all')?.addEventListener('click', () => {
          modalEl.querySelectorAll('input[name="rg_inst"],input[name="rg_camp"],input[name="rg_disc"],input[name="rg_lvl"]')
            .forEach(cb => { cb.checked = true; cb.disabled = false; });
          updateCounts();
        });
        modalEl.querySelector('#rg_desel_all')?.addEventListener('click', () => {
          modalEl.querySelectorAll('input[name="rg_inst"],input[name="rg_camp"],input[name="rg_disc"],input[name="rg_lvl"]')
            .forEach(cb => { cb.checked = false; });
          updateCounts();
        });

        // Future toggle
        modalEl.querySelector('#rg_is_future')?.addEventListener('change', (e) => {
          modalEl.querySelector('#rg_future_panel').style.display = e.target.checked ? '' : 'none';
        });
      },

      actions: [
        { label: 'Cancel', variant: 'ghost' },
        {
          label: isEdit ? 'Save Changes' : isSched ? 'Update Schedule' : 'Save',
          variant: 'primary', close: false,
          handler: (modalEl) => {
            const amount   = modalEl.querySelector('#rg_amount')?.value?.trim();
            const currency = modalEl.querySelector('#rg_currency')?.value || 'PKR';
            const fromDate = modalEl.querySelector('#rg_from')?.value  || '';
            const toDate   = modalEl.querySelector('#rg_to')?.value    || '';
            const isFuture = modalEl.querySelector('#rg_is_future')?.checked;
            const effDate  = modalEl.querySelector('#rg_effective_date')?.value || '';

            if (!amount || isNaN(Number(amount)) || Number(amount) < 0)
              return Toast.warning('Please enter a valid fee amount.');

            const selInsts = [...modalEl.querySelectorAll('input[name="rg_inst"]:checked')].map(c => c.value);
            const selCamps = [...modalEl.querySelectorAll('input[name="rg_camp"]:checked')].map(c => c.value);
            const selDiscs = [...modalEl.querySelectorAll('input[name="rg_disc"]:checked')].map(c => c.value);
            const selLvls  = [...modalEl.querySelectorAll('input[name="rg_lvl"]:checked:not(:disabled)')].map(c => c.value);

            if (!selCamps.length)  return Toast.warning('Please select at least one campus.');
            if (!selDiscs.length)  return Toast.warning('Please select at least one discipline.');
            if (!selLvls.length)   return Toast.warning('Please select at least one level.');

            if (isFuture) {
              if (!effDate) return Toast.warning('Please set the auto-apply date.');
              const today = new Date(); today.setHours(0,0,0,0);
              const eDate = new Date(effDate); eDate.setHours(0,0,0,0);
              if (eDate <= today) return Toast.warning('Scheduled date must be in the future.');
              const entries = _buildEntries({ amount: Number(amount), currency, effectiveFrom: fromDate,
                effectiveTo: toDate, selInsts, selCamps, selDiscs, selLvls });
              const scheduled = _schedLoad() || [];
              if (isSched && schedIdx !== null) scheduled[schedIdx] = { effectiveDate: effDate, entries };
              else scheduled.push({ effectiveDate: effDate, entries });
              _schedSave(scheduled);
              Toast.success('Scheduled change saved. Auto-applies on ' + effDate + '.');
              Modal.closeAll();
              this._render(container);
              return;
            }

            if (isEdit) {
              AppState.update(REG_KEY, existing.id, {
                amount: Number(amount), currency,
                effectiveFrom: fromDate, effectiveTo: toDate,
                instituteId:  selInsts[0]  || existing.instituteId,
                campusId:     selCamps[0]  || existing.campusId,
                disciplineId: selDiscs[0]  || existing.disciplineId,
                levelId:      selLvls[0]   || existing.levelId,
              });
              Toast.success('Registration fee updated.');
            } else {
              const entries = _buildEntries({ amount: Number(amount), currency, effectiveFrom: fromDate,
                effectiveTo: toDate, selInsts, selCamps, selDiscs, selLvls });
              _regSaveEntries(entries, false, null);
              Toast.success(`Saved for ${entries.length} combination${entries.length !== 1 ? 's' : ''}.`);
            }

            Modal.closeAll();
            this._render(container);
          }
        }
      ]
    });
  },
};

// ── Helpers ───────────────────────────────────────────────────

// Build entries — each level is only paired with its own discipline
function _buildEntries({ amount, currency, effectiveFrom, effectiveTo, selInsts, selCamps, selDiscs, selLvls }) {
  const entries  = [];
  const allLevels = AppState.get('levels') || [];
  const useInsts  = selInsts.length ? selInsts : [null];

  selCamps.forEach(campId => {
    selDiscs.forEach(discId => {
      // Only use levels that (a) are selected AND (b) belong to this discipline
      const discLvls = allLevels.filter(l => l.disciplineId === discId && selLvls.includes(l.id));
      // If no levels match this discipline, still save one record with levelId=null
      const lvlsToUse = discLvls.length ? discLvls.map(l => l.id) : [null];
      lvlsToUse.forEach(lvlId => {
        useInsts.forEach(instId => {
          entries.push({ amount, currency, effectiveFrom, effectiveTo,
            instituteId: instId, campusId: campId, disciplineId: discId, levelId: lvlId });
        });
      });
    });
  });
  return entries;
}

// Save entries — ONE active record per level (campus+discipline+level combo).
// If a matching record exists, it is replaced. Scheduled future changes are stored
// separately via _schedSave and do NOT count as a second active record.
function _regSaveEntries(entries, isEdit, editId) {
  // Refresh 'all' inside the loop to pick up updates from prior iterations
  entries.forEach(entry => {
    if (isEdit && editId) {
      AppState.update(REG_KEY, editId, entry);
      return;
    }
    const all = AppState.get(REG_KEY) || [];
    // Find existing matching record (same campus + discipline + level)
    const match = all.find(r =>
      r.campusId     === entry.campusId     &&
      r.disciplineId === entry.disciplineId &&
      r.levelId      === entry.levelId
    );
    if (match) {
      AppState.update(REG_KEY, match.id, entry);
    } else {
      AppState.add(REG_KEY, { ...entry, id: generateID('reg') });
    }
  });
}

// ============================================================
// ChallanDueModule — Challan Due Days & Bank Working Days
// ============================================================

const CHALLAN_DUE_KEY = 'challanDueSettings';

const DAYS_OF_WEEK = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

function _loadChallanDue() {
  return AppState.get(CHALLAN_DUE_KEY) || {
    dueDays: 15,
    bankWorkingDays: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
  };
}

function _saveChallanDue(data) {
  AppState.set(CHALLAN_DUE_KEY, data);
}

export const ChallanDueModule = {

  mount(container) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    this._el = el;
    this._render();
  },

  _render() {
    const el  = this._el;
    const cfg = _loadChallanDue();

    el.innerHTML = `
      <div style="max-width:560px;margin:0 auto;">

        <!-- Card: Challan Due Days -->
        <div style="background:var(--surface);border:1px solid var(--border2);border-radius:var(--r-lg);
                    overflow:hidden;margin-bottom:18px">
          <div style="padding:14px 20px;border-bottom:1px solid var(--border2);
                      display:flex;align-items:center;gap:10px">
            <span style="display:flex;align-items:center;justify-content:center;
                         width:32px;height:32px;border-radius:8px;
                         background:rgba(37,99,235,.1);flex-shrink:0">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </span>
            <div>
              <div style="font-size:14px;font-weight:700;color:var(--t1)">Challan Due Days</div>
              <div style="font-size:12px;color:var(--t3);margin-top:1px">
                Number of days after admission to set challan due date
              </div>
            </div>
          </div>
          <div style="padding:20px">
            <div style="display:flex;align-items:center;gap:14px">
              <div style="display:flex;flex-direction:column;gap:5px;flex:1;max-width:200px">
                <label style="font-size:11.5px;font-weight:600;color:var(--t2);
                               text-transform:uppercase;letter-spacing:.05em">
                  Due Days <span style="color:var(--red)">*</span>
                </label>
                <div style="display:flex;align-items:center;gap:8px">
                  <input id="cd-due-days" type="number" min="1" max="365"
                    value="${cfg.dueDays || 15}"
                    style="width:90px;background:var(--surface2);border:1px solid var(--border2);
                           border-radius:var(--r-sm);color:var(--t1);font-size:18px;font-weight:700;
                           padding:8px 12px;outline:none;font-family:inherit;
                           text-align:center;transition:border-color .15s">
                  <span style="font-size:13px;color:var(--t3);font-weight:500">days after admission</span>
                </div>
              </div>

              <!-- Visual badge -->
              <div style="display:flex;align-items:center;gap:6px;padding:10px 16px;
                          background:rgba(37,99,235,.06);border:1px solid rgba(37,99,235,.15);
                          border-radius:10px;margin-left:auto">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2">
                  <rect x="3" y="4" width="18" height="18" rx="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <span id="cd-due-preview" style="font-size:12.5px;font-weight:700;color:#2563eb">
                  Due: Day ${cfg.dueDays || 15}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Card: Bank Working Days -->
        <div style="background:var(--surface);border:1px solid var(--border2);border-radius:var(--r-lg);
                    overflow:hidden;margin-bottom:18px">
          <div style="padding:14px 20px;border-bottom:1px solid var(--border2);
                      display:flex;align-items:center;gap:10px">
            <span style="display:flex;align-items:center;justify-content:center;
                         width:32px;height:32px;border-radius:8px;
                         background:rgba(16,185,129,.1);flex-shrink:0">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2">
                <rect x="2" y="7" width="20" height="14" rx="2"/>
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
              </svg>
            </span>
            <div>
              <div style="font-size:14px;font-weight:700;color:var(--t1)">Bank Working Days</div>
              <div style="font-size:12px;color:var(--t3);margin-top:1px">
                Select the days on which the bank accepts challan payments
              </div>
            </div>
          </div>
          <div style="padding:20px">
            <div style="display:flex;gap:8px;flex-wrap:wrap" id="cd-days-wrap">
              ${DAYS_OF_WEEK.map(d => {
                const checked = cfg.bankWorkingDays?.[d.key] !== false &&
                                (cfg.bankWorkingDays?.[d.key] === true ||
                                 ['mon','tue','wed','thu','fri'].includes(d.key));
                const isWeekend = d.key === 'sat' || d.key === 'sun';
                return `
                  <label id="cd-lbl-${d.key}"
                    style="display:flex;flex-direction:column;align-items:center;gap:6px;
                           cursor:pointer;padding:12px 10px;border-radius:10px;min-width:54px;
                           border:2px solid ${checked ? '#10b981' : 'var(--border2)'};
                           background:${checked ? 'rgba(16,185,129,.07)' : 'var(--surface2)'};
                           transition:all .15s;user-select:none">
                    <input type="checkbox" id="cd-day-${d.key}" value="${d.key}"
                      ${checked ? 'checked' : ''}
                      style="display:none">
                    <span style="font-size:12px;font-weight:700;
                                 color:${checked ? '#10b981' : isWeekend ? 'var(--red)' : 'var(--t2)'}">
                      ${d.label}
                    </span>
                    <span style="width:20px;height:20px;border-radius:50%;border:2px solid ${checked ? '#10b981' : 'var(--border2)'};
                                 background:${checked ? '#10b981' : 'transparent'};
                                 display:flex;align-items:center;justify-content:center;transition:all .15s">
                      ${checked ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
                    </span>
                  </label>`;
              }).join('')}
            </div>

            <!-- Working days summary -->
            <div style="margin-top:14px;padding:10px 14px;background:var(--surface2);
                        border-radius:8px;border:1px solid var(--border2);
                        display:flex;align-items:center;gap:8px">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span id="cd-days-summary" style="font-size:12px;color:var(--t2)">
                ${_workingDaysSummary(cfg.bankWorkingDays)}
              </span>
            </div>
          </div>
        </div>

        <!-- Save Button -->
        <div style="display:flex;justify-content:flex-end;gap:10px">
          <button id="cd-save-btn"
            style="display:inline-flex;align-items:center;gap:8px;padding:10px 22px;
                   background:#2563eb;color:#fff;border:none;border-radius:var(--r-sm);
                   font-size:13.5px;font-weight:700;cursor:pointer;transition:opacity .15s">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Save Settings
          </button>
        </div>

      </div>`;

    this._wire(el, cfg);
  },

  _wire(el, cfg) {
    const dueDaysInput = el.querySelector('#cd-due-days');
    const duePreview   = el.querySelector('#cd-due-preview');

    // Live preview update
    dueDaysInput?.addEventListener('input', () => {
      const v = parseInt(dueDaysInput.value) || 15;
      if (duePreview) duePreview.textContent = `Due: Day ${v}`;
    });

    // Day checkboxes — toggle styling
    DAYS_OF_WEEK.forEach(d => {
      const lbl = el.querySelector(`#cd-lbl-${d.key}`);
      const chk = el.querySelector(`#cd-day-${d.key}`);
      if (!lbl || !chk) return;
      lbl.addEventListener('click', () => {
        chk.checked = !chk.checked;
        const isChecked = chk.checked;
        const isWeekend = d.key === 'sat' || d.key === 'sun';
        lbl.style.border        = `2px solid ${isChecked ? '#10b981' : 'var(--border2)'}`;
        lbl.style.background    = isChecked ? 'rgba(16,185,129,.07)' : 'var(--surface2)';
        const dayLabel = lbl.querySelector('span:first-of-type');
        const circle   = lbl.querySelector('span:last-of-type');
        if (dayLabel) dayLabel.style.color = isChecked ? '#10b981' : isWeekend ? 'var(--red)' : 'var(--t2)';
        if (circle) {
          circle.style.borderColor = isChecked ? '#10b981' : 'var(--border2)';
          circle.style.background  = isChecked ? '#10b981' : 'transparent';
          circle.innerHTML = isChecked
            ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`
            : '';
        }
        // Update summary
        const currentDays = _getCheckedDays(el);
        const summary = el.querySelector('#cd-days-summary');
        if (summary) summary.textContent = _workingDaysSummary(currentDays);
      });
    });

    // Save
    el.querySelector('#cd-save-btn')?.addEventListener('click', () => {
      const dueDays = parseInt(dueDaysInput?.value) || 15;
      if (dueDays < 1 || dueDays > 365) {
        Toast.warning('Please enter a valid number of due days (1–365).');
        return;
      }
      const bankWorkingDays = _getCheckedDays(el);
      const checkedCount = Object.values(bankWorkingDays).filter(Boolean).length;
      if (checkedCount === 0) {
        Toast.warning('Please select at least one bank working day.');
        return;
      }
      _saveChallanDue({ dueDays, bankWorkingDays });
      Toast.success('Challan due settings saved successfully.');
    });
  },
};

// ── Helpers ───────────────────────────────────────────────────

function _getCheckedDays(el) {
  const result = {};
  DAYS_OF_WEEK.forEach(d => {
    const chk = el.querySelector(`#cd-day-${d.key}`);
    result[d.key] = chk ? chk.checked : false;
  });
  return result;
}

function _workingDaysSummary(days = {}) {
  const names = { mon:'Monday', tue:'Tuesday', wed:'Wednesday', thu:'Thursday',
                  fri:'Friday', sat:'Saturday', sun:'Sunday' };
  const active = DAYS_OF_WEEK.filter(d => days[d.key]).map(d => names[d.key]);
  if (!active.length) return 'No working days selected.';
  if (active.length === 7) return 'All 7 days — Mon to Sun';
  return `${active.length} working day${active.length > 1 ? 's' : ''}: ${active.join(', ')}`;
}
