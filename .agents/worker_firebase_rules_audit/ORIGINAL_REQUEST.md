## 2026-07-09T18:08:40Z
You are the Firebase Rules & Data Flow Worker.
Your working directory is: c:\Users\david\Projects\MathmatiCore\.agents\worker_firebase_rules_audit

Your task is to implement the fixes for the Firebase Realtime Database rules mismatches, logical bugs, and silent try/catch blocks, and update the specifications.

MANDATORY INTEGRITY WARNING:
> DO NOT CHEAT. All implementations must be genuine. DO NOT
> hardcode test results, create dummy/facade implementations, or
> circumvent the intended task. A Forensic Auditor will independently
> verify your work. Integrity violations WILL be detected and your
> work WILL be rejected.

Please perform the following operations:

1. Update c:\Users\david\Projects\MathmatiCore\database.rules.json:
   - Add a `.write` rule at the `users/students/$studentId` level (under `$studentId` key directly, on line 16 or adjacent) so that students, teachers, and admins have parent-level write access to their student node. This resolves the blocked `set` on the student node, and cascades write permission to `conceptMastery`, `interaction_logs`, and `routeRecommendation`:
     ```json
     ".write": "auth != null && (auth.token.email === $studentId + '@mathmaticore.local' || root.child('users/teachers/' + auth.token.email.replace('teacher_', '').replace('@mathmaticore.local', '')).exists() || auth.token.email === 'admin@mathmaticore.local')"
     ```
   - Add a `.write` rule under `"chat_messages": { "$roomId": { ... } }` level to permit deleting the room (when `newData.exists() === false`):
     ```json
     ".write": "auth != null && (auth.token.email === $roomId + '@mathmaticore.local' || root.child('users/teachers/' + auth.token.email.replace('teacher_', '').replace('@mathmaticore.local', '')).exists() || auth.token.email === 'admin@mathmaticore.local') && !newData.exists()"
     ```

2. Update c:\Users\david\Projects\MathmatiCore\react-ts-version\src\presentation\pages\TeacherDashboard\ClassManagement.tsx:
   - In `handleResetStudent` (around line 63), remove the incorrect call `teacherId ? remove(ref(database, \`ai_pending_approvals/\${teacherId}/\${studentId}\`)) ...` from `Promise.all`.
   - Add code to query `ai_pending_approvals/${teacherId}`, find any approvals where `studentId` matches the resetting student's ID, and call `remove` on those specific approval nodes. Use the pattern used for cleaning up `radar_alerts` and `reflections`.

3. Fix silent error handling (ensure UI and user are properly notified):
   - c:\Users\david\Projects\MathmatiCore\react-ts-version\src\application\useChatStore.ts:
     - In `sendMessage` and `sendImageMessage`, add a `.catch()` block to the `firebaseSet` call. If it fails, log the error to the console and notify the user with an alert: `alert("שגיאה בשליחת ההודעה. אנא נסה שוב.");`.
   - c:\Users\david\Projects\MathmatiCore\react-ts-version\src\features\workspace\ReflectionScreen.tsx:
     - In the try/catch block at the bottom of the submit routine (around line 135), if `generateAndQueueTasks` or `reflections` push fails, show an alert: `alert("אירעה שגיאה בשמירת הרפלקציה והכנת המשימות הבאות. אנא נסה שוב.");` and `return;` (prevent navigating to `/hub` so they can retry).
   - c:\Users\david\Projects\MathmatiCore\react-ts-version\src\presentation\pages\TeacherDashboard.tsx:
     - In the route approval `approveTasks` (around line 1380) and rejection `rejectTasks` (around line 1401) try/catch blocks, add code to alert the teacher if writing to Firebase fails (e.g. `alert("שגיאה באישור המשימות ב-Firebase. אנא ודא שיש לך הרשאות מתאימות וחיבור לרשת.");` and `alert("שגיאה בדחיית המשימות ב-Firebase. אנא ודא שיש לך הרשאות מתאימות וחיבור לרשת.");`).

4. Update/Create documentation:
   - Create the file `c:\Users\david\Projects\MathmatiCore\AGENTS.md` containing the project-scoped rules and detailing the updated database schema structures, paths, and error boundaries.
   - Update the 4 specification files under `c:\Users\david\Projects\MathmatiCore\מסמכי אפיון` (add timestamp header at the top of each file: `> **תאריך עדכון אחרון: DD.MM.YYYY HH:MM**` with current date and time e.g., 09.07.2026 21:10) documenting:
     - The updated database schema (specifically, `conceptMastery` and `interaction_logs` under `$studentId`).
     - The updated Firebase database permissions and write rules.
     - The error handling and UI propagation mechanisms.

5. Verify that the project compiles cleanly:
   - Change directory to `c:\Users\david\Projects\MathmatiCore\react-ts-version` and run `npm run build` to confirm 0 compilation or linting errors.

When done, write your report to `handoff.md` in your working directory and notify the parent (main agent) with the path.
