import { describe, it, expect, beforeEach } from 'vitest';
import { 
  useChatStore, 
  normalizeStudentId, 
  computeRoomId, 
  isTeacherOrAdminId 
} from '@/application/useChatStore';

describe('Chat Bidirectional Synchronization & Room Segregation (Module 22 & 28)', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      activeRoomId: null,
      unreadCount: 0,
      globalChatEnabled: true
    });
  });

  describe('1. Role & Identifier Classification (isTeacherOrAdminId)', () => {
    it('correctly identifies teacher and admin identifiers', () => {
      expect(isTeacherOrAdminId('admin')).toBe(true);
      expect(isTeacherOrAdminId('teacher')).toBe(true);
      expect(isTeacherOrAdminId('teacher_1002220159')).toBe(true);
      expect(isTeacherOrAdminId('teacher_davidsep')).toBe(true);
      expect(isTeacherOrAdminId('1002220159')).toBe(true);
      expect(isTeacherOrAdminId('davidsep@edu-haifa.org.il')).toBe(true);
      expect(isTeacherOrAdminId('admin_master')).toBe(true);
    });

    it('correctly identifies student identifiers as non-staff', () => {
      expect(isTeacherOrAdminId('student_user1')).toBe(false);
      expect(isTeacherOrAdminId('student_1')).toBe(false);
      expect(isTeacherOrAdminId('1')).toBe(false);
      expect(isTeacherOrAdminId('12')).toBe(false);
      expect(isTeacherOrAdminId('user5')).toBe(false);
    });
  });

  describe('2. Student ID Normalization (normalizeStudentId)', () => {
    it('normalizes any student identifier into canonical student_user1..12 format', () => {
      expect(normalizeStudentId('student_1')).toBe('student_user1');
      expect(normalizeStudentId('student_user1')).toBe('student_user1');
      expect(normalizeStudentId('1')).toBe('student_user1');
      expect(normalizeStudentId('12')).toBe('student_user12');
      expect(normalizeStudentId('student_12')).toBe('student_user12');
      expect(normalizeStudentId('student_0')).toBe('student_user1');
      expect(normalizeStudentId('student_99')).toBe('student_user12');
    });

    it('preserves teacher and admin IDs without mangling them into students', () => {
      expect(normalizeStudentId('teacher_davidsep')).toBe('teacher_davidsep');
      expect(normalizeStudentId('davidsep@edu-haifa.org.il')).toBe('davidsep@edu-haifa.org.il');
      expect(normalizeStudentId('1002220159')).toBe('1002220159');
      expect(normalizeStudentId('admin')).toBe('admin');
    });
  });

  describe('3. Symmetric Room ID Computation (computeRoomId)', () => {
    it('resolves to the EXACT same room ID regardless of caller order for Teacher <-> Student', () => {
      const teacherId = 'teacher_davidsep';
      const studentId = 'student_user3';

      const roomStudentPerspective = computeRoomId(studentId, teacherId);
      const roomTeacherPerspective = computeRoomId(teacherId, studentId);

      expect(roomStudentPerspective).toBe('student_user3');
      expect(roomTeacherPerspective).toBe('student_user3');
      expect(roomStudentPerspective).toBe(roomTeacherPerspective);
    });

    it('resolves to the EXACT same room ID when using raw numeric student ID (e.g. "3")', () => {
      const teacherEmail = 'davidsep@edu-haifa.org.il';
      const rawStudent = '3';

      const roomA = computeRoomId(rawStudent, teacherEmail);
      const roomB = computeRoomId(teacherEmail, rawStudent);

      expect(roomA).toBe('student_user3');
      expect(roomB).toBe('student_user3');
      expect(roomA).toBe(roomB);
    });

    it('resolves Teacher <-> Admin chat to the teacher room ID', () => {
      const teacherId = 'teacher_davidsep';
      const roomFromTeacher = computeRoomId(teacherId, 'admin');
      const roomFromAdmin = computeRoomId('admin', teacherId);

      expect(roomFromTeacher).toBe('teacher_davidsep');
      expect(roomFromAdmin).toBe('teacher_davidsep');
      expect(roomFromTeacher).toBe(roomFromAdmin);
    });
  });

  describe('4. Zustand State Updates & Read Status', () => {
    it('optimistically appends sent messages and marks them as read', () => {
      const store = useChatStore.getState();
      
      store.sendMessage('student_user1', 'תלמיד 1', 'teacher_davidsep', 'שלום מורה, יש לי שאלה');

      const messagesAfterSend = useChatStore.getState().messages;
      expect(messagesAfterSend.length).toBe(1);
      expect(messagesAfterSend[0].text).toBe('שלום מורה, יש לי שאלה');
      expect(messagesAfterSend[0].read).toBe(false);

      useChatStore.getState().markAsRead('teacher_davidsep', 'student_user1');
      const messagesAfterRead = useChatStore.getState().messages;
      expect(messagesAfterRead[0].read).toBe(true);
    });

    it('supports globalChatEnabled toggle without blocking message flow', () => {
      expect(useChatStore.getState().globalChatEnabled).toBe(true);
      useChatStore.setState({ globalChatEnabled: false });
      expect(useChatStore.getState().globalChatEnabled).toBe(false);
    });

    it('marks messages as read even with asymmetric teacher IDs (e.g. sent to "teacher", read by "1002220159")', () => {
      useChatStore.setState({
        messages: [
          {
            id: 'msg_1',
            senderId: 'student_user2',
            senderName: 'תלמיד 2',
            receiverId: 'teacher',
            text: 'צריך עזרה',
            timestamp: Date.now(),
            read: false
          }
        ]
      });

      // Teacher logged in with teacher_1002220159 marks as read
      useChatStore.getState().markAsRead('teacher_1002220159', 'student_user2');
      const messages = useChatStore.getState().messages;
      expect(messages[0].read).toBe(true);
    });

    it('markAllAsRead marks every unread message across all rooms as read', () => {
      useChatStore.setState({
        messages: [
          { id: 'm1', senderId: 'student_user1', senderName: 'תלמיד 1', receiverId: 'teacher', text: '1', timestamp: 1, read: false },
          { id: 'm2', senderId: 'student_user3', senderName: 'תלמיד 3', receiverId: '1002220159', text: '2', timestamp: 2, read: false },
          { id: 'm3', senderId: 'student_orphan', senderName: 'תלמיד', receiverId: 'admin', text: '3', timestamp: 3, read: false }
        ]
      });

      useChatStore.getState().markAllAsRead();
      const messages = useChatStore.getState().messages;
      expect(messages.every(m => m.read === true)).toBe(true);
    });
  });
});
