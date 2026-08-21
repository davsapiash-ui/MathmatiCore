# 🔘 חוקיות עיצוב כפתורים קבועה ומחייבת — MathmatiCore
## (Standardized Button Design System & Microcopy Rules)

מסמך זה מגדיר את חוקי העיצוב, הטיפוגרפיה, הניגודיות והמיקרו-קופי המחייבים עבור **כל הכפתורים והרכיבים הלחיצים** בפלטפורמת **MathmatiCore**.

---

## 1. 📐 היררכיה וסוגי כפתורים (Button Variants)

### 1.1 כפתור ראשי / שער מעבר (Primary / Gate Action)
* **ייעוד:** פעולות קריטיות (אישור שער מורה, שמירה והפעלת מפגש, שליחת מבחן).
* **עיצוב:**
  * רקע: גרדיאנט פרימיום עשיר `bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white`.
  * צל: צל צבעוני רך `shadow-lg shadow-indigo-600/25`.
  * פינות: מעוגלות מודרניות `rounded-xl` או `rounded-2xl`.
  * טיפוגרפיה: `font-extrabold text-sm`.
  * שילוב אייקון: אייקון מוביל מודגש (`Sparkles`, `CheckCircle2`, `ArrowLeft`).

### 1.2 כפתור בקרה פדגוגית שוטף (Secondary / Pedagogical Controls)
* **ייעוד:** התאמת תנאי למידה, שינוי רמת פיגום, מעבר בין תצוגות.
* **עיצוב:**
  * רקע: `bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100`.
  * גבול: עדין ונקי `border border-slate-200/80 dark:border-slate-700`.
  * צל: עדין `shadow-sm`.
  * טיפוגרפיה: `font-bold text-xs`.

### 1.3 כפתור התקדמות והצלחה (Success / Advance Action)
* **ייעוד:** התקדמות בתרגיל, אישור הצלחה, סיום שלב.
* **עיצוב:**
  * רקע: `bg-emerald-600 hover:bg-emerald-700 text-white`.
  * טיפוגרפיה: `font-display font-extrabold`.
  * אייקון: חץ התקדמות `ArrowLeft` או `Check`.

### 1.4 כפתור אזהרה / איפוס / דחייה (Destructive / Reset Action)
* **ייעוד:** איפוס נתוני תלמיד, איפוס כיתה, דחיית תוכנית.
* **עיצוב:**
  * רקע: עדין ולא מאיים `bg-rose-50/70 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300`.
  * גבול: `border border-rose-200 hover:border-rose-300 dark:border-rose-800`.
  * טיפוגרפיה: `font-bold text-xs`.
  * אייקון: `RotateCcw` או `Trash2`.

### 1.5 כפתור אייקון / UDL Target (Icon Action Buttons)
* **ייעוד:** ביטול פעולה (Undo), חזרה ללובי, צ'אט, סגירת חלונות.
* **עיצוב:**
  * גודל מינימלי למגע: **`44x44px`** (לביטול פעולה בסביבת התלמיד: **`48x48px`**).
  * צורה: `rounded-2xl` או `rounded-full`.
  * נגישות: חובת `aria-label` מפורש ו-`title` בעברית.

---

## 2. ✍️ כללי ניסוח ומיקרו-קופי (Microcopy Rules)

1. **איסור מוחלט על סוגריים באנגלית ושפת מפתחים:**
   * ❌ `שמור טיוטה (Save Draft)` ⬅️ ✅ **"שמור טיוטה"**
   * ❌ `בטל פעולה (Undo)` ⬅️ ✅ **"בטל פעולה אחרונה"**
   * ❌ `הפצה מרוכזת (Batch)` ⬅️ ✅ **"הפצה מרוכזת לכל הכיתה"**
   * ❌ `פתיחת עקיפה פיזית ועורך (Student Side Drawer)` ⬅️ ✅ **"התאמת תנאי למידה"**
   * ❌ `(State Replay)` / `(Video Replay)` ⬅️ ✅ **"שחזור לוח בית המספרים"** / **"הקלטת מסך וידאו"**

2. **ניסוח מוכוון פעולה (Verb-First):**
   * תמיד לפתוח בפועל או שם פעולה ברור: *"התאם תנאי למידה"*, *"אשר והפעל תוכנית"*, *"שמור שינויים"*, *"חזור ללובי"*.

3. **בהירות פדגוגית:**
   * ניסוח בגובה העיניים המכבד את המורה והתלמיד, ללא קיצורים טכניים.

---

## 3. ♿ נגישות ואינטראקציה (UDL & Micro-Interactions)

* **משוב לחיצה טבעי (Active Feel):**
  * כל כפתור לחיץ כולל: `active:scale-[0.97] transition-all duration-150`.
* **סמן עכבר ומצבי השבתה:**
  * כפתור פעיל: `cursor-pointer`.
  * כפתור מושבת: `disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none`.
* **פוקוס מקלדת:**
  * טבעת פוקוס נקייה: `focus-visible:ring-4 focus-visible:ring-indigo-500/40 focus-visible:outline-none`.
* **ייצוג רב-ערוצי:**
  * כל כפתור מלווה באייקון גרפי לצד הטקסט להקלה קוגניטיבית.
