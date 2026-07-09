# Handoff Report — Firebase Realtime Database Security & Schema Audit

## 1. Observation

Direct observations of write operations and database rules show multiple path/security configuration discrepancies:

1. **`conceptMastery` write missing rule**:
   - *Code Call*: In `c:\Users\david\Projects\MathmatiCore\react-ts-version\src\infrastructure\services\FirebaseSyncService.ts` at line 191:
     ```typescript
     public async syncConceptMastery(studentId: string, masteryUpdates: any) {
       if (!studentId) return;
       const masteryRef = ref(database, `users/students/${studentId}/conceptMastery`);
       await update(masteryRef, masteryUpdates);
     }
     ```
   - *Rules*: `database.rules.json` does not contain any write rule for the key `conceptMastery` under the `students/$studentId` node (lines 13-88).

2. **`interaction_logs` telemetry write missing rule**:
   - *Code Call*: In `c:\Users\david\Projects\MathmatiCore\react-ts-version\src\infrastructure\TelemetryTracker.ts` at line 163:
     ```typescript
     const logsRef = ref(database, `users/students/${this.currentStudentId}/interaction_logs`);
     await push(logsRef, chunk);
     ```
   - *Rules*: `database.rules.json` does not contain any write rule for the key `interaction_logs` under the `students/$studentId` node.

