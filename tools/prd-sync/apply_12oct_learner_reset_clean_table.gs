// MathmatiCore — 12.10.2026: איפוס לומד בודד: "לנקות גם את רשימת הפעולות", הצגת הפעולות מהגיבוי ודוח מהגיבוי (PRD 8.8, מסמך 04).
var DOCS = [
  { name: "מסמך 04", id: '1d_pYxI_h9K-pY4VYy2cwJagxuYSRP-9-ovML40iSoeM', version: null, edits: [
    ["רמה 2: איפוס המפגש הפעיל של לומד בודד (ברירת המחדל) או איפוס מוחלט של הלומד, או איפוס המפגש הפעיל של כל הכיתה בפעולה אחת","רמה 2: איפוס המפגש הפעיל של לומד בודד (ברירת המחדל) או איפוס מוחלט של הלומד, או איפוס המפגש הפעיל של כל הכיתה בפעולה אחת. באיפוס של לומד בודד המורה יכולה לסמן גם \"לנקות גם את רשימת הפעולות\": הפעולות נשמרות אז רק בגיבוי, ובמסע הלמידה של הלומד אפשר להציג אותן מהגיבוי ולהפיק עליהן דוח",". באיפוס של לומד בודד המורה יכולה לסמן גם \"לנקות גם את רשימת הפעולות\":",1],
    ["ובפרק נפרד, \"לפני האיפוס\", היכן היו הטעויות קודם לכן.","ובפרק נפרד, \"לפני האיפוס\", היכן היו הטעויות קודם לכן. אם המורה ניקתה באיפוס את רשימת הפעולות, הן מופיעות רק בדוח שמופק מהגיבוי.","אם המורה ניקתה באיפוס את רשימת הפעולות, הן מופיעות רק בדוח שמופק מהגי",1]
  ] },
  { name: "PRD", id: '1siy2VT-bPVy9LflxJBt-Xr7uQEW5umHPEh_vMVlmbWY', version: '8.8', edits: [
    ["איפוס לומד בודד: שני היקפים. בחלון האישור המורה בוחרת בין שני היקפים, וברירת המחדל היא \"המפגש הנוכחי בלבד\".","איפוס לומד בודד: שני היקפים. בחלון האישור המורה בוחרת בין שני היקפים, וברירת המחדל היא \"המפגש הנוכחי בלבד\". בשני ההיקפים יש בחלון גם תיבת סימון, \"לנקות גם את רשימת הפעולות\", שאינה מסומנת כברירת מחדל (החלטת בעל המוצר, 12.10.2026). כשהיא מסומנת, אחרי שהגיבוי נכתב נמחקות מהמערכת גם הפעולות המתועדות של הלומד: בהיקף \"המפגש הנוכחי בלבד\" הפעולות של אותו מפגש בלבד, ובאיפוס מוחלט כל הפעולות שלו. הפעולות האלה נשמרות רק בקובץ הגיבוי, וגיבוי כזה נכתב תמיד גם ל-Cloud Storage (backups/{class_id}/), כדי שהמערכת תוכל לקרוא אותו. בעמוד המסע של הלומד (מודול 21) מוצגים אז, ליד האיפוס, שני כפתורים: \"הצגת הפעולות מהגיבוי\", שמציג את טבלת הפעולות שנמחקו לקריאה בלבד, ו\"דוח מהגיבוי\", שמפיק על הפעולות שבגיבוי דוח לומד (מודול 23), כולל הניתוח של מנוע הבינה, כקובץ חדש. הפעולות שנמחקו אינן נכללות עוד בדוחות הרגילים, בסעיף \"לפני האיפוס\" ובייצוא נתוני המחקר; הן נמצאות בקובץ הגיבוי. ברישום האיפוס נשמר actions_cleared: true.","בשני ההיקפים יש בחלון גם תיבת סימון, \"לנקות גם את רשימת הפעולות\", שאי",1],
    ["אירועי הטלמטריה, הדוחות ורישום ההשלמה נשארים, והדוחות סופרים מאז רק את הריצה החדשה (מודול 23).","אירועי הטלמטריה, הדוחות ורישום ההשלמה נשארים, והדוחות סופרים מאז רק את הריצה החדשה (מודול 23); אם סומן \"לנקות גם את רשימת הפעולות\", אירועי הטלמטריה של אותו מפגש נמחקים אחרי הגיבוי.","; אם סומן \"לנקות גם את רשימת הפעולות\", אירועי הטלמטריה של אותו מפגש נמ",1],
    ["רשימת הפעולות, הדוחות והרפלקציות ב-Cloud Firestore נכללות בגיבוי ונשארות במערכת.","רשימת הפעולות, הדוחות והרפלקציות ב-Cloud Firestore נכללות בגיבוי ונשארות במערכת; אם סומן \"לנקות גם את רשימת הפעולות\", רשימת הפעולות של הלומד נמחקת אחרי הגיבוי, והדוחות והרפלקציות נשארים.","; אם סומן \"לנקות גם את רשימת הפעולות\", רשימת הפעולות של הלומד נמחקת אח",1],
    ["איפוס מערכת הוא הפעולה היחידה שמוחקת טלמטריה, ותמיד אחרי גיבוי.","רק איפוס מערכת, ואיפוס לומד בודד שבו סומן \"לנקות גם את רשימת הפעולות\", מוחקים טלמטריה, ותמיד אחרי גיבוי.","רק איפוס מערכת, ואיפוס לומד בודד שבו סומן \"לנקות גם את רשימת הפעולות\",",1],
    ["אין שחזור אוטומטי מגיבוי; הגיבוי הוא ראיה מחקרית לקריאה.","אין שחזור אוטומטי מגיבוי; הגיבוי הוא ראיה מחקרית לקריאה. אחרי איפוס לומד שבו נמחקה רשימת הפעולות, המערכת קוראת את הפעולות מהגיבוי שב-Cloud Storage כדי להציג אותן ולהפיק עליהן דוח (סעיף ב.2), ואינה מחזירה אותן למערכת.","אחרי איפוס לומד שבו נמחקה רשימת הפעולות, המערכת קוראת את הפעולות מהגי",1],
    ["מה שנרשם לפני האיפוס מופיע בסעיף נפרד, \"לפני האיפוס\", ואינו משפיע על הציון.","מה שנרשם לפני האיפוס מופיע בסעיף נפרד, \"לפני האיפוס\", ואינו משפיע על הציון. פעולות שהמורה מחקה באיפוס (\"לנקות גם את רשימת הפעולות\", מודול 23א §ב.2) אינן מופיעות בסעיף זה; עליהן מפיקים \"דוח מהגיבוי\".","פעולות שהמורה מחקה באיפוס (\"לנקות גם את רשימת הפעולות\", מודול 23א §ב.",1],
    ["Allow at most one reset per class at a time.","Allow at most one reset per class at a time. On a single-learner reset, offer the checkbox \"לנקות גם את רשימת הפעולות\", unticked by default: when ticked, write the backup to Cloud Storage as well, then delete the learner's telemetry for the reset session (active_session) or all of it (full_student), record actions_cleared: true, and let the teacher view those actions read-only from the Storage backup and generate a learner report, with the AI analysis, from them; never write them back into the system.","On a single-learner reset, offer the checkbox \"לנקות גם את רשימת הפעו",1],
    ["אין מחיקה מתוזמנת: הטלמטריה נמחקת רק באיפוס מערכת (רמה 3), ורק אחרי גיבוי.","אין מחיקה מתוזמנת: הטלמטריה נמחקת רק באיפוס מערכת (רמה 3), או באיפוס לומד בודד שבו סומן \"לנקות גם את רשימת הפעולות\" (מודול 23א §ב.2), ורק אחרי גיבוי.","או באיפוס לומד בודד שבו סומן \"לנקות גם את רשימת הפעולות\" (מודול 23א §ב",1],
    ["באותו אופן שבו מאופס לומד בודד, ובאוסף sessions נמחקים רק מסמכי המפגש הזה.","באותו אופן שבו מאופס לומד בודד (בלי האפשרות לנקות את רשימת הפעולות, שקיימת רק באיפוס של לומד בודד), ובאוסף sessions נמחקים רק מסמכי המפגש הזה.","(בלי האפשרות לנקות את רשימת הפעולות, שקיימת רק באיפוס של לומד בודד),",1],
    ["מה שנרשם לפני האיפוס מופיע בסעיף \"לפני האיפוס\" ואינו משנה ציון או קבוצה.","מה שנרשם לפני האיפוס מופיע בסעיף \"לפני האיפוס\" ואינו משנה ציון או קבוצה. פעולות שהמורה מחקה באיפוס של לומד בודד אינן מופיעות בדוח הכיתה.","פעולות שהמורה מחקה באיפוס של לומד בודד אינן מופיעות בדוח הכיתה.",1],
    ["אירועים שעדיין המתינו בתור של מכשיר בזמן האיפוס מגיעים אחריו ואינם בגיבוי.","אירועים שעדיין המתינו בתור של מכשיר בזמן האיפוס מגיעים אחריו ואינם בגיבוי. אחרי איפוס לומד שבו נמחקה רשימת הפעולות, אירוע של אותו לומד מהמפגש שנוקה, שנוצר במכשיר לפני האיפוס, אינו חוזר לרשימת הפעולות גם כשהוא מגיע או נשלח שוב אחרי האיפוס: השרת מעביר אותו לקובץ נפרד ב-Cloud Storage, \"פעולות שהגיעו אחרי האיפוס\", המקושר לאותו רישום איפוס, והוא מוצג ונכלל יחד עם הפעולות שבגיבוי.","אחרי איפוס לומד שבו נמחקה רשימת הפעולות, אירוע של אותו לומד מהמפגש שנ",1],
    ["עם נגן שנפתח בלי אינטרנט ובלי כניסה.","עם נגן שנפתח בלי אינטרנט ובלי כניסה. פעולות שנמחקו באיפוס (מודול 23א §ב.2) אינן בקובץ; הן נמצאות בגיבוי.","פעולות שנמחקו באיפוס (מודול 23א §ב.2) אינן בקובץ; הן נמצאות בגיבוי.",1],
    ["לכל מפגש שיש בו פעולות מתועדות, מוצג כפתור \"הפיקו דוח למפגש N\".","לכל מפגש שיש בו פעולות מתועדות, מוצג כפתור \"הפיקו דוח למפגש N\". אחרי איפוס שבו נמחקה רשימת הפעולות מוצג לצדו גם הכפתור \"דוח מהגיבוי\", שמפיק את אותו דוח מהפעולות שבגיבוי.","אחרי איפוס שבו נמחקה רשימת הפעולות מוצג לצדו גם הכפתור \"דוח מהגיבוי\",",1],
    ["מנהל המערכת אינו קורא אותו.","מנהל המערכת אינו קורא אותו. גם הצגת הפעולות מהגיבוי והדוח מהגיבוי זמינות למורה של הכיתה בלבד.","גם הצגת הפעולות מהגיבוי והדוח מהגיבוי זמינות למורה של הכיתה בלבד.",1]
  ] }
];

