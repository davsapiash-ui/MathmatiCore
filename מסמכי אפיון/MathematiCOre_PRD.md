# מסמך דרישות מוצר (Master PRD v5.0)
## פלטפורמת הלמידה ההיברידית מתמטיקאור (MathematiCOre)
**Version 5.0 | Date: August 17, 2026 | Time: 02:57 IDT**

---

## חלק א: תשתית הזדהות, ניהול תפקידים ואבטחה

### 1. מודול כניסה והזדהות (Login Module Spec)
1. **מהות פדגוגית וטכנולוגית:** הגדרת שער כניסה פשוט ונגיש הנקי מעומס קוגניטיבי או מוטורי ושומר על אנונימיות מלאה של הלומדים על בסיס מודל ייצוג וירטואלי מוחשי דיגיטלי בלבד. הממשק כולל כפתור כניסת מורים באמצעות מערכת הזדהות גוגל בלבד המבוסס על התאמה מדויקת מול אוסף מורים מורשים בבסיס הנתונים פיירבייס. הכתובות המורשות היחידות להזדהות כמורים בשיטת התאמה מדויקת הן davidsep@edu-haifa.org.il וכן 1002220159@edu-haifa.org.il. כל כתובת דואר אלקטרוני אחרת תיחסם באופן גורף ומיידי.
2. **מפרט יישום חוויית המשתמש ועיצוב הממשק:** כניסת התלמידים תתבצע ברצף פעולות מדורג וחד כיווני קבוע:
* בחירת בית הספר מתוך רשימה נפתחת המכילה את בית ספר ביקורת.
* בחירת שם הכיתה מתוך רשימה נפתחת המכילה את כיתת המבקרים.
* בחירת מזהה התלמיד בטווח של אחת עד שתים עשרה מתוך רשימה נפתחת ייעודית.
* הזנת קוד הגישה הקבוע 10203040 בתוך תיבת טקסט נקייה לחלוטין באמצעות הקלדה פיזית רגילה במקלדת הפיזית בלבד ללא שילוב או רינדור של מקלדת וירטואלית על גבי המסך. שמירת מזהה התלמיד כמספר שלם בטווח של אחת עד שתים עשרה בזיכרון המקומי. זמן תגובה לאימות פחות ממאתיים מילישניות, שטחי הקלקה בגודל ארבעים ושמונה פיקסלים לפחות, ומנגנון ויסות קצב של חמש מאות מילישניות על כפתורי הבחירה.
3. **התנהגות במצבי שגיאה:** בעת הקלדת קוד שגוי המערכת תבצע רטט חזותי עדין של תיבת הקלט למשך שלוש מאות מילישניות ותרוקן את השדה באופן אוטומטי ותחזיר את מיקוד ההקלדה לתחילת השדה ללא הצגת הודעות אזהרה המייצרות חרדה.
4. **Strict Bilingual Developer Instructions:** [Strict Bilingual Developer Instructions: All design specifications and code structures must implement the VRA model only. No placeholders or hints allowed on input elements. Keep student profiles strictly anonymous using numeric IDs 1 to 12 with zero persona names in UI. Teachers login must rely exclusively on Google SSO verified via exact match query against the authorizedTeachers Firestore collection. Students login flow is strictly sequential: School Dropdown selecting "בית ספר ביקורת" -> Class Dropdown selecting "המבקרים" -> Student ID Dropdown selecting numeric IDs in the range 1 to 12 -> Password text input accepting strictly the value 10203040 via physical keyboard with zero virtual on-screen keypad rendered.]
* **תרחיש בדיקה קוגניטיבי:** המשתמשים מגיעים למסך ומבינים מיד כיצד לבחור בנתיב המורים או בנתיב התלמידים ומבצעים כניסה חלקה באמצעות המקלדת הפיזית בלבד ללא עומס קוגניטיבי.

---

