// MathmatiCore PRD — batch 8 (9.10.2026): projector demonstration screen (module 15). Safe to run more than once.
var VERSION = "7.11";
var EDITS = [  ["עם כיבוי המקרן, הסביבה משתחררת מיד (P95 ≤ 1000ms) לאותו מצב מדויק.", "עם כיבוי המקרן, הסביבה משתחררת מיד (P95 ≤ 1000ms) לאותו מצב מדויק. מסך ההדגמה של המורה. במסך המקרן המורה בוחרת תחנה (1 עד 8), בהתאם למבנה השיעור שבמסמכים 02 ו-03: בתחנה 1 מוצג בית מספרים ריק להדגמת הכלים; בתחנות 3 עד 7 מוצגים תרגילי הדגמה, הדגמה אחת משותפת לשני המסלולים, עם הכלים של התחנה (שורת התוצאה, עיגולי הזיכרון, המקלדת וביטול הפעולה), שמטרתם להראות טכנית כיצד מבצעים את פעולות הליבה של התחנה. תרגילי ההדגמה משקפים את תבניות התרגילים של התחנה בטווח המספרים של מסלול צמצום פערי קדם, ומספריהם שונים מכל תרגיל שהלומדים מקבלים: תחנה 3 — בניית 230 ופריטת מאה אחת לעשר עשרות (2 מאות ו-13 עשרות), ובניית \"ארבע מאות ושבע\" וכתיבתו 407; תחנה 4 — 238 + 146 = 384 (הקבצה אחת ביחידות); תחנה 5 — 74 − 38 = 36 (פריטה אחת ביחידות); תחנה 6 — 700 − 234 = 466 (פריטה כפולה דרך האפס שבעשרות); תחנה 7 — 2▢3 + 134 = 35▢ (פתרון: 223 + 134 = 357), ובניית 260, הוספת מאה אחת והורדת 8 עשרות (360, פריטת מאה, 280). בסוף ההדגמה המורה אומרת משפט אחד על לבנת האלף, כמתואר במסמך 03. בתחנות 2 ו-8 אין הדגמה (מסמכים 02 ו-03 אוסרים הקניה או הדגמה בהן), ובחירתן מציגה למורה הסבר קצר על כך. דבר מן ההדגמה אינו נרשם בטלמטריה או בנתוני המחקר.", "מסך ההדגמה של המורה."],
  ["Ignore outdated updates using timestamp validation.", "Ignore outdated updates using timestamp validation. On the teacher's projector screen, let the teacher pick a station (1-8): station 1 shows an empty place-value board for demonstrating the tools; stations 3-7 show the fixed demonstration exercises listed in the Hebrew text, one demonstration shared by both paths, with the station's tools, in the remediation range and with numbers different from every learner exercise; stations 2 and 8 have no demonstration and show a short explanation. Never record a demonstration in telemetry or research data.", "On the teacher's projector screen, let the teacher pick a station"]
];

function applyEdits() {
  var body = DocumentApp.getActiveDocument().getBody();
  var done = 0, already = 0, skipped = 0;
  EDITS.forEach(function (e) {
    var oldText = e[0], newText = e[1], marker = e[2], nth = e[3] || 1, total = e[4] || 1;
    var countBased = (marker === null);
    if (!countBased && body.findText(esc_(marker || newText))) { already++; return; }
    var matches = [], r = body.findText(esc_(oldText));
    while (r) { matches.push(r); r = body.findText(esc_(oldText), r); }
    if (countBased && matches.length === 0 && body.findText(esc_(newText))) { already++; return; }
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
  if (done > 0) updateVersionLine_(body, VERSION);
  Logger.log('הוחלפו: %s. כבר היו מעודכנים: %s. דולגו: %s.', done, already, skipped);
}

// Replaces the single "גרסה X | עודכן ..." line with the given version and the current Israel date and time.
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

