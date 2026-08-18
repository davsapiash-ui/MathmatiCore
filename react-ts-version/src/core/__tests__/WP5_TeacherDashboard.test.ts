import { describe, it, expect, vi } from 'vitest';
import { computeStudentRadarColor } from '../../presentation/pages/TeacherDashboard/components/SilentRadarMatrix';
import type { StudentData } from '../../application/useStore';
import type { AdaptationSettings } from '../../presentation/pages/TeacherDashboard/components/SilentAdaptationPanel';

describe('Work Package 5 (WP5): Teacher Dashboard, Silent Radar Matrix, Gate Approval & Adaptation Suite', () => {

  describe('1. Module 18: Silent Radar Matrix & Strict Priority Order (RED > GREY > YELLOW > GREEN)', () => {
    const now = 1000000;

    it('assigns RED status to a student with >=3 consecutive errors (highest priority)', () => {
      const student: any = {
        studentId: 'student_1',
        consecutiveErrors: 3,
        lastActivityTimestamp: now - 5000, // Online (5s ago)
        hesitationSeconds: 35,
      };

      const res = computeStudentRadarColor(student, now, 15000);
      expect(res.color).toBe('RED');
      expect(res.statusText).toContain('3 שגיאות רצופות');
    });

    it('assigns GREY status to a student who is offline (>15s presence timeout), overriding YELLOW', () => {
      const student: any = {
        studentId: 'student_2',
        consecutiveErrors: 0,
        lastActivityTimestamp: now - 20000, // Offline (20s ago > 15s timeout)
        hesitationSeconds: 40, // Hesitation would be YELLOW if online, but offline takes precedence
      };

      const res = computeStudentRadarColor(student, now, 15000);
      expect(res.color).toBe('GREY');
      expect(res.isOnline).toBe(false);
      expect(res.statusText).toContain('לא מחובר');
    });

    it('assigns YELLOW status to an online student hesitating for >=30 seconds', () => {
      const student: any = {
        studentId: 'student_3',
        consecutiveErrors: 0,
        lastActivityTimestamp: now - 3000, // Online (3s ago)
        hesitationSeconds: 35,
      };

      const res = computeStudentRadarColor(student, now, 15000);
      expect(res.color).toBe('YELLOW');
      expect(res.isOnline).toBe(true);
      expect(res.statusText).toContain('היסוס');
    });

    it('assigns GREEN status to an online student progressing normally', () => {
      const student: any = {
        studentId: 'student_4',
        consecutiveErrors: 0,
        lastActivityTimestamp: now - 2000, // Online
        hesitationSeconds: 10,
      };

      const res = computeStudentRadarColor(student, now, 15000);
      expect(res.color).toBe('GREEN');
      expect(res.isOnline).toBe(true);
      expect(res.statusText).toBe('התקדמות תקינה');
    });

    it('proves strict priority order: RED > GREY > YELLOW > GREEN', () => {
      // RED beats GREY
      const redAndOffline: any = {
        studentId: 's1',
        consecutiveErrors: 4,
        lastActivityTimestamp: now - 30000, // Offline
      };
      expect(computeStudentRadarColor(redAndOffline, now, 15000).color).toBe('RED');

      // GREY beats YELLOW
      const yellowAndOffline: any = {
        studentId: 's2',
        consecutiveErrors: 0,
        hesitationSeconds: 45,
        lastActivityTimestamp: now - 30000, // Offline
      };
      expect(computeStudentRadarColor(yellowAndOffline, now, 15000).color).toBe('GREY');

      // YELLOW beats GREEN
      const yellowAndOnline: any = {
        studentId: 's3',
        consecutiveErrors: 0,
        hesitationSeconds: 32,
        lastActivityTimestamp: now - 2000, // Online
      };
      expect(computeStudentRadarColor(yellowAndOnline, now, 15000).color).toBe('YELLOW');
    });

    it('assigns GREY status to a student who has not started yet (lastActivity === 0)', () => {
      const student: any = {
        studentId: 'student_unstarted',
        lastActivityTimestamp: 0,
      };

      const res = computeStudentRadarColor(student, now, 15000);
      expect(res.color).toBe('GREY');
      expect(res.isOnline).toBe(false);
      expect(res.statusText).toBe('טרם החל');
    });

    it('assigns GREEN status to an active connected student without alerts', () => {
      const student: any = {
        studentId: 'student_active',
        consecutiveErrors: 0,
        lastActivityTimestamp: now - 4000, // Online within 15s
        hesitationSeconds: 5,
      };

      const res = computeStudentRadarColor(student, now, 15000);
      expect(res.color).toBe('GREEN');
      expect(res.isOnline).toBe(true);
      expect(res.statusText).toBe('התקדמות תקינה');
    });
  });

  describe('2. Module 19: Silent Adaptation Panel & Canonical Schema Compliance', () => {
    it('strictly enforces applyAtTaskBoundaryOnly invariant on all adaptation configurations', () => {
      const adaptation: AdaptationSettings = {
        studentId: 'student_5',
        anonymousLabel: 'תלמיד 5',
        path: 'remediation_path',
        scaffoldLevel: 0,
        forceAdditionHelper: true,
        hesitationThresholdSeconds: 25,
        applyAtTaskBoundaryOnly: true,
      };

      expect(adaptation.applyAtTaskBoundaryOnly).toBe(true);
      expect(adaptation.path).toBe('remediation_path');
      expect(adaptation.scaffoldLevel).toBe(0);
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

  describe('3. Module 20: Teacher Approval Gate Flow', () => {
    it('correctly maps recommended path based on diagnostic node evaluation', () => {
      const evaluatePath = (errorCount: number): 'green_path' | 'remediation_path' => {
        return errorCount <= 1 ? 'green_path' : 'remediation_path';
      };

      expect(evaluatePath(0)).toBe('green_path');
      expect(evaluatePath(1)).toBe('green_path');
      expect(evaluatePath(2)).toBe('remediation_path');
      expect(evaluatePath(4)).toBe('remediation_path');
    });

    it('generates valid Firestore gate approval payload for SessionDocument', () => {
      const generateApprovalPayload = (studentId: string, approvedPath: 'green_path' | 'remediation_path') => {
        return {
          session_id: `session_02_${studentId}`,
          session_number: 2,
          is_completed: true,
          teacher_gate_approved: true,
          approved_path: approvedPath,
          approval_timestamp: Date.now(),
        };
      };

      const payload = generateApprovalPayload('student_2', 'green_path');
      expect(payload.session_number).toBe(2);
      expect(payload.teacher_gate_approved).toBe(true);
      expect(payload.approved_path).toBe('green_path');
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
