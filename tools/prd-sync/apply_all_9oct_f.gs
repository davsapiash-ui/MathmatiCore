// MathmatiCore — one script (9.10.2026): everything pending in one run. Supersedes
// apply_all_9oct_e.gs: run this one instead of e (it contains all of e, which contains d).
// Part 1 (= e): station-4 verbs in document 03; the uniformity sweep of learner instructions (PRD 7.15).
// Part 2 (PRD 7.16, owner decisions 9.10.2026, written into the PRD at the owner's explicit request):
// tick rule for the writing step in vertical subtraction; step-row spacing; the coaching drawer;
// reset audit fields, late-recording file to Drive and the teacher message; general praise words;
// task topics in stations 3 and 7.
// Run applyAll. Safe to run more than once.
var DOCS = [
  { name: 'PRD', id: '1siy2VT-bPVy9LflxJBt-Xr7uQEW5umHPEh_vMVlmbWY', version: '7.16', edits: [
  [" כתבו את התוצאה בשורת התוצאה.\" (הפעלים \"בנו\" ו\"כתבו\" לפי מודול 7; מסמך 03 §3.4 עדיין נוקט \"ייצגו\" ו\"רשמו את התוצאה\")"," כתבו את התוצאה בשורת התוצאה.\"",null],
  ["(\"אם בטור…\", \"כשבאחד הטורים…\")","(\"אם בטור…\", \"כשמצטברות…\")",null],
  ["צעד אחד, בלי מספר: \"נסו לבנות את המספר 305 בלבנים.\"","צעד אחד, בלי מספר: \"נסו לבנות את המספר 305 בבית המספרים.\""],
  ["לחצו על הכפתור \"קבצו 10 לעשרת\" שבראש הטור.\" (אינו מסומן","לחצו על הכפתור \"קבצו 10\" שבראש הטור.\" (אינו מסומן"],
  ["\"בנו את המספר 347 בלבנים\", \"פרטו עשרת אחת לעשר יחידות\", \"כתבו בשורת התוצאה איזה מספר מייצגות הלבנים לאחר הפריטה\"","\"בנו את המספר 347 בבית המספרים.\", \"פרטו לבנת עשרת אחת לעשר לבני יחידה.\", \"כתבו בשורת התוצאה איזה מספר מייצגות הלבנים עכשיו.\""],
  ["\"כשבאחד הטורים מצטברות 10 לבנים, לחצו על הכפתור","\"כשמצטברות 10 לבנים בטור, לחצו על הכפתור",null],
  ["בנו בבית המספרים את שני המספרים. כאשר מצטברות 10 לבנים בטור,","בנו בבית המספרים את שני המספרים. כשמצטברות 10 לבנים בטור,"],
  ["\"בשורת המחוסר חסרה ספרת העשרות: 4▢2 − 128 = 314. גלו","\"בתרגיל 4▢2 − 128 = 314 חסרה ספרת העשרות של המחוסר. גלו"],
  ["\"בשורת המחוסר חסרות שתי ספרות: 6,0▢▢ − 2,847 = 3,158. גלו","\"בתרגיל 6,0▢▢ − 2,847 = 3,158 חסרות שתי ספרות של המחוסר. גלו"],
  ["הוסיפו 2 מאות, ואז הסירו 3 עשרות.","הוסיפו 2 מאות, ואז הוציאו 3 עשרות."],
  ["הוסיפו אלף אחד, ואז הסירו 6 מאות.","הוסיפו אלף אחד, ואז הוציאו 6 מאות."],
  ["סימון תיבות בחירה (Undo, עיגולי זיכרון, כרטיס סוקרטי)","סימון תיבות בחירה (כפתור ביטול הפעולה ↺, עיגולי הזיכרון, כרטיס החניכה)"],
  // PRD 7.16 (owner decisions 9.10.2026)
  ["ואותו מרווח בין אותם רכיבים בכל משימה; (3) בלי חזרה:", "ואותו מרווח בין אותם רכיבים בכל משימה; בין שורות הצעדים המרווח רשאי להיות קטן יותר, 2 עד 4 פיקסלים, כשהדבר נדרש כדי שהכרטיס לא ייגלל בשלושת גדלי המסך שבכלל (7) (החלטת בעל המוצר, 9.10.2026); (3) בלי חזרה:"],
  ["ובסגירתו הצעדים וסימוניהם חוזרים כמו שהיו (מודול 12);", "ובסגירתו הצעדים וסימוניהם חוזרים כמו שהיו (מודול 12). כל עוד המגירה פתוחה, אזור העבודה (שורת התוצאה ודף התרגיל במאונך) אינו זז; כשתוכן המגירה גבוה מהמקום שהיא מכסה, המגירה נגללת בתוך עצמה, והכרטיס אינו נגלל לעולם (החלטת בעל המוצר, 9.10.2026);"],
  ["(3) צעד הכתיבה מסומן כשכל התיבות מולאו, והנכונות נבדקת ב\"ממשיכים\"; היוצא", "(3) צעד הכתיבה מסומן כשכל התיבות מולאו, והנכונות נבדקת ב\"ממשיכים\". בחיסור במאונך בתחנות 3–7 (החלטת בעל המוצר, 9.10.2026), בתרגיל שבתשובה שלו פחות ספרות ממספר התיבות בשורת התוצאה (למשל 204 − 112 = 92 בשלוש תיבות), התיבה המובילה או התיבות המובילות שהתשובה אינה משתמשת בהן (המאות או מקום גבוה יותר) רשאיות להישאר ריקות, וצעד הכתיבה מסומן כשכל שאר התיבות מולאו; בכל תרגיל אחר הצעד מסומן רק כשכל התיבות מולאו. התשובה מתקבלת עם 0 מוביל ובלעדיו. היוצא"],
  ["מופיעה הודעת \"נכון! …\" של אותו תרגיל (להלן), ובמשימת היעד 347", "מופיעה הודעת \"נכון! …\" של אותו תרגיל (להלן); בתרגיל שאין לו משפט \"נכון! …\" משלו כותרת ההצלחה היא אחת ממילות השבח \"כָּל הַכָּבוֹד!\", \"מְעֻלֶּה!\" או \"נכון מאוד!\" (החלטת בעל המוצר, 9.10.2026); ובמשימת היעד 347"],
  ["כותרת הנושא \"פורטים לבנת מאה\"", "כותרת הנושא \"פורטים לבנים\""],
  ["כותרת הנושא \"מגלים ספרה חסרה\"", "כותרת הנושא \"מגלים מה חסר\""],
  ["תרגילי הבחירה (מודול 14 §ג) בנויים כמו תרגילי התחנה שלהם.", "בתחנות 3 ו-7 כותרת הנושא נקבעת לפי סוג התרגיל (החלטת בעל המוצר, 9.10.2026): פריטה — \"פורטים לבנים\"; הקבצה — \"מקבצים לבנים\"; ייצוג מספר בדרכים שונות — \"מייצגים מספר בדרכים שונות\"; חלק חסר או ספרות חסרות — \"מגלים מה חסר\"; ניתוח טעויות — \"בודקים פתרון\"; הוספה ואחריה הוצאה — \"משנים מספר\"; קריאה וכתיבה של מספרים — \"קוראים וכותבים מספרים\". בתחנות 1 ו-4 עד 6 כותרות הנושא אינן משתנות. תרגילי הבחירה (מודול 14 §ג) בנויים כמו תרגילי התחנה שלהם."],
  ["(סעיף ד), כדי שהמחקר יידע שלתרגילים אלה יש הקלטה נוספת (מודול 21).", "(סעיף ד), כדי שהמחקר יידע שלתרגילים אלה יש הקלטה נוספת (מודול 21). ברשומת הלומד נשמר reset_acknowledged_at, שעת השרת שבה המכשיר של הלומד קלט את האיפוס, וכך השרת מזהה מקטעים שהגיעו אחרי האיפוס. משימת השרת היומית מעתיקה גם את הקובץ \"הקלטה שהגיעה אחרי האיפוס - …json\" לתיקייה `3 גיבויים` בדרייב, מעדכנת את הקישור ברישום האיפוס (late_recording_files) ומשאירה את העותק ב-Cloud Storage (החלטת בעל המוצר, 9.10.2026)."],
  ["או ל-'partial' אם חלק מהמחיקה נכשל.", "או ל-'partial' אם חלק מהמחיקה נכשל. צעדי המשך שנכשלו אחרי המחיקה (למשל החזרת מסך הלומד להתחלה) נרשמים ב-side_effect_errors; כשהמחיקה הושלמה אך צעד כזה נכשל, המורה מקבלת את ההודעה \"הנתונים נמחקו, אך חלק מהפעולות שאחרי האיפוס לא הצליחו. אם מסך של לומד לא חזר להתחלה, רעננו אותו.\" (החלטת בעל המוצר, 9.10.2026)."],
  ["deletion_status?: 'not_required' | 'in_progress' | 'completed' | 'partial'; // only 'completed' counts as a reset in reports and exports", "deletion_status?: 'not_required' | 'in_progress' | 'completed' | 'partial'; // only 'completed' counts as a reset in reports and exports  \n  late_recording_files?: string[]; // links to the \"הקלטה שהגיעה אחרי האיפוס - …json\" files of this reset (Module 23א §ג)  \n  side_effect_errors?: string[]; // follow-up steps that failed after the deletion (Module 23א §ד)", "late_recording_files?: string[];"]
] },
  { name: 'מסמך 03', id: '1deVf-QeccnmA37jb5lkFHh-6Df1NMYGSFrWQL29gK4A', version: null, edits: [
  ["ייצגו את המספרים בעזרת לבנים.","בנו בבית המספרים את שני המספרים.",null,1,2],
  ["ייצגו את המספרים בעזרת לבנים.","בנו בבית המספרים את שני המספרים.",null,1,1],
  ["ורשמו את ההמרה בעיגול הזיכרון. רשמו את התוצאה בשורת התוצאה.","ורשמו את ההמרה בעיגול הזיכרון. כתבו את התוצאה בשורת התוצאה."]
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

