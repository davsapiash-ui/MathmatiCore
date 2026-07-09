# Handoff Report

## 1. Observation

We performed a live test of the database security rules on the deployed Firebase instance of `mathimaticore` by executing the custom Node.js script `react-ts-version/test-rules.js` via the shell:

```powershell
cmd /c node react-ts-version/test-rules.js
```

The tool output was:
```
--- STARTING SECURITY RULES VERIFICATION ---

Testing Student Role: student_user1@mathmaticore.local
Logged in as Student successfully!
[STUDENT WRITE] SUCCESS
[STUDENT READ] SUCCESS. Data: { data: 'student_write', timestamp: 1783602407219 }
Logged out Student.

Testing Teacher Role: teacher_039604483@mathmaticore.local
Logged in as Teacher successfully!
[TEACHER WRITE] SUCCESS
[TEACHER READ] SUCCESS. Data: { data: 'student_write', timestamp: 1783602407219 }
Logged out Teacher.

Testing Admin Role: admin@mathmaticore.local
Logged in as Admin successfully!
[ADMIN WRITE] SUCCESS
[ADMIN READ] SUCCESS. Data: { data: 'student_write', timestamp: 1783602407219 }
Logged out Admin.

--- RULES VERIFICATION COMPLETE ---
```

In `database.rules.json`:
- Line 66: `$studentId` under `users/students` has `.read` rule:
  ```json
  ".read": "auth != null && (auth.token.email === $studentId + '@mathmaticore.local' || root.child('users/teachers/' + auth.token.email.replace('teacher_', '').replace('@mathmaticore.local', '')).exists() || auth.token.email === 'admin@mathmaticore.local')",
  ```
- Line 127: `telemetry_chunks` has `.read` rule:
  ```json
  ".read": "auth != null && (root.child('users/teachers/' + auth.token.email.replace('teacher_', '').replace('@mathmaticore.local', '')).exists() || auth.token.email === 'admin@mathmaticore.local')",
  ```

---

## 2. Logic Chain

1. **Rule Inheritance (Observation 2)**: Firebase Realtime Database rules cascade down. Any read or write permission granted at a parent node recursively grants read/write permissions to all descendant paths.
2. **Parent Access Granted (Observation 2)**: The parent node `/users/students/$studentId` has a `.read` rule that allows a student to read their own student record where `auth.token.email === $studentId + '@mathmaticore.local'`.
3. **Child Access Leak (Observation 1, 3)**: Since `telemetry_chunks` (at `/users/students/$studentId/telemetry_chunks`) is a descendant of `/users/students/$studentId`, the read permission granted at the parent node cascades down. 
4. **Vulnerability Confirmed (Observation 1)**: As demonstrated by the empirical test run, the student role successfully read the `telemetry_chunks` node (`[STUDENT READ] SUCCESS`).

---

## 3. Caveats

- We assumed that the live Firebase authentication and database endpoints configured in `react-ts-version/src/infrastructure/firebase.ts` represent the active production state of the project.
- No client-side bypasses or application logic (e.g. state management or routing) were tested; verification focused strictly on database-level security rules.

---

## 4. Conclusion

The `telemetry_chunks` Firebase security rules on the live deployment correctly allow student write access and teacher/admin read/write access. However, because parent read permissions cascade down in Firebase Realtime Database, **students are also able to read their own `telemetry_chunks` logs**, violating the strict isolation design. 

This security leak should be addressed by either:
1. Restructuring the paths to host `telemetry_chunks` outside the student's main node (e.g., `/telemetry_chunks/$studentId`).
2. Granularly applying `.read` rules to student sub-nodes instead of the parent `$studentId` node.

---

## 5. Verification Method

To verify these results independently:
1. Run the custom verification script:
   ```bash
   node react-ts-version/test-rules.js
   ```
2. Verify that the student read test outputs `[STUDENT READ] SUCCESS` instead of failing with a permission denied error.
