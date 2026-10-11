/**
 * @vitest-environment jsdom
 *
 * Owner, 11.10.2026 (L58): the learner's sign-in lists the school and the
 * class from RTDB `schools` and `public_classes` — read once, after the page's
 * anonymous session exists — and falls back to the pilot school and class
 * whenever that read gives nothing (offline, refused, empty).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  nodes: {} as Record<string, unknown>,
  fail: false,
}));

vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  firestore: {},
  functions: {},
  authReady: Promise.resolve(true),
  auth: { currentUser: null },
  serverNow: () => Date.now(),
  isServerClockKnown: () => true,
  fetchServerClockOffset: () => Promise.resolve(0),
}));
vi.mock('firebase/database', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ref: vi.fn((_db: unknown, path = '') => ({ path })),
  get: vi.fn((r: { path: string }) =>
    h.fail
      ? Promise.reject(Object.assign(new Error('denied'), { code: 'PERMISSION_DENIED' }))
      : Promise.resolve({ exists: () => h.nodes[r.path] != null, val: () => h.nodes[r.path] ?? null })
  ),
  onValue: vi.fn(() => () => {}),
  set: vi.fn(() => Promise.resolve()),
  update: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({ UdlSpeechButton: () => null }));

import { Login, loginListFrom } from '../Login';

const optionTexts = (label: string) => {
  const select = screen.getByText(label).parentElement!.querySelector('select')!;
  return Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
};

beforeEach(() => {
  h.nodes = {};
  h.fail = false;
});
afterEach(() => cleanup());

describe('learner sign-in lists (L58)', () => {
  it('shows the school and class the database holds', async () => {
    h.nodes = {
      schools: { school_bikorot: { id: 'school_bikorot', name: 'בית ספר ביקורת (מהשרת)', createdAt: 1 } },
      public_classes: { class_1: { id: 'class_1', name: 'המבקרים (מהשרת)', schoolId: 'school_bikorot' } },
    };
    render(<MemoryRouter><Login studentForm /></MemoryRouter>);
    await waitFor(() => expect(optionTexts('שם בית הספר')).toEqual(['בית ספר ביקורת (מהשרת)']));
    expect(optionTexts('שם הכיתה')).toEqual(['המבקרים (מהשרת)']);
  });

  it('a refused read keeps the pilot school and class', async () => {
    h.fail = true;
    render(<MemoryRouter><Login studentForm /></MemoryRouter>);
    await new Promise((r) => setTimeout(r, 0));
    expect(optionTexts('שם בית הספר')).toEqual(['בית ספר ביקורת']);
    expect(optionTexts('שם הכיתה')).toEqual(['המבקרים']);
  });

  it('empty nodes keep the pilot school and class', async () => {
    render(<MemoryRouter><Login studentForm /></MemoryRouter>);
    await new Promise((r) => setTimeout(r, 0));
    expect(optionTexts('שם בית הספר')).toEqual(['בית ספר ביקורת']);
    expect(optionTexts('שם הכיתה')).toEqual(['המבקרים']);
  });

  it('drops malformed entries', () => {
    expect(loginListFrom({ a: { name: 'א' }, b: { id: 'b' }, c: 'x', d: null })).toEqual([{ id: 'a', name: 'א' }]);
    expect(loginListFrom({ class_1: { id: 'class_1', name: 'המבקרים' } }, true)).toEqual([]);
    expect(loginListFrom(null)).toEqual([]);
  });
});
