import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (rel: string) => readFileSync(resolve(__dirname, '../../', rel), 'utf-8');

/**
 * PRD Module 20: the session-2 SessionDocument in Firestore is the SOLE source
 * of truth for the teacher gate, and core/teacherGate.ts is its only writer.
 *
 * Three surfaces used to write `teacher_gate_approved: true` straight to RTDB
 * with no Firestore write, no session-2 completion check and — most damaging —
 * no pedagogical path, which left the task engine serving the green_path bank
 * to learners the router had routed to remediation. These tests pin each one
 * shut.
 */
describe('Module 20: single-writer invariant for the teacher gate', () => {
  it('core/teacherGate.ts writes the Firestore SessionDocument before mirroring', () => {
    const src = read('core/teacherGate.ts');
    expect(src).toContain('updateDoc(sessionDocRef');
    expect(src).toContain('teacher_gate_approved: true');
    expect(src).toContain('teacher_selected_path: path');
    // The engine's own read key must travel with the decision.
    expect(src).toContain('pedagogicalPath: path');
  });

  it('FirebaseSyncService no longer carries a second gate-approval writer', () => {
    const src = read('infrastructure/services/FirebaseSyncService.ts');
    expect(src).not.toContain('public async syncApproveRoute');
  });

  it('useStore.approveRoute is a local optimistic mirror with no Firebase write', () => {
    const src = read('application/useStore.ts');
    const start = src.indexOf('approveRoute: (studentId) => set(');
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf('applyPhysicalOverride:', start));
    expect(body).not.toContain('firebaseSyncService.');
    expect(body).not.toContain('teacher_gate_approved');
  });

  it('the dashboard plan card no longer writes gate flags of its own', () => {
    const src = read('presentation/pages/TeacherDashboard.tsx');
    expect(src).not.toContain('teacher_approved_by');
    expect(src).not.toContain("routeStatus: 'APPROVED'");
    // The one canonical approval path is still wired to the gate component.
    expect(src).toContain('await approveTeacherGate(studentId, path, user?.uid || null)');
  });
});
