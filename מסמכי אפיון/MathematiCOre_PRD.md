# מסמך דרישות מוצר מפורט (Master PRD v3.4)
## פלטפורמת הלמידה ההיברידית "מתמטיקאור" (MathematiCOre)
**מספר גרסה:** Version 3.4  
**תאריך עדכון:** August 14, 2026  
**שעת עדכון:** 13:07  
**סטטוס:** Approved for Development  

---

## חלק א: שער הכניסה, בקרת הרשאות וניהול זהויות

### 1. מודול כניסה והזדהות (Login Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: יצירת שער כניסה מאובטח השומר על פרטיות מוחלטת של הלומד על בסיס מודל VRA דיגיטלי בלבד ומבטיח תחילת עבודה ללא חסמים רגשיים.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: מסך כניסה בעל רקע נקי הכולל כפתור כניסת מורים באמצעות Google SSO בלבד עבור דוא"ל מורשה (davidsep@edu-haifa.org.il), ותהליך כניסת תלמידים מדורג: בחירת בית ספר ביקורת, בחירת כיתה המבקרים, בחירת מספר תלמיד מתוך אחד עד 12, ותיבת קלט נקייה להקלדת קוד הגישה 10203040. חל איסור מוחלט על הצגת רמזים, סיסמאות ברירת מחדל או טקסטים מקדימים בשדות הקלט בממשק המורה והתלמיד.
3. **לוגיקת אינטראקציה ומכונת המצבים**: המערכת פועלת במצב Idle עד לזיהוי קליק, ועוברת למצב Auth Redirect באמצעות Google SSO עבור מורים, או לתהליך מדורג וחד-כיווני עבור תלמידים: בית ספר -> כיתה -> מזהה תלמיד 1 עד 12 -> קוד גישה 10203040.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של ניתוק רשת בעת בקשת אימות המערכת תציג חיווי ניסיון חוזר שקט ובמקרה של לחיצה כפולה מהירה המערכת תתעלם מהקלט השני ובמקרה של קלט לא תקין המערכת תבצע איפוס.
5. **דרישות מרווחים נגישות וביצועים**: זמן תגובה לאימות פחות מ-200ms, שטחי הקלקה בגודל 48px לפחות, ומנגנון Throttle של 500ms על כפתורי הבחירה.
6. **מבנה נתונים ושדות בסיס הנתונים**: שמירת student ID מסוג Integer בטווח 1 עד 12 ב-Local Storage ובסיס הנתונים (`student_user1` עד `student_user12`).
7. **לוגיקת שחזור וריענון דפדפן**: המערכת תשמור את מזהה התלמיד ב-Local Storage ותבצע בדיקת תקינות מול השרת בכל רענון דף.
8. **מניעת לולאות עדכון בזמן אמת**: המערכת תשתמש במנגנון Throttle על כפתורי הבחירה כדי למנוע שליחת בקשות מרובות לבסיס הנתונים בטווח זמן של 500ms.
9. **Strict Bilingual Developer Instructions**: Eradiate all CRA terminology and physical object references. All design specifications and code structures must implement the VRA model only. No placeholders or hints allowed on input elements. Keep student profiles strictly anonymous using numeric IDs 1 to 12 with zero persona names in UI. Teachers login must rely exclusively on Google SSO restricted to davidsep@edu-haifa.org.il. Students login flow is strictly sequential: School Dropdown selecting "בית ספר ביקורת" -> Class Dropdown selecting "המבקרים" -> Compact Numeric Keypad for ID selection (1 to 12) -> Password input accepting strictly the value 10203040.
10. **תרחיש בדיקה קוגניטיבי מפורט**: המשתמש מגיע למסך ומבין מיד האם עליו לבחור בנתיב המורה או בנתיב התלמיד מבלי ללחוץ על אלמנטים שגויים.

---

### 2. מודול מיתוג תפקידים (Role Switcher Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: מניעת גישה לא מורשית לממשקים שאינם רלוונטיים לתפקיד המשתמש תוך הבטחת עבודה בנתיב מוגדר.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: חלונית בחירה מרכזית בגודל 600x400 פיקסלים הכוללת שני כפתורי פעולה בולטים המציגים מורה ומנהל.
3. **לוגיקת אינטראקציה ומכונת המצבים**: המערכת מזהה טוקן JWT ובמקרה של הרשאה כפולה עוברת למצב Role Selection. לאחר בחירה, מעדכנת את הסטור הגלובלי ועוברת למצב Route Locked.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של ניסיון מעקף כתובת ה-URL המערכת תחסום גישה ובמקרה של פקיעת טוקן המערכת תבצע ריענון ובמקרה של בחירה לא חוקית המערכת תנעל.
5. **דרישות מרווחים נגישות וביצועים**: ניתוח הרשאות בעת טעינת האפליקציה ומעבר תפקיד תוך פחות מ-100ms.
6. **מבנה נתונים ושדות בסיס הנתונים**: שמירת שדה role מסוג String בתוך ה-JWT ובזיכרון המקומי.
7. **לוגיקת שחזור וריענון דפדפן**: המערכת תשמור את התפקיד שנבחר בזיכרון המקומי ותטען אותו מחדש אוטומטית לאחר כל רענון.
8. **מניעת לולאות עדכון בזמן אמת**: ביצוע ה-Role Check יתבצע פעם אחת בלבד בעת טעינת האפליקציה.
9. **Strict Bilingual Developer Instructions**: Guard routes using react router guards. If a user token contains dual claims present a blocking selection screen. Save the chosen role in the global store and lock down all unauthorized API endpoints immediately. Use declarative state management to handle role transitions.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם המשתמש יודע מהו התפקיד שנבחר וכיצד לשנות אותו במידת הצורך בתוך דשבורד המשתמש.

---

### 3. מודול אבטחה ואנונימיזציה (Zero PII Identity Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: הבטחת עמידה מלאה בתקני פרטיות באמצעות אנונימיזציה מוחלטת של כל נתוני המשתמש.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: חסימה מוחלטת של שדות PII (שם, דוא"ל, טלפון, תעודת זהות) ושימוש במזהים מספריים בלבד (student ID בין 1 ל-12).
3. **לוגיקת אינטראקציה ומכונת המצבים**: פילטר קבוע בשכבת השרת וחוקי אבטחה ב-Firestore וב-Realtime Database הדוחים כל בקשת כתיבה עם שדות מזהים.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של שליחת שם תלמיד המערכת תחסום את הכתיבה ובמקרה של ניסיון כתיבת מספר זהות המערכת תדחה ובמקרה של שליחת אובייקט לא תקין המערכת תעצור.
5. **דרישות מרווחים נגישות וביצועים**: ולידציה בצד השרת לכל מטעני הטלמטריה תוך פחות מ-50ms לכל בקשה.
6. **מבנה נתונים ושדות בסיס הנתונים**: הגבלת שדה student ID למספר שלם בטווח 1 עד 12 בלבד.
7. **לוגיקת שחזור וריענון דפדפן**: אכיפת הרשאות ואנונימיזציה בכל קריאת שרת.
8. **מניעת לולאות עדכון בזמן אמת**: כל בקשת שרת עוברת דרך חוקי האבטחה המאומתים.
9. **Strict Bilingual Developer Instructions**: Database rules must reject any write operation containing fields like name email or phone. Enforce database schema constraints restricting student ID field strictly to integer values between one and 12. Use server side validation for all incoming telemetry data packets.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם הנתונים הנשלחים מכילים פרטים מזהים בבסיס הנתונים ואם כן האם המערכת עוצרת אותם בזמן.

