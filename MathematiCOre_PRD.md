# מסמך דרישות מוצר (Master PRD v5.0)
## פלטפורמת הלמידה ההיברידית מתמטיקאור (MathematiCOre)
**Version 5.0 | Date: August 18, 2026 | Time: 12:59 IDT**

---

## חלק א: תשתית הזדהות, ניהול תפקידים ואבטחה

### מודול 1: מודול כניסה והזדהות
#### א. נתיב התלמידים (Student Login Pipeline)
**הטריגר הפדגוגי:** תחילת פעילות חקירה במתמטיקה ללא חסמים רגשיים ותוך שמירה על אנונימיות מלאה למניעת תיוג חברתי וחרדת ביצוע.
**מצב המערכת:** המערכת מנהלת מצב אטומי. עדכון המצב הגלובלי isStudentAuthenticated מתבצע אך ורק לאחר handshake מוצלח עם השרת. במקרה של שגיאת תקשורת, המערכת מבצעת Rollback מיידי למצב ההתחלתי.
**אירוע המשתמש:** בחירת בית ספר, כיתה, מזהה תלמיד והקלדת קוד גישה פיזי.
**התוצאה הצפויה:** אימות נתונים אטומי. יעד ביצועים: P95 ≤ 200ms בתנאי בדיקה מוגדרים. במקרה של פקיעת זמן, המערכת מאפסת את השדות למניעת מצב תלוי (Limbo State) בממשק, תוך מתן feedback פדגוגי מינימלי.
**Strict Bilingual Developer Instructions:** Enforce atomic state updates. If the server request times out or fails during authentication, trigger an immediate rollback to the idle state. No partial states or loading spinners permitted. Ensure the auth token is saved securely and the global authentication state is only updated upon successful handshake. Performance Target: P95 ≤ 200ms.

#### ב. מצבי שגיאה בהזדהות התלמידים (Student Auth Error States)
**הטריגר הפדגוגי:** מניעת חרדת כשל קוגניטיבית וויסות תחושתי לתלמידי חינוך מיוחד.
**מצב המערכת:** מנגנון Fail-safe: במקרה של שגיאת מערכת בלתי צפויה, המצב מתאפס לערך התקין האחרון הידוע. אין הצגת הודעות מערכת חוסמות (Modal Dialogs).
**אירוע המשתמש:** הזנת קוד שגוי או ניסיון כניסה בעת תקלת רשת.
**התוצאה הצפויה:** רטט ויזואלי של 300ms וניקוי שדות. במקרה של תקלה חמורה, הממשק מחזיר את התלמיד למצב עבודה שקט ולא מציג הודעת שגיאה.
**Strict Bilingual Developer Instructions:** Implement a fail-safe mechanism: any unexpected runtime error during the auth process must force a state reset to the last known good configuration. Do not render modal error dialogs or blocking alerts.

#### ג. נתיב המורים (Teacher Login Pipeline)
**הטריגר הפדגוגי:** כניסה מאובטחת למערכת הבקרה לצורך מעקב פדגוגי שקט.
**מצב המערכת:** אימות אסינכרוני מול מערכת ההזדהות. המערכת פועלת במצב Fail-closed וחוסמת גישה מוחלטת להרשאות, ללא חשיפת סיבת השגיאה או מידע טכני.
**אירוע המשתמש:** לחיצה על לחצן הזדהות Google SSO.
**התוצאה הצפויה:** ניתוב לדשבורד אך ורק למורשים. כל כשל אימות מוביל חזרה לדף הבית באופן שקט עבור המשתמש הלא מורשה.
**Strict Bilingual Developer Instructions:** Enforce a fail-closed policy for authorization: any mismatch or failure must result in an immediate redirect to the landing page with no feedback or error visibility to the unauthorized user. Only explicitly authorized identities are granted access.

---

### מודול 2: מודול מיתוג תפקידים
#### א. הגנת ניתוב ישיר (Direct Route Guarding Spec)
**הטריגר הפדגוגי:** הגנה על פרטיות הלומדים ומניעת עומס.
**מצב המערכת:** יישום Single Source of Truth באמצעות מנהל המצב Zustand. אם מצב המשתמש אינו תקין, הניתוב נחסם והמערכת מובילה ללובי.
**אירוע המשתמש:** ניסיון גישה לנתיב מוגן.
**התוצאה הצפויה:** חסימה וניתוב אוטומטי ללובי. יעד ביצועים לניתוב מקומי: ≤50ms.
**Strict Bilingual Developer Instructions:** Implement Route Guards using a Single Source of Truth via Zustand. If a route check fails or user state is inconsistent, force a redirect to the student lobby immediately. Do not allow partial render of protected routes.

#### ב. בחירת תפקיד כפול (Dual Role Selection Spec)
**הטריגר הפדגוגי:** תמיכה במורים ומנהלים בעלי הרשאות כפולות.
**מצב המערכת:** בעת שינוי תפקיד, המערכת מבצעת איפוס מלא ל-session context המקומי למניעת זליגת נתונים, תוך שמירה על persistent server data במידת הצורך.
**אירוע המשתמש:** בחירת תפקיד מתוך מסך בחירה.
**התוצאה הצפויה:** עדכון משתנה המצב וניקוי כל הקשר המידע הישן של הסשן הקודם.
**Strict Bilingual Developer Instructions:** Upon role switching, perform a hard wipe of all local session context and Zustand state buffers to prevent privilege escalation or data bleed between roles. Do not delete persistent server-side records.

#### ג. פקיעת תוקף אסימון והתנתקות שקטה (Token Expiration)
**הטריגר הפדגוגי:** אבטחת מידע מחקרי.
**מצב המערכת:** התנתקות שקטה (Silent Logout). מחיקת אסימון, איפוס Zustand ואיפוס ה-IndexedDB עבור הסשן הנוכחי.
**אירוע המשתמש:** פקיעת תוקף אסימון הגישה.
**התוצאה הצפויה:** ניקוי מלא של הזיכרון המקומי וניתוב הביתה.
**Strict Bilingual Developer Instructions:** Execute silent logout: clear all session tokens, Zustand state buffers, and IndexedDB caches upon JWT expiration. Redirect strictly to the public landing page.

---

### מודול 3: מודול אבטחה ואנונימיזציה
#### א. סינון מידע מזהה והגנה רציפה (Zero PII Identity & Transmission Safety)
**הטריגר הפדגוגי:** שמירה הרמטית על פרטיות הלומדים ומניעת זליגת מידע.
**מצב המערכת:** מנגנון "Transmission Fail-Closed, Learning Environment Fail-Safe". אם פילטר זיהוי הנתונים המזהים חווה תקלה, המערכת עוצרת העברה (Transmission) אך שומרת על יציבות סביבת הלמידה.
**אירוע המשתמש:** הקלדת טקסט.
**התוצאה הצפויה:** חסימת שליחה במקרה של זיהוי נתונים מזהים. במקרה של תקלה ברכיב הסינון, המערכת נועלת את הקלט ליתר ביטחון עד להתאוששות הלוגיקה.
**Strict Bilingual Developer Instructions:** Implement a fail-closed PII filter for transmission: if the PII detection logic encounters a runtime error, disable all input and transmission components immediately to guarantee zero PII leakage. The system must remain locked until logic recovery, but the UI itself must remain stable.

