## 2026-07-10T09:53:44Z

You are teamwork_preview_worker_verification_3.
Your working directory is `c:\Users\david\Projects\MathmatiCore\.agents\teamwork_preview_worker_verification_3`.
Your parent conversation ID is `3980cf7d-ec28-4902-9773-b8814f8e732f`.

You are armed with the `auto_deploy` skill at `c:\Users\david\Projects\MathmatiCore\.agents\skills\auto_deploy\SKILL.md` and the `lms_stability_guard` skill at `c:\Users\david\Projects\MathmatiCore\.agents\skills\lms_stability_guard\SKILL.md`.

Tasks:
1. Fix Corrupted Hebrew:
   - Path: `react-ts-version/src/presentation/pages/TeacherDashboard.tsx`
   - In lines 1090-1141, replace the garbled Hebrew characters with clean Hebrew:
     - Line 1090: Replace `המלצת Socratic Engine וסיכו׳  ׳ בחון` with `המלצת Socratic Engine וסיכום אבחון` and `מדדי למידה סמויי׳ ` with `מדדי למידה סמויים`.
     - Line 1099: Replace `׳ ירועי היסוס (חשיבה ׳ רוכה)` with `אירועי היסוס (חשיבה ארוכה)`.
     - Line 1116: Replace `מצב נוכחי (ניתוח ׳ וטומטי):` with `מצב נוכחי (ניתוח אוטומטי):`.
     - Line 1119: Replace `׳ ירועי` with `אירועי`, `המעידי׳  על מ׳ בק` with `המעידים על מאבק`, and `מחיקות ׳ ו חזרות` with `מחיקות או חזרות`.
     - Line 1120: Replace `בויד׳ ו יחד ע׳ ` with `בווידאו יחד עם`.
     - Line 1121: Replace `נר׳ ה כי קיי׳ ` with `נראה כי קיים`, `(ב׳ מצעות בלוקי׳ )` with `(באמצעות בלוקים)`, `במ׳ ונך` with `במאונך`, `טר׳  נ׳ ספו` with `טרם נאספו`, and `נתוני׳` with `נתונים`.
     - Line 1122: Replace `בחשיבה ׳ לגברית` with `בחשיבה אלגברית`, `כמ׳ זניי׳ ` with `כמאזניים`, `מ׳ וד` with `מאוד`, `ומצי׳ ת` with `ומציאת`, and `נעל׳` with `נעלם`.
     - Line 1130: Replace `׳ דפטיבי למפגשי׳ ` with `אדפטיבי למפגשים`.
     - Line 1133: Replace `׳ בחון` with `אבחון`.
     - Line 1134: Replace `ל׳  נרשמו` with `לא נרשמו`, and `מה׳ בחון` with `מהאבחון`.
     - Line 1138: Replace `ל׳  נקבעה` with `לא נקבעה`.
     - Line 1141: Replace `תרגילי׳  רצויי׳ ` with `תרגילים רצויים`.
2. Fix useWorkspaceStore.ts Firebase Crash:
   - Path: `react-ts-version/src/application/useWorkspaceStore.ts`
   - In lines 807, 850, and 885, change `q_matrix_node: task?.targetNode` to conditional spreading: `...(task?.targetNode ? { q_matrix_node: task.targetNode } : {})` to prevent `undefined` properties in semantic event payloads.
3. Sanitize logSemanticEvent in useStore.ts:
   - Path: `react-ts-version/src/application/useStore.ts`
   - In `logSemanticEvent`, iterate through `newEvent` keys and delete any key whose value is `undefined` before syncing with Firebase.
4. Verify Compilation: Navigate to `react-ts-version` and run `npm run build` and `npx tsc --noEmit` to ensure it compiles with zero errors or warnings.
5. Run Tests: Run `npx playwright test` inside `react-ts-version` and ensure all E2E tests pass. If any tests fail, debug and resolve the issues.
6. Commit & Push: Git commit and push changes using the `auto_deploy` skill guidelines.
7. Save progress to `c:\Users\david\Projects\MathmatiCore\.agents\teamwork_preview_worker_verification_3\progress.md` continuously.
8. Write your findings to `c:\Users\david\Projects\MathmatiCore\.agents\teamwork_preview_worker_verification_3\handoff.md`.
9. Send a handoff message to your parent conversation ID: `3980cf7d-ec28-4902-9773-b8814f8e732f`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
