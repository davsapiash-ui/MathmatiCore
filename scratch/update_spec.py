import re
import datetime

file_path = r"c:\Users\david\Projects\MathmatiCore\מסמכי אפיון\מתמטיקאור- מסמך אפיון רצף פעילויות מעודכן - פיתוח.md"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Change "מפגש" / "מפגשים" to "שיעור" / "שיעורים"
content = content.replace("המפגש", "השיעור")
content = content.replace("במפגש", "בשיעור")
content = content.replace("מפגש", "שיעור")
content = content.replace("מפגשים", "שיעורים")
content = content.replace("המפגשים", "השיעורים")
content = content.replace("במפגשים", "בשיעורים")

# 2. Clarify that within each Lesson there are "stages", and each stage takes 25-30 minutes of net work with the software.
# Let's insert a paragraph at the top of the document after the title:
stages_clarification = "כל שיעור מורכב ממספר שלבים (Stages). כל שלב אורך כ-25-30 דקות של עבודה נטו עם מערכת המעבדה, על מנת לשמור על עוררות קוגניטיבית ולמנוע עומס."
# Find section 2 and inject the clarification
content = content.replace("2 מבט ממעוף הציפור על רצף הלמידה הכללי**", f"2 מבט ממעוף הציפור על רצף הלמידה הכללי**\n{stages_clarification}")
# Also replace "זמן העבודה הנטו מול התוכנה יוגבל לטווח של עשרים עד שלושים דקות בלבד בכל מפגש." with "... בכל שלב בשיעור."
content = content.replace("זמן העבודה הנטו מול התוכנה יוגבל לטווח של עשרים עד שלושים דקות בלבד בכל שיעור.", "זמן העבודה הנטו מול התוכנה יוגבל לטווח של עשרים עד שלושים דקות בלבד בכל שלב בשיעור.")

# 3. Replace the narrative of "אבחון" (Diagnosis) and "חונך סוקרטי" (Socratic Tutor) with "מעבדת החשיבה", "מערכת המעבדה", "סריקת רדאר", and "ציוד מעבדה/ניסויים".
content = content.replace("אבחון מעוף הדבורה", "סריקת רדאר מעוף הדבורה")
content = content.replace("לאבחון", "לסריקת רדאר")
content = content.replace("באבחון", "בסריקת רדאר")
content = content.replace("אבחון סמוי", "סריקת רדאר סמויה")
content = content.replace("מטריצת האבחון", "מטריצת סריקת הרדאר")
content = content.replace("האבחון הכפול", "סריקת הרדאר הכפולה")
content = content.replace("האבחון", "סריקת הרדאר")
content = content.replace("אבחון", "סריקת רדאר")

content = content.replace("חונך סוקרטי", "מערכת המעבדה")
content = content.replace("לחונך סוקרטי", "למערכת המעבדה")
content = content.replace("החונך הסוקרטי", "מערכת המעבדה")
content = content.replace("חונך דיגיטלי", "מערכת המעבדה")
content = content.replace("החונך הדיגיטלי", "מערכת המעבדה")
content = content.replace("חונך הבינה המלאכותית", "מערכת המעבדה מבוססת הבינה המלאכותית")

content = content.replace("משימות אבחון", "משימות מעבדה וניסויים")
content = content.replace("משימת אבחון", "משימת ניסוי במעבדת החשיבה")
content = content.replace("משימות מיפוי", "משימות ניסוי")
content = content.replace("מנוע האבחון", "רדאר מעבדת החשיבה")
content = content.replace("מערכת האבחון", "מערכת סריקת הרדאר")
content = content.replace("מנוע הסוקרטי", "מנוע מעבדת החשיבה")

content = content.replace("בממשק הדיגיטלי", "בציוד המעבדה הדיגיטלי")
content = content.replace("התוכנה", "מערכת המעבדה")

# The AI never chats with the student; it's a silent system guiding experiments via Socratic pedagogical friction.
# Let's add this explicit rule in the architecture section
ai_chat_rule = "\n* **כלל ברזל - תקשורת מול הלומד:** מובהר בזאת שמערכת ה-AI (מערכת המעבדה) אינה מתקשרת לעולם בצ'אט ישיר מול התלמיד. מדובר במערכת אילמת שמכוונת ומובילה את הניסויים רק על ידי יצירת 'חיכוך פדגוגי סוקרטי' בממשק."
content = content.replace("ה-AI (Socratic Engine) יקבל גישה בזמן אמת לפרופיל ה-Q-Matrix (לדוגמה, אם ה-AI רואה תגית `regrouping_anxiety`, הוא ינחה את התלמיד בצ'אט: \"אני רואה שיש לך מספיק עשרות אבל לא מספיק יחידות. זוכר את סוד הפריטה?\").", "מערכת המעבדה (Thinking Lab Engine) תקבל גישה בזמן אמת לפרופיל ה-Q-Matrix ותייצר פיגומים והתאמות באופן סמוי (ללא צ'אט ישיר)." + ai_chat_rule)

# 4. Add spec timestamp
# The spec updater skill says: 
# `> **תאריך עדכון אחרון: DD.MM.YYYY HH:MM**`
import datetime
now_str = datetime.datetime.now().strftime("%d.%m.%Y %H:%M")
timestamp_str = f"> **תאריך עדכון אחרון: {now_str}**"

# Replace existing timestamp 
content = re.sub(r"> \*\*תאריך עדכון אחרון:.*?\*\*", timestamp_str, content)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Update completed.")
