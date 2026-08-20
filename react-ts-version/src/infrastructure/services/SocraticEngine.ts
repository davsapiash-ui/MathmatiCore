import { ref, push, set, get, remove, serverTimestamp, update } from "firebase/database";
import { database, functions, authReady } from "@/infrastructure/firebase";
import { httpsCallable } from "firebase/functions";
import type { SessionTask } from "@/data/sessionTasks";
import type { QMatrixResults } from "@/core/QMatrix";
import { AuditLogger } from "@/infrastructure/services/AuditLogger";
import type { GeminiSocraticRequest, GeminiSocraticResponse, GeminiSocraticOption } from "@/types";
import type { TelemetryEventType, TelemetryPayload } from "@/types/telemetry";

export type { GeminiSocraticRequest, GeminiSocraticResponse, GeminiSocraticOption };

async function ready(): Promise<void> {
  await authReady;
}

export interface SocraticChoice {
  id: string;
  textHe: string;
  isCorrect?: boolean;
  hint?: string;
  feedbackHe?: string;
}

export interface SocraticHintResponse {
  pedagogical_intent?: "conceptual" | "procedural" | "focus";
  tts_text?: string;
  suggested_highlight?: string | null;
  questionHe: string;
  choices: SocraticChoice[];
  correctChoiceId?: string;
}

export interface PendingAIApproval {
  id: string;
  studentId: string;
  studentName: string;
  timestamp: number;
  tasks: SessionTask[];
  macroBlueprintHe: string;
  microBlueprintHe: string;
  targetSession: string;
}

