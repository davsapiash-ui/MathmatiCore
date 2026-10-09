// MathmatiCore PRD — batch 2 (8.10.2026): 21 exact replacements. Safe to run more than once.
// Each entry: [old, new, marker, nth, total]. marker = text whose presence means this edit was already applied;
// nth/total = replace the nth of exactly `total` occurrences (used only where the same code line appears twice).
var EDITS = [
  ["עיגולי הזיכרון ממוקמים בראש כל טור, מקבלים ספרה בודדת בלבד בטווח 0 עד 9,", "עיגולי הזיכרון ממוקמים בראש כל טור, מקבלים עד שתי ספרות, כדי שאפשר יהיה לרשום בהם המרה,"],
  ["ומשתחררת רק עם השלמת הפעולה הפיזית בקנבס הלבנים.", "ומשתחררת עם השלמת הפעולה הפיזית בקנבס הלבנים. בתרגילי ייצוג הטור נפתח גם כשכל הלבנים בבית המספרים כבר תואמות את הנדרש, כדי שלומד שבנה נכון בדרך אחרת לא ייתקע."],
  ["Unlock column keyboard strictly upon conversion success event execution.", "Unlock column keyboard upon conversion success event execution; in representation exercises, also unlock it when the whole board already matches the required block counts."],
  ["המקלדת ננעלת עד לאישור המרה מוצלח, בהתאם למודול 9", "המקלדת ננעלת עד לאישור המרה מוצלח, או בתרגילי ייצוג עד שהלוח כולו תואם את הנדרש, בהתאם למודול 9"],
  ["וכפתור החזרה ללובי ממוקם באופן קבוע בסרגל העליון בכל מסכי הפעילות ואינו זז בין מסכים.", "ואין במסכי הפעילות כפתור חזרה ללובי: המעבר בין הלובי לתחנה נעשה בפעולות המורה (מודול 14 §ב0)."],
  ["and the return-to-lobby button fixed in the top bar with no positional variation", "and render no return-to-lobby button on any activity screen"],
  ["'consecutive_undos_3' או 'conversion_not_performed' (נספח א' §3).", "'consecutive_undos_3', 'conversion_not_performed' או 'repeated_errors' (נספח א' §3)."],
  ["מרגע הלחיצה על \"התקדם\"", "מרגע הלחיצה על \"ממשיכים\""],
  ["אי-ביצוע המרה נדרשת: הלומד ממשיך בפתרון תרגיל שמחייב המרה (הקבצה או פריטה) בטור מסוים בלי לבצע אותה.", "אי-ביצוע המרה נדרשת: הכרטיס נפתח כאשר מתקיימים כל אלה: (א) תרגיל חיבור או חיסור במאונך; (ב) הלומד מקליד ספרה שגויה בשורת התוצאה בטור מסוים; (ג) הטור הזה מחייב המרה (הקבצה בחיבור, פריטה בחיסור); (ד) ההמרה עדיין לא בוצעה בלבנים בטור הזה. הבדיקה נעשית לכל טור בנפרד, לא לתרגיל כולו. חריגים: אם הספרה שהוקלדה היא הספרה הנכונה של טור אחר (טעות מיקום), עונה לה פיגום שורת התוצאה של מודול 9 ולא הכרטיס; אם ההקלדה היא גם הטעות הרביעית ברצף באותו טור, נפתח כרטיס \"4 טעויות\" — לכל היותר כרטיס אחד בכל הקשה. הכרטיס מופיע במקומו הרגיל. הניסוח שלו, קבוע או של הבינה, מציין במפורש את הטור שבו הוקלדה הספרה השגויה (למשל \"בטור היחידות\"), ובבקשה לבינה הטור הזה נשלח כטור הפעיל, כדי שהלומד יבין על מה מדובר."],
  ["(d) a required conversion not performed,", "(d) a required conversion not performed: in a vertical addition or subtraction exercise, the student types a wrong digit in the result row of a column that requires a conversion (grouping in addition, decomposition in subtraction) which has not yet been performed with blocks in that column, checked per column; exceptions: a digit that is the correct digit of another column (a place error) is handled by the module 9 result-row scaffold, not the card, and a keystroke that is also the column's fourth consecutive error opens the 4-errors card only (at most one card per keystroke); the card appears in its usual place, its wording (static or AI) names the column where the wrong digit was typed, and that column is sent to the AI as the active column,"],
  ["הלוח אינו מציג ללומד אחוזים, ציונים או דירוגים מלבד מדד ההתמדה שבשלב ג.", "הלוח אינו מציג ללומד אחוזים, ציונים או דירוגים, וגם לא את מדד ההתמדה."],
  ["הספרה 0 מוצגת בצבע הטור, ואינה מוסתרת באף טור ובאף מפגש.", "מונה הלבנים של הטור מציג 0 בצבע הטור, ואינו נעלם באף טור ובאף מפגש. (מונה הלבנים שבלוח אינו קשור ל\"ספרה מוסתרת\" של תרגילי השלד במודול 26 — שם מדובר בספרה חסרה בתרגיל עצמו.)"],
  ["ר לטעות מיומנות רכיב, מ לטעות מושגית.", "ר לטעות בשלבי הפתרון, מ לטעות בהבנת ערך המקום."],
  ["לכל אחד מ-13 סוגי האירועים", "לכל אחד מסוגי האירועים"],
  ["| 'HELP_REQUESTED'", "| 'HELP_REQUESTED'  \n  | 'HELP_WITHDRAWN'", "| 'HELP_WITHDRAWN'"],
  ["export interface SocraticCardShownDetails {", "export interface HelpWithdrawnDetails {} // the learner cancelled a help call; not part of any formula (Module 23)  \n   \nexport interface SocraticCardShownDetails {", "export interface HelpWithdrawnDetails {}"],
  ["HELP_REQUESTED: HelpRequestedDetails;", "HELP_REQUESTED: HelpRequestedDetails;  \n  HELP_WITHDRAWN: HelpWithdrawnDetails;", "HELP_WITHDRAWN: HelpWithdrawnDetails;"],
  ["hundreds_count: number;", "hundreds_count: number;  \n    thousands_count: number; // as in Appendix A §6", "thousands_count: number; // as in Appendix A §6", 1, 2],
  ["recent_actions: TelemetryPayload<TelemetryEventType>[];", "recent_actions: TelemetryPayload<TelemetryEventType>[];  \n  exercise_context: GeminiExerciseContext; // Appendix A §6", "exercise_context: GeminiExerciseContext; // Appendix A §6", 1, 2],
  ["guiding_question: string;", "error_category: 'calculation' | 'procedural' | 'conceptual'; // Module 13 §ב, kept in SOCRATIC_CARD_SHOWN  \n  guiding_question: string;", "// Module 13 §ב, kept in SOCRATIC_CARD_SHOWN", 1, 2],
  ["recent_actions: TelemetryPayload<TelemetryEventType>[];", "recent_actions: TelemetryPayload<TelemetryEventType>[];  \n  exercise_context: GeminiExerciseContext; // GeminiExerciseContext is defined above (Module 13 §א)", "// GeminiExerciseContext is defined above (Module 13 §א)", 2, 2]
];

function applyEdits() {
  var body = DocumentApp.getActiveDocument().getBody();
  var done = 0, already = 0, skipped = 0;
  EDITS.forEach(function (e) {
    var oldText = e[0], newText = e[1], marker = e[2] || e[1], nth = e[3] || 1, total = e[4] || 1;
    if (body.findText(esc_(marker))) { already++; return; }
    var matches = [], r = body.findText(esc_(oldText));
    while (r) { matches.push(r); r = body.findText(esc_(oldText), r); }
    if (matches.length !== total) {
      skipped++;
      Logger.log('נמצא ' + matches.length + ' פעמים במקום ' + total + ', דולג: ' + oldText.slice(0, 50));
      return;
    }
    var found = matches[nth - 1];
    var t = found.getElement().asText();
    var s = found.getStartOffset();
    t.deleteText(s, found.getEndOffsetInclusive());
    t.insertText(s, newText);
    done++;
    Logger.log('הוחלף: ' + oldText.slice(0, 50));
  });
  Logger.log('הוחלפו: %s. כבר היו מעודכנים: %s. דולגו: %s.', done, already, skipped);
}

function esc_(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
