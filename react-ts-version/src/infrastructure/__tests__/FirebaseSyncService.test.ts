import { describe, it, expect, vi } from 'vitest';
import { 
  syncSessionState, 
  logTelemetryEvent, 
  fetchTeacherClassrooms, 
  fetchClassroomSessions,
  firebaseSyncService,
  type SessionState,
  type TelemetryEvent
} from '../services/FirebaseSyncService';

// Mock window and localStorage for Node test environment
if (typeof window === 'undefined' || !window.localStorage) {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, val: string) => store.set(key, String(val)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    length: 0,
    key: () => null
  } as unknown as Storage;
  // @ts-ignore
  global.window = {
    localStorage: mockStorage
  };
  // @ts-ignore
  global.localStorage = mockStorage;
}

// Mock Firebase RTDB methods
vi.mock('firebase/database', () => {
  return {
    ref: vi.fn(() => ({})),
    set: vi.fn(() => Promise.resolve()),
    get: vi.fn(() => Promise.resolve({
      exists: () => true,
      val: () => ({
        class_1: {
          id: 'class_1',
          teacher_id: 'teacher_1',
          name: 'כיתה א1',
          anonymous_students: ['student_1', 'student_2']
        }
      })
    })),
    update: vi.fn(() => Promise.resolve()),
    push: vi.fn(() => Promise.resolve()),
    onValue: vi.fn(),
    onDisconnect: vi.fn(() => ({ set: vi.fn() })),
    runTransaction: vi.fn(async (_ref, updateFn) => { if (typeof updateFn === 'function') return updateFn(0); }),
    serverTimestamp: vi.fn(() => 123456789)
  };
});

vi.mock('@/infrastructure/firebase', () => ({
  database: {}
}));

describe('FirebaseSyncService', () => {
  it('should define and export syncSessionState function', async () => {
    const sessionState: SessionState = {
      student_id: 'student_123',
      session_number: 2,
      status: 'active',
      current_path: 'green_path',
      hesitation_seconds: 15,
      error_count: 1
    };

    await expect(syncSessionState('student_123', sessionState)).resolves.not.toThrow();
  });

  it('should define and export logTelemetryEvent function', async () => {
    const event: TelemetryEvent = {
      event_type: 'vector_replay',
      session_id: 'session_1',
      timestamp: Date.now(),
      interaction_data: { action: 'drag_block', from: 'palette', to: 'units' },
      somatic_indicators: { hesitation_detected: false, undo_triggered: false }
    };

    await expect(logTelemetryEvent('student_123', event)).resolves.not.toThrow();
  });

  it('should fetch teacher classrooms successfully', async () => {
    const classrooms = await fetchTeacherClassrooms('teacher_1');
    expect(Array.isArray(classrooms)).toBe(true);
    expect(classrooms.length).toBeGreaterThan(0);
    expect(classrooms[0].teacher_id).toBe('teacher_1');
  });

  it('should fetch classroom sessions successfully', async () => {
    const sessions = await fetchClassroomSessions('class_1');
    expect(Array.isArray(sessions)).toBe(true);
  });

  // --- PRD V2.0 Section 7 NFR Tests ---
  it('verifies PRD V2.0 Offline Resilience local session caching', () => {
    const service = firebaseSyncService;
    const testData = { currentTaskIndex: 2, completedTasks: ['task_1'], status: 'active' };
    
    service.saveSessionProgressLocally('student_test_123', testData);
    const cached = service.getLocalSessionProgress('student_test_123');
    
    expect(cached).not.toBeNull();
    expect(cached.currentTaskIndex).toBe(2);
    expect(cached.status).toBe('active');
    expect(typeof cached.updatedAt).toBe('number');

    service.clearLocalSessionProgress('student_test_123');
    expect(service.getLocalSessionProgress('student_test_123')).toBeNull();
  });

  it('verifies PRD V2.0 Milestone Telemetry logging', async () => {
    const service = firebaseSyncService;
    await expect(service.logMilestoneEvent('student_test_123', 'session_1', 'GROUP', { column: 'units', count: 10 })).resolves.not.toThrow();
    await expect(service.logMilestoneEvent('student_test_123', 'session_1', 'INPUT_SUBMIT', { digit: 5, place: 'tens' })).resolves.not.toThrow();
  });
});
