/**
 * Zero PII Identity & Security Module (Master PRD v5.0 Module 3)
 * Provides client-side and server-side validation & filtering of Personally Identifiable Information (PII).
 * Enforces strict anonymous student profiles (IDs 1-12) with zero persona names or PII leakage.
 */

// Phone numbers: 9-11 digits, standard Israeli cellular & landline formats
export const PII_PHONE_REGEX = /(?:\b05\d-?\d{7}\b|\b0[23489]-?\d{7}\b|\b0\d{1,2}-\d{7,8}\b|\b05\d{8}\b|\b\d{10,11}\b)/g;

// Email addresses: standard RFC-compliant address format
export const PII_EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Israeli National ID: 9 consecutive digits pattern
export const PII_NATIONAL_ID_REGEX = /\b\d{9}\b/g;

// Forbidden PII payload field names
export const FORBIDDEN_PII_FIELDS = [
  'name',
  'first_name',
  'last_name',
  'fullName',
  'displayName',
  'email',
  'phone',
  'phoneNumber',
  'taz',
  'teudatZehut',
  'idNumber',
  'national_id',
  'address',
  'birthdate',
  'avatar'
];

/**
 * Validates Israeli National ID (Teudat Zehut) using the official Luhn-based checksum algorithm.
 */
export function isValidIsraeliID(id: string | number): boolean {
  const idStr = String(id).trim().padStart(9, '0');
  if (!/^\d{9}$/.test(idStr)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let num = Number(idStr[i]) * ((i % 2) + 1);
    if (num > 9) num -= 9;
    sum += num;
  }

  return sum % 10 === 0;
}

/**
 * Checks if a string contains any PII (Phone numbers, Valid Israeli National IDs, Emails).
 */
export function containsPII(text?: string | null): boolean {
  if (!text || typeof text !== 'string') return false;

  // 1. Check Emails
  PII_EMAIL_REGEX.lastIndex = 0;
  if (PII_EMAIL_REGEX.test(text)) return true;

  // 2. Check 9-digit IDs
  PII_NATIONAL_ID_REGEX.lastIndex = 0;
  const idMatches = text.match(PII_NATIONAL_ID_REGEX);
  if (idMatches) {
    for (const match of idMatches) {
      if (isValidIsraeliID(match)) {
        return true;
      }
    }
  }

  // 3. Check Phones
  PII_PHONE_REGEX.lastIndex = 0;
  if (PII_PHONE_REGEX.test(text)) return true;

  return false;
}

/**
 * Sanitizes a string by replacing detected PII with anonymous tokens.
 */
export function sanitizePII(text?: string | null): string {
  if (!text || typeof text !== 'string') return '';

  let sanitized = text;

  // 1. Sanitize Emails
  sanitized = sanitized.replace(PII_EMAIL_REGEX, '[EMAIL_REDACTED]');

  // 2. Sanitize 9-digit national IDs (replace with ***XXXX)
  sanitized = sanitized.replace(PII_NATIONAL_ID_REGEX, (match) => {
    return `***${match.slice(-4)}`;
  });

  // 3. Sanitize Phones
  sanitized = sanitized.replace(PII_PHONE_REGEX, '[PHONE_REDACTED]');

  return sanitized;
}

/**
 * Validates that an outgoing telemetry/write payload complies with Master PRD v5.0 Zero PII constraints.
 * 1. Checks that student_id is strictly an integer between 1 and 12.
 * 2. Rejects any forbidden PII keys (name, email, phone, etc.).
 * 3. Recursively verifies that string values do not contain unmasked PII.
 */
export function validateZeroPIIPayload(payload: unknown): { valid: boolean; reason?: string } {
  if (!payload || typeof payload !== 'object') {
    return { valid: true };
  }

  const obj = payload as Record<string, unknown>;

  // Check student_id constraint
  if ('student_id' in obj) {
    const sId = obj.student_id;
    if (typeof sId !== 'number' || !Number.isInteger(sId) || sId < 1 || sId > 12) {
      return {
        valid: false,
        reason: `Constraint violation: student_id must be an integer between 1 and 12 (received: ${sId})`
      };
    }
  }

  // Check forbidden PII keys
  for (const key of Object.keys(obj)) {
    const lowerKey = key.toLowerCase();
    if (FORBIDDEN_PII_FIELDS.some((f) => f.toLowerCase() === lowerKey)) {
      return {
        valid: false,
        reason: `Security violation: Forbidden PII field '${key}' detected in payload`
      };
    }

    const value = obj[key];
    if (typeof value === 'string') {
      if (containsPII(value)) {
        return {
          valid: false,
          reason: `Security violation: PII detected in value for field '${key}'`
        };
      }
    } else if (typeof value === 'object' && value !== null) {
      const nestedCheck = validateZeroPIIPayload(value);
      if (!nestedCheck.valid) {
        return nestedCheck;
      }
    }
  }

  return { valid: true };
}

/**
 * מודול 22: שכבת סינון ולידציה בצד הלקוח (Tier 1 Client Validation)
 * בודקת האם הודעת הצ'אט מכילה מספרי טלפון, תעודות זהות ישראליות, מיילים או שמות.
 */
export function validateChatInputForPII(text?: string | null): { valid: boolean; errorHe?: string } {
  if (!text || typeof text !== 'string') return { valid: true };

  // 1. Check Emails
  PII_EMAIL_REGEX.lastIndex = 0;
  if (PII_EMAIL_REGEX.test(text)) {
    return {
      valid: false,
      errorHe: 'ההודעה מכילה כתובת דואר אלקטרוני. לשמירה על פרטיות, השתמשו במזהה האנונימי של התלמיד (1-12).'
    };
  }

  // 2. Check National IDs (Luhn)
  PII_NATIONAL_ID_REGEX.lastIndex = 0;
  const idMatches = text.match(PII_NATIONAL_ID_REGEX);
  if (idMatches) {
    for (const match of idMatches) {
      if (isValidIsraeliID(match)) {
        return {
          valid: false,
          errorHe: 'ההודעה מכילה מספר זהות. לשמירה על פרטיות, השתמשו במזהה האנונימי של התלמיד (1-12).'
        };
      }
    }
  }

  // 3. Check Phone numbers
  PII_PHONE_REGEX.lastIndex = 0;
  if (PII_PHONE_REGEX.test(text)) {
    return {
      valid: false,
      errorHe: 'ההודעה מכילה מספר טלפון. לשמירה על פרטיות, השתמשו במזהה האנונימי של התלמיד (1-12).'
    };
  }

  return { valid: true };
}

/**
 * מודול 22: שירות אנונימיזציה אוטומטי (Tier 2 Anonymizer Service)
 * מחליף שמות פרטיים של תלמידים במזהה הנומרי האנונימי התואם (1-12) טרם שמירה ל-Firestore.
 */
export function anonymizeChatMessageBody(text: string, knownNameMap?: Record<string, number>): string {
  if (!text || typeof text !== 'string') return '';

  let processed = text;

  // Replace names if map is provided (supports Hebrew single-letter prefixes like ו, ל, ב, מ, כ, ש, ה)
  if (knownNameMap) {
    for (const [name, studentNum] of Object.entries(knownNameMap)) {
      if (name && name.length >= 2) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(^|[\\s,.:;!?])([וכלבמשה]?)${escaped}(?=[\\s,.:;!?]|$)`, 'gu');
        processed = processed.replace(regex, (_match, before, prefix) => {
          return `${before}${prefix || ''}תלמיד ${studentNum}`;
        });
      }
    }
  }

  // Sanitize any remaining phones, emails, or 9-digit IDs
  return sanitizePII(processed);
}
