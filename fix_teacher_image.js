const fs = require('fs');

const filepath = 'react-ts-version/src/presentation/pages/TeacherDashboard.tsx';
let content = fs.readFileSync(filepath, 'utf8');
const lines = content.split('\n');

// Lines 1610-1660 (0-indexed: 1609-1659) contain the two broken UdlButtons
// We'll splice them out and replace with the working image button

const startLine = 1609; // 0-indexed (line 1610)
const endLine = 1660;   // 0-indexed (line 1661 - exclusive, up to and including line 1660)

// Find the exact end: after </UdlButton> for the image button (line 1660 = index 1659)
// We want to replace lines 1610..1660 (0-indexed: 1609..1659, 51 lines)

const replacement = [
  '                  <div className="p-4 bg-white/80 backdrop-blur-xl border-t border-ws-surface2">',
  '                    <input',
  '                      ref={teacherFileInputRef}',
  '                      type="file"',
  '                      accept="image/*"',
  '                      className="hidden"',
  '                      onChange={handleTeacherImageSelect}',
  '                    />',
  '                    <div className="flex gap-3 items-center">',
  '                      <button',
  '                        type="button"',
  '                        onClick={() => teacherFileInputRef.current?.click()}',
  '                        disabled={sendingImage || !selectedStudentId}',
  '                        title="\u05e9\u05dc\u05d7 \u05ea\u05de\u05d5\u05e0\u05d4"',
  '                        className="hidden md:flex rounded-full w-12 h-12 p-0 items-center justify-center bg-ws-bg/80 hover:bg-slate-200 text-ws-soft transition-all shadow-sm disabled:opacity-40"',
  '                      >',
  '                        {sendingImage ? (',
  '                          <span className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />',
  '                        ) : (',
  '                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">',
  '                            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />',
  '                            <circle cx="9" cy="9" r="2" />',
  '                            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />',
  '                          </svg>',
  '                        )}',
  '                      </button>',
];

// Print what we're replacing for verification
console.log('Lines being replaced:');
for (let i = startLine; i <= endLine; i++) {
  console.log(`  ${i+1}: ${lines[i]}`);
}

// Do the splice
lines.splice(startLine, endLine - startLine + 1, ...replacement);

console.log('\nReplacement lines:');
replacement.forEach((l, i) => console.log(`  ${startLine+i+1}: ${l}`));

const newContent = lines.join('\n');
fs.writeFileSync(filepath, newContent, 'utf8');
console.log('\nSUCCESS: File written. New total lines:', lines.length);
