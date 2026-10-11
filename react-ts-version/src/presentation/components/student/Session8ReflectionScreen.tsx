import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckSquare, Square, CircleDot, HelpCircle, ArrowLeft, Loader2 } from 'lucide-react';
import type { SRLReflectionResult } from '@/core/srlReflection';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';
import { encouragementSentenceHe, persistenceIndexPercent, splitEncouragement } from '@/core/persistenceEncouragement';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { PROCEED_HE } from '@/core/toolbarNames';

interface Session8ReflectionScreenProps {
  /**
   * מקבל את שלושת שלבי הרפלקציה במלואם. עד כה הועברה רק רמת המאמץ, תחת
   * השם focusArea, והיא נכתבה לשדה צבע המסלול — כך שכל השאר אבד.
   * מחזיר false כשהשמירה לא הצליחה: הלוח נשאר בשלב 3 עם אותן תשובות, כפתור
   * הסיום פעיל שוב, ומתחתיו ההודעה notSaved עם כפתור הקראה — הרפלקציה אינה נזרקת.
   */
  onComplete: (result: SRLReflectionResult) => void | Promise<boolean | void>;
  metrics?: {
    fastestTaskType?: string;
    slowestTaskType?: string;
    undoCount?: number;
    errorCount?: number;
    guessCount?: number;
  };
}

type EffortId = 'EASY' | 'MEDIUM' | 'HARD';

/**
 * כל מה שהילד רואה ושומע במסך. הנוסחים של מסמך 03 §3.8, "מסך הרפלקציה
 * האישי התלת שלבי"; ההתנהגות של PRD מודול 16 §ג.
 *
 * שלב 1 — PRD v7.9 מודול 16 §ג: "בחירה מתוך 3 סמלים חזותיים (מאמץ קל, בינוני,
 * רב)". על המסך שלושה סמלים של סרגל עולה (פס אחד, שניים, שלושה), ומתחת לכל
 * סמל שמו: "מאמץ קל", "מאמץ בינוני", "מאמץ רב". אותו שם נשמע בהקראה ומשמש שם
 * נגיש לכל כפתור. (מסמך 03 כתב "קל / מתאים / מאתגר" בלי מילים; ה-PRD גובר.)
 *
 * שלב 2 — שלוש האסטרטגיות בסדר של המרשם (שורה 10): כפתור ביטול פעולה,
 * עיגולי הזיכרון, כרטיס החניכה (PRD 7.15, מודול 16 §ג). אפשר לסמן כמה (מסמך 03: "לסמן כל
 * תשובה מתאימה מתוך שלוש").
 *
 * שלב 3 — משפט עידוד אחד מתוך ארבעה, שנבחר לפי מדד ההתמדה של מפגש 8
 * עצמו, וכפתור הסיום (החלטות בעל המוצר E1 ו-E2, 27.9.2026, מרשם הסטיות,
 * סטייה 24; core/persistenceEncouragement.ts). המדד רק בוחר את המשפט: הוא
 * אינו מוצג לילד ואינו מוקרא לו, ואין על המסך מספר, ציון או דירוג (סטייה
 * 23). המדד מחושב ונשמר כרגיל, והמורה רואה אותו.
 *
 * אין מילים באנגלית, והפנייה בגוף שני רבים.
 */
export const REFLECTION_TEXT_HE = {
  stepLabel: (n: 1 | 2 | 3) => `שלב ${n} מתוך 3`,
  stepLabelSpoken: { 1: 'שלב ראשון מתוך שלושה.', 2: 'שלב שני מתוך שלושה.', 3: 'שלב שלישי מתוך שלושה.' } as const,
  effortQuestion: 'כמה מאמץ והשתדלות השקעתם היום בפתרון התרגילים?',
  effortInstruction: 'בחרו רמה אחת.',
  // Owner, 4.10.2026: without "הכי הרבה" — it contradicted "אפשר לסמן יותר
  // מתשובה אחת" under it.
  strategyQuestion: 'מה עזר לכם להצליח היום בפתרון התרגילים?',
  strategyInstruction: 'אפשר לסמן יותר מתשובה אחת.',
  // The name of the toolbar's button, one name for one action (owner, 4.10.2026; until then "המשיכו").
  next: PROCEED_HE,
  back: 'חזרה',
  // Inside the workspace the child reads "תחנה", not "מפגש" (register, deviation 24(ג)).
  finish: 'סיום התחנה',
  // The finish button while the reflection is being stored: the same form as
  // "יוצאים…" on the exit button (core/toolbarNames.ts), so the child sees
  // that something is happening.
  saving: 'שומרים…',
  // Shown only when the reflection could not even be stored in the offline
  // queue on this device: it says what to do — press the same button again,
  // or ask the teacher. It stays in stage 3, under the button, with a
  // read-aloud button (PRD Module 7: every instruction has one), not in a
  // toast that disappears by itself.
  notSaved: 'השמירה לא הצליחה. לחצו שוב על "סיום התחנה". אם זה לא עוזר, בקשו עזרה מהמורה.',
  // The same, read aloud: without the quote marks.
  notSavedSpoken: 'השמירה לא הצליחה. לחצו שוב על סיום התחנה. אם זה לא עוזר, בקשו עזרה מהמורה.',
} as const;

