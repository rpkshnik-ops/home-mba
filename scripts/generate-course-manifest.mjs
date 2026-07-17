import fs from 'node:fs';
import path from 'node:path';
import {
  MODULES_DIR, WEB_CONTENT_DIR, WEB_DATA_DIR, REQUIRED_MODULE_FILES, ensureDir,
  parseCurriculumMeta, parseModuleReadme, getModuleAssessmentPaths, scanModuleDirectory,
  computeDevelopmentStatus, getLastModifiedISO, readTasks, inferNextTask, plainText
} from './lib/course-utils.mjs';

const curriculum = parseCurriculumMeta();
const tasks = readTasks();
ensureDir(WEB_DATA_DIR);
ensureDir(WEB_CONTENT_DIR);
fs.writeFileSync(path.join(WEB_CONTENT_DIR, '.gitkeep'), '');

const moduleDirs = fs.readdirSync(MODULES_DIR).filter((name) => /^\d{2}-/.test(name)).sort();
const modules = moduleDirs.map((slug) => {
  const moduleDir = path.join(MODULES_DIR, slug);
  const moduleNumber = Number(slug.slice(0, 2));
  const curriculumEntry = curriculum.get(slug) ?? { title: slug, level: null, hours: [], weeks: 0 };
  const readme = parseModuleReadme(moduleDir);
  const scan = scanModuleDirectory(moduleDir);
  const { answerKeyPath, rubricPath } = getModuleAssessmentPaths(moduleNumber);
  const hasAnswerKey = fs.existsSync(answerKeyPath);
  const hasRubric = fs.existsSync(rubricPath);
  const linksPassed = scan.linkResults.every((item) => item.exists);
  const structurePassed = scan.foundFiles.length === REQUIRED_MODULE_FILES.length;
  let status = computeDevelopmentStatus(scan, hasAnswerKey, hasRubric);
  if (status === 'ready_for_review' && linksPassed && structurePassed) status = 'verified';

  const targetDir = path.join(WEB_CONTENT_DIR, slug);
  ensureDir(targetDir);
  const materials = {};
  for (const file of REQUIRED_MODULE_FILES) {
    const source = path.join(moduleDir, file);
    if (!fs.existsSync(source)) continue;
    const sanitized = fs.readFileSync(source, 'utf8')
      .replace(/^.*answer_keys.*$/gim, '> Ключ ответов исключён из web-сборки по соображениям безопасности.')
      .replace(/^.*ключ находится отдельно.*$/gim, '> Ключ ответов исключён из web-сборки по соображениям безопасности.');
    fs.writeFileSync(path.join(targetDir, file), sanitized);
    materials[file] = `/content/${slug}/${file}`;
  }

  return {
    moduleNumber,
    slug,
    title: curriculumEntry.title ?? readme.title,
    level: curriculumEntry.level,
    expectedDuration: readme.durationLabel ?? `${curriculumEntry.weeks || 0} недель`,
    expectedWeeks: readme.estimatedWeeks ?? curriculumEntry.weeks,
    expectedHours: readme.estimatedHours ?? curriculumEntry.hours.reduce((sum, value) => sum + value, 0),
    requiredFiles: REQUIRED_MODULE_FILES,
    foundFiles: scan.foundFiles,
    substantiveFiles: scan.substantiveFiles,
    hasAnswerKey,
    hasRubric,
    resourcesCount: fs.existsSync(path.join(moduleDir, 'resources.md')) ? 1 : 0,
    developmentStatus: status,
    readinessPercent: Math.round((scan.substantiveFiles.length / REQUIRED_MODULE_FILES.length) * 100),
    lastModifiedAt: getLastModifiedISO(scan.foundFiles.map((name) => path.join(moduleDir, name))),
    linkCheck: { passed: linksPassed, checkedLinks: scan.linkResults.length, brokenLinks: scan.linkResults.filter((item) => !item.exists) },
    structureCheck: { passed: structurePassed, missingFiles: REQUIRED_MODULE_FILES.filter((file) => !scan.foundFiles.includes(file)) },
    hasIncompleteTasks: status !== 'verified',
    nextRecommendedTask: inferNextTask(tasks, moduleNumber),
    summary: plainText(readme.readmeContent).slice(0, 300),
    materials,
  };
});

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  totalModules: modules.length,
  developedModules: modules.filter((module) => module.readinessPercent > 0).length,
  verifiedModules: modules.filter((module) => module.developmentStatus === 'verified').length,
  modules,
};
fs.writeFileSync(path.join(WEB_DATA_DIR, 'course-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Manifest generated for ${modules.length} modules.`);