// ─────────────────────────────────────────────────────────────
// TASK-LEVEL SOCRATIC HINT MAP
// Each entry is keyed by task ID (exact match from sessionTasks.ts).
// The hints must address ONLY what is pedagogically required in that task.
// ─────────────────────────────────────────────────────────────
const TASK_HINTS: Record<string, SocraticHintResponse> = {

  // ── Session 1 ──────────────────────────────────────────────

  // Task: ארגז חול — גרירת 5 פריטים + מחיקת 1 בפח
  // DO NOT show Socratic coach for this task (handled in requestHelp)
  // This entry exists only as a fallback safety net
  's1_sandbox_controlled': {
    pedagogical_intent: "procedural",
    tts_text: "גרור לפחות 5 פריטים לבית המספרים ומחק פריט אחד לפח המחזור.",
    suggested_highlight: "tour-place-value-board",
    questionHe: "מה צריך לעשות כדי שכפתור 'התקדם' יידלק?",
    choices: [
      { id: "opt_1", textHe: "לגרור לפחות 5 פריטים לבית המספרים ולמחוק פריט אחד לפח" },
      { id: "opt_2", textHe: "להקליד מספר בתיבת התשובה" },
      { id: "opt_3", textHe: "ללחוץ על כפתור סיום ישירות" }
    ],
    correctChoiceId: "opt_1"
  },

  // Task: בניית מספרים עגולים — 420 = 4 מאות + 2 עשרות
  's1_license_test': {
    pedagogical_intent: "conceptual",
    tts_text: "בנו את 420: ארבעה בלוקים בטור המאות ושניים בטור העשרות.",
    suggested_highlight: "tour-column-hundreds",
    questionHe: "כיצד מייצגים את המספר 420 בבית המספרים?",
    choices: [
      { id: "opt_1", textHe: "4 בלוקים בטור המאות + 2 בלוקים בטור העשרות" },
      { id: "opt_2", textHe: "42 קוביות בטור היחידות" },
      { id: "opt_3", textHe: "4 בלוקים בטור העשרות + 2 בטור היחידות" }
    ],
    correctChoiceId: "opt_1"
  },

  // Task: תרגול חיבור בלי המרות — 240 + 135
  's1_t7': {
    pedagogical_intent: "conceptual",
    tts_text: "בנו את שני המספרים בטבלה וספרו כל טור בנפרד: מאות, עשרות, יחידות.",
    suggested_highlight: "tour-place-value-board",
    questionHe: "איך מחברים 240 + 135 בבית המספרים?",
    choices: [
      { id: "opt_1", textHe: "בונים את שני המספרים ואז סופרים את הבלוקים בכל טור בנפרד" },
      { id: "opt_2", textHe: "רק בונים את 240 ורושמים את 135 בתיבת התשובה" },
      { id: "opt_3", textHe: "מוחקים את הבלוקים וכותבים ישירות 375" }
    ],
    correctChoiceId: "opt_1"
  },

  // Task: תרגול חיבור עם קיבוץ — 385 + 152 (requiresGrouping)
  's1_t8': {
    pedagogical_intent: "procedural",
    tts_text: "כאשר יש 10 בלוקים בטור, לחצו על כפתור הקבץ או גררו אותם שמאלה.",
    suggested_highlight: "tour-column-units",
    questionHe: "יש יותר מ-9 בלוקים בטור — מה הצעד הבא?",
    choices: [
      { id: "opt_1", textHe: "לוחצים על כפתור הקבץ (או גוררים לטור העשרות) — והן הופכות לעשרת אחת" },
      { id: "opt_2", textHe: "מוחקים את הבלוקים המיותרים" },
      { id: "opt_3", textHe: "כותבים את כל המספרים ישר בתיבת התשובה ללא בלוקים" }
    ],
    correctChoiceId: "opt_1"
  },

  // Task: חיסור — 470 − 250 (ללא פריטה)
  's1_t9': {
    pedagogical_intent: "procedural",
    tts_text: "בחיסור, בונים רק את המספר הגדול ומוציאים ממנו בלוקים לפח המחזור.",
    suggested_highlight: "tour-column-hundreds",
    questionHe: "איך מבצעים חיסור 470 − 250 בבית המספרים?",
    choices: [
      { id: "opt_1", textHe: "בונים 470 בלבד ומוחקים 2 מאות + 5 עשרות לפח המחזור" },
      { id: "opt_2", textHe: "בונים גם 470 וגם 250 ואז משווים" },
      { id: "opt_3", textHe: "כותבים 470 - 250 ישירות בתיבת התשובה" }
    ],
    correctChoiceId: "opt_1"
  },

  // Task: חיסור עם פריטת עשרות — 425 − 162 (requiresUngrouping)
  's1_t10': {
    pedagogical_intent: "procedural",
    tts_text: "חסרות לנו עשרות כדי לחסר — לחצו על קוביית המאה בלוח כדי לפרוט אותה ל-10 עשרות.",
    suggested_highlight: "tour-column-tens",
    questionHe: "חסרות לנו עשרות בלוח כדי לחסר — מה עושים?",
    choices: [
      { id: "opt_1", textHe: "לוחצים על קוביית המאה (או גוררים לטור העשרות) — והיא נפרטת ל-10 עשרות" },
      { id: "opt_2", textHe: "מוסיפים עשרות מהמחסן" },
      { id: "opt_3", textHe: "חוסרים מלמטה למעלה בלי פריטה" }
    ],
    correctChoiceId: "opt_1"
  },

  // ── Session 3 — קיבוץ וחיבור עם המרות ────────────────────

  's3_t1': {
    pedagogical_intent: "procedural",
    tts_text: "חברו 146 + 235: כאשר טור היחידות מגיע ל-10 ומעלה — קבצו אותם לעשרת אחת.",
    suggested_highlight: "tour-column-units",
    questionHe: "מה עושים כש-6 יחידות + 5 יחידות = 11 יחידות?",
    choices: [
      { id: "opt_1", textHe: "אוספים 10 יחידות ומקבצים אותן לעשרת אחת — נשארת יחידה אחת" },
      { id: "opt_2", textHe: "כותבים 11 בטור היחידות" },
      { id: "opt_3", textHe: "מוחקים יחידה אחת" }
    ],
    correctChoiceId: "opt_1"
  },

  's3_t2': {
    pedagogical_intent: "procedural",
    tts_text: "כשמחברים 7 עשרות + 2 עשרות = 9 עשרות — אין קיבוץ. אבל בדקו את טור היחידות.",
    suggested_highlight: "tour-column-tens",
    questionHe: "בניתם את שני המספרים — מה בודקים קודם?",
    choices: [
      { id: "opt_1", textHe: "מתחילים מטור היחידות — בודקים האם יש 10 יחידות או יותר" },
      { id: "opt_2", textHe: "מתחילים מטור המאות — הוא הגדול ביותר" },
      { id: "opt_3", textHe: "רושמים מיד את התוצאה בלי לבדוק" }
    ],
    correctChoiceId: "opt_1"
  },

  's3_t3': {
    pedagogical_intent: "conceptual",
    tts_text: "8 יחידות + 5 יחידות = 13 יחידות. קבצו 10 ונשמרת 3.",
    suggested_highlight: "tour-column-units",
    questionHe: "מה קורה כשבטור היחידות מצטברים 13 יחידות?",
    choices: [
      { id: "opt_1", textHe: "אוספים 10 ממוחקים לעשרת — נשארות 3 יחידות" },
      { id: "opt_2", textHe: "כותבים 13 בטור היחידות" },
      { id: "opt_3", textHe: "מוחקים 3 יחידות" }
    ],
    correctChoiceId: "opt_1"
  },

  's3_t4': {
    pedagogical_intent: "conceptual",
    tts_text: "5 עשרות + 8 עשרות = 13 עשרות. קבצו 10 עשרות למאה אחת.",
    suggested_highlight: "tour-column-tens",
    questionHe: "מה קורה כשבטור העשרות יש 13 עשרות?",
    choices: [
      { id: "opt_1", textHe: "אוספים 10 עשרות להמרה למאה אחת — נשארות 3 עשרות" },
      { id: "opt_2", textHe: "כותבים 13 בטור העשרות" },
      { id: "opt_3", textHe: "מוחקים 3 עשרות" }
    ],
    correctChoiceId: "opt_1"
  },

  's3_t5': {
    pedagogical_intent: "procedural",
    tts_text: "תרגיל עם המרה כפולה: בדקו גם את טור היחידות וגם את טור העשרות.",
    suggested_highlight: "tour-place-value-board",
    questionHe: "מהיכן מתחילים ב-4890 + 1750?",
    choices: [
      { id: "opt_1", textHe: "תמיד מתחילים מטור הימני ביותר (יחידות) ועובדים שמאלה" },
      { id: "opt_2", textHe: "מתחילים מהמספר הגדול" },
      { id: "opt_3", textHe: "מחברים הכל בראש בלי לוח" }
    ],
    correctChoiceId: "opt_1"
  },

  's3_t6': {
    pedagogical_intent: "conceptual",
    tts_text: "גמישות ייצוגית: אפשר לפרט 4 מאות ל-3 מאות + 10 עשרות — הכמות הכוללת לא משתנה.",
    suggested_highlight: "tour-column-hundreds",
    questionHe: "כיצד מייצגים 452 בשתי דרכים שונות?",
    choices: [
      { id: "opt_1", textHe: "פורטים מאה אחת ל-10 עשרות (4מ'→3מ'+15ע') — הכמות שמורה" },
      { id: "opt_2", textHe: "מוסיפים עוד בלוקים לייצוג" },
      { id: "opt_3", textHe: "כל מספר יש לו רק ייצוג אחד" }
    ],
    correctChoiceId: "opt_1"
  },

  's3_t7': {
    pedagogical_intent: "procedural",
    tts_text: "320 + 480: בדקו את טור העשרות — 2 + 8 = 10 עשרות, כלומר מאה שלמה.",
    suggested_highlight: "tour-column-tens",
    questionHe: "מה קורה כשמחברים 2 עשרות + 8 עשרות?",
    choices: [
      { id: "opt_1", textHe: "מתקבלות 10 עשרות = מאה אחת שלמה, טור העשרות מתרוקן" },
      { id: "opt_2", textHe: "כותבים 10 בטור העשרות" },
      { id: "opt_3", textHe: "מוחקים 2 עשרות" }
    ],
    correctChoiceId: "opt_1"
  },

  // ── Session 4 — חיבור במאונך ──────────────────────────────

  's4_t1': {
    pedagogical_intent: "procedural",
    tts_text: "פתרו 342 + 125 במאונך: התחילו מטור היחידות ועלו שמאלה.",
    suggested_highlight: "tour-column-units",
    questionHe: "מאיפה מתחילים בחיבור במאונך?",
    choices: [
      { id: "opt_1", textHe: "תמיד מהטור הימני ביותר — טור היחידות" },
      { id: "opt_2", textHe: "מהמספר הגדול ביותר" },
      { id: "opt_3", textHe: "מטור המאות" }
    ],
    correctChoiceId: "opt_1"
  },

  's4_t2': {
    pedagogical_intent: "procedural",
    tts_text: "4 + 6 = 10 יחידות: רשמו 0 ביחידות והעבירו 1 לעשרות.",
    suggested_highlight: "tour-column-units",
    questionHe: "4 יחידות + 6 יחידות = 10 — מה כותבים בתיבת היחידות?",
    choices: [
      { id: "opt_1", textHe: "0 ביחידות + 1 כשארית בראש טור העשרות" },
      { id: "opt_2", textHe: "10 ביחידות" },
      { id: "opt_3", textHe: "1 ביחידות" }
    ],
    correctChoiceId: "opt_1"
  },

  's4_t3': {
    pedagogical_intent: "procedural",
    tts_text: "425 + 198 — המרה כפולה: קודם ביחידות ואז בעשרות.",
    suggested_highlight: "tour-column-units",
    questionHe: "יש שתי המרות בתרגיל הזה — מה הסדר הנכון?",
    choices: [
      { id: "opt_1", textHe: "קודם מסכמים יחידות ומעבירים שארית, אחר כך עשרות" },
      { id: "opt_2", textHe: "מסכמים הכל ואז מעבירים שאריות" },
      { id: "opt_3", textHe: "בתרגיל הזה אין שאריות" }
    ],
    correctChoiceId: "opt_1"
  },

  's4_t4': {
    pedagogical_intent: "focus",
    tts_text: "הקפידו לרשום את השארית בתיבות העליונות כדי לא לאבד אותה בחיסוב.",
    suggested_highlight: "tour-column-tens",
    questionHe: "מדוע חשוב לרשום את השארית בתיבה העליונה?",
    choices: [
      { id: "opt_1", textHe: "כדי לא לשכוח להוסיף אותה בסכימת הטור הבא" },
      { id: "opt_2", textHe: "זה סתם מנהג — אפשר לזכור בראש" },
      { id: "opt_3", textHe: "כדי שהתרגיל יראה מסודר" }
    ],
    correctChoiceId: "opt_1"
  },

  's4_t5': {
    pedagogical_intent: "procedural",
    tts_text: "1,530 + 2,870 — עבדו טור אחרי טור מימין לשמאל.",
    suggested_highlight: "tour-place-value-board",
    questionHe: "בתרגיל עם אלפים — מה הסדר?",
    choices: [
      { id: "opt_1", textHe: "יחידות ← עשרות ← מאות ← אלפים, עם שאריות בכל פעם" },
      { id: "opt_2", textHe: "אלפים קודם — הם הגדולים" },
      { id: "opt_3", textHe: "אין חשיבות לסדר" }
    ],
    correctChoiceId: "opt_1"
  },

  's4_t6': {
    pedagogical_intent: "procedural",
    tts_text: "3,450 + 2,680: בדקו שכל שארית נרשמה לפני שעוברים לטור הבא.",
    suggested_highlight: "tour-place-value-board",
    questionHe: "מה בודקים לפני שעוברים לטור הבא?",
    choices: [
      { id: "opt_1", textHe: "שרשמנו את השארית בראש הטור הבא" },
      { id: "opt_2", textHe: "שהמספרים בלוח מדויקים" },
      { id: "opt_3", textHe: "שמחקנו את כל הבלוקים" }
    ],
    correctChoiceId: "opt_1"
  },

  's4_t7': {
    pedagogical_intent: "focus",
    tts_text: "4,890 + 3,510: הראו שליטה מלאה — רשמו כל שארית בזמן.",
    suggested_highlight: "tour-place-value-board",
    questionHe: "מה מבדיל בין פתרון נכון לשגוי בחיבור במאונך?",
    choices: [
      { id: "opt_1", textHe: "רישום מדויק של כל שארית בכל טור" },
      { id: "opt_2", textHe: "מהירות החישוב" },
      { id: "opt_3", textHe: "מספר הבלוקים בלוח" }
    ],
    correctChoiceId: "opt_1"
  },

  // ── Session 5 — חיסור עם פריטה ─────────────────────────────

  's5_t1': {
    pedagogical_intent: "procedural",
    tts_text: "4,500 - 1,200: בנו 4,500 בלוח, הוציאו 1 מאות ו-2 אלפים לפח.",
    suggested_highlight: "tour-column-thousands",
    questionHe: "איך מחסירים 1,200 מ-4,500 בלוח?",
    choices: [
      { id: "opt_1", textHe: "בונים 4,500 ומוחקים 1 אלף + 2 מאות לפח המחזור" },
      { id: "opt_2", textHe: "בונים גם 4,500 וגם 1,200 ומשווים" },
      { id: "opt_3", textHe: "רושמים 3,300 ישירות בלי לוח" }
    ],
    correctChoiceId: "opt_1"
  },

  's5_t2': {
    pedagogical_intent: "procedural",
    tts_text: "3,800 - 2,400: הוציאו 2 אלפים + 4 מאות מהלוח.",
    suggested_highlight: "tour-column-hundreds",
    questionHe: "מה מוציאים מהלוח כדי לחסר 2,400?",
    choices: [
      { id: "opt_1", textHe: "2 בלוקים מטור האלפים + 4 בלוקים מטור המאות" },
      { id: "opt_2", textHe: "24 בלוקים מטור היחידות" },
      { id: "opt_3", textHe: "מוחקים את הכל ומתחילים מחדש" }
    ],
    correctChoiceId: "opt_1"
  },

  's5_t3': {
    pedagogical_intent: "procedural",
    tts_text: "5,240 - 1,800: חסרות מאות — פרטו אלף אחד ל-10 מאות.",
    suggested_highlight: "tour-column-hundreds",
    questionHe: "חסרות לנו מאות לחיסור — מה עושים?",
    choices: [
      { id: "opt_1", textHe: "פורטים אלף אחד מטור האלפים — הופך ל-10 מאות" },
      { id: "opt_2", textHe: "מוסיפים מאות מהמחסן" },
      { id: "opt_3", textHe: "חוסרים מלמטה למעלה" }
    ],
    correctChoiceId: "opt_1"
  },

  's5_t4': {
    pedagogical_intent: "procedural",
    tts_text: "6,350 - 2,480: חסרות עשרות — פרטו מאה אחת ל-10 עשרות.",
    suggested_highlight: "tour-column-tens",
    questionHe: "חסרות לנו עשרות — מה עושים?",
    choices: [
      { id: "opt_1", textHe: "פורטים מאה אחת מטור המאות — הופכת ל-10 עשרות" },
      { id: "opt_2", textHe: "פורטים אלף מטור האלפים" },
      { id: "opt_3", textHe: "ממשיכים בלי פריטה" }
    ],
    correctChoiceId: "opt_1"
  },

  's5_t5': {
    pedagogical_intent: "procedural",
    tts_text: "4,120 - 1,950: פריטה כפולה — קודם עשרות, אחר כך מאות.",
    suggested_highlight: "tour-place-value-board",
    questionHe: "יש פה פריטה כפולה — מה הסדר?",
    choices: [
      { id: "opt_1", textHe: "מתחילים מהצורך הקטן ביותר: קודם פורטים לעשרות ואז למאות" },
      { id: "opt_2", textHe: "פורטים מהאלפים ישירות ליחידות" },
      { id: "opt_3", textHe: "אין צורך בסדר ספציפי" }
    ],
    correctChoiceId: "opt_1"
  },

  's5_t6': {
    pedagogical_intent: "focus",
    tts_text: "7,200 - 3,850: בדקו כל טור לפני החיסור — האם יש מספיק בלוקים?",
    suggested_highlight: "tour-place-value-board",
    questionHe: "איך בודקים לפני שמחסירים?",
    choices: [
      { id: "opt_1", textHe: "בודקים שבכל טור יש מספיק בלוקים לחיסור — אחרת פורטים" },
      { id: "opt_2", textHe: "בונים את המספר ומחסירים כרגיל" },
      { id: "opt_3", textHe: "בודקים רק את טור היחידות" }
    ],
    correctChoiceId: "opt_1"
  },

  's5_t7': {
    pedagogical_intent: "procedural",
    tts_text: "8,500 - 4,920: הראו שליטה בפריטה מדורגת.",
    suggested_highlight: "tour-place-value-board",
    questionHe: "מה הצעד הראשון ב-8,500 - 4,920?",
    choices: [
      { id: "opt_1", textHe: "בודקים טור העשרות: יש לנו 0 עשרות, פורטים מאה" },
      { id: "opt_2", textHe: "מתחילים מטור האלפים" },
      { id: "opt_3", textHe: "כותבים את התוצאה ישירות" }
    ],
    correctChoiceId: "opt_1"
  },

  // ── Session 6 — אפס כשומר מקום ─────────────────────────────

  's6_t1': {
    pedagogical_intent: "procedural",
    tts_text: "6,200 - 3,500: חסרות מאות, פרטו אלף אחד ל-10 מאות.",
    suggested_highlight: "tour-column-thousands",
    questionHe: "יש לנו 2 מאות — אנחנו צריכים לחסר 5 מאות — מה עושים?",
    choices: [
      { id: "opt_1", textHe: "פורטים אלף אחד ל-10 מאות — עכשיו יש לנו 12 מאות" },
      { id: "opt_2", textHe: "חוסרים בלי פריטה" },
      { id: "opt_3", textHe: "מוסיפים מאות מהמחסן" }
    ],
    correctChoiceId: "opt_1"
  },

  's6_t2': {
    pedagogical_intent: "procedural",
    tts_text: "5,000 - 1,800: שלושה אפסים עוקבים — פרטו שלב אחר שלב.",
    suggested_highlight: "tour-column-thousands",
    questionHe: "כאשר יש אפסים עוקבים בטורים — מה הדרך הנכונה לפרוט?",
    choices: [
      { id: "opt_1", textHe: "פורטים אלף ל-10 מאות, ואז מאה ל-10 עשרות — שלב אחרי שלב" },
      { id: "opt_2", textHe: "פורטים ישירות מאלפים ליחידות" },
      { id: "opt_3", textHe: "אי אפשר לחסר כשיש אפסים" }
    ],
    correctChoiceId: "opt_1"
  },

  's6_t3': {
    pedagogical_intent: "conceptual",
    tts_text: "4,005 - 1,230: אפס בטור המאות ובטור העשרות — פרטו מאלפים.",
    suggested_highlight: "tour-column-thousands",
    questionHe: "יש לנו 0 בטור המאות ו-0 בעשרות — כיצד מחסירים?",
    choices: [
      { id: "opt_1", textHe: "פורטים מטור האלפים — הוא היחיד שיש בו ערך" },
      { id: "opt_2", textHe: "מוסיפים ערכים לטורים הריקים" },
      { id: "opt_3", textHe: "אי אפשר לחסר" }
    ],
    correctChoiceId: "opt_1"
  },

  's6_t4': {
    pedagogical_intent: "focus",
    tts_text: "7,000 - 3,450: כל הטורים אפס — פרטו שלב שלב מהאלפים.",
    suggested_highlight: "tour-column-thousands",
    questionHe: "7,000 עם שלושה אפסים — מה הצעד הראשון?",
    choices: [
      { id: "opt_1", textHe: "פורטים 1 אלף ל-10 מאות, ואז פורטים שוב כנדרש" },
      { id: "opt_2", textHe: "חוסרים ישירות — 7-3 = 4" },
      { id: "opt_3", textHe: "מוסיפים ספרות לטורים הריקים" }
    ],
    correctChoiceId: "opt_1"
  },

  's6_t5': {
    pedagogical_intent: "procedural",
    tts_text: "3,040 - 1,580: אפס בטור העשרות — פרטו מאה ל-10 עשרות.",
    suggested_highlight: "tour-column-hundreds",
    questionHe: "0 עשרות בלוח — כיצד מחסירים 8 עשרות?",
    choices: [
      { id: "opt_1", textHe: "פורטים מאה אחת ל-10 עשרות" },
      { id: "opt_2", textHe: "פורטים ישירות מהאלפים לעשרות" },
      { id: "opt_3", textHe: "חוסרים 0 - 8 = 0" }
    ],
    correctChoiceId: "opt_1"
  },

  's6_t6': {
    pedagogical_intent: "procedural",
    tts_text: "8,000 - 4,260: שלושה אפסים — פרטו שלב אחרי שלב.",
    suggested_highlight: "tour-column-thousands",
    questionHe: "8,000 עם אפסים עוקבים — מה הסדר הנכון לפריטה?",
    choices: [
      { id: "opt_1", textHe: "1 אלף → 10 מאות, ואחר כך 1 מאה → 10 עשרות" },
      { id: "opt_2", textHe: "פורטים הכל מיד ליחידות" },
      { id: "opt_3", textHe: "לא ניתן לפרוט" }
    ],
    correctChoiceId: "opt_1"
  },

  's6_t7': {
    pedagogical_intent: "focus",
    tts_text: "9,005 - 4,520: שמרו על ערך המקום של כל ספרה לאורך כל הפריטה.",
    suggested_highlight: "tour-place-value-board",
    questionHe: "מה קורה לכמות הכוללת כאשר אנחנו פורטים?",
    choices: [
      { id: "opt_1", textHe: "הכמות הכוללת לא משתנה — רק הייצוג שלה משתנה" },
      { id: "opt_2", textHe: "הכמות גדלה בגלל הפריטה" },
      { id: "opt_3", textHe: "הכמות קטנה בגלל הפריטה" }
    ],
    correctChoiceId: "opt_1"
  },

  // ── Session 7 — בעיות חקר ────────────────────────────────

  's7_t1': {
    pedagogical_intent: "procedural",
    tts_text: "7,890 + 1,250: בדקו את כל הטורים — יש המרה בטור העשרות.",
    suggested_highlight: "tour-column-tens",
    questionHe: "מה קורה כש-9 עשרות + 5 עשרות = 14 עשרות?",
    choices: [
      { id: "opt_1", textHe: "10 עשרות הופכות למאה — נשארות 4 עשרות" },
      { id: "opt_2", textHe: "כותבים 14 בטור העשרות" },
      { id: "opt_3", textHe: "מוחקים 4 עשרות" }
    ],
    correctChoiceId: "opt_1"
  },

  's7_t2': {
    pedagogical_intent: "procedural",
    tts_text: "8,120 - 4,560: פריטה כפולה — קודם עשרות ואחר כך מאות.",
    suggested_highlight: "tour-place-value-board",
    questionHe: "יש פריטה כפולה — מה הצעד הראשון?",
    choices: [
      { id: "opt_1", textHe: "בודקים קודם את טור העשרות — אם חסר, פורטים מאה" },
      { id: "opt_2", textHe: "פורטים מיד מהאלפים ליחידות" },
      { id: "opt_3", textHe: "מחסירים הכל מהזיכרון" }
    ],
    correctChoiceId: "opt_1"
  },

  's7_t3': {
    pedagogical_intent: "conceptual",
    tts_text: "4,5__0 + 1,500 = 6,000 — איזה ספרה בטור העשרות משלימה את הסכום?",
    suggested_highlight: "tour-column-tens",
    questionHe: "איך מוצאים ספרה חסרה בתרגיל חיבור?",
    choices: [
      { id: "opt_1", textHe: "מחסירים מהתוצאה את הידוע: 6,000 - 4,500 - 1,500 = 0, כלומר הספרה 0" },
      { id: "opt_2", textHe: "מנחשים ספרה שתיראה נכון" },
      { id: "opt_3", textHe: "בודקים כל ספרה מ-0 עד 9 בסדר" }
    ],
    correctChoiceId: "opt_1"
  },

  's7_t4': {
    pedagogical_intent: "conceptual",
    tts_text: "פרטו מאה ל-10 עשרות — וספרו אם הכמות הכוללת שמרה על עצמה.",
    suggested_highlight: "tour-place-value-board",
    questionHe: "מה קורה לכמות הכוללת כשפורטים מאה ל-10 עשרות?",
    choices: [
      { id: "opt_1", textHe: "הכמות שמורה — רק הייצוג השתנה" },
      { id: "opt_2", textHe: "הכמות גדלה ב-9" },
      { id: "opt_3", textHe: "הכמות קטנה במאה" }
    ],
    correctChoiceId: "opt_1"
  },

  's7_t5': {
    pedagogical_intent: "focus",
    tts_text: "5,200 - 2,300: תלמיד קיבל 3,100 — בדקו איזה טור חושב בטעות.",
    suggested_highlight: "tour-column-hundreds",
    questionHe: "איפה נפלה שגיאה ב-5,200 - 2,300 = 3,100?",
    choices: [
      { id: "opt_1", textHe: "בטור המאות: 2 - 3 לא ניתן, היה צריך לפרוט" },
      { id: "opt_2", textHe: "בטור האלפים: 5 - 2 = 3 זה נכון" },
      { id: "opt_3", textHe: "אין שגיאה — 3,100 נכון" }
    ],
    correctChoiceId: "opt_1"
  },

  's7_t6': {
    pedagogical_intent: "procedural",
    tts_text: "6,540 + 2,880: בצעו המרות, ואז בדקו בפעולה הפוכה.",
    suggested_highlight: "tour-column-units",
    questionHe: "איך בודקים שהתשובה לחיבור נכונה?",
    choices: [
      { id: "opt_1", textHe: "מחסירים את אחד המחוברים מהתוצאה — אם מקבלים את השני, נכון" },
      { id: "opt_2", textHe: "מחשבים שוב את אותו תרגיל" },
      { id: "opt_3", textHe: "משווים לתשובה של חבר" }
    ],
    correctChoiceId: "opt_1"
  },

  's7_t7': {
    pedagogical_intent: "focus",
    tts_text: "9,990 - 4,440: פרטו לפי הצורך ובדקו שימור כמות.",
    suggested_highlight: "tour-place-value-board",
    questionHe: "מה מוכיח ששמרנו על ערך המקום לאורך כל הפריטה?",
    choices: [
      { id: "opt_1", textHe: "הסכום של הנשאר + שחוסרנו = המספר המקורי" },
      { id: "opt_2", textHe: "שמספר הבלוקים בלוח גדל" },
      { id: "opt_3", textHe: "שהתשובה עגולה" }
    ],
    correctChoiceId: "opt_1"
  },

  // ── Session 8 — אבחון מסכם ───────────────────────────────

  's8_t1': {
    pedagogical_intent: "procedural",
    tts_text: "6,400 + 2,700: בדקו את טור המאות — 4 + 7 = 11 מאות.",
    suggested_highlight: "tour-column-hundreds",
    questionHe: "4 מאות + 7 מאות = 11 מאות — מה עושים?",
    choices: [
      { id: "opt_1", textHe: "10 מאות הופכות לאלף — נשארת מאה אחת" },
      { id: "opt_2", textHe: "כותבים 11 בטור המאות" },
      { id: "opt_3", textHe: "מוחקים מאה אחת" }
    ],
    correctChoiceId: "opt_1"
  },

  's8_t2': {
    pedagogical_intent: "procedural",
    tts_text: "9,000 - 4,300: שלושה אפסים — פרטו שלב אחרי שלב.",
    suggested_highlight: "tour-column-thousands",
    questionHe: "9,000 עם אפסים עוקבים — מה הצעד הראשון?",
    choices: [
      { id: "opt_1", textHe: "פורטים אלף ל-10 מאות, ואז מאה ל-10 עשרות לפי הצורך" },
      { id: "opt_2", textHe: "חוסרים ישירות — 9-4 = 5" },
      { id: "opt_3", textHe: "לא ניתן לחסר מ-0" }
    ],
    correctChoiceId: "opt_1"
  }
};