### 2. מודול מיתוג תפקידים (Role Switcher Module Spec)
1. **דרישות:** המערכת תגדיר הגנת ניתוב ישיר באמצעות ספריית הריאקט ראוטר. המערכת תבצע בדיקת הרשאות אסינכרונית בכל שינוי נתיב בדפדפן. ניסיון גישה ידני של תלמיד אנונימי לנתיב מורה מוגן יחסם באופן מיידי והמשתמש ינותב בחזרה ללובי התלמידים ללא שינוי במצב המערכת. מנגנון פקיעת תוקף אסימון הגישה יגדיר כי תוקף אסימון מסוג ג'ייסון ווב טוקן עבור מורים ומנהלים יוגבל לשמונה שעות עבודה רצופות. עם פקיעת התוקף המערכת תבצע התנתקות שקטה ואוטומטית ותעביר את המשתמשים לדף הבית עם הודעה מעודנת המבקשת לבצע כניסה מחודשת.
2. **אפיון:** המערכת מזהה טוקן JWT ובמקרה של הרשאה כפולה עוברת למצב Role Selection. לאחר בחירה, מעדכנת את הסטור הגלובלי ועוברת למצב Route Locked. שמירת שדה role מסוג String בתוך ה-JWT ובזיכרון המקומי. ניתוח הרשאות בעת טעינת האפליקציה ומעבר תפקיד תוך פחות מ-100ms.
3. **Strict Bilingual Developer Instructions:** Guard routes using react router guards. If a user token contains dual claims present a blocking selection screen. Save the chosen role in the global store and lock down all unauthorized API endpoints immediately. Use declarative state management to handle role transitions.
* **תרחיש בדיקה קוגניטיבי:** האם המשתמש יודע מהו התפקיד שנבחר וכיצד לשנות אותו במידת הצורך בתוך דשבורד המשתמש.

---

### 3. מודול אבטחה ואנונימיזציה (Zero PII Identity Module Spec)
1. **דרישות:** המערכת תגדיר ביטויים רגולריים שיורצו בצד הלקוח לסינון מידע מזהה אישי בטרם שידור הנתונים לשרת. זיהוי מספרי טלפון יבוצע באמצעות ביטוי רגולרי האוחז בטווח של תשע עד אחת עשרה ספרות רציפות. זיהוי תעודות זהות יבוצע באמצעות ביטוי רגולרי המזהה תשע ספרות התואמות את ספרת הביקורת הלאומית. זיהוי כתובות דואר אלקטרוני יבוצע באמצעות ביטוי רגולרי המזהה תבנית של תווים המופרדים על ידי כרוכית ונקודה. חוק מערכת קשיח לצד השרת יקבע כי כל בקשת כתיבה המכילה שדות שאינם מזהה אנונימי בטווח של אחת עד שתים עשרה תידחה באופן מלא והשרת יחזיר קוד שגיאת אבטחה ללא שמירת המידע בבסיס הנתונים.
2. **אפיון:** פילטר קבוע בשכבת השרת וחוקי אבטחה ב-Firestore הדוחים כל בקשת כתיבה עם שדות מזהים. ולידציה בצד השרת לכל מטעני הטלמטריה תוך פחות מ-50ms לכל בקשה.
3. **Strict Bilingual Developer Instructions:** Database rules must reject any write operation containing fields like name, email, or phone. Enforce database schema constraints restricting student_id strictly to integer values between 1 and 12. Use server-side validation for all incoming telemetry data packets.
* **תרחיש בדיקה קוגניטיבי:** האם הנתונים הנשלחים מכילים פרטים מזהים בבסיס הנתונים ואם כן האם המערכת עוצרת אותם בזמן.

---

## חלק ב: ארכיטקטורת בסיס הנתונים וסכמות הנתונים

