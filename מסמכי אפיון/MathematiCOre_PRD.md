# מסמך דרישות מוצר מפורט (Master PRD v3.3)
## פלטפורמת הלמידה ההיברידית "מתמטיקאור" (MathematiCOre)
**מספר גרסה:** Version 3.3  
**תאריך עדכון:** August 14, 2026  
**שעת עדכון:** 13:07  
**סטטוס:** Approved for Development  

---

## חלק א: שער הכניסה, בקרת הרשאות וניהול זהויות

### 1. מודול כניסה והזדהות (Login Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: יצירת שער כניסה מאובטח השומר על פרטיות מוחלטת של הלומד על בסיס מודל VRA דיגיטלי בלבד ומבטיח תחילת עבודה ללא חסמים רגשיים.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: מסך כניסה בעל רקע נקי הכולל כפתור כניסת מורים באמצעות Google SSO בלבד עבור דוא"ל מורשה (davidsep@edu-haifa.org.il או davsapiash@gmail.com), ותהליך כניסת תלמידים מדורג: בחירת בית ספר ביקורת, בחירת כיתה המבקרים, בחירת מספר תלמיד מתוך אחד עד 12, ותיבת קלט נקייה להקלדת קוד הגישה 10203040. חל איסור מוחלט על הצגת רמזים, סיסמאות ברירת מחדל או טקסטים מקדימים בשדות הקלט בממשק המורה והתלמיד.
3. **לוגיקת אינטראקציה ומכונת המצבים**: המערכת פועלת במצב Idle עד לזיהוי קליק, ואז עוברת למצב Auth Redirect באמצעות Google SSO עבור מורים מורשים בלבד, או לתהליך מדורג וחד-כיווני עבור תלמידים: בחירת בית ספר ביקורת -> בחירת כיתה המבקרים -> בחירת מספר תלמיד בין אחד ל-12 -> הזנת קוד גישה 10203040.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של ניתוק רשת בעת בקשת אימות המערכת תציג חיווי ניסיון חוזר שקט ובמקרה של לחיצה כפולה מהירה המערכת תתעלם מהקלט השני ובמקרה של קלט לא תקין המערכת תבצע איפוס.
5. **דרישות מרווחים נגישות וביצועים**: זמן תגובה לאימות חייב להיות פחות מ 200ms וכל שטחי ההקלקה יוגדרו בגודל של לפחות 48 פיקסלים.
6. **מבנה נתונים ושדות בסיס הנתונים**: שמירת student ID מסוג Integer בטווח של אחד עד 12 בלבד עבור 12 תלמידי הפיילוט.
7. **לוגיקת שחזור וריענון דפדפן**: המערכת תשמור את מזהה התלמיד ב Local Storage ותבצע בדיקת תקינות מול השרת בכל רענון דף.
8. **מניעת לולאות עדכון בזמן אמת**: המערכת תשתמש במנגנון Throttle על כפתורי הבחירה כדי למנוע שליחת בקשות מרובות לבסיס הנתונים בטווח זמן של 500ms.
9. **Strict Bilingual Developer Instructions**: Developer Instruction: Eradiate all CRA terminology and physical object references. All design specifications and code structures must implement the VRA model only. No placeholders or hints allowed on input elements. Keep student profiles strictly anonymous using numeric IDs 1 to 12 with zero persona names in UI. Teachers login must rely exclusively on Google SSO restricted to davidsep@edu-haifa.org.il and davsapiash@gmail.com. Students login flow is strictly sequential: School Dropdown selecting "בית ספר ביקורת" -> Class Dropdown selecting "המבקרים" -> Compact Numeric Keypad for ID selection (1 to 12) -> Password input accepting strictly the value 10203040.
10. **תרחיש בדיקה קוגניטיבי מפורט**: המשתמש מגיע למסך ומבין מיד האם עליו לבחור בנתיב המורה או בנתיב התלמיד מבלי ללחוץ על אלמנטים שגויים.

---

### 2. מודול מיתוג תפקידים (Role Switcher Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: מניעת גישה לא מורשית לממשקים שאינם רלוונטיים לתפקיד המשתמש תוך הבטחת עבודה בנתיב מוגדר.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: חלונית בחירה מרכזית בגודל 600 על 400 פיקסלים ושני כפתורי פעולה בולטים בצבעי כחול ולבן המציגים מורה ומנהל.
3. **לוגיקת אינטראקציה ומכונת המצבים**: המערכת מזהה טוקן JWT ובמקרה של הרשאה כפולה עוברת למצב Role Selection ולאחר בחירה מעדכנת את הסטור הגלובלי ועוברת למצב Route Locked.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של ניסיון מעקף כתובת ה-URL המערכת תחסום גישה ובמקרה של פקיעת טוקן המערכת תבצע ריענון ובמקרה של בחירה לא חוקית המערכת תנעל.
5. **דרישות מרווחים נגישות וביצועים**: מעבר בין תפקידים חייב להתבצע בתוך 100ms.
6. **מבנה נתונים ושדות בסיס הנתונים**: שדה role מסוג String בתוך ה-JWT.
7. **לוגיקת שחזור וריענון דפדפן**: המערכת תשמור את התפקיד שנבחר בזיכרון המקומי ותטען אותו מחדש אוטומטית לאחר כל רענון.
8. **מניעת לולאות עדכון בזמן אמת**: ביצוע ה-Role Check יתבצע פעם אחת בלבד בעת טעינת האפליקציה.
9. **Strict Bilingual Developer Instructions**: Guard routes using react router guards. If a user token contains dual claims present a blocking selection screen. Save the chosen role in the global store and lock down all unauthorized API endpoints immediately. Use declarative state management to handle role transitions.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם המשתמש יודע מהו התפקיד שנבחר וכיצד לשנות אותו במידת הצורך בתוך דשבורד המשתמש.

