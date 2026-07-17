import { describe, expect, it } from 'vitest';
import manifestData from '../data/course-manifest.json';
import type { CourseManifest } from '../types';

const manifest = manifestData as CourseManifest;

describe('course manifest', () => {
  it('detects 14 modules', () => {
    expect(manifest.totalModules).toBe(14);
  });

  it('marks module 02 as developed', () => {
    const module = manifest.modules.find((item) => item.slug === '02-managerial-economics');
    expect(module?.readinessPercent).toBeGreaterThan(0);
  });

  it('does not leak answer key content', () => {
    expect(JSON.stringify(manifest)).not.toContain('answer_keys');
  });
});
