/**
 * The coaching card's language and terminology — ONE spec, used twice: the
 * system instruction tells the model these rules (socraticContract.ts), and
 * the response validator refuses a card that breaks a checkable one, so the
 * child gets a retry or the static card instead (owner, 1.10.2026: "תלמד את
 * הבינה את כללי הכתיבה ואת המונחים").
 *
 * Every rule here is the owner's, from his decisions: second person plural to
 * the children, never the first person plural (28.9.2026); "נסו לחשוב:",
 * "רמז:" + one guiding question, "נכון מאוד!" (30.9.2026); one name per
 * component, as the child's screen writes it (register decision ט, 27.9.2026);
 * פריטה / הקבצה and their government (28.9.2026); the Ministry's terms. None
 * is invented here.
 *
 * Import-free, like socraticContract.ts: the frontend test-suite reads it
 * straight from source.
 */

/** A Hebrew word on its own, with up to four prefix letters (ו, ב, ל, מ, ה, ש, כ) before it. */
const HE_WORD = (w: string) => new RegExp(`(^|[^א-ת])[ובלמהשכ]{0,4}(${w})(?![א-ת])`);
/** A Hebrew word on its own, no prefix allowed (a verb form). */
const HE_EXACT = (w: string) => new RegExp(`(^|[^א-ת])(${w})(?![א-ת])`);

export interface LanguageRule {
  /** Short id for the monitoring detail and the retry instruction. */
  id: string;
  re: RegExp;
  /** What to tell the model when a card breaks it (English, for the retry prompt). */
  fix: string;
}

/**
 * First person plural ("נבדוק", "נמחק", "בואו נ…", "מה נעשה") and "אנו".
 * The children are addressed in the second person plural; the options are in
 * the impersonal present (owner, 28.9.2026).
 */
// Only forms that cannot be read another way: "נמצא" (is located), "נראה"
// (seems), "נקרא" (is called), "נלמד", "נבחר" and "נשים" are left out — a
// card may say "הטור שנמצא מימין" or "הטור נראה ריק".
export const FIRST_PERSON_PLURAL_VERBS = [
  "בואו", "נבדוק", "נעשה", "נחשוב", "נבנה", "נפרוט", "נקבץ", "נחבר", "נחסר", "נחסיר", "נכתוב", "נרשום",
  "נעבור", "נתחיל", "נוסיף", "נוציא", "נמחק", "נלחץ", "נספור", "נסתכל", "נמיר", "נשתמש",
  "נזרוק", "נשאיר", "נעביר", "נגרור", "נפרק", "נוכל", "נצטרך",
  "נסדר", "נשווה", "נקבל", "נחליף", "נסיר", "נזכור", "ננסה", "נבין", "נדע", "נמשיך", "נחזור", "נדלג", "נלך",
  "אנו", "אנחנו", "נצליח",
  // The past tense and the pronouns of the first person plural ("כמה פעמים פרטנו", "האם חיסרנו").
  "פרטנו", "קיבצנו", "קבצנו", "בנינו", "עשינו", "הוספנו", "הוצאנו", "מחקנו", "כתבנו", "רשמנו", "גררנו", "לחצנו",
  "ספרנו", "חיברנו", "חיסרנו", "קיבלנו", "מצאנו", "ראינו", "ביטלנו", "השתמשנו", "בדקנו", "המרנו", "זרקנו", "העברנו",
  "שלנו", "לנו", "אותנו", "איתנו",
];

