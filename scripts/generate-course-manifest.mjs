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

const transliterationMap = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

const fileTypeMap = {
  'README.md': 'overview',
  '01-theory.md': 'theory',
  '02-examples.md': 'examples',
  '03-case-study.md': 'case',
  '04-practical-assignment.md': 'practical',
  '05-quiz.md': 'quiz',
  '06-reflection.md': 'reflection',
  'resources.md': 'resources',
};

function slugifyRu(value) {
  return value
    .toLowerCase()
    .split('')
    .map((char) => transliterationMap[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function headingTitle(raw) {
  return raw.replace(/^#+\s*/, '').replace(/^\d+[.)]?\s*/, '').trim();
}

function estimateMinutes(markdown) {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(5, Math.round(words / 180 * 60 / 10) * 10 || 5);
}

function sectionSummary(markdown) {
  return plainText(markdown).slice(0, 180);
}

function buildUnitId(type, title) {
  return `${type}-${slugifyRu(title)}`;
}

function extractHeadingSections(markdown) {
  const lines = markdown.split('\n');
  const sections = [];
  let current = null;
  for (const line of lines) {
    const match = line.match(/^(#{2,3})\s+(.+)$/);
    if (match) {
      if (current) sections.push({ heading: current.heading, headingLevel: current.headingLevel, content: current.lines.join('\n').trim() });
      current = { heading: headingTitle(match[2]), headingLevel: match[1].length, lines: [line] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) sections.push({ heading: current.heading, headingLevel: current.headingLevel, content: current.lines.join('\n').trim() });
  return sections.filter((section) => section.content && section.content.length > 40);
}

function createLearningUnits(slug, file, content, orderStart) {
  const type = fileTypeMap[file];
  const sectioned = ['01-theory.md', '02-examples.md'].includes(file) ? extractHeadingSections(content) : [];
  if (sectioned.length >= 2) {
    return sectioned.map((section, index) => ({
      id: buildUnitId(type, section.heading),
      sourceFile: file,
      type,
      title: section.heading,
      order: orderStart + index,
      estimatedMinutes: estimateMinutes(section.content),
      available: true,
      heading: section.heading,
      headingLevel: section.headingLevel,
      summary: sectionSummary(section.content),
    }));
  }

  const fallbackTitle = {
    overview: 'Обзор модуля',
    theory: 'Теория',
    examples: 'Разбор примеров',
    case: 'Бизнес-кейс',
    practical: 'Практическое задание',
    quiz: 'Итоговый тест',
    reflection: 'Рефлексия',
    resources: 'Дополнительные ресурсы',
  }[type];

  return [{
    id: buildUnitId(type, fallbackTitle),
    sourceFile: file,
    type,
    title: fallbackTitle,
    order: orderStart,
    estimatedMinutes: estimateMinutes(content),
    available: true,
    heading: null,
    headingLevel: null,
    summary: sectionSummary(content),
  }];
}

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
  const learningUnits = [];
  let order = 1;

  for (const file of REQUIRED_MODULE_FILES) {
    const source = path.join(moduleDir, file);
    if (!fs.existsSync(source)) continue;
    const sanitized = fs.readFileSync(source, 'utf8')
      .replace(/^.*answer_keys.*$/gim, '> Ключ ответов исключён из web-сборки по соображениям безопасности.')
      .replace(/^.*ключ находится отдельно.*$/gim, '> Ключ ответов исключён из web-сборки по соображениям безопасности.');
    fs.writeFileSync(path.join(targetDir, file), sanitized);
    materials[file] = `content/${slug}/${file}`;
    const units = createLearningUnits(slug, file, sanitized, order);
    order += units.length;
    learningUnits.push(...units);
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
    learningUnits,
  };
});

const manifest = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  totalModules: modules.length,
  developedModules: modules.filter((module) => module.readinessPercent > 0).length,
  verifiedModules: modules.filter((module) => module.developmentStatus === 'verified').length,
  modules,
};
fs.writeFileSync(path.join(WEB_DATA_DIR, 'course-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Manifest generated for ${modules.length} modules.`);
