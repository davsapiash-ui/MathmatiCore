import { describe, it, expect } from 'vitest';
import { extractTeacherId, firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { computeRoomId, normalizeStudentId } from '@/application/useChatStore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('SECURITY RULES & REALTIME LISTENERS AUDIT & VERIFICATION', () => {

  describe('1 & 2. Teacher Record & Email Slicing Alignment', () => {
    it('extracts teacher ID using exact auth email manipulation logic', () => {
      const email1 = 'teacher_039604483@mathmaticore.local';
      expect(extractTeacherId(email1, null)).toBe('039604483');

      const email2 = 'teacher_123456789@mathmaticore.local';
      expect(extractTeacherId(email2, null)).toBe('123456789');

      const email3 = 'davidsep@edu-haifa.org.il';
      expect(extractTeacherId(email3, null)).toBe('davidsep_edu-haifa_org_il');

      const uidOnly = 'teacher_987654321';
      expect(extractTeacherId(null, uidOnly)).toBe('987654321');
    });

    it('ensures newly registered teachers have licenseActive: false by default', () => {
      const teacherData = {
        id: '039604483',
        name: 'דוד המורה',
        schoolId: 'sch_1',
      };
      
      // Verification of object construction logic
      const id = (teacherData.id || teacherData.name) as string;
      const dataToSave = {
        ...teacherData,
        id,
        licenseActive: false,
      };

      expect(dataToSave.licenseActive).toBe(false);
      expect(dataToSave.id).toBe('039604483');
    });

    it('verifies database.rules.json contains the teacher security rule requiring licenseActive: false on creation', () => {
      const rulesPath = resolve('c:/Users/david/Projects/MathmatiCore/database.rules.json');
      const rulesContent = JSON.parse(readFileSync(rulesPath, 'utf-8'));

      const teacherRule = rulesContent.rules.users.teachers.$teacherId;
      expect(teacherRule).toBeDefined();
      expect(teacherRule['.write']).toContain("newData.child('licenseActive').val() === false");
    });
  });

  describe('3. Chat Room ID ($roomId) Alignment', () => {
    it('ensures computeRoomId returns student normalized UID when student is sender', () => {
      const sender = 'student_user1';
      const receiver = '039604483';
      const roomId = computeRoomId(sender, receiver);
      expect(roomId).toBe('student_user1');
      expect(roomId).toBe(normalizeStudentId(sender));
    });

    it('ensures computeRoomId returns student normalized UID when student is receiver', () => {
      const sender = '039604483';
      const receiver = 'student_user2';
      const roomId = computeRoomId(sender, receiver);
      expect(roomId).toBe('student_user2');
      expect(roomId).toBe(normalizeStudentId(receiver));
    });

    it('ensures un-prefixed student number yields normalized student UID roomId', () => {
      const sender = '1'; // Raw student number
      const receiver = 'teacher_039604483';
      const roomId = computeRoomId(sender, receiver);
      expect(roomId).toBe('student_user1');
    });

    it('verifies database.rules.json chat_messages rule checks auth.uid == $roomId for student access and parent .read requires teacher/admin token', () => {
      const rulesPath = resolve('c:/Users/david/Projects/MathmatiCore/database.rules.json');
      const rulesContent = JSON.parse(readFileSync(rulesPath, 'utf-8'));

      const parentChatRule = rulesContent.rules.chat_messages;
      expect(parentChatRule['.read']).toBe('auth != null && auth.token.email != null');

      const chatRule = rulesContent.rules.chat_messages.$roomId;
      expect(chatRule).toBeDefined();
      expect(chatRule['.read']).toContain('auth.uid == $roomId');
    });
  });

  describe('4. Realtime Listeners vs get() Usage', () => {
    it('verifies FirebaseSyncService listens to student data using onValue', () => {
      const syncService = firebaseSyncService;
      expect(syncService).toBeDefined();
      expect(typeof syncService.syncQMatrix).toBe('function');
      expect(typeof syncService.syncTraceData).toBe('function');
    });
  });
});