#### ב. אימות קשיח בצד השרת (Server Side Validation)
**הטריגר הפדגוגי:** שלמות מסד הנתונים.
**מצב המערכת:** חוקי האבטחה פועלים כחומת אש אטומית. כל בקשת כתיבה/עדכון נבדקת במלואה מול הסכמה.
**אירוע המשתמש:** בקשת כתיבה.
**התוצאה הצפויה:** אישור או דחייה מלאה (403). אין אישור חלקי.
**Strict Bilingual Developer Instructions:** Enforce atomic validation in Firestore Security Rules. A request is valid only if the entire payload conforms to the schema. Any field variance results in a hard deny (403). No partial updates or partial commits permitted.

---

## חלק ב: ארכיטקטורת בסיס הנתונים וסכמות הנתונים

### מודול 4: סכמת אוספי בסיס הנתונים (Firestore Collections Schema Spec)
#### א. מבנה האוספים והסכמה הקשיחה
**הטריגר הפדגוגי:** הגדרת תשתית נתונים אנונימית הרמטית המונעת זיהוי של הלומדים ושומרת על פרטיותם המלאה.
**מצב המערכת:** המערכת מאבטחת את המידע ואוכפת את מבנה הטבלאות בבסיס הנתונים באופן קשיח. הפרדה לוגית בין classes, students, sessions, workspace_states, telemetry_logs, ו-interventions. הפרדת session/workspace state מ-student identity נועדה למנוע זליגת הקשר.

#### ב. מדיניות סנכרון וביצועים (Real Time Synchronization and Performance Spec)
**הטריגר הפדגוגי:** מניעת תסכול קוגניטיבי ושמירה על רציפות הלמידה של התלמידים על ידי עדכונים מהירים ורכים.
**מצב המערכת:** Realtime interaction is local-first and event-driven. הממשק מגיב מיידית בצד הלקוח (יעד תגובה מצב מקומי ≤50ms). השרת מקבל רק אירועים לוגיים שנבחרו לפי חוזה Telemetry (יעד ביצועים P95 ≤ 150ms).
**אירוע המשתמש:** פעולה לוגית בממשק.
**התוצאה הצפויה:** סנכרון נתונים אסינכרוני, מבוסס אירועים בלבד. אין לשדר תנועות עכבר, גרירות רציפות או שינויי פיקסלים.
**Strict Bilingual Developer Instructions:** Eradicate all physical object references. Define Firestore schemas with absolute rigidity. Classes collection must contain strictly school_id, class_name, class_type. Students collection must contain strictly student_id (1-12), class_id, created_at, enhanced_support_profile, active_session_id, teacher_approval_status. Manage synchronization asynchronously; server latency target P95 ≤ 150ms. Restrict write operations strictly via Firestore Security Rules.

---

### מודול 5: סכמת נתוני מיקרו פעילות (Telemetry JSON Payload Schema Spec)
**עקרון מרכזי:** Telemetry is event-based, not continuous.
**מבנה נתונים:** כל אירוע ממשק לוגי (למשל: DECOMPOSITION_SUCCESS) מקודד לאובייקט JSON בודד.
**דרישות שליחה:** ולידציית גודל מטען ≤50KB לפני Transmission. שימוש בתור מקומי (Local Queue) עבור נתונים המוגדרים כ-persistable בעת תקלת רשת.
**Strict Bilingual Developer Instructions:** Construct the exact JSON payload format for every client workspace action event. Validate payload size before every database update. Enforce event-based logging (no mouse movement streams).

---

## חלק ג: מרחב הלמידה של התלמיד ומנוע VRA

### מודול 6: מודול לובי התלמיד (Student Hub Module Spec)
**ניהול מפגשים:** המערכת שולפת את המפגש הפעיל בטעינה ראשונית. Snapshot listener ממוקד למסמך המפגש הפעיל בלבד (ללא גלובליות).
**Strict Bilingual Developer Instructions:** Render a clean dashboard displaying only the current active session object fetched from the student state database. Use targeted listeners to minimize read costs. Keep local state updated with latest session ID.

---

### מודול 7: מודול לוח בית המספרים הדיגיטלי (Place Value Chart Module Spec)
**עקרון ניהול:** Zustand הוא מקור האמת ל-Local Runtime State.
**ממשק:** עמעום טורים (brightness: 0.6) ונעילת pointer-events בטורים לא פעילים.
**Strict Bilingual Developer Instructions:** Implement CSS filter properties for brightness control. Use Zustand for active column state tracking.

---

### מודול 8: מודול לבני דינס וירטואליות (Dienes Blocks Engine Module Spec)
**ניהול מצב:** Zustand הוא מקור האמת למיקום וכמות הבלוקים. IndexedDB עבור Persistence בלבד. Undo משחזר Snapshot דטרמיניסטי של מצב ה-VRA.
**Strict Bilingual Developer Instructions:** Use HTML5 Canvas/WebGL for manipulation at 60fps. Implement magnetic snap physics. Undo actions must be excluded from mistake telemetry tallies.

---

### מודול 9: מודול מקלדת דינמית וגשר VRA דיגיטלי (Dynamic Keyboard and VRA Bridge Module Spec)
**עקרון:** מנוע VRA / Rule Engine קובע את אירוע ההמרה.
**הפרדה:** Teacher-configured support profile (system setting) vs. Current intervention state (momentary UI state).
**Strict Bilingual Developer Instructions:** Implement conditional column keyboard locking based on VRA engine conversion events. Unlock keyboard only upon conversion success.

---

### מודול 10: מודול לוח חיבור אדפטיבי מבוקר (Symmetrical Addition Grid Module Spec)
**היררכיה:**
1. Independent Exploration (0-30s).
2. Adaptive Grid/Low-Level Scaffold (30s+).
3. Socratic Intervention (45s+).
**טיימר:** מתאפס על פעולות קוגניטיביות בלבד (drag, typing, conversion).
**Strict Bilingual Developer Instructions:** Manage grid visibility via local React state decoupled from Firestore writes. Track cognitive interaction events to reset the grid timer.

---

### מודול 11: מודול כפתור ביטול פעולה פדגוגי (Undo Action Engine Module Spec)
**עקרון:** Undo is not a mistake event. Undos are excluded from mistake tallies and latency penalty.
**טכני:** שחזור Snapshot דטרמיניסטי של מצב VRA (קואורדינטות, כמויות, קלט).
**Strict Bilingual Developer Instructions:** Maintain a client-side state stack restricted to the last 10 actions. Undo actions must never reduce scores or trigger punitive interventions.

---

## חלק ד: מנוע החניכה הסוקרטי ומפרט אינטגרציית ג'מיני

### מודול 12: מנגנון בלימת ניחושים וחיכוך פדגוגי (Socratic Mentoring & Friction Spec)
המערכת תעקוב אחר פעולות הלומד ותזהה מצבי קושי על פי שני מדדים בלבד. המדד הראשון הוא השהיה של ארבעים וחמש שניות ללא פעולה בטור החישוב הפעיל. המדד השני הוא ביצוע של ארבעה ניסיונות הקלדה שגויים ברציפות באותו תרגיל. בעת זיהוי קושי זה יופעל כרטיס החניכה הצידי. אם הלומד בוחר תשובה שגויה בתוך כרטיס החניכה המערכת תבצע נעילה שקטה של לחצני המענה בכרטיס למשך שישים שניות. בזמן הנעילה של כרטיס החניכה קנבס הלבנים הדיגיטליות וכפתור ביטול הפעולה יישארו פעילים וחופשיים לחלוטין. עיצוב זה נועד למנוע חוסר אונים נרכש ולאלץ את הלומד לחזור לחקירה ברמה הוירטואלית והייצוגית של מודל VRA כדי לבצע בקרה עצמית לפני הזנת התשובה המופשטת.
**Strict Bilingual Developer Instructions:** Implement the socratic card in a dedicated side drawer without using popup dialogs. Trigger socratic card activation strictly upon: (a) 45 seconds of continuous column hesitation, or (b) 4 consecutive digit deletions in the active column. Upon incorrect answer selection inside the socratic card, immediately apply a 60 second pointer events disabled block exclusively to the card buttons with a hourglass indicator. Ensure the rest of the workspace, including Dienes blocks canvas interaction and the undo button, remains fully functional and accessible for student exploration. Send workspace telemetry JSON data to initiate server side Gemini API function calls upon trigger detection.
**תרחיש בדיקה קוגניטיבי:** האם הלומד מבין את מטרת העצירה וכיצד היא עוזרת לו בבקרה העצמית?

