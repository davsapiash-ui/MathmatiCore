const fs = require('fs');

const filepath = 'react-ts-version/src/presentation/pages/TeacherDashboard.tsx';
let content = fs.readFileSync(filepath, 'utf8');
const lines = content.split('\n');

// Find the reject button alert line
let alertLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('אפשרות זו תאפשר עריכת מסלול ידנית בעתיד')) {
    alertLine = i;
    console.log(`Found alert at line ${i + 1}: ${JSON.stringify(lines[i].trim())}`);
    break;
  }
}

if (alertLine === -1) {
  console.log('Alert line not found');
  process.exit(1);
}

// The onClick handler spans lines alertLine-1 to alertLine+2 roughly
// Find the onClick={()=> { line before it
let onClickStart = alertLine;
while (onClickStart > alertLine - 5 && !lines[onClickStart].includes('onClick={() =>')) {
  onClickStart--;
}
// Find the closing }} after the alert
let onClickEnd = alertLine;
while (onClickEnd < alertLine + 5 && !lines[onClickEnd].trim().endsWith('}}')) {
  onClickEnd++;
}
console.log(`onClick block: lines ${onClickStart+1}..${onClickEnd+1}`);
for (let i = onClickStart; i <= onClickEnd; i++) {
  console.log(`  ${i+1}: ${JSON.stringify(lines[i])}`);
}

// Replace the onClick handler  
const newHandler = `                          onClick={async () => {\r
                            const approval = pendingApprovals.find((a) => a.studentId === student.studentId);\r
                            if (approval) {\r
                              try {\r
                                await SocraticEngine.rejectTasks(TEACHER_ID, approval.id);\r
                                setPendingApprovals(prev => prev.filter(a => a.id !== approval.id));\r
                              } catch {\r
                                /* offline */\r
                              }\r
                            }\r
                          }}`;

lines.splice(onClickStart, onClickEnd - onClickStart + 1, newHandler);
console.log('\nReplaced. New total lines:', lines.length);

fs.writeFileSync(filepath, lines.join('\n'), 'utf8');
console.log('SUCCESS');
