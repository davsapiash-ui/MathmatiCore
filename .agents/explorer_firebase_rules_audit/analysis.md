# Firebase Realtime Database Security & Schema Mismatch Audit

This report documents the security rules, payload schemas, write operations, path mappings, discrepancies, and error-handling blocks identified in the MathmatiCore repository.

---

## 1. Mismatches & Security Rule Discrepancies

The following table summarizes the discrepancies identified between the frontend codebase write operations and the security rules in `database.rules.json`.

| ID | Path/Node | Frontend File & Line | Operation | Rule Condition in `database.rules.json` | Mismatch / Issue Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **M-01** | `users/students/$studentId/conceptMastery` | `FirebaseSyncService.ts:191`<br>`useWorkspaceStore.ts:368`<br>`SocraticEngine.ts:191` | `update` | No write rule defined for `conceptMastery` under `users/students/$studentId`. Root `.write` is `false`. | **Blocked Write**: Since `conceptMastery` lacks a `.write` rule under `$studentId`, any attempt by the student client to write here will fail with `PERMISSION_DENIED`. The teacher dashboard will not receive updated mastery metrics. |
| **M-02** | `users/students/$studentId/interaction_logs` | `TelemetryTracker.ts:163` | `push` | No write rule defined for `interaction_logs` under `users/students/$studentId`. Root `.write` is `false`. | **Blocked Write & Memory Leak**: Flusher fails to push telemetry logs. The `.catch` re-queues failed chunks, causing an infinite loop of failing writes that degrades performance and leaks memory. |
| **M-03** | `users/students/$studentId/routeRecommendation` | `useWorkspaceStore.ts:378`<br>`useStore.ts:268`<br>`FirebaseSyncService.ts:200` | `update` | `.write`: Only teachers or admins (`root.child('users/teachers/...').exists()`). | **Blocked Write**: The student's device attempts to write to `routeRecommendation` during task progression, but is blocked because students do not have write access to this field. |
| **M-04** | `users/students/$studentId` | `FirebaseSyncService.ts:89` | `set` | No `.write` rule at the `$studentId` level itself; rules are defined only on individual children. | **Blocked Write**: Setting the entire student node fails because parent-level write access is missing. New student initialization on login fails. |
| **M-05** | `chat_messages/$roomId` | `ClassManagement.tsx:87` | `remove` | `.write` at `chat_messages` level is admin-only. No `.write` rule exists at `$roomId` level (only `$messageId`). | **Blocked Write**: The teacher dashboard attempt to delete the student chat room fails with `PERMISSION_DENIED` since teachers are not admins. |
| **M-06** | `ai_pending_approvals/$teacherId/$studentId` | `ClassManagement.tsx:63` | `remove` | Path validation requires `studentId` and `tasks` fields. | **Logical Bug / Orphaned Data**: Pending approvals are stored as `ai_pending_approvals/$teacherId/$approvalId` (using generated `approvalId`). The teacher dashboard attempts to delete using `studentId` as the key, targeting the wrong path and leaving orphaned records. |

---

## 2. Detailed Database Write Operations Mapping

### 1. `useChatStore.ts`
* **`sendMessage`** (Line 80-82)
  * **Path**: `chat_messages/${roomId}/${newMsgRef.key}` (where `roomId` is student's UID or target student's UID).
  * **Payload Schema**:
    ```json
    {
      "id": "string",
      "senderId": "string",
      "senderName": "string",
      "receiverId": "string",
      "text": "string",
      "timestamp": "number",
      "read": false
    }
    ```
  * **Cross-Reference**: Matches rule condition. Allowed for student (owner of `roomId`) and teachers/admins, checking sender/receiver IDs.
* **`sendImageMessage`** (Line 103-105)
  * **Path**: `chat_messages/${roomId}/${newMsgRef.key}`
  * **Payload Schema**: Same as `sendMessage`, with `"text": ""` and adding `"imageUrl": "string" (base64 data URL)`.
  * **Cross-Reference**: Matches rule condition.
* **`markAsRead`** (Line 131)
  * **Path**: `chat_messages/${roomId}/${msg.id}/read`
  * **Payload Schema**: `true`
  * **Cross-Reference**: Allowed for receivers matching the message's `receiverId` or `senderId`.