### 4. סכמת אוספי בסיס הנתונים (Firestore Collections Schema Spec)
1. **דרישות:** מבנה האוספים בבסיס הנתונים פיירבייס יוגדר בצורה קשיחה הכוללת שדות וטיפוסי נתונים מלאים עבור סוכן הפיתוח. אוסף כיתות יכלול שדות מזהה בית ספר מסוג מחרוזת שם כיתה מסוג מחרוזת וסיווג סוג כיתה מסוג מחרוזת. אוסף תלמידים יכלול שדות מזהה תלמיד מסוג מספר שלם בטווח של אחת עד שתים עשרה בלבד פרופיל תמיכה קוגניטיבי מוגבר מסוג בוליאני המופעל ידנית מזהה מפגש פעיל מסוג מספר שלם ומצב אישור מעבר תלמיד מסוג בוליאני. אוסף רישומי טלמטריה יכלול שדות מזהה רישום מסוג מחרוזת מזהה תלמיד מסוג מספר שלם בטווח של אחת עד שתים עשרה בלבד סוג פעולה מסוג מחרוזת וחותמת זמן מסוג מספר שלם בפורמט יוניקס אפוק ללא שימוש במקפים.
2. **אפיון:** ניהול סנכרון נתונים אסינכרוני מול Firebase. אוסף classes כולל שדות קשיחים: school_id, class_name ("המבקרים"), ו-class_type (כיתת ביקורת/ניסוי). אוסף students מגביל מזהי תלמידים לטווח 1-12. שימוש ב-Snapshot Listeners וב-Batch Updates לביצועים אופטימליים עם זמן אחזור מקסימלי של 150ms.
3. **Strict Bilingual Developer Instructions:** Developer Instruction: Eradiate all CRA terminology and physical object references. All design specifications and code structures must implement the VRA model only. Ensure the Firestore classes collection schema contains fields for school_id, class_name, and class_type to allow dynamic research data partitioning between control and experiment groups. Ensure student documents contain zero PII and restrict student_id strictly to integers between 1 and 12 for the 12 pilot students.
* **תרחיש בדיקה קוגניטיבי:** האם המידע בבסיס הנתונים תואם את המבנה המוגדר ואם לא האם המערכת מתריעה.

---

### 5. סכמת נתוני מיקרו פעילות (Telemetry JSON Payload Schema Spec)
1. **דרישות:** מבנה אובייקט הנתונים הנדרש יוגדר בצורה קשיחה וחד ערכית. כל אירוע ממשק לוגי יקודד וישודר לשרת בפורמט הבא בלבד:
```json
{
  "log_id": "log_8849203",
  "student_id": 8,
  "timestamp": 1787155141,
  "action_type": "DECOMPOSITION_SUCCESS",
  "payload": {
    "active_column": "tens",
    "source_column": "hundreds",
    "decomposed_block_count": 1,
    "target_block_count": 10,
    "memory_circles": {
      "hundreds": 3,
      "tens": 10
    }
  }
}
```
הנתונים ישודרו לשרת אך ורק בנקודות הכרעה מתמטיות קבועות הכוללות אירועי המרה הקלדה מוצלחת בשורת התוצאה אישור תרגיל ושימוש בכפתור ביטול הפעולה ולא כתנועות עכבר או גרירה רציפות.
2. **אפיון:** המערכת מייצרת ומדוחסת אובייקט JSON בכל אירוע ממשק לוגי (ללא מעקב עכבר רציף). ולידציית גודל מטען עד 50KB לפני כל שליחה. שמירה בתור מקומי עד לאישור שרת.
3. **Strict Bilingual Developer Instructions:** Construct the exact JSON payload format for every client workspace action event. The payload must include nested objects for block coordinates and action timestamps. Validate payload size before every database update.
* **תרחיש בדיקה קוגניטיבי:** האם המערכת מצליחה לתעד אירוע למידה בודד ללא אובדן נתונים.

---

## חלק ג: מרחב הלמידה של התלמיד ומנוע VRA