export const LANGUAGE_RULES: LanguageRule[] = [
  // A future-tense verb in נ… with a direct object ("כשנקרא את הספרות"): a
  // nif'al verb takes no "את", so "נ…" + "את" is the first person plural.
  { id: "first_person_plural_object", re: /(^|[^א-ת])(?:כש|ש|ו|וכש)?נ(?!ותן|ותנת|ותנים|שאר|שארת|שארים|כנס|כנסת|כנסים|וסף|וספת|וספים)[א-ת]{2,4}\s+את(?![א-ת])/, fix: 'Never use the first person plural ("כשנקרא את…", "נבנה את…"): use the impersonal present ("כשקוראים את…") or the second person plural ("קראו את…").' },
  { id: "first_person_plural", re: HE_EXACT(FIRST_PERSON_PLURAL_VERBS.join("|")), fix: 'Never use the first person plural ("נבדוק", "נמחק", "בואו", "אנו"). Address the children in the second person plural imperative ("בדקו", "לחצו") and write the options in the impersonal present ("בודקים", "לוחצים").' },
  { id: "not_a_form_kabetz", re: HE_WORD("הקבצו|הקביצו|יקביצו|מקביצים"), fix: 'The verb is פיעל only: "קבצו" (imperative), "מקבצים" (option). "הקבצו" / "הקביצו" are not Hebrew forms.' },
  // "לבנות" alone is also the verb "to build" ("לבנות את המספר"), so only the
  // forms that cannot be the verb are refused: with the article, or with an
  // adjective after it.
  { id: "blocks_plural", re: /(^|[^א-ת])[ובלמשכ]{0,3}הלבנות(?![א-ת])|לבנות\s+(העודפות|המיותרות|האלה|האלו|הללו|הנוספות|הבודדות|עודפות|מיותרות)(?![א-ת])/, fix: 'The plural of "לבנה" is "לבנים" ("לבני עשרת", "הלבנים המיותרות"), never "לבנות".' },
  { id: "result_box_name", re: HE_WORD("משבצת|משבצות|המשבצת|המשבצות"), fix: 'A result box is "תיבה" in "שורת התוצאה", never "משבצת".' },
  { id: "action_not_on_screen_mark", re: HE_WORD("סמנו|מסמנים|לסמן|סימון|תסמנו"), fix: 'There is no way to mark blocks on the screen. Name only the screen\'s own actions: drag blocks, click a block to break it, the "קבצו 10" button, the trash ("פח האשפה"), the undo button ("כפתור ביטול הפעולה").' },
  { id: "name_not_on_screen", re: /מאגר הלבנים|מאגר לבנים|לבני דינס|לבני הדינס|דינס|(^|[^א-ת])[ובלמהשכ]{0,3}לוח(?![א-ת])|ארגז הלבנים/, fix: 'Use the screen\'s names only: "בית המספרים" for the board, "לבנים" for the blocks, "ארגז כלים" for where the blocks are dragged from.' },
  { id: "parsing_verb", re: HE_EXACT("מפרקים|לפרק|פרקו|נפרק|מפרקות|פירקו|פירוק|הפירוק|מתפרק|מתפרקת|מתפרקים|מתפרקות|התפרקה|התפרק|להתפרק"), fix: 'Subtraction regrouping is "פריטה" only: "פורטים", "פרטו", "נפרטת" — never "מפרקים", "פירוק" or "מתפרקת".' },
  { id: "break_into_column", re: /(פורטים|פרטו|לפרוט|פורטות|פרטתם|נפרטת|נפרטה)[^.?!,:]{0,40}?\s(לטור|אל טור|אל הטור)/, fix: 'One breaks a block INTO smaller blocks, never "into a column": "פורטים עשרת אחת לעשר יחידות", "פורטים מאה אחת לעשר עשרות" — not "פורטים … לטור היחידות".' },
  { id: "gender_slash", re: /[א-ת]\/(ות|ים|ה|י|ן)(?![א-ת])|[א-ת]\.(נשים|ות)(?![א-ת])/, fix: "Gender-equal writing is the second person plural only, never slash or dot forms." },
  { id: "filler_or_formal", re: /למעשה|חשוב לציין|ראוי לציין|במידה ש|(^|[^א-ת])בכדי(?![א-ת])|יש לבצע|(^|[^א-ת])אנו(?![א-ת])/, fix: 'No filler and no formal register: "אם" not "במידה ש", "כדי" not "בכדי", a verb ("פרטו") not "יש לבצע פריטה".' },
  // "▢" stays allowed: it is how the screen writes a skeleton's hidden digit ("3▢6 + 271"), and the narration reads it as "ספרה חסרה".
  { id: "icon_symbol", re: /[↺⟲⟳]/, fix: 'Do not write the symbol "↺": name the undo button "כפתור ביטול הפעולה".' },
];

/** The card's form (owner, 30.9.2026). */
export const CORRECT_FEEDBACK_OPENING = "נכון מאוד!";
export const HINT_OPENING = "רמז:";
export const CARD_OPENING = "נסו לחשוב:";

export interface CardFormCheck {
  guiding_question: string;
  options: { option_text: string; feedback_text: string; is_correct: boolean }[];
}

/**
 * The form every card must have: the guiding question ends with "?", the
 * correct option's feedback opens with "נכון מאוד!", every wrong option's
 * feedback opens with "רמז:" and is ONE guiding question ending with "?".
 * Returns a reason, or null.
 */
export function cardFormViolation(card: CardFormCheck): string | null {
  const q = card.guiding_question.trim();
  if (!q.endsWith("?")) return "form: the guiding question must end with \"?\"";
  for (const o of card.options) {
    const f = o.feedback_text.trim();
    if (o.is_correct) {
      if (!f.startsWith(CORRECT_FEEDBACK_OPENING)) return `form: the correct option's feedback must open with "${CORRECT_FEEDBACK_OPENING}"`;
      if (f.includes(HINT_OPENING)) return "form: the correct option's feedback must not contain a hint";
    } else {
      if (!f.startsWith(HINT_OPENING)) return `form: a wrong option's feedback must open with "${HINT_OPENING}"`;
      if (!f.endsWith("?")) return "form: a wrong option's feedback must be one guiding question ending with \"?\"";
      if ((f.match(/\?/g) ?? []).length > 1) return "form: a wrong option's feedback must be ONE question";
    }
  }
  return null;
}

