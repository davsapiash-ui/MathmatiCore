import type { MathTask } from '../domain/entities/Task';

export const SESSION1_TASKS: MathTask[] = [
  {
    id: 's1_welcome',
    type: 'session1_intro',
    titleHe: 'בואו נשחק ונכיר את הלוח! 🎉',
    instructionHe: 'נסו לגרור קוביות קטנות (יחידות) או עמודות (עשרות) אל טבלת ערך המקום וראו איך המספר מתעדכן. אחר כך, נסו לגרור עמודה אחת של עשרת אל טור היחידות, וחשבו על השאלה למטה:',
    thoughtQuestionHe: 'אם נגרור עשרת אחת (10) לטור היחידות והיא תתפרק ל-10 יחידות, האם הערך הכולל של המספר בטבלה השתנה?',
    choices: [
      { id: 'א', textHe: 'הכמות נשארה בדיוק אותו הדבר (10). לא הוספנו ולא הורדנו קוביות מהטבלה, פשוט פרטנו את העשרת ליחידות בודדות!', correct: true },
      { id: 'ב', textHe: 'הכמות גדלה ל-20, כי עכשיו יש לנו הרבה קוביות קטנות בטבלה במקום עמודה אחת.' },
      { id: 'ג', textHe: 'הכמות קטנה והפכה לאפס, כי עמודת העשרת נעלמה לגמרי.' }
    ],
    correctChoice: 'א',
    scaffoldLevel: 0
  },
  {
    id: 's1_t1',
    type: 'addition_simple',
    numberA: 12, numberB: 24, correctAnswer: 36,
    titleHe: 'חיבור פשוט - תרגיל 1',
    instructionHe: 'פתרו את התרגיל על ידי גרירת הקוביות לכל טור, וכתבו את הסכום בתיבת התשובה.',
    scaffoldLevel: 1
  },
  {
    id: 's1_t2',
    type: 'place_value_zero',
    number: 205,
    titleHe: 'היכרות עם ערך המקום והאפס',
    instructionHe: 'הביטו במספר שמופיע למטה. גררו את הקוביות לטבלה כדי לייצג אותו, ואז בחרו את התשובה הנכונה.',
    choices: [
      { id: 'A', textHe: 'האפס שומר על המקום של העשרות — יש 0 עשרות במספר הזה', correct: true },
      { id: 'B', textHe: 'האפס לא משנה כלום — המספר הוא בעצם 25' },
      { id: 'C', textHe: 'האפס הוא רק קישוט ואפשר להשמיט אותו' }
    ],
    correctChoice: 'A',
    scaffoldLevel: 1
  },
  {
    id: 's1_t3',
    type: 'flexible_decomp',
    number: 234,
    titleHe: 'גמישות והמרה',
    instructionHe: 'ייצגו את המספר שמופיע למטה בבית המספרים. האם תוכלו למצוא דרך נוספת לייצג אותו (למשל, על ידי פריטת עשרת אחת)?',
    scaffoldLevel: 1
  },
  {
    id: 's1_t4',
    type: 'number_line',
    number: 60,
    titleHe: 'ישר המספרים',
    instructionHe: 'גרור את החץ אל המיקום המשוער של המספר על ישר המספרים.',
    scaffoldLevel: 2
  },
  {
    id: 's1_t5',
    type: 'vertical_addition',
    numberA: 524, numberB: 322, correctAnswer: 202, isSubtraction: true,
    titleHe: 'התנסות בחיסור במאונך',
    instructionHe: 'התנסו בפתרון התרגיל באמצעות בית המספרים. כתבו כל ספרה של התשובה במקום המתאים לה.',
    scaffoldLevel: 2
  }
];

