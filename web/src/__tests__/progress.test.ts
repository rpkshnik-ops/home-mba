import { describe, expect, it } from 'vitest';
import type { CourseManifest } from '../types';
import { clampScore, createInitialProgress, deriveLearnerStatus, validateImportedProgress } from '../lib/progress';
import manifestData from '../data/course-manifest.json';

const manifest = manifestData as CourseManifest;

describe('progress helpers', () => {
  it('creates progress for all 14 modules', () => {
    expect(Object.keys(createInitialProgress(manifest).modules)).toHaveLength(14);
  });

  it('rejects scores outside 0..100', () => {
    expect(() => clampScore(-1)).toThrow();
    expect(() => clampScore(101)).toThrow();
  });

  it('does not mark module completed if practical score below 65', () => {
    const entry = {
      ...createInitialProgress(manifest).modules['02-managerial-economics'],
      theoryCompleted: true,
      examplesCompleted: true,
      caseCompleted: true,
      practicalAssignmentCompleted: true,
      quizCompleted: true,
      reflectionCompleted: true,
      quizScore: 90,
      practicalScore: 60,
    };
    expect(deriveLearnerStatus(entry)).not.toBe('completed');
  });

  it('imports valid JSON without losing schema version', () => {
    const initial = createInitialProgress(manifest);
    initial.modules['01-management-foundations'].theoryCompleted = true;
    const imported = validateImportedProgress(JSON.parse(JSON.stringify(initial)), manifest);
    expect(imported.schemaVersion).toBe(1);
    expect(imported.modules['01-management-foundations'].theoryCompleted).toBe(true);
  });
});
