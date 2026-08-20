import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';
import type { GeminiSocraticRequest } from '@/types';

describe('PHASE 5 EMPIRICAL AUDIT & INTEGRATION TEST SUITE (PRD v6.5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // TEST 1: API Contract Strictness & Payload Compliance (Module 13 & Appendix A §6)
  // =========================================================================
  describe('TEST 1: GeminiSocraticRequest Payload Strictness (Module 13 & Appendix A §6)', () => {
    it('builds outgoing request payload matching GeminiSocraticRequest schema with student_id (1-12)', () => {
      const requestPayload: GeminiSocraticRequest = SocraticEngine.buildGeminiSocraticRequest({
        studentId: 'student_user7',
        sessionId: 'session_03_student_7',
        exerciseId: 's3_t1',
        activeColumnIndex: 1, // Tens
        workspaceState: {
          ones_count: 11,
          tens_count: 3,
          hundreds_count: 2,
          memory_circles: { '0': 1 },
        },
        recentActions: [
          {
            event_type: 'BLOCK_DRAG_COMPLETE',
            client_timestamp: Date.now(),
            session_id: 'session_03_student_7',
            student_id: 7,
            exercise_id: 's3_t1',
            column_index: 0,
            details: { block_value: 10, source_column_index: 0 },
            idempotency_key: 'key_123',
          },
        ],
      });

      // 1. Verify student_id is strictly integer 1-12 (No deprecated anonymous_student_id)
      expect(requestPayload.student_id).toBe(7);
      expect((requestPayload as any).anonymous_student_id).toBeUndefined();
      expect(typeof requestPayload.student_id).toBe('number');
      expect(requestPayload.student_id).toBeGreaterThanOrEqual(1);
      expect(requestPayload.student_id).toBeLessThanOrEqual(12);

      // 2. Verify workspace_state structure
      expect(requestPayload.workspace_state).toEqual({
        ones_count: 11,
        tens_count: 3,
        hundreds_count: 2,
        memory_circles: { '0': 1 },
      });

      // 3. Verify session & exercise identifiers
      expect(requestPayload.session_id).toBe('session_03_student_7');
      expect(requestPayload.exercise_id).toBe('s3_t1');
      expect(requestPayload.active_column_index).toBe(1);
      expect(requestPayload.recent_actions).toHaveLength(1);
    });
  });

  // =========================================================================
  // TEST 2: Socratic Guardrails & Resilient Fallback (Module 13)
  // =========================================================================
  describe('TEST 2: Socratic AI 500 Error / Timeout Resilient Fallback (Module 13)', () => {
    it('gracefully falls back to pre-configured static Socratic hint upon 500 API failure without crashing', async () => {
      // Mock fetch to simulate Gemini API 500 Internal Server Error
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return {
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: async () => ({ error: { message: 'Gemini Quota Exceeded' } }),
        } as unknown as Response;
      });

      const request: GeminiSocraticRequest = {
        student_id: 4,
        session_id: 'session_01_student_4',
        exercise_id: 's1_license_test',
        active_column_index: 2,
        workspace_state: {
          ones_count: 0,
          tens_count: 2,
          hundreds_count: 4,
          memory_circles: {},
        },
        recent_actions: [],
      };

      // Call requestSocraticHintWithFallback with failing API
      const result = await SocraticEngine.requestSocraticHintWithFallback(request, { id: 's1_license_test' });

      // Assert that a valid SocraticHintResponse was returned without throwing
      expect(result).toBeDefined();
      expect(result.questionHe).toBe('כיצד מייצגים את המספר 420 בבית המספרים?');
      expect(result.choices).toHaveLength(3);
      expect(result.correctChoiceId).toBe('opt_1');
      expect(result.choices[0].textHe).toContain('4 בלוקים בטור המאות');

      // Verify no direct answer disclosure or crash
      expect(result.questionHe).not.toContain('420 = 400 + 20');
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('gracefully falls back to static hint upon API timeout or network rejection', async () => {
      // Mock fetch to simulate network timeout / connection abort
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('AbortError: The operation was aborted.'));

      const request: GeminiSocraticRequest = {
        student_id: 9,
        session_id: 'session_01_student_9',
        exercise_id: 's1_t10',
        active_column_index: 1,
        workspace_state: {
          ones_count: 5,
          tens_count: 2,
          hundreds_count: 4,
          memory_circles: {},
        },
        recent_actions: [],
      };

      const result = await SocraticEngine.requestSocraticHintWithFallback(request, { id: 's1_t10' });

      expect(result).toBeDefined();
      expect(result.questionHe).toBe('חסרות לנו עשרות בלוח כדי לחסר — מה עושים?');
      expect(result.choices).toHaveLength(3);
      expect(result.correctChoiceId).toBe('opt_1');
    });
  });
});
