// MathmatiCore PRD — batch 6 (9.10.2026) — station 1–2 details: 9 exact replacements. Safe to run more than once.
// Writes into the PRD the decisions the owner approved in chat (AGENTS.md Rule 1 way 2): session 1 refresher titles,
// the 305 step, the grouping picture, session 2 neutral feedback, the task 5 picture, the task 1 answer box, no automatic
// column advance in vertical exercises, and the Appendix B sentence. When at least one edit applies, the version line is
// set to version 7.9 with the current Israel date and time (updateVersionLine_).
// Each entry: [old, new, marker, nth, total]. marker = text whose presence means this edit was already applied;
// nth/total = replace the nth of exactly `total` occurrences.
var EDITS = [
  ["וכותרתו היא שם משימת האבחון שהוא משקף.", "וכותרתו לקוחה ממסמך 03."],
  ["כדי שיראה מה חסר.", "כדי שיבנה אותו בדרך הרגילה ויראה שטור העשרות ריק."],
  ["(משקף את משימה 5, שבה 25 לבני יחידה מוצגות על המסך)", "(משקף את משימה 5, שבה מוצגת תמונה של 25 לבני יחידה, בלי מספר)"],
  ["(כשהמשימה עצמה חוזרת).", "(כשהמשימה עצמה חוזרת). גם בשבע משימות האבחון עצמן, אחרי כל תשובה, נכונה או שגויה, מוצג משוב ניטרלי \"הַתְּשׁוּבָה הִתְקַבְּלָה!\" ו\"עוֹבְרִים לַמְּשִׂימָה הַבָּאָה...\", בלי לגלות אם התשובה נכונה; אחרי המשימה השביעית מוצג רק \"הַתְּשׁוּבָה הִתְקַבְּלָה!\"."],
  ["מסודרות בטור (ארבע לבנים ברוחב) בתוך מסגרת של טור יחידות.", "מסודרות בטור בתוך מסגרת של טור יחידות."],
  ["הכלל חל על כל משימה שיש בה שורת תוצאה (משימות 1, 3, 4, 5, 6 ו-7)", "הכלל חל על כל משימה שיש בה שורת תוצאה (משימות 3, 4, 5, 6 ו-7)"],
  ["התיבה היחידה של משימה 2 ותיבות המספר של סבב התיקונים הן ניטרליות לכל לומד", "תיבות התשובה היחידות של משימות 1 ו-2 ותיבות המספר של סבב התיקונים הן ניטרליות לכל לומד"],
  ["במשימות 1, 4 ו-5 המיקוד מתחיל בטור הגבוה (במשימה 5 בעשרות) והמעבר האוטומטי מתקדם ימינה. בתרגילי המאונך (משימות 3, 6 ו-7) המעבר האוטומטי נשאר מהיחידות שמאלה, כמו בחישוב במאונך בכל המפגשים.", "במשימות 4 ו-5 המיקוד מתחיל בטור הגבוה (במשימה 5 בעשרות) והמעבר האוטומטי מתקדם ימינה. בתרגילי חיבור וחיסור במאונך, במפגש 2 (משימות 3, 6 ו-7) ובכל המפגשים, סדר העבודה הוא מהיחידות שמאלה, אבל אחרי שהוקלדה ספרה המיקוד אינו עובר אוטומטית לטור הבא: הלומד עובר בעצמו לטור הבא, כך שיש לו זמן לרשום את ההמרה או את הפריטה בעיגול הזיכרון."],
  ["המודולים מתארים את המערכת כפי שהיא, ואין פער פתוח בין הדרישה למימוש.", "ה-PRD מתאר את המערכת המתוכננת; פער בין הדרישה למימוש הוא עבודה לקוד."]
];

var VERSION = '7.9';

function applyEdits() {
  var body = DocumentApp.getActiveDocument().getBody();
  var done = 0, already = 0, skipped = 0;
  EDITS.forEach(function (e) {
    var oldText = e[0], newText = e[1], marker = e[2] || e[1], nth = e[3] || 1, total = e[4] || 1;
    if (body.findText(esc_(marker))) { already++; return; }
    var matches = [], r = body.findText(esc_(oldText));
    while (r) { matches.push(r); r = body.findText(esc_(oldText), r); }
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
