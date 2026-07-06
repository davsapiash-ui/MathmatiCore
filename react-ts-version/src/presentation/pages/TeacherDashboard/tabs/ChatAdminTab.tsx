import { UdlButton } from "@/presentation/design-system/UdlButton";
import { ShieldAlert, MessageCircle, Send } from "lucide-react";
import React from "react";

interface ChatAdminTabProps {
  user: any;
  adminMessages: any[];
  inputText: string;
  setInputText: (text: string) => void;
  handleSendAdmin: () => void;
  adminFileInputRef: React.RefObject<HTMLInputElement>;
  handleAdminImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  sendingImage: boolean;
}

export function ChatAdminTab({
  user,
  adminMessages,
  inputText,
  setInputText,
  handleSendAdmin,
  adminFileInputRef,
  handleAdminImageSelect,
  sendingImage,
}: ChatAdminTabProps) {
  return (
    <div className="flex-1 flex flex-col bg-slate-50/50 backdrop-blur-sm rounded-2xl border border-ws-surface2 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] overflow-hidden animate-in fade-in zoom-in-95 duration-300 h-full">
      <div className="p-4 bg-white/80 backdrop-blur-xl border-b border-ws-surface2 flex items-center gap-4 shadow-sm z-10">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
          <ShieldAlert className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="font-bold text-xl text-ws-ink">
            הנהלה ותמיכה טכנית
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2 h-2 rounded-full bg-ws-accentSoft0 animate-pulse"></span>
            <span className="text-xs text-ws-soft font-medium">
              זמין כעת לשיחה
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-4 relative">
        <div className="absolute inset-0 bg-ws-bg/50 pointer-events-none -z-10"></div>
        {adminMessages.length === 0 ? (
          <div className="m-auto text-center flex flex-col items-center justify-center text-slate-400">
            <MessageCircle className="w-16 h-16 mb-4 opacity-20" />
            <p className="font-medium text-lg">
              אין הודעות. שלח הודעה למנהל המערכת.
            </p>
          </div>
        ) : (
          adminMessages.map((msg) => {
            const isMe = msg.senderId === user?.uid;
            return (
              <div
                key={msg.id}
                className={`flex flex-col max-w-[85%] md:max-w-[70%] ${isMe ? "self-end items-end" : "self-start items-start"}`}
              >
                <div
                  className={`px-5 py-3 rounded-2xl shadow-md ${isMe ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tl-sm" : "bg-white/90 backdrop-blur-md border border-ws-surface2 text-ws-ink rounded-tr-sm"}`}
                >
                  {msg.text && <span>{msg.text}</span>}
                  {msg.imageUrl && (
                    <img
                      src={msg.imageUrl}
                      alt="תמונה"
                      className="max-w-[220px] max-h-[220px] rounded-xl mt-1 object-cover cursor-pointer block"
                      onClick={() => window.open(msg.imageUrl, '_blank')}
                    />
                  )}
                </div>
                <span className="text-[10px] font-medium text-slate-400 mt-2 px-2 tracking-wider">
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="p-4 bg-white/80 backdrop-blur-xl border-t border-ws-surface2">
        <input
          ref={adminFileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAdminImageSelect}
        />
        <div className="flex gap-3 items-center">
          <button
            type="button"
            onClick={() => alert("הקלטת שמע אינה זמינה כעת.")}
            className="flex rounded-full w-12 h-12 p-0 items-center justify-center bg-ws-bg/80 hover:bg-slate-200 text-ws-soft transition-all shadow-sm"
            title="הקלטת שמע"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide lucide-mic"
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => adminFileInputRef.current?.click()}
            disabled={sendingImage}
            className="flex rounded-full w-12 h-12 p-0 items-center justify-center bg-ws-bg/80 hover:bg-slate-200 text-ws-soft transition-all shadow-sm disabled:opacity-40"
            title="שלח תמונה"
          >
            {sendingImage ? (
              <span className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide lucide-image"
              >
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
            )}
          </button>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendAdmin()}
            placeholder="הקלד הודעה למנהל המערכת..."
            className="flex-1 bg-ws-bg/80 border border-ws-surface2 rounded-full px-6 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-ws-ink shadow-inner"
          />
          <UdlButton
            onClick={handleSendAdmin}
            disabled={!inputText.trim()}
            className="rounded-full w-12 h-12 p-0 flex items-center justify-center bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white transition-all disabled:opacity-50 shadow-lg shadow-blue-500/30"
          >
            <Send className="w-5 h-5 -ml-1" />
          </UdlButton>
        </div>
      </div>
    </div>
  );
}
