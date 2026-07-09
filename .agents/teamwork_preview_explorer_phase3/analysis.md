# Phase 3 Final Audit: Exploration and Gap Analysis

This report documents the detailed findings of the read-only exploration and gap analysis performed on the MathmatiCore LMS codebase for the Phase 3 final audit.

---

## 1. Hiding of the Thousands Column in Sessions 1 & 2 (Numbers up to 1,000)

### Implementation Status
* **PlaceValueBoard Rendering:** In `PlaceValueBoard.tsx` (lines 20-22), the columns to render are conditionally filtered based on the current session number:
  ```typescript
  const placesToRender = sessionNumber <= 2
    ? PLACE_ORDER.filter((p) => p !== 'thousands')
    : PLACE_ORDER;
  ```
* **BlockPalette Rendering:** In `BlockPalette.tsx` (lines 22-24), the draggable source block for thousands is also filtered out during Sessions 1 & 2:
  ```typescript
  const paletteItemsToRender = sessionNumber <= 2
    ? PALETTE_ITEMS.filter(item => item.place !== 'thousands')
    : PALETTE_ITEMS;
  ```

### Gaps and Inconsistencies
* **Projector Sandbox Page Limitation:** In `ProjectorSandboxPage.tsx` (lines 38-41), the teacher's projector workspace is hardcoded to initialize as Session 1:
  ```typescript
  useEffect(() => {
    // אתחול סשן נקי ללוח
    initSession(1, false);
  }, [initSession]);
  ```
  Since it hardcodes Session 1, **the Thousands column is permanently hidden on the projector sandbox page**, leaving teachers unable to demonstrate any tasks involving numbers above 1,000 (such as Sessions 3 & 4) on the projector.
* **Vertical Addition Layout Alignment:** In `VerticalAdditionTask.tsx`, the columns displayed depend on the length of the operands:
  ```typescript
  const cols = Math.max(aStr.length, bStr.length, answerLength);
  const colPlaces: Place[] = PLACE_ORDER.slice(0, cols).reverse();
  ```
  If a task in Session 1 or 2 somehow calculates a 4-digit number (e.g. `correctAnswer` or operands), it will dynamically include the thousands column in the vertical notation, even though the visual place value board hides it, creating a visual mismatch between the manipulative board and the vertical notepad.

---

## 2. Thousands Column in Sessions 3-7 (Numbers up to 10,000)

### Implementation Status
* **Visibility:** When `sessionNumber` is 3 or 4, the Thousands column is displayed in both `PlaceValueBoard` and `BlockPalette`.
* **Auto-Regrouping Restriction:** Verified that auto-regrouping is strictly disallowed in `resolveDrop` (in `placeValue.ts`, lines 112-115) under all circumstances:
  ```typescript
  const autoGroup = false;
  ```
  All conversions must be manual. The student must explicitly drag 10 blocks of a smaller value to the adjacent higher column to carry, or drag a larger block to the adjacent lower column to decompose (ungroup).

### Gaps and Inconsistencies
* **Unimplemented Sessions (Sessions 5-7):** Sessions 5, 6, 7, and 8 are completely unimplemented in the codebase.
  * In `useWorkspaceStore.ts`, the type definition for `SessionNumber` is restricted to `1 | 2 | 3 | 4`.
  * In `sessionTasks.ts`, task lists are defined only for `1 | 3 | 4`.
  * In `StudentHub.tsx`, cards for Sessions 5, 6, 7, and 8 are hardcoded as `isLocked: true` and cannot be unlocked or loaded.
* **Socratic AI Engine Curriculum Scaling Failure:** Although Rule 13 of `AGENTS.md` states that the number range for Grade 3 (Sessions 3-7) is expanded up to 10,000, **the Socratic AI Engine only generates tasks with numbers under 1,000**.
  * In `SocraticEngine.ts` (lines 103-162), all generated tasks (e.g., `gen_t_est` targeting `50` in range `[0, 100]`, `gen_c1` solving `125 + 134`, `gen_c2` solving `245 + 136`) are restricted to three digits.
  * This means students placed on the AI-adaptive path in Session 3 will **never encounter numbers in the thousands range**, and the Thousands column on their board will remain unused, violating the curriculum scaling requirements.

---

## 3. Accessibility & Readability of Replays (rrweb) and Logs in Teacher Dashboard

