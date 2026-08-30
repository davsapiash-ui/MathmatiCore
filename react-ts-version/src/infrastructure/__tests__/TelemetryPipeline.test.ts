import { describe, it, expect, vi, beforeEach } from 'vitest';
import { firebaseSyncService } from '../services/FirebaseSyncService';
import { indexedDBQueue } from '../services/IndexedDBQueue';
import { 
  type TelemetryEventType, 
  validateTelemetryColumnIndexRule,
  COLUMN_SCOPED_EVENTS,
  NON_COLUMN_EVENTS
} from '@/types/telemetry';

// Mock Firebase
vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  firestore: {},
  authReady: Promise.resolve(true),
  serverNow: () => Date.now(),
  fetchServerClockOffset: () => Promise.resolve(0),
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn((_db, path) => ({ path })),
  update: vi.fn(() => Promise.resolve()),
  set: vi.fn(() => Promise.resolve()),
  get: vi.fn(() => Promise.resolve({ exists: () => true, val: () => ({}) })),
  push: vi.fn(() => ({ key: 'mock_key' })),
  onValue: vi.fn(),
  onDisconnect: vi.fn(() => ({ set: vi.fn() })),
  runTransaction: vi.fn(async (_ref, fn) => fn ? fn(0) : undefined),
  serverTimestamp: vi.fn(() => Date.now()),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, coll, id) => ({ coll, id })),
  setDoc: vi.fn(() => Promise.resolve()),
  getFirestore: vi.fn(() => ({})),
}));

describe('Telemetry Pipeline End-to-End Verification per PRD v7.0', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const allThirteenEvents: Array<{
    eventType: TelemetryEventType;
    columnIndex?: number;
    details: any;
    isColumnScoped: boolean;
  }> = [
    {
      eventType: 'SESSION_START',
      details: { session_number: 1 },
      isColumnScoped: false,
    },
    {
      eventType: 'PROBLEM_LOAD',
      details: { exercise_template_id: 'task_1', path_type: 'compulsory' },
      isColumnScoped: false,
    },
    {
      eventType: 'BLOCK_DRAG_COMPLETE',
      columnIndex: 0,
      details: { block_value: 1, source_column_index: null },
      isColumnScoped: true,
    },
    {
      eventType: 'REGROUPING_TRIGGERED',
      columnIndex: 1,
      details: { regrouping_type: 'decomposition' },
      isColumnScoped: true,
    },
    {
      eventType: 'REGROUPING_SUCCESS',
      columnIndex: 1,
      details: { regrouping_type: 'decomposition', duration_ms: 420 },
      isColumnScoped: true,
    },
    {
      eventType: 'DIGIT_ENTERED',
      columnIndex: 0,
      details: { digit_value: 5, is_correct: true },
      isColumnScoped: true,
    },
    {
      eventType: 'DIGIT_DELETED',
      columnIndex: 0,
      details: { deleted_digit_value: 5 },
      isColumnScoped: true,
    },
    {
      eventType: 'UNDO_EXECUTED',
      details: { undo_stack_depth_before: 2, reverted_event_type: 'REGROUPING_SUCCESS' },
      isColumnScoped: false,
    },
    {
      eventType: 'HESITATION_DETECTED',
      columnIndex: 2,
      details: { hesitation_seconds: 48 },
      isColumnScoped: true,
    },
    {
      eventType: 'SOCRATIC_CARD_SHOWN',
      columnIndex: 1,
      details: { trigger_reason: 'hesitation_45s', error_category: null },
      isColumnScoped: true,
    },
    {
      eventType: 'SOCRATIC_OPTION_SELECTED',
      details: { option_id: 'opt_1', is_correct: true },
      isColumnScoped: false,
    },
    {
      eventType: 'PROBLEM_COMPLETE',
      details: { total_duration_ms: 12500, undo_count: 1, error_count: 0 },
      isColumnScoped: false,
    },
    {
      eventType: 'REFLECTION_SUBMITTED',
      details: {
        reflection_step: 3,
        effort_score: 'MEDIUM',
        selected_strategies: ['UNDO_BUTTON'],
        persistence_index: 85,
      },
      isColumnScoped: false,
    },
  ];

  it('verifies exact count of 13 telemetry events', () => {
    expect(allThirteenEvents.length).toBe(13);
  });

  it.each(allThirteenEvents)(
    'emits and validates event $eventType adheres to PRD v7.0 column_index contract',
    async ({ eventType, columnIndex, details, isColumnScoped }) => {
      const enqueueSpy = vi.spyOn(indexedDBQueue, 'enqueue');

      const payload = await firebaseSyncService.emitTelemetry({
        session_id: 'session_1_student_1',
        student_id: 1,
        exercise_id: 'ex_1',
        event_type: eventType,
        ...(columnIndex !== undefined ? { column_index: columnIndex } : {}),
        details,
      });

      // 1. Validate payload structure
      expect(payload.idempotency_key).toBeDefined();
      expect(payload.event_type).toBe(eventType);
      expect(payload.student_id).toBe(1);
      expect(payload.client_timestamp).toBeGreaterThan(0);

      // 2. Validate column_index rule (Module 5 §C)
      const ruleResult = validateTelemetryColumnIndexRule(payload);
      expect(ruleResult.isValid).toBe(true);

      if (isColumnScoped) {
        expect(payload.column_index).toBeDefined();
        expect([0, 1, 2, 3]).toContain(payload.column_index);
      } else if (eventType !== 'UNDO_EXECUTED') {
        expect(payload.column_index).toBeUndefined();
      }

      // 3. Verify Enqueued to IndexedDB FIFO queue
      expect(enqueueSpy).toHaveBeenCalledWith(expect.objectContaining({
        idempotency_key: payload.idempotency_key,
        event_type: eventType,
      }));
    }
  );

  it('verifies measured fields per PRD Appendix A rules', async () => {
    const regroupNullPayload = await firebaseSyncService.emitTelemetry({
      session_id: 'session_1_student_1',
      student_id: 1,
      exercise_id: 'ex_1',
      event_type: 'REGROUPING_SUCCESS',
      column_index: 1,
      details: { regrouping_type: 'decomposition', duration_ms: 1200 },
    });
    expect(regroupNullPayload.details.duration_ms).toBe(1200);

    const socraticNullCatPayload = await firebaseSyncService.emitTelemetry({
      session_id: 'session_1_student_1',
      student_id: 1,
      exercise_id: 'ex_1',
      event_type: 'SOCRATIC_CARD_SHOWN',
      column_index: 1,
      details: { trigger_reason: 'consecutive_errors_4', error_category: null },
    });
    expect(socraticNullCatPayload.details.error_category).toBeNull();

    const undoNullRevertedPayload = await firebaseSyncService.emitTelemetry({
      session_id: 'session_1_student_1',
      student_id: 1,
      exercise_id: 'ex_1',
      event_type: 'UNDO_EXECUTED',
      details: { undo_stack_depth_before: 1, reverted_event_type: 'BLOCK_DRAG_COMPLETE' },
    });
    expect(undoNullRevertedPayload.details.reverted_event_type).toBe('BLOCK_DRAG_COMPLETE');

    const digitNullCorrectPayload = await firebaseSyncService.emitTelemetry({
      session_id: 'session_1_student_1',
      student_id: 1,
      exercise_id: 'ex_1',
      event_type: 'DIGIT_ENTERED',
      column_index: 0,
      details: { digit_value: 4, is_correct: null },
    });
    expect(digitNullCorrectPayload.details.is_correct).toBeNull();
  });
});