// Run runAll. It changes only the sentences listed above, each only where it occurs exactly as expected,
// and never adds, deletes or moves a paragraph. Running it twice changes nothing the second time.
// checkAll reports what runAll would do, without changing anything.
function runAll() { DOCS.forEach(function (d) { var n = applyDoc_(d, false); if (d.version && n > 0) updateVersionLine_(DocumentApp.openById(d.id).getBody(), d.version); }); Logger.log('סיום.'); }
function checkAll() { DOCS.forEach(function (d) { applyDoc_(d, true); }); Logger.log('סיום הבדיקה. לא שונה דבר.'); }

function applyDoc_(d, dry) {
  var texts = [];
  walk_(DocumentApp.openById(d.id).getBody(), texts);
  var cache = texts.map(function (t) { return norm_(t.getText()); });
  var done = 0, already = 0, skipped = 0;
  d.edits.forEach(function (e) {
    var r = applyEdit_(texts, cache, d.name, e, dry);
    if (r === 'done') done++; else if (r === 'already') already++; else skipped++;
  });
  Logger.log(d.name + (dry ? ' (בדיקה)' : '') + ' — ' + (dry ? 'יוחלפו: ' : 'הוחלפו: ') + done + '. כבר היו מעודכנים: ' + already + '. דולגו: ' + skipped + '.');
  return done;
}

