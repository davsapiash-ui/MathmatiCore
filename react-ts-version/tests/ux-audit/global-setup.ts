import { resetReport } from './harness';

/**
 * Runs once per `playwright test` invocation — never per worker. A reset in a
 * `beforeAll` wiped the report every time Playwright restarted its worker after
 * a failed viewport, and the viewports already measured were lost with it.
 * `UX_AUDIT_KEEP=1` keeps the previous report (e.g. to add tier-B viewports
 * to a finished tier-A run).
 */
export default function globalSetup(): void {
  if (process.env.UX_AUDIT_KEEP !== '1') resetReport();
}
