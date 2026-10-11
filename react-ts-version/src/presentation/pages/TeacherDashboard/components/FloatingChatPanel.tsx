import { useState } from 'react';
import { type StudentData } from '@/application/useStore';
import { X, Minus } from 'lucide-react';
import { normalizeStudentId } from '@/application/useChatStore';
import { ChatThread } from './ChatThread';

interface Props {
  student: StudentData;
  onClose: () => void;
  teacherId: string;
}

/**
 * A learner's conversation over the current tab. On the radar tab the side
 * action queue shows the conversation inline instead (owner, 11.10.2026), so
 * this panel never covers the queue there. The messages and the reply box are
 * ChatThread, shared with the queue.
 */
export function FloatingChatPanel({ student, onClose, teacherId }: Props) {
  const [isMinimized, setIsMinimized] = useState(false);
  const normStudentId = normalizeStudentId(student.studentId || (student as any).id);

  // No delete button here (audit 4.10.2026). A trash icon added on 31.8 wiped
  // the whole conversation for teacher and learner, with no backup and no
  // audit entry. PRD 23א §א forbids an irreversible deletion of pilot data;
  // chat history goes only with a reset, after its backup (23א §ג).

  // Above the learner drawer, whose chat button opens this panel. Both stood
  // at z-[9999], and the drawer is portalled later into <body>, so on a narrow
  // screen (the drawer is full-width there) the chat opened underneath it.
  return (
    <div className={`fixed bottom-0 left-8 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-2xl shadow-2xl z-[10000] flex flex-col transition-all duration-300 ${isMinimized ? 'h-12' : 'h-[440px]'}`} dir="rtl">
      {/* Header */}
      <div
        className="h-12 px-4 bg-violet-600 text-white rounded-t-2xl flex items-center justify-between cursor-pointer select-none"
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <div className="font-bold text-sm flex items-center gap-2">
          {/* A steady dot: nothing on the teacher's screens pulses (Module 18). */}
          <div className={`w-2.5 h-2.5 rounded-full ${student?.isOnline ? 'bg-violet-300' : 'bg-slate-400'}`}></div>
          <span>תלמיד {normStudentId.replace(/\D/g, '') || normStudentId}</span>
        </div>
        <div className="flex gap-2 text-violet-200">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setIsMinimized((v) => !v); }}
            className="hover:text-white transition-colors"
            title={isMinimized ? 'הגדילו' : 'מזערו'}
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="hover:text-white transition-colors"
            title="סגרו"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      {!isMinimized && (
        <ChatThread studentId={student.studentId || (student as any).id} teacherId={teacherId} active={!isMinimized} />
      )}
    </div>
  );
}
