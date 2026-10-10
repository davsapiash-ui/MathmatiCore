// MathmatiCore — 10.10.2026: the class resets move into the 'הגדרות ואיפוס' menu (PRD Module 23א, document 04).
// Run applyAll. Safe to run more than once.
var DOCS = [
  { name: "PRD", id: '1siy2VT-bPVy9LflxJBt-Xr7uQEW5umHPEh_vMVlmbWY', version: "7.18", edits: [
  ["כפתור \"איפוס המפגש לכיתה\" ממוקם בסרגל הרדאר, בין \"איפוס התראות\" (רמה 1) ל\"איפוס כל נתוני הכיתה\" (רמה 3).", "כפתור \"איפוס המפגש לכיתה\" ממוקם בתפריט \"הגדרות ואיפוס\" שבסרגל הרדאר, יחד עם \"איפוס התראות\" (רמה 1) ו\"איפוס כל נתוני הכיתה\" (רמה 3), בסדר הזה; שלושת הכפתורים אינם מוצגים גלויים בשורת הסרגל (החלטת בעל המוצר, 10.10.2026)."]
] },
  { name: "מסמך 04", id: '1d_pYxI_h9K-pY4VYy2cwJagxuYSRP-9-ovML40iSoeM', version: null, edits: [
  ["שלוש רמות איפוס נתונים אסינכרוניות ומבוקרות:", "שלוש רמות איפוס נתונים אסינכרוניות ומבוקרות, המצויות בתפריט \"הגדרות ואיפוס\" בסרגל הרדאר:"]
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

