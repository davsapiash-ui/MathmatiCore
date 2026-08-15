import { describe, it, expect } from 'vitest';
import { QMATRIX_ITEMS, getQMatrixItemByTrigger } from '../QMatrixConfig';

describe('QMatrixConfig', () => {
  it('should export non-empty QMATRIX_ITEMS containing diagnostic and VRA error conditions', () => {
    expect(QMATRIX_ITEMS.length).toBeGreaterThan(0);
    const qIds = QMATRIX_ITEMS.map((item) => item.q_id);
    expect(qIds).toContain('SQ_SUB_TENS_01');
    expect(qIds).toContain('SQ_ADD_ONES_01');
    expect(qIds).toContain('SQ_REGROUP_HUNDREDS_01');
    expect(qIds).toContain('SQ_TASK1_ZERO_PLACEHOLDER');
    expect(qIds).toContain('SQ_TASK8_MISSING_ADDEND');
  });

  it('should retrieve item by q_id using getQMatrixItemByTrigger', () => {
    const item = getQMatrixItemByTrigger('SQ_SUB_TENS_01');
    expect(item).toBeDefined();
    expect(item?.q_id).toBe('SQ_SUB_TENS_01');
    expect(item?.pedagogical_goal).toBe('זיהוי צורך בפריטה');
    expect(item?.options.length).toBe(2);
  });

  it('should retrieve item by trigger_condition using getQMatrixItemByTrigger', () => {
    const item = getQMatrixItemByTrigger("hesitation_timeout && current_column == 'tens'");
    expect(item).toBeDefined();
    expect(item?.q_id).toBe('SQ_SUB_TENS_01');
  });

  it('should return undefined for non-existent trigger', () => {
    const item = getQMatrixItemByTrigger('NON_EXISTENT_TRIGGER');
    expect(item).toBeUndefined();
  });
});
