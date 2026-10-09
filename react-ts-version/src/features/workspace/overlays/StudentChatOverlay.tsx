import { useEffect, useState, useRef } from 'react';
import { useStudentChatOpen } from '@/application/useStudentChatOpen';
import { useDismissableOverlay } from '@/hooks/useDismissableOverlay';
import { useChatStore, normalizeStudentId, isTeacherOrAdminId } from '@/application/useChatStore';
import { useAuthStore, currentStudentUid } from '@/application/useAuthStore';
import { useStore } from '@/application/useStore';
import { useAdminStore } from '@/application/useAdminStore';
import { useActiveClassSession } from '@/application/useActiveClassSession';
import { Check, CheckCheck, Send, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { validateChatInputForPII, anonymizeChatMessageBody, reportPiiFilterFailure } from '@/core/security/PiiFilter';
import { ref, update } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { currentTaskLabelHe } from '@/application/taskLabel';

/** The ready message that asks for help: the teacher receives what the learner pressed. */
export const READY_HELP_MESSAGE_HE = 'אפשר עזרה בתרגיל?';
export const READY_UNCLEAR_MESSAGE_HE = 'לא הבנתי את ההוראה';
export const CALL_TEACHER_MESSAGE_HE = 'המורה, אפשר לבוא לעזור לי? 🙋';
/** What the child reads when the PII filter refuses a message (מסמך 04: such a message "נחסמת לפני השליחה"). */
export const PII_REFUSAL_CHILD_HE = "בהודעה יש מספר טלפון, מספר זהות או כתובת מייל. בצ'אט לא כותבים אותם. מחקו ושלחו שוב.";
/** The help banner and the empty chat's instruction, each with its read-aloud button (PRD Module 7 §א). */
const CALL_BANNER_HE = 'צריכים עזרה עכשיו?';
const EMPTY_CHAT_INSTRUCTION_HE = 'כתבו הודעה למורה, או לחצו על "קראו למורה".';

/**
 * Owner, 1.10.2026: a help message names the exercise the learner is on, in
 * the words of the heading above it — "אפשר עזרה בתרגיל? (משימה 3 מתוך 7)".
 */
export function withExerciseHe(text: string, label: string | null): string {
  return label ? `${text} (${label})` : text;
}

/**
 * The folded coaching card's tab (owner, 4.10.2026, A7-002): the card's name
 * on the child's screens is "כרטיס החניכה" (meeting 8's reflection board, מסמך 03).
 */
export const CARD_TAB_HE = 'כרטיס החניכה';
export const CARD_TAB_LABEL_HE = 'חזרה לכרטיס החניכה';

/** The same ready message pressed again within this time is one press. */
const READY_MESSAGE_REPEAT_MS = 2000;

export function StudentChatOverlay() {
  // Shared with the coaching card, which folds while the chat is open (A7-002).
  const isOpen = useStudentChatOpen((s) => s.open);
  const cardFolded = useWorkspaceStore((s) => s.helpState === 'socratic');
  const setIsOpen = (next: boolean | ((prev: boolean) => boolean)) =>
    useStudentChatOpen.setState((s) => ({ open: typeof next === 'function' ? next(s.open) : next }));
  // Each workspace starts with the chat closed, and leaving it closes it.
  useEffect(() => {
    useStudentChatOpen.setState({ open: false });
    return () => useStudentChatOpen.setState({ open: false });
  }, []);

  // מסמך העיצוב §1.2: Escape סוגר. הפאנל אינו חוסם את הלוח, ולכן אינו
  // לוכד פוקוס — אבל כן מקבל אותו בפתיחה, כי הלומד פתח אותו כדי לכתוב.
  const panelRef = useDismissableOverlay<HTMLDivElement>(isOpen, () => setIsOpen(false), {
    trapFocus: false,
  });
  const [text, setText] = useState('');
  const { messages, sendMessage, markAsRead, initSync } = useChatStore();
  const user = useAuthStore(s => s.user);
  const activeSession = useActiveClassSession();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastReadySentRef = useRef<{ text: string; at: number } | null>(null);

  const students = useStore(s => s.students);
  const classes = useAdminStore(s => s.classes);
  
  // חדר הצ'אט נגזר מהמזהה הקנוני. normalizeStudentId על מזהה Auth גולמי
  // תופס את הספרה הראשונה שבו וממפה אותה לתלמיד כלשהו — כלומר ההודעות
  // של ילד אחד היו יכולות להיכנס לשיחה של ילד אחר עם המורה.
  const normUid = currentStudentUid();
  const studentData = normUid ? students[normUid] : null;
  const studentClass = classes.find(c => c.id === studentData?.classId);
  const targetTeacherId = studentClass?.teacherId || activeSession?.teacherId || '1002220159';

  // Ensure chat is synced with Firebase on mount and on user authentication change
  useEffect(() => {
    if (user?.uid) {
      initSync();
    }
  }, [initSync, user?.uid]);

  useEffect(() => {
    const handleToggle = () => setIsOpen(prev => !prev);
    document.addEventListener('toggle-chat', handleToggle);
    return () => document.removeEventListener('toggle-chat', handleToggle);
  }, []);

  useEffect(() => {
    if (isOpen && user?.uid) {
      markAsRead(normUid, targetTeacherId);
      markAsRead(normUid, 'teacher');
      markAsRead(normUid, 'admin');
    }
  }, [isOpen, user?.uid, messages, markAsRead, normUid, targetTeacherId]);

  useEffect(() => {
    if (messagesEndRef.current && isOpen) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, messages]);

  if (!user) return null;

  // In the student's room, display all synchronized messages between student and staff
  const myMessages = messages.filter(m => 
    !m.receiverId || 
    normalizeStudentId(m.receiverId) === normUid || 
    normalizeStudentId(m.senderId) === normUid ||
    isTeacherOrAdminId(m.senderId) ||
    isTeacherOrAdminId(m.receiverId)
  );

  // Owner, 1.10.2026 (evening): the learner and the teacher chat in free text
  // both ways. The learner knows not to write their name (the teacher says so
  // in the meeting-1 demo); the client filter still refuses an e-mail address,
  // an ID or a phone number (PRD Module 22, invariant 1). That filter is the
  // only one on this chat: the message goes straight to the Realtime Database,
  // and no server code reads or cleans it. The two ready messages stay as
  // one-press shortcuts.
  const handleSend = () => {
    const textToSend = text.trim();
    // No learner number (a teacher previewing the workspace): nothing to send
    // as — an empty id wrote to the root of chat_messages.
    if (!textToSend || !user?.uid || !normUid) return;
    // PRD Module 3 §א (v7.9): if the filter itself fails, nothing is locked —
    // the failure is logged (console + audit log) and the message goes.
    let validation: { valid: boolean; errorHe?: string } = { valid: true };
    try {
      validation = validateChatInputForPII(textToSend);
    } catch (err) {
      reportPiiFilterFailure('StudentChatOverlay', err);
    }
    if (!validation.valid) {
      // One child's sentence for every refusal: PiiFilter's own texts are the
      // teacher screens' ("…השתמשו במזהה האנונימי של התלמיד (1-12)"), an
      // adult's words that ask a grade-3 child for something it cannot do
      // (audit 4.10.2026, A7-006).
      toast.warning(PII_REFUSAL_CHILD_HE);
      return;
    }
    const studentNum = normUid.replace(/\D+/g, '') || '1';
    sendMessage(normUid, `תלמיד ${studentNum}`, targetTeacherId as string, anonymizeChatMessageBody(textToSend));
    setText('');
  };

  const sendReadyMessage = (messageText: string) => {
    // No learner number (a teacher previewing the workspace): nothing to send
    // as — an empty id wrote to the root of chat_messages.
    if (!user?.uid || !normUid) return;
    // A double tap on a tablet sent the teacher the same message twice.
    const now = Date.now();
    const last = lastReadySentRef.current;
    if (last && last.text === messageText && now - last.at < READY_MESSAGE_REPEAT_MS) return;
    lastReadySentRef.current = { text: messageText, at: now };
    const studentNum = normUid.replace(/\D+/g, '') || '1';
    const ws = useWorkspaceStore.getState();
    const isHelp = messageText === READY_HELP_MESSAGE_HE;
    const label = isHelp ? currentTaskLabelHe(ws) : null;
    sendMessage(normUid, `תלמיד ${studentNum}`, targetTeacherId as string, withExerciseHe(messageText, label));
    if (isHelp) ws.logChatHelpRequest('ready_message');
  };

  const handleCallTeacher = () => {
    if (!user?.uid || !normUid) return;
    const studentNum = normUid.replace(/\D+/g, '') || '1';
    const ws = useWorkspaceStore.getState();
    const label = currentTaskLabelHe(ws);

    // PRD v7.1 Module 18: a help call must reach the Silent Radar (BLUE state),
    // not just the chat thread — write helpRequested + a radar_alerts entry.
    // Only helpRequested: it is the field the call button takes back. The
    // extra handRaised/isStruggling flags written here kept the radar tile
    // BLUE after the learner took the call back.
    const now = Date.now();
    update(ref(database, `users/students/${normUid}`), {
      helpRequested: true,
      lastHelpTimestamp: now,
      lastAction: 'תלמיד קרא למורה מהצ׳אט! 🔔',
      last_alert: 'תלמיד קרא למורה מהצ׳אט!',
    }).catch(console.error);
    update(ref(database, `radar_alerts/${normUid}_help_${now}`), {
      studentId: normUid,
      rawStudentId: normUid,
      timestamp: now,
      type: 'HELP_CALL',
      message: withExerciseHe(`תלמיד ${studentNum} קרא למורה מהצ׳אט`, label),
      severity: 'warning',
      persistent: true,
    }).catch(console.error);

    sendMessage(
      normUid,
      `תלמיד ${studentNum}`,
      targetTeacherId as string,
      withExerciseHe(CALL_TEACHER_MESSAGE_HE, label)
    );
    ws.logChatHelpRequest('call');
    toast.success('הקריאה נשלחה למורה בהצלחה! 🔔');
  };

  if (!isOpen) return null;

  // `rr-block` — rrweb's default blockClass. The screen recording documents the
  // board, not the conversation: PRD Module 21 §ב "ההקלטה מתעדת שינויי DOM
  // ושינויי קנבס בלבד", and invariant 1 / Module 3 §א (Zero-PII). The panel
  // renders inside the recorded page, so without this the recording carried
  // every bubble and every keystroke typed here — even a message the PII filter
  // refused to send — to RTDB, the teacher's replay and the Drive backups.
  // rrweb replaces a blocked element with an empty box of the same size and
  // records no input, mutation or text inside it. The math inputs stay
  // recorded (Module 21: the teacher analyses the steps), so no maskAllInputs.
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="הודעות עם המורה"
      className="rr-block fixed bottom-6 left-6 z-50 w-80 sm:w-96 h-[480px] bg-ws-surface rounded-3xl shadow-2xl border-2 border-ws-surface2 flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200"
      dir="rtl"
    >
      {/* Header */}
      <div className="p-4 bg-ws-surface2 border-b border-ws-surface2 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-ws-ink">צ'אט עם המורה</span>
          <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
        </div>
        {/* The coaching card, folded while the chat is open (owner, 4.10.2026,
            A7-002): its tab sits in this header, so it covers nothing on the
            screen. A press closes the chat, and the card comes back as it was. */}
        {cardFolded && (
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            data-testid="socratic-card-tab"
            aria-label={CARD_TAB_LABEL_HE}
            title={CARD_TAB_LABEL_HE}
            className="ms-auto me-2 min-h-11 px-3 rounded-xl text-sm font-bold whitespace-nowrap flex items-center gap-1.5 border-2 border-indigo-200 dark:border-indigo-800/80 bg-ws-surface text-ws-ink hover:bg-ws-accentSoft/40 active:scale-95 transition-all cursor-pointer shadow-sm"
          >
            <span aria-hidden="true">💡</span>
            <span>{CARD_TAB_HE}</span>
          </button>
        )}
        <button 
          onClick={() => setIsOpen(false)}
          className="text-ws-soft hover:text-ws-ink text-sm font-bold min-w-11 min-h-11 px-3 rounded-lg hover:bg-ws-surface transition-colors cursor-pointer"
          aria-label="סגירת חלון הצ'אט"
        >
          ✕
        </button>
      </div>

      {/* Call Teacher Action Banner */}
      <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/50 p-2.5 px-4 flex items-center justify-between gap-2 shrink-0">
        <span className="flex items-center gap-1.5 text-xs font-medium text-amber-900 dark:text-amber-200">
          {CALL_BANNER_HE}
          <UdlSpeechButton text={CALL_BANNER_HE} className="shrink-0" />
        </span>
        <button
          onClick={handleCallTeacher}
          className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-xs font-bold px-4 min-h-11 rounded-full shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <span>קראו למורה 🔔</span>
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-4 flex flex-col gap-3">
        {myMessages.length === 0 ? (
          <div className="text-center text-ws-soft text-sm my-auto flex flex-col items-center gap-2">
            <HelpCircle className="w-8 h-8 opacity-40 text-ws-accent" />
            <p>אין הודעות קודמות.</p>
            <p className="text-xs flex items-center gap-1.5">
              {EMPTY_CHAT_INSTRUCTION_HE}
              <UdlSpeechButton text={EMPTY_CHAT_INSTRUCTION_HE} className="shrink-0" />
            </p>
          </div>
        ) : (
          myMessages.map(m => {
            const isMe = normalizeStudentId(m.senderId) === normUid;
            return (
              <div key={m.id} className={`flex flex-col max-w-[82%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
                <div className={`p-3 rounded-2xl ${isMe ? 'bg-ws-accent text-white rounded-tr-sm' : 'bg-ws-surface2 text-ws-ink rounded-tl-sm shadow-sm'}`}>
                  {m.text && (
                    <div className="flex items-center gap-2">
                      <span className="leading-relaxed text-sm">{m.text}</span>
                      {/* הקראה להודעות המורה בלבד: מה שהילד כתב בעצמו הוא כבר יודע. */}
                      {!isMe && (
                        <UdlSpeechButton text={m.text} className="w-7 h-7 p-0 shrink-0" />
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-ws-soft mt-1">
                  <span>
                    {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {isMe && (
                    m.read ? (
                      <span title="נקרא על ידי המורה"><CheckCheck className="w-3.5 h-3.5 text-emerald-500" /></span>
                    ) : (
                      <span title="נשלח בהצלחה"><Check className="w-3.5 h-3.5 text-slate-400" /></span>
                    )
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Ready messages — one-press shortcuts beside the free text below. */}
      <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border-t border-ws-surface2 flex gap-1.5 overflow-x-auto no-scrollbar shrink-0">
        <button
          onClick={() => sendReadyMessage(READY_HELP_MESSAGE_HE)}
          className="text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-full px-3.5 min-h-11 flex items-center whitespace-nowrap hover:border-ws-accent transition-colors cursor-pointer"
        >
          {READY_HELP_MESSAGE_HE}
        </button>
        <button
          onClick={() => sendReadyMessage(READY_UNCLEAR_MESSAGE_HE)}
          className="text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-full px-3.5 min-h-11 flex items-center whitespace-nowrap hover:border-ws-accent transition-colors cursor-pointer"
        >
          {READY_UNCLEAR_MESSAGE_HE}
        </button>
      </div>

      {/* Input Box */}
      <div className="p-3.5 border-t border-ws-surface2 shrink-0 bg-ws-surface">
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="כתבו הודעה למורה..."
            aria-label="הודעה למורה"
            className="flex-1 border border-ws-surface2 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-ws-accent bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          />
          <button
            onClick={() => handleSend()}
            disabled={!text.trim()}
            aria-label="שליחת ההודעה"
            className="bg-ws-accent disabled:opacity-40 text-white rounded-full w-11 h-11 flex items-center justify-center hover:brightness-110 active:scale-95 transition-all font-bold cursor-pointer shrink-0 shadow-sm"
          >
            <Send className="w-4 h-4 -mr-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
