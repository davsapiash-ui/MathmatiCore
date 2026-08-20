import { create } from "zustand";
import { database } from '@/infrastructure/firebase';
import { ref, onValue, set as firebaseSet, push, update } from 'firebase/database';
import { useAuthStore } from "@/application/useAuthStore";

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  text: string;
  timestamp: number;
  read: boolean;
}

interface ChatState {
  messages: ChatMessage[];
  activeRoomId: string | null;
  unreadCount: number;
  globalChatEnabled: boolean;
  setActiveRoomId: (roomId: string | null) => void;
  sendMessage: (senderId: string, senderName: string, receiverId: string, text: string) => void;
  markAsRead: (receiverId: string, senderId: string) => void;
  clearAllMessages: () => void;
  clearStudentMessages: (studentId: string) => void;
  initSync: () => void;
}

export function isTeacherOrAdminId(id?: string | null): boolean {
  if (!id) return false;
  const clean = id.trim().toLowerCase();
  if (
    clean.startsWith('student_') ||
    clean.startsWith('user') ||
    /^(1[0-2]|[1-9])$/.test(clean)
  ) {
    return false;
  }
  return (
    clean === 'admin' ||
    clean === 'teacher' ||
    clean.startsWith('admin_') ||
    clean.startsWith('teacher_') ||
    clean.includes('@') ||
    /^\d{8,10}$/.test(clean) ||
    (clean.length >= 20 && !clean.includes(' ') && !clean.includes(';') && !clean.includes('<'))
  );
}

export function normalizeStudentId(id?: string | null): string {
  if (!id) return '';
  const clean = id.trim().toLowerCase();
  if (isTeacherOrAdminId(clean)) return clean;
  
  const numMatch = clean.match(/-?\d+/);
  if (numMatch) {
    const parsed = parseInt(numMatch[0], 10);
    const validNum = Math.min(Math.max(parsed, 1), 12);
    return `student_user${validNum}`;
  }
  return `student_${clean}`;
}

export function computeRoomId(senderId: string, receiverId: string): string {
  const cleanSender = (senderId || '').trim();
  const cleanReceiver = (receiverId || '').trim();

  const isSenderTeacherAdmin = isTeacherOrAdminId(cleanSender);
  const isReceiverTeacherAdmin = isTeacherOrAdminId(cleanReceiver);

  // If one of the participants is a student, the roomId MUST be that student's normalized UID (student_user1..12)
  if (!isSenderTeacherAdmin) {
    return normalizeStudentId(cleanSender);
  }
  if (!isReceiverTeacherAdmin) {
    return normalizeStudentId(cleanReceiver);
  }

  // Fallback for non-student chat (e.g. Teacher <-> Admin)
  if (cleanSender === 'admin' || cleanSender.startsWith('admin_')) {
    return cleanReceiver;
  }
  return cleanSender;
}

export function sanitizeChatText(text?: string | null): string {
  if (!text) return '';
  // 1. Mask 9-digit Israeli IDs
  let sanitized = text.replace(/\b\d{9}\b/g, (match) => `***${match.slice(-4)}`);
  // 2. Mask Israeli phone numbers (e.g. 050-1234567, 0521234567, 02-1234567)
  sanitized = sanitized.replace(/\b0[23489]-?\d{7}\b|\b05\d-?\d{7}\b/g, '[PHONE_REDACTED]');
  // 3. Mask personal emails
  sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL_REDACTED]');
  return sanitized;
}

let activeSyncedKey: string | null = null;
let chatUnsubscribe: (() => void) | null = null;