---

## חלק ב: ארכיטקטורת בסיס הנתונים וסכמות הנתונים

### 4. סכמת אוספי בסיס הנתונים (Firestore Collections Schema Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: הגדרת מבנה נתונים קשיח המבטיח יציבות, ביצועים גבוהים לאורך זמן ותמיכה מלאה במיון וסינון של קבוצות מחקר.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: האוספים כוללים: classes, students, sessions ו-telemetry logs.
3. **לוגיקת אינטראקציה ומכונת המצבים**: ניהול סנכרון נתונים אסינכרוני מול Firebase.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של קונפליקט במיזוג נתונים המערכת תתעדף את השרת ובמקרה של מסמך חסר המערכת תיצור רשומה ריקה ובמקרה של כתיבה ללא הרשאה המערכת תחסום.
5. **דרישות מרווחים נגישות וביצועים**: שימוש ב-Snapshot Listeners וב-Batch Updates לביצועים אופטימליים עם זמן אחזור מקסימלי של 150ms.
6. **מבנה נתונים ושדות בסיס הנתונים**: אוסף classes כולל שדות קשיחים: school_id, class_name ("המבקרים"), ו-class_type (כיתת ביקורת/ניסוי). אוסף students מגביל מזהי תלמידים לטווח 1-12.
7. **לוגיקת שחזור וריענון דפדפן**: שחזור מיידי בעת חיבור דרך מאזינים אסינכרוניים.
8. **מניעת לולאות עדכון בזמן אמת**: הגדרת Batch Updates לכל קבוצת נתונים כדי למנוע קריאות מרובות.
9. **Strict Bilingual Developer Instructions**: Developer Instruction: Eradiate all CRA terminology and physical object references. All design specifications and code structures must implement the VRA model only. Ensure the Firestore classes collection schema contains fields for school_id, class_name, and class_type to allow dynamic research data partitioning between control and experiment groups. Ensure student documents contain zero PII and restrict student_id strictly to integers between 1 and 12 for the 12 pilot students.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם המידע בבסיס הנתונים תואם את המבנה המוגדר ואם לא האם המערכת מתריעה.

---

### 5. סכמת נתוני מיקרו פעילות (Telemetry JSON Payload Schema Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: איסוף דאטה מדויק המאפשר ניתוח פדגוגי עמוק של כל פעולת למידה.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: יצירת אובייקט JSON תקני הכולל log ID (String), student ID (Integer 1-12) ו-action type (String).
3. **לוגיקת אינטראקציה ומכונת המצבים**: המערכת מייצרת ומדוחסת אובייקט JSON בכל אירוע ממשק לוגי (ללא מעקב עכבר רציף).
4. **תרחישי קצה וטיפול בשגיאות ממשק**: ולידציית גודל מטען עד 50KB לפני כל שליחה ובמקרה של שדה חסר המערכת תוסיף ערך ברירת מחדל.
5. **דרישות מרווחים נגישות וביצועים**: דחיסת נתונים בזמן אמת ושידור מהיר.
6. **מבנה נתונים ושדות בסיס הנתונים**: log ID מסוג String, student ID מסוג Integer 1-12, ו-action type מסוג String.
7. **לוגיקת שחזור וריענון דפדפן**: שמירה בתור מקומי עד לאישור שרת.
8. **מניעת לולאות עדכון בזמן אמת**: הגדרת אירועי טלמטריה לפי פעולות לוגיות בלבד ולא לפי תנועות עכבר רציפות.
9. **Strict Bilingual Developer Instructions**: Construct the exact JSON payload format for every client workspace action event. The payload must include nested objects for block coordinates and action timestamps. Validate payload size before every database update.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם המערכת מצליחה לתעד אירוע למידה בודד ללא אובדן נתונים.

---

## חלק ג: מרחב הלמידה של התלמיד ומנוע VRA

### 6. מודול לובי התלמיד (Student Hub Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: הפחתת עומס קוגניטיבי על ידי הצגת מפגש פעיל יחיד בלבד מרשימת המפגשים.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: כרטיס יחיד במרכז המסך (400x200 פיקסלים).
3. **לוגיקת אינטראקציה ומכונת המצבים**: שליפת אובייקט המפגש הפעיל שמתעדכן מבסיס הנתונים (session ID מסוג Integer). שאר המפגשים מוגדרים במצב Disabled ומוסתרים לחלוטין.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של היעדר מפגש המערכת תציג הודעת המתנה ובמקרה של רשת איטית המערכת תציג טעינה עדינה.
5. **דרישות מרווחים נגישות וביצועים**: ממשק מינימליסטי ומרגיע ללא עומס חזותי.
6. **מבנה נתונים ושדות בסיס הנתונים**: session ID מסוג Integer.
7. **לוגיקת שחזור וריענון דפדפן**: משיכת נתונים פעם אחת בעת טעינת הלובי וסנכרון ה-Local State.
8. **מניעת לולאות עדכון בזמן אמת**: קריאה חד-פעמית ומעקב מבוסס אירועים.
9. **Strict Bilingual Developer Instructions**: Render a clean dashboard displaying only the current active session object fetched from the student state database document. Render all other sessions as disabled and completely hidden from view. Keep local state updated with latest session ID.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם התלמיד מבין שהכרטיס שמוצג הוא המפגש היחיד והאם הוא יודע איך להתחיל.

---

### 7. מודול לוח בית המספרים הדיגיטלי (Place Value Chart Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: מתן ארגון ויזואלי ברור לחישובים מתמטיים מורכבים במודל VRA דיגיטלי.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: ארבע עמודות קבועות (150x400 פיקסלים) המציגות את טורי החישוב העשרוניים.
3. **לוגיקת אינטראקציה ומכונת המצבים**: יישום מחלקות CSS לעמעום טורים (brightness 0.6) ונעילת pointer-events בטורים שאינם פעילים בעת חישוב.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של לחיצה על מספר טורים המערכת תבחר את הטור הפעיל האחרון ובמקרה של גרירה לטור לא חוקי המערכת תחזיר למיקום מקורי.
5. **דרישות מרווחים נגישות וביצועים**: מניעת עומס חזותי ללא רמזים או טקסטים מקדימים.
6. **מבנה נתונים ושדות בסיס הנתונים**: שמירת הטור הפעיל (column ID מסוג String) ב-Local Storage.
7. **לוגיקת שחזור וריענון דפדפן**: שמירת הטור הפעיל בזיכרון המקומי וטעינתו מחדש.
8. **מניעת לולאות עדכון בזמן אמת**: נעילת אינטראקציה בטורים שאינם פעילים.
9. **Strict Bilingual Developer Instructions**: Developer Instruction: Eradiate all CRA terminology and physical object references. All design specifications and code structures must implement the VRA model only. Implement CSS filter properties for brightness control in the digital place value chart. Sibling columns must receive class dimmed column with brightness 0.6 and pointer events disabled when a specific column is active for calculation. Keep student input anonymous and prevent visual overload with zero placeholders or hints.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם התלמיד מזהה איזה טור הוא הפעיל ביותר וכיצד הוא עובר בין טורים.

