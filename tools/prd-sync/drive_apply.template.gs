/**
 * MathematiCore — עדכון ה-PRD בגוגל דוקס, פסקה-פסקה, בלי לדרוס את המסמך.
 *
 * איך מריצים (פעם אחת):
 *   1. פותחים את המסמך "07- 3.MathematiCore_PRD_v07 הסופי" בגוגל דוקס.
 *   2. תוספים ← Apps Script. מוחקים את הקוד שמופיע ומדביקים את כל הקובץ הזה.
 *   3. בוחרים את הפונקציה applyPrdOps ולוחצים "הפעלה". מאשרים הרשאות בפעם הראשונה.
 *   4. פותחים "יומן ביצוע" (Execution log) ורואים מה בוצע ומה דולג.
 *
 * מה הסקריפט עושה:
 *   - כל פעולה מחפשת פסקה אחת קיימת במסמך (לפי הטקסט המלא שלה).
 *   - replace: מחליף את הטקסט של אותה פסקה בלבד. עיצוב הפסקה (כותרת, יישור, גופן) נשמר.
 *   - insert_after: מוסיף פסקאות חדשות אחרי אותה פסקה, באותו עיצוב פסקה.
 *   - פסקה שלא נמצאה (כי שיניתם אותה בדרייב) — מדולגת ונרשמת ביומן. שום דבר אחר במסמך לא נוגע.
 *   - הריצה בטוחה לחזרה: פעולה שכבר בוצעה לא תימצא שוב ותדולג.
 *
 * לפני הריצה אפשר להריץ previewPrdOps — היא רק בודקת ומדווחת, בלי לשנות כלום.
 */

var OPS_JSON = __OPS_JSON__;

var NEW_VERSION_LINE = __VERSION_LINE__;

function previewPrdOps() { run_(false); }
function applyPrdOps()   { run_(true); }

function run_(write) {
  var ops = JSON.parse(OPS_JSON);
  var body = DocumentApp.getActiveDocument().getBody();
  var done = 0, skipped = [];

  // Version line: the paragraph that starts with "גרסה" or "מוגרסה" and contains "7.3".
  var paras = body.getParagraphs();
  for (var i = 0; i < paras.length; i++) {
    var t = paras[i].getText().trim();
    if (/^(מו)?גרסה\s*7\.3/.test(t)) {
      if (write) paras[i].editAsText().setText(NEW_VERSION_LINE);
      Logger.log('גרסה: "%s" → "%s"', t, NEW_VERSION_LINE);
      break;
    }
  }

  for (var k = 0; k < ops.length; k++) {
    var op = ops[k];
    var anchorText = plain_(op.op === 'replace' ? op.old : op.anchor);
    var para = findParagraph_(body, anchorText);
    if (!para) { skipped.push((op.source || '?') + ': לא נמצאה הפסקה: "' + anchorText.slice(0, 60) + '…"'); continue; }
    if (!write) { done++; continue; }

    var newParas = op.new.split(/\n\s*\n/);
    if (op.op === 'replace') {
      setParagraphMarkdown_(para, newParas[0]);
      insertAfter_(body, para, newParas.slice(1));
    } else {
      insertAfter_(body, para, newParas);
    }
    done++;
  }
  Logger.log('%s %s פעולות. דולגו: %s', write ? 'בוצעו' : 'ניתן לבצע', done, skipped.length);
  skipped.forEach(function (s) { Logger.log('דולג — ' + s); });
}

function insertAfter_(body, para, mdParas) {
  var attrs = para.getAttributes();
  var idx = body.getChildIndex(para);
  for (var j = 0; j < mdParas.length; j++) {
    var p = body.insertParagraph(idx + 1 + j, '');
    p.setAttributes(attrs);
    p.setHeading(DocumentApp.ParagraphHeading.NORMAL);
    setParagraphMarkdown_(p, mdParas[j]);
  }
}

// Writes one markdown paragraph into a Docs paragraph: "### " → heading 3, "**x**" → bold.
function setParagraphMarkdown_(para, md) {
  var heading = null, text = md;
  var h = /^(#{1,6})\s+(.*)$/.exec(md);
  if (h) { heading = h[1].length; text = h[2]; }
  text = text.replace(/^\* /, '• ').replace(/\\([.\-_()\[\]*])/g, '$1');
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
  if (heading) {
    var H = DocumentApp.ParagraphHeading;
    para.setHeading([H.HEADING1, H.HEADING2, H.HEADING3, H.HEADING4, H.HEADING5, H.HEADING6][heading - 1]);
  }
}

// Markdown line → the plain text Docs holds for the same paragraph.
function plain_(md) {
  return md.replace(/^#{1,6}\s+/, '')
           .replace(/\*\*/g, '')
           .replace(/(^|[\s(])\*([^*]+)\*(?=[\s).,;:]|$)/g, '$1$2')
           .replace(/^\* /, '')
           .replace(/\\([.\-_()\[\]*])/g, '$1')
           .replace(/\s+/g, ' ').trim();
}

function findParagraph_(body, text) {
  var paras = body.getParagraphs();
  for (var i = 0; i < paras.length; i++) {
    var t = paras[i].getText().replace(/\s+/g, ' ').trim();
    if (t === text) return paras[i];
  }
  // List items are not paragraphs in Docs.
  var items = body.getListItems();
  for (var j = 0; j < items.length; j++) {
    var u = items[j].getText().replace(/\s+/g, ' ').trim();
    if (u === text) return items[j];
  }
  return null;
}
