# Handoff Report - Codebase Investigation & Analysis

## 1. Observation

### UI Components & Drag-and-Drop Library
- **Drag-and-Drop Library**: The codebase uses `@dnd-kit/core` for drag-and-drop.
  - File: `src/features/workspace/board/DienesBlock.tsx` (Lines 1, 130-134):
    ```typescript
    import { useDraggable } from '@dnd-kit/core';
    ...
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
      id,
      data: { source, place: sourcePlace ?? place, renderPlace: place },
      disabled: isOverlay,
    });
    ```
  - File: `src/features/workspace/board/PlaceColumn.tsx` (Lines 2, 24-27):
    ```typescript
    import { useDroppable } from '@dnd-kit/core';
    ...
    const { setNodeRef, isOver } = useDroppable({
      id: `column-${place}`,
      data: { kind: 'column', place },
    });
    ```
  - File: `src/features/workspace/board/TrashZone.tsx` (Lines 1, 6):
    ```typescript
    import { useDroppable } from '@dnd-kit/core';
    ...
    const { setNodeRef, isOver } = useDroppable({ id: 'trash', data: { kind: 'trash' } });
    ```
  - File: `src/features/workspace/StudentWorkspacePage.tsx` (Lines 4-13, 308-311, 363-370) manages `DndContext` and `DragOverlay`.

### Regrouping and Decomposing Logic
- **Auto-Regrouping**: Auto-regrouping is **fully disabled** by default.
  - File: `src/core/placeValue.ts` (Lines 112-115, 131-133, 155-167):
    ```typescript
    export function resolveDrop(counts: PlaceCounts, input: DropInput, _scaffoldLevel: number): DropResult {
      // בעקבות אפיון פדגוגי מחמיר: הפיזיקה של בית המספרים לא עושה "קסמים". 
      // ביטול מוחלט של הקפצה אוטומטית (autoGroup = false) כדי לאפשר פריטה אמינה בשלבי חיסור מאוחרים.
      const autoGroup = false;
      ...
    ```
- **Grouping by Dragging**: Done by dragging a block to the adjacent higher column when the source column has at least 10 items.
  - File: `src/core/placeValue.ts` (Lines 155-167):
    ```typescript
      // הקפצה ע"י גרירה: adjacent higher only, requires >=10 in source.
      if (tgtIdx - srcIdx === 1) {
        if (counts[input.sourcePlace] >= 10) {
          const nextCounts = { ...counts, [input.sourcePlace]: counts[input.sourcePlace] - 10 };
          const { counts: finalCounts, events } = addBlock(nextCounts, targetPlace, autoGroup);
          return {
            ok: true,
            counts: finalCounts,
            regroupEvents: [{ from: input.sourcePlace, to: targetPlace, groups: 1 }, ...events],
            removed: input.sourcePlace,
          };
        }
        return { ok: false, reason: 'constraint', place: input.sourcePlace };
      }
    ```
- **Ungrouping (Decomposing) by Dragging**: Done by dragging a block to the adjacent lower column.
  - File: `src/core/placeValue.ts` (Lines 147-152):
    ```typescript
      // פריטה: adjacent lower only.
      if (srcIdx - tgtIdx === 1) {
        const res = ungroupBlock(counts, input.sourcePlace);
        if (!res) return { ok: false, reason: 'silent' };
        return { ok: true, counts: res.counts, regroupEvents: [], ungroupEvent: res.event };
      }
    ```
- **Double-clicking**: Double-clicking is **not implemented** anywhere in the code. A grep search for case-insensitive `double` inside `src` yielded `No results found`. Clicking on a block on the board simply removes it.
  - File: `src/features/workspace/board/DienesBlock.tsx` (Lines 164-169):
    ```typescript
          onClick={() => {
            if (onRemove) {
              radar.recordAction();
              onRemove();
            }
          }}
    ```
  - File: `src/features/workspace/board/PlaceColumn.tsx` (Lines 97-103):
    ```typescript
                  <DienesBlock
                    id={`col-${place}-${i}`}
                    place={place}
                    source="column"
                    onRemove={() => removeBlockClick(place)}
                    noEnter={i < renderCount - 1}
                  />
    ```

### State and Radar Tracking
- **State Properties**: Tracked in Zustand stores `useWorkspaceStore` and `useStore`.
- **Deletions and Undos**:
  - File: `src/application/useWorkspaceStore.ts` (Lines 64, 691-699, 707-728):
    - Tracks total deletions and undos in the current task via `undoCount` in `useWorkspaceStore`.
    - Drop onto trash: `applyDrop` sets `undoCount: isDelete ? s.undoCount + 1 : s.undoCount` and triggers `radar.recordDelete()`.
    - Single click block removal: `removeBlockClick` sets `undoCount: s.undoCount + 1` and triggers `radar.recordDelete()`.
    - Undo action: `undo` sets `undoCount: s.undoCount + 1` and triggers `radar.recordUndo()`.