---

### 8. מודול לבני דינס וירטואליות (Dienes Blocks Engine Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: המחשת פעולות חשבוניות בצורה מוחשית המקדמת חשיבה מופשטת על ידי מניפולציה וירטואלית בלבני דינס דיגיטליות, כולל גרירה, פריטה והקבצה.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: מנוע גרפי מבוסס HTML5 Canvas / WebGL להצגת הבלוקים הדיגיטליים ב-60fps והרחבת שטחי השמיטה ב-30px.
3. **לוגיקת אינטראקציה ומכונת המצבים**: יישום מנוע פיזיקלי להצמדה מגנטית (Magnetic Snap) ותיעוד אירועי PLACE_VALUE_CONVERSION בלוגים.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: שחרור מחוץ לשטח מפעיל אנימציית חזרה חלקה, ושחרור באזור המורחב מבצע הצמדה מדויקת.
5. **דרישות מרווחים נגישות וביצועים**: רינדור חלק ב-60fps ללא עיכובי תנועה.
6. **מבנה נתונים ושדות בסיס הנתונים**: שמירת מיקומי הבלוקים במערך קואורדינטות ב-Local Storage ובטלמטריה.
7. **לוגיקת שחזור וריענון דפדפן**: שחזור קואורדינטות הבלוקים מתוך ה-State המקומי בעת רענון.
8. **מניעת לולאות עדכון בזמן אמת**: תיעוד אירועים רק באבני דרך לוגיות.
9. **Strict Bilingual Developer Instructions**: Developer Instruction: Eradiate all CRA terminology and physical object references. All design specifications and code structures must implement the VRA model only. Use WebGL or HTML5 Canvas for smooth digital block manipulation at 60fps. Implement magnetic snap physics in drop targets. Log conversion events PLACE VALUE CONVERSION only at logical milestones. Ensure the physics engine calculates collision detection within the expanded drop zones.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם הלומד מצליח לגרור ולהצמיד את הבלוקים למקום הנכון מבלי שהם יחזרו למקומם בטעות.

---

### 9. מודול מקלדת דינמית וגשר VRA דיגיטלי (Dynamic Keyboard and VRA Bridge Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: קלט: 1. במצבי חיבור והקבצה: סימון מדויק של עשר לבני יחידות או עשר עשרות בלוח בית המספרים. המערכת מזהה זאת ומציגה כפתור צף ייעודי של פעולת הקבץ ליד הלבנים שנבחרו. 2. במצבי חיסור ופריטה: בחירה בכלי הפטיש והקלקה על לבנת עשרת אחת או לבנת מאה אחת בטור הפעיל.
2. **עיבוד**: 1. המערכת מריצה אנימציה של נדידת הלבנים ושינוי הייצוג הווירטואלי בהתאם לפעולה שנבחרה. 2. המערכת מעדכנת את לוח בית המספרים הסמלי בהתאם למצב החדש של הלבנים.
3. **פלט**: 1. עם סיום האנימציה המערכת משחררת את אירוע המערכת PLACE_VALUE_CONVERSION_SUCCESS. 2. מצב המקלדת בשורת התוצאה עבור הטור הפעיל משתנה מנעול לפתוח לקלט.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: ניסיון הקלדה לפני שחרור נעילה משאיר את המקלדת נעולה ללא הודעות שגיאה מרעישות, עיגולי הזיכרון פתוחים תמיד.
5. **דרישות מרווחים נגישות וביצועים**: זמן תגובה לשינוי מצב פחות מ-50ms. בדיקת קלט מול התרגיל הפעיל ללא רמזים או placeholders.
6. **מבנה נתונים ושדות בסיס הנתונים**: ניהול מצבי מקלדת מותנים (Locked/Unlocked) במנוע גשר VRA דיגיטלי.
7. **לוגיקת שחזור וריענון דפדפן**: שמירת מצב הנעילה ב-React Store.
8. **מניעת לולאות עדכון בזמן אמת**: פתיחת המקלדת מתבצעת רק בקבלת אירוע PLACE_VALUE_CONVERSION_SUCCESS.
9. **Strict Bilingual Developer Instructions**: Eradiate all CRA terminology and physical object references. All design specifications and code structures must implement the VRA model only. Implement conditional column keyboard locking in worksheet addition/subtraction steps. Unlock the keyboard output only upon receiving the PLACE_VALUE_CONVERSION_SUCCESS event triggered by either: (a) precise selection of 10 unit blocks or 10 tens displaying a 'group' button in addition/regrouping modes, or (b) using the hammer tool on a ten/hundred block in the active column during subtraction/decomposition modes, followed by block migration animation and symbolic chart update. Keep memory circles active for working memory relief. Validate input format against current exercise with zero placeholders or hints.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם הלומד מבין מדוע המקלדת נעולה ואיזו פעולה הוא צריך לבצע כדי לשחרר את הנעילה.

---

### 10. מודול לוח חיבור אדפטיבי מבוקר (Symmetrical Addition Grid Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: קלט: 1. אירועי ממשק פעילים מצד התלמיד הכוללים גרירת לבנת דינס, לחיצה על כלי הפטיש, הקלדה של ספרה בעיגולי הזיכרון, שינוי קלט בשורת התוצאה, או לחיצה על כפתור ביטול הפעולה.
2. **עיבוד**: 1. המערכת מפעילה טיימר פנימי ייעודי עבור הטור הפעיל הנוכחי. 2. כל קבלת אירוע ממשק מהרשימה המוגדרת בקלט מאפסת ומאתחלת מחדש את הטיימר. 3. אם הטיימר מגיע ל-45 שניות רצופות של היעדר קלט מוחלט, המערכת משחררת את אירוע המערכת HESITATION_TRIGGER.
3. **פלט**: 1. המערכת מעוררת את כרטיס החניכה הסוקרטי ומציגה אותו בחלונית הצדדית העדינה ללא חלונות קופצים.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: איפוס מיידי של הטיימר בכל פעולת משתמש.
5. **דרישות מרווחים נגישות וביצועים**: מעבר Framer Motion עם Fade In של 2500ms ו-Fade Out של 3000ms בעת הקלדה מוצלחת.
6. **מבנה נתונים ושדות בסיס הנתונים**: ניהול נראות הלוח ב-React Local State (נפרד מבסיס הנתונים). שמירת visibility מסוג Boolean במגזרי המפגש.
7. **לוגיקת שחזור וריענון דפדפן**: אתחול מחדש של הטיימר בעת רענון.
8. **מניעת לולאות עדכון בזמן אמת**: הפרדת לוגיקת הנראות מפעולות כתיבה ראשיות ל-DB.
9. **Strict Bilingual Developer Instructions**: Control grid visibility via React local state. Track user interaction events (drag, hammer, typing, undo) to reset the internal column timer. Fire HESITATION_TRIGGER and reveal the socratic card in a side drawer (no popup alerts) strictly after 45 seconds of complete absence of user input events. Apply Framer Motion transitions for fade in over 2500ms and auto fade out over 3000ms triggered by successful key input. Ensure the visibility logic is decoupled from main database write operations.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם הלומד מבין מתי הלוח מופיע ומתי הוא נעלם.

