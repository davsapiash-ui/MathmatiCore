import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { indexedDBQueue } from '@/infrastructure/services/IndexedDBQueue';

/**
 * Module 22 §ה: a teacher→admin message written without a network connection
 * is queued in the Module 17 IndexedDB queue and sent through the same Cloud
 * Function when the connection returns — so the server-side anonymizer still
 * runs on it. It used to rely on Firebase's in-memory write queue alone, and a
 * page reload during the outage lost the message silently.
 */
const dashboard = readFileSync(resolve(__dirname, '../../presentation/pages/TeacherDashboard.tsx'), 'utf-8');
const queue = readFileSync(resolve(__dirname, '../../infrastructure/services/IndexedDBQueue.ts'), 'utf-8');
const server = readFileSync(resolve(__dirname, '../../../../functions/src/teacherAdminChat.ts'), 'utf-8');

describe('Module 22 — a teacher→admin message survives an outage', () => {
  it('queues a callable item that the flush delivers through the Cloud Function', async () => {
    await indexedDBQueue.enqueueCallable('sendTeacherAdminMessage', { receiver_id: 'admin', message_body: 'תלמיד 3 מתקשה בפריטה', client_message_id: 'tam_test_0001' }, 'tam_test_0001');
    const queued = (await indexedDBQueue.getAll()).find((i) => i.idempotency_key === 'tam_test_0001');
    expect(queued).toBeDefined();
    expect(queued?.callable).toBe('sendTeacherAdminMessage');
    expect(queued?.payload.message_body).toBe('תלמיד 3 מתקשה בפריטה');
    // The delivery route: a callable item goes to httpsCallable, before the RTDB / telemetry routes.
    expect(queue).toMatch(/if \(item\.callable\) \{\s*await httpsCallable\(functions, item\.callable\)\(item\.payload\);/);
  });

  it('the dashboard queues instead of failing when offline or on a transient error', () => {
    expect(dashboard).toContain('indexedDBQueue.enqueueCallable("sendTeacherAdminMessage", payload, payload.client_message_id)');
    expect(dashboard).toContain("navigator.onLine === false");
    expect(dashboard).toContain('ההודעה נשמרה ותישלח להנהלה כשהחיבור יחזור');
  });

  it('the server keys the document by client_message_id so redelivery never duplicates', () => {
    expect(server).toContain('client_message_id');
    expect(server).toMatch(/db\.collection\("messages"\)\.doc\(clientId\)/);
    expect(server).not.toContain('db.collection("messages").add(');
  });
});
