## 2026-07-06T18:03:12Z

You are the Worker subagent.
Your working directory is `c:\Users\david\Projects\MathmatiCore\.agents\worker_milestone1_gen1`.
Your identity is `teamwork_preview_worker`.

Your task is to implement the Stage 2 data flow fixes in the MathmatiCore LMS system.

Please perform the following steps:
1. Modify `react-ts-version/src/infrastructure/services/SocraticEngine.ts`:
   - Import `AuditLogger` from `@/infrastructure/services/AuditLogger`.
   - Update the signature of `generateAndQueueTasks` to accept optional `traceData`, `effort`, and `strategy` arguments:
     ```typescript
     static async generateAndQueueTasks(
       studentId: string,
       studentName: string,
       teacherId: string,
       qMatrix: QMatrixResults,
       traceData?: { hesitation_events: number; undo_clicks: number },
       effort?: number | null,
       strategy?: string | null
     ): Promise<void>
     ```
   - In `generateAndQueueTasks` (right before writing to database or at the end), save the persistent diagnostic report to `users/students/${studentId}/diagnosticReport` containing:
     ```typescript
     const reportRef = ref(database, `users/students/${studentId}/diagnosticReport`);
     await set(reportRef, {
       studentId,
       studentName,
       timestamp: Date.now(),
       clinicalDiagnosisHe,
       actionPlanHe,
       tasks,
       qMatrixResults: qMatrix,
       traceData: traceData || { hesitation_events: 0, undo_clicks: 0 },
       effort: effort !== undefined ? effort : null,
       strategy: strategy !== undefined ? strategy : null
     });
     ```
   - In `generateAndQueueTasks`, write an audit log entry for completing the mapping phase:
     ```typescript
     await AuditLogger.log(
       "COMPLETED_MAPPING_PHASE", 
       studentId, 
       `Student completed meeting 2 diagnostic mapping phase. Route: ${isYellowPath ? 'YELLOW' : 'GREEN'}.`
     );
     ```

2. Modify `react-ts-version/src/features/workspace/ReflectionScreen.tsx`:
   - In `handleProceed`, get the traceData of the current student from the Zustand store:
     `const store = useStore.getState();`
     `const studentTraceData = store.students[username]?.traceData || { hesitation_events: 0, undo_clicks: 0 };`
   - Pass this `studentTraceData`, `effort`, and `strategy` when calling `SocraticEngine.generateAndQueueTasks`:
     ```typescript
     await SocraticEngine.generateAndQueueTasks(username, studentName, resolvedTeacherId, qMatrix, studentTraceData, effort, strategy);
     ```

3. Modify `react-ts-version/src/presentation/pages/TeacherDashboard.tsx`:
   - In the student data mapping (around line 189), include the persistent report field:
     `diagnosticReport: row.diagnosticReport ?? null,`
   - In the inline Diagnostic Reports rendering tab block (around line 1098), resolve `socraticApproval` to retrieve from `s.diagnosticReport` if available:
     ```typescript
     const socraticApproval = s.diagnosticReport || pendingApprovals.find(a => a.studentId === selectedReplayStudentId);
     ```

4. Modify `react-ts-version/src/presentation/pages/TeacherDashboard/tabs/DiagnosticReportsTab.tsx`:
   - Resolve `socraticApproval` to pull from `s.diagnosticReport` if available:
     ```typescript
     const socraticApproval = s.diagnosticReport || pendingApprovals.find(a => a.studentId === selectedReplayStudentId);
     ```

5. Verify that the workspace compiles cleanly using `npx tsc --noEmit` and `npm run build` in the `react-ts-version` directory.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