/**
 * שלוש רמות המאמץ: סמל חזותי, ומתחתיו השם של PRD v7.9 מודול 16 §ג ("מאמץ קל,
 * בינוני, רב"). אותו שם נקרא בקול ומשמש שם נגיש לכפתור. ה-PRD גובר על מסמך 03
 * ("קל / מתאים / מאתגר", בלי מילים).
 */
export const EFFORT_LEVELS: ReadonlyArray<{ id: EffortId; bars: 1 | 2 | 3; spokenHe: string }> = [
  { id: 'EASY', bars: 1, spokenHe: 'מאמץ קל' },
  { id: 'MEDIUM', bars: 2, spokenHe: 'מאמץ בינוני' },
  { id: 'HARD', bars: 3, spokenHe: 'מאמץ רב' },
];

/**
 * מזהי האסטרטגיות נשמרים כפי שהיו (core/srlReflection.ts ממפה אותם).
 * החלטת בעל המוצר, 4.10.2026: שמות הכלים בלבד, כפי שהם נקראים במסכים — בלי
 * משפט זיקה שמכניס לסימון אחד גם כלי וגם סיבה ("…שאיפשר לי לתקן טעויות
 * בביטחון וברוגע").
 */
export const STRATEGY_OPTIONS = [
  // The label names the button by its arrow, as the PRD writes it (Module 16 §ג): no second arrow beside it.
  { id: 'undo', label: 'כפתור ביטול הפעולה ↺', icon: null },
  { id: 'memory', label: 'עיגולי הזיכרון', icon: CircleDot },
  { id: 'hints', label: 'כרטיס החניכה', icon: HelpCircle },
] as const;

/**
 * מה שנקרא בקול בכל שלב — כל הנחיה שעל המסך, וגם שמות הרמות שאין להן מילים
 * על המסך. בשלב 3: משפט העידוד שנבחר, כפי שהוא מוצג.
 */
export function reflectionSpeech(step: 1 | 2 | 3, encouragement = ''): string {
  const t = REFLECTION_TEXT_HE;
  if (step === 1) {
    return [t.stepLabelSpoken[1], t.effortQuestion, t.effortInstruction, ...EFFORT_LEVELS.map((l) => `${l.spokenHe}.`)].join(' ');
  }
  if (step === 2) {
    return [t.stepLabelSpoken[2], t.strategyQuestion, t.strategyInstruction, ...STRATEGY_OPTIONS.map((o) => `${o.label}.`)].join(' ');
  }
  return [t.stepLabelSpoken[3], encouragement].join(' ').trim();
}

/**
 * The steps change by opacity alone, 200 ms (PRD Module 7 rule 8; owner,
 * 11.10.2026): no slide, no zoom.
 */
const STEP_FADE = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.2 } };

/** סרגל קווי: שלושה פסים בגובה עולה, ו-`filled` מהם צבועים. */
function EffortBars({ filled }: { filled: 1 | 2 | 3 }) {
  // Three bars of rising height (מסמך 04: "שלושה פסים בגובה עולה"). The first
  // used to be as wide as it was high, and its rounding made it a dot.
  const heights = ['h-6', 'h-9', 'h-12'];
  return (
    <span aria-hidden="true" className="flex items-end justify-center gap-1.5 h-12">
      {heights.map((h, i) => (
        <span
          key={h}
          className={`w-3 rounded-sm ${h} ${i < filled ? 'bg-ws-accent' : 'bg-ws-surface2'}`}
        />
      ))}
    </span>
  );
}

/**
 * מודול 16: לוח רפלקציה תלת־שלבי בסיום מפגש 8.
 * שלב 1: הערכת מאמץ. שלב 2: בחירת אסטרטגיות. שלב 3: משפט עידוד שנבחר לפי
 * מדד ההתמדה (U / (U + E + G)) * 100 של המפגש. המדד נשמר למורה, והילד רואה
 * רק את המשפט.
 * ללא חלונות קופצים, אפס PII.
 */
