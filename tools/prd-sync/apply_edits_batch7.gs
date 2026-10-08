// MathmatiCore PRD — batch 7 (8.10.2026): 5 exact replacements. Safe to run more than once.
// Writes into the PRD the decisions the owner approved in chat (AGENTS.md Rule 1 way 2): the Socratic card answer
// buttons lock for 15 seconds (not 30), and condition 5 (conversion not performed) in session 8, which has no blocks,
// is read from the memory circles. When at least one edit applies, the version line is set to version 7.10 with the
// current Israel date and time (updateVersionLine_).
// Each entry: [old, new, marker, nth, total]. marker = text whose presence means the edit was already applied
// (omitted = the new text). marker null = count-based: used where the same sentence appears several times;
// the entries for it run in sequence (total 3, then 2, then 1), and the edit counts as applied when the old
// text no longer appears and the new text does. nth/total = replace the nth of exactly `total` occurrences.
var EDITS = [
  ["למשך 30 שניות (pointer-events: none", "למשך 15 שניות (pointer-events: none"],
  ["a 30-second pointer-events-disabled block", "a 15-second pointer-events-disabled block"],
  ["תשובה שגויה נועלת לחצנים ל-30 שניות.", "תשובה שגויה נועלת לחצנים ל-15 שניות."],
  ["(ד) ההמרה עדיין לא בוצעה בלבנים בטור הזה.", "(ד) ההמרה עדיין לא בוצעה בלבנים בטור הזה. במפגש 8, שאין בו לבנים, תנאי (ד) פירושו שההמרה לא נרשמה בעיגול הזיכרון: בחיבור, עיגול הזיכרון של הטור הבא, שאליו עוברת ההמרה, ריק; בחיסור, עיגול הזיכרון של הטור הזה, שבו נרשם כמה יש בו אחרי הפריטה, ריק.", "במפגש 8, שאין בו לבנים, תנאי (ד)"],
  ["which has not yet been performed with blocks in that column, checked per column;", "which has not yet been performed with blocks in that column (in session 8, which has no blocks: whose conversion has not been written in a memory circle, i.e. in addition the next column's circle, which receives the carry, is empty, and in subtraction that column's own circle, which records its new amount after the decomposition, is empty), checked per column;", "in session 8, which has no blocks: whose conversion"]
];

var VERSION = "7.10";

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
