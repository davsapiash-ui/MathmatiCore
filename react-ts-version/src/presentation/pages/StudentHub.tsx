import { Play, Lock, ChevronLeft, Sun, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';

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
  
  const currentStudent = user ? students[user.id] : null;
  const isPending = currentStudent?.routeStatus === 'PENDING';
  const isApproved = currentStudent?.routeStatus === 'APPROVED';

  const meetings: Meeting[] = [
    { id: 1, title: 'מפגש 1: היכרות ותפעול', desc: 'התנסות חופשית במרחב העבודה הווירטואלי.', icon: '👋', isLocked: false },
    { id: 2, title: 'מפגש 2: אבחון אישי', desc: 'משימות קצרות כדי להכיר איך אתם חושבים במתמטיקה.', icon: '🎯', isLocked: false },
    { 
      id: 3, 
      title: 'מפגש 3: מסלול מותאם', 
      desc: isPending ? 'הנתונים נבדקים, ממתין לאישור המורה...' : 'מתחילים לפתור תרגילים מיוחדים שמותאמים בדיוק לכם!', 
      icon: '🧭', 
      isLocked: !isApproved,
      pendingApproval: isPending
    },
    { id: 4, title: 'מפגש 4: חוקרים ומגלים', desc: 'תרגולי פריטה וקיבוץ — מתרגלים יחד ומצליחים.', icon: '🔍', isLocked: true },
    { id: 5, title: 'מפגש 5: חוקרים ומגלים', desc: 'ממשיכים לתרגל ולגלות שיטות חדשות לפתרון.', icon: '💡', isLocked: true },
    { id: 6, title: 'מפגש 6: אלופי החשבון', desc: 'תרגילים מתקדמים שמותאמים לקצב שלכם.', icon: '🏗️', isLocked: true },
    { id: 7, title: 'מפגש 7: אלופי החשבון', desc: 'לקראת סיום — תרגולים מאתגרים לחיזוק הלמידה.', icon: '⛰️', isLocked: true },
    { id: 8, title: 'מפגש 8: סיכום ורפלקציה', desc: 'מסכמים את התהליך ורואים כמה התקדמנו!', icon: '🌱', isLocked: true },
  ];

  return (
    <div dir="rtl" className="relative min-h-full w-full bg-ws-bg font-body text-ws-ink overflow-hidden">
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
            <h1 className="font-display font-black text-4xl md:text-5xl tracking-tight leading-tight text-ws-ink">
              ברוכים השבים!
            </h1>
            <p className="text-lg md:text-xl leading-relaxed font-medium text-ws-soft">
              כל מפגש הוא הזדמנות לחשוב, לנסות ולגלות. קחו את הזמן שלכם — הדרך חשובה יותר מהמהירות.
            </p>

            <motion.button
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.97 }}
              className="ws-brand mt-4 flex items-center justify-center gap-3 px-8 py-4 rounded-full font-display font-extrabold text-lg transition-all hover:brightness-105"
              onClick={() => navigate('/workspace?meeting=1')}
            >
              <Play className="w-5 h-5 fill-current" aria-hidden="true" />
              להמשך התרגול
            </motion.button>
          </div>
        </motion.section>

        {/* Meeting sequence */}
        <section className="flex flex-col gap-5">
          <h2 className="font-display font-extrabold text-2xl text-ws-ink">רצף המפגשים</h2>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="flex flex-col gap-4"
          >
            {meetings.map((meeting) => (
              <motion.div
                key={meeting.id}
                variants={itemVariants}
                whileHover={meeting.isLocked ? undefined : { y: -3 }}
                role={meeting.isLocked ? undefined : 'link'}
                tabIndex={meeting.isLocked ? -1 : 0}
                aria-disabled={meeting.isLocked}
                onKeyDown={(e) => {
                  if (!meeting.isLocked && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    navigate(`/workspace?meeting=${meeting.id}`);
                  }
                }}
                className={`flex flex-col sm:flex-row gap-5 items-center p-5 ws-card transition-all ${
                  meeting.isLocked
                    ? 'opacity-60'
                    : 'cursor-pointer group hover:border-[hsl(var(--ws-blue)/0.45)] hover:shadow-lg'
                }`}
                onClick={() => {
                  if (!meeting.isLocked) navigate(`/workspace?meeting=${meeting.id}`);
                }}
              >
                <div
                  className={`w-16 h-16 flex items-center justify-center text-3xl shrink-0 rounded-2xl transition-transform ${
                    meeting.isLocked ? 'bg-ws-surface2' : 'bg-[hsl(var(--ws-blue-soft))] group-hover:scale-105'
                  }`}
                >
                  <span aria-hidden="true">
                    {meeting.isLocked 
                      ? (meeting.pendingApproval ? <Clock className="w-7 h-7 text-ws-blue animate-pulse" /> : <Lock className="w-7 h-7 text-ws-soft" />) 
                      : meeting.icon}
                  </span>
                </div>

                <div className="flex-1 text-center sm:text-right">
                  <div className="flex items-center justify-center sm:justify-start gap-3 mb-1">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        meeting.isLocked ? 'bg-ws-surface2 text-ws-soft' : 'bg-[hsl(var(--ws-blue))] text-white'
                      }`}
                    >
                      {meeting.id}
                    </div>
                    <h3 className="font-display text-lg font-bold text-ws-ink">{meeting.title}</h3>
                  </div>
                  <p className="text-sm md:text-base font-medium text-ws-soft">{meeting.desc}</p>
                </div>

                {meeting.isLocked ? (
                  <span className={`px-4 py-1.5 rounded-full text-sm font-bold shrink-0 ${meeting.pendingApproval ? 'bg-ws-blue-soft text-ws-blue' : 'bg-ws-surface2 text-ws-soft'}`}>
                    {meeting.pendingApproval ? 'ממתין לאישור' : 'בקרוב'}
                  </span>
                ) : (
                  <span className="ws-btn-primary flex items-center gap-1.5 px-6 py-2.5 rounded-full font-display font-extrabold transition-all shrink-0">
                    התחל
                    <ChevronLeft className="w-5 h-5" aria-hidden="true" />
                  </span>
                )}
              </motion.div>
            ))}
          </motion.div>
        </section>
      </div>
    </div>
  );
}
