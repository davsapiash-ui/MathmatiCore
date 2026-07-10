import { Play, Lock, ChevronLeft, Sun, Clock, Map, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';
import { StudentChatOverlay } from '@/features/workspace/overlays/StudentChatOverlay';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';

interface Meeting {
  id: number;
  title: string;
  desc: string;
  icon: string;
  isLocked: boolean;
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

  const meetings: Meeting[] = [
    { id: 1, title: 'שיעור 1: הכשרת חוקרים', desc: 'היכרות עם כלי המעבדה השונים במרחב החקר הווירטואלי.', icon: '🧪', isLocked: false },
    { id: 2, title: 'שיעור 2: סריקת רדאר', desc: 'משימות חקר קצרות כדי שהמערכת תלמד את סגנון החשיבה הייחודי שלכם.', icon: '📡', isLocked: highestCompleted < 1 },
    { 
      id: 3, 
      title: 'שיעור 3: מחקר אישי', 
      desc: isPending ? 'הנתונים נסרקים במערכת, ממתין לאישור מנהל מעבדה...' : 'מתחילים במשימות מחקר שמותאמות בדיוק עבורכם!', 
      icon: '🔬', 
      isLocked: (highestCompleted < 2) || !isApproved,
      pendingApproval: isPending
    },
    { id: 4, title: 'שיעור 4: חוקרים ומגלים', desc: 'ניסויי פריטה וקיבוץ — חוקרים יחד ומצליחים.', icon: '🔍', isLocked: highestCompleted < 3 },
    { id: 5, title: 'שיעור 5: חוקרים ומגלים', desc: 'ממשיכים לתכנן ניסויים ולגלות שיטות חשיבה חדשות.', icon: '💡', isLocked: highestCompleted < 4 },
    { id: 6, title: 'שיעור 6: מחקר מתקדם', desc: 'אתגרים מחשבתיים שמותאמים לקצב הגילוי שלכם.', icon: '🧬', isLocked: highestCompleted < 5 },
    { id: 7, title: 'שיעור 7: מחקר מתקדם', desc: 'לקראת סיום — ניסויים מאתגרים לחיזוק הלמידה.', icon: '🚀', isLocked: highestCompleted < 6 },
    { id: 8, title: 'שיעור 8: סיכום ותגליות', desc: 'מסכמים את המחקר ורואים אילו תגליות גילינו!', icon: '🏆', isLocked: highestCompleted < 7 },
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

        {/* Warm welcome — process-oriented, no scores or fake metrics */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="ws-card p-8 md:p-12"
        >
          <div className="max-w-2xl flex flex-col items-start gap-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold bg-[hsl(var(--ws-blue-soft))] text-[hsl(var(--ws-blue))]">
              <Sun className="w-4 h-4" aria-hidden="true" />
              סביבת הלמידה האישית שלך
            </div>
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h1 className="font-display font-black text-4xl md:text-5xl tracking-tight leading-tight text-ws-ink mb-4">
                  ברוכים הבאים למעבדת החשיבה 🔬
                </h1>
                <p className="text-lg md:text-xl leading-relaxed font-medium text-ws-soft">
                  כאן אנחנו לא רק פותרים תרגילים, אלא חוקרים איך מספרים עובדים. הכלים במעבדה יעזרו לכם לגלות שיטות חשיבה חדשות.
                </p>
              </div>
              <div className="pt-2">
                <UdlSpeechButton text="ברוכים הבאים למעבדת החשיבה. כאן אנחנו לא רק פותרים תרגילים, אלא חוקרים איך מספרים עובדים. הכלים במעבדה יעזרו לכם לגלות שיטות חשיבה חדשות." />
              </div>
            </div>

            {isPending ? (
              <div className="mt-4 flex items-center gap-3 px-6 py-3 rounded-full bg-[hsl(var(--ws-blue-soft))] border border-[hsl(var(--ws-blue)/0.3)] text-[hsl(var(--ws-blue))] font-bold">
                <Clock className="w-5 h-5 animate-pulse" aria-hidden="true" />
                ממתינים לאישור המורה למשימה הבאה...
              </div>
            ) : (
              <motion.button
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.97 }}
                className="ws-brand mt-4 flex items-center justify-center gap-3 px-8 py-4 rounded-full font-display font-extrabold text-lg transition-all hover:brightness-105"
                onClick={() => {
                  // Smart routing: go to the next unlocked meeting
                  let nextMeeting = 1;
                  if (highestCompleted === 0) {
                    nextMeeting = 1;
                  } else if (highestCompleted === 1) {
                    nextMeeting = 2;
                  } else if (highestCompleted === 2) {
                    nextMeeting = isApproved ? 3 : 2;
                  } else {
                    nextMeeting = Math.min(highestCompleted + 1, 8);
                  }
                  navigate(`/workspace?meeting=${nextMeeting}`);
                }}
              >
                <Play className="w-5 h-5 fill-current" aria-hidden="true" />
                להמשך התרגול
              </motion.button>
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
                    ) : meeting.isLocked ? (
                      <span className={`px-5 py-2 rounded-full text-sm font-bold shrink-0 ${meeting.pendingApproval ? 'bg-[hsl(var(--ws-blue-soft))] text-[hsl(var(--ws-blue))]' : 'bg-ws-surface2 text-ws-soft'}`}>
                        {meeting.pendingApproval ? 'ממתין לאישור' : 'בקרוב'}
                      </span>
                    ) : (
                      <span className={`${isCurrent ? 'ws-btn-primary' : 'bg-ws-surface2 text-ws-ink hover:bg-[hsl(var(--ws-blue-soft))]'} flex items-center gap-1.5 px-6 py-2.5 rounded-full font-display font-extrabold transition-all shrink-0`}>
                        {isCurrent ? 'התחל משימה' : 'חזור למשימה'}
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
