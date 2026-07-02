import { Play, Trophy, Star, Sparkles, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import '../styles/main.css';

const meetings = [
  { id: 1, title: 'מפגש 1: היכרות ותפעול', desc: 'התנסות חופשית במרחב העבודה הווירטואלי.', icon: '👋', color: 'var(--color-primary)', isLocked: false },
  { id: 2, title: 'מפגש 2: אבחון אישי', desc: 'מבדק קצר כדי להכיר את הרמה שלכם במתמטיקה.', icon: '🎯', color: 'var(--color-accent)', isLocked: false },
  { id: 3, title: 'מפגש 3: מסלול אדפטיבי', desc: 'מתחילים לפתור תרגילים מיוחדים שמותאמים בדיוק לכם!', icon: '🔒', color: '#94a3b8', isLocked: true },
  { id: 4, title: 'מפגש 4: חוקרים ומגלים', desc: 'תרגולי פריטה וקיבוץ - מתרגלים יחד ומצליחים.', icon: '🔒', color: '#94a3b8', isLocked: true },
  { id: 5, title: 'מפגש 5: חוקרים ומגלים', desc: 'ממשיכים לתרגל ולגלות שיטות חדשות לפתרון.', icon: '🔒', color: '#94a3b8', isLocked: true },
  { id: 6, title: 'מפגש 6: אלופי החשבון', desc: 'תרגילים מתקדמים שמותאמים לקצב שלכם.', icon: '🔒', color: '#94a3b8', isLocked: true },
  { id: 7, title: 'מפגש 7: אלופי החשבון', desc: 'לקראת סיום - תרגולים מאתגרים לחיזוק הלמידה.', icon: '🔒', color: '#94a3b8', isLocked: true },
  { id: 8, title: 'מפגש 8: סיכום ורפלקציה', desc: 'מסכמים את התהליך ורואים כמה התקדמנו!', icon: '🔒', color: '#94a3b8', isLocked: true },
];

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants: Variants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

export function StudentHub() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen w-full relative overflow-x-hidden font-sans" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
      {/* Decorative Orbs from Vanilla Design but upgraded */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full blur-[120px] pointer-events-none opacity-40" style={{ background: 'var(--color-primary-light)' }} />
      <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[40%] rounded-full blur-[100px] pointer-events-none opacity-30" style={{ background: 'rgba(16,185,129,0.15)' }} />

      <div className="p-8 max-w-6xl mx-auto w-full flex flex-col gap-10 relative z-10 pt-12">
        
        {/* Next-Gen Hero Section */}
        <motion.section 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-[2rem] p-10 md:p-14 shadow-xl border"
          style={{ 
            backgroundColor: 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(20px)',
            borderColor: 'var(--color-border-light)',
            boxShadow: '0 20px 40px -15px rgba(99, 102, 241, 0.15)'
          }}
        >
          {/* Subtle accent glow inside hero */}
          <div className="absolute top-0 right-0 w-full h-1" style={{ background: 'linear-gradient(90deg, var(--color-primary), var(--color-accent))' }} />
          
          <div className="relative z-10 max-w-3xl flex flex-col items-start gap-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold shadow-sm" style={{ backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary-dark)' }}>
              <Sparkles className="w-4 h-4" /> סביבת הלמידה האישית שלך
            </div>
            <h1 className="text-5xl md:text-6xl font-black tracking-tight leading-tight mt-2" style={{ color: 'var(--color-text)' }}>
              ברוכים השבים!
            </h1>
            <p className="text-xl leading-relaxed mt-2 font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              המשיכו במסע הלמידה שלכם. תרגילים מאתגרים מחכים לכם, בואו נראה מה אתם יודעים!
            </p>
            
            <motion.button 
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.97 }}
              className="mt-6 flex items-center justify-center gap-3 px-8 py-4 rounded-full text-white font-bold text-lg transition-shadow"
              style={{ 
                background: 'var(--color-primary)', 
                boxShadow: '0 10px 25px -5px rgba(99,102,241,0.5)' 
              }}
              onClick={() => navigate('/workspace')}
            >
              <Play className="w-5 h-5 fill-current" />
              להמשך התרגול
            </motion.button>
          </div>
        </motion.section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          
          {/* Meeting Sequence List */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-extrabold flex items-center gap-3" style={{ color: 'var(--color-text)' }}>
                רצף המפגשים
              </h2>
            </div>
            
            <motion.div 
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="flex flex-col gap-5"
            >
              {meetings.map((meeting, idx) => (
                <motion.div 
                  key={meeting.id}
                  variants={itemVariants}
                  whileHover={{ y: -4, boxShadow: '0 15px 30px -10px rgba(0,0,0,0.1)' }}
                  className={`flex flex-col sm:flex-row gap-5 items-center p-5 rounded-2xl border transition-all ${meeting.isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer group'}`}
                  style={{ 
                    backgroundColor: 'var(--color-surface)', 
                    borderColor: 'var(--color-border)',
                  }}
                  onClick={() => {
                    if (!meeting.isLocked) {
                      navigate(`/workspace?meeting=${meeting.id}`);
                    }
                  }}
                >
                  <div className="w-16 h-16 flex items-center justify-center text-3xl shrink-0 rounded-2xl relative overflow-hidden group-hover:scale-105 transition-transform" 
                       style={{ backgroundColor: 'var(--color-surface-2)' }}>
                    <div className="absolute inset-0 opacity-10" style={{ backgroundColor: meeting.color }} />
                    <span className="relative z-10">{meeting.icon}</span>
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: meeting.color }}>
                        {idx + 1}
                      </div>
                      <h3 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>{meeting.title}</h3>
                    </div>
                    <p className="text-sm md:text-base font-medium mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                      {meeting.desc}
                    </p>
                  </div>
                  
                  <div className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-50 border border-slate-100 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                    <ChevronLeft className="w-5 h-5 text-slate-400 group-hover:text-indigo-600" />
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* Gamification / Stats Panel */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="flex flex-col gap-6"
          >
            <h2 className="text-2xl font-extrabold flex items-center gap-3" style={{ color: 'var(--color-text)' }}>
              <Trophy className="w-6 h-6" style={{ color: 'var(--color-warning)' }} /> ההישגים שלי
            </h2>
            
            <div className="flex flex-col gap-5 p-6 rounded-3xl border shadow-sm" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
              
              <div className="flex items-center gap-5 p-4 rounded-2xl transition-transform hover:scale-105 cursor-default" style={{ backgroundColor: 'var(--color-surface-2)' }}>
                <div className="w-14 h-14 flex items-center justify-center rounded-xl shadow-inner" style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: 'var(--color-warning)' }}>
                  <Star className="w-7 h-7 fill-current" />
                </div>
                <div>
                  <div className="text-3xl font-black" style={{ color: 'var(--color-text)' }}>1,250</div>
                  <div className="text-sm font-bold uppercase tracking-wider mt-1" style={{ color: 'var(--color-text-secondary)' }}>כוכבים</div>
                </div>
              </div>

              <div className="flex items-center gap-5 p-4 rounded-2xl transition-transform hover:scale-105 cursor-default" style={{ backgroundColor: 'var(--color-surface-2)' }}>
                <div className="w-14 h-14 flex items-center justify-center rounded-xl shadow-inner" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--color-success)' }}>
                  <div className="text-3xl">🔥</div>
                </div>
                <div>
                  <div className="text-3xl font-black" style={{ color: 'var(--color-text)' }}>3 ימים</div>
                  <div className="text-sm font-bold uppercase tracking-wider mt-1" style={{ color: 'var(--color-text-secondary)' }}>רצף למידה</div>
                </div>
              </div>

              {/* Mini progress bar purely for visuals */}
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex justify-between text-xs font-bold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                  <span>התקדמות במסלול</span>
                  <span>45%</span>
                </div>
                <div className="h-3 w-full rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: '45%' }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    className="h-full rounded-full" 
                    style={{ background: 'var(--color-primary)' }} 
                  />
                </div>
              </div>
              
            </div>
          </motion.div>

        </div>
      </div>
    </div>
  );
}
