/**
 * Applies exact text replacements to the PRD Google Doc. It never deletes, inserts or
 * moves a paragraph: each edit replaces one sentence, and only if it occurs exactly once.
 * This replaces the earlier paragraph-diff sync, which damaged the Doc's structure
 * (body content ended up in the footer) and must not be used again.
 */
var EDITS = [
  ['גרסה 7.5 | עודכן 8 באוקטובר 2026, 19:26', 'גרסה 7.6 | עודכן 8 באוקטובר 2026'],
  ['When no session is active for the class, or when a session is paused or completed, render', 'When no session is active for the class, render'],
  ['קבועה ביחס של 60% לאגף שמאל (', 'קבועה ביחס של 60% לאגף שמאל של המסך כפי שהוא נראה לעין ('],
  ['(brightness: 0.6) ונעילת pointer-events בטורים שאינם במוקד החישוב הנוכחי.', '(brightness: 0.6); העמעום חזותי בלבד, וטור מעומעם אינו ננעל ללחיצה או לגרירה.'],
  ['Ensure active column pointer events are properly isolated.', 'Dimming is visual only: never disable pointer events on dimmed columns.'],
  ['לאחר תשובה שגויה מופיעות הכותרות', 'לאחר תשובה שגויה כזו (ספרה במקום הלא נכון, כמו בפרופיל הרגיל) מופיעות הכותרות'],
  ['פתיחת החלונית הצידית מקפלת אוטומטית את לוח החיבור האדפטיבי אם היה פתוח, כדי למנוע הסתרה וחפיפה של רכיבים במסך.', 'לוח החיבור האדפטיבי, אם הוא פתוח, אינו נסגר עם פתיחת הכרטיס: הוא נשאר על המסך וממוקם מימין לכרטיס, בלי לכסות אותו (מודול 10).']
];

function applyEdits() {
  var body = DocumentApp.getActiveDocument().getBody();
  if (!body.findText(esc_('גרסה 7.5'))) {
    Logger.log('עצרתי: שורת "גרסה 7.5" לא נמצאה בגוף המסמך. קודם משחזרים את הגרסה מ-19:27.');
    return;
  }
  EDITS.forEach(function (e) {
    var found = body.findText(esc_(e[0]));
    if (!found) { Logger.log('לא נמצא, דולג: ' + e[0].slice(0, 50)); return; }
    if (body.findText(esc_(e[0]), found)) { Logger.log('נמצא יותר מפעם אחת, דולג: ' + e[0].slice(0, 50)); return; }
    var t = found.getElement().asText();
    var s = found.getStartOffset();
    t.deleteText(s, found.getEndOffsetInclusive());
    t.insertText(s, e[1]);
    Logger.log('הוחלף: ' + e[0].slice(0, 50));
  });
}

function esc_(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
