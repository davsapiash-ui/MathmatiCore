import re, sys

filepath = r"react-ts-version/src/presentation/pages/TeacherDashboard.tsx"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Find the exact block between the two markers and replace
old_pattern = r'(                   <div className="p-4 bg-white/80  backdrop-blur-xl border-t border-ws-surface2 ">\r?\n                     <div className="flex gap-3 items-center">\r?\n)(.*?)(                       <input\r?\n                         type="text")'

new_replacement = r'''\1                      <input
                        ref={teacherFileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleTeacherImageSelect}
                      />
                      <button
                        type="button"
                        onClick={() => teacherFileInputRef.current?.click()}
                        disabled={sendingImage || !selectedStudentId}
                        title="שלח תמונה"
                        className="hidden md:flex rounded-full w-12 h-12 p-0 items-center justify-center bg-ws-bg/80 hover:bg-slate-200 text-ws-soft transition-all shadow-sm disabled:opacity-40"
                      >
                        {sendingImage ? (
                          <span className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                            <circle cx="9" cy="9" r="2" />
                            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                          </svg>
                        )}
                      </button>
\3'''

new_content, count = re.subn(old_pattern, new_replacement, content, flags=re.DOTALL)

if count > 0:
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"SUCCESS: replaced {count} block(s)")
else:
    # Try to find what's there
    idx = content.find('backdrop-blur-xl border-t border-ws-surface2')
    print(f"BLOCK NOT FOUND. 'backdrop-blur-xl border-t' at index: {idx}")
    if idx > 0:
        print(repr(content[idx-50:idx+200]))
    sys.exit(1)
