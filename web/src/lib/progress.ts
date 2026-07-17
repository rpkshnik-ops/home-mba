import type {
  CaseDraft,
  CourseManifest,
  LearnerModuleProgress,
  LearnerProgressData,
  LearnerStatus,
  LessonNote,
  ModuleManifest,
  PracticalDraft,
  QuizAttempt,
  ReflectionAnswers,
  ThemeMode,
} from '../types';

export const STORAGE_KEY = 'home-mba-progress';
export const SCHEMA_VERSION = 2;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function plusDays(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

export function clampScore(value: number | null): number | null {
  if (value === null || Number.isNaN(value)) return null;
  if (value < 0 || value > 100) throw new Error('Оценка должна быть в диапазоне 0–100');
  return Math.round(value);
}

export function emptyCaseDraft(): CaseDraft {
  return { situation: '', calculations: '', assumptions: '', recommendation: '', checklist: [], updatedAt: null };
}

export function emptyPracticalDraft(): PracticalDraft {
  return { artifacts: [], checklist: [], finalSummary: '', selfAssessment: '', fileReferences: [], updatedAt: null };
}

export function emptyReflectionAnswers(): ReflectionAnswers {
  return {
    keyInsights: '',
    usefulTakeaways: '',
    unclearTopics: '',
    workApplication: '',
    changedDecision: '',
    reviewTopics: '',
    applicationPlan: '',
    updatedAt: null,
  };
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
    notesLegacy: '',
    review7Days: null,
    review30Days: null,
    review90Days: null,
    reviewHistory: [],
    lastUnitId: null,
    lastVisitedAt: null,
    readingPositions: {},
    unitStatuses: {},
    notes: [],
    bookmarks: [],
    selfCheckAnswers: {},
    caseDraft: emptyCaseDraft(),
    practicalDraft: emptyPracticalDraft(),
    quizAttempts: [],
    reflectionAnswers: emptyReflectionAnswers(),
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
  if (module.startedAt || module.hoursSpent > 0 || module.notesLegacy || module.lastUnitId || module.notes.length) return 'studying';
  return 'not_started';
}

export function normalizeModuleProgress(module: LearnerModuleProgress): LearnerModuleProgress {
  const next = {
    ...emptyModuleProgress(),
    ...module,
    quizScore: clampScore(module.quizScore ?? null),
    practicalScore: clampScore(module.practicalScore ?? null),
    notes: Array.isArray(module.notes) ? module.notes : [],
    bookmarks: Array.isArray(module.bookmarks) ? Array.from(new Set(module.bookmarks.filter(Boolean))) : [],
    readingPositions: typeof module.readingPositions === 'object' && module.readingPositions ? module.readingPositions : {},
    unitStatuses: typeof module.unitStatuses === 'object' && module.unitStatuses ? module.unitStatuses : {},
    selfCheckAnswers: typeof module.selfCheckAnswers === 'object' && module.selfCheckAnswers ? module.selfCheckAnswers : {},
    reviewHistory: Array.isArray(module.reviewHistory) ? module.reviewHistory : [],
    caseDraft: { ...emptyCaseDraft(), ...(module.caseDraft ?? {}) },
    practicalDraft: { ...emptyPracticalDraft(), ...(module.practicalDraft ?? {}) },
    reflectionAnswers: { ...emptyReflectionAnswers(), ...(module.reflectionAnswers ?? {}) },
    quizAttempts: Array.isArray(module.quizAttempts) ? module.quizAttempts : [],
  } satisfies LearnerModuleProgress;

  next.status = deriveLearnerStatus(next);
  if (next.status === 'completed') {
    next.completedAt = next.completedAt ?? todayIso();
    next.review7Days = next.review7Days ?? plusDays(7);
    next.review30Days = next.review30Days ?? plusDays(30);
    next.review90Days = next.review90Days ?? plusDays(90);
  }
  return next;
}

export function createInitialProgress(manifest: CourseManifest): LearnerProgressData {
  return {
    schemaVersion: 2,
    settings: { weeklyLoadHours: 8.5, freeOrderEnabled: false, theme: 'system' },
    modules: Object.fromEntries(manifest.modules.map((module) => [module.slug, emptyModuleProgress()])),
  };
}

export function migrateProgressData(value: unknown, manifest: CourseManifest): LearnerProgressData {
  if (!value || typeof value !== 'object') throw new Error('Импортируемый JSON имеет неверный формат');
  const raw = value as Record<string, unknown>;
  const base = createInitialProgress(manifest);
  const settingsRaw = (raw.settings as Record<string, unknown> | undefined) ?? {};
  base.settings = {
    weeklyLoadHours: typeof settingsRaw.weeklyLoadHours === 'number' ? settingsRaw.weeklyLoadHours : 8.5,
    freeOrderEnabled: Boolean(settingsRaw.freeOrderEnabled),
    theme: (['light', 'dark', 'system'].includes(String(settingsRaw.theme)) ? settingsRaw.theme : 'system') as ThemeMode,
  };

  const incomingModules = (raw.modules as Record<string, unknown> | undefined) ?? {};

  for (const manifestModule of manifest.modules) {
    const entry = incomingModules[manifestModule.slug];
    if (!entry || typeof entry !== 'object') continue;
    const legacy = entry as Record<string, unknown>;
    const migrated: LearnerModuleProgress = {
      ...emptyModuleProgress(),
      startedAt: typeof legacy.startedAt === 'string' ? legacy.startedAt : null,
      completedAt: typeof legacy.completedAt === 'string' ? legacy.completedAt : null,
      theoryCompleted: Boolean(legacy.theoryCompleted),
      examplesCompleted: Boolean(legacy.examplesCompleted),
      caseCompleted: Boolean(legacy.caseCompleted),
      practicalAssignmentCompleted: Boolean(legacy.practicalAssignmentCompleted),
      quizCompleted: Boolean(legacy.quizCompleted),
      reflectionCompleted: Boolean(legacy.reflectionCompleted),
      quizScore: clampScore(typeof legacy.quizScore === 'number' ? legacy.quizScore : null),
      practicalScore: clampScore(typeof legacy.practicalScore === 'number' ? legacy.practicalScore : null),
      hoursSpent: typeof legacy.hoursSpent === 'number' ? legacy.hoursSpent : 0,
      difficulty: typeof legacy.difficulty === 'number' ? legacy.difficulty : null,
      notesLegacy: typeof legacy.notesLegacy === 'string' ? legacy.notesLegacy : typeof legacy.notes === 'string' ? legacy.notes : '',
      review7Days: typeof legacy.review7Days === 'string' ? legacy.review7Days : null,
      review30Days: typeof legacy.review30Days === 'string' ? legacy.review30Days : null,
      review90Days: typeof legacy.review90Days === 'string' ? legacy.review90Days : null,
      reviewHistory: Array.isArray(legacy.reviewHistory) ? (legacy.reviewHistory as LearnerModuleProgress['reviewHistory']) : [],
      lastUnitId: typeof legacy.lastUnitId === 'string' ? legacy.lastUnitId : null,
      lastVisitedAt: typeof legacy.lastVisitedAt === 'string' ? legacy.lastVisitedAt : null,
      readingPositions: typeof legacy.readingPositions === 'object' && legacy.readingPositions ? legacy.readingPositions as Record<string, number> : {},
      unitStatuses: typeof legacy.unitStatuses === 'object' && legacy.unitStatuses ? legacy.unitStatuses as LearnerModuleProgress['unitStatuses'] : {},
      notes: Array.isArray(legacy.notes) ? legacy.notes as LessonNote[] : [],
      bookmarks: Array.isArray(legacy.bookmarks) ? legacy.bookmarks.filter((item): item is string => typeof item === 'string') : [],
      selfCheckAnswers: typeof legacy.selfCheckAnswers === 'object' && legacy.selfCheckAnswers ? legacy.selfCheckAnswers as LearnerModuleProgress['selfCheckAnswers'] : {},
      caseDraft: { ...emptyCaseDraft(), ...(typeof legacy.caseDraft === 'object' && legacy.caseDraft ? legacy.caseDraft as CaseDraft : {}) },
      practicalDraft: { ...emptyPracticalDraft(), ...(typeof legacy.practicalDraft === 'object' && legacy.practicalDraft ? legacy.practicalDraft as PracticalDraft : {}) },
      quizAttempts: Array.isArray(legacy.quizAttempts) ? legacy.quizAttempts as QuizAttempt[] : [],
      reflectionAnswers: { ...emptyReflectionAnswers(), ...(typeof legacy.reflectionAnswers === 'object' && legacy.reflectionAnswers ? legacy.reflectionAnswers as ReflectionAnswers : {}) },
      status: 'not_started',
    };
    base.modules[manifestModule.slug] = normalizeModuleProgress(migrated);
  }

  return base;
}

export function validateImportedProgress(value: unknown, manifest: CourseManifest): LearnerProgressData {
  const raw = value as { schemaVersion?: number };
  if (raw?.schemaVersion !== 1 && raw?.schemaVersion !== 2) throw new Error('Неподдерживаемая версия схемы');
  return migrateProgressData(value, manifest);
}

export function ensureModuleProgress(data: LearnerProgressData, module: ModuleManifest): LearnerModuleProgress {
  return data.modules[module.slug] ?? emptyModuleProgress();
}

export function updateModuleProgress(
  data: LearnerProgressData,
  slug: string,
  updater: (prev: LearnerModuleProgress) => LearnerModuleProgress,
): LearnerProgressData {
  const next = structuredClone(data);
  next.modules[slug] = normalizeModuleProgress(updater(next.modules[slug] ?? emptyModuleProgress()));
  return next;
}

export function saveUnitReadingPosition(data: LearnerProgressData, slug: string, unitId: string, scrollTop: number): LearnerProgressData {
  return updateModuleProgress(data, slug, (prev) => ({
    ...prev,
    startedAt: prev.startedAt ?? todayIso(),
    lastUnitId: unitId,
    lastVisitedAt: new Date().toISOString(),
    readingPositions: { ...prev.readingPositions, [unitId]: Math.max(0, Math.round(scrollTop)) },
    unitStatuses: prev.unitStatuses[unitId] ? prev.unitStatuses : { ...prev.unitStatuses, [unitId]: 'in_progress' },
  }));
}

export function markUnitCompleted(data: LearnerProgressData, slug: string, unitId: string, field?: keyof Pick<LearnerModuleProgress, 'theoryCompleted' | 'examplesCompleted' | 'caseCompleted' | 'practicalAssignmentCompleted' | 'quizCompleted' | 'reflectionCompleted'>): LearnerProgressData {
  return updateModuleProgress(data, slug, (prev) => ({
    ...prev,
    startedAt: prev.startedAt ?? todayIso(),
    ...(field ? { [field]: true } : {}),
    unitStatuses: { ...prev.unitStatuses, [unitId]: 'completed' },
    lastUnitId: unitId,
    lastVisitedAt: new Date().toISOString(),
  }));
}

export function upsertNote(data: LearnerProgressData, slug: string, note: LessonNote): LearnerProgressData {
  return updateModuleProgress(data, slug, (prev) => {
    const existing = prev.notes.find((item) => item.id === note.id);
    const notes = existing
      ? prev.notes.map((item) => item.id === note.id ? { ...item, ...note, updatedAt: new Date().toISOString() } : item)
      : [...prev.notes, note];
    return { ...prev, notes };
  });
}

export function deleteNote(data: LearnerProgressData, slug: string, noteId: string): LearnerProgressData {
  return updateModuleProgress(data, slug, (prev) => ({ ...prev, notes: prev.notes.filter((note) => note.id !== noteId) }));
}

export function toggleBookmark(data: LearnerProgressData, slug: string, unitId: string): LearnerProgressData {
  return updateModuleProgress(data, slug, (prev) => ({
    ...prev,
    bookmarks: prev.bookmarks.includes(unitId) ? prev.bookmarks.filter((id) => id !== unitId) : [...prev.bookmarks, unitId],
  }));
}

export function findResumeTarget(module: ModuleManifest, progress: LearnerProgressData) {
  const learner = ensureModuleProgress(progress, module);
  const firstIncomplete = module.learningUnits.find((unit) => learner.unitStatuses[unit.id] !== 'completed' && unit.available);
  const fallback = module.learningUnits.find((unit) => unit.available);
  const canResumeLastUnit = learner.lastUnitId
    && module.learningUnits.some((unit) => unit.id === learner.lastUnitId)
    && learner.unitStatuses[learner.lastUnitId] !== 'completed';
  const targetUnitId = canResumeLastUnit
    ? learner.lastUnitId
    : firstIncomplete?.id ?? fallback?.id ?? null;
  if (!targetUnitId) return null;
  return { unitId: targetUnitId, savedPosition: learner.readingPositions[targetUnitId] ?? null };
}

export function exportProgress(data: LearnerProgressData): string {
  return JSON.stringify(data, null, 2);
}

export function computeWeakTopics(manifest: CourseManifest, progress: LearnerProgressData): string[] {
  return manifest.modules
    .map((module) => ({ module, progress: ensureModuleProgress(progress, module) }))
    .filter(({ progress }) => (progress.quizScore ?? 100) < 70 || (progress.practicalScore ?? 100) < 65)
    .map(({ module }) => module.title)
    .slice(0, 5);
}
