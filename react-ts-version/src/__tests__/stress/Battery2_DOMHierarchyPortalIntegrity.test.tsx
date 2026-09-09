/**
 * @vitest-environment jsdom
 */
import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// Firebase & component mocks
vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  firestore: {},
  functions: {},
  auth: { currentUser: null },
  db: {},
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn((_db, path) => ({ path })),
  onValue: vi.fn((_ref, callback) => {
    callback({ exists: () => false, val: () => null });
    return vi.fn();
  }),
  update: vi.fn().mockResolvedValue(undefined),
  query: vi.fn((r) => r),
  limitToLast: vi.fn((n) => n),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  onSnapshot: vi.fn((_ref, callback) => {
    if (typeof callback === 'function') {
      callback({ exists: () => false, data: () => ({}) });
    }
    return vi.fn();
  }),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({})),
}));

vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

import { ResetConfirmationModal } from '@/presentation/pages/TeacherDashboard/components/ResetConfirmationModal';
import { HeatmapGrid } from '@/presentation/pages/TeacherDashboard/components/HeatmapGrid';

describe('QA Battery 2: DOM Hierarchy & Portal Integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  // Test 2a: ResetConfirmationModal Portal Escape & Hierarchy
  it('2a. ResetConfirmationModal: mounts directly under document.body with dir="rtl" and unmounts cleanly', async () => {
    const onConfirmMock = vi.fn().mockResolvedValue(undefined);
    const onCloseMock = vi.fn();

    // Harness to control open/close state
    function ModalHarness() {
      const [isOpen, setIsOpen] = useState(true);
      return (
        <div
          id="parent-transform-container"
          style={{ transform: 'translate3d(50px, 50px, 0px) scale(0.9)', zIndex: 5 }}
        >
          <button onClick={() => setIsOpen(false)}>Close Wrapper</button>
          <ResetConfirmationModal
            isOpen={isOpen}
            onClose={() => {
              setIsOpen(false);
              onCloseMock();
            }}
            resetLevel="system"
            onConfirm={onConfirmMock}
          />
        </div>
      );
    }

    const { container } = render(<ModalHarness />);

    // 1. ASSERT: The modal is NOT rendered inside the transformed parent container
    const parentContainer = container.querySelector('#parent-transform-container');
    expect(parentContainer).not.toBeNull();
    const modalInParent = parentContainer?.querySelector('[dir="rtl"]');
    expect(modalInParent).toBeNull();

    // 2. ASSERT: The modal element is rendered directly as a child of document.body
    const modalRoot = document.body.querySelector('div.fixed.inset-0[dir="rtl"]') as HTMLElement;
    expect(modalRoot).not.toBeNull();
    expect(modalRoot.parentElement).toBe(document.body);

    // 3. ASSERT: RTL attribute is strictly preserved on the root portal node
    expect(modalRoot.getAttribute('dir')).toBe('rtl');

    // 4. ASSERT: Dark mode and theme classes are preserved in the portal DOM tree
    const innerCard = modalRoot.querySelector('div.bg-white') as HTMLElement;
    expect(innerCard).not.toBeNull();
    expect(innerCard.className).toContain('dark:bg-slate-900');
    expect(innerCard.className).toContain('dark:border-slate-800');

    // 5. ASSERT: Clean unmounting on close with zero detached memory leak
    const closeBtn = screen.getByRole('button', { name: /Close Wrapper/i });
    act(() => {
      fireEvent.click(closeBtn);
    });

    // The modal root must be completely removed from document.body
    expect(document.body.querySelector('div.fixed.inset-0[dir="rtl"]')).toBeNull();
  });

  // Test 2b: HeatmapGrid detail drawer Portal Escape & Hierarchy
  it('2b. HeatmapGrid Detail Drawer: mounts directly under document.body and cleanly unmounts', async () => {
    // Harness with transformed parent container
    function HeatmapHarness() {
      return (
        <div
          id="heatmap-parent-stacking-context"
          style={{ transform: 'matrix(1, 0, 0, 1, 0, 0)', overflow: 'hidden' }}
        >
          <HeatmapGrid />
        </div>
      );
    }

    const { container } = render(<HeatmapHarness />);

    // Select student 1 card to open drill-down drawer
    const studentCellBtn = screen.getByText('תלמיד 1').closest('[role="button"]') as HTMLElement;
    expect(studentCellBtn).not.toBeNull();

    // Click student card to open detail drawer
    act(() => {
      fireEvent.click(studentCellBtn);
    });

    // 1. ASSERT: Drawer panel mounts directly under document.body via createPortal
    // The drawer root has fixed inset-0 z-50
    const drawerOverlay = document.body.querySelector('div.fixed.inset-0.z-50') as HTMLElement;
    expect(drawerOverlay).not.toBeNull();
    expect(drawerOverlay.parentElement).toBe(document.body);

    // Ensure it escaped the transformed parent container
    const drawerInParent = container.querySelector('#heatmap-parent-stacking-context div.fixed.inset-0.z-50');
    expect(drawerInParent).toBeNull();

    // 2. ASSERT: Dark mode styling is preserved in the drawer tree
    const drawerPanel = drawerOverlay.querySelector('div.bg-white') as HTMLElement;
    expect(drawerPanel).not.toBeNull();
    expect(drawerPanel.className).toContain('dark:bg-slate-900');
    expect(drawerPanel.className).toContain('dark:border-slate-800');

    // 3. Close the drawer by clicking the backdrop
    const backdrop = drawerOverlay.querySelector('.bg-slate-950\\/60') as HTMLElement;
    expect(backdrop).not.toBeNull();

    act(() => {
      fireEvent.click(backdrop);
    });

    // 4. ASSERT: Clean unmounting from document.body
    await waitFor(() => {
      expect(document.body.querySelector('div.fixed.inset-0.z-50')).toBeNull();
    });
  });
});
