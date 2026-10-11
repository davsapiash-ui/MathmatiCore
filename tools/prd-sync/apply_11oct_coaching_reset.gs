// MathmatiCore — 11.10.2026, the evening's decisions: the projector's coaching-card example comes from the AI engine
// (static card as fallback); three wordings per static card; approved examples in the AI prompt; a weekly report of
// rejected cards; the colours button in station 7 part א; the system reset wipes the mediation log and the rejected
// cards too; the teacher prints the login cards. Document 04 and the PRD (version 8.4). Run runAll. Safe to run again.
var DOCS = [
  { name: "מסמך 04", id: '1d_pYxI_h9K-pY4VYy2cwJagxuYSRP-9-ovML40iSoeM', edits: [
    ["בתחנות 4 עד 6 לחצן \"הצגת הצבעים בשורת התוצאה\" (בתחנה 4 רק ב\"תרגיל במאונך\")",
     "בתחנות 4 עד 7 לחצן \"הצגת הצבעים בשורת התוצאה\" (בתחנה 4 רק ב\"תרגיל במאונך\", ובתחנה 7 רק ב\"מגלים מה חסר\")",
     "ובתחנה 7 רק ב\"מגלים מה חסר\")"],
    ["אישור ההמלצה לכולם בלחיצה אחת, והלומדים שהתחילו את מפגש 2 ולא סיימו",
     "אישור ההמלצה לכולם בלחיצה אחת, והלומדים שהתחילו את מפגש 2 ולא סיימו. בתחתית המסך קודי הגישה של הלומדים והלחצן \"הדפסת כרטיסי כניסה לתלמידים\"",
     "בתחתית המסך קודי הגישה של הלומדים והלחצן"]
  ] }
];

