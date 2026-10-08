/**
 * מוחק את שלושת קטעי הקוד הכפולים שנוצרו בסנכרון: עותק בפסקאות רגילות שנוסף לפני
 * בלוק הקוד המקורי של דוקס. בלוקי הקוד המקוריים נשארים.
 */
function removeDuplicateCode() {
  var body = DocumentApp.getActiveDocument().getBody();
  var names = ['export interface GeminiReportRequest {', 'export interface ResetAuditEntry {'];
  var removed = 0;
  for (var i = body.getNumChildren() - 1; i >= 0; i--) {
    var el = body.getChild(i);
    if (el.getType() !== DocumentApp.ElementType.PARAGRAPH) continue;
    if (names.indexOf(el.asText().getText().trim()) < 0) continue;
    // Collect this plain copy: from the "export interface" line to the first "}" line.
    var end = i;
    while (end + 1 < body.getNumChildren()) {
      var n = body.getChild(end + 1);
      if (n.getType() !== DocumentApp.ElementType.PARAGRAPH) break;
      end++;
      if (n.asText().getText().trim() === '}') break;
    }
    for (var k = end; k >= i; k--) body.getChild(k).removeFromParent();
    removed++;
  }
  Logger.log('נמחקו %s עותקים כפולים של קטעי קוד.', removed);
}
