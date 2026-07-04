import { create } from "zustand";
import { persist } from "zustand/middleware";

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
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: [],
      
      sendMessage: (senderId, senderName, receiverId, text) => set((state) => ({
        messages: [...state.messages, {
          id: `msg_${Date.now()}_${Math.random()}`,
          senderId,
          senderName,
          receiverId,
          text,
          timestamp: Date.now(),
          read: false
        }]
      })),

      markAsRead: (receiverId, senderId) => {
        const { messages } = get();
        const hasUnread = messages.some(msg => msg.receiverId === receiverId && msg.senderId === senderId && !msg.read);
        if (hasUnread) {
          set((state) => ({
            messages: state.messages.map(msg => 
              (msg.receiverId === receiverId && msg.senderId === senderId) 
                ? { ...msg, read: true } 
                : msg
            )
          }));
        }
      },
    }),
    {
      name: "chat-storage-v3",
    }
  )
);
