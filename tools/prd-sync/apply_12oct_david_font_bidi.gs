/**
 * גופן David וכיווני סוגריים — סקירת הספרות, מסמכים 01–04 ומסמך הדרישות (12.10.2026)
 *
 * מה הסקריפט עושה, ורק זה:
 *   1. גופן: כל הטקסט ← David. לא נוגע בקוד (גופן קוד כמו Consolas) ולא בפסקאות האנגליות של
 *      "הנחיות פיתוח נוקשות (Strict Developer Instructions)" במסמך הדרישות.
 *   2. כיוון פסקה: פסקה עברית שמוגדרת משמאל לימין ← מימין לשמאל. פסקה באנגלית בלבד ושורות קוד
 *      ← משמאל לימין. פסקה אנגלית שמצטטת כמה מילים בעברית (ההנחיות לסוכן) נשארת כמו שהיא.
 *   3. סימני כיוון בלתי נראים בפסקאות עבריות, לפי המוסכמה של סקירת הספרות:
 *        - Bouck et al. (2017) ואחריו עברית      ← LRM אחרי הסוגר
 *        - (Root et al., 2017) אחרי עברית        ← RLM לפני הפותח ואחרי הסוגר (לא במסמך הדרישות)
 *        - et al. ואחריו עברית                    ← LRM אחרי הנקודה
 *   4. שורת הגרסה במסמך הדרישות: הסוגריים בה הוחלפו ידנית כדי שייראו נכון בפסקה משמאל לימין.
 *      הסקריפט מחזיר אותה לטקסט הנכון ומגדיר אותה מימין לשמאל — במסך היא תיראה אותו דבר.
 *
 *   חל על גוף המסמך, הכותרת העליונה והתחתונה וההערות, בכל הכרטיסיות.
 *   לא משתנה אף תו גלוי (חוץ משורת הגרסה, סעיף 4). לפני כל שינוי הסקריפט מתכנן הכול ובודק
 *   שהטקסט הגלוי נשאר זהה בכל פסקה. אם לא — הוא עוצר ולא משנה דבר. הרצה חוזרת בטוחה.
 *
 * הפעלה: script.google.com ← פרויקט חדש ← להדביק ולשמור ← לבחור fixAll ← הפעלה ← לאשר הרשאות.
 *   (previewAll רק מדווחת ביומן הביצוע מה תשנה.)
 */

var DOCS = [
  { name: 'סקירת הספרות', id: '1y043Lzby0iGWcDx3HjIVVxzFNjlU4jw5-Gpxfm_06y8', rlm: true },
  { name: 'מסמך 01', id: '1fD7rDVBHbwskJ7b2ybKNUjgSuCHijHxTkPvjZ3oXhMI', rlm: true },
  { name: 'מסמך 02', id: '1r74zTVq-C1Xa8WrYwOdUMvlhd3OEVty4o2K207rJhgI', rlm: true },
  { name: 'מסמך 03', id: '1deVf-QeccnmA37jb5lkFHh-6Df1NMYGSFrWQL29gK4A', rlm: true },
  { name: 'מסמך 04', id: '1d_pYxI_h9K-pY4VYy2cwJagxuYSRP-9-ovML40iSoeM', rlm: true },
  // Spec: only the marks that change what is shown. The (Hebrew)(English) pairs render right
  // without them, and marks inside the spec text would break later text-matching sync scripts.
  { name: 'מסמך הדרישות', id: '1siy2VT-bPVy9LflxJBt-Xr7uQEW5umHPEh_vMVlmbWY', rlm: false, keepEnglish: true }
];

