import type { CourseManifest, LearnerModuleProgress, LearnerProgressData, LearnerStatus, ModuleManifest, ThemeMode } from '../types';

export const STORAGE_KEY = 'home-mba-progress';
export const SCHEMA_VERSION = 1;

export function clampScore(value: number | null): number | null {
  if (value === null || Number.isNaN(value)) return null;
  if (value < 0 || value > 100) throw new Error('Оценка должна быть в диапазоне 0–100');
  return Math.round(value);
}

export function emptyModuleProgress(): LearnerModuleProgress {
  return {
    status: 'not_started',
    startedAt: null,
    completedAt: null,
    theoryCompleted: false,
    examplesCompleted: false,
    caseCompleted: false,
    practicalAssignmentCompleted: false,
    quizCompleted: false,
    reflectionCompleted: false,
    quizScore: null,
    practicalScore: null,
    hoursSpent: 0,
    difficulty: null,
    notes: '',
    review7Days: null,
    review30Days: null,
    review90Days: null,
    reviewHistory: [],
  };
}

export function deriveLearnerStatus(module: LearnerModuleProgress): LearnerStatus {
  const scoreCount = [module.quizScore, module.practicalScore].filter((value) => value !== null).length;
  const avg = scoreCount ? ((module.quizScore ?? 0) + (module.practicalScore ?? 0)) / scoreCount : 0;
  const coreDone = module.theoryCompleted && module.examplesCompleted && module.caseCompleted && module.practicalAssignmentCompleted && module.quizCompleted && module.reflectionCompleted;
  const overdueReview = [module.review7Days, module.review30Days, module.review90Days].some((date) => date && new Date(date) < new Date());
  if (overdueReview) return 'review_required';
  if (coreDone && (module.practicalScore ?? 0) >= 65 && avg >= 70) return 'completed';
  if ((module.quizScore ?? 0) >= 70 && module.quizCompleted) return 'quiz_passed';
  if (module.practicalAssignmentCompleted) return 'practical_done';
  if (module.caseCompleted) return 'case_done';
  if (module.theoryCompleted) return 'theory_done';
  if (module.startedAt || module.hoursSpent > 0 || module.notes) return 'studying';
  return 'not_started';
}

export function createInitialProgress(manifest: CourseManifest): LearnerProgressData {
  return {
    schemaVersion: 1,
    settings: { weeklyLoadHours: 8.5, freeOrderEnabled: false, theme: 'system' },
    modules: Object.fromEntries(manifest.modules.map((module) => [module.slug, emptyModuleProgress()])),
  };
}

export function validateImportedProgress(value: unknown, manifest: CourseManifest): LearnerProgressData {
  if (!value || typeof value !== 'object') throw new Error('Импортируемый JSON имеет неверный формат');
  const data = value as Partial<LearnerProgressData>;
  if (data.schemaVersion !== SCHEMA_VERSION) throw new Error('Неподдерживаемая версия схемы');
  const safe = createInitialProgress(manifest);
  const incomingModules = data.modules ?? {};
  for (const module of manifest.modules) {
    const entry = incomingModules[module.slug];
    if (!entry || typeof entry !== 'object') continue;
    safe.modules[module.slug] = {
      ...emptyModuleProgress(),
      ...entry,
      quizScore: clampScore((entry as LearnerModuleProgress).quizScore ?? null),
      practicalScore: clampScore((entry as LearnerModuleProgress).practicalScore ?? null),
      status: deriveLearnerStatus({ ...emptyModuleProgress(), ...(entry as LearnerModuleProgress) }),
    };
  }
  safe.settings = {
    weeklyLoadHours: typeof data.settings?.weeklyLoadHours === 'number' ? data.settings.weeklyLoadHours : 8.5,
    freeOrderEnabled: Boolean(data.settings?.freeOrderEnabled),
    theme: (['light', 'dark', 'system'].includes(String(data.settings?.theme)) ? data.settings?.theme : 'system') as ThemeMode,
  };
  return safe;
}

export function ensureModuleProgress(data: LearnerProgressData, module: ModuleManifest): LearnerModuleProgress {
  return data.modules[module.slug] ?? emptyModuleProgress();
}

export function computeWeakTopics(manifest: CourseManifest, progress: LearnerProgressData): string[] {
  return manifest.modules
    .map((module) => ({ module, progress: ensureModuleProgress(progress, module) }))
    .filter(({ progress }) => (progress.quizScore ?? 100) < 70 || (progress.practicalScore ?? 100) < 65)
    .map(({ module }) => module.title)
    .slice(0, 5);
}
