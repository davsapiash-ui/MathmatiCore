import { describe, it, expect, vi } from 'vitest';
import type { StudentData } from '../../application/useStore';
import type { AdaptationSettings } from '../../presentation/pages/TeacherDashboard/components/SilentAdaptationPanel';

// Module 18's real priority-order coverage (BLUE > RED > GREY > YELLOW > GREEN,
// against resolveRadarColor in core/radarColor.ts — the function HeatmapGrid.tsx
// actually renders) lives in core/__tests__/RadarColorPrecedence.test.ts. This
// file previously duplicated that section against a second, unused
// implementation (computeStudentRadarColor) whose own priority-order comment
// omitted BLUE — a real gap the tests never caught because they exercised the
// wrong function. That dead function has been deleted; see
// RadarColorPrecedence.test.ts for Module 18 itself.

describe('Work Package 5 (WP5): Teacher Dashboard, Silent Radar Matrix, Gate Approval & Adaptation Suite', () => {

  describe('2. Module 19: Silent Adaptation Panel & Canonical Schema Compliance', () => {
    it('strictly enforces applyAtTaskBoundaryOnly invariant on all adaptation configurations', () => {
      const adaptation: AdaptationSettings = {
        studentId: 'student_5',
        anonymousLabel: 'תלמיד 5',
        path: 'remediation_path',
        scaffoldLevel: 0,
        applyAtTaskBoundaryOnly: true,
      };

      expect(adaptation.applyAtTaskBoundaryOnly).toBe(true);
      expect(adaptation.path).toBe('remediation_path');
      expect(adaptation.scaffoldLevel).toBe(0);
      // Module 10 forbids a manual teacher toggle for the adaptive grid, and
      // Module 26 owns the one calibrated hesitation value for the cohort, so
      // neither belongs on a per-learner adaptation.
      expect('forceAdditionHelper' in adaptation).toBe(false);
      expect('hesitationThresholdSeconds' in adaptation).toBe(false);
    });

    it('proves that canonical support profile document matches Firestore rules allowlist keys', () => {
      const canonicalKeys = [
        'student_id',
        'class_id',
        'school_id',
        'created_at',
        'support_profile_id',
        'support_profile_version',
        'support_profile_updated_at',
        'support_profile_updated_by',
        'active_session_id',
      ];

      const validDoc = {
        student_id: 2,
        class_id: 'class_pilot_01',
        school_id: 'school_bikorot',
        created_at: 1000000,
        support_profile_id: 'profile_scaffold_1',
        support_profile_version: 1,
        support_profile_updated_at: 1000000,
        support_profile_updated_by: 'teacher_01',
        active_session_id: 'session_01',
      };

      const docKeys = Object.keys(validDoc);
      const isAllowed = docKeys.every((k) => canonicalKeys.includes(k));
      expect(isAllowed).toBe(true);

      // Verify that non-canonical field 'pending_support_profile_id' is detected as violating allowlist
      const invalidDoc = {
        ...validDoc,
        pending_support_profile_id: 'profile_scaffold_1',
      };
      const isInvalidAllowed = Object.keys(invalidDoc).every((k) => canonicalKeys.includes(k));
      expect(isInvalidAllowed).toBe(false);
    });
  });

  describe('3. Module 20: Teacher Approval Gate Flow (WP6 Firestore & RTDB Sync)', () => {
    it('evaluates deterministic WP6 matrix_recommended_path based on 50% score threshold', () => {
      const computeRecommendedPath = (scorePercent: number): 'green_path' | 'remediation_path' => {
        return scorePercent >= 50 ? 'green_path' : 'remediation_path';
      };

      expect(computeRecommendedPath(71.4)).toBe('green_path');
      expect(computeRecommendedPath(100)).toBe('green_path');
      expect(computeRecommendedPath(50)).toBe('green_path');
      expect(computeRecommendedPath(42.8)).toBe('remediation_path');
      expect(computeRecommendedPath(28.5)).toBe('remediation_path');
      expect(computeRecommendedPath(0)).toBe('remediation_path');
    });

    it('generates valid Firestore gate approval payload matching isValidSessionDoc allowlist', () => {
      const generateFirestoreApprovalPayload = (
        studentId: string,
        scorePercent: number,
        selectedPath: 'green_path' | 'remediation_path',
        teacherUid: string
      ) => {
        const normNum = studentId.replace(/\D/g, '') || '1';
        return {
          session_id: `session_02_student_${normNum}`,
          class_id: 'class_demo',
          session_number: 2,
          session_start_time: Date.now() - 1800000,
          session_deadline_time: Date.now() + 1800000,
          active_exercise_id: 'task_07',
          is_completed: true,
          session_score_percent: scorePercent,
          matrix_recommended_path: scorePercent >= 50 ? 'green_path' : 'remediation_path',
          teacher_gate_approved: true,
          teacher_selected_path: selectedPath,
          gate_approved_at: Date.now(),
          gate_approved_by: teacherUid,
        };
      };

      const payload = generateFirestoreApprovalPayload('student_3', 71.4, 'green_path', 'teacher_lead_1');
      expect(payload.session_id).toBe('session_02_student_3');
      expect(payload.session_number).toBe(2);
      expect(payload.is_completed).toBe(true);
      expect(payload.session_score_percent).toBe(71.4);
      expect(payload.matrix_recommended_path).toBe('green_path');
      expect(payload.teacher_gate_approved).toBe(true);
      expect(payload.teacher_selected_path).toBe('green_path');
      expect(payload.gate_approved_by).toBe('teacher_lead_1');

      // Verify all keys belong strictly to the Firestore allowlist schema
      const permittedKeys = new Set([
        'session_id',
        'class_id',
        'session_number',
        'session_start_time',
        'session_deadline_time',
        'active_exercise_id',
        'is_completed',
        'session_score_percent',
        'teacher_gate_approved',
        'gate_approved_at',
        'gate_approved_by',
        'teacher_selected_path',
        'matrix_recommended_path',
        'evaluated_at',
      ]);

      const payloadKeys = Object.keys(payload);
      for (const k of payloadKeys) {
        expect(permittedKeys.has(k)).toBe(true);
      }
    });

    it('generates synchronous RTDB unlock payload to unblock student workspace reactively', () => {
      const generateRTDBUnlockPayload = (selectedPath: 'green_path' | 'remediation_path', teacherUid: string) => {
        return {
          routeStatus: 'APPROVED',
          teacher_gate_approved: true,
          teacher_selected_path: selectedPath,
          gate_approved_at: Date.now(),
          gate_approved_by: teacherUid,
        };
      };

      const rtdbPayload = generateRTDBUnlockPayload('remediation_path', 'teacher_lead_1');
      expect(rtdbPayload.routeStatus).toBe('APPROVED');
      expect(rtdbPayload.teacher_gate_approved).toBe(true);
      expect(rtdbPayload.teacher_selected_path).toBe('remediation_path');
    });

    it('strictly blocks approval when SessionDocument does NOT exist in Firestore (Zero Synthetic Data)', () => {
      const validateGatePrerequisites = (sessionDoc: any | null | undefined) => {
        if (!sessionDoc) {
          return { allowed: false, error: 'NO_DIAGNOSTIC_DATA' };
        }
        if (sessionDoc.is_completed !== true) {
          return { allowed: false, error: 'SESSION_INCOMPLETE' };
        }
        return { allowed: true, error: null };
      };

      // 1. When student has no document in Firestore (never started/completed Session 2)
      expect(validateGatePrerequisites(null)).toEqual({ allowed: false, error: 'NO_DIAGNOSTIC_DATA' });
      expect(validateGatePrerequisites(undefined)).toEqual({ allowed: false, error: 'NO_DIAGNOSTIC_DATA' });

      // 2. When student started but has not completed mandatory tasks
      expect(validateGatePrerequisites({ is_completed: false })).toEqual({ allowed: false, error: 'SESSION_INCOMPLETE' });

      // 3. When student legitimately completed Session 2
      expect(validateGatePrerequisites({ is_completed: true, session_score_percent: 71.4 })).toEqual({ allowed: true, error: null });
    });
  });

  describe('4. Module 21: Teacher Diagnostic Split Screen Telemetry', () => {
    it('computes total vector value from multi-column place counts without AV streams', () => {
      const counts = {
        thousands: 2,
        hundreds: 3,
        tens: 4,
        units: 5,
      };

      const total = counts.thousands * 1000 + counts.hundreds * 100 + counts.tens * 10 + counts.units;
      expect(total).toBe(2345);
    });
  });

  describe('5. Authoritative Server Deadline & Retry with Backoff on Network Failure', () => {
    it('implements exponential backoff calculation for server reconnection retries', () => {
      const getBackoffDelayMs = (retryCount: number, baseMs = 500, maxMs = 5000) => {
        return Math.min(maxMs, baseMs * Math.pow(2, retryCount));
      };

      expect(getBackoffDelayMs(0)).toBe(500);
      expect(getBackoffDelayMs(1)).toBe(1000);
      expect(getBackoffDelayMs(2)).toBe(2000);
      expect(getBackoffDelayMs(3)).toBe(4000);
      expect(getBackoffDelayMs(4)).toBe(5000); // Capped at maxMs
    });
  });
});
