const fs = require('fs');
const path = require('path');

const filepath = 'react-ts-version/src/presentation/pages/TeacherDashboard.tsx';
let content = fs.readFileSync(filepath, 'utf8');

// The exact string we need to remove (the two dead UdlButtons)
// We'll find it by line numbers approach - find the specific pattern
const lines = content.split('\n');
console.log('Total lines:', lines.length);

// Find the chat input area - look for "backdrop-blur-xl border-t border-ws-surface2" in student chat section
// It appears twice - once in admin chat, once in student chat. We want the second one.
let found = [];
lines.forEach((line, i) => {
  if (line.includes('backdrop-blur-xl border-t border-ws-surface2')) {
    found.push(i + 1); // 1-indexed
    console.log(`Line ${i+1}: ${JSON.stringify(line.trim().substring(0, 80))}`);
  }
});

// Also find the UdlButton image buttons
lines.forEach((line, i) => {
  if (line.includes('lucide lucide-mic') || line.includes('lucide lucide-image')) {
    console.log(`Line ${i+1}: ${JSON.stringify(line.trim())}`);
  }
});