export const SESSION2_TASKS: MathTask[] = [
  {
    id: 'q1',
    type: 'place_value_zero',
    titleHe: 'ערך המקום והאפס',
    instructionHe: 'הביטו במספר שמופיע למטה. גררו את הקוביות לטבלה כדי לייצג אותו, ואז בחרו את התשובה הנכונה.',
    number: 304,
    choices: [
      { id: 'A', textHe: 'האפס שומר על המקום של העשרות — יש 0 עשרות במספר הזה', correct: true },
      { id: 'B', textHe: 'האפס לא משנה כלום — המספר הוא בעצם 34' },
      { id: 'C', textHe: 'האפס הוא רק קישוט ואפשר להשמיט אותו' }
    ],
    correctChoice: 'A',
    backwardDiagnosis: {
      triggerOn: 'wrong_choice',
      subtaskNumber: 70,
      subtaskInstructionHe: 'בואו נבדוק על מספר קטן יותר: מה עושה האפס במספר?',
      subtaskChoices: [
        { id: 'A', textHe: 'הוא שומר על המקום של טור היחידות, ומראה שאין לנו יחידות כלל.' },
        { id: 'B', textHe: 'האפס מיותר לחלוטין ואפשר למחוק אותו.' }
      ],
      correctChoice: 'A'
    }
  },
  {
    id: 'q2',
    type: 'number_line',
    titleHe: 'ישר המספרים',
    instructionHe: 'גרור את החץ אל המיקום המשוער של המספר על ישר המספרים.',
    number: 750,
    backwardDiagnosis: {
      triggerOn: 'large_deviation',
      subtaskNumber: 35,
      subtaskInstructionHe: 'בואו ננסה על ישר קצר יותר: איפה נמקם את המספר?',
    }
  },
  {
    id: 'q3',
    type: 'flexible_decomp',
    titleHe: 'פירוק והרכבה גמישים',
    instructionHe: 'ייצגו את המספר בשתי דרכים שונות בטבלת ערך המקום. כדאי לחשוב: איך אפשר להשתמש בפריטה כדי לבנות אותו?',
    number: 240,
    scaffoldLevel: 2,
    backwardDiagnosis: {
      triggerOn: 'only_canonical',
      subtaskInstructionHe: 'הדגמה מודרכת: לחץ פעמיים על עמודת עשרת אחת כדי לפרק אותה ל-10 יחידות, ואז הוסף את הייצוג החדש בטבלה.',
      subtaskNumber: 34
    }
  },
  {
    id: 'q4',
    type: 'vertical_addition',
    titleHe: 'חיבור במאונך',
    instructionHe: 'פתרו את תרגיל החיבור וכתבו את הסכום בתיבה.',
    numberA: 124,
    numberB: 231,
    correctAnswer: 355,
    backwardDiagnosis: {
      triggerOn: 'wrong_answer',
      probeA: 4,
      probeB: 3,
      probeAnswer: 7,
      probeInstructionHe: 'בואו ננסה תרגיל קטן יותר כדי להתחמם: כמה הם 4 ועוד 3?'
    }
  },
  {
    id: 'q5',
    type: 'small_change',
    titleHe: 'השינוי הקטן — אומדן',
    instructionHe: 'הביטו בתרגיל הפתור. עכשיו ענו בלי לחשב בכתב.',
    hintHe: '45 + 10 = 55\nכמה שווה 45 + 9?',
    choices: [
      { id: 'A', textHe: '54 — כי חיסרנו יחידה אחת מהסכום', correct: true },
      { id: 'B', textHe: '55 — זה אותו הסכום' },
      { id: 'C', textHe: '56 — כי הוספנו עוד יחידה אחת' },
      { id: 'D', textHe: 'צריך לחשב מחדש' }
    ],
    correctChoice: 'A',
    backwardDiagnosis: {
      triggerOn: 'flexibility_trap',
      visualHint: true,
      hintHe: 'רמז: אם לקחנו קובייה אחת פחות, מה קרה לסכום?'
    }
  }
];