---

### 3. מודול אבטחה ואנונימיזציה (Zero PII Identity Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: הבטחת עמידה מלאה בתקני פרטיות באמצעות אנונימיזציה מוחלטת של כל נתוני המשתמש.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: אין רכיבי ממשק נראים כיוון שהמודול פועל בשכבת הלוגיקה של בסיס הנתונים.
3. **לוגיקת אינטראקציה ומכונת המצבים**: המערכת פועלת כפילטר קבוע וכל בקשת כתיבה נבדקת למציאת שדות אסורים לפני אישור הפעולה.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של שליחת שם תלמיד המערכת תחסום את הכתיבה ובמקרה של ניסיון כתיבת מספר זהות המערכת תדחה ובמקרה של שליחת אובייקט לא תקין המערכת תעצור.
5. **דרישות מרווחים נגישות וביצועים**: ולידציה חייבת להתבצע תוך 50ms בכל בקשה.
6. **מבנה נתונים ושדות בסיס הנתונים**: אסור להשתמש בשדות כמו שם או אימייל אלא רק ב student ID בין אחד ל 12.
7. **לוגיקת שחזור וריענון דפדפן**: לא רלוונטי כיוון שהאבטחה נאכפת בצד השרת בכל קריאה.
8. **מניעת לולאות עדכון בזמן אמת**: כל בקשת שרת עוברת דרך חוקי האבטחה של פיירבייס ללא צורך ב Debounce.
9. **Strict Bilingual Developer Instructions**: Database rules must reject any write operation containing fields like name email or phone. Enforce database schema constraints restricting student ID field strictly to integer values between one and 12. Use server side validation for all incoming telemetry data packets.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם הנתונים הנשלחים מכילים פרטים מזהים בבסיס הנתונים ואם כן האם המערכת עוצרת אותם בזמן.

---

## חלק ב: ארכיטקטורת בסיס הנתונים וסכמות הנתונים

### 4. סכמת אוספי בסיס הנתונים (Firestore Collections Schema Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: הגדרת מבנה נתונים קשיח המבטיח יציבות, ביצועים גבוהים לאורך זמן ותמיכה מלאה במיון וסינון של קבוצות מחקר.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: אין רכיבי ממשק.
3. **לוגיקת אינטראקציה ומכונת המצבים**: ניהול סנכרון נתונים אסינכרוני מול פיירבייס.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של קונפליקט במיזוג נתונים המערכת תתעדף את השרת ובמקרה של מסמך חסר המערכת תיצור רשומה ריקה ובמקרה של כתיבה ללא הרשאה המערכת תחסום.
5. **דרישות מרווחים נגישות וביצועים**: זמן אחזור נתונים מקסימלי 150ms.
6. **מבנה נתונים ושדות בסיס הנתונים**: אוספי classes (הכולל שדות קשיחים: school_id, class_name כגון "המבקרים", ו-class_type כגון כיתת ביקורת או כיתת ניסוי), students, sessions ו-telemetry logs.
7. **לוגיקת שחזור וריענון דפדפן**: המערכת משתמשת ב Snapshot Listeners כדי לשחזר את מצב האפליקציה מיד בעת חיבור.
8. **מניעת לולאות עדכון בזמן אמת**: הגדרת Batch Updates לכל קבוצת נתונים כדי למנוע קריאות מרובות.
9. **Strict Bilingual Developer Instructions**: Developer Instruction: Eradiate all CRA terminology and physical object references. All design specifications and code structures must implement the VRA model only. Ensure the Firestore classes collection schema contains fields for school_id, class_name, and class_type to allow dynamic research data partitioning between control and experiment groups. Ensure student documents contain zero PII and restrict student_id strictly to integers between 1 and 12 for the 12 pilot students.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם המידע בבסיס הנתונים תואם את המבנה המוגדר ואם לא האם המערכת מתריעה.

---

### 5. סכמת נתוני מיקרו פעילות (Telemetry JSON Payload Schema Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: איסוף דאטה מדויק המאפשר ניתוח פדגוגי עמוק של כל פעולת למידה.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: אין רכיבי ממשק.
3. **לוגיקת אינטראקציה ומכונת המצבים**: המערכת מייצרת אובייקט JSON בכל אירוע ממשק.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של מטען בגודל מעל 50KB המערכת תעצור שליחה ובמקרה של שדה חסר המערכת תוסיף ערך ברירת מחדל ובמקרה של הפרש זמנים לא תקין המערכת תתקן.
5. **דרישות מרווחים נגישות וביצועים**: דחיסת נתונים בזמן אמת.
6. **מבנה נתונים ושדות בסיס הנתונים**: log ID מסוג String ו student ID מסוג Integer ו action type מסוג String.
7. **לוגיקת שחזור וריענון דפדפן**: הנתונים נשמרים בתור מקומי עד לאישור שרת.
8. **מניעת לולאות עדכון בזמן אמת**: הגדרת אירועי טלמטריה לפי פעולות לוגיות בלבד ולא לפי תנועות עכבר רציפות.
9. **Strict Bilingual Developer Instructions**: Construct the exact JSON payload format for every client workspace action event. The payload must include nested objects for block coordinates and action timestamps. Validate payload size before every database update.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם המערכת מצליחה לתעד אירוע למידה בודד ללא אובדן נתונים.

