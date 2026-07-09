# Original User Request

## Initial Request — 2026-07-06T09:09:24Z

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

## Follow-up — 2026-07-09T15:11:03+03:00

<USER_REQUEST>
# Teamwork Project Prompt — Draft

> Status: Launched

A systemic, holistic audit and repair of the MathmatiCore LMS project. The goal is to resolve deep architectural mismatches between the UI (React/Zustand), the pedagogical rules ("No auto-regrouping"), the tracing system (Silent Radar spam), and Firebase deployment caching, ensuring flawless synchronization and bug-free user experience.

Working directory: C:/Users/david/Projects/MathmatiCore

## Requirements

### R1. Holistic UI and Mechanics Verification
Audit the React application to ensure that the pedagogical rules (specifically "No Auto-Regrouping") are strictly enforced in the UI components (like `DienesBlock` and `PlaceValueBoard`) and that task instructions align perfectly with these mechanics.

### R2. State and Radar Synchronization
Ensure `useWorkspaceStore` and `useWorkspaceRadar` accurately reflect student actions without generating false positives or flooding the Teacher Dashboard. Validate that the cooldowns work correctly.

## Acceptance Criteria

### Verification & Stability
- [ ] Programmatic trace verification: Simulating 5 rapid deletions must result in exactly 1 PASSIVE_DRIFTING alert, with no subsequent alerts for 15 seconds.
- [ ] Task instructions review: Text must explicitly instruct users to drag blocks for regrouping/ungrouping, with no references to auto-regrouping or double-clicking.
</USER_REQUEST>

## Follow-up — 2026-07-09T15:20:19+03:00

<USER_REQUEST>
עצור כאן מפגש 1-2 צריכים להיות עד 1000 בכל דבר.
Constraints:
1. Ensure the PlaceValueBoard does NOT show the 'thousands' (אלפים) column during Sessions 1 and 2.
2. Ensure no numbers in `SESSION1_TASKS` or `SESSION2_TASKS` exceed 1000.
3. The user also manually fixed a React hook violation in `useWorkspaceRadar.ts` (`lastDriftAlertTime = useRef(0)` moved to the top level). Make sure your worker doesn't overwrite this manual fix!
</USER_REQUEST>

## Follow-up — 2026-07-09T15:24:38+03:00

<USER_REQUEST>
IMPORTANT PEDAGOGICAL CONTEXT:
The reason Sessions 1 and 2 are capped at 1000 is directly tied to the national curriculum.
- Finishing 2nd Grade (Session 1 and Session 2 diagnostic) means mastery up to 1,000.
- After Level 2 (Session 2), the system enters an adaptive phase based on the diagnostic results, scaling up to 10,000 (which is the final level of 3rd Grade).

Please ensure the `spec_updater` agent documents this "Curriculum Scaling Rule" (2nd Grade = up to 1,000; 3rd Grade Adaptivity = up to 10,000) in the relevant specification documents and `AGENTS.md` to prevent future agents from making this mistake again.
</USER_REQUEST>

## Follow-up — 2026-07-09T15:25:54Z

<USER_REQUEST>
URGENT PEDAGOGICAL UPDATE:
The curriculum scaling rule is stated as:
- Grade 2 (Sessions 1 and 2): Strict mastery up to 1,000.
- Grade 3 (Post-Session 2 Adaptivity): Expands up to 10,000.

Please ensure this scaling rule is perfectly implemented in the Q-Matrix (`src/core/QMatrix.ts`) and all task definitions (`src/data/sessionTasks.ts`). Session 1 and 2 tasks must NOT exceed 1,000. Sessions 3 and beyond must expand up to 10,000.
</USER_REQUEST>

## Follow-up — 2026-07-09T12:32:20Z

<USER_REQUEST>
CRITICAL DIRECTIVE:
Exhaustive, no-holds-barred audit of the ENTIRE SYSTEM from EVERY possible aspect (UI, State, Logic, Mechanics, Data Flow, Security, Firebase, CI/CD) and "do whatever is needed already."

Additionally, Session 3 and Session 4 tasks in `src/data/sessionTasks.ts` have been manually updated to the thousands (e.g. `s3_t5` uses 4890 + 1750, `s4_t5` uses 5130 - 2850). The "thousands" column MUST be visible and functional in Sessions 3 and 4, while remaining hidden/restricted in Sessions 1 and 2. Make the entire system bulletproof across all these constraints, and finish the job.
</USER_REQUEST>

## Follow-up — 2026-07-09T12:36:25Z

<USER_REQUEST>
URGENT ARCHITECTURAL & BUG REPORT:
1. Replays & Logs are BROKEN: The Teacher Dashboard must be able to view `rrweb` replays and trace logs perfectly. Prioritize fixing the telemetry/recording pipeline IMMEDIATELY.
2. Session Architecture:
   - Session 1: Sandbox (up to 1,000).
   - Session 2: Diagnostic (up to 1,000).
   - Teacher Approval Gate: After Session 2, the teacher must read the AI diagnosis, check the Recordings (replays), and check the Logs before approving the student to continue.
   - Sessions 3-7: Adaptive sessions (up to 10,000) generated/built ONLY AFTER the teacher's approval.
   - Session 8: Another major diagnostic analysis (similar to the one before Session 3).

