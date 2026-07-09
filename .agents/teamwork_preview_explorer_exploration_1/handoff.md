# Exploration Report: Codebase Entities & AI Integrations

## Core Summary
This report details the implementation, database sync locations, schemas, and AI interactions within the MathmatiCore project. All student data objects (Q-matrix/Mastery, Telemetry, TraceData, replays, radar alerts, and chat messages) sync to specific paths under Firebase Realtime Database, with the `SocraticEngine` acting as a rule-based AI placeholder analyzing these metrics for teacher approvals.

---

## 1. Observations: File Paths, Definitions, and Schemas

Below is a detailed breakdown of where each entity is defined, updated, and synced in the codebase, along with its exact schema/JSON structure.

### A. Q-Matrix & Concept Mastery (`conceptMastery` / `qMatrixResults`)
* **Definitions**:
  * `QMatrix` schema: `c:\Users\david\Projects\MathmatiCore\react-ts-version\src\application\useStore.ts` (lines 6-15)
  * `MasteryProfile` schema: `c:\Users\david\Projects\MathmatiCore\react-ts-version\src\core\QMatrix.ts` (line 436)
* **Update & Sync Methods**:
  * Computed via `computeCognitiveMastery(results)` in `core/QMatrix.ts` (lines 442-484).
  * State managed in `useStore.ts` through action `updateConceptMastery` (lines 224-229) which calls `firebaseSyncService.syncConceptMastery(studentId, updates)`.
  * Saved to Firebase under `users/students/${studentId}/conceptMastery` and `users/students/${studentId}/qMatrixResults`.
  * Diagnostic reports containing both are generated in `SocraticEngine.ts` and pushed to `users/students/${studentId}/diagnosticReport`.
* **JSON Schema**:
  ```json
  {
    "qMatrixResults": {
      "task1_zero_placeholder": "string | null",
      "task2_estimation_error_margin": "string | null",
      "task3_flexible_regrouping": "string | null",
      "task4_basic_addition_fluency": "string | null",
      "task5_small_change": "string | null",
      "task6_subtraction_regrouping": "string | null",
      "task7_missing_subtrahend": "string | null",
      "task8_missing_addend": "string | null"
    },
    "conceptMastery": {
      "decimal_structure": "number (0.0 to 1.0)",
      "number_magnitude": "number (0.0 to 1.0)",
      "regrouping_fluency": "number (0.0 to 1.0)",
      "procedural_fluency": "number (0.0 to 1.0)",
      "relational_thinking": "number (0.0 to 1.0)",
      "algebraic_reasoning": "number (0.0 to 1.0)"
    }
  }
  ```

### B. Telemetry Logs (`interaction_logs`)
* **Definitions**:
  * `TelemetryEvent` interface: `c:\Users\david\Projects\MathmatiCore\react-ts-version\src\infrastructure\TelemetryTracker.ts` (lines 4-10)
* **Update & Sync Methods**:
  * Tracked dynamically via `TelemetryTracker.getInstance().logEvent(type, payload)` upon student interface interactions.
  * Flushed every 10 seconds (via `setInterval` flusher) or on session end, pushing chunks asynchronously using `push(ref(database, 'users/students/${studentId}/interaction_logs'), chunk)`.
* **JSON Schema**:
  ```json
  {
    "timestamp": "number (epoch milliseconds)",
    "type": "string",
    "payload": "any (object with event-specific details)",
    "taskId": "string (optional)",
    "studentId": "string"
  }
  ```

### C. TraceData (`traceData` / `interventions`)
* **Definitions**:
  * `TraceData` interface: `c:\Users\david\Projects\MathmatiCore\react-ts-version\src\application\useStore.ts` (lines 17-21)
* **Update & Sync Methods**:
  * Tracked in Zustand workspace store (`useWorkspaceStore.ts`) via counters (`hesitationCount`, `undoCount`).
  * Mirrored and saved to store traceData at the end of a session/reflection page (`ReflectionScreen.tsx` line 122).
  * Synced via `firebaseSyncService.syncTraceData(studentId, updates)` at `users/students/${studentId}/traceData`.
  * Teacher pedagogical responses (interventions) are written under `users/students/${studentId}/traceData/interventions/${interventionId}` where `interventionId` is `Date.now().toString()`.