---

## חלק ג: מרחב הלמידה של התלמיד ומנוע VRA

### 6. מודול לובי התלמיד (Student Hub Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: הפחתת עומס קוגניטיבי על ידי הצגת מפגש פעיל יחיד בלבד.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: כרטיס יחיד במרכז המסך ברוחב 400 פיקסלים וגובה 200 פיקסלים.
3. **לוגיקת אינטראקציה ומכונת המצבים**: מצב Active Sessions בלבד.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של אין מפגש המערכת תציג הודעת המתנה ובמקרה של רשת איטית המערכת תציג טעינה עדינה ובמקרה של מפגש פג תוקף המערכת תחסום.
5. **דרישות מרווחים נגישות וביצועים**: ממשק מינימליסטי ללא אלמנטים מיותרים.
6. **מבנה נתונים ושדות בסיס הנתונים**: session ID מסוג Integer.
7. **לוגיקת שחזור וריענון דפדפן**: רענון נתונים מהשרת בכל כניסה ללובי.
8. **מניעת לולאות עדכון בזמן אמת**: משיכת נתונים פעם אחת בלבד בעת טעינת הלובי.
9. **Strict Bilingual Developer Instructions**: Render a clean dashboard displaying only the current active session object fetched from the student state database document. Render all other sessions as disabled and completely hidden from view. Keep local state updated with latest session ID.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם התלמיד מבין שהכרטיס שמוצג הוא המפגש היחיד והאם הוא יודע איך להתחיל.

---

### 7. מודול לוח בית המספרים הדיגיטלי (Place Value Chart Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: מתן ארגון ויזואלי ברור לחישובים מתמטיים מורכבים במודל VRA.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: ארבעה עמודות קבועות בגודל 150 על 400 פיקסלים כל אחת.
3. **לוגיקת אינטראקציה ומכונת המצבים**: מצב Active Column ומצב Dimmed Sibling.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של לחיצה על מספר טורים המערכת תבחר את האחרון ובמקרה של רזולוציית מסך נמוכה המערכת תתאים גודל ובמקרה של גרירה לטור לא חוקי המערכת תחזיר למיקום מקורי.
5. **דרישות מרווחים נגישות וביצועים**: עמעום 40 אחוזים לטורים לא פעילים.
6. **מבנה נתונים ושדות בסיס הנתונים**: column ID מסוג String.
7. **לוגיקת שחזור וריענון דפדפן**: שמירת הטור הפעיל בזיכרון המקומי.
8. **מניעת לולאות עדכון בזמן אמת**: נעילת אינטראקציה בטורים שאינם פעילים.
9. **Strict Bilingual Developer Instructions**: Developer Instruction: Eradiate all CRA terminology and physical object references. All design specifications and code structures must implement the VRA model only. Implement CSS filter properties for brightness control in the digital place value chart. Sibling columns must receive class dimmed column with brightness 0.6 and pointer events disabled when a specific column is active for calculation. Keep student input anonymous and prevent visual overload with zero placeholders or hints.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם התלמיד מזהה איזה טור הוא הפעיל ביותר וכיצד הוא עובר בין טורים.

---

### 8. מודול לבני דינס וירטואליות (Dienes Blocks Engine Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: המחשת פעולות חשבוניות בצורה מוחשית המקדמת חשיבה מופשטת.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: אובייקטים תלת ממדיים ושטחי קליטה שיוגדלו ב 30 פיקסלים.
3. **לוגיקת אינטראקציה ומכונת המצבים**: מצב Dragging ומצב Magnetic Snap.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של שחרור מחוץ לשטח המערכת תבצע אנימציית חזרה ובמקרה של שחרור לא מדויק המערכת תבצע הצמדה ובמקרה של פירוק ללא מספיק מקום המערכת תתריע.
5. **דרישות מרווחים נגישות וביצועים**: רנדור ב 60fps.
6. **מבנה נתונים ושדות בסיס הנתונים**: coordinates מסוג Array of Integers.
7. **לוגיקת שחזור וריענון דפדפן**: שמירת מיקומי הקוביות ב Local Storage.
8. **מניעת לולאות עדכון בזמן אמת**: שימוש ב RequestAnimationFrame לעדכון מיקומים.
9. **Strict Bilingual Developer Instructions**: Developer Instruction: Eradiate all CRA terminology and physical object references. All design specifications and code structures must implement the VRA model only. Use WebGL or HTML5 Canvas for smooth digital block manipulation at 60fps. Implement magnetic snap physics in drop targets. Log conversion events PLACE VALUE CONVERSION only at logical milestones. Ensure the physics engine calculates collision detection within the expanded drop zones.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם הלומד מצליח לגרור ולהצמיד את הבלוקים למקום הנכון מבלי שהם יחזרו למקומם בטעות.

