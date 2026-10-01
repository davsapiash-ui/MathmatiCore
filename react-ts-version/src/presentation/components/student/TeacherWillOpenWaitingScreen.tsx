import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';
import { useTeacherGenderStore } from '@/application/useTeacherGender';
import { teacherSentenceHe } from '@/core/teacherGender';

/**
 * The second sentence of PRD 14 §ב0's waiting text — the owner's own wording,
 * in the teacher's gender (core/teacherGender.ts, 'willOpenActivity').
 * Shown to a learner in meetings 3–8 who has no completed meeting 2 or no
 * approved path (absent on meeting-2 day, or after an absolute reset). The bee
 * screen says "סיימתם את התחנה השנייה בהצלחה", which is false for them; the text
 * on screen must match what the child did.
 *
 * The workspace's quiet waiting layout: the sentence and its read-aloud button, nothing else.
 */
export function TeacherWillOpenWaitingScreen() {
  const sentence = teacherSentenceHe('willOpenActivity', useTeacherGenderStore((s) => s.gender));
  return (
    <div
      dir="rtl"
      data-testid="teacher-will-open-screen"
      className="h-screen w-full flex flex-col items-center justify-center bg-ws-bg text-ws-ink font-body p-6"
    >
      <div className="bg-ws-surface p-8 rounded-3xl shadow-sm max-w-md w-full border-2 border-ws-surface2 flex items-center justify-center gap-3">
        <p className="text-xl font-bold text-ws-ink leading-relaxed">{sentence}</p>
        <UdlSpeechButton text={sentence} className="shrink-0" />
      </div>
    </div>
  );
}

export default TeacherWillOpenWaitingScreen;
