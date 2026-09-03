import { describe, it, expect } from 'vitest';
import {
  catalogBankId,
  isValidCatalogBank,
  resolveCatalogBank,
} from '@/infrastructure/services/CurriculumCatalogService';
import { getHardcodedCatalogBanks } from '@/data/sessionTasks';
import type { SessionTask } from '@/data/sessionTasks';

/**
 * PRD v7.1 Modules 4/26 — curriculum catalog contract:
 * Firestore bank ids, structural validation, override-vs-fallback resolution,
 * and the canonical hardcoded banks used to seed the server catalog.
 */
describe('Modules 4/26: curriculum catalog contract', () => {
  const task = (id: string): SessionTask => ({ id, type: 'addition_simple', titleHe: `משימה ${id}`, instructionHe: 'הוראה' });

  it('bank ids: sessions 3-8 are split per learning path (מסמך 03 §3.8); session 1 is a single bank', () => {
    expect(catalogBankId(1)).toBe('session_1');
    expect(catalogBankId(8)).toBe('session_8_green_path');
    expect(catalogBankId(8, 'remediation_path')).toBe('session_8_remediation_path');
    expect(catalogBankId(3, 'green_path')).toBe('session_3_green_path');
    expect(catalogBankId(5, 'remediation_path')).toBe('session_5_remediation_path');
    expect(catalogBankId(7, null)).toBe('session_7_green_path');
  });

  it('validation rejects malformed banks (fail-safe to hardcoded)', () => {
    expect(isValidCatalogBank(null)).toBe(false);
    expect(isValidCatalogBank({})).toBe(false);
    expect(isValidCatalogBank({ session_number: 9, tasks: [task('a')] })).toBe(false);
    expect(isValidCatalogBank({ session_number: 3, tasks: [] })).toBe(false);
    expect(isValidCatalogBank({ session_number: 3, tasks: [{ id: 1 }] })).toBe(false);
    expect(isValidCatalogBank({ session_number: 3, learning_path: 'green_path', updated_at: 1, tasks: [task('a')] })).toBe(true);
  });

  it('resolution prefers a published bank and falls back to hardcoded otherwise', () => {
    const fallback = [task('hard_1')];
    const overrides = new Map<string, SessionTask[]>([['session_3_green_path', [task('srv_1')]]]);

    expect(resolveCatalogBank(overrides, 3, 'green_path', fallback)[0].id).toBe('srv_1');
    expect(resolveCatalogBank(overrides, 3, 'remediation_path', fallback)[0].id).toBe('hard_1');
    expect(resolveCatalogBank(new Map(), 3, 'green_path', fallback)[0].id).toBe('hard_1');
    expect(resolveCatalogBank(new Map([['session_3_green_path', []]]), 3, 'green_path', fallback)[0].id).toBe('hard_1');
  });

  it('hardcoded seed covers all banks: session 1 and both paths for 3-8 (13 banks)', () => {
    const banks = getHardcodedCatalogBanks();
    expect(banks).toHaveLength(13);
    const ids = banks.map((b) => b.id);
    expect(ids).toContain('session_1');
    for (const n of [3, 4, 5, 6, 7, 8]) {
      expect(ids).toContain(`session_${n}_green_path`);
      expect(ids).toContain(`session_${n}_remediation_path`);
    }
    for (const bank of banks) {
      expect(isValidCatalogBank({ session_number: bank.session_number, learning_path: bank.learning_path, updated_at: 1, tasks: bank.tasks })).toBe(true);
    }
  });
});
