# Project: Admin Management Interface Refactoring

## Architecture
- Refactor `useAdminStore.ts` to sync schools, classes, teachers, and global limits to Firebase Realtime Database.
- Live listeners in `useAdminStore.ts` set up to sync changes bidirectionally (Firebase → Zustand store and vice versa).
- Security rules modified in `database.rules.json` to allow reading/writing the required paths securely.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Exploration & Rules Update | Analyze store, update `database.rules.json` for schools and global limit, deploy rules | none | DONE |
| 2 | Implementation of Cloud Sync | Modify `useAdminStore.ts` actions to push updates to Firebase (including cascade deletion) | M1 | IN_PROGRESS |
| 3 | Bidirectional Live Sync | Set up real-time Firebase listeners in the frontend to keep the store up-to-date | M2 | IN_PROGRESS |
| 4 | Verification & Audit | Run tests, build the application, verify with reviewer/challenger/auditor | M3 | PLANNED |

## Interface Contracts
### useAdminStore ↔ Firebase Realtime Database Paths
- Schools: `schools/{schoolId}` containing `{ id, name, createdAt }`
- Classes: `classes/{classId}` containing `{ id, schoolId, teacherId, name, studentLimit, createdAt }` (accessible to authenticated users only)
- Public Classes: `public_classes/{classId}` containing `{ id, schoolId, name }` (accessible publicly)
- Teachers: `users/teachers/{teacherId}` containing `{ id, schoolId, taz, dob, name, licenseActive, createdAt }`
- Global Student Limit: `system_control/globalStudentLimit` (number)

## Code Layout
- Zustand Store: `react-ts-version/src/application/useAdminStore.ts`
- Firebase Rules: `database.rules.json` at project root
- Firebase Client Setup: `react-ts-version/src/infrastructure/firebase.ts`
- Login View: `react-ts-version/src/presentation/pages/Login.tsx`
- Admin View: `react-ts-version/src/presentation/pages/admin/AdminSchoolsView.tsx`
