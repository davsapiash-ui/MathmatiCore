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
      const chatRef = role === 'student' 
        ? ref(database, `chat_messages/${user.uid}`) 
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
      const { role } = useAuthStore.getState();
      const roomId = role === 'student' ? senderId : receiverId;
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
      });
    },

    sendImageMessage: async (senderId, senderName, receiverId, file) => {
      // Convert to base64 data URL (no Storage SDK needed — stored inline in DB)
      const reader = new FileReader();
      const dataUrl: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { role } = useAuthStore.getState();
      const roomId = role === 'student' ? senderId : receiverId;
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
      });
    },

    markAsRead: (receiverId, senderId) => {
      const { messages } = get();
      const unreadMsgs = messages.filter(msg => msg.receiverId === receiverId && msg.senderId === senderId && !msg.read);
      if (unreadMsgs.length > 0) {
        const updates: Record<string, any> = {};
        const { role } = useAuthStore.getState();
        let roomId = role === 'student' ? receiverId : senderId;
        if (role !== 'student' && senderId === 'admin') {
          roomId = receiverId; // Admin messages to teacher are stored in teacher's room
        } else if (receiverId === 'admin') {
          roomId = 'admin'; // Messages sent to admin are stored in admin's room
        }
        
        unreadMsgs.forEach(msg => {
          updates[`chat_messages/${roomId}/${msg.id}/read`] = true;
        });
        update(ref(database), updates).catch(console.error);
      }
    },
  })
);

// Subscribe to auth changes to start chat sync safely
useAuthStore.subscribe((authState) => {
  if (authState.isAuthenticated && authState.user) {
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