### 2. `ReflectionScreen.tsx`
* **`push reflection`** (Line 72)
  * **Path**: `reflections/$reflectionId`
  * **Payload Schema**:
    ```json
    {
      "effort": "number (1-4)",
      "strategy": "string (comma-separated list of strategies)",
      "timestamp": "number",
      "student": {
        "id": "string (student's UID)"
      }
    }
    ```
  * **Cross-Reference**: Matches rule condition. Payload keys match requirements (`effort`, `strategy`, `timestamp`, `student`), and `student/id` matches `auth.token.email.replace('@mathmaticore.local', '')`.

### 3. `SocraticEngine.ts`
* **`generateAndQueueTasks` (Pending AI Approval)** (Line 164-166)
  * **Path**: `ai_pending_approvals/${teacherId}/${approvalId}`
  * **Payload Schema**:
    ```json
    {
      "studentId": "string",
      "studentName": "string",
      "timestamp": { ".sv": "timestamp" }, // serverTimestamp()
      "tasks": "SessionTask[]",
      "clinicalDiagnosisHe": "string",
      "actionPlanHe": "string"
    }
    ```
  * **Cross-Reference**: Matches rule condition. Wildcard `$approvalId` validation `.validate` checks for `studentId` and `tasks` fields.
* **`generateAndQueueTasks` (Diagnostic Report)** (Line 175-176)
  * **Path**: `users/students/${studentId}/diagnosticReport`
  * **Payload Schema**:
    ```json
    {
      "studentId": "string",
      "studentName": "string",
      "timestamp": "number",
      "clinicalDiagnosisHe": "string",
      "actionPlanHe": "string",
      "tasks": "SessionTask[]",
      "qMatrixResults": "QMatrixResults",
      "conceptMastery": "Record<string, number>",
      "traceData": "Record<string, number>",
      "effort": "number | null",
      "strategy": "string | null"
    }
    ```
  * **Cross-Reference**: Matches rule condition. Allowed for student, teacher, or admin.
* **`generateAndQueueTasks` (Update student node)** (Line 191)
  * **Path**: `users/students/${studentId}`
  * **Payload Schema**:
    ```json
    {
      "qMatrixResults": "QMatrixResults",
      "conceptMastery": "MasteryProfile",
      "traceData": "TraceData"
    }
    ```
  * **Cross-Reference**: **Blocked (Partial)**. `conceptMastery` write will fail with `PERMISSION_DENIED` because it lacks a write rule, causing the whole update transaction to abort.
* **`approveTasks`** (Line 226-235)
  * **Path**: `approved_tasks/${studentId}`
  * **Payload Schema**: `SessionTask[]`
  * **Cross-Reference**: Matches rule condition. Allowed for teachers and admins.
  * **Path**: `ai_pending_approvals/${teacherId}/${approvalId}` (Line 230) - deletes node. Matches rule.
  * **Path**: `users/students/${studentId}/routeStatus` (Line 234) - payload `"APPROVED"`. Matches rule.
* **`rejectTasks`** (Line 243)
  * **Path**: `ai_pending_approvals/${teacherId}/${approvalId}` - deletes node. Matches rule.

### 4. `StudentWorkspacePage.tsx`
* **`handleAcknowledgeHint`** (Line 85)
  * **Path**: `users/students/${user.uid}/teacher_hint` - deletes hint. Matches rule.
* **`Telemetry flusher (rrweb)`** (Line 151)
  * **Path**: `users/students/${uid}/telemetry_sessions/${sessionId}/${chunkId}`
  * **Payload Schema**: `"string" (JSON string of batch events)`
  * **Cross-Reference**: Matches rule validation `.validate: "newData.isString() || ..."` under `$sessionId/$chunkId`.

### 5. `useWorkspaceRadar.ts`
* **`sendAlert` (Radar Alerts queue)** (Line 63)
  * **Path**: `radar_alerts/$alertId`
  * **Payload Schema**:
    ```json
    {
      "id": "string",
      "type": "string",
      "studentId": "string",
      "student": "string",
      "username": "string",
      "studentName": "string",
      "taskId": "string",
      "sessionNumber": "number",
      "timestamp": "number",
      "unread": true,
      // and dynamic alert payload details
    }
    ```
  * **Cross-Reference**: Matches rule condition. Payload has `type`, `timestamp`, `studentId` and studentId matches email prefix.
