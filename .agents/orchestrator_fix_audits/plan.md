# Audit & Fix Plan - MathmatiCore Platform

This document describes the audit and fix pass plan to ensure absolute perfection in MathmatiCore's security, quality assurance, UX/UI, and code architecture.

## Milestones

### Milestone 1: Security & Configuration Audit
- **Goal**: Review configuration and database rules to lock down permissions and ensure strict student/teacher/admin role boundaries.
- **Tasks**:
  - Review `database.rules.json` and ensure it enforces strict role checks.
  - Audit `src/infrastructure/firebase.ts` for exposed secrets or credentials.
  - Review `firebase.json` security settings.
- **Verification**: Database rules test/simulation (or static rules review) and verification that no sensitive credentials are hardcoded.

### Milestone 2: QA & Functional Audit & Implementation
- **Goal**: Implement missing requirements from ORIGINAL_REQUEST.md (Socratic Engine, Teacher dashboard approvals, Silent radar, Admin chat image upload, and Admin log viewer) and verify complete user journeys.
- **Tasks**:
  - Complete R1: Socratic Engine diagnosis logic for Tasks 2, 5, and 8.
  - Complete R2: Show Clinical Diagnosis (clinicalDiagnosisHe and actionPlanHe) in approvals tab of `TeacherDashboard.tsx` below the routing recommendation.
  - Complete R3: Restore and wire `useSilentRadar` in `StudentWorkspacePage.tsx` to log hesitation and undo counts.
  - Complete R4: Wire Admin-Teacher Chat Image Upload and Mic placeholder in both `AdminChatView.tsx` and `TeacherDashboard.tsx` (using base64 file selection).
  - Complete R5: Implement live Audit Log Viewer table in Admin dashboard (`AdminOverview.tsx`) with timestamp, action, user_id, details columns.
- **Verification**: Complete user flow tests and verification of write/read operations in Firebase.

### Milestone 3: UX/UI Polish & Premium Feel (UDL Accessibility)
- **Goal**: Polish visual styling, ensure full Hebrew RTL layout compliance, add micro-animations, ensure mobile/desktop responsiveness, and ensure no visual regression.
- **Tasks**:
  - Validate all text output is wrapped in RTL `div` alignment blocks.
  - Audit component alignments, spacings, and visual responsiveness.
  - Integrate micro-animations or premium feel transitions where appropriate.
  - Check UDL compliance (fonts, screen reader support, clear visual separation).
- **Verification**: Reviewer visual checks.

### Milestone 4: Architecture & Code Quality
- **Goal**: Clean up codebase by removing dead code, unused imports, logging artifacts, and fixing TypeScript compilation issues.
- **Tasks**:
  - Complete R6: Remove `src/infrastructure/mockRrwebEvents.ts` and verify no broken imports.
  - Clean up any stray `console.log` statements in production files.
  - Ensure strict TS types and eliminate implicit `any`.
- **Verification**: Run `npm run lint` and `tsc --noEmit`.

### Milestone 5: Build & Final Verification
- **Goal**: Verify that the entire workspace builds and conforms to project integrity checks.
- **Tasks**:
  - Run production build command (`npm run build`) in `react-ts-version/`.
  - Validate all tests compile and pass.
  - Perform Git commit and push to origin.
- **Verification**: Exit code 0 on `npm run build`, `npm run lint`, and `tsc --noEmit`.
