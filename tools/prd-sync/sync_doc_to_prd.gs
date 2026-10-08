/**
 * MathematiCore — מסנכרן את ה-PRD בגוגל דוקס אל ה-PRD שבריפו, בריצה אחת.
 *
 * איך מריצים:
 *   1. פותחים את המסמך "07- 3.MathematiCore_PRD_v07 הסופי" בגוגל דוקס.
 *   2. תוספים ← Apps Script. מוחקים את כל הקוד שבעורך ומדביקים את הקובץ הזה. שומרים.
 *   3. בוחרים previewSync ולוחצים "הפעלה": רק מדווח ביומן מה ישתנה, בלי לגעת במסמך.
 *   4. בוחרים applySync ולוחצים "הפעלה": מבצע.
 *
 * איך זה עובד:
 *   - מושך את ה-PRD היעד (Markdown) מגיטהאב.
 *   - קורא את המסמך פסקה-פסקה, ומשווה את שני הרצפים (השוואת רצפים, כמו diff).
 *   - פסקה שזהה ביעד — לא נוגעים בה בכלל, כולל העיצוב שלה.
 *   - רק פסקאות שונות מוחלפות, נמחקות או נוספות, במקום המדויק שלהן.
 *   - פסקה שמוחלפת שומרת את סגנון הפסקה שלה. פסקאות חדשות מקבלות כותרת, הדגשה,
 *     הטיה, תבליטים ומספור לפי ה-Markdown, וטבלאות נבנות כטבלאות דוקס.
 *   - ריצה חוזרת אחרי ריצה מוצלחת לא משנה כלום (אין הבדלים).
 *   - כותרת עליונה ותחתונה של המסמך, ותוכן עניינים אוטומטי, לא נוגעים.
 */

var TARGET_URL = 'https://raw.githubusercontent.com/davsapiash-ui/MathmatiCore/claude/pensive-hawking-ceufrl/%D7%9E%D7%A1%D7%9E%D7%9B%D7%99%20%D7%90%D7%A4%D7%99%D7%95%D7%9F/07-%203.MathematiCore_PRD_v07%20%D7%94%D7%A1%D7%95%D7%A4%D7%99.md';

function previewSync() { sync_(false); }
function applySync()   { sync_(true); }

function sync_(write) {
  var res = UrlFetchApp.fetch(TARGET_URL, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('לא הצלחתי למשוך את ה-PRD מגיטהאב: ' + res.getResponseCode());
  var target = parseTarget_(res.getContentText('UTF-8'));
  var body = DocumentApp.getActiveDocument().getBody();
  var doc = walkDoc_(body);
  var hunks = diff_(doc, target);
  logHunks_(doc, target, hunks);
  if (!write) { Logger.log('תצוגה מקדימה בלבד. להחלה: applySync.'); return; }
  for (var h = hunks.length - 1; h >= 0; h--) applyHunk_(body, doc, target, hunks[h]);
  Logger.log('הסתיים. בוצעו %s שינויים.', hunks.length);
}

// ---------- keys ----------

function key_(s) {
  s = String(s).replace(/^\s*#{1,6}\s+/, '').replace(/[\\*]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^((\d+[.)]|[•·\-–])\s+)+/, '');
  return s.trim();
}
function decorative_(k) { return k === '' || /^[_\-=\s]+$/.test(k); }

// ---------- target (Markdown) ----------

function parseTarget_(md) {
  var lines = md.replace(/\r/g, '').split('\n');
  var units = [];
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    if (/^\s*\|/.test(l)) {
      var rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        var cells = lines[i].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); });
        if (!cells.every(function (c) { return /^:?-+:?$/.test(c); })) rows.push(cells);
        i++;
      }
      i--;
      units.push({ kind: 'table', rows: rows, key: tableKey_(rows.map(function (r) { return r.map(key_); })) });
      continue;
    }
    var k = key_(l);
    if (decorative_(k)) continue;
    units.push({ kind: 'para', md: l, key: k });
  }
  return units;
}

