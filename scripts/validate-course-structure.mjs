import fs from 'node:fs';
import path from 'node:path';
import { MODULES_DIR, REQUIRED_MODULE_FILES } from './lib/course-utils.mjs';
const modules = fs.readdirSync(MODULES_DIR).filter((name) => /^\d{2}-/.test(name)).sort();
if (modules.length !== 14) throw new Error(`Expected 14 modules, found ${modules.length}`);
for (const slug of modules) {
  for (const file of REQUIRED_MODULE_FILES) {
    const full = path.join(MODULES_DIR, slug, file);
    if (!fs.existsSync(full)) throw new Error(`Missing required file: ${slug}/${file}`);
  }
}
console.log('Course structure validated.');