---

### מודול 13: ממשק החונך הדיגיטלי וחוקי החניכה (Socratic Mentoring Engine Spec)
מנוע הבינה המלאכותית יקבל כקלט את קובץ נתוני הטלמטריה המלא המייצג את מצב מרחב העבודה של התלמיד. קלט זה יכלול את היסטוריית הפעולות האחרונות בקנבס ואת ערכי הקלדה שבוצעו. המנוע ינתח את סוג הטעות של התלמיד ויסווג אותה לאחת משלוש קטגוריות פדגוגיות ברורות. קטגוריה ראשונה היא טעויות עובדתיות בחישוב הבסיסי. קטגוריה שנייה היא טעויות במיומנויות רכיב כגון ביצוע שלבי האלגוריתם בסדר שגוי. קטגוריה שלישית היא טעויות אסטרטגיה המעידות על כך שהתלמיד לא הבין את דרך הפתרון הכללית. בהתאם לסיווג הטעות ושלב הלמידה הדיגיטלי שבו התלמיד נמצא במודל VRA המנוע ינסח שאלה מנחה סוקרטית קצרה אחת ושלושה מסיחים מותאמים אישית. השאלה המנחה תתייחס באופן ישיר לפעולה האחרונה שהתלמיד ביצע בקנבס כגון גרירת לבנים או פריטה כדי לכוון אותו למקור הטעות שלו באופן עצמאי. המנוע יפעל תחת הנחיות מערכת נוקשות שיאכפו את הכללים הבאים: חל איסור מוחלט לספק את התשובה המספרית הסופית לתלמיד או לפתור עבורו את שלבי החישוב. הרמזים והשאלה המנחה יתייחסו אך ורק לייצוגים הדיגיטליים על גבי המסך כמו פעולות של גרירת לבנים או פריטה או המרה. חל איסור מוחלט על שימוש במונחים של אביזרים פיזיים מוחשיים שאינם קיימים בממשק הדיגיטלי. במקרה של כשל בתקשורת או חריגה מהמבנה שהוגדר המערכת תציג רמז סטטי מוכן מראש כדי לשמור על רציפות הלמידה של התלמיד.
**Strict Bilingual Developer Instructions:** Enforce a rigid JSON schema validation for the Gemini API exchange. The outgoing request payload must convey the current workspace state containing anonymous student ID, active column ID, block counts per column, memory circle digits, and action history. The return JSON response schema must be strictly constrained to a single string field for the guiding question and exactly three closed option objects containing unique IDs, option texts, and concise feedback strings. Program system instructions to bind the Socratic persona exclusively to the digital VRA model, strictly forbidding direct answer disclosure or any physical CRA terminology. In case of API failure, serve a pre-configured static hint.
**תרחיש בדיקה קוגניטיבי:** האם המנוע מבצע אבחון נכון ומגיב בשאלה סוקרטית ללא חשיפת תשובה?

---

## חלק ה: מפגשי הלמידה, רפלקציה ועבודה מחוץ לרשת

### מודול 14: מודול מפגשים 1 עד 8 ומנוע תרגילים (Worksheet and Session Progression Module Spec)
#### א. הטריגר הפדגוגי
מניעת עומס קוגניטיבי ושמירה על החוסן הרגשי של תלמידי כיתה ג באמצעות הגבלת זמן העבודה העצמאית בהתאם לסוג המפגש. עידוד סוכנות הלמידה של לומדים מהירים באמצעות בחירה אקטיבית בין נתיב ביסוס לנתיב אתגר ללא יצירת תיוג חברתי.

#### ב. מצב המערכת
השרת הוא מקור האמת היחיד והמוחלט עבור זמן המפגש ומצב התרגיל הפעיל של התלמיד. המערכת תשמור בשרת לכל מפגש פעיל את הנתונים הבאים לכל הפחות:
- זמן תחילת המפגש
- זמן גבול המפגש הסופי
- מזהה התרגיל הפעיל הנוכחי
- מצב המפגש הנוכחי
- מזהה הסשן הפעיל

משך המפגש נקבע באופן אטומי בשרת לפי סוג המפגש ולא ניתן לשינוי על ידי הדפדפן:
- מפגשים שלוש עד שבע יוגבלו לחמש עשרה דקות נטו של עבודה עצמאית.
- מפגשים שתיים ושמונה יוגבלו לעשרים וחמש דקות נטו של עבודה עצמאית.

חנות Zustand בדפדפן משמשת לצורך תצוגה מקומית ועדכון זמני של הממשק בלבד ואינה מוסמכת לקבוע או לשנות את זמן המפגש או את התרגיל הפעיל. לאחר רענון מסך או פתיחת כרטיסייה נוספת או שחזור מחיבור שנקטע הדפדפן מסתנכרן מחדש באופן אוטומטי מול מצב השרת. פתיחה של מספר כרטיסיות עבור אותו תלמיד אינה יוצרת מספר מצבי למידה עצמאיים וכל הכרטיסיות מסתנכרנות מול אותו מזהה סשן ואותו מצב שרת סמכותי.

#### ג. אירוע המשתמש
המערכת תאזין לאירועים הבאים:
- התלמיד מסיים את אחד משבעת תרגילי החובה.
- התלמיד משלים את כל שבעת תרגילי החובה.
- זמן המפגש הסמכותי מגיע לגבול המפגש הסופי בשרת.
- התלמיד מרענן את הדפדפן.
- חיבור הרשת מתנתק או מתחדש.
- נפתח לקוח נוסף באותו מזהה תלמיד.

#### ד. התוצאה הצפויה
עם השלמת שבעת תרגילי החובה לפני תום הזמן המערכת תציג מסך בחירה שקט ומעצים המאפשר לתלמיד לבחור באופן עצמאי בין שתי אפשרויות למידה:
1. **נתיב ביסוס:** המציג משימות חזרה וייצוגים לא סטנדרטיות בלוח המבנה העשרוני.
2. **נתיב אתגר:** המציג משימות חקר מורכבות בתחום הרבבה לרבות משימות הדורשות מספר פעולות המרה או גילוי ספרות חסרות.

תרגילי ההמשך והבחירה אינם נכללים במדדי השליטה או בציונים של שבעת תרגילי החובה ובכך נשמרת השוואה הוגנת ושוויונית לכלל הלומדים.