function tableKey_(rows) { return 'TABLE:' + rows.map(function (r) { return r.join(' | '); }).join(' || '); }

// ---------- document ----------

function walkDoc_(body) {
  var units = [];
  var T = DocumentApp.ElementType;
  for (var i = 0; i < body.getNumChildren(); i++) {
    var el = body.getChild(i);
    var type = el.getType();
    if (type === T.PARAGRAPH || type === T.LIST_ITEM) {
      var raw = el.asText().getText();
      var parts = raw.split(/[\r\n\u000b]/);
      if (parts.length === 1) {
        var k = key_(raw);
        if (!decorative_(k)) units.push({ kind: 'para', el: el, line: null, key: k, raw: raw });
      } else {
        for (var p = 0; p < parts.length; p++) {
          var kk = key_(parts[p]);
          if (!decorative_(kk)) units.push({ kind: 'para', el: el, line: p, key: kk, raw: parts[p] });
        }
      }
    } else if (type === T.TABLE) {
      var tb = el.asTable(), rows = [];
      for (var r = 0; r < tb.getNumRows(); r++) {
        var row = tb.getRow(r), cells = [];
        for (var c = 0; c < row.getNumCells(); c++) cells.push(key_(row.getCell(c).getText()));
        rows.push(cells);
      }
      units.push({ kind: 'table', el: el, line: null, key: tableKey_(rows) });
    }
  }
  return units;
}

// ---------- diff (LCS) ----------

function diff_(a, b) {
  var n = a.length, m = b.length, ids = {}, next = 1;
  function id(k) { if (!ids[k]) ids[k] = next++; return ids[k]; }
  var A = a.map(function (u) { return id(u.key); });
  var B = b.map(function (u) { return id(u.key); });
  // Paragraphs a previous script left with a typed "• " are equal by key but still need rewriting.
  var dirty = a.map(function (u) { return u.kind === 'para' && /^\s*•/.test(u.raw || ''); });
  var W = m + 1, L = new Uint16Array((n + 1) * W);
  for (var i = n - 1; i >= 0; i--)
    for (var j = m - 1; j >= 0; j--)
      L[i * W + j] = (A[i] === B[j] && !dirty[i]) ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
  var hunks = [], i2 = 0, j2 = 0, cur = null;
  function open() { if (!cur) cur = { i1: i2, j1: j2 }; }
  function close() { if (cur) { cur.i2 = i2; cur.j2 = j2; hunks.push(cur); cur = null; } }
  while (i2 < n || j2 < m) {
    if (i2 < n && j2 < m && A[i2] === B[j2] && !dirty[i2]) { close(); i2++; j2++; }
    else if (j2 < m && (i2 >= n || L[i2 * W + j2 + 1] >= L[(i2 + 1) * W + j2])) { open(); j2++; }
    else { open(); i2++; }
  }
  close();
  return hunks;
}

function logHunks_(doc, target, hunks) {
  var del = 0, ins = 0;
  hunks.forEach(function (h) {
    del += h.i2 - h.i1; ins += h.j2 - h.j1;
    var from = doc.slice(h.i1, h.i2).map(function (u) { return u.key.slice(0, 60); });
    var to = target.slice(h.j1, h.j2).map(function (u) { return u.key.slice(0, 60); });
    var what = from.length && to.length ? 'מחליף' : (from.length ? 'מוחק' : 'מוסיף');
    var at = h.i1 > 0 ? doc[h.i1 - 1].key.slice(0, 40) : '(תחילת המסמך)';
    Logger.log('%s | אחרי: "%s…" | %s פסקאות → %s פסקאות | ראשונה ישנה: "%s" | ראשונה חדשה: "%s"',
      what, at, from.length, to.length, from[0] || '', to[0] || '');
  });
  Logger.log('סה"כ %s מקומות שונים: %s פסקאות יוסרו או יוחלפו, %s פסקאות ייכתבו.', hunks.length, del, ins);
}

