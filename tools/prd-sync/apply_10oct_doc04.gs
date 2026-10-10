// MathmatiCore — 10.10.2026: document 04, the teacher's fixed session bar, the radar's status tags and the chat's unread count.
// Run applyAll. Safe to run more than once.
var DOCS = [
  { name: "מסמך 04", id: '1d_pYxI_h9K-pY4VYy2cwJagxuYSRP-9-ovML40iSoeM', version: null, edits: [
  ["וסגירתו. המפגש נסגר מעצמו בתום זמן השיעור", "וסגירתו. הבורר מוצג בפס קבוע בראש מסך המורה, הנשאר גלוי בכל לשוניות הדשבורד, ולצדו מספר הלומדים המחוברים והזמן שחלף מתחילת המפגש; בלחיצת המורה על פתיחת המפגש עובר המסך לרדאר הפדגוגי השקט. המפגש נסגר מעצמו בתום זמן השיעור"],
  ["חיוויי צבע חלקים ואיטיים (מניעת תנועה מהירה המסיחה את דעת המורה בכיתה)", "חיוויי צבע חלקים ואיטיים (מניעת תנועה מהירה המסיחה את דעת המורה בכיתה), ולצד הצבע בכל משבצת תגית מצב בעברית מלאה ועם סמל, כך שהמצב אינו מועבר בצבע בלבד"],
  ["ולחיצה על לומד פותחת את היסטוריית השיחה איתו", "ולחיצה על לומד פותחת את היסטוריית השיחה איתו; בפס המפגש הקבוע מוצג מספר ההודעות שלא נקראו מהלומדים, והלחיצה עליו פותחת את השיחה עם הלומד שכתב, בלי לעבור למסך אחר"]
] }
];
function applyAll() {
  DOCS.forEach(function (d) {
    var body = DocumentApp.openById(d.id).getBody();
    var done = 0, already = 0, skipped = 0;
    d.edits.forEach(function (e) {
      var oldText = e[0], newText = e[1], marker = e[2], nth = e[3] || 1, total = e[4] || 1;
      var countBased = (marker === null);
      if (!countBased && body.findText(esc_(marker || newText))) { already++; return; }
      var matches = [], r = body.findText(esc_(oldText));
      while (r) { matches.push(r); r = body.findText(esc_(oldText), r); }
      if (countBased && matches.length === 0 && body.findText(esc_(newText))) { already++; return; }
      if (matches.length !== total) {
        skipped++;
        Logger.log(d.name + ': נמצא ' + matches.length + ' פעמים במקום ' + total + ', דולג: ' + oldText.slice(0, 50));
        return;
      }
      var found = matches[nth - 1];
      var t = found.getElement().asText();
      var s = found.getStartOffset();
      t.deleteText(s, found.getEndOffsetInclusive());
      t.insertText(s, newText);
      done++;
    });
    if (d.version && done > 0) updateVersionLine_(body, d.version);
    Logger.log(d.name + ' — הוחלפו: ' + done + '. כבר היו מעודכנים: ' + already + '. דולגו: ' + skipped + '.');
  });
}

function updateVersionLine_(body, version) {
  var MONTHS = ['בינואר', 'בפברואר', 'במרץ', 'באפריל', 'במאי', 'ביוני', 'ביולי', 'באוגוסט', 'בספטמבר', 'באוקטובר', 'בנובמבר', 'בדצמבר'];
  var pattern = 'גרסה [0-9.]+ \\| עודכן [^\\n]*';
  var matches = [], r = body.findText(pattern);
  while (r) { matches.push(r); r = body.findText(pattern, r); }
  if (matches.length !== 1) {
    Logger.log('שורת הגרסה נמצאה ' + matches.length + ' פעמים במקום 1; לא עודכנה.');
    return;
  }
  var now = new Date();
  var day = Number(Utilities.formatDate(now, 'Asia/Jerusalem', 'd'));
  var month = Number(Utilities.formatDate(now, 'Asia/Jerusalem', 'M'));
  var year = Utilities.formatDate(now, 'Asia/Jerusalem', 'yyyy');
  var time = Utilities.formatDate(now, 'Asia/Jerusalem', 'HH:mm');
  var line = 'גרסה ' + version + ' | עודכן ' + day + ' ' + MONTHS[month - 1] + ' ' + year + ', ' + time + ' (שעון ישראל)';
  var found = matches[0];
  var t = found.getElement().asText();
  var s = found.getStartOffset();
  t.deleteText(s, found.getEndOffsetInclusive());
  t.insertText(s, line);
  Logger.log('שורת הגרסה: ' + line);
}



function esc_(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

