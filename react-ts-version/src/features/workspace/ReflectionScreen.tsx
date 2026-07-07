import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ref, push, get } from 'firebase/database';
import { database, authReady } from '@/infrastructure/firebase';
import { useAuthStore } from '@/application/useAuthStore';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';
import { useStore } from '@/application/useStore';
/**
 * מסך רפלקציה (מפגש 2) — port of vanilla_audit/student/reflection.html.
 * דירוג מאמץ באייקונים בלבד (ללא ציונים מספריים!), בחירת אסטרטגיה מאוירת,
 * ומשוב תהליכי מעודד התמדה. הנתונים נשמרים בשקט לדשבורד המורה.
 */

const EFFORT_OPTIONS = [
  { level: 1, icon: '😴', labelHe: 'מעט', ariaHe: 'התאמצתי מעט' },
  { level: 2, icon: '🙂', labelHe: 'בינוני', ariaHe: 'התאמצתי בינוני' },
  { level: 3, icon: '💪', labelHe: 'הרבה', ariaHe: 'התאמצתי הרבה' },
  { level: 4, icon: '🚀', labelHe: 'מאוד!', ariaHe: 'התאמצתי מאוד מאוד' },
] as const;

const STRATEGY_OPTIONS = [
  { id: 'blocks', icon: '🟨', nameHe: 'השתמשתי בקוביות להמחשה', descHe: 'גררתי עשרות ויחידות לטבלה כדי להבין את הכמויות טוב יותר' },
  { id: 'hints', icon: '💡', nameHe: 'היעזרתי בתמיכה', descHe: 'לחצתי על "בדוק אותי" או ביקשתי עזרה כשהרגשתי תקוע' },
  { id: 'undo', icon: '↩️', nameHe: 'בדיקה עצמית ותיקון', descHe: 'עצרתי לבדוק את עצמי, לחצתי על "בטל" וניסיתי דרך אחרת' },
  { id: 'mental', icon: '🧠', nameHe: 'חישוב בראש', descHe: 'פתרתי את רוב התרגילים בעזרת חשיבה והבנה ללא עזרים' },
  { id: 'paper', icon: '📝', nameHe: 'עבודה בצד', descHe: 'עזר לי מאוד לכתוב ולפתור על דף טיוטה לפני שהקלדתי' },
] as const;

const EFFORT_FEEDBACK: Record<number, { emoji: string; text: string; sub: string }> = {
  1: { emoji: '💛', text: 'טוב שבאתם וניסיתם!', sub: 'כל יום שמנסים — הוא יום שלומדים. בפגישה הבאה נמשיך ביחד.' },
  2: { emoji: '⭐', text: 'הייתה עבודה טובה היום!', sub: 'כל פעם שחשבתם — המוח שלכם התחזק. כך לומדים!' },
  3: { emoji: '🌟', text: 'התאמצתם מאוד — זה ניכר!', sub: 'הכוח שלכם הוא בהתמדה ובניסיון חוזר. המשיכו כך!' },
  4: { emoji: '🚀', text: 'עבודה מדהימה! אתם מתמטיקאים אמיתיים!', sub: 'מאמץ כזה בונה הבנה עמוקה. אנחנו גאים בכם!' },
};

