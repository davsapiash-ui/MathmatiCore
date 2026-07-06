import { create } from "zustand";
import { database } from '@/infrastructure/firebase';
import { ref, onValue, set, push, update } from 'firebase/database';

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  receiverId: string; // "admin" or specific teacherId
  text: string;
  timestamp: number;
  read: boolean;
}

interface ChatState {
  messages: ChatMessage[];
  sendMessage: (senderId: string, senderName: string, receiverId: string, text: string) => void;
  markAsRead: (receiverId: string, senderId: string) => void;
  initSync: () => void;
}

let isSynced = false;

export const useChatStore = create<ChatState>()(
  (set, get) => ({
    messages: [],
    
    initSync: () => {
      if (isSynced) return;
      isSynced = true;
      const chatRef = ref(database, 'chat_messages');
      onValue(chatRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const msgs = Object.values(data) as ChatMessage[];
          msgs.sort((a, b) => a.timestamp - b.timestamp);
          set({ messages: msgs });
        } else {
          set({ messages: [] });
        }
      });
    },

    sendMessage: (senderId, senderName, receiverId, text) => {
      const chatRef = ref(database, 'chat_messages');
      const newMsgRef = push(chatRef);
      set(newMsgRef, {
        id: newMsgRef.key!,
        senderId,
        senderName,
        receiverId,
        text,
        timestamp: Date.now(),
        read: false
      });
    },

    markAsRead: (receiverId, senderId) => {
      const { messages } = get();
      const unreadMsgs = messages.filter(msg => msg.receiverId === receiverId && msg.senderId === senderId && !msg.read);
      if (unreadMsgs.length > 0) {
        const updates: Record<string, any> = {};
        unreadMsgs.forEach(msg => {
          updates[`chat_messages/${msg.id}/read`] = true;
        });
        update(ref(database), updates).catch(console.error);
      }
    },
  })
);
