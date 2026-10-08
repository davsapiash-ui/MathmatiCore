// MathmatiCore — one script for all three documents (9.10.2026, second run of the night).
// Station 6 instruction (PRD 7.12, document 03) and column dimming / progress indicator (document 04).
// Run applyAll. Safe to run more than once.
var DOCS = [
  { name: 'PRD', id: '1siy2VT-bPVy9LflxJBt-Xr7uQEW5umHPEh_vMVlmbWY', version: '7.12', edits: [
  ["ההנחיה בכל תרגיל: \"פתרו חיסור עם אפסים: [התרגיל].\" ואחריה אותם משפטים כמו במפגש 5.","ההנחיה בכל תרגיל זהה מילה במילה להנחיה של מפגש 5: \"פתרו במאונך: [התרגיל]. בנו את המחוסר בבית המספרים. אם בטור אין מספיק לבנים, אפשר לפרוט לבנה מהטור שמשמאלו: לחצו עליה או גררו אותה אל אותו טור. אחרי שפרטתם, רשמו בעיגולי הזיכרון כמה לבנים יש עכשיו בכל טור שהשתנה. הוציאו מבית המספרים את הכמות הנדרשת וכתבו את התוצאה בשורת התוצאה.\" ההנחיה אינה מזכירה אפסים ואינה אומרת מראש היכן וכמה פעמים לפרוט: את אתגר האפס הלומד פוגש בתוך התרגיל עצמו.","זהה מילה במילה להנחיה של מפגש 5"]
] },
  { name: 'מסמך 03', id: '1deVf-QeccnmA37jb5lkFHh-6Df1NMYGSFrWQL29gK4A', version: null, edits: [
  ["בשלב ראשון זיהוי המבנה בטור היחידות והבנת הצורך בפריטה,","ההנחיה מעל כל תרגיל, הזהה בכל תרגילי המפגש פרט לתרגיל עצמו וזהה להנחיה של מפגש 5: \"פתרו במאונך: [התרגיל]. בנו את המחוסר בבית המספרים. אם בטור אין מספיק לבנים, אפשר לפרוט לבנה מהטור שמשמאלו: לחצו עליה או גררו אותה אל אותו טור. אחרי שפרטתם, רשמו בעיגולי הזיכרון כמה לבנים יש עכשיו בכל טור שהשתנה. הוציאו מבית המספרים את הכמות הנדרשת וכתבו את התוצאה בשורת התוצאה.\" ההנחיה אינה מזכירה אפסים: את אתגר האפס הלומדים פוגשים בתוך התרגיל עצמו. בשלב ראשון זיהוי המבנה בטור היחידות והבנת הצורך בפריטה,","וזהה להנחיה של מפגש 5: \"פתרו במאונך"]
] },
  { name: 'מסמך 04', id: '1d_pYxI_h9K-pY4VYy2cwJagxuYSRP-9-ovML40iSoeM', version: null, edits: [
  ["כך שבתרגילי החישוב במאונך הטור הפעיל נשאר מואר לחלוטין בעוד שאר הטורים מכוסים בשכבת בהירות של 0.6","כך שבתרגילי החישוב במאונך, בזמן שהלומדים כותבים בתיבה או בעיגול זיכרון, הטור שלה והטורים שהחישוב בה תלוי בהם מוארים לחלוטין בעוד שאר הטורים מכוסים בשכבת בהירות של 0.6; כשאף תיבה ואף עיגול זיכרון אינם במיקוד, ובזמן בנייה בלבנים, אף טור אינו מעומעם"],
  ["שכבת בהירות 0.6 על טורים שאינם פעילים","שכבת בהירות 0.6 על הטורים שאינם קשורים לתיבה או לעיגול הזיכרון שבמיקוד, בתרגילי חישוב במאונך בלבד; כשדבר אינו במיקוד אף טור אינו מעומעם"],
  ["כך שבתרגילי החישוב במאונך הטור הפעיל נשאר מואר לחלוטין ושאר הטורים מכוסים בשכבת בהירות של 0.6","כך שבתרגילי החישוב במאונך, בזמן שהלומדים כותבים בתיבה או בעיגול זיכרון, הטור שלה והטורים שהחישוב בה תלוי בהם מוארים לחלוטין ושאר הטורים מכוסים בשכבת בהירות של 0.6; כשאף תיבה ואף עיגול זיכרון אינם במיקוד, ובזמן בנייה בלבנים, אף טור אינו מעומעם"],
  ["האילוצים הממשקיים מתמקדים בעמעום הטורים שאינם פעילים","האילוצים הממשקיים מתמקדים בעמעום הטורים שאינם קשורים לתיבה שבמיקוד בתרגילי החישוב במאונך"],
  ["מחוון התקדמות שלבי (Discrete Progress Steps Indicator)","מחוון התקדמות \"משימה N מתוך M\" מעל הנחיית כל תרגיל"]
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

