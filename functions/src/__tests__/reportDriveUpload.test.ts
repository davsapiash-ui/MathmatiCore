import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The reports go straight to Google Drive (owner: no data stays on a
 * computer). The AI analysis moved to the new Gemini SDK on 1.10.2026; this
 * pins that the Drive path the PDF then takes is reached and its request is
 * well-formed — with a mocked Drive endpoint, so nothing is uploaded.
 */
const h = vi.hoisted(() => ({ calls: [] as Array<{ url: string; init: RequestInit }> }));

vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    async getClient() {
      return { getAccessToken: async () => ({ token: 'test-access-token' }) };
    }
  },
}));

vi.mock('firebase-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-admin')>();
  return { ...actual, default: actual, app: () => ({ options: {} }), storage: () => { throw new Error('Cloud Storage must not be reached when Drive answers'); } };
});

describe('a report PDF goes to Google Drive', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    h.calls = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      h.calls.push({ url: String(url), init });
      if (String(url).includes('/drive/v3/files?q=')) {
        return new Response(JSON.stringify({ files: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (String(url).startsWith('https://www.googleapis.com/drive/v3/files')) {
        return new Response(JSON.stringify({ id: 'folder-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ id: 'file-1', webViewLink: 'https://drive.google.com/file/d/file-1/view' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('uploads the PDF as one multipart request to the Drive upload endpoint, into the given folder', async () => {
    const { uploadBufferToDrive } = await import('../exportDriveReport');
    const pdf = Buffer.from('%PDF-1.4 test report');
    const res = await uploadBufferToDrive(pdf, 'דוח פדגוגי - לומד 5 - מפגש 4.pdf', 'application/pdf', 'folder-of-meeting-4');
    expect(res).toMatchObject({ success: true, fileId: 'file-1' });
    const upload = h.calls.find((c) => c.url.startsWith('https://www.googleapis.com/upload/drive/v3/files'));
    expect(upload, 'the Drive upload endpoint is reached').toBeTruthy();
    expect(upload!.url).toContain('uploadType=multipart');
    expect(upload!.url).toContain('supportsAllDrives=true');
    const headers = upload!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-access-token');
    expect(headers['Content-Type']).toMatch(/^multipart\/related; boundary=/);
    const body = Buffer.from(upload!.init.body as Buffer).toString('utf8');
    expect(body).toContain('"name":"דוח פדגוגי - לומד 5 - מפגש 4.pdf"');
    expect(body).toContain('"parents":["folder-of-meeting-4"]');
    expect(body).toContain('Content-Type: application/pdf');
    expect(body).toContain(pdf.toString('base64'));
  });
});
