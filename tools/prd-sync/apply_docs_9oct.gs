// MathmatiCore — documents 01, 03, 04 aligned with PRD 7.17 and the app (owner, 9.10.2026).
// One-way sync (blocks → digits); "מיפוי מיומנויות היסוד"; Drive folder "2 נתוני מחקר"; measure-1 average.
// Run applyAll. Safe to run more than once.
var DOCS = [
  { name: "מסמך 01", id: '1fD7rDVBHbwskJ7b2ybKNUjgSuCHijHxTkPvjZ3oXhMI', version: null, edits: [
  ["הנאספים ומנותחים במסגרת אבחון מעוף הדבורה לאחור ברדאר פדגוגי שקט:","הנאספים ומנותחים במסגרת מיפוי מיומנויות היסוד ברדאר הפדגוגי השקט:"],
  ["מוצגים למורה תחת המותג הפדגוגי אבחון מעוף הדבורה לאחור ברדאר פדגוגי שקט ומאפשרים","מוצגים למורה במיפוי מיומנויות היסוד ברדאר הפדגוגי השקט ומאפשרים"]
] },
  { name: "מסמך 03", id: '1deVf-QeccnmA37jb5lkFHh-6Df1NMYGSFrWQL29gK4A', version: null, edits: [
  ["המערכת מציעה סנכרון דו-כיווני מבוקר בין הייצוג הווירטואלי לייצוג הסמלי המופשט.","המערכת מציעה סנכרון חד-כיווני מבוקר מהייצוג הווירטואלי אל הייצוג הסמלי המופשט: פעולה בלבני הדינס הווירטואליות מתעדכנת בספרות, והקלדת ספרה אינה יוצרת לבנים ואינה מוחקת אותן."],
  ["המיישמת את מודל VRA הדיגיטלי המאפשר סנכרון דו-כיווני מבוקר.","המיישמת את מודל VRA הדיגיטלי המאפשר סנכרון חד-כיווני מבוקר מהלבנים אל הספרות."],
  ["המאפשר סנכרון דו-כיווני מבוקר. עבור לומדים בפרופיל תמיכה קוגניטיבי מוגבר המקלדת בשורת התוצאה נעולה בשלבים המצריכים פריטה ומשתחררת לפ","המאפשר סנכרון חד-כיווני מבוקר מהלבנים אל הספרות. עבור לומדים בפרופיל תמיכה קוגניטיבי מוגבר המקלדת בשורת התוצאה נעולה בשלבים המצריכים פריטה ומשתחררת לפ"],
  ["המאפשר סנכרון דו-כיווני מבוקר. עבור לומדים בפרופיל תמיכה קוגניטיבי מוגבר המקלדת בשורת התוצאה נעולה בשלבים המצריכים פריטה ומשתחררת רק","המאפשר סנכרון חד-כיווני מבוקר מהלבנים אל הספרות. עבור לומדים בפרופיל תמיכה קוגניטיבי מוגבר המקלדת בשורת התוצאה נעולה בשלבים המצריכים פריטה ומשתחררת רק"],
  ["המאפשר סנכרון דו-כיווני מבוקר. עבור לומדים בפרופיל תמיכה קוגניטיבי מוגבר המקלדת בשורת התוצאה נעולה בשלבי המרה","המאפשר סנכרון חד-כיווני מבוקר מהלבנים אל הספרות. עבור לומדים בפרופיל תמיכה קוגניטיבי מוגבר המקלדת בשורת התוצאה נעולה בשלבי המרה"],
  ["המכונה אבחון מעוף הדבורה לאחור.","המכונה מיפוי מיומנויות היסוד."]
] },
  { name: "מסמך 04", id: '1d_pYxI_h9K-pY4VYy2cwJagxuYSRP-9-ovML40iSoeM', version: null, edits: [
  ["בתיקייה \"02 נתוני מחקר\"","בתיקייה \"2 נתוני מחקר\""],
  ["וציון ממוצע לכל אחד ממפגשים 3 עד 8","וממוצע ציון הניסיון הראשון לכל אחד ממפגשים 3 עד 8"]
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

