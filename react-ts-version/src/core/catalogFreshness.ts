/**
 * מודול 26 §ב — האם התרגילים שפורסמו הם עדיין התרגילים שבקוד?
 *
 * `getSessionTasks()` מחזיר `curriculumCatalog.getActiveBank(...) ?? hardcoded`:
 * מאגר שפורסם ל-`curriculum_catalog` **גובר** על הקוד. המשמעות המעשית היא
 * שתיקון תרגיל שעלה לאוויר אינו מגיע לילדים עד שמישהו לוחץ "פרסום תוכנית
 * הלימודים" — ועד היום לא הייתה שום דרך לדעת את זה. המסך הזה מציג את ההשוואה.
 *
 * ההשוואה היא טהורה ונבדקת: שתי רשימות מאגרים, טביעת אצבע יציבה לכל אחת.
 */

export interface PublishedBankSnapshot {
  id: string;
  /** חותמת הפרסום שנכתבה ע"י מסך המנהל (`updated_at`). */
  updatedAt?: unknown;
  /** התרגילים כפי שהם מופיעים במסד הנתונים. */
  tasks?: unknown;
}

export interface CodeBankSnapshot {
  id: string;
  tasks: unknown;
}

export interface CatalogFreshness {
  /**
   * `never_published` — אין קטלוג במסד; הילדים מקבלים את הקוד (תקין).
   * `match` — מה שפורסם זהה לקוד.
   * `stale` — הקוד השתנה מאז הפרסום, או שחלק מהמאגרים חסרים/מיותרים.
   */
  status: 'never_published' | 'match' | 'stale';
  /** חותמת הפרסום העדכנית ביותר, כשקיימת. */
  publishedAt: number | null;
  /** מאגרים שפורסמו אך שונים מהקוד. */
  changedBankIds: string[];
  /** מאגרים שקיימים בקוד ומעולם לא פורסמו. */
  missingBankIds: string[];
  /** מאגרים שפורסמו ואינם קיימים יותר בקוד. */
  extraBankIds: string[];
}

/**
 * טביעת אצבע יציבה: מפתחות ממוינים, שדות `undefined` מושמטים.
 *
 * הפרסום עצמו עושה `JSON.parse(JSON.stringify(tasks))` (Firestore דוחה
 * `undefined`), ו-Firestore אינו מבטיח את סדר המפתחות שהוא מחזיר — לכן
 * השוואת מחרוזות נאיבית הייתה מדווחת "השתנה" על כל טעינה.
 */
export function stableFingerprint(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableFingerprint).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableFingerprint(v)}`).join(',')}}`;
  }
  if (typeof value === 'undefined') return 'null';
  return JSON.stringify(value) ?? 'null';
}

function toTimestamp(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  return null;
}

export function compareCatalog(
  published: readonly PublishedBankSnapshot[],
  code: readonly CodeBankSnapshot[]
): CatalogFreshness {
  if (published.length === 0) {
    return { status: 'never_published', publishedAt: null, changedBankIds: [], missingBankIds: [], extraBankIds: [] };
  }

  const byId = new Map(published.map((bank) => [bank.id, bank]));
  const changedBankIds: string[] = [];
  const missingBankIds: string[] = [];

  for (const codeBank of code) {
    const publishedBank = byId.get(codeBank.id);
    if (!publishedBank) {
      missingBankIds.push(codeBank.id);
      continue;
    }
    if (stableFingerprint(publishedBank.tasks) !== stableFingerprint(codeBank.tasks)) {
      changedBankIds.push(codeBank.id);
    }
  }

  const codeIds = new Set(code.map((bank) => bank.id));
  const extraBankIds = published.map((bank) => bank.id).filter((id) => !codeIds.has(id));

  // החותמת המוצגת היא הפרסום האחרון שהיה — גם אם רק חלק מהמאגרים נשאו חותמת.
  const stamps = published.map((bank) => toTimestamp(bank.updatedAt)).filter((n): n is number => n !== null);
  const publishedAt = stamps.length > 0 ? Math.max(...stamps) : null;

  const drifted = changedBankIds.length > 0 || missingBankIds.length > 0 || extraBankIds.length > 0;
  return {
    status: drifted ? 'stale' : 'match',
    publishedAt,
    changedBankIds,
    missingBankIds,
    extraBankIds,
  };
}

const PATH_LABEL: Record<string, string> = {
  green_path: 'מסלול ירוק',
  remediation_path: 'מסלול ביסוס',
};

/** `session_4_green_path` → "מפגש 4 — מסלול ירוק". */
export function bankLabelHe(bankId: string): string {
  const match = /^session_(\d+)(?:_(green_path|remediation_path))?$/.exec(bankId);
  if (!match) return bankId;
  const path = match[2] ? ` — ${PATH_LABEL[match[2]]}` : '';
  return `מפגש ${match[1]}${path}`;
}

/** משפט אחד למסך המנהל. */
export function freshnessMessageHe(freshness: CatalogFreshness): string {
  const when = freshness.publishedAt
    ? new Date(freshness.publishedAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' })
    : null;

  if (freshness.status === 'never_published') {
    return 'הקטלוג לא פורסם מעולם. הילדים מקבלים את התרגילים ישירות מהקוד — זה תקין ואין מה לעשות.';
  }
  if (freshness.status === 'match') {
    return when
      ? `התרגילים שפורסמו זהים לקוד. פורסם ב-${when}.`
      : 'התרגילים שפורסמו זהים לקוד.';
  }

  const changed = [...freshness.changedBankIds, ...freshness.missingBankIds].map(bankLabelHe);
  const list = changed.length > 0 ? ` ההבדל ב: ${changed.join(', ')}.` : '';
  const head = when ? `פורסם ב-${when} — מאז הקוד השתנה.` : 'הקוד השתנה מאז הפרסום האחרון.';
  return `${head} הילדים ממשיכים לקבל את הגרסה שפורסמה, ולא את זו שבקוד.${list} כדאי ללחוץ "פרסום תוכנית הלימודים".`;
}
