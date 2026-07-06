# Audit & Analysis Report — MathmatiCore Platform

## 1. Observation

### Security & Configuration Audit
* **File**: `database.rules.json` (lines 41-43, 54)
  The write rules for `routeStatus` and `traceData` under `users/students/$studentId` are restricted to teachers and admins only:
  ```json
  "routeStatus": { 
    ".write": "auth != null && (root.child('users/teachers/' + auth.token.email.replace('teacher_', '').replace('@mathmaticore.local', '')).exists() || auth.token.email === 'admin@mathmaticore.local')",
  ...
  "traceData": {
    ".write": "auth != null && (root.child('users/teachers/' + auth.token.email.replace('teacher_', '').replace('@mathmaticore.local', '')).exists() || auth.token.email === 'admin@mathmaticore.local')",
  ```
  However, in `ReflectionScreen.tsx` (lines 88-96), the student client attempts to write `routeStatus` and `traceData` when completing Meeting 2:
  ```typescript
  update(ref(database, `users/students/${username}`), {
    qMatrixResults: qMatrix,
    completedMeeting2: true,
    routeStatus: 'PENDING',
    traceData: {
      hesitation_events: useWorkspaceStore.getState().hesitationCount,
      undo_clicks: undoCount,
    },
  });
  ```
  This will fail in production due to permission denied.

* **File**: `database.rules.json` (lines 83-86)
  The chat rules allow any authenticated user to read all chat messages:
  ```json
  "chat_messages": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
  ```
  And in `useChatStore.ts` (lines 36-37), the client fetches the entire `chat_messages` node:
  ```typescript
  const chatRef = ref(database, 'chat_messages');
  onValue(chatRef, (snapshot) => { ... })
  ```
  This causes a major data privacy leak and client-side performance bottleneck.

* **File**: `database.rules.json` (lines 93-98)
  Replays allow any authenticated user to write:
  ```json
  "replays": {
    "$sessionKey": {
      ".read": "auth != null && ...",
      ".write": "auth != null"
    }
  }
  ```

* **File**: `react-ts-version/src/infrastructure/firebase.ts` (lines 12-21)
  The Firebase configuration object is hardcoded in source control:
  ```typescript
  const firebaseConfig = {
    apiKey: "AIzaSyDupqh8inn1tZ1p-KIzV3RIMst7IdpUYPw",
    ...
  };
  ```

### QA & Functional Audit
* **File**: `src/infrastructure/services/SocraticEngine.ts` (lines 124-127)
  The SocraticEngine always recommends only `vertical_addition` tasks on the yellow track:
  ```typescript
  tasks.push(
    { id: 'gen_t1', type: 'vertical_addition', titleHe: 'תרגול תומך 1', instructionHe: 'חיבור במאונך עם עזרים.', numberA: 25, numberB: 17, correctAnswer: 42 },
    { id: 'gen_t2', type: 'vertical_addition', titleHe: 'תרגול תומך 2', instructionHe: 'נסו לפתור במאונך.', numberA: 36, numberB: 28, correctAnswer: 64 }
  );
  ```

* **File**: `src/features/workspace/tasks/TaskCard.tsx` (lines 57-84)
  The TaskCard component does not have rendering cases for `small_change` or `missing_element` tasks when `sessionNumber !== 2` (such as in Meeting 3 approved AI tasks):
  ```typescript
  {sessionNumber !== 2 && standardTask && (
    <>
      {standardTask.type === 'session1_intro' && <IntroTask task={standardTask} />}
      ...
    </>
  )}
  ```

* **File**: `src/application/useWorkspaceStore.ts` (lines 340-399)
  The `proceedStandard()` function in `useWorkspaceStore` does not evaluate `flexible_decomp`, `number_line`, `small_change`, or `missing_element` tasks, letting students skip them without input.

* **File**: `src/application/useSilentRadar.ts`
  This hook is dead/unused code. The active component is `useWorkspaceRadar.ts` (using `radarBus`).

* **Files**: `src/presentation/pages/admin/AdminChatView.tsx` (lines 163, 188) and `src/presentation/pages/TeacherDashboard.tsx` (lines 1460, 1484, 1685)
  Image and Mic icons are hidden on mobile browsers using `hidden md:flex`.

* **File**: `src/presentation/pages/admin/AdminOverview.tsx` (lines 25-40, 215-252)
  Audit logs are fetched properly and displayed in a table wrapped with `dir="rtl"`. Headers use `uppercase` class which is redundant for Hebrew.

### Architecture & Code Quality Audit
* **Oxlint warning** in `tests/rbac-flow.spec.ts:1:16`: `Identifier 'expect' is imported but never used`.
* **Explicit `any` typings** found in: `useAdminStore.ts`, `useAuthStore.ts`, `useWorkspaceStore.ts`, `ReflectionScreen.tsx`, `TelemetryTracker.ts`, `FirebaseSyncService.ts`, `TeacherDashboard.tsx`, `AdminOverview.tsx`.