// ─────────────────────────────────────────────────────────────
// TARGET NODE FALLBACK MAP
// Used when the task has a targetNode but no specific task-ID entry above.
// ─────────────────────────────────────────────────────────────
const NODE_HINTS: Record<string, SocraticHintResponse> = {
  basic_addition_fluency: {
    pedagogical_intent: "conceptual",
    tts_text: "בנו את שני המספרים בבית המספרים וספרו כל טור בנפרד.",
    suggested_highlight: "tour-place-value-board",
    questionHe: "כיצד מחברים שני מספרים בבית המספרים?",
    choices: [
      { id: "opt_1", textHe: "בונים את שני המספרים וסופרים את הבלוקים בכל טור בנפרד" },
      { id: "opt_2", textHe: "בונים רק את המספר הגדול" },
      { id: "opt_3", textHe: "מוחקים את כל הבלוקים ורושמים ישירות" }
    ],
    correctChoiceId: "opt_1"
  },
  regrouping_fluency: {
    pedagogical_intent: "procedural",
    tts_text: "כאשר יש 10 בלוקים ומעלה בטור — יש לבצע קיבוץ לטור הבא.",
    suggested_highlight: "tour-column-units",
    questionHe: "יש יותר מ-9 בלוקים בטור — מה עושים?",
    choices: [
      { id: "opt_1", textHe: "מקבצים 10 בלוקים לבלוק גדול אחד בטור הבא" },
      { id: "opt_2", textHe: "כותבים 10 בתוצאה" },
      { id: "opt_3", textHe: "מוחקים בלוקים מיותרים" }
    ],
    correctChoiceId: "opt_1"
  },
  flexible_regrouping: {
    pedagogical_intent: "conceptual",
    tts_text: "ניתן לפרוט בלוק גדול לקטנים יותר — הכמות הכוללת לא משתנה.",
    suggested_highlight: "tour-column-hundreds",
    questionHe: "כיצד מייצגים את אותו מספר בדרך אחרת?",
    choices: [
      { id: "opt_1", textHe: "פורטים בלוק גדול לבלוקים קטנים — הכמות נשמרת" },
      { id: "opt_2", textHe: "מוסיפים בלוקים נוספים" },
      { id: "opt_3", textHe: "לכל מספר יש ייצוג אחד בלבד" }
    ],
    correctChoiceId: "opt_1"
  },
  procedural_fluency: {
    pedagogical_intent: "procedural",
    tts_text: "עבדו טור טור מימין לשמאל — אל תשכחו לרשום שארית.",
    suggested_highlight: "tour-column-units",
    questionHe: "מה הסדר הנכון בחיבור במאונך?",
    choices: [
      { id: "opt_1", textHe: "מתחילים מיחידות, עוברים לעשרות, מאות — ורושמים שאריות" },
      { id: "opt_2", textHe: "מתחילים מהמספר הגדול" },
      { id: "opt_3", textHe: "אין חשיבות לסדר" }
    ],
    correctChoiceId: "opt_1"
  },
  zero_placeholder: {
    pedagogical_intent: "conceptual",
    tts_text: "כאשר טור ריק לחלוטין — כותבים 0 כדי לשמור על ערכי הטורים האחרים.",
    suggested_highlight: "tour-column-tens",
    questionHe: "מה קורה לספרות האחרות אם לא נרשום 0 בטור הריק?",
    choices: [
      { id: "opt_1", textHe: "הספרות יזוזו שמאלה וישנו את ערך המספר כולו" },
      { id: "opt_2", textHe: "כלום — אפשר לדלג על טורים ריקים" },
      { id: "opt_3", textHe: "הטורים הריקים לא משפיעים" }
    ],
    correctChoiceId: "opt_1"
  },
  relational_thinking: {
    pedagogical_intent: "focus",
    tts_text: "חשבו: אם הפעולה הפוכה — חיבור ↔ חיסור — מה אפשר לגלות מכך?",
    suggested_highlight: "tour-place-value-board",
    questionHe: "איך פעולה הפוכה עוזרת לנו לבדוק תשובה?",
    choices: [
      { id: "opt_1", textHe: "מחסירים את אחד המחוברים מהסכום — אם מקבלים את השני, נכון" },
      { id: "opt_2", textHe: "עושים שוב את אותה פעולה" },
      { id: "opt_3", textHe: "פעולה הפוכה לא קשורה לבדיקה" }
    ],
    correctChoiceId: "opt_1"
  },
  missing_subtrahend: {
    pedagogical_intent: "conceptual",
    tts_text: "אם יודעים מה נשאר — נחסר אותו מהמספר המקורי כדי לגלות מה חסרנו.",
    suggested_highlight: "tour-place-value-board",
    questionHe: "כיצד מוצאים את הספרה החסרה בחיסור?",
    choices: [
      { id: "opt_1", textHe: "תוצאה - מה שנשאר = הספרה שחסרנו" },
      { id: "opt_2", textHe: "מנחשים" },
      { id: "opt_3", textHe: "אי אפשר למצוא" }
    ],
    correctChoiceId: "opt_1"
  },
  missing_addend: {
    pedagogical_intent: "conceptual",
    tts_text: "מחוברים + מחוברים = סכום. אם חסר מחוברים, אפשר לחסר מהסכום.",
    suggested_highlight: "tour-place-value-board",
    questionHe: "כיצד מוצאים מחוברים חסר?",
    choices: [
      { id: "opt_1", textHe: "סכום - מחוברים ידוע = מחוברים חסר" },
      { id: "opt_2", textHe: "מנחשים" },
      { id: "opt_3", textHe: "מחברים את כל המספרים" }
    ],
    correctChoiceId: "opt_1"
  }
};

