גרסה 7.0 | עודכן 26 באוגוסט 2026, 21:35

# **תוכן עניינים**

מודול 1: מודול כניסה והזדהות *(Student & Teacher Login Pipelines)*

מודול 2: מודול מיתוג תפקידים *(Role Switching & Route Guards)*

מודול 3: מודול אבטחה ואנונימיזציה *(PII Filter & Server-Side Validation)*

מודול 4: סכמת בסיסי הנתונים והארכיטקטורה ההיברידית *(Database Architecture & Schemas Spec)*

מודול 5: סכמת נתוני מיקרו פעילות *(Telemetry Payload Schema Spec)*

מודול 6: מודול לובי התלמיד *(Student Hub Spec)*

מודול 7: מודול לוח בית המספרים הדיגיטלי *(Place Value Chart Engine Spec)*

מודול 8: מודול לבני דינס וירטואליות *(Dienes Blocks Engine & Canvas Spec)*

מודול 9: מודול מקלדת דינמית וגשר VRA‏ *(Dynamic Keyboard & VRA Bridge Spec)*

מודול 10: מודול לוח חיבור אדפטיבי מבוקר *(Symmetrical Addition Grid Module Spec)*

מודול 11: מודול כפתור ביטול פעולה פדגוגי *(Undo Action Engine Module Spec)*

מודול 12: מנגנון בלימת ניחושים וחיכוך פדגוגי *(Socratic Mentoring Trigger Spec)*

מודול 13: ממשק החונך הדיגיטלי ומנוע החניכה *(Socratic AI Engine & Gemini API Contract)*

מודול 14: מודול מפגשים 1 עד 8 ומנוע תרגילים *(Session & Worksheet Progression Spec)*

מודול 15: מודול ארגז חול דיגיטלי מונחה ומצב מקרן *(Sandbox & Projector Mode Spec)*

מודול 16: מודול לוח רפלקציה תלת־שלבי *(SRL Reflection Board Spec)*

מודול 17: מודול עבודה במצב לא מקוון ותור סנכרון *(Offline Queue & Sync Engine Spec)*

מודול 18: מודול רדאר פדגוגי שקט *(Silent Radar Matrix Spec)*

מודול 19: מודול הקצאת התאמות פדגוגיות שקטות *(Silent Adaptation Assignment Spec)*

מודול 20: מודול שער אישור מורה קשיח *(Teacher Approval Gate Spec)*

מודול 21: מודול ממשק מסך מפוצל לאבחון מורה *(Teacher Diagnostic Split-Screen Spec)*

מודול 22: מודול ערוץ שיח ניהולי למורה *(Teacher Admin Chat Engine Spec)*

מודול 23: מודול דוחות ואנליטיקה פדגוגית *(Pedagogical Analytics & PDF Generator Spec)*

מודול 23א: מודול איפוס נתונים, גיבוי ותיעוד *(Data Reset, Backup & Audit Trail Spec)*

מודול 24: מודול סקירת מערכת כוללת *(Admin Overview & Caching Spec)*

מודול 25: מודול ניהול בתי ספר, כיתות ומורים *(Schools & Teachers Setup Wizard Spec)*

מודול 26: מודול קטלוג תוכנית הלימודים *(Curriculum Catalog & Batch Spec)*

מודול 27: מודול מדיניות אבטחה והגבלות גלובליות *(Global Firestore Security Rules Spec)*

מודול 28: מודול תמיכה ותקשורת ניהולית *(Admin Support Hub Spec)*

מודול 29: מודול ניהול מצב גלובלי ומכונות מצבים *(Zustand & State Machine Spec)*

**נספח א': חוזה טיפוסים מרכזי** *(Core TypeScript Interfaces & Data Contracts)*

# **מודול 1: מודול כניסה והזדהות** *(Student & Teacher Login Pipelines)*

## **א. נתיב התלמידים (Student Login Pipeline)**

**הטריגר הפדגוגי:** תחילת פעילות חקירה במתמטיקה ללא חסמים רגשיים, תוך שמירה על אנונימיות מלאה למניעת תיוג חברתי וחרדת ביצוע.

**מצב המערכת:** המערכת מנהלת מצב שלם (Atomic) \- כל עדכון מתבצע במלואו או לא מתבצע כלל, ללא מצב ביניים. עדכון המצב הגלובלי isStudentAuthenticated מתבצע אך ורק לאחר תהליך אימות הדדי מוצלח מול השרת (Handshake). במקרה של שגיאת תקשורת, המערכת מבצעת חזרה מיידית למצב ההתחלתי (Rollback).

**אירוע המשתמש:** בחירת בית ספר, כיתה, מזהה תלמיד אנונימי (1–12), והקלדת קוד גישה פיזי.

**התוצאה הצפויה:** אימות נתונים שלם. יעד ביצועים: P95 ≤ 200ms בתנאי בדיקה מוגדרים. במקרה של פקיעת זמן, המערכת מאפסת את השדות למניעת מצב ביניים תקוע (State Limbo), תוך מתן משוב פדגוגי מינימלי.

## **ב. מצבי שגיאה בהזדהות התלמידים (Student Auth Error States)**

**הטריגר הפדגוגי:** מניעת חרדת כשל קוגניטיבית וויסות תחושתי לתלמידי חינוך מיוחד.

**מצב המערכת:** מנגנון כשל בטוח (Fail-Safe): במקרה של שגיאת מערכת בלתי צפויה, המצב מתאפס לערך התקין האחרון הידוע. אין הצגת חלונות דו-שיח חוסמים (Modal Dialogs).

**אירוע המשתמש:** הזנת קוד שגוי, או ניסיון כניסה בעת תקלת רשת.

**התוצאה הצפויה:** רטט ויזואלי של 300ms וניקוי שדות. במקרה של תקלה חמורה, הממשק מחזיר את התלמיד למצב עבודה שקט ולא מציג הודעת שגיאה.

## **ג. נתיב המורים (Teacher Login Pipeline)**

**הטריגר הפדגוגי:** כניסה מאובטחת למערכת הבקרה לצורך מעקב פדגוגי שקט.

**מצב המערכת:** אימות אסינכרוני מול מערכת ההזדהות. המערכת פועלת במצב נעילה-כברירת-מחדל (Fail-Closed) וחוסמת גישה מוחלטת להרשאות, ללא חשיפת סיבת השגיאה או מידע טכני.

**אירוע המשתמש:** לחיצה על לחצן הזדהות Google SSO.

**התוצאה הצפויה:** ניתוב לדשבורד אך ורק למורשים. כל כשל אימות מוביל חזרה לדף הבית באופן שקט עבור המשתמש הלא מורשה.

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Enforce atomic state updates. If the server request times out or fails during authentication, trigger an immediate rollback to the idle state. No partial states or loading spinners permitted. Ensure the auth token is saved securely and the global authentication state is only updated upon successful handshake. Performance Target: P95 ≤ 200ms. Enforce a fail-closed policy for teacher authorization.*

# **מודול 2: מודול מיתוג תפקידים** *(Role Switching & Route Guards)*

## **א. הגנת ניתוב ישיר (Direct Route Guarding Spec)**

**הטריגר הפדגוגי:** הגנה על פרטיות הלומדים ומניעת עומס.

**מצב המערכת:** יישום עקרון מקור אמת יחיד (Single Source of Truth) באמצעות מנהל המצב Zustand, המגובה באימות סמכותי מהשרת. אם מצב המשתמש אינו תקין, הניתוב נחסם והמערכת מובילה ללובי.

**אירוע המשתמש:** ניסיון גישה לנתיב מוגן.

**התוצאה הצפויה:** חסימה וניתוב אוטומטי ללובי. יעד ביצועים לניתוב מקומי: ≤50ms.

## **ב. בחירת תפקיד כפול (Dual Role Selection Spec)**

**הטריגר הפדגוגי:** תמיכה במורים ומנהלים בעלי הרשאות כפולות.

**מצב המערכת:** בעת שינוי תפקיד, המערכת מבצעת איפוס מלא להקשר הסשן המקומי (Session Context) למניעת זליגת נתונים, תוך שמירה על נתוני שרת קבועים (Persistent Server Data) במידת הצורך.

**אירוע המשתמש:** בחירת תפקיד מתוך מסך בחירה.

**התוצאה הצפויה:** עדכון משתנה המצב וניקוי כל הקשר המידע הישן של הסשן הקודם.

## **ג. פקיעת תוקף אסמכתת ההזדהות והתנתקות שקטה (Token Expiration)**

**הטריגר הפדגוגי:** אבטחת מידע מחקרי.

**מצב המערכת:** התנתקות שקטה (Silent Logout). מחיקת אסמכתת ההזדהות, איפוס Zustand ואיפוס ה-IndexedDB עבור הסשן הנוכחי.

**אירוע המשתמש:** פקיעת תוקף אסמכתת הגישה.

**התוצאה הצפויה:** ניקוי מלא של הזיכרון המקומי וניתוב הביתה.

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Implement Route Guards using a Single Source of Truth via Zustand backed by Firebase Auth state. If a route check fails or user state is inconsistent, force a redirect to the student lobby immediately. Upon role switching, perform a hard wipe of all local session context and Zustand state buffers to prevent privilege escalation. Execute silent logout upon JWT expiration, clearing all caches and IndexedDB.*

# **מודול 3: מודול אבטחה ואנונימיזציה** *(PII Filter & Server-Side Validation)*

## **א. פילטר אנונימיזציה בזמן אמת**

**הטריגר הפדגוגי:** שמירה הרמטית על פרטיות הלומדים ומניעת זליגת מידע.

**מצב המערכת:** עיקרון חסימת שידור בעת כשל, וסביבת למידה בטוחה בעת כשל (Fail-Closed Transmission, Fail-Safe Learning Environment). אם מנגנון זיהוי הנתונים המזהים (PII) חווה תקלה, המערכת עוצרת את השידור (Transmission) אך שומרת על יציבות סביבת הלמידה.

**אירוע המשתמש:** הקלדת טקסט בתיבות קלט או שיח.

**התוצאה הצפויה:** חסימת שליחה במקרה של זיהוי נתונים מזהים (PII). במקרה של תקלה ברכיב הסינון, המערכת נועלת את הקלט ליתר ביטחון עד להתאוששות הלוגיקה.

## **ב. אימות קשיח בצד השרת (Server-Side)**

**הטריגר הפדגוגי:** שלמות מסד הנתונים והגנה על מערך המחקר.

**מצב המערכת:** חוקי האבטחה פועלים כחומת אש (Firewall) בלתי ניתנת לפיצול. כל בקשת כתיבה או עדכון נבדקת במלואה מול הסכמה ב-Firestore Rules.

**אירוע המשתמש:** בקשת כתיבה לשרת.

**התוצאה הצפויה:** אישור או דחייה מלאה (403). אין אישור חלקי.

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Implement a fail-closed PII filter for transmission: if the PII detection logic encounters a runtime error, disable all input and transmission components immediately to guarantee zero PII leakage. Enforce atomic validation in Firestore Security Rules. Any payload field variance results in a hard deny (403).*

# **מודול 4: סכמת בסיסי הנתונים והארכיטקטורה ההיברידית** *(Database Architecture & Schemas Spec)*

## **א. מבנה האוספים וארכיטקטורת שני בסיסי הנתונים**

**הטריגר הפדגוגי:** הגדרת תשתית נתונים אנונימית הרמטית המונעת זיהוי של הלומדים, שומרת על פרטיותם ומבטיחה ביצועי זמן אמת ללא השהיות.

**מצב המערכת:** המערכת פועלת בארכיטקטורה היברידית (Hybrid Architecture) ייעודית המשלבת שני בסיסי נתונים של Firebase, לצד קבועי קוד קשיחים:

