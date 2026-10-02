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
/**
 * A verb form on its own or after the prefixes a verb takes: "ו", "ש", "כש",
 * "וכש" ("ונבדוק", "כשנגיע", "כשתבדוק"). The longer prefixes come first.
 */
const HE_VERB = (w: string, prefixes = "וכש|כש|ו|ש") => new RegExp(`(^|[^א-ת])(?:${prefixes})?(${w})(?![א-ת])`);
/** Where a clause starts: the text's start, or after a sentence mark, a comma, a quote or a bracket. */
const CLAUSE_START = '(?:^|[.!?:;,"“”(\\n])\\s*';

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
// (seems), "נקרא" (is called), "נלמד", "נבחר", "נשים" and "נבנה" (is built:
// "איזה מספר נבנה בבית המספרים?") are left out — a card may say "הטור שנמצא
// מימין" or "הטור נראה ריק". "נבנה את…" is still caught by the object rule.
export const FIRST_PERSON_PLURAL_VERBS = [
  "בואו", "נבדוק", "נעשה", "נחשוב", "נפרוט", "נקבץ", "נחבר", "נחסר", "נחסיר", "נכתוב", "נרשום",
  "נעבור", "נתחיל", "נוסיף", "נוציא", "נמחק", "נלחץ", "נספור", "נסתכל", "נמיר", "נשתמש",
  "נזרוק", "נשאיר", "נעביר", "נגרור", "נפרק", "נוכל", "נצטרך", "נגיע", "נסיים", "נגמור", "נגלה",
  "נסדר", "נשווה", "נקבל", "נחליף", "נסיר", "נזכור", "ננסה", "נבין", "נדע", "נמשיך", "נחזור", "נדלג", "נלך",
  "אנו", "אנחנו", "נצליח",
  // The past tense and the pronouns of the first person plural ("כמה פעמים פרטנו", "האם חיסרנו").
  "פרטנו", "קיבצנו", "קבצנו", "בנינו", "עשינו", "הוספנו", "הוצאנו", "מחקנו", "כתבנו", "רשמנו", "גררנו", "לחצנו",
  "ספרנו", "חיברנו", "חיסרנו", "קיבלנו", "מצאנו", "ראינו", "ביטלנו", "השתמשנו", "בדקנו", "המרנו", "זרקנו", "העברנו",
  "שלנו", "לנו", "אותנו", "איתנו",
];
/**
 * The forms above that a prefix turns into another word: "שנעשה" (that was
 * done) and "שנמחק" (that was deleted) are nif'al. Every other form is also
 * caught after "ו", "ש", "כש" ("ונבדוק", "כשנגיע").
 */
const FIRST_PERSON_PLURAL_UNPREFIXED_ONLY = ["נעשה", "נמחק"];

/**
 * The second person SINGULAR, masculine or feminine (owner, 28.9.2026: the
 * children are addressed in the second person plural only — "בדקו", "נסו",
 * "לחצו", "שימו לב"). Only forms that cannot be read another way: "בנה",
 * "מחק", "בחר", "הסתכל" are also the past tense ("התלמיד בחר"); "פרטי",
 * "ספרי", "רשמי", "חברי", "השווי" are nouns or adjectives; "תעבור", "תחזור",
 * "תוסיף", "תמחק", "תראה", "תחסר" are also the third person feminine ("העשרת
 * תעבור לטור העשרות", "איך תראה התוצאה?"). "כתוב", "רשום", "חשוב" and "לחץ"
 * are checked in context below ("מה כתוב בהנחיה?", "חשוב לבדוק").
 */
