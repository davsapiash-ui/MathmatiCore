import { useState, useEffect, useRef } from 'react';
import { Send, CheckCheck } from 'lucide-react';
import { useChatStore, normalizeStudentId, isTeacherOrAdminId } from '@/application/useChatStore';
import { toast } from 'sonner';
import { READ_ONLY_TITLE, useIsReadOnlyStaff } from '@/application/useIsReadOnlyStaff';
import { validateChatInputForPII, anonymizeChatMessageBody, reportPiiFilterFailure } from '@/core/security/PiiFilter';

/**
 * One learner's conversation with the teacher: the messages and the reply box.
 * Shared by the floating panel and the side action queue (owner, 11.10.2026:
 * chat and help calls in one place), so both behave the same — the PII check,
 * the anonymiser, marking read, and no delete button (audit 4.10.2026).
 */
export function ChatThread({
  studentId,
  teacherId,
  active = true,
  listClassName = 'flex-1 overflow-y-auto p-4',
}: {
  studentId: string;
  teacherId: string;
  /** Read and scrolled only while shown (the floating panel's minimised state). */
  active?: boolean;
  listClassName?: string;
}) {
  const [inputText, setInputText] = useState('');
  const { messages, sendMessage, markAsRead, initSync } = useChatStore();
  const readOnly = useIsReadOnlyStaff();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initSync();
  }, [initSync]);

  const normStudentId = normalizeStudentId(studentId);
  const studentMessages = messages.filter(
    m => normalizeStudentId(m.senderId) === normStudentId || normalizeStudentId(m.receiverId) === normStudentId
  ).sort((a, b) => a.timestamp - b.timestamp);

  useEffect(() => {
    // Mark as read when opened
    const unread = studentMessages.some(m => normalizeStudentId(m.senderId) === normStudentId && !m.read);
    if (unread && active && !readOnly) {
      markAsRead(teacherId, normStudentId);
    }
  }, [studentMessages, active, teacherId, normStudentId, markAsRead, readOnly]);

  useEffect(() => {
    // Auto-scroll to bottom
    if (scrollRef.current && active) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [studentMessages, active]);

  const handleSend = () => {
    if (!inputText.trim()) return;

    // Module 22 Tier 1: an e-mail, phone or ID number is refused. PRD Module 3
    // §א (v7.9): if the filter itself fails, nothing is locked — the failure is
    // logged (console + audit log) and the message goes.
    let validation: { valid: boolean; errorHe?: string } = { valid: true };
    try {
      validation = validateChatInputForPII(inputText);
    } catch (err) {
      reportPiiFilterFailure('FloatingChatPanel', err);
    }
    if (!validation.valid) {
      toast.warning(validation.errorHe || 'הודעה מכילה פרטים מזהים. יש להשתמש במזהה 1-12 בלבד.');
      return;
    }

    const cleanText = anonymizeChatMessageBody(inputText.trim());
    sendMessage(teacherId || 'teacher', 'מורה', normStudentId, cleanText);
    setInputText('');
  };

  return (
    <>
      <div className={`bg-slate-50 dark:bg-slate-950 ${listClassName}`} ref={scrollRef}>
        <div className="flex flex-col gap-3">
          {studentMessages.length === 0 ? (
            <div className="text-center text-xs text-slate-600 mt-8">אין הודעות קודמות. התחילו התכתבות.</div>
          ) : (
            studentMessages.map(msg => {
              const isTeacher = msg.senderId === teacherId || isTeacherOrAdminId(msg.senderId) || msg.senderName === 'מורה';
              return (
                <div key={msg.id} className={`flex ${isTeacher ? 'justify-end' : 'justify-start'}`}>
                  <div className={`px-3.5 py-2.5 rounded-2xl max-w-[85%] text-sm shadow-sm space-y-1 ${
                    isTeacher
                      ? 'bg-violet-600 text-white rounded-br-xs'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-bl-xs'
                  }`}>
                    {msg.text && <p className="leading-relaxed">{msg.text}</p>}
                    <div className={`text-[10px] flex items-center justify-end gap-1 ${isTeacher ? 'text-violet-200' : 'text-slate-600'}`}>
                      <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {isTeacher && (
                        <CheckCheck className={`w-3 h-3 ${msg.read ? 'text-violet-300' : 'opacity-60'}`} />
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
          placeholder="כתבו הודעה לתלמיד..."
          disabled={readOnly}
          title={readOnly ? READ_ONLY_TITLE : undefined}
          className="flex-1 min-w-0 border border-slate-200 dark:border-slate-700 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
        />

        <button
          onClick={handleSend}
          disabled={readOnly}
          title={readOnly ? READ_ONLY_TITLE : undefined}
          aria-label="שליחת ההודעה"
          className="bg-violet-600 hover:bg-violet-700 text-white p-2 rounded-full transition-colors flex items-center justify-center w-9 h-9 shrink-0 shadow-md active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4 -mr-0.5" />
        </button>
      </div>
    </>
  );
}
