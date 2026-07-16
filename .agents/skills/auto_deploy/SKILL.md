---
name: auto_deploy
description: >
  פורס (Deploy) את הקוד ל-GitHub ומוודא שה-CI/CD של Firebase הסתיים בהצלחה.
  מופעל כשהמשתמש אומר אחד מהביטויים הבאים:
  "תפרוס את הקוד" / "תעדכן את הקוד" / "תעלה את הקוד" / "deploy" / "push".
  מדווח בבירור אם הפריסה הצליחה או נכשלה עם הסיבה המדויקת.
---

<div dir="rtl" align="right">

# סקיל: פריסה אוטומטית עם אימות CI/CD (auto_deploy)

## כלל ברזל
**לעולם אל תכריז "הכל עלה בהצלחה" לפני שה-CI/CD הסתיים בפועל ואומת.**
אם יש כישלון — דווח עליו מיד, אל תעקוף ואל תסתיר.

---

## תהליך הפעולה (צעד אחר צעד)

### שלב 1 — בדיקת מצב הקוד
הרץ תמיד לפני ה-commit:
```powershell
git status
git diff --stat
```
דווח למשתמש אילו קבצים השתנו. אל תעשה commit לקוד שלא בדקת.

### שלב 2 — Commit ו-Push
```powershell
git add .
git commit -m "[DESCRIBE CHANGE HERE]"
git push origin main
```

**חשוב:** הודעת ה-commit חייבת לתאר בפועל מה השתנה. אין "fix", אין "update". 
דוגמה טובה: `"fix: correct ASD column dimming opacity in PlaceColumn.tsx"`

אם ה-push נכשל (שגיאת authentication, conflict וכו') — **עצור ודווח מיד**. אל תנסה עצות עוקפות.

### שלב 3 — המתנה לסיום CI/CD
מיד לאחר ה-push, הרץ:
```powershell
gh run list --limit 1 --json databaseId,status,conclusion,name,headBranch
```

המתן עד שהסטטוס יעבור מ-`in_progress` ל-`completed`.
כדי לעקוב בזמן אמת:
```powershell
gh run watch
```

**אל תעבור לשלב 4 לפני שהסטטוס הוא `completed`.**

### שלב 4 — בדיקת תוצאה
הרץ:
```powershell
gh run list --limit 1 --json conclusion,name,url
```

**אם `conclusion` הוא `success`:**
> ✅ הפריסה הושלמה בהצלחה. הקוד חי ב-Firebase Hosting.
> 🔗 לינק לאימות ידני: [URL של האתר החי]

**אם `conclusion` הוא `failure`:**
> ❌ הפריסה נכשלה.
> הרץ את הפקודה הבאה כדי לראות את שגיאת ה-Build המדויקת:
```powershell
gh run view --log-failed
```
> דווח למשתמש את השגיאה המלאה ואל תנחש את הפתרון — קרא את הלוג.

### שלב 5 — דיווח סופי למשתמש
תמיד סיים ב:
```
📦 Commit: [hash קצר]
🌿 Branch: main
⏱️ זמן CI/CD: [כמה דקות לקח]
✅/❌ תוצאה: [הצלחה/כישלון]
🔗 GitHub Actions: [לינק ישיר ל-run]
```

---

## מה הסקיל הזה לא עושה
- לא מתקן שגיאות build אוטומטית ללא אישור המשתמש
- לא מכריז על הצלחה לפני שהוודא אותה
- לא עושה force-push או שינויים בהיסטוריית ה-git

</div>
