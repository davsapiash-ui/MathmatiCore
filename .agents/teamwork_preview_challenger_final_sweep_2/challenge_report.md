# Adversarial Challenge Report — Firebase Security Rules

## Challenge Summary

**Overall risk assessment**: HIGH

Due to the cascading nature of Firebase Realtime Database rules, the read permission granted at the parent path `/users/students/$studentId` overrides the specific read restriction defined at `/users/students/$studentId/telemetry_chunks` (and `/users/students/$studentId/telemetry_sessions`). As a result, students can read their own telemetry chunks and replay sessions, violating the security requirement that students should not be able to read this data.

---

## Challenges

### [High] Challenge 1: Cascading Read Permission Security Leak

- **Assumption challenged**: The assumption that defining a specific `.read` rule restricting access to teachers and admins on the child path `/users/students/$studentId/telemetry_chunks` prevents students from reading it.
- **Attack scenario**: A logged-in student (authenticated as `student_user1@mathmaticore.local`) executes a read operation on `/users/students/student_user1/telemetry_chunks`. Even though the local rule on `telemetry_chunks` restricts read access to teachers and admins, the parent path `/users/students/student_user1` grants read access to the student. Firebase RTDB grants access because of cascading read rules, and the read request succeeds.
- **Blast radius**: Students can read all background telemetry event logs, including cognitive tracking, hesitation events, undo history, and session replay chunks.
- **Mitigation**: 
  1. **Restructure Paths (Recommended)**: Move `telemetry_chunks` and `telemetry_sessions` to top-level paths outside of `/users/students/$studentId`, e.g., `/telemetry_chunks/$studentId` and `/telemetry_sessions/$studentId`. This isolates the telemetry data from parent read rules.
  2. **De-cascade Parent Read**: Alternatively, remove `.read` from `/users/students/$studentId` and instead define it on each specific student-readable child node (e.g., `profile`, `workspaceState`, `qMatrixResults`) while omitting it (or restricting it to teachers/admins) on `telemetry_chunks` and `telemetry_sessions`.

---

## Stress Test Results

We ran a custom Node.js test script against the live Firebase deployment to verify read/write permissions for the three principal roles: Student, Teacher, and Admin.

- **Scenario 1: Student Write to telemetry_chunks**
  - Path: `/users/students/student_user1/telemetry_chunks/chunk_stud`
  - Expected: `ALLOWED`
  - Actual: `ALLOWED (SUCCESS)`
  - Status: **PASS**

- **Scenario 2: Student Read from telemetry_chunks**
  - Path: `/users/students/student_user1/telemetry_chunks/chunk_stud`
  - Expected: `DENIED`
  - Actual: `ALLOWED (SUCCESS)` — *Security Vulnerability Confirmed*
  - Status: **FAIL**

- **Scenario 3: Teacher Write to telemetry_chunks**
  - Path: `/users/students/student_user1/telemetry_chunks/chunk_teach`
  - Expected: `ALLOWED`
  - Actual: `ALLOWED (SUCCESS)`
  - Status: **PASS**

- **Scenario 4: Teacher Read from telemetry_chunks**
  - Path: `/users/students/student_user1/telemetry_chunks/chunk_stud`
  - Expected: `ALLOWED`
  - Actual: `ALLOWED (SUCCESS)`
  - Status: **PASS**

- **Scenario 5: Admin Write to telemetry_chunks**
  - Path: `/users/students/student_user1/telemetry_chunks/chunk_admin`
  - Expected: `ALLOWED`
  - Actual: `ALLOWED (SUCCESS)`
  - Status: **PASS**

- **Scenario 6: Admin Read from telemetry_chunks**
  - Path: `/users/students/student_user1/telemetry_chunks/chunk_stud`
  - Expected: `ALLOWED`
  - Actual: `ALLOWED (SUCCESS)`
  - Status: **PASS**

---

## Unchallenged Areas

- **Firebase Authentication**: The registration/login flow using email and password domains (e.g., `@mathmaticore.local`) was not challenged beyond checking that credentials enforce correct role mapping in rules.
- **Other child nodes under `/users/students/$studentId`**: We did not perform read/write tests on nodes like `qMatrixResults` or `workspaceState`, as these were out of the scope of the telemetry rules sweep.
