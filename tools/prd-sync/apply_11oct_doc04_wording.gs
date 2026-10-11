// MathmatiCore — 11.10.2026, night: three wording fixes in document 04 so it matches the PRD (reset menu, level 3,
// the radar's colour change). Document 04 only; the PRD does not change. Run runAll. Safe to run again.
var DOCS = [
  { name: "מסמך 04", id: '1d_pYxI_h9K-pY4VYy2cwJagxuYSRP-9-ovML40iSoeM', edits: [
    ["שלוש רמות איפוס נתונים אסינכרוניות ומבוקרות, המצויות בתפריט \"הגדרות ואיפוס\" בסרגל הרדאר:",
     "שלוש רמות איפוס נתונים אסינכרוניות ומבוקרות. בתפריט \"הגדרות ואיפוס\" שבסרגל הרדאר נמצאים \"איפוס התראות\", \"איפוס המפגש לכיתה\" ו\"איפוס כל נתוני הכיתה\"; איפוס של לומד בודד נעשה במסך \"ניהול כיתה ומסלולים\" ובחלונית הלומד:",
     "איפוס של לומד בודד נעשה במסך \"ניהול כיתה ומסלולים\" ובחלונית הלומד"],
    ["רמה 3: איפוס מאגר הנתונים הכיתתי ההיסטורי לצורך תחילת מחזור מחקר חדש",
     "רמה 3: \"איפוס כל נתוני הכיתה\", למשל לפני תחילת המחקר, כדי שלא יישאר במערכת דבר משיעורי ניסיון",
     "כדי שלא יישאר במערכת דבר משיעורי ניסיון"],
    ["חיוויי צבע חלקים ואיטיים (מניעת תנועה מהירה המסיחה את דעת המורה בכיתה)",
     "מעבר בין מצבים מוצג כמעבר צבע קצר אחד, בלי הבהוב ובלי פעימה (מניעת תנועה המסיחה את דעת המורה בכיתה)",
     "מעבר בין מצבים מוצג כמעבר צבע קצר אחד, בלי הבהוב"]
  ] }
];

var PRD = { name: "PRD", id: '1siy2VT-bPVy9LflxJBt-Xr7uQEW5umHPEh_vMVlmbWY', version: "8.5", edits: [] };

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