### 6. מודול לובי התלמיד (Student Hub Module Spec)
1. **דרישות:** המודול מוגדר כמרחב בעיצוב אוניברסלי ללמידה נקי ממסיחים חזותיים. הלובי מציג כרטיס דינמי יחיד המייצג אך ורק את המפגש הפעיל הנוכחי של התלמיד הנשלף מבסיס הנתונים. כרטיס המפגש הראשון נושא את השם המדויק תחנה אחת הכרות עם המערכת. כרטיס המפגש השני נושא את השם המדויק תחנה שתיים יוצאים למסע. בעת הקלקה על הכרטיס המערכת מבצעת מעבר מיידי ורך אל מרחב העבודה בשיטת רינדור מקדים ללא הצגת מסכי טעינה ארוכים או אנימציות מעבר מורכבות המייצרות חרדה קוגניטיבית.
2. **אפיון:** שליפת אובייקט המפגש הפעיל מתעדכן מבסיס הנתונים (session ID מסוג Integer). שאר המפגשים מוגדרים במצב Disabled ומוסתרים לחלוטין. משיכת נתונים פעם אחת בעת טעינת הלובי וסנכרון ה-Local State.
3. **Strict Bilingual Developer Instructions:** Render a clean dashboard displaying only the current active session object fetched from the student state database document. Render all other sessions as disabled and completely hidden from view. Keep local state updated with latest session ID.
* **תרחיש בדיקה קוגניטיבי:** האם התלמיד מבין שהכרטיס שמוצג הוא המפגש היחיד והאם הוא יודע איך להתחיל.

---

### 7. מודול לוח בית המספרים הדיגיטלי (Place Value Chart Module Spec)
1. **דרישות:** המערכת מיישמת עמעום של הטורים הלא פעילים באמצעות שכבת כיסוי כהה בעלת ערך שקיפות קבוע של אפס נקודה שבע בדיוק בעוד הטור הפעיל נשאר מואר לחלוטין. כל הטורים המעומעמים נחסמים באופן הרמטי לכל סוג של קלט כולל חסימת אירועי לחיצה מניעת הקלדה וחסימת גרירה של לבני דינס לתוכם. הנעילה מתבצעת באמצעות הגדרת אירועי מצביע לערך כלום בתוך גיליונות העיצוב המדורגים.
2. **אפיון:** יישום מחלקות CSS לעמעום טורים (brightness 0.6) ונעילת pointer-events בטורים שאינם פעילים בעת חישוב. שמירת הטור הפעיל (column ID מסוג String) ב-Local Storage מניעת עומס חזותי ללא רמזים או טקסטים מקדימים.
3. **Strict Bilingual Developer Instructions:** Developer Instruction: Eradiate all CRA terminology and physical object references. All design specifications and code structures must implement the VRA model only. Implement CSS filter properties for brightness control in the digital place value chart. Sibling columns must receive class dimmed column with brightness 0.6 and pointer events disabled when a specific column is active for calculation. Keep student input anonymous and prevent visual overload with zero placeholders or hints.
* **תרחיש בדיקה קוגניטיבי:** האם התלמיד מזהה איזה טור הוא הפעיל ביותר וכיצד הוא עובר בין טורים.

---

### 8. מודול לבני דינס וירטואליות (Dienes Blocks Engine Module Spec)
1. **דרישות:** המנוע הגרפי מרנדר ארבעה סוגי בלוקים וירטואליים בקצב של שישים פריימים בשנייה הכוללים קוביות יחידה מוטות עשרות לוחות מאות ובלוקים של אלפים. הבלוקים מעוצבים במראה תלת ממדי המזמין פעולה פיזית של גרירה. אזורי הקליטה בטורי בית המספרים מוגדלים בשלושים פיקסלים מעבר לגבולות הטור הפיזיים ומופעל אלגוריתם משיכה מגנטי לקובייה הקרובה כדי לפצות על קשיים מוטוריים של הלומדים. מצב מיקומי וכמויות הבלוקים בלוח מסונכרן באופן מלא ומיידי עם פעולות כפתור ביטול הפעולה כך שלחיצה על ביטול הפעולה משחזרת בדיוק של מאה אחוזים את מצב וכמות הלבנים הקודם ללא עיוותים.
2. **אפיון:** מנוע גרפי מבוסס HTML5 Canvas / WebGL להצגת הבלוקים הדיגיטליים ב-60fps. שמירת מיקומי הבלוקים במערך קואורדינטות ב-Local Storage. יישום מנוע פיזיקלי להצמדה מגנטית (Magnetic Snap) והרחבת שטחי השמיטה ב-30px. תיעוד אירועי PLACE_VALUE_CONVERSION בלוגים.
3. **Strict Bilingual Developer Instructions:** Developer Instruction: Eradiate all CRA terminology and physical object references. All design specifications and code structures must implement the VRA model only. Use WebGL or HTML5 Canvas for smooth digital block manipulation at 60fps. Implement magnetic snap physics in drop targets. Log conversion events PLACE VALUE CONVERSION only at logical milestones. Ensure the physics engine calculates collision detection within the expanded drop zones.
* **תרחיש בדיקה קוגניטיבי:** האם הלומד מצליח לגרור ולהצמיד את הבלוקים למקום הנכון מבלי שהם יחזרו למקומם בטעות.

