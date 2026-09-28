/**
 * Module 9 §א in the representation exercises (owner's decision 28.9.2026,
 * register שהB.4): for a learner with enhanced_cognitive_support the result
 * row locks only in the columns the exercise's conversion goes through —
 * the RECEIVING column of a decomposition, the SOURCE column of a
 * composition — and each opens when the blocks perform that conversion there
 * (safety valve: the whole board equals requiredCounts). Every other column,
 * and every exercise not listed, is open from the start.
 *
 * ★ chosen: the PRD names no columns for these exercises. Each entry was
 * derived from the exercise's numbers and requiredCounts and passed through
 * the pedagogy gate (Rule 3) on 28.9.2026:
 *   s1_target_347     347 → 3 hundreds, 3 tens, 17 units: a ten into units.
 *   s1_r_group26      26 units → 2 tens, 6 units: units grouped into tens.
 *   s3_r_t2           340 → 2 hundreds, 14 tens: a hundred into tens.
 *   s3_r_t3           450 → 45 tens: hundreds into tens.
 *   s3_r_t4           85 → 7 tens, 15 units: a ten into units.
 *   s3_r_t6           506 → 4 hundreds, 10 tens, 6 units: a hundred into tens.
 *   s3_g_t2           3,400 → 2 thousands, 14 hundreds: a thousand into hundreds.
 *   s3_g_t3           4,500 → 45 hundreds: thousands into hundreds.
 *   s3_g_t4           5,230 → 4 thousands, 11 hundreds, 13 tens: a thousand
 *                     into hundreds, then a hundred into tens.
 *   s3_g_t6           6,030 → 5 thousands, 10 hundreds, 3 tens: a thousand into hundreds.
 *   s3_r_reinforce_2  270 → 27 tens: hundreds into tens.
 *   s3_g_reinforce_2  3,600 → 36 hundreds: thousands into hundreds.
 *   s7_g_t5           3,400 + 1,000 − 600: 4 hundreds cannot give 6, so a
 *                     thousand is decomposed into hundreds (3,800).
 *   s7_g_t6           1 thousand, 16 hundreds, 13 tens → 2,730: ten tens
 *                     grouped into a hundred, ten hundreds into a thousand.
 * No conversion (not listed): s3_r_t1, s3_r_t5, s3_g_t1, s3_g_t5 and the
 * reinforce_1 exercises (standard form), s7_r_t6 (340 + 200 − 30 = 510,
 * 4 tens give 3 without a decomposition).
 */
import type { Place } from '@/core/placeValue';

export interface RepresentationLock {
  /** What the conversion is — the KEYBOARD_LOCK_BLOCKED conversion_required. */
  conversion: 'decomposition' | 'composition';
  columns: Place[];
}

export const REPRESENTATION_LOCKS: Record<string, RepresentationLock> = {
  s1_target_347: { conversion: 'decomposition', columns: ['units'] },
  s1_r_group26: { conversion: 'composition', columns: ['units'] },
  s3_r_t2: { conversion: 'decomposition', columns: ['tens'] },
  s3_r_t3: { conversion: 'decomposition', columns: ['tens'] },
  s3_r_t4: { conversion: 'decomposition', columns: ['units'] },
  s3_r_t6: { conversion: 'decomposition', columns: ['tens'] },
  s3_g_t2: { conversion: 'decomposition', columns: ['hundreds'] },
  s3_g_t3: { conversion: 'decomposition', columns: ['hundreds'] },
  s3_g_t4: { conversion: 'decomposition', columns: ['hundreds', 'tens'] },
  s3_g_t6: { conversion: 'decomposition', columns: ['hundreds'] },
  s3_r_reinforce_2: { conversion: 'decomposition', columns: ['tens'] },
  s3_g_reinforce_2: { conversion: 'decomposition', columns: ['hundreds'] },
  s7_g_t5: { conversion: 'decomposition', columns: ['hundreds'] },
  s7_g_t6: { conversion: 'composition', columns: ['tens', 'hundreds'] },
};
