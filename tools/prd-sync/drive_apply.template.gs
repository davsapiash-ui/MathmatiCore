/**
 * MathematiCore — עדכון ה-PRD בגוגל דוקס, פסקה-פסקה, בלי לדרוס את המסמך.
 *
 * איך מריצים:
 *   1. פותחים את המסמך "07- 3.MathematiCore_PRD_v07 הסופי" בגוגל דוקס.
 *   2. תוספים ← Apps Script. מוחקים את הקוד שמופיע ומדביקים את כל הקובץ הזה. שומרים.
 *   3. בוחרים previewPrdOps ולוחצים "הפעלה" (בדיקה בלבד). מאשרים הרשאות בפעם הראשונה.
 *   4. בוחרים applyPrdOps ולוחצים "הפעלה".
 *   5. פותחים "יומן ביצוע" (Execution log) ורואים מה בוצע ומה דולג.
 *
 * מה הסקריפט עושה:
 *   - כל פעולה מחפשת פסקה אחת קיימת במסמך (לפי הטקסט המלא שלה, בלי מספור ותבליטים).
 *   - replace: מחליף את הטקסט של אותה פסקה בלבד. עיצוב הפסקה נשמר. טקסט ריק = מחיקת הפסקה.
 *   - insert_after: מוסיף פסקאות חדשות אחרי אותה פסקה, באותו עיצוב פסקה.
 *   - שורה בתוך קטע קוד (פסקה רב-שורתית): העריכה נעשית בתוך אותה פסקה.
 *   - שורת טבלה: מחיקה של השורה בטבלה (ושל הטבלה כולה כשהיא מתרוקנת).
 *   - פעולה שכבר בוצעה בריצה קודמת מזוהה ומדולגת. ריצה חוזרת בטוחה.
 *   - פסקה שלא נמצאה (כי שיניתם אותה בדרייב) — מדולגת ונרשמת ביומן.
 */

var OPS_JSON = __OPS_JSON__;

var NEW_VERSION_LINE = __VERSION_LINE__;

function previewPrdOps() { run_(false); }
function applyPrdOps()   { run_(true); }

function loadOps_() { return JSON.parse(OPS_JSON); }

function run_(write) {
  var ops = loadOps_();
  var body = DocumentApp.getActiveDocument().getBody();
  var done = 0, already = 0, skipped = [];

  // Version line.
  var paras = body.getParagraphs();
  for (var i = 0; i < paras.length; i++) {
    var t = paras[i].getText().trim();
    if (/^(מו)?גרסה\s*7\.3/.test(t)) {
      if (write) paras[i].editAsText().setText(NEW_VERSION_LINE);
      Logger.log('גרסה: "%s" → "%s"', t, NEW_VERSION_LINE);
      break;
    }
  }

  if (write) cleanDoubleBullets_(body);

  for (var k = 0; k < ops.length; k++) {
    var op = ops[k];
    var src = op.source || '?';
    var anchorMd = op.op === 'replace' ? op.old : op.anchor;
    var anchorText = plain_(anchorMd);
    var newParas = (op.new || '').split(/\n\s*\n/).filter(function (s) { return s.trim() !== ''; });

    try {
      // Table row ops (anchor looks like "| a | b |").
      if (/^\|/.test(anchorMd)) {
        var r = handleTableRow_(body, anchorMd, newParas, write);
        if (r === 'done') done++; else if (r === 'already') already++; else skipped.push(src + ': לא נמצאה שורת הטבלה: "' + anchorText.slice(0, 50) + '…"');
        continue;
      }

      var hit = findParagraph_(body, anchorText);

      if (!hit) {
        // Already applied? For replace: the new first paragraph exists. For delete: nothing to find.
        if (op.op === 'replace' && (newParas.length === 0 || findParagraph_(body, plain_(newParas[0])))) { already++; continue; }
        skipped.push(src + ': לא נמצאה הפסקה: "' + anchorText.slice(0, 60) + '…"');
        continue;
      }

      if (hit.line !== null) {
        // The anchor is one line inside a multi-line paragraph (a code block).
        var lines = hit.el.getText().split('\n');
        var newLines = newParas.map(function (p) { return plainKeepLines_(p); }).join('\n').split('\n');
        if (op.op === 'insert_after' && lines[hit.line + 1] !== undefined && norm_(lines[hit.line + 1]) === norm_(newLines[0])) { already++; continue; }
        if (!write) { done++; continue; }
        if (op.op === 'replace') lines.splice(hit.line, 1);
        var at = op.op === 'replace' ? hit.line : hit.line + 1;
        Array.prototype.splice.apply(lines, [at, 0].concat(newLines));
        hit.el.editAsText().setText(lines.join('\n'));
        done++;
        continue;
      }

      var para = hit.el;
      if (op.op === 'insert_after' && newParas.length && nextText_(para) === plain_(newParas[0])) { already++; continue; }
      if (!write) { done++; continue; }

      if (op.op === 'replace') {
        if (newParas.length === 0) { removeElement_(para); done++; continue; }
        setParagraphMarkdown_(para, newParas[0]);
        insertAfter_(para, newParas.slice(1));
      } else {
        insertAfter_(para, newParas);
      }
      done++;
    } catch (e) {
      skipped.push(src + ': שגיאה: ' + e.message + ' — "' + anchorText.slice(0, 50) + '…"');
    }
  }
  Logger.log('%s %s פעולות. כבר בוצעו קודם: %s. דולגו: %s', write ? 'בוצעו' : 'ניתן לבצע', done, already, skipped.length);
  skipped.forEach(function (s) { Logger.log('דולג — ' + s); });
}

