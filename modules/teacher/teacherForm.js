// ============================================================
// modules/teacher/teacherForm.js — Teacher Add/Edit Form HTML
// Generates form body for Modal — called by teacherUI.js
// ============================================================

import { AppState } from '../../utils/state.js';
import { _avatarHTML } from './teacherUI.js';
import { getSelectableSubjects } from '../subjects.js';

/**
 * Render the full teacher form HTML
 * @param {Object|null} existing — null = add mode, object = edit mode
 * @returns {string} HTML string for Modal body
 */
export function renderTeacherForm(existing = null) {
  const disciplines      = AppState.get('disciplines') || [];
  const campuses         = AppState.get('campuses')    || [];
  const allLevels        = AppState.get('levels')      || [];

  const selDiscs  = existing?.disciplines     || [];
  const selCamps  = existing?.campuses        || [];
  const selSubs   = existing?.teachingSubjects || [];
  const hasPic    = !!existing?.profilePicture;

  // ── Profile picture section ────────────────────────────────
  const picSection = `
    <div class="form-group">
      <label class="form-label">Profile Picture</label>
      <div class="pic-upload-wrap">
        <div id="teacherPicPreview">
          ${hasPic
            ? `<img src="${existing.profilePicture}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:2px solid var(--blue)"/>`
            : _avatarHTML(null, existing?.fullName || 'T', 72)
          }
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <button type="button" id="teacherPicBtn" class="pic-upload-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Upload Photo
          </button>
          <span class="pic-upload-hint">JPG, PNG — max 2MB</span>
        </div>
        <input id="teacherPicInput" type="file" accept="image/jpeg,image/png,image/webp"
               style="display:none"/>
      </div>
    </div>
  `;

  // ── Disciplines multi-select ───────────────────────────────
  const discChips = disciplines.length
    ? disciplines.map(d => `
        <button type="button"
                class="ms-chip ${selDiscs.includes(d.id) ? 'ms-chip--selected' : ''}"
                data-disc-id="${d.id}">
          ${d.abbreviation} — ${d.fullName}
        </button>`
      ).join('')
    : `<span style="font-size:12.5px;color:var(--t3)">No disciplines found — add from Admin Panel first.</span>`;

  // ── Campuses multi-select ──────────────────────────────────
  const campChips = campuses.length
    ? campuses.map(c => `
        <button type="button"
                class="ms-chip ${selCamps.includes(c.id) ? 'ms-chip--selected' : ''}"
                data-camp-id="${c.id}">
          ${c.campusName}
        </button>`
      ).join('')
    : `<span style="font-size:12.5px;color:var(--t3)">No campuses found — add from Admin Panel first.</span>`;

  // ── Campus schedule builder ────────────────────────────────
  const DAYS = [
    { key: 'mon', label: 'Mon' },
    { key: 'tue', label: 'Tue' },
    { key: 'wed', label: 'Wed' },
    { key: 'thu', label: 'Thu' },
    { key: 'fri', label: 'Fri' },
    { key: 'sat', label: 'Sat' },
    { key: 'sun', label: 'Sun' },
  ];

  const campScheduleRows = campuses.map(c => {
    const isSelected = selCamps.includes(c.id);
    const saved      = existing?.campusSchedules?.[c.id] || {};
    const savedDays  = saved.workingDays || ['mon','tue','wed','thu','fri','sat'];
    const startTime  = saved.startTime   || '08:00';
    const endTime    = saved.endTime     || '16:00';

    const dayBtns = DAYS.map(d => `
      <button type="button"
              class="day-btn ${savedDays.includes(d.key) ? 'day-btn--on' : ''}"
              data-day="${d.key}"
              title="${d.label}">
        ${d.label}
      </button>`).join('');

    return `
      <div class="campus-schedule-row ${isSelected ? '' : 'campus-schedule-row--hidden'}"
           data-schedule-campus="${c.id}" id="sched-${c.id}">
        <div class="campus-schedule-header">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          <span>${c.campusName}</span>
        </div>
        <div class="campus-schedule-body">
          <div class="campus-schedule-days">
            <span class="campus-schedule-label">Working Days</span>
            <div class="day-btns-wrap">${dayBtns}</div>
          </div>
          <div class="campus-schedule-times">
            <div class="campus-time-field">
              <label class="campus-schedule-label">Start Time</label>
              <input type="time" class="form-input campus-time-input"
                     name="startTime_${c.id}"
                     value="${startTime}"
                     style="max-width:120px"/>
            </div>
            <div class="campus-time-field">
              <label class="campus-schedule-label">End Time</label>
              <input type="time" class="form-input campus-time-input"
                     name="endTime_${c.id}"
                     value="${endTime}"
                     style="max-width:120px"/>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');

  const scheduleSection = campuses.length ? `
    <div class="form-group" id="campusScheduleSection">
      <label class="form-label">
        Campus Schedule
        <span style="font-size:11px;font-weight:400;color:var(--t3);margin-left:6px">
          — working days &amp; hours per campus
        </span>
      </label>
      <div class="campus-schedules-wrap" id="campusSchedulesWrap">
        ${campScheduleRows}
      </div>
      <span class="form-hint">Select campus(es) above to configure their schedule.</span>
    </div>` : '';

  return `
    ${picSection}

    <!-- Name + Qualification -->
    <div class="form-row cols-2">
      <div class="form-group">
        <label class="form-label">Full Name <span class="req">*</span></label>
        <input name="fullName" class="form-input"
               placeholder="e.g. Dr. Ayesha Khan"
               value="${existing?.fullName || ''}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Qualification <span class="req">*</span></label>
        <input name="qualification" class="form-input"
               placeholder="e.g. PhD Computer Science"
               value="${existing?.qualification || ''}"/>
      </div>
    </div>

    <!-- Email + Contact -->
    <div class="form-row cols-2">
      <div class="form-group">
        <label class="form-label">Email <span class="req">*</span></label>
        <input name="email" class="form-input" type="email"
               placeholder="e.g. ayesha.khan@fast.edu.pk"
               value="${existing?.email || ''}"
               ${existing ? 'style="opacity:0.7" title="Clear this field to change the login email"' : ''}/>
        ${existing
          ? '<span class="form-hint">This email is used for login — you can change it.</span>'
          : '<span class="form-hint">This email will be used for login.</span>'
        }
      </div>
      <div class="form-group">
        <label class="form-label">Contact Number</label>
        <input name="contactNumber" class="form-input"
               placeholder="e.g. 0300-1234567"
               value="${existing?.contactNumber || ''}"/>
      </div>
    </div>

    <!-- Disciplines multi-select -->
    <div class="form-group">
      <label class="form-label">Disciplines</label>
      <div class="ms-chips">${discChips}</div>
      <span class="form-hint">Select disciplines this teacher teaches.</span>
    </div>

    <!-- Teaching Subjects — search-based per discipline -->
    <div class="form-group" id="teachingSubjectsSection">
      <label class="form-label">
        Teaching Subjects
        <span style="font-size:11px;font-weight:400;color:var(--t3);margin-left:6px">— search and select subjects</span>
      </label>

      ${disciplines.map(disc => {
        const isSelected     = selDiscs.includes(disc.id);
        const discLevelIds   = allLevels.filter(l => l.disciplineId === disc.id).map(l => l.id);

        // Active subjects only in the search pool.
        // BUT: for each subject the teacher currently teaches, always include it
        // even if archived — so editing doesn't silently drop their assignment.
        // We pass each selSubs id as currentSubjectId to ensure inclusion.
        const allDiscSubjects = AppState.get('subjects') || [];
        const discSubjects = allDiscSubjects.filter(s => {
          if (!discLevelIds.includes(s.levelId)) return false;
          // Always include already-assigned subjects even if archived
          if (selSubs.includes(s.id)) return true;
          return !s.isArchived;
        });

        const subjectsJson   = JSON.stringify(discSubjects.map(s => ({
          id:   s.id,
          code: s.subjectCode,
          name: s.subjectName,
          archived: !!s.isArchived,
        })));

        // Pre-selected for edit mode
        const preSelected = discSubjects.filter(s => selSubs.includes(s.id));

        return `
          <div class="ts-panel" data-ts-disc="${disc.id}" ${isSelected ? '' : 'style="display:none"'}>
            <div class="ts-panel-header">
              <span class="badge badge--blue" style="font-size:10.5px;flex-shrink:0">${disc.abbreviation}</span>
              <span style="font-size:12.5px;font-weight:600;color:var(--t1);flex:1">${disc.fullName}</span>
              <span class="ts-count-badge" id="tsCount_${disc.id}">
                ${preSelected.length ? preSelected.length + ' selected' : ''}
              </span>
            </div>

            ${discSubjects.length ? `
            <div class="ts-search-wrap">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--t3);flex-shrink:0">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                class="ts-search-input"
                placeholder="Type subject name or code…"
                data-disc-id="${disc.id}"
                autocomplete="off"
              />
            </div>

            <!-- Dropdown results -->
            <div class="ts-dropdown" id="tsDrop_${disc.id}" style="display:none"></div>

            <!-- Selected tags -->
            <div class="ts-tags-wrap" id="tsTags_${disc.id}">
              ${preSelected.map(s => `
                <span class="ts-tag${s.isArchived ? ' ts-tag--archived' : ''}" data-sub-id="${s.id}" title="${s.subjectName}${s.isArchived ? ' (archived)' : ''}">
                  <span class="ts-tag-code">${s.subjectCode}${s.isArchived ? ' <span style="font-size:9px;opacity:.7">[archived]</span>' : ''}</span>
                  <button type="button" class="ts-tag-remove" data-remove="${s.id}" data-disc="${disc.id}" title="Remove">✕</button>
                  <input type="hidden" class="ts-subject-cb" value="${s.id}"/>
                </span>`).join('')}
            </div>

            <!-- hidden subjects data -->
            <script type="application/json" id="tsData_${disc.id}">${subjectsJson}</script>
            ` : `<p class="ts-empty-msg">No subjects found for this discipline — add subjects first.</p>`}
          </div>`;
      }).join('')}

      <span class="form-hint">Select a discipline above — then search and add subjects.</span>
    </div>

    <!-- Campuses multi-select -->
    <div class="form-group">
      <label class="form-label">Campuses</label>
      <div class="ms-chips" id="campChipsWrap">${campChips}</div>
      <span class="form-hint">Select campuses where this teacher is available.</span>
    </div>

    <!-- Campus Schedule (shown per selected campus) -->
    ${scheduleSection}

    ${!existing ? `
    <!-- Password notice (add mode only) -->
    <div style="display:flex;align-items:flex-start;gap:10px;padding:12px;background:var(--blue-dim);border:1px solid rgba(79,133,247,0.2);border-radius:var(--r-sm)">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2" style="flex-shrink:0;margin-top:1px">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p style="font-size:12.5px;color:var(--blue);line-height:1.5;margin:0">
        After adding, an <strong>auto-generated secure password</strong> will be shown once.
        Share it with the teacher — it cannot be retrieved later.
      </p>
    </div>
    ` : ''}
  `;
}