const GENERAL_FALLBACK: SocraticHintResponse = {
  pedagogical_intent: "focus",
  tts_text: "בדקו מה בנוי בלוח ומה הצעד הבא הנדרש.",
  suggested_highlight: "tour-place-value-board",
  questionHe: "מה הצעד הבא שצריך לעשות בבית המספרים?",
  choices: [
    { id: "opt_1", textHe: "בודק את הלוח — מספר הבלוקים בכל טור ומה חסר" },
    { id: "opt_2", textHe: "כותב את התשובה מיד" },
    { id: "opt_3", textHe: "מוחק הכל ומתחיל מחדש" }
  ],
  correctChoiceId: "opt_1"
};

export class SocraticEngine {
  private static localHintCache: Map<string, SocraticHintResponse> = new Map();

  public static async prefetchSessionHints(sessionNumber: number): Promise<void> {
    // Cache both new node names and legacy node names the tests reference
    const nodesToCache: Record<string, SocraticHintResponse> = {
      regrouping_fluency: NODE_HINTS.regrouping_fluency,
      zero_placeholder: NODE_HINTS.zero_placeholder,
      procedural_fluency: NODE_HINTS.procedural_fluency,
      flexible_regrouping: NODE_HINTS.flexible_regrouping,
      relational_thinking: NODE_HINTS.relational_thinking,
      basic_addition_fluency: NODE_HINTS.basic_addition_fluency,
      // Legacy names kept for backward-compat with tests
      subtraction_regrouping: {
        pedagogical_intent: "procedural",
        tts_text: "חסרות לנו יחידות בלוח כדי לחסר. פרטו עשרת אחת ל-10 יחידות.",
        suggested_highlight: "tour-column-units",
        questionHe: "חסרות לנו יחידות בלוח לחיסור — מה עושים?",
        choices: [
          { id: "opt_1", textHe: "פורטים עשרת אחת מטור העשרות ל-10 יחידות" },
          { id: "opt_2", textHe: "מוסיפים יחידות מהמחסן" },
          { id: "opt_3", textHe: "חוסרים מלמטה למעלה" }
        ],
        correctChoiceId: "opt_1"
      },
      addition_regrouping: {
        pedagogical_intent: "procedural",
        tts_text: "יש יותר מ-9 קוביות בטור — קבצו 10 לבלוק אחד גדול יותר.",
        suggested_highlight: "tour-column-units",
        questionHe: "יש יותר מ-9 קוביות בטור — מה עושים?",
        choices: [
          { id: "opt_1", textHe: "מקבצים 10 יחידות לעשרת אחת" },
          { id: "opt_2", textHe: "מוחקים את הקוביות המיותרות" },
          { id: "opt_3", textHe: "כותבים את המספר ישירות" }
        ],
        correctChoiceId: "opt_1"
      },
      q_matrix_general: GENERAL_FALLBACK
    };
    for (const [node, hint] of Object.entries(nodesToCache)) {
      this.localHintCache.set(`${sessionNumber}_${node}`, hint);
    }
  }

