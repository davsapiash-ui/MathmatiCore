var EDITS = [
  ["עיגולי הזיכרון ממוקמים בראש כל טור, מקבלים ספרה בודדת בלבד בטווח 0 עד 9,",
   "עיגולי הזיכרון ממוקמים בראש כל טור, מקבלים עד שתי ספרות, כדי שאפשר יהיה לרשום בהם המרה,"],
  ["ומשתחררת רק עם השלמת הפעולה הפיזית בקנבס הלבנים.",
   "ומשתחררת עם השלמת הפעולה הפיזית בקנבס הלבנים. בתרגילי ייצוג הטור נפתח גם כשכל הלבנים בבית המספרים כבר תואמות את הנדרש, כדי שלומד שבנה נכון בדרך אחרת לא ייתקע."],
  ["Unlock column keyboard strictly upon conversion success event execution.",
   "Unlock column keyboard upon conversion success event execution; in representation exercises, also unlock it when the whole board already matches the required block counts."],
  ["המקלדת ננעלת עד לאישור המרה מוצלח, בהתאם למודול 9",
   "המקלדת ננעלת עד לאישור המרה מוצלח, או בתרגילי ייצוג עד שהלוח כולו תואם את הנדרש, בהתאם למודול 9"],
  ["וכפתור החזרה ללובי ממוקם באופן קבוע בסרגל העליון בכל מסכי הפעילות ואינו זז בין מסכים.",
   "ואין במסכי הפעילות כפתור חזרה ללובי: המעבר בין הלובי לתחנה נעשה בפעולות המורה (מודול 14 §ב0)."],
  ["and the return-to-lobby button fixed in the top bar with no positional variation",
   "and render no return-to-lobby button on any activity screen"]
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