---

### 9. מודול מקלדת דינמית וגשר VRA דיגיטלי (Dynamic Keyboard and VRA Bridge Module Spec)
1. **דרישות:** עבור תלמידים תחת פרופיל תמיכה קוגניטיבי מוגבר המופעל ידנית וסמויה על ידי המורה המקלדת בשורת התוצאה בטורים המצריכים המרה מתמטית ננעלת לחלוטין ונפתחת לקלט רק לאחר זיהוי אירוע המרה מוצלח בלבני הדינס הווירטואליות. עבור תלמידים במסלול הרגיל המקלדת בשורת התוצאה נשארת פתוחה וחופשית לקלט בכל שלבי החישוב כדי לעודד שליפה עצמאית ותובנה מספרית. עיגולי הזיכרון בראש הטורים נותרים פתוחים תמיד להקלדה חופשית ואינם מושפעים בשום מקרה ממנגנון נעילת המקלדת של שורת התוצאה במטרה להקל על עומס זיכרון העבודה.
2. **אפיון:** ניהול מצבי מקלדת מותנים (Locked/Unlocked) במנוע גשר VRA. פתיחת המקלדת מתבצעת רק בקבלת אירוע PLACE_VALUE_CONVERSION_SUCCESS. עיגולי הזיכרון נותרי פתוחים תמיד. זמן תגובה לשינוי מצב פחות מ-50ms. בדיקת קלט מול התרגיל הפעיל ללא רמזים או placeholders.
3. **Strict Bilingual Developer Instructions:** Eradiate all CRA terminology and physical object references. All design specifications and code structures must implement the VRA model only. Implement conditional column keyboard locking in worksheet addition/subtraction steps. Unlock the keyboard output only upon receiving the PLACE_VALUE_CONVERSION_SUCCESS event triggered by either: (a) precise selection of 10 unit blocks or 10 tens displaying a 'group' button in addition/regrouping modes, or (b) clicking directly on a ten/hundred block in the active column to decompose/regroup it during subtraction/decomposition modes, followed by block migration animation and symbolic chart update. Keep memory circles active for working memory relief. Validate input format against current exercise with zero placeholders or hints.
* **תרחיש בדיקה קוגניטיבי:** האם הלומד מבין מדוע המקלדת נעולה ואיזו פעולה הוא צריך לבצע כדי לשחרר את הנעילה.

---

### 10. מודול לוח חיבור אדפטיבי מבוקר (Symmetrical Addition Grid Module Spec)
1. **דרישות:** הלוח מוצג כרשת סימטרית קומפקטית הממוקמת ישירות מתחת לטור החישוב הפעיל בעת חשיפתו. כברירת מחדל הלוח ממוזער ומוסתר לחלוטין מהעין למניעת עומס חזותי. הלוח נחשף באנימציית עמעום עדינה של שתי שניות וחצי רק בעת הגדרת פרופיל תמיכה קוגניטיבי מוגבר על ידי המורה או בעת זיהוי אירוע היסוס ממושך של מעל שלושים שניות בפתרון הטור הפעיל. הלוח נעלם לחלוטין מהמסך באנימציית עמעום של שלוש שניות בדיוק לאחר שהתלמיד מזין ספרה מוצלת בשורת התוצאה או בעיגול הזיכרון במטרה לעודד את דעיכת הפיגום ומניעת פיתוח תלות פדגוגית.
2. **אפיון:** ניהול נראות הלוח ב-React Local State. מעבר Framer Motion עם Fade In של 2500ms ו-Fade Out של 3000ms בעת הקלדה מוצלחת. שמירת visibility מסוג Boolean במגזרי המפגש.
3. **Strict Bilingual Developer Instructions:** Control grid visibility via React local state. Track user interaction events (drag, click-to-decompose, typing, undo) to reset the internal column timer. Fire HESITATION_TRIGGER and reveal the socratic card in a side drawer (no popup alerts) strictly after 45 seconds of complete absence of user input events. Apply Framer Motion transitions for fade in over 2500ms and auto fade out over 3000ms triggered by successful key input. Ensure the visibility logic is decoupled from main database write operations.
* **תרחיש בדיקה קוגניטיבי:** האם הלומד מבין מתי הלוח מופיע ומתי הוא נעלם.

