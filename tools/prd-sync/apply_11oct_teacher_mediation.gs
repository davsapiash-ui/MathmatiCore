// MathmatiCore — 11.10.2026: the teacher-mediation file and the researcher's journal for measure 5 (PRD modules 23 and 24, documents 01 and 04).
// Run applyAll. Safe to run more than once. Each text is replaced only if it is found exactly once; anything else is skipped and logged.
var DOCS = [
 { name: "PRD", id: '1siy2VT-bPVy9LflxJBt-Xr7uQEW5umHPEh_vMVlmbWY', version: "7.19", edits: [
  ["מדד 5, השפעת האנליטיקה על תיווך המורה, בוחן את המורה החוקרת עצמה. הוא נמדד ביומן החוקר ואינו מחושב במערכת.", "מדד 5, השפעת האנליטיקה על תיווך המורה, בוחן את המורה החוקרת עצמה. הוא נמדד ביומן החוקר ואינו מחושב במערכת. יומן החוקר מתנהל בתום כל מפגש, שורה לכל אירוע תיווך ולא שורה לכל לומד, כי לומד יכול לקרוא למורה כמה פעמים, וכל קריאה היא החלטה נפרדת של המורה. המערכת רושמת עם זמן כל קריאת עזרה, התראת רדאר והודעת צ'אט, והמורה החוקרת מוסיפה לכל שורה בקובץ \"תיווך המורה\" (מודול 24) שלוש עמודות: מה עשתה (כתבה, ניגשה, כתבה וניגשה, או לא פעלה), האם הנתונים הובילו אותה לכך (כן או לא), והערה של מילה אחת כשצריך. גישה פיזית שלא בעקבות אירוע נרשמת כשורה נוספת, עם שעה משוערת."],
  ["הייצוא מפיק חמישה קובצי CSV נפרדים:", "הייצוא מפיק חמישה קובצי CSV נפרדים של הלומדים, וקובץ שישי, תיווך המורה, המתואר אחרי הרשימה:"],
  ["בקובץ המפגשים, עמודות המונים סופרות כל אירוע שנרשם במפגש", "קובץ תיווך המורה הוא הצד של המערכת ביומן החוקר של מדד 5 (מודול 23): שורה לכל אירוע תיווך של לומד, עם זמן. הוא מכיל קריאות עזרה, התראות רדאר, הודעות צ'אט של המורה ושל הלומד לפי כיוון, זמן ואורך בלבד וללא הטקסט, אישור שער האבחון, שיוך פרופיל התמיכה וסבבי זמן ההשלמה. הוא אינו כולל טקסט חופשי ואינו כולל זהות של מורה. בקובץ המפגשים, עמודות המונים סופרות כל אירוע שנרשם במפגש"],
  ["יומן איפוסים — שורה לכל רישום ב-reset_audit_log, כולל ייצואים.", "יומן איפוסים — שורה לכל רישום ב-reset_audit_log, כולל ייצואים. תיווך המורה — שורה לכל אירוע תיווך של לומד, בעמודות event_time_iso, student_id, session_number, session_number_basis, event_kind, event_source, ref_id, detail_code, detail_number."],
  ["Emit five separate CSV files", "Emit six separate CSV files"],
  ["recordings, reflections, reset log)", "recordings, reflections, reset log, teacher mediation with one row per mediation event of a learner, closed-list values only, no chat text and no teacher identity)"]
] },
 { name: "מסמך 01", id: '1fD7rDVBHbwskJ7b2ybKNUjgSuCHijHxTkPvjZ3oXhMI', version: null, edits: [
  ["ארבעת המדדים הראשונים מחושבים במערכת מתוך עקבות הלמידה.", "ארבעת המדדים הראשונים מחושבים במערכת מתוך עקבות הלמידה. המדד החמישי נמדד ביומן המורה החוקרת. לצורך המדד שומרת המערכת, עם זמנים, את קריאות העזרה של הלומדים, את התראות הרדאר ואת הודעות המורה, ובתום כל מפגש מסמנת המורה לכל אירוע כזה מה עשתה (כתבה, ניגשה, כתבה וניגשה או לא פעלה) והאם הנתונים הובילו אותה לכך."]
] },
 { name: "מסמך 04", id: '1d_pYxI_h9K-pY4VYy2cwJagxuYSRP-9-ovML40iSoeM', version: null, edits: [
  ["הרפלקציות ויומן האיפוסים)", "הרפלקציות, יומן האיפוסים ויומן תיווך המורה, הכולל עם זמנים את קריאות העזרה, התראות הרדאר והודעות המורה, בלי טקסט ובלי זיהוי של המורה)"]
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

