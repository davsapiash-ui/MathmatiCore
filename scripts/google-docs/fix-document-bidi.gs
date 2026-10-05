/**
 * תיקון כיווני כתיבה וסוגריים — כל המסמך
 * מסמך: "סקירת ספרות מורחבת ומוכנה להגשה" (Google Docs)
 *
 * מה הסקריפט עושה, ורק זה:
 *   1. כיוון פסקה: פסקה עם עברית ← מימין לשמאל. פסקה באנגלית בלבד (ביבליוגרפיה) ← משמאל לימין.
 *   2. סימני כיוון בלתי נראים בפסקאות עבריות, לפי המוסכמה שכבר קיימת במסמך:
 *        - הפניה בגוף המשפט:  Bouck et al. (2017)‎   ← LRM (U+200E) אחרי הסוגר, כשאחריו עברית
 *        - הפניה בסוגריים:    ‏(Root et al., 2017)‏   ← RLM (U+200F) לפני הפותח ואחרי הסוגר
 *        - קיצור לועזי לפני עברית:  et al.‎ מצאו      ← LRM אחרי הנקודה של הקיצור
 *   חל על גוף המסמך, הכותרת העליונה, הכותרת התחתונה וההערות.
 *
 *   הסקריפט לא משנה אף תו גלוי, אף מילה ואף עיצוב. הוא מוסיף רק את שני התווים הבלתי נראים
 *   U+200E ו-U+200F. לפני שהוא משנה משהו הוא מתכנן את כל השינויים ובודק שהטקסט הגלוי
 *   נשאר זהה בכל פסקה. אם לא, הוא עוצר ולא משנה דבר.
 *   הרצה חוזרת בטוחה: סימן שכבר קיים לא נוסף שוב.
 *
 * הפעלה:
 *   1. במסמך: תוספים ← Apps Script. למחוק את מה שבעורך, להדביק את הקובץ הזה ולשמור.
 *   2. לבחור בפונקציה previewDirections ולהריץ. היא רק מדווחת ביומן הביצוע מה תשנה.
 *   3. לבחור בפונקציה fixDirections ולהריץ. היא מבצעת את התיקון.
 *   לביטול: עריכה ← ביטול (Ctrl+Z) במסמך, או היסטוריית הגרסאות.
 */

var LRM = '‎';
var RLM = '‏';

var LATIN = /[A-Za-zÀ-ɏ]/;
var HEBREW = /[֐-׿יִ-ﭏ]/;
var OPENERS = { '(': ')', '[': ']' };
// Latin abbreviations whose final period belongs to the English, not to the Hebrew sentence.
var ABBREVIATION = /(?:^|[^A-Za-z])(et al|e\.g|i\.e|cf|vs|pp|Eds?|Vol|No|n\.d)\.(?=[‎‏]?\s*[֐-׿])/g;

function onOpen() {
  DocumentApp.getUi()
    .createMenu('כיווניות')
    .addItem('תצוגה מקדימה', 'previewDirections')
    .addItem('תקן את כל המסמך', 'fixDirections')
    .addToUi();
}

function previewDirections() {
  return runDirections_(false);
}

function fixDirections() {
  return runDirections_(true);
}

function runDirections_(apply) {
  var paragraphs = allParagraphs_(DocumentApp.getActiveDocument());

  // Phase 1: plan everything, change nothing.
  var plans = paragraphs.map(function (entry) {
    var p = entry.paragraph;
    var s = p.getText();
    var hasHebrew = HEBREW.test(s);
    var wantLtr = hasHebrew ? false : (LATIN.test(s) ? true : null);
    var current = p.isLeftToRight();
    var setDirection = wantLtr !== null && current !== wantLtr;
    var fixes = hasHebrew ? planBidiFixes(s) : [];
    var result = applyFixesToString_(s, fixes);
    if (stripMarks_(result) !== stripMarks_(s)) {
      throw new Error(entry.where + ': התיקון היה משנה טקסט גלוי. לא שונה דבר.');
    }
    return { entry: entry, fixes: fixes, setDirection: setDirection, wantLtr: wantLtr };
  });

  // Phase 2: apply.
  var report = [];
  plans.forEach(function (plan) {
    var p = plan.entry.paragraph;
    if (apply) {
      if (plan.setDirection) p.setLeftToRight(plan.wantLtr);
      var text = p.editAsText();
      // From the end backwards, so earlier offsets stay valid.
      for (var k = plan.fixes.length - 1; k >= 0; k--) insertMark_(text, plan.fixes[k]);
    }
    if (plan.setDirection) {
      report.push(plan.entry.where + ': כיוון הפסקה ← ' + (plan.wantLtr ? 'משמאל לימין' : 'מימין לשמאל'));
    }
    plan.fixes.forEach(function (f) {
      report.push(plan.entry.where + ': ' + f.label + ' ליד ' + f.context);
    });
  });

  var title = (apply ? 'תוקן' : 'תצוגה מקדימה') + ' — ' + paragraphs.length + ' פסקאות נבדקו';
  var message = report.length ? report.join('\n') : 'אין מה לתקן — המסמך כבר תקין.';
  Logger.log(title + '\n' + message);
  try {
    DocumentApp.getUi().alert(title, message, DocumentApp.getUi().ButtonSet.OK);
  } catch (e) {
    // No UI when run outside the document window; the log above has the report.
  }
  return report;
}