---

### 11. מודול כפתור ביטול פעולה פדגוגי (Undo Action Engine Module Spec)
1. **דרישות:** הגדרת כפתור ביטול הפעולה ככלי מרכזי לתמיכה בוויסות עצמי ובניית חוסן רגשי באמצעות יישום עקרון הטעות ההפיכה ללא חיווי ענישתי. כפתור ביטול הפעולה ממוקם בפינה הימנית העליונה של מרחב העבודה של התלמיד בגודל של ארבעים ושמונה פיקסלים על ארבעים ושמונה פיקסלים בדיוק. פעולות ביטול הפעולה הן שקטות לחלוטין ואינן נרשמות כטעויות או כשגיאות או כניסיונות מענה כושלים בבסיס הנתונים ואינן משפיעות לרעה על מדדי ההערכה או עדכון הרדאר הפדגוגי. לחיצה על כפתור ביטול הפעולה משחזרת באופן מיידי וסנכרוני את מצב מרחב העבודה במאה אחוזים לרבות שחזור מיקומי וכמויות לבני הדינס הווירטואליות על גבי הקנבס והחזרת הספרות שהוקלדו בתיבות שורת התוצאה ובתיבות עיגולי הזיכרון.
2. **אפיון:** ניהול מחסנית מצבים (state stack מסוג Array) בצד הלקוח המוגבלת ל-10 פעולות אחרונות. בעת לחיצה, המערכת מוציאה מצב מהמחסנית ומשחזרת את קואורדינטות הבלוקים והקלט ללא דיווח דגלי שגיאה בטלמטריה.
3. **Strict Bilingual Developer Instructions:** Implement the Undo action button as a silent self regulation tool. Locate the button at the top right corner of the workspace sized exactly 48px by 48px. Maintain a client side state stack in local memory restricted to the last 10 actions. Triggering undo must asynchronously restore the canvas block counts, their precise visual positions, and the numeric inputs in both the result fields and memory circles. Enforce a strict rule: undo actions must be fully excluded from telemetry mistake tallies, errors, or latency calculation flags.
* **תרחיש בדיקה קוגניטיבי:** האם הלומד יודע כיצד לבטל את הפעולה האחרונה ללא חשש מתוצאות.

---

## חלק ד: מנוע החניכה הסוקרטי ומפרט אינטגרציית ג'מיני

