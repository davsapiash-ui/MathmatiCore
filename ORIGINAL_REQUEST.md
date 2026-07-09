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

