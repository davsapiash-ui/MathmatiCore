## 2026-07-06T09:15:51Z
You are the worker subagent. Your working directory is: c:\Users\david\Projects\MathmatiCore\.agents\worker_milestone1.
Your task is to implement all 6 audit fixes in the react-ts-version codebase as detailed in the explorer report.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please execute the following steps:

1. Restore `react-ts-version/src/application/useSilentRadar.ts` with the following content:
```typescript
import { useState, useEffect, useRef, useCallback } from 'react';
import { database } from '@/infrastructure/firebase';
import { ref, push } from 'firebase/database';
import { useAuthStore } from './useAuthStore';
import { useStore } from './useStore';

interface RadarOptions {
  taskId: string;
  idleThresholdMs?: number;
}

export function useSilentRadar({ taskId, idleThresholdMs = 30000 }: RadarOptions) {
  const { user } = useAuthStore();
  const { incrementHesitation, incrementUndo } = useStore();
  const [undoCount, setUndoCount] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const studentId = user?.uid || 'anonymous-student';

  const reportHesitation = useCallback(() => {
    incrementHesitation(studentId);
    console.log(`[Silent Radar] Hesitation detected for ${studentId} on task ${taskId}.`);
    
    const payload = {
      type: 'HESITATION',
      studentId: user?.displayName || studentId,
      taskId,
      timestamp: Date.now(), 
      unread: true
    };
    
    try {
      push(ref(database, 'radar_alerts'), payload);
    } catch (err) {
      console.warn("Could not write to Firebase, radar alert logged locally.", err);
    }
  }, [studentId, taskId, user?.displayName, incrementHesitation]);

  const resetTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      reportHesitation();
    }, idleThresholdMs);
  }, [idleThresholdMs, reportHesitation]);

  useEffect(() => {
    const handleActivity = () => {
      resetTimer();
    };
    const events = ['mousedown', 'keydown', 'touchstart', 'click'];
    events.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));
    resetTimer();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      events.forEach(e => window.removeEventListener(e, handleActivity));
    };
  }, [resetTimer]);

  const registerUndo = useCallback(() => {
    setUndoCount(prev => prev + 1);
    incrementUndo(studentId);
    resetTimer();
    
    if (undoCount + 1 >= 5) {
      try {
        push(ref(database, 'radar_alerts'), {
          type: 'PASSIVE_CRUISING',
          studentId: user?.displayName || studentId,
          taskId,
          timestamp: Date.now(),
          unread: true
        });
      } catch {
        console.warn("Could not write passive cruising to Firebase.");
      }
    }
  }, [resetTimer, studentId, taskId, undoCount, user?.displayName, incrementUndo]);

  return {
    undoCount,
    registerUndo
  };
}
```

2. Wire `useSilentRadar` in `react-ts-version/src/features/workspace/StudentWorkspacePage.tsx`:
- Import `useSilentRadar` from `@/application/useSilentRadar`.
- Call it:
```typescript
  const undoCount = useWorkspaceStore((s) => s.undoCount);
  const { registerUndo } = useSilentRadar({ taskId: qTask?.id ?? 'workspace' });

  useEffect(() => {
    if (undoCount > 0) {
      registerUndo();
    }
  }, [undoCount, registerUndo]);
```

3. In `react-ts-version/src/core/qmatrixFlow.ts` inside `recordResult`'s subtask tag generation logic:
Update task2, task5, task7, and task8 to:
```typescript
      } else if (task.id === 'task2_estimation_error_margin') {
        updated.tag = evalResult.correct ? 'estimation_precision_fixation' : 'estimation_range_error';
      } else if (task.id === 'task3_flexible_regrouping') {
        updated.tag = evalResult.correct ? 'canonical_fixation' : 'regrouping_deficit';
      } else if (task.id === 'task4_basic_addition_fluency') {
        updated.tag = evalResult.correct ? 'procedural_error' : 'basic_facts_deficit';
      } else if (task.id === 'q5_small_change') {
        updated.tag = evalResult.correct ? 'small_change_confusion' : 'directional_error';
      } else if (task.id === 'task6_subtraction_regrouping') {
        updated.tag = evalResult.correct ? 'regrouping_anxiety' : 'subtraction_operation_deficit';
      } else if (task.id === 'task7_missing_subtrahend') {
        updated.tag = evalResult.correct ? 'computational_fluency_deficit' : 'algebraic_concept_deficit';
      } else if (task.id === 'task8_missing_addend') {
        updated.tag = evalResult.correct ? 'inverse_operation_gap' : 'missing_addend_deficit';
      }
```

4. In `react-ts-version/src/application/useWorkspaceStore.ts`:
- In `proceedQ()`'s switch statement, add the case for `'missing_element'`:
```typescript
      case 'missing_element': {
        const answer = s.probeAnswer ? parseInt(s.probeAnswer, 10) : null;
        if (answer === null || Number.isNaN(answer)) return;
        const r = QMatrixEvaluator.evaluateQ7(task, answer, s.qflow.phase, s.qflow.subphase, s.isASD);
        evalResult = { correct: r.correct, detail: r.detail };
        break;
      }
```
- In the `'all_complete'` branch where `realQMatrix` is mapped (near line 315), make sure task7 and task8 are mapped:
```typescript
                task7_missing_subtrahend: getTag(r['task7_missing_subtrahend']),
                task8_missing_addend: getTag(r['task8_missing_addend']),
```

5. In `react-ts-version/src/presentation/pages/TeacherDashboard.tsx`:
- Move the Socratic Engine Diagnosis block *below* the route recommendation card.
- Wire the Image and Mic icons in the admin chat section (`chat_admin`). Make sure that when the admin select image input triggers, it sends base64/files correctly.
- Add rendering for image messages using `msg.imageUrl` in the admin chat message list.

6. In `react-ts-version/src/presentation/pages/admin/AdminChatView.tsx`:
- Wire the Image and Mic icons similarly, utilizing the file input ref and `sendImageMessage`.
- In the chat thread, render image messages if `msg.imageUrl` is present.

7. In `react-ts-version/src/presentation/pages/admin/AdminOverview.tsx`:
- Replace the live Firebase database `audit_logs` string list with a properly structured table:
```tsx
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-400 uppercase">
                  <th className="py-3 px-4">זמן</th>
                  <th className="py-3 px-4">פעולה</th>
                  <th className="py-3 px-4">משתמש</th>
                  <th className="py-3 px-4">פרטים</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {auditLogs.length > 0 ? (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {log.timestamp ? new Date(log.timestamp).toLocaleString('he-IL') : 'לא ידוע'}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">
                        {log.action}
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                        {log.user_id}
                      </td>
                      <td className="py-3 px-4 text-slate-500 max-w-xs truncate" title={log.details}>
                        {log.details || '-'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500">
                      אין אירועים להצגה.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
```

8. Delete the unused file `react-ts-version/src/infrastructure/mockRrwebEvents.ts`.

9. Verify that the app compiles cleanly with zero TypeScript errors by running `npm run build` (or equivalent build command) inside `react-ts-version`.

Please document all implemented changes, compile results, and tests in `c:\Users\david\Projects\MathmatiCore\.agents\worker_milestone1\handoff.md`. When done, send a message to orchestrator ID f99981c8-4422-4902-b78d-a05deeaaea5c pointing to your handoff report.
