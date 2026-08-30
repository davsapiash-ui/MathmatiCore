import { describe, it, expect } from 'vitest';
import {
  type AnonymousStudent,
  type ClassDocument,
  type SessionDocument,
  type SRLReflectionState,
  type VRAWorkspaceState,
  type GeminiSocraticRequest,
  type GeminiSocraticResponse,
  type TelemetryEventType,
  type TelemetryPayload,
  COLUMN_SCOPED_EVENTS,
  NON_COLUMN_EVENTS,
  validateTelemetryColumnIndexRule,
} from '../../types';

describe('Work Package 1 (WP1): Types & Security Contracts Verification', () => {
  describe('1. Student & Session Document Canonical Schemas', () => {
    it('enforces AnonymousStudent 9 canonical fields without orphaned teacher_approval_status', () => {
      const student: AnonymousStudent = {
        student_id: 3,
        class_id: 'class_pilot_01',
        school_id: 'school_control_01',
        created_at: 1723980000000,
        support_profile_id: 'enhanced_cognitive_support',
        support_profile_version: 1,
        support_profile_updated_at: 1723980000000,
        support_profile_updated_by: 'teacher_01',
        active_session_id: 'session_8_03',
      };

      expect(student.student_id).toBeGreaterThanOrEqual(1);
      expect(student.student_id).toBeLessThanOrEqual(12);
      expect(student).not.toHaveProperty('teacher_approval_status');
      expect(student).toHaveProperty('support_profile_updated_at');
      expect(student).toHaveProperty('support_profile_updated_by');
    });

    it('enforces ClassDocument pilot schema with class_name strictly המבקרים', () => {
      const cls: ClassDocument = {
        class_id: 'class_pilot_01',
        school_id: 'school_control_01',
        class_name: 'המבקרים',
        class_type: 'PILOT_3RD_GRADE',
        active_session_id: 'session_active_01',
        projector_mode: false,
        projector_mode_updated_at: Date.now(),
        updated_by_teacher_id: 'teacher_01',
      };

      expect(cls.class_name).toBe('המבקרים');
      expect(cls.projector_mode).toBe(false);
    });

    it('enforces SessionDocument structure with matrix recommendation and session score percent', () => {
      const session: SessionDocument = {
        session_id: 'session_02_student_07',
        class_id: 'class_pilot_01',
        session_number: 2,
        session_start_time: 1723980000000,
        session_deadline_time: 1723981500000,
        active_exercise_id: 'ex_07_compulsory',
        is_completed: true,
        session_score_percent: 71.4,
        teacher_gate_approved: true,
        gate_approved_at: 1723981600000,
        gate_approved_by: 'teacher_01',
        teacher_selected_path: 'green_path',
        matrix_recommended_path: 'green_path',
      };

      expect(session.session_number).toBe(2);
      expect(session.is_completed).toBe(true);
      expect(session.teacher_gate_approved).toBe(true);
      expect(session.matrix_recommended_path).toBe('green_path');
    });

    it('validates SRLReflectionState schema with persistence index and 3-step tracking', () => {
      const reflection: SRLReflectionState = {
        session_id: 'session_08_student_03',
        student_id: 3,
        reflection_step: 3,
        effort_score: 'MEDIUM',
        selected_strategies: ['UNDO_BUTTON', 'MEMORY_CIRCLES'],
        persistence_index: 85,
        reflection_completed: true,
        reflection_updated_at: Date.now(),
        idempotency_key: 'idemp-uuid-reflection-001',
      };

      expect(reflection.reflection_step).toBe(3);
      expect(reflection.selected_strategies).toContain('UNDO_BUTTON');
      expect(reflection.persistence_index).toBe(85);
    });
  });

  describe('2. Telemetry Contracts & column_index Validation Rules (Module 5 §C)', () => {
    it('contains all 13 required TelemetryEventType values', () => {
      const expectedEvents: TelemetryEventType[] = [
        'SESSION_START',
        'PROBLEM_LOAD',
        'BLOCK_DRAG_COMPLETE',
        'REGROUPING_TRIGGERED',
        'REGROUPING_SUCCESS',
        'DIGIT_ENTERED',
        'DIGIT_DELETED',
        'UNDO_EXECUTED',
        'HESITATION_DETECTED',
        'SOCRATIC_CARD_SHOWN',
        'SOCRATIC_OPTION_SELECTED',
        'PROBLEM_COMPLETE',
        'REFLECTION_SUBMITTED',
      ];

      expect(expectedEvents).toHaveLength(13);
      expect(COLUMN_SCOPED_EVENTS).toHaveLength(7);
      expect(NON_COLUMN_EVENTS).toHaveLength(5);
    });

    it('validates that DIGIT_ENTERED requires is_correct boolean and column_index (0, 1, 2)', () => {
      const validPayload: TelemetryPayload<'DIGIT_ENTERED'> = {
        idempotency_key: 'uuid-log-digit-01',
        client_timestamp: Date.now(),
        session_id: 'session_01',
        student_id: 4,
        exercise_id: 'ex_03',
        event_type: 'DIGIT_ENTERED',
        column_index: 1, // Tens column
        details: {
          digit_value: 5,
          is_correct: false, // Critical for E in Persistence Index
        },
      };

      const result = validateTelemetryColumnIndexRule(validPayload);
      expect(result.isValid).toBe(true);
      expect(validPayload.details.is_correct).toBe(false);
    });

    it('fails column_index rule if column-scoped event lacks column_index', () => {
      const invalidPayload = {
        idempotency_key: 'uuid-log-snap-01',
        client_timestamp: Date.now(),
        session_id: 'session_01',
        student_id: 2,
        exercise_id: 'ex_01',
        event_type: 'BLOCK_DRAG_COMPLETE' as const,
        // column_index missing
        details: {
          block_value: 10,
          source_column_index: 0,
        },
      };

      const result = validateTelemetryColumnIndexRule(invalidPayload as any);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain("requires a valid column_index");
    });

    it('fails column_index rule if non-column event (e.g. SESSION_START) includes column_index', () => {
      const invalidPayload = {
        idempotency_key: 'uuid-log-sess-01',
        client_timestamp: Date.now(),
        session_id: 'session_01',
        student_id: 2,
        exercise_id: 'ex_01',
        event_type: 'SESSION_START' as const,
        column_index: 0, // Illegal for SESSION_START
        details: {
          session_number: 1,
        },
      };

      const result = validateTelemetryColumnIndexRule(invalidPayload as any);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain("must not include column_index");
    });

    it('validates SOCRATIC_OPTION_SELECTED payload with option is_correct property', () => {
      const validPayload: TelemetryPayload<'SOCRATIC_OPTION_SELECTED'> = {
        idempotency_key: 'uuid-log-soc-opt-01',
        client_timestamp: Date.now(),
        session_id: 'session_05',
        student_id: 9,
        exercise_id: 'ex_04',
        event_type: 'SOCRATIC_OPTION_SELECTED',
        details: {
          option_id: 'opt_2',
          is_correct: false, // Critical for G in Persistence Index
        },
      };

      const result = validateTelemetryColumnIndexRule(validPayload);
      expect(result.isValid).toBe(true);
      expect(validPayload.details.option_id).toBe('opt_2');
      expect(validPayload.details.is_correct).toBe(false);
    });
  });

  describe('3. VRA Workspace State Machine & Socratic Gemini Contracts', () => {
    it('defines the canonical 5 VRA workspace states', () => {
      const validStates: VRAWorkspaceState[] = [
        'IDLE',
        'PROBLEM_ACTIVE',
        'REGROUPING_ACTIVE',
        'SOCRATIC_ACTIVE',
        'COMPLETE',
      ];

      expect(validStates).toHaveLength(5);
    });

    it('validates GeminiSocraticRequest and GeminiSocraticResponse shapes with student_id (1-12)', () => {
      const request: GeminiSocraticRequest = {
        student_id: 5,
        session_id: 'session_04',
        exercise_id: 'ex_02',
        active_column_index: 0,
        workspace_state: {
          ones_count: 14,
          tens_count: 2,
          hundreds_count: 1,
          thousands_count: 0,
          memory_circles: { 0: 0, 1: 0, 2: 0 },
        },
        recent_actions: [],
      };

      const response: GeminiSocraticResponse = {
        error_category: 'conceptual',
        guiding_question: 'האם יש לנו יותר מ-9 יחידות בעמודת היחידות?',
        options: [
          {
            id: 'opt_1',
            option_text: 'כן, צריך להמיר 10 יחידות לעשרת אחת',
            feedback_text: 'בדיוק! גרור 10 יחידות לעמודת העשרות',
            is_correct: true,
          },
          {
            id: 'opt_2',
            option_text: 'לא, אפשר לרשום 14 בעמודת היחידות',
            feedback_text: 'בעמודה אפשר לרשום ספרה אחת בלבד (0-9)',
            is_correct: false,
          },
          {
            id: 'opt_3',
            option_text: 'צריך למחוק 4 יחידות',
            feedback_text: 'הכמויות חייבות להישמר בדיוק',
            is_correct: false,
          },
        ],
      };

      expect(request.student_id).toBe(5);
      expect(response.options).toHaveLength(3);
      expect(response.options.filter(o => o.is_correct)).toHaveLength(1);
    });
  });
});
