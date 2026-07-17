const sample = {
  schemaVersion: 1,
  settings: {
    weeklyLoadHours: 8.5,
    freeOrderEnabled: false,
    theme: 'system',
  },
  modules: {
    '01-management-foundations': {
      status: 'in_progress',
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
    },
  },
};
const module = sample.modules['01-management-foundations'];
if (sample.schemaVersion !== 1) throw new Error('schemaVersion must be 1');
if (module.quizScore !== null && (module.quizScore < 0 || module.quizScore > 100)) throw new Error('quizScore out of range');
if (module.practicalScore !== null && (module.practicalScore < 0 || module.practicalScore > 100)) throw new Error('practicalScore out of range');
console.log('Progress schema validated.');
