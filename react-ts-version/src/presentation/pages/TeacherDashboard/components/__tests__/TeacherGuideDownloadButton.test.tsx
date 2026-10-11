/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TeacherGuideDownloadButton, TEACHER_GUIDE_LABEL_HE, TEACHER_GUIDE_SOON_HE } from '../TeacherGuideDownloadButton';

afterEach(cleanup);

describe('the teacher guide download placeholder (PRD Module 15 §ג)', () => {
  it('is a disabled button that names itself and says it comes later', () => {
    render(<TeacherGuideDownloadButton />);
    const b = screen.getByTestId('teacher-guide-download') as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(b.textContent).toContain(TEACHER_GUIDE_LABEL_HE);
    expect(b.textContent).toContain(TEACHER_GUIDE_SOON_HE);
  });

  it('does nothing when pressed: no window, no download, no request', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('no request expected')));
    render(<TeacherGuideDownloadButton />);
    fireEvent.click(screen.getByTestId('teacher-guide-download'));
    expect(open).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    open.mockRestore();
    fetchSpy.mockRestore();
  });

  it('has no link and no speech button (teacher screens have no narration)', () => {
    const { container } = render(<TeacherGuideDownloadButton />);
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('[data-testid="udl-speech-button"]')).toBeNull();
  });
});