* **JSON Schema**:
  ```json
  {
    "traceData": {
      "hesitation_events": "number",
      "undo_clicks": "number",
      "lastUpdate": "number (optional)",
      "interventions": {
        "timestamp_id": {
          "timestamp": "number",
          "alertType": "string",
          "responseType": "string",
          "responseText": "string"
        }
      }
    }
  }
  ```

### D. rrweb Replays (`telemetry_sessions`)
* **Definitions & Tracking**:
  * Set up in `c:\Users\david\Projects\MathmatiCore\react-ts-version\src\features\workspace\StudentWorkspacePage.tsx` (lines 138-197) using the `rrweb` package.
  * Emits event chunks to a local array `eventsQueue` (ignoring mouse moves).
* **Update & Sync Methods**:
  * Flushed every 2 seconds via `setInterval` and on window `beforeunload`.
  * Saved under `users/students/${uid}/telemetry_sessions/${sessionId}` as a stringified JSON array.
* **JSON Schema**:
  ```json
  "stringified array: rrweb.event[] containing DOM events, mouse clicks, scrolls, and inputs"
  ```

### E. Radar Alerts (`radar_alerts` / `radar_history`)
* **Definitions**:
  * `RadarAlert` interface: `c:\Users\david\Projects\MathmatiCore\react-ts-version\src\infrastructure\TelemetryTracker.ts` (lines 12-20)
* **Update & Sync Methods**:
  * Triggered silently via `useWorkspaceRadar.ts` (lines 21-149) under the following conditions:
    * `HESITATION`: If student is idle for >= 30 seconds (`HESITATION_THRESHOLD_MS = 30000`).
    * `PASSIVE_DRIFTING`: If student registers >= 3 deletions/undos within a 3-second window (`RAPID_DELETE_WINDOW_MS = 3000`).
    * `HINT_REQUESTED`: When student interacts with the hint request element.
    * `TASK_ERROR`: If a mathematical/system task validation error occurs.
    * `TAB_ESCAPE`: Triggers on the browser's `visibilitychange` if student minimizes or switches tabs.
  * Synced live by pushing to `radar_alerts` and `users/students/${uid}/radar_history`.
  * Dismissed in `TeacherDashboard.tsx` by removing the key under `radar_alerts/${firebaseKey}`.
* **JSON Schema**:
  ```json
  {
    "id": "string (timestamp_randomSuffix)",
    "type": "HESITATION | PASSIVE_DRIFTING | HINT_REQUESTED | TASK_ERROR | TAB_ESCAPE",
    "studentId": "string (student uid)",
    "student": "string (student uid)",
    "username": "string (student uid)",
    "studentName": "string",
    "taskId": "string",
    "sessionNumber": "number",
    "timestamp": "number",
    "unread": "boolean",
    "idleMs": "number (optional, for HESITATION)",
    "recentDeletions": "number (optional, for PASSIVE_DRIFTING)",
    "totalDeletionsFromStart": "number (optional, for PASSIVE_DRIFTING)",
    "detail": "string (optional, for TASK_ERROR)",
    "reason": "string (optional, for TAB_ESCAPE)"
  }
  ```

### F. Chat Messages (`chat_messages`)
* **Definitions**:
  * `ChatMessage` interface: `c:\Users\david\Projects\MathmatiCore\react-ts-version\src\application\useChatStore.ts` (lines 7-16)
* **Update & Sync Methods**:
  * Handled via Zustand store `useChatStore.ts` via actions `sendMessage`, `sendImageMessage`, and `markAsRead`.
  * Syncs live under path `chat_messages/${roomId}` where `roomId` is the student's `uid` (for teacher-student chat), `'admin'` (for messages to admin), or teacher-specific rooms.
  * Image messages are handled by encoding files into inline base64 data URLs (`imageUrl`) directly in the DB.
* **JSON Schema**:
  ```json
  {
    "id": "string (firebase push key)",
    "senderId": "string",
    "senderName": "string",
    "receiverId": "string",
    "text": "string",
    "imageUrl": "string (optional, base64 data URL)",
    "timestamp": "number",
    "read": "boolean"
  }
  ```

---

## 2. AI Interaction Touchpoints

Currently, the system uses a **deterministic rule-based service acting as a Socratic Engine placeholder** for future LLM integration. There is no active API integration with external models (e.g. OpenAI or Gemini).