Instruct the `spec_updater_1` to update `AGENTS.md` and the master spec docs with this exact session flow. Instruct the `worker_1` to drop everything and ensure the Replays/Recordings functionality actually works for the teacher!
</USER_REQUEST>

## Follow-up — 2026-07-09T12:48:39Z

<USER_REQUEST>
CRITICAL UPDATE:
The user manually fixed the Firebase rules (`database.rules.json`) by adding read/write permissions for the `telemetry_chunks` node. Ensure `worker_2` utilizes this fix and deploys it to the Firebase Realtime Database so the replays can actually be written and read.
</USER_REQUEST>

## Follow-up — 2026-07-09T12:53:26Z

<USER_REQUEST>
Teamwork תפעיל אותם עוד (Activate Teamwork more). 
Please run an exhaustive final sweep. The previous Teamwork Orchestrator handled UI mechanics, Radar cooldowns, Q-Matrix up to 1000 rules, and the `telemetry_chunks` Firebase rules fix. 
Your job is to launch a new wave of testing agents to verify:
1. That the `telemetry_chunks` Firebase rule actually works on the live deployment.
2. That there are no remaining bugs in the teacher dashboard replay viewer.
3. That the Session 3 and 4 tasks (which the user manually updated to the thousands) perfectly render the "Thousands" column without breaking the board.
4. Final cleanup of any lingering trace bugs.
Do not stop until you are 100% certain the entire system is flawless.
</USER_REQUEST>

## Follow-up — 2026-07-09T12:54:36Z

<USER_REQUEST>
FYI: The user just manually edited `database.rules.json` to add top-level `.write` permissions for the admin on `radar_alerts` and `chat_messages`. This is crucial for allowing the admin to programmatically clear out old traces without Permission Denied errors. Please ensure your subagents include these rules in their final deployment sweeps.
</USER_REQUEST>

## Follow-up — 2026-07-09T13:07:37Z

<USER_REQUEST>
CRITICAL WARNING FROM USER REGARDING VICTORY AUDITOR:
The user explicitly warned: "Make sure he doesn't develop too much independence and create a different product for me!" 

You must IMMEDIATELY instruct the Victory Auditor (`502a9b72-4f15-4401-a24e-3e0ee9bf3e34`) to strictly adhere to its read-only auditing mandate. 
It must NOT rewrite working code, it must NOT alter the UI design, and it must NOT introduce new architectural features. Its ONLY job is to verify that the existing codebase exactly matches the requirements specified in `AGENTS.md` and the `מסמכי אפיון` folder. Prevent any scope creep or unprompted refactoring!
</USER_REQUEST>

## Follow-up — 2026-07-09T13:49:31Z

<USER_REQUEST>
# Teamwork Project Prompt — Draft

> Status: Launched — Phase 3 (Goal-Driven Final Audit)
> Goal: Exhaustive holistic system audit until perfection

A goal-driven, relentless holistic audit of the MathmatiCore LMS project. The system must be checked from every conceivable angle (UI, State, Logic, Mechanics, Data Flow, Security, Firebase, CI/CD). If any remaining bug, inconsistency, or mismatch is found, fix it immediately and ensure the `AGENTS.md` and spec documents remain updated.

Working directory: C:/Users/david/Projects/MathmatiCore
Integrity mode: benchmark

## Requirements

### R1. Persistent Holistic System Audit
Scour the entire React app, Zustand stores, Firebase rules, and Telemetry pipeline. Do not stop until you have programmatically verified that absolutely no bugs remain. If anything is broken, fix it.

### R2. Strict Pedagogical Alignment
Verify and enforce the exact agreed-upon pedagogical flow across all files (`sessionTasks.ts`, `QMatrix.ts`, `PlaceValueBoard.tsx`, etc.):
- **Session 1 & 2:** Restricted to numbers up to 1,000. Thousands column MUST be dynamically hidden.
- **Teacher Approval Gate:** Replays (`rrweb`) and Logs must be fully accessible and readable by the teacher.
- **Sessions 3-7 (Adaptive):** Expands to 10,000. Thousands column is visible and functional. No auto-regrouping allowed anywhere.

## Acceptance Criteria

### Verification & Stability
- [ ] Programmatic E2E Playwright tests explicitly verify the presence/absence of the Thousands column in corresponding sessions.
- [ ] Telemetry pipeline (ReplayViewer + TeacherDashboard) has 100% test coverage and zero silent failures during rendering.
- [ ] `AGENTS.md` and `מסמכי אפיון` perfectly mirror the final state of the codebase.
</USER_REQUEST>

## Follow-up — 2026-07-09T14:15:39Z

<USER_REQUEST>
CRITICAL USER CORRECTION:
The user explicitly wants the "Thousands" (אלפים) column to be VISIBLE at all times, even in Sessions 1 and 2! 

The user's rule "Sessions 1-2 must be up to 1000" means the EXERCISE VALUES should not exceed 1000. It does NOT mean we should hide the thousands column from the UI. The UI must always have 4 columns (Units, Tens, Hundreds, Thousands).

