const fs = require('fs');

const filepath = 'react-ts-version/src/presentation/pages/admin/AdminChatView.tsx';
let content = fs.readFileSync(filepath, 'utf8');

// 1. Fix import: add useRef
content = content.replace(
  "import { useState, useMemo, useEffect } from \"react\";",
  "import { useState, useMemo, useEffect, useRef } from \"react\";"
);

// 2. Fix import: add Image from lucide
content = content.replace(
  "import { Send, UserCircle2, Users } from \"lucide-react\";",
  "import { Send, UserCircle2, Users, ImageIcon } from \"lucide-react\";"
);

// 3. Fix destructure: add sendImageMessage
content = content.replace(
  "const { messages, sendMessage, markAsRead } = useChatStore();",
  "const { messages, sendMessage, sendImageMessage, markAsRead } = useChatStore();"
);

// 4. Add state + ref + handler after the existing state declarations
const afterState = `  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");`;

const newStateBlock = `  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [sendingImage, setSendingImage] = useState(false);
  const adminFileInputRef = useRef<HTMLInputElement>(null);

  const handleAdminImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTeacherId) return;
    setSendingImage(true);
    try {
      await sendImageMessage("admin", user?.displayName || "מנהל מערכת", selectedTeacherId, file);
    } catch (err) {
      console.error("Failed to send image:", err);
    } finally {
      setSendingImage(false);
      if (adminFileInputRef.current) adminFileInputRef.current.value = "";
    }
  };`;

content = content.replace(afterState, newStateBlock);

// 5. Wire the image button and add hidden input before the flex gap-2 div
const oldInputArea = `            {/* Input */}
            <div className="p-4 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex flex-col gap-2">
              <div className="flex gap-2 items-center">
                <UdlButton semanticColor="neutral" className="hidden md:flex rounded-full w-12 h-12 p-0 items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all shadow-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-mic"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                </UdlButton>
                <UdlButton semanticColor="neutral" className="hidden md:flex rounded-full w-12 h-12 p-0 items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all shadow-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-image"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                </UdlButton>`;

const newInputArea = `            {/* Input */}
            <div className="p-4 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex flex-col gap-2">
              <input
                ref={adminFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAdminImageSelect}
              />
              <div className="flex gap-2 items-center">
                <button
                  type="button"
                  onClick={() => adminFileInputRef.current?.click()}
                  disabled={sendingImage || !selectedTeacherId}
                  title="שלח תמונה"
                  className="hidden md:flex rounded-full w-12 h-12 p-0 items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all shadow-sm disabled:opacity-40"
                >
                  {sendingImage ? (
                    <span className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <ImageIcon className="w-5 h-5" />
                  )}
                </button>`;

if (content.includes(oldInputArea)) {
  content = content.replace(oldInputArea, newInputArea);
  console.log('Image button wired successfully');
} else {
  console.log('Could not find input area — trying partial match');
  // Try smaller match
  const partialOld = `<UdlButton semanticColor="neutral" className="hidden md:flex rounded-full w-12 h-12 p-0 items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all shadow-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-image">`;
  console.log('Found partial:', content.includes(partialOld));
}

// 6. Also render imageUrl in messages (add img tag if imageUrl exists)
const oldMsgContent = `                       <div className={\`px-4 py-2 rounded-2xl shadow-sm \${isAdmin ? 'bg-blue-600 text-white rounded-tl-sm' : 'bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-tr-sm'}\`}>
                         {msg.text}
                       </div>`;
const newMsgContent = `                       <div className={\`px-4 py-2 rounded-2xl shadow-sm \${isAdmin ? 'bg-blue-600 text-white rounded-tl-sm' : 'bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-tr-sm'}\`}>
                         {msg.text}
                         {msg.imageUrl && (
                           <img src={msg.imageUrl} alt="תמונה שנשלחה" className="max-w-xs max-h-48 rounded-xl mt-2 object-cover" />
                         )}
                       </div>`;

if (content.includes(oldMsgContent.trim().substring(0, 60))) {
  content = content.replace(oldMsgContent, newMsgContent);
  console.log('Image rendering in messages done');
}

fs.writeFileSync(filepath, content, 'utf8');
console.log('AdminChatView.tsx saved. Lines:', content.split('\n').length);
