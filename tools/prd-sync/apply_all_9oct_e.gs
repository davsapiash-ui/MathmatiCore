// MathmatiCore — one script (9.10.2026, morning): everything pending in one run.
// Includes all of apply_all_9oct_d.gs (station-4 verbs in document 03; PRD note removed),
// then the uniformity sweep of learner instructions (PRD 7.15: one name per action and object,
// "בנו"/"כתבו"/"רשמו", conditional lines "כש…", "בתרגיל … חסרה …", "הוציאו").
// Run applyAll. Safe to run more than once.
var DOCS = [
  { name: 'PRD', id: '1siy2VT-bPVy9LflxJBt-Xr7uQEW5umHPEh_vMVlmbWY', version: '7.15', edits: [
  [" כתבו את התוצאה בשורת התוצאה.\" (הפעלים \"בנו\" ו\"כתבו\" לפי מודול 7; מסמך 03 §3.4 עדיין נוקט \"ייצגו\" ו\"רשמו את התוצאה\")"," כתבו את התוצאה בשורת התוצאה.\"",null],
  ["(\"אם בטור…\", \"כשבאחד הטורים…\")","(\"אם בטור…\", \"כשמצטברות…\")",null],
  ["צעד אחד, בלי מספר: \"נסו לבנות את המספר 305 בלבנים.\"","צעד אחד, בלי מספר: \"נסו לבנות את המספר 305 בבית המספרים.\""],
  ["לחצו על הכפתור \"קבצו 10 לעשרת\" שבראש הטור.\" (אינו מסומן","לחצו על הכפתור \"קבצו 10\" שבראש הטור.\" (אינו מסומן"],
  ["\"בנו את המספר 347 בלבנים\", \"פרטו עשרת אחת לעשר יחידות\", \"כתבו בשורת התוצאה איזה מספר מייצגות הלבנים לאחר הפריטה\"","\"בנו את המספר 347 בבית המספרים.\", \"פרטו לבנת עשרת אחת לעשר לבני יחידה.\", \"כתבו בשורת התוצאה איזה מספר מייצגות הלבנים עכשיו.\""],
  ["\"כשבאחד הטורים מצטברות 10 לבנים, לחצו על הכפתור","\"כשמצטברות 10 לבנים בטור, לחצו על הכפתור",null],
  ["בנו בבית המספרים את שני המספרים. כאשר מצטברות 10 לבנים בטור,","בנו בבית המספרים את שני המספרים. כשמצטברות 10 לבנים בטור,"],
  ["\"בשורת המחוסר חסרה ספרת העשרות: 4▢2 − 128 = 314. גלו","\"בתרגיל 4▢2 − 128 = 314 חסרה ספרת העשרות של המחוסר. גלו"],
  ["\"בשורת המחוסר חסרות שתי ספרות: 6,0▢▢ − 2,847 = 3,158. גלו","\"בתרגיל 6,0▢▢ − 2,847 = 3,158 חסרות שתי ספרות של המחוסר. גלו"],
  ["הוסיפו 2 מאות, ואז הסירו 3 עשרות.","הוסיפו 2 מאות, ואז הוציאו 3 עשרות."],
  ["הוסיפו אלף אחד, ואז הסירו 6 מאות.","הוסיפו אלף אחד, ואז הוציאו 6 מאות."],
  ["סימון תיבות בחירה (Undo, עיגולי זיכרון, כרטיס סוקרטי)","סימון תיבות בחירה (כפתור ביטול הפעולה ↺, עיגולי הזיכרון, כרטיס החניכה)"]
] },
  { name: 'מסמך 03', id: '1deVf-QeccnmA37jb5lkFHh-6Df1NMYGSFrWQL29gK4A', version: null, edits: [
  ["ייצגו את המספרים בעזרת לבנים.","בנו בבית המספרים את שני המספרים.",null,1,2],
  ["ייצגו את המספרים בעזרת לבנים.","בנו בבית המספרים את שני המספרים.",null,1,1],
  ["ורשמו את ההמרה בעיגול הזיכרון. רשמו את התוצאה בשורת התוצאה.","ורשמו את ההמרה בעיגול הזיכרון. כתבו את התוצאה בשורת התוצאה."]
] }
];
function applyAll() {
  DOCS.forEach(function (d) {
    var body = DocumentApp.openById(d.id).getBody();
    var done = 0, already = 0, skipped = 0;
    d.edits.forEach(function (e) {
      var oldText = e[0], newText = e[1], marker = e[2], nth = e[3] || 1, total = e[4] || 1;
      var countBased = (marker === null);
      if (!countBased && body.findText(esc_(marker || newText))) { already++; return; }
      var matches = [], r = body.findText(esc_(oldText));
      while (r) { matches.push(r); r = body.findText(esc_(oldText), r); }
      if (countBased && matches.length === 0 && body.findText(esc_(newText))) { already++; return; }
      if (matches.length !== total) {
        skipped++;
        Logger.log(d.name + ': נמצא ' + matches.length + ' פעמים במקום ' + total + ', דולג: ' + oldText.slice(0, 50));
        return;
      }
      var found = matches[nth - 1];
      var t = found.getElement().asText();
      var s = found.getStartOffset();
      t.deleteText(s, found.getEndOffsetInclusive());
      t.insertText(s, newText);
      done++;
    });
    if (d.version && done > 0) updateVersionLine_(body, d.version);
    Logger.log(d.name + ' — הוחלפו: ' + done + '. כבר היו מעודכנים: ' + already + '. דולגו: ' + skipped + '.');
  });
}

function updateVersionLine_(body, version) {
  var MONTHS = ['בינואר', 'בפברואר', 'במרץ', 'באפריל', 'במאי', 'ביוני', 'ביולי', 'באוגוסט', 'בספטמבר', 'באוקטובר', 'בנובמבר', 'בדצמבר'];
  var pattern = 'גרסה [0-9.]+ \\| עודכן [^\\n]*';
  var matches = [], r = body.findText(pattern);
  while (r) { matches.push(r); r = body.findText(pattern, r); }
  if (matches.length !== 1) {
    Logger.log('שורת הגרסה נמצאה ' + matches.length + ' פעמים במקום 1; לא עודכנה.');
    return;
  }
  var now = new Date();
  var day = Number(Utilities.formatDate(now, 'Asia/Jerusalem', 'd'));
  var month = Number(Utilities.formatDate(now, 'Asia/Jerusalem', 'M'));
  var year = Utilities.formatDate(now, 'Asia/Jerusalem', 'yyyy');
  var time = Utilities.formatDate(now, 'Asia/Jerusalem', 'HH:mm');
  var line = 'גרסה ' + version + ' | עודכן ' + day + ' ' + MONTHS[month - 1] + ' ' + year + ', ' + time + ' (שעון ישראל)';
  var found = matches[0];
  var t = found.getElement().asText();
  var s = found.getStartOffset();
  t.deleteText(s, found.getEndOffsetInclusive());
  t.insertText(s, line);
  Logger.log('שורת הגרסה: ' + line);
}



function esc_(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

