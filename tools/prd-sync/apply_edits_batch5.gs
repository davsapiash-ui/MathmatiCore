// MathmatiCore PRD — batch 5 (9.10.2026) — owner decisions: 43 exact replacements. Safe to run more than once.
// Writes into the PRD the decisions the owner approved in chat (AGENTS.md Rule 1 way 2): choice screen and target time,
// rescoring on catch-up, PII filter failure, radar timing, late recording chunks, name detection, research export scope,
// keyboard lock, routing, projector state and catalog scope. When at least one edit applies, the version line is set
// to version 7.8 with the current Israel date and time (updateVersionLine_).
// Each entry: [old, new, marker, nth, total]. marker = text whose presence means this edit was already applied;
// nth/total = replace the nth of exactly `total` occurrences.
var EDITS = [
  ["ולומד שסיים את משימות החובה לפני תום הזמן ממתין במסך סיום שקט. עם השלמת 7 תרגילי החובה לפני תום הזמן, המערכת מציגה מסך בחירה שקט ומעצים:", "ולומד שסיים את משימות החובה ממתין במסך סיום שקט. עם השלמת 7 תרגילי החובה, המערכת מציגה מסך בחירה שקט ומעצים, גם אם זמן היעד של המפגש (15 דקות) כבר חלף: הזמן לעולם אינו משנה את המסך של הלומד (סעיף ב1):"],
  ["הלומד בוחר נתיב אחד בלבד; אם סיים אותו לפני תום הזמן, הוא ממתין במסך הסיום השקט.", "הלומד בוחר נתיב אחד בלבד; כשסיים אותו, הוא ממתין במסך הסיום השקט. אם המורה סוגרת את המפגש לפני שהלומד עשה את תרגילי הבחירה, דבר אינו נרשם כחסר, הלומד אינו מקבל זמן השלמה עבורם, והוא ממשיך עם הכיתה למפגש הבא."],
  ["Restrict the choice-path screen to sessions 3 through 7 only.", "Restrict the choice-path screen to sessions 3 through 7 only, and show it to every learner who completed the seven compulsory exercises, also after the target time; if the teacher closes the session before the learner did the choice exercises, record nothing as missing, give no catch-up for them, and move the learner on with the class."],
  ["במפגש 2 בלבד, סגירה בכפתור \"סגרו את המפגש\" משלימה כל מי שהתחיל ומעבירה אותו לשער אישור המורה (סעיף ב1 ומודול 20).", "במפגש 2 בלבד, סגירה בכפתור \"סגרו את המפגש\" משלימה כל מי שהתחיל ומעבירה אותו לשער אישור המורה (סעיף ב1 ומודול 20). בזמן ההשלמה הלומד ממשיך מהמקום שבו עצר ואינו עושה מחדש תרגילים שכבר עשה. בכל מפגש שיש לו ציון (כל המפגשים מלבד מפגש 1, סעיף ב), ולא רק במפגש 2, ציון המפגש מחושב מחדש בכל פעם שהלומד משלים אותו; הציון הקודם נשמר גם הוא ואינו נדרס, ושני הציונים מוצגים בדוח הלומד (מודול 23) ובייצוא נתוני המחקר (מודול 24). המסלול המומלץ מתעדכן לפי הציון החדש, ואישור שהמורה כבר נתנה בשער (מודול 20) אינו משתנה."],
  ["כל כתיבת סגירה של מפגש נושאת גם את מספר המפגש האחרון ואת מועד הפעלתו האחרון.", "כל כתיבת סגירה של מפגש נושאת גם את מספר המפגש האחרון ואת מועד הפעלתו האחרון. רישום ההשלמה הוא התיעוד לכך שהלומד חזר למפגש כי לא סיים אותו (הסיבה) והשלים אותו: הוא נושא את הציון החדש שחושב בהשלמה, ולצדו את הציון הקודם, כשהיה כזה."],
  ["לומד שהושלם בסגירה וסיים אחר כך את המפגש שנפתח שוב מקבל ציון מחדש.", "לומד שהושלם בסגירה וסיים אחר כך את המפגש שנפתח שוב מקבל ציון מחדש, כמו כל לומד שמשלים מפגש בזמן השלמה, והציון הקודם נשמר לצד החדש (סעיף ב0)."],
  ["who later finishes the reopened session is rescored.", "who later finishes the reopened session is rescored. In every scored session (all but session 1), a learner given catch-up time continues from where they stopped without redoing exercises already done, and the session score is recomputed every time the learner completes the session; keep the previous score as well (never overwrite it), let the catch-up record show that the learner returned because they had not finished and completed, with the new score, and show both scores in the learner report and the research export. The recommended path follows the new score; a gate approval already given does not change."],
  ["שער האישור קורא ערכים קיימים מיד עם סיום מפגש 2.", "שער האישור קורא ערכים קיימים מיד עם סיום מפגש 2. הערכים מחושבים מחדש בכל פעם שהלומד משלים את המפגש, גם בזמן השלמה (מודול 14 §ב0): ההמלצה מתעדכנת לפי הציון החדש, הציון הקודם נשמר, ואישור שהמורה כבר נתנה בשער אינו משתנה."],
  ["Default rule: matrix_recommended_path = session_score_percent >= 50 ? 'green_path' : 'remediation_path'.", "Default rule: matrix_recommended_path = session_score_percent >= 50 ? 'green_path' : 'remediation_path'. Recompute both on every completion of the session, catch-up included (Module 14 §ב0); keep the previous score, update the recommendation from the new score, and never change a gate approval already given."],
  ["הדוח מציג שורת \"זמן השלמה\": הסיבה שהמורה רשמה, ההערה, ומספר הדקות שהלומד עבד בזמן ההשלמה.", "הדוח מציג שורת \"זמן השלמה\": הסיבה שהמורה רשמה, ההערה, ומספר הדקות שהלומד עבד בזמן ההשלמה. כאשר הלומד השלים את המפגש בזמן ההשלמה, הדוח מציג את הציון החדש ולצדו את הציון הקודם, שחושב לפני ההשלמה."],
  ["ואחריהן ארבע עמודות של זמן ההשלמה (מודול 14 §ב0): catchup_rounds, catchup_minutes, catchup_reason, catchup_note.", "ואחריהן ארבע עמודות של זמן ההשלמה (מודול 14 §ב0): catchup_rounds, catchup_minutes, catchup_reason, catchup_note; ואחריהן העמודה previous_score_percent, הציון הקודם של המפגש לפני שהלומד השלים אותו בזמן השלמה (ריקה כשאין ציון קודם), לצד הציון החדש."],
  ["ו-4 עמודות זמן ההשלמה, בסדר שפורט לעיל.", "ו-4 עמודות זמן ההשלמה ועמודת הציון הקודם previous_score_percent, בסדר שפורט לעיל."],
  ["including the after-reset and catch-up columns", "including the after-reset and catch-up columns and the previous-score column previous_score_percent"],
  ["export interface SessionDocument { // one per learner and session: sessions/session_0N_student_K (written for session 2)", "export interface SessionDocument { // one per learner and session: sessions/session_0N_student_K (written for session 2); session_score_percent is recomputed on every completion, catch-up included, and the previous score is kept on the catch-up record (Module 14 §ב0)"],
  ["עיקרון חסימת שידור בעת כשל, וסביבת למידה בטוחה בעת כשל (Fail-Closed Transmission, Fail-Safe Learning Environment). אם מנגנון זיהוי הנתונים המזהים (PII) חווה תקלה, המערכת עוצרת את השידור (Transmission) אך שומרת על יציבות סביבת הלמידה.", "סינון הנתונים המזהים פועל על כל טקסט שנשלח, וחוסם הודעה שיש בה כתובת דוא\"ל, מספר טלפון או מספר תעודת זהות. אם רכיב הסינון עצמו נכשל (שגיאת ריצה), שום דבר אינו ננעל: הצ'אט, ההקלדה והעבודה ממשיכים כרגיל, והכשל נרשם ביומן השרת (רישום ביקורת) כדי שהחוקר יידע שהתרחש."],
  ["במקרה של תקלה ברכיב הסינון, המערכת נועלת את הקלט ליתר ביטחון עד להתאוששות הלוגיקה.", "במקרה של תקלה ברכיב הסינון עצמו דבר אינו ננעל: הקלט, הצ'אט והעבודה ממשיכים, והתקלה נרשמת ביומן השרת."],
  ["Implement a fail-closed PII filter for transmission: if the PII detection logic encounters a runtime error, disable all input and transmission components immediately to guarantee zero PII leakage.", "Run the PII filter on every transmitted text and block a message that contains an e-mail address, a phone number or an ID number. If the PII detection logic itself encounters a runtime error, lock nothing: chat, typing and work continue, and log the failure to the server log (audit) so the researcher knows it happened."],
  ["פעילות למידה תקינה (אירוע קוגניטיבי ב-30 השניות האחרונות).", "פעילות למידה תקינה (הלומד ביצע פעולה ב-45 השניות האחרונות)."],
  ["היסוס קוגניטיבי (45 שניות רצופות ללא פעולה בטור הפעיל).", "היסוס קוגניטיבי (45 שניות ומעלה ללא פעולה בטור הפעיל)."],
  ["Server-side Presence Heartbeat determines GREY state within a 15-second max target.", "Server-side Presence Heartbeat determines GREY state within a 15-second max target. GREEN means the learner acted within the last 45 seconds; YELLOW starts at 45 seconds without an action in the active column."],
  ["איפוס מפגש, של לומד בודד או של הכיתה, מגבה את ההקלטות ומשאיר אותן (מודול 23א).", "איפוס מפגש, של לומד בודד או של הכיתה, מגבה את ההקלטות ומשאיר אותן (מודול 23א). מקטעי הקלטה שמגיעים לשרת אחרי איפוס מוחלט של לומד או אחרי איפוס מערכת (המכשיר היה לא מקוון בזמן האיפוס) אינם יוצרים מחדש את ההקלטה שנמחקה: הם נשמרים כקובץ נפרד בשם \"הקלטה שהגיעה אחרי האיפוס\", המקושר לרישום של אותו איפוס ב-reset_audit_log, כדי שהמחקר יידע שלתרגילים אלה יש הקלטה נוספת."],
  ["איפוס מפגש, של לומד בודד או של כל הכיתה, מגבה את ההקלטות ומשאיר אותן במקומן.", "איפוס מפגש, של לומד בודד או של כל הכיתה, מגבה את ההקלטות ומשאיר אותן במקומן. מקטעי הקלטה שמגיעים לשרת אחרי איפוס מוחלט של לומד או אחרי איפוס מערכת, ממכשיר שהיה לא מקוון בזמן האיפוס, אינם יוצרים מחדש את ההקלטה שנמחקה: הם נשמרים כקובץ נפרד בשם \"הקלטה שהגיעה אחרי האיפוס\", המקושר לרישום של אותו איפוס (סעיף ד), כדי שהמחקר יידע שלתרגילים אלה יש הקלטה נוספת (מודול 21)."],
  ["deny admin role access to learning-data resets.", "deny admin role access to learning-data resets. Recording chunks that reach the server after a full learner reset or a system reset (the device was offline at reset time) never recreate the deleted recording: save them as a separate file named \"הקלטה שהגיעה אחרי האיפוס\", linked to that reset's audit entry."],
  ["אם זוהו שמות פרטיים, מספרי טלפון, מיילים או ת\"ז, כפתור השליחה נחסם ומוצגת התראה עדינה המבקשת להשתמש במזהים 1–12.", "אם זוהו מספרי טלפון, מיילים או מספרי ת\"ז, כפתור השליחה נחסם ומוצגת התראה עדינה המבקשת להשתמש במזהים 1–12. הלקוח אינו מזהה שם פרטי, ולכן הצוות כותב על לומדים במזהים 1–12 בלבד."],
  ["השם מוחלף בשרת במלואו למזהה אנונימי, וההודעה נשמרת", "השם שבא אחרי \"תלמיד N המכונה\" או אחרי ביטוי היכרות מוסר בשרת (שם פרטי שנכתב לבדו אינו מזוהה ואינו מוחלף, ולכן הצוות כותב מזהים 1–12 בלבד), וההודעה נשמרת"],
  ["(1) Client-side regex checking input to block PII submission, (2) Server-side Cloud Function Anonymizer parsing message body and replacing pupil personal names with anonymous IDs (1-12) prior to writing documents to Firestore.", "(1) Client-side regex checking input to block e-mail addresses, phone numbers and ID numbers, (2) Server-side Cloud Function Anonymizer masking e-mail addresses, phone numbers, ID numbers, passwords and a name that follows a self-introduction phrase, and removing a name after \"תלמיד N המכונה\", prior to writing documents to Firestore. The system does not detect a first name written alone; staff write learner IDs 1-12 only."],
  ["המחקר הוא כל הסביבה והתהליך, ולכן ברירת המחדל של הייצוא היא כל המפגשים של כל הלומדים; ניתן לייצא גם מפגש בודד.", "המחקר הוא כל הסביבה והתהליך, ולכן הייצוא הוא תמיד ברמת הכיתה, לכל שנים עשר הלומדים, בשתי אפשרויות: כל המפגשים, או מפגש בודד. אין ייצוא מחקר של לומד בודד; הקובץ \"הורדת המפגש\" של לומד (מודול 21) הוא קובץ צפייה ונשאר כמות שהוא."],
  ["בשמות כגון \"ייצוא 08.10.2026 14-30 - פעולות.csv\": התאריך והשעה של הייצוא לפי שעון ישראל, ואחריהם שם הקובץ.", "בשמות \"ייצוא DD.MM.YYYY HH-mm - <קובץ>.csv\" לייצוא של כל המפגשים (למשל \"ייצוא 08.10.2026 14-30 - פעולות.csv\") ו-\"ייצוא מפגש N - DD.MM.YYYY HH-mm - <קובץ>.csv\" לייצוא של מפגש בודד: התאריך והשעה של הייצוא לפי שעון ישראל, ואחריהם שם הקובץ."],
  ["defaulting to all sessions of all learners with an optional single-session scope.", "always at class level (all 12 learners), for all sessions or for a single session; there is no per-learner research export, and the per-learner meeting download (Module 21) is a viewing file."],
  ["with names such as \"ייצוא 08.10.2026 14-30 - פעולות.csv\" (Israel time),", "with names \"ייצוא DD.MM.YYYY HH-mm - <קובץ>.csv\" for all sessions (e.g. \"ייצוא 08.10.2026 14-30 - פעולות.csv\") and \"ייצוא מפגש N - DD.MM.YYYY HH-mm - <קובץ>.csv\" for a single session (Israel time),"],
  ["עבור לומדים תחת פרופיל תמיכה קוגניטיבי מוגבר בלבד המקלדת ננעלת עד לאישור המרה מוצלח, או בתרגילי ייצוג עד שהלוח כולו תואם את הנדרש, בהתאם למודול 9.", "עבור לומדים תחת פרופיל תמיכה קוגניטיבי מוגבר בלבד ננעלים בשורת התוצאה רק הטורים שההמרה בהם טרם בוצעה בלבנים, כל טור עד שההמרה בו בוצעה, ובתרגילי ייצוג תיבת התשובה, בהתאם למודול 9; שאר הטורים פתוחים, טור האלפים, הטור הגבוה ביותר בלוח, אינו ננעל לעולם, ובמפגשים 2 ו-8 אין נעילה."],
  ["אם מצב המשתמש אינו תקין, הניתוב נחסם והמערכת מובילה ללובי.", "אם המשתמש אינו מחובר, הניתוב נחסם והמערכת מובילה למסך בחירת התפקיד (‎/login); מורה או מנהל שכתובתם אינה ברשימת המורשים מנותקים ומובלים לאותו מסך; משתמש מחובר שמנסה להיכנס לנתיב של תפקיד אחר מוחזר לדף הבית של תפקידו: לומד ללובי, מורה לדשבורד ומנהל לקונסולה; כתובת שאינה קיימת מובילה לדף הנחיתה (‎/); אחרי איפוס הלומד חוזר ללובי."],
  ["חסימה וניתוב אוטומטי ללובי.", "חסימה וניתוב אוטומטי למסך המתאים, כמתואר במצב המערכת."],
  ["If a route check fails or user state is inconsistent, force a redirect to the student lobby immediately.", "If the user is not signed in, block the route and redirect to the role selection screen (/login); sign out a teacher or admin whose address is not on the authorized list and redirect them to the same screen; send a signed-in user who tries another role's route back to their own role's home: a learner to the lobby, a teacher to the dashboard, an admin to the console; route an unknown address to the landing page (/); after a reset the learner returns to the lobby."],
  ["must force an immediate redirect to Screen 0 ('/').", "must force an immediate redirect to Screen 1 ('/login'), the role selection screen; an unknown address leads to Screen 0 ('/')."],
  ["השרת הוא מקור האמת היחיד למצב המקרן ברמת class_id ו-active_session_id.", "מקור האמת היחיד למצב המקרן הוא הצומת system_control/projector_mode ב-Realtime Database: צומת אחד למערכת כולה, ולא לכל class_id או active_session_id בנפרד."],
  ["Restrict projector mode state strictly to class_id and active_session_id context.", "Keep a single projector mode state for the whole system in system_control/projector_mode, not per class_id or active_session_id."],
  ["No other field is permitted.", "No other field is permitted. The projector state is never written to the class document: it lives only in the global RTDB node system_control/projector_mode (Module 15), so projector_mode and projector_mode_updated_at are not updated there, and updated_by_teacher_id records the teacher who last activated a session."],
  ["  projector_mode: boolean;", "  projector_mode: boolean; // not written; the projector state lives in RTDB system_control/projector_mode (Module 15)"],
  ["  projector_mode_updated_at: number;", "  projector_mode_updated_at: number; // not written (Module 15)"],
  ["  updated_by_teacher_id: string | null;", "  updated_by_teacher_id: string | null; // the teacher who last activated a session (Module 14 §ב0)"],
  ["הקטלוג מנהל את 7 תרגילי החובה ואת משימות הבחירה (ביסוס מול אתגר).", "הקטלוג מחזיק את מאגרי התרגילים של מפגש 1 ושל מפגשים 3–8, מאגר לכל מסלול. תרגילי הבחירה (ביסוס מול אתגר, מודול 14 §ג) ומשימות האבחון של מפגש 2 אינם בקטלוג: הם מוגדרים בקוד, תרגילי הבחירה בקובץ react-ts-version/src/data/sessionBranchTasks.ts ומשימות האבחון בקובץ react-ts-version/src/core/QMatrix.ts, ושינוי בהם מגיע ללומדים בפריסת גרסה ולא בפרסום הקטלוג."],
  ["Segment task definitions between 7 compulsory problems and optional early completion tracks (Consolidation vs. Challenge).", "The catalog holds the banks of session 1 and of sessions 3–8 per path; the choice-path exercises (Consolidation vs. Challenge) live in react-ts-version/src/data/sessionBranchTasks.ts and the session 2 diagnostic tasks in react-ts-version/src/core/QMatrix.ts, outside the catalog, and reach learners with a deployment, not with a catalog publish."]
];