function walk_(el, out) {
  var type = el.getType();
  if (type === DocumentApp.ElementType.PARAGRAPH || type === DocumentApp.ElementType.LIST_ITEM) { out.push(el.editAsText()); return; }
  if (typeof el.getNumChildren === 'function') {
    for (var i = 0; i < el.getNumChildren(); i++) walk_(el.getChild(i), out);
  }
}

function norm_(s) { return s.replace(/\u00A0/g, ' '); }

function applyEdit_(texts, cache, name, e, dry) {
  if (e[4]) return applyAfter_(texts, cache, name, e, dry);
  var oldT = norm_(e[0]), newT = e[1], marker = norm_(e[2]), expected = e[3] || 1;
  var n = 0, seen = false;
  cache.forEach(function (s) {
    if (s.indexOf(marker) !== -1) seen = true;
    n += s.split(oldT).length - 1;
  });
  if (seen) return 'already';
  if (n !== expected) { Logger.log(name + ': נמצא ' + n + ' פעמים במקום ' + expected + ', דולג: ' + oldT.slice(0, 60)); return 'skipped'; }
  if (dry) return 'done';
  var k = 0;
  for (var i = 0; i < texts.length && k < expected; i++) {
    var p = cache[i].indexOf(oldT);
    while (p !== -1 && k < expected) {
      replaceAt_(texts[i], p, oldT, newT);
      cache[i] = norm_(texts[i].getText());
      k++;
      p = cache[i].indexOf(oldT, p + newT.length);
    }
  }
  return 'done';
}

