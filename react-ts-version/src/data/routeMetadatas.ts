export interface RouteSessionMetadata {
  sessionNumber: number;
  goals: string;
}

export interface RouteMetadata {
  id: 'YELLOW' | 'GREEN';
  name: string;
  description: string;
  sessions: RouteSessionMetadata[];
  session3TasksPreview: { id: string, title: string, instruction: string }[];
}

export const ROUTE_METADATA: Record<string, RouteMetadata> = {
  'YELLOW': {
    id: 'YELLOW',
    name: 'מסלול צהוב (מבוסס תמיכה ופיגומים)',
    description: 'מסלול המיועד לתלמידים שהפגינו מאבק קוגניטיבי, מחיקות מרובות, או צורך בהמחשה ויזואלית. המסלול מספק פיגומים (Scaffolding) ומוריד עומס קוגניטיבי.',
    sessions: [
      { sessionNumber: 3, goals: 'בניית ביטחון בעשרות ויחידות: חיבור מספרים דו-ספרתיים עם המרה ברורה תוך שימוש חובה בלוח מוחשי.' },
      { sessionNumber: 4, goals: 'הפחתת תלות במוחשי: תרגילי חיסור עם פריטה תוך הצגת הלוח אך ללא חובת גרירה מלאה.' },
      { sessionNumber: 5, goals: 'ביסוס תובנת המספר (Number Sense): אומדן תוצאות לפני פתרון מדויק.' },
      { sessionNumber: 6, goals: 'מעבר לגמישות מחשבתית: פתרון משוואות עם נעלם (Addend חסר) באמצעות המחשות חלקיות.' },
      { sessionNumber: 7, goals: 'הסרת פיגומים מוחלטת: יישום האלגוריתם הסטנדרטי עם תמיכה סוקרטית בלבד במידת הצורך.' }
    ],
    session3TasksPreview: [
      { id: 's3_y_1', title: 'חיבור דו-ספרתי', instruction: 'פתור: 27 + 15. היעזר בלוח המוחשי לבצע את ההמרה.' },
      { id: 's3_y_2', title: 'חיבור עשרות', instruction: 'פתור: 48 + 24. שים לב מה קורה כשיש יותר מ-10 יחידות.' },
      { id: 's3_y_3', title: 'אתגר חיבור', instruction: 'פתור: 36 + 25. נסה לפתור קודם בראש ואז לבדוק עם הבדידים.' }
    ]
  },
  'GREEN': {
    id: 'GREEN',
    name: 'מסלול ירוק (אתגר וגמישות מחשבתית)',
    description: 'מסלול המיועד לתלמידים ששולטים בעובדות יסוד ולא הפגינו היסוסים. המסלול מדלג על שלבי המרה בסיסיים ועובר ישירות לחשיבה אלגברית ואתגרי גמישות.',
    sessions: [
      { sessionNumber: 3, goals: 'חשיבה אלגברית התחלתית: מציאת מחוברים חסרים במשוואות חיבור (למשל 45 + _ = 72).' },
      { sessionNumber: 4, goals: 'אומדן ודיוק: חיסור מספרים רב-ספרתיים עם פריטה כפולה תוך ביצוע אומדן מהיר.' },
      { sessionNumber: 5, goals: 'בעיות מילוליות מורכבות: ניתוח מצבים נתונים והפיכתם למשוואה מתמטית ללא עזרים ויזואליים.' },
      { sessionNumber: 6, goals: 'אסטרטגיות חישוב מתקדמות: שימוש בקיזוז (Compensation) לפתרון מהיר.' },
      { sessionNumber: 7, goals: 'העברה (Transfer): יישום אסטרטגיות אלו בסביבת בעיות שבר/עשרוני (הכנה להמשך).' }
    ],
    session3TasksPreview: [
      { id: 's3_g_1', title: 'מחובר חסר', instruction: 'השלם את המספר החסר: 34 + ___ = 61.' },
      { id: 's3_g_2', title: 'מחובר חסר - אתגר', instruction: 'השלם: ___ + 28 = 75.' },
      { id: 's3_g_3', title: 'חיסור גמיש', instruction: 'פתור 82 - 37 באמצעות חישוב בראש והסבר את דרך הפעולה.' }
    ]
  }
};