---

## 2. Logic Chain

### Security & Configuration
1. Because `routeStatus` and `traceData` under `users/students/$studentId` reject student writes, the Meeting 2 submission in `ReflectionScreen.tsx` fails. We must allow `auth.token.email === $studentId + '@mathmaticore.local'` to write to these nodes.
2. Direct reading and loose rules on `"chat_messages"` allow any user to see all chats. We must refactor this to a room-based schema (`chat_rooms/$roomId/messages`) and restrict reads to room participants.
3. The `$sessionKey` in replays represents the student's `uid`. To prevent cross-user overwriting, we must restrict `.write` to `auth.token.email === $sessionKey + '@mathmaticore.local'` or teachers/admins.
4. Hardcoding Firebase config is bad practice. We should load it from environment variables using Vite's `import.meta.env`.

### QA & Adaptivity
1. Pushing only `vertical_addition` tasks for yellow-track students defeats the purpose of adaptive targeting. We must check which specific competency failed (Task 2: estimation, Task 5: small change, Task 8: missing addend) and push matching task types (`number_line`, `small_change`, `missing_element`).
2. If `SocraticEngine` pushes non-addition tasks, the student's `TaskCard` will render empty in Meeting 3 because `TaskCard.tsx` only handles addition/intro/decomposition types for standard tasks. We must wire `small_change` and `missing_element` components inside the `standardTask` card section.
3. Since standard tasks currently only evaluate addition, non-addition tasks could be skipped without verification. We must add the respective evaluation cases (marker deviation for number line, choice equality for small change, input value matching for missing element) inside `proceedStandard()` of `useWorkspaceStore.ts`.
4. Hiding chat tools (Image/Mic) on mobile restricts teachers/admins on tablets/phones. Removing `hidden md:flex` resolves this.

---

## 3. Caveats
* The migration to a room-based chat model requires updating the client-side `useChatStore.ts` to sync with specific paths instead of the global `chat_messages` node.
* We assume that for non-session 2 (standard tasks), `flexible_decomp` and `number_line` only require a single representation or a simple target match, which is aligned with the current curriculum structure.

---

## 4. Conclusion

A complete set of updates is required across security rules, the SocraticEngine, the workspace card rendering, and store evaluation logic. 

### Proposed Changes:

#### A. Database Rules (`database.rules.json`)
```json
// Target: users/students/$studentId/routeStatus
// Replace with:
"routeStatus": { 
  ".write": "auth != null && (auth.token.email === $studentId + '@mathmaticore.local' || root.child('users/teachers/' + auth.token.email.replace('teacher_', '').replace('@mathmaticore.local', '')).exists() || auth.token.email === 'admin@mathmaticore.local')",
  ".validate": "newData.isString() || !newData.exists()" 
}

// Target: users/students/$studentId/traceData
// Replace with:
"traceData": {
  ".write": "auth != null && (auth.token.email === $studentId + '@mathmaticore.local' || root.child('users/teachers/' + auth.token.email.replace('teacher_', '').replace('@mathmaticore.local', '')).exists() || auth.token.email === 'admin@mathmaticore.local')",
  ".validate": "newData.hasChildren(['hesitation_events', 'undo_clicks']) && newData.child('hesitation_events').isNumber() && newData.child('undo_clicks').isNumber()"
}

// Target: replays/$sessionKey
// Replace with:
"replays": {
  "$sessionKey": {
    ".read": "auth != null && (root.child('users/teachers/' + auth.token.email.replace('teacher_', '').replace('@mathmaticore.local', '')).exists() || auth.token.email === 'admin@mathmaticore.local')",
    ".write": "auth != null && (auth.token.email === $sessionKey + '@mathmaticore.local' || root.child('users/teachers/' + auth.token.email.replace('teacher_', '').replace('@mathmaticore.local', '')).exists() || auth.token.email === 'admin@mathmaticore.local')"
  }
}
```

