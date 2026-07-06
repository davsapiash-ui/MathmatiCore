# Original User Request

## Initial Request — 2026-07-06T12:09:24+03:00

Fix all outstanding audit issues in the MathmatiCore LMS codebase —
a React/TypeScript/Firebase educational platform located at
`c:\Users\david\Projects\MathmatiCore\react-ts-version`.
Do not change architecture, do not introduce mock data, do not break
existing passing features. Every fix must compile cleanly and the
production build (`npm run build`) must succeed with zero TypeScript errors.

Working directory: `c:\Users\david\Projects\MathmatiCore`
Integrity mode: development

---

## Requirements

### R1. Socratic Engine — Complete Tasks 2, 5, 8
`src/infrastructure/services/SocraticEngine.ts` currently handles only
tasks 1, 3, 4, 6, 7 inside `generateAndQueueTasks()`. Add logic for:
- `task2_estimation_error_margin` (e.g., tag `estimation_range_error`)
- `task5_small_change` (e.g., tag `small_change_confusion`)
- `task8_missing_addend` (e.g., tag `missing_addend_deficit`)

Each new case must append a Hebrew `diagnosisParts` entry, an `actionParts`
entry, and set `isYellowPath = true` when appropriate.
The engine must still produce `clinicalDiagnosisHe` and `actionPlanHe` and
write them to Firebase under `ai_pending_approvals/{teacherId}`.

### R2. Teacher Dashboard — Show Clinical Diagnosis in Approvals Tab
In `TeacherDashboard.tsx`, the approvals/routing section (`pendingRouteStudents`)
currently shows only student name and a CurriculumRouter recommendation.
It must also render the `clinicalDiagnosisHe` and `actionPlanHe` from the
matching `PendingAIApproval` (found via `pendingApprovals.find(a => a.studentId === student.studentId)`).
Display them inside the existing approval card, below the route recommendation.

### R3. useSilentRadar — Wire to Firebase Hesitation Status
`src/application/useSilentRadar.ts` exists but is never imported.
Import and call it from `StudentWorkspacePage.tsx` (or the appropriate
component) so that hesitation events are surfaced on the teacher
dashboard in real-time. Do not duplicate the 30-second radar logic
that already exists in `useWorkspaceRadar.ts` — `useSilentRadar`
should complement, not replace.

### R4. Admin Chat — Wire Image Upload Buttons
In the admin-teacher chat UI (`AdminChatView.tsx` or wherever the
admin chat panel lives), the Image and Mic icon buttons currently have
no `onClick` handlers. Wire the Image button to open a file picker,
encode the selected image as base64, and send it via `sendImageMessage`
from `useChatStore`. Mirror the exact same pattern already implemented
in `TeacherDashboard.tsx` for the teacher-student chat.

### R5. Admin Dashboard — Audit Log Viewer
`audit_logs` is written to Firebase by `AuditLogger`. The Admin dashboard
(`src/presentation/pages/admin/`) must display these logs in a table or
list, with columns: timestamp, action, user_id, details. Listen via
Firebase `onValue` for live updates. Keep the UI consistent with the
existing admin panel design.

### R6. Dead Code Removal
Remove or properly integrate the following orphaned files/exports so
they no longer exist as dead code:
- `src/features/workspace/mockRrwebEvents.ts` — delete if unused
- `useSilentRadar` — once wired in R3, it is no longer dead code.
  If after R3 it is still unused, delete it.
Ensure no TypeScript import errors result from deletion.

---

## Acceptance Criteria

### Build
- [ ] `npm run build` (inside `react-ts-version/`) exits with code 0
- [ ] Zero TypeScript errors (`tsc --noEmit`)
- [ ] No new ESLint errors introduced

### R1 — Socratic Engine
- [ ] `SocraticEngine.generateAndQueueTasks()` contains `if` blocks for
      `task2_estimation_error_margin`, `task5_small_change`,
      `task8_missing_addend`
- [ ] Each block pushes a non-empty string to `diagnosisParts` and `actionParts`

### R2 — Diagnosis Display
- [ ] The approvals card in `TeacherDashboard.tsx` renders `clinicalDiagnosisHe`
      and `actionPlanHe` when a matching `PendingAIApproval` exists for the student
- [ ] The text is visible (not hidden, not empty string)

### R3 — useSilentRadar
- [ ] `useSilentRadar` is imported and called in at least one component
- [ ] OR: if it duplicates `useWorkspaceRadar` exactly, it is deleted and
      a comment explains the consolidation

### R4 — Admin Chat Image Upload
- [ ] Admin chat image button has an `onClick` that calls
      `fileInputRef.current?.click()` on a hidden `<input type="file" accept="image/*">`
- [ ] Selecting an image calls `sendImageMessage` and the image appears
      in the chat thread

### R5 — Audit Log Viewer
- [ ] Admin panel includes a page/tab that reads from `audit_logs` in Firebase
- [ ] Table/list shows timestamp, action, user_id, details
- [ ] Data updates without page reload (live Firebase listener)

