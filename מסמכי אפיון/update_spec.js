const fs = require('fs');

function updateFile(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${filePath}`);
        return;
    }
    
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace the timestamp (works for standard formats)
    content = content.replace(/> \*\*תאריך עדכון אחרון:.*?\*\*/g, '> **תאריך עדכון אחרון: 10.07.2026 01:01**');
    
    // Add the new updates to the NOTE block
    const newUpdates = `> 5. **Teacher-AI Co-Pilot:** ממשק Modal בדשבורד המורה לעריכת תוכנית השיעור (Blueprint) שנוצרה על ידי ה-AI ושיח עם ה-AI להתאמות לפני השחרור למשימות.
> 6. **דשבורד התראות טקטי (Tactical Alerts):** קיבוץ התראות פדגוגיות (Cognitive SOS) בזמן אמת, תוך אבחנה בין התראות אוטומטיות לבין אלו הדורשות התערבות אנושית.
> 7. **מנוע מיקרו-אג'יליות (Socratic Micro-Agility):** ספירת "פסילות" או רצפי הצלחות, והתאמה של רמת הקושי (Decoupled Vector Scaling) להזרקת משימות פיגום בזמן אמת.
> 8. **דשבורד מנהל (Ghost Mode):** תצפית אדמין שקטה (עוקפת markAsRead וקבלות קריאה) על דשבורד המורה והכיתות.
> 9. **תקשורת תלמידים מבוקרת (No AI Chat):** איסור מוחלט על שיח בין תלמיד ל-AI; כל תקשורת מתבצעת אך ורק מול מורה אנושי.
> 10. **עדכוני סכמת נתונים (Data Schema):** לוגיקת קיבוץ לפי Q-Matrix והוספת זרם אירועים סמנטי (Semantic Event Stream) לזיהוי כוונות.\n`;

    // Try to find sliding window text and append right after
    const targetString = 'זיהוי שיוט פסיבי פועל כעת באופן מצטבר למניעת התראות שווא ומתאפס לאחר משימה.';
    if (content.includes(targetString)) {
        if (!content.includes('Teacher-AI Co-Pilot')) {
            const parts = content.split(targetString);
            content = parts[0] + targetString + '\n' + newUpdates + parts[1];
        }
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
}

updateFile('מתמטיקאור - מסמך מאסטר - פיתוח.md');
updateFile('מתמטיקאור- מסמך אפיון מפורט לקראת פיתוח - פיתוח.md');
updateFile('מתמטיקאור- ארכיטקטורת המידע ומפת האתר - פיתוח.md');
updateFile('מתמטיקאור- מסמך אפיון רצף פעילויות מעודכן - פיתוח.md');