export const SECOND_PERSON_SINGULAR_FORMS = [
  // Masculine imperative.
  "שים", "נסה", "בדוק", "גרור", "קבץ", "פרוט", "הוסף", "ספור", "זכור", "התחל", "זרוק", "הקלד", "קח", "תן", "היזכר",
  // Feminine imperative.
  "שימי", "נסי", "לחצי", "בדקי", "כתבי", "גררי", "חשבי", "קבצי", "הוסיפי", "הוציאי", "מחקי", "הסתכלי", "בחרי",
  "קראי", "התחילי", "המשיכי", "חזרי", "זרקי", "העבירי", "מצאי", "שאלי", "הקלידי",
  // Future, masculine (only verbs a block or a number does not do) and feminine.
  "תבדוק", "תנסה", "תלחץ", "תכתוב", "תגרור", "תחשוב", "תקבץ", "תפרוט", "תספור", "תסתכל", "תזכור", "תרשום",
  "תבחר", "תשים", "תתחיל", "תמשיך", "תזרוק", "תעביר", "תוכל", "תצטרך", "תחבר", "תחסיר", "תגלה", "תדע", "תקליד",
  "תבדקי", "תנסי", "תלחצי", "תכתבי", "תגררי", "תחשבי", "תבני", "תקבצי", "תפרטי", "תוסיפי", "תוציאי", "תמחקי",
  "תספרי", "תסתכלי", "תזכרי", "תרשמי", "תבחרי", "תשימי", "תתחילי", "תמשיכי", "תחזרי", "תזרקי", "תעבירי",
  "תמצאי", "תוכלי", "תצטרכי", "תחברי", "תחסירי", "תראי", "תגלי", "תדעי", "תקלידי",
  // Pronouns of the second person singular.
  "אתה", "שלך", "לך", "אותך", "עליך", "ממך", "איתך", "בשבילך",
];
/** The imperatives that are also a participle, an adjective or a noun — singular only in context. */
const SECOND_PERSON_SINGULAR_IN_CONTEXT = new RegExp(
  [
    // "כתוב / רשום" opening a clause ("כתוב בתיבה…") or with an object ("כתוב את…") — not "מה כתוב בהנחיה?", "מה רשום בעיגול הזיכרון?".
    `(?:${CLAUSE_START}|(?:^|[^א-ת])ו)(?:כתוב|רשום)(?![א-ת])(?!\\s+(?:ב(?:הנחיה|תרגיל|מסך|כרטיס)|ש))`,
    "(?:^|[^א-ת])ו?(?:כתוב|רשום)\\s+את(?![א-ת])",
    // "חשוב" asking to think ("חשוב רגע", "חשוב מה…") — not the adjective ("חשוב לבדוק").
    `(?:${CLAUSE_START}|(?:^|[^א-ת])ו)חשוב(?=\\s*(?:על|מה|איך|כמה|רגע|היטב|טוב|שוב|באיזה|למה|מתי|[:?!,.]|$))`,
    // "לחץ על…" — not the noun.
    "(?:^|[^א-ת])ו?לחץ(?=\\s+(?:על|שוב|כאן|פעם))",
    // "הוצא" is also the passive ("בודקים כמה הוצא מכל טור"): the imperative only with an object ("הוצא את…",
    // "הוצא לבנה") — final review, 2.10.2026. Verification, 2.10.2026: also with a number or "מ…"
    // ("הוצא 3 לבנים", "הוצא מטור היחידות 3 לבנים"), unless a question word or "כבר" makes it the passive.
    "(?:^|[^א-ת])(?<!(?:כמה|מה|לא|כבר|שכבר)\\s)ו?הוצא\\s+(?:את|לבנ|עשר|יחיד|מאה|מאות|אלף|אלפים|\\d|מ[א-ת]|(?:אחת|אחד|שתי|שני|שתיים|שניים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע)(?:ה|ת)?(?![א-ת]))",
  ].join("|")
);

const FIRST_PERSON_PLURAL_FIX = 'Never use the first person plural ("נבדוק", "נמחק", "בואו", "אנו", "כשנגיע"). Address the children in the second person plural imperative ("בדקו", "לחצו") and write the options in the impersonal present ("בודקים", "לוחצים").';
const SECOND_PERSON_SINGULAR_FIX = 'Never address the child in the second person SINGULAR, masculine or feminine ("שים לב", "נסה", "בדוק", "לחץ על", "תבדוק", "בדקי", "שימי", "שלך"). Only the second person plural: "שימו לב", "נסו", "בדקו", "לחצו על", "שלכם".';

