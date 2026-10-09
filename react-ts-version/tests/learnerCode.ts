/**
 * The learner's personal 4-digit access code for the e2e specs (PRD Module 1 §א,
 * screen 2). There is no shared class passcode: tests/global-setup.ts reads the
 * class's list through getLearnerAccessCodes and hands it to the workers in
 * process.env.E2E_LEARNER_CODES.
 *
 * `id` is the learner number (1–12), or a spec's legacy "userN" label.
 */
export function learnerCode(id: number | string): string {
  const n = typeof id === 'number' ? id : Number(String(id).replace(/^user/, ''));
  let codes: Record<string, string> = {};
  try {
    codes = JSON.parse(process.env.E2E_LEARNER_CODES ?? '{}');
  } catch {
    codes = {};
  }
  const code = codes[String(n)];
  if (!code) {
    throw new Error(
      `No access code for learner ${String(id)}: global-setup could not read getLearnerAccessCodes, ` +
        'or the learner is outside 1–12.'
    );
  }
  return code;
}
