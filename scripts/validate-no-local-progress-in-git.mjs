import { getTrackedFiles } from './lib/course-utils.mjs';

const forbidden = [/progress-export.*\.json$/i, /learner-progress/i, /user-progress/i];
const failures = getTrackedFiles().filter((rel) => forbidden.some((pattern) => pattern.test(rel)));
if (failures.length) throw new Error(`Local progress artifacts tracked in git:\n${failures.join('\n')}`);
console.log('No local progress artifacts tracked.');
