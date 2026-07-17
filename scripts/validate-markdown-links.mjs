import fs from 'node:fs';
import path from 'node:path';
import { ROOT, collectMarkdownLinks } from './lib/course-utils.mjs';
function walk(dir, acc=[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git','node_modules','web/dist'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.isFile() && full.endsWith('.md')) acc.push(full);
  }
  return acc;
}
const failures = [];
for (const file of walk(ROOT)) {
  const content = fs.readFileSync(file, 'utf8');
  for (const link of collectMarkdownLinks(file, content)) {
    if (!fs.existsSync(link.resolved)) failures.push(`${path.relative(ROOT, file)} -> ${link.raw}`);
  }
}
if (failures.length) throw new Error(`Broken links:\n${failures.join('\n')}`);
console.log('Markdown links validated.');
