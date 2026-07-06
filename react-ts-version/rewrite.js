const fs = require('fs');
const filePath = 'src/presentation/pages/TeacherDashboard.tsx';
const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
const startIndex = lines.findIndex(line => line.includes('const basicAdditionGroup = allStudents.filter('));
if (startIndex === -1) {
  console.error('Could not find start index');
  process.exit(1);
}
const newContent = `  return (
    <div
      className="flex flex-col md:flex-row h-screen bg-ws-bg overflow-hidden font-sans text-ws-ink selection:bg-ws-accentSoft0/30"
      dir="rtl"
    >
      <TeacherSidebar
        activeTab={activeTab}
        handleTabChange={handleTabChange}
        allAlerts={allAlerts}
        pendingRouteStudents={pendingRouteStudents}
        unreadAdminCount={unreadAdminCount}
      />

      <main className="flex-1 overflow-y-auto p-4 md:p-8 relative">
        <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-br from-indigo-500/5 via-transparent to-transparent pointer-events-none -z-10"></div>
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-gradient-to-tl from-cyan-500/5 via-transparent to-transparent pointer-events-none -z-10 rounded-full blur-3xl"></div>

        {activeTab === "clustering" && <ClusteringTab allStudents={allStudents} />}

        {activeTab === "alerts" && (
          <AlertsTab
            allAlerts={allAlerts}
            handleHintClick={handleHintClick}
            handleMarkAsRead={handleMarkAsRead}
          />
        )}

        {activeTab === "class_management" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <ClassManagement allStudents={allStudents} />
          </div>
        )}

        {activeTab === "diagnostic_reports" && (
          <DiagnosticReportsTab
            allStudents={allStudents}
            students={students}
            selectedReplayStudentId={selectedReplayStudentId}
            setSelectedReplayStudentId={setSelectedReplayStudentId}
            liveReplayEvents={liveReplayEvents}
            pendingApprovals={pendingApprovals}
            handleTabChange={handleTabChange}
          />
        )}

        {activeTab === "approvals" && (
          <ApprovalsTab
            pendingRouteStudents={pendingRouteStudents}
            pendingApprovals={pendingApprovals}
            teacherApprovals={teacherApprovals}
            fallbackApprovals={fallbackApprovals}
            setTeacherApprovals={setTeacherApprovals}
            setFallbackApprovals={setFallbackApprovals}
            TEACHER_ID={TEACHER_ID}
            approveRoute={approveRoute}
          />
        )}

        {activeTab === "chat_admin" && (
          <ChatAdminTab
            user={user}
            adminMessages={adminMessages}
            inputText={inputText}
            setInputText={setInputText}
            handleSendAdmin={handleSendAdmin}
            adminFileInputRef={adminFileInputRef}
            handleAdminImageSelect={handleAdminImageSelect}
            sendingImage={sendingImage}
          />
        )}

        {activeTab === "chat_students" && (
          <ChatStudentsTab
            chatStudents={chatStudents}
            selectedStudentId={selectedStudentId}
            setSelectedStudentId={setSelectedStudentId}
            messages={messages}
            studentMessages={studentMessages}
            user={user}
            teacherFileInputRef={teacherFileInputRef}
            handleTeacherImageSelect={handleTeacherImageSelect}
            sendingImage={sendingImage}
            inputText={inputText}
            setInputText={setInputText}
            handleSendStudent={handleSendStudent}
          />
        )}
      </main>
    </div>
  );
}
`;
fs.writeFileSync(filePath, lines.slice(0, startIndex).join('\n') + '\n' + newContent, 'utf-8');
console.log('Success');