#### ה. חוזה נתונים והתנהגות בזמן כשל
במצב עבודה לא מקוון הזיכרון המקומי של הדפדפן רשאי לשמור עותק התאוששות של המצב האחרון הידוע בלבד. הזיכרון המקומי אינו מהווה מקור אמת ואינו רשאי להאריך את זמן המפגש או לשנות את מזהה התרגיל באופן עצמאי.
עם חידוש החיבור לרשת מתבצעים השלבים הבאים:
1. הלקוח יוצר קשר מחדש עם השרת.
2. השרת מחזיר את המצב הסמכותי השמור אצלו.
3. הלקוח משווה את המצב המקומי למצב השרת.
4. במקרה של פער מצב השרת גובר ומעודכן בדפדפן.
5. אם זמן גבול המפגש הסופי כבר חלף המערכת מעבירה את התלמיד למסך הסיום השקט.
אין להסתמך על השעון המקומי של הדפדפן לצורך קביעת תוקף המפגש.

#### ו. תלויות במודולים אחרים
מודול זה קשור ותלוי במודולים הבאים:
- מודול חמש המגדיר את סכמת נתוני הטלמטריה של הפעולות
- מודול שש המנהל את לובי התלמיד
- מודול שמונה המנהל את מנוע הלבנים הדיגיטליות
- מודול אחת עשרה המנהל את כפתור ביטול הפעולה
- מודול שתים עשרה המנהל את כרטיס החניכה הסוקרטי
- מודול שבעה עשר המנהל את תור העבודה הלא מקוון
- מודול עשרים ותשעה המנהל את מכונת המצבים הגלובלית

#### ז. בדיקה קוגניטיבית קריטריון התאוששות ורציפות
**נתון:** התלמיד נמצא בתרגיל חמש מתוך שבעת תרגילי החובה ונותרו שבע דקות עד לזמן גבול המפגש הסופי.
**כאשר:** התלמיד מרענן את הדפדפן או חווה ניתוק רשת של שלושים שניות.
**אז:**
- המערכת משחזרת את מזהה הסשן הפעיל.
- המערכת משחזרת את מספר התרגיל הפעיל כתרגיל חמש.
- המערכת משחזרת את מצב ה-VRA הדיגיטלי האחרון שנשמר במדויק.
- עם חידוש החיבור המערכת מאמתת את המצב מול השרת.
- ספירת הזמן ממשיכה בהתאם לחותמת הזמן הסמכותית בשרת ולא לפי שעון הדפדפן.
- אין איבוד של מצב הלמידה או של נתוני הטלמטריה שכבר נשמרו.
**קריטריון הצלחה:** התלמיד חוזר לאותו תרגיל ובאותו מצב עבודה ללא צורך בהתערבות ידנית וללא שינוי מלאכותי בזמן המפגש.

#### ח. הנחיות פיתוח נוקשות בשפה האנגלית (Strict Developer Instructions)
Establish the server as the sole authoritative source of truth for both session duration and the current problem index. Use the React Zustand store strictly as a presentation and local cache layer. Implement a synchronization protocol to prevent clock manipulation or state loss upon browser refresh or multi tab sessions. Restrict all teacher dashboard mastery calculations exclusively to the first seven compulsory tasks. Ensure graceful fallback by persisting the last known timestamp in IndexedDB during offline states as recovery cache only and reconciling with the server immediately upon reconnection.

---

### מודול 15: מודול ארגז חול דיגיטלי מונחה ומצב מקרן (Sandbox and Projector Mode Module Spec)
#### א. הטריגר הפדגוגי
ניהול הלמידה ההיברידית בכיתה בצורה רכה וצפויה המונעת חרדה ותסכול בעת עצירת הפעילות העצמאית במחשבים. הפעלת מצב מקרן יוצרת מעבר קוגניטיבי מבוקר המכוון את קשב הלומדים להסבר המורה באופן מלא תוך מניעת עומס קוגניטיבי מפוצל על ידי הצגת מסך אטום ושקט לחלוטין. עיצוב זה שומר על מצב העבודה הקיים ומספק הגנה מפני תחושת איבוד הנתונים או הצורך להתחיל את המשימה מחדש.

#### ב. מצב המערכת
השרת הוא מקור האמת היחיד והמוחלט עבור מצב המקרן. מצב המקרן מנוהל ונשמר ברמת השילוב של כיתה ומפגש פעיל מוגדר בשרת כדי למנוע ערבוב של מצבים בין מפגשי למידה שונים או בין כיתות מקבילות.
השרת ינהל לכל כיתה פעילה ולכל מפגש את השדות הבאים לפחות:
- מצב מקרן כערך בוליאני בשדה `projector_mode`
- חותמת זמן של עדכון מצב המקרן בשדה `projector_mode_updated_at`
- מזהה המורה המעדכן את המצב בשדה `updated_by_teacher_id`

שכבת הסנכרון בצד הלקוח מאזינה לשינויים בבסיס הנתונים בזמן אמת ומעדכנת את חנות Zustand. חנות Zustand אינה מוסמכת לשנות את מצב המקרן הסמכותי ואינה מהווה מקור אמת עבורו. כדי למנוע עיבוד של אירועים ישנים שמגיעים באיחור בשל עיכובי רשת שכבת הסנכרון בצד הלקוח תבצע אימות של חותמת הזמן ותתעלם מכל עדכון שבו חותמת הזמן `projector_mode_updated_at` קטנה או שווה לחותמת הזמן של המצב הפעיל הנוכחי בדפדפן. כאשר מצב המקרן פעיל סביבת העבודה של התלמיד עוברת למצב צפייה חסום וכל פעולות הקלט והאינטראקציה עם הקנבס והמקלדת נחסמות באופן זמני. המצב המקומי של מרחב העבודה נשמר ללא שינוי.

חל איסור מוחלט על ביצוע הפעולות הבאות:
- הצגת מסכים ריקים או ערכי null
- הצגת מסך לבן ללא תוכן
- איפוס מרחב העבודה המקומי
- טעינה מחדש של האפליקציה בדפדפן
- מחיקת נתוני התרגיל הפעיל

#### ג. אירוע המשתמש
המורה מפעיל או מכבה את מצב המקרן מתוך לוח הבקרה של המורה עבור כיתה ומפגש ספציפיים. בעת שינוי הערך בשרת כל לקוחות התלמידים המחוברים למפגש הכיתה מקבלים את שינוי המצב באופן מיידי.

#### ד. התוצאה הצפויה
כאשר מצב המקרן מופעל התלמיד רואה מסך המתנה ייעודי אטום לחלוטין המשרה רוגע ומונע עומס קוגניטיבי מפוצל. המסך יציג רקע חזותי שליו איור של מקרן ואת המשפט הבא בגופן גדול ובולט: **הקשיבו להסבר של המורה על גבי המקרן**. מרחב העבודה הקיים נשמר בזיכרון המקומי אך אינו מוצג מתחת למסך ההמתנה כדי למנוע הסחות דעת. עם כיבוי מצב המקרן סביבת העבודה משתחררת מיד וחוזרת למצב הפעיל האחרון שנשמר ללא צורך בטעינה מחדש של הדפדפן וללא יצירת מפגש למידה חדש. יעד הביצועים של המעבר לעיל יעמוד על מדד P95 קטן או שווה לאלף מילישניות מרגע הלחיצה ועד לשינוי המצב בכל לקוחות התלמידים המחוברים.

#### ה. חוזה נתונים והתנהגות בזמן כשל
במקרה של ניתוק רשת בזמן שמצב המקרן פעיל הלקוח שומר את המצב האחרון הידוע וממשיך להציג את מסך ההמתנה השקט. הלקוח אינו רשאי להסיק באופן עצמאי שמצב המקרן הסתיים. עם חידוש החיבור לרשת שכבת הסנכרון מבצעת התאמה מול המצב הסמכותי בשרת. אם המצב בשרת פעיל מסך ההמתנה נשאר דולק ואם המצב בשרת כבוי סביבת העבודה משתחררת באופן מיידי. במקרה של אי התאמה מצב השרת הוא הקובע תמיד. אין להציג הודעות שגיאה חוסמות או חלונות אזהרה במהלך התהליך.

