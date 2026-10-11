// MathmatiCore — 11.10.2026: one number in the PRD. The graded station-7 challenge is ▢▢▢ + 247 = 683 (436 + 247):
// with 445 + 247 = 692 a coaching card's own sum ("4 ועוד 1") equalled a hidden digit, which the cards must never do.
// Run applyAll. Safe to run more than once.
function applyAll() {
  var body = DocumentApp.openById('1siy2VT-bPVy9LflxJBt-Xr7uQEW5umHPEh_vMVlmbWY').getBody();
  var plain = body.getText();
  if (plain.indexOf('▢▢▢ + 247 = 683') !== -1) { Logger.log('PRD — כבר מעודכן.'); return; }
  var n = plain.split('▢▢▢ + 247 = 692').length - 1;
  if (n !== 1) { Logger.log('PRD — נמצא ' + n + ' פעמים במקום פעם אחת, לא שונה.'); return; }
  var r = body.findText('▢▢▢ \+ 247 = 692');
  var t = r.getElement().asText();
  var s = r.getStartOffset();
  t.deleteText(s, r.getEndOffsetInclusive());
  t.insertText(s, '▢▢▢ + 247 = 683');
  Logger.log('PRD — הוחלף: 1.');
}
