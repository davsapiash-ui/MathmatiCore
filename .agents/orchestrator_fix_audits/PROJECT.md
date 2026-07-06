# Project: MathmatiCore LMS Audit Fixes & Quality Pass

## Architecture
- React TypeScript frontend with Firebase Realtime Database.
- SocraticEngine evaluates student performance and publishes clinical diagnoses/action plans under `ai_pending_approvals/{teacherId}`.
- TeacherDashboard displays student routing and clinical suggestions.
- StudentWorkspacePage displays learning content and tracks engagement/hesitation.
- Admin Dashboard provides chat support, audit logs, and system operations utilities.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Socratic Engine & Flow Controls | Complete task 2, 5, 8 logic; fix tag mapping in qmatrixFlow.ts; support missing_element in proceedQ | None | IN_PROGRESS |
| 2 | UI/UX & Dashboard Integrations | Show clinical diagnosis in approvals tab; restore and wire useSilentRadar; audit alignments, animations, UDL RTL Hebrew requirements | M1 | PLANNED |
| 3 | Admin Dashboard & Chat Fixes | Wire Image/Mic in admin chat; implement Audit Log table in AdminOverview.tsx | M2 | PLANNED |
| 4 | Security & Rules Audit | Review firebase.json, database.rules.json, firebase.ts initialization; fix permissions & secure boundaries | None | PLANNED |
| 5 | Clean Code & Quality | Delete mockRrwebEvents.ts; fix any unused imports; ensure TS strict checks & clean console.logs | M1, M2, M3 | PLANNED |
| 6 | Build & Verification | Run npm run build, tsc --noEmit, and npm run lint with zero errors | M5 | PLANNED |

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