export const useChatStore = create<ChatState>()(
  (set, get) => ({
    messages: [],
    activeRoomId: null,
    unreadCount: 0,
    globalChatEnabled: true,
    setActiveRoomId: (activeRoomId: string | null) => set({ activeRoomId }),
    
    initSync: () => {
      const authState = typeof useAuthStore?.getState === 'function' ? useAuthStore.getState() : ({} as any);
      const user = authState?.user;
      const role = authState?.role;
      if (!user) return; // Only sync if authenticated
      const userId = ((user.uid || (user as any).id || '') as string).trim();
      const isStudent = role === 'student' || (!isTeacherOrAdminId(userId) && userId.startsWith('student_'));
      const studentRoomId = normalizeStudentId(userId);
      const syncKey = `${isStudent ? 'student' : 'staff'}_${userId}_${studentRoomId}`;
      if (activeSyncedKey === syncKey && chatUnsubscribe) return;
      activeSyncedKey = syncKey;

      // Sync globalChatEnabled control flag from Firebase Realtime DB
      try {
        onValue(
          ref(database, 'system_control/globalChatEnabled'),
          (snap) => {
            const enabled = snap.exists() ? Boolean(snap.val()) : true;
            set({ globalChatEnabled: enabled });
          },
          (err) => {
            console.warn('[useChatStore] globalChatEnabled listener notice:', err);
          }
        );
      } catch (err) {
        console.warn("Global chat status sync non-blocking warning:", err);
      }

      const chatRef = isStudent 
        ? ref(database, `chat_messages/${studentRoomId}`) 
        : ref(database, 'chat_messages');

      if (chatUnsubscribe) {
        chatUnsubscribe();
        chatUnsubscribe = null;
      }

      chatUnsubscribe = onValue(chatRef, (snapshot) => {
        try {
          if (snapshot.exists()) {
            const rawData = snapshot.val();
            const data = (rawData && typeof rawData === 'object') ? rawData : {};
            let msgs: ChatMessage[] = [];
            if (isStudent) {
              msgs = Object.values(data) as ChatMessage[];
            } else {
              // For teacher/admin, data is nested: { roomId: { msgId: message } }
              Object.keys(data).forEach((roomId: string) => {
                const roomData = data[roomId as keyof typeof data];
                if (roomData && typeof roomData === 'object') {
                  msgs.push(...(Object.values(roomData) as ChatMessage[]));
                }
              });
            }
            msgs.sort((a, b) => a.timestamp - b.timestamp);
            set({ messages: [...msgs] });
          } else {
            set({ messages: [] });
          }
        } catch (e) {
          console.error("Error parsing chat messages:", e);
          set({ messages: [] });
        }
      }, (error) => {
        console.error("Chat sync error:", error);
        activeSyncedKey = null; // Allow retrying if permission error
      });
    },

    sendMessage: (senderId, senderName, receiverId, text) => {
      const sanitizedText = sanitizeChatText(text);
      const targetReceiver = receiverId || '1002220159';
      const roomId = computeRoomId(senderId, targetReceiver);
      const chatRef = ref(database, `chat_messages/${roomId}`);
      const newMsgRef = push(chatRef);
      const newMsg: ChatMessage = {
        id: newMsgRef.key || `local_${Date.now()}`,
        senderId,
        senderName,
        receiverId: targetReceiver,
        text: sanitizedText,
        timestamp: Date.now(),
        read: false
      };
      
      // Optimistic update: render message on screen immediately with fresh array reference
      set((state) => ({
        messages: [...state.messages.filter(m => m.id !== newMsg.id), newMsg]
      }));

      firebaseSet(newMsgRef, newMsg).catch((err) => {
        console.error("Error sending message to Firebase, rolling back:", err);
        // Rollback optimistic update on network or permission failure
        set((state) => ({
          messages: state.messages.filter(m => m.id !== newMsg.id)
        }));
      });
    },

    markAsRead: (receiverId, senderId) => {
      const { messages } = get();
      const normReceiver = normalizeStudentId(receiverId);
      const normSender = normalizeStudentId(senderId);
      
      const unreadMsgs = messages.filter(msg => {
        const msgRecv = normalizeStudentId(msg.receiverId);
        const msgSend = normalizeStudentId(msg.senderId);
        return (msgRecv === normReceiver || msg.receiverId === receiverId) &&
               (msgSend === normSender || msg.senderId === senderId) &&
               !msg.read;
      });

      if (unreadMsgs.length > 0) {
        const roomId = computeRoomId(senderId, receiverId);
        const updates: Record<string, any> = {};
        unreadMsgs.forEach(msg => {
          updates[`${msg.id}/read`] = true;
        });
        update(ref(database, `chat_messages/${roomId}`), updates).catch((err) => {
          console.warn("Failed to mark messages as read in DB:", err);
        });
        
        // Optimistic local read status update
        set((state) => ({
          messages: state.messages.map(m => 
            unreadMsgs.some(u => u.id === m.id) ? { ...m, read: true } : m
          )
        }));
      }
    },

    clearAllMessages: () => set({ messages: [], unreadCount: 0 }),

    clearStudentMessages: (studentId: string) => {
      const norm = normalizeStudentId(studentId);
      set((state) => ({
        messages: state.messages.filter(
          (m) => normalizeStudentId(m.senderId) !== norm && normalizeStudentId(m.receiverId) !== norm
        ),
      }));
    },
  })
);

// Subscribe to auth changes to start chat sync safely
if (typeof window !== 'undefined') {
  setTimeout(() => {
    try {
      if (useAuthStore && typeof (useAuthStore as any).subscribe === 'function') {
        (useAuthStore as any).subscribe((authState: any) => {
          if (authState?.isAuthenticated && authState?.user) {
            useChatStore.getState().initSync();
          } else {
            activeSyncedKey = null;
            if (chatUnsubscribe) {
              chatUnsubscribe();
              chatUnsubscribe = null;
            }
            useChatStore.setState({ messages: [] });
          }
        });
      }
    } catch (e) {
      console.warn('Chat auth subscription deferral error:', e);
    }
  }, 0);
}

// Initial trigger on boot if already authenticated from storage
if (typeof window !== 'undefined') {
  setTimeout(() => {
    useChatStore.getState().initSync();
  }, 100);
}
