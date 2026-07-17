const sample = {
  schemaVersion: 2,
  settings: {
    weeklyLoadHours: 8.5,
    freeOrderEnabled: false,
    theme: 'system',
  },
  modules: {
    '01-management-foundations': {
      status: 'studying',
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
      caseDraft: {
        situation: '',
        calculations: '',
        assumptions: '',
        recommendation: '',
        updatedAt: null,
      },
      practicalDraft: {
        artifacts: [],
        fileReferences: [],
        finalSummary: '',
        selfAssessment: '',
        updatedAt: null,
      },
      quizAttempts: [],
      reflectionAnswers: {
        keyInsights: '',
        usefulTakeaways: '',
        unclearTopics: '',
        workApplication: '',
        changedDecision: '',
        reviewTopics: '',
        applicationPlan: '',
        updatedAt: null,
      },
    },
  },
};
const module = sample.modules['01-management-foundations'];
if (sample.schemaVersion !== 2) throw new Error('schemaVersion must be 2');
if (module.quizScore !== null && (module.quizScore < 0 || module.quizScore > 100)) throw new Error('quizScore out of range');
if (module.practicalScore !== null && (module.practicalScore < 0 || module.practicalScore > 100)) throw new Error('practicalScore out of range');
if (!Array.isArray(module.notes) || !Array.isArray(module.bookmarks) || !Array.isArray(module.quizAttempts)) throw new Error('Extended arrays missing');
console.log('Progress schema validated.');
