import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Acceptance run of 2.10.2026 (D5): the first card in an instance spent
 * seconds outside the model. Measured locally with a stubbed model, the
 * extra time of a first call was the monitoring write building the Firestore
 * client. The write now runs after the answer has left, and the teacher's
 * warm-up ping builds the client with one read.
 */
const h = vi.hoisted(() => ({ reads: 0, sets: 0, modelCalls: 0 }));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { increment: (n: number) => ({ __inc: n }) },
  getFirestore: () => ({
    collection: () => ({
      doc: () => ({
        set: async () => { h.sets++; },
        get: async () => { h.reads++; return { exists: false }; },
      }),
    }),
  }),
}));
vi.mock('../geminiConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../geminiConfig')>();
  return { ...actual, generateGeminiText: async () => { h.modelCalls++; throw new Error('no model in this test'); } };
});

import { callGeminiSocraticProxy } from '../geminiProxy';

describe('the warm-up ping prepares the first card', () => {
  beforeEach(() => {
    h.reads = 0;
    h.sets = 0;
    h.modelCalls = 0;
  });

  it('staff ping: one read, no write, no model call', async () => {
    const res = await (callGeminiSocraticProxy as any).run({ auth: { uid: 't', token: { role: 'teacher', teacher: true } }, data: { warm: true } });
    expect(res).toEqual({ warm: true });
    expect(h.reads).toBe(1);
    expect(h.sets).toBe(0);
    expect(h.modelCalls).toBe(0);
  });

  it('a learner may not ping', async () => {
    await expect((callGeminiSocraticProxy as any).run({ auth: { uid: 's', token: { student_id: 4 } }, data: { warm: true } }))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(h.reads).toBe(0);
  });
});

describe('heavy report modules are not loaded with every function', () => {
  const code = (f: string) => readFileSync(resolve(__dirname, '..', f), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  it('pdfkit, google-auth-library and bidi-js load inside the code that uses them', () => {
    for (const f of ['classReport.ts', 'pedagogicalReport.ts']) expect(code(f), f).not.toMatch(/^const PDFDocument = require\("pdfkit"\);$/m);
    expect(code('exportDriveReport.ts')).not.toMatch(/^import .* from "google-auth-library";$/m);
    expect(code('hebrewPdf.ts')).not.toMatch(/^const bidi = /m);
  });
});
