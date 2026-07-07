export interface RoutePhasePreview {
  phaseNumber: number;
  title: string;
  durationMinutes: number;
  description: string;
  exercisesCount?: number;
}

export interface RouteSessionData {
  sessionNumber: number;
  goals: string;
  phases: RoutePhasePreview[];
}

export interface RouteMetadata {
  id: 'YELLOW' | 'GREEN';
  name: string;
  description: string;
  sessions: RouteSessionData[];
}

export const ROUTE_METADATA: Record<string, RouteMetadata> = {
  'YELLOW': {
    id: 'YELLOW',
    name: 'מסלול צהוב (מבוסס תמיכה ופיגומים)',
    description: 'מסלול המיועד לתלמידים שהפגינו מאבק קוגניטיבי, מחיקות מרובות, או צורך בהמחשה ויזואלית. המסלול מספק פיגומים (Scaffolding) ומוריד עומס קוגניטיבי.',
    sessions: [
      {
        sessionNumber: 3,
        goals: 'בניית ביטחון בעשרות ויחידות: חיבור מספרים דו-ספרתיים עם המרה ברורה תוך שימוש חובה בלוח מוחשי.',
        phases: [
          { phaseNumber: 1, title: 'הקניה מודרכת (מצגת אינטראקטיבית)', durationMinutes: 10, description: 'מצגת הדרכה עם סמן אוטומטי שזז ומדגים את תהליך ההמרה על הלוח צעד-אחר-צעד, בדומה למדריך הכפתורים של המערכת.', exercisesCount: 2 },
          { phaseNumber: 2, title: 'תרגול מבוסס כלי (Scaffolded Practice)', durationMinutes: 10, description: 'תרגול אינטנסיבי של חיבור עם המרה תוך חובה להשתמש בבדידים על הלוח ללא קיצורי דרך.', exercisesCount: 5 },
          { phaseNumber: 3, title: 'אתגר סיכום', durationMinutes: 5, description: 'תרגיל מסכם המשלב את כל מה שנלמד, ללא פיגומים מעכבים בתחילתו.', exercisesCount: 1 }
        ]
      },
      {
        sessionNumber: 4,
        goals: 'הפחתת תלות במוחשי: תרגילי חיסור עם פריטה תוך הצגת הלוח אך ללא חובת גרירה מלאה.',
        phases: [
          { phaseNumber: 1, title: 'חקר מונחה: מהי פריטה?', durationMinutes: 10, description: 'התמודדות עם חיסור כאשר היחידות לא מספיקות, באמצעות פירוק עשרת.', exercisesCount: 3 },
          { phaseNumber: 2, title: 'תרגול חיסור עם לוח תומך', durationMinutes: 10, description: 'פתרון תרגילי חיסור. הלוח זמין אך השימוש בו נתון לבחירת התלמיד.', exercisesCount: 5 },
          { phaseNumber: 3, title: 'רפלקציה וסיכום', durationMinutes: 5, description: 'מענה על שאלת הבנה קצרה לגבי התהליך.', exercisesCount: 1 }
        ]
      },
      {
        sessionNumber: 5,
        goals: 'ביסוס תובנת המספר (Number Sense): אומדן תוצאות לפני פתרון מדויק.',
        phases: [
          { phaseNumber: 1, title: 'משחקי אומדן (Estimation)', durationMinutes: 10, description: 'תרגילי בחירה מהירה: "האם התוצאה גדולה או קטנה מ-50?"', exercisesCount: 10 },
          { phaseNumber: 2, title: 'וידוא קונקרטי', durationMinutes: 10, description: 'פתרון מדויק של התרגילים מהשלב הקודם בעזרת הכלים ובדיקת הפער מהאומדן.', exercisesCount: 4 },
          { phaseNumber: 3, title: 'הערכה עצמית', durationMinutes: 5, description: 'שאלון ביטחון עצמי במתמטיקה (Metacognitive Wrap-up).', exercisesCount: 1 }
        ]
      },
      {
        sessionNumber: 6,
        goals: 'מעבר לגמישות מחשבתית: פתרון משוואות עם נעלם (Addend חסר) באמצעות המחשות חלקיות.',
        phases: [
          { phaseNumber: 1, title: 'הקניה: שלם וחלקים', durationMinutes: 5, description: 'מצגת אינטראקטיבית קצרה עם סמן אוטומטי המסבירה על הקשר בין חיבור וחיסור לגישת השלם ומרכיביו.', exercisesCount: 0 },
          { phaseNumber: 2, title: 'משוואות ויזואליות', durationMinutes: 15, description: 'השלמת מחוברים חסרים בתוך תרשימי מלבן מוחשיים.', exercisesCount: 6 },
          { phaseNumber: 3, title: 'בעיה מילולית יישומית', durationMinutes: 5, description: 'פתרון בעיה מחיי היומיום הכוללת נעלם.', exercisesCount: 1 }
        ]
      },
      {
        sessionNumber: 7,
        goals: 'הסרת פיגומים מוחלטת: יישום האלגוריתם הסטנדרטי עם תמיכה סוקרטית בלבד.',
        phases: [
          { phaseNumber: 1, title: 'תרגול אלגוריתמי (Abstract Practice)', durationMinutes: 15, description: 'חישובים אנכיים מרובים ללא כלים חזותיים. המערכת מספקת תמיכה סוקרטית טקסטואלית בלבד במקרה של טעות.', exercisesCount: 8 },
          { phaseNumber: 2, title: 'ניתוח שגיאות של "תלמיד דמיוני"', durationMinutes: 10, description: 'הצגת פתרון שגוי ודרישה מהתלמיד לאתר ולתקן את הטעות.', exercisesCount: 2 }
        ]
      }
    ]
  },
  'GREEN': {
    id: 'GREEN',
    name: 'מסלול ירוק (אתגר וגמישות מחשבתית)',
    description: 'מסלול המיועד לתלמידים ששולטים בעובדות יסוד ולא הפגינו היסוסים. המסלול מדלג על שלבי המרה בסיסיים ועובר ישירות לחשיבה אלגברית ואתגרי גמישות.',
    sessions: [
      {
        sessionNumber: 3,
        goals: 'חשיבה אלגברית התחלתית: מציאת מחוברים חסרים במשוואות חיבור (למשל 45 + _ = 72).',
        phases: [
          { phaseNumber: 1, title: 'חקר אסטרטגיות חישוב', durationMinutes: 10, description: 'גילוי עצמאי של דרכי פתרון למציאת הנעלם באמצעות ניסוי וטעייה מושכל.', exercisesCount: 3 },
          { phaseNumber: 2, title: 'תרגול עצמאי', durationMinutes: 10, description: 'השלמת שורת משוואות עם מחוברים או מחוסרים חסרים במהירות.', exercisesCount: 8 },
          { phaseNumber: 3, title: 'אתגר החשיבה', durationMinutes: 5, description: 'פתרון שרשרת חישובים שדורשת תכנון מספר צעדים מראש.', exercisesCount: 2 }
        ]
      },
      {
        sessionNumber: 4,
        goals: 'אומדן ודיוק: חיסור מספרים רב-ספרתיים עם פריטה כפולה תוך ביצוע אומדן מהיר.',
        phases: [
          { phaseNumber: 1, title: 'חישוב מנטלי (Mental Math)', durationMinutes: 10, description: 'ביצוע אומדנים למספרים תלת-ספרתיים בראש תוך זמן מוקצב.', exercisesCount: 10 },
          { phaseNumber: 2, title: 'בעיות רב-שלביות', durationMinutes: 10, description: 'פתרון בעיות הדורשות שתי פעולות חיסור עוקבות (פריטה כפולה).', exercisesCount: 4 },
          { phaseNumber: 3, title: 'נימוק מתמטי', durationMinutes: 5, description: 'כתיבת הסבר קצר (הקלדה) לדרך הפתרון של הבעיה המורכבת ביותר.', exercisesCount: 1 }
        ]
      },
      {
        sessionNumber: 5,
        goals: 'בעיות מילוליות מורכבות: ניתוח מצבים נתונים והפיכתם למשוואה מתמטית ללא עזרים ויזואליים.',
        phases: [
          { phaseNumber: 1, title: 'קריאה ומידול פדגוגי', durationMinutes: 10, description: 'קריאת בעיות ארוכות מרובות משתנים וסימון הנתונים החשובים בלבד.', exercisesCount: 3 },
          { phaseNumber: 2, title: 'יישום מתמטי', durationMinutes: 10, description: 'תרגום הבעיות שסומנו למשוואות מלאות ופתרונן המדויק.', exercisesCount: 3 },
          { phaseNumber: 3, title: 'ביקורת עמיתים', durationMinutes: 5, description: 'הערכת פתרון של עמית לכיתה שאותגר באותה משימה.', exercisesCount: 1 }
        ]
      },
      {
        sessionNumber: 6,
        goals: 'אסטרטגיות חישוב מתקדמות: שימוש בקיזוז (Compensation) לפתרון מהיר.',
        phases: [
          { phaseNumber: 1, title: 'הקניה: אסטרטגיית הקיזוז', durationMinutes: 5, description: 'הדרכה קצרה כיצד לחסר 39 על ידי חיסור 40 והוספת 1.', exercisesCount: 0 },
          { phaseNumber: 2, title: 'אימון אסטרטגי', durationMinutes: 15, description: 'יישום שיטת הקיזוז על שורת תרגילים שתוכננו מראש להיות יעילים בשיטה זו.', exercisesCount: 12 },
          { phaseNumber: 3, title: 'בדיקת מהירות (Speed Round)', durationMinutes: 5, description: 'תרגול תחת לחץ זמנים מתון כדי לקבע את השטף.', exercisesCount: 8 }
        ]
      },
      {
        sessionNumber: 7,
        goals: 'העברה (Transfer): יישום אסטרטגיות אלו בסביבת בעיות שבר/עשרוני (הכנה להמשך).',
        phases: [
          { phaseNumber: 1, title: 'מבוא לעולם העשרוני', durationMinutes: 10, description: 'שימוש בידע הקיים של עשרות ויחידות כדי להבין עשיריות ומאיות דרך כסף.', exercisesCount: 4 },
          { phaseNumber: 2, title: 'חיבור שברים פשוטים (מכנה זהה)', durationMinutes: 10, description: 'הכללת מושג ה"יחידה" ליישום על שברים (למשל 3 חמישיות ועוד 1 חמישית).', exercisesCount: 5 },
          { phaseNumber: 3, title: 'רפלקציה פדגוגית', durationMinutes: 5, description: 'סיכום אישי של התלמיד לגבי התקדמותו בחמשת המפגשים האחרונים.', exercisesCount: 1 }
        ]
      }
    ]
  }
};