* **`sendAlert` (Radar Alerts history)** (Line 65)
  * **Path**: `users/students/${uid}/radar_history/$alertId`
  * **Payload Schema**: Same as above.
  * **Cross-Reference**: Matches rule condition.

### 6. `TelemetryTracker.ts`
* **`fireAlert`** (Line 134)
  * **Path**: `radar_alerts/$alertId`
  * **Payload Schema**: Same as `useWorkspaceRadar.ts`.
  * **Cross-Reference**: Matches rule condition.
* **`flushEvents`** (Line 163)
  * **Path**: `users/students/${this.currentStudentId}/interaction_logs/$logId`
  * **Payload Schema**: `TelemetryEvent[]`
  * **Cross-Reference**: **Blocked**. `interaction_logs` has no `.write` rule.

### 7. `AuditLogger.ts`
* **`log`** (Line 22)
  * **Path**: `audit_logs/$logId`
  * **Payload Schema**:
    ```json
    {
      "action": "string",
      "user_id": "string",
      "details": "string | null",
      "timestamp": { ".sv": "timestamp" }
    }
    ```
  * **Cross-Reference**: Matches rule condition. Allowed for any authenticated user.

### 8. `FirebaseSyncService.ts`
* **`startSync` (forceReload flag clearing)** (Line 61)
  * **Path**: `users/students/${studentId}`
  * **Payload Schema**: `{ forceReload: null }`
  * **Cross-Reference**: Matches rule condition.
* **`startSync` (set student profile)** (Line 89)
  * **Path**: `users/students/${studentId}`
  * **Payload Schema**:
    ```json
    {
      "profile": "AuthUser",
      "workspaceState": "WorkspaceState",
      "lastActive": { ".sv": "timestamp" },
      "completedMeeting2": false,
      "highestCompletedMeeting": 0,
      "routeStatus": null
    }
    ```
  * **Cross-Reference**: **Blocked**. Cannot call `set` on `$studentId` node because it lacks parent-level write permission.
* **`startSync` (update workspaceState)** (Line 124)
  * **Path**: `users/students/${studentId}`
  * **Payload Schema**: `{ workspaceState, lastActive }`
  * **Cross-Reference**: Matches rule. The update modifies paths `workspaceState` and `lastActive` which have write permission.
* **`registerTeacher`** (Line 175)
  * **Path**: `users/teachers/${teacherData.id}`
  * **Payload Schema**: `teacherData` object.
  * **Cross-Reference**: Matches rule. Allowed if teacher matches id and it doesn't exist yet, or if admin.
* **`syncQMatrix`** (Line 182)
  * **Path**: `users/students/${studentId}/qMatrixResults`
  * **Payload Schema**: `Partial<QMatrix>` (keys are strings).
  * **Cross-Reference**: Matches rule validation.
* **`syncTraceData`** (Line 188)
  * **Path**: `users/students/${studentId}/traceData`
  * **Payload Schema**: `Partial<TraceData>`
  * **Cross-Reference**: Matches rule validation (checks `hesitation_events` and `undo_clicks` numbers).
* **`syncConceptMastery`** (Line 194)
  * **Path**: `users/students/${studentId}/conceptMastery`
  * **Payload Schema**: `MasteryProfile` object.
  * **Cross-Reference**: **Blocked**. No `.write` rule exists for `conceptMastery`.
* **`syncRouteRecommendation`** (Line 200)
  * **Path**: `users/students/${studentId}`
  * **Payload Schema**: `{ routeRecommendation, routeStatus: 'PENDING' }`
  * **Cross-Reference**: **Blocked (for Student)**. Students are blocked from writing `routeRecommendation`.
* **`syncMeeting2Complete`** (Line 206)
  * **Path**: `users/students/${studentId}`
  * **Payload Schema**: `{ completedMeeting2: true }`
  * **Cross-Reference**: Matches rule.
* **`syncHighestCompletedMeeting`** (Line 212)
  * **Path**: `users/students/${studentId}`
  * **Payload Schema**: `{ highestCompletedMeeting: number }`
  * **Cross-Reference**: Matches rule validation.
