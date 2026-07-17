import type { CourseManifest, LearnerProgressData, ModuleManifest } from '../types';
import { ensureModuleProgress } from './progress';

export function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function completedModulesCount(manifest: CourseManifest, progress: LearnerProgressData): number {
  return manifest.modules.filter((module) => ensureModuleProgress(progress, module).status === 'completed').length;
}

export function currentModule(manifest: CourseManifest, progress: LearnerProgressData): ModuleManifest | null {
  return manifest.modules.find((module, index) => {
    const moduleProgress = ensureModuleProgress(progress, module);
    if (moduleProgress.status === 'completed') return false;
    return index === 0 || ensureModuleProgress(progress, manifest.modules[index - 1]).status === 'completed' || progress.settings.freeOrderEnabled;
  }) ?? null;
}

export function overdueReviews(manifest: CourseManifest, progress: LearnerProgressData): Array<{ module: ModuleManifest; label: string; date: string }> {
  const now = new Date();
  const items: Array<{ module: ModuleManifest; label: string; date: string }> = [];
  for (const module of manifest.modules) {
    const moduleProgress = ensureModuleProgress(progress, module);
    for (const [label, date] of [['7 дней', moduleProgress.review7Days], ['30 дней', moduleProgress.review30Days], ['90 дней', moduleProgress.review90Days]] as const) {
      if (date && new Date(date) < now) items.push({ module, label, date });
    }
  }
  return items;
}

export function nearestReview(manifest: CourseManifest, progress: LearnerProgressData): { module: ModuleManifest; label: string; date: string } | null {
  const all: Array<{ module: ModuleManifest; label: string; date: string }> = [];
  for (const module of manifest.modules) {
    const moduleProgress = ensureModuleProgress(progress, module);
    for (const [label, date] of [['7 дней', moduleProgress.review7Days], ['30 дней', moduleProgress.review30Days], ['90 дней', moduleProgress.review90Days]] as const) {
      if (date) all.push({ module, label, date });
    }
  }
  return all.sort((a, b) => +new Date(a.date) - +new Date(b.date))[0] ?? null;
}

export function competencySummary(manifest: CourseManifest, progress: LearnerProgressData) {
  const map: Record<string, string[]> = {
    'Стратегия': ['01-management-foundations', '07-strategy', '14-capstone'],
    'Финансы': ['03-accounting', '04-corporate-finance'],
    'Экономика': ['02-managerial-economics'],
    'Маркетинг': ['05-marketing-and-sales'],
    'Продажи': ['05-marketing-and-sales'],
    'Операции': ['06-operations'],
    'Проекты': ['09-project-management'],
    'Продукты': ['10-product-and-innovation'],
    'Аналитика': ['11-business-analytics', '02-managerial-economics'],
    'Лидерство': ['08-leadership-and-people'],
    'Предпринимательство': ['12-entrepreneurship'],
    'Право и governance': ['13-law-ethics-governance'],
  };

  return Object.entries(map).map(([name, slugs]) => {
    const related = manifest.modules.filter((module) => slugs.includes(module.slug));
    const scores = related.map((module) => {
      const p = ensureModuleProgress(progress, module);
      const avg = average([p.quizScore, p.practicalScore].filter((value): value is number => value !== null)) ?? 0;
      return avg;
    });
    const avgScore = average(scores) ?? 0;
    return {
      name,
      related,
      completed: related.filter((module) => ensureModuleProgress(progress, module).status === 'completed').length,
      level: avgScore >= 85 ? 4 : avgScore >= 75 ? 3 : avgScore >= 60 ? 2 : avgScore > 0 ? 1 : 0,
      problemAreas: related.filter((module) => {
        const p = ensureModuleProgress(progress, module);
        return (p.quizScore ?? 100) < 70 || (p.practicalScore ?? 100) < 65;
      }).map((module) => module.title),
    };
  });
}