3. **Student denied from writing `routeRecommendation`**:
   - *Code Call*: In `c:\Users\david\Projects\MathmatiCore\react-ts-version\src\application\useWorkspaceStore.ts` at line 378 (which executes on the student's browser):
     ```typescript
     store.setRouteRecommendation(studentId, route);
     ```
     This triggers `firebaseSyncService.syncRouteRecommendation(studentId, route)`, which attempts to write to `routeRecommendation` at line 200 of `FirebaseSyncService.ts`.
   - *Rules*: In `database.rules.json` at line 43:
     ```json
     "routeRecommendation": { 
       ".write": "auth != null && (root.child('users/teachers/' + auth.token.email.replace('teacher_', '').replace('@mathmaticore.local', '')).exists() || auth.token.email === 'admin@mathmaticore.local')",
       ".validate": "newData.isString() || !newData.exists()" 
     }
     ```
     This limits write permission to teachers or admins only. Students are denied.

4. **`set` on `$studentId` node is blocked**:
   - *Code Call*: In `c:\Users\david\Projects\MathmatiCore\react-ts-version\src\infrastructure\services\FirebaseSyncService.ts` at line 89:
     ```typescript
     set(studentRef, {
       profile: userData,
       workspaceState: this.getSyncableWorkspaceState(),
       lastActive: serverTimestamp(),
       completedMeeting2: false,
       highestCompletedMeeting: 0,
       routeStatus: null
     });
     ```
   - *Rules*: In `database.rules.json`, there is no `.write` rule at the `$studentId` node level (line 15). Write permissions are only delegated to individual children (e.g. `profile`, `workspaceState`).

5. **Teacher cannot delete chat room node**:
   - *Code Call*: In `c:\Users\david\Projects\MathmatiCore\react-ts-version\src\presentation\pages\TeacherDashboard\ClassManagement.tsx` at line 87:
     ```typescript
     await remove(ref(database, `chat_messages/${roomId}`)).catch(e => console.warn('chat', e));
     ```
   - *Rules*: In `database.rules.json` lines 115-124, `chat_messages` is writeable only by Admin, and `$roomId` has no `.write` rule (only `$messageId` has a write rule).

6. **Logical bug in Class Reset**:
   - *Code Call*: In `c:\Users\david\Projects\MathmatiCore\react-ts-version\src\presentation\pages\TeacherDashboard\ClassManagement.tsx` at line 63:
     ```typescript
     teacherId ? remove(ref(database, `ai_pending_approvals/${teacherId}/${studentId}`)).catch(() => {}) : Promise.resolve()
     ```
   - *Database Structure*: `SocraticEngine.ts` line 164 saves approvals under `ai_pending_approvals/${teacherId}/${approvalId}` (using a generated `approvalId`). The key is not `studentId`.

7. **Silent try/catch blocks**:
   - Audited 20 instances of try/catch/`.catch` blocks that silently log to the console or ignore failures on database write operations (e.g., `useChatStore.ts` line 133, `ReflectionScreen.tsx` line 135, `TelemetryTracker.ts` line 164, and `TeacherDashboard.tsx` line 1380).

---

## 2. Logic Chain

1. **Root write protection**: Root rules define `.write` as `false`. Thus, any write operation targeting a path is denied by default unless a specific write rule permits it at that path or an ancestor path.
2. **Missing Rules**: Because `conceptMastery` (M-01) and `interaction_logs` (M-02) do not have `.write` rules under `users/students/$studentId`, any client-side update or push to these nodes will fail with `PERMISSION_DENIED`.
3. **Student Route Mismatch**: `useWorkspaceStore` runs in the student's browser. It attempts to update `routeRecommendation` when evaluating the student's route. However, the database rule for `routeRecommendation` explicitly checks if the user is a teacher or admin. As a result, this student write fails.
4. **Cascading Set Mismatch**: The RTDB does not allow `set` on a parent path (like `users/students/$studentId`) if there is no `.write` rule on that parent path, even if all children are writeable. The write to the root student node is therefore blocked.
5. **Cascading Delete Mismatch**: Similarly, the teacher cannot delete the chat room node because there is no write permission at `chat_messages/$roomId`, only on the individual message keys.
6. **Logical path error**: The deletion of pending approvals targets `ai_pending_approvals/$teacherId/$studentId`. However, the engine saves pending approvals under `ai_pending_approvals/$teacherId/$approvalId`. Thus, resetting a student fails to delete their pending approval, leaving orphaned data.
7. **Silent error swallowing**: Because of the numerous catch blocks that only output to `console.error` or console warnings, all the above failures occur silently in the UI, leaving the user/student unaware of unsynced data.

---

## 3. Caveats

- We assumed that the standard Firebase Realtime Database rules behavior applies where write permissions cascade but cannot be granted to a parent node solely by having children rules.
- We did not deploy a live Firebase Database to test these rules directly, but the static analysis of the rules JSON syntax and structure is unambiguous.
- The `isASDMode` mentioned in the code has no relation to database schema or rules mismatches, and is not investigated.

---

## 4. Conclusion

- **Assessment**: There are 5 major discrepancies where the React application attempts to write data that the security rules actively block or fail to permit, and 1 logical bug that prevents proper data deletion during a class reset.
- **Action Plan**:
  1. Add `.write` rules for `conceptMastery` and `interaction_logs` under `users/students/$studentId` in `database.rules.json`.
  2. Change `routeRecommendation` write access to allow student writes OR refactor the student client so that it doesn't write this directly (e.g. have it only written by AI or teacher).
  3. Add a `.write` rule at the `users/students/$studentId` level that allows the owner student or teacher to write if they are modifying permitted fields.
  4. Add a `.write` rule at `chat_messages/$roomId` level allowing the matching student or teacher to write (and delete).
  5. Correct the deletion logic in `ClassManagement.tsx` to search for approvals matching the student's ID and delete them using the generated `approvalId`.
  6. Enhance try/catch blocks on critical writes (like approvals or diagnostics) to show UI feedback or alerts instead of swallowing errors.

---

## 5. Verification Method

To verify:
1. **Rule Mismatches Inspection**: Open `database.rules.json` and verify the lack of `conceptMastery` and `interaction_logs` under `users/students/$studentId`.
2. **Class Management Path Inspection**: Open `ClassManagement.tsx` and confirm line 63 attempts to delete `ai_pending_approvals/${teacherId}/${studentId}` while `SocraticEngine.ts` line 164 creates it under `ai_pending_approvals/${teacherId}/${approvalId}`.
3. **Execution Verification**:
   - Start the Vite app local server (`npm run dev`).
   - Run the E2E tests (`npm run test:e2e`).
   - Review console logs in the developer tools. Observe the console error warnings like `"Failed to flush telemetry chunk, re-queueing"` and `PERMISSION_DENIED` errors on chat deletions and concept mastery syncs.
