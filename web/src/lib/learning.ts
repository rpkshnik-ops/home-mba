import type { LearningUnit, LearningUnitType, ModuleManifest, QuizQuestionResponse } from '../types';

const transliterationMap: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export const UNIT_TYPE_LABELS: Record<LearningUnitType, string> = {
  overview: 'Обзор модуля',
  theory: 'Теория',
  examples: 'Разбор примеров',
  case: 'Бизнес-кейс',
  practical: 'Практическое задание',
  quiz: 'Итоговый тест',
  reflection: 'Рефлексия',
  resources: 'Дополнительные ресурсы',
};

export function slugifyRu(value: string): string {
  return value
    .toLowerCase()
    .split('')
    .map((char) => transliterationMap[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function sectionHeadingTitle(raw: string): string {
  return raw.replace(/^#+\s*/, '').replace(/^\d+[.)]?\s*/, '').trim();
}

export function sectionSummary(markdown: string): string {
  return markdown
    .replace(/^#+.*$/gm, ' ')
    .replace(/`{3}[\s\S]*?`{3}/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[[^\]]+\]\([^)]*\)/g, ' ')
    .replace(/[>*_~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

export function estimateMinutes(markdown: string): number {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(5, Math.round(words / 180 * 60 / 10) * 10 || 5);
}

export function extractHeadingSections(markdown: string, minLevel = 2) {
  const lines = markdown.split('\n');
  const sections: Array<{ heading: string; headingLevel: number; content: string }> = [];
  let current: { heading: string; headingLevel: number; lines: string[] } | null = null;

  for (const line of lines) {
    const match = line.match(/^(#{2,3})\s+(.+)$/);
    if (match && match[1].length <= 3 && match[1].length >= minLevel) {
      if (current !== null) {
        sections.push({ heading: current.heading, headingLevel: current.headingLevel, content: current.lines.join('\n').trim() });
      }
      current = { heading: sectionHeadingTitle(match[2]), headingLevel: match[1].length, lines: [line] };
      continue;
    }
    if (current !== null) current.lines.push(line);
  }

  if (current !== null) {
    sections.push({ heading: current!.heading, headingLevel: current!.headingLevel, content: current!.lines.join('\n').trim() });
  }
  return sections.filter((section) => section.content.trim());
}

export function extractUnitMarkdown(markdown: string, unit: LearningUnit): string {
  if (!unit.heading) return markdown;
  const lines = markdown.split('\n');
  const startIndex = lines.findIndex((line) => new RegExp(`^#{${unit.headingLevel ?? 2},3}\\s+`).test(line) && sectionHeadingTitle(line) === unit.heading);
  if (startIndex < 0) return markdown;
  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const match = lines[i].match(/^(#{2,3})\s+(.+)$/);
    if (match && match[1].length <= (unit.headingLevel ?? 2)) {
      endIndex = i;
      break;
    }
  }
  return lines.slice(startIndex, endIndex).join('\n').trim();
}

export function buildUnitId(type: LearningUnitType, title: string) {
  return `${type}-${slugifyRu(title)}`;
}

export function unitFieldForType(type: LearningUnitType) {
  if (type === 'theory') return 'theoryCompleted';
  if (type === 'examples') return 'examplesCompleted';
  if (type === 'case') return 'caseCompleted';
  if (type === 'practical') return 'practicalAssignmentCompleted';
  if (type === 'quiz') return 'quizCompleted';
  if (type === 'reflection') return 'reflectionCompleted';
  return undefined;
}

export function parseQuizQuestions(markdown: string): QuizQuestionResponse[] {
  const lines = markdown.split('\n').map((line) => line.trim()).filter(Boolean);
  const questions: QuizQuestionResponse[] = [];
  for (const line of lines) {
    const q = line.match(/^(\d+)\.\s+(.+)$/);
    if (!q) continue;
    const [, num, rest] = q;
    const options = rest.match(/\bA\)/);
    questions.push({
      questionId: `q${num}`,
      prompt: rest,
      type: options ? 'single_choice' : 'open',
      answer: '',
      flagged: false,
    });
  }
  return questions;
}

export function completionPercent(module: ModuleManifest, unitStatuses: Record<string, string>) {
  const availableUnits = module.learningUnits.filter((unit) => unit.available);
  if (!availableUnits.length) return 0;
  const completed = availableUnits.filter((unit) => unitStatuses[unit.id] === 'completed').length;
  return Math.round((completed / availableUnits.length) * 100);
}

export function nextUnit(module: ModuleManifest, currentUnitId: string) {
  const currentIndex = module.learningUnits.findIndex((unit) => unit.id === currentUnitId);
  return currentIndex >= 0 ? module.learningUnits[currentIndex + 1] ?? null : null;
}

export function previousUnit(module: ModuleManifest, currentUnitId: string) {
  const currentIndex = module.learningUnits.findIndex((unit) => unit.id === currentUnitId);
  return currentIndex > 0 ? module.learningUnits[currentIndex - 1] ?? null : null;
}