---

### 9. מודול מקלדת דינמית וגשר VRA דיגיטלי (Dynamic Keyboard and VRA Bridge Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: מתן סביבת הזנת נתונים מבוקרת המשתנה בהתאם להתקדמות הלמידה של התלמיד.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: שורת תוצאה בתחתית ומקלדת בעלת מצבי נעילה.
3. **לוגיקת אינטראקציה ומכונת המצבים**: מצב Locked ומצב Unlocked.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של הקלדה בזמן נעילה המערכת תתעלם ובמקרה של לחיצה מהירה המערכת תגביל קלט ובמקרה של המרה שגויה המערכת תשאיר נעול.
5. **דרישות מרווחים נגישות וביצועים**: זמן תגובה פחות מ 50ms לשינוי מצב.
6. **מבנה נתונים ושדות בסיס הנתונים**: locked מסוג Boolean.
7. **לוגיקת שחזור וריענון דפדפן**: מצב המקלדת נשמר בסנכרון עם השרת.
8. **מניעת לולאות עדכון בזמן אמת**: מניעת אירועי Input כפולים.
9. **Strict Bilingual Developer Instructions**: Developer Instruction: Eradiate all CRA terminology and physical object references. All design specifications and code structures must implement the VRA model only. Implement conditional column keyboard locking in worksheet addition steps during dynamic exchange operations, while keeping memory circles active for working memory relief. Listen for conversion success event to trigger state change. Validate input format against the current exercise requirement with zero placeholders or hints.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם הלומד מבין מדוע המקלדת נעולה ואיזו פעולה הוא צריך לבצע כדי לשחרר את הנעילה.

---

### 10. מודול לוח חיבור אדפטיבי מבוקר (Symmetrical Addition Grid Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: מתן רשת ביטחון ויזואלית ללומדים המתקשים בחישוב עצמאי.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: לוח מוסתר בגודל משתנה.
3. **לוגיקת אינטראקציה ומכונת המצבים**: מצב Fade In ומצב Fade Out.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של הסתרה מוקדמת המערכת תמתין ובמקרה של לחיצה על כפתור המערכת תאפס טיימר ובמקרה של קלט מהיר המערכת תבצע פעולה.
5. **דרישות מרווחים נגישות וביצועים**: השהיה של 45 שניות לזיהוי קושי.
6. **מבנה נתונים ושדות בסיס הנתונים**: visibility מסוג Boolean.
7. **לוגיקת שחזור וריענון דפדפן**: המצב נשמר בזיכרון המקומי של המפגש.
8. **מניעת לולאות עדכון בזמן אמת**: מניעת רינדור מיותר באמצעות Local State בלבד.
9. **Strict Bilingual Developer Instructions**: Control grid visibility via React local state. Apply Framer Motion transitions for fade in over 2500ms and auto fade out over 3000ms triggered by successful key input. Ensure the visibility logic is decoupled from main database write operations.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם הלומד מבין מתי הלוח מופיע ומתי הוא נעלם.

---

### 11. מודול כפתור ביטול פעולה פדגוגי (Undo Action Engine Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: חיזוק החוסן הרגשי על ידי מתן לגיטימציה לטעות והפיכתה.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: כפתור בפינה ימנית עליונה בגודל 48 על 48 פיקסלים.
3. **לוגיקת אינטראקציה ומכונת המצבים**: סטאק של מצבים קודמים.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של סטאק ריק המערכת תעמעם כפתור ובמקרה של ביטול מהיר המערכת תבצע Undo רצוף ובמקרה של סנכרון כושל המערכת תמנע Undo.
5. **דרישות מרווחים נגישות וביצועים**: תגובה מיידית ללא השהיה.
6. **מבנה נתונים ושדות בסיס הנתונים**: state stack מסוג Array.
7. **לוגיקת שחזור וריענון דפדפן**: הסטאק נשמר בזיכרון המקומי בלבד.
8. **מניעת לולאות עדכון בזמן אמת**: הגבלת גודל סטאק ל 10 פעולות.
9. **Strict Bilingual Developer Instructions**: Developer Instruction: Eradiate all CRA terminology and physical object references. All design specifications and code structures must implement the VRA model only. Maintain a client side stack of historical states. Pop states on click to restore block canvas positions and input values without triggering error flags in telemetry logs. Ensure unlimited reversible error support via Undo without penalty.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם הלומד יודע כיצד לבטל את הפעולה האחרונה ללא חשש מתוצאות.

---

## חלק ד: מנוע החניכה הסוקרטי ומפרט אינטגרציית ג'מיני

