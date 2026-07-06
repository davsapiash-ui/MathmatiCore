import { UdlButton } from "@/presentation/design-system/UdlButton";
import { ShieldAlert, MessageCircle, Send } from "lucide-react";
import React from "react";

interface ChatStudentsTabProps {
  chatStudents: any[];
  selectedStudentId: string | null;
  setSelectedStudentId: (id: string | null) => void;
  messages: any[];
  studentMessages: any[];
  user: any;
  teacherFileInputRef: React.RefObject<HTMLInputElement>;
  handleTeacherImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  sendingImage: boolean;
  inputText: string;
  setInputText: (text: string) => void;
  handleSendStudent: () => void;
}

export function ChatStudentsTab({
  chatStudents,
  selectedStudentId,
  setSelectedStudentId,
  messages,
  studentMessages,
  user,
  teacherFileInputRef,
  handleTeacherImageSelect,
  sendingImage,
  inputText,
  setInputText,
  handleSendStudent,
}: ChatStudentsTabProps) {
  return (
    <div className="flex-1 flex flex-col md:flex-row bg-slate-50/50 backdrop-blur-sm rounded-2xl border border-ws-surface2 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] overflow-hidden animate-in fade-in zoom-in-95 duration-300 h-full">
      {/* Student List */}
      <div
        className={`${selectedStudentId ? "hidden md:flex" : "flex"} w-full md:w-72 bg-white/80 backdrop-blur-xl border-b md:border-b-0 md:border-l border-ws-surface2 flex-col h-full z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)] dark:shadow-[4px_0_24px_rgba(0,0,0,0.2)]`}
      >
        <div className="p-6 border-b border-ws-surface2 flex flex-col gap-3">
          <div>
            <h3 className="font-bold text-xl text-ws-ink">
              שיחות עם תלמידים
            </h3>
            <p className="text-xs text-ws-soft mt-1 font-medium">
              בחר תלמיד לתחילת צ'אט אישי
            </p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {chatStudents.map((student) => {
            const unreadCount = messages.filter(
              (m) =>
                m.senderId === student.studentId &&
                !m.read,
            ).length;
            return (
              <button
                key={student.studentId}
                onClick={() => {
                  setSelectedStudentId(student.studentId);
                  setInputText("");
                }}
                className={`w-full text-right p-4 rounded-xl flex items-center justify-between transition-all ${selectedStudentId === student.studentId ? "bg-ws-accentSoft border border-cyan-200/50 shadow-sm" : "hover:bg-ws-bg/80 border border-transparent"}`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-inner relative ${selectedStudentId === student.studentId ? "bg-gradient-to-tr from-cyan-500 to-blue-500" : "bg-slate-300 text-ws-soft"}`}
                  >
                    {(student.name || student.studentId || 'U')[0]}
                    {student.traceData?.hesitation_events > 0 && (
                      <div
                        className="absolute -top-1 -right-1 bg-ws-accentSoft0 rounded-full p-0.5 shadow-md"
                        title="מאבק קוגניטיבי"
                      >
                        <ShieldAlert className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>
                  <span
                    className={`font-bold text-base ${selectedStudentId === student.studentId ? "text-cyan-800" : "text-slate-700"}`}
                  >
                    {student.name || student.studentId}
                  </span>
                </div>
                {unreadCount > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full shadow-lg shadow-red-500/30 animate-bounce">
                    {unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Student Chat Area */}
      <div
        className={`${!selectedStudentId ? "hidden md:flex" : "flex"} flex-1 flex-col relative h-full bg-slate-50/50`}
      >
        {selectedStudentId ? (
          <>
            <div className="p-4 bg-white/80 backdrop-blur-xl border-b border-ws-surface2 flex items-center gap-4 shadow-sm z-10">
              <button
                onClick={() => setSelectedStudentId(null)}
                className="md:hidden p-2 rounded-lg bg-ws-bg text-ws-soft hover:text-ws-ink"
              >
                &rarr;
              </button>
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-500 flex items-center justify-center font-bold text-white shadow-lg shadow-cyan-500/20 text-xl">
                {
                  (chatStudents.find((s) => s.studentId === selectedStudentId)?.name || selectedStudentId || 'U')[0]
                }
              </div>
              <div>
                <h3 className="font-bold text-xl text-ws-ink">
                  {
                    chatStudents.find((s) => s.studentId === selectedStudentId)?.name || selectedStudentId
                  }
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="w-2 h-2 rounded-full bg-ws-accentSoft0"></span>
                  <span className="text-xs text-ws-soft font-medium">
                    מחובר
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-4 relative">
              <div className="absolute inset-0 bg-ws-bg/50 pointer-events-none -z-10"></div>
              {studentMessages.length === 0 ? (
                <div className="m-auto text-center flex flex-col items-center justify-center text-slate-400">
                  <MessageCircle className="w-16 h-16 mb-4 opacity-20" />
                  <p className="font-medium text-lg">
                    אין הודעות. התחל שיחה חדשה.
                  </p>
                </div>
              ) : (
                studentMessages.map((msg) => {
                  const isMe = msg.senderId === user?.uid;
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col max-w-[85%] md:max-w-[70%] ${isMe ? "self-end items-end" : "self-start items-start"}`}
                    >
                      <div
                        className={`px-5 py-3 rounded-2xl shadow-md ${
                          isMe
                            ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-tl-sm"
                            : "bg-white/90 backdrop-blur-md border border-ws-surface2 text-ws-ink rounded-tr-sm"
                        }`}
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
                ref={teacherFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleTeacherImageSelect}
              />
              <div className="flex gap-3 items-center">
                <button
                  type="button"
                  onClick={() => teacherFileInputRef.current?.click()}
                  disabled={sendingImage || !selectedStudentId}
                  title="שלח תמונה"
                  className="flex rounded-full w-12 h-12 p-0 items-center justify-center bg-ws-bg/80 hover:bg-slate-200 text-ws-soft transition-all shadow-sm disabled:opacity-40"
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
                 <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleSendStudent()
                  }
                  placeholder="הקלד הודעה לתלמיד..."
                  className="flex-1 bg-ws-bg/80 border border-ws-surface2 rounded-full px-6 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all text-ws-ink shadow-inner"
                />
                <UdlButton
                  onClick={handleSendStudent}
                  disabled={!inputText.trim()}
                  className="rounded-full w-12 h-12 p-0 flex items-center justify-center bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white transition-all disabled:opacity-50 shadow-lg shadow-cyan-500/30"
                >
                  <Send className="w-5 h-5 -ml-1" />
                </UdlButton>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center flex-col text-slate-400 gap-6">
            <div className="w-32 h-32 rounded-full bg-ws-bg/50 border-2 border-dashed border-ws-surface2 flex items-center justify-center">
              <MessageCircle className="w-12 h-12 opacity-30" />
            </div>
            <h3 className="text-2xl font-bold text-ws-soft">
              בחר תלמיד להתחלת שיחה
            </h3>
            <p className="text-ws-soft max-w-sm text-center">
              תוכל לתת משוב אישי, לשלוח רמזים, או לעזור בזמן אמת.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