// ---------- helpers ----------

// Removes a leading list marker the text export or an earlier run may have left ("3. ", "• ", "* ").
function stripMarker_(s) {
  return s.replace(/^(\s*(\d+[.)]|[•*·\-–])\s+)+/, '');
}

function norm_(s) { return stripMarker_(String(s).replace(/\s+/g, ' ').trim()); }

// Markdown line → plain text as Docs holds it.
function plain_(md) {
  var s = md.replace(/^#{1,6}\s+/, '')
            .replace(/\*\*/g, '')
            .replace(/(^|[\s(])\*([^*]+)\*(?=[\s).,;:]|$)/g, '$1$2')
            .replace(/^\* /, '')
            .replace(/\\([^A-Za-z0-9֐-׿])/g, '$1');
  return norm_(s);
}

// Same, but for code-block lines: keep inner newlines and leading spaces.
function plainKeepLines_(md) {
  return md.replace(/\*\*/g, '').replace(/\\([^A-Za-z0-9֐-׿])/g, '$1').replace(/\s+$/, '');
}

function elements_(body) {
  var out = [];
  var paras = body.getParagraphs();
  for (var i = 0; i < paras.length; i++) out.push(paras[i]);
  var items = body.getListItems();
  for (var j = 0; j < items.length; j++) out.push(items[j]);
  return out;
}

// Returns {el, line} — line is null for a whole-paragraph match, or the index of the matching line inside a multi-line paragraph.
function findParagraph_(body, text) {
  var els = elements_(body);
  for (var i = 0; i < els.length; i++) {
    var t = els[i].getText();
    if (norm_(t) === text) return { el: els[i], line: null };
  }
  for (var k = 0; k < els.length; k++) {
    var raw = els[k].getText();
    if (raw.indexOf('\n') < 0) continue;
    var lines = raw.split('\n');
    for (var l = 0; l < lines.length; l++) {
      if (norm_(lines[l]) === text) return { el: els[k], line: l };
    }
  }
  return null;
}

function nextText_(para) {
  var parent = para.getParent();
  var idx = parent.getChildIndex(para);
  if (idx + 1 >= parent.getNumChildren()) return null;
  var n = parent.getChild(idx + 1);
  if (n.getType() !== DocumentApp.ElementType.PARAGRAPH && n.getType() !== DocumentApp.ElementType.LIST_ITEM) return null;
  return norm_(n.asText().getText());
}

function removeElement_(el) {
  var parent = el.getParent();
  // A body or cell must keep at least one child; blank it instead.
  if (parent.getNumChildren() <= 1) { el.asText().setText(''); return; }
  parent.removeChild(el);
}

// Inserts right after `para`, inside whatever contains it (the body or a table cell).
function insertAfter_(para, mdParas) {
  var parent = para.getParent();
  var attrs = para.getAttributes();
  var idx = parent.getChildIndex(para);
  for (var j = 0; j < mdParas.length; j++) {
    var p = parent.insertParagraph(idx + 1 + j, '');
    p.setAttributes(attrs);
    p.setHeading(DocumentApp.ParagraphHeading.NORMAL);
    setParagraphMarkdown_(p, mdParas[j]);
  }
}

// Writes one markdown paragraph into a Docs paragraph or list item: "### " → heading 3, "**x**" → bold, "* " → bullet (unless it is already a list item).
function setParagraphMarkdown_(para, md) {
  var heading = null, text = md;
  var h = /^(#{1,6})\s+(.*)$/.exec(md);
  if (h) { heading = h[1].length; text = h[2]; }
  var isList = para.getType() === DocumentApp.ElementType.LIST_ITEM;
  text = text.replace(/^\* /, isList ? '' : '• ').replace(/\\([^A-Za-z0-9֐-׿])/g, '$1');
  var bolds = [], out = '', i = 0;
  while (i < text.length) {
    var s = text.indexOf('**', i);
    if (s < 0) { out += text.slice(i); break; }
    var e = text.indexOf('**', s + 2);
    if (e < 0) { out += text.slice(i); break; }
    out += text.slice(i, s);
    bolds.push([out.length, out.length + (e - s - 2) - 1]);
    out += text.slice(s + 2, e);
    i = e + 2;
  }
  out = out.replace(/(^|[\s(])\*([^*]+)\*(?=[\s).,;:]|$)/g, '$1$2');
  var t = para.editAsText();
  t.setText(out);
  if (out.length) t.setBold(0, out.length - 1, false);
  bolds.forEach(function (b) { if (b[1] >= b[0]) t.setBold(b[0], b[1], true); });
  if (heading && !isList) {
    var H = DocumentApp.ParagraphHeading;
    para.setHeading([H.HEADING1, H.HEADING2, H.HEADING3, H.HEADING4, H.HEADING5, H.HEADING6][heading - 1]);
  }
}

// An earlier run wrote "• " into list items that already carry a bullet. Remove the duplicate.
function cleanDoubleBullets_(body) {
  var items = body.getListItems();
  var n = 0;
  for (var i = 0; i < items.length; i++) {
    var t = items[i].getText();
    if (/^•\s/.test(t)) { items[i].editAsText().deleteText(0, 1); n++; }
  }
  if (n) Logger.log('נוקו %s תבליטים כפולים', n);
}

// Markdown table row op: "| a | b | c |". Only deletion (new == "") is supported; the row is removed, and the table too when it empties.
function handleTableRow_(body, anchorMd, newParas, write) {
  var cells = anchorMd.split('|').slice(1, -1).map(function (c) { return plain_(c); });
  if (cells.every(function (c) { return /^:?-+:?$/.test(c); })) return 'already'; // separator row: nothing in Docs
  var tables = body.getTables();
  for (var t = 0; t < tables.length; t++) {
    var table = tables[t];
    for (var r = 0; r < table.getNumRows(); r++) {
      var row = table.getRow(r);
      if (row.getNumCells() !== cells.length) continue;
      var same = true;
      for (var c = 0; c < cells.length; c++) if (norm_(row.getCell(c).getText()) !== cells[c]) { same = false; break; }
      if (!same) continue;
      if (newParas.length) return 'skip'; // row rewrites are not supported
      if (write) {
        if (table.getNumRows() === 1) table.removeFromParent(); else table.removeRow(r);
      }
      return 'done';
    }
  }
  return 'already'; // not found: deleted earlier or never there
}
