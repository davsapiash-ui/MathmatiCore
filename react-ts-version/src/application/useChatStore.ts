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
  imageUrl?: string; // optional: base64 data URL or Firebase Storage URL
  timestamp: number;
  read: boolean;
}

interface ChatState {
  messages: ChatMessage[];
  sendMessage: (senderId: string, senderName: string, receiverId: string, text: string) => void;
  sendImageMessage: (senderId: string, senderName: string, receiverId: string, file: File) => Promise<void>;
  markAsRead: (receiverId: string, senderId: string) => void;
  initSync: () => void;
}

export function normalizeStudentId(id: string): string {
  if (!id) return '';
  const clean = id.trim().toLowerCase();
  if (clean === 'admin' || clean === 'teacher' || clean.startsWith('teacher_')) return clean;
  if (/^\d+$/.test(clean)) return `student_user${clean}`;
  if (clean.startsWith('user')) return `student_${clean}`;
  if (clean.startsWith('student_')) {
    const sub = clean.replace('student_', '');
    if (/^\d+$/.test(sub)) return `student_user${sub}`;
    return clean;
  }
  return `student_${clean}`;
}

function computeRoomId(senderId: string, receiverId: string): string {
  if (senderId === 'admin' || receiverId === 'admin') {
    return senderId === 'admin' ? receiverId : senderId;
  }
  const isSenderTeacher = senderId === 'teacher' || senderId.startsWith('teacher_') || /^\d{8,9}$/.test(senderId);
  const isReceiverTeacher = receiverId === 'teacher' || receiverId.startsWith('teacher_') || /^\d{8,9}$/.test(receiverId);

  if (isSenderTeacher && !isReceiverTeacher) {
    return receiverId; // Student's UID
  }
  if (isReceiverTeacher && !isSenderTeacher) {
    return senderId; // Student's UID
  }
  return normalizeStudentId(senderId);
}

let isSynced = false;
let chatUnsubscribe: (() => void) | null = null;

export const useChatStore = create<ChatState>()(
  (set, get) => ({
    messages: [],
    
    initSync: () => {
      const { user, role } = useAuthStore.getState();
      if (!user) return; // Only sync if authenticated
      if (isSynced) return;
      isSynced = true;
      const studentRoomId = user.uid;
      const chatRef = role === 'student' 
        ? ref(database, `chat_messages/${studentRoomId}`) 
        : ref(database, 'chat_messages');
      if (chatUnsubscribe) {
        chatUnsubscribe();
      }
      chatUnsubscribe = onValue(chatRef, (snapshot) => {
        try {
          if (snapshot.exists()) {
            const rawData = snapshot.val();
            const data = (rawData && typeof rawData === 'object') ? rawData : {};
            let msgs: ChatMessage[] = [];
            if (role === 'student') {
              msgs = Object.values(data) as ChatMessage[];
            } else {
              // For teacher/admin, data is nested: { studentId: { msgId: message } }
              Object.keys(data).forEach((roomId: string) => {
                const roomData = data[roomId as keyof typeof data];
                if (roomData && typeof roomData === 'object') {
                  msgs.push(...(Object.values(roomData) as ChatMessage[]));
                }
              });
            }
            msgs.sort((a, b) => a.timestamp - b.timestamp);
            set({ messages: msgs });
          } else {
            set({ messages: [] });
          }
        } catch (e) {
          console.error("Error parsing chat messages:", e);
          set({ messages: [] });
        }
      }, (error) => {
        console.error("Chat sync permission denied:", error);
        isSynced = false; // Allow retrying if permission denied
      });
    },

    sendMessage: (senderId, senderName, receiverId, text) => {
      const roomId = computeRoomId(senderId, receiverId);
      const chatRef = ref(database, `chat_messages/${roomId}`);
      const newMsgRef = push(chatRef);
      firebaseSet(newMsgRef, {
        id: newMsgRef.key!,
        senderId,
        senderName,
        receiverId,
        text,
        timestamp: Date.now(),
        read: false
      }).catch((err) => {
        console.error("Error sending message:", err);
      });
    },

    sendImageMessage: async (senderId, senderName, receiverId, file) => {
      const reader = new FileReader();
      const dataUrl: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const roomId = computeRoomId(senderId, receiverId);
      const chatRef = ref(database, `chat_messages/${roomId}`);
      const newMsgRef = push(chatRef);
      firebaseSet(newMsgRef, {
        id: newMsgRef.key!,
        senderId,
        senderName,
        receiverId,
        text: '',
        imageUrl: dataUrl,
        timestamp: Date.now(),
        read: false
      }).catch((err) => {
        console.error("Error sending image message:", err);
      });
    },

    markAsRead: (receiverId, senderId) => {
      const { messages } = get();
      const unreadMsgs = messages.filter(msg => msg.receiverId === receiverId && msg.senderId === senderId && !msg.read);
      if (unreadMsgs.length > 0) {
        const roomId = computeRoomId(senderId, receiverId);
        const updates: Record<string, any> = {};
        unreadMsgs.forEach(msg => {
          updates[`${msg.id}/read`] = true;
        });
        update(ref(database, `chat_messages/${roomId}`), updates).catch(console.error);
      }
    },
  })
);

// Subscribe to auth changes to start chat sync safely
if (useAuthStore && typeof (useAuthStore as any).subscribe === 'function') {
  (useAuthStore as any).subscribe((authState: any) => {
    if (authState?.isAuthenticated && authState?.user) {
      useChatStore.getState().initSync();
    } else {
      isSynced = false;
      if (chatUnsubscribe) {
        chatUnsubscribe();
        chatUnsubscribe = null;
      }
      useChatStore.setState({ messages: [] });
    }
  });
}
