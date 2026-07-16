import { useEffect, useState, useRef } from 'react';
import { useChatStore } from '@/application/useChatStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useStore } from '@/application/useStore';
import { useAdminStore } from '@/application/useAdminStore';
import { ImageIcon, BellRing } from 'lucide-react';

export function StudentChatOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');
  const [sendingImage, setSendingImage] = useState(false);
  const { messages, sendMessage, sendImageMessage, markAsRead } = useChatStore();
  const user = useAuthStore(s => s.user);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const students = useStore(s => s.students);
  const classes = useAdminStore(s => s.classes);
  
  const studentData = user?.uid ? students[user.uid] : null;
  const studentClass = classes.find(c => c.id === studentData?.classId);
  // Find the teacher of the class this student belongs to.
  // Default to '039604483' (the known teacher) if no class found.
  const targetTeacherId = studentClass?.teacherId || '039604483';

  useEffect(() => {
    const handler = () => setIsOpen(open => !open);
    document.addEventListener('toggle-chat', handler);
    return () => document.removeEventListener('toggle-chat', handler);
  }, []);

  useEffect(() => {
    if (isOpen && user?.uid) {
      // Find the last teacher who sent a message to the student
      const lastReceivedMsg = [...messages].reverse().find(m => m.receiverId === user.uid && m.senderId !== user.uid);
      const activeTeacher = lastReceivedMsg ? lastReceivedMsg.senderId : targetTeacherId;
      markAsRead(user.uid, activeTeacher); 
    }
  }, [isOpen, messages, user, markAsRead, targetTeacherId]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, messages]);

  if (!isOpen || !user) return null;

  const myMessages = messages.filter(m => 
    m.receiverId === user.uid || m.senderId === user.uid
  );

  const handleSend = () => {
    if (!text.trim() || !user.uid) return;
    const lastReceivedMsg = [...messages].reverse().find(m => m.receiverId === user.uid && m.senderId !== user.uid);
    const activeTeacher = lastReceivedMsg ? lastReceivedMsg.senderId : targetTeacherId;
    sendMessage(user.uid as string, String(user.displayName || user.email?.split('@')[0] || 'תלמיד'), activeTeacher as string, text);
    setText('');
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setSendingImage(true);
    try {
      const lastReceivedMsg = [...messages].reverse().find(m => m.receiverId === user.uid && m.senderId !== user.uid);
      const activeTeacher = lastReceivedMsg ? lastReceivedMsg.senderId : targetTeacherId;
      await sendImageMessage(user.uid as string, String(user.displayName || 'תלמיד'), activeTeacher as string, file);
    } finally {
      setSendingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCallTeacher = () => {
    if (!user?.uid) return;
    const lastReceivedMsg = [...messages].reverse().find(m => m.receiverId === user.uid && m.senderId !== user.uid);
    const activeTeacher = lastReceivedMsg ? lastReceivedMsg.senderId : targetTeacherId;
    sendMessage(user.uid as string, String(user.displayName || user.email?.split('@')[0] || 'תלמיד'), activeTeacher as string, "🚨 המורה, אני זקוק/ה לעזרה!");
  };

  return (
    <div className="absolute top-0 right-0 h-full w-96 bg-ws-surface shadow-2xl flex flex-col z-50 border-l border-ws-surface2">
      <div className="p-4 bg-ws-accent text-white flex justify-between items-center shrink-0">
        <h2 className="font-bold text-lg">צ'אט עם המורה</h2>
        <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-white/20 rounded-full transition-colors">
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-4 flex flex-col gap-3">
        {myMessages.length === 0 ? (
          <p className="text-center text-ws-soft text-sm mt-10">אין הודעות. כתבו למורה כדי להתחיל.</p>
        ) : (
          myMessages.map(m => (
            <div key={m.id} className={`flex flex-col max-w-[80%] ${m.senderId === user.uid ? 'self-end items-end' : 'self-start items-start'}`}>
              <div className={`p-3 rounded-2xl ${m.senderId === user.uid ? 'bg-ws-accent text-white rounded-tr-sm' : 'bg-ws-surface2 text-ws-ink rounded-tl-sm'}`}>
                {m.text && <span>{m.text}</span>}
              {m.imageUrl && (
                <img
                  src={m.imageUrl}
                  alt="תמונה"
                  className="max-w-[200px] max-h-[200px] rounded-xl mt-1 object-cover cursor-pointer"
                  onClick={() => window.open(m.imageUrl, '_blank')}
                />
              )}
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
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelect}
        />
        <div className="flex gap-2 items-center">
          <button
            onClick={handleCallTeacher}
            title="קרא למורה"
            className="p-2 rounded-full hover:bg-red-500/10 transition-colors text-ws-soft hover:text-red-500"
          >
            <BellRing className="w-5 h-5" />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={sendingImage}
            title="שלח תמונה"
            className="p-2 rounded-full hover:bg-ws-surface2 transition-colors text-ws-soft hover:text-ws-accent disabled:opacity-40"
          >
            {sendingImage ? (
              <span className="w-5 h-5 border-2 border-ws-accent border-t-transparent rounded-full animate-spin block" />
            ) : (
              <ImageIcon className="w-5 h-5" />
            )}
          </button>
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