- **Silent Radar & PASSIVE_DRIFTING**:
  - File: `src/features/workspace/useWorkspaceRadar.ts` (Lines 15-17, 79-97):
    - Defines window thresholds: `RAPID_DELETE_THRESHOLD = 3` and `RAPID_DELETE_WINDOW_MS = 3000` (3 seconds).
    - Logs timestamps of deletions and undos via `handleDriftAction()`.
    - Triggers `PASSIVE_DRIFTING` alert when 3 or more deletions/undos occur in a sliding window of 3 seconds:
      ```typescript
      function handleDriftAction() {
        hesitationArmed.current = true;
        armHesitationTimer();
        const now = Date.now();
        deleteTimestamps.current = [...deleteTimestamps.current.filter((t) => now - t < RAPID_DELETE_WINDOW_MS), now];
        if (deleteTimestamps.current.length >= RAPID_DELETE_THRESHOLD) {
          if (now - lastDriftAlertTime.current > 15000) {
            const totalDeletions = useWorkspaceStore.getState().undoCount || 0;
            sendAlert('PASSIVE_DRIFTING', { 
              recentDeletions: deleteTimestamps.current.length,
              totalDeletionsFromStart: totalDeletions
            });
            lastDriftAlertTime.current = now;
          }
          deleteTimestamps.current = [];
        }
      }
      ```
    - Alerts are sent silently using `push(ref(database, 'radar_alerts'), alert)`.
- **Hesitation Tracking**:
  - File: `useWorkspaceRadar.ts` (Lines 15, 68-77):
    - Sets an idle timeout of 30 seconds (`HESITATION_THRESHOLD_MS = 30000`).
    - If no activity (dragging, clicking, undoing, hint requests) resets the timer within 30s, it sends a `HESITATION` alert and increments `hesitationCount` in the store.
- **Firebase Sync**:
  - File: `src/infrastructure/services/FirebaseSyncService.ts` subscribes to `useWorkspaceStore` changes and publishes syncable states (like `counts`, `undoCount`, `hesitationCount`, `flowStatus`) to `users/students/${studentId}/workspaceState` on Firebase.

### Task Instructions Mismatch
- **Task definitions**: Located in `src/data/sessionTasks.ts` (for Sessions 1, 3, 4) and `src/core/QMatrix.ts` (for Session 2).
- **Mismatch 1: Double-Click Instruction in QMatrix**:
  - File: `src/core/QMatrix.ts` (Line 131):
    ```typescript
    subtaskInstructionHe: "ניסוי מודרך: לחיצה כפולה על עשרת אחת תפרק אותה ל-10 יחידות. נסו זאת ואז הוסיפו את הייצוג החדש.",
    ```
    *Analysis*: The text instructs the student to double click to decompose a ten, but double click is not implemented in the application; single click removes the block, and dragging is the only way to decompose.
- **Mismatch 2: Double-Click Instruction in InteractiveTutorialPointer**:
  - File: `src/features/workspace/components/InteractiveTutorialPointer.tsx` (Line 16):
    ```typescript
    { text: "פריטה: לחצו לחיצה כפולה על עשרת כדי לפרק אותה ל-10 יחידות.", x: 28, y: 55 },
    ```
    *Analysis*: Outdated instruction referencing the double click gesture that does not exist in the code.
- **Mismatch 3: Auto-Packing Button in Tour**:
  - File: `src/features/workspace/useWorkspaceTour.ts` (Line 55):
    ```typescript
    description: 'זכור: אם תאסוף 10 יחידות בטור אחד, יופיע כפתור שיאפשר לך לארוז אותן לעשרת אחת שלמה!',
    ```
    *Analysis*: Outdated tour description. No button appears for packing in `PlaceColumn.tsx` or `PlaceValueBoard.tsx`; grouping must be done manually by dragging.

### Tests in the Codebase
- **Testing Framework**: Playwright E2E tests are configured via `playwright.config.ts` (targeting port `5173` and production URL `https://mathimaticore.web.app`).
- **Test Files**:
  - `tests/e2e/regrouping.spec.ts` (Lines 4-40) tests that a student can automatically regroup 10 units into 1 ten when the scaffold level is low.
    *Analysis*: This test contains a `try-catch` block that catches errors and skips the test (`test.skip()`). Since auto-grouping is disabled in the codebase (`const autoGroup = false;`), this test would fail if executed synchronously without the try-catch safety net.
  - `tests/e2e/silent-radar.spec.ts` tests if undo counts are recorded correctly in the workspace store.
  - `tests/e2e/q-matrix.spec.ts` validates that the structure of the schema matches the specs.
  - `tests/rbac-flow.spec.ts` and `tests/ui-ux-flow.spec.ts` verify RBAC permissions and UI flows against the live app.
  - Other tests under `tests/e2e/` include `chat-sync.spec.ts`, `class-management-render.spec.ts`, `massive-simulation.spec.ts`, `rbac-visibility.spec.ts`, and `student-layout.spec.ts`.