* **`syncApproveRoute`** (Line 218)
  * **Path**: `users/students/${studentId}`
  * **Payload Schema**: `{ routeStatus: 'APPROVED' }`
  * **Cross-Reference**: Matches rule.

### 9. `TeacherDashboard.tsx`
* **`handleHintClick`** (Line 301)
  * **Path**: `users/students/${studentId}/teacher_hint`
  * **Payload Schema**: `{ timestamp: number, message: string }`
  * **Cross-Reference**: Matches rule. Allowed for teachers.
* **`handleAlertResponse` (intervention record)** (Line 437)
  * **Path**: `users/students/${alert.rawStudentId}/traceData/interventions/${interventionId}`
  * **Payload Schema**:
    ```json
    {
      "timestamp": "number",
      "alertType": "string",
      "responseType": "string",
      "responseText": "string"
    }
    ```
  * **Cross-Reference**: Matches rules. Allowed under `traceData`.
* **`handleAlertResponse` (dismiss alert)** (Line 452)
  * **Path**: `radar_alerts/${alert.firebaseKey}` - deletes alert. Matches rules.

### 10. `ClassManagement.tsx`
* **`handleResetStudent` (update student node)** (Line 36)
  * **Path**: `users/students/${studentId}`
  * **Payload Schema**: Wipes progress fields and resets `workspaceState`.
  * **Cross-Reference**: Matches rules. Allowed for teachers.
* **`handleResetStudent` (clear related data paths)** (Lines 59-63, 77, 87, 101)
  * **Paths**:
    * `users/students/${studentId}/telemetry_sessions` - Allowed.
    * `users/students/${studentId}/teacher_hint` - Allowed.
    * `approved_tasks/${studentId}` - Allowed.
    * `replays/${studentId}` - Allowed.
    * `ai_pending_approvals/${teacherId}/${studentId}` - **Logical bug** (Approval IDs are generated keys, not studentId).
    * `radar_alerts/${key}` - Allowed.
    * `chat_messages/${roomId}` - **Blocked**. No `.write` rule exists at `$roomId` level.
    * `reflections/${key}` - Allowed.

### 11. `AdminOverview.tsx`
* **`handleDataCleanup`** (Line 102)
  * **Path**: `replays` (updating subpaths `replays/${uid}/${timestampStr}` to `null`).
  * **Payload Schema**: `{ "studentId/timestamp": null }`
  * **Cross-Reference**: Matches rules. Allowed for Admin.

---

## 3. Audit of try/catch & `.catch` Error-Handling Blocks

The following list details all identified try/catch or `.catch` blocks wrapping database writes, classifying them by whether they propagate/notify users or are silent/log-only.

### A. Silent / Log-Only Try-Catch Blocks (No UI Notification / State Update)
These blocks catch errors and print them to the console but do not notify the user or update the UI.

1. **`useChatStore.ts` — Line 133**
   * **Code**: `update(ref(database), updates).catch(console.error);`
   * **Consequence**: If marking a message as read fails (e.g. permission error), it logs to console but the UI remains in a state showing the messages as read locally, causing a mismatch with the DB.

2. **`ReflectionScreen.tsx` — Line 135**
   * **Code**:
     ```typescript
     try {
       await push(ref(database, 'reflections'), ...);
       ...
     } catch (e) {
       console.error("Failed to save reflection:", e);
     }
     ```
   * **Consequence**: If saving the reflection or generating/queuing tasks fails, the student is simply navigated to `/hub` without any warning. They might think they completed meeting 2 successfully, but their dashboard records are missing or their meeting 3 tasks are ungenerated/unapproved.

3. **`StudentWorkspacePage.tsx` — Line 152**
   * **Code**: `.catch(err => console.error('Telemetry push failed:', err))`
   * **Consequence**: If pushing rrweb telemetry fails, it logs to console. No UI action is needed as this is background logging, but is silent.

4. **`useWorkspaceRadar.ts` — Lines 63 & 65**
   * **Code**: `.catch(() => {})`
   * **Consequence**: Silent monitoring alerts are completely swallowed. Mismatches or network issues are dropped without a single log.

5. **`TelemetryTracker.ts` — Line 135**
   * **Code**: `catch (e) { console.warn('Failed to send alert', e); }`
   * **Consequence**: Silent logging of alert failures.

