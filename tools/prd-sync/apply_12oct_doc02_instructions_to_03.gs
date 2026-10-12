// MathmatiCore — 12.10.2026: document 02 keeps the description of what the learners do; the learners'
// on-screen instructions and the coaching card's options word for word stay only in document 03
// (owner's NotebookLM check against the lecturer's requirements for 02 and 03). Run runAll.
// It deletes exactly 19 paragraphs, each only if the whole block matches word for word,
// and rewrites 4 sentences. Running it again changes nothing.
var DOC02 = '1r74zTVq-C1Xa8WrYwOdUMvlhd3OEVty4o2K207rJhgI';
var REPLACE = [
  ["ומציג תחילה שאלה מנחה שאינה נוקבת בטור: \"נסו לחשוב: לפני שמוציאים לבנים, מה בודקים בכל טור?\" (התשובה הנכונה: \"אם יש בטור מספיק לבנים כדי לחסר\").",
   "ומציג תחילה שאלה מנחה שאינה נוקבת בטור: מה בודקים בכל טור לפני שמוציאים לבנים."],
  ["לצידם מופיע המשפט \"שימו לב לצבעים בשורת התוצאה. כל תיבה צבועה בצבע של הטור שלה בבית המספרים.\" עם כפתור הקראה.",
   "לצידם מופיע משפט קצר, עם כפתור הקראה, המזכיר שכל תיבה צבועה בצבע של הטור שלה בבית המספרים."],
  ["ולאחר טעות כזו נוספות רק הכותרות, עם המשפט \"שימו לב לכותרות שמתחת לתיבות.\" ולצידו כפתור הקראה.",
   "ולאחר טעות כזו נוספות רק הכותרות, עם משפט קצר המפנה אליהן ועם כפתור הקראה."],
  ["דוגמה לכרטיס הבא, בתרגיל 400 פחות 156: \"נסו לחשוב: בתרגיל 400 − 156, איך פורטים כשבטור העשרות יש אפס?\"",
   "הכרטיס הבא נוקב בטור העשרות שיש בו אפס, ומכוון את הלומדים לפרוט תחילה לבנת מאה אחת לעשר עשרות (הנוסח המלא במסמך 03)."]
];
var BLOCKS = [
  ["הנחיות לתלמידים",
   "\"ייצגו את המספרים בעזרת לבנים.\"",
   "\"כשמצטברות 10 לבנים בטור, לחצו על הכפתור \"קבצו 10\" שבראש הטור. אחר כך רשמו בעיגול הזיכרון את ה־1 שעבר לטור הבא.\"",
   "\"רשמו את התוצאה בשורת התוצאה.\""],
  ["הנחיות לתלמידים",
   "\"בנו בבית המספרים את המספר הראשון.\"",
   "\"אם בטור אין מספיק לבנים, אפשר לפרוט לבנה מהטור שמשמאלו. לחצו על הלבנה, או גררו אותה אל הטור שמימין.\"",
   "\"אחרי שפרטתם, רשמו בעיגולי הזיכרון כמה לבנים יש עכשיו בכל טור שהשתנה.\"",
   "\"הוציאו מבית המספרים את המספר השני. כתבו את התוצאה בשורת התוצאה.\""],
  ["ההנחיות לתלמידים במפגש 6 כפי שיוצגו על גבי המסך",
   "ההנחיות מנוסחות בגוף שני רבים, בשפה מעצימה ובלשון שוויונית מגדרית:",
   "\"פתרו חיסור עם אפסים\"",
   "\"בנו בבית המספרים את המספר הראשון.\"",
   "\"אם בטור אין מספיק לבנים, אפשר לפרוט לבנה מהטור שמשמאלו. לחצו על הלבנה, או גררו אותה אל הטור שמימין.\"",
   "\"אחרי שפרטתם, רשמו בעיגולי הזיכרון כמה לבנים יש עכשיו בכל טור שהשתנה.\"",
   "\"הוציאו מבית המספרים את המספר השני. כתבו את התוצאה בשורת התוצאה.\""],
  ["אפשרות א: \"פורטים תחילה לבנת מאה אחת לעשר עשרות בטור העשרות\" (נכון מאוד! לחצו על לבנת המאה כדי לפרוט אותה. אחר כך פרטו שוב, טור אחר טור, עד טור היחידות.)",
   "אפשרות ב: \"מדלגים על האפס וממשיכים לטור הבא\" (רמז: כשפורטים לבנת מאה אחת, מה מקבלים: עשר עשרות או עשר יחידות?)",
   "אפשרות ג: \"מוסיפים לבנת עשרת אחת לטור היחידות בלי לפרוט\" (רמז: אם תוסיפו לבנים חדשות, האם המספר יישאר אותו מספר?)"]
];

function runAll() {
  var body = DocumentApp.openById(DOC02).getBody();
  var paras = body.getParagraphs();
  var done = 0, already = 0, skipped = 0;
  REPLACE.forEach(function (r) {
    var hits = paras.filter(function (p) { return norm_(p.getText()).indexOf(r[0]) !== -1; });
    var seen = paras.some(function (p) { return norm_(p.getText()).indexOf(r[1]) !== -1; });
    if (seen) { already++; return; }
    if (hits.length !== 1) { skipped++; Logger.log('משפט נמצא ' + hits.length + ' פעמים, דולג: ' + r[0].slice(0, 50)); return; }
    var t = hits[0].editAsText(), s = norm_(t.getText()), p = s.indexOf(r[0]);
    t.deleteText(p, p + r[0].length - 1); t.insertText(p, r[1]); done++;
  });
  var removed = 0;
  BLOCKS.forEach(function (b) {
    paras = body.getParagraphs();
    var starts = [];
    for (var i = 0; i + b.length <= paras.length; i++) {
      var ok = true;
      for (var k = 0; k < b.length && ok; k++) if (norm_(paras[i + k].getText()) !== b[k]) ok = false;
      if (ok) starts.push(i);
    }
    if (starts.length === 0) { already++; return; }
    if (starts.length !== 1) { skipped++; Logger.log('גוש נמצא ' + starts.length + ' פעמים, דולג: ' + b[0]); return; }
    for (var j = b.length - 1; j >= 0; j--) { paras[starts[0] + j].removeFromParent(); removed++; }
  });
  Logger.log('מסמך 02 — משפטים שהוחלפו: ' + done + '. פסקאות שנמחקו: ' + removed + '. כבר היו מעודכנים: ' + already + '. דולגו: ' + skipped + '.');
}

function norm_(s) { return s.replace(/\u00A0/g, ' '); }