/** Every paragraph and list item in the body, header, footer and footnotes. */
function allParagraphs_(doc) {
  var out = [];
  var add = function (section, name) {
    if (!section) return;
    section.getParagraphs().forEach(function (p, n) {
      out.push({ paragraph: p, where: name + ' פסקה ' + (n + 1) });
    });
  };
  add(doc.getBody(), 'גוף');
  add(doc.getHeader(), 'כותרת עליונה');
  add(doc.getFooter(), 'כותרת תחתונה');
  (doc.getFootnotes() || []).forEach(function (fn, n) {
    add(fn.getFootnoteContents(), 'הערה ' + (n + 1));
  });
  return out;
}

/**
 * Where to insert direction marks in one Hebrew paragraph. Changes no visible character.
 * Returns [{offset, mark, label, context}] in ascending offset order.
 */
function planBidiFixes(s) {
  var fixes = [];

  bracketPairs_(s).forEach(function (pair) {
    var open = pair[0];
    var close = pair[1];
    var before = directionBefore_(s, open);
    var inside = firstStrong_(s.slice(open + 1, close));

    if (before === 'L' && inside !== 'R') {
      // English right before the brackets: "Bouck et al. (2017)" is one left-to-right unit.
      // Needed only when Hebrew (or the paragraph end) follows; English after it needs nothing.
      if (directionAfter_(s, close) !== 'L' && s.charAt(close + 1) !== LRM) {
        addFix_(fixes, s, close + 1, LRM, open, close);
      }
    } else if (before !== 'L' && inside === 'L') {
      // Hebrew right before the brackets, English inside: "(Root et al., 2017)" stays in the Hebrew flow.
      if (s.charAt(open - 1) !== RLM) addFix_(fixes, s, open, RLM, open, close);
      if (s.charAt(close + 1) !== RLM) addFix_(fixes, s, close + 1, RLM, open, close);
    }
  });

  var m;
  ABBREVIATION.lastIndex = 0;
  while ((m = ABBREVIATION.exec(s)) !== null) {
    var dot = m.index + m[0].length - 1;
    var next = s.charAt(dot + 1);
    if (next !== LRM && next !== RLM) addFix_(fixes, s, dot + 1, LRM, m.index, dot);
  }

  fixes.sort(function (a, b) { return a.offset - b.offset; });
  return fixes;
}

/** Matching ( ) and [ ] pairs, nested ones included, as [open, close]. */
function bracketPairs_(s) {
  var stack = [];
  var pairs = [];
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (OPENERS[c]) {
      stack.push(i);
    } else if (c === ')' || c === ']') {
      for (var k = stack.length - 1; k >= 0; k--) {
        if (OPENERS[s.charAt(stack[k])] === c) {
          pairs.push([stack[k], i]);
          stack.length = k;
          break;
        }
      }
    }
  }
  return pairs;
}

function addFix_(fixes, s, offset, mark, from, to) {
  for (var i = 0; i < fixes.length; i++) {
    if (fixes[i].offset === offset && fixes[i].mark === mark) return;
  }
  var start = from;
  while (start > 0 && from - start < 25) start--;
  var space = s.indexOf(' ', start);
  if (start > 0 && s.charAt(start - 1) !== ' ' && space !== -1 && space < from) start = space + 1;
  fixes.push({
    offset: offset,
    mark: mark,
    label: mark === LRM ? 'נוסף LRM' : 'נוסף RLM',
    context: '«' + stripMarks_(s.slice(start, to + 1)).trim() + '»'
  });
}

function applyFixesToString_(s, fixes) {
  for (var k = fixes.length - 1; k >= 0; k--) {
    s = s.slice(0, fixes[k].offset) + fixes[k].mark + s.slice(fixes[k].offset);
  }
  return s;
}

function insertMark_(text, fix) {
  if (fix.offset >= text.getText().length) text.appendText(fix.mark);
  else text.insertText(fix.offset, fix.mark);
}

function strongOf_(c) {
  if (c === LRM || LATIN.test(c)) return 'L';
  if (c === RLM || HEBREW.test(c)) return 'R';
  return null;
}

/** 'L', 'R' or null (start of paragraph): the first strong direction before index. */
function directionBefore_(s, index) {
  for (var i = index - 1; i >= 0; i--) {
    var d = strongOf_(s.charAt(i));
    if (d) return d;
  }
  return null;
}

/** 'L', 'R' or null (end of paragraph): the first strong direction after index. */
function directionAfter_(s, index) {
  for (var i = index + 1; i < s.length; i++) {
    var d = strongOf_(s.charAt(i));
    if (d) return d;
  }
  return null;
}

/** 'L', 'R' or null (digits and punctuation only): the first strong direction in s. */
function firstStrong_(s) {
  for (var i = 0; i < s.length; i++) {
    var d = strongOf_(s.charAt(i));
    if (d) return d;
  }
  return null;
}

function stripMarks_(s) {
  return s.replace(/[‎‏]/g, '');
}
