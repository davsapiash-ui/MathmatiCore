/**
 * תיקון כיווני כתיבה וסוגריים — העמוד הראשון בלבד
 * מסמך: "סקירת ספרות מורחבת ומוכנה להגשה" (Google Docs)
 *
 * מה הסקריפט עושה, ורק זה:
 *   1. מוודא שכל פסקה בעמוד הראשון מוגדרת מימין לשמאל.
 *   2. מוסיף סימני כיוון בלתי נראים בכל מקום שבו סוגריים נמצאים בין עברית לאנגלית,
 *      לפי המוסכמה שכבר קיימת בשאר המסמך:
 *        - הפניה בגוף המשפט:  Bouck et al. (2017)‎   ← סימן LRM (U+200E) מיד אחרי הסוגר
 *        - הפניה בסוגריים:    ‏(Root et al., 2017)‏   ← סימן RLM (U+200F) לפני הפותח ואחרי הסוגר
 *
 *   הסקריפט לא משנה אף תו גלוי, אף מילה ואף עיצוב.
 *   "העמוד הראשון" = כל הפסקאות שלפני הכותרת "תמה 1". הכותרת עצמה וכל מה שאחריה לא נוגעים בהם.
 *   הרצה חוזרת בטוחה: סימן שכבר קיים לא נוסף שוב.
 *
 * הפעלה:
 *   1. במסמך: תוספים ← Apps Script. למחוק את מה שבעורך, להדביק את הקובץ הזה ולשמור.
 *   2. לבחור בפונקציה previewFirstPage ולהריץ. היא רק מדווחת ביומן הביצוע מה תשנה.
 *   3. לבחור בפונקציה fixFirstPage ולהריץ. היא מבצעת את התיקון.
 *   (בהרצה הראשונה Google תבקש אישור גישה למסמך.)
 *   לביטול: עריכה ← ביטול (Ctrl+Z) במסמך, או היסטוריית הגרסאות.
 */

var LRM = '‎';
var RLM = '‏';
var STOP_AT = 'תמה 1';
var MAX_FIRST_PAGE_PARAGRAPHS = 12;

var LATIN = /[A-Za-zÀ-ɏ]/;
var HEBREW = /[֐-׿יִ-ﭏ]/;

function onOpen() {
  DocumentApp.getUi()
    .createMenu('כיווניות')
    .addItem('תצוגה מקדימה: העמוד הראשון', 'previewFirstPage')
    .addItem('תקן את העמוד הראשון', 'fixFirstPage')
    .addToUi();
}

function previewFirstPage() {
  return runFirstPage_(false);
}

function fixFirstPage() {
  return runFirstPage_(true);
}

function runFirstPage_(apply) {
  var paragraphs = firstPageParagraphs_(DocumentApp.getActiveDocument().getBody());
  var report = [];

  paragraphs.forEach(function (p, n) {
    var text = p.editAsText();
    var fixes = planBidiFixes(text.getText());
    var needsRtl = p.isLeftToRight() !== false;

    if (apply) {
      if (needsRtl) p.setLeftToRight(false);
      // From the end backwards, so earlier offsets stay valid.
      for (var k = fixes.length - 1; k >= 0; k--) insertMark_(text, fixes[k]);
    }

    if (needsRtl) report.push('פסקה ' + (n + 1) + ': כיוון הפסקה הוגדר מימין לשמאל');
    fixes.forEach(function (f) {
      report.push('פסקה ' + (n + 1) + ': ' + f.label + ' ליד ' + f.context);
    });
  });

  var title = (apply ? 'תוקן' : 'תצוגה מקדימה') +
    ' — העמוד הראשון (' + paragraphs.length + ' פסקאות)';
  var message = report.length ? report.join('\n') : 'אין מה לתקן — העמוד הראשון כבר תקין.';
  Logger.log(title + '\n' + message);
  try {
    DocumentApp.getUi().alert(title, message, DocumentApp.getUi().ButtonSet.OK);
  } catch (e) {
    // No UI when run outside the document window; the log above has the report.
  }
  return report;
}

