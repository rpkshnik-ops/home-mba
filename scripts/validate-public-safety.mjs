import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/course-utils.mjs';

const dirs = [path.join(ROOT, 'web', 'public'), path.join(ROOT, 'web', 'dist')];
const badTokens = ['answer_keys', 'module-02-answer-key', '/assessments/answer_keys/'];
const failures = [];

for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      const rel = path.relative(ROOT, full);
      const text = fs.readFileSync(full, 'utf8');
      if (badTokens.some((token) => rel.includes(token) || text.includes(token))) {
        failures.push(rel);
      }
    }
  }
}

if (failures.length) {
  throw new Error(`Forbidden answer-key content detected in public artifacts:\n${failures.join('\n')}`);
}

console.log('Public safety validated.');