#### ו. תלויות במודולים אחרים
מודול זה קשור ותלוי במודולים הבאים:
- מודול שש המנהל את לובי התלמיד
- מודול שבעה עשר המנהל את תור העבודה הלא מקוון
- מודול עשרים ואחת המנהל את לוח הבקרה וממשק השליטה של המורה
- מודול עשרים ותשעה המנהל את מכונת המצבים הגלובלית

#### ז. בדיקה קוגניטיבית
**נתון:** התלמיד נמצא בתרגיל שלוש ומבצע גרירת לבנים בקנבס הלבנים הדיגיטליות.
**כאשר:** המורה מפעיל את מצב המקרן עבור הכיתה והמפגש הפעיל.
**אז:**
- בתוך פחות מאלף מילישניות ברמת P95 הלקוח מציג את מסך ההמתנה השקט והאטום לחלוטין.
- כל פעולות הקלט והגרירה נחסמות באופן מיידי.
- מצב מרחב העבודה האחרון של התלמיד נשמר ללא שינוי ואינו נמחק.
- המערכת אינה מבצעת טעינה מחדש של הדפדפן.
- לא מוצגות הודעות שגיאה או חלונות אזהרה.
- כאשר המורה מכבה את מצב המקרן התלמיד חוזר מיד לאותו תרגיל ולאותו מצב לבנים מדויק שבו עמד ללא צורך בטעינת הדפדפן מחדש.

#### ח. הנחיות פיתוח נוקשות בשפה האנגלית (Strict Developer Instructions)
Eradicate all rendering of null or blank screen states when projector mode is active to prevent student confusion or application crashes. Restrict the projector mode state scope strictly to class_id and active_session_id context. Implement a dedicated visually soothing fully opaque waiting screen component on student clients displaying a serene background a projector icon and the bold text message הקשיבו להסבר של המורה על גבי המקרן. Ensure that the active place value canvas is completely hidden beneath the opaque wait screen to avoid split attention cognitive overload. Persist the current Zustand state without deletion or reset. Synchronize the projector mode boolean state using a real time Firestore onSnapshot listener ensuring screen locking and unlocking events complete on all student clients under a performance target of P95 <= 1000ms. To prevent out of order execution of delayed network events ignore any incoming Firestore state update if its projector_mode_updated_at timestamp is less than or equal to the currently applied state timestamp.

---



### 16. מודול לוח רפלקציה תלת שלבי (SRL Reflection Board Module Spec)
1. **דרישות:** קידום מודעות עצמית הכוונה עצמית ופיתוח סוכנות הלומד בסיום מפגש שמונה. אפיון מדויק של שלושת שלבי לוח הרפלקציה: שלב א (הערכת מאמץ) מציג סרגל קווי תלת שלבי ללא מילים המיוצג על ידי שלושה סמיילים חזותיים המבטאים מאמץ קל מאמץ בינוני ומאמץ רב לעקיפת חסמים שפתיים אצל הלומדים. שלב ב (בחירת אסטרטגיות) התלמידים מסמנים בתיבות סימון את האסטרטגיות שהועילו להם כגון שימוש בכפתור ביטול הפעולה שימוש בעיגולי הזיכרון או קריאת שאלות כרטיס החניכה. שלב ג (משוב התמדה מעצים) הצגת ערך מדד ההתמדה המחושב לצד מסר מילולי מעצים ומעודד התמדה. טיפול בקצוות מתמטיים בקוד: הגדרת חוק קשיח לפיו אם סך הלחיצות הניסיונות השגויים והבחירות השגויות שווה לאפס מדד ההתמדה מוגדר באופן אוטומטי כמאה אחוזים למניעת כשל מתמטי של חלוקה באפס בקוד.
2. **אפיון:** רכיב רפלקציה רב-שלבי ב-React. שמירת reflection data בשרת בכל שלב ווידוא השלמת 3 השלבים לפני הגשה סופית.
3. **Strict Bilingual Developer Instructions:** Implement the SRL Reflection Board strictly in three chronological steps: (Step 1) Effort Evaluation presenting a 3 point visual scale using icons representing low, medium, and high mental effort to bypass language barriers; (Step 2) Strategy Selection rendering checkboxes for used strategies including undo button, memory circles, or socratic card hints; (Step 3) Persistence Feedback displaying the calculated index. Handle the mathematical edge case: if the denominator (U + E + G) equals zero, dynamically default the Persistence Index value to 100 percent to prevent division by zero runtime errors in the client execution.
* **תרחיש בדיקה קוגניטיבי:** האם הלומד מבין את התהליך הרפלקטיבי ומה מצופה ממנו בכל שלב.

---

### 17. מודול עבודה במצב לא מקוון ותור סנכרון (Offline Queue and Local Storage Module Spec)
1. **דרישות:** הבטחת רציפות הלמידה והפחתת חרדה הנובעת מתקלות תקשורת זמניות בכיתה המשלבת. אפיון חזותי של מצב הרשת: המערכת מציגה חיווי חזותי שקט בלבד בפינת המסך המורכב מאייקון ענן קטן. ענן בצבע אפור מסמן מצב לא מקוון שבו הנתונים נשמרים מקומית בדפדפן. ענן בצבע ירוק מסמן מצב מקוון וסנכרון תקין מול השרת. חל איסור מוחלט על הצגת מודאלים חוסמים הודעות שגיאה קופצות או חלונות אזהרה המפריעים לרצף העבודה של התלמיד. הסנכרון האוטומטי מול השרת עם חידוש החיבור מתבצע באופן אסינכרוני ואוכף סדר קשיח של נכנס ראשון יוצא ראשון של מטעני הג'ייסון השמורים באחסון מקומי לשמירה על עקביות שלבי פתרון התרגילים בבסיס הנתונים.
2. **אפיון:** לכידת בקשות נכשלות ואגירת מטעני הטרנזקציות (pending payloads) ב-IndexedDB / LocalStorage. האזנה לאירוע window online ושליחת המטענים בתור FIFO בצורה אסינכרונית ב-Batch.
3. **Strict Bilingual Developer Instructions:** Render a silent visual connectivity status indicator in the client header using a small cloud icon: grey cloud signifies offline mode with active local buffering, and green cloud signifies fully connected online mode. Strictly prohibit all blocking modal dialogs, error alert boxes, or network warning popups during offline operations. Enforce strict First In First Out (FIFO) queue execution sequence from IndexedDB or LocalStorage upon connection recovery to guarantee chronological database transactional consistency.
* **תרחיש בדיקה קוגניטיבי:** האם הנתונים מסתנכרנים כראוי עם חידוש החיבור לרשת.

---

## חלק ו: דשבורד המורה וניהול הכיתה

