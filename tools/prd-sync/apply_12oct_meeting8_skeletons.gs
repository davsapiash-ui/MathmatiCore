// MathmatiCore — 12.10.2026: meeting 8's missing-digit exercises no longer repeat an exercise solved earlier in the same
// meeting; each is now built on another exercise from meetings 4–6 of the same path (doc 03 §3.8, PRD 8.7).
var DOCS = [
  { name: 'מסמך 03', id: '1deVf-QeccnmA37jb5lkFHh-6Df1NMYGSFrWQL29gK4A', edits: [
    ["וספרה חסרה 3▢2 + 61 = 413",
     "וספרה חסרה 2▢5 + 39 = 314",
     "2▢5 + 39 = 314", 1],
    ["וספרה חסרה 5▢ + 37 = 93",
     "וספרה חסרה 3▢ + 44 = 83",
     "3▢ + 44 = 83", 1],
    ["בתרגיל חיבור המצריך שלוש המרות רצופות בתחום הרבבה",
     "בתרגיל חיבור בתחום הרבבה המצריך המרה אחת בטור המאות",
     "המצריך המרה אחת בטור המאות", 1]
  ] },
  { name: 'PRD', id: '1siy2VT-bPVy9LflxJBt-Xr7uQEW5umHPEh_vMVlmbWY', version: '8.7', edits: [
    ["5,▢7▢ + 2,453 = 8,131",
     "4,▢2▢ + 1,534 = 6,355",
     "4,▢2▢ + 1,534 = 6,355", 1],
    ["4▢6 + 281 = 737",
     "3▢4 + 128 = 482",
     "3▢4 + 128 = 482", 1],
    ["4,▢▢▢ − 1,562 = 2,438",
     "5,▢▢▢ − 2,345 = 2,655",
     "5,▢▢▢ − 2,345 = 2,655", 1],
    ["3▢2 + 61 = 413",
     "2▢5 + 39 = 314",
     "2▢5 + 39 = 314", 1],
    ["5▢ + 37 = 93",
     "3▢ + 44 = 83",
     "3▢ + 44 = 83", 1]
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
