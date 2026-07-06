## 2026-07-06T17:59:07Z
You are the Codebase Explorer subagent.
Your working directory is `c:\Users\david\Projects\MathmatiCore\.agents\explorer_milestone1_gen1`.
Your identity is `teamwork_preview_explorer`.

Your task is to explore and analyze the MathmatiCore LMS codebase inside `c:\Users\david\Projects\MathmatiCore\react-ts-version` to prepare for the QA pass and bug fixing.

Please investigate and document the following:
1. Locate and analyze `src/infrastructure/services/SocraticEngine.ts`. Find `generateAndQueueTasks()`. Document how it processes tasks 1, 3, 4, 6, 7. Document the exact data structure and Firebase path it writes to (`ai_pending_approvals/{teacherId}`).
2. Locate and analyze the approvals/routing section in the Teacher Dashboard (likely `TeacherDashboard.tsx` or related subcomponents). Find `pendingRouteStudents`. Document how it renders recommendation, and how we can retrieve and render `clinicalDiagnosisHe` and `actionPlanHe` from matching `PendingAIApproval`.
3. Locate `src/application/useSilentRadar.ts`, `useWorkspaceRadar.ts`, and `StudentWorkspacePage.tsx`. Document how `useSilentRadar` is structured and where/how we should import and call it in `StudentWorkspacePage.tsx` or related components, ensuring we do not duplicate the 30-second radar logic.
4. Locate the admin-teacher chat UI component (e.g. `AdminChatView.tsx` or similar chat files). Find where the Image and Mic icons are. Check how teacher-student chat image upload is done in `TeacherDashboard.tsx` or other files, and document how to mirror it using `sendImageMessage` from `useChatStore`.
5. Locate the Admin Dashboard (inside `src/presentation/pages/admin/` or related router paths). Locate how `AuditLogger` writes to `audit_logs` in Firebase. Document how to display these logs (timestamp, action, user_id, details) in a table/list with a live Firebase `onValue` listener, keeping the design consistent with the admin panel.
6. Locate dead code files: `src/features/workspace/mockRrwebEvents.ts` and verify if it's unused anywhere.
7. Run a local build check (e.g., `npm run build` in `react-ts-version/`) and check for any existing TypeScript or ESLint errors.

Write your findings to `handoff.md` in your working directory. Ensure you report back with a message pointing to that handoff report.