### Critical Gaps
* **Volatile Log Sidebar (12-Hour Expiration):** In `TeacherDashboard.tsx` (lines 381-385), the `allAlerts` log list (which populates the Replay events timeline/sidebar in the diagnostic reports tab) filters out alerts older than 12 hours:
  ```typescript
  const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
  return firebaseAlerts
    .filter(a => a.timestamp > twelveHoursAgo)
  ```
  Consequently, if a teacher opens a student's diagnostic profile to review their session after 12 hours, **the log timeline will be completely empty**, rendering the replay history unusable for auditing.
* **Volatile Log Sidebar (Teacher Dismissals):** When a teacher clicks "Dismiss", "Send hint", or "Acknowledge" on a radar alert, the alert is deleted from the `radar_alerts` database path:
  ```typescript
  remove(ref(database, `radar_alerts/${alert.firebaseKey}`));
  ```
  Since the Replay logs sidebar relies directly on these alerts, dismissing an alert **instantly deletes it from the student's historical replay timeline**. Thus, once a teacher manages their active alert dashboard, they lose all logs in the replay viewer. There is no persistent node specifically designated for storing historical log events for replays.

---

## 4. Telemetry Pipeline Rendering Logic

### Critical Gaps
* **Live Replay Re-Initialization / Player Flickering:** In `TeacherDashboard.tsx`, the `onValue` listener updates `liveReplayEvents` every time the student sends a new telemetry batch (every 2 seconds during active work):
  ```typescript
  unsubscribe = onValue(replayRef, (snapshot) => {
    ...
    setLiveReplayEvents(validEvents);
  });
  ```
  However, in `ReplayViewer.tsx` (lines 14-16), any change to `events` triggers the recreation of the player:
  ```typescript
  useEffect(() => {
    if (playerRef.current && events && events.length > 1) {
      playerRef.current.innerHTML = "";
      ...
      instanceRef.current = new Player({...});
  ```
  This means that if a teacher tries to watch a student's session in real-time, **the rrweb-player will completely destroy itself, wipe its state, and start playing from 00:00 every 2 seconds**, causing severe player flickering and rendering live telemetry monitoring unusable.

---

## 5. Playwright Test Suite Status

### E2E Test Execution Results
Running `npx playwright test` yields **3 failures out of 13 tests**:
1. **`tests/e2e/passive-drifting.spec.ts`:** Fails with `TypeError: Cannot read properties of undefined (reading 'filter')`. This occurs because `alertsAfterRapidDeletes` evaluates to `undefined`, which indicates that the evaluation on `window.triggeredAlerts` was executed on a stale or destroyed context, or during a page reload/redirect.
2. **`tests/e2e/regrouping.spec.ts`:** Fails with `Error: page.evaluate: Execution context was destroyed, most likely because of a navigation`. This happens because navigating to `/workspace` is followed by a redirect or another navigation, causing the active evaluation to crash.
3. **`tests/e2e/silent-radar.spec.ts`:** Fails with `Error: expect(locator).toHaveCount(expected) failed (Expected: 1, Received: 0)`. The drag-and-drop action does not register in time or gets dropped at wrong coordinates, failing the assertion.

### Gaps in Test Coverage
* **No Thousands Column Tests:** There are **zero E2E tests** verifying the dynamic hide/show of the Thousands column per session. The term "thousands" or "thousand" is entirely absent from the `tests/` directory.
* **No Unit Test Suite:** There is no unit test runner (e.g. Vitest, Jest) configured in `package.json`, and there are no unit tests for `TelemetryTracker.ts`, `useWorkspaceRadar.ts`, or any other business logic. Telemetry coverage is limited to a single E2E test `telemetry-replay.spec.ts` that only checks basic mounts.

---

## 6. Specification Synchronization Status

* **Spec vs. Code Alignment:** The rules defined in `AGENTS.md` and `מסמכי אפיון` align with the logical concepts of the project (manual regrouping, no client-side timers, dynamic routing, silent radar).
* **Missing Implementation details in Specs:**
  * The spec files do not document that Sessions 5-8 are placeholders and locked.
  * The spec files do not address the 12-hour expiration window or active dismissal deletion of radar alerts, which breaks historical auditing in the Teacher Dashboard.
  * The spec files do not mention that the Socratic AI Engine is limited to 3-digit numbers, leaving the Thousands column unused on the adaptive route.
