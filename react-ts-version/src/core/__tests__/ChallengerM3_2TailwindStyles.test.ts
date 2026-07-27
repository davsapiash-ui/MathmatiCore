import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Empirical Verification: Tailwind CSS Style Compilation in NumberLineTask.tsx', () => {
  test('1. Inspect NumberLineTask.tsx for transition duration classes', () => {
    const filePath = path.resolve(process.cwd(), 'src/features/workspace/tasks/NumberLineTask.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    const hasArbitraryProp = content.includes('[transition-duration:2500ms]');
    expect(hasArbitraryProp).toBe(true);
  });

  test('2. Inspect tailwind.config.js for custom transitionDuration extension', () => {
    const configPath = path.resolve(process.cwd(), 'tailwind.config.js');
    const content = fs.readFileSync(configPath, 'utf-8');

    expect(content).toMatch(/transitionDuration:\s*\{\s*'2500':\s*'2500ms'/);
  });

  test('3. Verify compiled CSS output in dist/assets for 2500ms transition duration rule', () => {
    const distAssetsDir = path.resolve(process.cwd(), 'dist/assets');
    const cssFiles = fs.readdirSync(distAssetsDir).filter(f => f.endsWith('.css'));
    
    let matches: string[] = [];
    for (const file of cssFiles) {
      const cssContent = fs.readFileSync(path.join(distAssetsDir, file), 'utf-8');
      const idx = cssContent.indexOf('2500ms');
      if (idx !== -1) {
        matches.push(`${file} at offset ${idx}: ${cssContent.slice(Math.max(0, idx - 40), idx + 60)}`);
      }
    }

    console.log('CSS Matches for 2500ms:', matches);
    expect(matches.length).toBeGreaterThan(0);
  });
});