### 12. מודול חונכות סוקרטית ובלימת ניחושים (Socratic Mentoring Module Spec)
1. **דרישות:** מניעת חוסר אונים נרכש ובלימת לולאות ניחושים מהירות באמצעות עצירה פדגוגית מבוקרת וחניכה סוקרטית בממשק סגור. כרטיס החניכה הצידי מופעל באופן אוטומטי בעת זיהוי היסוס קוגניטיבי של ארבעים וחמש שניות רצופות בטור הפעיל או בעת זיהוי של ארבע מחיקות רצופות של ספרות בתוך הטור הפעיל. בעת בחירת מסיח שגוי בתוך כרטיס החניכה המערכת נועלת את לחצני המענה של כרטיס החניכה בלבד למשך שישים שניות בדיוק ומציגה חיווי חזותי שקט של שעון חול דיגיטלי. בזמן נעילה זו שאר מרחב העבודה בלבני הדינס וכפתור ביטול הפעולה נותרים פעילים וחופשיים לחלוטין כדי לכוון את התלמידים לחקור את הייצוגים ולתקן את עצמם ברוגע. עם זיהוי הטריגר המערכת מבצעת פנייה לשרת ומשגרת את קובץ נתוני הטלמטריה המלא בפורמט ג'ייסון המייצג את מצב מרחב העבודה של התלמיד ברמת מודל ייצוג וירטואלי לקבלת שאילתת החניכה המדויקת ממנוע ג'מיני.
2. **אפיון:** Zustand Store מנהל socraticState. חסימה באמצעות setTimeout של 60,000ms. המצב נשמר ב-LocalStorage לשרידות לרענון.
3. **Strict Bilingual Developer Instructions:** Implement the socratic card in a dedicated side drawer without using popup dialogs. Trigger socratic card activation strictly upon: (a) 45 seconds of continuous column hesitation, or (b) 4 consecutive digit deletions in the active column. Upon incorrect answer selection inside the socratic card, immediately apply a 60 second pointer events disabled block exclusively to the card buttons with a hourglass indicator. Ensure the rest of the workspace, including Dienes blocks canvas interaction and the undo button, remains fully functional and accessible for student exploration. Send workspace telemetry JSON data to initiate server side Gemini API function calls upon trigger detection.
* **תרחיש בדיקה קוגניטיבי:** האם הלומד מבין את השאלה המנחה וכיצד לבחור את התשובה המתאימה.

---

### 13. מפרט סכמת API של מנוע ג'מיני בשרת (Gemini API Schema Spec)
1. **דרישות:** עיגון מפרט ממשקי החיבור למנוע הבינה המלאכותית לשמירה על אחידות וחד ערכיות של שאילתות החניכה ללא שימוש בצ'אט חופשי מסיח. השאילתה הנשלחת לענן מכילה מזהה תלמיד אנונימי (אחת עד שתים עשרה) מזהה תרגיל מזהה הטור הפעיל מצב הלבנים בטורים השונים ערכי עיגולי הזיכרון והיסטוריית הפעולות האחרונות. פלט המנוע מוגבל למבנה נתונים קבוע הבא בלבד:
```json
{
  "guiding_question": "שאלה מנחה קצרה בת שורה אחת בלבד",
  "options": [
    {"id": "A", "text": "מסיח אופטימלי נכון עם משוב חיובי קצר"},
    {"id": "B", "text": "מסיח שגוי א עם רמז מבני עדין"},
    {"id": "C", "text": "מסיח שגוי ב עם רמז מבני עדין"}
  ]
}
```
הגדרת הנחיות מערכת קבועות המאלצות את ג'מיני לפעול כחונך סוקרטי המבוסס אך ורק על מודל ייצוג וירטואלי הדיגיטלי תוך איסור מוחלט על מתן התשובה הסופית לתלמיד או שימוש במונחי חשבון מוחשי ייצוגי אבסטרקטי.
2. **אפיון:** קריאת Firebase Cloud Function המאמתת מול Gemini API. במקרה של כשל או Timeout, המערכת מבצעת Fallback לאוסף רמזים סטטי קבוע מראש. מפתחות ה-API מוצפנים במשתני סביבה בשרת.
3. **Strict Bilingual Developer Instructions:** Enforce a rigid JSON schema validation for the Gemini API exchange. The outgoing request payload must convey the current workspace state containing anonymous student ID, active column ID, block counts per column, memory circle digits, and action history. The return JSON response schema must be strictly constrained to a single string field for the guiding question and exactly three closed option objects containing unique IDs, option texts, and concise feedback strings. Program system instructions to bind the Socratic persona exclusively to the digital VRA model, strictly forbidding direct answer disclosure or any physical CRA terminology.
* **תרחיש בדיקה קוגניטיבי:** האם ה-API מחזיר את המבנה הנכון בזמן סביר.

---

## חלק ה: מפגשי הלמידה, רפלקציה ועבודה מחוץ לרשת