---

### 11. מודול כפתור ביטול פעולה פדגוגי (Undo Action Engine Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: חיזוק החוסן הרגשי על ידי מתן לגיטימציה לטעות והפיכתה.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: כפתור ייעודי בפינה הימנית העליונה (48x48 פיקסלים) המאפשר ביטול לפעולות קודמות ללא הורדת ניקוד או חיווי ענישתי.
3. **לוגיקת אינטראקציה ומכונת המצבים**: ניהול מחסנית מצבים (state stack מסוג Array) בצד הלקוח המוגבלת ל-10 פעולות אחרונות. בעת לחיצה, המערכת מוציאה מצב מהמחסנית ומשחזרת את קואורדינטות הבלוקים והקלט ללא דיווח דגלי שגיאה בטלמטריה.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: מחסנית ריקה משביתה בעדינות את הכפתור ללא צליל שגיאה.
5. **דרישות מרווחים נגישות וביצועים**: ביצוע מיידי תוך פחות מ-16ms (פריים יחיד).
6. **מבנה נתונים ושדות בסיס הנתונים**: state stack מקומי בלבד.
7. **לוגיקת שחזור וריענון דפדפן**: מחסנית מאופסת בעת מעבר תרגיל או רענון דף.
8. **מניעת לולאות עדכון בזמן אמת**: אי-שליחת דגלי שגיאה לטלמטריה בעת פעולת ביטול.
9. **Strict Bilingual Developer Instructions**: Developer Instruction: Eradiate all CRA terminology and physical object references. All design specifications and code structures must implement the VRA model only. Maintain a client side stack of historical states. Pop states on click to restore block canvas positions and input values without triggering error flags in telemetry logs. Ensure unlimited reversible error support via Undo without penalty.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם הלומד יודע כיצד לבטל את הפעולה האחרונה ללא חשש מתוצאות.

---

## חלק ד: מנוע החניכה הסוקרטי ומפרט אינטגרציית ג'מיני

### 12. מודול חונכות סוקרטית ובלימת ניחושים (Socratic Mentoring Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: קלט: 1. אירועי ממשק פעילים מצד התלמיד (גרירת לבנה, לחיצה על פטיש, הקלדה בעיגולי הזיכרון, שינוי קלט בשורת התוצאה, ביטול פעולה). 2. הקלקה על מסיח שגוי בכרטיס החניכה.
2. **עיבוד**: 1. טיימר פנימי לטור הפעיל. 2. איפוס טיימר בכל אירוע ממשק. 3. שחרור אירוע HESITATION_TRIGGER לאחר 45 שניות של היעדר קלט. 4. נעילת לחצני בחירה בכרטיס ל-60 שניות בעת מענה שגוי. 5. שמירת מצב פעיל של לוח הדינס וכפתור הביטול.
3. **פלט**: 1. הצגת כרטיס חניכה בצד ללא פופ-אפ. 2. שינוי עיצוב כפתורים (מסיח שגוי = אדום, שאר הלחצנים = 40% שקיפות, סמן חסימה). 3. חיווי שעון חול/סרגל התקדמות. 4. הצגת הנחיה שקטה על נעילה ושימוש בביטול פעולה.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: מרחב העבודה הראשי, לוח הדינס וכפתור ה-Undo נשארים פעילים לחלוטין גם בעת נעילת כרטיס החניכה.
5. **דרישות מרווחים נגישות וביצועים**: חסימה באמצעות setTimeout של 60,000ms ושמירת מצב ב-LocalStorage לשרידות לרענון.
6. **מבנה נתונים ושדות בסיס הנתונים**: Zustand Store מנהל socraticState.
7. **לוגיקת שחזור וריענון דפדפן**: שמירת זמן סיום הנעילה ב-LocalStorage.
8. **מניעת לולאות עדכון בזמן אמת**: בדיקת תוקף נעילה על בסיס חותמת זמן.
9. **Strict Bilingual Developer Instructions**: Eradiate all CRA terminology and physical object references. All design specifications and code structures must implement the VRA model only. Track user interaction events (drag, hammer, typing, undo) to reset internal timer, firing HESITATION_TRIGGER after 45 seconds of input inactivity to display socratic card in a side pane without popups. Upon selecting an incorrect distractor inside the socratic card, apply a 60 second block on all socratic selection buttons, style the chosen option with red background and error icon, set disabled state (40% opacity, not-allowed cursor) on remaining buttons, and display a digital hourglass with a gentle hint suggesting the undo button, while keeping the main workspace fully operational.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם הלומד מבין את השאלה המנחה וכיצד לבחור את התשובה המתאימה.

---

### 13. מפרט סכמת API של מנוע ג'מיני בשרת (Gemini API Schema Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: הפקת רמזים איכותיים מבוססי בינה מלאכותית ללא חשיפת לוגיקה למשתמש.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: קריאות שרת בלבד לקבלת הנחיות פדגוגיות מותאמות בזמן תגובה של פחות מ-200ms.
3. **לוגיקת אינטראקציה ומכונת המצבים**: קריאת Firebase Cloud Function המאמתת מול Gemini API. במקרה של כשל או Timeout, המערכת מבצעת Fallback לאוסף רמזים סטטי קבוע מראש.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: נפילת API אינה משפיעה על חוויית המשתמש ומוחלפת ברמז פדגוגי מוכן.
5. **דרישות מרווחים נגישות וביצועים**: מפתחות ה-API מוצפנים במשתני סביבה בשרת.
6. **מבנה נתונים ושדות בסיס הנתונים**: אובייקט JSON פדגוגי מובנה.
7. **לוגיקת שחזור וריענון דפדפן**: לא רלוונטי (Stateless API Call).
8. **מניעת לולאות עדכון בזמן אמת**: Caching של תבניות רמזים נפוצות.
9. **Strict Bilingual Developer Instructions**: Enforce response format verification inside Socratic Cloud Function. If API fails, fallback to predefined static pedagogical hints database array to guarantee zero interface disruptions. Encrypt API keys in server environment variables.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם ה-API מחזיר את המבנה הנכון בזמן סביר.

---

## חלק ה: מפגשי הלמידה, רפלקציה ועבודה מחוץ לרשת