export const SESSION3_TASKS: MathTask[] = [
  {
    id: 's3_t1',
    type: 'addition_simple',
    numberA: 146, numberB: 235, correctAnswer: 381,
    titleHe: 'חיבור עם המרה - מתחילים!',
    instructionHe: 'בואו נחבר: 146 + 235. זכרו: כאשר נאספים 10 פריטים בטור אחד, אנו מבצעים המרה לטור הבא משמאל!'
  },
  {
    id: 's3_t2',
    type: 'addition_simple',
    numberA: 257, numberB: 124, correctAnswer: 381,
    titleHe: 'חיבור עם המרה - תרגיל 2',
    instructionHe: 'בואו נחבר: 257 + 124. בנו את המספרים בטבלה, ובצעו המרה אם נאספו 10 פריטים או יותר בטור אחד.'
  },
  {
    id: 's3_t3',
    type: 'addition_simple',
    numberA: 138, numberB: 245, correctAnswer: 383,
    titleHe: 'המרה מיחידות לעשרות',
    instructionHe: 'פתרו: 138 + 245. מה קורה כשיש לנו 8 יחידות ועוד 5 יחידות? בצעו המרה של 10 יחידות לעשרת אחת.'
  },
  {
    id: 's3_t4',
    type: 'addition_simple',
    numberA: 356, numberB: 182, correctAnswer: 538,
    titleHe: 'המרה מעשרות למאות',
    instructionHe: 'פתרו: 356 + 182. מה קורה כשמחברים 5 עשרות עם 8 עשרות? בצעו המרה של 10 עשרות למאה אחת.'
  },
  {
    id: 's3_t5',
    type: 'addition_simple',
    numberA: 489, numberB: 175, correctAnswer: 664,
    titleHe: 'המרה כפולה - גם וגם!',
    instructionHe: 'תרגיל אתגר: 489 + 175. כאן תבצעו המרה גם בטור היחידות וגם בטור העשרות. בהצלחה!'
  }
];

export const SESSION4_TASKS: MathTask[] = [
  {
    id: 's4_t1',
    type: 'addition_simple',
    numberA: 342, numberB: 125, correctAnswer: 217, isSubtraction: true,
    titleHe: 'חיסור עם פריטה - מתחילים!',
    instructionHe: 'בואו נפתור: 342 - 125. מה עושים כשאין מספיק יחידות בטור היחידות כדי לחסר? מבצעים פריטה של עשרת אחת ל-10 יחידות!'
  },
  {
    id: 's4_t2',
    type: 'addition_simple',
    numberA: 524, numberB: 216, correctAnswer: 308, isSubtraction: true,
    titleHe: 'חיסור עם פריטה - תרגיל 2',
    instructionHe: 'פתרו: 524 - 216. זכרו לבצע פריטה במידת הצורך.'
  },
  {
    id: 's4_t3',
    type: 'addition_simple',
    numberA: 425, numberB: 118, correctAnswer: 307, isSubtraction: true,
    titleHe: 'פריטה מעשרת ליחידות',
    instructionHe: 'פתרו: 425 - 118. כדי שנוכל לחסר 8 יחידות מתוך 5 יחידות, נבצע פריטה של עשרת אחת ל-10 יחידות.'
  },
  {
    id: 's4_t4',
    type: 'addition_simple',
    numberA: 632, numberB: 271, correctAnswer: 361, isSubtraction: true,
    titleHe: 'פריטה ממאה לעשרות',
    instructionHe: 'פתרו: 632 - 271. כדי שנוכל לחסר 7 עשרות מתוך 3 עשרות, נבצע פריטה של מאה אחת ל-10 עשרות.'
  },
  {
    id: 's4_t5',
    type: 'addition_simple',
    numberA: 513, numberB: 285, correctAnswer: 228, isSubtraction: true,
    titleHe: 'פריטה כפולה - גם וגם!',
    instructionHe: 'תרגיל אתגר: 513 - 285. כאן תבצעו פריטה גם ממאה לעשרות וגם מעשרת ליחידות. בהצלחה!'
  }
];

export const allTasks = [
  ...SESSION1_TASKS,
  ...SESSION2_TASKS,
  ...SESSION3_TASKS,
  ...SESSION4_TASKS
];