  public static getCachedHint(sessionNumber: number, targetNode: string): SocraticHintResponse | null {
    return this.localHintCache.get(`${sessionNumber}_${targetNode}`) ||
           this.localHintCache.get(`${sessionNumber}_regrouping_fluency`) ||
           null;
  }

  /**
   * Evaluates the live board state (counts, deficits, overcrowding, active operation)
   * to produce a high-precision, real-time Socratic question and 3 closed pedagogical options.
   */
  public static analyzeLiveBoardState(
    currentTask: any,
    targetNode: string,
    counts: { units: number; tens: number; hundreds: number; thousands: number }
  ): SocraticHintResponse | null {
    if (!counts) return null;

    // 1. Overcrowding Check (>= 10 blocks in a column)
    if (counts.units >= 10) {
      return {
        pedagogical_intent: "procedural",
        tts_text: `בטור היחידות יש ${counts.units} קוביות. עלינו לקבץ 10 מהן לעשרת אחת.`,
        suggested_highlight: "tour-column-units",
        questionHe: `בטור היחידות הצטברו ${counts.units} קוביות (יותר מ-9). מה הצעד הבא שנבצע?`,
        choices: [
          { 
            id: "opt_1", 
            textHe: "נאסוף 10 יחידות מטור היחידות ונמיר אותן לעשרת אחת בטור העשרות", 
            isCorrect: true, 
            feedbackHe: "תשובה נכונה! כעת בצעו את הקיבוץ בלוח הדינס." 
          },
          { 
            id: "opt_2", 
            textHe: "נמחק 10 יחידות מטור היחידות לפח מבלי להוסיף עשרת", 
            isCorrect: false, 
            feedbackHe: "רמז: מחיקת בלוקים לפח משנה את ערך המספר! עלינו לשמר את הכמות הכוללת בעזרת המרה. אפשר להשתמש בביטול ↩️." 
          },
          { 
            id: "opt_3", 
            textHe: "נעביר קובייה אחת בלבד לטור העשרות", 
            isCorrect: false, 
            feedbackHe: "רמז: 1 עשרת שווה בדיוק ל-10 יחידות. העברת קובייה אחת אינה שקולה לעשרת. אפשר להשתמש בביטול ↩️." 
          }
        ],
        correctChoiceId: "opt_1"
      };
    }

    if (counts.tens >= 10) {
      return {
        pedagogical_intent: "procedural",
        tts_text: `בטור העשרות יש ${counts.tens} עשרות. עלינו לקבץ 10 מהן למאה אחת.`,
        suggested_highlight: "tour-column-tens",
        questionHe: `בטור העשרות הצטברו ${counts.tens} עשרות (יותר מ-9). מה עלינו לעשות?`,
        choices: [
          { 
            id: "opt_1", 
            textHe: "נאסוף 10 עשרות ונקבץ אותן למאה אחת בטור המאות", 
            isCorrect: true, 
            feedbackHe: "נכון מאוד! גררו 10 עשרות לטור המאות להמרה למאה אחת." 
          },
          { 
            id: "opt_2", 
            textHe: "נמחק עשרות מיותרות לפח המחזור", 
            isCorrect: false, 
            feedbackHe: "רמז: אסור למחוק בלוקים ללא המרה כדי לא לאבד מהערך הכולל של המספר." 
          },
          { 
            id: "opt_3", 
            textHe: "נרשום מספר דו-ספרתי במשבצת העשרות", 
            isCorrect: false, 
            feedbackHe: "רמז: בכל משבצת בבית המספרים מותרת רק ספרה אחת (0 עד 9)." 
          }
        ],
        correctChoiceId: "opt_1"
      };
    }

    if (counts.hundreds >= 10) {
      return {
        pedagogical_intent: "procedural",
        tts_text: `בטור המאות יש ${counts.hundreds} מאות. עלינו לקבץ 10 מהן לאלף אחד.`,
        suggested_highlight: "tour-column-hundreds",
        questionHe: `בטור המאות הצטברו ${counts.hundreds} מאות (יותר מ-9). מה הפעולה הנדרשת?`,
        choices: [
          { 
            id: "opt_1", 
            textHe: "נאסוף 10 מאות ונקבץ אותן לאלף אחד בטור האלפים", 
            isCorrect: true, 
            feedbackHe: "מצוין! קבצו 10 מאות לאלף אחד בטור האלפים." 
          },
          { 
            id: "opt_2", 
            textHe: "נשאיר 10 מאות באותו הטור", 
            isCorrect: false, 
            feedbackHe: "רמז: כל טור יכול להכיל לכל היותר 9 בלוקים." 
          },
          { 
            id: "opt_3", 
            textHe: "נמחק מאות לפח המחזור", 
            isCorrect: false, 
            feedbackHe: "רמז: שמרו על הכמות הכוללת בעזרת קיבוץ לאלפים." 
          }
        ],
        correctChoiceId: "opt_1"
      };
    }

    // 2. Subtraction Deficit Checks
    const isSubtraction = currentTask?.isSubtraction || 
                          (typeof currentTask?.instructionHe === 'string' && (currentTask.instructionHe.includes('חסר') || currentTask.instructionHe.includes('הפחת'))) ||
                          (typeof currentTask?.exercise === 'string' && currentTask.exercise.includes('-')) ||
                          targetNode === 'subtraction_regrouping';

    let subtrahend = currentTask?.numberB;
    if (!subtrahend && typeof currentTask?.exercise === 'string' && currentTask.exercise.includes('-')) {
      const parts = currentTask.exercise.split('-');
      if (parts[1]) {
        const parsed = parseInt(parts[1].trim(), 10);
        if (!isNaN(parsed)) subtrahend = parsed;
      }
    }

    if (isSubtraction && subtrahend) {
      const unitsB = subtrahend % 10;
      const tensB = Math.floor((subtrahend % 100) / 10);
      const hundredsB = Math.floor((subtrahend % 1000) / 100);

      // Check Units Deficit
      if (unitsB > 0 && counts.units < unitsB) {
        return {
          pedagogical_intent: "procedural",
          tts_text: `יש לנו ${counts.units} יחידות בלוח ואנו צריכים להחסיר ${unitsB}. פרטו עשרת אחת ל-10 יחידות.`,
          suggested_highlight: "tour-column-tens",
          questionHe: `יש לנו ${counts.units} יחידות בלוח ואנו צריכים להחסיר ${unitsB} יחידות. מה הצעד הנכון לבצע?`,
          choices: [
            { 
              id: "opt_1", 
              textHe: "נלחץ על עשרת אחת מטור העשרות כדי לפרוט אותה ל-10 יחידות", 
              isCorrect: true, 
              feedbackHe: "מעולה! לחצו על בלוק העשרת בלוח כדי לפרוט אותו ל-10 יחידות." 
            },
            { 
              id: "opt_2", 
              textHe: `נחסיר הפוך: ${unitsB} פחות ${counts.units} יחידות`, 
              isCorrect: false, 
              feedbackHe: "רמז: בחיסור אנו מוציאים רק מהכמות הקיימת. אי אפשר להחסיר הפוך מלמטה למעלה. אפשר להשתמש בביטול ↩️." 
            },
            { 
              id: "opt_3", 
              textHe: `נוסיף ${unitsB - counts.units} יחידות חדשות מהמחסן`, 
              isCorrect: false, 
              feedbackHe: "רמז: הוספת בלוקים מהמחסן משנה את ערך המספר המקורי! יש לבצע פריטה משכן כדי לשמור על הכמות." 
            }
          ],
          correctChoiceId: "opt_1"
        };
      }

      // Check Tens Deficit
      if (tensB > 0 && counts.tens < tensB) {
        return {
          pedagogical_intent: "procedural",
          tts_text: `יש לנו ${counts.tens} עשרות ואנו צריכים להחסיר ${tensB}. פרטו מאה אחת ל-10 עשרות.`,
          suggested_highlight: "tour-column-hundreds",
          questionHe: `יש לנו ${counts.tens} עשרות בלוח ואנו צריכים להחסיר ${tensB} עשרות. מאיזה טור שכן נוכל לפרוט בלוק?`,
          choices: [
            { 
              id: "opt_1", 
              textHe: "נלחץ על מאה אחת מטור המאות כדי לפרוט אותה ל-10 עשרות", 
              isCorrect: true, 
              feedbackHe: "מצוין! לחצו על בלוק המאה בלוח כדי לפרוט אותו ל-10 עשרות." 
            },
            { 
              id: "opt_2", 
              textHe: `נחסיר הפוך: ${tensB} פחות ${counts.tens} עשרות`, 
              isCorrect: false, 
              feedbackHe: "רמז: בחיסור אנו מוציאים מהכמות שיש לנו. אסור להחסיר הפוך. אפשר להשתמש בביטול ↩️." 
            },
            { 
              id: "opt_3", 
              textHe: "נמחק את ספרת המאות לפח המחזור", 
              isCorrect: false, 
              feedbackHe: "רמז: מחיקת מאות ללא פריטה תקטין את המספר במקום לשמר את הכמות הכוללת." 
            }
          ],
          correctChoiceId: "opt_1"
        };
      }

      // Check Hundreds Deficit
      if (hundredsB > 0 && counts.hundreds < hundredsB) {
        return {
          pedagogical_intent: "procedural",
          tts_text: `יש לנו ${counts.hundreds} מאות ואנו צריכים להחסיר ${hundredsB}. פרטו אלף אחד ל-10 מאות.`,
          suggested_highlight: "tour-column-thousands",
          questionHe: `יש לנו ${counts.hundreds} מאות בלוח ואנו צריכים להחסיר ${hundredsB} מאות. מה עלינו לעשות?`,
          choices: [
            { 
              id: "opt_1", 
              textHe: "נלחץ על אלף אחד מטור האלפים כדי לפרוט אותו ל-10 מאות", 
              isCorrect: true, 
              feedbackHe: "מדויק! לחצו על בלוק האלף בטור האלפים כדי לפרוט אותו ל-10 מאות." 
            },
            { 
              id: "opt_2", 
              textHe: `נחסיר הפוך: ${hundredsB} פחות ${counts.hundreds} מאות`, 
              isCorrect: false, 
              feedbackHe: "רמז: בחיסור אנו גורעים רק מהכמות הקיימת. נסה לחקור את הפריטה בעזרת כפתור הביטול ↩️." 
            },
            { 
              id: "opt_3", 
              textHe: "נוסיף מאות נוספות מהמחסן", 
              isCorrect: false, 
              feedbackHe: "רמז: הוספת בלוקים מהמחסן משנה את המספר. עלינו לשמר את הכמות על ידי פריטה מטור האלפים." 
            }
          ],
          correctChoiceId: "opt_1"
        };
      }
    }

    // 3. Zero Placeholder Awareness
    if (targetNode === 'zero_placeholder') {
      const numStr = String(currentTask?.numberA || '');
      if (numStr.includes('0') && counts.tens === 0) {
        return {
          pedagogical_intent: "conceptual",
          tts_text: "כאשר אין קוביות בטור העשרות, נרשום 0 כדי לשמור על ערך המקום.",
          suggested_highlight: "tour-column-tens",
          questionHe: "כאשר אין קוביות בעמודת העשרות, איזה מספר נרשום בבית המספרים?",
          choices: [
            { 
              id: "opt_1", 
              textHe: "נרשום 0 בעמודת העשרות כדי לשמור על ערך המקום של שאר הספרות", 
              isCorrect: true, 
              feedbackHe: "מדויק! ה-0 שומר שהמאות לא יזוזו ימינה ויהפכו לעשרות." 
            },
            { 
              id: "opt_2", 
              textHe: "נשאיר את העמודה ריקה לחלוטין ללא ספרה", 
              isCorrect: false, 
              feedbackHe: "רמז: אם נשאיר ריק, הספרות יתחברו והמספר כולו ישתנה!" 
            },
            { 
              id: "opt_3", 
              textHe: "נרשום 1 בעמודת העשרות", 
              isCorrect: false, 
              feedbackHe: "רמז: אין בלוקים בעמודה זו, ולכן הערך שלה הוא 0." 
            }
          ],
          correctChoiceId: "opt_1"
        };
      }
    }

    return null;
  }

