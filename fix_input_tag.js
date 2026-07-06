const fs = require('fs');

const filepath = 'react-ts-version/src/presentation/pages/TeacherDashboard.tsx';
let content = fs.readFileSync(filepath, 'utf8');
const lines = content.split('\n');

// Line 1635 is </button> (0-indexed: 1634)
// Line 1636 is broken: just 'type="text"' (0-indexed: 1635) - missing <input before it
// We need to insert <input before line 1636

console.log('Lines 1634-1638:');
for (let i = 1633; i <= 1637; i++) {
  console.log(`  ${i+1}: ${JSON.stringify(lines[i])}`);
}

// Insert the missing <input tag before line 1636 (index 1635)
lines.splice(1635, 0, '                       <input');

console.log('\nAfter fix, lines 1634-1640:');
for (let i = 1633; i <= 1639; i++) {
  console.log(`  ${i+1}: ${JSON.stringify(lines[i])}`);
}

const newContent = lines.join('\n');
fs.writeFileSync(filepath, newContent, 'utf8');
console.log('\nSUCCESS. New total lines:', lines.length);
