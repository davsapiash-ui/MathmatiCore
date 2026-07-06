## 2026-07-06T18:17:41Z
You are the Worker subagent.
Your working directory is `c:\Users\david\Projects\MathmatiCore\.agents\worker_fix_audits_gen1`.
Your identity is `teamwork_preview_worker`.

Your task is to fix the critical Firebase security rules typo that is blocking teacher access and causing E2E test failures, verify the fix with E2E tests, and redeploy.

Please perform the following steps:
1. Open and inspect `c:\Users\david\Projects\MathmatiCore\database.rules.json`.
2. Fix the double `'teacher_'` prefix typo on lines 110 and 111:
   Change:
   `'teacher_' + 'teacher_' + $teacherId`
   To:
   `'teacher_' + $teacherId`
3. Execute the local build and E2E tests to verify the fix:
   - `npm run build`
   - `npm run test:e2e`
   (Note: run these inside the `react-ts-version` directory where package.json lives, or project root as appropriate). Verify that all E2E tests pass, especially `tests/e2e/chat-sync.spec.ts`.
4. Load the `auto_deploy` skill at `c:\Users\david\Projects\MathmatiCore\.agents\skills\auto_deploy\SKILL.md` (read it via view_file).
5. Follow the instructions to add, commit, and push the code:
   `git add .`
   `git commit -m "Auto-deploy: Fix teacher authentication rules typo in database.rules.json and verify E2E chat tests"`
   `git push`
6. Verify remote repository update and successful build output.
7. Write your findings, test logs, and git outputs to `handoff.md` under your working directory, and report back.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
