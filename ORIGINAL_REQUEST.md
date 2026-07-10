# Original User Request

## Initial Request — 2026-07-09T15:11:03+03:00

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
</USER_REQUEST>

## Follow-up — 2026-07-10T09:26:07Z

<USER_REQUEST>
# Teamwork Project Prompt

Verify recent deployments to Firebase and GitHub, ensure all expected UI updates are live, and identify/fix any lingering UI/UX issues.

Working directory: c:\Users\david\Projects\MathmatiCore

## Requirements

### R1. Verify Deployment Status
Check the git log and the Firebase hosting deployment status to ensure that the latest commits (including the CI/CD pipeline fix and Number Line redesign) are successfully pushed and deployed.

### R2. UI/UX Verification and Fixing
Review the React application's UI components, particularly the Workspace, Topbar, and interactive tasks (like the Number Line and Vertical Addition). Identify any visual regressions, clipping, or usability issues.

### R3. Autonomous Resolution
If any UI issues or deployment blockers are found, autonomously debug, fix the code, commit the changes, and ensure the automated deployment pipeline succeeds.

## Acceptance Criteria

### Verification Checks
- [ ] Git log confirms that the local `main` branch is synced with the remote repository.
- [ ] No TypeScript build errors exist (`npm run build` passes).

### UI Quality Bar
- [ ] The number line component renders correctly without visual glitches.
- [ ] The "לוח מוחשי" (tangible board) toggle button is correctly positioned and functional.
- [ ] Math operators (plus/minus) in tasks are correctly aligned.
</USER_REQUEST>