// ---------- apply ----------

function applyHunk_(body, doc, target, h) {
  var olds = doc.slice(h.i1, h.i2), news = target.slice(h.j1, h.j2);

  // 1. A whole paragraph replaced by a paragraph: rewrite it in place (keeps its paragraph style).
  if (olds.length && news.length && olds[0].kind === 'para' && olds[0].line === null && news[0].kind === 'para'
      && !isListMd_(news[0].md) === (olds[0].el.getType() !== DocumentApp.ElementType.LIST_ITEM)) {
    writeMd_(olds[0].el, news[0].md);
    var anchor = olds[0].el;
    removeUnits_(olds.slice(1));
    insertUnitsAfter_(body, anchor, null, news.slice(1));
    return;
  }

  // 2. Code-block lines: edit inside the multi-line paragraph.
  var prev = h.i1 > 0 ? doc[h.i1 - 1] : null;
  var allLines = olds.every(function (u) { return u.line !== null; });
  if ((olds.length ? allLines && olds[0].line !== null : prev && prev.line !== null) && news.every(function (u) { return u.kind === 'para'; })) {
    var host = olds.length ? olds[0].el : prev.el;
    var parts = host.asText().getText().split(/[\r\n\u000b]/);
    var newLines = news.map(function (u) { return plainLine_(u.md); });
    var dropFrom = olds.length ? olds[0].line : prev.line + 1;
    var removeIdx = olds.filter(function (u) { return u.el === host; }).map(function (u) { return u.line; });
    var kept = [];
    for (var x = 0; x < parts.length; x++) {
      if (x === dropFrom) kept = kept.concat(newLines);
      if (removeIdx.indexOf(x) < 0) kept.push(parts[x]);
    }
    if (dropFrom >= parts.length) kept = kept.concat(newLines);
    host.asText().setText(kept.join('\n'));
    removeUnits_(olds.filter(function (u) { return u.el !== host; }));
    return;
  }

  // 3. General case: remove the old units, insert the new ones after the previous unit.
  var anchorEl = prev ? prev.el : null;
  removeUnits_(olds);
  insertUnitsAfter_(body, anchorEl, prev, news);
}

function removeUnits_(units) {
  for (var i = units.length - 1; i >= 0; i--) {
    var u = units[i];
    try {
      if (u.line !== null) {
        var parts = u.el.asText().getText().split(/[\r\n\u000b]/);
        parts.splice(u.line, 1);
        if (parts.join('').trim() === '') removeEl_(u.el); else u.el.asText().setText(parts.join('\n'));
      } else {
        removeEl_(u.el);
      }
    } catch (e) { Logger.log('לא הצלחתי להסיר: ' + e.message); }
  }
}

function removeEl_(el) {
  var parent = el.getParent();
  if (parent.getNumChildren() <= 1 || (parent.getType() === DocumentApp.ElementType.BODY_SECTION && parent.getChildIndex(el) === parent.getNumChildren() - 1)) {
    if (el.getType() === DocumentApp.ElementType.TABLE) { parent.insertParagraph(parent.getChildIndex(el), ''); }
    else { el.asText().setText(''); return; }
  }
  el.removeFromParent();
}

function insertUnitsAfter_(body, anchorEl, prevUnit, units) {
  if (!units.length) return;
  var parent = anchorEl ? anchorEl.getParent() : body;
  if (parent.getType() !== DocumentApp.ElementType.BODY_SECTION) { anchorEl = parent; while (anchorEl.getParent().getType() !== DocumentApp.ElementType.BODY_SECTION) anchorEl = anchorEl.getParent(); parent = body; }
  var idx = anchorEl ? body.getChildIndex(anchorEl) + 1 : 0;
  var style = anchorEl && anchorEl.getType() === DocumentApp.ElementType.PARAGRAPH ? anchorEl.asParagraph() : null;
  for (var i = 0; i < units.length; i++) {
    var u = units[i];
    if (u.kind === 'table') { insertTable_(body, idx, u.rows); idx++; continue; }
    var md = u.md, el;
    var lm = /^\s*(\*|-|\d+[.)])\s+/.exec(md);
    if (lm) {
      el = body.insertListItem(idx, '');
      el.setGlyphType(/\d/.test(lm[1]) ? DocumentApp.GlyphType.NUMBER : DocumentApp.GlyphType.BULLET);
      writeMd_(el, md);
    } else {
      el = body.insertParagraph(idx, '');
      if (style) { el.setAlignment(style.getAlignment()); el.setLeftToRight(style.isLeftToRight()); }
      writeMd_(el, md);
    }
    idx++;
  }
}