### 18. מודול רדאר פדגוגי שקט (Silent Radar Module Spec)
1. **דרישות:** תמיכה במורה כמנווט אנושי באמצעות מתן תמונת מצב אבחונית שקטה ושוויונית ללא עומס קשבי או עייפות התראות. הגריד הקבוע של שתים עשרה המשבצות השקטות (במבנה של שלוש על ארבע) משנה את צבעי רקע המשבצות באופן חלק בלבד בזמן אמת על פי החוקים הבאים: צבע ירוק מסמל פעילות תקינה ורציפה של התלמיד בפתרון התרגיל. צבע צהוב מסמל זיהוי היסוס קוגניטיבי ממושך של מעל ארבעים וחמש שניות רצופות בטור החישוב הפעיל. צבע אדום מסמל כרטיס חניכה סוקרטי צידי פעיל כעת במסך התלמיד. צבע אפור מסמל שהתלמיד מנותק מהרשת או שטרם החל את המפגש. חל איסור גורף ומחמיר על הצגת שמות התלמידים תמונותיהם או אותיות שמם על גבי המשבצות. הרדאר מציג מזהים מספריים קבועים בטווח של אחת עד שתים עשרה בלבד והצלבת הזהויות מנוהלת באופן ידני על ידי המורה ביומן כיתה פיזי המונח על שולחנה מחוץ למחשב.
2. **אפיון:** עדכון צבעי רקע בלבד (ירוק, צהוב, אדום, אפור) במענה לנתוני טלמטריה בזמן אמת (זמן תגובה 1000ms) ללא הזזת אלמנטים או פופ-אפים. צמצום קריאות Snapshot באמצעות תגובות ממוקדות.
3. **Strict Bilingual Developer Instructions:** Render the Silent Radar as a static 3x4 grid representing the 12 anonymous student profiles. Map incoming telemetry state data to background grid cell colors in real time with a 1000ms throttle filter: green for active progress, yellow triggered immediately upon active column hesitation exceeding 45 seconds, red triggered when a socratic card is active on the student client, and grey when the client is disconnected. Strictly forbid rendering any pupil names, initials, or avatars within the radar tiles. Display strictly numeric identifiers from 1 to 12, forcing teachers to manage identities via external physical paper logs on their desks.
* **תרחיש בדיקה קוגניטיבי:** האם המורה מבין את משמעות צבעי הרדאר וכיצד לפעול בהתאם.

---

### 19. מודול ניהול כיתה והגדרת פרופילים (Class Management and Profiles Module Spec)
1. **דרישות:** מתן התאמות פדגוגיות אישיות בשקט מוחלט וללא כל חיווי בממשק התלמיד למניעת תיוג חברתי של תלמידי השילוב בכיתה ההטרוגנית. פאנל הגדרות ייעודי בדשבורד המורה מעוצב כרשת קשיחה של שתים עשרה משבצות קבועות המייצגות את שתים עשרה תלמידי הפיילוט הממוינות לפי מזהים אנונימיים בטווח של אחת עד שתים עשרה בלבד ללא שמות. לצד כל מזהה תלמיד מוצג כפתור להפעלה או ביטול של פרופיל התמיכה הקוגניטיבי המוגבר. הפעלת הפרופיל משנה באופן דינמי וסמוי את ערך השדה המייצג את פרופיל התמיכה הקוגניטיבי המוגבר כערך בוליאני בבסיס הנתונים עבור אותו תלמיד. המערכת אוכפת מגבלת גודל כיתה קשיחה המונעת הוספה או הקמה של יותר משנים עשר תלמידים פעילים לכיתת המבקרים תחת בית ספר ביקורת. הממשק בצד התלמידים נשאר נקי לחלוטין מכל סימון חזותי חיצוני המעיד על קבלת סיוע.
2. **Strict Bilingual Developer Instructions:** Render a silent configuration panel within the teacher class dashboard using a fixed 12 slot grid matching the silent radar. Toggling user properties must save enhanced_support_profile as boolean true or false in DB without triggering UI flags on pupil clients. Restrict the class size configuration strictly to 12 active students for המבקרים class under בית ספר ביקורת school context and block any excess user additions in the database layer.
* **תרחיש בדיקה קוגניטיבי:** האם המורה יודע להפעיל פרופיל לתלמיד מבלי שהדבר ייראה על מסך התלמיד.

---

### 20. מודול שער אישור מורה קשיח (Teacher Gate Approval Module Spec)
1. **דרישות:** הבטחת עמידה ביעדי למידה וסגירת פערי ידע לפני מעבר לשלב הלמידה האדפטיבית תוך מניעת דפוסים של חוסר אונים נרכש בעת חסימת הניווט. בסיום מפגש שתיים התלמידים מופנים אוטומטית למסך סיום חיובי ומעודד של מעוף הדבורה המבשר להם בנחת כי המורים בודקים את עבודתם ללא שלטי נעילה חיוויי חסימה או מילים מעוררות חרדת ביצוע. הניווט למפגש שלוש נחסם בצורה אסינכרונית בצד הלקוח על ידי בקר הנתיבים. דשבורד המורה מציג טבלת מעקב עם שתים עשרה מזהי התלמידים. לצד כל תלמיד שהשלים את מפגש שתיים מוצגת המלצת הניתוב של המטריקס האדפטיבי למסלול הירוק או למסלול צמצום פערי קדם. המורה מאשר או משנה את הניתוב ולוחץ על כפתור אישור מסלול אקטיבי המעדכן את השדה המייצג אישור מורה למעבר לערך אמת בבסיס הנתונים. מעבר התלמיד למפגש שלוש מתאפשר באופן אוטומטי ומיידי עם זיהוי שינוי ערך השדה לערך אמת באמצעות מאזין הפועל בצד הלקוח עם זמן תגובה של פחות משנייה אחת.
2. **Strict Bilingual Developer Instructions:** Enforce asynchronous check in route controller. If session Completed matches session two, restrict client navigation to session three and redirect students to a positive waiting view rendering a quiet bee flight animation with zero lock graphics or error warning indicators. Inside the teacher portal, render a list of the 12 student IDs with their matrix recommended paths and an active approve button. Toggling this button must commit teacher_gate_approved value as true in Firestore. Use a real time Snapshot Listener on student clients to trigger instant session 3 route unlocking within 1000ms.
* **תרחיש בדיקה קוגניטיבי:** האם התלמיד מבין מדוע המערכת ממתינה לאישור המורה.

---

### 21. מודול ממשק מסך מפוצל לאבחון מורה (Teacher Diagnostic split screen view spec)
1. **דרישות:** ממשק אבחון המורה מיועד להצגת ציר החלטות קוגניטיבי מבוסס מודל ייצוג וירטואלי דיגיטלי המאפשר למורה להתחקות אחר תהליך פתרון התרגיל הבודד ללא יצירת עומס קוגניטיבי וללא פגיעה בפרטיות הלומדים. המסך מפוצל ונקי מעומס חזותי ומורכב משני חלקים עיקריים. בצד שמאל מוצג נגן וידאו ממוקד המריץ צילום מסך של קנבס העבודה של התלמיד עבור התרגיל הספציפי בלבד ללא שילוב שמע או מצלמה לשם שמירה על מוגנות ופרטיות. בצד ימין מוצגת טבלה סטטית ופשוטה של ציר ההחלטות הקוגניטיבי הממפה את כלל פעולות התלמיד גרירת לבנים הזנת נתונים בעיגולי הזיכרון מחיקות וביטול פעולה לשלבי מודל הייצוג הדיגיטלי בלבד לצד תיעוד זמני השהיה ועדות לבקרה עצמית.
2. **אפיון:** ממשק מסך מפוצל לאבחון מורה. נגן וידאו בצד שמאל המציג צילום מסך מקומי של קנבס העבודה עבור התרגיל, וטבלה סטטית בצד ימין הממפה את ציר ההחלטות הקוגניטיבי לפי שלבי ה-VRA.
3. **Strict Bilingual Developer Instructions:** Replace the obsolete iframe canvas replay and coordinate vector stream rendering entirely. Implement a split screen view interface for the teacher diagnostic panel. The left side must render a standard video player playing a recorded local screen capture of the individual workspace canvas for the current problem (Take), with zero audio or webcam inputs. The right side must render a clean static table representing the VRA Cognitive Decision Timeline, mapping student interactions (block drag, memory circle entries, deletions, and undo clicks) to chronological VRA milestones alongside delay times and self regulation flags. All telemetry logs must rely strictly on anonymous student IDs in the range 1 to 12, mapping to physical teacher logbooks.
* **תרחיש בדיקה קוגניטיבי:** האם המורה יכול לצפות בשחזור של פעולת תלמיד בבירור.

