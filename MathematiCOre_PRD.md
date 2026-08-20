# מסמך דרישות מוצר (PRD Master) — פלטפורמת הלמידה ההיברידית מתמטיקאור (MathematiCore)

**Version 6.4 — Corrected | Base: v6.3 | Date: August 19, 2026 | Master Production Spec for Antigravity Agent**
* **Changelog v6.4:** 
  1. ביטול והסרה מוחלטת של קלט קולי (STT) מכל ממשקי המערכת (מודול 22). תקשורת מורה-אדמין היא טקסט בלבד. אודיו לעולם אינו עוזב את המכשיר.
  2. קיצור משך נעילת המסיחים בכרטיס החניכה הסוקרטי (מודול 12) מ-60 שניות ל-30 שניות (חצי דקה) לצורך ויסות מותאם וממוקד.

---

## שינויים מרכזיים מגרסה 6.0 ל-6.1

גרסה זו נכתבה בעקבות ביקורת טכנית שמטרתה לוודא שסוכן AI יוכל לממש את המסמך ללא ניחושים. תוקנו תשע נקודות קונקרטיות:

1. **סכימות payload מלאות לכל 13 סוגי אירועי הטלמטריה** (מודול 5 + נספח א', סעיף 3) — הוחלף `details: Record<string, unknown>` הפתוח ב-`TelemetryDetailsMap`, שמגדיר טיפוס מדויק לכל `event_type`. כחלק מהתיקון נוסף שדה `is_correct` לאירוע `DIGIT_ENTERED` — בלעדיו לא הייתה דרך לחשב את מדד ה-E (שגיאות הקלדה) בנוסחת מדד ההתמדה של מודול 16.
2. **איחוד סכימת אוסף ה-`students`** — מודול 4, מודול 19 ונספח א' הגדירו שלוש רשימות שדות שונות (וחלקית סותרות) לאותו מסמך. אוחדו לרשימה קנונית אחת בת 9 שדות, כולל `school_id` ו-`support_profile_updated_at/by` שהיו חסרים בחלק מהמקורות.
3. **הוסר שדה `teacher_approval_status`** ממסמך התלמיד — הוגדר בשתי סכימות אך לא נכתב ולא נקרא באף תהליך בפועל. לוגיקת שער האישור (מודול 20) מסתמכת אך ורק על `teacher_gate_approved` ברמת מסמך הסשן, ולכן השדה המקביל ברמת התלמיד היה כפילות יתומה שיצרה שני מקורות אמת לאותו מושג.
4. **אוחד שם השדה לזיהוי תלמיד** — מודול 13 (חוזה Gemini) השתמש ב-`anonymous_student_id`, בעוד כל שאר המערכת (כולל נספח א') משתמשת ב-`student_id`. אוחד ל-`student_id` בכל מקום.
5. **תוקן כיוון סף הציון בדוח הפדגוגי** (מודול 23) — הגוף העברי והוראות הפיתוח האנגליות הצביעו על כיוונים הפוכים (`>50%` מול `<50%` לאותה המלצה). נקבע כיוון אחיד התואם את ההיגיון הפדגוגי המוצהר: ציון נמוך יותר ← תמיכה אינטנסיבית יותר.
6. **תוקן מספר שלבי פרוטוקול ההתאוששות** (מודול 17) — הוראות הפיתוח ציינו "11-step handshake" בעוד הגוף העברי מפרט 5 שלבים בלבד. אוחד ל-5 שלבים.
7. **הובהרה היררכיית הצבעים ברדאר הפדגוגי** (מודול 18) — ניסוח "אדום < אפור..." בגוף העברי היה ניתן לפירוש כפול מול הוראות הפיתוח ("RED > GREY..."). נוסח מחדש באופן חד-משמעי: "מהגבוה לנמוך בעדיפות תצוגה".
8. **נוסף שדה חסר `session_score_percent`** למסמך הסשן (נספח א') — מודול 23 מתבסס על "ציון" לצורך ניתוב ההמלצה הפדגוגית, אך אף סכימה במסמך לא הגדירה שדה כזה. השדה נוסף; **נוסחת החישוב המדויקת שלו נותרה החלטת מוצר פתוחה** (ראו הערה במודול 23) ולא הומצאה באופן חד-צדדי.
9. **נורמול שמות שדות/מצבים** שהופיעו בכמה כתיבים שונים עקב היפוך כיווניות RTL/LTR בקובץ המקור — התקן היחיד מעתה הוא ההגדרות שבנספח א' והקוד האנגלי הנקי בהוראות הפיתוח.

> **נקודה שנדונה במפורש ולא שונתה:** מנגנון ההזדהות המשותף של התלמידים (קוד גישה קבוע `10203040` + בחירת מזהה מתוך 1–12) הוא החלטת מוצר מכוונת עבור גרסת הפיילוט הראשונית (כיתה יחידה, ללא נתונים אישיים מאחורי החשבון) — כפי שהובהר בסבב ביקורת קודם. לא נגעתי בו.

---

## שינויים מגרסה 6.1 ל-6.2

תוקנו ב-6.2 שתי בעיות שהתגלו כשתוכנית מימוש (Antigravity) נבנתה בפועל מול הסכמה של 6.1:

1. **תוקן שדה שאינו קיים במודול 20** — הבדיקה תוארה כ"`session_completed == 2`", אבל `SessionDocument` (נספח א') אינו מכיל שדה כזה כלל, רק `session_number` ו-`is_completed` בנפרד. הבדיקה נוסחה מחדש לפי שני השדות שכן קיימים: `session_number == 2 && is_completed == true`. **זו טעות מ-6.1** — לא נורמלה מול הסכמה שכתבתי באותה גרסה.
2. **נסגרה החלטת נוסחת `session_score_percent`** (הייתה פתוחה מ-6.1) — אומצה הנוסחה שהוצעה כברירת מחדל בתוכנית המימוש: `(מספר תרגילי החובה שנפתרו נכון בניסיון ראשון ÷ 7) × 100`, מבוססת אך ורק על 7 תרגילי החובה (לא כולל תרגילי בחירה), בהתאם לכלל שנקבע כבר במודול 14. כתוצאה מכך תוקנה גם דוגמת הבדיקה הקוגניטיבית במודול 23, שהציגה "ציון 40%" — ערך שלא בר-השגה מתמטית עם מכנה קבוע של 7 (התוצאות האפשריות היחידות הן כפולות של 1/7 ≈ 14.3%).

> **נותר פתוח, לא נחסם:** אם בעתיד יידרש ניקוד משוקלל (הכולל ניכוי לפי שגיאות הקלדה/רמזים סוקרטיים ולא רק הצלחה/כישלון בינארית לכל תרגיל), זו תהיה החלטת המשך נפרדת ולא מעכבת את תחילת העבודה.

---

## שינויים מגרסה 6.2 ל-6.3

התגלה תוך בניית תוכנית המימוש בפועל (מול הסכמה של 6.2): שדה `matrix_recommended_path` (המלצת המסלול שהמורה רואה בדשבורד שער האישור, מודול 20) הופיע בסכימה מאז v6.0 אך **אף מקום במסמך לא הגדיר איך הוא מחושב**. אותה טעות בדיוק כמו `session_score_percent` ב-v6.1 — הפעם זוהתה מיד, לפני שהתחילו לממש, כי הבדיקה נעשית כעת מול כל שינוי בתוכנית העבודה.

1. **נוסף כלל חישוב ברירת מחדל למודול 20:** `matrix_recommended_path = 'green_path'` אם `session_score_percent >= 50`, אחרת `'remediation_path'` — אותו סף כמו קו החלוקה התחתון של מודול 23. **זו ברירת מחדל מוצעת, לא סופית** — ניתנת לשינוי בקלות אם רוצים סימן אחר (למשל תדירות כרטיסים סוקרטיים או מדד ההתמדה).
2. **הופרד עיתוי החישוב מהפקת ה-PDF:** `session_score_percent` ו-`matrix_recommended_path` ייכתבו בטריגר עצמאי על סיום מפגש (`is_completed → true`), לא בתוך `generatePedagogicalReportPDF`. אחרת דשבורד שער האישור (מודול 20) היה תלוי בהצלחת הפקת דוח PDF כדי להציג המלצה — צימוד בין שני מודולים שאמורים להיות עצמאיים.
3. **תוקן שם שדה הפוך:** מודול 20 השתמש ב-`path_green`/`path_remediation` (סדר הפוך) בעוד הסכמה בנספח א' מגדירה `green_path`/`remediation_path`. אוחד לצורה של נספח א'.

---

## תוכן עניינים ומבנה המערכת

- מודול 1: מודול כניסה והזדהות (Student & Teacher Login Pipelines)
- מודול 2: מודול מיתוג תפקידים (Role Switching & Route Guards)
- מודול 3: מודול אבטחה ואנונימיזציה (PII Filter & Server Validation)
- מודול 4: סכמת אוספי בסיס הנתונים (Firestore Collections Schema Spec)
- מודול 5: סכמת נתוני מיקרו פעילות (Telemetry Payload & TS Contracts)
- מודול 6: מודול לובי התלמיד (Student Hub Spec)
- מודול 7: מודול לוח בית המספרים הדיגיטלי (Place Value Chart Engine)
- מודול 8: מודול לבני דינס וירטואליות (Dienes Blocks Engine & Canvas)
- מודול 9: מודול מקלדת דינמית וגשר VRA (Dynamic Keyboard & VRA Bridge Spec)
- מודול 10: מודול לוח חיבור אדפטיבי מבוקר (Symmetrical Addition Grid Module Spec)
- מודול 11: מודול כפתור ביטול פעולה פדגוגי (Undo Action Engine Module Spec)
- מודול 12: מנגנון בלימת ניחושים וחיכוך פדגוגי (Socratic Mentoring Trigger Spec)
- מודול 13: ממשק החונך הדיגיטלי ומנוע החניכה (Socratic AI Engine & Gemini API Contract)
- מודול 14: מודול מפגשים 1 עד 8 ומנוע תרגילים (Session & Worksheet Progression Spec)
- מודול 15: מודול ארגז חול דיגיטלי מונחה ומצב מקרן (Sandbox & Projector Mode Spec)
- מודול 16: מודול לוח רפלקציה תלת־שלבי (SRL Reflection Board Spec)
- מודול 17: מודול עבודה במצב לא מקוון ותור סנכרון (Offline Queue & Sync Engine Spec)
- מודול 18: מודול רדאר פדגוגי שקט (Silent Radar Matrix Spec)
- מודול 19: מודול הקצאת התאמות פדגוגיות שקטות (Silent Adaptation Assignment Spec)
- מודול 20: מודול שער אישור מורה קשיח (Teacher Approval Gate Spec)
- מודול 21: מודול ממשק מסך מפוצל לאבחון מורה (Teacher Diagnostic Split-Screen Spec)
- מודול 22: מודול ערוץ שיח ניהולי למורה (Teacher Admin Chat Engine Spec)
- מודול 23: מודול דוחות ואנליטיקה פדגוגית (Pedagogical Analytics & PDF Generator Spec)
- מודול 24: מודול סקירת מערכת כוללת (Admin Overview & Caching Spec)
- מודול 25: מודול ניהול בתי ספר, כיתות ומורים (Schools & Teachers Setup Wizard Spec)
- מודול 26: מודול קטלוג תוכנית הלימודים (Curriculum Catalog & Batch Spec)
- מודול 27: מודול מדיניות אבטחה והגבלות גלובליות (Global Firestore Security Rules Spec)
- מודול 28: מודול תמיכה ותקשורת ניהולית (Admin Support Hub Spec)
- מודול 29: מודול ניהול מצב גלובלי ומכונות מצבים (Zustand & State Machine Spec)
- נספח א': חוזה טיפוסים מרכזי (Core TypeScript Interfaces & Data Contracts)

---

## מודול 1: מודול כניסה והזדהות (Student & Teacher Login Pipelines)

### א. נתיב התלמידים (Student Login Pipeline)
- **הטריגר הפדגוגי:** תחילת פעילות חקירה במתמטיקה ללא חסמים רגשיים, תוך שמירה על אנונימיות מלאה למניעת תיוג חברתי וחרדת ביצוע.
- **מצב המערכת:** המערכת מנהלת מצב אטומי. עדכון המצב הגלובלי `isStudentAuthenticated` מתבצע אך ורק לאחר handshake מוצלח עם השרת. במקרה של שגיאת תקשורת, המערכת מבצעת Rollback מיידי למצב ההתחלתי.
- **אירוע המשתמש:** בחירת בית ספר, כיתה, מזהה תלמיד אנונימי (1–12), והקלדת קוד גישה פיזי.
- **התוצאה הצפויה:** אימות נתונים אטומי. יעד ביצועים: P95 ≤ 200ms בתנאי בדיקה מוגדרים. במקרה של פקיעת זמן, המערכת מאפסת את השדות למניעת מצב תלוי בממשק (State Limbo), תוך מתן feedback פדגוגי מינימלי.

### ב. מצבי שגיאה בהזדהות התלמידים (Student Auth Error States)
- **הטריגר הפדגוגי:** מניעת חרדת כשל קוגניטיבית וויסות תחושתי לתלמידי חינוך מיוחד.
- **מצב המערכת:** מנגנון Fail-safe — במקרה של שגיאת מערכת בלתי צפויה, המצב מתאפס לערך התקין האחרון הידוע. אין הצגת הודעות מערכת חוסמות (Modal Dialogs).
- **אירוע המשתמש:** הזנת קוד שגוי, או ניסיון כניסה בעת תקלת רשת.
- **התוצאה הצפויה:** רטט ויזואלי של 300ms וניקוי שדות. במקרה של תקלה חמורה, הממשק מחזיר את התלמיד למצב עבודה שקט ולא מציג הודעת שגיאה.

### ג. נתיב המורים (Teacher Login Pipeline)
- **הטריגר הפדגוגי:** כניסה מאובטחת למערכת הבקרה לצורך מעקב פדגוגי שקט.
- **מצב המערכת:** אימות אסינכרוני מול מערכת ההזדהות. המערכת פועלת במצב Fail-closed וחוסמת גישה מוחלטת להרשאות, ללא חשיפת סיבת השגיאה או מידע טכני.
- **אירוע המשתמש:** לחיצה על לחצן הזדהות Google SSO.
- **התוצאה הצפויה:** ניתוב לדשבורד אך ורק למורשים. כל כשל אימות מוביל חזרה לדף הבית באופן שקט עבור המשתמש הלא מורשה.

### ד. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Enforce atomic state updates. If the server request times out or fails during authentication, trigger an immediate rollback to the idle state. No partial states or loading spinners permitted. Ensure the auth token is saved securely and the global authentication state is only updated upon successful handshake. Performance Target: P95 ≤ 200ms. Enforce a fail-closed policy for teacher authorization.

---

## מודול 2: מודול מיתוג תפקידים (Role Switching & Route Guards)

### א. הגנת ניתוב ישיר (Direct Route Guarding Spec)
- **הטריגר הפדגוגי:** הגנה על פרטיות הלומדים ומניעת עומס.
- **מצב המערכת:** יישום Single Source of Truth באמצעות מנהל המצב Zustand, המגובה באימות סמכותי מהשרת. אם מצב המשתמש אינו תקין, הניתוב נחסם והמערכת מובילה ללובי.
- **אירוע המשתמש:** ניסיון גישה לנתיב מוגן.
- **התוצאה הצפויה:** חסימה וניתוב אוטומטי ללובי. יעד ביצועים לניתוב מקומי: ≤50ms.

### ב. בחירת תפקיד כפול (Dual Role Selection Spec)
- **הטריגר הפדגוגי:** תמיכה במורים ומנהלים בעלי הרשאות כפולות.
- **מצב המערכת:** בעת שינוי תפקיד, המערכת מבצעת איפוס מלא ל-session context המקומי למניעת זליגת נתונים, תוך שמירה על persistent server data במידת הצורך.
- **אירוע המשתמש:** בחירת תפקיד מתוך מסך בחירה.
- **התוצאה הצפויה:** עדכון משתנה המצב וניקוי כל הקשר המידע הישן של הסשן הקודם.

### ג. פקיעת תוקף אסימון והתנתקות שקטה (Token Expiration)
- **הטריגר הפדגוגי:** אבטחת מידע מחקרי.
- **מצב המערכת:** התנתקות שקטה (Silent Logout). מחיקת אסימון, איפוס Zustand ואיפוס ה-IndexedDB עבור הסשן הנוכחי.
- **אירוע המשתמש:** פקיעת תוקף אסימון הגישה.
- **התוצאה הצפויה:** ניקוי מלא של הזיכרון המקומי וניתוב הביתה.

### ד. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Implement Route Guards using a Single Source of Truth via Zustand backed by Firebase Auth state. If a route check fails or user state is inconsistent, force a redirect to the student lobby immediately. Upon role switching, perform a hard wipe of all local session context and Zustand state buffers to prevent privilege escalation. Execute silent logout upon JWT expiration, clearing all caches and IndexedDB.

---

## מודול 3: מודול אבטחה ואנונימיזציה (PII Filter & Server-Side Validation)

### א. פילטר אנונימיזציה בזמן אמת
- **הטריגר הפדגוגי:** שמירה הרמטית על פרטיות הלומדים ומניעת זליגת מידע.
- **מצב המערכת:** "Fail-Closed Transmission, Fail-Safe Learning Environment". אם מנגנון זיהוי הנתונים המזהים (PII) חווה תקלה, המערכת עוצרת את ה-Transmission אך שומרת על יציבות סביבת הלמידה.
- **אירוע המשתמש:** הקלדת טקסט בתיבות קלט או שיח.
- **התוצאה הצפויה:** חסימת שליחה במקרה של זיהוי נתונים מזהים (PII). במקרה של תקלה ברכיב הסינון, המערכת נועלת את הקלט ליתר ביטחון עד להתאוששות הלוגיקה.

### ב. אימות קשיח בצד השרת (Server-Side Validation)
- **הטריגר הפדגוגי:** שלמות מסד הנתונים והגנה על מערך המחקר.
- **מצב המערכת:** חוקי האבטחה פועלים כחומת אש אטומית. כל בקשת כתיבה/עדכון נבדקת במלואה מול הסכמה ב-Firestore Rules.
- **אירוע המשתמש:** בקשת כתיבה לשרת.
- **התוצאה הצפויה:** אישור או דחייה מלאה (403). אין אישור חלקי.

### ג. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Implement a fail-closed PII filter for transmission: if the PII detection logic encounters a runtime error, disable all input and transmission components immediately to guarantee zero PII leakage. Enforce atomic validation in Firestore Security Rules. Any payload field variance results in a hard deny (403).

---

## מודול 4: סכמת אוספי בסיס הנתונים (Firestore Collections Schema Spec)

### א. מבנה האוספים והסכמה הקשיחה
- **הטריגר הפדגוגי:** הגדרת תשתית נתונים אנונימית הרמטית המונעת זיהוי של הלומדים ושומרת על פרטיותם המלאה.
- **מצב המערכת:** השרת הוא מקור האמת היחיד והמוחלט. המערכת מאבטחת ואוכפת את מבנה הטבלאות באופן קשיח. הפרדה לוגית בין `classes`, `students`, `sessions`, `workspace_states`, `telemetry_logs`, ו-`interventions`. הפרדת session/workspace state מ-student identity נועדה למנוע זליגת הקשר.
- **נתיבי הנתונים המורשים:**
  - נתונים כיתתיים/ציבוריים: `/artifacts/{appId}/public/data/{collectionName}`
  - נתונים פרטיים: `/artifacts/{appId}/users/{userId}/{collectionName}`

### ב. מדיניות סנכרון וביצועים (Real-Time Synchronization & Performance Spec)
- **הטריגר הפדגוגי:** מניעת תסכול קוגניטיבי ושמירה על רציפות הלמידה באמצעות עדכונים מהירים ורכים.
- **מצב המערכת:** Realtime interaction is local-first and event-driven. הממשק מגיב מיידית בצד הלקוח (יעד תגובה מצב מקומי ≤50ms); השרת מקבל רק אירועים לוגיים שנבחרו לפי חוזה Telemetry (יעד ביצועים P95 ≤ 150ms).
- **אירוע המשתמש:** פעולה לוגית בממשק.
- **התוצאה הצפויה:** סנכרון נתונים אסינכרוני, מבוסס אירועים בלבד. אין לשדר תנועות עכבר, גרירות רציפות או שינויי פיקסלים.

### ג. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Define Firestore schemas with absolute rigidity.

Classes collection must contain strictly: `school_id`, `class_name`, `class_type` (fields set during initial class creation — see Module 25; the full `ClassDocument` also carries `active_session_id`, `projector_mode`, `projector_mode_updated_at`, `updated_by_teacher_id`, populated by Module 15).

Students collection must contain strictly: `student_id` (1-12), `class_id`, `school_id`, `created_at`, `support_profile_id`, `support_profile_version`, `support_profile_updated_at`, `support_profile_updated_by`, `active_session_id`. **(v6.1: this is now the single canonical field list — it replaces the three partially-conflicting lists that existed across Module 4, Module 19 and Appendix A in v6.0. `teacher_approval_status` was removed: it was never read or written by any workflow in this spec — the actual approval gate lives exclusively on `SessionDocument.teacher_gate_approved`, see Module 20.)**

Restrict write operations strictly via Firestore Security Rules. Latency target P95 ≤ 150ms.

---

## מודול 5: סכמת נתוני מיקרו פעילות (Telemetry Payload Schema Spec)

### א. עקרון מרכזי
Telemetry is event-based, not continuous. חל איסור מוחלט על שידור streams רציפים של קואורדינטות עכבר או גרירה.

### ב. מבנה נתונים ודרישות שליחה
כל אירוע ממשק לוגי (למשל `REGROUPING_SUCCESS`, `BLOCK_DRAG_COMPLETE`, `DIGIT_ENTERED`) מקודד לאובייקט JSON בודד, במבנה מוגדר מראש **לפי סוג האירוע הספציפי** (ראו ס"ג להלן — זהו התיקון המרכזי של גרסה 6.1). גודל מטען מרבי לבקשה: ≤50KB. שימוש בתור מקומי ב-IndexedDB במקרה של אופליין.

### ג. עיקרון הקלדה לפי סוג אירוע (v6.1)
בגרסה 6.0 שדה ה-`details` היה מוקלד כ-`Record<string, unknown>` — טיפוס פתוח שסתר ישירות את הדרישה ל"מבנה מוגדר מראש", והשאיר את מבנה השדות עבור 12 מתוך 13 סוגי האירועים לא מוגדר. בגרסה זו לכל אחד מ-13 סוגי האירועים יש ממשק `Details` ייעודי, וקיים `TelemetryDetailsMap` שמקשר `event_type` לטיפוס ה-`details` המתאים (ראו נספח א', סעיף 3, למקור האמת המלא).

**כלל חובה נוסף:** שדה `column_index` ברמת ה-payload (לא בתוך `details`) הוא **חובה** עבור אירועים מוגבלי-טור — `BLOCK_DRAG_COMPLETE`, `REGROUPING_TRIGGERED`, `REGROUPING_SUCCESS`, `DIGIT_ENTERED`, `DIGIT_DELETED`, `HESITATION_DETECTED`, `SOCRATIC_CARD_SHOWN` — ו**מושמט** עבור אירועי סשן/תרגיל/רפלקציה: `SESSION_START`, `PROBLEM_LOAD`, `UNDO_EXECUTED` (למעט כאשר הפעולה שבוטלה הייתה מוגבלת לטור ספציפי), `SOCRATIC_OPTION_SELECTED`, `PROBLEM_COMPLETE`, `REFLECTION_SUBMITTED`. כלל זה נאכף ב-Firestore Security Rules (מודול 27) לצד בדיקת סכמת ה-`details`.

### ד. טיפוסי TS רשמיים לאירועי טלמטריה
ראו נספח א', סעיף 3, למקור האמת המלא והמחייב (`TelemetryEventType`, `TelemetryDetailsMap`, `TelemetryPayload<T>`). ה-13 סוגי האירועים נותרו זהים לגרסה 6.0.

### ה. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Construct the exact JSON payload format for every client workspace action event matching `TelemetryPayload<T>` and the corresponding entry in `TelemetryDetailsMap` (Appendix A §3). Never fall back to a generic object shape for `details` — every one of the 13 event types has its own required field set now. Validate payload size (≤50KB) before every update. Enforce event-based logging only. Include client timestamps and unique idempotency keys. Enforce `column_index` presence/absence per the rule in §C above via server-side Security Rules validation, not client-side trust alone.

---

## מודול 6: מודול לובי התלמיד (Student Hub Spec)

### א. ניהול מפגשים
המערכת שולפת את המפגש הפעיל בטעינה ראשונית. Snapshot listener ממוקד למסמך המפגש הפעיל בלבד (ללא קריאות גלובליות יקרות).

### ב. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Render a clean dashboard displaying only the current active session object fetched from the student state database. Use targeted listeners to minimize read costs. Keep local Zustand state updated with the latest session ID fetched from the authoritative server state.

---

## מודול 7: מודול לוח בית המספרים הדיגיטלי (Place Value Chart Engine Spec)

### א. ניהול מצב ותצוגה
Zustand הוא מקור האמת ל-Local Runtime State בלבד, כאשר השרת מקבל עדכוני אירועים תקופתיים. ממשק: עמעום טורים לא פעילים (`brightness: 0.6`) ונעילת pointer-events בטורים שאינם במוקד החישוב הנוכחי.

### ב. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Implement CSS filter properties for brightness control (`brightness(0.6)` for inactive columns). Use Zustand for active column state tracking. Ensure active column pointer events are properly isolated.

---

## מודול 8: מודול לבני דינס וירטואליות (Dienes Blocks Engine & Canvas Spec)

### א. מנוע הגרירה והחישוב
- **ניהול מצב:** Zustand הוא מקור האמת למיקום וכמות הבלוקים ברמת ה-UI. IndexedDB משמש ל-Persistence מקומי בעת ניתוק.
- **פיזיקה ממוחשבת:** 60fps, מנגנון Magnetic Snap מבוקר עם HTML5 Canvas/WebGL.
- **מנגנון Undo:** משחזר Snapshot דטרמיניסטי של מצב ה-VRA. אירועי Undo מוסרים באופן מפורש ממדדי השגיאות והשחיקה בטלמטריה.

### ב. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Use HTML5 Canvas/WebGL for block manipulation running steadily at 60fps. Implement magnetic snap physics for snapping blocks into standard column layouts. Undo actions must be excluded from mistake telemetry tallies.

---

## מודול 9: מודול מקלדת דינמית וגשר VRA (Dynamic Keyboard & VRA Bridge Spec)

### א. התנהגות המקלדת הדינמית
- **עקרון:** מנוע ה-Rule Engine / VRA קובע את אירוע ההמרה.
- **הפרדה:** Teacher-configured support profile (הגדרה סמכותית בשרת) מול Current intervention state (מצב UI רגעי).
- **חסימת קלט:** המקלדת הדינמית ננעלת בטורים הדורשים המרה (פריטה/צירוף עשר), ומשתחררת רק עם השלמת הפעולה הפיזית בקנבס הלבנים.

### ב. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Implement conditional column keyboard locking based on VRA engine conversion events. Unlock column keyboard strictly upon conversion success event execution.

---

## מודול 10: מודול לוח חיבור אדפטיבי מבוקר (Symmetrical Addition Grid Module Spec)

### א. היררכיית תמיכה וזמנים
1. **Independent Exploration:** חקירה עצמאית (0–30 שניות).
2. **Adaptive Grid / Low-Level Scaffold:** 30 שניות+ (הצגת רשת תמיכה).
3. **Socratic Intervention:** 45 שניות+ (הפעלת טריגר חניכה סוקרטית).

### ב. ניהול טיימר
הטיימר מתאפס על פעולות קוגניטיביות בלבד (גרירת לבנים, הקלדה, המרה). תנועות עכבר אינן מאפסות את הטיימר.

### ג. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Manage grid visibility via local React state decoupled from Firestore write streams. Track cognitive interaction events exclusively to reset the hesitation timer.

---

## מודול 11: מודול כפתור ביטול פעולה פדגוגי (Undo Action Engine Module Spec)

### א. עקרונות פדגוגיים ותפעוליים
- **עקרון:** Undo is not a mistake event. Undos are excluded from mistake tallies and latency penalty.
- **טכני:** שמירת מחסנית (Stack) מקומית בלקוח המוגבלת ל-10 הפעולות האחרונות. שחזור Snapshot דטרמיניסטי של מצב ה-VRA (קואורדינטות, כמויות, קלט).

### ב. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Maintain a client-side state stack restricted strictly to the last 10 actions. Undo actions must never reduce scores or trigger punitive interventions.

---

## מודול 12: מנגנון בלימת ניחושים וחיכוך פדגוגי (Socratic Mentoring Trigger Spec)

### א. הטריגר הפדגוגי
זיהוי קושי קוגניטיבי ומניעת ניחושים עיוורים או חוסר אונים נרכש, תוך הכוונה עצמית של התלמיד בחזרה לחקירה ייצוגית בקנבס הלבנים.

### ב. מצב המערכת ומעטפת החיכוך
המערכת עוקבת אחר פעולות הלומד ומזהה מצבי קושי על פי שני מדדים בלבד:
1. השהיה רצופה של 45 שניות ללא פעולה קוגניטיבית בטור החישוב הפעיל.
2. ביצוע של 4 ניסיונות הקלדה/מחיקה שגויים ברציפות באותו תרגיל.

בעת זיהוי קושי, מופעל כרטיס החניכה הצידי (Socratic Card) במגירה נשלפת (Side Drawer). בעת בחירת תשובה שגויה בתוך כרטיס החניכה, המערכת מפעילה נעילה שקטה של לחצני המענה בכרטיס בלבד למשך 30 שניות (`pointer-events: none` בתוספת אינדיקטור שעון חול עדין). בזמן נעילת כרטיס החניכה, מרחב הלבנים הדיגיטליות, המקלדת, וכפתור ה-Undo נשארים פעילים וחופשיים לחלוטין לחקירה.

### ג. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Implement the Socratic card in a dedicated side drawer without using popup dialogs or blocking modals. Trigger Socratic card activation strictly upon: (a) 45 seconds of continuous column hesitation, or (b) 4 consecutive digit deletions/errors in the active column — these two conditions correspond exactly to `trigger_reason: 'hesitation_45s' | 'consecutive_errors_4'` in `SocraticCardShownDetails` (Appendix A §3). Upon incorrect answer selection inside the Socratic card, immediately apply a 30-second pointer-events-disabled block exclusively to the card buttons with a serene hourglass indicator. Ensure Dienes blocks canvas interaction and the undo button remain fully functional and accessible. Send workspace telemetry JSON to initiate backend AI analysis.

---

## מודול 13: ממשק החונך הדיגיטלי ומנוע החניכה (Socratic AI Engine & Gemini API Contract)

### א. מנוע האבחון והנחיות המערכת
מנוע הבינה המלאכותית מקבל כקלט את מטען הטלמטריה ומצב מרחב העבודה של התלמיד. המנוע מסווג את הטעות לאחת משלוש קטגוריות:
1. טעויות עובדתיות בחישוב הבסיסי.
2. טעויות מיומנות רכיב (סדר האלגוריתם).
3. טעויות אסטרטגיה (חוסר הבנה מושגית של המבנה העשרוני).

בהתאם לסיווג, המנוע מנסח שאלה מנחה סוקרטית אחת קצרה ושלושה מסיחים מותאמים. חוקי ברזל למנוע ה-AI: חל איסור מוחלט לחשוף את התשובה המספרית הסופית, לפתור עבור התלמיד, או להשתמש במונחי עזרים פיזיים שאינם קיימים בממשק הדיגיטלי. במקרה של כשל תקשורת, המערכת מגישה רמז סטטי מובנה מראש.

### ב. חוזה בקשה ותשובה מול ה-Gemini API (JSON Schema)

```typescript
// Request Payload (Outgoing to Cloud Function / Gemini API)
export interface GeminiSocraticRequest {
  student_id: number; // Strictly 1-12
  session_id: string;
  exercise_id: string;
  active_column_index: number;
  workspace_state: {
    ones_count: number;
    tens_count: number;
    hundreds_count: number;
    memory_circles: Record<string, number>;
  };
  recent_actions: TelemetryPayload<TelemetryEventType>[]; // מערך הטרוגני; כל איבר מוקלד פנימית לפי event_type שלו
}

// Response Payload (Incoming from Gemini API)
export interface GeminiSocraticResponse {
  guiding_question: string; // Single concise question referring strictly to digital VRA
  options: [
    { id: 'opt_1'; option_text: string; feedback_text: string; is_correct: boolean },
    { id: 'opt_2'; option_text: string; feedback_text: string; is_correct: boolean },
    { id: 'opt_3'; option_text: string; feedback_text: string; is_correct: boolean }
  ];
}
```

### ג. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Enforce rigid JSON schema validation for the Gemini API exchange matching `GeminiSocraticRequest` and `GeminiSocraticResponse`. Use `student_id` exclusively — do not reintroduce `anonymous_student_id` as a separate field name anywhere in the implementation. Bind Socratic persona exclusively to digital VRA model representations, strictly forbidding direct answer disclosure or physical CRA terminology. Serve pre-configured static hints instantly upon API timeout or network failure.

---

## מודול 14: מודול מפגשים 1 עד 8 ומנוע תרגילים (Session & Worksheet Progression Spec)

### א. הטריגר הפדגוגי
מניעת עומס קוגניטיבי ושמירה על החוסן הרגשי של תלמידי כיתה ג' באמצעות הגבלת זמן העבודה העצמאית בהתאם לסוג המפגש. עידוד סוכנות הלמידה באמצעות בחירה אקטיבית בין נתיב ביסוס לנתיב אתגר.

### ב. מצב המערכת
השרת הוא מקור האמת היחיד והמוחלט עבור זמן המפגש ומצב התרגיל הפעיל. השרת מנהל: `session_start_time`, `session_deadline_time`, `active_exercise_id`, `session_state`, `active_session_id`.
- מפגשים 3–7: מוגבלים ל-15 דקות נטו של עבודה עצמאית.
- מפגשים 2 ו-8: מוגבלים ל-25 דקות נטו של עבודה עצמאית.

חנות Zustand בדפדפן משמשת לתצוגה בלבד ואינה מוסמכת לקבוע או להאריך זמנים. במקרה של רענון או פתיחת מספר כרטיסיות, הדפדפן מסתנכרן מול השרת.

### ג. נתיבי בחירה בסיום 7 תרגילי החובה
עם השלמת 7 תרגילי החובה לפני תום הזמן, המערכת מציגה מסך בחירה שקט ומעצים:
- **נתיב ביסוס:** משימות חזרה וייצוגים לא סטנדרטיים.
- **נתיב אתגר:** משימות חקר מורכבות בתחום הרבבה, המרות מרובות וספרות חסרות.

תרגילי הבחירה אינם נכללים במדדי השליטה הרשמיים של 7 תרגילי החובה.

### ד. בדיקה קוגניטיבית
- **נתון:** התלמיד בתרגיל 5/7, נותרו 7 דקות. התלמיד מרענן דפדפן או חווה ניתוק רשת של 30 שניות.
- **תוצאה:** הסשן, מספר התרגיל (5) ומצב ה-VRA משתחזרים בדיוק. הספירה נמשכת לפי חותמת הזמן הסמכותית בשרת.

### ה. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Establish the server as the sole authoritative source of truth for both session duration and current problem index. Use Zustand strictly as a presentation and local cache layer. Synchronize state upon refresh to prevent clock manipulation. Restrict teacher dashboard mastery calculations strictly to the first seven compulsory tasks.

---

## מודול 15: מודול ארגז חול דיגיטלי מונחה ומצב מקרן (Sandbox & Projector Mode Spec)

### א. הטריגר הפדגוגי
ניהול הלמידה ההיברידית בכיתה בצורה רכה וצפויה. הפעלת מצב מקרן יוצרת מעבר קוגניטיבי מבוקר המכוון את קשב הלומדים להסבר המורה תוך מניעת עומס מפוצל.

### ב. מצב המערכת
השרת הוא מקור האמת היחיד למצב המקרן ברמת `class_id` ו-`active_session_id`. שדות שרת: `projector_mode` (boolean), `projector_mode_updated_at` (timestamp), `updated_by_teacher_id`. כאשר מצב מקרן פעיל, סביבת התלמיד עוברת למצב צפייה חסום ואטום. חל איסור מוחלט על הצגת מסכים Null/לבנים, איפוס מרחב העבודה המקומי, או טעינה מחדש של הדפדפן.

### ג. התוצאה הצפויה והתנהגות ויזואלית
הצגת מסך המתנה אטום הכולל איור מקרן שליו והטקסט: "הקשיבו להסבר של המורה על גבי המקרן". מרחב העבודה נשמר בזיכרון המקומי אך מוסתר לחלוטין. עם כיבוי המקרן, הסביבה משתחררת מיד (P95 ≤ 1000ms) לאותו מצב מדויק.

### ד. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Eradicate all rendering of null or blank screen states when projector mode is active. Restrict projector mode state strictly to `class_id` and `active_session_id` context. Render a serene, fully opaque wait screen displaying "הקשיבו להסבר של המורה על גבי המקרן" without deletion. Persist current Zustand state. Synchronize boolean state via real-time Firestore listener with target P95 ≤ 1000ms. Ignore outdated updates using timestamp validation.

---

## מודול 16: מודול לוח רפלקציה תלת־שלבי (SRL Reflection Board Spec)

### א. הטריגר הפדגוגי
קידום מודעות עצמית, הכוונה עצמית ופיתוח סוכנות הלומד בסיום מפגש 8, ללא תיוג או השוואה לאחרים.

### ב. מצב המערכת וחישוב מדד ההתמדה
השרת מנהל: `reflection_step` (1, 2 או 3), `reflection_completed` (boolean), `persistence_index` (number).

**נוסחת מדד ההתמדה (Persistence Index):**

$$\text{Persistence Index} = \frac{U}{U + E + G} \times 100$$

כאשר:
- **U** = מספר פעולות ביטול פעולה (Undo) — נגזר מספירת אירועי `UNDO_EXECUTED`.
- **E** = מספר ניסיונות הקלדה שגויים — נגזר מספירת אירועי `DIGIT_ENTERED` שבהם `is_correct === false` (שדה זה נוסף בגרסה 6.1 בדיוק לצורך חישוב זה; ראו מודול 5 ונספח א' §3).
- **G** = מספר בחירות שגויות בכרטיס החניכה — נגזר מספירת אירועי `SOCRATIC_OPTION_SELECTED` שבהם `is_correct === false`.

**טיפול בקצה:** כאשר U + E + G = 0, המודול קובע דינמית Persistence Index = 100%, למניעת חלוקה באפס.

### ג. שלושת שלבי הרפלקציה
1. **שלב א — הערכת מאמץ:** בחירה מתוך 3 סמלים חזותיים (מאמץ קל, בינוני, רב).
2. **שלב ב — זיהוי אסטרטגיות:** סימון צ'קבוקסים (Undo, עיגולי זיכרון, כרטיס סוקרטי).
3. **שלב ג — משוב התמדה:** הצגת האחוז, מסר מעצים וכפתור סיום מפגש סופי.

### ד. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Implement SRL Reflection Board strictly in three chronological steps: (1) Effort Evaluation (3-point visual scale), (2) Strategy Selection, (3) Persistence Feedback displaying calculated index. Compute U, E, G exclusively from `UNDO_EXECUTED` count, `DIGIT_ENTERED` events with `is_correct: false`, and `SOCRATIC_OPTION_SELECTED` events with `is_correct: false`, respectively. Dynamically default Persistence Index to 100% if the denominator (U + E + G) equals zero. Do not expose comparative rankings or social labels. Synchronize step completions atomically with Firestore using idempotency keys.

---

## מודול 17: מודול עבודה במצב לא מקוון ותור סנכרון (Offline Queue & Sync Engine Spec)

### א. הטריגר הפדגוגי
הבטחת רציפות הלמידה והפחתת חרדה הנובעת מתקלות תקשורת. המעבר לאופליין מתבצע באופן שקט ללא קטיעת חוט המחשבה.

### ב. מצב המערכת וניהול תור
Zustand מייצג את מצב ה-UI בלבד. IndexedDB משמש כמאגר אגירה עמיד. חל איסור מוחלט להשתמש ב-LocalStorage עבור תורי טלמטריה וסנכרון. כל פעולה שנאגרת באופליין נשמרת ב-IndexedDB במבנה FIFO הכולל: `idempotency_key`, `client_timestamp`, `session_id`, `student_id`, `exercise_id`, `operation_type`, `payload`.

### ג. פרוטוקול התאוששות וחידוש חיבור
פרוטוקול בן **5 שלבים**:
1. זיהוי חידוש חיבור ואימות נגישות לשרת.
2. שליפת מצב סמכותי עדכני מ-Firestore ועדכון Zustand.
3. קריאת תור ה-FIFO מ-IndexedDB ושליחה במנות מוגבלות (Bounded Batches).
4. מחיקה אטומית מ-IndexedDB רק לאחר קבלת אישור שרת (Ack).
5. השרת אוכף עיבוד אידמפוטנטי (Idempotent Execution) למניעת כפילויות.

### ד. חיווי ויזואלי
אופליין = אייקון ענן אפור קטן ולא חוסם בפינה. אונליין מסונכרן = ענן ירוק. אין הצגת פופ-אפים או הודעות שגיאה חוסמות.

### ה. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Use Zustand only for client UI/connection state. Never treat Zustand as authoritative for persistence. Use IndexedDB as the persistent local transaction buffer. Strictly prohibit LocalStorage. Implement FIFO queue ordering with unique idempotency keys per operation. Restore connection via the **5-step** handshake protocol described in §C above, executing atomic deletes from IndexedDB strictly upon server acknowledgment.

---

## מודול 18: מודול רדאר פדגוגי שקט (Silent Radar Matrix Spec)

### א. הטריגר הפדגוגי
אספקת תמונת מצב אבחונית בזמן אמת למורה כמנווט אנושי, ללא הצפה חושית, ללא תיוג חברתי ותוך שמירה מלאה על אנונימיות התלמידים.

### ב. מפרט הגריד ומיפוי הצבעים
גריד קבוע של 3×4 המכיל בדיוק 12 משבצות אנונימיות ממוספרות 1–12. אין לשנות את סדר המשבצות או להזיזן.
- **ירוק (Green):** פעילות למידה תקינה (אירוע קוגניטיבי ב-30 השניות האחרונות).
- **צהוב (Yellow):** היסוס קוגניטיבי (45 שניות רצופות ללא פעולה בטור הפעיל).
- **אדום (Red):** כרטיס חניכה סוקרטי פעיל כעת במסך התלמיד.
- **אפור (Grey):** התלמיד מנותק (לפי Presence Heartbeat) או שטרם החל סשן.

**היררכיית עדיפות תצוגה, מהגבוה לנמוך:**
$$\text{RED} > \text{GREY} > \text{YELLOW} > \text{GREEN}$$

### ג. אנונימיזציה הרמטית ו-Presence
איסור מוחלט על הצגת שמות, ראשי תיבות או אווטארים. הצגת מזהים מספריים 1–12 בלבד. זיהוי ניתוק מבוצע בצד השרת דרך מנגנון Presence Heartbeat (חלון זיהוי מרבי: 15 שניות).

### ד. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Implement Silent Radar as a static 3x4 grid representing 12 anonymous student profiles (IDs 1-12). Throttle client writes to maximum once per 1000ms. Apply color precedence highest to lowest: RED > GREY > YELLOW > GREEN. Server-side Presence Heartbeat determines GREY state within a 15-second max target. Strictly forbid rendering names, initials, or avatars.

---

## מודול 19: מודול הקצאת התאמות פדגוגיות שקטות (Silent Adaptation Assignment Spec)

### א. הטריגר הפדגוגי
מתן התאמות אישיות שקטות ללומדים ללא חיווי בממשק התלמיד וללא יצירת סממן חזותי המעיד על קבלת תמיכה מיוחדת, לשמירה על סוכנות הלומד והחוסן הרגשי.

### ב. מצב המערכת ונקודת ההחלה
השרת הוא מקור האמת עבור שיוך `support_profile_id`. שדות התלמיד הרלוונטיים בשרת (חלק מסכימת ה-`students` הקנונית המלאה במודול 4): `student_id` (1-12), `class_id`, `school_id`, `support_profile_id`, `support_profile_version`, `support_profile_updated_at`, `support_profile_updated_by`.

- **גבול החלה בטוח (Safe Application Boundary):** שינוי פרופיל במהלך תרגיל פעיל נשמר כ-Pending Adaptation ומוחל אך ורק במעבר לתרגיל הבא, כדי למנוע קטיעת רצף קוגניטיבי.
- **תצוגת תלמיד:** זהה לחלוטין לממשק הסטנדרטי (ללא Badges, אייקונים או הודעות).

### ג. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Store support profile configuration strictly on the student document fields listed in §B (which match Appendix A's `AnonymousStudent` interface exactly as of v6.1 — do not introduce additional or renamed fields). Only authorized teachers may write this field. Pupil UI must remain visually indistinguishable from standard UI. If a profile is updated mid-exercise, apply it strictly at the next exercise transition boundary.

---

## מודול 20: מודול שער אישור מורה קשיח (Teacher Approval Gate Spec)

### א. הטריגר הפדגוגי
הבטחת עמידה ביעדי הלמידה וסגירת פערי ידע לפני מעבר לשלב הלמידה האדפטיבית (מפגשים 3–7), תוך חוויית המתנה חיובית ומשרה רוגע.

### ב. מצב המערכת
בקר הניתוב (Route Guard) בלקוח התלמיד בודק: אם `session_number == 2` וגם `is_completed == true` וגם `teacher_gate_approved == false` (שלושתם על מסמך הסשן של מפגש 2 של אותו תלמיד), הגישה למפגש 3 נחסמת אסינכרונית והתלמיד מועבר למסך ההמתנה.

- **מסך המתנה ("מעוף הדבורה"):** מציג אנימציית דבורה שלווה והודעה: "כל הכבוד מתמטיקאים! סיימתם את התחנה השנייה בהצלחה. המורה בודק את העבודה שלכם כעת, ומיד נמשיך במסע המשותף שלנו."
- **דשבורד מורה:** טבלה אנונימית (1–12) המציגה את המלצת המטריקס האבחונית (`green_path`/`remediation_path` — שם השדה תוקן ב-v6.3 מ-`path_green`/`path_remediation` כדי להתאים לנספח א') ומתג אישור. בלחיצה, השרת מעדכן `teacher_gate_approved = true`.

**חישוב `matrix_recommended_path` (נוסף ב-v6.3 — ברירת מחדל מוצעת):** עד גרסה 6.2 שדה זה הופיע בסכימה (נספח א') אך שום מקום במסמך לא הגדיר איך הוא מחושב. ברירת המחדל: `matrix_recommended_path = 'green_path'` אם `session_score_percent >= 50`, אחרת `'remediation_path'` — אותו סף בדיוק כמו קו החלוקה התחתון של מודול 23.

**תלות בזמן חישוב (חשוב):** `session_score_percent` ו-`matrix_recommended_path` חייבים להיות מחושבים ונכתבים ל-`SessionDocument` **בטריגר עצמאי על סיום המפגש** (`is_completed` → `true`), **ולא** כתוצר לוואי של `generatePedagogicalReportPDF` (מודול 23). שער האישור כאן צריך לקרוא ערכים קיימים מיד עם סיום מפגש 2 — אם החישוב תלוי בהצלחת/סיום הפקת ה-PDF, נוצרת צימוד מיותר: כשל או עיכוב בהפקת הדוח יעכב את דשבורד האישור של המורה, בסתירה לעיקרון ההפרדה בין המודולים.

### ג. התרשתות ושחרור
הלקוח מאזין ל-Firestore Snapshot Listener. עם אישור השרת, הנעילה משתחררת מיד (P95 ≤ 1000ms) והלובי מעודכן ללא רענון דף.

### ד. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Enforce async check in client router guards: restrict navigation access to session 3 if, on that student's session-2 `SessionDocument`, `session_number` equals 2 AND `is_completed` is true AND `teacher_gate_approved` is false. *(v6.2: corrected — `session_completed` is not a field on `SessionDocument`; the check is expressed via `session_number` + `is_completed`, both of which are.)* Redirect strictly to the positive waiting view ("מעוף הדבורה"). Atomically update approval fields (`teacher_gate_approved`, `teacher_selected_path`, `gate_approved_at`, `gate_approved_by`) in Firestore upon teacher click, unlocking student route via real-time listener under P95 ≤ 1000ms latency. Do not read or write any student-level approval field — `SessionDocument.teacher_gate_approved` is the sole source of truth. *(v6.3: compute `session_score_percent` and `matrix_recommended_path` in a dedicated `onSessionComplete`-style trigger, independent of `generatePedagogicalReportPDF` — the PDF generator should only read the already-computed value, never compute it itself. Default rule: `matrix_recommended_path = session_score_percent >= 50 ? 'green_path' : 'remediation_path'`, pending product confirmation.)*

---

## מודול 21: מודול ממשק מסך מפוצל לאבחון מורה (Teacher Diagnostic Split-Screen Spec)

### א. הטריגר הפדגוגי
מתן אפשרות למורה להתחקות אחר תהליך פתרון התרגיל הבודד וציר ההחלטות הקוגניטיבי של התלמיד, ללא יצירת עומס קוגניטיבי ותוך שמירה הרמטית על פרטיות.

### ב. מצב המערכת ומבנה המסך המפוצל
המסך מפוצל לשני חלקים שווים ונקיים ממסיחים:
1. **צד שמאל (Screen Capture — סרטון שחזור קנבס):** נגן וידאו ממוקד המריץ צילום מסך מקומי מקוודד של קנבס העבודה עבור התרגיל הספציפי שנבחר בלבד. חל איסור מוחלט על שילוב מצלמה, מיקרופון או שמע.
2. **צד ימין (טבלת ציר החלטות קוגניטיבי — VRA Timeline):** טבלה סטטית וברורה הממפה כרונולוגית את כל פעולות התלמיד (גרירת לבנים, הזנה בעיגולי זיכרון, מחיקות, וביטולי פעולה) לצד זמני השהיה וחיוויי בקרה עצמית.

### ג. אירוע המשתמש
המורה בוחרת מזהה אנונימי (1–12) ותרגיל מסוים מתוך דשבורד האבחון. המערכת טוענת את קובץ הוידאו המוצפן ואת טבלת ה-VRA התואמת.

### ד. התוצאה הצפויה
טעינה מהירה של הנגן וטבלת ציר הזמן. המורה יכולה להריץ, לעצור ולנתח את שלבי הפתרון. כל הנתונים משויכים למזהה אנונימי בלבד.

### ה. חוזה נתונים והתנהגות בזמן כשל
במקרה של כשל בטעינת קובץ השחזור, המערכת מציגה הודעה שקטה: "וידאו השחזור בהכנה" ומציגה את טבלת ציר ההחלטות מתוך נתוני הטלמטריה השמורים בשרת. (הטבלה ניתנת לבנייה מלאה כעת מסכימות ה-`details` הייעודיות שנוספו במודול 5 — ראו נספח א' §3.)

### ו. תלויות במודולים אחרים
מודולים 4, 5, 8, 11, 18, 27.

### ז. בדיקה קוגניטיבית
- **תרחיש:** המורה בוחנת את תהליך הפריטה בתרגיל 4 של תלמיד 3.
- **תוצאה:** הנגן משחזר את תנועת הלבנים בקנבס, ובמקביל הטבלה בצד ימין מדגישה את אירוע `REGROUPING_SUCCESS` עם חותמת הזמן המדויקת.

### ח. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Implement split-screen view interface. Left side: standard video player playing recorded local screen capture of individual workspace canvas for selected exercise, strictly with zero audio/webcam stream. Right side: static clean table representing VRA Cognitive Decision Timeline mapping student telemetry events (block drags, memory circles, deletions, undos) alongside timestamps and self-regulation flags, populated from the typed `TelemetryDetailsMap` payloads (Appendix A §3). Maintain strict anonymity (student IDs 1-12).

---

## מודול 22: מודול ערוץ שיח ניהולי למורה (Teacher Admin Chat Engine Spec)

### א. הטריגר הפדגוגי
אספקת ערוץ התייעצות ותמיכה מקצועי אסינכרוני למורה מול מנהלי המערכת, תוך הגנה הרמטית מוחלטת על פרטיות התלמידים ומניעה מוחלטת של זליגת PII.

### ב. מצב המערכת ומנגנון האנונימיזציה הדו-שכבתי
ערוץ השיח מנוהל בחלונית נשלפת (Sliding Side Drawer) שנפתחת בלחיצה על אייקון המעטפה בסרגל הכלים. אין קלט קולי (STT) בשום ממשק. תקשורת מורה-אדמין היא טקסט בלבד. אודיו לעולם אינו עוזב את המכשיר. מנגנון הגנת PII דו-שכבתי (Double-Tier Protection):
1. **שכבה 1 — Client-Side Regex Validation:** הלקוח סורק בזמן אמת את תיבת הקלט. אם זוהו שמות פרטיים, מספרי טלפון, מיילים או ת"ז, כפתור השליחה נחסם ומוצגת התראה עדינה המבקשת להשתמש במזהים 1–12.
2. **שכבה 2 — Server-Side Cloud Anonymizer Function:** לפני כתיבה ל-Firestore, פונקציית ענן סורקת את הטקסט, מצליבה מול רשימת שמות הכיתה ומחליפה כל שם פרטי במזהה האנונימי התואם (לדוגמה: "דניאל" ← "תלמיד 4").

### ג. אירוע המשתמש
המורה הקלידה הודעת התייעצות הכוללת שם תלמיד ולחצה שליחה.

### ד. התוצאה הצפויה
השם מוחלף בשרת באופן אטומי למזהה אנונימי, וההודעה נשמרת ב-Firestore במבנה אנונימי נקי ומסתנכרנת בזמן אמת לדשבורד הניהול.

### ה. חוזה נתונים והתנהגות בזמן כשל
במקרה של ניתוק רשת, ההודעה נאגרת בתור ה-IndexedDB (מודול 17) ונשלחת רק לאחר חידוש החיבור וביצוע האנונימיזציה בשרת.

### ו. תלויות במודולים אחרים
מודולים 3, 4, 17, 27, 28.

### ז. בדיקה קוגניטיבית
- **נתון:** המורה מקלידה "תלמיד 3 המכונה דניאל מתקשה בפריטה".
- **תוצאה:** השרת ממיר את ההודעה ל-"תלמיד 3 המכונה תלמיד 4 מתקשה בפריטה" לפני השמירה במסד הנתונים.

### ח. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Implement teacher admin chat inside a sliding side drawer triggered by an envelope icon. Enforce two-tier PII protection: (1) Client-side regex checking input to block PII submission, (2) Server-side Cloud Function Anonymizer parsing message body and replacing pupil personal names with anonymous IDs (1-12) prior to writing documents to Firestore. Strictly forbid saving raw PII database records. Enforce zero STT or voice input in any interface; text only; audio never leaves the device.

---

## מודול 23: מודול דוחות ואנליטיקה פדגוגית (Pedagogical Analytics & PDF Generator Spec)

### א. הטריגר הפדגוגי
תרגום נתוני הלמידה הדיגיטליים להמלצות פדגוגיות אופרטיביות להוראה פרונטלית והתערבות בכיתה הפיזית, תוך שמירה על אנונימיות מלאה.

### ב. מצב המערכת ומחולל הדוחות
מחולל הדוחות פועל בצד השרת בלבד באמצעות Cloud Function (`generatePedagogicalReportPDF`). המחולל מופעל עם השלמת מפגש 2 או 8 ומפיק קובץ PDF לקריאה בלבד השמור ב-Cloud Storage ומקושר למסמך המורה. **(v6.3: הפונקציה קוראת את `session_score_percent` הקיים כבר על `SessionDocument` — היא אינה מחשבת אותו בעצמה. החישוב עצמו קורה בטריגר נפרד על סיום מפגש, ראו מודול 20 §ב, כדי שדשבורד האישור לא יהיה תלוי בהפקת ה-PDF.)**

**כללי הניתוב וההמלצות הפדגוגיות (מבוססים אחוזים — תוקן כיוון בגרסה 6.1):**
- **ציון < 50%:** המלצה לעבודה בקבוצה הומוגנית קטנה, תיווך פרונטלי צמוד של המורה ושימוש בתבניות עשר פיזיות ומקלות מנייה.
- **ציון 50%–75%:** המלצה לעבודה בקבוצה הטרוגנית, שיח עמיתים ופתרון בעיות משותף באמצעות חשבונייה פיזית.
- **ציון > 75%:** המלצה לעבודה עצמאית עם משימות האתגר והעומק של כיתה ג' ושימוש בלוח מחיק פיזי וכרטיסיות מספרים.

**הוכרע ב-v6.2:** נוסחת הציון: **`session_score_percent = (מספר תרגילי החובה מתוך 7 שנפתרו נכון בניסיון ראשון ÷ 7) × 100`**. "נפתר נכון בניסיון ראשון" = אירוע `PROBLEM_COMPLETE` לתרגיל זה שלא קדם לו אף `DIGIT_ENTERED` עם `is_correct: false` באותו `exercise_id`.

### ג. אירוע המשתמש
המורה בוחרת מזהה תלמיד אנונימי (1–12) בדשבורד הדוחות ומורידה את הדוח המסכם כ-PDF.

### ד. התוצאה הצפויה
הפקת PDF מעוצב, קריא ואנונימי בתוך פחות משנייה אחת מרגע הבקשה, המכיל ניתוח פערי ידע, מדדי שליטה, מדד התמדה SRL והנחיות דידקטיות.

### ה. חוזה נתונים והתנהגות בזמן כשל
אם עיבוד ה-PDF נכשל בשרת, המערכת מציגה הודעה שקטה: "הדוח בעיבוד כעת, אנא נסו שוב בעוד מספר רגעים" ולא מציגה קבצים פגומים.

### ו. תלויות במודולים אחרים
מודולים 4, 5, 14, 16, 17, 27.

### ז. בדיקה קוגניטיבית
- **נתון:** תלמיד 7 סיים מפגש 8 לאחר שפתר נכון בניסיון ראשון 3 מתוך 7 תרגילי החובה — `session_score_percent ≈ 43%`.
- **תוצאה:** ה-PDF מונפק עם מזהה "תלמיד 7" בלבד וכולל המלצה לעבודה בקבוצה הומוגנית קטנה ותבניות עשר פיזיות (עקבי עם כלל "ציון < 50%").

### ח. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Create a server-side Cloud Function PDF generator triggered upon session 2 or 8 completion. Read-only PDF assets must restrict student identifiers strictly to anonymous numeric IDs (1-12). Enforce mathematical routing logic: **<50% score → small homogeneous group & physical ten frames; 50–75% → heterogeneous peer discourse & abacus; >75% → independent third-grade challenge track.** Strictly prohibit storing student real names in PDF files. Compute `session_score_percent` as `(count of the 7 compulsory exercises solved correctly on first attempt ÷ 7) × 100` — "correct on first attempt" means the `PROBLEM_COMPLETE` event for that `exercise_id` was not preceded by any `DIGIT_ENTERED` event with `is_correct: false` in that same exercise.

---

## מודול 24: מודול סקירת מערכת כוללת (Admin Overview & Caching Spec)

### א. הטריגר הפדגוגי
מעקב ובקרה על מדדי הלמידה והשימוש הגלובליים ברמת מנהל המערכת, תוך סודיות מחקרית מלאה ומניעת גישה לנתוני תלמידים פרטניים.

### ב. מצב המערכת ומדיניות ה-Caching
המערכת מפעילה כלל אבטחה קשיח: Fail-Closed Admin Security Rule. מנהלי מערכת חסומים מגישה לנתוני טלמטריה פרטניים או למסמכי תלמידים אישיים.
- **אגרגציה מתוזמנת:** פונקציית ענן רצה אחת לשעה, מחשבת מדדים מצטברים (אחוזי השלמת מפגשים, סך תרגילים שנפתרו, מדדי שגיאות גלובליים) ושומרת אותם במסמך מטמון ייעודי (`store_cache`).
- **ממשק אדמין:** קורא אך ורק ממסמך ה-`store_cache` וחסום מביצוע שאילתות חיות יקרות ב-Firestore.

### ג. אירוע המשתמש
מנהל המערכת נכנס לדשבורד הניהול הגלובלי.

### ד. התוצאה הצפויה
טעינה מיידית של גרפים ונתונים סטטיסטיים מצטברים ברמת הפרויקט, ללא חשיפת בתי ספר, כיתות או תלמידים ספציפיים.

### ה. חוזה נתונים והתנהגות בזמן כשל
במקרה של כשל בעדכון המטמון, הממשק מציג את הנתונים השמורים האחרונים (Last Known Cached State) עם חיווי שקט של זמן העדכון האחרון.

### ו. תלויות במודולים אחרים
מודולים 4, 5, 25, 27.

### ז. בדיקה קוגניטיבית
- **תרחיש:** אדמין מנסה להזין כתובת URL ישירה לאוסף הטלמטריה של תלמיד 3.
- **תוצאה:** Firestore Security Rules מחזירים שגיאה אטומית 403 (Deny), והאדמין מועבר לדף הבית.

### ח. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Construct high-level analytics dashboard presenting global aggregated statistics without exposing school, class, or student-level telemetry streams. Implement strict database security rules denying Admin role read access to `telemetry_logs` or `students` collections. Build a server-side cached aggregation routine running once per hour saving metrics to a read-only cache store to prevent live query bottlenecks.

---

## מודול 25: מודול ניהול בתי ספר, כיתות ומורים (Schools & Teachers Setup Wizard Spec)

### א. הטריגר הפדגוגי
ניהול ארגוני מבוקר התומך במבנה המחקרי הצר של הפיילוט, המאפשר הקמת כיתות תוך שמירה מלאה על אנונימיזציה מחמירה ואכיפת מגבלת גודל כיתה.

### ב. מצב המערכת ואשף ההקמה
השרת הוא מקור האמת היחיד. אשף הקמת הכיתה (Class Initialization Wizard) פועל תחת המגבלות והחוקים הבאים:
1. הגדרת בית ספר יחיד בשם "בית ספר ביקורת" וכיתה פעילה אחת בלבד בשם "המבקרים".
2. אכיפת סף קיבולת קשיחה: חוק אבטחה בשרת חוסם רישום של יותר מ-12 תלמידים פעילים לכיתה זו.
3. יצירת זהויות אנונימיות: המערכת מייצרת אוטומטית מזהים מספריים 1–12 בלבד עם הסיסמה הקבועה `10203040`. איסור מוחלט על שמירת שמות, מיילים או פרטים מזהים.

### ג. אירוע המשתמש
מנהל המערכת מפעיל את אשף ההקמה, מגדיר את הכיתה והמורה המורשה, ומאשר פתיחה.

### ד. התוצאה הצפויה
הקמת מסמכי הכיתה והמורים ב-Firestore. הנפקת כרטיסי כניסה אנונימיים לתלמידים (1–12, סיסמה `10203040`).

### ה. חוזה נתונים והתנהגות בזמן כשל
ניסיון לרשום תלמיד 13 או להזין שדה שאינו בתקן נחסם אטומית בשרת (שגיאה 403). הלקוח מבצע Rollback ומציג הודעה: "ההרשמה חסומה. כיתת המחקר הגיעה לתפוסה מלאה של 12 לומדים."

### ו. תלויות במודולים אחרים
מודולים 1, 4, 19, 27.

### ז. בדיקה קוגניטיבית
- **תרחיש:** ניסיון הוספת תלמיד 13 לכיתת "המבקרים".
- **תוצאה:** השרת חוסם את הכתיבה (403), האשף מנקה את השדה ומציג חיווי שהכיתה בתפוסה מלאה של 12 לומדים.

### ח. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Implement a step-by-step setup wizard for class initialization matching the classes collection schema in Module 4. Non-nullable fields: `school_id`, `class_name` (set strictly to "המבקרים"), `class_type`. Apply strict validation rules to block creating pilot classes exceeding 12 active students. Ensure student registrations generate strictly numeric anonymous IDs from 1 to 12 with zero personally identifiable variables.

---

## מודול 26: מודול קטלוג תוכנית הלימודים (Curriculum Catalog & Batch Spec)

### א. הטריגר הפדגוגי
ניהול מבוקר של תכני הלמידה והמשימות בקטלוג, המבטיח מעבר היררכי ומדורג בין שלבי מודל VRA לאורך 8 המפגשים.

### ב. מצב המערכת והפצת ה-Batch
השרת הוא מקור האמת עבור הגדרות התרגילים. הקטלוג מנהל את 7 תרגילי החובה ואת משימות הבחירה (ביסוס מול אתגר).
- **עדכון אסינכרוני מוגן (Firestore Batch Writes):** עדכוני תרגילים המופצים על ידי מנהל המערכת במהלך שיעור פעיל מוחלים בצד התלמיד אך ורק על תרגילים שטרם נפתחו בפועל (Pending or Unstarted Worksheets). תרגיל פעיל שפתרונו החל אינו מופרע.

### ג. אירוע המשתמש
מנהל המערכת מעדכן תבנית תרגיל בקטלוג ומאשר הפצה.

### ד. התוצאה הצפויה
הפצת השינויים ברקע. התלמידים ממשיכים לעבוד בצורה חלקית, והתרגיל המעודכן נטען בצורה שקופה רק בעת מעבר למשימה החדשה, ללא רענון דף.

### ה. חוזה נתונים והתנהגות בזמן כשל
במקרה של כשל בשידור ה-Batch, מתבצע ביטול אטומי (Rollback) בשרת. התלמידים ממשיכים לעבוד עם גרסת המטמון האחרונה ב-Zustand.

### ו. תלויות במודולים אחרים
מודולים 4, 14, 17, 29.

### ז. בדיקה קוגניטיבית
- **נתון:** תלמיד פותר את תרגיל 4 במפגש 6. האדמין מעדכן את תבנית תרגיל 5.
- **תוצאה:** הממשק אינו קופא. עם השלמת תרגיל 4 ומעבר לתרגיל 5, התבנית החדשה נטענת ברוגע מהשרת.

### ח. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Construct a master curriculum catalog console to configure worksheet equations for sessions 1 to 8. Segment task definitions between 7 compulsory problems and optional early completion tracks (Consolidation vs. Challenge). Push curriculum updates asynchronously using Firestore Batch Writes, applying changes exclusively to pending or unstarted worksheets to prevent workspace corruption during live sessions.

---

## מודול 27: מודול מדיניות אבטחה והגבלות גלובליות (Global Firestore Security Rules Spec)

### א. הטריגר הפדגוגי
הגנה הרמטית על שלמות מסד הנתונים והסודיות המחקרית באמצעות אכיפת הרשאות קשיחות בצד השרת בלבד.

### ב. מצב המערכת וחוקי ה-Firestore Rules
כל הגישות למסד הנתונים מוכפפות לחוקי אבטחה אטומיים בצד השרת:

1. **תלמידים (תפקיד Student):**
   - קריאה: מורשים לקרוא אך ורק את מסמך התלמיד האישי שלהם (`/students/{studentId}`). חסומים מקריאת אוספי כיתות או תלמידים אחרים.
   - כתיבה: מורשים לכתוב במסמכי `telemetry_logs` ו-`workspace_states` אך ורק אם מזהה התלמיד במסמך (`student_id`) תואם במדויק את מזהה ה-Auth המאומת שלהם (1–12), והמטען עומד בסכימת `TelemetryDetailsMap` (כולל כלל ה-`column_index` ממודול 5).

2. **מורים (תפקיד Teacher):**
   - קריאה: מורשים לקרוא נתוני טלמטריה ומצבי עבודה של תלמידי הכיתה המשויכת אליהם בלבד (`class_id`).
   - כתיבה: מורשים לעדכן שדות אישור מורה (`teacher_gate_approved`, `gate_approved_at`, `gate_approved_by`) ופרופילי תמיכה (`support_profile_id` וסביבתו). חסומים משינוי הגדרות ניהול גלובליות.

3. **מפתחות וסודות:** מפתחות API פרטיים והגדרות AI שמורים ב-Google Cloud Secret Manager בלבד ואינם נחשפים ללקוח.

### ג. אירוע המשתמש
ניסיון גישה או כתיבה למסד הנתונים.

### ד. התוצאה הצפויה
אישור אטומי אם הבקשה תואמת במדויק את הכללים, או דחייה קשיחה HTTP 403 (Permission Denied) ללא חשיפת פרטי מערכת.

### ה. חוזה נתונים והתנהגות בזמן כשל
במקרה של דחיית אבטחה, הלקוח מזהה את שגיאת ה-403, מבצע Rollback למצב הבטוח האחרון ב-Zustand, ומציג חיווי שקט.

### ו. תלויות במודולים אחרים
כל מודולי המערכת (1–29).

### ז. בדיקה קוגניטיבית
- **תרחיש:** לקוח תלמיד 2 מנסה לעדכן את מסמך תלמיד 5.
- **תוצאה:** השרת דוחה את הבקשה מיד ב-403 Forbidden.

### ח. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Enforce bulletproof Firestore Security Rules code patterns. Block student role auth tokens from writing or reading `classes` and `students` collections, restricting their read access solely to their own student document. Allow student write permissions to `telemetry_logs` strictly if the incoming log's `student_id` matches the authenticated token ID (1-12) and the payload matches the per-event-type schema in `TelemetryDetailsMap`. Deny client access to server configs and private API keys, securing them inside Google Cloud Secret Manager.

---

## מודול 28: מודול תמיכה ותקשורת ניהולית (Admin Support Hub Spec)

### א. הטריגר הפדגוגי
ניהול ותיעוד פניות תמיכה מקצועיות בצורה מאובטחת, המבטיחה הגנה קשיחה על פרטיות הלומדים ומניעה מוחלטת של זליגת מידע אישי.

### ב. מצב המערכת ולוח הניהול
מרכז הפניות מציג למנהל המערכת הודעות נכנסות מערוצי השיח של המורים (מודול 22).
- **אנונימיזציה בשכבת התצוגה:** המערכת מציגה פניות בטבלה נקייה הממוינת לפי `school_id` ו-`class_name`. כל הודעה המוצגת באדמין עוברת סינון ומציגה מזהים אנונימיים 1–12 בלבד.
- **עדכון בזמן אמת:** הממשק מפעיל Snapshot Listener ל-Firestore ומציג מחוון התראות שקט ועדין (Silent Badge Indicator) בסרגל הניווט העליון, ללא רעש חזותי או רענון דף.

### ג. אירוע המשתמש
מורה שלחה הודעת התייעצות בערוץ השיח.

### ד. התוצאה הצפויה
הודעה חדשה מופיעה בטבלת התמיכה של האדמין כרונולוגית, עם מחוון עדין בסרגל הניהול, כשהיא נקייה מ-PII.

### ה. חוזה נתונים והתנהגות בזמן כשל
במקרה של ניתוק רשת באדמין, המערכת מציגה את הפניות האחרונות שנשמרו במטמון ומחדשת את המאזין עם חידוש החיבור.

### ו. תלויות במודולים אחרים
מודולים 4, 22, 24, 27.

### ז. בדיקה קוגניטיבית
- **תרחיש:** פניית תמיכה מגיעה מהמורה בכיתת "המבקרים".
- **תוצאה:** האדמין רואה פנייה המשויכת ל"בית ספר ביקורת — המבקרים" עם התייחסות ל"תלמיד 8", ללא שמות פרטיים.

### ח. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Architect admin support ticketing dashboard to display incoming streams from teacher chat modules. Enforce complete anonymity at visualization layer, ensuring zero PII or pupil names are displayed. Filter and sanitize ticket contents via Cloud Functions, displaying strictly anonymous student IDs (1-12) linked to `school_id` and `class_name`. Integrate Firestore Snapshot listeners rendering a silent badge alert indicator in the global menu without full page reloads.

---

## מודול 29: מודול ניהול מצב גלובלי ומכונות מצבים (Zustand & State Machine Spec)

### א. הטריגר הפדגוגי
הבטחת עקביות ממשק וסנכרון מלא של נתוני הלמידה בכל המודולים של מודל הייצוג הדיגיטלי (VRA), תוך מניעת תסכול או הצפה חושית כתוצאה משגיאות סנכרון ממשק.

### ב. מפרט חנויות Zustand ומכונת המצבים הדקלרטיבית
ניהול המצב המקומי מופרד ל-3 חנויות Zustand בלתי תלויות:
1. **`useWorkspaceStore`:** מנהל את מצב מרחב העבודה, הבלוקים, הטורים והמקלדת.
2. **`useTeacherStore`:** מנהל את מצבי הרדאר, המקרן והאישורים בדשבורד המורה.
3. **`useAuthStore`:** מנהל את אסימון ההזדהות, הדרכון האנונימי והתפקיד הפעיל.

**מכונת המצבים של מרחב העבודה (VRA Workspace State Machine):**
- `IDLE`: הסביבה מוכנה, משימה טרם נטענה.
- `PROBLEM_ACTIVE`: תרגיל נטען, קנבס ומקלדת פעילים.
- `REGROUPING_ACTIVE`: אירוע המרה פעיל (צירוף עשר / פריטה). המקלדת ננעלת עד לאישור המרה מוצלח.
- `SOCRATIC_ACTIVE`: טריגר היסוס (45 שנ') או מחיקות (4) הופעלו. מגירת החניכה נפתחת. תשובה שגויה נועלת לחצנים ל-60 שניות.
- `COMPLETE`: התרגיל פותר בהצלחה, מעבר לתרגיל הבא או לשער האישור.

### ג. מעבר מצבים וסנכרון אופליין
כל מעבר מצב ב-Zustand מייצר אירוע לוגי הנכתב אטומית לתור ה-IndexedDB (מודול 17). ברשת פעילה, הסנכרון ל-Firestore מתבצע ברקע לפי סדר FIFO קשוח.

### ד. הנחיות פיתוח נוקשות (Strict Developer Instructions)
Implement global state management using decoupled Zustand stores for workspace, teacher, and auth states. Define a declarative state machine representing student VRA environment transitions (`IDLE`, `PROBLEM_ACTIVE`, `REGROUPING_ACTIVE`, `SOCRATIC_ACTIVE`, `COMPLETE`) — these five values are canonical and must match `VRAWorkspaceState` in Appendix A exactly. Bind Zustand state changes to a local synchronization engine that buffers all actions to IndexedDB during offline sessions. Dispatch buffered actions asynchronously in chronological sequence using a strict FIFO queue upon reconnection to avoid race conditions and maintain database consistency.

---

## נספח א': חוזה טיפוסים מרכזי (Core TypeScript Interfaces & Data Contracts)

להלן הגדרות ה-TypeScript הרשמיות והמחייבות לכל רכיבי המערכת. חל איסור על שימוש בשמות שדות שונים בקוד. **זהו מקור האמת היחיד** במקרה של אי-התאמה בין נספח זה לבין ניסוח פרוזה בגוף המודולים — ראו גם רשימת התיקונים בראש המסמך.

### 1. Auth & User Identity Schemas

```typescript
export type UserRole = 'STUDENT' | 'TEACHER' | 'ADMIN';

export interface AnonymousStudent {
  student_id: number; // Strictly 1 to 12
  class_id: string;
  school_id: string;
  created_at: number; // Client/Server timestamp
  support_profile_id: string | null;
  support_profile_version: number;
  support_profile_updated_at: number | null; // v6.1: added — required by Module 19, missing from v6.0 appendix
  support_profile_updated_by: string | null; // v6.1: added — teacher_id; required by Module 19
  active_session_id: string | null;
  // v6.1: `teacher_approval_status` removed — orphaned duplicate of
  // SessionDocument.teacher_gate_approved, never read/written by any module.
}
```

### 2. Firestore Document Schemas

```typescript
export interface ClassDocument {
  class_id: string;
  school_id: string;
  class_name: 'המבקרים'; // Strictly set for pilot
  class_type: string;
  active_session_id: string | null;
  projector_mode: boolean;
  projector_mode_updated_at: number;
  updated_by_teacher_id: string | null;
}

export interface SessionDocument {
  session_id: string;
  class_id: string;
  session_number: number; // 1 to 8
  session_start_time: number;
  session_deadline_time: number;
  active_exercise_id: string;
  is_completed: boolean;
  session_score_percent: number | null; // v6.1: field added. v6.2: formula decided — see Module 23 §B:
                                          // (compulsory exercises correct on first attempt ÷ 7) × 100
  teacher_gate_approved: boolean;
  gate_approved_at: number | null;
  gate_approved_by: string | null;
  teacher_selected_path: 'green_path' | 'remediation_path' | null; // teacher's actual choice — may override the recommendation
  matrix_recommended_path: 'green_path' | 'remediation_path' | null; // v6.3: default rule — 'green_path' if session_score_percent >= 50, else 'remediation_path'.
                                                                       // Computed in a dedicated onSessionComplete trigger, NOT inside generatePedagogicalReportPDF (Module 20 §B / Module 23 §B).
                                                                       // Proposed default, pending product confirmation.
}
```

### 3. Telemetry & Offline Queue Schemas

```typescript
export type TelemetryEventType =
  | 'SESSION_START'
  | 'PROBLEM_LOAD'
  | 'BLOCK_DRAG_COMPLETE'
  | 'REGROUPING_TRIGGERED'
  | 'REGROUPING_SUCCESS'
  | 'DIGIT_ENTERED'
  | 'DIGIT_DELETED'
  | 'UNDO_EXECUTED'
  | 'HESITATION_DETECTED'
  | 'SOCRATIC_CARD_SHOWN'
  | 'SOCRATIC_OPTION_SELECTED'
  | 'PROBLEM_COMPLETE'
  | 'REFLECTION_SUBMITTED';

// --- v6.1: per-event-type details schemas (replaces the open Record<string, unknown> from v6.0) ---

export interface SessionStartDetails {
  session_number: number; // 1 to 8
}

export interface ProblemLoadDetails {
  exercise_template_id: string;
  path_type: 'compulsory' | 'consolidation' | 'challenge';
}

export interface BlockDragCompleteDetails {
  block_value: number; // 1, 10, or 100
  source_column_index: number | null; // populated only for cross-column drags (regrouping)
}

export interface RegroupingTriggeredDetails {
  regrouping_type: 'decomposition' | 'composition';
}

export interface RegroupingSuccessDetails {
  regrouping_type: 'decomposition' | 'composition';
  duration_ms: number;
}

export interface DigitEnteredDetails {
  digit_value: number; // 0-9
  is_correct: boolean; // required — sole source for computing E in the Persistence Index (Module 16)
}

export interface DigitDeletedDetails {
  deleted_digit_value: number | null;
}

export interface UndoExecutedDetails {
  undo_stack_depth_before: number; // 1-10
  reverted_event_type: TelemetryEventType;
}

export interface HesitationDetectedDetails {
  hesitation_seconds: number; // >= 45
}

export interface SocraticCardShownDetails {
  trigger_reason: 'hesitation_45s' | 'consecutive_errors_4';
}

export interface SocraticOptionSelectedDetails {
  option_id: 'opt_1' | 'opt_2' | 'opt_3';
  is_correct: boolean; // sole source for computing G in the Persistence Index (Module 16)
}

export interface ProblemCompleteDetails {
  total_duration_ms: number;
  undo_count: number;
  error_count: number;
}

export interface ReflectionSubmittedDetails {
  reflection_step: 1 | 2 | 3;
  effort_score: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  selected_strategies: Array<'UNDO_BUTTON' | 'MEMORY_CIRCLES' | 'SOCRATIC_CARD'> | null;
  persistence_index: number | null; // 0-100
}

export interface TelemetryDetailsMap {
  SESSION_START: SessionStartDetails;
  PROBLEM_LOAD: ProblemLoadDetails;
  BLOCK_DRAG_COMPLETE: BlockDragCompleteDetails;
  REGROUPING_TRIGGERED: RegroupingTriggeredDetails;
  REGROUPING_SUCCESS: RegroupingSuccessDetails;
  DIGIT_ENTERED: DigitEnteredDetails;
  DIGIT_DELETED: DigitDeletedDetails;
  UNDO_EXECUTED: UndoExecutedDetails;
  HESITATION_DETECTED: HesitationDetectedDetails;
  SOCRATIC_CARD_SHOWN: SocraticCardShownDetails;
  SOCRATIC_OPTION_SELECTED: SocraticOptionSelectedDetails;
  PROBLEM_COMPLETE: ProblemCompleteDetails;
  REFLECTION_SUBMITTED: ReflectionSubmittedDetails;
}

export interface TelemetryPayload<T extends TelemetryEventType = TelemetryEventType> {
  idempotency_key: string;
  client_timestamp: number;
  session_id: string;
  student_id: number; // Strictly 1-12
  exercise_id: string;
  event_type: T;
  column_index?: number; // 0: Ones, 1: Tens, 2: Hundreds — required for column-scoped events, omitted otherwise (see Module 5 §C)
  details: TelemetryDetailsMap[T];
}

export interface OfflineQueueItem {
  idempotency_key: string; // Unique UUID
  client_timestamp: number;
  session_id: string;
  student_id: number;
  exercise_id: string;
  operation_type: TelemetryEventType;
  payload: TelemetryDetailsMap[TelemetryEventType]; // v6.1: typed — was Record<string, unknown> in v6.0
  retry_count: number;
}
```

### 4. SRL Reflection Board Schemas

```typescript
export interface SRLReflectionState {
  session_id: string;
  student_id: number;
  reflection_step: 1 | 2 | 3;
  effort_score: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  selected_strategies: Array<'UNDO_BUTTON' | 'MEMORY_CIRCLES' | 'SOCRATIC_CARD'>;
  persistence_index: number; // Calculated value 0-100
  reflection_completed: boolean;
  reflection_updated_at: number;
  idempotency_key: string;
}
```

### 5. VRA Workspace State Machine Types

```typescript
export type VRAWorkspaceState =
  | 'IDLE'
  | 'PROBLEM_ACTIVE'
  | 'REGROUPING_ACTIVE'
  | 'SOCRATIC_ACTIVE'
  | 'COMPLETE';

export interface VRAWorkspaceStore {
  currentState: VRAWorkspaceState;
  activeColumnIndex: number; // 0: Ones, 1: Tens, 2: Hundreds
  onesCount: number;
  tensCount: number;
  hundredsCount: number;
  memoryCircles: Record<number, number>;
  undoStack: Array<Record<string, unknown>>; // Restricted to max 10
  hesitationTimerSeconds: number;
  consecutiveErrorCount: number;
  isSocraticCardLocked: boolean;
  socraticLockDeadline: number | null;
  // Action Handlers
  transitionTo: (newState: VRAWorkspaceState) => void;
  resetHesitationTimer: () => void;
  pushUndoSnapshot: (snapshot: Record<string, unknown>) => void;
  popUndoSnapshot: () => Record<string, unknown> | null;
}
```

### 6. Gemini Socratic Contract (ref. Module 13)

```typescript
export interface GeminiSocraticRequest {
  student_id: number; // Strictly 1-12 — v6.1: renamed from anonymous_student_id for consistency
  session_id: string;
  exercise_id: string;
  active_column_index: number;
  workspace_state: {
    ones_count: number;
    tens_count: number;
    hundreds_count: number;
    memory_circles: Record<string, number>;
  };
  recent_actions: TelemetryPayload<TelemetryEventType>[];
}

export interface GeminiSocraticResponse {
  guiding_question: string;
  options: [
    { id: 'opt_1'; option_text: string; feedback_text: string; is_correct: boolean },
    { id: 'opt_2'; option_text: string; feedback_text: string; is_correct: boolean },
    { id: 'opt_3'; option_text: string; feedback_text: string; is_correct: boolean }
  ];
}
```