### 12. מודול חונכות סוקרטית דינמית (Socratic Mentoring Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: תיווך לימודי אישי בזמן אמת המונע תסכול.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: כרטיס צידי בגודל 300 על 500 פיקסלים.
3. **לוגיקת אינטראקציה ומכונת המצבים**: מצב Active Question ומצב Locked Buttons.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של שגיאת שרת המערכת תציג רמז סטטי ובמקרה של זמן תגובה איטי המערכת תמתין ובמקרה של תלמיד לא עונה המערכת תעבור לחימום.
5. **דרישות מרווחים נגישות וביצועים**: טיימר של 60 שניות.
6. **מבנה נתונים ושדות בסיס הנתונים**: hint ID מסוג String.
7. **לוגיקת שחזור וריענון דפדפן**: המצב נשמר בסנכרון עם השרת.
8. **מניעת לולאות עדכון בזמן אמת**: מניעת עדכון מצב ללא פעולת משתמש.
9. **Strict Bilingual Developer Instructions**: Developer Instruction: Eradiate all CRA terminology and physical object references. All design specifications and code structures must implement the VRA model only. Trigger socratic mentoring card upon 45 seconds of hesitation or three deletion actions. Apply a 60 second input block only on the active socratic card buttons upon incorrect answer, keeping the rest of the workspace and undo features fully functional. Do not show text placeholders or hints on input fields.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם הלומד מבין את השאלה המנחה וכיצד לבחור את התשובה המתאימה.

---

### 13. מפרט סכמת API של מנוע ג'מיני בשרת (Gemini API Schema Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: הפקת רמזים איכותיים מבוססי בינה מלאכותית ללא חשיפת לוגיקה למשתמש.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: אין.
3. **לוגיקת אינטראקציה ומכונת המצבים**: קריאת Cloud Functions מאובטחת.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של API Timeout המערכת תנסה שנית ובמקרה של JSON לא תקין המערכת תדחה ובמקרה של מפתח לא תקף המערכת תדווח.
5. **דרישות מרווחים נגישות וביצועים**: זמן תגובה פחות מ 200ms.
6. **מבנה נתונים ושדות בסיס הנתונים**: JSON עם שדות question text ו options ו fallback hint.
7. **לוגיקת שחזור וריענון דפדפן**: שימוש ב Cache מקומי לרמזים חוזרים.
8. **מניעת לולאות עדכון בזמן אמת**: מניעת קריאות מרובות לאותה שאלה.
9. **Strict Bilingual Developer Instructions**: Enforce response format verification inside Socratic Cloud Function. If API fails, fallback to predefined static pedagogical hints database array to guarantee zero interface disruptions. Encrypt API keys in server environment variables.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם ה-API מחזיר את המבנה הנכון בזמן סביר.

---

## חלק ה: מפגשי הלמידה, רפלקציה ועבודה מחוץ לרשת

### 14. מודול מפגשים 1 עד 8 ומנוע תרגילים (Worksheet and Session Progression Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: הבטחת רצף למידה הדרגתי.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: רשימת תרגילים ליניארית.
3. **לוגיקת אינטראקציה ומכונת המצבים**: מצב Active Problem.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של דילוג לא חוקי המערכת תחסום ובמקרה של ניתוק רשת המערכת תשמור מצב ובמקרה של תרגיל פגום המערכת תדלג.
5. **דרישות מרווחים נגישות וביצועים**: מעבר מהיר בין תרגילים.
6. **מבנה נתונים ושדות בסיס הנתונים**: current problem index מסוג Integer.
7. **לוגיקת שחזור וריענון דפדפן**: המצב נשמר בשרת באופן קבוע.
8. **מניעת לולאות עדכון בזמן אמת**: מניעת קריאות כפולות לשרת.
9. **Strict Bilingual Developer Instructions**: Enforce worksheet execution parameters. Keep active problem index in React state. Settle exercise score calculation strictly on compulsory problems to maintain a fair database comparison.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם הלומד מבין איזה תרגיל הוא פותר כרגע וכיצד הוא מתקדם לתרגיל הבא.

---

### 15. מודול ארגז חול דיגיטלי מונחה ומצב מקרן (Sandbox and Projector Mode Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: מתן מרחב התנסות ללא ציון.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: מסך נעול במצב מקרן.
3. **לוגיקת אינטראקציה ומכונת המצבים**: מצב Projector Active.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של שליטה כפולה המערכת תחסום ובמקרה של איבוד חיבור המערכת תעבור לאוף ליין ובמקרה של בקשה לא מזוהה המערכת תתעלם.
5. **דרישות מרווחים נגישות וביצועים**: נעילה מיידית של לקוח.
6. **מבנה נתונים ושדות בסיס הנתונים**: projector mode מסוג Boolean.
7. **לוגיקת שחזור וריענון דפדפן**: רענון סטטוס מהמורה.
8. **מניעת לולאות עדכון בזמן אמת**: מניעת פקודות סותרות מהמורה.
9. **Strict Bilingual Developer Instructions**: Implement a projector mode state that locks student client rendering to null while accepting master control input commands from the teacher portal. Ensure student interaction is blocked entirely in this state.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם הלומד יודע כיצד להשתמש בארגז החול והאם המערכת מונעת הפרעות במצב מקרן.

---

