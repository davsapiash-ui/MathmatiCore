// MathmatiCore — 11.10.2026: one name for the demonstration's two parts in every station: "חלק א" and "חלק ב",
// each with its topic beside it. Document 03 and the PRD (version 8.3). Run runAll. Safe to run more than once.
var DOCS = [
  { name: "מסמך 03", id: '1deVf-QeccnmA37jb5lkFHh-6Df1NMYGSFrWQL29gK4A', edits: [
    ["אחר כך המורה לוחצת על \"תשובות לבחירה\" ומראה",
     "אחר כך המורה לוחצת על \"חלק ב\" (\"תשובות לבחירה\") ומראה",
     "המורה לוחצת על \"חלק ב\" (\"תשובות לבחירה\")"],
    ["המורה לוחצת על \"תרגיל במאונך\" ואחר כך על \"התחילו מחדש\".",
     "המורה לוחצת על \"חלק א\" (\"תרגיל במאונך\") ואחר כך על \"התחילו מחדש\".",
     "המורה לוחצת על \"חלק א\" (\"תרגיל במאונך\")"],
    ["דוגמה א, ספרות חסרות:",
     "חלק א, מגלים מה חסר:",
     "חלק א, מגלים מה חסר:"],
    ["דוגמה ב, בנייה, הוספה והוצאה:",
     "חלק ב, משנים מספר (בנייה, הוספה והוצאה):",
     "חלק ב, משנים מספר (בנייה, הוספה והוצאה):"],
    ["המורה לוחצת על \"דוגמה ב\",",
     "המורה לוחצת על \"חלק ב\",",
     "המורה לוחצת על \"חלק ב\", בונה"]
  ] }
];

var PRD = { name: "PRD", id: '1siy2VT-bPVy9LflxJBt-Xr7uQEW5umHPEh_vMVlmbWY', version: "8.3", edits: [
  ["בתחנה 3 המורה עוברת בין \"חלק א\" ל\"חלק ב\", בתחנה 4 בין \"תרגיל במאונך\" ל\"תשובות לבחירה\", ובתחנה 7 בין \"דוגמה א\" ל\"דוגמה ב\";",
   "בתחנות 3, 4 ו-7 המורה עוברת בין שני חלקים, \"חלק א\" ו\"חלק ב\", וליד כל חלק שם הנושא שלו: בתחנה 3 \"פורטים לבנים\" ו\"קוראים וכותבים\", בתחנה 4 \"תרגיל במאונך\" ו\"תשובות לבחירה\", ובתחנה 7 \"מגלים מה חסר\" ו\"משנים מספר\" (החלטת בעל המוצר, 11.10.2026);",
   "המורה עוברת בין שני חלקים, \"חלק א\" ו\"חלק ב\""],
  ["בדוגמה א של תחנה 7",
   "בחלק א של תחנה 7",
   "בחלק א של תחנה 7", 2],
  ["בדוגמה ב של תחנה 7",
   "בחלק ב של תחנה 7",
   "בחלק ב של תחנה 7"],
  ["provide the part switch (station 3: \"חלק א\" and \"חלק ב\"; station 4: \"תרגיל במאונך\" and \"תשובות לבחירה\"; station 7: \"דוגמה א\" and \"דוגמה ב\")",
   "provide the part switch, labelled \"חלק א\" and \"חלק ב\" in every station that has two parts, each with its topic (station 3: \"פורטים לבנים\", \"קוראים וכותבים\"; station 4: \"תרגיל במאונך\", \"תשובות לבחירה\"; station 7: \"מגלים מה חסר\", \"משנים מספר\")",
   "labelled \"חלק א\" and \"חלק ב\" in every station that has two parts"],
  ["in station 7 example A,",
   "in station 7 part א,",
   "in station 7 part א,"]
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