6. **`TelemetryTracker.ts` — Line 164**
   * **Code**:
     ```typescript
     } catch (error) {
       console.warn("Failed to flush telemetry chunk, re-queueing", error);
       this.pendingEvents = [...chunk, ...this.pendingEvents];
     }
     ```
   * **Consequence**: Since the write fails due to `PERMISSION_DENIED`, this results in an infinite re-queueing loop. The console accumulates warnings, and memory leaks.

7. **`AuditLogger.ts` — Line 28**
   * **Code**: `catch (e) { console.error("Failed to write audit log:", e); }`
   * **Consequence**: Logs logger failure.

8. **`FirebaseSyncService.ts` — Line 63**
   * **Code**: `catch((err) => { console.error("Failed to clear forceReload flag:", err); ... })`
   * **Consequence**: Reloads the browser even if clearing the flag fails.

9. **`FirebaseSyncService.ts` — Line 98**
   * **Code**: `catch (e) { console.error("Firebase sync error:", e); }`
   * **Consequence**: Swallows initial load/setup error.

10. **`useStore.ts` — Lines 192, 209, 219, 228, 242, 243, 254, 268, 277**
    * **Code**: `.catch(console.error)` on calls to `syncTraceData`, `syncQMatrix`, `syncConceptMastery`, `syncRouteRecommendation`, etc.
    * **Consequence**: Any failed sync operation is only printed to the console. The user has no idea that their data is not reaching Firebase.

11. **`TeacherDashboard.tsx` — Lines 1380 & 1401**
    * **Code**: `catch { /* offline */ }`
    * **Consequence**: If the teacher's approval or rejection write fails (whether due to actual offline state or permission denied), the operation fails completely silently. No feedback is shown to the teacher, and the student's workspace remains blocked.

12. **`ClassManagement.tsx` — Lines 59, 60, 61, 62, 87, 104**
    * **Code**: `.catch(e => console.warn(..., e))` or `catch (err) { console.warn(...) }`
    * **Consequence**: Cleans up student data but catches errors as warnings. Any failed deletions (such as the blocked chat messages remove call) fail silently.

13. **`ClassManagement.tsx` — Line 63**
    * **Code**: `.catch(() => {})`
    * **Consequence**: Swallows delete error for pending approvals.

### B. UI-Propagating Try-Catch Blocks (Notifies User / Prompts Action)
These blocks catch errors and explicitly alert the user or handle the state to prevent incorrect flows.

1. **`TeacherDashboard.tsx` — Line 308**
   * **Code**: `.catch((err: any) => { console.error("Failed to send hint:", err); alert("שגיאה בשליחת הרמז לתלמיד."); });`
   * **Action**: Informs the teacher via an alert popup if a hint cannot be sent.

2. **`ClassManagement.tsx` — Line 110**
   * **Code**: `catch (err: unknown) { console.error('Reset failed:', err); ... alert(`שגיאה באיפוס נתונים: ...`); }`
   * **Action**: Inform the teacher via alert popup if the student reset fails.

3. **`AdminOverview.tsx` — Line 110**
   * **Code**: `catch (e) { console.error(e); alert('שגיאה בניקוי נתונים. ודא שיש לך הרשאות ניהול.'); }`
   * **Action**: Informs the admin via alert popup if old replay cleanup fails.

### C. Unhandled Rejections (No try/catch or `.catch` defined)
These writes are completely unhandled, potentially crashing/cancelling the promise chain.

1. **`FirebaseSyncService.ts` — Line 124**
   * **Code**: `update(studentRef, { workspaceState: syncableData, lastActive: serverTimestamp() });`
   * **Consequence**: If the workspace state update fails, it will cause an unhandled promise rejection in the student's browser.

2. **`TeacherDashboard.tsx` — Line 437**
   * **Code**: `set(ref(database, \`users/students/\${alert.rawStudentId}/traceData/interventions/\${interventionId}\`), { ... })`
   * **Consequence**: Unhandled rejection if recording the teacher's intervention fails.

3. **`TeacherDashboard.tsx` — Line 452**
   * **Code**: `remove(ref(database, \`radar_alerts/\${alert.firebaseKey}\`))`
   * **Consequence**: Unhandled rejection if deleting the alert fails.
