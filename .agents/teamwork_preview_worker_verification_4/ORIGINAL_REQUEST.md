## 2026-07-10T10:40:08Z
You are teamwork_preview_worker_verification_4.
Your working directory is `c:\Users\david\Projects\MathmatiCore\.agents\teamwork_preview_worker_verification_4`.
Your parent conversation ID is `3980cf7d-ec28-4902-9773-b8814f8e732f`.

You are armed with the `auto_deploy` skill at `c:\Users\david\Projects\MathmatiCore\.agents\skills\auto_deploy\SKILL.md` and the `lms_stability_guard` skill at `c:\Users\david\Projects\MathmatiCore\.agents\skills\lms_stability_guard\SKILL.md`.

Tasks:
1. Fix remaining Mojibake in `react-ts-version/src/presentation/pages/TeacherDashboard.tsx`:
   - Line 43: Replace `ג€”` with `—` (em-dash).
   - Line 103: Replace `ג€”` with `—` (em-dash).
   - Line 631: Replace `נŸ“Š` with `📊` (bar chart emoji).
   - Line 1017: Replace `נŸŽ“` with `🎓` (graduation cap emoji).
   - Line 1043: Replace `נŸ“Š` with `📊` (bar chart emoji).
   - Line 1089: Replace `נŸ₪–` with `🤖` (robot emoji).
   - Line 1098: Replace `ג ±ן¸ ` with `⏱️` (timer emoji).
   - Line 1105: Replace `ג†©ן¸ ` with `↩️` (undo emoji).
   - Line 1115: Replace `נŸ“‹` with `📋` (clipboard emoji).
   - Line 1129: Replace `נŸŽ¯` with `🎯` (target emoji).
   - Line 1214: Replace `ג€¦` with `…` (ellipsis).
   - Line 1216: Replace `ג€¦` with `…` (ellipsis).
   - Line 1217: Replace `ג€”` with `—` (em-dash).
2. Configure Playwright configuration for serial E2E tests:
   - Open `react-ts-version/playwright.config.ts`.
   - Set `fullyParallel: false` (on line 5).
   - Set `workers: 1` globally (on line 8, instead of conditional `process.env.CI ? 1 : undefined`, make it `1`).
3. Verify compilation and test suite:
   - Navigate to `react-ts-version` and run `npm run build` and `npx tsc --noEmit` to ensure it compiles with zero warnings/errors.
   - Run the database reset `npx tsx reset_data.ts` to ensure database is clean.
   - Run the entire E2E test suite `npx playwright test` and ensure all E2E tests pass completely.
4. Auto-deploy: Commit and push changes using the `auto_deploy` skill guidelines.
5. Save your progress to `c:\Users\david\Projects\MathmatiCore\.agents\teamwork_preview_worker_verification_4\progress.md` continuously.
6. Write your findings to `c:\Users\david\Projects\MathmatiCore\.agents\teamwork_preview_worker_verification_4\handoff.md`.
7. Send a handoff message to your parent conversation ID: `3980cf7d-ec28-4902-9773-b8814f8e732f`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