var VERSION = '7.8';

function applyEdits() {
  var body = DocumentApp.getActiveDocument().getBody();
  var done = 0, already = 0, skipped = 0;
  EDITS.forEach(function (e) {
    var oldText = e[0], newText = e[1], marker = e[2] || e[1], nth = e[3] || 1, total = e[4] || 1;
    if (body.findText(esc_(marker))) { already++; return; }
    var matches = [], r = body.findText(esc_(oldText));
    while (r) { matches.push(r); r = body.findText(esc_(oldText), r); }
    if (matches.length !== total) {
      skipped++;
      Logger.log('נמצא ' + matches.length + ' פעמים במקום ' + total + ', דולג: ' + oldText.slice(0, 50));
      return;
    }
    var found = matches[nth - 1];
    var t = found.getElement().asText();
    var s = found.getStartOffset();
    t.deleteText(s, found.getEndOffsetInclusive());
    t.insertText(s, newText);
    done++;
    Logger.log('הוחלף: ' + oldText.slice(0, 50));
  });
  if (done > 0) updateVersionLine_(body, VERSION);
  Logger.log('הוחלפו: %s. כבר היו מעודכנים: %s. דולגו: %s.', done, already, skipped);
}

// Replaces the single "גרסה X | עודכן ..." line with the given version and the current Israel date and time.
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
