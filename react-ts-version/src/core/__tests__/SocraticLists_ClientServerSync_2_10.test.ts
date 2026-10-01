import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * The lists the client keeps a copy of, mirrored from the server
 * (functions/src/socraticContract.ts — read from source, unedited). A copy
 * that drifts lets the client show what the server refuses, or refuse what
 * it accepts (2.10.2026: "no duplicated lists" — until they are one module,
 * this test fails the moment they differ).
 */
import { FORBIDDEN_TERMS_HE as CLIENT_FORBIDDEN, ABSENT_AIDS_MEETING_8_HE } from '@/infrastructure/services/SocraticEngine';
import { STATIC_CARD_KINDS } from '@/infrastructure/services/staticSocraticCards';
import type { SocraticTaskKindWire } from '@/types';
import {
  FORBIDDEN_TERMS_HE as SERVER_FORBIDDEN,
  ABSENT_AIDS_NO_BOARD,
  SOCRATIC_TASK_KINDS,
  validateSocraticRequest,
  deriveSocraticFacts,
  type SocraticTaskKind,
} from '../../../../functions/src/socraticContract';

const source = (p: string) => readFileSync(resolve(__dirname, p), 'utf-8');

describe('the client\'s copies of the server\'s lists', () => {
  it('the terms no card may use (Module 13)', () => {
    expect([...CLIENT_FORBIDDEN].sort()).toEqual([...SERVER_FORBIDDEN].sort());
  });

  it('the aids meeting 8 does not show (Module 14 §ב)', () => {
    expect(ABSENT_AIDS_MEETING_8_HE.map((r) => r.source)).toEqual(ABSENT_AIDS_NO_BOARD.map((r) => r.source));
  });

  it('the characters an instruction may hold: the client\'s filter is the server\'s whitelist (cleanInstruction)', () => {
    const client = /function instructionForEngine[\s\S]*?\.replace\(\/\[\^([^\]]+)\]\/g, ' '\)/.exec(source('../../infrastructure/services/SocraticEngine.ts'))?.[1];
    const server = /function cleanInstruction[\s\S]*?\/\^\[([^\]]+)\]\+\$\//.exec(source('../../../../functions/src/socraticContract.ts'))?.[1];
    expect(client).toBeTruthy();
    expect(client).toBe(server);
  });

  it('the task kinds: the wire type and the server\'s list are the same set', () => {
    // Compile time, both ways: a kind on one side only is a type error here.
    const toServer = (k: SocraticTaskKindWire): SocraticTaskKind => k;
    const toClient = (k: SocraticTaskKind): SocraticTaskKindWire => k;
    const CLIENT_KINDS: Record<SocraticTaskKindWire, true> = {
      addition: true, subtraction: true, skeleton: true, missing_result_digit: true, error_analysis: true,
      read_write: true, compose_break: true, decompose: true, compose_group: true, representation: true,
      flexible: true, missing_element: true, small_change: true,
    };
    expect(Object.keys(CLIENT_KINDS).map((k) => toServer(k as SocraticTaskKindWire)).sort()).toEqual(SOCRATIC_TASK_KINDS.map(toClient).sort());
  });

  it('the card kinds the client reports as already shown reach the server — except the ones with a digit, which its filter drops (reported, 2.10.2026)', () => {
    const kept: string[] = [];
    for (let i = 0; i < STATIC_CARD_KINDS.length; i += 8) {
      const v = validateSocraticRequest({
        student_id: 3, session_id: 'session_5_student_3', exercise_id: 's5_r_t2', active_column_index: 0,
        workspace_state: { ones_count: 0, tens_count: 0, hundreds_count: 0, memory_circles: {} }, recent_actions: [],
        student_progress_state: { completed_columns: [], current_column_input: null, memory_circles_state: {}, trigger_reason: 'hesitation_45s', consecutive_errors_count: 0, recent_actions: [], earlier_card_kinds: STATIC_CARD_KINDS.slice(i, i + 8) },
      });
      expect(v.ok, !v.ok ? v.reason : '').toBe(true);
      if (v.ok) kept.push(...deriveSocraticFacts(v.value).earlier_card_kinds);
    }
    const dropped = STATIC_CARD_KINDS.filter((k) => !kept.includes(k));
    // The server keeps a kind only if it matches /^[a-z_]{1,24}$/: the kinds of
    // 30.9 and 1.10 with a digit never reach it. Kinds added since have none.
    expect(dropped.every((k) => /\d/.test(k))).toBe(true);
    expect(dropped).toEqual(STATIC_CARD_KINDS.filter((k) => /\d/.test(k)));
  });
});
