// MathmatiCore — second follow-up (9.10.2026): 7 PRD table cells the previous scripts could not find.
// Every one of them holds a number with a thousands comma ("6,▢5▢ − 2,827"); the cells without a comma
// were found and replaced. The likely cause is an invisible direction mark (RLM/LRM) next to those
// numbers in the Doc, which the export drops. This script therefore matches the text while allowing
// invisible marks anywhere inside it, replaces the cell, and logs what it found. Run applyAll once.
var DOC_ID = '1siy2VT-bPVy9LflxJBt-Xr7uQEW5umHPEh_vMVlmbWY';
var EDITS = [
  ["בעיית חקר של ספרות חסרות משולבות: \"בתרגיל 6,▢5▢ − 2,827 = 3,925 חסרות שתי ספרות של המחוסר המקורי. גלו אותן על סמך התוצאה ובעזרת הלבנים בבית המספרים, וכתבו אותן בתיבות הריקות.\"", "בעיית חקר של ספרות חסרות משולבות: \"בתרגיל 6,▢5▢ − 2,827 = 3,925 חסרות שתי ספרות במספר הראשון. גלו אותן בעזרת הלבנים. כתבו אותן בתיבות הריקות.\""],
  ["שתי ספרות חסרות בחיבור עם המרה כפולה: \"בתרגיל 2,▢3▢ + 1,554 = 4,191 חסרות שתי ספרות במספר הראשון, בטורים שונים. גלו אותן בעזרת הלבנים וכתבו אותן בתיבות הריקות.\"", "שתי ספרות חסרות בחיבור עם המרה כפולה: \"בתרגיל 2,▢3▢ + 1,554 = 4,191 חסרות שתי ספרות במספר הראשון, בטורים שונים. גלו אותן בעזרת הלבנים. כתבו אותן בתיבות הריקות.\""],
  ["שלוש ספרות חסרות בחיסור עם שלוש פריטות: \"בתרגיל 5,▢▢▢ − 2,847 = 2,159 חסרות שלוש ספרות במספר הראשון. גלו את הספרות בעזרת הלבנים וכתבו אותן בתיבות הריקות.\"", "שלוש ספרות חסרות בחיסור עם שלוש פריטות: \"בתרגיל 5,▢▢▢ − 2,847 = 2,159 חסרות שלוש ספרות במספר הראשון. גלו את הספרות בעזרת הלבנים. כתבו אותן בתיבות הריקות.\""],
  ["בעיית חקר של ספרות חסרות בחיבור: \"בתרגיל 5,▢7▢ + 2,453 = 8,131 חסרות שתי ספרות במספר הראשון. גלו אותן וכתבו אותן בתיבות הריקות.\"", "בעיית חקר של ספרות חסרות בחיבור: \"בתרגיל 5,▢7▢ + 2,453 = 8,131 חסרות שתי ספרות במספר הראשון. גלו אותן. כתבו אותן בתיבות הריקות.\""],
  ["בעיית חקר של ספרות חסרות בחיסור: \"בתרגיל 4,▢▢▢ − 1,562 = 2,438 חסרות שלוש ספרות במספר הראשון. גלו אותן וכתבו אותן בתיבות הריקות.\"", "בעיית חקר של ספרות חסרות בחיסור: \"בתרגיל 4,▢▢▢ − 1,562 = 2,438 חסרות שלוש ספרות במספר הראשון. גלו אותן. כתבו אותן בתיבות הריקות.\""],
  ["משימת חקר של הרכבי המרה משתנים: נתון 3,456 + 2,183 = 5,639; \"מחליפים רק את ספרת היחידות של המחובר הראשון: 3,459 + 2,183. מה ישתנה?\" התשובה הנכונה: תיווסף המרה גם בטור היחידות, ההמרה בטור העשרות תישאר, והתוצאה תהיה 5,642", "משימת חקר של הרכבי המרה משתנים: נתון 3,456 + 2,183 = 5,639; \"מחליפים רק את ספרת היחידות במספר הראשון: 3,459 + 2,183. מה ישתנה?\" התשובה הנכונה: \"תהיה הקבצה בטור היחידות ובטור העשרות, והתוצאה תהיה 5,642\"; שתי התשובות האחרות בנויות כמוה: \"תהיה הקבצה רק בטור העשרות, והתוצאה תהיה 5,632\" ו\"תהיה הקבצה רק בטור היחידות, והתוצאה תהיה 5,542\""],
  ["משימת חקר של הרכבי פריטה משתנים: נתון 7,651 − 3,381 = 4,270; \"מחליפים רק את ספרת העשרות של המחוסר: 7,691 − 3,381. מה ישתנה?\" התשובה הנכונה: לא תידרש יותר פריטה כי 9 עשרות גדולות מ-8 עשרות, והתוצאה תהיה 4,310", "משימת חקר של הרכבי פריטה משתנים: נתון 7,651 − 3,381 = 4,270; \"מחליפים רק את ספרת העשרות במספר הראשון: 7,691 − 3,381. מה ישתנה?\" התשובה הנכונה: \"לא תהיה פריטה באף טור, והתוצאה תהיה 4,310\"; שתי התשובות האחרות בנויות כמוה: \"תהיה פריטה מטור המאות, והתוצאה תהיה 4,210\" ו\"לא תהיה פריטה באף טור, והתוצאה תישאר 4,270\""]
];
var INVISIBLE = '[\\x{200B}-\\x{200F}\\x{202A}-\\x{202E}\\x{2060}-\\x{2069}\\x{00A0}\\x{FEFF}]*';
function tolerant_(s) {
  var out = '';
  for (var i = 0; i < s.length; i++) {
    var c = s[i];
    out += (/[.*+?^${}()|[\]\\]/.test(c) ? '\\' + c : c) + INVISIBLE;
  }
  return out;
}
function applyAll() {
  var body = DocumentApp.openById(DOC_ID).getBody();
  var done = 0, already = 0, skipped = 0;
  EDITS.forEach(function (e) {
    var oldText = e[0], newText = e[1];
    if (body.findText(tolerant_(newText))) { already++; return; }
    var matches = [], r = body.findText(tolerant_(oldText));
    while (r) { matches.push(r); r = body.findText(tolerant_(oldText), r); }
    if (matches.length !== 1) {
      skipped++;
      Logger.log('נמצא ' + matches.length + ' פעמים במקום 1, דולג: ' + oldText.slice(0, 50));
      // Help the next diagnosis: show the cell that holds the first 25 characters, with code points of odd characters.
      var probe = body.findText(tolerant_(oldText.slice(0, 25)));
      if (probe) {
        var txt = probe.getElement().asText().getText();
        var odd = [];
        for (var i = 0; i < txt.length; i++) { var cp = txt.charCodeAt(i); if (cp < 32 || (cp > 126 && cp < 0x5D0) || (cp > 0x5EA && cp !== 0x25A2 && cp !== 0x2212)) odd.push(i + ':U+' + cp.toString(16)); }
        Logger.log('התא שנמצא: ' + txt.slice(0, 120));
        Logger.log('תווים חריגים בתא: ' + (odd.length ? odd.join(' ') : 'אין'));
      }
      return;
    }
    var found = matches[0];
    var t = found.getElement().asText();
    var s = found.getStartOffset();
    t.deleteText(s, found.getEndOffsetInclusive());
    t.insertText(s, newText);
    done++;
  });
  Logger.log('PRD — הוחלפו: ' + done + '. כבר היו מעודכנים: ' + already + '. דולגו: ' + skipped + '.');
}