// A tree spacer line is not unique, so it is found as the paragraph right after a unique paragraph.
function applyAfter_(texts, cache, name, e, dry) {
  var anchor = norm_(e[4]), hits = [];
  cache.forEach(function (s, i) { if (s.indexOf(anchor) !== -1) hits.push(i); });
  if (hits.length !== 1) { Logger.log(name + ': שורת העוגן נמצאה ' + hits.length + ' פעמים, דולג: ' + anchor.slice(0, 60)); return 'skipped'; }
  var t = texts[hits[0] + 1];
  if (!t) return 'skipped';
  var cur = cache[hits[0] + 1];
  if (cur === e[1]) return 'already';
  if (cur !== norm_(e[0])) { Logger.log(name + ': השורה שאחרי העוגן שונה מהצפוי, דולג: ' + anchor.slice(0, 60)); return 'skipped'; }
  if (dry) return 'done';
  replaceAt_(t, 0, cur, e[1]);
  cache[hits[0] + 1] = norm_(t.getText());
  return 'done';
}

function isHigh_(c) { return c >= 0xD800 && c <= 0xDBFF; }
function isLow_(c) { return c >= 0xDC00 && c <= 0xDFFF; }

// Replaces only the part that differs, so the formatting of the unchanged start and end stays as it is.
function replaceAt_(t, p, oldT, newT) {
  var pre = 0;
  while (pre < oldT.length && pre < newT.length && oldT.charAt(pre) === newT.charAt(pre)) pre++;
  if (pre > 0 && isHigh_(oldT.charCodeAt(pre - 1))) pre--;
  var suf = 0;
  while (suf < oldT.length - pre && suf < newT.length - pre && oldT.charAt(oldT.length - 1 - suf) === newT.charAt(newT.length - 1 - suf)) suf++;
  if (suf > 0 && isLow_(oldT.charCodeAt(oldT.length - suf))) suf--;
  var start = p + pre, end = p + oldT.length - suf - 1, ins = newT.substring(pre, newT.length - suf);
  if (end >= start) t.deleteText(start, end);
  if (ins.length) t.insertText(start, ins);
}

function updateVersionLine_(body, version) {
  var MONTHS = ['בינואר', 'בפברואר', 'במרץ', 'באפריל', 'במאי', 'ביוני', 'ביולי', 'באוגוסט', 'בספטמבר', 'באוקטובר', 'בנובמבר', 'בדצמבר'];
  var pattern = 'גרסה [0-9.]+ ' + String.fromCharCode(92) + '| עודכן [^' + String.fromCharCode(92) + 'n]*';
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