### 16. מודול לוח רפלקציה תלת שלבי (SRL Reflection Board Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: עידוד מודעות עצמית ואסטרטגיית למידה.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: שלושה שלבים עוקבים.
3. **לוגיקת אינטראקציה ומכונת המצבים**: מצב Reflection Step מ אחד עד שלושה.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של סגירת דפדפן המערכת תשמור שלב ובמקרה של חזרה אחורה המערכת תתיר ובמקרה של נתונים חסרים המערכת תמנע המשך.
5. **דרישות מרווחים נגישות וביצועים**: ממשק שקט ללא הסחות.
6. **מבנה נתונים ושדות בסיס הנתונים**: reflection data מסוג Object.
7. **לוגיקת שחזור וריענון דפדפן**: שמירה בבסיס הנתונים בכל שלב.
8. **מניעת לולאות עדכון בזמן אמת**: מניעת סבב נתונים ללא גמר.
9. **Strict Bilingual Developer Instructions**: Render the SRL Board inside a multi step container. Save reflection results directly to reflection log collection under the anonymous student ID. Validate that all three steps are completed before final submission.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם הלומד מבין את התהליך הרפלקטיבי ומה מצופה ממנו בכל שלב.

---

### 17. מודול עבודה במצב לא מקוון ותור סנכרון (Offline Queue and Local Storage Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: הבטחת המשכיות למידה ללא תלות ברשת.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: אין.
3. **לוגיקת אינטראקציה ומכונת המצבים**: מצב Online ומצב Queueing.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של זיכרון מלא המערכת תמחק עתיק ובמקרה של סנכרון כושל המערכת תנסה שנית ובמקרה של התנגשות מידע המערכת תעלה גרסה מאוחרת.
5. **דרישות מרווחים נגישות וביצועים**: שקיפות מלאה למשתמש.
6. **מבנה נתונים ושדות בסיס הנתונים**: pending payloads מסוג Array.
7. **לוגיקת שחזור וריענון דפדפן**: המערכת טוענת את התור מ IndexedDB.
8. **מניעת לולאות עדכון בזמן אמת**: ביצוע סנכרון ב Batch בלבד.
9. **Strict Bilingual Developer Instructions**: Intercept failed network requests. Queue transaction payloads into indexedDB or local storage. Monitor window online event to dispatch the queued payloads asynchronously in FIFO sequence.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם הנתונים מסתנכרנים כראוי עם חידוש החיבור לרשת.

---

## חלק ו: דשבורד המורה וניהול הכיתה

### 18. מודול רדאר פדגוגי שקט (Silent Radar Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: קבלת תמונת מצב כיתתית ללא צורך בהתערבות פעילה.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: גריד של שלושה על ארבעה משבצות בגודל 100 על 100 פיקסלים.
3. **לוגיקת אינטראקציה ומכונת המצבים**: מצב Status Green או Yellow או Red.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של נתונים חסרים המערכת תציג אפור ובמקרה של עומס נתונים המערכת תבצע Batch ובמקרה של תלמיד מתנתק המערכת תעדכן משבצת.
5. **דרישות מרווחים נגישות וביצועים**: זמן תגובה של 1000ms.
6. **מבנה נתונים ושדות בסיס הנתונים**: status color מסוג String.
7. **לוגיקת שחזור וריענון דפדפן**: עדכון מצב מהשרת.
8. **מניעת לולאות עדכון בזמן אמת**: צמצום קריאות ל Snapshot.
9. **Strict Bilingual Developer Instructions**: Developer Instruction: Eradiate all CRA terminology and physical object references. All design specifications and code structures must implement the VRA model only. Implement the Teacher Dashboard with a fixed 12-slot Silent Radar grid representing the 12 active students, using background color shifts only to reflect real-time process data without layout reflows or popup alerts. Sort strictly by numeric student ID 1 to 12 with zero student names displayed.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם המורה מבין את משמעות צבעי הרדאר וכיצד לפעול בהתאם.

---

### 19. מודול הקמת כיתה ואפיון פרופילים (Class Management and Profiles Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: מתן התאמות אישיות בשקט מוחלט.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: פאנל הגדרות בדשבורד מורה.
3. **לוגיקת אינטראקציה ומכונת המצבים**: מצב Toggle Config.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של שגיאת כתיבה המערכת תתריע למורה ובמקרה של פרופיל לא תקף המערכת תחסום ובמקרה של נתונים לא נשמרו המערכת תציג חיווי.
5. **דרישות מרווחים נגישות וביצועים**: אין חיווי לתלמיד.
6. **מבנה נתונים ושדות בסיס הנתונים**: enhanced cognitive support profile מסוג Boolean.
7. **לוגיקת שחזור וריענון דפדפן**: נשמר בשרת.
8. **מניעת לולאות עדכון בזמן אמת**: מניעת עדכון בטעות.
9. **Strict Bilingual Developer Instructions**: Provide a silent configuration panel within the teacher class dashboard. Toggling user properties must save enhanced cognitive support profile as boolean true or false in DB without triggering UI flags on pupil clients.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם המורה יודע להפעיל פרופיל לתלמיד מבלי שהדבר ייראה על מסך התלמיד.

---

### 20. מודול שער אישור מורה קשיח (Teacher Gate Approval Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: הבטחת עמידה ביעדי למידה לפני מעבר לשלב הבא.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: מסך המתנה לתלמיד.
3. **לוגיקת אינטראקציה ומכונת המצבים**: מצב Blocked ו Unblocked.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של אישור אוטומטי המערכת תתריע ובמקרה של אישור מותנה המערכת תמתין ובמקרה של שגיאת רשת המערכת תחסום.
5. **דרישות מרווחים נגישות וביצועים**: Redirect מהיר.
6. **מבנה נתונים ושדות בסיס הנתונים**: teacher gate approved מסוג Boolean.
7. **לוגיקת שחזור וריענון דפדפן**: סנכרון סטטוס מהשרת.
8. **מניעת לולאות עדכון בזמן אמת**: מניעת מעקף הלקוח.
9. **Strict Bilingual Developer Instructions**: Enforce asynchronous check in route controller. If session Completed matches session two restrict client navigation to session three. Redirect students to waiting view until teacher gate approved value changes to true.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם התלמיד מבין מדוע המערכת ממתינה לאישור המורה.

