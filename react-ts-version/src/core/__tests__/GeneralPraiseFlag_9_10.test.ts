import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Chief re-review S-D (9.10.2026): the general praise is replaced by an
 * exercise's "נכון! …" because its call marks it (generalPraise), never
 * because its words happen to match. A wording edit cannot switch it on or off.
 */
describe('the "נכון! …" swap follows a flag, not the words', () => {
  const store = readFileSync(resolve(__dirname, '../../application/useWorkspaceStore.ts'), 'utf-8');

  it('judgeStandardTask tests verdict.generalPraise; no title comparison is left', () => {
    expect(store).toContain("if (verdict.kind !== 'success' || !verdict.generalPraise) return verdict;");
    expect(store).not.toMatch(/verdict\.title(\.normalize\([^)]*\))? !== GENERAL_PRAISE_HE/);
  });

  it('every general praise goes through praise(), the one place that sets the flag', () => {
    expect(store).toContain(
      "const praise = (sub: string, ms: number): StandardVerdict => ({ kind: 'success', title: GENERAL_PRAISE_HE, sub, ms, generalPraise: true });"
    );
    // No success() call is left with the general praise's words, in either byte order of the niqqud.
    const titles = [...store.matchAll(/success\(\s*'([^']*)'/g)].map((m) => m[1].normalize('NFC'));
    expect(titles).not.toContain('כָּל הַכָּבוֹד!'.normalize('NFC'));
  });
});
