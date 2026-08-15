import { describe, it, expect, beforeEach } from 'vitest';
import { 
  useChatStore, 
  normalizeStudentId, 
  computeRoomId, 
  isTeacherOrAdminId, 
  type ChatMessage 
} from '@/application/useChatStore';

describe('🚀 Comprehensive Real-Time Chat Simulation (Teacher <-> Student & Teacher <-> Admin)', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      activeRoomId: null,
      unreadCount: 0,
      globalChatEnabled: true,
    });
  });

  it('SIMULATION 1: Student 3 initiates conversation with Teacher -> Teacher responds -> Read receipts', async () => {
    const studentId = 'student_user3';
    const studentDisplayName = 'תלמיד 3 (כיתה ד1)';
    const teacherId = 'teacher_davidsep';
    const teacherDisplayName = 'דוד המורה';

    console.log('--- שלב 1: התלמיד שולח הודעה ראשונה למורה ---');
    const studentMsgText = 'המורה, הסתבכתי בפריטה של העשרות בתרגיל 2';
    
    // 1. Student computes room ID and sends message
    const roomFromStudentPerspective = computeRoomId(studentId, teacherId);
    expect(roomFromStudentPerspective).toBe('student_user3');

    useChatStore.getState().sendMessage(studentId, studentDisplayName, teacherId, studentMsgText);

    // 2. Check store state
    let state = useChatStore.getState();
    expect(state.messages.length).toBe(1);
    expect(state.messages[0].senderId).toBe('student_user3');
    expect(state.messages[0].receiverId).toBe('teacher_davidsep');
    expect(state.messages[0].text).toBe(studentMsgText);
    expect(state.messages[0].read).toBe(false);

    console.log('✅ הודעת התלמיד נשמרה בחדר:', roomFromStudentPerspective);

    // 3. Teacher opens FloatingChatPanel and sees the unread message
    const teacherViewStudentMessages = state.messages.filter(
      (m) => normalizeStudentId(m.senderId) === 'student_user3' || normalizeStudentId(m.receiverId) === 'student_user3'
    );
    expect(teacherViewStudentMessages.length).toBe(1);
    expect(teacherViewStudentMessages[0].read).toBe(false);

    // 4. Teacher marks message as read upon opening chat
    useChatStore.getState().markAsRead(teacherId, studentId);
    state = useChatStore.getState();
    expect(state.messages[0].read).toBe(true);
    console.log('✅ המורה פתח את החלונית וההודעה סומנה כנקראה (read = true)');

    // 5. Teacher replies to student
    console.log('--- שלב 2: המורה משיב לתלמיד עם הנחיה פדגוגית ---');
    const teacherReplyText = 'היי תלמיד 3, שים לב שיש לך עשרת אחת שניתן לפרוט ל-10 יחידות בעזרת הפטיש 🔨';
    
    const roomFromTeacherPerspective = computeRoomId(teacherId, studentId);
    expect(roomFromTeacherPerspective).toBe('student_user3'); // EXACT SAME ROOM!

    useChatStore.getState().sendMessage(teacherId, teacherDisplayName, studentId, teacherReplyText);

    // 6. Student receives teacher reply
    state = useChatStore.getState();
    expect(state.messages.length).toBe(2);

    const studentReceivedMessages = state.messages.filter(
      (m) => normalizeStudentId(m.senderId) === 'student_user3' || normalizeStudentId(m.receiverId) === 'student_user3'
    );
    expect(studentReceivedMessages.length).toBe(2);
    expect(studentReceivedMessages[1].senderId).toBe('teacher_davidsep');
    expect(studentReceivedMessages[1].text).toBe(teacherReplyText);
    console.log('✅ התלמיד קיבל את הודעת המורה בסביבת הלמידה:', studentReceivedMessages[1].text);

    // 7. Student marks teacher message as read
    useChatStore.getState().markAsRead(studentId, teacherId);
    state = useChatStore.getState();
    expect(state.messages[1].read).toBe(true);
    console.log('✅ שיחה דו-כיוונית הושלמה בהצלחה מלאה!');
  });

  it('SIMULATION 2: Teacher initiates conversation with Admin -> Admin responds in AdminChatView', async () => {
    const teacherId = 'teacher_davidsep';
    const teacherDisplayName = 'דוד מורה מוסמך';
    const adminId = 'admin';
    const adminDisplayName = 'מנהל מערכת מתמטיקאור';

    console.log('--- שלב 1: מורה פונה להנהלת המערכת ---');
    const teacherMsg = 'שלום הנהלה, האם ניתן לעדכן את מכסת התלמידים בכיתה ד2?';
    
    const roomFromTeacher = computeRoomId(teacherId, adminId);
    expect(roomFromTeacher).toBe('teacher_davidsep');

    useChatStore.getState().sendMessage(teacherId, teacherDisplayName, adminId, teacherMsg);

    let state = useChatStore.getState();
    expect(state.messages.length).toBe(1);
    expect(state.messages[0].senderId).toBe('teacher_davidsep');
    expect(state.messages[0].receiverId).toBe('admin');
    expect(state.messages[0].read).toBe(false);

    // Admin filters for unanswered teacher messages
    const adminUnanswered = state.messages.filter(
      (m) => m.receiverId === 'admin' && !m.read
    );
    expect(adminUnanswered.length).toBe(1);
    console.log('✅ מנהל המערכת קיבל את ההודעה בטאב "שלא נענו"');

    // Admin responds to teacher
    console.log('--- שלב 2: מנהל המערכת משיב למורה ---');
    const adminReply = 'שלום דוד, המכסה עודכנה בהצלחה ל-12 תלמידים!';
    const roomFromAdmin = computeRoomId(adminId, teacherId);
    expect(roomFromAdmin).toBe('teacher_davidsep'); // EXACT SAME ROOM!

    useChatStore.getState().sendMessage(adminId, adminDisplayName, teacherId, adminReply);

    state = useChatStore.getState();
    expect(state.messages.length).toBe(2);
    expect(state.messages[1].text).toBe(adminReply);
    console.log('✅ המורה קיבל את אישור המנהל בסרגל הניהול');
  });

  it('SIMULATION 3: Anonymization & Security Fuzzing across edge student IDs', () => {
    const edgeCases = [
      { input: 'student_1', expectedRoom: 'student_user1' },
      { input: '1', expectedRoom: 'student_user1' },
      { input: 'student_user12', expectedRoom: 'student_user12' },
      { input: '12', expectedRoom: 'student_user12' },
      { input: 'student_0', expectedRoom: 'student_user1' },     // clamped min
      { input: 'student_999', expectedRoom: 'student_user12' },  // clamped max
      { input: 'user7', expectedRoom: 'student_user7' },
    ];

    for (const { input, expectedRoom } of edgeCases) {
      const roomA = computeRoomId(input, 'teacher_davidsep');
      const roomB = computeRoomId('teacher_davidsep', input);
      expect(roomA).toBe(expectedRoom);
      expect(roomB).toBe(expectedRoom);
      expect(roomA).toBe(roomB);
    }
    console.log('✅ כל מקרי הקצה של מזהי תלמידים נשמרים אנונימיים ומסונכרנים 100%');
  });
});
