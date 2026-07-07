export interface RoutePhasePreview {
  phaseNumber: number;
  title: string;
  durationMinutes: number;
  description: string;
  exercisesCount?: number;
}

export interface RouteSessionMetadata {
  sessionNumber: number;
  goals: string;
}

export interface RouteMetadata {
  id: 'YELLOW' | 'GREEN';
  name: string;
  description: string;
  sessions: RouteSessionMetadata[];
  session3PhasesPreview: RoutePhasePreview[];
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
    session3PhasesPreview: [
      { phaseNumber: 1, title: 'הקניה מודרכת (צפייה וחקירה)', durationMinutes: 7, description: 'סרטון קצר המדגים המרה של 10 יחידות לעשרת אחת, ולאחריו חקר מונחה עם בדידים.', exercisesCount: 2 },
      { phaseNumber: 2, title: 'תרגול מבוסס כלי (Scaffolded Practice)', durationMinutes: 10, description: 'תרגול אינטנסיבי של חיבור עם המרה (למשל 27+15) תוך חובה להשתמש בבדידים על הלוח ללא קיצורי דרך.', exercisesCount: 5 },
      { phaseNumber: 3, title: 'אתגר סיכום', durationMinutes: 3, description: 'תרגיל אחד ללא בדידים לבחינת ההפנמה. במידה ויש שגיאה הלוח קופץ חזרה.', exercisesCount: 1 }
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
    session3PhasesPreview: [
      { phaseNumber: 1, title: 'חקר אסטרטגיות חישוב בראש', durationMinutes: 5, description: 'הצגת דרכי פעולה שונות לפתרון משוואות עם מחובר חסר, והתנסות בקריאת תרשים "שלם וחלקים".', exercisesCount: 2 },
      { phaseNumber: 2, title: 'תרגול עצמאי - גמישות (Independent Practice)', durationMinutes: 10, description: 'תרגול מציאת מחוברים חסרים (למשל 34 + ___ = 61) ללא עזרים דיגיטליים מעכבים, דגש על מהירות ודיוק.', exercisesCount: 8 },
      { phaseNumber: 3, title: 'אתגר המחשבה (Extension)', durationMinutes: 5, description: 'השלמת שרשרת חישובים שדורשת תכנון של שני צעדים קדימה.', exercisesCount: 2 }
    ]
  }
};
