// MathmatiCore — 11.10.2026, night: alignment after the cross-document check. Document 03: the demonstration
// scripts quote the static card (the AI writes the card now), and station 7 part א gets the colours button.
// PRD (version 8.5): the "approve the recommendation for all" button and the closing checklist and after-close
// summary, both already built and described in document 04. Run runAll. Safe to run again.
var DOCS = [
  { name: "מסמך 03", id: '1deVf-QeccnmA37jb5lkFHh-6Df1NMYGSFrWQL29gK4A', edits: [
    ["ולוחצת על \"דוגמה לכרטיס החניכה\". נפתח כרטיס החניכה, כמו שהתלמידים רואים אותו, ובו השאלה \"נסו לחשוב: בית המספרים עדיין ריק.",
     "ולוחצת על \"דוגמה לכרטיס החניכה\". נפתח כרטיס החניכה, כמו שהתלמידים רואים אותו. את הכרטיס כותב מנוע הבינה המלאכותית לפי מה שבנוי על הלוח באותו רגע, ולכן הניסוח עשוי להשתנות; השאלות והתשובות שבתסריטי ההדגמה הן של הכרטיס הקבוע, שמוצג כשהמנוע אינו עונה. בכל כרטיס המורה בוחרת קודם בכוונה תשובה לא נכונה, מראה את הרמז, ואחר כך בוחרת בתשובה הנכונה. בכרטיס הקבוע של תחנה זו השאלה היא \"נסו לחשוב: בית המספרים עדיין ריק.",
     "השאלות והתשובות שבתסריטי ההדגמה הן של הכרטיס הקבוע"],
    ["בודקת את טור המאות: 2 ועוד 1 שווה 3, כמו בתוצאה.",
     "בודקת את טור המאות: 2 ועוד 1 שווה 3, כמו בתוצאה. אם רוצים, המורה לוחצת על \"הצגת הצבעים בשורת התוצאה\" ומראה שכל תיבה צבועה בצבע של הטור שלה בבית המספרים.",
     "כמו בתוצאה. אם רוצים, המורה לוחצת על \"הצגת הצבעים בשורת התוצאה\""]
  ] }
];

var PRD = { name: "PRD", id: '1siy2VT-bPVy9LflxJBt-Xr7uQEW5umHPEh_vMVlmbWY', version: "8.5", edits: [
  ["הכפתור שהמטריקס ממליץ עליו מסומן \"מומלץ\".",
   "הכפתור שהמטריקס ממליץ עליו מסומן \"מומלץ\". מעל רשימת הלומדים יש לחצן אחד שמאשר בלחיצה אחת את ההמלצה של המטריקס לכל הלומדים הממתינים שסיימו את מפגש 2, כלומר את הכפתור המסומן \"מומלץ\" של כל אחד מהם; את הרמה האחרת המורה מאשרת לכל לומד בנפרד (החלטת בעל המוצר, 11.10.2026).",
   "מעל רשימת הלומדים יש לחצן אחד שמאשר בלחיצה אחת את ההמלצה"],
  ["ומוצג שוב ברשימת הסגירה של המפגש.",
   "ומוצג שוב ברשימת הסגירה של המפגש. רשימת הסגירה נפתחת כשהמורה לוחצת על סגירת המפגש, ובה ארבעה שלבים: קריאות לעזרה פתוחות (עם לחצן שמסמן את כולן כטופלו), מצב המקרן, תלמידים שלא סיימו, ואירועים שלא תועדו. אף שלב אינו חוסם את הסגירה, חוץ מבחירת סיבה לכל תלמיד שלא סיים. אחרי הסגירה מוצג למורה בלבד \"סיכום מפגש N\", בלי שמות ולא במקרן: צבעי הרדאר ברגע הסגירה, כמה מתוך 12 סיימו, סיווגי הטעות במפגש ומספר הקריאות לעזרה (החלטת בעל המוצר, 11.10.2026).",
   "רשימת הסגירה נפתחת כשהמורה לוחצת על סגירת המפגש"]
] };

function runAll() { applyAll(); applyPrd(); }

function applyAll() {
  DOCS.forEach(function (d) {
    var body = DocumentApp.openById(d.id).getBody();
    var done = 0, already = 0, skipped = 0;
    d.edits.forEach(function (e) {
      var r = applyEdit_(body, d.name, e);
      if (r === 'done') done++; else if (r === 'already') already++; else skipped++;
    });
    Logger.log(d.name + ' — הוחלפו: ' + done + '. כבר היו מעודכנים: ' + already + '. דולגו: ' + skipped + '.');
  });
}

function applyPrd() {
  var body = DocumentApp.openById(PRD.id).getBody();
  var done = 0, already = 0, skipped = 0;
  PRD.edits.forEach(function (e) {
    var r = applyEdit_(body, PRD.name, e);
    if (r === 'done') done++; else if (r === 'already') already++; else skipped++;
  });
  if (done > 0) updateVersionLine_(body, PRD.version);
  Logger.log('PRD — הוחלפו: ' + done + '. כבר היו מעודכנים: ' + already + '. דולגו: ' + skipped + '.');
}

function applyEdit_(body, name, e) {
  var oldText = e[0], newText = e[1], marker = e[2], expected = e[3] || 1;
  var plain = body.getText();
  if (plain.indexOf(marker) !== -1) return 'already';
  var n = plain.split(oldText).length - 1;
  if (n !== expected) { Logger.log(name + ': נמצא ' + n + ' פעמים במקום ' + expected + ', דולג: ' + oldText.slice(0, 50)); return 'skipped'; }
  for (var k = 0; k < expected; k++) {
    if (!replaceOnce_(body, oldText, newText)) { Logger.log(name + ': לא ברצף עיצוב אחד, דולג: ' + oldText.slice(0, 50)); return 'skipped'; }
  }
  return 'done';
}

function replaceOnce_(body, oldText, newText) {
  var head = oldText.slice(0, 40);
  var r = body.findText(esc_(head));
  while (r) {
    var t = r.getElement().asText();
    var s = t.getText().indexOf(oldText);
    if (s !== -1) { t.deleteText(s, s + oldText.length - 1); t.insertText(s, newText); return true; }
    r = body.findText(esc_(head), r);
  }
  return false;
}

function esc_(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function updateVersionLine_(body, version) {
  var MONTHS = ['בינואר', 'בפברואר', 'במרץ', 'באפריל', 'במאי', 'ביוני', 'ביולי', 'באוגוסט', 'בספטמבר', 'באוקטובר', 'בנובמבר', 'בדצמבר'];
  var pattern = 'גרסה [0-9.]+ \\| עודכן [^\\n]*';
  var matches = [], r = body.findText(pattern);
  while (r) { matches.push(r); r = body.findText(pattern, r); }
  if (matches.length !== 1) { Logger.log('שורת הגרסה לא עודכנה.'); return; }
  var now = new Date();
  var line = 'גרסה ' + version + ' | עודכן ' + Number(Utilities.formatDate(now, 'Asia/Jerusalem', 'd')) + ' ' + MONTHS[Number(Utilities.formatDate(now, 'Asia/Jerusalem', 'M')) - 1] + ' ' + Utilities.formatDate(now, 'Asia/Jerusalem', 'yyyy') + ', ' + Utilities.formatDate(now, 'Asia/Jerusalem', 'HH:mm') + ' (שעון ישראל)';
  var t = matches[0].getElement().asText(), s = matches[0].getStartOffset();
  t.deleteText(s, matches[0].getEndOffsetInclusive());
  t.insertText(s, line);
  Logger.log('שורת הגרסה: ' + line);
}
