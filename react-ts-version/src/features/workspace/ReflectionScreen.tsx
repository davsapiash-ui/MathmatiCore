import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ref, push, set } from 'firebase/database';
import { database, authReady } from '@/infrastructure/firebase';
import { useAuthStore } from '@/application/useAuthStore';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { TASKS } from '@/core/QMatrix';

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
  { id: 'blocks', icon: '🟨', nameHe: 'השתמשתי בקוביות של טבלת הטורים', descHe: 'גררתי קוביות ועשרות לטבלה כדי לחשוב' },
  { id: 'hints', icon: '💡', nameHe: 'ביקשתי עזרה מהחונך הדיגיטלי', descHe: 'לחצתי על כפתור העזרה כשלא הצלחתי לבד' },
  { id: 'undo', icon: '↩️', nameHe: 'עצרתי ובדקתי את עצמי', descHe: 'לחצתי על "בטל" כדי לנסות שוב בצורה אחרת' },
] as const;

const EFFORT_FEEDBACK: Record<number, { emoji: string; text: string; sub: string }> = {
  1: { emoji: '💛', text: 'טוב שבאת ונסית!', sub: 'כל יום שמנסים — הוא יום שלומדים. בפגישה הבאה נמשיך ביחד.' },
  2: { emoji: '⭐', text: 'הייתה עבודה טובה היום!', sub: 'כל פעם שחשבתם — המוח שלכם התחזק. כך לומדים!' },
  3: { emoji: '🌟', text: 'התאמצתם מאוד — זה ניכר!', sub: 'הכוח שלכם הוא בהתמדה ובניסיון חוזר. המשיכו כך!' },
  4: { emoji: '🚀', text: 'עבודה מדהימה! אתם מתמטיקאים אמיתיים!', sub: 'מאמץ כזה בונה הבנה עמוקה. אנחנו גאים בכם!' },
};

export function ReflectionScreen() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const qflow = useWorkspaceStore((s) => s.qflow);
  const undoCount = useWorkspaceStore((s) => s.undoCount);

  const [effort, setEffort] = useState<number | null>(null);
  const [strategy, setStrategy] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const studentName: string = user?.displayName || 'תלמיד';
  // uid is the ONE canonical identity field (Login stores {uid, role, displayName}).
  // The old user.username read was always undefined → every student wrote to 'unknown_student'.
  const username: string = user?.uid || 'unknown_student';
  const feedback = effort !== null ? EFFORT_FEEDBACK[effort] : null;
  const canComplete = effort !== null && strategy !== null;

  const complete = () => {
    if (!canComplete || done) return;
    setDone(true);

    // Silent persistence for the teacher dashboard (best-effort; vanilla completeReflection).
    // Gated on authReady: writes fired before the sign-in completes are rejected
    // by the locked rules — this race silently swallowed real diagnostics.
    authReady.then((ok) => {
    if (!ok) return;
    try {
      push(ref(database, 'reflections'), {
        effort,
        strategy,
        timestamp: Date.now(),
        student: username,
      }).catch(() => {});

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
          task5_small_change: getTag(r['q5_small_change']) || getTag(r['task5_small_change']),
          task6_subtraction_regrouping: getTag(r['task6_subtraction_regrouping']),
          task7_missing_subtrahend: getTag(r['task7_missing_subtrahend']),
          task8_missing_addend: getTag(r['task8_missing_addend']),
      };

      update(ref(database, `users/students/${username}`), {
        qMatrixResults: qMatrix,
        traceData: {
          hesitation_events: useWorkspaceStore.getState().hesitationCount,
          undo_clicks: undoCount,
        },
      });

      // AI Generation: generate tasks 3-7 based on diagnostic and queue for teacher approval
      import('@/infrastructure/services/SocraticEngine').then(({ SocraticEngine }) => {
        // We pass the student's actual classId as the teacherId to route it correctly
        const classId = user?.classId || "live";
        const targetTeacherId = classId === "live" ? "teacher-1" : classId;
        SocraticEngine.generateAndQueueTasks(username, studentName, targetTeacherId, qMatrix);
      });
    } catch (e) {
      console.error("Failed to save reflection:", e);
    }
    }).catch(e => console.error("authReady error:", e));
    void TASKS;

    window.setTimeout(() => navigate('/hub'), 900);
  };

  return (
    <div dir="rtl" className="h-screen w-full overflow-y-auto bg-ws-bg font-body text-ws-ink flex items-start justify-center p-6">
      <motion.article
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-ws-surface rounded-3xl shadow-xl border border-ws-surface2 max-w-2xl w-full p-8 my-auto"
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
          <h2 id="strategy-heading" className="font-display font-extrabold text-xl mb-3">מה עזר לך להצליח היום?</h2>
          <div role="radiogroup" aria-required="true" className="flex flex-col gap-3">
            {STRATEGY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                role="radio"
                aria-checked={strategy === opt.id}
                onClick={() => setStrategy(opt.id)}
                className={`flex items-center gap-4 p-4 rounded-2xl border-2 text-right transition-all ${
                  strategy === opt.id ? 'border-ws-accent bg-ws-accentSoft shadow-md' : 'border-ws-surface2 hover:border-ws-accent/50'
                }`}
              >
                <span className="text-3xl shrink-0" aria-hidden="true">{opt.icon}</span>
                <span className="flex flex-col">
                  <span className="font-bold text-ws-ink">{opt.nameHe}</span>
                  <span className="text-sm text-ws-soft">{opt.descHe}</span>
                </span>
                {strategy === opt.id && <span className="mr-auto text-ws-accent font-black text-xl" aria-hidden="true">✓</span>}
              </button>
            ))}
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
          onClick={complete}
          disabled={!canComplete || done}
          className="w-full h-13 py-3.5 rounded-full font-display font-extrabold text-lg text-white bg-ws-accent shadow-md hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {done ? '🎉 ממשיכים...' : '✓ סיימתי — יאללה להמשיך!'}
        </button>
      </motion.article>
    </div>
  );
}
