import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export const ROOT = path.resolve(new URL('../../', import.meta.url).pathname);
export const MODULES_DIR = path.join(ROOT, 'modules');
export const ANSWER_KEYS_DIR = path.join(ROOT, 'assessments', 'answer_keys');
export const RUBRICS_DIR = path.join(ROOT, 'assessments', 'grading_rubrics');
export const WEB_DATA_DIR = path.join(ROOT, 'web', 'src', 'data');
export const WEB_CONTENT_DIR = path.join(ROOT, 'web', 'public', 'content');
export const REQUIRED_MODULE_FILES = ['README.md','01-theory.md','02-examples.md','03-case-study.md','04-practical-assignment.md','05-quiz.md','06-reflection.md','resources.md'];
export const PLACEHOLDER_PATTERNS = [/Материал будет разработан/i,/^#\s*\d{2}[-\w]+:/im,/^>\s*Материал будет разработан/im];

export function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
export function safeRead(filePath) { return fs.readFileSync(filePath, 'utf8'); }
export function plainText(md) {
  return md.replace(/```[\s\S]*?```/g,' ').replace(/`([^`]+)`/g,'$1').replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/\[[^\]]+\]\(([^)]+)\)/g,'$1').replace(/[>#*_~]/g,' ').replace(/\s+/g,' ').trim();
}
export function isSubstantiveMarkdown(content) {
  const trimmed = content.trim();
  if (!trimmed) return false;
  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed)) && trimmed.length < 220) return false;
  return trimmed.length >= 120;
}
export function getModuleAssessmentPaths(moduleNumber) {
  const num = String(moduleNumber).padStart(2, '0');
  return {
    answerKeyPath: path.join(ANSWER_KEYS_DIR, `module-${num}-answer-key.md`),
    rubricPath: path.join(RUBRICS_DIR, `module-${num}-rubric.md`),
  };
}
export function collectMarkdownLinks(filePath, content) {
  const links = [];
  const regex = /\[[^\]]+\]\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(content))) {
    const raw = match[1];
    if (/^(https?:|mailto:|tel:|#)/.test(raw)) continue;
    links.push({ raw, resolved: path.resolve(path.dirname(filePath), raw.split('#')[0]) });
  }
  return links;
}
export function parseModuleReadme(moduleDir) {
  const content = safeRead(path.join(moduleDir, 'README.md'));
  const title = content.match(/^#\s+(.+)$/m)?.[1]?.replace(/^Модуль\s+\d+\.\s*/, '').trim() ?? path.basename(moduleDir);
  const estimatedHours = Number(content.match(/(\d+)\s*час/)?.[1] ?? 0) || null;
  const estimatedWeeks = Number(content.match(/(\d+)\s*нед/)?.[1] ?? 0) || null;
  const durationLabel = content.match(/\*\*Продолжительность:\*\*\s*([^·\n]+)/)?.[1]?.trim() ?? null;
  return { title, estimatedHours, estimatedWeeks, durationLabel, readmeContent: content };
}
export function parseCurriculumMeta() {
  const curriculum = safeRead(path.join(ROOT, 'CURRICULUM.md'));
  const map = new Map();
  const regex = /\*\*Модуль:\*\*\s*\[(.+?)\]\(modules\/(\d{2}-[^/]+)\/README\.md\)\s*·\s*\*\*Уровень:\*\*\s*(\d+)\s*·\s*\*\*Нагрузка:\*\*\s*(\d+)\s*ч\./g;
  let match;
  while ((match = regex.exec(curriculum))) {
    const [, title, slug, level, hours] = match;
    const current = map.get(slug) ?? { title, level: Number(level), hours: [], weeks: 0 };
    current.title = title;
    current.level = Number(level);
    current.hours.push(Number(hours));
    current.weeks += 1;
    map.set(slug, current);
  }
  return map;
}
export function scanModuleDirectory(moduleDir) {
  const foundFiles = [];
  const substantiveFiles = [];
  const linkResults = [];
  for (const file of REQUIRED_MODULE_FILES) {
    const full = path.join(moduleDir, file);
    if (!fs.existsSync(full)) continue;
    foundFiles.push(file);
    const content = safeRead(full);
    if (isSubstantiveMarkdown(content)) substantiveFiles.push(file);
    for (const link of collectMarkdownLinks(full, content)) {
      linkResults.push({ file: path.relative(ROOT, full), target: link.raw, exists: fs.existsSync(link.resolved) });
    }
  }
  return { foundFiles, substantiveFiles, linkResults };
}
export function computeDevelopmentStatus(scan, hasAnswerKey, hasRubric) {
  if (scan.substantiveFiles.length === 0) return 'not_started';
  if (scan.substantiveFiles.length < REQUIRED_MODULE_FILES.length) return 'in_progress';
  if (!hasAnswerKey || !hasRubric) return 'content_ready';
  return 'ready_for_review';
}
export function getLastModifiedISO(filePaths) {
  const latest = filePaths.filter((p) => fs.existsSync(p)).map((p) => fs.statSync(p).mtimeMs).sort((a,b) => b-a)[0];
  return latest ? new Date(latest).toISOString() : null;
}
export function readTasks() {
  return safeRead(path.join(ROOT, 'TASKS.md')).split('\n').map((line) => line.trim()).filter((line) => /^- \[ \]/.test(line)).map((line) => line.replace(/^- \[ \]\s*/, ''));
}
export function inferNextTask(tasks, moduleNumber) {
  const token = `модуль ${String(moduleNumber).padStart(2,'0')}`;
  return tasks.find((task) => task.toLowerCase().includes(token)) ?? tasks[0] ?? null;
}
export function getTrackedFiles() {
  try { return execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean); }
  catch { return []; }
}