#### B. Socratic Engine Adaptivity (`src/infrastructure/services/SocraticEngine.ts`)
Modify `generateAndQueueTasks` to conditionally push task types based on failed Q-Matrix elements:
```typescript
// Inside SocraticEngine.generateAndQueueTasks:
if (isYellowPath && diagnosisParts.length > 0) {
  clinicalDiagnosisHe = "על בסיס המבדק, עולים הדפוסים הבאים: " + diagnosisParts.join(" ");
  actionPlanHe = "תוכנית פעולה מוצעת: " + actionParts.join(" | ");

  if (qMatrix.task2_estimation_error_margin && qMatrix.task2_estimation_error_margin !== 'success') {
    tasks.push({
      id: 'gen_t_est',
      type: 'number_line',
      titleHe: 'תרגול תומך באומדן',
      instructionHe: 'מקמו את המספר 50 על הישר.',
      numberA: 50,
      range: [0, 100],
      correctAnswer: 50
    } as any);
  }
  if (qMatrix.task5_small_change && qMatrix.task5_small_change !== 'success') {
    tasks.push({
      id: 'gen_t_sc',
      type: 'small_change',
      titleHe: 'תרגול תומך בשינוי קטן',
      instructionHe: 'אם 45 + 10 = 55, כמה הם 45 + 9?',
      choices: [
        { id: 'A', textHe: '54 — קטן ב-1' },
        { id: 'B', textHe: '56 — גדול ב-1' }
      ],
      correctAnswer: 'A'
    } as any);
  }
  if (qMatrix.task8_missing_addend && qMatrix.task8_missing_addend !== 'success') {
    tasks.push({
      id: 'gen_t_ma',
      type: 'missing_element',
      titleHe: 'תרגול תומך במציאת נעלם',
      instructionHe: 'השלימו את המספר החסר במשוואה: □ + 8 = 10',
      numberA: 8,
      correctAnswer: 2,
      numberB: 10,
      isSubtraction: false
    } as any);
  }

  if (tasks.length === 0) {
    tasks.push(
      { id: 'gen_t1', type: 'vertical_addition', titleHe: 'תרגול תומך 1', instructionHe: 'חיבור במאונך עם עזרים.', numberA: 25, numberB: 17, correctAnswer: 42 },
      { id: 'gen_t2', type: 'vertical_addition', titleHe: 'תרגול תומך 2', instructionHe: 'נסו לפתור במאונך.', numberA: 36, numberB: 28, correctAnswer: 64 }
    );
  }
}
```

#### C. Card Rendering (`src/features/workspace/tasks/TaskCard.tsx`)
Add missing cases for standard tasks:
```typescript
// Inside TaskCard.tsx, after standardTask.type === 'number_line' condition:
{standardTask.type === 'small_change' && (
  <SmallChangeTask
    givenHe={standardTask.givenHe ?? ''}
    questionHe={standardTask.questionHe ?? ''}
    choices={standardTask.choices ?? []}
  />
)}
{standardTask.type === 'missing_element' && (
  <MissingElementTask
    instructionHe={standardTask.instructionHe}
    numberA={isASD && standardTask.asdNumberA !== undefined ? standardTask.asdNumberA : standardTask.numberA!}
    numberB={isASD && standardTask.asdNumberB !== undefined ? standardTask.asdNumberB : standardTask.numberB!}
    isSubtraction={standardTask.isSubtraction}
  />
)}
```

#### D. Proceed Evaluation (`src/application/useWorkspaceStore.ts`)
Add evaluation cases for standard tasks:
```typescript
// Inside proceedStandard():
if (task.type === 'number_line') {
  if (s.numberLineValue === null) return;
  const target = task.numberA ?? 0;
  const deviation = Math.abs(s.numberLineValue - target);
  const correct = (deviation / 100) <= 0.07;
  if (!correct) {
    radar.recordTaskError(task.id, 'wrong_estimation');
    showFeedback({ correct: false, title: 'נסו שוב 🤔', sub: 'החץ רחוק מדי מהמיקום המבוקש.' }, 2500);
    return;
  }
}

if (task.type === 'small_change') {
  if (!s.selectedChoiceId) return;
  if (s.selectedChoiceId !== task.correctAnswer) {
    radar.recordTaskError(task.id, 'wrong_choice');
    showFeedback({ correct: false, title: 'נסו שוב 🤔', sub: 'התשובה שבחרתם אינה נכונה.' }, 2500);
    return;
  }
}

if (task.type === 'missing_element') {
  const answer = s.probeAnswer ? parseInt(s.probeAnswer, 10) : null;
  if (answer === null || Number.isNaN(answer)) return;
  if (answer !== task.correctAnswer) {
    radar.recordTaskError(task.id, 'wrong_answer');
    showFeedback({ correct: false, title: 'נסו שוב 🤔', sub: 'המספר שהזנתם אינו נכון.' }, 2500);
    return;
  }
}
```

---

## 5. Verification Method

### Compilation & Linting
Run components verification from the `react-ts-version` directory:
```bash
cmd /c "npm run verify-component"
```

### Invalidation Conditions
Verify the following behaviors:
1. Student can complete Meeting 2 (no Firebase Permission Denied errors on saving `routeStatus` / `traceData`).
2. Meeting 3 adaptive support matches failed skills (Task 2 triggers Number Line, Task 5 triggers Small Change, Task 8 triggers Missing Addend).
3. Student cannot press "Proceed" to skip custom Meeting 3 tasks without providing correct input.