---

### 22. מודול ערוץ שיח ניהולי למורה (Teacher Admin Chat Spec)
1. **דרישות:** מתן ערוץ התייעצות ותמיכה אסינכרוני נפרד מול מנהלי המערכת לשמירה על בקרת עבודה תקינה תוך הגנה קשיחה על פרטיות הלומדים. ערוץ התקשורת מיוצג על ידי אייקון מעטפה שקט בסרגל הכלים העליון של המורה הפותח חלונית שיח צדדית נשלפת ללא חלונות קופצים מסיחים. מפרט אבטחה וסינון מידע מזהה דו שכבתי: שכבה ראשונה בצד הלקוח כוללת הפעלת ביטויים רגולריים המנטרים את תיבת הקלט בזמן אמת חוסמים שליחת הודעות המכילות שמות תלמידים מספרי טלפון או מספרי זהות ומציגים התרעה עדינה המבקשת להשתמש במזהה האנונימי של התלמיד. שכבה שנייה בצד השרת כוללת שירות אנונימיזציה אוטומטי הפועל בצד השרת ומסנן את תוכן ההודעה בטרם שמירתה בבסיס הנתונים המבצע הצלבה והחלפה של כל שם תלמיד שנמצא ברשימת הניהול למזהה האנונימי התואם שלו בטווח של אחת עד שתים עשרה.
2. **אפיון:** Client-side Regex חוסם שליחה עם שמות. Cloud Function מריץ anonymizerService שממפה שמות ל-student_id לפני Commit ל-Firestore.
3. **Strict Bilingual Developer Instructions:** Implement the teacher admin chat inside a sliding side drawer triggered by an envelope icon. Enforce a two tier PII protection system: (a) Client side regex checks to validate incoming input text and block transmissions containing pupil names, phone numbers, or national IDs, and (b) Server side cloud function anonymizer service that automatically parses the message body and replaces any student personal names with their corresponding anonymous numeric student ID (1 to 12) before writing documents to the messages collection in Firestore.
* **תרחיש בדיקה קוגניטיבי:** האם הצ'אט מאפשר תקשורת בטוחה ללא סיכון לפרטיות.

---

### 23. מודול דוחות ואנליטיקה פדגוגית (Pedagogical Reports and Analytics Spec)
1. **דרישות:** תרגום נתוני הלמידה הדיגיטליים להמלצות פדגוגיות אופרטיביות להמשך ההוראה הפרונטלית והקבוצתית בכיתה הפיזית מחוץ ללומדה הדיגיטלית. מחולל הדוחות מופעל אוטומטית עם השלמת מפגש שמונה ומפיק דוח סיכום והמלצות פדגוגיות לקריאה בלבד הניתן לייצוא כקובץ. הדוח מתבסס על מזהים אנונימיים בטווח של אחת עד שתים עשרה ללא שמות ומציג ניתוח השוואתי של סגירת פערי ידע ומדדי הכוונה עצמית. אכיפת חוקי הניתוב הדידקטיים בקוד: ציון נמוך מחמישים אחוזים לצד פערי יסוד מפיק המלצה על עבודה בקבוצה הומוגנית קטנה תיווך פרונטלי של המורה ושימוש בתבניות עשר פיזיות מחוץ למחשב. ציון שבין חמישים לשבעים וחמישה אחוזים לצד פערי כיתה ב מפיק המלצה על עבודה בקבוצה הטרוגנית שיח עמיתים ושימוש בחשבונייה או קשים פיזיים. ציון הגבוה משבעים וחמישה אחוזים מפיק המלצה על עבודה עצמאית נתיבי אתגר של כיתה ג ושימוש בלוח מחיק פיזי.
2. **אפיון:** תשאול נתוני תרגילים באמצעות תסריטי MapReduce. מחולל הדוחות מפיק קובצי PDF בצד השרת באמצעות Node.js / Cloud Functions.
3. **Strict Bilingual Developer Instructions:** Create a server-side PDF generator cloud function that validates completion of session 8. The generated PDF must be read-only and restrict identifiers to anonymous student IDs 1 to 12. Enforce the mathematical routing logic within the aggregation code: (a) score < 50% yields recommendation for small homogeneous group, teacher mediation, and physical ten-frames; (b) score 50-75% yields recommendation for heterogeneous group, peer discourse, and abacus or straws; (c) score > 75% yields recommendation for independent work, 3rd grade challenge tracks, and physical whiteboard exercises.
* **תרחיש בדיקה קוגניטיבי:** האם הדוח מכיל מידע רלוונטי שקל להבין אותו.

---

## חלק ז: ממשק ניהול מערכת

### 24. מודול סקירת מערכת כוללת (Admin Overview Spec)
1. **דרישות:** בקרה על מדדים גלובליים ונתוני שימוש במערכת ברמת הארגון תוך שמירה מוחלטת על סודיות מחקרית והגנת פרטיות קשיחה. המערכת חוסמת לחלוטין ברמת הקוד גישה של מנהלי מערכת לנתוני טלמטריה פרטניים ליומני הפעילות האישיים של התלמידים או למזהים ספציפיים ברמת בית ספר או כיתה. לוח המחוונים מציג נתונים סטטיסטיים מצטברים בלבד כגון אחוזי השלמת מפגשים שלוש עד שמונה ברמת הארגון סך כל התרגילים שנפתרו ומדדי שגיאות גלובליים. הנתונים המצטברים נשלפים מתוך משתני זיכרון מטמון המעודכנים על ידי פונקציית שרת קבועה אחת לשעה בלבד במטרה למנוע עומסי שאילתות בזמן אמת בבסיס הנתונים וקריסת ביצועי הרשת בבתי הספר.
2. **אפיון:** לוח מחוונים המרכז aggregated metrics בשרת בתדירות עדכון של שעה, תוך תצוגת נתונים מגובים (Cached) במקרה של עומס.
3. **Strict Bilingual Developer Instructions:** Construct a high-level analytics dashboard presenting global aggregated system usage statistics without exposing granular school-level, class-level, or student-level telemetry streams. Implement strict database security rules to deny Admin role read access to telemetry_logs or student collections. Build a server-side cached aggregation routine that runs once per hour, saving aggregated metrics (session completion rates, global error indices) to a read-only cache store to prevent live query bottlenecks during school pilot hours.
* **תרחיש בדיקה קוגניטיבי:** האם מנהל המערכת מקבל תמונה נכונה של המצב הגלובלי.

---

