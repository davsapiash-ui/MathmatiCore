import { describe, it, expect, vi } from 'vitest';
import { 
  syncSessionState, 
  logTelemetryEvent, 
  fetchTeacherClassrooms, 
  fetchClassroomSessions,
  type SessionState,
  type TelemetryEvent
} from '../services/FirebaseSyncService';

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
});