export const LANGUAGE_RULES: LanguageRule[] = [
  // A future-tense verb in נ… with a direct object ("כשנקרא את הספרות"): a
  // nif'al verb takes no "את", so "נ…" + "את" is the first person plural. A
  // word that ends in "ו" is the second person plural ("נסו את הכפתור").
  { id: "first_person_plural_object", re: /(^|[^א-ת])(?:וכש|כש|ו|ש)?נ(?!ותן|ותנת|ותנים|שאר|שארת|שארים|כנס|כנסת|כנסים|וסף|וספת|וספים)[א-ת]{2,4}(?<!ו)\s+את(?![א-ת])/, fix: 'Never use the first person plural ("כשנקרא את…", "נבנה את…"): use the impersonal present ("כשקוראים את…") or the second person plural ("קראו את…").' },
  { id: "first_person_plural", re: HE_EXACT(FIRST_PERSON_PLURAL_VERBS.join("|")), fix: FIRST_PERSON_PLURAL_FIX },
  {
    id: "first_person_plural_prefixed",
    re: new RegExp(`(^|[^א-ת])(?:וכש|כש|ו|ש)(${FIRST_PERSON_PLURAL_VERBS.filter((v) => !FIRST_PERSON_PLURAL_UNPREFIXED_ONLY.includes(v) && v.startsWith("נ")).join("|")})(?![א-ת])`),
    fix: FIRST_PERSON_PLURAL_FIX,
  },
  {
    id: "second_person_singular",
    // A future takes "ש" / "כש" ("כשתבדוק"); an imperative or a pronoun only "ו" ("ושים לב") — "ששים" is sixty.
    re: new RegExp([
      HE_VERB(SECOND_PERSON_SINGULAR_FORMS.filter((w) => w.startsWith("ת") && w.length > 2).join("|")).source,
      HE_VERB(SECOND_PERSON_SINGULAR_FORMS.filter((w) => !(w.startsWith("ת") && w.length > 2)).join("|"), "ו").source,
      SECOND_PERSON_SINGULAR_IN_CONTEXT.source,
    ].join("|")),
    fix: SECOND_PERSON_SINGULAR_FIX,
  },
  { id: "not_a_form_kabetz", re: HE_WORD("הקבצו|הקביצו|יקביצו|מקביצים"), fix: 'The verb is פיעל only: "קבצו" (imperative), "מקבצים" (option). "הקבצו" / "הקביצו" are not Hebrew forms.' },
  // "לבנות" alone is also the verb "to build" ("לבנות את המספר"), so only the
  // forms that cannot be the verb are refused: with the article, or with an
  // adjective after it.
  { id: "blocks_plural", re: /(^|[^א-ת])[ובלמשכ]{0,3}הלבנות(?![א-ת])|לבנות\s+(העודפות|המיותרות|האלה|האלו|הללו|הנוספות|הבודדות|עודפות|מיותרות)(?![א-ת])/, fix: 'The plural of "לבנה" is "לבנים" ("לבני עשרת", "הלבנים המיותרות"), never "לבנות".' },
  { id: "result_box_name", re: HE_WORD("משבצת|משבצות|המשבצת|המשבצות"), fix: 'A result box is "תיבה" in "שורת התוצאה", never "משבצת".' },
  { id: "action_not_on_screen_mark", re: HE_WORD("סמנו|מסמנים|לסמן|סימון|תסמנו"), fix: 'There is no way to mark blocks on the screen. Name only the screen\'s own actions: drag blocks, click a block to break it, the "קבצו 10" button, the trash ("פח האשפה"), the undo button ("כפתור ביטול הפעולה").' },
  { id: "name_not_on_screen", re: /מאגר הלבנים|מאגר לבנים|לבני דינס|לבני הדינס|דינס|(^|[^א-ת])[ובלמהשכ]{0,3}לוח(?![א-ת])|ארגז הלבנים/, fix: 'Use the screen\'s names only: "בית המספרים" for the board, "לבנים" for the blocks, "ארגז כלים" for where the blocks are dragged from.' },
  { id: "parsing_verb", re: HE_EXACT("מפרקים|לפרק|פרקו|נפרק|מפרקות|פירקו|פירוק|הפירוק|מתפרק|מתפרקת|מתפרקים|מתפרקות|התפרקה|התפרק|להתפרק"), fix: 'Subtraction regrouping is "פריטה" only: "פורטים", "פרטו", "נפרטת" — never "מפרקים", "פירוק" or "מתפרקת".' },
  // The error is breaking a block INTO a column. Moving the new blocks to a
  // column after naming what the block is broken into is right (the owner's
  // s5 card: "פורטים עשרת אחת לעשר יחידות בודדות ומעבירים אותן לטור היחידות"),
  // so the span may not cross "ל-10 / לעשר" or a second verb.
  // A second verb joined by "ו" ("פרטו עשרת אחת וגררו את היחידות לטור
  // היחידות") ends the span too: the column is then where the blocks are
  // dragged, not what the block is broken into.
  { id: "break_into_column", re: /(פורטים|פרטו|לפרוט|פורטות|פרטתם|נפרטת|נפרטה)((?!ל-?10|לעשר|ומעביר|ומוסיפ|ועובר|וגורר|ומכניס|עד |\sו[א-ת]{2,}(?:ו|ים|ות)(?![א-ת]))[^.?!,:]){0,30}?\s(לטור|אל טור|אל הטור)/, fix: 'One breaks a block INTO smaller blocks, never "into a column": "פורטים עשרת אחת לעשר יחידות", "פורטים מאה אחת לעשר עשרות" — not "פורטים … לטור היחידות".' },
  { id: "gender_slash", re: /[א-ת]\/(ות|ים|ה|י|ן)(?![א-ת])|[א-ת]\.(נשים|ות)(?![א-ת])/, fix: "Gender-equal writing is the second person plural only, never slash or dot forms." },
  { id: "filler_or_formal", re: /למעשה|חשוב לציין|ראוי לציין|במידה ש|(^|[^א-ת])בכדי(?![א-ת])|יש לבצע|(^|[^א-ת])אנו(?![א-ת])/, fix: 'No filler and no formal register: "אם" not "במידה ש", "כדי" not "בכדי", a verb ("פרטו") not "יש לבצע פריטה".' },
  // Subtraction is pi'el (coordinator's decision, 2.10.2026): "מחסרים", "לחסר", "חיסרו" — not the hif'il.
  { id: "subtraction_verb", re: HE_WORD("להחסיר|מחסירים|מחסירות|מחסיר|החסירו|תחסירו|החסרתם|החסירה"), fix: 'Subtraction is the pi\'el: "מחסרים", "לחסר", "חיסרו" — never "מחסירים", "להחסיר", "החסירו". Avoid the bare imperative "חסרו" (read aloud as "you lacked"): write the impersonal present ("מחסרים").' },
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
 * An opening that invites thinking ("חשבו רגע:", "בואו נחשוב:", "תחשבו:"):
 * the owner's is "נסו לחשוב:" and only it (30.9.2026). The opening itself is
 * optional — the register's own first card of station 5 has none ("לפני
 * שמוציאים לבנים, מה בודקים בכל טור?") — so a card without one passes.
 */
const THINK_OPENING = /^([^:?.!]{1,24}):/;

/**
 * The form every card must have: the guiding question is a DIRECT question
 * ending with "?" and, if it opens with an invitation to think, the opening
 * is "נסו לחשוב:"; the correct option's feedback opens with "נכון מאוד!";
 * every wrong option's feedback opens with "רמז:" and is ONE direct guiding
 * question ending with "?". An indirect question ("בדקו אם…") ends with a
 * period and belongs inside the correct option's feedback only. Returns a
 * reason, or null.
 */
export function cardFormViolation(card: CardFormCheck): string | null {
  const q = card.guiding_question.trim();
  if (!q.endsWith("?")) return "form: the guiding question must be a direct question ending with \"?\"";
  const opening = THINK_OPENING.exec(q);
  if (opening && /חשב|חשוב/.test(opening[1]) && opening[1].trim() !== CARD_OPENING.slice(0, -1)) {
    return `form: the only opening that invites thinking is "${CARD_OPENING}" (not "${opening[1].trim()}:")`;
  }
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

// ---------------------------------------------------------------------------
// Style: length, the opening's place, the title, the instruction, the comma
// ---------------------------------------------------------------------------

/**
 * The words of a card text, as a child reads them: Hebrew words only — a
 * number ("1,245", "▢", "+") is not counted, since the card names the
 * exercise by its numbers — and without the card's fixed opening ("נסו
 * לחשוב:", "רמז:", "נכון מאוד!").
 */
export function cardWordCount(text: string): number {
  return text
    .trim()
    .replace(/^(?:נסו לחשוב:|רמז:|נכון מאוד!)/, "")
    .split(/\s+/)
    .filter((w) => /[א-ת]/.test(w)).length;
}

/**
 * What the model is asked to write (owner, 2.10.2026: the live card of
 * s1_target_347 was right but long). The PRD sets no number; these are the
 * shape of the 130 child texts decided on 2.10.2026 (PR #206), whose median
 * question is 7 words and median option 6.
 */
export const CARD_TARGET_WORDS = { question: 14, option: 10, feedback: 16 } as const;
/**
 * What the validator refuses: the longest text among the static cards the
 * client can produce (every bank, board state, trigger and level —
 * StaticCards_ServerValidator_2_10.test.ts), so no decided card is refused
 * and a model card is never longer than the longest one the owner approved.
 * Measured 2.10.2026: question 16, option 15, hint 14, correct feedback 27.
 */
export const CARD_MAX_WORDS = { question: 16, option: 15, hint: 16, correct_feedback: 27 } as const;
/**
 * The instruction may not be copied: a run of this many Hebrew words in a row
 * taken from it. The longest run in a static card is 6 ("לחצו על הכפתור קבצו
 * 10 שבראש הטור"); the live card's quote ran to 9.
 */
export const INSTRUCTION_QUOTE_MAX_RUN = 8;

/**
 * An exercise's title in the card ("במשימת היעד", "במשימת החקר", "משימת יעד
 * מסכמת"): a construct "משימת" + a word is a title, and no static card says
 * "משימה" at all. The card names the exercise by its numbers.
 */
const TASK_TITLE_RE = /(^|[^א-ת])[ובלמהשכ]{0,3}משימ(?:ת|ות)\s+[א-ת]/;

/**
 * A fronted clause ("כשמחברים…", "אם…", "אחרי ש…", "לפני ש…") runs into the
 * question word with no comma: "כשמחברים את הספרות מה עושים?" → "כשמחברים את
 * הספרות, מה עושים?". Read on the last segment of a question — after its last
 * sentence mark, colon or comma — so a clause already closed by a comma, or a
 * question word inside the clause ("כשבודקים כמה לבנים יש בטור, מה…"), passes.
 */
const FRONTED_CLAUSE_NO_COMMA = /^(?:(?:ו)?כש[א-ת]+|אם|אחרי\s+ש[א-ת]+|לפני\s+ש[א-ת]+)\s.*?(?<![א-ת])(?:מה|איך|כיצד|כמה|באיזה|באיזו|באילו|איזה|איזו|אילו|מאיזה|מאיזו|לאיזה|לאיזו|למה|מאיפה|איפה|האם|מתי)(?:\s|\?)/;

function lastSegment(text: string): string {
  const t = text.trim();
  const cut = Math.max(...[".", "!", ":", ",", ";"].map((m) => t.lastIndexOf(m)));
  return t.slice(cut + 1).trim();
}

function tokens(text: string): string[] {
  return text.replace(/[.,:;!?"“”«»()׳״']/g, " ").split(/\s+/).filter(Boolean);
}

/** The longest run of Hebrew words the text copies, in order, from the instruction. */
export function instructionQuoteRun(text: string, instruction: string): number {
  const a = tokens(text);
  const b = tokens(instruction);
  let best = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      let k = 0;
      let he = 0;
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) {
        if (/[א-ת]/.test(a[i + k])) he++;
        k++;
      }
      if (he > best) best = he;
    }
  }
  return best;
}

export interface StyleContext {
  /** The instruction on the screen (task_context.instruction_he). */
  instruction?: string | null;
  /** The exercise's title (exercise_context.session_topic). */
  title?: string | null;
}

/**
 * The card's style (owner, 2.10.2026: "the writing should be better"): short,
 * the opening first, no title and no copied instruction, a comma after a
 * fronted clause. Each rule passes every static card (the decided texts of
 * 2.10.2026). Returns the first rule broken, or null.
 */
export function cardStyleViolation(card: CardFormCheck, ctx: StyleContext = {}): LanguageRule | null {
  const q = card.guiding_question.trim();
  const texts = [q, ...card.options.flatMap((o) => [o.option_text, o.feedback_text])];
  const rule = (id: string, fix: string, re: RegExp = /$^/): LanguageRule => ({ id, re, fix });

  if (texts.some((t, i) => (i === 0 ? t.indexOf(CARD_OPENING.slice(0, -1)) > 0 : t.includes(CARD_OPENING.slice(0, -1))))) {
    return rule("opening_not_first", `"${CARD_OPENING}" comes only at the very start of the guiding question, never in its middle and never in an option or a feedback.`);
  }
  const title = (ctx.title ?? "").replace(/\s+/g, " ").trim();
  if (texts.some((t) => TASK_TITLE_RE.test(t)) || (title.split(" ").filter((w) => /[א-ת]/.test(w)).length >= 2 && texts.some((t) => t.replace(/\s+/g, " ").includes(title)))) {
    return rule("title_repeated", 'Never repeat the exercise\'s title ("משימת היעד", "משימת חקר", the topic): name the exercise by its numbers ("בתרגיל 61 − 24") or by what is on the board.');
  }
  if (ctx.instruction && texts.some((t) => instructionQuoteRun(t, ctx.instruction!) >= INSTRUCTION_QUOTE_MAX_RUN)) {
    return rule("instruction_quoted", 'Never copy the instruction sentence: the child sees it on the screen. Point to it ("מה ההנחיה מבקשת?") or name one step of it in a few words.');
  }
  const questions = [q, ...card.options.filter((o) => !o.is_correct).map((o) => o.feedback_text)];
  if (questions.some((t) => FRONTED_CLAUSE_NO_COMMA.test(lastSegment(t.trim().endsWith("?") ? t : "")))) {
    return rule("comma_after_fronted_clause", 'Put a comma between a fronted clause and the question: "כשמחברים את הספרות של הטור, מה עושים?", "אם תוסיפו לבנים, האם המספר יישאר אותו מספר?".');
  }
  if (cardWordCount(q) > CARD_MAX_WORDS.question) {
    return rule("length_question", `The guiding question is too long (${cardWordCount(q)} words): at most ${CARD_TARGET_WORDS.question} words after "${CARD_OPENING}" — one short fact, then the question.`);
  }
  const longOption = card.options.find((o) => cardWordCount(o.option_text) > CARD_MAX_WORDS.option);
  if (longOption) {
    return rule("length_option", `An option is too long (${cardWordCount(longOption.option_text)} words): at most ${CARD_TARGET_WORDS.option} words, one action.`);
  }
  const longHint = card.options.find((o) => !o.is_correct && cardWordCount(o.feedback_text) > CARD_MAX_WORDS.hint);
  if (longHint) {
    return rule("length_hint", `A hint is too long (${cardWordCount(longHint.feedback_text)} words): "${HINT_OPENING}" and one short question of at most 12 words.`);
  }
  const right = card.options.find((o) => o.is_correct);
  if (right && cardWordCount(right.feedback_text) > CARD_MAX_WORDS.correct_feedback) {
    return rule("length_feedback", `The correct option's feedback is too long (${cardWordCount(right.feedback_text)} words): "${CORRECT_FEEDBACK_OPENING}" and at most ${CARD_TARGET_WORDS.feedback} words.`);
  }
  return null;
}

/**
 * The style part of the system instruction: the limits, the decided cards of
 * 2.10.2026 as examples of the sound, and real style faults as ✗ → ✓ pairs.
 * Without blocks (meetings 2 and 8) the examples name no block, no board and
 * no button.
 */
export function socraticStyleSpec(blocks: boolean): string {
  // Decided texts of 2.10.2026 (PR #206; staticSocraticCards.ts, SocraticEngine.ts), verbatim.
  // Format: question | ✓ right option → its feedback | ✗ wrong option → its hint | ✗ wrong option.
  const cards = blocks
    ? [
        'נסו לחשוב: בית המספרים עדיין ריק. מה עושים קודם? | ✓ בונים בבית המספרים את מה שההנחיה מבקשת → נכון מאוד! קראו את ההנחיה. בנו בבית המספרים את מה שהיא מבקשת. | ✗ כותבים מספר בשורת התוצאה → רמז: מה ההנחיה מבקשת לעשות לפני שכותבים? | ✗ מנחשים את התשובה',
        'נסו לחשוב: בתרגיל 713 + 94, איזה מספר עוד לא בבית המספרים? | ✓ המספר 94 → נכון מאוד! בנו את 94, כל ספרה בטור שלה. | ✗ המספר 713 → רמז: אילו לבנים כבר בניתם? | ✗ שני המספרים כבר שם',
        'נסו לחשוב: מה קורה בבית המספרים כשפורטים עשרת אחת? | ✓ מקבלים עשר יחידות שנוספות לטור היחידות → נכון מאוד! לחצו על לבנת עשרת, וראו את היחידות שנוספות לטור היחידות. | ✗ העשרת נמחקת מבית המספרים → רמז: מה מופיע בבית המספרים במקום העשרת? | ✗ בית המספרים נשאר בלי שינוי',
        'נסו לחשוב: בתרגיל 61 − 24, מה בודקים לפני שמוציאים לבנים מטור? | ✓ אם יש בטור מספיק לבנים להוציא → נכון מאוד! אם אין מספיק, פורטים לבנה מהטור שמשמאל. | ✗ שום דבר, מוציאים מיד → רמז: מה יקרה אם בטור אין מספיק לבנים להוציא? | ✗ מוסיפים לבנים חדשות לטור',
        'נסו לחשוב: בתרגיל 128 + 35, מה מחברים בטור העשרות? | ✓ את שתי הספרות של הטור, ועוד העשרת שעברה מטור היחידות → נכון מאוד! כתבו את הסכום בתיבה של טור העשרות. | ✗ רק את שתי הספרות של הטור → רמז: מה עבר לטור העשרות מטור היחידות? | ✗ את כל הספרות של התרגיל',
        'נסו לחשוב: בטור העשרות אין לבנים. איפה כותבים בשבילו 0 במספר? | ✓ בין ספרת המאות לספרת היחידות → נכון מאוד! ה-0 שומר לכל ספרה את המקום שלה. | ✗ בתחילת המספר → רמז: האם מספר יכול להתחיל ב-0? | ✗ לא כותבים 0, כי אין שם לבנים',
        'נסו לחשוב: מה כותבים בכל תיבה בשורת התוצאה? | ✓ את מספר הלבנים שבטור של אותה תיבה → נכון מאוד! כתבו ספרה בכל תיבה, גם בתיבה של טור שאין בו לבנים. | ✗ רק בתיבות של טורים שיש בהם לבנים → רמז: מה כותבים בתיבה של טור שאין בו אף לבנה? | ✗ את מספר כל הלבנים יחד, בתיבה אחת',
        'נסו לחשוב: בתרגיל 78 − 25, מה מחסרים בטור העשרות? | ✓ את הספרה התחתונה מהספרה העליונה → נכון מאוד! כתבו את התוצאה בתיבה של טור העשרות. | ✗ את הספרה העליונה מהספרה התחתונה → רמז: מאיזו ספרה מחסרים: מהספרה העליונה או מהתחתונה? | ✗ לא מחסרים, אלא מחברים את שתי הספרות',
      ]
    : [
        'נסו לחשוב: לפני שכותבים ספרה בשורת התוצאה, מה בודקים בכל טור? | ✓ אם סכום הספרות בטור מגיע ל-10 או יותר → נכון מאוד! אם הוא מגיע ל-10 או יותר, רשמו 1 בעיגול הזיכרון שמעל הטור שמשמאל. | ✗ איזו ספרה בטור היא הגדולה → רמז: האם בחיבור כותבים את הספרה הגדולה? | ✗ כמה ספרות יש בתרגיל כולו',
        'נסו לחשוב: בתרגיל 507 + 125, איך זוכרים שעשרת אחת עברה מטור היחידות לטור העשרות? | ✓ רושמים 1 בעיגול הזיכרון שמעל טור העשרות → נכון מאוד! כשתחברו את הספרות של טור העשרות, הוסיפו גם את ה-1 שבעיגול הזיכרון. | ✗ זוכרים בראש, בלי לרשום → רמז: איך תזכרו את העשרת הזאת כשתגיעו לטור העשרות? | ✗ כותבים אותה בתיבה של טור היחידות',
        'נסו לחשוב: בתרגיל 78 − 25, מה מחסרים בטור העשרות? | ✓ את הספרה התחתונה מהספרה העליונה → נכון מאוד! כתבו את התוצאה בתיבה של טור העשרות. | ✗ את הספרה העליונה מהספרה התחתונה → רמז: מאיזו ספרה מחסרים: מהספרה העליונה או מהתחתונה? | ✗ לא מחסרים, אלא מחברים את שתי הספרות',
        'נסו לחשוב: איך יודעים באיזו תיבה בשורת התוצאה כותבים כל ספרה? | ✓ לכל טור יש תיבה משלו, מתחת לטור → נכון מאוד! כתבו כל ספרה בתיבה של הטור שלה. | ✗ כותבים כל ספרה בתיבה הפנויה הראשונה → רמז: לאיזה טור שייכת כל תיבה? | ✗ כותבים את הספרות לפי הסדר שבו מחשבים אותן',
        'נסו לחשוב: איך בודקים בכל טור אם התלמיד צדק? | ✓ פותרים כל טור בעצמכם, ומשווים לספרה שהתלמיד כתב בטור הזה → נכון מאוד! התחילו בטור היחידות, ובדקו טור אחר טור. | ✗ בודקים רק את הספרה הראשונה של התוצאה שלו → רמז: האם טעות יכולה להיות גם בטור אחר? | ✗ מחברים רק את שתי הספרות של הטור',
      ];
  const faults = blocks
    ? `✗ "נסו לחשוב: במשימת היעד עם המספר 347 בית המספרים עדיין ריק, מה עושים עכשיו?" ✓ "נסו לחשוב: בית המספרים עדיין ריק. מה עושים קודם?" (the title repeated, a fronted phrase with no comma, too long)
✗ "נסו לחשוב: במשימת החקר, איך מוצאים דרך נוספת לייצג את 2,100?" ✓ "נסו לחשוב: איך מוצאים דרך נוספת לייצג את 2,100?" (never the exercise's title)
✗ "נסו לחשוב: ההנחיה אומרת בנו את המספר 347 בלבנים ופרטו עשרת אחת לעשר יחידות, אז מה עושים קודם?" ✓ "נסו לחשוב: מה ההנחיה מבקשת לבנות קודם?" (the child sees the instruction: never copy it)
✗ "נסו לחשוב: בתרגיל 53 − 18, אחרי שבניתם את 53 ובדקתם את טור היחידות וראיתם שאין בו מספיק לבנים, מה צריך לעשות עכשיו כדי שתוכלו להמשיך?" ✓ "נסו לחשוב: בתרגיל 53 − 18, בטור היחידות אין מספיק לבנים. מה עושים?" (one short fact, then the question)
✗ "נסו לחשוב: כשמחברים את הספרות של טור העשרות מה עושים עם ה-1 שבעיגול הזיכרון?" ✓ "נסו לחשוב: כשמחברים את הספרות של טור העשרות, מה עושים עם ה-1 שבעיגול הזיכרון?" (a comma after a fronted clause)
✗ "רמז: אם תוסיפו לבנים חדשות מארגז הכלים לטור היחידות, האם המספר שבבית המספרים יישאר בדיוק אותו מספר שבניתם בהתחלה?" ✓ "רמז: אם תוסיפו לבנים חדשות, האם המספר יישאר אותו מספר?" (a hint is one short question)
✗ "קוראים שוב את כל ההנחיה מההתחלה ועד הסוף, ואחר כך בונים בבית המספרים את כל מה שכתוב בה בדיוק" ✓ "בונים בבית המספרים את מה שההנחיה מבקשת" (an option is one short action)`
    : `✗ "נסו לחשוב: במשימת החקר עם התרגיל 1,245 + 328 מה כותבים קודם?" ✓ "נסו לחשוב: בתרגיל 1,245 + 328, מאיזה טור מתחילים?" (never the exercise's title; a comma after the fronted phrase)
✗ "נסו לחשוב: בתרגיל 4,000 − 1,562, אחרי שרשמתם את הפריטה בעיגולי הזיכרון ובדקתם את טור היחידות ואת טור העשרות, ממה צריך לחסר עכשיו כדי להמשיך?" ✓ "נסו לחשוב: בתרגיל 4,000 − 1,562, ממה מחסרים עכשיו בטור היחידות?" (one short fact, then the question)
✗ "נסו לחשוב: כשמחברים את הספרות של טור העשרות מה עושים עם ה-1 שבעיגול הזיכרון?" ✓ "נסו לחשוב: כשמחברים את הספרות של טור העשרות, מה עושים עם ה-1 שבעיגול הזיכרון?" (a comma after a fronted clause)
✗ "רמז: אם לא תרשמו שום דבר בעיגול הזיכרון שמעל טור העשרות, איך בדיוק תזכרו בהמשך לחבר גם את העשרת שעברה מטור היחידות?" ✓ "רמז: איך תזכרו את העשרת הזאת כשתגיעו לטור העשרות?" (a hint is one short question)
✗ "בודקים בעיגולי הזיכרון ובשורת התוצאה את כל מה שכבר רשמתם, ורק אחר כך ממשיכים לפתור את הטור הבא בתרגיל" ✓ "רושמים 1 בעיגול הזיכרון שמעל טור העשרות" (an option is one short action)`;
  return `STYLE — how a good card sounds (owner, 2.10.2026; binding):
- Short. The guiding question: at most ${CARD_TARGET_WORDS.question} words after "${CARD_OPENING}" (numbers not counted) — one short fact about the board or the exercise if needed, then the question; most good cards have 6–10 words. Each option: at most ${CARD_TARGET_WORDS.option} words, one action, the three options alike in length and form. Each feedback: at most ${CARD_TARGET_WORDS.feedback} words; a hint is "${HINT_OPENING}" and one short question.
- "${CARD_OPENING}" only at the very start of the question. Name the exercise by its numbers ("בתרגיל 61 − 24") — NEVER by its title or topic ("משימת היעד", "משימת חקר", the session topic). NEVER copy the instruction sentence: the child sees it; point to it ("מה ההנחיה מבקשת?").
- A comma closes a fronted clause or phrase before the main clause or the question ("בתרגיל 713 + 94, איזה מספר…", "כשמחברים את הספרות, מה עושים?"). No chains of "ו…ו…ו".
The decided cards of 2.10.2026 — copy their SOUND and LENGTH only, never their content (question | ✓ right option → feedback | ✗ wrong option → hint | ✗ wrong option):
${cards.map((c) => `• ${c}`).join("\n")}
STYLE DON'T / DO (real faults):
${faults}`;
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
  const imperatives = blocks ? '"בנו", "בדקו", "לחצו", "קבצו", "פרטו", "כתבו", "נסו"' : '"בדקו", "חברו", "פרטו", "כתבו", "רשמו", "נסו"';
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
✗ "גררו לבנים ממאגר הלבנים" ✓ "גררו לבנים מארגז הכלים"
✗ "שים לב לטור העשרות" ✓ "שימו לב לטור העשרות"
✗ "בדקי כמה לבנים יש בטור" ✓ "בדקו כמה לבנים יש בטור"
✗ "כשנגיע לטור המאות, ונבדוק" ✓ "כשמגיעים לטור המאות, בודקים"
✓ "איזה מספר נבנה בבית המספרים?" ✓ "מה כתוב בהנחיה?" ✓ "נסו את הכפתור קבצו 10"`
    : `✗ "כשפורטים עשרת אחת לטור היחידות" ✓ "פורטים עשרת אחת לעשר יחידות, ורושמים בעיגול הזיכרון"
✗ "מה נעשה עכשיו?" ✓ "מה עושים עכשיו?"
✗ "כמה ספרות אפשר לרשום בכל משבצת?" ✓ "כמה ספרות כותבים בכל תיבה בשורת התוצאה?"
✗ "שים לב לעיגול הזיכרון" ✓ "שימו לב לעיגול הזיכרון"
✗ "תבדוק מה רשום בעיגול הזיכרון" ✓ "בדקו מה רשום בעיגול הזיכרון"`;
  return `HEBREW — the owner's writing rules for every text a child reads (binding):
- Address the children in the second person plural imperative, gender-neutral: ${imperatives}. Answer options are in the impersonal present: ${options}. NEVER the first person plural ("נבדוק", "נפרוט", "נמחק", "נזרוק", "בואו נ…", "מה נעשה", "ונבדוק", "כשנגיע") and never "אנו". NEVER the second person singular, masculine or feminine ("שים לב", "נסה", "בדוק", "לחץ על", "תבדוק", "בדקי", "שימי", "שלך"): "שימו לב", "נסו", "בדקו", "לחצו על", "שלכם". Never slash or dot gender forms.
- The guiding question is ONE direct question ending with "?". It may open with "נסו לחשוב:" — the only opening of that kind (never "בואו נחשוב", never "חשבו רגע:"). The feedback of a wrong option is "רמז:" and ONE direct guiding question ending with "?". The feedback of the correct option opens with "נכון מאוד!". An indirect question inside a sentence takes "אם", not "האם", and no "?" ("בדקו אם צריך לרשום משהו בעיגול הזיכרון.") — it may appear only inside the correct option's feedback, never as the guiding question or as a hint.
- Verb government: ${government} Subtraction is the pi'el "מחסרים" / "לחסר" / "חיסרו" — never "מחסירים" / "להחסיר"; avoid the bare imperative "חסרו" (read aloud it sounds like "you lacked"): write "מחסרים" instead.
- ${forms} — never "פירוק", "מפרקים", "שבירה", "הלוואה", "נשיאה".
- Agreement: "עשרת", "מאה", "יחידה" are feminine ("עשרת אחת", "שתי עשרות", "עשר יחידות"); "אלף" is masculine ("אלף אחד"). What a grouping passes on is ONE block of the column that receives it: into the tens "עשרת אחת", into the hundreds "מאה אחת", into the thousands "אלף אחד" — never "עשרת" for every column. What a break gives is ten blocks of the column on its right: "פורטים עשרת אחת לעשר יחידות", "פורטים מאה אחת לעשר עשרות", "פורטים אלף אחד לעשר מאות". ${agreement}One unit is "יחידה אחת" / "עשרת אחת", never "1 יחידה". The number comes before the noun; "10 היחידות", not "ה-10 יחידות"; a prefix before digits takes a hyphen ("ל-10").
- Names: a result box is "תיבה" in "שורת התוצאה" (never "משבצת"); name only what the prompt's screen section lists.
- Style: short sentences, one action each; the question last; no filler ("למעשה", "חשוב לציין"); a verb, not "יש לבצע פריטה"; "אם", not "במידה ש"; "כדי", not "בכדי"; no comma before a defining "ש". Numbers as the exercise writes them ("1,245"; a hidden digit as "▢"). Do not write the symbol "↺".
DON'T / DO (real errors):
${examples}`;
}
