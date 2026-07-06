## 2026-07-06T09:26:13Z

You are the comprehensive worker subagent. Your working directory is: c:\Users\david\Projects\MathmatiCore\.agents\worker_comprehensive.
Your task is to implement all the security, memory leaks, sync loop, approvals merge, and visual token fixes across the MathmatiCore platform.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please execute the following changes:

1. **Security Rules (`database.rules.json`)**:
   - Remove parent `".write"` rules from `/students/$studentId` and `/users/students/$studentId` to prevent cascading permissions.
   - For `/students/$studentId` (lines 6-25) and `/users/students/$studentId` (lines 34-58):
     - Place the `".write"` rule individually on each child key: `name`, `studentId`, `classId`, `completedMeeting2`, `workspaceState`, `lastActive`, `profile`, and `qMatrixResults`. Use standard verification:
       `"auth != null && (auth.token.email === $studentId + '@mathmaticore.local' || root.child('users/teachers/' + auth.token.email.replace('teacher_', '').replace('@mathmaticore.local', '')).exists() || auth.token.email === 'admin@mathmaticore.local')"`
     - Restrict `/routeStatus` write access:
       `".write": "auth != null && (root.child('users/teachers/' + auth.token.email.replace('teacher_', '').replace('@mathmaticore.local', '')).exists() || auth.token.email === 'admin@mathmaticore.local' || (auth.token.email === $studentId + '@mathmaticore.local' && (newData.val() === 'PENDING' || !newData.exists() || data.val() === newData.val())))"`
     - Restrict `/routeRecommendation` and `/teacher_hint` write access to teachers and admins only.
     - Move telemetry chunks write access inside `telemetry_chunks/$chunkId` so student client can still submit chunks.
   - Restrict write access to `/classes`:
     `".write": "auth != null && auth.token.email === 'admin@mathmaticore.local'"`
   - Secure `/chat_messages/$messageId` and `/chat/$roomId/$messageId` write permissions so clients can only write under their own identity:
     `".write": "auth != null && (auth.uid === newData.child('senderId').val() || auth.token.email.replace('teacher_', '').replace('@mathmaticore.local', '') === newData.child('senderId').val() || auth.token.email === 'admin@mathmaticore.local' || auth.token.email === newData.child('senderId').val())"`

2. **Security Headers (`firebase.json`)**:
   - In `firebase.json` headers, add standard security headers for all paths (`"source": "**"`):
     - `X-Frame-Options`: `DENY`
     - `X-Content-Type-Options`: `nosniff`
     - `Referrer-Policy`: `strict-origin-when-cross-origin`
     - `Permissions-Policy`: `geolocation=(), microphone=(), camera=()`

3. **Firebase Env Keys (`react-ts-version/src/infrastructure/firebase.ts`)**:
   - Load Firebase configuration attributes dynamically from `import.meta.env` with current values as static fallback defaults. E.g.:
     `apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDupqh8inn1tZ1p-KIzV3RIMst7IdpUYPw"`

4. **Chat Memory Leak (`react-ts-version/src/application/useChatStore.ts`)**:
   - Save the returned unsubscribe function of `onValue` inside a file-local or state variable `chatUnsubscribe`.
   - Call `chatUnsubscribe()` in `useAuthStore.subscribe` upon logout (when not authenticated).

5. **Sync Service Memory Leak & Write Loop (`react-ts-version/src/infrastructure/services/FirebaseSyncService.ts`)**:
   - Store the unsubscribe callback of `onValue` inside the class property `this.unsubscribeFirebase`.
   - Execute `this.unsubscribeFirebase()` inside the `stopSync()` cleanup method.
   - Prevent the database write loop by checking if the incoming workspace state has actually changed compared to the current local state:
     ```typescript
     if (JSON.stringify(data.workspaceState) !== JSON.stringify(this.getSyncableWorkspaceState())) {
       this.isInitialLoad = true;
       useWorkspaceStore.setState(data.workspaceState);
       this.isInitialLoad = false;
     }
     ```

6. **Stale UI Approvals (`react-ts-version/src/presentation/pages/TeacherDashboard.tsx`)**:
   - Split `pendingApprovals` state into two lists: `teacherApprovals` and `fallbackApprovals`.
   - Update them independently directly from the database listeners (`setTeacherApprovals(handleData(snap))` and `setFallbackApprovals(handleData(snap))`).
   - Combine them on-the-fly using `useMemo` (e.g. `pendingApprovals = useMemo(...)` with duplicates filtered out).

7. **Floating Promises (`react-ts-version/src/features/workspace/ReflectionScreen.tsx`)**:
   - Rewrite the reflection submit handler `handleProceed` to be `async`.
   - Use `await` on the asynchronous update and SocraticEngine generation promises so they resolve completely before calling `navigate('/hub')`. Remove the legacy `setTimeout` window delay.

8. **UI/UX Polish / Design Tokens**:
   - In `VerticalAdditionTask.tsx`: Replace hardcoded background/border/text colors with design token CSS variables (`bg-ws-surface`, `border-ws-surface2`, `text-ws-ink`).
   - In `MissingElementTask.tsx`: Replace `bg-white` with `bg-ws-surface`.
   - In `WorkspaceTopbar.tsx`: Review and replace hex colors or static values with design system CSS variables where applicable.

9. **Verification**:
   - Confirm everything builds cleanly with zero errors by running typescript checking (`tsc --noEmit`), lint checking (`npm run lint`), and production building (`npm run build`).

Document all implementation details, diffs, and verification commands/results in `c:\Users\david\Projects\MathmatiCore\.agents\worker_comprehensive\handoff.md`. When complete, message orchestrator ID f99981c8-4422-4902-b78d-a05deeaaea5c with the report path.
