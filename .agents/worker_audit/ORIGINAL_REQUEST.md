## 2026-07-06T09:32:01Z

Your task is to implement all recommended security, QA, UX/UI, and architecture fixes in the MathmatiCore platform (`c:\Users\david\Projects\MathmatiCore\react-ts-version`), as described in the explorer's handoff report located at `c:\Users\david\Projects\MathmatiCore\.agents\explorer_audit\handoff.md`.

Specifically, you need to implement:
1. Database Rules (`database.rules.json`):
   - Restructure `routeStatus` and `traceData` write permissions under `users/students/$studentId` so the student client can write to them (using check for `$studentId` email and correct schema validation).
   - Restrict `replays/$sessionKey` write permissions to the respective student owner (`auth.token.email === $sessionKey + '@mathmaticore.local'`), teacher, or admin.
   - Transition `"chat_messages"` to a room-based schema if required, or restrict chat read/write access to valid participants. (Check useChatStore.ts or existing chat rooms configuration).
2. Socratic Engine Adaptivity (`src/infrastructure/services/SocraticEngine.ts`):
   - Dynamically push support tasks matching the failed Q-Matrix skill (number_line for estimation, small_change for small change, missing_element for missing addend) instead of only vertical addition.
3. Card Rendering (`src/features/workspace/tasks/TaskCard.tsx`):
   - Add cases to render `small_change` and `missing_element` components inside the standardTask rendering block (when sessionNumber !== 2).
4. Proceed Validation (`src/application/useWorkspaceStore.ts`):
   - In `proceedStandard()`, add evaluation logic for `number_line`, `small_change`, and `missing_element` tasks to prevent students from skipping them without validation.
5. UX/UI chat tools responsiveness:
   - Ensure the image upload and audio recording buttons in `AdminChatView.tsx` and `TeacherDashboard.tsx` chat areas are not hidden on mobile devices (remove `hidden md:flex` if appropriate or style them responsively).
6. Code quality and cleanups:
   - Remove any unused imports in `tests/rbac-flow.spec.ts` (e.g. `expect` if it raises oxlint warnings).
   - Ensure all files compile cleanly. Run `npm run build`, `npx tsc --noEmit` and `npm run lint` inside `react-ts-version` to ensure zero compilation or lint errors.
