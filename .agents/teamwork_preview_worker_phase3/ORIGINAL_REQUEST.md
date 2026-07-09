## 2026-07-09T14:14:00Z
Please implement the Phase 3 final audit updates and bug fixes for the MathmatiCore LMS project.
Your working directory is: c:\Users\david\Projects\MathmatiCore\.agents\teamwork_preview_worker_phase3

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Here is the step-by-step implementation plan:

1. Fix Stale forceReload Flag in FirebaseSyncService.ts:
   - Location: `react-ts-version/src/infrastructure/services/FirebaseSyncService.ts`
   - In the onValue listener for the student data, before calling `window.location.reload()`, clear the `forceReload` flag in Firebase by setting it to null (e.g. `update(studentRef, { forceReload: null }).then(...)`). This prevents client browser infinite reloading loops.

2. Implement Persistent Radar History Logs:
   - In `react-ts-version/src/features/workspace/useWorkspaceRadar.ts`:
     When sending a radar alert, also write/push the alert object to a student-specific historical path in Firebase: `users/students/${uid}/radar_history`.
   - In `react-ts-version/src/presentation/pages/TeacherDashboard.tsx`:
     Add a state `studentRadarHistory` that subscribes to `users/students/${selectedReplayStudentId}/radar_history` when `selectedReplayStudentId` changes.
     Replace the Replays logs timeline sidebar rendering so it uses this persistent `studentRadarHistory` instead of filtering the active `allAlerts` list. This prevents historical log events from disappearing when alerts are dismissed or expire.

3. Fix Replay Viewer Player Flickering and Resetting:
   - Location: `react-ts-version/src/presentation/components/ReplayViewer.tsx`
   - Keep a ref to the loaded events length and the first event timestamp.
   - When the events array updates, check if it's the same session (first event timestamp matches).
   - If it is the same session and the player instance is already initialized, do NOT destroy the player. Instead, append the new events (from index of previous length to the end) using `instanceRef.current.addEvent(event)`.
   - Update the `seekToTime` effect so it depends only on `seekToTime` (and not `events`), to prevent unwanted seeks during updates.

4. Hide Thousands Column in Vertical Addition/Notation for Sessions 1 & 2:
   - Location: `react-ts-version/src/features/workspace/tasks/VerticalAdditionTask.tsx`
   - If `sessionNumber <= 2`, dynamically filter `colPlaces` to exclude the `'thousands'` column, and cap `cols` to at most 3. This ensures alignment between the place value board column hiding and the vertical notation.

5. Dynamic Demonstration Range in Projector Sandbox Page:
   - Location: `react-ts-version/src/presentation/pages/ProjectorSandboxPage.tsx`
   - Add a toggle/selector on the page to let the teacher choose the demonstration range:
     * "תחום ה-1,000 (מפגשים 1 ו-2)" -> sets `sessionNumber = 1` in the store and `range = [0, 1000]`.
     * "תחום ה-10,000 (מפגשים 3-8)" -> sets `sessionNumber = 3` in the store and `range = [0, 10000]`.
   - When the range changes, re-initialize the sandbox session by calling `initSession(selectedSession, false)` and update the `NumberLineTask` range dynamically.

6. Support 8 Sessions, Static Fallback Tasks, and Dynamic Unlocking:
   - In `react-ts-version/src/application/useWorkspaceStore.ts`:
     * Expand the `SessionNumber` type to `1 | 2 | 3 | 4 | 5 | 6 | 7 | 8`.
     * Update `getActiveTasks` to fetch tasks for all sessions 1-8.
     * When standard tasks are completed (in `proceedStandard`), update the student's highest completed meeting (e.g. `highestCompletedMeeting`) in Firebase and in the store.
   - In `react-ts-version/src/data/sessionTasks.ts`:
     * Define static fallback task lists for sessions 5, 6, 7, 8 (`SESSION5_TASKS`, `SESSION6_TASKS`, `SESSION7_TASKS`, `SESSION8_TASKS`) in the thousands range (up to 10,000).
     * Update the `SESSIONS` mapping and `getSessionTasks` to include them.
   - In `react-ts-version/src/presentation/pages/StudentHub.tsx`:
     * Dynamically calculate the `isLocked` state for each meeting card based on `currentStudent.highestCompletedMeeting` (or `completedMeeting2` for backward compatibility).
     * Update the "להמשך התרגול" smart routing button to route to the next unlocked meeting up to 8.

7. Scale Adaptive Socratic Tasks to Thousands Range:
   - Location: `react-ts-version/src/infrastructure/services/SocraticEngine.ts`
   - Update the task ranges and values generated for Sessions 3-7 (Adaptive path) so they include numbers in the thousands range (up to 10,000) for both the GREEN (challenge) and YELLOW (supportive) routes.

8. Fix the 3 Failing Playwright Tests:
   - Fix `tests/e2e/passive-drifting.spec.ts`, `tests/e2e/regrouping.spec.ts`, and `tests/e2e/silent-radar.spec.ts` so they pass successfully. (The forceReload fix should resolve the navigation/reload issues, but verify and adjust any coordinates or selector timings if needed).

9. Add thousands-column.spec.ts Playwright Test:
   - Create a new Playwright E2E test file `react-ts-version/tests/e2e/thousands-column.spec.ts`.
   - The test must explicitly verify that the Thousands column is NOT visible on the place value board in Sessions 1 & 2, and that it IS visible and functional in Sessions 3 & 4.

10. Verify Build and Test Suite:
    - Run `npm run build` or `npx tsc --noEmit` to verify there are no TypeScript or build compilation errors.
    - Run the entire Playwright test suite to verify 100% passes.

11. Auto-Deploy:
    - Commit, push to GitHub, and verify that the Firebase deployment is initiated according to the `auto_deploy` skill rules.
