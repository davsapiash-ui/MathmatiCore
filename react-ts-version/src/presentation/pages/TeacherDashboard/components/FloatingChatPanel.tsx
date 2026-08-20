import { useState, useEffect, useRef } from 'react';
import { type StudentData } from '@/application/useStore';
import { X, Send, Minus, CheckCheck } from 'lucide-react';
import { useChatStore, normalizeStudentId, isTeacherOrAdminId } from '@/application/useChatStore';
import { toast } from 'sonner';
import { validateChatInputForPII, anonymizeChatMessageBody } from '@/core/security/PiiFilter';

interface Props {
  student: StudentData;
  onClose: () => void;
  teacherId: string;
}

export function FloatingChatPanel({ student, onClose, teacherId }: Props) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [inputText, setInputText] = useState('');

  const { messages, sendMessage, markAsRead, initSync } = useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initSync();
  }, [initSync]);

  const normStudentId = normalizeStudentId(student.studentId || (student as any).id);
  const studentMessages = messages.filter(
    m => normalizeStudentId(m.senderId) === normStudentId || normalizeStudentId(m.receiverId) === normStudentId
  ).sort((a, b) => a.timestamp - b.timestamp);

  useEffect(() => {
    // Mark as read when opened
    const unread = studentMessages.some(m => normalizeStudentId(m.senderId) === normStudentId && !m.read);
    if (unread && !isMinimized) {
      markAsRead(teacherId, normStudentId);
    }
  }, [studentMessages, isMinimized, teacherId, normStudentId, markAsRead]);

  useEffect(() => {
    // Auto-scroll to bottom
    if (scrollRef.current && !isMinimized) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [studentMessages, isMinimized]);

  const handleSend = () => {
    if (!inputText.trim()) return;

    // Module 22: Tier 1 Client-Side Regex Validation
    const validation = validateChatInputForPII(inputText);
    if (!validation.valid) {
      toast.warning(validation.errorHe || 'הודעה מכילה פרטים מזהים (PII). יש להשתמש במזהה 1-12 בלבד.');
      return;
    }

    const cleanText = anonymizeChatMessageBody(inputText.trim());
    sendMessage(teacherId || 'teacher', 'מורה', normStudentId, cleanText);
    setInputText('');
  };

  return (
    <div className={`fixed bottom-0 left-8 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-2xl shadow-2xl z-50 flex flex-col transition-all duration-300 ${isMinimized ? 'h-12' : 'h-[440px]'}`} dir="rtl">
      {/* Header */}
      <div 
        className="h-12 px-4 bg-indigo-600 text-white rounded-t-2xl flex items-center justify-between cursor-pointer select-none"
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <div className="font-bold text-sm flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></div>
          <span>תלמיד {normStudentId.replace(/\D/g, '') || normStudentId}</span>
        </div>
        <div className="flex gap-2 text-indigo-200">
          <button className="hover:text-white transition-colors" title="מזער">
            <Minus className="w-4 h-4" />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="hover:text-white transition-colors"
            title="סגור"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      {!isMinimized && (
        <>
          <div className="flex-1 overflow-y-auto p-4 bg-slate-50 dark:bg-slate-950" ref={scrollRef}>
            <div className="flex flex-col gap-3">
              {studentMessages.length === 0 ? (
                <div className="text-center text-xs text-slate-400 mt-8">אין הודעות קודמות. התחל התכתבות.</div>
              ) : (
                studentMessages.map(msg => {
                  const isTeacher = msg.senderId === teacherId || isTeacherOrAdminId(msg.senderId) || msg.senderName === 'מורה';
                  return (
                    <div key={msg.id} className={`flex ${isTeacher ? 'justify-end' : 'justify-start'}`}>
                      <div className={`px-3.5 py-2.5 rounded-2xl max-w-[85%] text-sm shadow-sm space-y-1 ${
                        isTeacher 
                          ? 'bg-indigo-600 text-white rounded-br-xs' 
                          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-bl-xs'
                      }`}>
                        {msg.text && <p className="leading-relaxed">{msg.text}</p>}
                        <div className={`text-[10px] flex items-center justify-end gap-1 ${isTeacher ? 'text-indigo-200' : 'text-slate-400'}`}>
                          <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {isTeacher && (
                            <CheckCheck className={`w-3 h-3 ${msg.read ? 'text-emerald-300' : 'opacity-60'}`} />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          
          <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <input 
              type="text" 
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="כתוב הודעה לתלמיד..."
              className="flex-1 border border-slate-200 dark:border-slate-700 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
            
            <button 
              onClick={handleSend}
              className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-full transition-colors flex items-center justify-center w-9 h-9 shrink-0 shadow-md active:scale-95"
            >
              <Send className="w-4 h-4 -mr-0.5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
