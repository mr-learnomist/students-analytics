// ============================================================
// modules/teacher/teacherCard.js — Teacher Card Component
// Renders a single teacher as a SaaS-style card
// Called by teacherUI.js _renderCards()
// ============================================================

import { AppState } from '../../utils/state.js';
import { _avatarHTML } from './teacherUI.js';

/**
 * Render a single teacher card HTML
 * @param {Object} teacher
 * @returns {string} HTML string
 */
export function renderTeacherCard(teacher) {
  const isInactive = teacher.isActive === false;

  // Discipline badges (max 3 shown)
  const discBadges = (teacher.disciplines || []).map(id => {
    const d = AppState.findById('disciplines', id);
    return d ? `<span class="badge badge--blue" style="font-size:10.5px">${d.abbreviation}</span>` : '';
  }).filter(Boolean);
  const discHTML = discBadges.length
    ? discBadges.slice(0, 3).join('') + (discBadges.length > 3 ? `<span class="badge badge--grey" style="font-size:10.5px">+${discBadges.length - 3}</span>` : '')
    : '<span style="font-size:11.5px;color:var(--t4)">No disciplines</span>';

  // Campus badges (max 2 shown)
  const campBadges = (teacher.campuses || []).map(id => {
    const c = AppState.findById('campuses', id);
    return c ? `<span class="badge badge--cyan" style="font-size:10.5px">${c.campusName}</span>` : '';
  }).filter(Boolean);
  const campHTML = campBadges.length
    ? campBadges.slice(0, 2).join('') + (campBadges.length > 2 ? `<span class="badge badge--grey" style="font-size:10.5px">+${campBadges.length - 2}</span>` : '')
    : '';

  return `
    <div class="teacher-card ${isInactive ? 'teacher-card--inactive' : ''}">

      ${isInactive ? '<span class="inactive-overlay">INACTIVE</span>' : ''}

      <!-- Top: Avatar + Name -->
      <div class="teacher-card-top">
        ${_avatarHTML(teacher.profilePicture, teacher.fullName, 48)}
        <div class="teacher-card-info">
          <div class="teacher-card-name">${teacher.fullName}</div>
          <div class="teacher-card-qual">${teacher.qualification || '—'}</div>
          <div class="teacher-card-email">${teacher.email}</div>
        </div>
      </div>

      <!-- Disciplines -->
      <div>
        <div style="font-size:10.5px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Disciplines</div>
        <div class="teacher-card-badges">${discHTML}</div>
      </div>

      <!-- Campuses (if any) -->
      ${campHTML ? `
      <div>
        <div style="font-size:10.5px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Campuses</div>
        <div class="teacher-card-badges">${campHTML}</div>
      </div>` : ''}

      <!-- Contact -->
      ${teacher.contactNumber ? `
      <div class="teacher-card-contact">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.62 4.35 2 2 0 0 1 3.59 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l1.27-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
        </svg>
        ${teacher.contactNumber}
      </div>` : ''}

      <!-- Footer: joined date + actions -->
      <div class="teacher-card-footer">
        <span style="font-size:11px;color:var(--t3)">
          ${teacher.createdAt
            ? new Date(teacher.createdAt).toLocaleDateString('en-PK', { day:'numeric', month:'short', year:'numeric' })
            : ''
          }
        </span>

        <div class="teacher-card-actions">
          <!-- Active/Inactive toggle -->
          <button class="tc-btn tc-btn--toggle"
                  data-teacher-toggle="${teacher.id}"
                  title="${isInactive ? 'Activate' : 'Deactivate'}">
            ${isInactive ? '▶ Activate' : '⏸ Deactivate'}
          </button>

          <!-- Reset password -->
          <button class="tc-btn tc-btn--reset"
                  data-teacher-reset="${teacher.id}"
                  title="Password Reset">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>

          <!-- Edit -->
          <button class="tc-btn tc-btn--edit"
                  data-teacher-edit="${teacher.id}"
                  title="Edit">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>

          <!-- Delete -->
          <button class="tc-btn tc-btn--delete"
                  data-teacher-delete="${teacher.id}"
                  title="Delete">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;
}