  /**
   * Gemini Socratic Query API (Master PRD v5.0 Module 13)
   * Strictly enforces:
   * - System persona bound to 'Socratic Mentor' in digital VRA model.
   * - Absolutely forbids direct answers or CRA terminology.
   * - Rigid JSON Schema: { guiding_question: string, options: [{ id: "A", text: string }, { id: "B", text: string }, { id: "C", text: string }] }
   * - Fallback to pre-defined static hints if API fails or times out (>5000ms).
   */
  static async fetchGeminiSocraticQuery(
    studentIdNum: number,
    taskId: string,
    activeColumn: string,
    counts: { units: number; tens: number; hundreds: number; thousands: number },
    memoryCircles?: Partial<Record<string, string>>,
    recentActions?: string[]
  ): Promise<SocraticHintResponse | null> {
    try {
      const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || 
        (typeof window !== 'undefined' ? (window as any).__GEMINI_API_KEY__ : null) ||
        (typeof process !== 'undefined' ? (process.env?.VITE_GEMINI_API_KEY || 'test_gemini_api_key') : null);
      if (!apiKey) {
        return null;
      }

      const prompt = `
Context: Student #${studentIdNum} is working on math task "${taskId}" at active place-value column "${activeColumn}".
Current Dienes block counts: ${JSON.stringify(counts)}.
Memory circle inputs: ${JSON.stringify(memoryCircles || {})}.
Recent student interactions: ${JSON.stringify(recentActions || [])}.

Provide a guiding question and exactly 3 closed options to help the student self-correct using place-value blocks.
Option A must be the optimal correct action. Option B and C must be plausible structural distractors.
`;

      const systemInstruction = `You are the Socratic Mentor for the digital Virtual Representation (VRA) learning platform 'MathematiCOre'.
Your role is to offer one short, single-line guiding question and exactly three closed choices (A, B, C) to guide the student toward self-correction using the place-value board and Dienes blocks.
ABSOLUTELY FORBIDDEN:
- Do NOT provide the direct answer or final calculation.
- Do NOT use CRA terminology (such as 'מוחשי', 'ייצוגי', 'מופשט').
- Do NOT provide more or less than 3 options.
Return STRICT JSON matching this schema:
{
  "guiding_question": "שאלה מנחה קצרה בת שורה אחת בלבד",
  "options": [
    {"id": "A", "text": "מסיח אופטימלי נכון עם משוב חיובי קצר"},
    {"id": "B", "text": "מסיח שגוי א עם רמז מבני עדין"},
    {"id": "C", "text": "מסיח שגוי ב עם רמז מבני עדין"}
  ]
}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: systemInstruction }] },
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.2,
            },
          }),
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[Gemini API] Request failed with status ${response.status}`);
        return null;
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) return null;

