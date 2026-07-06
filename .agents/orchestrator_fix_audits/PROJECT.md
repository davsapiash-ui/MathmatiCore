# Project: MathmatiCore LMS Audit Fixes

## Architecture
- React TypeScript frontend with Firebase Realtime Database.
- SocraticEngine evaluates student performance and publishes clinical diagnoses/action plans under `ai_pending_approvals/{teacherId}`.
- TeacherDashboard displays student routing and clinical suggestions.
- StudentWorkspacePage displays learning content and tracks engagement/hesitation.
- Admin Dashboard provides chat support and system operations utilities.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Socratic Engine & Dead Code | Fix SocraticEngine to handle tasks 2, 5, 8 and delete unused mockRrwebEvents.ts | None | PLANNED |
| 2 | Teacher Dashboard approvals | Render clinicalDiagnosisHe and actionPlanHe in TeacherDashboard approvals | None | PLANNED |
| 3 | Silent Radar integration | Wire useSilentRadar in StudentWorkspacePage to update hesitation to Firebase | None | PLANNED |
| 4 | Admin Chat & Log Viewer | Wire AdminChatView image upload and implement live Audit Log Viewer in Admin dashboard | None | PLANNED |
| 5 | Build & Integration Verification | Ensure production build compiles with zero errors and matches design requirements | M1, M2, M3, M4 | PLANNED |

## Interface Contracts
### SocraticEngine ↔ Firebase
- Path: `ai_pending_approvals/{teacherId}`
- Fields added: `task2_estimation_error_margin`, `task5_small_change`, `task8_missing_addend` to `qMatrixResults` if relevant, with Hebrew translations for `diagnosisParts` and `actionParts`.

### StudentWorkspacePage ↔ useSilentRadar
- Hook logs hesitation events to Firebase under student's trace data or session.

### AdminChatView ↔ useChatStore
- Uses `sendImageMessage` method to upload base64-encoded image files.

### Admin dashboard ↔ Firebase
- Path: `audit_logs`
- Data model contains: timestamp, action, user_id, details.