### 14. מודול מפגשים 1 עד 8 ומנוע תרגילים (Worksheet and Session Progression Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: הבטחת רצף למידה הדרגתי וליניארי לאורך 8 מפגשים מובנים.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: הצגת רשימת תרגילים מותאמת ומניעת דילוגים לא חוקיים.
3. **לוגיקת אינטראקציה ומכונת המצבים**: ניהול current problem index (Integer) ב-React State ובסנכרון קבוע מול השרת.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: חסימת דילוג לתרגיל הבא לפני השלמת התרגיל הנוכחי.
5. **דרישות מרווחים נגישות וביצועים**: חישוב ציונים וביצועים מבוסס על תרגילי חובה בלבד לצורך השוואה הוגנת בבסיס הנתונים.
6. **מבנה נתונים ושדות בסיס הנתונים**: sessionNumber (1-8), standardTaskIdx (0-N).
7. **לוגיקת שחזור וריענון דפדפן**: סנכרון מצב המפגש מול מסמך התלמיד ב-Firebase.
8. **מניעת לולאות עדכון בזמן אמת**: עדכון שרת רק עם השלמת תרגיל או שינוי שלב.
9. **Strict Bilingual Developer Instructions**: Enforce worksheet execution parameters. Keep active problem index in React state. Settle exercise score calculation strictly on compulsory problems to maintain a fair database comparison.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם הלומד מבין איזה תרגיל הוא פותר כרגע וכיצד הוא מתקדם לתרגיל הבא.

---

### 15. מודול ארגז חול דיגיטלי מונחה ומצב מקרן (Sandbox and Projector Mode Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: מתן מרחב התנסות חופשי ללא ציון (מפגש 1), לצד מצב מקרן המאפשר למורה לנעול את מסכי התלמידים ולהציג תוכן מרכזי.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: מסך ארגז חול פתוח למניפולציה חופשית, ומסך נעילה במצב מקרן.
3. **לוגיקת אינטראקציה ומכונת המצבים**: שמירת projector mode מסוג Boolean בשרת. כשהמצב פעיל, רינדור לקוח התלמיד מוגדר ל-null וחוסם כל אינטראקציה, תוך קבלת פקודות שליטה מדשבורד המורה.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: ניסיון אינטראקציה במצב מקרן נחסם לחלוטין.
5. **דרישות מרווחים נגישות וביצועים**: נעילה מיידית תוך פחות מ-100ms מעדכון השרת.
6. **מבנה נתונים ושדות בסיס הנתונים**: projectorMode מסוג Boolean ב-system_control ובכיתה.
7. **לוגיקת שחזור וריענון דפדפן**: האזנה מתמדת ל-projectorMode בזמן אמת.
8. **מניעת לולאות עדכון בזמן אמת**: שליטה מרכזית מדשבורד המורה בלבד.
9. **Strict Bilingual Developer Instructions**: Implement a projector mode state that locks student client rendering to null while accepting master control input commands from the teacher portal. Ensure student interaction is blocked entirely in this state.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם הלומד יודע כיצד להשתמש בארגז החול והאם המערכת מונעת הפרעות במצב מקרן.

---

### 16. מודול לוח רפלקציה תלת שלבי (SRL Reflection Board Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: קלט: 1. U = מספר לחיצות Undo. 2. E = מספר ניסיונות הזנה שגויים. 3. G = מספר בחירות שגויות בכרטיס הסוקרטי.
2. **עיבוד**: 1. חישוב מדד ההתמדה: `(U / (U + E + G)) * 100`. אם המכנה 0, המדד 100%.
3. **פלט**: 1. שמירת ערך מספרי (0-100) ב-DB תחת student_id אנונימי (1-12). 2. הצגת המדד בשלב ג' של לוח הרפלקציה כמשוב מעצים.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: וידוא השלמת כל 3 השלבים לפני מתן אפשרות הגשה סופית.
5. **דרישות מרווחים נגישות וביצועים**: רכיב רפלקציה רב-שלבי חלק וברור.
6. **מבנה נתונים ושדות בסיס הנתונים**: שמירת reflection data בשרת תחת מזהה התלמיד.
7. **לוגיקת שחזור וריענון דפדפן**: שמירת שלב הרפלקציה הנוכחי בזיכרון.
8. **מניעת לולאות עדכון בזמן אמת**: שמירה סופית חד-פעמית עם סיום שלב ג'.
9. **Strict Bilingual Developer Instructions**: Render the SRL Board inside a multi step container. Calculate the Persistence Index using the formula: (U / (U + E + G)) * 100, where U is Undo clicks, E is error digits typed, and G is incorrect distractor selections (defaulting to 100% if the denominator is 0). Save the calculated index (range 0-100) directly to DB under anonymous student ID for display in Step 3 of the SRL reflection board. Validate that all three steps are completed before final submission.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם הלומד מבין את התהליך הרפלקטיבי ומה מצופה ממנו בכל שלב.

---

### 17. מודול עבודה במצב לא מקוון ותור סנכרון (Offline Queue and Local Storage Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: הבטחת המשכיות למידה מלאה ללא תלות ברשת. אגירת פעולות בעת ניתוק וסנכרון אוטומטי ושקוף עם חידוש החיבור.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: חיווי רשת עדין ללא חסימת ממשק העבודה של התלמיד.
3. **לוגיקת אינטראקציה ומכונת המצבים**: לכידת בקשות נכשלות ואגירת מטעני הטרנזקציות (pending payloads) ב-IndexedDB / LocalStorage. האזנה לאירוע window online ושליחת המטענים בתור FIFO בצורה אסינכרונית ב-Batch.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של ניתוק ממושך, התור שומר עד 500 אירועים ללא אובדן נתונים.
5. **דרישות מרווחים נגישות וביצועים**: סנכרון תור ברקע ללא הקפאת ממשק ה-UI.
6. **מבנה נתונים ושדות בסיס הנתונים**: pending payloads מסוג Queue.
7. **לוגיקת שחזור וריענון דפדפן**: תור נשמר ב-Storage וממשיך שידור לאחר רענון.
8. **מניעת לולאות עדכון בזמן אמת**: שידור FIFO מדורג במנות קבועות.
9. **Strict Bilingual Developer Instructions**: Intercept failed network requests. Queue transaction payloads into indexedDB or local storage. Monitor window online event to dispatch the queued payloads asynchronously in FIFO sequence.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם הנתונים מסתנכרנים כראוי עם חידוש החיבור לרשת.

---

## חלק ו: דשבורד המורה וניהול הכיתה