var FONT = 'David';
var CODE_FONTS = { 'Consolas': 1, 'Roboto Mono': 1, 'Courier New': 1, 'Source Code Pro': 1, 'Inconsolata': 1 };
var CODE_LINE = /^\s*(export\s|\/\/|\|\s*'|\}|\]|[A-Za-z_]+\??\s*:\s*\S)/;
var VERSION_HACK = /^\(גרסה [0-9.]+ \| עודכן .*\(שעון ישראל$/;

var LRM = String.fromCharCode(0x200E);
var RLM = String.fromCharCode(0x200F);
var LATIN = /[A-Za-zÀ-ɏ]/;
var HEBREW = /[֐-׿יִ-ﭏ]/;
var OPENERS = { '(': ')', '[': ']' };
var ABBREVIATION = /(?:^|[^A-Za-z])(et al|e\.g|i\.e|cf|vs|pp|Eds?|Vol|No|n\.d)\.(?=[‎‏]?\s*[֐-׿])/g;

function previewAll() { return runAll_(false); }
function fixAll() { return runAll_(true); }

function runAll_(apply) {
  var lines = [];
  DOCS.forEach(function (d) {
    var doc = DocumentApp.openById(d.id);
    var r = runDoc_(doc, d, apply);
    lines.push(d.name + ': ' + r.summary);
    r.details.slice(0, apply ? 0 : 25).forEach(function (x) { lines.push('    ' + x); });
  });
  Logger.log((apply ? 'בוצע' : 'תצוגה מקדימה') + String.fromCharCode(10) + lines.join(String.fromCharCode(10)));
  return lines;
}

function runDoc_(doc, d, apply) {
  var paragraphs = allParagraphs_(doc);
  var counts = { font: 0, rtl: 0, ltr: 0, marks: 0, version: 0 };
  var details = [];

  // Phase 1: plan everything, change nothing.
  var plans = paragraphs.map(function (entry) {
    var p = entry.paragraph;
    var s = p.getText();
    var lat = count_(s, /[A-Za-z]/g), heb = count_(s, /[֐-׿]/g);
    var text = p.editAsText();
    var fonts = runFonts_(text, s);
    var code = fonts.some(function (f) { return CODE_FONTS[f]; }) || (d.keepEnglish && lat > 3 * heb && CODE_LINE.test(s));
    var englishLed = heb > 0 && lat > 3 * heb;
    var dirRaw = p.isLeftToRight();          // true, false, or null (not set: left to right)
    var ltr = dirRaw !== false;

    var version = d.keepEnglish && VERSION_HACK.test(s);
    var wantLtr = null;
    if (code) wantLtr = true;
    else if (heb === 0 && lat > 0) wantLtr = true;
    else if (heb > 0 && ltr && !englishLed) wantLtr = false;
    if (version) wantLtr = false;
    var setDirection = wantLtr !== null && wantLtr !== ltr;
    var endsRtl = wantLtr === null ? !ltr : !wantLtr;

    var fixes = [];
    if (!code && !version && endsRtl && heb > 0) {
      fixes = planBidiFixes(s).filter(function (f) { return d.rlm || f.mark === LRM; });
      if (stripMarks_(applyFixesToString_(s, fixes)) !== stripMarks_(s)) {
        throw new Error(d.name + ', ' + entry.where + ': התיקון היה משנה טקסט גלוי. לא שונה דבר.');
      }
    }

    var skipFont = code || (d.keepEnglish && englishLed && ltr) || (d.keepEnglish && heb === 0 && lat > 0 && ltr);
    var setFont = !skipFont && s.length > 0 && fonts.some(function (f) { return f !== FONT; });

    return { entry: entry, s: s, fixes: fixes, setDirection: setDirection, wantLtr: wantLtr, setFont: setFont, version: version };
  });

  // Phase 2: apply.
  plans.forEach(function (plan) {
    var p = plan.entry.paragraph;
    if (plan.version) {
      if (apply) {
        var vt = p.editAsText();
        vt.deleteText(0, 0);
        vt.appendText(')');
      }
      counts.version++;
      details.push(plan.entry.where + ': שורת הגרסה ← ' + plan.s.slice(1) + ')');
    }
    if (plan.setDirection) {
      if (apply) p.setLeftToRight(plan.wantLtr);
      counts[plan.wantLtr ? 'ltr' : 'rtl']++;
      details.push(plan.entry.where + ': כיוון ← ' + (plan.wantLtr ? 'משמאל לימין' : 'מימין לשמאל') + ' «' + plan.s.slice(0, 40) + '»');
    }
    if (plan.fixes.length) {
      if (apply) {
        var text = p.editAsText();
        for (var k = plan.fixes.length - 1; k >= 0; k--) insertMark_(text, plan.fixes[k]);
      }
      counts.marks += plan.fixes.length;
      plan.fixes.forEach(function (f) { details.push(plan.entry.where + ': ' + f.label + ' ליד ' + f.context); });
    }
    if (plan.setFont) {
      if (apply) p.editAsText().setFontFamily(FONT);
      counts.font++;
      details.push(plan.entry.where + ': גופן David «' + plan.s.slice(0, 40) + '»');
    }
  });

  var summary = paragraphs.length + ' פסקאות; גופן David: ' + counts.font + '; מימין לשמאל: ' + counts.rtl +
    '; משמאל לימין: ' + counts.ltr + '; סימני כיוון: ' + counts.marks + (counts.version ? '; שורת הגרסה תוקנה' : '');
  return { summary: summary, details: details };
}

/** Fonts of the visible runs in one paragraph; null (inherited) counts as "not David". */
function runFonts_(text, s) {
  if (!s) return [];
  var whole = text.getFontFamily();
  if (whole) return [whole];
  var idx = text.getTextAttributeIndices();
  var out = [];
  for (var i = 0; i < idx.length; i++) {
    var end = i + 1 < idx.length ? idx[i + 1] : s.length;
    if (!s.slice(idx[i], end).trim()) continue;
    var f = text.getFontFamily(idx[i]) || '(ירושה)';
    if (out.indexOf(f) === -1) out.push(f);
  }
  return out;
}

function count_(s, re) { return (s.match(re) || []).length; }

/** Every paragraph and list item in the body, header, footer and footnotes of every tab. */
function allParagraphs_(doc) {
  var out = [];
  var add = function (section, name) {
    if (!section) return;
    var found = [];
    walk_(section, found);
    found.forEach(function (p, n) { out.push({ paragraph: p, where: name + ' פסקה ' + (n + 1) }); });
  };
  var tabs = [];
  var collect = function (list) {
    (list || []).forEach(function (t) {
      if (t.getType && t.getType() === DocumentApp.TabType.DOCUMENT_TAB) tabs.push(t);
      collect(t.getChildTabs ? t.getChildTabs() : []);
    });
  };
  if (doc.getTabs) collect(doc.getTabs());
  if (!tabs.length) {
    add(doc.getBody(), 'גוף');
    add(doc.getHeader(), 'כותרת עליונה');
    add(doc.getFooter(), 'כותרת תחתונה');
    (doc.getFootnotes() || []).forEach(function (fn, n) { add(fn.getFootnoteContents(), 'הערה ' + (n + 1)); });
    return out;
  }
  tabs.forEach(function (t, i) {
    var dt = t.asDocumentTab();
    var pre = tabs.length > 1 ? 'כרטיסייה ' + (i + 1) + ', ' : '';
    add(dt.getBody(), pre + 'גוף');
    add(dt.getHeader(), pre + 'כותרת עליונה');
    add(dt.getFooter(), pre + 'כותרת תחתונה');
    (dt.getFootnotes() || []).forEach(function (fn, n) { add(fn.getFootnoteContents(), pre + 'הערה ' + (n + 1)); });
  });
  return out;
}

/** Paragraphs and list items, table cells included, in document order. */
function walk_(el, out) {
  var type = el.getType();
  if (type === DocumentApp.ElementType.PARAGRAPH || type === DocumentApp.ElementType.LIST_ITEM) { out.push(el); return; }
  if (typeof el.getNumChildren === 'function') {
    for (var i = 0; i < el.getNumChildren(); i++) walk_(el.getChild(i), out);
  }
}

// ---- Bracket-direction planning: the literature review's script (scripts/google-docs/fix-document-bidi.gs), unchanged ----

function planBidiFixes(s) {
  var fixes = [];
  bracketPairs_(s).forEach(function (pair) {
    var open = pair[0];
    var close = pair[1];
    var before = directionBefore_(s, open);
    var inside = firstStrong_(s.slice(open + 1, close));
    if (before === 'L' && inside !== 'R') {
      if (directionAfter_(s, close) !== 'L' && s.charAt(close + 1) !== LRM) addFix_(fixes, s, close + 1, LRM, open, close);
    } else if (before !== 'L' && inside === 'L') {
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
  for (var k = fixes.length - 1; k >= 0; k--) s = s.slice(0, fixes[k].offset) + fixes[k].mark + s.slice(fixes[k].offset);
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

function directionBefore_(s, index) {
  for (var i = index - 1; i >= 0; i--) { var d = strongOf_(s.charAt(i)); if (d) return d; }
  return null;
}

function directionAfter_(s, index) {
  for (var i = index + 1; i < s.length; i++) { var d = strongOf_(s.charAt(i)); if (d) return d; }
  return null;
}

function firstStrong_(s) {
  for (var i = 0; i < s.length; i++) { var d = strongOf_(s.charAt(i)); if (d) return d; }
  return null;
}

function stripMarks_(s) {
  return s.replace(/[‎‏]/g, '');
}
