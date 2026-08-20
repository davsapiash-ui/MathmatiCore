import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isWhitelistedTeacherEmail, isWhitelistedTeacherEmailAsync } from '@/infrastructure/services/AuthService';
import { useAuthStore, JWT_EXPIRY_MS } from '@/application/useAuthStore';
import {
  isValidIsraeliID,
  containsPII,
  sanitizePII,
  validateZeroPIIPayload,
  PII_PHONE_REGEX,
  PII_EMAIL_REGEX,
} from '@/core/security/PiiFilter';

describe('Master PRD v5.0 Phase 1: Core Infrastructure & Authentication (Modules 1, 2, 3)', () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
  });

  describe('Module 1: Login Module & Whitelist Verification', () => {
    it('strictly accepts authorized teacher email davidsep@edu-haifa.org.il', async () => {
      expect(isWhitelistedTeacherEmail('davidsep@edu-haifa.org.il')).toBe(true);
      const isAuth = await isWhitelistedTeacherEmailAsync('davidsep@edu-haifa.org.il');
      expect(isAuth).toBe(true);
    });

    it('strictly accepts authorized teacher email 1002220159@edu-haifa.org.il', async () => {
      expect(isWhitelistedTeacherEmail('1002220159@edu-haifa.org.il')).toBe(true);
      const isAuth = await isWhitelistedTeacherEmailAsync('1002220159@edu-haifa.org.il');
      expect(isAuth).toBe(true);
    });

    it('strictly rejects unauthorized emails without wildcard or domain-wide approval', async () => {
      expect(isWhitelistedTeacherEmail('unknown_teacher@edu-haifa.org.il')).toBe(false);
      expect(isWhitelistedTeacherEmail('random@gmail.com')).toBe(false);
      expect(isWhitelistedTeacherEmail('student@school.gov.il')).toBe(false);
      expect(isWhitelistedTeacherEmail('')).toBe(false);
      expect(isWhitelistedTeacherEmail(null)).toBe(false);
    });

    it('enforces student sequential login: accepts integer student_id between 1 and 12', () => {
      for (let id = 1; id <= 12; id++) {
        useAuthStore.getState().setUser(
          {
            uid: `student_user${id}`,
            student_id: id,
            school_id: 'sch_control',
            class_name: 'המבקרים',
            class_type: 'כיתת ביקורת',
          },
          'student'
        );
        const state = useAuthStore.getState();
        expect(state.isAuthenticated).toBe(true);
        expect(state.role).toBe('student');
        expect(state.user?.student_id).toBe(id);
      }
    });

    it('rejects student logins outside the 1..12 integer range', () => {
      const invalidIds = [0, 13, 99, -5];
      for (const invalidId of invalidIds) {
        useAuthStore.getState().setUser(
          {
            uid: `student_user${invalidId}`,
            student_id: invalidId,
          },
          'student'
        );
        const state = useAuthStore.getState();
        expect(state.isAuthenticated).toBe(false);
        expect(state.user).toBeNull();
      }
    });
  });

  describe('Module 2: Role Switcher & Route Guarding', () => {
    it('presents a blocking selection screen when a user has dual claims', () => {
      useAuthStore.getState().setUser({
        uid: 'user_dual_1',
        email: 'davidsep@edu-haifa.org.il',
        dualClaims: ['teacher', 'admin'],
      });

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.role).toBeNull();
      expect(state.showRoleSelector).toBe(true);
      expect(state.isRoleLocked).toBe(false);
    });

    it('transitions to selected role in <100ms and locks the route', () => {
      useAuthStore.getState().setUser({
        uid: 'user_dual_1',
        email: 'davidsep@edu-haifa.org.il',
        dualClaims: ['teacher', 'admin'],
      });

      const startTime = performance.now();
      useAuthStore.getState().selectRole('teacher');
      const duration = performance.now() - startTime;

      const state = useAuthStore.getState();
      expect(duration).toBeLessThan(100);
      expect(state.role).toBe('teacher');
      expect(state.showRoleSelector).toBe(false);
      expect(state.isRoleLocked).toBe(true);
    });

    it('identifies expired tokens past the 8-hour continuous work threshold', () => {
      useAuthStore.getState().setUser(
        {
          uid: 'teacher_1',
          email: 'davidsep@edu-haifa.org.il',
          role: 'teacher',
          authTimestamp: Date.now() - (JWT_EXPIRY_MS + 1000), // 8 hours + 1 second ago
        },
        'teacher'
      );

      const isExpired = useAuthStore.getState().isTokenExpired();
      expect(isExpired).toBe(true);
    });

    it('identifies active tokens within 8-hour threshold', () => {
      useAuthStore.getState().setUser(
        {
          uid: 'teacher_1',
          email: 'davidsep@edu-haifa.org.il',
          role: 'teacher',
          authTimestamp: Date.now() - (4 * 60 * 60 * 1000), // 4 hours ago
        },
        'teacher'
      );

      const isExpired = useAuthStore.getState().isTokenExpired();
      expect(isExpired).toBe(false);
    });
  });

  describe('Module 3: Zero PII Security & Identity Masking', () => {
    it('validates Israeli National IDs correctly with Luhn-based checksum', () => {
      expect(isValidIsraeliID('123456782')).toBe(true);
      expect(isValidIsraeliID('12345674')).toBe(true); // padded to 9 digits (012345674)
      expect(isValidIsraeliID('123456789')).toBe(false); // invalid checksum
      expect(isValidIsraeliID('000000000')).toBe(true);
      expect(isValidIsraeliID('111111111')).toBe(false);
    });

    it('detects PII in strings: phone numbers, national IDs, emails', () => {
      expect(containsPII('הטלפון שלי הוא 052-1234567')).toBe(true);
      expect(containsPII('פנה אל teacher@edu-haifa.org.il לקבלת סיוע')).toBe(true);
      expect(containsPII('תעודת זהות של התלמיד 123456782')).toBe(true);
      expect(containsPII('תלמיד 5 פתר תרגיל חיבור בטורים')).toBe(false);
      expect(containsPII('אין כאן שום מידע מזהה')).toBe(false);
    });

    it('sanitizes strings containing PII into anonymous tokens', () => {
      const dirty = 'משתמש: test@domain.com, טלפון: 0501234567, תז: 123456782';
      const clean = sanitizePII(dirty);
      expect(clean).toContain('[EMAIL_REDACTED]');
      expect(clean).toContain('[PHONE_REDACTED]');
      expect(clean).toContain('***6782');
      expect(containsPII(clean)).toBe(false);
    });

    it('rejects database write payloads containing forbidden PII keys', () => {
      const payloadWithEmail = {
        student_id: 3,
        email: 'child@school.com',
        score: 100,
      };
      const resultEmail = validateZeroPIIPayload(payloadWithEmail);
      expect(resultEmail.valid).toBe(false);
      expect(resultEmail.reason).toContain('Forbidden PII field');

      const payloadWithName = {
        student_id: 3,
        name: 'יוסי כהן',
        action: 'DECOMPOSITION_SUCCESS',
      };
      const resultName = validateZeroPIIPayload(payloadWithName);
      expect(resultName.valid).toBe(false);
      expect(resultName.reason).toContain('Forbidden PII field');
    });

    it('rejects payloads with student_id outside 1..12', () => {
      const payloadBadId = {
        student_id: 15,
        action: 'DECOMPOSITION_SUCCESS',
      };
      const result = validateZeroPIIPayload(payloadBadId);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('student_id must be an integer between 1 and 12');
    });

    it('approves compliant anonymous VRA telemetry payloads', () => {
      const compliantPayload = {
        log_id: 'log_8849203',
        student_id: 8,
        timestamp: 1787155141,
        action_type: 'DECOMPOSITION_SUCCESS',
        payload: {
          active_column: 'tens',
          source_column: 'hundreds',
          decomposed_block_count: 1,
          target_block_count: 10,
          memory_circles: {
            hundreds: 3,
            tens: 10,
          },
        },
      };
      const result = validateZeroPIIPayload(compliantPayload);
      expect(result.valid).toBe(true);
    });
  });
});