/** Paragraphs before the "תמה 1" heading. Throws, changing nothing, if the heading is not found. */
function firstPageParagraphs_(body) {
  var out = [];
  for (var i = 0; i < body.getNumChildren(); i++) {
    var el = body.getChild(i);
    var type = el.getType();
    var p;
    if (type === DocumentApp.ElementType.PARAGRAPH) p = el.asParagraph();
    else if (type === DocumentApp.ElementType.LIST_ITEM) p = el.asListItem();
    else continue;

    if (stripMarks_(p.getText()).trim().indexOf(STOP_AT) === 0) return out;
    out.push(p);
    if (out.length > MAX_FIRST_PAGE_PARAGRAPHS) {
      throw new Error('הכותרת "' + STOP_AT + '" לא נמצאה ב-' + MAX_FIRST_PAGE_PARAGRAPHS +
        ' הפסקאות הראשונות. לא שונה דבר.');
    }
  }
  throw new Error('הכותרת "' + STOP_AT + '" לא נמצאה במסמך. לא שונה דבר.');
}

/**
 * Where to insert direction marks in one paragraph's text. Changes no visible character.
 * Returns [{offset, mark, label, context}] in ascending offset order.
 */
function planBidiFixes(s) {
  var fixes = [];
  var re = /\(([^()]*)\)/g;
  var m;
  while ((m = re.exec(s)) !== null) {
    var open = m.index;
    var close = open + m[0].length - 1;
    var before = directionBefore_(s, open);
    var inside = firstStrong_(m[1]);

    if (before === 'L' && inside !== 'R') {
      // English right before the brackets: "Bouck et al. (2017)" is one left-to-right unit.
      // Without the LRM, an engine without the bracket-pair rule moves ")" to the far side of the name.
      if (s.charAt(close + 1) !== LRM) addFix_(fixes, s, close + 1, LRM, open, close);
    } else if (before !== 'L' && inside === 'L') {
      // Hebrew right before the brackets, English inside: "(Root et al., 2017)" stays in the Hebrew flow.
      if (s.charAt(open - 1) !== RLM) addFix_(fixes, s, open, RLM, open, close);
      if (s.charAt(close + 1) !== RLM) addFix_(fixes, s, close + 1, RLM, open, close);
    }
  }
  return fixes;
}

function addFix_(fixes, s, offset, mark, open, close) {
  for (var i = 0; i < fixes.length; i++) {
    if (fixes[i].offset === offset && fixes[i].mark === mark) return;
  }
  var from = open;
  while (from > 0 && open - from < 25 && s.charAt(from - 1) !== '(' && s.charAt(from - 1) !== ')') from--;
  var space = s.indexOf(' ', from);
  if (from > 0 && s.charAt(from - 1) !== ' ' && space !== -1 && space < open) from = space + 1;
  fixes.push({
    offset: offset,
    mark: mark,
    label: mark === LRM ? 'נוסף LRM' : 'נוסף RLM',
    context: '«' + stripMarks_(s.slice(from, close + 1)).trim() + '»'
  });
}

function insertMark_(text, fix) {
  if (fix.offset >= text.getText().length) text.appendText(fix.mark);
  else text.insertText(fix.offset, fix.mark);
}

/** 'L', 'R' or null (start of paragraph): the first strong direction before index. */
function directionBefore_(s, index) {
  for (var i = index - 1; i >= 0; i--) {
    var c = s.charAt(i);
    if (c === LRM || LATIN.test(c)) return 'L';
    if (c === RLM || HEBREW.test(c)) return 'R';
  }
  return null;
}

/** 'L', 'R' or null (digits and punctuation only): the first strong direction in s. */
function firstStrong_(s) {
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (c === LRM || LATIN.test(c)) return 'L';
    if (c === RLM || HEBREW.test(c)) return 'R';
  }
  return null;
}

function stripMarks_(s) {
  return s.replace(/[‎‏]/g, '');
}
