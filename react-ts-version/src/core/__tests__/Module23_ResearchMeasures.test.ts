import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { SESSIONS_BY_PATH } from '@/data/sessionTasks';
import { useWorkspaceStore, getActiveTasks } from '@/application/useWorkspaceStore';

/**
 * PRD 7.3, מודול 23 §ב "מדדי המחקר". מדד 3 (גמישות ייצוגית) נספר על תרגילי
 * החובה שה-operation שלהם representation, במפגשים 3 ו-7, ו"נפתר בניסיון
 * ראשון" בהם = PROBLEM_COMPLETE עם error_count === 0, כאשר "error_count סופר
 * כל בדיקת לוח שנכשלה". הקובץ הזה מוודא ששני הצדדים מדברים על אותם תרגילים
 * ושהלקוח באמת סופר את בדיקות הלוח.
 */
const server = readFileSync(resolve(__dirname, '../../../../functions/src/meetingMetrics.ts'), 'utf-8');
const store = readFileSync(resolve(__dirname, '../../application/useWorkspaceStore.ts'), 'utf-8');

type Bank = { id: string; type: string; isOptionalChoiceTask?: boolean };
const REPRESENTATION_TYPES = ['representation', 'flexible_decomp'];

describe('REPRESENTATION_EXERCISES (functions/src/meetingMetrics.ts) matches the exercise banks', () => {
  const block = server.slice(
    server.indexOf('export const REPRESENTATION_EXERCISES'),
    server.indexOf(']);', server.indexOf('export const REPRESENTATION_EXERCISES'))
  );
  const serverIds = [...block.matchAll(/"(s\d_[rg]_t\d+)"/g)].map((m) => m[1]).sort();

  it('is exactly the compulsory representation exercises of the eight meetings', () => {
    const bankIds: string[] = [];
    for (const session of [3, 4, 5, 6, 7, 8] as const) {
      const tasks = [...SESSIONS_BY_PATH[session].green_path, ...SESSIONS_BY_PATH[session].remediation_path] as Bank[];
      for (const t of tasks) {
        if (REPRESENTATION_TYPES.includes(t.type) && t.isOptionalChoiceTask !== true) bankIds.push(t.id);
      }
    }
    expect(serverIds.length).toBeGreaterThan(0);
    expect(serverIds).toEqual([...new Set(bankIds)].sort());
  });

  it('they exist in meetings 3 and 7 only, which is where the server computes the measure', () => {
    expect(new Set(serverIds.map((id) => id.slice(0, 2)))).toEqual(new Set(['s3', 's7']));
    expect(server).toContain('export const FLEXIBILITY_SESSIONS: readonly number[] = [3, 7];');
  });
});

describe('the client counts every failed board check of a representation exercise', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().initSession(3, false);
  });

  const activeTask = () => {
    const s = useWorkspaceStore.getState();
    return getActiveTasks(s)[s.standardTaskIdx];
  };
  const emptyBoard = { units: 0, tens: 0, hundreds: 0, thousands: 0 };

  it('a wrong board on "התקדם" is counted, per exercise', () => {
    const task = activeTask();
    expect(task.type).toBe('representation');
    useWorkspaceStore.setState({ counts: { ...emptyBoard, units: 1 } });
    useWorkspaceStore.getState().proceed();
    useWorkspaceStore.getState().proceed();
    const s = useWorkspaceStore.getState();
    expect(s.boardCheckFailures).toBe(2);
    expect(s.boardCheckFailuresTaskId).toBe(task.id);
  });

  it('a correct board with the answer not typed yet is not a failed check', () => {
    const task = activeTask();
    useWorkspaceStore.setState({ counts: { ...emptyBoard, ...(task.requiredCounts ?? {}) } });
    useWorkspaceStore.getState().proceed();
    expect(useWorkspaceStore.getState().feedback?.title).toContain('הַקְלָדַת');
    expect(useWorkspaceStore.getState().boardCheckFailures).toBe(0);
  });

  it('PROBLEM_COMPLETE of a representation exercise reports those failures, not the shared consecutive counter', () => {
    expect(store).toMatch(/error_count: isRepresentationTask\(task\)\s*\? \(s\.boardCheckFailuresTaskId === task\.id \? s\.boardCheckFailures : 0\)\s*: s\.consecutiveErrorCount \|\| 0,/);
    // "הוספת ייצוג" refuses in three ways; each is a failed board check in a lesson exercise.
    const start = store.indexOf('addRepresentation: () => {');
    const body = store.slice(start, store.indexOf('demoUngroup: () =>', start));
    expect((body.match(/if \(lessonTaskId\) recordBoardCheckFailure\(lessonTaskId\);/g) || []).length).toBe(3);
  });
});
