// MathmatiCore — 12.10.2026: repairs one icon in document 04's site map. The alignment script of 12.10
// split the icon at the start of the line "ניהול כיתה ומסלולים" into two broken characters. Run fixIcon.
var DOC04 = '1d_pYxI_h9K-pY4VYy2cwJagxuYSRP-9-ovML40iSoeM';
var ICON = '\uD83D\uDC65';
var ANCHOR = ' ניהול כיתה ומסלולים (Class Management & Paths)';

function fixIcon() {
  var texts = [];
  walk_(DocumentApp.openById(DOC04).getBody(), texts);
  var hits = texts.filter(function (t) { return t.getText().indexOf(ANCHOR) !== -1; });
  if (hits.length !== 1) { Logger.log('השורה נמצאה ' + hits.length + ' פעמים. לא שונה דבר.'); return; }
  var t = hits[0], s = t.getText();
  if (s.indexOf(ICON + ANCHOR) !== -1) { Logger.log('הסמל כבר תקין. לא שונה דבר.'); return; }
  var start = s.indexOf('├── ') + 4, end = s.indexOf(ANCHOR) - 1;
  if (start < 4 || end < start || end - start > 3) { Logger.log('המבנה של השורה שונה מהצפוי. לא שונה דבר.'); return; }
  t.deleteText(start, end);
  t.insertText(start, ICON);
  Logger.log('הסמל תוקן: ' + t.getText().slice(0, 40));
}

function walk_(el, out) {
  var type = el.getType();
  if (type === DocumentApp.ElementType.PARAGRAPH || type === DocumentApp.ElementType.LIST_ITEM) { out.push(el.editAsText()); return; }
  if (typeof el.getNumChildren === 'function') {
    for (var i = 0; i < el.getNumChildren(); i++) walk_(el.getChild(i), out);
  }
}