export function Session8ReflectionScreen({ onComplete, metrics }: Session8ReflectionScreenProps) {
  // The stage and the answers live in the workspace store (reflectionDraft),
  // which is saved with the meeting: a reload returns to the same stage with
  // the same answers (Module 16 §ב, Module 17).
  const step = useWorkspaceStore((s) => s.reflectionDraft.step);
  const effortLevel = useWorkspaceStore((s) => s.reflectionDraft.effortLevel) as EffortId | null;
  const selectedStrategies = useWorkspaceStore((s) => s.reflectionDraft.strategies);
  const setStep = useWorkspaceStore((s) => s.setReflectionStep);
  const setEffortLevel = useWorkspaceStore((s) => s.setReflectionEffort);
  const toggleStrategy = useWorkspaceStore((s) => s.toggleReflectionStrategy);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // The last press of "סיום התחנה" could not store the reflection.
  const [notSaved, setNotSaved] = useState(false);
  // The state disables the button on the next render; the ref also stops a
  // second click that lands before that render (a double click, a held key),
  // whose handler still sees isSubmitting === false.
  const submittingRef = useRef(false);
  const t = REFLECTION_TEXT_HE;

  // Stage C: Persistence Metric Calculation: (U / (U + E + G)) * 100 (default 100% on zero denominator)
  const U = Math.max(0, metrics?.undoCount || 0);
  const E = Math.max(0, metrics?.errorCount || 0);
  const G = Math.max(0, metrics?.guessCount || 0);
  const persistenceRatio = persistenceIndexPercent({ undos: U, wrongDigits: E, wrongOptions: G });
  // E1: the index only chooses the sentence; the child never sees the index.
  const encouragement = encouragementSentenceHe({ undos: U, wrongDigits: E, wrongOptions: G });
  const { title: encouragementTitle, body: encouragementBody } = splitEncouragement(encouragement);

  const handleComplete = () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setNotSaved(false);
    const release = () => {
      submittingRef.current = false;
      setIsSubmitting(false);
      setNotSaved(true);
    };
    // The executor runs at once, so onComplete is called in this click; a
    // synchronous throw becomes a rejection like an asynchronous one.
    new Promise<boolean | void>((resolve) => resolve(onComplete({
      effortLevel,
      strategies: selectedStrategies,
      persistenceIndex: persistenceRatio,
      undoCount: U,
      errorCount: E,
      guessCount: G,
    }))).then(
      (done) => {
        if (done === false) release();
      },
      // A save that threw is a save that failed: the button works again.
      release,
    );
  };

  return (
    // The station's calm colours, like the finish screen (owner, 11.10.2026):
    // the student area's background and one still card — no dark blurred
    // backdrop, no zoom, no trophy.
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ws-bg text-ws-ink p-4 font-body" dir="rtl">
      <div className="max-w-2xl w-full bg-ws-surface border-2 border-ws-surface2 rounded-3xl p-6 md:p-10 shadow-sm relative overflow-hidden">
        <AnimatePresence mode="wait">
          {/* שלב 1: הערכת מאמץ — סמל חזותי ושם (PRD מודול 16 §ג) */}
          {step === 1 && (
            <motion.div
              key="step1"
              {...STEP_FADE}
              className="flex flex-col items-center text-center gap-6"
            >
              <div>
                <span className="text-sm font-black text-ws-soft block mb-1">{t.stepLabel(1)}</span>
                <div className="flex items-center justify-center gap-3">
                  <h1 className="text-2xl md:text-3xl font-display font-black text-ws-ink">
                    {t.effortQuestion}
                  </h1>
                  <UdlSpeechButton text={reflectionSpeech(1)} className="shrink-0" />
                </div>
                <p className="text-ws-soft text-sm mt-1">{t.effortInstruction}</p>
              </div>

              <div className="grid grid-cols-3 gap-4 w-full pt-2" role="group" aria-label={t.effortQuestion}>
                {EFFORT_LEVELS.map((level) => (
                  <button
                    key={level.id}
                    type="button"
                    onClick={() => setEffortLevel(level.id)}
                    aria-label={level.spokenHe}
                    aria-pressed={effortLevel === level.id}
                    title={level.spokenHe}
                    className={`flex flex-col items-center justify-center gap-2 p-5 rounded-2xl border-2 transition-all cursor-pointer ${
                      effortLevel === level.id
                        ? 'border-ws-accent bg-ws-accentSoft shadow-sm'
                        : 'border-ws-surface2 bg-ws-bg hover:border-ws-accent/60'
                    }`}
                  >
                    <EffortBars filled={level.bars} />
                    <span aria-hidden="true" className="text-sm font-extrabold text-ws-ink">{level.spokenHe}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={!effortLevel}
                onClick={() => setStep(2)}
                className="mt-4 px-8 py-3.5 bg-ws-accent hover:bg-ws-accent/90 text-white font-extrabold text-base rounded-2xl shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
              >
                <span>{t.next}</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {/* שלב 2: מה עזר לכם — שלוש אסטרטגיות, אפשר לסמן כמה */}
          {step === 2 && (
            <motion.div
              key="step2"
              {...STEP_FADE}
              className="flex flex-col items-center text-center gap-6"
            >
              <div>
                <span className="text-sm font-black text-ws-soft block mb-1">{t.stepLabel(2)}</span>
                <div className="flex items-center justify-center gap-3">
                  <h1 className="text-2xl md:text-3xl font-display font-black text-ws-ink">
                    {t.strategyQuestion}
                  </h1>
                  <UdlSpeechButton text={reflectionSpeech(2)} className="shrink-0" />
                </div>
                <p className="text-ws-soft text-sm mt-1">{t.strategyInstruction}</p>
              </div>

              <div className="flex flex-col gap-3 w-full text-right pt-2">
                {STRATEGY_OPTIONS.map((strat) => {
                  const Icon = strat.icon;
                  const isChecked = selectedStrategies.includes(strat.id);

                  return (
                    <button
                      key={strat.id}
                      type="button"
                      role="checkbox"
                      aria-checked={isChecked}
                      onClick={() => toggleStrategy(strat.id)}
                      className={`p-4 rounded-2xl border-2 transition-all flex items-center justify-between gap-4 cursor-pointer text-right ${
                        isChecked
                          ? 'border-ws-accent bg-ws-accentSoft shadow-sm'
                          : 'border-ws-surface2 bg-ws-bg hover:border-ws-accent/60'
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        {Icon ? (
                          <div className={`p-2 rounded-xl ${isChecked ? 'bg-ws-accent text-white' : 'bg-ws-surface2 text-ws-soft'}`}>
                            <Icon className="w-5 h-5" />
                          </div>
                        ) : (
                          // Keeps the three labels aligned.
                          <div className="w-9 h-9 shrink-0" aria-hidden="true" />
                        )}
                        <span className="font-bold text-sm text-ws-ink">
                          {strat.label}
                        </span>
                      </div>

                      <div className="text-ws-accent shrink-0">
                        {isChecked ? <CheckSquare className="w-6 h-6 fill-ws-accentSoft" /> : <Square className="w-6 h-6 text-ws-soft" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-3 w-full mt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="py-3.5 px-6 rounded-2xl bg-ws-surface2 text-ws-ink font-bold text-sm hover:bg-ws-surface2/80 transition-colors cursor-pointer"
                >
                  {t.back}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="flex-1 py-3.5 px-8 bg-ws-accent hover:bg-ws-accent/90 text-white font-extrabold text-base rounded-2xl shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>{t.next}</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* שלב 3: משוב חיובי מעודד התמדה וכפתור הסיום — בלי אחוז */}
          {step === 3 && (
            <motion.div
              key="step3"
              {...STEP_FADE}
              className="flex flex-col items-center text-center gap-6"
            >
              <div>
                <span className="text-sm font-black text-ws-soft block mb-1">{t.stepLabel(3)}</span>
                <div className="flex items-center justify-center gap-3">
                  <h1 className="text-2xl md:text-3xl font-display font-black text-ws-ink">
                    {encouragementTitle}
                  </h1>
                  <UdlSpeechButton text={reflectionSpeech(3, encouragement)} className="shrink-0" />
                </div>
                {encouragementBody && (
                  <p className="text-ws-soft text-base mt-2 max-w-md leading-relaxed">
                    {encouragementBody}
                  </p>
                )}
              </div>


              {/* While the reflection is stored the button says so ("שומרים…"
                  with a turning icon; the words stay when motion is reduced)
                  and is busy for a screen reader. */}
              <button
                type="button"
                onClick={handleComplete}
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                className="w-full py-4 bg-ws-accent hover:bg-ws-accent/90 text-white font-extrabold text-base rounded-2xl shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-2 mt-2 disabled:cursor-wait disabled:opacity-80 disabled:hover:bg-ws-accent"
              >
                {/* No award icon (owner, 11.10.2026): the button is its words. */}
                {isSubmitting && <Loader2 aria-hidden="true" className="w-5 h-5 animate-spin" />}
                <span>{isSubmitting ? t.saving : t.finish}</span>
              </button>
              {notSaved && (
                <div className="flex items-center justify-center gap-3 -mt-2">
                  <p role="alert" className="text-sm font-bold text-ws-ink">{t.notSaved}</p>
                  <UdlSpeechButton text={t.notSavedSpoken} className="shrink-0" />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
