# Original User Request

## Initial Request — 2026-07-10T00:08:22+03:00

בחינה וניתוח מעמיק של יכולת ה-AI להבין את מצבו הקוגניטיבי של התלמיד מתוך הנתונים הקיימים (Q-Matrix, הקלטות מסך, לוגים של התראות, ותשובות התלמיד). מטרת הצוות היא להכריע האם סט הנתונים הקיים מספיק כדי להפיק תובנות פדגוגיות איכותיות, ואם לא – להציע ולממש את התיקונים הנדרשים.

Working directory: ~/teamwork_projects/pedagogical_ai_evaluation
Integrity mode: development

## Requirements

### R1. ניתוח איכות המידע הקיים
על סוכני הצוות (לרבות הסוכן הפדגוגי) לסקור את מודל הנתונים הנוכחי שמועבר ל-AI (ה-Q-Matrix, חותמות הזמן, הקלטות המסך של rrweb והלוגים) ולהעריך האם המידע הזה מספיק כדי לזהות בוודאות "מאבק קוגניטיבי" ו"סגנון למידה".

### R2. זיהוי פערי ידע (Blind Spots)
במידה והנתונים הקיימים לא מספקים תמונה מלאה (למשל: חסר מידע על תנועות עכבר מדויקות, זמני השהייה בין לחיצות, או התאמה בין ה-Q-Matrix לפעולה הפיזית), על הצוות למפות את הפערים הללו במדויק.

### R3. בניית מנגנון ניתוח (Proof of Concept)
במידה והנתונים מספיקים (או לאחר שהצוות הציע להם שיפור), על הצוות לכתוב סקריפט/קוד מודל המדגים כיצד ה-AI במערכת יקרא את הנתונים הללו ויפלוט פלט פדגוגי איכותני (דוח מורה מתקדם או שאלה סוקרטית מדויקת).

## Acceptance Criteria

### וידוא אוטומטי ואובייקטיבי
- [ ] ייכתב סקריפט אוטומטי שמייצר נתוני לוגים "מדומים" (Mock) של תלמיד עם טעות קוגניטיבית מורכבת (למשל: הקפצה לא נכונה בחיבור ארוך). הסקריפט יוכיח שהלוגיקה המוצעת של ה-AI מצליחה לזהות את הטעות הספציפית מתוך הנתונים בלבד.
- [ ] הצוות יגיש קובץ Markdown המסכם את המסקנות: האם הנתונים (Q-Matrix, Logs, Replays) מספיקים, ומהם שלושת השיפורים הטכניים הנדרשים כדי לשפר את איכות הניתוח.

### Key Instructions:
1. Perform a deep evaluation of MathmatiCore's current data telemetry, logs, Q-matrix, and rrweb replay structure in `c:\Users\david\Projects\MathmatiCore`.
2. Output the deliverables (Proof of Concept script and the Markdown analysis report) in `C:\Users\david\teamwork_projects\pedagogical_ai_evaluation`. Create this directory if it does not exist.
3. Manage and spawn workers/explorers as needed. Ensure they update their progress.md files and report back.
4. When finished, produce a handoff.md file in your folder.
