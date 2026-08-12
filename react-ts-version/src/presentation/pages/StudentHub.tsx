import { useState, useEffect } from 'react';
import { Play, Lock, ChevronLeft, Sun, Clock, Map, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';
import { StudentChatOverlay } from '@/features/workspace/overlays/StudentChatOverlay';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';
import { ref, onValue } from 'firebase/database';
import { database } from '@/infrastructure/firebase';

interface Meeting {
  id: number;
  title: string;
  desc: string;
  icon: string;
  isLocked: boolean;
  isTeacherActive?: boolean;
  pendingApproval?: boolean;
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07 },
  },
};

const itemVariants: Variants = {
  hidden: { y: 16, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } },
};

export function StudentHub() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const students = useStore(s => s.students);
  const globalChatEnabled = useStore(s => s.globalChatEnabled);
  const currentStudent = user?.uid ? students[user.uid] : null;
  const isPending = currentStudent?.routeStatus === 'PENDING' || currentStudent?.routeStatus === 'PENDING_TEACHER_APPROVAL';
  const isApproved = currentStudent?.routeStatus === 'APPROVED';

  const highestCompleted = currentStudent?.highestCompletedMeeting ?? (currentStudent?.completedMeeting2 ? 2 : 0);
  const isPendingLesson3 = isPending && highestCompleted >= 2;

  // --- Realtime Teacher Active Class Session Listener ---
  const [activeClassSession, setActiveClassSession] = useState<{ active: boolean; sessionNumber: number; startedAt: number } | null>(null);

  useEffect(() => {
    const sessionRef = ref(database, 'active_class_session');
    const unsub = onValue(sessionRef, (snap) => {
      if (snap.exists()) {
        setActiveClassSession(snap.val());
      } else {
        setActiveClassSession(null);
      }
    });
    return () => unsub();
  }, []);

  const isTeacherSessionActive = Boolean(activeClassSession && activeClassSession.active);
  const activeSessionNum = isTeacherSessionActive ? (Number(activeClassSession?.sessionNumber) || 1) : null;

  const meetings: Meeting[] = [
    { 
      id: 1, 
      title: 'שיעור 1: הכשרת חוקרים', 
      desc: 'היכרות עם כלי המעבדה השונים במרחב החקר הווירטואלי.', 
      icon: '🧪', 
      isTeacherActive: isTeacherSessionActive && activeSessionNum === 1,
      isLocked: isTeacherSessionActive ? (activeSessionNum !== 1 && highestCompleted < 1) : true
    },
    { 
      id: 2, 
      title: 'שיעור 2: סריקת רדאר', 
      desc: 'משימות חקר קצרות כדי שהמערכת תלמד את סגנון החשיבה הייחודי שלכם.', 
      icon: '📡', 
      isTeacherActive: isTeacherSessionActive && activeSessionNum === 2,
      isLocked: isTeacherSessionActive ? (activeSessionNum !== 2 && highestCompleted < 1) : true
    },
    { 
      id: 3, 
      title: 'שיעור 3: מחקר אישי', 
      desc: isPendingLesson3 ? 'הנתונים נסרקים במערכת, ממתין לאישור מנהל מעבדה...' : 'מתחילים במשימות מחקר שמותאמות בדיוק עבורכם!', 
      icon: '🔬', 
      isTeacherActive: isTeacherSessionActive && activeSessionNum === 3,
      isLocked: isTeacherSessionActive ? (activeSessionNum !== 3 && (highestCompleted < 2 || !isApproved)) : true,
      pendingApproval: isPendingLesson3
    },
    { id: 4, title: 'שיעור 4: חוקרים ומגלים', desc: 'ניסויי פריטה וקיבוץ — חוקרים יחד ומצליחים.', icon: '🔍', isTeacherActive: isTeacherSessionActive && activeSessionNum === 4, isLocked: isTeacherSessionActive ? (activeSessionNum !== 4 && highestCompleted < 3) : true },
    { id: 5, title: 'שיעור 5: חוקרים ומגלים', desc: 'ממשיכים לתכנון ניסויים ולגלות שיטות חשיבה חדשות.', icon: '💡', isTeacherActive: isTeacherSessionActive && activeSessionNum === 5, isLocked: isTeacherSessionActive ? (activeSessionNum !== 5 && highestCompleted < 4) : true },
    { id: 6, title: 'שיעור 6: מחקר מתקדם', desc: 'אתגרים מחשבתיים שמותאמים לקצב הגילוי שלכם.', icon: '🧬', isTeacherActive: isTeacherSessionActive && activeSessionNum === 6, isLocked: isTeacherSessionActive ? (activeSessionNum !== 6 && highestCompleted < 5) : true },
    { id: 7, title: 'שיעור 7: מחקר מתקדם', desc: 'לקראת סיום — ניסויים מאתגרים לחיזוק הלמידה.', icon: '🚀', isTeacherActive: isTeacherSessionActive && activeSessionNum === 7, isLocked: isTeacherSessionActive ? (activeSessionNum !== 7 && highestCompleted < 6) : true },
    { id: 8, title: 'שיעור 8: סיכום ותגליות', desc: 'מסכמים את המחקר ורואים אילו תגליות גילינו!', icon: '🏆', isTeacherActive: isTeacherSessionActive && activeSessionNum === 8, isLocked: isTeacherSessionActive ? (activeSessionNum !== 8 && highestCompleted < 7) : true },
  ];

  return (
    <div dir="rtl" className="relative h-full overflow-x-hidden overflow-y-auto bg-ws-bg font-body text-ws-ink">
      {/* Flat vector background shapes — playful world energy, zero visual noise */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full" style={{ backgroundColor: 'hsl(var(--ws-blue) / 0.05)' }} />
        <div className="absolute -bottom-32 -right-20 w-[380px] h-[380px] rounded-full" style={{ backgroundColor: 'hsl(var(--ws-teal) / 0.06)' }} />
        <div className="absolute top-[35%] left-[12%] w-16 h-16 rounded-2xl rotate-12" style={{ backgroundColor: 'hsl(var(--ws-accent) / 0.05)' }} />
      </div>

      <div className="relative p-6 md:p-10 max-w-5xl mx-auto w-full flex flex-col gap-10">

        {/* Warm welcome hero card */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="ws-card p-6 md:p-8"
        >
          <div className="w-full flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs md:text-sm font-bold bg-[hsl(var(--ws-blue-soft))] text-[hsl(var(--ws-blue))]">
                <Sun className="w-4 h-4" aria-hidden="true" />
                סביבת הלמידה האישית שלך
              </div>
              <UdlSpeechButton text="ברוכים הבאים למעבדת החשיבה. כאן אנחנו לא רק פותרים תרגילים, אלא חוקרים איך מספרים עובדים. הכלים במעבדה יעזרו לכם לגלות שיטות חשיבה חדשות." />
            </div>

            <div className="flex flex-col gap-2 max-w-3xl">
              <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight text-ws-ink">
                ברוכים הבאים למעבדת החשיבה 🔬
              </h1>
              <p className="text-base md:text-lg leading-relaxed font-medium text-ws-soft">
                כאן אנחנו לא רק פותרים תרגילים, אלא חוקרים איך מספרים עובדים. הכלים במעבדה יעזרו לכם לגלות שיטות חשיבה חדשות.
              </p>
            </div>

            {isPending && (
              <div className="mt-2 inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-[hsl(var(--ws-blue-soft))] border border-[hsl(var(--ws-blue)/0.3)] text-[hsl(var(--ws-blue))] font-bold text-sm">
                <Clock className="w-4 h-4 animate-pulse" aria-hidden="true" />
                ממתינים לאישור המורה למשימה הבאה...
              </div>
            )}
          </div>
        </motion.section>

        {/* Meeting sequence - Quest Map */}
        <section className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[hsl(var(--ws-blue-soft))] text-[hsl(var(--ws-blue))] flex items-center justify-center">
                <Map className="w-6 h-6" />
              </div>
              <h2 className="font-display font-extrabold text-2xl text-ws-ink">מפת המסע שלך</h2>
            </div>
            <UdlSpeechButton text="מפת המסע שלך. כאן תוכלו לראות את ההתקדמות שלכם בין המפגשים השונים." />
          </div>
          
          <div className="w-full bg-ws-surface2/50 h-4 rounded-full overflow-hidden p-0.5 border border-ws-surface2">
            <div 
              className="h-full rounded-full transition-all duration-1000 ease-out shadow-sm"
              style={{ width: `${(highestCompleted / meetings.length) * 100}%`, background: 'linear-gradient(to left, hsl(var(--ws-blue)), hsl(var(--ws-teal)))' }}
            />
          </div>

          <div className="relative mt-2 pr-4 sm:pr-8 pb-4">
            {/* Quest path dashed line */}
            <div className="absolute top-8 bottom-12 right-[3.35rem] sm:right-[4.35rem] w-1 border-r-[3px] border-dashed border-[hsl(var(--ws-blue-soft))] opacity-70 z-0" />

            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="flex flex-col gap-8 relative z-10"
            >
              {meetings.map((meeting) => {
                const isCompleted = highestCompleted >= meeting.id;
                const isCurrent = highestCompleted + 1 === meeting.id && !meeting.isLocked;
                
                return (
                  <motion.div
                    key={meeting.id}
                    variants={itemVariants}
                    whileHover={meeting.isLocked ? undefined : { y: -3, scale: 1.01 }}
                    role={meeting.isLocked ? undefined : 'link'}
                    tabIndex={meeting.isLocked ? -1 : 0}
                    aria-disabled={meeting.isLocked}
                    onKeyDown={(e) => {
                      if (!meeting.isLocked && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        navigate(`/workspace?meeting=${meeting.id}`);
                      }
                    }}
                    className={`flex flex-col sm:flex-row gap-5 items-center p-5 rounded-3xl border-2 transition-all bg-white relative ${
                      meeting.isLocked
                        ? 'opacity-70 border-ws-surface2 shadow-sm'
                        : isCurrent 
                          ? 'cursor-pointer border-[hsl(var(--ws-blue))] shadow-[0_8px_30px_rgb(0,0,0,0.06)]' 
                          : 'cursor-pointer border-[hsl(var(--ws-blue)/0.2)] hover:border-[hsl(var(--ws-blue)/0.4)] shadow-sm hover:shadow-md'
                    }`}
                    onClick={() => {
                      if (!meeting.isLocked) navigate(`/workspace?meeting=${meeting.id}`);
                    }}
                  >
                    {/* Status Dot / Connection Point */}
                    <div className={`absolute -right-[2.5rem] sm:-right-[2.5rem] w-5 h-5 rounded-full border-4 border-ws-bg z-20 ${
                      isCompleted ? 'bg-[hsl(var(--ws-teal))]' : isCurrent ? 'bg-[hsl(var(--ws-blue))] animate-pulse' : 'bg-ws-surface2'
                    }`} />

                    <div
                      className={`w-16 h-16 flex items-center justify-center text-3xl shrink-0 rounded-2xl transition-transform ${
                        meeting.isLocked 
                          ? 'bg-ws-surface2 text-ws-soft' 
                          : isCompleted 
                            ? 'bg-[hsl(var(--ws-teal)/0.15)] text-[hsl(var(--ws-teal))]' 
                            : 'bg-[hsl(var(--ws-blue-soft))] group-hover:scale-105'
                      }`}
                    >
                      <span aria-hidden="true">
                        {meeting.isLocked 
                          ? (meeting.pendingApproval ? <Clock className="w-7 h-7 text-[hsl(var(--ws-blue))] animate-pulse" /> : <Lock className="w-7 h-7 text-ws-soft" />) 
                          : meeting.icon}
                      </span>
                    </div>

                    <div className="flex-1 text-center sm:text-right">
                      <div className="flex items-center justify-center sm:justify-start gap-3 mb-1">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                            meeting.isLocked 
                              ? 'bg-ws-surface2 text-ws-soft' 
                              : isCompleted 
                                ? 'bg-[hsl(var(--ws-teal))] text-white' 
                                : 'bg-[hsl(var(--ws-blue))] text-white shadow-md'
                          }`}
                        >
                          {meeting.id}
                        </div>
                        <h3 className={`font-display text-lg font-bold ${isCurrent ? 'text-[hsl(var(--ws-blue))]' : 'text-ws-ink'}`}>
                          {meeting.title}
                        </h3>
                      </div>
                      <p className="text-sm md:text-base font-medium text-ws-soft pr-0 sm:pr-10">{meeting.desc}</p>
                    </div>

                    {isCompleted ? (
                      <span className="flex items-center gap-1.5 px-5 py-2 rounded-full text-sm font-bold shrink-0 bg-[hsl(var(--ws-teal)/0.1)] text-[hsl(var(--ws-teal))]">
                        <CheckCircle2 className="w-5 h-5" />
                        הושלם
                      </span>
                    ) : meeting.isTeacherActive ? (
                      <span className="ws-btn-primary flex items-center gap-1.5 px-6 py-2.5 rounded-full font-display font-extrabold transition-all shrink-0 shadow-lg shadow-indigo-500/25 animate-pulse cursor-pointer">
                        ▶️ התחל משימה בלייב
                        <ChevronLeft className="w-5 h-5" aria-hidden="true" />
                      </span>
                    ) : meeting.isLocked ? (
                      <span className={`px-5 py-2 rounded-full text-sm font-bold shrink-0 ${meeting.pendingApproval ? 'bg-[hsl(var(--ws-blue-soft))] text-[hsl(var(--ws-blue))]' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20'}`}>
                        {meeting.pendingApproval ? 'ממתין לאישור מורה' : 'ממתין להפעלת המורה 🔒'}
                      </span>
                    ) : (
                      <span className="bg-ws-surface2 text-ws-ink hover:bg-[hsl(var(--ws-blue-soft))] flex items-center gap-1.5 px-6 py-2.5 rounded-full font-display font-extrabold transition-all shrink-0">
                        חזור למשימה
                        <ChevronLeft className="w-5 h-5" aria-hidden="true" />
                      </span>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </section>
      </div>
      {/* Teacher Direct Chat */}
      {globalChatEnabled && <StudentChatOverlay />}
    </div>
  );
}
