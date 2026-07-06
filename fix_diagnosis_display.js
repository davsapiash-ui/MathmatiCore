const fs = require('fs');

const filepath = 'react-ts-version/src/presentation/pages/TeacherDashboard.tsx';
let content = fs.readFileSync(filepath, 'utf8');
const lines = content.split('\n');

// Find "המלצת נתב הלמידה" block — we want to insert the AI diagnosis BEFORE it
let insertBeforeLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('bg-ws-accentSoft/30 p-5 rounded-2xl border border-ws-accent/10 mb-6')) {
    insertBeforeLine = i;
    console.log(`Found insertion point at line ${i + 1}`);
    break;
  }
}

if (insertBeforeLine === -1) {
  console.log('Could not find insertion point');
  process.exit(1);
}

// The diagnosis block — insert before the router recommendation
const diagnosisBlock = [
  `                    {/* AI Socratic Engine Diagnosis */}`,
  `                    {(() => {`,
  `                      const approval = pendingApprovals.find(a => a.studentId === student.studentId);`,
  `                      if (!approval || !approval.clinicalDiagnosisHe) return null;`,
  `                      return (`,
  `                        <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-5 mb-4">`,
  `                          <h4 className="font-bold text-amber-800 mb-2 flex items-center gap-2 text-sm">`,
  `                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
  `                            אבחון קליני (Socratic AI Engine):`,
  `                          </h4>`,
  `                          <p className="text-amber-900 text-sm leading-relaxed mb-3">{approval.clinicalDiagnosisHe}</p>`,
  `                          <h5 className="font-bold text-amber-800 text-sm mb-1">תוכנית פעולה מוצעת:</h5>`,
  `                          <p className="text-amber-900 text-sm leading-relaxed">{approval.actionPlanHe}</p>`,
  `                        </div>`,
  `                      );`,
  `                    })()}`,
];

lines.splice(insertBeforeLine, 0, ...diagnosisBlock);

console.log(`Inserted ${diagnosisBlock.length} lines before line ${insertBeforeLine + 1}`);
console.log('New total lines:', lines.length);

fs.writeFileSync(filepath, lines.join('\n'), 'utf8');
console.log('SUCCESS');