---

### 21. מודול נגן שחזור וקטורי (Vector Replay Engine Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: כלי אבחון למורה להבנת תהליכי חשיבה.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: נגן וידאו וקטורי.
3. **לוגיקת אינטראקציה ומכונת המצבים**: מצב Play ומצב Scrubbing.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של לוג חסר המערכת תציג שגיאה ובמקרה של פורמט לא תואם המערכת תתריע ובמקרה של נגן נתקע המערכת תבצע איפוס.
5. **דרישות מרווחים נגישות וביצועים**: תאימות ל iframe.
6. **מבנה נתונים ושדות בסיס הנתונים**: telemetry logs מסוג Object.
7. **לוגיקת שחזור וריענון דפדפן**: אין.
8. **מניעת לולאות עדכון בזמן אמת**: מניעת עומס רינדור.
9. **Strict Bilingual Developer Instructions**: Construct a replay component that recreates state canvas movements by chronologically drawing database telemetry JSON coordinate streams inside a controlled iframe canvas container. Use requestAnimationFrame for smooth playback.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם המורה יכול לצפות בשחזור של פעולת תלמיד בבירור.

---

### 22. מודול ערוץ שיח אסינכרוני למורה (Teacher Admin Chat Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: מתן מענה טכני למורה.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: צ'אט צדדי.
3. **לוגיקת אינטראקציה ומכונת המצבים**: מצב Message Sending.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של זיהוי PII המערכת תחסום הודעה ובמקרה של ניתוק מהשרת המערכת תתריע ובמקרה של הודעה ארוכה מדי המערכת תקטע.
5. **דרישות מרווחים נגישות וביצועים**: תגובת שרת מהירה.
6. **מבנה נתונים ושדות בסיס הנתונים**: message thread מסוג Array.
7. **לוגיקת שחזור וריענון דפדפן**: טעינת היסטוריה מהשרת.
8. **מניעת לולאות עדכון בזמן אמת**: הגבלת קצב שליחה.
9. **Strict Bilingual Developer Instructions**: Provide an integrated message thread system with strict text filtering regex that automatically strips out potential pupil private identifiers or name credentials prior to database transmission.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם הצ'אט מאפשר תקשורת בטוחה ללא סיכון לפרטיות.

---

### 23. מודול דוחות ואנליטיקה פדגוגית (Reports and Insights Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: הפקת תובנות למידה.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: ממשק יצוא PDF.
3. **לוגיקת אינטראקציה ומכונת המצבים**: מצב Report Generation.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של נתונים ריקים המערכת תדווח ובמקרה של דוח גדול המערכת תבצע Background Task ובמקרה של שגיאת שרת המערכת תתריע.
5. **דרישות מרווחים נגישות וביצועים**: שרת Node.js.
6. **מבנה נתונים ושדות בסיס הנתונים**: report data מסוג Object.
7. **לוגיקת שחזור וריענון דפדפן**: דוח שמור בשרת.
8. **מניעת לולאות עדכון בזמן אמת**: מניעת הרצה כפולה.
9. **Strict Bilingual Developer Instructions**: Query completed worksheets data using MapReduce scripts. Generate PDF output files on the server using Node.js or Firebase Functions to be served as read only downloadable documents.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם הדוח מכיל מידע רלוונטי שקל להבין אותו.

---

## חלק ז: ממשק ניהול מערכת

### 24. מודול סקירת מערכת כוללת (Admin Overview Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: בקרה על מדדים גלובליים.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: לוח מחוונים מרכזי.
3. **לוגיקת אינטראקציה ומכונת המצבים**: מצב Data Aggregation.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של עומס בשרת המערכת תציג Cached ובמקרה של מדד לא תקין המערכת תסמן באדום ובמקרה של נתונים חסרים המערכת תציג אפס.
5. **דרישות מרווחים נגישות וביצועים**: תצוגה גלובלית בלבד.
6. **מבנה נתונים ושדות בסיס הנתונים**: aggregated metrics מסוג Object.
7. **לוגיקת שחזור וריענון דפדפן**: רענון נתונים תקופתי.
8. **מניעת לולאות עדכון בזמן אמת**: תדירות עדכון של שעה.
9. **Strict Bilingual Developer Instructions**: Build a high level analytics dashboard presenting global aggregated system usage statistics without exposing granular school level telemetry streams.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם מנהל המערכת מקבל תמונה נכונה של המצב הגלובלי.

---