### 25. מודול ניהול בתי ספר, כיתות ומורים (Schools and Teachers Wizard Spec)
1. **דרישות:** ניהול ארגוני מבוקר התומך בהגדרות המחקר ושומר על עקרונות האנונימיזציה והפרטיות של הלומדים לשם מניעת תיוג חברתי. אשף הקמת כיתה המאפשר למנהלים להגדיר את מוסדות הלימוד הפעילים בפיילוט. האשף אוכף באופן קשיח מגבלת גודל כיתה של שנים עשר תלמידים פעילים לכל היותר עבור כיתת המבקרים. האשף יוצר מסמכים התואמים במדויק את סכמת בסיס הנתונים שהוגדרה במודול ארבע לרבות שדות הסיווג הקבועים מזהה בית ספר מזהה שם כיתה ומזהה סיווג קבוצת מחקר.
2. **Strict Bilingual Developer Instructions:** Implement a step by step setup wizard for class initialization. Enforce database schema synchronization matching the classes collection defined in module 4, including non nullable fields for school_id, class_name (set strictly to המבקרים), and class_type. Apply strict input and validation rules at the client level to block creating pilot classes exceeding 12 active students. Ensure pupil registrations generate only numeric anonymous IDs from 1 to 12 with zero personally identifiable name or email variables.

---

### 26. מודול קטלוג תוכנית הלימודים (Curriculum and Task Catalog Spec)
1. **דרישות:** ניהול וארגון של תכני הוראה וקטלוג המשימות תוך הבטחת רצף למידה היררכי ומדורג התואם את שלבי מודל הייצוג הדיגיטלי. ממשק טבלאי מבוקר המאפשר עדכון של תבניות המשימה וניהול שמונת מפגשי הלמידה. הקטלוג מאפשר להגדיר לכל מפגש את שבעת תרגילי החובה המשותפים לצד תרגילי הבחירה של הלומדים המהירים המחולקים לנתיב הביסוס ונתיב האתגר. עדכון תבניות משימה מופץ לגיליונות התלמידים הפעילים באמצעות עדכונים קבוצתיים בבסיס הנתונים. כדי למנוע קטיעת רצף הלמידה או קריסת הממשק באמצע פתרון תרגיל ההפצה מוחלת רק על משימות עתידיות או תרגילים שטרם נפתחו על ידי התלמידים בפועל.
2. **Strict Bilingual Developer Instructions:** Construct a master curriculum catalog console to configure worksheet equations for sessions 1 to 8. Segment task definitions between the 7 compulsory problems and the optional early completion pathway tracks (Review and Consolidation versus Challenge and Depth). To prevent workspace corruption or client crashes during live sessions, push curriculum updates to student client worksheet stores asynchronously using Firestore Batch Writes, applying changes exclusively to pending or unstarted worksheets.

---

### 27. מודול מדיניות אבטחה והגבלות גלובליות (Global Security and Settings Spec)
1. **דרישות:** הגנה הרמטית על שלמות מסד הנתונים וסודיות מחקרית מלאה באמצעות אכיפת הרשאות גישה קשיחות בצד השרת. הגדרת כללי הגישה הבאים עבור המפתח לאטנטיגרביטי: תלמידים אנונימיים בטווח של אחת עד שתים עשרה רשאים לקרוא אך ורק את מסמך התלמידים שלהם ואינם מורשים לקרוא או לכתוב באוסף הכיתות או ביומני טלמטריה של תלמידים אחרים. תלמידים מורשים לכתוב מסמכים חדשים באוסף רישומי טלמטריה אך ורק אם מזהה התלמיד במסמך תואם במדויק את מזהה התלמיד המאומת שלהם וסוגי הפעולות מוגבלים למיקרו פעולות קוגניטיביות קבועות מראש. מורים מורשים לקרוא את נתוני הטלמטריה של תלמידי הכיתה שלהם בלבד ואינם מורשים לכתוב או לערוך הגדרות ניהול גלובליות.
2. **Strict Bilingual Developer Instructions:** Enforce bulletproof Firestore Security Rules code patterns. Block student role authentication tokens from writing or reading classes and students collections, restricting their read access solely to their own student document. Allow student role write permissions to telemetry_logs collection strictly if the incoming log's student_id matches the authenticated token ID in the range of 1 to 12. Deny client application access to server configurations and private API keys, securing them inside private Google Cloud Secret Manager environments.

---

### 28. מודול תמיכה ותקשורת ניהולית (Admin Support Hub Spec)
1. **דרישות:** ניהול ותיעוד פניות תמיכה מקצועיות בצורה מאובטחת המבטיחה הגנה קשיחה על פרטיות הלומדים ומניעה מוחלטת של זליגת מידע אישי. מרכז פניות התמיכה של מנהלי המערכת מקבל ומציג פניות המגיעות מערוצי השיח של המורים. המערכת אוכפת בצורה קשיחה כי כל הודעה או פנייה המוצגת במסך המנהל עוברת סינון ואנונימיזציה מלאה בטרם הצגתה כך שמוסרים ממנה שמות או מזהים אישיים והיא מתבססת אך ורק על מזהי תלמידים אנונימיים בטווח של אחת עד שתים עשרה. הממשק מציג את הפניות בטבלה נקייה הממוינת לפי מזהה בית ספר ומזהה כיתה. המערכת מפעילה מאזין בזמן אמת לעדכון אוטומטי של הודעות נכנסות ומציגה מחוון התראות שקט ועדין בסרגל הניווט העליון של המנהל ללא יצירת רעש חזותי.
2. **Strict Bilingual Developer Instructions:** Architect the admin support ticketing dashboard to display incoming streams from teacher chat modules. Enforce complete anonymity at the visualization layer, ensuring zero PII or pupil names are displayed to the admin user. Filter and sanitize ticket contents using cloud functions, displaying strictly anonymous student IDs in the range 1 to 12 linked to school_id and class_name. Integrate Firestore onSnapshot real-time listeners to update incoming tickets chronologically, rendering a silent badge alert indicator in the admin global navigation menu without full page reloads.

---

## חלק ח: שכבת התשתית, ניהול המצב ואינטגרציית השרת

### 29. מודול ניהול מצב גלובלי ומכונות מצבים (Zustand and State Machines Spec)
1. **דרישות:** הבטחת עקביות ממשק וסנכרון מלא של נתוני הלמידה בכל המודולים של מודל הייצוג הדיגיטלי תוך מניעת תסכול או הצפה חושית כתוצאה משגיאות סנכרון ממשק. הגדרה קשיחה של מעברי המצבים בצד הלקוח: מצב המתנה מעבר למצב פעילות בעת טעינת תרגיל. מצב פעילות מעבר למצב המרה בעת סימון עשר לבנים בחיבור או קליק על לבנת המרה בחיסור. מצב המרה חזרה למצב פעילות ושחרור המקלדת רק בעת קבלת אירוע אישור המרה מוצלח. מצב חניכה פעיל מופעל בעת אירוע טריגר היסוס או זיהוי ארבע מחיקות רצופות וחוסם את לחצני הכרטיס בלבד לשישים שניות בעת מענה שגוי. המערכת משלבת מנגנון סנכרון אסינכרוני מול אחסון מקומי. בעת ניתוק רשת זמני המצב הגלובלי נשמר מקומית והפעולות מתווספות לתור סנכרון בשיטת נכנס ראשון יוצא ראשון המשודר אוטומטית ברקע עם חידוש החיבור לרשת למניעת מצבי מרוץ ואיבוד שלבי למידה.
2. **Strict Bilingual Developer Instructions:** Implement global state management using decoupled Zustand stores for workspace, teacher, and authentication states. Define a declarative state machine representing the student VRA environment transitions (Idle, Problem_Active, Regrouping_Active, Socratic_Active, Complete). Bind the Zustand state changes to a local synchronization engine that buffers all actions to IndexedDB during offline sessions. Upon internet connection recovery, dispatch the buffered actions asynchronously in chronological sequence using a strict First In First Out (FIFO) queue process to avoid race conditions and maintain database consistency.
