## 2026-07-09T12:16:27Z

You are the MathmatiCore LMS Repair Specialist (worker_1).
Your working directory is: C:\Users\david\Projects\MathmatiCore\.agents\worker_1.

Your task is to repair the MathmatiCore LMS project at C:\Users\david\Projects\MathmatiCore by implementing the following edits:

1. Update Hebrew task instructions:
   - In `react-ts-version/src/core/QMatrix.ts` (line 131): Replace the instruction mentioning double-click with manual dragging (e.g., "ניסוי מודרך: לחצו על כפתור 'הדגם פריטה' או גררו עשרת אחת לטור היחידות כדי לפרוט אותה. נסו זאת ואז הוסיפו את הייצוג החדש.").
   - In `react-ts-version/src/features/workspace/components/InteractiveTutorialPointer.tsx` (lines 15-16):
     - Replace line 15 with: `{ text: "קיבוץ: אם יש לכם 10 יחידות או יותר, גררו אחת מהן לטור העשרות כדי לקבץ אותן לעשרת.", x: 28, y: 55 },`
     - Replace line 16 with: `{ text: "פריטה: גררו עשרת אחת לטור היחידות כדי לפרוט אותה ל-10 יחידות.", x: 28, y: 55 },`
   - In `react-ts-version/src/features/workspace/useWorkspaceTour.ts` (line 55): Replace description with: `description: 'זכור: אם תאסוף 10 יחידות או יותר בטור אחד, תוכל לגרור אחת מהן לטור הבא כדי לקבץ אותן לעשרת שלמה!',`

2. Expose test callback in radar:
   - In `react-ts-version/src/features/workspace/useWorkspaceRadar.ts`: At the top of the `sendAlert` function (after creating the `alert` object), add a check to call `(window as any).__onRadarAlert?.(alert)` to allow programmatic interception of radar alerts during tests:
     ```typescript
     if (typeof window !== 'undefined' && (window as any).__onRadarAlert) {
       (window as any).__onRadarAlert(alert);
     }
     ```

3. Avoid cross-teacher data leakage:
   - In `react-ts-version/src/presentation/pages/TeacherDashboard.tsx` (around lines 393-398): Strictly filter the radar alerts shown in `allAlerts` to only include students in this teacher's class (i.e. remove the fallback `|| (a.rawStudentId && a.rawStudentId.startsWith('student_user'))`). Ensure it is strictly:
     ```typescript
     .filter(a => {
       // Only show alerts for students in this teacher's class (who are in the filtered 'students' state)
       const isMyStudent = !!students[a.rawStudentId] || Object.values(students).some((s: StudentData) => s.studentId === a.rawStudentId || s.name === a.rawStudentId);
       return isMyStudent;
     })
     ```

4. Rewrite E2E Regrouping Test:
   - Rewrite `react-ts-version/tests/e2e/regrouping.spec.ts` to verify that auto-regrouping does NOT happen (units stay at 10 after 10 drag-and-drops), and that manual regrouping does happen (dragging a block from units column to tens column groups them and resets units count to 0 and sets tens to 1). Ensure there is no try-catch skipping the core assertions.

5. Create E2E Passive Drifting Test:
   - Write a new E2E test file: `react-ts-version/tests/e2e/passive-drifting.spec.ts` that:
     - Navigates to `/workspace`.
     - Sets up a spy on `window.__onRadarAlert` using page.evaluate to collect triggered alerts.
     - Simulates 5 rapid deletions (using `window.__wsStore.getState().removeBlockClick('units')` or dragging units and deleting them rapidly within 1 second).
     - Verifies that exactly 1 `PASSIVE_DRIFTING` alert is triggered, and no subsequent alerts are triggered for 15 seconds.

6. Validation and Test execution:
   - Run `npm run verify-component` and `npm run test:e2e` inside `react-ts-version/` directory. Ensure all tests pass.
   - Run the specific regrouping and passive drifting tests to ensure they succeed.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Write your completion report and test results in handoff.md in your working directory.

## 2026-07-09T12:21:37Z

**Context**: New constraints from the user
**Content**: Please incorporate the following new requirements and updates immediately into your task:
1. Ensure the PlaceValueBoard does NOT show the 'thousands' (אלפים) column during Sessions 1 and 2.
   - Retrieve `sessionNumber` from `useWorkspaceStore` inside `PlaceValueBoard.tsx` and filter out `thousands` from PLACE_ORDER during rendering.
   - Inside `BlockPalette.tsx`, do NOT show the 'thousands' palette block during Sessions 1 and 2 (filter PALETTE_ITEMS based on sessionNumber from useWorkspaceStore).
2. Ensure no numbers in `SESSION1_TASKS` or `SESSION2_TASKS` (which is `QMATRIX_TASKS` in QMatrix.ts) exceed 1000. Review the tasks to verify this, and if any do, adjust them to be under 1000.
3. The user has manually moved `lastDriftAlertTime = useRef(0)` in `useWorkspaceRadar.ts` to the top level of the hook to fix a React hook violation. Make sure you do NOT overwrite this fix (leave `lastDriftAlertTime` at the top level, and just reference it inside useEffect).

## 2026-07-09T12:26:42Z

**Context**: Additional updates to task definitions (Curriculum Scaling Rule)
**Content**: Please implement the following changes in `src/data/sessionTasks.ts` to fully satisfy the Curriculum Scaling Rule:
1. Ensure all Session 1 and Session 2 tasks (in `sessionTasks.ts` and `QMatrix.ts`) have numbers strictly under 1,000 (which they do).
2. Expand Sessions 3 and 4 tasks in `src/data/sessionTasks.ts` up to 10,000 by scaling up the challenge tasks (e.g. s3_t5 and s4_t5) by a factor of 10:
   - For `s3_t5` (addition): change `numberA: 489, numberB: 175, correctAnswer: 664` to `numberA: 4890, numberB: 1750, correctAnswer: 6640`, and update `instructionHe` to reflect the new numbers "4890 + 1750".
   - For `s4_t5` (subtraction): change `numberA: 513, numberB: 285, correctAnswer: 228` to `numberA: 5130, numberB: 2850, correctAnswer: 2280`, and update `instructionHe` to reflect the new numbers "5130 - 2850".
This will ensure Sessions 3 and beyond expand up to 10,000 and utilize the thousands column.