---

## 2. Logic Chain

1. **Auto-Regrouping & Interaction Mechanics**:
   - `placeValue.ts` hardcodes `autoGroup = false`. Therefore, no auto-regrouping (auto conversion of 10 units into a ten) is executed upon block drops.
   - `DienesBlock.tsx` registers only `onClick` which calls `onRemove`. It has no `onDoubleClick` or `doubleClick` listener.
   - Consequently, double-clicking is a non-functioning gesture in the actual product. Manual drag-and-drop is the sole method of grouping (dragging 10 items to the adjacent higher column) and ungrouping (dragging a block to the adjacent lower column).

2. **Instructional Mismatches**:
   - `QMatrix.ts` (Line 131) and `InteractiveTutorialPointer.tsx` (Line 16) explicitly tell the student to double click to decompose a ten.
   - `useWorkspaceTour.ts` (Line 55) tells the student that a button will appear to package 10 units.
   - These instructions directly contradict the actual app behavior (since there is no double-click handler and no packaging button). They are likely legacy remnants.

3. **Radar Alerts & Triggering**:
   - `useWorkspaceRadar.ts` registers handlers via `registerRadar()` for store events (`recordDelete`, `recordUndo`).
   - Every deletion (drag to trash or click to delete) and undo increments `undoCount` in the Zustand store.
   - When a deletion or undo occurs, `handleDriftAction` adds the current timestamp to an array.
   - A sliding window filter removes timestamps older than 3 seconds.
   - If the window retains $\ge 3$ entries, it pushes a `PASSIVE_DRIFTING` alert payload (containing `recentDeletions` and `totalDeletionsFromStart: undoCount`) to the Firebase database under `/radar_alerts`.
   - The throttle prevents sending these alerts more than once every 15 seconds.

4. **Test Suite Mechanics**:
   - `tests/e2e/regrouping.spec.ts` attempts to test auto-regrouping.
   - Because `autoGroup = false`, the assertion `expect(unitsInside).toBeLessThan(10)` would fail.
   - However, because the test wraps the execution in a `try-catch` block that falls back to `test.skip()`, the failure is swallowed and the test is marked as skipped, preventing test suite failure during CI/CD.

---

## 3. Caveats

- **No Runtime Verification**: Under the `CODE_ONLY` network constraint and read-only investigation rules, Playwright tests could not be executed locally against a live browser. All findings regarding test behaviors and skips are derived from static analysis of the test code.
- **Firebase Realtime Database Rules**: The investigation of Firebase synchronization assumes standard Realtime Database behaviors as defined in the client code; actual security rules in the Firebase console were not inspected directly.

---

## 4. Conclusion

- **Interactions**: The application strictly enforces manual grouping and ungrouping via drag-and-drop. Auto-regrouping and double-clicking are completely absent in the codebase.
- **Radar Tracking**: Silent tracking for `PASSIVE_DRIFTING` and `HESITATION` is implemented correctly in `useWorkspaceRadar.ts` and synced dynamically to Firebase, matching the specifications.
- **Pedagogical Text Bugs**: There are three critical, incorrect instructions in the codebase that mention double-clicking or auto-packing buttons. These must be corrected to guide the student to drag-and-drop instead.
- **E2E Tests**: The regrouping E2E test is bypassed using `test.skip()` inside a `try-catch` because auto-regrouping is disabled. This test should be rewritten to verify manual drag-and-drop regrouping instead.

---

## 5. Verification Method

To verify the observations independently:
1. **Instruction Mismatches**:
   - Inspect `react-ts-version/src/core/QMatrix.ts` line 131 to confirm the double-click text.
   - Inspect `react-ts-version/src/features/workspace/components/InteractiveTutorialPointer.tsx` line 16 to confirm the double-click text.
   - Inspect `react-ts-version/src/features/workspace/useWorkspaceTour.ts` line 55 to confirm the auto-packing button description.
2. **Missing Gestures**:
   - Inspect `react-ts-version/src/features/workspace/board/DienesBlock.tsx` lines 164-169 to confirm the lack of `onDoubleClick` handler.
3. **Radar Logic**:
   - Inspect `react-ts-version/src/features/workspace/useWorkspaceRadar.ts` lines 81-96 to trace the sliding window alert logic.
4. **Test Suite**:
   - Run `npx playwright test` in the `react-ts-version` directory (with the server running) and observe that the regrouping E2E test is skipped.