### 18. מודול רדאר פדגוגי שקט (Silent Radar Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: קבלת תמונת מצב כיתתית בזמן אמת ללא צורך בהתערבות פעילה.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: גריד קבוע של 12 משבצות (3x4) המייצגות את 12 תלמידי הפיילוט, הממוינות לפי מזהה מספרי 1-12 בלבד ללא שמות (`תלמיד 1` עד `תלמיד 12`).
3. **לוגיקת אינטראקציה ומכונת המצבים**: עדכון צבעי רקע בלבד (ירוק, צהוב, אדום, אפור) במענה לנתוני טלמטריה בזמן אמת (זמן תגובה עד 1000ms) ללא הזזת אלמנטים או פופ-אפים.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: תלמיד שאינו מחובר מוצג במצב Offline אפור נקי ללא נתוני דמה.
5. **דרישות מרווחים נגישות וביצועים**: צמצום קריאות Snapshot באמצעות עדכון ממוקד של כרטיסיות.
6. **מבנה נתונים ושדות בסיס הנתונים**: isOnline מסוג Boolean, traceData (hesitations, undos) ב-users/students.
7. **לוגיקת שחזור וריענון דפדפן**: טעינה מיידית מ-Firebase Realtime Database.
8. **מניעת לולאות עדכון בזמן אמת**: בדיקת שוויון נתונים למניעת רינדור מיותר של הגריד.
9. **Strict Bilingual Developer Instructions**: Developer Instruction: Eradiate all CRA terminology and physical object references. All design specifications and code structures must implement the VRA model only. Implement the Teacher Dashboard with a fixed 12-slot Silent Radar grid representing the 12 active students, using background color shifts only to reflect real-time process data without layout reflows or popup alerts. Sort strictly by numeric student ID 1 to 12 with zero student names displayed.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם המורה מבין את משמעות צבעי הרדאר וכיצד לפעול בהתאם.

---

### 19. מודול הקמת כיתה ואפיון פרופילים (Class Management and Profiles Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: מתן התאמות אישיות (פרופיל תמיכה קוגניטיבי מוגבר) בשקט מוחלט וללא כל חיווי או שינוי בממשק התלמיד.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: פאנל הגדרות ייעודי בדשבורד המורה.
3. **לוגיקת אינטראקציה ומכונת המצבים**: שדה enhanced cognitive support profile מסוג Boolean הנשמר בבסיס הנתונים עבור התלמיד, המשנה את לוגיקת המקלדת בצד הלקוח ללא דגלים ויזואליים.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: הפעלה או ביטול של פרופיל מתעדכנים בזמן אמת ללא צורך בהתחברות מחדש של התלמיד.
5. **דרישות מרווחים נגישות וביצועים**: עדכון שקט ומהיר ללא הודעות קופצות.
6. **מבנה נתונים ושדות בסיס הנתונים**: enhancedCognitiveSupport מסוג Boolean ב-users/students.
7. **לוגיקת שחזור וריענון דפדפן**: טעינת הפרופיל כחלק ממצב התלמיד.
8. **מניעת לולאות עדכון בזמן אמת**: כתיבה ישירה של השדה ל-Firebase.
9. **Strict Bilingual Developer Instructions**: Provide a silent configuration panel within the teacher class dashboard. Toggling user properties must save enhanced cognitive support profile as boolean true or false in DB without triggering UI flags on pupil clients.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם המורה יודע להפעיל פרופיל לתלמיד מבלי שהדבר ייראה על מסך התלמיד.

---

### 20. מודול שער אישור מורה קשיח (Teacher Gate Approval Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: הבטחת עמידה ביעדי למידה לפני מעבר למפגש 3.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: ניתוב התלמיד למסך המתנה בתום מפגש 2 עד לקבלת אישור אקטיבי מהמורה בדשבורד.
3. **לוגיקת אינטראקציה ומכונת המצבים**: בדיקה אסינכרונית בבקר הנתיבים (Route Controller). אם המפגש הושלם = 2, הגישה למפגש 3 נחסמת. הפנייה למסך המתנה עד לעדכון השדה teacher gate approved ל-true בבסיס הנתונים.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: ניסיון מעקף ישיר בכתובת ה-URL מוחזר מיד למסך ההמתנה.
5. **דרישות מרווחים נגישות וביצועים**: מעבר מיידי ברגע שהמורה מאשר בדשבורד.
6. **מבנה נתונים ושדות בסיס הנתונים**: teacher gate approved מסוג Boolean ב-users/students.
7. **לוגיקת שחזור וריענון דפדפן**: סנכרון סטטוס האישור מהשרת בכל רענון.
8. **מניעת לולאות עדכון בזמן אמת**: האזנה ממוקדת לצומת האישור בלבד.
9. **Strict Bilingual Developer Instructions**: Enforce asynchronous check in route controller. If session Completed matches session two restrict client navigation to session three. Redirect students to waiting view until teacher gate approved value changes to true.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם התלמיד מבין מדוע המערכת ממתינה לאישור המורה.

---

### 21. מודול נגן שחזור וקטורי (Vector Replay Engine Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: כלי אבחון למורה להבנת תהליכי חשיבה באמצעות שחזור מדויק של תנועות התלמיד על גבי המסך מתוך אירועי הטלמטריה שנשמרו.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: רכיב שחזור המצייר מחדש את תנועות הקנווס על פי זרם ה-JSON מתוך telemetry logs.
3. **לוגיקת אינטראקציה ומכונת המצבים**: שימוש ב-requestAnimationFrame בתוך iframe מבוקר לשחזור חלק ויציב.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: טיפול מלא בלוגים חלקיים או קפיצות זמן.
5. **דרישות מרווחים נגישות וביצועים**: שחזור חלק ב-60fps ללא עומס על ה-DOM הראשי.
6. **מבנה נתונים ושדות בסיס הנתונים**: telemetry logs מתוך Firebase.
7. **לוגיקת שחזור וריענון דפדפן**: טעינת זרם האירועים לפי מזהה הפעילות.
8. **מניעת לולאות עדכון בזמן אמת**: הרצה מבודדת בתוך סביבת הנגן.
9. **Strict Bilingual Developer Instructions**: Construct a replay component that recreates state canvas movements by chronologically drawing database telemetry JSON coordinate streams inside a controlled iframe canvas container. Use requestAnimationFrame for smooth playback.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם המורה יכול לצפות בשחזור של פעולת תלמיד בבירור.

---

### 22. מודול צ'אט ותקשורת בזמן אמת מורה-תלמיד-מנהל (Teacher Student & Admin Chat Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: ערוץ תקשורת ישיר, מהיר ומאובטח בזמן אמת בין המורה לתלמיד, ובין המורה למנהל המערכת, המאפשר הגשת עזרה פדגוגית מותאמת, מענה לשאלות, תמיכה קולית (STT) ושיתוף תמונות, תוך שמירה מוחלטת על אנונימיות התלמיד (Zero PII).
2. **רכיבי ממשק המשתמש והעיצוב החזותי**:
   * **בצד התלמיד**: חלונית צ'אט צפה ונגישה (`StudentChatOverlay`) הנפתחת בלחיצה על כפתור התקשורת ב-Topbar או בקבלת הודעה חדשה. כוללת בועות שיחה מיושרות לפי שולח (הודעות מורה בימין, הודעות תלמיד בשמאל), שדה טקסט נקי בעברית (RTL), כפתור שליחה, כפתור העלאת תמונה/צילום מסך, וחיווי תגית התראה אדומה על הודעות שלא נקראו.
   * **בצד המורה**: כרטיסיית צ'אט ייעודית בדשבורד המורה וחלון צ'אט צף מהיר (`FloatingChatPanel`). מציגים את היסטוריית השיחה מול התלמיד הנבחר, כפתורי רמזים מהירים ("כל הכבוד", "בדוק את טור העשרות", "נסה להשתמש בלוח הדינס"), קלט קולי בעברית (STT), העלאת תמונות, ומחוון נוכחות Live.
   * **בצד המנהל**: מרכז תקשורת ניהולי (`AdminChatView`) המאפשר שיח מול מורים, מענה לפניות ותמיכה מערכתית.