function insertTable_(body, idx, rows) {
  var cells = rows.map(function (r) { return r.map(function (c) { return plainInline_(c).text; }); });
  var width = Math.max.apply(null, cells.map(function (r) { return r.length; }));
  cells = cells.map(function (r) { while (r.length < width) r.push(''); return r; });
  var t = body.insertTable(idx, cells);
  for (var c = 0; c < t.getRow(0).getNumCells(); c++) t.getRow(0).getCell(c).editAsText().setBold(true);
  for (var r = 0; r < t.getNumRows(); r++)
    for (var k = 0; k < t.getRow(r).getNumCells(); k++) {
      var cell = t.getRow(r).getCell(k);
      for (var p = 0; p < cell.getNumChildren(); p++) {
        var ch = cell.getChild(p);
        if (ch.getType() === DocumentApp.ElementType.PARAGRAPH) { ch.asParagraph().setLeftToRight(false); ch.asParagraph().setAlignment(DocumentApp.HorizontalAlignment.RIGHT); }
      }
    }
}

function isListMd_(md) { return /^\s*(\*|-|\d+[.)])\s+/.test(md); }

function plainLine_(md) { return md.replace(/\*\*/g, '').replace(/\\([^A-Za-z0-9֐-׿\s])/g, '$1').replace(/\s+$/, ''); }

// Markdown inline → {text, bold:[[s,e]], italic:[[s,e]]}
function plainInline_(s) {
  s = s.replace(/\\([^A-Za-z0-9֐-׿\s])/g, '\u0000$1');
  var out = '', bold = [], ital = [], i = 0, bs = -1, is = -1;
  while (i < s.length) {
    if (s[i] === '\u0000') { out += s[i + 1]; i += 2; continue; }
    if (s[i] === '*' && s[i + 1] === '*') { if (bs < 0) bs = out.length; else { if (out.length > bs) bold.push([bs, out.length - 1]); bs = -1; } i += 2; continue; }
    if (s[i] === '*') { if (is < 0) is = out.length; else { if (out.length > is) ital.push([is, out.length - 1]); is = -1; } i++; continue; }
    out += s[i]; i++;
  }
  return { text: out, bold: bold, italic: ital };
}

function writeMd_(el, md) {
  var heading = null, s = md;
  var h = /^\s*(#{1,6})\s+(.*)$/.exec(s);
  if (h) { heading = h[1].length; s = h[2]; }
  var isList = el.getType() === DocumentApp.ElementType.LIST_ITEM;
  s = s.replace(/^\s*(\*|-|\d+[.)])\s+/, '');
  var r = plainInline_(s.trim());
  var t = el.editAsText();
  t.setText(r.text);
  if (r.text.length) { t.setBold(0, r.text.length - 1, false); t.setItalic(0, r.text.length - 1, false); }
  r.bold.forEach(function (b) { t.setBold(b[0], b[1], true); });
  r.italic.forEach(function (b) { t.setItalic(b[0], b[1], true); });
  if (!isList) {
    var H = DocumentApp.ParagraphHeading;
    el.setHeading(heading ? [H.HEADING1, H.HEADING2, H.HEADING3, H.HEADING4, H.HEADING5, H.HEADING6][heading - 1] : H.NORMAL);
  }
}
