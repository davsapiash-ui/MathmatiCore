const fs = require('fs');
const filePath = 'src/presentation/pages/TeacherDashboard.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

const importTarget = `import { useState, useEffect, useMemo, useRef } from "react";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { DataGrid } from "@/presentation/design-system/DataGrid";
import { useAuthStore } from "@/application/useAuthStore";
import { useChatStore } from "@/application/useChatStore";
import { useStore, type StudentData } from "@/application/useStore";
import { ref, onValue, remove, set } from "firebase/database";
import { database, authReady } from "@/infrastructure/firebase";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Send, MessageCircle, ShieldAlert } from "lucide-react";
import { ReplayViewer } from "@/presentation/components/ReplayViewer";
import { ClassManagement } from "./TeacherDashboard/ClassManagement";
import { SocraticEngine, type PendingAIApproval } from "@/infrastructure/services/SocraticEngine";
import { useTeacherTour } from "./TeacherDashboard/useTeacherTour";`;

const importReplacement = `import { useState, useEffect, useMemo, useRef } from "react";
import { useAuthStore } from "@/application/useAuthStore";
import { useChatStore } from "@/application/useChatStore";
import { useStore, type StudentData } from "@/application/useStore";
import { ref, onValue, remove, set } from "firebase/database";
import { database, authReady } from "@/infrastructure/firebase";
import { ClassManagement } from "./TeacherDashboard/ClassManagement";
import { SocraticEngine, type PendingAIApproval } from "@/infrastructure/services/SocraticEngine";
import { useTeacherTour } from "./TeacherDashboard/useTeacherTour";

// Extracted Components
import { TeacherSidebar } from "./TeacherDashboard/components/TeacherSidebar";
import { ClusteringTab } from "./TeacherDashboard/tabs/ClusteringTab";
import { AlertsTab } from "./TeacherDashboard/tabs/AlertsTab";
import { DiagnosticReportsTab } from "./TeacherDashboard/tabs/DiagnosticReportsTab";
import { ApprovalsTab } from "./TeacherDashboard/tabs/ApprovalsTab";
import { ChatAdminTab } from "./TeacherDashboard/tabs/ChatAdminTab";
import { ChatStudentsTab } from "./TeacherDashboard/tabs/ChatStudentsTab";`;

content = content.replace(importTarget, importReplacement);

const newReturn = `  return (
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
}`;

const returnStartIndex = content.lastIndexOf('  return (\n    <div\n      className="flex flex-col md:flex-row h-screen');
if (returnStartIndex !== -1) {
    content = content.substring(0, returnStartIndex) + newReturn + '\n}\n';
} else {
    console.error("Could not find main return block!");
    process.exit(1);
}

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Success');