### R6 — Dead Code
- [ ] `mockRrwebEvents.ts` is either deleted or has an active import
- [ ] `npm run build` still passes after deletions

## Important Notes
- After ALL fixes are complete, run `npm run build` in `react-ts-version/` and confirm 0 errors.
- Then commit with `git add -A && git commit -m fix-audit-issues && git push origin main` from `c:\Users\david\Projects\MathmatiCore`
- Report back with the full list of changes made and the build output confirming success.

## Follow-up — 2026-07-06T09:17:56Z

Perform a comprehensive, zero-tolerance audit and fix pass across the entire MathmatiCore platform (`c:\Users\david\Projects\MathmatiCore\react-ts-version`). The user is demanding absolute perfection. You must activate subagents for UX/UI, QA, Architecture, and Security to scour the codebase, database rules, and configuration for any remaining flaws, edge cases, visual bugs, or security vulnerabilities, and fix them.

Working directory: `c:\Users\david\Projects\MathmatiCore`
Integrity mode: development

---

## Requirements

### R1. Security & Configuration Audit
Review `firebase.json`, `database.rules.json`, and all Firebase initializations (`src/infrastructure/firebase.ts`). Look for exposed secrets, overly permissive rules (ensure student/teacher boundaries are strict), and bad config practices. Fix any identified vulnerabilities.

### R2. QA & Functional Audit
Trace every user journey (Student Login → Workspace → Socratic Engine → Teacher Dashboard → AI Approvals → Admin Dashboard). Identify and fix any broken links, unhandled promises, state synchronization issues (Zustand), or edge cases where the UI can enter a broken state.

### R3. UX/UI Polish & Premium Feel
Review all components in `src/presentation/`. Ensure the application meets "Top 5 in the world" standards. Fix misalignments, add missing micro-animations, ensure responsive design holds up on all screen sizes, and verify UDL (Universal Design for Learning) accessibility standards are met. Ensure a premium, modern aesthetic without breaking existing functionality.

### R4. Architectural & Code Quality Audit
Identify and remove any remaining dead code, unused imports, console.logs, or overly complex/duplicated logic. Ensure strict TypeScript typings everywhere (no implicit `any`).

## Acceptance Criteria

### Security
- [ ] `database.rules.json` enforces strict boundary checks between roles while allowing legitimate telemetry/audit writes.
- [ ] No hardcoded sensitive API keys or secrets in source control.

### QA & Functionality
- [ ] All features (Chat, Radar, Q-Matrix, Diagnostics, Admin Logs) function without error.
- [ ] Zero unhandled runtime exceptions or infinite render loops.

### UX/UI
- [ ] Visual hierarchy is clear, components are aligned, and the design feels highly polished.
- [ ] No visual regressions or broken layouts on mobile or desktop views.

### Architecture & Build
- [ ] `npm run build` exits with code 0.
- [ ] `tsc --noEmit` returns 0 errors.
- [ ] `npm run lint` returns 0 errors.

## SPECIAL DIRECTIVE FROM USER:
"I want you to check EVERYTHING from every direction in DB, Firebase, GitHub, the code itself, live site... I want you to check everything from everything. Thoroughly!!!!"
You must act as an orchestrator and launch multiple agents (QA, Security, UX) to accomplish this perfectly. Do not stop until every single stone is turned.

## Follow-up — 2026-07-06T17:57:54Z

Comprehensive QA pass and bug fixing for the MathmatiCore LMS system. The team must autonomously identify, reproduce, and fix remaining bugs in the application UI, data flow, and styling, leaving no "stupid bugs" behind.

Working directory: c:/Users/david/Projects/MathmatiCore
Integrity mode: development

## Requirements

### R1. Full Codebase Audit & UI/UX Polish
The team must identify and resolve UI glitches, overflow issues, masked scrollbars, layout breaks, and responsiveness issues across all modules (Teacher Dashboard, Student Hub, Workspace).

### R2. Logic and Data Flow Verification
Trace all data flows from Firebase to the UI. Ensure data is correctly filtered and scoped (e.g., counting only relevant teacher data). Ensure components conditionally render based on actual data rather than rendering empty placeholders. Fix any logic that leads to "phantom" data or notifications.

### R3. Holistic Root-Cause Debugging
Adhere strictly to the `AGENTS.md` rules. Do not apply superficial "band-aids" or mock data fixes. You must trace data flows to the root cause (Store -> Firebase -> Component) and fix the underlying architecture.

### R4. Autonomous CI/CD Deployment
After fixes are applied, the team must commit, push, and monitor the GitHub/Firebase CI deployment to verify it completes successfully without regression.

## Acceptance Criteria

### Reliability and Correctness
- [ ] The app builds locally (`npm run build`) with zero TypeScript or Vite compilation errors.
- [ ] No empty UI cards or meaningless notifications are rendered to the user.
- [ ] Data correctly reflects the specific logged-in teacher or student.

### Process and Verification
- [ ] The team maintains an artifact log detailing the exact root cause and solution for every bug fixed.
- [ ] The team autonomously verifies the CI deployment success on GitHub before concluding the task.

