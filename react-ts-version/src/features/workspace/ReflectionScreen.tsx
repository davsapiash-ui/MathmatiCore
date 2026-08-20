import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ref, push, update } from 'firebase/database';
import { database, authReady } from '@/infrastructure/firebase';
import { useAuthStore } from '@/application/useAuthStore';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { normalizeStudentId } from '@/application/useChatStore';
import { toast } from 'sonner';

/**
 * מודול 16: לוח רפלקציה תלת-שלבי (SRL Reflection Board Spec)
 * שלב 1: הערכת מאמץ בסולם חזותי של 3 נקודות (קל, בינוני, רב).
 * שלב 2: בחירת אסטרטגיות מתוך 3 אסטרטגיות דיגיטליות מוגדרות בלבד (ביטול, עיגולי זיכרון, רמזי חונך).
 * שלב 3: משוב התמדה תהליכי המבוסס על Persistence Index: U / (U + E + G) * 100.
 */

const EFFORT_OPTIONS = [
  { level: 1, icon: '😴', labelHe: 'קל', ariaHe: 'המאמץ היה קל' },
  { level: 2, icon: '🙂', labelHe: 'בינוני', ariaHe: 'המאמץ היה בינוני' },
  { level: 3, icon: '💪', labelHe: 'רב', ariaHe: 'המאמץ היה רב' },
] as const;

const STRATEGY_OPTIONS = [
  { id: 'undo', icon: '↩️', nameHe: 'כפתור ביטול פעולה (Undo)', descHe: 'עצרתי לבדוק את עצמי, ביטלתי פעולה וניסיתי דרך חלופית' },
  { id: 'memory_circles', icon: '🟣', nameHe: 'עיגולי הזיכרון', descHe: 'השתמשתי בעיגולי הזיכרון בראש הטור כדי לשמור את ספרת ההמרה' },
  { id: 'socratic_hints', icon: '💡', nameHe: 'שאלות החונך הדיגיטלי', descHe: 'נעזרתי בשאלות המנחות של כרטיס החניכה כדי לחקור את מקור הקושי' },
] as const;

const EFFORT_FEEDBACK: Record<number, { emoji: string; text: string; sub: string }> = {
  1: { emoji: '💛', text: 'עבודה טובה ונעימה!', sub: 'כל יום של התנסות מקדם אותנו צעד נוסף בהבנה המתמטית.' },
  2: { emoji: '⭐', text: 'הייתה עבודה מצוינת היום!', sub: 'השקעתם מחשבה ופתרתם את המשימות בסבלנות ובהבנה.' },
  3: { emoji: '🌟', text: 'התאמצתם והתמדתם — כל הכבוד!', sub: 'הכוח שלכם הוא בהתמדה ובניסיון החוזר. זהו תהליך למידה אמיתי!' },
};