3. **לוגיקת אינטראקציה ומכונת המצבים**:
   * **איחוד מזהים גלובלי (ID Normalization Pipeline)**: כל שיחת תלמיד מנותבת לחדר ייעודי `chat_messages/student_userX` (עבור X בין 1 ל-12). פונקציית `normalizeStudentId` ו-`computeRoomId` מאחדות כל ייצוג לפורמט התקני.
   * **אתחול והאזנה אוטומטית (Auto-Sync Lifecycle)**: פונקציית `initSync()` מופעלת מיד עם עליית הרכיבים וברענון דפדפן (F5), ומאזינה בצורה אסינכרונית ל-Firebase Realtime Database באמצעות `onValue`.
   * **אופטימיות שליחה (Optimistic Updates)**: הודעה שנשלחת מוצגת מיד על המסך ומשודרת ברקע ל-Firebase.
   * **סימון כנקרא אוטומטי (Mark-as-Read)**: פתיחת חלון הצ'אט מעדכנת אוטומטית את סטטוס ההודעות ל-`read: true` ומאפסת את מחווני ההתראות.
4. **תרחישי קצה וטיפול בשגיאות ממשק**:
   * **חסימת הודעות ריקות**: מניעת שליחת מחרוזות רווחים או טקסט ריק (`text.trim()`).
   * **דחיסת תמונות**: תמונות מעובדות ומוקטנות בצד הלקוח לפני שידור כדי למנוע חריגה ממגבלות Payload.
   * **קלט קולי**: טיפול בשגיאות מיקרופון ושחרור מצב ההקלטה בעת סיום או ביטול.
5. **דרישות מרווחים נגישות וביצועים**: זמן סנכרון הודעות בזמן אמת פחות מ-100ms. ממשק נגיש ומותאם לעברית RTL עם תמיכה מלאה בגלילה חלקה.
6. **מבנה נתונים ושדות בסיס הנתונים**:
   * נתיב: `chat_messages/{studentRoomId}/{messageId}`
   * שדות: `id` (String), `senderId` (String), `senderName` (String), `receiverId` (String), `text` (String), `imageUrl` (String optional), `timestamp` (Integer), `read` (Boolean).
7. **לוגיקת שחזור וריענון דפדפן**: שמירת טוקן אימות וחיבור אוטומטי מיידי בעת רענון ללא צורך בהתחברות מחדש.
8. **מניעת לולאות עדכון בזמן אמת**: שימוש ב-`activeSyncedKey` וב-`chatUnsubscribe` למניעת כפילויות של מנויי Firebase.
9. **Strict Bilingual Developer Instructions**: Provide an integrated real-time message thread system over Firebase Realtime Database at path `chat_messages/{student_userX}` with strict text filtering regex that automatically strips out potential pupil private identifiers prior to database transmission. Enforce student ID normalization to `student_user1`..`student_user12`. Automatically trigger `initSync` on component mount and browser refresh. Implement optimistic UI updates, client-side image compression, and bidirectional mark-as-read synchronization with unread badge indicators.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם המורה והתלמיד שולחים ומקבלים הודעות בזמן אמת, האם ההודעות מיושרות נכון בצדי המסך, והאם מחווני ההתראה מתאפסים בעת קריאה.

---

### 23. מודול דוחות ואנליטיקה פדגוגית (Reports and Insights Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: קלט: 1. מדד שליטה מופשטת ממפגש 8. 2. מפת פערי ידע מהמטריקס האבחוני.
2. **עיבוד**: 1. מדד <50% + פערי יסוד -> קבוצה הומוגנית קטנה, תיווך פרונטלי, תבניות 10 פיזיות. 2. מדד 50-75% + פערי כיתה ב' -> קבוצה הטרוגנית, שיח עמיתים, חשבונייה/קשים. 3. מדד >75% -> עבודה עצמאית, נתיבי אתגר כיתה ג', לוח מחיק.
3. **פלט**: 1. הפקת דוח PDF לקריאה בלבד הכולל רשימת קבוצות והמלצות ציוד הממופות למזהי תלמיד אנונימיים (1-12).
4. **תרחישי קצה וטיפול בשגיאות ממשק**: במקרה של נתונים חלקיים המערכת מייצרת דוח עם חיווי על משימות פתוחות.
5. **דרישות מרווחים נגישות וביצועים**: מחולל הדוחות מפיק קובצי PDF בצד השרת באמצעות Node.js / Cloud Functions.
6. **מבנה נתונים ושדות בסיס הנתונים**: תשאול נתוני תרגילים באמצעות תסריטי MapReduce.
7. **לוגיקת שחזור וריענון דפדפן**: דוחות נשמרים לקריאה חוזרת.
8. **מניעת לולאות עדכון בזמן אמת**: הפקת דוח על פי דרישה (On Demand).
9. **Strict Bilingual Developer Instructions**: Query completed worksheets data using MapReduce scripts. Generate PDF output files on the server using Node.js or Firebase Functions containing grouping and equipment recommendations mapped to anonymous student IDs according to routing logic: (<50% mastery + foundational gaps -> small homogeneous group, frontal mediation, ten-frames); (50-75% + 2nd grade gaps -> heterogeneous group, peer discourse, abacus/straws); (>75% -> independent work, 3rd grade challenge tracks, whiteboard).
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם הדוח מכיל מידע רלוונטי שקל להבין אותו.

---

## חלק ז: ממשק ניהול מערכת

### 24. מודול סקירת מערכת כוללת (Admin Overview Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: בקרה על מדדים גלובליים ונתוני שימוש במערכת ברמת הארגון, ללא חשיפת זרמי טלמטריה מפורטים ברמת בית הספר.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: לוח מחוונים מרכזי המציג שימוש גלובלי, כמות כיתות ומורים פעילים.
3. **לוגיקת אינטראקציה ומכונת המצבים**: לוח מחוונים המרכז aggregated metrics בשרת בתדירות עדכון של שעה, תוך תצוגת נתונים מגובים (Cached) במקרה של עומס.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: נפילת שרת מציגה נתוני Cache אחרונים.
5. **דרישות מרווחים נגישות וביצועים**: טעינה מהירה של נתונים מצטברים.
6. **מבנה נתונים ושדות בסיס הנתונים**: aggregated metrics ב-Firebase.
7. **לוגיקת שחזור וריענון דפדפן**: טעינה אוטומטית בעליית הדשבורד.
8. **מניעת לולאות עדכון בזמן אמת**: עדכון מדדים תקופתי.
9. **Strict Bilingual Developer Instructions**: Build a high level analytics dashboard presenting global aggregated system usage statistics without exposing granular school level telemetry streams.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם מנהל המערכת מקבל תמונה נכונה של המצב הגלובלי.

---

