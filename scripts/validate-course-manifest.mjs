import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/course-utils.mjs';

const manifestPath = path.join(ROOT, 'web', 'src', 'data', 'course-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (manifest.schemaVersion !== 1) throw new Error('Unsupported manifest schemaVersion');
if (manifest.totalModules !== 14) throw new Error(`Expected totalModules=14, got ${manifest.totalModules}`);
if (!Array.isArray(manifest.modules) || manifest.modules.length !== 14) throw new Error('Manifest modules length must be 14');
for (const module of manifest.modules) {
  if (JSON.stringify(module).includes('answer_keys')) throw new Error(`Manifest leaks answer key path for ${module.slug}`);
  if (!module.slug || typeof module.readinessPercent !== 'number') throw new Error(`Invalid module entry: ${module.slug}`);
}
console.log('Manifest validated.');