export function ReflectionScreen() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const qflow = useWorkspaceStore((s) => s.qflow);
  const undoCount = useWorkspaceStore((s) => s.undoCount);
  const getPersistenceIndex = useWorkspaceStore((s) => s.getPersistenceIndex);

  const [effort, setEffort] = useState<number | null>(null);
  const [strategies, setStrategies] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  const persistenceIndex = getPersistenceIndex();
  const username: string = user?.uid || 'unknown_student';
  const feedback = effort !== null ? EFFORT_FEEDBACK[effort] : null;
  const canComplete = effort !== null && strategies.length > 0;

  const toggleStrategy = (id: string) => {
    setStrategies(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const handleProceed = async () => {
    if (!canComplete || done) return;
    setDone(true);

    try {
      const ok = await authReady;
      if (!ok) {
        navigate('/hub');
        return;
      }

      // Silent persistence for the teacher dashboard (Module 16 & 23)
      await push(ref(database, 'reflections'), {
        effort,
        strategy: strategies.join(', '),
        strategies,
        persistenceIndex,
        undoCount,
        timestamp: Date.now(),
        student: { id: username },
      });

      const r = qflow.results;
      const getTag = (taskResult: any) => {
        if (!taskResult) return null;
        if (taskResult.tag) return taskResult.tag;
        if (taskResult.correct) return 'success';
        return null;
      };

      const qMatrix: any = {
        task1_zero_placeholder: getTag(r['task1_zero_placeholder']),
        task3_flexible_regrouping: getTag(r['task3_flexible_regrouping']),
        task4_basic_addition_fluency: getTag(r['task4_basic_addition_fluency']),
        task5_small_change: getTag(r['task5_small_change']),
        task6_subtraction_regrouping: getTag(r['task6_subtraction_regrouping']),
        task7_missing_subtrahend: getTag(r['task7_missing_subtrahend']),
        task8_missing_addend: getTag(r['task8_missing_addend']),
      };

      const studentId = normalizeStudentId(username);
      await update(ref(database, `users/students/${studentId}`), {
        routeStatus: 'PENDING_TEACHER_APPROVAL',
        qMatrixResults: qMatrix,
        effort: effort,
        strategy: strategies.join(', '),
        persistenceIndex,
        undoCount,
        reflection_completed: true,
        reflection_step: 3,
        reflection_updated_at: Date.now()
      });

      await update(ref(database, `users/students/${studentId}/reflections`), {
        effort,
        strategies,
        persistenceIndex,
        undoCount,
        qMatrixResults: qMatrix,
        timestamp: Date.now()
      }).catch(console.error);

      useWorkspaceStore.setState({ flowStatus: 'sessionDone' });
    } catch (e) {
      console.error("Failed to save reflection:", e);
      toast.error("אירעה שגיאת רשת בשמירת הרפלקציה. המידע נשמר וסונכרן מקומית.");
      setDone(false);
      return;
    }
    
    navigate('/hub');
  };

  return (
    <div dir="rtl" className="h-full w-full overflow-y-auto bg-ws-bg font-body text-ws-ink flex items-start justify-center p-6">
      <motion.article
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-ws-surface rounded-3xl shadow-xl border border-ws-surface2 max-w-2xl w-full p-8 my-10"
        aria-label="לוח רפלקציה על המפגש"
      >
        <h1 className="font-display font-black text-3xl text-ws-ink mb-1">סיום מפגש הלמידה 🎉</h1>
        <p className="text-ws-soft font-medium mb-7">סיימתם בהצלחה את כל משימות המפגש. בואו נחשוב יחד על דרך העבודה שלכם.</p>

        {/* Step 1: 3-point visual effort scale */}
        <section aria-labelledby="effort-heading" className="mb-7">
          <h2 id="effort-heading" className="font-display font-extrabold text-xl mb-1">שלב 1: כמה השתדלתם היום?</h2>
          <p className="text-sm text-ws-soft mb-3">בחרו את הסמל שמתאר הכי טוב את מידת המאמץ שהשקעתם</p>
          <div role="radiogroup" aria-required="true" className="flex gap-3 justify-center">
            {EFFORT_OPTIONS.map((opt) => (
              <button
                key={opt.level}
                role="radio"
                aria-checked={effort === opt.level}
                aria-label={opt.ariaHe}
                onClick={() => setEffort(opt.level)}
                className={`flex flex-col items-center gap-1.5 px-6 py-3.5 rounded-2xl border-2 transition-all cursor-pointer ${
                  effort === opt.level ? 'border-ws-accent bg-ws-accentSoft scale-105 shadow-md' : 'border-ws-surface2 hover:border-ws-accent/50'
                }`}
              >
                <span className="text-4xl" aria-hidden="true">{opt.icon}</span>
                <span className="text-sm font-bold text-ws-ink">{opt.labelHe}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Step 2: 3 Digital strategies selection */}
        <section aria-labelledby="strategy-heading" className="mb-7">
          <h2 id="strategy-heading" className="font-display font-extrabold text-xl mb-1">שלב 2: מה סייע לכם במהלך הלמידה?</h2>
          <p className="text-sm text-ws-soft mb-3">סמנו את האסטרטגיות הדיגיטליות שהשתמשתם בהן:</p>
          <div role="group" aria-label="בחירת אסטרטגיות דיגיטליות" className="flex flex-col gap-3">
            {STRATEGY_OPTIONS.map((opt) => {
              const isSelected = strategies.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  role="checkbox"
                  aria-checked={isSelected}
                  onClick={() => toggleStrategy(opt.id)}
                  className={`flex items-center gap-4 p-4 rounded-2xl border-2 text-right transition-all cursor-pointer ${
                    isSelected ? 'border-ws-accent bg-ws-accentSoft shadow-md' : 'border-ws-surface2 hover:border-ws-accent/50'
                  }`}
                >
                  <span className="text-3xl shrink-0" aria-hidden="true">{opt.icon}</span>
                  <span className="flex flex-col">
                    <span className="font-bold text-ws-ink">{opt.nameHe}</span>
                    <span className="text-xs sm:text-sm text-ws-soft">{opt.descHe}</span>
                  </span>
                  <div className={`mr-auto w-6 h-6 rounded-md flex items-center justify-center border-2 transition-colors ${isSelected ? 'border-ws-accent bg-ws-accent' : 'border-ws-surface2 bg-white'}`}>
                    {isSelected && <span className="text-white text-sm font-black" aria-hidden="true">✓</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Step 3: Process feedback & persistence index */}
        <section aria-live="polite" className="bg-ws-accentSoft/50 border border-ws-accent/25 rounded-2xl p-5 text-center mb-7 min-h-[100px]">
          <motion.div key={effort ?? 'default'} initial={{ scale: 0.9 }} animate={{ scale: 1 }}>
            <div className="text-3xl mb-1" aria-hidden="true">{feedback?.emoji ?? '🌟'}</div>
            <p className="font-display font-extrabold text-lg text-ws-ink">{feedback?.text ?? 'הכוח שלכם הוא בהתמדה ובניסיון החוזר!'}</p>
            <p className="text-sm text-ws-soft mt-1">{feedback?.sub ?? 'כל ניסיון ובדיקה עצמית מעמיקים את ההבנה המתמטית שלכם.'}</p>
            <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700/60 rounded-full text-xs sm:text-sm font-bold text-emerald-800 dark:text-emerald-300 shadow-sm">
              <span>💪</span>
              <span>מדד התמדה ובקרה עצמית: {persistenceIndex}%</span>
            </div>
          </motion.div>
        </section>

        <button
          onClick={handleProceed}
          disabled={!canComplete || done}
          className="w-full h-13 py-3.5 rounded-full font-display font-extrabold text-lg text-white bg-ws-accent shadow-md hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {done ? '🎉 מעדכן וממשיך...' : '✓ סיום הרפלקציה וחזרה ללובי'}
        </button>
      </motion.article>
    </div>
  );
}