/** The first language rule the texts break, or null. */
export function languageViolation(texts: string[]): LanguageRule | null {
  for (const t of texts) {
    for (const rule of LANGUAGE_RULES) if (rule.re.test(t)) return rule;
  }
  return null;
}

/**
 * The language part of the system instruction: the rules above in words, and
 * real errors from the audit of 1.10.2026 as DON'T / DO pairs. Without blocks
 * (meetings 2 and 8) the examples name no block, no board and no button.
 */
export function socraticLanguageSpec(blocks: boolean): string {
  const imperatives = blocks ? '"בנו", "בדקו", "לחצו", "קבצו", "פרטו", "כתבו", "נסו"' : '"בדקו", "חברו", "חסרו", "פרטו", "כתבו", "רשמו", "נסו"';
  const options = blocks ? '"מקבצים", "פורטים", "מוחקים", "בודקים"' : '"ממירים", "פורטים", "רושמים", "בודקים"';
  const government = blocks
    ? 'one breaks a block INTO smaller ones — "פורטים עשרת אחת לעשר יחידות", "פורטים מאה אחת לעשר עשרות" (never "פורטים … לטור"); one groups "10 יחידות לעשרת אחת".'
    : 'one breaks INTO smaller units — "פורטים עשרת אחת לעשר יחידות" (never "פורטים … לטור"), and writes the change in the memory circle.';
  const forms = blocks
    ? 'Only these verb forms: "קבצו" / "מקבצים" ("הקבצו", "הקביצו" are not Hebrew). Addition regrouping is "הקבצה" (or "המרה"), subtraction regrouping is "פריטה"'
    : 'Addition regrouping is "המרה", written in the memory circle; subtraction regrouping is "פריטה"';
  const agreement = blocks
    ? 'The plural of "לבנה" is "לבנים": "לבני עשרת", "לבני יחידה", "הלבנים המיותרות" — never "לבנות עשרת", "הלבנות". '
    : "";
  const examples = blocks
    ? `✗ "כשפורטים עשרת אחת לטור היחידות" ✓ "מה קורה בבית המספרים כשפורטים עשרת אחת?"
✗ "אם נמחק חלק מהן?" ✓ "מה קורה למספר כשמוחקים לבנים?"
✗ "סמנו 10 לבני עשרת" ✓ "לחצו על הכפתור קבצו 10"
✗ "כמה ספרות אפשר לרשום בכל משבצת בבית המספרים?" ✓ "כמה ספרות כותבים בכל תיבה בשורת התוצאה?"
✗ "והקביצו אותן" ✓ "קבצו אותן"
✗ "הלבנות העודפות" ✓ "הלבנים המיותרות"
✗ "גררו לבנים ממאגר הלבנים" ✓ "גררו לבנים מארגז הכלים"`
    : `✗ "כשפורטים עשרת אחת לטור היחידות" ✓ "פורטים עשרת אחת לעשר יחידות, ורושמים בעיגול הזיכרון"
✗ "מה נעשה עכשיו?" ✓ "מה עושים עכשיו?"
✗ "כמה ספרות אפשר לרשום בכל משבצת?" ✓ "כמה ספרות כותבים בכל תיבה בשורת התוצאה?"`;
  return `HEBREW — the owner's writing rules for every text a child reads (binding):
- Address the children in the second person plural imperative, gender-neutral: ${imperatives}. Answer options are in the impersonal present: ${options}. NEVER the first person plural ("נבדוק", "נפרוט", "נמחק", "נזרוק", "בואו נ…", "מה נעשה") and never "אנו". Never slash or dot gender forms.
- The guiding question may open with "נסו לחשוב:" (never "בואו נחשוב", never "חשבו רגע") and ends with "?". The feedback of a wrong option is "רמז:" and ONE guiding question ending with "?". The feedback of the correct option opens with "נכון מאוד!".
- Verb government: ${government} Subtraction is "מחסרים" / "לחסר" / "חסרו".
- ${forms} — never "פירוק", "מפרקים", "שבירה", "הלוואה", "נשיאה".
- Agreement: "עשרת", "מאה", "יחידה" are feminine ("עשרת אחת", "שתי עשרות", "עשר יחידות"); "אלף" is masculine ("אלף אחד"). ${agreement}One unit is "יחידה אחת" / "עשרת אחת", never "1 יחידה". The number comes before the noun; "10 היחידות", not "ה-10 יחידות"; a prefix before digits takes a hyphen ("ל-10").
- Names: a result box is "תיבה" in "שורת התוצאה" (never "משבצת"); name only what the prompt's screen section lists.
- Style: short sentences, one action each; the question last; no filler ("למעשה", "חשוב לציין"); a verb, not "יש לבצע פריטה"; "אם", not "במידה ש"; "כדי", not "בכדי"; no comma before a defining "ש". Numbers as the exercise writes them ("1,245"; a hidden digit as "▢"). Do not write the symbol "↺".
DON'T / DO (real errors):
${examples}`;
}