Your task:
1. Immediately remove the logic that hides the thousands column in `PlaceValueBoard.tsx` and `BlockPalette.tsx` for Sessions 1 & 2.
2. The UI must always render 4 columns.
3. Also fix the Sandbox task logic in `useWorkspaceStore.ts` so that it doesn't just check `s.hasDeletedBlock`, but handles the "5 blocks" dragging validation gracefully.

## Follow-up — 2026-07-09T21:03:47Z

# Teamwork Project Prompt — Draft

> Status: Launched — Phase 3 (Goal-Driven Final Audit)
> Goal: Exhaustive holistic system audit until perfection

An exhaustive holistic audit of the MathmatiCore LMS project focusing on Firebase Realtime Database Security Rules and Data Flow. The system must be checked to ensure no front-end data schemas conflict with Firebase validation rules, preventing silent write failures.

Working directory: C:/Users/david/Projects/MathmatiCore
Integrity mode: benchmark

## Requirements

### R1. Complete Firebase Rules vs. Codebase Audit
Scan every `push`, `set`, `update`, and `remove` operation across the entire React codebase (`react-ts-version/src`). For each operation, cross-reference the data payload structure against the `.validate` and `.write` rules in `database.rules.json`. Identify any mismatches where the frontend sends strings instead of objects, uses wrong keys, or lacks proper authentication context.

### R2. Silent Failure Elimination
Identify any `try/catch` blocks surrounding Firebase operations that log to console but fail to notify the user or the application state (e.g., bypassing critical engine triggers). Fix these to ensure robust error handling and UI feedback.

### R3. Safe Resolution
Fix any identified mismatches by either updating the frontend data schema to match the rules, or safely relaxing the rules if they are overly restrictive, without compromising cross-tenant security. DO NOT break existing working components.

### R4. Spec Synchronization
Update `AGENTS.md` and `מסמכי אפיון` to reflect any new data schemas or architectural changes made during this audit.

## Acceptance Criteria

### Security & Data Integrity
- [ ] Every Firebase write operation in the codebase is documented and proven to match its corresponding validation rule.
- [ ] No `permission_denied` errors occur during core user flows (Student login -> Meeting 1/2 -> Reflection -> Teacher Dashboard).
- [ ] The `ai_pending_approvals` node is successfully written to by a normal student account.
- [ ] `AGENTS.md` is updated with the exact data schemas expected by Firebase rules.

## Follow-up — 2026-07-09T21:07:39Z

<USER_REQUEST>
בחינה וניתוח מעמיק של יכולת ה-AI להבין את מצבו הקוגניטיבי של התלמיד מתוך הנתונים הקיימים (Q-Matrix, הקלטות מסך, לוגים של התראות, ותשובות התלמיד). מטרת הצוות היא להכריע האם סט הנתונים הקיים מספיק כדי להפיק תובנות פדגוגיות איכותיות, ואם לא – להציע ולממש את התיקונים הנדרשים.

Working directory: ~/teamwork_projects/pedagogical_ai_evaluation
Integrity mode: development

## Requirements

### R1. ניתוח איכות המידע הקיים
על סוכני הצוות (לרבות הסוכן הפדגוגי) לסקור את מודל הנתונים הנוכחי שמועבר ל-AI (ה-Q-Matrix, חותמות הזמן, הקלטות המסך של rrweb והלוגים) ולהעריך האם המידע הזה מספיק כדי לזהות בוודאות "מאבק קוגניטיבי" ו"סגנון למידה".

### R2. זיהוי פערי ידע (Blind Spots)
במידה והנתונים הקיימים לא מספקים תמונה מלאה (למשל: חסר מידע על תנועות עכבר מדויקות, זמני השהייה בין לחיצות, או התאמה בין ה-Q-Matrix לפעולה הפיזית), על הצוות למפות את הפערים הללו במדויק.

### R3. בניית מנגנון ניתוח (Proof of Concept)
במידה והנתונים מספיקים (או לאחר שהצוות הציע להם שיפור), על הצוות לכתוב סקריפט/קוד מודל המדגים כיצד ה-AI במערכת יקרא את הנתונים הללו ויפלוט פלט פדגוגי איכותני (דוח מורה מתקדם או שאלה סוקרטית מדויקת).

## Acceptance Criteria

### וידוא אוטומטי ואובייקטיבי
- [ ] ייכתב סקריפט אוטומטי שמייצר נתוני לוגים "מדומים" (Mock) של תלמיד עם טעות קוגניטיבית מורכבת (למשל: הקפצה לא נכונה בחיבור ארוך). הסקריפט יוכיח שהלוגיקה המוצעת של ה-AI מצליחה לזהות את הטעות הספציפית מתוך הנתונים בלבד.
- [ ] הצוות יגיש קובץ Markdown המסochem את המסקנות: האם הנתונים (Q-Matrix, Logs, Replays) מספיקים, ומהם שלושת השיפורים הטכניים הנדרשים כדי לשפר את איכות הניתוח.
</USER_REQUEST>
</USER_REQUEST>
