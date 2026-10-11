// MathmatiCore — 11.10.2026: the second special-education level, "המסלול המדורג – יסודות" (graded_foundation_path).
// Owner's decision: every learner has two levels after the diagnostic. A regular learner: the green path or the
// remediation path. A learner marked for the graded path: the graded path or the graded foundations path, which is the
// grade-2 special-education milestone of document 05 (addition and subtraction within 100, place value from whole
// hundreds within 1,000). Same topics, same tools, no other aid.
// Run applyAll (documents 02, 03, 04 and the literature review) and applyPrd (the PRD, version 7.21).
// Safe to run more than once: each edit runs only if its old sentence occurs exactly the expected number of times,
// and an edit whose marker is already in the document counts as done.
var DOCS = [
  { name: "מסמך 03", id: '1deVf-QeccnmA37jb5lkFHh-6Df1NMYGSFrWQL29gK4A', edits: [
    ["המסלול הירוק, מסלול צמצום פערי קדם או המסלול המדורג. השנייה",
     "המסלול הירוק, מסלול צמצום פערי קדם, המסלול המדורג או המסלול המדורג – יסודות. השנייה",
     "המסלול המדורג או המסלול המדורג – יסודות. השנייה"],
    ["(המסלול הירוק, מסלול צמצום פערי קדם או המסלול המדורג) לבין פרופיל",
     "(המסלול הירוק, מסלול צמצום פערי קדם, המסלול המדורג או המסלול המדורג – יסודות) לבין פרופיל",
     "או המסלול המדורג – יסודות) לבין פרופיל"],
    ["המורה מסמנת את הלומד במסלול המדורג כבר לפני מפגש 1, והריענון והאבחון שלו מותאמים לכך.",
     "המורה מסמנת את הלומד במסלול המדורג כבר לפני מפגש 1, והריענון והאבחון שלו מותאמים לכך. גם ללומד בחינוך המיוחד יש שתי רמות, כמו לכל לומד. לפי תוצאות האבחון המדורג, המטריקס ממליץ על אחת משתי הרמות: המסלול המדורג, או המסלול המדורג – יסודות ללומד שעדיין אינו שולט בחיבור ובחיסור בתחום האלף. ההחלטה היא של המורה. המסלול המדורג – יסודות עוסק באותם נושאים בדיוק, לפי אבן הדרך של כיתה ב בעמודת החינוך המיוחד במטריקס: חיבור וחיסור במאונך בתחום המאה, קודם בלי המרה ואחר כך עם המרה, וערך המקום בתחום האלף, החל במאות שלמות. כך הלומד ממשיך בנושאים של שכבת הגיל, והפער נסגר במקביל, כפי שמנחה המתווה של משרד החינוך לחינוך המיוחד. במטריקס, אבן הדרך של כיתה ב בעמודת החינוך המיוחד היא \"חיבור/חיסור מאונך מעל 100\", והדוגמה שלצידה היא 54 + 28. אבן הדרך מתארת את היעד של השלב, והדוגמה מתארת את נקודת ההתחלה שלו: לפי מסמך ההתאמות של משרד החינוך, חיבור וחיסור עם המרה מתחילים בתחום המאה, ורק אחר כך עוברים למספרים גדולים יותר.",
     "גם ללומד בחינוך המיוחד יש שתי רמות"],
    ["עקרון הפיצול לשלושה מסלולים",
     "עקרון הפיצול למסלולים",
     "עקרון הפיצול למסלולים", 6],
    ["ההדגמה משותפת לשלושת המסלולים",
     "ההדגמה משותפת לכל המסלולים",
     "ההדגמה משותפת לכל המסלולים", 4],
    ["הדגמה אחת, משותפת לשלושת המסלולים",
     "הדגמה אחת, משותפת לכל המסלולים",
     "הדגמה אחת, משותפת לכל המסלולים"],
    ["ההדגמה במליאה משותפת לשלושת המסלולים",
     "ההדגמה במליאה משותפת לכל המסלולים",
     "ההדגמה במליאה משותפת לכל המסלולים"],
    ["140 שהוא מאה ועוד 40, ו-4,052 במילים.",
     "140 שהוא מאה ועוד 40, ו-4,052 במילים. ברמה ארבע (המסלול המדורג – יסודות) מבוסס המבנה העשרוני מן המאות השלמות ועד האלף. התרגילים: 200 במילים, 5 לבני עשרת ו-3 לבני יחידה עם פריטת לבנת עשרת, 2 לבני מאה ולבנת עשרת אחת עם פריטת לבנת מאה, 170 מלבני עשרת בלבד, 709 במילים, 130 שהוא מאה ועוד 30, ו-1,000 במילים.",
     "מבוסס המבנה העשרוני מן המאות השלמות ועד האלף"],
    ["וספרה חסרה בתוצאה 228 + 154.",
     "וספרה חסרה בתוצאה 228 + 154. ברמה ארבע (המסלול המדורג – יסודות) מבוסס אלגוריתם החיבור במאונך בתחום המאה: קודם בלי המרה, ואחר כך המרה ביחידות, תחילה בחיבור מספר דו ספרתי ומספר חד ספרתי, ואחר כך בחיבור שני מספרים דו ספרתיים. התרגילים: 32 + 14, 51 + 27, 24 + 9, 45 + 18, 56 + 37, 39 + 44, וספרה חסרה בתוצאה 28 + 57.",
     "מבוסס אלגוריתם החיבור במאונך בתחום המאה"],
    ["וספרה חסרה 5▢3 − 128 = 415.",
     "וספרה חסרה 5▢3 − 128 = 415. ברמה ארבע (המסלול המדורג – יסודות) מבוסס אלגוריתם החיסור במאונך בתחום המאה באותו דירוג: בלי פריטה, ואחר כך פריטה אחת. התרגילים: 68 − 23, 97 − 54, 52 − 8, 84 − 47, 92 − 58, 65 − 39, וספרה חסרה ▢3 − 28 = 45.",
     "מבוסס אלגוריתם החיסור במאונך בתחום המאה"],
    ["וספרה חסרה בתוצאה 800 − 258.",
     "וספרה חסרה בתוצאה 800 − 258. ברמה ארבע (המסלול המדורג – יסודות) מבוסס תפקיד האפס בחיסור בתחום המאה: תחילה פריטה אחת כשבמחוסר יש 0 בטור היחידות, ובסוף שתי פריטות, כשהמחוסר הוא 100. התרגילים: 40 − 17, 60 − 23, 90 − 43, 80 − 29, 100 − 45, 100 − 72, וספרה חסרה בתוצאה 50 − 18.",
     "מבוסס תפקיד האפס בחיסור בתחום המאה"],
    ["ושתי דרכים לבנות 240 מלבני מאה ועשרת.",
     "ושתי דרכים לבנות 240 מלבני מאה ועשרת. ברמה ארבע (המסלול המדורג – יסודות) מבוצעות אותן משימות חקר, בחיבור ובחיסור בתחום המאה ובבניית מספרים בתחום האלף: הקבצת 12 לבני עשרת ו-5 לבני יחידה, 4▢ + 31 = 72, ▢8 + 26 = 84, 6▢ − 37 = 27, ניתוח הטעות של לומד דמיוני שפתר 46 + 29 וקיבל 65, בניית 130 והוספת 2 מאות והוצאת 4 עשרות, ושתי דרכים לבנות 160 מלבני מאה ועשרת.",
     "מבוצעות אותן משימות חקר, בחיבור ובחיסור בתחום המאה"],
    ["וספרה חסרה 3▢2 + 61 = 413.",
     "וספרה חסרה 3▢2 + 61 = 413. ברמה ארבע (המסלול המדורג – יסודות) מבוצע פתרון תרגילים שהלומדים פגשו במפגשים 4 עד 6 של רמה זו: 32 + 14, 45 + 18, 56 + 37, 68 − 23, 84 − 47, 100 − 45, וספרה חסרה 5▢ + 37 = 93.",
     "שהלומדים פגשו במפגשים 4 עד 6 של רמה זו"]
  ] },
  { name: "מסמך 02", id: '1r74zTVq-C1Xa8WrYwOdUMvlhd3OEVty4o2K207rJhgI', edits: [
    ["והמסלול המדורג (לחינוך המיוחד: אותם נושאים בדירוג, בתחום האלף),",
     "והמסלול המדורג לחינוך המיוחד, בשתי רמות (אותם נושאים בדירוג: ברמה אחת בתחום האלף, וברמה השנייה בתחום המאה תחילה),",
     "והמסלול המדורג לחינוך המיוחד, בשתי רמות"],
    ["ההדגמה משותפת אחת לשלושת המסלולים",
     "ההדגמה משותפת אחת לכל המסלולים",
     "ההדגמה משותפת אחת לכל המסלולים", 2]
  ] },
  { name: "מסמך 04", id: '1d_pYxI_h9K-pY4VYy2cwJagxuYSRP-9-ovML40iSoeM', edits: [
    ["קדם\" או \"המסלול המדורג\" (שאותו המורה יכולה לסמן כבר לפני מפגש 1),",
     "קדם\" או, ללומד שהמורה סימנה במסלול המדורג כבר לפני מפגש 1, \"המסלול המדורג\" או \"המסלול המדורג – יסודות\",",
     "ללומד שהמורה סימנה במסלול המדורג כבר לפני מפגש 1, \"המסלול המדורג\""]
  ] },
  { name: "סקירת הספרות", id: '1y043Lzby0iGWcDx3HjIVVxzFNjlU4jw5-Gpxfm_06y8', edits: [
    ["תחום האלף תחילה ובהמשך תחום הרבבה, כפי שמתירים מסמכי משרד החינוך.",
     "תחום האלף תחילה ובהמשך תחום הרבבה, כפי שמתירים מסמכי משרד החינוך. גם ללומד במסלול זה יש שתי רמות, כמו לכל לומד: לומד שעל פי האבחון עדיין אינו שולט בחיבור ובחיסור בתחום האלף עובד באותם נושאים: חיבור וחיסור בתחום המאה תחילה, וערך המקום בתחום האלף, לפי הדירוג שבמסמכי המשרד.",
     "גם ללומד במסלול זה יש שתי רמות"]
  ] }
];

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

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE PRD — applyPrd. Version 7.21. The code follows these sentences.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
var PRD = { name: "PRD", id: '1siy2VT-bPVy9LflxJBt-Xr7uQEW5umHPEh_vMVlmbWY', version: "7.21", edits: [
  ["הדגמה אחת משותפת לשלושת המסלולים",
   "הדגמה אחת משותפת לכל המסלולים",
   "הדגמה אחת משותפת לכל המסלולים"],
  ["one demonstration shared by the three paths",
   "one demonstration shared by all paths",
   "one demonstration shared by all paths"],
  ["לכל לומד בכל אחד משלושת המסלולים, והוא אינו מופעל אוטומטית עם המסלול המדורג.",
   "לכל לומד בכל אחד מארבעת המסלולים, והוא אינו מופעל אוטומטית עם אף אחד משני המסלולים המדורגים.",
   "עם אף אחד משני המסלולים המדורגים"],
  ["המלצת המטריקס נשארת בין המסלול הירוק למסלול צמצום פערי קדם; המסלול המדורג הוא בחירת המורה בלבד, ובשער מוצגים שלושה כפתורי אישור.",
   "למסלול המדורג שתי רמות, כמו לכל לומד: \"המסלול המדורג\" (graded_path) ו\"המסלול המדורג – יסודות\" (graded_foundation_path), שכפתור האישור שלו \"אישור המסלול המדורג – יסודות\". מפגשים 1 ו-2 משותפים לשתי הרמות. המלצת המטריקס היא תמיד בין שתי רמות, והיא נגזרת מציון האבחון לפי אותו סף ציון: ללומד שלא סומן, בין המסלול הירוק למסלול צמצום פערי קדם; ללומד שסומן במסלול המדורג, בין המסלול המדורג למסלול המדורג – יסודות (ציון שהיה מוביל למסלול הירוק מוביל למסלול המדורג, וציון שהיה מוביל למסלול צמצום פערי קדם מוביל למסלול המדורג – יסודות). ההחלטה בשער היא של המורה, ובשער מוצגים ארבעה כפתורי אישור.",
   "מפגשים 1 ו-2 משותפים לשתי הרמות"],
  ["עבור כל מפגש בטווח 3 עד 7 מוגדרים שלושה מאגרים נפרדים ובלתי תלויים",
   "עבור כל מפגש בטווח 3 עד 7 מוגדרים ארבעה מאגרים נפרדים ובלתי תלויים",
   "מוגדרים ארבעה מאגרים נפרדים ובלתי תלויים"],
  ["אתגר ▢▢▢ + 247 = 683.",
   "אתגר ▢▢▢ + 247 = 683. המאגר הרביעי הוא של graded_foundation_path, \"המסלול המדורג – יסודות\", ללומד בחינוך המיוחד שעל פי האבחון המדורג עדיין אינו שולט בחיבור ובחיסור בתחום האלף: אותם נושאים ואותם כלים, בלי שום עזר נוסף, לפי אבן הדרך של כיתה ב בעמודת החינוך המיוחד במסמך 05 — חיבור וחיסור במאונך בתחום המאה, קודם בלי המרה ואחר כך עם המרה, וערך המקום בתחום האלף, החל במאות שלמות. מפגשים 1 ו-2 שלו הם אלה של המסלול המדורג. מאגרי graded_foundation_path, לפי הסדר: מפגש 3 — 200 (\"מאתיים\"), 5 לבני עשרת ו-3 לבני יחידה עם פריטת עשרת (53), 2 לבני מאה ולבנת עשרת אחת עם פריטת מאה (210), 170 מלבני עשרת בלבד, 709 (\"שבע מאות ותשע\"), 130 שהוא מאה ועוד 30, ו-1,000 (\"אלף\"). מפגש 4 — 32 + 14, 51 + 27, 24 + 9, 45 + 18, 56 + 37, 39 + 44, וספרה חסרה בתוצאה 28 + 57 = ▢5. מפגש 5 — 68 − 23, 97 − 54, 52 − 8, 84 − 47, 92 − 58, 65 − 39, ו-▢3 − 28 = 45. מפגש 6 — 40 − 17, 60 − 23, 90 − 43, 80 − 29, 100 − 45, 100 − 72, וספרה חסרה בתוצאה 50 − 18 = ▢2. מפגש 7 — הקבצת 12 לבני עשרת ו-5 לבני יחידה (125), 4▢ + 31 = 72, ▢8 + 26 = 84, 6▢ − 37 = 27, ניתוח טעות של 46 + 29 (הלומד הדמיוני כתב 65), 130 ועוד 2 מאות פחות 4 עשרות (290), ושתי דרכים לבנות 160 מלבני מאה ועשרת. מפגש 8 — 32 + 14, 45 + 18, 56 + 37, 68 − 23, 84 − 47, 100 − 45, ו-5▢ + 37 = 93. תרגילי הבחירה (תרגיל האתגר במפגשים 4 עד 6 חורג במכוון מעבר למאה, כצעד ראשון אל תחום האלף): מפגש 3 — 640 בכתיבה, 150 מלבני עשרת, אתגר: דרכים לבנות 180; מפגש 4 — 34 + 52, 19 + 47, אתגר 87 + 46; מפגש 5 — 76 − 41, 91 − 37, אתגר 160 − 84; מפגש 6 — 90 − 60, 30 − 14, אתגר 200 − 63; מפגש 7 — 6▢ + 25 = 89, ▢9 − 46 = 33, אתגר ▢▢ + 48 = 81.",
   "המאגר הרביעי הוא של graded_foundation_path"],
  ["maintain three fully independent banks of seven compulsory exercises",
   "maintain four fully independent banks of seven compulsory exercises",
   "maintain four fully independent banks"],
  ["with one bridge number into the thousands in session 3).",
   "with one bridge number into the thousands in session 3), and one for graded_foundation_path (special education, the lower level: addition and subtraction within 100, place value within 1,000 from whole hundreds).",
   "and one for graded_foundation_path (special education"],
  ["teacher_selected_path: 'green_path' | 'remediation_path' | 'graded_path' | null;",
   "teacher_selected_path: 'green_path' | 'remediation_path' | 'graded_path' | 'graded_foundation_path' | null;",
   "| 'graded_path' | 'graded_foundation_path' | null;"],
  ["learning_path: 'green_path' | 'remediation_path' | 'graded_path';",
   "learning_path: 'green_path' | 'remediation_path' | 'graded_path' | 'graded_foundation_path';",
   "learning_path: 'green_path' | 'remediation_path' | 'graded_path' | 'graded_foundation_path';"]
] };

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
  if (n !== expected) {
    Logger.log(name + ': נמצא ' + n + ' פעמים במקום ' + expected + ', דולג: ' + oldText.slice(0, 50));
    return 'skipped';
  }
  for (var k = 0; k < expected; k++) {
    if (!replaceOnce_(body, oldText, newText)) {
      Logger.log(name + ': המחרוזת נמצאה אבל אינה בתוך רצף עיצוב אחד, דולג: ' + oldText.slice(0, 50));
      return 'skipped';
    }
  }
  return 'done';
}

// Replaces the one occurrence of oldText that lies entirely inside a single text run (same formatting), so the
// formatting stays as it is. The pattern is only the first words of the sentence; the exact match is made on the run's text.
function replaceOnce_(body, oldText, newText) {
  var head = oldText.slice(0, 40);
  var r = body.findText(esc_(head));
  while (r) {
    var t = r.getElement().asText();
    var s = t.getText().indexOf(oldText);
    if (s !== -1) {
      t.deleteText(s, s + oldText.length - 1);
      t.insertText(s, newText);
      return true;
    }
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
  if (matches.length !== 1) { Logger.log('שורת הגרסה נמצאה ' + matches.length + ' פעמים במקום 1; לא עודכנה.'); return; }
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
