import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import manifestData from '../data/course-manifest.json';
import type { CourseManifest, LearnerProgressData } from '../types';
import { STORAGE_KEY, createInitialProgress, exportProgress, findResumeTarget, migrateProgressData, saveUnitReadingPosition } from '../lib/progress';

const manifest = manifestData as CourseManifest;

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('01-theory.md')) {
    return new Response(`# Теория\n\n## Экономическое мышление руководителя\n\nРеальный текст теории.\n\n## Спрос, предложение и эластичность\n\nЕщё один раздел.`);
  }
  if (url.includes('05-quiz.md')) {
    return new Response(`# Тест\n\n## Выбор ответа\n\n1. Вопрос? A) Да. B) Нет.\n\n## Расчётные и открытые вопросы\n\n2. Объясните выбор.`);
  }
  return new Response('# Материал\n\nТестовый контент.');
});

vi.stubGlobal('fetch', fetchMock);

function seedProgress(): LearnerProgressData {
  const progress = createInitialProgress(manifest);
  progress.modules['02-managerial-economics'].startedAt = '2026-07-17';
  progress.modules['02-managerial-economics'].lastUnitId = 'theory-ekonomicheskoe-myshlenie-rukovoditelya';
  progress.modules['02-managerial-economics'].unitStatuses['overview-obzor-modulya'] = 'completed';
  return progress;
}

describe('learning experience', () => {
  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockClear();
  });

  it('opens learning route and renders real markdown unit', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedProgress()));
    render(
      <MemoryRouter initialEntries={['/learn/02-managerial-economics/theory-ekonomicheskoe-myshlenie-rukovoditelya']}>
        <App />
      </MemoryRouter>,
    );

    await screen.findByText('Реальный текст теории.');
    expect(screen.getByRole('heading', { level: 1, name: 'Экономическое мышление руководителя' })).toBeTruthy();
  });

  it('persists lesson completion and restores resume target', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedProgress()));
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/learn/02-managerial-economics/theory-ekonomicheskoe-myshlenie-rukovoditelya']}>
        <App />
      </MemoryRouter>,
    );

    await screen.findByText('Реальный текст теории.');
    await user.click(screen.getAllByRole('button', { name: /отметить выполненным/i })[0]);

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as LearnerProgressData;
      expect(saved.modules['02-managerial-economics'].unitStatuses['theory-ekonomicheskoe-myshlenie-rukovoditelya']).toBe('completed');
    });

    const target = findResumeTarget(manifest.modules.find((item) => item.slug === '02-managerial-economics')!, JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as LearnerProgressData);
    expect(target?.unitId).toBe('theory-spros-predlozhenie-i-elastichnost');
  });

  it('migrates schema v1 progress without losing prior scores', () => {
    const legacy = {
      schemaVersion: 1,
      settings: { weeklyLoadHours: 7, freeOrderEnabled: true, theme: 'dark' },
      modules: {
        '02-managerial-economics': {
          status: 'quiz_passed',
          startedAt: '2026-07-01',
          completedAt: null,
          theoryCompleted: true,
          examplesCompleted: false,
          caseCompleted: false,
          practicalAssignmentCompleted: false,
          quizCompleted: true,
          reflectionCompleted: false,
          quizScore: 81,
          practicalScore: 67,
          hoursSpent: 5,
          difficulty: 4,
          notes: 'legacy',
          review7Days: null,
          review30Days: null,
          review90Days: null,
          reviewHistory: [],
        },
      },
    };

    const migrated = migrateProgressData(legacy, manifest);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.modules['02-managerial-economics'].quizScore).toBe(81);
    expect(migrated.modules['02-managerial-economics'].practicalScore).toBe(67);
    expect(migrated.modules['02-managerial-economics'].notesLegacy).toContain('legacy');
  });

  it('stores reading position and includes notes/bookmarks in export', () => {
    const progress = seedProgress();
    progress.modules['02-managerial-economics'].bookmarks = ['theory-spros-predlozhenie'];
    progress.modules['02-managerial-economics'].notes = [
      {
        id: 'note-1',
        unitId: 'theory-spros-predlozhenie',
        heading: 'Спрос и предложение',
        content: 'Сохранённая заметка',
        createdAt: '2026-07-17T00:00:00.000Z',
        updatedAt: '2026-07-17T00:00:00.000Z',
      },
    ];

    const updated = saveUnitReadingPosition(progress, '02-managerial-economics', 'theory-spros-predlozhenie', 420);
    const exported = exportProgress(updated);

    expect(updated.modules['02-managerial-economics'].readingPositions['theory-spros-predlozhenie']).toBe(420);
    expect(exported).toContain('Сохранённая заметка');
    expect(exported).toContain('theory-spros-predlozhenie');
  });
});
