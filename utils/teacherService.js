// ============================================================
// utils/teacherService.js — Teacher Service (Public API)
// Re-exports TeacherService, generatePassword, generateTeacherID
// from auth.js for clean modular imports elsewhere in the app.
//
// USAGE EXAMPLES:
//
//   import { TeacherService } from './utils/teacherService.js';
//
//   // Add a teacher (auto-generates password + login credentials)
//   const result = TeacherService.addTeacher({
//     fullName:      'Dr. Ayesha Khan',
//     qualification: 'PhD Computer Science',
//     contactNumber: '0300-1234567',
//     email:         'ayesha.khan@fast.edu.pk',
//     disciplines:   ['disc_1', 'disc_3'],   // IDs from AppState
//     campuses:      ['camp_1'],              // IDs from AppState
//     profilePicture: null,
//   });
//
//   if (result.success) {
//     console.log('Teacher added:', result.teacher);
//     console.log('Show this password ONCE:', result.plainPassword);
//   } else {
//     console.error(result.message);
//   }
//
//   // Update teacher profile (NOT password)
//   TeacherService.updateTeacher(id, { contactNumber: '0311-9999999' });
//
//   // Reset password (returns new plain password to show admin once)
//   const { plainPassword } = TeacherService.resetPassword(id);
//
//   // Delete teacher (also logs them out if currently active)
//   TeacherService.deleteTeacher(id);
//
//   // Query teachers
//   TeacherService.getTeachers();                         // all
//   TeacherService.getTeachers({ activeOnly: true });     // active only
//   TeacherService.getTeachers({ disciplineId: 'disc_1' }); // by discipline
//   TeacherService.getTeachers({ campusId: 'camp_2' });     // by campus
//
//   // Activate / deactivate
//   TeacherService.setActive(id, false);  // deactivate
//   TeacherService.setActive(id, true);   // reactivate
//
//   // Get credentials (for display after add/reset)
//   const creds = TeacherService.getCredentials(id);
//   // { email, password, role: 'teacher' }
//
// ── TEACHER DATA MODEL ────────────────────────────────────────
// {
//   id:             'tch_xxx',          // auto-generated unique ID
//   fullName:       'Dr. Ayesha Khan',
//   qualification:  'PhD Computer Science',
//   contactNumber:  '0300-1234567',
//   email:          'ayesha.khan@fast.edu.pk',  // login username
//   loginPassword:  'Xk7@mQ3!',                 // auto-generated
//   disciplines:    ['disc_1'],                  // discipline IDs
//   campuses:       ['camp_1'],                  // campus IDs
//   profilePicture: null,                        // base64 or URL
//   isActive:       true,
//   createdAt:      '2025-04-01T10:00:00.000Z',
//   updatedAt:      '2025-04-01T10:00:00.000Z',  // set on updates
// }
//
// ── LOGIN FLOW ────────────────────────────────────────────────
// Teacher logs in via:
//   username field: their email    (e.g. ayesha.khan@fast.edu.pk)
//   password field: loginPassword  (auto-generated)
//
// Auth.login() checks users[] first, then teachers[] automatically.
// Teacher session includes { isTeacher: true } flag.
// ============================================================

export {
  TeacherService,
  generatePassword,
  generateTeacherID,
} from './auth.js';
