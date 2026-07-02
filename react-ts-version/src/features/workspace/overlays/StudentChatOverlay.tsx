import { useEffect, useState, useRef } from 'react';
import { useChatStore } from '@/application/useChatStore';
import { useAuthStore } from '@/application/useAuthStore';

export function StudentChatOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');
  const { messages, sendMessage, markAsRead } = useChatStore();
  const user = useAuthStore(s => s.user);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = () => setIsOpen(open => !open);
    document.addEventListener('toggle-chat', handler);
    return () => document.removeEventListener('toggle-chat', handler);
  }, []);

  useEffect(() => {
    if (isOpen && user?.id) {
      markAsRead(user.id, 'teacher_1'); // MOCK teacher ID
    }
  }, [isOpen, messages, user, markAsRead]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, messages]);

  if (!isOpen || !user) return null;

  const myMessages = messages.filter(m => 
    (m.senderId === user.id && m.receiverId === 'teacher_1') || 
    (m.senderId === 'teacher_1' && m.receiverId === user.id)
  );

  const handleSend = () => {
    if (!text.trim()) return;
    sendMessage(user.id, 'teacher_1', text);
    setText('');
  };

  return (
    <div className="absolute top-0 right-0 h-full w-96 bg-ws-surface shadow-2xl flex flex-col z-50 border-l border-ws-surface2">
      <div className="p-4 bg-emerald-600 text-white flex justify-between items-center shrink-0">
        <h2 className="font-bold text-lg">צ'אט עם המורה</h2>
        <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-emerald-700 rounded-full transition-colors">
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {myMessages.length === 0 ? (
          <p className="text-center text-ws-soft text-sm mt-10">אין הודעות. כתבו למורה כדי להתחיל.</p>
        ) : (
          myMessages.map(m => (
            <div key={m.id} className={`flex flex-col max-w-[80%] ${m.senderId === user.id ? 'self-end items-end' : 'self-start items-start'}`}>
              <div className={`p-3 rounded-2xl ${m.senderId === user.id ? 'bg-ws-accent text-white rounded-tr-sm' : 'bg-ws-surface2 text-ws-ink rounded-tl-sm'}`}>
                {m.text}
              </div>
              <span className="text-xs text-ws-soft mt-1">
                {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-ws-surface2 shrink-0 bg-ws-surface">
        <div className="flex gap-2">
          <input 
            type="text" 
            value={text} 
            onChange={e => setText(e.target.value)} 
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="כתוב הודעה..."
            className="flex-1 border border-ws-surface2 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-ws-accent"
          />
          <button 
            onClick={handleSend}
            className="bg-ws-accent text-white rounded-full w-10 h-10 flex items-center justify-center hover:brightness-110 active:scale-95 transition-all font-bold"
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}
