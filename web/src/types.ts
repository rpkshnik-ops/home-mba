export type DevelopmentStatus = 'not_started' | 'in_progress' | 'content_ready' | 'ready_for_review' | 'verified';
export type LearnerStatus = 'not_started' | 'studying' | 'theory_done' | 'case_done' | 'practical_done' | 'quiz_passed' | 'completed' | 'review_required';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface ModuleManifest {
  moduleNumber: number;
  slug: string;
  title: string;
  level: number | null;
  expectedDuration: string | null;
  expectedWeeks: number | null;
  expectedHours: number | null;
  requiredFiles: string[];
  foundFiles: string[];
  substantiveFiles: string[];
  hasAnswerKey: boolean;
  hasRubric: boolean;
  resourcesCount: number;
  developmentStatus: DevelopmentStatus;
  readinessPercent: number;
  lastModifiedAt: string | null;
  linkCheck: { passed: boolean; checkedLinks: number; brokenLinks: Array<{ file: string; target: string; exists: boolean }> };
  structureCheck: { passed: boolean; missingFiles: string[] };
  hasIncompleteTasks: boolean;
  nextRecommendedTask: string | null;
  summary: string;
  materials: Record<string, string>;
}

export interface CourseManifest {
  schemaVersion: number;
  generatedAt: string;
  totalModules: number;
  developedModules: number;
  verifiedModules: number;
  modules: ModuleManifest[];
}

export interface ReviewEvent {
  date: string;
  kind: '7d' | '30d' | '90d' | 'custom';
}

export interface LearnerModuleProgress {
  status: LearnerStatus;
  startedAt: string | null;
  completedAt: string | null;
  theoryCompleted: boolean;
  examplesCompleted: boolean;
  caseCompleted: boolean;
  practicalAssignmentCompleted: boolean;
  quizCompleted: boolean;
  reflectionCompleted: boolean;
  quizScore: number | null;
  practicalScore: number | null;
  hoursSpent: number;
  difficulty: number | null;
  notes: string;
  review7Days: string | null;
  review30Days: string | null;
  review90Days: string | null;
  reviewHistory: ReviewEvent[];
}

export interface LearnerSettings {
  weeklyLoadHours: number;
  freeOrderEnabled: boolean;
  theme: ThemeMode;
}

export interface LearnerProgressData {
  schemaVersion: 1;
  settings: LearnerSettings;
  modules: Record<string, LearnerModuleProgress>;
}