      const parsed = JSON.parse(rawText);
      if (!parsed.guiding_question || !Array.isArray(parsed.options) || parsed.options.length !== 3) {
        console.warn('[Gemini API] Schema validation failed for response:', parsed);
        return null;
      }

      return {
        questionHe: parsed.guiding_question,
        choices: parsed.options.map((opt: { id: string; text: string }, idx: number) => ({
          id: opt.id || (idx === 0 ? 'A' : idx === 1 ? 'B' : 'C'),
          textHe: opt.text,
          isCorrect: idx === 0 || opt.id === 'A',
        })),
        correctChoiceId: 'A',
      };
    } catch (err) {
      console.warn('[Gemini Socratic Engine] Fallback triggered due to error/timeout:', err);
      return null;
    }
  }

  /**
   * יוצר אובייקט בקשה מאומת בדיוק לפי סכמת GeminiSocraticRequest (נספח א' §6 ומודול 13).
   * משתמש במזהה student_id קנוני (1-12) בלבד, ללא anonymous_student_id הישן.
   */
  static buildGeminiSocraticRequest(params: {
    studentId: number | string;
    sessionId: string;
    exerciseId: string;
    activeColumnIndex: number;
    workspaceState: {
      ones_count: number;
      tens_count: number;
      hundreds_count: number;
      memory_circles: Record<string, number>;
    };
    recentActions?: TelemetryPayload<TelemetryEventType>[];
  }): GeminiSocraticRequest {
    const rawId = typeof params.studentId === 'number' 
      ? params.studentId 
      : parseInt(String(params.studentId).replace(/\D/g, '') || '1', 10);
    const student_id = Math.min(12, Math.max(1, isNaN(rawId) ? 1 : rawId));

    return {
      student_id,
      session_id: params.sessionId,
      exercise_id: params.exerciseId,
      active_column_index: params.activeColumnIndex,
      workspace_state: {
        ones_count: params.workspaceState.ones_count,
        tens_count: params.workspaceState.tens_count,
        hundreds_count: params.workspaceState.hundreds_count,
        memory_circles: params.workspaceState.memory_circles || {},
      },
      recent_actions: params.recentActions || [],
    };
  }

  /**
   * מנגנון עמידות ונסיגה (Fallback):
   * שולח שאילתה ל-Gemini API ובמקרה של כשל רשת, Timeout או שגיאת 500,
   * מזריק מיד רמז סוקרטי סטטי מוגדר מראש ללא קריסת הממשק.
   */
  static async requestSocraticHintWithFallback(
    request: GeminiSocraticRequest,
    fallbackTask?: any
  ): Promise<SocraticHintResponse> {
    try {
      const hint = await SocraticEngine.fetchGeminiSocraticQuery(
        request.student_id,
        request.exercise_id,
        ['ones', 'tens', 'hundreds'][request.active_column_index] || 'ones',
        {
          units: request.workspace_state.ones_count,
          tens: request.workspace_state.tens_count,
          hundreds: request.workspace_state.hundreds_count,
          thousands: 0,
        },
        Object.fromEntries(
          Object.entries(request.workspace_state.memory_circles || {}).map(([k, v]) => [k, String(v)])
        ),
        (request.recent_actions || []).map((a) => String(a.event_type))
      );

      if (hint) {
        return hint;
      }
    } catch (err) {
      console.warn('[SocraticEngine] Gemini API error, falling back to static hint:', err);
    }

    // Pre-configured static Socratic fallback without crashing UI
    const staticFallback: SocraticHintResponse = (fallbackTask?.id && TASK_HINTS[fallbackTask.id]) ||
      TASK_HINTS['s1_license_test'] || {
        pedagogical_intent: 'conceptual',
        questionHe: 'מה הפעולה המתמטית שנרצה לבצע בבית המספרים?',
        choices: [
          { id: 'opt_1', textHe: 'לבדוק את כמות הבלוקים בכל טור בבית המספרים', isCorrect: true },
          { id: 'opt_2', textHe: 'לפרוט עשרת אחת ל-10 יחידות', isCorrect: false },
          { id: 'opt_3', textHe: 'לקבץ 10 יחידות לעשרת אחת', isCorrect: false },
        ],
        correctChoiceId: 'opt_1',
      };

    return staticFallback;
  }

  static async getSocraticHint(
    _currentTask: any,
    targetNode: string,
    _counts: { units: number; tens: number; hundreds: number; thousands: number },
    _traceData?: { hesitation_events: number; undo_clicks: number },
    _enhancedCognitiveSupport: boolean = false
  ): Promise<SocraticHintResponse | null> {
    await ready();

    // 1. Real-Time Live Board Anomaly Evaluation (Highest Priority)
    const liveHint = SocraticEngine.analyzeLiveBoardState(_currentTask, targetNode, _counts);
    if (liveHint) {
      return liveHint;
    }

    const taskId: string | undefined = _currentTask?.id;
    const taskType: string | undefined = _currentTask?.type;

    // 2. Exact task-ID match (most specific)
    if (taskId && TASK_HINTS[taskId]) {
      return TASK_HINTS[taskId];
    }

    // 3. Session 1 intro type (sandbox tasks without specific ID match)
    if (taskType === 'session1_intro') {
      return TASK_HINTS['s1_sandbox_controlled'];
    }

    // 4. Target-node fallback (task-agnostic but node-specific)
    if (targetNode && NODE_HINTS[targetNode]) {
      return NODE_HINTS[targetNode];
    }

    // 5. Cached node hint
    const cached = this.localHintCache.get(`${_currentTask?.sessionNumber || 1}_${targetNode}`);
    if (cached) return cached;

    // 6. General fallback
    return GENERAL_FALLBACK;
  }

  static async generateAndQueueTasks(
    studentId: string,
    studentName: string,
    teacherId: string,
    qMatrix: QMatrixResults,
    conceptMastery: Record<string, number>,
    traceData?: { hesitation_events: number; undo_clicks: number },
    effort?: number | null,
    strategy?: string | null
  ): Promise<void> {
    await ready();

    const generateSocraticMapping = httpsCallable(functions, "generateSocraticMapping");
    
    let aiResponse;
    try {
      const result = await generateSocraticMapping({
        studentId,
        studentName,
        teacherId,
        qMatrix,
        conceptMastery,
        traceData
      });
      aiResponse = result.data as any;
    } catch (error) {
      console.error("Failed to generate AI mapping, falling back to basic setup", error);
      aiResponse = {
        macroBlueprintHe: "המערכת לא הצליחה להתחבר למנוע ה-AI. נדרשת התערבות ידנית של המורה.",
        microBlueprintHe: "אנא תכנן את שיעור 3 בעצמך.",
        isYellowPath: true,
        tasks: [{
          id: "fallback_task",
          title: "משימה ידנית מומלצת",
          type: "concept_builder",
          rationale: "מערכת ה-AI לא היתה זמינה ולכן נדרשת בחירת משימה על ידי המורה."
        }]
      };
    }

    const { macroBlueprintHe, microBlueprintHe, isYellowPath, tasks } = aiResponse;
    const targetSession = "3";

    const pendingRef = ref(database, `ai_pending_approvals/${teacherId}`);
    const newApprovalRef = push(pendingRef);
    await set(newApprovalRef, {
      studentId,
      studentName,
      timestamp: serverTimestamp(),
      tasks: tasks || [],
      macroBlueprintHe,
      microBlueprintHe,
      targetSession
    });

    const reportRef = ref(database, `users/students/${studentId}/diagnosticReport`);
    await set(reportRef, {
      studentId,
      studentName,
      timestamp: Date.now(),
      macroBlueprintHe,
      microBlueprintHe,
      targetSession,
      tasks: tasks || [],
      qMatrixResults: qMatrix,
      conceptMastery,
      traceData: traceData || { hesitation_events: 0, undo_clicks: 0 },
      effort: effort !== undefined ? effort : null,
      strategy: strategy !== undefined ? strategy : null
    });

    await update(ref(database, `users/students/${studentId}`), {
      qMatrixResults: qMatrix,
      conceptMastery,
      traceData: traceData || { hesitation_events: 0, undo_clicks: 0 },
      routeStatus: 'PENDING',
      completedMeeting2: true
    });

    await AuditLogger.log(
      "COMPLETED_MAPPING_PHASE", 
      studentId, 
      `Student completed meeting 2 diagnostic mapping via Gemini AI. Route: ${isYellowPath ? 'YELLOW' : 'GREEN'}.`
    );
  }

  static async getPendingApprovals(teacherId: string): Promise<PendingAIApproval[]> {
    await ready();
    const pendingRef = ref(database, `ai_pending_approvals/${teacherId}`);
    const snapshot = await get(pendingRef);
    if (!snapshot.exists()) return [];
    const data = snapshot.val();
    return Object.keys(data).map(key => ({
      id: key,
      ...data[key]
    }));
  }

  static async approveTasks(teacherId: string, approvalId: string, studentId: string, tasks: SessionTask[]): Promise<void> {
    await ready();
    const approvedRef = ref(database, `approved_tasks/${studentId}`);
    await set(approvedRef, tasks);
    const pendingRef = ref(database, `ai_pending_approvals/${teacherId}/${approvalId}`);
    await remove(pendingRef);
    const statusRef = ref(database, `users/students/${studentId}/routeStatus`);
    await set(statusRef, "APPROVED");
  }

  static async updatePendingTasks(teacherId: string, approvalId: string, updatedTasks: SessionTask[]): Promise<void> {
    await ready();
    const pendingRef = ref(database, `ai_pending_approvals/${teacherId}/${approvalId}/tasks`);
    await set(pendingRef, updatedTasks);
  }
  
  static async rejectTasks(teacherId: string, approvalId: string): Promise<void> {
    await ready();
    const pendingRef = ref(database, `ai_pending_approvals/${teacherId}/${approvalId}`);
    await remove(pendingRef);
  }

  static async getApprovedTasks(studentId: string): Promise<SessionTask[] | null> {
    await ready();
    const approvedRef = ref(database, `approved_tasks/${studentId}`);
    const snapshot = await get(approvedRef);
    if (!snapshot.exists()) return null;
    return snapshot.val() as SessionTask[];
  }
}