### 25. מודול ניהול בתי ספר, כיתות ומורים (Schools and Teachers Wizard Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: ניהול ארגוני מבוקר.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: אשף שלבים.
3. **לוגיקת אינטראקציה ומכונת המצבים**: מצב Wizard Setup.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של קיבולת יתר המערכת תחסום ובמקרה של מורה לא מורשה המערכת תתריע ובמקרה של רשומה קיימת המערכת תמנע כפל.
5. **דרישות מרווחים נגישות וביצועים**: ולידציה מלאה.
6. **מבנה נתונים ושדות בסיס הנתונים**: school ID מסוג String.
7. **לוגיקת שחזור וריענון דפדפן**: אין.
8. **מניעת לולאות עדכון בזמן אמת**: שמירה ב Batch.
9. **Strict Bilingual Developer Instructions**: Create a step by step creation wizard. Database configuration rules must strictly enforce the teacher student ratio boundaries and pilot class sizes limitations.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם המנהל מצליח להקים בית ספר ללא שגיאות.

---

### 26. מודול קטלוג תוכנית הלימודים (Curriculum and Task Catalog Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: עדכון תוכן לימודי.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: טבלאות עריכה.
3. **לוגיקת אינטראקציה ומכונת המצבים**: מצב Sync.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של קטלוג פגום המערכת תחסום פרסום ובמקרה של סנכרון כושל המערכת תתריע ובמקרה של נתונים חסרים המערכת תמנע שמירה.
5. **דרישות מרווחים נגישות וביצועים**: זמינות מלאה לכל הלקוחות.
6. **מבנה נתונים ושדות בסיס הנתונים**: curriculum data מסוג Array.
7. **לוגיקת שחזור וריענון דפדפן**: הפצה אוטומטית.
8. **מניעת לולאות עדכון בזמן אמת**: מניעת עדכון לא מורשה.
9. **Strict Bilingual Developer Instructions**: Expose an interface managing curriculum tables in the DB. Ensure updates in task templates propagate in real time to student worksheets stores.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם המערכת משקפת את העדכונים האחרונים בתוכנית הלימודים.

---

### 27. מודול מדיניות אבטחה והגבלות גלובליות (Global Security and Settings Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: הגנה על השרת.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: לוח אבטחה.
3. **לוגיקת אינטראקציה ומכונת המצבים**: מצב Enforcement.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של חוקים לא תקינים המערכת תמנע הטמעה ובמקרה של ניסיון פריצה המערכת תחסום ובמקרה של הגדרות חסרות המערכת תמנע גישה.
5. **דרישות מרווחים נגישות וביצועים**: הגנה מהלקוח.
6. **מבנה נתונים ושדות בסיס הנתונים**: security rules מסוג Object.
7. **לוגיקת שחזור וריענון דפדפן**: סנכרון מיידי.
8. **מניעת לולאות עדכון בזמן אמת**: מניעת שינוי מקומי.
9. **Strict Bilingual Developer Instructions**: Enforce Firestore Security Rules restricting read or write endpoints based on verified JWT role claims. Prevent client access to key configuration environment variables.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם המנהל רואה את כל הגדרות האבטחה בצורה ברורה.

---

### 28. מודול תמיכה ותקשורת ניהולית (Admin Support Hub Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: מענה טכני למורים.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: דשבורד פניות.
3. **לוגיקת אינטראקציה ומכונת המצבים**: מצב Ticket Open.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של פניות אבודות המערכת תרשום ובמקרה של פנייה ללא טקסט המערכת תחסום ובמקרה של תגובה כושלת המערכת תתריע.
5. **דרישות מרווחים נגישות וביצועים**: התראות פעילות.
6. **מבנה נתונים ושדות בסיס הנתונים**: support tickets מסוג Array.
7. **לוגיקת שחזור וריענון דפדפן**: טעינת לוגים מהשרת.
8. **מניעת לולאות עדכון בזמן אמת**: מניעת התראות שווא.
9. **Strict Bilingual Developer Instructions**: Centralize incoming ticket logs from teacher admin chat modules. Implement active notifications indicators inside the admin global workspace.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם המנהל יודע לטפל בפניות בזמן.

---

## חלק ח: שכבת התשתית, ניהול המצב ואינטגרציית השרת

### 29. מודול ניהול מצב גלובלי ומכונות מצבים (Zustand and State Machines Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: הבטחת עקביות ממשק מלאה בכל המודולים.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: ללא תשתית פנימית.
3. **לוגיקת אינטראקציה ומכונת המצבים**: ניהול כל הסטייטים ב Zustand.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של אי עקביות בסטייט המערכת תבצע איפוס ובמקרה של זיכרון חסר המערכת תגביל אובייקטים ובמקרה של עדכון כושל המערכת תעצור.
5. **דרישות מרווחים נגישות וביצועים**: decoupled stores.
6. **מבנה נתונים ושדות בסיס הנתונים**: global state מסוג Object.
7. **לוגיקת שחזור וריענון דפדפן**: שמירה מלאה של כל המצב.
8. **מניעת לולאות עדכון בזמן אמת**: שימוש ב Selectors ממוקדים.
9. **Strict Bilingual Developer Instructions**: Architect a modular client global state using Zustand. Keep workspace store teacher store and authentication credentials store decoupled. Write robust state transition functions using declarative frameworks to manage UI state changes based on non nullable telemetry input actions.
10. **תרחיש בדיקה קוגניטיבי מפורט**: המערכת שומרת על עקביות הנתונים בכל שלב של העבודה ומוודאת עמידה בכל חוקי היסוד הגלובליים ללא תקלות.
