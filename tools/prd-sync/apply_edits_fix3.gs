var EDITS = [
  ["When no session is active for the class, or the active session is paused, or the learner has completed it, render the quiet waiting screen, with the sentence that matches the session state and the learner's completion mark, in the teacher's chosen gender,",
   "When the learner has no open session (none active, the session paused, or the learner has completed it), render the quiet waiting screen, with the sentence that matches the state in the teacher's chosen gender; when the teacher activates the session, swap the same page's content, without a reload, to the station's opening screen, whose \"מתחילים\" button leads to the first exercise. Render the quiet waiting screen"],
  ["בלובי מוצג תמיד אותו מסך המתנה שקט במקום כפתור הכניסה, והמשפט שבו נקבע לפי מצב המפגש ולפי סימן הסיום של הלומד באותה תחנה, ולא לפי סיבת הסגירה: כשהמורה עוד לא פתחה מפגש, \"היום עוד לא התחלנו. המורה תפתח את הפעילות בקרוב.\"; כשהמורה עצרה את המפגש, \"המורה עצרה את הפעילות לרגע.\"; כשהלומד סיים את התחנה של היום, \"כשהמורה תפתח את התחנה הבאה, נמשיך יחד.\"; כשהמורה סגרה את התחנה והלומד לא סיים אותה, \"העבודה שלכם נשמרה בבטחה. המורה תקבע איתכם מתי תמשיכו.\". לומד שסיים את התחנה רואה את משפט הסיום גם אם המורה עצרה או סגרה אותה אחר כך. המשפטים מוצגים בלשון שהמורה בחרה (מודול 7 §א); כאן הם בלשון נקבה, ובלשון זכר הפעלים בזכר: יפתח, עצר, יפתח, יקבע.",
   "אין בלובי כפתור כניסה. כשאין ללומד מפגש פתוח, הלובי מציג מסך המתנה שקט המקבל את פניו, והמשפט שבו נקבע לפי מצב המפגש ולפי סימן הסיום של הלומד באותה תחנה, ולא לפי סיבת הסגירה: כשהמורה עוד לא פתחה מפגש, \"היום עוד לא התחלנו. המורה תפתח את הפעילות בקרוב.\"; כשהמורה עצרה את המפגש, \"המורה עצרה את הפעילות לרגע.\"; כשהלומד סיים את התחנה של היום, \"כשהמורה תפתח את התחנה הבאה, נמשיך יחד.\"; כשהמורה סגרה את התחנה והלומד לא סיים אותה, \"העבודה שלכם נשמרה בבטחה. המורה תקבע איתכם מתי תמשיכו.\". לומד שסיים את התחנה רואה את משפט הסיום גם אם המורה עצרה או סגרה אותה אחר כך. המשפטים מוצגים בלשון שהמורה בחרה (מודול 7 §א); כאן הם בלשון נקבה, ובלשון זכר הפעלים בזכר: יפתח, עצר, יפתח, יקבע. כשהמורה מפעילה את המפגש, התוכן של אותו דף מתחלף, בלי טעינה מחדש של העמוד, למסך הפתיחה של התחנה (סעיף ב׳, \"מה הלומד קורא בתוך מרחב העבודה\"), ולחיצה על \"מתחילים\" מעבירה לתרגיל הראשון של התחנה."],
  ["(in the lobby, the quiet waiting screen instead of the enter button)",
   "(and in the lobby, the quiet waiting screen with the paused sentence)"]
];

function applyEdits() {
  var body = DocumentApp.getActiveDocument().getBody();
  var done = 0, already = 0, skipped = 0;
  EDITS.forEach(function (e) {
    if (body.findText(esc_(e[1]))) { already++; return; }
    var found = body.findText(esc_(e[0]));
    if (!found) { skipped++; Logger.log('לא נמצא, דולג: ' + e[0].slice(0, 50)); return; }
    if (body.findText(esc_(e[0]), found)) { skipped++; Logger.log('נמצא יותר מפעם אחת, דולג: ' + e[0].slice(0, 50)); return; }
    var t = found.getElement().asText();
    var s = found.getStartOffset();
    t.deleteText(s, found.getEndOffsetInclusive());
    t.insertText(s, e[1]);
    done++;
    Logger.log('הוחלף: ' + e[0].slice(0, 50));
  });
  Logger.log('הוחלפו: %s. כבר היו מעודכנים: %s. דולגו: %s.', done, already, skipped);
}

function esc_(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
