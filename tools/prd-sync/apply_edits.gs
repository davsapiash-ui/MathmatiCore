/**
 * Exact sentence replacements in the PRD Google Doc. Never inserts, deletes or moves a
 * paragraph. Each edit replaces one sentence, only if it occurs exactly once, and is
 * skipped when its new text is already there, so running it twice changes nothing.
 */
var EDITS = [
  ["לוח החיבור האדפטיבי, אם הוא פתוח, אינו נסגר עם פתיחת הכרטיס: הוא נשאר על המסך וממוקם מימין לכרטיס, בלי לכסות אותו (מודול 10).",
   "פתיחת החלונית הצידית מקפלת אוטומטית את לוח החיבור האדפטיבי אם היה פתוח, כדי למנוע הסתרה וחפיפה של רכיבים במסך (מודול 10)."],
  ["שום דבר אינו סוגר את הלוח אוטומטית: לא בחירת ספרה, לא תשובה נכונה ולא חלוף זמן.",
   "שום דבר אינו סוגר את הלוח אוטומטית: לא בחירת ספרה, לא תשובה נכונה ולא חלוף זמן. היוצא מן הכלל היחיד הוא פתיחת כרטיס החניכה."],
  ["כשכרטיס החניכה פתוח, הלוח ממוקם מימין לכרטיס ואינו מכסה אותו.",
   "כשכרטיס החניכה נפתח, הלוח מתקפל אוטומטית, כדי למנוע הסתרה וחפיפה של רכיבים במסך (מודול 12)."],
  ["לאחר שהלוח נפתח פעם אחת במפגש, בשלב 30 השניות, והלומד סגר אותו,",
   "לאחר שהלוח נפתח פעם אחת במפגש, בשלב 30 השניות, והלומד סגר אותו או שהוא התקפל עם פתיחת כרטיס החניכה,"],
  ["After the grid has been shown once in the session (at the 30-second stage) and closed by the learner,",
   "Collapse the grid automatically when the Socratic card opens, so components never overlap. After the grid has been shown once in the session (at the 30-second stage) and then closed by the learner or collapsed by the Socratic card,"],
  ["When no session is active for the class, render the quiet waiting screen",
   "When no session is active for the class, or the active session is paused, or the learner has completed it, render the quiet waiting screen, with the sentence that matches the session state and the learner's completion mark, in the teacher's chosen gender,"],
  ["בלובי, מפגש מושהה מציג \"המורה עצרה את הפעילות לרגע\" במקום כפתור הכניסה.",
   "בלובי מוצג תמיד אותו מסך המתנה שקט במקום כפתור הכניסה, והמשפט שבו נקבע לפי מצב המפגש ולפי סימן הסיום של הלומד באותה תחנה, ולא לפי סיבת הסגירה: כשהמורה עוד לא פתחה מפגש, \"היום עוד לא התחלנו. המורה תפתח את הפעילות בקרוב.\"; כשהמורה עצרה את המפגש, \"המורה עצרה את הפעילות לרגע.\"; כשהלומד סיים את התחנה של היום, \"כשהמורה תפתח את התחנה הבאה, נמשיך יחד.\"; כשהמורה סגרה את התחנה והלומד לא סיים אותה, \"העבודה שלכם נשמרה בבטחה. המורה תקבע איתכם מתי תמשיכו.\". לומד שסיים את התחנה רואה את משפט הסיום גם אם המורה עצרה או סגרה אותה אחר כך. המשפטים מוצגים בלשון שהמורה בחרה (מודול 7 §א); כאן הם בלשון נקבה, ובלשון זכר הפעלים בזכר: יפתח, עצר, יפתח, יקבע."],
  ["(and in the lobby instead of the enter button)",
   "(in the lobby, the quiet waiting screen instead of the enter button)"],
  ["בלי פנייה ביחיד ובלי \"שלך\".",
   "בלי פנייה ביחיד ובלי \"שלך\". משפט במסכי הלומד שמדבר על המורה בפועל שיש לו מין דקדוקי (\"המורה עצרה\", \"המורה תפתח\") כתוב בלשון שהמורה בחרה: המורה בוחרת פעם אחת, בדשבורד, אם מסכי הלומד מדברים על המורה בלשון נקבה או בלשון זכר, וכל משפט כזה, על המסך ובהקראה, עוקב אחר הבחירה. ברירת המחדל היא לשון נקבה. מסכי המורה עצמם פונים ברבים ואינם מושפעים מהבחירה."]
];

function applyEdits() {
  var body = DocumentApp.getActiveDocument().getBody();
  var done = 0, already = 0, skipped = 0;
  EDITS.forEach(function (e) {
    if (body.findText(esc_(e[1]))) { already++; return; }
    var found = body.findText(esc_(e[0]));
    if (!found) { skipped++; Logger.log('לא נמצא, דולג: ' + e[0].slice(0, 50)); return; }
    if (body.findText(esc_(e[0]), found)) { skipped++; Logger.log('נמצא יותר מפעם אחת, דולג: ' + e[0].slice(0, 50)); return; }
    var t = found.getElement().asText();
    var s = found.getStartOffset();
    t.deleteText(s, found.getEndOffsetInclusive());
    t.insertText(s, e[1]);
    done++;
    Logger.log('הוחלף: ' + e[0].slice(0, 50));
  });
  Logger.log('הוחלפו: %s. כבר היו מעודכנים: %s. דולגו: %s.', done, already, skipped);
}

function esc_(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