### Socratic Engine Analysis & Generation (`SocraticEngine.ts`)
* **Trigger Point**: Invoked in the submit handler of `ReflectionScreen.tsx` (line 133) when a student completes Meeting 2 (diagnostic mapping phase) and rates their effort/strategy.
* **Logic Flow**:
  1. Reads the student's `conceptMastery` profile. If any of the 6 cognitive concepts fall below `0.8` (80%), it flags a struggle.
  2. Analyzes the student's `traceData` (hesitations >= 3 or undo clicks >= 5) to identify high cognitive load or anxiety.
  3. Formulates a clinical diagnosis in Hebrew (`clinicalDiagnosisHe`) and a recommended action plan (`actionPlanHe`).
  4. Generates targeted scaffolding tasks (`SessionTask[]`) for Meeting 3 (e.g., number line estimation tasks, relational small change tasks, missing element equations) or advanced challenge tasks (if all masteries >= 80%).
  5. If anxiety/hesitation was detected, it forces full scaffolding on all generated tasks (`scaffoldLevel = 2`).
  6. Pushes the recommended tasks, diagnosis, and action plan to `ai_pending_approvals/${teacherId}/${approvalId}`.
  7. Writes the final report under `users/students/${studentId}/diagnosticReport`.

### Teacher Dashboard Decision Gate (`TeacherDashboard.tsx`)
* **Approvals Tab**: The teacher is presented with the generated clinical diagnosis text, the proposed action plan, and the sequence of tasks.
* **Gatekeeper Control**: The teacher must manually review this AI recommendation.
  * **Approve**: Calls `SocraticEngine.approveTasks(...)` which writes the approved task array to `approved_tasks/${studentId}` and updates `routeStatus` to `"APPROVED"`.
  * **Reject**: Calls `SocraticEngine.rejectTasks(...)` which removes the pending entry.
* **Student Progression**: Upon approval, the student is allowed to transition to Meeting 3 (Adaptive Sessions) and loads their tasks using `SocraticEngine.getApprovedTasks(studentId)`.

---

## 3. Logic Chain
1. We listed the root directory and located the Vite-based React TypeScript application in `react-ts-version`.
2. We searched the codebase for references to `conceptMastery`, `traceData`, `telemetry_sessions`, `radar_alerts`, and `chat_messages` using `grep_search`.
3. We mapped out the exact code locations: `useStore.ts`, `useChatStore.ts`, `FirebaseSyncService.ts`, `TelemetryTracker.ts`, `useWorkspaceRadar.ts`, and `SocraticEngine.ts`.
4. We verified the structural fields in the code by viewing the files directly, extracting exact TypeScript interfaces and DB schema structures.
5. We examined the AI workflow: tracing calls to `SocraticEngine` from `ReflectionScreen.tsx`, looking inside `SocraticEngine.ts` to see its evaluation rules and output nodes, and checking how the teacher dashboard interacts with it.
6. We searched for external API dependencies (OpenAI/Gemini) and confirmed that the AI is currently fully simulated/mocked locally with rule-based heuristics.

---

## 4. Caveats
* **No Active LLM API Calls**: As noted, the AI is rule-based and resides entirely in client-side / service helper code. No external LLM endpoints are hit.
* **Impersonation Exclusions**: `TelemetryTracker` does not record events when the user is in "Projector Sandbox Mode" (impersonating a student).
* **Firebase Rules Constraint**: All DB writes must happen within the student's own authenticated node (`users/students/${uid}`) or matching permission boundaries (e.g. `radar_alerts`, `chat_messages`), which are guarded by Firebase rules.

---

## 5. Verification Method

To verify these findings:
1. **Source Code Inspection**:
   * Inspect the interfaces and functions in the following files:
     * `react-ts-version/src/application/useStore.ts` (State and entity schemas)
     * `react-ts-version/src/application/useChatStore.ts` (Chat messages)
     * `react-ts-version/src/core/QMatrix.ts` (Q-Matrix mapping & cognitive mastery math)
     * `react-ts-version/src/infrastructure/TelemetryTracker.ts` (Telemetry event & radar alert formats)
     * `react-ts-version/src/features/workspace/useWorkspaceRadar.ts` (Silent radar rules)
     * `react-ts-version/src/infrastructure/services/SocraticEngine.ts` (Pedagogical analysis rules)
2. **Verify Type-Safety & Code Compilation**:
   * Run the React build verification in the workspace to verify there are no compilation or type mismatches:
     ```powershell
     cd react-ts-version
     npm run verify-component
     ```