export function ReflectionScreen() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const qflow = useWorkspaceStore((s) => s.qflow);

  const [effort, setEffort] = useState<number | null>(null);
  const [strategies, setStrategies] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  const studentName: string = (user?.displayName as string) || 'תלמיד';
  // uid is the ONE canonical identity field (Login stores {uid, role, displayName}).
  // The old user.username read was always undefined → every student wrote to 'unknown_student'.
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

      // Silent persistence for the teacher dashboard (best-effort; vanilla completeReflection).
      await push(ref(database, 'reflections'), {
        effort,
        strategies,
        timestamp: Date.now(),
        student: username,
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
        task2_estimation_error_margin: getTag(r['task2_estimation_error_margin']),
        task3_flexible_regrouping: getTag(r['task3_flexible_regrouping']),
        task4_basic_addition_fluency: getTag(r['task4_basic_addition_fluency']),
        task5_small_change: getTag(r['task5_small_change']),
        task6_subtraction_regrouping: getTag(r['task6_subtraction_regrouping']),
        task7_missing_subtrahend: getTag(r['task7_missing_subtrahend']),
        task8_missing_addend: getTag(r['task8_missing_addend']),
      };

      // State persistence is already handled by useWorkspaceStore.ts (via useStore and FirebaseSyncService)
      // right before transitioning to the reflection screen.

      // AI Generation: generate tasks 3-7 based on diagnostic and queue for teacher approval.
      // Only run if the student actually completed the Q-Matrix tasks (has non-null results).
      const hasRealQMatrixData = Object.values(qMatrix).some(v => v !== null && v !== undefined);
      if (hasRealQMatrixData) {

        let resolvedTeacherId = '039604483'; // Safe fallback — the known teacher
        try {
          // 1. Read the student's classId from Firebase (source of truth)
          const studentSnap = await get(ref(database, `users/students/${username}`));
          const classId = studentSnap.val()?.classId;
          // 2. Read the class's teacherId from Firebase
          if (classId) {
            const classSnap = await get(ref(database, `classes/${classId}`));
            const fbTeacherId = classSnap.val()?.teacherId;
            if (fbTeacherId) resolvedTeacherId = fbTeacherId;
          }
        } catch {
          // Fallback already set above — safe to continue
        }
        const store = useStore.getState();
        const studentTraceData = store.students[username]?.traceData || { hesitation_events: 0, undo_clicks: 0 };
        const combinedStrategyString = strategies.map(id => STRATEGY_OPTIONS.find(o => o.id === id)?.nameHe).join(', ');
        await SocraticEngine.generateAndQueueTasks(username, studentName, resolvedTeacherId, qMatrix, studentTraceData, effort, combinedStrategyString);
      }
    } catch (e) {
      console.error("Failed to save reflection:", e);
    }
    
    navigate('/hub');
  };

  return (
    <div dir="rtl" className="min-h-screen w-full overflow-y-auto bg-ws-bg font-body text-ws-ink flex items-start justify-center p-6">
      <motion.article
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-ws-surface rounded-3xl shadow-xl border border-ws-surface2 max-w-2xl w-full p-8 my-10"
        aria-label="רפלקציה על המפגש"
      >
        <h1 className="font-display font-black text-3xl text-ws-ink mb-1">כל הכבוד, {studentName}! 🎉</h1>
        <p className="text-ws-soft font-medium mb-7">סיימתם את כל המשימות של היום. רגע לפני שממשיכים — בואו נחשוב יחד על הדרך.</p>

        {/* Effort rating — icons only, never numbers */}
        <section aria-labelledby="effort-heading" className="mb-7">
          <h2 id="effort-heading" className="font-display font-extrabold text-xl mb-1">כמה השתדלתם היום?</h2>
          <p className="text-sm text-ws-soft mb-3">בחרו את האייקון שמתאר הכי טוב את המאמץ שהשקעתם</p>
          <div role="radiogroup" aria-required="true" className="flex gap-3 justify-center">
            {EFFORT_OPTIONS.map((opt) => (
              <button
                key={opt.level}
                role="radio"
                aria-checked={effort === opt.level}
                aria-label={opt.ariaHe}
                onClick={() => setEffort(opt.level)}
                className={`flex flex-col items-center gap-1 px-5 py-3 rounded-2xl border-2 transition-all ${
                  effort === opt.level ? 'border-ws-accent bg-ws-accentSoft scale-105 shadow-md' : 'border-ws-surface2 hover:border-ws-accent/50'
                }`}
              >
                <span className="text-4xl" aria-hidden="true">{opt.icon}</span>
                <span className="text-sm font-bold text-ws-soft">{opt.labelHe}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Strategy selection — illustrated choices */}
        <section aria-labelledby="strategy-heading" className="mb-7">
          <h2 id="strategy-heading" className="font-display font-extrabold text-xl mb-1">מה עזר לכם להצליח היום?</h2>
          <p className="text-sm text-ws-soft mb-3">אפשר לסמן יותר מאפשרות אחת</p>
          <div role="group" aria-label="בחירת אסטרטגיות" className="flex flex-col gap-3">
            {STRATEGY_OPTIONS.map((opt) => {
              const isSelected = strategies.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  role="checkbox"
                  aria-checked={isSelected}
                  onClick={() => toggleStrategy(opt.id)}
                  className={`flex items-center gap-4 p-4 rounded-2xl border-2 text-right transition-all ${
                    isSelected ? 'border-ws-accent bg-ws-accentSoft shadow-md' : 'border-ws-surface2 hover:border-ws-accent/50'
                  }`}
                >
                  <span className="text-3xl shrink-0" aria-hidden="true">{opt.icon}</span>
                  <span className="flex flex-col">
                    <span className="font-bold text-ws-ink">{opt.nameHe}</span>
                    <span className="text-sm text-ws-soft">{opt.descHe}</span>
                  </span>
                  <div className={`mr-auto w-6 h-6 rounded-md flex items-center justify-center border-2 transition-colors ${isSelected ? 'border-ws-accent bg-ws-accent' : 'border-ws-surface2 bg-white'}`}>
                    {isSelected && <span className="text-white text-sm font-black" aria-hidden="true">✓</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Process feedback — encourages persistence, never a score */}
        <section aria-live="polite" className="bg-ws-accentSoft/50 border border-ws-accent/25 rounded-2xl p-5 text-center mb-7 min-h-[100px]">
          <motion.div key={effort ?? 'default'} initial={{ scale: 0.9 }} animate={{ scale: 1 }}>
            <div className="text-3xl mb-1" aria-hidden="true">{feedback?.emoji ?? '🌟'}</div>
            <p className="font-display font-extrabold text-lg text-ws-ink">{feedback?.text ?? 'הכוח שלכם הוא בהתמדה ובניסיון שוב ושוב!'}</p>
            <p className="text-sm text-ws-soft mt-1">{feedback?.sub ?? 'כל פעם שניסיתם שוב — הדמיון שלכם גדל. זה המתמטיקאי הטוב ביותר שיכול להיות.'}</p>
          </motion.div>
        </section>

        <button
          onClick={handleProceed}
          disabled={!canComplete || done}
          className="w-full h-13 py-3.5 rounded-full font-display font-extrabold text-lg text-white bg-ws-accent shadow-md hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {done ? '🎉 ממשיכים...' : '✓ סיימתי — יאללה להמשיך!'}
        </button>
      </motion.article>
    </div>
  );
}
