import { useState, useEffect, useRef } from 'react';
import { type StudentData } from '@/application/useStore';
import { X, Send, Minus } from 'lucide-react';
import { useChatStore } from '@/application/useChatStore';

interface Props {
  student: StudentData;
  onClose: () => void;
  teacherId: string;
}

export function FloatingChatPanel({ student, onClose, teacherId }: Props) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [inputText, setInputText] = useState('');
  const { messages, sendMessage, markAsRead } = useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  const studentMessages = messages.filter(
    m => m.senderId === student.studentId || m.receiverId === student.studentId
  ).sort((a, b) => a.timestamp - b.timestamp);

  useEffect(() => {
    // Mark as read when opened
    const unread = studentMessages.some(m => m.senderId === student.studentId && !m.read);
    if (unread && !isMinimized) {
      markAsRead(teacherId, student.studentId);
    }
  }, [studentMessages, isMinimized, teacherId, student.studentId, markAsRead]);

  useEffect(() => {
    // Auto-scroll to bottom
    if (scrollRef.current && !isMinimized) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [studentMessages, isMinimized]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    sendMessage(teacherId, 'מורה', student.studentId, inputText.trim());
    setInputText('');
  };

  return (
    <div className={`fixed bottom-0 left-8 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-xl shadow-2xl z-50 flex flex-col transition-all duration-300 ${isMinimized ? 'h-12' : 'h-96'}`}>
      {/* Header */}
      <div 
        className="h-12 px-4 bg-indigo-600 text-white rounded-t-xl flex items-center justify-between cursor-pointer"
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <div className="font-bold text-sm flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400"></div>
          {student.name || student.studentId}
        </div>
        <div className="flex gap-2 text-indigo-200">
          <button className="hover:text-white transition-colors">
            <Minus className="w-4 h-4" />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      {!isMinimized && (
        <>
          <div className="flex-1 overflow-y-auto p-4 bg-slate-50 dark:bg-slate-900" ref={scrollRef}>
            <div className="flex flex-col gap-3">
              {studentMessages.length === 0 ? (
                <div className="text-center text-xs text-slate-400 mt-4">אין הודעות קודמות. התחל התכתבות.</div>
              ) : (
                studentMessages.map(msg => {
                  const isTeacher = msg.senderId === teacherId;
                  return (
                    <div key={msg.id} className={`flex ${isTeacher ? 'justify-end' : 'justify-start'}`}>
                      <div className={`px-3 py-2 rounded-xl max-w-[85%] text-sm ${
                        isTeacher 
                          ? 'bg-indigo-600 text-white rounded-br-sm' 
                          : 'bg-white border border-slate-200 text-slate-700 rounded-bl-sm shadow-sm'
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          
          <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex gap-2">
            <input 
              type="text" 
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="כתוב הודעה..."
              className="flex-1 border border-slate-200 dark:border-slate-700 rounded-full px-4 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 dark:bg-slate-800"
            />
            <button 
              onClick={handleSend}
              className="bg-indigo-600 hover:bg-indigo-700 text-white p-1.5 rounded-full transition-colors flex items-center justify-center w-8 h-8 shrink-0"
            >
              <Send className="w-4 h-4 -mr-0.5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