var PRD = { name: "PRD", id: '1siy2VT-bPVy9LflxJBt-Xr7uQEW5umHPEh_vMVlmbWY', version: "8.4", edits: [
  ["הלחצן \"דוגמה לכרטיס החניכה\" פותח את כרטיס החניכה של הלומדים (בכותרת \"כרטיס החניכה\") עם הכרטיס הקבוע של אותה תחנה, בלי פנייה למנוע הבינה המלאכותית:",
   "הלחצן \"דוגמה לכרטיס החניכה\" פותח את כרטיס החניכה של הלומדים (בכותרת \"כרטיס החניכה\"). את הכרטיס כותב מנוע הבינה המלאכותית לפי תרגיל ההדגמה ולפי מה שבנוי על הלוח באותו רגע, באותם כללים ובאותה בדיקה של כרטיסי הלומדים. אם המנוע אינו עונה בתוך 8 שניות או שהכרטיס שלו נדחה, וכן בחשבון לצפייה בלבד, נפתח הכרטיס הקבוע של אותה תחנה. בפנייה למנוע אין שום פרט של לומד, ושום דבר אינו נרשם בנתוני המחקר (החלטת בעל המוצר, 11.10.2026). בשני המקרים:",
   "את הכרטיס כותב מנוע הבינה המלאכותית לפי תרגיל ההדגמה"],
  ["הכרטיסים: בתחנה 1 ובחלק ב של תחנה 7,",
   "הכרטיסים הקבועים: בתחנה 1 ובחלק ב של תחנה 7,",
   "הכרטיסים הקבועים: בתחנה 1 ובחלק ב של תחנה 7,"],
  ["that opens the learners' coaching card with the station's static card listed in the Hebrew text, static only: no AI call, no 15-second pause",
   "that opens the learners' coaching card written by the AI engine from the demonstration exercise and the board as it is at that moment, under the learners' rules and validator, falling back to the station's static card listed in the Hebrew text when the engine does not answer within 8 seconds or its card is rejected, and always for a read-only account; no learner detail is sent and nothing is recorded in the research data; no 15-second pause",
   "written by the AI engine from the demonstration exercise and the board"],
  ["בתחנות 4 עד 6, בתרגיל במאונך, הלחצן \"הצגת הצבעים בשורת התוצאה\"",
   "בתחנות 4 עד 7, בכל תרגיל במאונך (בתחנה 7 בחלק א), הלחצן \"הצגת הצבעים בשורת התוצאה\"",
   "בתחנות 4 עד 7, בכל תרגיל במאונך (בתחנה 7 בחלק א)"],
  ["in stations 4-6 (vertical only) a \"הצגת הצבעים בשורת התוצאה\"",
   "in every vertical part of stations 4-7 (station 7: part א) a \"הצגת הצבעים בשורת התוצאה\"",
   "in every vertical part of stations 4-7"],
  ["סימני הסיום ורישומי ההשלמה, ודוחות הכיתה (מודול 23). מחייב גיבוי",
   "סימני הסיום ורישומי ההשלמה, דוחות הכיתה (מודול 23), יומן התיווך של המורה (מדד 5) ורישומי כרטיסי החניכה שנדחו (מודול 13), כדי שלא יישאר במערכת דבר משיעורי ניסיון (החלטת בעל המוצר, 11.10.2026). מחייב גיבוי",
   "יומן התיווך של המורה (מדד 5) ורישומי כרטיסי החניכה שנדחו"],
  ["completion marks, catch-up records and class reports.",
   "completion marks, catch-up records, class reports, the teacher's mediation log (measure 5) and the rejected coaching-card records (Module 13).",
   "the teacher's mediation log (measure 5) and the rejected coaching-card records"],
  ["שהמנוע משפר ואינו סותר.",
   "שהמנוע משפר ואינו סותר. לצד העוגן נשלחים עד שני כרטיסים מאושרים נוספים של אותו מצב, במספרים של אותו תרגיל, כדוגמאות לסגנון; הבדיקה של הכרטיס שחוזר מהמנוע אינה משתנה (החלטת בעל המוצר, 11.10.2026).",
   "לצד העוגן נשלחים עד שני כרטיסים מאושרים נוספים של אותו מצב"],
  ["במקרה של כשל תקשורת, פקיעת זמן או כרטיס שנדחה, המערכת מגישה רמז סטטי.",
   "במקרה של כשל תקשורת, פקיעת זמן או כרטיס שנדחה, המערכת מגישה רמז סטטי. לרוב המצבים יש שלושה ניסוחים מאושרים של הרמז הסטטי, וכשאותו כרטיס נפתח שוב באותו תרגיל מוצג הניסוח הבא, כך שהלומד אינו רואה אותה שאלה פעמיים ברצף; כל כלל שסופר כרטיסים סופר את כל הניסוחים של כרטיס ככרטיס אחד. כל כרטיס שהבדיקה דוחה נשמר בשרת בלבד, בלי מזהה לומד ובלי טקסט של לומד (מזהה התרגיל, המפגש, סיבת הדחייה וטקסט הכרטיס), ובכל יום ראשון ב-08:00 נכתב לתיקייה \"4 מנהל\" בדרייב דוח בעברית על כרטיסי החניכה שנדחו בשבוע שחלף, כדי לשפר את המנוע (החלטת בעל המוצר, 11.10.2026).",
   "לרוב המצבים יש שלושה ניסוחים מאושרים של הרמז הסטטי"],
  ["הנפקת כרטיסי כניסה אנונימיים לתלמידים (1–12, לכל לומד קוד הגישה האישי שלו).",
   "הנפקת כרטיסי כניסה אנונימיים לתלמידים (1–12, לכל לומד קוד הגישה האישי שלו). את הכרטיסים מדפיסים מקונסולת המנהל, וגם המורה מדפיסה אותם במסך \"ניהול כיתה ומסלולים\", בלחצן \"הדפסת כרטיסי כניסה לתלמידים\" שליד קודי הגישה (החלטת בעל המוצר, 11.10.2026).",
   "וגם המורה מדפיסה אותם במסך \"ניהול כיתה ומסלולים\""]
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