* **Firebase Realtime Database (RTDB)**, שכבת זמן-אמת וסנכרון פעילות שוטפת: users/students/{studentId} (סנכרון מצב מרחב העבודה ו-Presence של התלמיד בזמן אמת: lastAction, activeBranch, isOnline, lastPing, תרגיל נוכחי), chat\_messages/{roomId} (תקשורת צ'אט מהירה בזמן אמת בין תלמיד למורה), active\_class\_session (שידור מצב סשן פעיל ומצב מקרן כיתתי: projector\_mode).

* **Cloud Firestore**, שכבת מסמכים קנוניים, הרשאות ואופליין: sessions (מסמכי מפגש קבועים ושער אישור מורה), authorizedTeachers (אימות והרשאות מורים ומנהלים, Google SSO Whitelist), telemetry\_logs (שמירת מטעני טלמטריה מוקלדים המסונכרנים מתור האופליין), system\_control (ניהול הגדרות וכיול רדאר פדגוגי), support\_tickets (ניהול פניות תמיכה אנונימיות), messages (ארכיון הודעות שיח מורה-הנהלה, Zero PII).

* **קבועי קוד קשיחים (In-Code Constants)**, ללא תלות ב-Firestore: קטלוג תוכנית הלימודים (SESSIONS\_CURRICULUM\_CATALOG) מוגדר כקבוע קוד קשיח בצד הלקוח (Client-Side), אינו collection במסד הנתונים, ומבטיח טעינה מיידית של משימות 1–8 ועמידות מלאה באופליין.

## **ב. מדיניות סנכרון וביצועים (Real-Time Synchronization & Performance Spec)**

**הטריגר הפדגוגי:** מניעת תסכול קוגניטיבי ושמירה על רציפות הלמידה באמצעות עדכונים מהירים ורכים.

**מצב המערכת:** האינטראקציה בזמן אמת מבוססת-לקוח-תחילה ומונעת-אירועים (Local-First, Event-Driven). הממשק מגיב מיידית בצד הלקוח (יעד תגובה מצב מקומי ≤50ms); שרתי ה-RTDB וה-Firestore מקבלים רק אירועים לוגיים שנבחרו לפי חוזה Telemetry (יעד ביצועים P95 ≤ 150ms).

**אירוע המשתמש:** פעולה לוגית בממשק.

**התוצאה הצפויה:** סנכרון נתונים אסינכרוני, מבוסס אירועים בלבד. אין לשדר תנועות עכבר, גרירות רציפות או שינויי פיקסלים.

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Define hybrid Firebase architecture with absolute rigidity. Use Realtime Database for live student workspace telemetry, presence heartbeat, real-time chat, and active class projector broadcasting (active\_class\_session). Use Cloud Firestore for canonical session documents (sessions), teacher gate approvals, authorized teacher whitelists (authorizedTeachers), offline queue persistence (telemetry\_logs), system calibration (system\_control), support tickets (support\_tickets), and admin messages (messages). Maintain master curriculum definitions as hardcoded client-side constants (SESSIONS\_CURRICULUM\_CATALOG) to guarantee zero-latency offline availability.*

*Classes collection in Firestore must contain strictly: school\_id, class\_name, class\_type, active\_session\_id, projector\_mode, projector\_mode\_updated\_at, updated\_by\_teacher\_id.*

*Students collection must contain strictly: student\_id (1-12), class\_id, school\_id, created\_at, support\_profile\_id, support\_profile\_version, support\_profile\_updated\_at, support\_profile\_updated\_by, active\_session\_id.*

*Restrict write operations strictly via Firebase Security Rules (Firestore Rules and RTDB Rules). Latency target P95 ≤ 150ms.*

# **מודול 5: סכמת נתוני מיקרו פעילות** *(Telemetry Payload Schema Spec)*

## **א. עקרון מרכזי**

הטלמטריה (Telemetry) מבוססת-אירועים ואינה רציפה. חל איסור מוחלט על שידור זרמים (Streams) רציפים של קואורדינטות עכבר או גרירה. איסור זה חל על ערוץ הטלמטריה בלבד. ערוץ הקלטת השחזור (מודול 21\) הוא ערוץ נפרד ובלתי תלוי, בעל נתיב אחסון משלו, ואינו כפוף לאיסור זה.

## **ב. מבנה נתונים ודרישות שליחה**

כל אירוע ממשק לוגי (למשל REGROUPING\_SUCCESS, BLOCK\_DRAG\_COMPLETE, DIGIT\_ENTERED) מקודד לאובייקט JSON בודד, במבנה מוגדר מראש לפי סוג האירוע הספציפי. גודל מטען מרבי לבקשה: ≤50KB. שימוש בתור מקומי (Queue) ב-IndexedDB במקרה של אופליין.

## **ג. עיקרון הקלדה לפי סוג אירוע**

לכל אחד מ-13 סוגי האירועים יש טיפוס פרטים ייעודי (Details Interface), וקיים TelemetryDetailsMap שמקשר event\_type לטיפוס ה-details המתאים (ראו נספח א', סעיף 3, למקור האמת המלא).

**כלל חובה נוסף:** שדה column\_index ברמת ה-payload (לא בתוך details) הוא **חובה** עבור אירועים מוגבלי-טור: BLOCK\_DRAG\_COMPLETE, REGROUPING\_TRIGGERED, REGROUPING\_SUCCESS, DIGIT\_ENTERED, DIGIT\_DELETED, HESITATION\_DETECTED, SOCRATIC\_CARD\_SHOWN. השדה **מושמט** עבור אירועי סשן, תרגיל ורפלקציה: SESSION\_START, PROBLEM\_LOAD, UNDO\_EXECUTED (למעט כאשר הפעולה שבוטלה הייתה מוגבלת לטור ספציפי), SOCRATIC\_OPTION\_SELECTED, PROBLEM\_COMPLETE, REFLECTION\_SUBMITTED. כלל זה נאכף ב-Firestore Security Rules (מודול 27\) לצד בדיקת סכמת ה-details.

## **ד. טיפוסי TS רשמיים לאירועי טלמטריה**

ראו נספח א', סעיף 3, למקור האמת המלא והמחייב (TelemetryEventType, TelemetryDetailsMap, TelemetryPayload\<T\>).

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Construct the exact JSON payload format for every client workspace action event matching TelemetryPayload\<T\> and the corresponding entry in TelemetryDetailsMap (Appendix A §3). Never fall back to a generic object shape for details; every one of the 13 event types has its own required field set now. Validate payload size (≤50KB) before every update. Enforce event-based logging only. Include client timestamps and unique idempotency keys. Enforce column\_index presence/absence per the rule in §C above via server-side Security Rules validation, not client-side trust alone. The no-continuous-streams rule governs the telemetry channel exclusively. The Module 21 recording channel is a separate pipeline with its own storage path and is explicitly exempt.*

# **מודול 6: מודול לובי התלמיד** *(Student Hub Spec)*

## **א. ניהול מפגשים**

המערכת שולפת את המפגש הפעיל בטעינה ראשונית. מאזין תמונת-מצב ממוקד (Snapshot Listener) למסמך המפגש הפעיל בלבד (ללא קריאות גלובליות יקרות).

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Render a clean dashboard displaying only the current active session object fetched from the student state database. Use targeted listeners to minimize read costs. Keep local Zustand state updated with the latest session ID fetched from the authoritative server state. When no session is active for the class, render the quiet waiting screen defined in Module 14 §ב0 instead of the session card. Never render a session list, session picker, or any navigation control in the student lobby; the lobby shows exactly one card reflecting the currently active session or nothing at all.*

# **מודול 7: מודול לוח בית המספרים הדיגיטלי** *(Place Value Chart Engine Spec)*

## **א. ניהול מצב ותצוגה**

Zustand הוא מקור האמת למצב הריצה המקומי בלבד (Local Runtime State), כאשר השרת מקבל עדכוני אירועים תקופתיים. ממשק: עמעום טורים לא פעילים (brightness: 0.6) ונעילת pointer-events בטורים שאינם במוקד החישוב הנוכחי.

כיווני סנכרון בין הקנבס ללוח בית המספרים. כיוון ראשון, פעיל בכל המפגשים שבהם הקנבס מוצג: גרירת לבנה, פריטתה או הקבצתה בקנבס מעדכנת מיידית את הספרה בטור המתאים בלוח בית המספרים. כיוון שני, הקלדה המייצרת לבנים, פעיל אך ורק במפגש 1 בארגז החול: הקלדת ספרה מייצרת אוטומטית את כמות הלבנים התואמת באותו טור בקנבס. במפגשים 3 עד 7 הכיוון השני מנוטרל לחלוטין, שכן הקנבס מחזיק את ייצוג המחוברים או המחוסר בלבד, והקלדה בשורת התוצאה אינה משנה אותו בשום אופן. במפגשים 2 ו-8 שני הכיוונים אינם רלוונטיים שכן הקנבס אינו מוצג. עיגולי הזיכרון ממוקמים בראש כל טור, מקבלים ספרה בודדת בלבד בטווח 0 עד 9, ונותרים פתוחים לקלט תמיד ובכל מצב מכונת המצבים, לרבות REGROUPING\_ACTIVE ו-SOCRATIC\_ACTIVE, ללא תלות בפרופיל התמיכה.

נגישות שמיעתית והקראה קולית (UDL). כל הנחיה המוצגת ללומד על גבי המסך מלווה בכפתור הקראה קולית ייעודי. ההקראה מבוססת על Web Speech API בצד הלקוח, בעברית, ומופעלת אך ורק בלחיצה יזומה של הלומד. חל איסור מוחלט על הקראה אוטומטית. מכיוון שדפדפנים חוסמים שמע עד לאינטראקציה ראשונה, מסך הכניסה מפעיל שחרור הרשאות שמע שקט בעת התחברות הלומד. אין ולא יהיה קלט קולי בשום ממשק. מנגנון ההקראה חל על ממשק הלומד בלבד ואינו קיים בממשק המורה או המנהל. קוד הצבע של אזור התלמיד אחיד ומרגיע לכל אורך הממשק, וכפתור החזרה ללובי ממוקם באופן קבוע בסרגל העליון בכל מסכי הפעילות ואינו זז בין מסכים.

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Implement CSS filter properties for brightness control (brightness(0.6) for inactive columns). Use Zustand for active column state tracking. Ensure active column pointer events are properly isolated. Attach a speech button to every on-screen student instruction using the client-side Web Speech API in Hebrew, triggered strictly by explicit student click. Forbid autoplay narration entirely. Unlock browser audio permissions silently at student login. Enforce zero voice input anywhere in the system. Apply TTS exclusively to the student interface; the teacher and admin interfaces must have no narration. Keep the student-area colour scheme uniform across all activity screens and the return-to-lobby button fixed in the top bar with no positional variation.*

# **מודול 8: מודול לבני דינס וירטואליות** *(Dienes Blocks Engine & Canvas Spec)*

## **א. מנוע הגרירה והחישוב**

* **ניהול מצב:** Zustand הוא מקור האמת למיקום וכמות הבלוקים ברמת ה-UI. IndexedDB משמש לשמירה מקומית (Persistence) בעת ניתוק.

* **פיזיקה ממוחשבת:** 60fps, מנגנון הצמדה מגנטית מבוקר (Magnetic Snap) עם HTML5 Canvas/WebGL.

* **מנגנון Undo:** משחזר Snapshot דטרמיניסטי של מצב ה-VRA. אירועי Undo מוסרים באופן מפורש ממדדי השגיאות והשחיקה בטלמטריה.

* **מנגנוני פריטה והקבצה בממשק:** פריטה של לבנה לערך נמוך יותר מופעלת בשתי דרכים חלופיות ושקולות לחלוטין, ושתיהן חייבות להיות פעילות בכל מפגש שבו הקנבס מוצג. הדרך הראשונה היא לחיצה בודדת על הלבנה, המפרקת אותה מיידית לעשר לבנות בערך הנמוך הסמוך. הדרך השנייה היא גרירת הלבנה אל הטור הסמוך מימין. שתי הדרכים מייצרות את אותו אירוע REGROUPING\_SUCCESS ואת אותה אנימציה. הקבצה של עשר לבנות לערך גבוה יותר מופעלת אך ורק בדרך אחת: כאשר נצברות עשר לבנות או יותר בטור, מוצג בראש הטור כפתור הקבצה ייעודי, ולחיצה עליו ממזגת עשר לבנות ללבנה אחת בטור הסמוך משמאל. גרירה שמאלית לצורך הקבצה נדחית ואינה מנגנון חוקי.

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Use HTML5 Canvas/WebGL for block manipulation running steadily at 60fps. Implement magnetic snap physics for snapping blocks into standard column layouts. Undo actions must be excluded from mistake telemetry tallies. Implement two equivalent decomposition triggers, both active in every session where the canvas renders: (a) single click on a block, which immediately breaks it into ten blocks of the adjacent lower value, and (b) dragging the block into the adjacent column to its right. Both paths must emit the identical REGROUPING\_SUCCESS event and run the identical animation. Implement composition through exactly one path: when a column accumulates ten or more blocks, render a dedicated grouping button at the top of that column; clicking it merges ten blocks into one block in the adjacent column to the left. Reject leftward drag as a grouping mechanism.*

# **מודול 9: מודול מקלדת דינמית וגשר VRA‏** *(Dynamic Keyboard & VRA Bridge Spec)*

## **א. התנהגות המקלדת הדינמית**

* **עקרון:** מנוע הכללים (Rule Engine) של ה-VRA קובע את אירוע ההמרה.

* **הפרדה:** פרופיל תמיכה שהוגדר על ידי המורה (Teacher-Configured Support Profile) \- הגדרה סמכותית בצד השרת \- מול מצב התערבות נוכחי (Current Intervention State) \- מצב ממשק רגעי.

* **חסימת קלט:** עבור לומדים תחת פרופיל תמיכה קוגניטיבי מוגבר בלבד, המקלדת הדינמית ננעלת בטורים הדורשים המרה (פריטה או צירוף עשר), ומשתחררת רק עם השלמת הפעולה הפיזית בקנבס הלבנים.

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Implement conditional column keyboard locking based on VRA engine conversion events. Unlock column keyboard strictly upon conversion success event execution. Gate the keyboard lock strictly on the server-side support\_profile\_id value. Lock columns requiring regrouping only when support\_profile\_id \=== 'enhanced\_cognitive\_support'. For every other learner the dynamic keyboard remains fully open at all times, including during REGROUPING\_ACTIVE. Never apply the lock globally. When the lock is active and the learner attempts input into a locked column, reject the keystroke and emit a brief shake animation on that field; the field must be genuinely non-writable, not merely styled as locked.*

# **מודול 10: מודול לוח חיבור אדפטיבי מבוקר** *(Symmetrical Addition Grid Module Spec)*

## **א. היררכיית תמיכה וזמנים**

תנאי הפעלה קשיח: לוח החיבור האדפטיבי נטען אך ורק עבור לומדים שערך support\_profile\_id שלהם הוא 'enhanced\_cognitive\_support', כפי שהוגדר מראש על ידי המורה. עבור כל יתר הלומדים הלוח אינו נטען, אינו מוצג ואינו קיים בממשק בשום שלב. אין למורה אפשרות לפתוח את הלוח באופן ידני במהלך שיעור פעיל. היררכיית הזמנים שלהלן חלה אך ורק לאחר שתנאי זה התקיים.

1. **חקירה עצמאית (Independent Exploration):** 0–30 שניות.

2. **רשת תמיכה אדפטיבית (Adaptive Grid):** 30 שניות ומעלה \- הצגת רשת תמיכה.

3. **התערבות סוקרטית (Socratic Intervention):** 45 שניות ומעלה \- הפעלת טריגר חניכה סוקרטית.

## **ב. ניהול טיימר**

הטיימר מתאפס על פעולות קוגניטיביות בלבד (גרירת לבנים, הקלדה, המרה). תנועות עכבר אינן מאפסות את הטיימר.

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Manage grid visibility via local React state decoupled from Firestore write streams. Track cognitive interaction events exclusively to reset the hesitation timer. Load the adaptive addition grid strictly and only when support\_profile\_id \=== 'enhanced\_cognitive\_support'. For every other learner the grid component must not mount, must not render, and must not exist in the DOM at any point. Provide no manual teacher toggle to open it during a live session. Apply the timing hierarchy below only after this profile condition has been satisfied.*

# **מודול 11: מודול כפתור ביטול פעולה פדגוגי** *(Undo Action Engine Module Spec)*

## **א. עקרונות פדגוגיים ותפעוליים**

* **עקרון:** ביטול פעולה (Undo) אינו נחשב אירוע טעות. פעולות ביטול אינן נכללות בספירת הטעויות ואינן גוררות קנס זמן.

* **טכני:** שמירת מחסנית (Stack) מקומית בלקוח המוגבלת ל-10 הפעולות האחרונות. שחזור Snapshot דטרמיניסטי של מצב ה-VRA (קואורדינטות, כמויות, קלט).

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Maintain a client-side state stack restricted strictly to the last 10 actions. Undo actions must never reduce scores or trigger punitive interventions.*

# **מודול 12: מנגנון בלימת ניחושים וחיכוך פדגוגי** *(Socratic Mentoring Trigger Spec)*

## **א. הטריגר הפדגוגי**

זיהוי קושי קוגניטיבי ומניעת ניחושים עיוורים או חוסר אונים נרכש, תוך הכוונה עצמית של התלמיד בחזרה לחקירה ייצוגית בקנבס הלבנים.

## **ב. מצב המערכת ומעטפת החיכוך**

המערכת עוקבת אחר פעולות הלומד ומזהה מצבי קושי על פי שני מדדים בלבד:

1. השהיה רצופה של 45 שניות ללא פעולה קוגניטיבית בטור החישוב הפעיל.

2. ביצוע של 4 ניסיונות הקלדה או מחיקה שגויים ברציפות באותו תרגיל.

3. במפגש 8 בלבד, שבו לבני הדינס אינן מוצגות על המסך, מתווסף תנאי שלישי: ביצוע שלוש פעולות ביטול פעולה רצופות בתרגיל בודד, המהווה אינדיקציה ללולאת ניחושים.

בעת זיהוי קושי, מופעל כרטיס החניכה הצידי (Socratic Card) במגירה נשלפת (Side Drawer). בעת בחירת תשובה שגויה בתוך כרטיס החניכה, המערכת מפעילה נעילה שקטה של לחצני המענה בכרטיס בלבד למשך 30 שניות (pointer-events: none בתוספת אינדיקטור שעון חול עדין). בזמן נעילת כרטיס החניכה, מרחב הלבנים הדיגיטליות, המקלדת, וכפתור ה-Undo נשארים פעילים וחופשיים לחלוטין לחקירה.

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Implement the Socratic card in a dedicated side drawer without using popup dialogs or blocking modals. Trigger Socratic card activation strictly upon: (a) 45 seconds of continuous column hesitation, or (b) 4 consecutive digit deletions/errors in the active column, or (c) in session 8 only, 3 consecutive undo actions within a single exercise. These three conditions correspond exactly to trigger\_reason: 'hesitation\_45s' | 'consecutive\_errors\_4' | 'consecutive\_undos\_3' in SocraticCardShownDetails (Appendix A §3). Condition (c) must never fire in sessions 1 through 7\. In session 2 the Socratic card is disabled entirely and none of the three conditions may fire. Upon incorrect answer selection inside the Socratic card, immediately apply a 30-second pointer-events-disabled block exclusively to the card buttons with a serene hourglass indicator. Ensure Dienes blocks canvas interaction and the undo button remain fully functional and accessible. Send workspace telemetry JSON to initiate backend AI analysis.*

# **מודול 13: ממשק החונך הדיגיטלי ומנוע החניכה** *(Socratic AI Engine & Gemini API Contract)*

## **א. מנוע האבחון והנחיות המערכת**

מנוע הבינה המלאכותית מקבל כקלט את מטען הטלמטריה ומצב מרחב העבודה של התלמיד. המנוע מסווג את הטעות לאחת משלוש קטגוריות:

1. טעויות עובדתיות בחישוב הבסיסי.

2. טעויות מיומנות רכיב (סדר האלגוריתם).

3. טעויות אסטרטגיה (חוסר הבנה מושגית של המבנה העשרוני).

בהתאם לסיווג, המנוע מנסח שאלה מנחה סוקרטית אחת קצרה ושלושה מסיחים מותאמים. חוקי ברזל למנוע ה-AI: חל איסור מוחלט לחשוף את התשובה המספרית הסופית, לפתור עבור התלמיד, או להשתמש במונחי עזרים פיזיים שאינם קיימים בממשק הדיגיטלי. במקרה של כשל תקשורת, המערכת מגישה רמז סטטי מובנה מראש.

שמירת הסיווג האבחוני. הסיווג לאחת משלוש הקטגוריות אינו נתון פנימי חולף אלא תוצר אבחוני מחייב. המנוע נדרש להחזיר את הסיווג בשדה error\_category בתשובת ה-API, והמערכת שומרת אותו כשדה בתוך אירוע הטלמטריה SOCRATIC\_CARD\_SHOWN. חל איסור מוחלט להשליך את הסיווג או להסתפק בשימוש בו לניסוח הכרטיס בלבד. סיווגים אלו מהווים את מקור הנתונים לאות הקוגניטיבי ברדאר הפדגוגי (מודול 18\) ולניתוח הפדגוגי בדוח המסכם (מודול 23).

## **ב. חוזה בקשה ותשובה מול ה-Gemini API (JSON Schema)**

// Request Payload (Outgoing to Cloud Function / Gemini API)  
export interface GeminiSocraticRequest {  
  student\_id: number; // Strictly 1-12  
  session\_id: string;  
  exercise\_id: string;  
  active\_column\_index: number;  
  workspace\_state: {  
    ones\_count: number;  
    tens\_count: number;  
    hundreds\_count: number;  
    memory\_circles: Record\<string, number\>;  
  };  
  recent\_actions: TelemetryPayload\<TelemetryEventType\>\[\];  
}  
   
// Response Payload (Incoming from Gemini API)  
export interface GeminiSocraticResponse {  
  guiding\_question: string;  
  options: \[  
    { id: 'opt\_1'; option\_text: string; feedback\_text: string; is\_correct: boolean },  
    { id: 'opt\_2'; option\_text: string; feedback\_text: string; is\_correct: boolean },  
    { id: 'opt\_3'; option\_text: string; feedback\_text: string; is\_correct: boolean }  
  \];  
}

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Enforce rigid JSON schema validation for the Gemini API exchange matching GeminiSocraticRequest and GeminiSocraticResponse. Use student\_id exclusively; do not reintroduce anonymous\_student\_id as a separate field name anywhere in the implementation. Bind Socratic persona exclusively to digital VRA model representations, strictly forbidding direct answer disclosure or physical CRA terminology. Serve pre-configured static hints instantly upon API timeout or network failure. The AI must return error\_category in every response; treat a response lacking it as malformed and fall back to the static hint. Persist error\_category into the SOCRATIC\_CARD\_SHOWN telemetry event. Never discard the classification after rendering the card — it is the sole data source for the radar cognitive signal (Module 18\) and the report analysis (Module 23).*

# **מודול 14: מודול מפגשים 1 עד 8 ומנוע תרגילים** *(Session & Worksheet Progression Spec)*

## **א. הטריגר הפדגוגי**

מניעת עומס קוגניטיבי ושמירה על החוסן הרגשי של תלמידי כיתה ג' באמצעות הגבלת זמן העבודה העצמאית בהתאם לסוג המפגש. עידוד סוכנות הלמידה באמצעות בחירה אקטיבית בין נתיב ביסוס לנתיב אתגר.

## **ב. מצב המערכת**

השרת הוא מקור האמת היחיד והמוחלט עבור זמן המפגש ומצב התרגיל הפעיל. השרת מנהל: session\_start\_time, session\_deadline\_time, active\_exercise\_id, active\_session\_id, is\_completed.

* מפגש 1: מוגבל ל-20 דקות נטו של חקירה חופשית בארגז החול.

* מפגשים 3–7: מוגבלים ל-15 דקות נטו של עבודה עצמאית.

* מפגשים 2 ו-8: מוגבלים ל-25 דקות נטו של עבודה עצמאית.

חנות Zustand בדפדפן משמשת לתצוגה בלבד ואינה מוסמכת לקבוע או להאריך זמנים. במקרה של רענון או פתיחת מספר כרטיסיות, הדפדפן מסתנכרן מול השרת.

מספר משימות החובה קבוע על שבע בכל אחד מהמפגשים 2 עד 8, לרבות מפגש 2 ומפגש 8\. במפגש 2 שבע משימות החובה הן משימות אבחון הממפות את ארבעת עמודי התווך של המטריקס: המבנה העשרוני והאפס, הקבצה, פריטה, וחישוב במאונך. מפגש 1 הוא ארגז חול חקירתי ואינו כולל משימות חובה ממוספרות, אינו מקבל ציון, ואינו מפעיל את נוסחת session\_score\_percent.

כללי נראות לפי מפגש, קשיחים ומחייבים: במפגש 2 ובמפגש 8 לבני הדינס הווירטואליות אינן נטענות כלל, קנבס הלבנים אינו מוצג על המסך, ומנגנון נעילת המקלדת מנוטרל לחלוטין עבור כלל הלומדים ללא תלות בפרופיל התמיכה. במפגש 2 בלבד מנוטרל בנוסף גם כרטיס החניכה הסוקרטי במלואו ואינו מופעל בשום תנאי, כדי לקבל ראיות הבנה נקיות. במפגש 8 כרטיס החניכה כן פעיל בהתאם לשלושת הטריגרים שבמודול 12\.

## **ב0. פתיחת מפגש על ידי המורה (Session Activation)**

חל איסור מוחלט על מעבר אוטומטי בין מפגשים. לומד לעולם אינו עובר ממפגש אחד למשנהו בכוחות עצמו, גם אם השלים את כל משימות החובה וגם אם חלף זמן היעד. כל אחד משמונת המפגשים נפתח אך ורק בפעולה אקטיבית ומפורשת של המורה מתוך דשבורד המורה, בתחילת השיעור הפיזי. בדשבורד המורה מוצג בורר מפגש המציג את שמונת המפגשים ואת מצב כל אחד מהם. לחיצה על מפגש פותחת חלון אישור, ורק לאחר אישור המורה מעדכן השרת את השדה active\_session\_id במסמך הכיתה (ClassDocument) ואת active\_session\_id בכל מסמכי הלומדים בכיתה. העדכון מתבצע כפעולה שלמה אחת (Atomic) עבור כלל הלומדים במקביל, ואינו מתבצע ללומד בודד. כאשר לא נפתח מפגש פעיל, לומד שנכנס למערכת מגיע ללובי ורואה מסך המתנה שקט הנושא את הטקסט: "היום עוד לא התחלנו. המורה תפתח את הפעילות בקרוב." חל איסור מוחלט על הצגת רשימת מפגשים, כרטיסים או אפשרויות ניווט כלשהן ללומד. הלובי מציג כרטיס דינמי יחיד המשקף את active\_session\_id הפעיל בלבד, בהתאם למודול 6\. שער אישור המורה (מודול 20\) הוא מנגנון נפרד ונוסף החוסם ספציפית את המעבר ממפגש 2 למפגש 3 עד לניתוב הלומדים למסלולים, ואינו מחליף את חובת פתיחת המפגש המתוארת כאן. כדי שמפגש 3 ייפתח נדרשים שני התנאים במצטבר: אישור בשער המורה עבור אותו לומד, ופתיחת מפגש 3 על ידי המורה. מפגש שנפתח נותר פעיל עד שהמורה פותחת מפגש אחר. חזרה למפגש שכבר הושלם אפשרית ומותרת, ואינה מוחקת נתונים קיימים.

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Never auto-advance students between sessions. Session activation is exclusively a teacher action performed from the teacher dashboard, atomically updating active\_session\_id on the ClassDocument and on all student documents in that class simultaneously. When no session is active, render a quiet waiting screen in the student lobby; never expose a session list or navigation controls to students. Module 20's approval gate is an additional constraint on session 3 specifically, not a replacement for teacher activation.*

## **ב1. התנהגות המערכת בהגעה ל-session\_deadline\_time**

הגעה לזמן היעד אינה חוסמת את הלומד בשום אופן. חל איסור מוחלט על נעילת מרחב העבודה, על סגירת התרגיל הפעיל, על ניתוק הלומד או על הצגת הודעה כלשהי במסך הלומד. הלומד ממשיך לעבוד ברצף מלא ללא כל שינוי חזותי, והמערכת ממשיכה לתעד טלמטריה כרגיל. בצד המורה בלבד, בהגעה ל-session\_deadline\_time המערכת מציגה בדשבורד המורה חלון קופץ (Popup) הנושא את הטקסט: "עברו X דקות". הערך X נגזר דינמית מהמשך שהוגדר לאותו מפגש בסעיף ב' לעיל, ואינו מספר קבוע: 20 עבור מפגש 1, 25 עבור מפגשים 2 ו-8, ו-15 עבור מפגשים 3 עד 7\. החלון הקופץ מוצג פעם אחת בלבד לכל מפגש ולכל לומד, נסגר בלחיצת המורה, ואינו חוזר. סגירת החלון אינה משנה דבר במסך הלומד. זמן היעד משמש למידע פדגוגי למורה בלבד ואינו אילוץ טכני. שדה is\_completed נקבע אך ורק לפי השלמת שבע משימות החובה או לפי סגירה יזומה של המורה, ולעולם לא לפי חלוף הזמן.

## **ג. נתיבי בחירה בסיום 7 תרגילי החובה**

מנגנון נתיבי הבחירה חל אך ורק על מפגשים 3 עד 7\. במפגש 1, במפגש 2 ובמפגש 8 מסך הבחירה אינו מוצג בשום מקרה, ולומד שסיים את משימות החובה לפני תום הזמן ממתין במסך סיום שקט. עם השלמת 7 תרגילי החובה לפני תום הזמן, המערכת מציגה מסך בחירה שקט ומעצים:

* **נתיב ביסוס:** משימות חזרה וייצוגים לא סטנדרטיים.

* **נתיב אתגר:** משימות חקר מורכבות בתחום הרבבה, המרות מרובות וספרות חסרות.

תרגילי הבחירה אינם נכללים במדדי השליטה הרשמיים של 7 תרגילי החובה.

## **ד. בדיקה קוגניטיבית**

**נתון:** התלמיד בתרגיל 5/7, נותרו 7 דקות. התלמיד מרענן דפדפן או חווה ניתוק רשת של 30 שניות.

**תוצאה:** הסשן, מספר התרגיל (5) ומצב ה-VRA משתחזרים בדיוק. הספירה נמשכת לפי חותמת הזמן הסמכותית בשרת.

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Establish the server as the sole authoritative source of truth for both session duration and current problem index. Use Zustand strictly as a presentation and local cache layer. Synchronize state upon refresh to prevent clock manipulation. Restrict teacher dashboard mastery calculations strictly to the first seven compulsory tasks. Never auto-advance a learner between sessions under any condition, including completion of all compulsory tasks or deadline expiry. Session activation is exclusively a teacher action. Enforce per-session visibility rules as hard conditions: in sessions 2 and 8 do not mount the Dienes canvas at all and disable the keyboard lock for every learner regardless of profile; in session 2 additionally disable the Socratic card entirely. Restrict the choice-path screen to sessions 3 through 7 only. Treat session 1 as an ungraded sandbox with no numbered compulsory tasks and no score computation. On reaching session\_deadline\_time, change nothing on the student screen; surface a one-time dismissible popup on the teacher dashboard only, with the minute value derived from the session's configured duration rather than a hardcoded constant.*

# **מודול 15: מודול ארגז חול דיגיטלי מונחה ומצב מקרן** *(Sandbox & Projector Mode Spec)*

## **א. הטריגר הפדגוגי**

ניהול הלמידה ההיברידית בכיתה בצורה רכה וצפויה. הפעלת מצב מקרן יוצרת מעבר קוגניטיבי מבוקר המכוון את קשב הלומדים להסבר המורה תוך מניעת עומס מפוצל.

## **ב. מצב המערכת**

השרת הוא מקור האמת היחיד למצב המקרן ברמת class\_id ו-active\_session\_id. שדות שרת: projector\_mode (boolean), projector\_mode\_updated\_at (timestamp), updated\_by\_teacher\_id. כאשר מצב מקרן פעיל, סביבת התלמיד עוברת למצב צפייה חסום ואטום. חל איסור מוחלט על הצגת מסכים Null או לבנים, איפוס מרחב העבודה המקומי, או טעינה מחדש של הדפדפן.

## **ג. התוצאה הצפויה והתנהגות ויזואלית**

הצגת מסך המתנה אטום הכולל איור מקרן שליו והטקסט: "הקשיבו להסבר של המורה על גבי המקרן". מרחב העבודה נשמר בזיכרון המקומי אך מוסתר לחלוטין. עם כיבוי המקרן, הסביבה משתחררת מיד (P95 ≤ 1000ms) לאותו מצב מדויק.

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Eradicate all rendering of null or blank screen states when projector mode is active. Restrict projector mode state strictly to class\_id and active\_session\_id context. Render a serene, fully opaque wait screen displaying "הקשיבו להסבר של המורה על גבי המקרן" without deletion. Persist current Zustand state. Synchronize boolean state via real-time Firestore listener with target P95 ≤ 1000ms. Ignore outdated updates using timestamp validation.*

# **מודול 16: מודול לוח רפלקציה תלת־שלבי** *(SRL Reflection Board Spec)*

## **א. הטריגר הפדגוגי**

קידום מודעות עצמית, הכוונה עצמית ופיתוח סוכנות הלומד בסיום מפגש 8, ללא תיוג או השוואה לאחרים.

## **ב. מצב המערכת וחישוב מדד ההתמדה**

השרת מנהל: reflection\_step (1, 2 או 3), reflection\_completed (boolean), persistence\_index (number).

**נוסחת מדד ההתמדה (Persistence Index):**   Persistence Index \= U ÷ (U \+ E \+ G) × 100

כאשר:

* **U** \= מספר פעולות ביטול פעולה (Undo): נגזר מספירת אירועי UNDO\_EXECUTED.

* 

* **E** \= מספר ניסיונות הקלדה שגויים: נגזר מספירת אירועי DIGIT\_ENTERED שבהם is\_correct \=== false בלבד. אירועים שבהם is\_correct \=== null אינם נספרים כלל ואינם משפיעים על המכנה.

* **G** \= מספר בחירות שגויות בכרטיס החניכה: נגזר מספירת אירועי SOCRATIC\_OPTION\_SELECTED שבהם is\_correct \=== false.

**טיפול בקצה:** כאשר U \+ E \+ G \= 0, המודול קובע דינמית Persistence Index \= 100%, למניעת חלוקה באפס.

## **ג. שלושת שלבי הרפלקציה**

1. **שלב א (הערכת מאמץ):** בחירה מתוך 3 סמלים חזותיים (מאמץ קל, בינוני, רב).

2. **שלב ב (זיהוי אסטרטגיות):** סימון תיבות בחירה (Undo, עיגולי זיכרון, כרטיס סוקרטי).

3. **שלב ג (משוב התמדה):** הצגת האחוז, מסר מעצים וכפתור סיום מפגש סופי.

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Implement SRL Reflection Board strictly in three chronological steps: (1) Effort Evaluation (3-point visual scale), (2) Strategy Selection, (3) Persistence Feedback displaying calculated index. Compute U, E, G exclusively from UNDO\_EXECUTED count, DIGIT\_ENTERED events with is\_correct: false, and SOCRATIC\_OPTION\_SELECTED events with is\_correct: false, respectively. Dynamically default Persistence Index to 100% if the denominator (U \+ E \+ G) equals zero. Do not expose comparative rankings or social labels. Synchronize step completions atomically with Firestore using idempotency keys.*

# **מודול 17: מודול עבודה במצב לא מקוון ותור סנכרון** *(Offline Queue & Sync Engine Spec)*

## **א. הטריגר הפדגוגי**

הבטחת רציפות הלמידה והפחתת חרדה הנובעת מתקלות תקשורת. המעבר לאופליין מתבצע באופן שקט ללא קטיעת חוט המחשבה.

## **ב. מצב המערכת וניהול תור**

Zustand מייצג את מצב ה-UI בלבד. IndexedDB משמש כמאגר אגירה עמיד. חל איסור מוחלט להשתמש ב-LocalStorage עבור תורי טלמטריה וסנכרון. כל פעולה שנאגרת באופליין נשמרת ב-IndexedDB במבנה FIFO הכולל: idempotency\_key, client\_timestamp, session\_id, student\_id, exercise\_id, operation\_type, payload.

## **ג. פרוטוקול התאוששות (Recovery Protocol) וחידוש חיבור**

פרוטוקול בן **5 שלבים**:

1. זיהוי חידוש חיבור ואימות נגישות לשרת.

2. שליפת מצב סמכותי עדכני מ-Firestore ועדכון Zustand.

3. קריאת תור ה-FIFO מ-IndexedDB ושליחה במנות מוגבלות (Bounded Batches).

4. מחיקה שלמה (Atomic) מ-IndexedDB רק לאחר קבלת אישור שרת (Ack).

5. השרת אוכף עיבוד אידמפוטנטי (Idempotent Execution) למניעת כפילויות.

## **ד. חיווי ויזואלי**

אופליין \= אייקון ענן אפור קטן ולא חוסם בפינה. אונליין מסונכרן \= ענן ירוק. אין הצגת חלונות קופצים (Pop-ups) או הודעות שגיאה חוסמות.

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Use Zustand only for client UI/connection state. Never treat Zustand as authoritative for persistence. Use IndexedDB as the persistent local transaction buffer. Strictly prohibit LocalStorage. Implement FIFO queue ordering with unique idempotency keys per operation. Restore connection via the 5-step handshake protocol described in §C above, executing atomic deletes from IndexedDB strictly upon server acknowledgment.*

# **מודול 18: מודול רדאר פדגוגי שקט** *(Silent Radar Matrix Spec)*

## **א. הטריגר הפדגוגי**

אספקת תמונת מצב אבחונית בזמן אמת למורה כמנווט אנושי, ללא הצפה חושית, ללא תיוג חברתי ותוך שמירה מלאה על אנונימיות התלמידים.

## **ב. מפרט הגריד ומיפוי הצבעים**

גריד קבוע של 3×4 המכיל בדיוק 12 משבצות אנונימיות ממוספרות 1–12. אין לשנות את סדר המשבצות או להזיזן.

* **ירוק (Green):** פעילות למידה תקינה (אירוע קוגניטיבי ב-30 השניות האחרונות).

* **צהוב (Yellow):** היסוס קוגניטיבי (45 שניות רצופות ללא פעולה בטור הפעיל).

* **אדום (Red):** כרטיס חניכה סוקרטי פעיל כעת במסך התלמיד.

* **אפור (Grey):** התלמיד מנותק (לפי Presence Heartbeat) או שטרם החל סשן.

**היררכיית עדיפות תצוגה (Priority Hierarchy), מהגבוה לנמוך:**   RED \> GREY \> YELLOW \> GREEN

שכבת האות הקוגניטיבי. בנוסף לצבע המשבצת, המשקף מצב פעילות בלבד, כל משבצת מציגה תו קוגניטיבי קטן ושקט המשקף את סיווג הטעות האחרון שנרשם עבור אותו לומד בשדה error\_category (מודול 13). התו מוצג כאות בודדת בפינת המשבצת: ח לטעות חישוב, ר לטעות מיומנות רכיב, מ לטעות מושגית. בהיעדר סיווג נרשם התו אינו מוצג כלל. התו אינו מהבהב, אינו זז ואינו משנה את גודל המשבצת. בלחיצה על משבצת נפתחת שכבת פירוט המציגה את התפלגות הסיווגים של אותו לומד באותו מפגש, כדי לאפשר למורה להבחין בין לומד שטועה בחישוב לבין לומד שאינו מבין את המבנה העשרוני.

## **ג. אנונימיזציה הרמטית ו-Presence**

איסור מוחלט על הצגת שמות, ראשי תיבות או אווטארים. הצגת מזהים מספריים 1–12 בלבד. זיהוי ניתוק מבוצע בצד השרת דרך מנגנון Presence Heartbeat (חלון זיהוי מרבי: 15 שניות).

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Implement Silent Radar as a static 3x4 grid representing 12 anonymous student profiles (IDs 1-12). Throttle client writes to maximum once per 1000ms. Apply color precedence highest to lowest: RED \> GREY \> YELLOW \> GREEN. Server-side Presence Heartbeat determines GREY state within a 15-second max target. Strictly forbid rendering names, initials, or avatars. Render a small static cognitive glyph in each grid cell derived from the learner's most recent error\_category value: ח for calculation, ר for procedural, מ for conceptual, and nothing when no classification exists. The glyph must not blink, animate, move, or alter cell dimensions. Clicking a cell opens a detail layer showing that learner's classification distribution for the current session. The four background colours remain driven strictly by activity timing and connection state; the glyph is an independent layer and must never override or recolour the cell.*

# **מודול 19: מודול הקצאת התאמות פדגוגיות שקטות** *(Silent Adaptation Assignment Spec)*

## **א. הטריגר הפדגוגי**

מתן התאמות אישיות שקטות ללומדים ללא חיווי בממשק התלמיד וללא יצירת סממן חזותי המעיד על קבלת תמיכה מיוחדת, לשמירה על סוכנות הלומד והחוסן הרגשי.

## **ב. מצב המערכת ונקודת ההחלה**

השרת הוא מקור האמת עבור שיוך support\_profile\_id. שדות התלמיד הרלוונטיים בשרת (חלק מסכימת ה-students הקנונית המלאה במודול 4): student\_id (1-12), class\_id, school\_id, support\_profile\_id, support\_profile\_version, support\_profile\_updated\_at, support\_profile\_updated\_by.

* **גבול החלה בטוח (Safe Application Boundary):** שינוי פרופיל במהלך תרגיל פעיל נשמר כהתאמה ממתינה (Pending Adaptation) ומוחל אך ורק במעבר לתרגיל הבא, כדי למנוע קטיעת רצף קוגניטיבי.

* **תצוגת תלמיד:** זהה לחלוטין לממשק הסטנדרטי (ללא תגים, אייקונים או הודעות מיוחדות).

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Store support profile configuration strictly on the student document fields listed in §B (which match Appendix A's AnonymousStudent interface exactly; do not introduce additional or renamed fields). Only authorized teachers may write this field. Pupil UI must remain visually indistinguishable from standard UI. If a profile is updated mid-exercise, apply it strictly at the next exercise transition boundary.*

# **מודול 20: מודול שער אישור מורה קשיח** *(Teacher Approval Gate Spec)*

## **א. הטריגר הפדגוגי**

הבטחת עמידה ביעדי הלמידה וסגירת פערי ידע לפני מעבר לשלב הלמידה האדפטיבית (מפגשים 3–7), תוך חוויית המתנה חיובית ומשרה רוגע.

## **ב. מצב המערכת**

בקר הניתוב (Route Guard) בלקוח התלמיד בודק: אם session\_number \== 2 וגם is\_completed \== true וגם teacher\_gate\_approved \== false (שלושתם על מסמך הסשן של מפגש 2 של אותו תלמיד), הגישה למפגש 3 נחסמת אסינכרונית והתלמיד מועבר למסך ההמתנה.

* **מסך המתנה (מעוף הדבורה):** מציג אנימציית דבורה שלווה והודעה: "כל הכבוד מתמטיקאים\! סיימתם את התחנה השנייה בהצלחה. המורה בודק את העבודה שלכם כעת, ומיד נמשיך במסע המשותף שלנו."

* **דשבורד מורה:** טבלה אנונימית (1–12) המציגה את המלצת המטריקס האבחונית (green\_path או remediation\_path) ומתג אישור. בלחיצה, השרת מעדכן teacher\_gate\_approved \= true.

**חישוב matrix\_recommended\_path:** ברירת המחדל: matrix\_recommended\_path \= 'green\_path' אם session\_score\_percent \>= 50, אחרת 'remediation\_path'. זהו אותו סף בדיוק כמו קו החלוקה התחתון של מודול 23\.

**תלות בזמן חישוב:** session\_score\_percent ו-matrix\_recommended\_path מחושבים ונכתבים ל-SessionDocument **בטריגר עצמאי על סיום המפגש** (is\_completed → true), **ולא** כתוצר לוואי של generatePedagogicalReportPDF (מודול 23). שער האישור קורא ערכים קיימים מיד עם סיום מפגש 2\.

## **ג. התרשתות ושחרור**

הלקוח מאזין ל-Firestore Snapshot Listener. עם אישור השרת, הנעילה משתחררת מיד (P95 ≤ 1000ms) והלובי מעודכן ללא רענון דף.

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Enforce async check in client router guards: restrict navigation access to session 3 if, on that student's session-2 SessionDocument, session\_number equals 2 AND is\_completed is true AND teacher\_gate\_approved is false. Redirect strictly to the positive waiting view (מעוף הדבורה). Atomically update approval fields (teacher\_gate\_approved, teacher\_selected\_path, gate\_approved\_at, gate\_approved\_by) in Firestore upon teacher click, unlocking student route via real-time listener under P95 ≤ 1000ms latency. Do not read or write any student-level approval field; SessionDocument.teacher\_gate\_approved is the sole source of truth. Compute session\_score\_percent and matrix\_recommended\_path in a dedicated onSessionComplete trigger, independent of generatePedagogicalReportPDF. Default rule: matrix\_recommended\_path \= session\_score\_percent \>= 50 ? 'green\_path' : 'remediation\_path'.*

# **מודול 21: מודול ממשק מסך מפוצל לאבחון מורה** *(Teacher Diagnostic Split-Screen Spec)*

## **א. הטריגר הפדגוגי**

מתן אפשרות למורה להתחקות אחר תהליך פתרון התרגיל הבודד וציר ההחלטות הקוגניטיבי של התלמיד, ללא יצירת עומס קוגניטיבי ותוך שמירה הרמטית על פרטיות.

## **ב. מצב המערכת ומבנה המסך המפוצל**

1. המסך מפוצל לשני חלקים שווים ונקיים ממסיחים:

2. **צד שמאל (Screen Capture, סרטון שחזור קנבס):** נגן וידאו ממוקד המריץ צילום מסך מקומי מקוודד (Encrypted) של קנבס העבודה עבור התרגיל הספציפי שנבחר בלבד. חל איסור מוחלט על שילוב מצלמה, מיקרופון או שמע.

3. **צד ימין (טבלת ציר החלטות קוגניטיבי, "VRA Timeline"):** טבלה סטטית וברורה הממפה כרונולוגית את כל פעולות התלמיד (גרירת לבנים, הזנה בעיגולי זיכרון, מחיקות, וביטולי פעולה) לצד זמני השהיה וחיוויי בקרה עצמית.

מפרט ההקלטה. ההקלטה מתעדת שינויי DOM ושינויי קנבס בלבד. חל איסור מוחלט על מצלמה, מיקרופון ושמע. המקטעים נכתבים ל-Firebase Realtime Database בנתיב users/students/{studentId}/telemetry\_sessions/{sessionId}/chunks בתדירות של אחת לשתי שניות. לכל מקטע נשמרת מטא-דאטה הכוללת exercise\_id בנוסף לחותמות הזמן. תקרת נפח. ההקלטה מוגבלת ל-50MB לכל לומד לכל מפגש. בהגעה לתקרה ההקלטה נעצרת בשקט, נרשם דגל recording\_truncated: true במטא-דאטה, והלמידה נמשכת ללא כל שינוי בצד הלומד. התנהגות באופליין. מקטעים שכתיבתם נכשלה נאגרים ב-IndexedDB ונשלחים מחדש עם חידוש החיבור, בהתאם למודול 17\. חל איסור מוחלט על השלכת מקטע שנכשל. ציר זמן מפורק לתרגילים. הנגן מציג ציר זמן רציף של המפגש כולו, המחולק חזותית לקטעים לפי exercise\_id, בדומה לפרקים בנגן וידאו. לחיצה על קטע מדלגת ישירות לתחילת אותו תרגיל. הצגת רצף המפגש המלא מותרת ואף רצויה, כל עוד הפירוק לתרגילים נראה וזמין לניווט. קישור דו כיווני בין הנגן לטבלה. טבלת ציר ההחלטות הקוגניטיבי בצד ימין מקושרת לנגן בשני הכיוונים. לחיצה על שורה בטבלה מדלגת בנגן לחותמת הזמן של אותו אירוע. במקביל, ככל שהנגן מתקדם, השורה המתאימה בטבלה מודגשת אוטומטית. שני הכיוונים חייבים להיות פעילים.

## **ג. אירוע המשתמש**

המורה בוחרת מזהה אנונימי (1–12) ותרגיל מסוים מתוך דשבורד האבחון. המערכת טוענת את קובץ הוידאו המוצפן ואת טבלת ה-VRA התואמת.

## **ד. התוצאה הצפויה**

טעינה מהירה של הנגן וטבלת ציר הזמן. המורה יכולה להריץ, לעצור ולנתח את שלבי הפתרון. כל הנתונים משויכים למזהה אנונימי בלבד.

## **ה. חוזה נתונים והתנהגות בזמן כשל**

במקרה של כשל בטעינת קובץ השחזור, המערכת מציגה הודעה שקטה: "וידאו השחזור בהכנה" ומציגה את טבלת ציר ההחלטות מתוך נתוני הטלמטריה השמורים בשרת.

## **ו. תלויות במודולים אחרים**

מודולים 4, 5, 8, 11, 18, 27\.

## **ז. בדיקה קוגניטיבית**

**תרחיש:** המורה בוחנת את תהליך הפריטה בתרגיל 4 של תלמיד 3\. **תוצאה:** הנגן משחזר את תנועת הלבנים בקנבס, ובמקביל הטבלה בצד ימין מדגישה את אירוע REGROUPING\_SUCCESS עם חותמת הזמן המדויקת.

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Implement split-screen view interface. Left side: standard video player playing recorded local screen capture of individual workspace canvas for selected exercise, strictly with zero audio/webcam stream. Right side: static clean table representing VRA Cognitive Decision Timeline mapping student telemetry events (block drags, memory circles, deletions, undos) alongside timestamps and self-regulation flags, populated from the typed TelemetryDetailsMap payloads (Appendix A §3). Maintain strict anonymity (student IDs 1-12). Record DOM and canvas mutations only; never capture camera, microphone, or audio. Write chunks to the dedicated RTDB path every 2000ms, stamping each chunk's metadata with exercise\_id alongside timestamps. Enforce a hard 50MB cap per student per session: on reaching it, stop recording silently, set recording\_truncated: true, and never alter the student-side experience. Route failed chunk writes into the IndexedDB queue for retry per Module 17; never drop a failed chunk. Render the player timeline as a continuous session track visually segmented by exercise\_id, with each segment click-seekable like video chapters. Bind the decision-timeline table bidirectionally to the player: clicking a table row seeks the player to that event's timestamp, and player playback progress auto-highlights the corresponding row. Both directions are mandatory.*

# **מודול 22: מודול ערוץ שיח ניהולי למורה** *(Teacher Admin Chat Engine Spec)*

## **א. הטריגר הפדגוגי**

אספקת ערוץ התייעצות ותמיכה מקצועי אסינכרוני למורה מול מנהלי המערכת, תוך הגנה הרמטית מוחלטת על פרטיות התלמידים ומניעה מוחלטת של זליגת PII.

## **ב. מצב המערכת ומנגנון האנונימיזציה הדו-שכבתי (Two-Tier Protection)**

ערוץ השיח מנוהל בחלונית נשלפת (Sliding Side Drawer) שנפתחת בלחיצה על אייקון המעטפה בסרגל הכלים. אין קלט קולי (STT) בשום ממשק. תקשורת מורה-אדמין היא טקסט בלבד. אודיו לעולם אינו עוזב את המכשיר. מנגנון הגנת PII דו-שכבתי:

1. **שכבה 1 (Client-Side Regex Validation):** הלקוח סורק בזמן אמת את תיבת הקלט. אם זוהו שמות פרטיים, מספרי טלפון, מיילים או ת"ז, כפתור השליחה נחסם ומוצגת התראה עדינה המבקשת להשתמש במזהים 1–12.

2. **שכבה 2 (Server-Side Cloud Anonymizer Function):** לפני כתיבה ל-Firestore, פונקציית ענן סורקת את הטקסט, מצליבה מול רשימת שמות הכיתה ומחליפה כל שם פרטי במזהה האנונימי התואם (לדוגמה: "דניאל" ← "תלמיד 4").

## **ג. אירוע המשתמש**

המורה הקלידה הודעת התייעצות הכוללת שם תלמיד ולחצה שליחה.

## **ד. התוצאה הצפויה**

השם מוחלף בשרת במלואו למזהה אנונימי, וההודעה נשמרת ב-Firestore במבנה אנונימי נקי ומסתנכרנת בזמן אמת לדשבורד הניהול.

## **ה. חוזה נתונים והתנהגות בזמן כשל**

במקרה של ניתוק רשת, ההודעה נאגרת בתור ה-IndexedDB (מודול 17\) ונשלחת רק לאחר חידוש החיבור וביצוע האנונימיזציה בשרת.

## **ו. תלויות במודולים אחרים**

מודולים 3, 4, 17, 27, 28\.

## **ז. בדיקה קוגניטיבית**

**נתון:** המורה מקלידה "תלמיד 3 המכונה דניאל מתקשה בפריטה". **תוצאה:** השרת ממיר את ההודעה ל-"תלמיד 3 המכונה תלמיד 4 מתקשה בפריטה" לפני השמירה במסד הנתונים.

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Implement teacher admin chat inside a sliding side drawer triggered by an envelope icon. Enforce two-tier PII protection: (1) Client-side regex checking input to block PII submission, (2) Server-side Cloud Function Anonymizer parsing message body and replacing pupil personal names with anonymous IDs (1-12) prior to writing documents to Firestore. Strictly forbid saving raw PII database records. Enforce zero STT or voice input in any interface; text only; audio never leaves the device.*

# **מודול 23: מודול דוחות ואנליטיקה פדגוגית** *(Pedagogical Analytics & PDF Generator Spec)*

## **א. הטריגר הפדגוגי**

תרגום נתוני הלמידה הדיגיטליים להמלצות פדגוגיות אופרטיביות להוראה פרונטלית והתערבות בכיתה הפיזית, תוך שמירה על אנונימיות מלאה.

## **ב. מצב המערכת ומחולל הדוחות**

מחולל הדוחות פועל בצד השרת בלבד באמצעות Cloud Function (generatePedagogicalReportPDF). המחולל מופעל עם השלמת מפגש 2 או 8 ומפיק קובץ PDF לקריאה בלבד השמור ב-Cloud Storage ומקושר למסמך המורה. בנוסף, עותק זהה של כל דוח PDF מועלה אוטומטית למרחב האחסון המשותף בדרייב (בהתאם לתשתית exportAdminReportToDrive), לצורכי ארכיון ומחקר. העלאת העותק לדרייב היא פעולת Best-Effort: כשל בהעלאה לדרייב אינו מכשיל ואינו מעכב את הפקת הדוח או את זמינותו למורה בדשבורד. הפונקציה קוראת את session\_score\_percent הקיים כבר על SessionDocument (המחושב בטריגר עצמאי על סיום מפגש).

**כללי הניתוב וההמלצות הפדגוגיות (מבוססים אחוזים):**

* **ציון \< 50%:** המלצה לעבודה בקבוצה הומוגנית קטנה, תיווך פרונטלי צמוד של המורה ושימוש בתבניות עשר פיזיות ומקלות מנייה.

* **ציון 50%–75%:** המלצה לעבודה בקבוצה הטרוגנית (כולל שני הקצוות), שיח עמיתים ופתרון בעיות משותף באמצעות חשבונייה פיזית.

* **ציון \> 75%:** המלצה לעבודה עצמאית (לא כולל 75\) עם משימות האתגר והעומק של כיתה ג' ושימוש בלוח מחיק פיזי וכרטיסיות מספרים.

נוסחת הציון: **session\_score\_percent \= (מספר תרגילי החובה מתוך 7 שנפתרו נכון בניסיון ראשון ÷ 7\) × 100**. "נפתר נכון בניסיון ראשון" \= אירוע PROBLEM\_COMPLETE לתרגיל זה שלא קדם לו אף DIGIT\_ENTERED עם is\_correct \=== false באותו exercise\_id. אירועים שבהם is\_correct \=== null מתעלמים מהם לחלוטין ואינם נחשבים לא כנכונים ולא כשגויים.

הפרדה בין שכבת הכללים לשכבת הניתוח בדוח. הדוח מורכב משתי שכבות בלתי תלויות, ואין לערבב ביניהן. השכבה הראשונה, מסגרת ההמלצה, נקבעת אך ורק על ידי כלל האחוזים שלעיל בצד השרת, ללא כל מעורבות של מנוע הבינה המלאכותית. שכבה זו קובעת את סוג קבוצת העבודה הפיזית ואת עזרי ההמחשה הפיזיים המומלצים, והיא דטרמיניסטית לחלוטין. השכבה השנייה, הניתוח הפדגוגי המילולי, מנוסחת על ידי מנוע הבינה המלאכותית. המנוע מקבל כקלט את מלוא נתוני הטלמטריה של הלומד באותו מפגש לצד תבניות ה-ExerciseTemplate של כל התרגילים שבהם נרשמו שגיאות, ומנסח בשפה טבעית תיאור של פערי הידע הספציפיים שאותרו וכן המלצות הוראה מותאמות להמשך העבודה בכיתה הפיזית. חל איסור מוחלט על המנוע לשנות, לסתור או להמליץ בניגוד למסגרת שנקבעה בשכבה הראשונה. במקרה של כשל בקריאה למנוע הבינה המלאכותית או פקיעת זמן, הדוח מופק במלואו עם השכבה הראשונה בלבד, ובמקום הניתוח המילולי מוצג הטקסט: "הניתוח הפדגוגי המפורט אינו זמין כעת. ההמלצות שלהלן מבוססות על מדדי הביצוע." הפקת הדוח לעולם אינה נכשלת בשל כשל במנוע. חוזה הבקשה והתשובה מול מנוע הניתוח:

```ts
export interface GeminiReportRequest {
  student_id: number; // Strictly 1-12
  session_id: string;
  session_number: number;
  session_score_percent: number;
  recommendation_tier: 'below_50' | 'between_50_75' | 'above_75';
  failed_exercises: ExerciseTemplate[];
  telemetry_summary: TelemetryPayload<TelemetryEventType>[];
}

export interface GeminiReportResponse {
  knowledge_gaps: string[];
  teaching_recommendations: string[];
}
```

פרק פותח: סיפור התרגילים (Exercise Narrative). הדוח המסכם נפתח בפרק תיאורי המתאר בשפה טבעית את מהלך העבודה של הלומד בכל אחד משבעת תרגילי החובה. הפרק מנוסח בצד השרת מתוך רצף אירועי הטלמטריה באמצעות תבניות ניסוח קבועות, ואינו מנוסח על ידי מנוע הבינה המלאכותית. לכל תרגיל מנוסחת פסקה קצרה המשלבת את הרכיבים הבאים לפי סדר הופעתם בפועל: ייצוג המספרים בקנבס, פעולות פריטה או הקבצה, הזנת ספרות בעיגולי הזיכרון ובשורת התוצאה, מחיקות, ביטולי פעולה, היסוסים ממושכים, והופעת כרטיס חניכה. הניסוח מציין מספרים וטורים קונקרטיים ולא מדדים מצטברים בלבד. דוגמה לפסקה מנוסחת: "בתרגיל השלישי הלומד ייצג את המספרים בקנבס, ניסה להקליד בטור היחידות שלוש פעמים ומחק, השתהה 52 שניות, קיבל כרטיס חניכה, ולאחריו ביצע פריטה מטור העשרות והשלים את התרגיל." פרק זה קודם לניתוח הפדגוגי של מנוע הבינה המלאכותית ומשמש למורה כהקשר לקריאתו.

## **ג. אירוע המשתמש**

המורה בוחרת מזהה תלמיד אנונימי (1–12) בדשבורד הדוחות ומורידה את הדוח המסכם כ-PDF.

## **ד. התוצאה הצפויה**

הפקת PDF מעוצב, קריא ואנונימי בתוך פחות משנייה אחת מרגע הבקשה, המכיל ניתוח פערי ידע, מדדי שליטה, מדד התמדה SRL והנחיות דידקטיות.

## **ה. חוזה נתונים והתנהגות בזמן כשל**

אם עיבוד ה-PDF נכשל בשרת, המערכת מציגה הודעה שקטה: "הדוח בעיבוד כעת, אנא נסו שוב בעוד מספר רגעים" ולא מציגה קבצים פגומים.

## **ו. תלויות במודולים אחרים**

מודולים 4, 5, 14, 16, 17, 27\.

## **ז. בדיקה קוגניטיבית**

**נתון:** תלמיד 7 סיים מפגש 8 לאחר שפתר נכון בניסיון ראשון 3 מתוך 7 תרגילי החובה, session\_score\_percent ≈ 43%. **תוצאה:** ה-PDF מונפק עם מזהה "תלמיד 7" בלבד וכולל המלצה לעבודה בקבוצה הומוגנית קטנה ותבניות עשר פיזיות (עקבי עם כלל "ציון \< 50%").

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Create a server-side Cloud Function PDF generator triggered upon session 2 or 8 completion. Read-only PDF assets must restrict student identifiers strictly to anonymous numeric IDs (1-12). Enforce mathematical routing logic: \<50% score → small homogeneous group & physical ten frames; 50–75% → heterogeneous peer discourse & abacus; \>75% → independent third-grade challenge track. Strictly prohibit storing student real names in PDF files. Compute session\_score\_percent as (count of the 7 compulsory exercises solved correctly on first attempt ÷ 7\) × 100; "correct on first attempt" means the PROBLEM\_COMPLETE event for that exercise\_id was not preceded by any DIGIT\_ENTERED event with is\_correct: false in that same exercise. Generate the Exercise Narrative server-side from the telemetry event sequence using fixed composition templates. Never route narrative generation through the AI engine. Compose one paragraph per compulsory exercise, citing concrete numbers and column positions rather than aggregate counts, ordered by actual event occurrence. Place this narrative before the AI pedagogical analysis in the PDF.*

# **מודול 23א: מודול איפוס נתונים, גיבוי ותיעוד *(Data Reset, Backup & Audit Trail Spec)***

## **א. הטריגר הפדגוגי**

מתן אפשרות למורה להתאושש מתקלות במהלך שיעור פעיל ולהתחיל מחדש ללא אובדן ראיות מחקריות, תוך מניעה מוחלטת של מחיקה בלתי הפיכה של נתוני הפיילוט.

## **ב. שלוש רמות איפוס**

המערכת מגדירה שלוש רמות איפוס נפרדות ובלתי תלויות. חל איסור מוחלט על מיזוגן לפעולה אחת.

1. **איפוס התראות (Alerts Reset):** מנקה את מצב הרדאר הפדגוגי ומחזיר את כל שתים עשרה המשבצות למצב ברירת מחדל. אינו נוגע בשום נתון למידה, טלמטריה או מסמך סשן. אינו מחייב גיבוי.

2. **איפוס לומד יחיד (Single Student Reset):** מוחק את מצב מרחב העבודה ואת התקדמות המפגש הפעיל של לומד בודד בלבד, ומחזיר אותו לתחילת המפגש. מחייב גיבוי מלא לפני הביצוע.

3. **איפוס מערכת (System Reset):** מוחק את כלל נתוני הלמידה של כל הלומדים בכיתה. מחייב גיבוי מלא לפני הביצוע.

## **ג. חובת גיבוי מקדים**

עבור רמות 2 ו-3 בלבד, המערכת מבצעת גיבוי מלא לפני כל מחיקה. סדר הפעולות קשיח: תחילה נאסף המידע, לאחר מכן נכתב קובץ הגיבוי, ורק לאחר קבלת אישור כתיבה מוצלח מתבצעת המחיקה. אם הגיבוי נכשל מכל סיבה, המחיקה אינה מתבצעת כלל והמערכת מציגה למורה הודעה שקטה: 'הגיבוי נכשל. האיפוס בוטל ולא נמחקו נתונים.' הגיבוי מיוצא כקובץ אל מרחב האחסון המשותף בדרייב באמצעות Cloud Function ייעודית, בהתאם לתשתית הקיימת ב-exportAdminReportToDrive. הקובץ כולל את כלל נתוני הטלמטריה, מסמכי הסשן, מצבי מרחב העבודה ונתוני הרפלקציה של הלומדים הנמחקים, תחת מזהים אנונימיים 1 עד 12 בלבד.

## **ד. רישום תיעוד (Audit Trail)**

כל פעולת איפוס ללא יוצא מן הכלל, לרבות איפוס התראות ברמה 1, נרשמת באוסף ייעודי reset\_audit\_log ב-Cloud Firestore. בכל פעולת איפוס המורה נדרשת לבחור סיבה מתוך רשימה סגורה, והבחירה נשמרת ברישום. חל איסור מוחלט על ביצוע איפוס כלשהו ללא רישום ובלי בחירת סיבה. רישום זה אינו נמחק על ידי אף פעולת איפוס, לרבות איפוס מערכת.

```ts
export interface ResetAuditEntry {
  reset_id: string;
  reset_level: 'alerts' | 'single_student' | 'system';
  performed_by_teacher_id: string;
  performed_at: number;
  class_id: string;
  affected_student_ids: number[];
  backup_file_url: string | null;
  backup_status: 'success' | 'failed' | 'not_required';
  reset_reason: 'technical_fault' | 'student_stuck' | 'restart_session' | 'test_run' | 'other';
  reason_note: string | null;
  records_deleted_count: number;
}
```

## **ה. אישור מפורש לפני ביצוע**

עבור רמות 2 ו-3 בלבד, המערכת מציגה למורה חלון אישור המפרט במפורש מה עומד להימחק ועל אילו לומדים, ודורשת אישור אקטיבי. איפוס מערכת דורש אישור כפול. חל איסור מוחלט על ביצוע איפוס מרמה 2 ומעלה בלחיצה בודדת.

## **ו. הרשאות**

מורה מורשית רשאית לבצע את שלוש רמות האיפוס עבור הכיתה המשויכת אליה בלבד. מנהל מערכת חסום מביצוע איפוס נתוני למידה, בהתאם לעקרון בידוד הכיתות.

## **ז. בדיקה קוגניטיבית**

**תרחיש:** המורה מבצעת איפוס מערכת בעוד חיבור הרשת אינו יציב והכתיבה לדרייב נכשלת. **תוצאה:** אף נתון אינו נמחק, נרשם ב-reset\_audit\_log רישום עם backup\_status: 'failed', והמורה מקבלת הודעה שהאיפוס בוטל.

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Implement three strictly separate reset levels. Alerts-level reset must never touch learning data. For single-student and system resets, enforce backup-before-delete ordering: collect, write backup file to the shared Drive folder via Cloud Function, await write acknowledgment, and only then delete. If the backup write fails or times out, abort the deletion entirely and surface a silent message. Write a ResetAuditEntry to the reset\_audit\_log Firestore collection for every reset without exception, including alerts-level resets; require a reset\_reason selection before any reset executes; this collection must be excluded from all deletion operations including system reset. Require explicit confirmation dialogs for levels 2 and 3, with double confirmation for system reset. Restrict reset permissions to authorized teachers scoped to their own class\_id; deny admin role access to learning-data resets.*

# **מודול 24: מודול סקירת מערכת כוללת** *(Admin Overview & Caching Spec)*

## **א. הטריגר הפדגוגי**

מעקב ובקרה על מדדי הלמידה והשימוש הגלובליים ברמת מנהל המערכת, תוך סודיות מחקרית מלאה ומניעת גישה לנתוני תלמידים פרטניים.

## **ב. מצב המערכת ומדיניות שמירה במטמון (Caching)**

המערכת מפעילה כלל אבטחה נוקשה: נעילת גישת אדמין כברירת מחדל בעת כשל (Fail-Closed Admin Security Rule). מנהלי מערכת חסומים מגישה לנתוני טלמטריה פרטניים או למסמכי תלמידים אישיים.

* **אגרגציה מתוזמנת:** פונקציית ענן רצה אחת לשעה, מחשבת מדדים מצטברים (אחוזי השלמת מפגשים, סך תרגילים שנפתרו, מדדי שגיאות גלובליים) ושומרת אותם במסמך מטמון (Cache) ייעודי: store\_cache.

* **ממשק אדמין:** קורא אך ורק ממסמך ה-store\_cache וחסום מביצוע שאילתות חיות יקרות ב-Firestore.

* **ייצוא נתונים מחקריים על ידי המורה:** המורה רשאית להפיק ייצוא נתונים גולמיים מדשבורד המורה, באמצעות Cloud Function ייעודית exportResearchDataset. הייצוא מפיק ארבעה קובצי CSV נפרדים: אירועי טלמטריה, מסמכי סשן, נתוני רפלקציה, ורישומי איפוס. כל השדות מיוצאים תחת מזהים אנונימיים 1 עד 12 בלבד, וחל איסור מוחלט על ייצוא מידע מזהה כלשהו. הקבצים נכתבים למרחב האחסון המשותף בדרייב במבנה תיקיות קשיח: תיקייה לכל מפגש, ובתוכה תיקייה לכל תאריך ייצוא. שם כל קובץ כולל את מספר המפגש, סוג האוסף וחותמת הזמן. ייצוא חוזר של אותו מפגש אינו דורס קבצים קיימים אלא נשמר כתיקיית תאריך חדשה. פעולת הייצוא היא קריאה בלבד ואינה משנה או מוחקת נתונים. כל ייצוא נרשם ב-reset\_audit\_log עם reset\_level: 'export' לצורך מעקב, ללא מחיקת נתונים כלשהם.

## **ג. אירוע המשתמש**

מנהל המערכת נכנס לדשבורד הניהול הגלובלי.

## **ד. התוצאה הצפויה**

טעינה מיידית של גרפים ונתונים סטטיסטיים מצטברים ברמת הפרויקט, ללא חשיפת בתי ספר, כיתות או תלמידים ספציפיים.

## **ה. חוזה נתונים והתנהגות בזמן כשל**

במקרה של כשל בעדכון המטמון, הממשק מציגה את הנתונים השמורים האחרונים (Last Known Cached State) עם חיווי שקט של זמן העדכון האחרון.

## **ו. תלויות במודולים אחרים**

מודולים 4, 5, 25, 27\.

## **ז. בדיקה קוגניטיבית**

**תרחיש:** אדמין מנסה להזין כתובת URL ישירה לאוסף הטלמטריה של תלמיד 3\. **תוצאה:** Firestore Security Rules מחזירים שגיאה מוחלטת 403 (Deny), והאדמין מועבר לדף הבית.

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Construct high-level analytics dashboard presenting global aggregated statistics without exposing school, class, or student-level telemetry streams. Implement strict database security rules denying Admin role read access to telemetry\_logs or students collections. Build a server-side cached aggregation routine running once per hour saving metrics to a read-only cache store to prevent live query bottlenecks. Implement exportResearchDataset as a read-only Cloud Function callable exclusively by authorized teachers scoped to their own class\_id. Emit four separate CSV files (telemetry events, session documents, reflection data, reset log). Enforce anonymous IDs 1-12 in every field; reject the export if any PII field is detected. Write to the shared Drive folder using a strict folder structure: one folder per session, containing one folder per export date. Never overwrite an existing export; always create a new dated folder. Filenames must encode session number, collection type, and timestamp. Log every export to reset\_audit\_log with reset\_level: 'export' without deleting any data.*

# **מודול 25: מודול ניהול בתי ספר, כיתות ומורים** *(Schools & Teachers Setup Wizard Spec)*

## **א. הטריגר הפדגוגי**

ניהול ארגוני מבוקר התומך במבנה המחקרי הצר של הפיילוט, המאפשר הקמת כיתות תוך שמירה מלאה על אנונימיזציה מחמירה ואכיפת מגבלת גודל כיתה.

## **ב. מצב המערכת ואשף ההקמה (Setup Wizard)**

השרת הוא מקור האמת היחיד. אשף הקמת הכיתה (Class Initialization Wizard) פועל תחת המגבלות והחוקים הבאים:

1. הגדרת בית ספר יחיד בשם "בית ספר ביקורת" וכיתה פעילה אחת בלבד בשם "המבקרים".

2. אכיפת סף קיבולת קשיחה: חוק אבטחה בשרת חוסם רישום של יותר מ-12 תלמידים פעילים לכיתה זו.

3. יצירת זהויות אנונימיות: המערכת מייצרת אוטומטית מזהים מספריים 1–12 בלבד עם הסיסמה הקבועה 10203040\. איסור מוחלט על שמירת שמות, מיילים או פרטים מזהים.

## **ג. אירוע המשתמש**

מנהל המערכת מפעיל את אשף ההקמה, מגדיר את הכיתה והמורה המורשה, ומאשר פתיחה.

## **ד. התוצאה הצפויה**

הקמת מסמכי הכיתה והמורים ב-Firestore. הנפקת כרטיסי כניסה אנונימיים לתלמידים (1–12, סיסמה 10203040).

## **ה. חוזה נתונים והתנהגות בזמן כשל**

ניסיון לרשום תלמיד 13 או להזין שדה שאינו בתקן נחסם באופן מוחלט בשרת (שגיאה 403). הלקוח מבצע Rollback ומציג הודעה: "ההרשמה חסומה. כיתת המחקר הגיעה לתפוסה מלאה של 12 לומדים."

## **ו. תלויות במודולים אחרים**

מודולים 1, 4, 19, 27\.

## **ז. בדיקה קוגניטיבית**

**תרחיש:** ניסיון הוספת תלמיד 13 לכיתת "המבקרים". **תוצאה:** השרת חוסם את הכתיבה (403), האשף מנקה את השדה ומציג חיווי שהכיתה בתפוסה מלאה של 12 לומדים.

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Implement a step-by-step setup wizard for class initialization matching the classes collection schema in Module 4\. Non-nullable fields: school\_id, class\_name (set strictly to "המבקרים"), class\_type. Apply strict validation rules to block creating pilot classes exceeding 12 active students. Ensure student registrations generate strictly numeric anonymous IDs from 1 to 12 with zero personally identifiable variables.*

# **מודול 26: מודול קטלוג תוכנית הלימודים** *(Curriculum Catalog & Batch Spec)*

## **א. הטריגר הפדגוגי**

ניהול מבוקר של תכני הלמידה והמשימות בקטלוג, המבטיח מעבר היררכי ומדורג בין שלבי מודל VRA לאורך 8 המפגשים.

## **ב. מצב המערכת והפצת מנת העדכונים (Batch)**

השרת הוא מקור האמת עבור הגדרות התרגילים. הקטלוג מנהל את 7 תרגילי החובה ואת משימות הבחירה (ביסוס מול אתגר).

**עדכון אסינכרוני מוגן (Firestore Batch Writes):** עדכוני תרגילים המופצים על ידי מנהל המערכת במהלך שיעור פעיל מוחלים בצד התלמיד אך ורק על תרגילים שטרם נפתחו בפועל (Pending or Unstarted Worksheets). תרגיל פעיל שפתרונו החל אינו מופרע.

כל תרגיל בקטלוג מוגדר לפי הטיפוס ExerciseTemplate (נספח א', סעיף 2), והוא משויך למסלול למידה יחיד בשדה learning\_path. עבור כל מפגש בטווח 3 עד 7 מוגדרים שני מאגרים נפרדים ובלתי תלויים של שבעה תרגילי חובה: מאגר אחד עבור green\_path בתחום הרבבה עד 10,000, ומאגר שני עבור remediation\_path בתחום המאה והאלף עד 1,000. המערכת טוענת לתלמיד אך ורק את המאגר התואם לערך teacher\_selected\_path שאושר עבורו בשער אישור המורה (מודול 20). חל איסור מוחלט על טעינת תרגילים ממאגר שאינו תואם למסלול המאושר.

## **ג. אירוע המשתמש**

מנהל המערכת מעדכן תבנית תרגיל בקטלוג ומאשר הפצה.

## **ד. התוצאה הצפויה**

הפצת השינויים ברקע. התלמידים ממשיכים לעבוד בצורה חלקית, והתרגיל המעודכן נטען בצורה שקופה רק בעת מעבר למשימה החדשה, ללא רענון דף.

## **ה. חוזה נתונים והתנהגות בזמן כשל**

במקרה של כשל בשידור ה-Batch, מתבצע ביטול מלא (Rollback) בשרת. התלמידים ממשיכים לעבוד עם גרסת המטמון האחרונה ב-Zustand.

## **ו. תלויות במודולים אחרים**

מודולים 4, 14, 17, 29\.

## **ז. בדיקה קוגניטיבית**

**נתון:** תלמיד פותר את תרגיל 4 במפגש 6\. האדמין מעדכן את תבנית תרגיל 5\. **תוצאה:** הממשק אינו קופא. עם השלמת תרגיל 4 ומעבר לתרגיל 5, התבנית החדשה נטענת ברוגע מהשרת.

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Construct a master curriculum catalog console to configure worksheet equations for sessions 1 to 8\. Segment task definitions between 7 compulsory problems and optional early completion tracks (Consolidation vs. Challenge). Push curriculum updates asynchronously using Firestore Batch Writes, applying changes exclusively to pending or unstarted worksheets to prevent workspace corruption during live sessions. Define every catalog exercise as an ExerciseTemplate (Appendix A §2) bound to exactly one learning\_path. For each of sessions 3 through 7, maintain two fully independent banks of seven compulsory exercises: one for green\_path scoped to the myriad range up to 10,000, and one for remediation\_path scoped to hundreds and thousands up to 1,000. Load exercises strictly from the bank matching that learner's approved teacher\_selected\_path from Module 20\. Never load, prefetch, or fall back to an exercise from the non-matching bank under any circumstance.*

# **מודול 27: מודול מדיניות אבטחה והגבלות גלובליות** *(Global Firestore Security Rules Spec)*

## **א. הטריגר הפדגוגי**

הגנה הרמטית על שלמות מסד הנתונים והסודיות המחקרית באמצעות אכיפת הרשאות קשיחות בצד השרת בלבד.

## **ב. מצב המערכת וחוקי ה-Firestore Rules**

כל הגישות למסד הנתונים מוכפפות לחוקי אבטחה שלמים (Atomic) בצד השרת:

4. **תלמידים (תפקיד Student):** קריאה: מורשים לקרוא אך ורק את מסמך התלמיד האישי שלהם (/students/{studentId}). חסומים מקריאת אוספי כיתות או תלמידים אחרים. כתיבה: מורשים לכתוב במסמכי telemetry\_logs ו-workspace\_states אך ורק אם מזהה התלמיד במסמך (student\_id) תואם במדויק את מזהה ה-Auth המאומת שלהם (1–12), והמטען עומד בסכימת TelemetryDetailsMap (כולל כלל ה-column\_index ממודול 5).

5. **מורים (תפקיד Teacher):** קריאה: מורשים לקרוא נתוני טלמטריה ומצבי עבודה של תלמידי הכיתה המשויכת אליהם בלבד (class\_id). כתיבה: מורשים לעדכן שדות אישור מורה (teacher\_gate\_approved, gate\_approved\_at, gate\_approved\_by) ופרופילי תמיכה (support\_profile\_id וסביבתו). חסומים משינוי הגדרות ניהול גלובליות.

6. **מפתחות וסודות:** מפתחות API פרטיים והגדרות AI שמורים ב-Google Cloud Secret Manager בלבד ואינם נחשפים ללקוח.

## **ג. אירוע המשתמש**

ניסיון גישה או כתיבה למסד הנתונים.

## **ד. התוצאה הצפויה**

אישור מוחלט אם הבקשה תואמת במדויק את הכללים, או דחייה קשיחה HTTP 403 (Permission Denied) ללא חשיפת פרטי מערכת.

## **ה. חוזה נתונים והתנהגות בזמן כשל**

במקרה של דחיית אבטחה, הלקוח מזהה את שגיאת ה-403, מבצע Rollback למצב הבטוח האחרון ב-Zustand, ומציג חיווי שקט.

## **ו. תלויות במודולים אחרים**

כל מודולי המערכת (1–29).

## **ז. בדיקה קוגניטיבית**

**תרחיש:** לקוח תלמיד 2 מנסה לעדכן את מסמך תלמיד 5\. **תוצאה:** השרת דוחה את הבקשה מיד ב-403 Forbidden.

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Enforce bulletproof Firestore Security Rules code patterns. Block student role auth tokens from writing or reading classes and students collections, restricting their read access solely to their own student document. Allow student write permissions to telemetry\_logs strictly if the incoming log's student\_id matches the authenticated token ID (1-12) and the payload matches the per-event-type schema in TelemetryDetailsMap. Deny client access to server configs and private API keys, securing them inside Google Cloud Secret Manager.*

# **מודול 28: מודול תמיכה ותקשורת ניהולית** *(Admin Support Hub Spec)*

## **א. הטריגר הפדגוגי**

ניהול ותיעוד פניות תמיכה מקצועיות בצורה מאובטחת, המבטיחה הגנה קשיחה על פרטיות הלומדים ומניעה מוחלטת של זליגת מידע אישי.

## **ב. מצב המערכת ולוח הניהול**

מרכז הפניות מציג למנהל המערכת הודעות נכנסות מערוצי השיח של המורים (מודול 22).

* **אנונימיזציה בשכבת התצוגה:** המערכת מציגה פניות בטבלה נקייה הממוינת לפי school\_id ו-class\_name. כל הודעה המוצגת באדמין עוברת סינון ומציגה מזהים אנונימיים 1–12 בלבד.

* **עדכון בזמן אמת:** הממשק מפעיל Snapshot Listener ל-Firestore ומציג מחוון התראות שקט ועדין (Silent Badge Indicator) בסרגל הניווט העליון, ללא רעש חזותי או רענון דף.

## **ג. אירוע המשתמש**

מורה שלחה הודעת התייעצות בערוץ השיח.

## **ד. התוצאה הצפויה**

הודעה חדשה מופיעה בטבלת התמיכה של האדמין כרונולוגית, עם מחוון עדין בסרגל הניהול, כשהיא נקייה מ-PII.

## **ה. חוזה נתונים והתנהגות בזמן כשל**

במקרה של ניתוק רשת באדמין, המערכת מציגה את הפניות האחרונות שנשמרו במטמון ומחדשת את המאזין עם חידוש החיבור.

## **ו. תלויות במודולים אחרים**

מודולים 4, 22, 24, 27\.

## **ז. בדיקה קוגניטיבית**

**תרחיש:** פניית תמיכה מגיעה מהמורה בכיתת "המבקרים". **תוצאה:** האדמין רואה פנייה המשויכת ל"בית ספר ביקורת, המבקרים" עם התייחסות ל"תלמיד 8", ללא שמות פרטיים.

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Architect admin support ticketing dashboard to display incoming streams from teacher chat modules. Enforce complete anonymity at visualization layer, ensuring zero PII or pupil names are displayed. Filter and sanitize ticket contents via Cloud Functions, displaying strictly anonymous student IDs (1-12) linked to school\_id and class\_name. Integrate Firestore Snapshot listeners rendering a silent badge alert indicator in the global menu without full page reloads.*

# **מודול 29: מודול ניהול מצב גלובלי ומכונות מצבים** *(Zustand & State Machine Spec)*

## **א. הטריגר הפדגוגי**

הבטחת עקביות ממשק וסנכרון מלא של נתוני הלמידה בכל המודולים של מודל הייצוג הדיגיטלי (VRA), תוך מניעת תסכול או הצפה חושית כתוצאה משגיאות סנכרון ממשק.

## **ב. מפרט חנויות Zustand ומכונת המצבים הדקלרטיבית (Declarative State Machine)**

ניהול המצב המקומי מופרד ל-3 חנויות Zustand בלתי תלויות:

4. **useWorkspaceStore:** מנהל את מצב מרחב העבודה, הבלוקים, הטורים והמקלדת.

5. **useTeacherStore:** מנהל את מצבי הרדאר, המקרן והאישורים בדשבורד המורה.

6. **useAuthStore:** מנהל את אסמכתת ההזדהות, הדרכון האנונימי והתפקיד הפעיל.

**מכונת המצבים של מרחב העבודה (VRA Workspace State Machine):**

* **IDLE:** הסביבה מוכנה, משימה טרם נטענה.

* **PROBLEM\_ACTIVE:** תרגיל נטען, קנבס ומקלדת פעילים.

* **REGROUPING\_ACTIVE:** אירוע המרה פעיל (צירוף עשר או פריטה). עבור לומדים תחת פרופיל תמיכה קוגניטיבי מוגבר בלבד המקלדת ננעלת עד לאישור המרה מוצלח, בהתאם למודול 9\. עבור לומדים תחת פרופיל תמיכה רגיל המקלדת נותרת פתוחה לחלוטין גם במצב זה.

* **SOCRATIC\_ACTIVE:** טריגר היסוס (45 שנ') או מחיקות (4) הופעלו. מגירת החניכה נפתחת. תשובה שגויה נועלת לחצנים ל-30 שניות.

* **COMPLETE:** התרגיל פותר בהצלחה, מעבר לתרגיל הבא או לשער האישור.

## **ג. מעבר מצבים וסנכרון אופליין**

כל מעבר מצב ב-Zustand מייצר אירוע לוגי הנכתב במלואו לתור ה-IndexedDB (מודול 17). ברשת פעילה, הסנכרון ל-Firestore מתבצע ברקע לפי סדר FIFO קשוח.

**הנחיות פיתוח נוקשות (Strict Developer Instructions)**

*Implement global state management using decoupled Zustand stores for workspace, teacher, and auth states. Define a declarative state machine representing student VRA environment transitions (IDLE, PROBLEM\_ACTIVE, REGROUPING\_ACTIVE, SOCRATIC\_ACTIVE, COMPLETE); these five values are canonical and must match VRAWorkspaceState in Appendix A exactly. Bind Zustand state changes to a local synchronization engine that buffers all actions to IndexedDB during offline sessions. Dispatch buffered actions asynchronously in chronological sequence using a strict FIFO queue upon reconnection to avoid race conditions and maintain database consistency.*

# **נספח א': חוזה טיפוסים מרכזי *(Core TypeScript Interfaces & Data Contracts)***

להלן הגדרות ה-TypeScript הרשמיות והמחייבות לכל רכיבי המערכת. חל איסור על שימוש בשמות שדות שונים בקוד. זהו מקור האמת היחיד במקרה של אי-התאמה בין נספח זה לבין ניסוח פרוזה בגוף המודולים.

## **1\. Auth & User Identity Schemas**

export type UserRole \= 'STUDENT' | 'TEACHER' | 'ADMIN';  
   
export interface AnonymousStudent {  
  student\_id: number; // Strictly 1 to 12  
  class\_id: string;  
  school\_id: string;  
  created\_at: number; // Client/Server timestamp  
  support\_profile\_id: 'enhanced\_cognitive\_support' | null;  
  support\_profile\_version: number;  
  support\_profile\_updated\_at: number | null;  
  support\_profile\_updated\_by: string | null; // teacher\_id  
  active\_session\_id: string | null;  
}

## **2\. Firestore Document Schemas**

export interface ClassDocument {  
  class\_id: string;  
  school\_id: string;  
  class\_name: 'המבקרים'; // Strictly set for pilot  
  class\_type: string;  
  active\_session\_id: string | null;  
  projector\_mode: boolean;  
  projector\_mode\_updated\_at: number;  
  updated\_by\_teacher\_id: string | null;  
}  
   
export interface SessionDocument {  
  session\_id: string;  
  class\_id: string;  
  session\_number: number; // 1 to 8  
  session\_start\_time: number;  
  session\_deadline\_time: number;  
  active\_exercise\_id: string;  
  is\_completed: boolean;  
  session\_score\_percent: number | null;  
  teacher\_gate\_approved: boolean;  
  gate\_approved\_at: number | null;  
  gate\_approved\_by: string | null;  
  teacher\_selected\_path: 'green\_path' | 'remediation\_path' | null;  
  matrix\_recommended\_path: 'green\_path' | 'remediation\_path' | null;  
}  
   
export interface ExerciseTemplate {  
  exercise\_template\_id: string;  
  session\_number: number; // 1 to 8  
  order\_index: number; // 1 to 7 for compulsory  
  learning\_path: 'green\_path' | 'remediation\_path';  
  path\_type: 'compulsory' | 'consolidation' | 'challenge';  
  operation: 'addition' | 'subtraction' | 'representation' | 'inquiry';  
  operand\_a: number;  
  operand\_b: number | null;  
  expected\_result: number;  
  required\_regroupings: number; // 0 to 3  
  regrouping\_columns: number\[\]; // column indices requiring regrouping  
  label: string;  
  blocks\_visible: boolean;  
  socratic\_enabled: boolean;  
}

## **3\. Telemetry & Offline Queue Schemas**

export type TelemetryEventType \=  
  | 'SESSION\_START'  
  | 'PROBLEM\_LOAD'  
  | 'BLOCK\_DRAG\_COMPLETE'  
  | 'REGROUPING\_TRIGGERED'  
  | 'REGROUPING\_SUCCESS'  
  | 'DIGIT\_ENTERED'  
  | 'DIGIT\_DELETED'  
  | 'UNDO\_EXECUTED'  
  | 'HESITATION\_DETECTED'  
  | 'SOCRATIC\_CARD\_SHOWN'  
  | 'SOCRATIC\_OPTION\_SELECTED'  
  | 'PROBLEM\_COMPLETE'  
  | 'REFLECTION\_SUBMITTED';  
   
export interface SessionStartDetails { session\_number: number; }  
   
export interface ProblemLoadDetails {  
  exercise\_template\_id: string;  
  path\_type: 'compulsory' | 'consolidation' | 'challenge';  
}  
   
export interface BlockDragCompleteDetails {  
  block\_value: number; // Strictly 1, 10, 100, or 1000  
  source\_column\_index: number | null;  
}  
   
export interface RegroupingTriggeredDetails {  
  regrouping\_type: 'decomposition' | 'composition';  
}  
   
export interface RegroupingSuccessDetails {  
  regrouping\_type: 'decomposition' | 'composition';  
  duration\_ms: number;  
}  
   
export interface DigitEnteredDetails {  
  digit\_value: number; // 0-9  
  is\_correct: boolean | null; // null when the exercise defines no target digit for that column  
}  
   
export interface DigitDeletedDetails { deleted\_digit\_value: number | null; }  
   
export interface UndoExecutedDetails {  
  undo\_stack\_depth\_before: number; // 1-10  
  reverted\_event\_type: TelemetryEventType;  
}  
   
export interface HesitationDetectedDetails { hesitation\_seconds: number; }  
   
export interface SocraticCardShownDetails {  
  trigger\_reason: 'hesitation\_45s' | 'consecutive\_errors\_4' | 'consecutive\_undos\_3';  
  error\_category: 'calculation' | 'procedural' | 'conceptual' | null;  
}  
   
export interface SocraticOptionSelectedDetails {  
  option\_id: 'opt\_1' | 'opt\_2' | 'opt\_3';  
  is\_correct: boolean;  
}  
   
export interface ProblemCompleteDetails {  
  total\_duration\_ms: number;  
  undo\_count: number;  
  error\_count: number;  
}  
   
export interface ReflectionSubmittedDetails {  
  reflection\_step: 1 | 2 | 3;  
  effort\_score: 'LOW' | 'MEDIUM' | 'HIGH' | null;  
  selected\_strategies: Array\<'UNDO\_BUTTON' | 'MEMORY\_CIRCLES' | 'SOCRATIC\_CARD'\> | null;  
  persistence\_index: number | null;  
}  
   
export interface TelemetryDetailsMap {  
  SESSION\_START: SessionStartDetails;  
  PROBLEM\_LOAD: ProblemLoadDetails;  
  BLOCK\_DRAG\_COMPLETE: BlockDragCompleteDetails;  
  REGROUPING\_TRIGGERED: RegroupingTriggeredDetails;  
  REGROUPING\_SUCCESS: RegroupingSuccessDetails;  
  DIGIT\_ENTERED: DigitEnteredDetails;  
  DIGIT\_DELETED: DigitDeletedDetails;  
  UNDO\_EXECUTED: UndoExecutedDetails;  
  HESITATION\_DETECTED: HesitationDetectedDetails;  
  SOCRATIC\_CARD\_SHOWN: SocraticCardShownDetails;  
  SOCRATIC\_OPTION\_SELECTED: SocraticOptionSelectedDetails;  
  PROBLEM\_COMPLETE: ProblemCompleteDetails;  
  REFLECTION\_SUBMITTED: ReflectionSubmittedDetails;  
}  
   
export interface TelemetryPayload\<T extends TelemetryEventType \= TelemetryEventType\> {  
  idempotency\_key: string;  
  client\_timestamp: number;  
  session\_id: string;  
  student\_id: number; // Strictly 1-12  
  exercise\_id: string;  
  event\_type: T;  
  column\_index?: number; // 0: Ones, 1: Tens, 2: Hundreds, 3: Thousands  
  details: TelemetryDetailsMap\[T\];  
}  
   
export interface OfflineQueueItem {  
  idempotency\_key: string;  
  client\_timestamp: number;  
  session\_id: string;  
  student\_id: number;  
  exercise\_id: string;  
  operation\_type: TelemetryEventType;  
  payload: TelemetryDetailsMap\[TelemetryEventType\];  
  retry\_count: number;  
}

## **4\. SRL Reflection Board Schemas**

export interface SRLReflectionState {  
  session\_id: string;  
  student\_id: number;  
  reflection\_step: 1 | 2 | 3;  
  effort\_score: 'LOW' | 'MEDIUM' | 'HIGH' | null;  
  selected\_strategies: Array\<'UNDO\_BUTTON' | 'MEMORY\_CIRCLES' | 'SOCRATIC\_CARD'\>;  
  persistence\_index: number;  
  reflection\_completed: boolean;  
  reflection\_updated\_at: number;  
  idempotency\_key: string;  
}

## **5\. VRA Workspace State Machine Types**

export type VRAWorkspaceState \=  
  | 'IDLE' | 'PROBLEM\_ACTIVE' | 'REGROUPING\_ACTIVE' | 'SOCRATIC\_ACTIVE' | 'COMPLETE';  
   
export interface VRAWorkspaceStore {  
  currentState: VRAWorkspaceState;  
  activeColumnIndex: number;  
  onesCount: number;  
  tensCount: number;  
  hundredsCount: number;  
  thousandsCount: number;  
  memoryCircles: Record\<number, number\>;  
  undoStack: Array\<Record\<string, unknown\>\>; // Restricted to max 10  
  hesitationTimerSeconds: number;  
  consecutiveErrorCount: number;  
  isSocraticCardLocked: boolean;  
  socraticLockDeadline: number | null;  
  transitionTo: (newState: VRAWorkspaceState) \=\> void;  
  resetHesitationTimer: () \=\> void;  
  pushUndoSnapshot: (snapshot: Record\<string, unknown\>) \=\> void;  
  popUndoSnapshot: () \=\> Record\<string, unknown\> | null;  
}

## **6\. Gemini Socratic Contract (ref. Module 13\)**

export interface GeminiSocraticRequest {  
  student\_id: number;  
  session\_id: string;  
  exercise\_id: string;  
  active\_column\_index: number;  
  workspace\_state: {  
    ones\_count: number;  
    tens\_count: number;  
    hundreds\_count: number;  
    thousands\_count: number;  
    memory\_circles: Record\<string, number\>;  
  };  
  recent\_actions: TelemetryPayload\<TelemetryEventType\>\[\];  
}  
   
export interface GeminiSocraticResponse {  
  error\_category: 'calculation' | 'procedural' | 'conceptual';  
  guiding\_question: string;  
  options: \[  
    { id: 'opt\_1'; option\_text: string; feedback\_text: string; is\_correct: boolean },  
    { id: 'opt\_2'; option\_text: string; feedback\_text: string; is\_correct: boolean },  
    { id: 'opt\_3'; option\_text: string; feedback\_text: string; is\_correct: boolean }  
  \];  
}

## **7\. Gemini Pedagogical Report Contract (ref. Module 23\)**

```ts
export interface GeminiReportRequest {
  student_id: number; // Strictly 1-12
  session_id: string;
  session_number: number;
  session_score_percent: number;
  recommendation_tier: 'below_50' | 'between_50_75' | 'above_75';
  failed_exercises: ExerciseTemplate[];
  telemetry_summary: TelemetryPayload<TelemetryEventType>[];
}

export interface GeminiReportResponse {
  knowledge_gaps: string[];
  teaching_recommendations: string[];
}
```

