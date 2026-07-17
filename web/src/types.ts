export type DevelopmentStatus = 'not_started' | 'in_progress' | 'content_ready' | 'ready_for_review' | 'verified';
export type LearnerStatus = 'not_started' | 'studying' | 'theory_done' | 'case_done' | 'practical_done' | 'quiz_passed' | 'completed' | 'review_required';
export type ThemeMode = 'light' | 'dark' | 'system';
export type LearningUnitType = 'overview' | 'theory' | 'examples' | 'case' | 'practical' | 'quiz' | 'reflection' | 'resources';
export type LearningUnitStatus = 'not_started' | 'in_progress' | 'completed' | 'action_required' | 'awaiting_review' | 'ready_for_review';

export interface LearningUnit {
  id: string;
  sourceFile: string;
  type: LearningUnitType;
  title: string;
  order: number;
  estimatedMinutes: number;
  available: boolean;
  heading: string | null;
  headingLevel: number | null;
  summary: string;
}

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
  learningUnits: LearningUnit[];
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

export interface LessonNote {
  id: string;
  unitId: string;
  heading: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface SelfCheckAnswer {
  id: string;
  question: string;
  answer: string;
  flaggedForReview: boolean;
  updatedAt: string;
}

export interface CaseDraft {
  situation: string;
  calculations: string;
  assumptions: string;
  recommendation: string;
  checklist: string[];
  updatedAt: string | null;
}

export interface PracticalDraft {
  artifacts: string[];
  checklist: string[];
  finalSummary: string;
  selfAssessment: string;
  fileReferences: string[];
  updatedAt: string | null;
}

export interface QuizQuestionResponse {
  questionId: string;
  prompt: string;
  type: 'single_choice' | 'open';
  answer: string;
  flagged: boolean;
}

export interface QuizAttempt {
  id: string;
  startedAt: string;
  submittedAt: string | null;
  responses: QuizQuestionResponse[];
}

export interface ReflectionAnswers {
  keyInsights: string;
  usefulTakeaways: string;
  unclearTopics: string;
  workApplication: string;
  changedDecision: string;
  reviewTopics: string;
  applicationPlan: string;
  updatedAt: string | null;
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
  notesLegacy: string;
  review7Days: string | null;
  review30Days: string | null;
  review90Days: string | null;
  reviewHistory: ReviewEvent[];
  lastUnitId: string | null;
  lastVisitedAt: string | null;
  readingPositions: Record<string, number>;
  unitStatuses: Record<string, LearningUnitStatus>;
  notes: LessonNote[];
  bookmarks: string[];
  selfCheckAnswers: Record<string, SelfCheckAnswer>;
  caseDraft: CaseDraft;
  practicalDraft: PracticalDraft;
  quizAttempts: QuizAttempt[];
  reflectionAnswers: ReflectionAnswers;
}

export interface LearnerSettings {
  weeklyLoadHours: number;
  freeOrderEnabled: boolean;
  theme: ThemeMode;
}

export interface LearnerProgressData {
  schemaVersion: 2;
  settings: LearnerSettings;
  modules: Record<string, LearnerModuleProgress>;
}