### 14. מודול מפגשים 1 עד 8 ומנוע תרגילים (Worksheet and Session Progression Module Spec)
1. **דרישות:** ניהול רצף הלמידה ההיררכי ושמירה על מהימנות הנתונים וביטחון הלומדים. הגדרת זמני מפגש קשיחים: המערכת אוכפת הגבלת זמן עבודה עצמאית נטו באמצעות טיימר קצה בצד השרת: חמש עשרה דקות נטו של עבודה עצמאית במפגשים האדפטיביים שלוש עד שבע ועשרים וחמש דקות נטו של עבודה עצמאית שקטה במפגשי האבחון וההערכה שתיים ושמונה. אפיון מדיניות לומדים מהירים: תלמידים שיסיימו את שבעת תרגילי החובה של המפגש לפני תום הזמן מופנים באופן אוטומטי למסך בחירה מעצים המציע שתי אפשרויות למידה עצמאיות בלבד: נתיב החזרה והביסוס המכיל תרגילי ריענון וביסוס מנושאים קודמים לרבות ייצוג מספרים בדרכים לא סטנדרטיות בלוח הלבנים ונתיב האתגר והעומק המכיל משימות חקר מורכבות בתחום הרבבה המצריכות שלוש פריטות רצופות או גילוי מספר ספרות חסרות בו זמנית לאורך שלבי האלגוריתם בעזרת הלבנים.
2. **אפיון:** ניהול current problem index (Integer) ב-React State ובסנכרון קבוע מול השרת. חישוב ציונים וביצועים מבוסס על תרגילי חובה בלבד לצורך השוואה הוגנת בבסיס הנתונים.
3. **Strict Bilingual Developer Instructions:** Enforce exact session durations in React state synchronized with server side session timers: exactly 15 minutes net of independent practice for adaptive sessions 3 to 7, and exactly 25 minutes net for diagnostic and evaluation sessions 2 and 8. Implement an early completion screen redirecting fast students who solve the 7 compulsory tasks to select between two pathways: (a) Review and Consolidation rendering non standard representation tasks, or (b) Challenge and Depth rendering complex triple regrouping equations in the range of 10000 or missing digits worksheets. Restrict all dashboard mastery analytics exclusively to the 7 compulsory problems.
* **תרחיש בדיקה קוגניטיבי:** האם הלומד מבין איזה תרגיל הוא פותר כרגע וכיצד הוא מתקדם לתרגיל הבא.

---

### 15. מודול ארגז חול דיגיטלי מונחה ומצב מקרן (Sandbox and Projector Mode Module Spec)
1. **דרישות:** ניהול הלמידה ההיברידית הכיתתית בצורה רכה המונעת חרדה ותסכול בעת עצירת הפעילות במחשבים. מפרט עיצוב ממשק מצב מקרן: המערכת מציגה על מסך התלמיד מסך המתנה שקט מעוצב ומשרה רוגע הכולל תמונת רקע שלווה אייקון מקרן ברור ואת המשפט המפורש בגופן גדול ובולט: הקשיבו להסבר של המורה על גבי המקרן. מצב המקרן מנוהל באמצעות משתנה בוליאני בשרת והסנכרון בצד לקוח התלמיד מתבצע באופן מיידי באמצעות מאזין בזמן אמת המבטיח נעילה ושחרור של המסכים בתוך פחות משנייה אחת.
2. **אפיון:** שמירת projector mode מסוג Boolean בשרת. כשהמצב פעיל, רינדור לקוח התלמיד מוגדר לרכיב המתנה שליו וחוסם כל אינטראקציה, תוך קבלת פקודות שליטה מדשבורד המורה.
3. **Strict Bilingual Developer Instructions:** Eradicate all rendering of null or blank screen states when projector mode is active. Implement a dedicated, visually soothing waiting screen component on student clients displaying a serene background, a projector icon, and the bold text message: הקשיבו להסבר של המורה על גבי המקרן. Synchronize the projector mode boolean state using a real time Firestore onSnapshot listener, ensuring screen locking and unlocking events complete on all student clients in less than 1000ms.
* **תרחיש בדיקה קוגניטיבי:** האם הלומד יודע כיצד להשתמש בארגז החול והאם המערכת מונעת הפרעות במצב מקרן.

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
