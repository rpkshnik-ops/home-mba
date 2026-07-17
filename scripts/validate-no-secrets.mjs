import fs from 'node:fs';
import path from 'node:path';
import { ROOT, getTrackedFiles } from './lib/course-utils.mjs';

const patterns = [
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /AIza[0-9A-Za-z\-_]{35}/,
  /-----BEGIN (?:RSA|OPENSSH|EC|DSA|PGP) PRIVATE KEY-----/,
];

const failures = [];
for (const rel of getTrackedFiles()) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) continue;
  const text = fs.readFileSync(full, 'utf8');
  if (patterns.some((pattern) => pattern.test(text))) failures.push(rel);
}
if (failures.length) throw new Error(`Potential secrets found in tracked files:\n${failures.join('\n')}`);
console.log('No tracked secrets detected.');
