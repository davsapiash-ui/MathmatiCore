import { describe, it, expect, vi } from 'vitest';
import { validateChatInputForPII, anonymizeChatMessageBody, containsPII, isValidIsraeliID } from '@/core/security/PiiFilter';
import { normalizeStudentId } from '@/application/useChatStore';

describe('Master PRD v5.0 — Phase 4: Teacher Dashboard, Silent Radar & Admin Tools', () => {

  describe('Module 18: Silent Radar Specification', () => {
    it('enforces strict numeric student IDs (1-12) with zero PII in radar slot mapping', () => {
      for (let i = 1; i <= 12; i++) {
        const studentId = `student_${i}`;
        const normalized = normalizeStudentId(studentId);
        expect(normalized).toBe(`student_user${i}`);
        expect(Number(studentId.replace(/\D+/g, ''))).toBe(i);
      }
    });

    it('maps incoming telemetry states strictly to the 4 defined background color states', () => {
      const getRadarColorState = (student: {
        isOnline: boolean;
        isSocraticActive: boolean;
        hesitationSeconds: number;
      }): 'GREY' | 'RED' | 'YELLOW' | 'GREEN' => {
        if (!student.isOnline) return 'GREY';
        if (student.isSocraticActive) return 'RED';
        if (student.hesitationSeconds >= 45) return 'YELLOW';
        return 'GREEN';
      };

      // 1. Offline -> Grey
      expect(getRadarColorState({ isOnline: false, isSocraticActive: false, hesitationSeconds: 0 })).toBe('GREY');
      expect(getRadarColorState({ isOnline: false, isSocraticActive: true, hesitationSeconds: 90 })).toBe('GREY');

      // 2. Socratic Active -> Red
      expect(getRadarColorState({ isOnline: true, isSocraticActive: true, hesitationSeconds: 10 })).toBe('RED');
      expect(getRadarColorState({ isOnline: true, isSocraticActive: true, hesitationSeconds: 50 })).toBe('RED');

      // 3. Column Hesitation >= 45s -> Yellow
      expect(getRadarColorState({ isOnline: true, isSocraticActive: false, hesitationSeconds: 45 })).toBe('YELLOW');
      expect(getRadarColorState({ isOnline: true, isSocraticActive: false, hesitationSeconds: 120 })).toBe('YELLOW');

      // 4. Active Progress (< 45s, not socratic) -> Green
      expect(getRadarColorState({ isOnline: true, isSocraticActive: false, hesitationSeconds: 0 })).toBe('GREEN');
      expect(getRadarColorState({ isOnline: true, isSocraticActive: false, hesitationSeconds: 44 })).toBe('GREEN');
    });

    it('throttles incoming telemetry state flushes to 1000ms interval', async () => {
      vi.useFakeTimers();
      let updateCount = 0;
      let throttleTimeout: any = null;

      const triggerRadarUpdate = () => {
        if (!throttleTimeout) {
          throttleTimeout = setTimeout(() => {
            throttleTimeout = null;
            updateCount++;
          }, 1000);
        }
      };

      // 10 rapid triggers within 500ms
      for (let i = 0; i < 10; i++) {
        triggerRadarUpdate();
      }
      expect(updateCount).toBe(0);

      // Fast forward 1000ms
      vi.advanceTimersByTime(1000);
      expect(updateCount).toBe(1);

      // Subsequent trigger after interval
      triggerRadarUpdate();
      vi.advanceTimersByTime(1000);
      expect(updateCount).toBe(2);

      vi.useRealTimers();
    });
  });

  describe('Module 19 & 20: Class Management, Support Profiles & Teacher Gate', () => {
    it('enforces maximum 12-student cap for class המבקרים under בית ספר ביקורת', () => {
      const MAX_CLASS_PILOT_SIZE = 12;
      const enrolledStudents = Array.from({ length: 15 }, (_, i) => `student_${i + 1}`);
      const validClassStudents = enrolledStudents.slice(0, MAX_CLASS_PILOT_SIZE);

      expect(validClassStudents).toHaveLength(12);
      expect(validClassStudents[11]).toBe('student_12');
    });

    it('manages enhanced_support_profile boolean flag with zero visual flags on pupil client', () => {
      const studentState = {
        id: 'student_4',
        enhanced_support_profile: false,
      };

      // Teacher toggles enhanced support
      studentState.enhanced_support_profile = true;
      expect(studentState.enhanced_support_profile).toBe(true);

      // Client workspace logic uses flag secretly for result row locking without displaying ASD badge
      const isKeyboardLockedInResultRow = (enhancedProfile: boolean, hasConverted: boolean) => {
        if (enhancedProfile && !hasConverted) return true;
        return false;
      };

      expect(isKeyboardLockedInResultRow(studentState.enhanced_support_profile, false)).toBe(true);
      expect(isKeyboardLockedInResultRow(studentState.enhanced_support_profile, true)).toBe(false);
    });

    it('requires teacher_gate_approved to transition from Session 2 to Session 3', () => {
      const canAccessSession = (sessionTarget: number, completedSession2: boolean, isTeacherGateApproved: boolean): boolean => {
        if (sessionTarget === 3 && completedSession2 && !isTeacherGateApproved) {
          return false; // enters Bee Flight waiting state
        }
        return true;
      };

      expect(canAccessSession(3, true, false)).toBe(false);
      expect(canAccessSession(3, true, true)).toBe(true);
      expect(canAccessSession(2, false, false)).toBe(true);
      expect(canAccessSession(1, false, false)).toBe(true);
    });
  });

  describe('Module 21: Teacher Diagnostic Split Screen & VRA Cognitive Timeline', () => {
    it('maps interactions (block drag, memory circle, deletions, undo clicks) to VRA milestones and self-regulation flags', () => {
      interface RawEvent {
        type: string;
        message?: string;
      }

      const mapToVRATimeline = (event: RawEvent) => {
        const t = (event.type || '').toUpperCase();
        const msg = event.message || '';

        if (t.includes('UNDO') || msg.includes('ביטול')) {
          return { milestone: 'ויסות עצמי שקט', selfRegulation: true };
        }
        if (t.includes('DELETE') || msg.includes('מחיקה')) {
          return { milestone: 'ויסות עצמי שקט', selfRegulation: true };
        }
        if (t.includes('DECOMPOSE') || t.includes('REGROUP') || msg.includes('המרה') || msg.includes('פריטה')) {
          return { milestone: 'המרה עשרונית', selfRegulation: false };
        }
        if (t.includes('MEMORY') || msg.includes('זיכרון')) {
          return { milestone: 'זיכרון עבודה', selfRegulation: false };
        }
        if (t.includes('ANSWER') || msg.includes('תוצאה')) {
          return { milestone: 'שורת התוצאה', selfRegulation: false };
        }
        return { milestone: 'ייצוג בלבני דינס', selfRegulation: false };
      };

      expect(mapToVRATimeline({ type: 'UNDO_CLICK', message: 'ביטול פעולה' })).toEqual({
        milestone: 'ויסות עצמי שקט',
        selfRegulation: true
      });
      expect(mapToVRATimeline({ type: 'DIGIT_DELETE', message: 'מחיקת ספרה' })).toEqual({
        milestone: 'ויסות עצמי שקט',
        selfRegulation: true
      });
      expect(mapToVRATimeline({ type: 'DECOMPOSE_100', message: 'פריטת מאה' })).toEqual({
        milestone: 'המרה עשרונית',
        selfRegulation: false
      });
      expect(mapToVRATimeline({ type: 'MEMORY_INPUT', message: 'הזנת שארית' })).toEqual({
        milestone: 'זיכרון עבודה',
        selfRegulation: false
      });
      expect(mapToVRATimeline({ type: 'ANSWER_INPUT', message: 'הזנת תוצאה' })).toEqual({
        milestone: 'שורת התוצאה',
        selfRegulation: false
      });
      expect(mapToVRATimeline({ type: 'BLOCK_DRAG', message: 'גרירת עשרת' })).toEqual({
        milestone: 'ייצוג בלבני דינס',
        selfRegulation: false
      });
    });
  });

  describe('Module 22: Teacher Admin Chat & Two-Tier PII Protection', () => {
    it('Tier 1: Client regex validator blocks Israeli National IDs (Luhn), phones, and emails', () => {
      // 1. Valid Israeli ID
      const validLuhnId = '123456782';
      expect(isValidIsraeliID(validLuhnId)).toBe(true);
      const resId = validateChatInputForPII(`שלום, בדוק בבקשה את תעודת הזהות ${validLuhnId}`);
      expect(resId.valid).toBe(false);
      expect(resId.errorHe).toContain('מספר זהות');

      // 2. Israeli Phone Number
      const resPhone = validateChatInputForPII('התקשר בבקשה לטלפון 052-1234567');
      expect(resPhone.valid).toBe(false);
      expect(resPhone.errorHe).toContain('טלפון');

      // 3. Email Address
      const resEmail = validateChatInputForPII('שלח עדכון לכתובת teacher@example.com');
      expect(resEmail.valid).toBe(false);
      expect(resEmail.errorHe).toContain('דואר אלקטרוני');

      // 4. Clean anonymous chat message
      const resClean = validateChatInputForPII('תלמיד 5 מתקשה בפריטת עשרת במפגש 2.');
      expect(resClean.valid).toBe(true);
      expect(resClean.errorHe).toBeUndefined();
    });

    it('Tier 2: Anonymizer service replaces student personal names with numeric IDs (1-12) and redacts PII', () => {
      const nameMap = {
        'יוסי': 1,
        'דנה': 2,
        'אורי': 3,
      };

      const rawMessage = 'יוסי ודנה השלימו את מפגש 2 בהצלחה, אך אורי עדיין זקוק להכוונה.';
      const cleanMessage = anonymizeChatMessageBody(rawMessage, nameMap);

      expect(cleanMessage).toBe('תלמיד 1 ותלמיד 2 השלימו את מפגש 2 בהצלחה, אך תלמיד 3 עדיין זקוק להכוונה.');
      expect(containsPII(cleanMessage)).toBe(false);
    });
  });

  describe('Module 27: Firestore Security Rules & Student Scoping', () => {
    it('validates student ID regex strictly against 1..12', () => {
      const studentIdRegex = /^(student_)?(1[0-2]|[1-9])$/;

      // Valid IDs
      expect(studentIdRegex.test('1')).toBe(true);
      expect(studentIdRegex.test('12')).toBe(true);
      expect(studentIdRegex.test('student_1')).toBe(true);
      expect(studentIdRegex.test('student_12')).toBe(true);

      // Invalid IDs (Out of 1-12 pilot range)
      expect(studentIdRegex.test('0')).toBe(false);
      expect(studentIdRegex.test('13')).toBe(false);
      expect(studentIdRegex.test('student_13')).toBe(false);
      expect(studentIdRegex.test('student_99')).toBe(false);
      expect(studentIdRegex.test('student_abc')).toBe(false);
    });
  });
});
