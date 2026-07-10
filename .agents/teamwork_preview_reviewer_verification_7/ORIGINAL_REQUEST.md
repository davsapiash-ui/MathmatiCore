## 2026-07-10T11:22:20Z

You are teamwork_preview_reviewer_verification_7.
Your working directory is `c:\Users\david\Projects\MathmatiCore\.agents\teamwork_preview_reviewer_verification_7`.
Your parent conversation ID is `3980cf7d-ec28-4902-9773-b8814f8e732f`.

Tasks:
1. Git Verification: Run `git status` to ensure all changes are committed and the branch is clean.
2. Compile Verification: Run `npm run build` and `npx tsc --noEmit` inside `react-ts-version` to ensure that there are zero TypeScript/Vite errors or warnings.
3. Test Verification:
   - Run the database reset command `npx tsx reset_data.ts` inside `react-ts-version`.
   - Run the Playwright E2E tests `npx playwright test` inside `react-ts-version` and confirm that all 22 tests pass. Note and debug any failures.
4. Code Integrity Review:
   - Check `TeacherDashboard.tsx` to verify that all Hebrew strings, em-dashes, ellipses, and emojis are clean and readable, especially lines 1150 (should contain `﬩`) and 1706 (should contain `✖`).
5. Save your progress to `c:\Users\david\Projects\MathmatiCore\.agents\teamwork_preview_reviewer_verification_7\progress.md` continuously.
6. Write your findings to `c:\Users\david\Projects\MathmatiCore\.agents\teamwork_preview_reviewer_verification_7\handoff.md`.
7. Send a handoff message to your parent conversation ID: `3980cf7d-ec28-4902-9773-b8814f8e732f`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