### 25. מודול ניהול בתי ספר, כיתות ומורים (Schools and Teachers Wizard Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: ניהול ארגוני מבוקר להקמת בתי ספר, כיתות ומורים באמצעות אשף שלבים פשוט ומאובטח.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: Wizard Setup מסודר המנחה את המנהל צעד אחר צעד.
3. **לוגיקת אינטראקציה ומכונת המצבים**: אשף שלבים האוכף מגבלות גודל כיתה (עד 12 תלמידי פיילוט) ויחסי מורה-תלמיד בבסיס הנתונים.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: חסימת שמירה עם שדות חסרים או חריגה ממספר התלמידים המותר.
5. **דרישות מרווחים נגישות וביצועים**: ביצוע שמירה ב-Batch תוך פחות מ-200ms.
6. **מבנה נתונים ושדות בסיס הנתונים**: שמירת הנתונים ב-Batch ל-school ID ו-class ID.
7. **לוגיקת שחזור וריענון דפדפן**: שלבי האשף נשמרים מקומית עד לסיום השמירה.
8. **מניעת לולאות עדכון בזמן אמת**: כתיבה מרוכזת אחת בסיום האשף.
9. **Strict Bilingual Developer Instructions**: Create a step by step creation wizard. Database configuration rules must strictly enforce the teacher student ratio boundaries and pilot class sizes limitations.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם המנהל מצליח להקים בית ספר ללא שגיאות.

---

### 26. מודול קטלוג תוכנית הלימודים (Curriculum and Task Catalog Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: עדכון וניהול תוכן לימודי ותבניות משימה בבסיס הנתונים והפצתם לכלל המשתמשים.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: ממשק טבלאי לעריכת curriculum data.
3. **לוגיקת אינטראקציה ומכונת המצבים**: עדכון תבניות משימה מפיץ שינויים בזמן אמת לגיליונות התלמידים.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: ולידציה של מבנה התרגיל לפני הפצה.
5. **דרישות מרווחים נגישות וביצועים**: הפצה מהירה לכלל הכיתות הפעילות.
6. **מבנה נתונים ושדות בסיס הנתונים**: curriculum data ב-Firebase.
7. **לוגיקת שחזור וריענון דפדפן**: טעינת תוכנית הלימודים העדכנית ביותר.
8. **מניעת לולאות עדכון בזמן אמת**: עדכון מבוקר על ידי מנהל מערכת בלבד.
9. **Strict Bilingual Developer Instructions**: Expose an interface managing curriculum tables in the DB. Ensure updates in task templates propagate in real time to student worksheets stores.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם המערכת משקפת את העדכונים האחרונים בתוכנית הלימודים.

---

### 27. מודול מדיניות אבטחה והגבלות גלובליות (Global Security and Settings Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: הגנה מוחלטת על השרת ובסיס הנתונים, אכיפת הרשאות גישה ומניעת גישת לקוח למשתני סביבה רגישים.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: ממשק הגדרות אבטחה ברור ומאובטח.
3. **לוגיקת אינטראקציה ומכונת המצבים**: הגדרת Firestore ו-Realtime Database Security Rules המגבילות נקודות קצה על בסיס claims מאומתים ב-JWT.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: חסימת ניסיונות גישה לא מורשים ורישום ביומן ביקורת (Audit Log).
5. **דרישות מרווחים נגישות וביצועים**: אכיפת שרת מיידית בכל פעולה.
6. **מבנה נתונים ושדות בסיס הנתונים**: security rules מאומתים.
7. **לוגיקת שחזור וריענון דפדפן**: אבטחה נאכפת בכל בקשה.
8. **מניעת לולאות עדכון בזמן אמת**: מניעת גישת לקוח למפתחות תצורה רגישים.
9. **Strict Bilingual Developer Instructions**: Enforce Firestore Security Rules restricting read or write endpoints based on verified JWT role claims. Prevent client access to key configuration environment variables.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם המנהל רואה את כל הגדרות האבטחה בצורה ברורה.

---

### 28. מודול תמיכה ותקשורת ניהולית (Admin Support Hub Module Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: ריכוז מענה פניות ותקשורת תמיכה טכנית ופדגוגית עבור מורים בתוך מרחב הניהול.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: מרכז פניות (support tickets) המרכז הודעות שנשלחו ממודול הצ'אט, כולל מחווני התראות פעילים בדשבורד האדמין.
3. **לוגיקת אינטראקציה ומכונת המצבים**: ניהול פניות במצבי פתוח, בטיפול וסגור.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: עדכון סטטוס מיידי ושליחת מענה למורה.
5. **דרישות מרווחים נגישות וביצועים**: סנכרון בזמן אמת של פניות ותשובות.
6. **מבנה נתונים ושדות בסיס הנתונים**: support_tickets ב-Firebase.
7. **לוגיקת שחזור וריענון דפדפן**: טעינת רשימת הפניות הפעילות בעליית הדף.
8. **מניעת לולאות עדכון בזמן אמת**: האזנה לפניות חדשות בלבד.
9. **Strict Bilingual Developer Instructions**: Centralize incoming ticket logs from teacher admin chat modules. Implement active notifications indicators inside the admin global workspace.
10. **תרחיש בדיקה קוגניטיבי מפורט**: האם המנהל יודע לטפל בפניות בזמן.

---

### 29. מודול ניהול מצב גלובלי ומכונות מצבים (Zustand and State Machines Spec)
1. **מטרת המודול הפדגוגית והטכנולוגית**: הבטחת עקביות ממשק מלאה, ניהול מצבי יישום גלובליים ומעברים דקלרטיביים בין הסטור של סביבת העבודה, המורה, הצ'אט וההרשאות.
2. **רכיבי ממשק המשתמש והעיצוב החזותי**: ארכיטקטורת ניהול מצב מבוססת Zustand עם Decoupled Stores (`useStore`, `useAuthStore`, `useChatStore`, `useAdminStore`, `useWorkspaceStore`).
3. **לוגיקת אינטראקציה ומכונת המצבים**: פונקציות מעבר מצב מנוהלות בצורה דקלרטיבית ומעודכנות על בסיס אירועי טלמטריה.
4. **תרחישי קצה וטיפול בשגיאות ממשק**: סנכרון תקין בין הסטורים השונים ומניעת Race Conditions.
5. **דרישות מרווחים נגישות וביצועים**: ביצועי רינדור אופטימליים עם שימוש ב-Selectors ממוקדים.
6. **מבנה נתונים ושדות בסיס הנתונים**: Stores נפרדים ומבודדים.
7. **לוגיקת שחזור וריענון דפדפן**: התמדה (Persistence) לסטורים קריטיים דרך Storage ו-Firebase.
8. **מניעת לולאות עדכון בזמן אמת**: הפרדה מלאה בין שכבת ה-State לשידורי ה-Network.
9. **Strict Bilingual Developer Instructions**: Architect a modular client global state using Zustand. Keep workspace store teacher store and authentication credentials store decoupled. Write robust state transition functions using declarative frameworks to manage UI state changes based on non nullable telemetry input actions.
10. **תרחיש בדיקה קוגניטיבי מפורט**: המערכת שומרת על עקביות הנתונים בכל שלב של העבודה ומוודאת עמידה בכל חוקי היסוד הגלובליים ללא תקלות.
