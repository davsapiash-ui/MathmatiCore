/**
 * Exact sentence replacements in the PRD Google Doc. Never inserts, deletes or moves a
 * paragraph: each edit replaces one sentence, and only if it occurs exactly once.
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
   "When no session is active for the class, or the active session is paused, or the learner has completed it, render the quiet waiting screen"],
  ["בלובי, מפגש מושהה מציג \"המורה עצרה את הפעילות לרגע\" במקום כפתור הכניסה.",
   "בלובי, מפגש מושהה, וכן מפגש שהלומד כבר סיים, מציגים את מסך ההמתנה השקט של הלובי במקום כפתור הכניסה."],
  ["(and in the lobby instead of the enter button)",
   "(in the lobby, the quiet waiting screen instead of the enter button)"]
];

function applyEdits() {
  var body = DocumentApp.getActiveDocument().getBody();
  var done = 0;
  EDITS.forEach(function (e) {
    var found = body.findText(esc_(e[0]));
    if (!found) { Logger.log('לא נמצא, דולג: ' + e[0].slice(0, 50)); return; }
    if (body.findText(esc_(e[0]), found)) { Logger.log('נמצא יותר מפעם אחת, דולג: ' + e[0].slice(0, 50)); return; }
    var t = found.getElement().asText();
    var s = found.getStartOffset();
    t.deleteText(s, found.getEndOffsetInclusive());
    t.insertText(s, e[1]);
    done++;
    Logger.log('הוחלף: ' + e[0].slice(0, 50));
  });
  Logger.log('סה"כ הוחלפו %s מתוך %s.', done, EDITS.length);
}

function esc_(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
