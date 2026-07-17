import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import manifestData from './data/course-manifest.json';
import './index.css';
import type {
  CourseManifest,
  LearnerModuleProgress,
  LearnerProgressData,
  LearningUnit,
  LessonNote,
  ModuleManifest,
  QuizAttempt,
  QuizQuestionResponse,
} from './types';
import { completedModulesCount, average, currentModule, nearestReview, overdueReviews, competencySummary } from './lib/analytics';
import {
  SCHEMA_VERSION,
  clampScore,
  computeWeakTopics,
  createInitialProgress,
  deleteNote,
  deriveLearnerStatus,
  ensureModuleProgress,
  exportProgress,
  findResumeTarget,
  markUnitCompleted,
  saveUnitReadingPosition,
  STORAGE_KEY,
  toggleBookmark,
  updateModuleProgress,
  upsertNote,
  validateImportedProgress,
} from './lib/progress';
import {
  completionPercent,
  extractHeadingSections,
  extractUnitMarkdown,
  nextUnit,
  parseQuizQuestions,
  previousUnit,
  UNIT_TYPE_LABELS,
  unitFieldForType,
} from './lib/learning';

const manifest = manifestData as CourseManifest;
const BASE_URL = import.meta.env.BASE_URL ?? '/';

function resolvePublicAssetUrl(assetPath?: string | null) {
  if (!assetPath) return null;
  if (/^(https?:)?\/\//.test(assetPath) || assetPath.startsWith('data:')) return assetPath;
  const normalizedBase = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
  return `${normalizedBase}${assetPath.replace(/^\/+/, '')}`;
}

function resolveMarkdownHref(module: ModuleManifest, currentUnit: LearningUnit, href?: string | null) {
  if (!href) return null;
  if (href.startsWith('#')) return href;
  if (/^(https?:)?\/\//.test(href) || href.startsWith('mailto:')) return href;
  const hiddenAnswerKeyToken = ['answer', 'keys'].join('_');
  if (href.includes(hiddenAnswerKeyToken)) return null;

  const [pathPart, hashPart] = href.split('#');
  if (!pathPart.endsWith('.md')) return href;

  const cleaned = pathPart.replace(/^\.\//, '').replace(/^\//, '');
  const targetUnit = module.learningUnits.find((unit) => unit.sourceFile === cleaned)
    ?? module.learningUnits.find((unit) => unit.sourceFile === currentUnit.sourceFile);

  if (!targetUnit) return resolvePublicAssetUrl(cleaned);
  const route = `/learn/${module.slug}/${targetUnit.id}`;
  return hashPart ? `${route}#${hashPart}` : route;
}

type SaveState = 'idle' | 'saving' | 'saved';

function useProgress() {
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [data, setData] = useState<LearnerProgressData>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return createInitialProgress(manifest);
    try {
      return validateImportedProgress(JSON.parse(stored), manifest);
    } catch {
      return createInitialProgress(manifest);
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    document.documentElement.dataset.theme = data.settings.theme;
    const savingTick = window.setTimeout(() => setSaveState('saving'), 0);
    const savedTick = window.setTimeout(() => setSaveState('saved'), 250);
    return () => {
      window.clearTimeout(savingTick);
      window.clearTimeout(savedTick);
    };
  }, [data]);

  return { data, setData, saveState };
}

function App() {
  const { data: progress, setData: setProgress, saveState } = useProgress();
  const location = useLocation();
  const weakTopics = useMemo(() => computeWeakTopics(manifest, progress), [progress]);
  const dashboardStats = useMemo(() => {
    const quizzes = manifest.modules.map((m) => ensureModuleProgress(progress, m).quizScore).filter((v): v is number => v !== null);
    const practicals = manifest.modules.map((m) => ensureModuleProgress(progress, m).practicalScore).filter((v): v is number => v !== null);
    const hours = manifest.modules.reduce((sum, m) => sum + ensureModuleProgress(progress, m).hoursSpent, 0);
    return {
      completed: completedModulesCount(manifest, progress),
      avgQuiz: average(quizzes),
      avgPractical: average(practicals),
      hours,
    };
  }, [progress]);

  const updateModule = (slug: string, patch: Partial<LearnerModuleProgress>) => {
    setProgress((prev) => updateModuleProgress(prev, slug, (entry) => {
      const next = { ...entry, ...patch };
      next.quizScore = clampScore(next.quizScore);
      next.practicalScore = clampScore(next.practicalScore);
      next.status = deriveLearnerStatus(next);
      return next;
    }));
  };

  const crumbs = location.pathname.split('/').filter(Boolean);
  const inLearningMode = location.pathname.startsWith('/learn/');

  return (
    <div className={inLearningMode ? 'learning-app' : 'app-shell'}>
      {!inLearningMode && <aside className="sidebar">
        <h1>Home MBA</h1>
        <p className="muted">Разработка курса и личный учебный прогресс — отдельно.</p>
        <nav>
          {[
            ['/', 'Дашборд'],
            ['/modules', 'Каталог модулей'],
            ['/development', 'Разработка курса'],
            ['/reviews', 'Повторение'],
            ['/competencies', 'Компетенции'],
            ['/settings', 'Настройки'],
          ].map(([to, label]) => <NavLink key={to} to={to} end>{label}</NavLink>)}
        </nav>
      </aside>}
      <main className={inLearningMode ? 'learning-main-shell' : 'main-content'}>
        {!inLearningMode && <div className="breadcrumbs">{crumbs.length ? crumbs.join(' / ') : 'Главная'}</div>}
        <Routes>
          <Route path="/" element={<Dashboard progress={progress} stats={dashboardStats} weakTopics={weakTopics} />} />
          <Route path="/modules" element={<ModulesPage progress={progress} />} />
          <Route path="/modules/:slug" element={<ModulePage progress={progress} updateModule={updateModule} />} />
          <Route path="/development" element={<DevelopmentPage />} />
          <Route path="/reviews" element={<ReviewsPage progress={progress} updateModule={updateModule} />} />
          <Route path="/competencies" element={<CompetenciesPage progress={progress} />} />
          <Route path="/settings" element={<SettingsPage progress={progress} setProgress={setProgress} />} />
          <Route path="/learn/:slug/:unitId" element={<LearningPage progress={progress} setProgress={setProgress} saveState={saveState} />} />
        </Routes>
      </main>
    </div>
  );
}

function Dashboard({ progress, stats, weakTopics }: { progress: LearnerProgressData; stats: { completed: number; avgQuiz: number | null; avgPractical: number | null; hours: number }; weakTopics: string[] }) {
  const nextModule = currentModule(manifest, progress);
  const nextReview = nearestReview(manifest, progress);
  const overdue = overdueReviews(manifest, progress);
  const resumeModule = nextModule ?? manifest.modules.find((module) => findResumeTarget(module, progress));
  const resumeTarget = resumeModule ? findResumeTarget(resumeModule, progress) : null;

  return <div>
    <h2>Главный дашборд</h2>
    <div className="grid cards">
      <Metric title="Готовность материалов курса" value={`${Math.round((manifest.developedModules / manifest.totalModules) * 100)}%`} note={`${manifest.developedModules} из ${manifest.totalModules} модулей содержат substantive-контент`} />
      <Metric title="Мой учебный прогресс" value={`${Math.round((stats.completed / manifest.totalModules) * 100)}%`} note={`${stats.completed} модулей завершено`} />
      <Metric title="Средний тестовый балл" value={stats.avgQuiz ? `${stats.avgQuiz.toFixed(1)}%` : '—'} note="по заполненным результатам" />
      <Metric title="Средний балл практики" value={stats.avgPractical ? `${stats.avgPractical.toFixed(1)}%` : '—'} note="по заполненным результатам" />
      <Metric title="Всего часов" value={stats.hours.toFixed(1)} note="лично затрачено" />
      <Metric title="Просроченные повторения" value={String(overdue.length)} note={nextReview ? `ближайшее: ${nextReview.module.title}` : 'дат повторения пока нет'} />
    </div>
    <section className="panel"><h3>Текущий фокус</h3><ul>
      <li>Текущий модуль: {nextModule ? <Link to={`/modules/${nextModule.slug}`}>{nextModule.title}</Link> : 'все завершены'}</li>
      <li>Следующая задача разработки: {manifest.modules.find((m) => m.hasIncompleteTasks)?.nextRecommendedTask ?? 'нет'}</li>
      <li>Ближайшее повторение: {nextReview ? `${nextReview.module.title} — ${nextReview.label} (${nextReview.date})` : 'не запланировано'}</li>
      <li>Слабые темы: {weakTopics.length ? weakTopics.join(', ') : 'не выявлены'}</li>
    </ul>
      {resumeModule && resumeTarget && <div className="row gap top-gap"><Link className="button-like" to={`/learn/${resumeModule.slug}/${resumeTarget.unitId}`}>Перейти в учебный режим</Link></div>}
    </section>
  </div>;
}

function ModulesPage({ progress }: { progress: LearnerProgressData }) {
  const [filter, setFilter] = useState('all');
  const filtered = manifest.modules.filter((module, index) => {
    const learner = ensureModuleProgress(progress, module);
    const locked = !progress.settings.freeOrderEnabled && index > 0 && ensureModuleProgress(progress, manifest.modules[index - 1]).status !== 'completed';
    if (filter === 'all') return true;
    if (filter === 'not_started') return module.developmentStatus === 'not_started' || learner.status === 'not_started';
    if (filter === 'in_development') return ['in_progress', 'content_ready'].includes(module.developmentStatus);
    if (filter === 'ready') return ['ready_for_review', 'verified'].includes(module.developmentStatus);
    if (filter === 'studying') return ['studying', 'theory_done', 'case_done', 'practical_done', 'quiz_passed'].includes(learner.status);
    if (filter === 'completed') return learner.status === 'completed';
    if (filter === 'review_required') return learner.status === 'review_required';
    return !locked;
  });
  return <div>
    <h2>Каталог модулей</h2>
    <div className="toolbar">{['all','not_started','in_development','ready','studying','completed','review_required'].map((value) => <button key={value} className={filter===value?'active':''} onClick={() => setFilter(value)}>{value}</button>)}</div>
    <div className="grid">{filtered.map((module, index) => {
      const learner = ensureModuleProgress(progress, module);
      const locked = !progress.settings.freeOrderEnabled && index > 0 && ensureModuleProgress(progress, manifest.modules[index - 1]).status !== 'completed';
      const resumeTarget = findResumeTarget(module, progress);
      return <article key={module.slug} className="panel card">
        <div className="row"><strong>Модуль {String(module.moduleNumber).padStart(2,'0')}</strong><span className={`badge ${module.developmentStatus}`}>{module.developmentStatus}</span></div>
        <h3>{module.title}</h3>
        <p>Уровень: {module.level ?? '—'} · Материалы: {module.readinessPercent}%</p>
        <p>Статус прохождения: <strong>{learner.status}</strong>{locked ? ' · визуально заблокирован' : ''}</p>
        <p>Тест: {learner.quizScore ?? '—'} · Практика: {learner.practicalScore ?? '—'} · Время: {learner.hoursSpent} ч</p>
        <p>Файлы: {module.foundFiles.length}/{module.requiredFiles.length} · Изменён: {module.lastModifiedAt ? new Date(module.lastModifiedAt).toLocaleDateString('ru-RU') : '—'}</p>
        <div className="row gap wrap-actions">
          <Link to={`/modules/${module.slug}`}>Открыть</Link>
          {resumeTarget && <Link className="button-like" to={`/learn/${module.slug}/${resumeTarget.unitId}`}>{learner.status === 'completed' ? 'Повторить модуль' : learner.status === 'not_started' ? 'Начать обучение' : 'Продолжить обучение'}</Link>}
        </div>
      </article>;
    })}</div>
  </div>;
}

function ModulePage({ progress, updateModule }: { progress: LearnerProgressData; updateModule: (slug: string, patch: Partial<LearnerModuleProgress>) => void }) {
  const { slug } = useParams();
  const module = manifest.modules.find((item) => item.slug === slug);
  if (!module) return <div className="panel">Модуль не найден.</div>;
  const learner = ensureModuleProgress(progress, module);
  const set = (patch: Partial<LearnerModuleProgress>) => updateModule(module.slug, patch);
  const resumeTarget = findResumeTarget(module, progress);
  return <div>
    <Link to="/modules">← К каталогу</Link>
    <h2>{module.title}</h2>
    <div className="grid cards">
      <Metric title="Статус разработки" value={module.developmentStatus} note={`${module.readinessPercent}% материалов`} />
      <Metric title="Статус обучения" value={learner.status} note={`Ожидаемо: ${module.expectedDuration ?? '—'}`} />
      <Metric title="Прогресс модуля" value={`${completionPercent(module, learner.unitStatuses)}%`} note={`${module.learningUnits.length} учебных этапов`} />
    </div>
    {resumeTarget && <section className="panel row spaced"><div><h3>Учебный режим</h3><p className="muted">Открывает реальный Markdown-контент в режиме последовательного прохождения.</p></div><Link className="button-like" to={`/learn/${module.slug}/${resumeTarget.unitId}`}>{learner.status === 'completed' ? 'Повторить модуль' : learner.status === 'not_started' ? 'Начать обучение' : 'Продолжить обучение'}</Link></section>}
    <div className="grid two">
      <section className="panel">
        <h3>Ручная корректировка прогресса</h3>
        <p className="muted">Используйте этот блок только для пост-проверки или исправления локальных данных. Основной сценарий — через учебный режим.</p>
        {[
          ['theoryCompleted','Теория изучена'],['examplesCompleted','Примеры разобраны'],['caseCompleted','Кейс выполнен'],['practicalAssignmentCompleted','Практическая работа выполнена'],['quizCompleted','Тест пройден'],['reflectionCompleted','Рефлексия завершена']
        ].map(([key,label]) => <label key={key} className="check"><input type="checkbox" checked={Boolean(learner[key as keyof typeof learner])} onChange={(e) => set({ [key]: e.target.checked } as Partial<LearnerModuleProgress>)}/>{label}</label>)}
        <label>Дата начала<input type="date" value={learner.startedAt ?? ''} onChange={(e) => set({ startedAt: e.target.value || null })} /></label>
        <label>Дата завершения<input type="date" value={learner.completedAt ?? ''} onChange={(e) => set({ completedAt: e.target.value || null })} /></label>
        <label>Тест 0–100 (внести после отдельной проверки)<input type="number" min="0" max="100" value={learner.quizScore ?? ''} onChange={(e) => set({ quizScore: e.target.value === '' ? null : Number(e.target.value) })} /></label>
        <label>Практика 0–100 (внести после отдельной проверки)<input type="number" min="0" max="100" value={learner.practicalScore ?? ''} onChange={(e) => set({ practicalScore: e.target.value === '' ? null : Number(e.target.value) })} /></label>
        <label>Часы<input type="number" min="0" step="0.5" value={learner.hoursSpent} onChange={(e) => set({ hoursSpent: Number(e.target.value) })} /></label>
        <label>Сложность 1–5<input type="number" min="1" max="5" value={learner.difficulty ?? ''} onChange={(e) => set({ difficulty: e.target.value === '' ? null : Number(e.target.value) })} /></label>
        <label>Общие заметки по модулю<textarea value={learner.notesLegacy} onChange={(e) => set({ notesLegacy: e.target.value })} /></label>
      </section>
      <section className="panel"><h3>Материалы и units</h3><ul className="unit-list static-list">{module.learningUnits.map((unit) => <li key={unit.id} className="unit-list-item"><div><strong>{unit.title}</strong><div className="muted">{UNIT_TYPE_LABELS[unit.type]} · {unit.estimatedMinutes} мин</div></div><Link to={`/learn/${module.slug}/${unit.id}`}>Открыть</Link></li>)}</ul></section>
    </div>
  </div>;
}

function DevelopmentPage() {
  return <div>
    <h2>Разработка курса</h2>
    <section className="panel"><p>Матрица показывает фактические файлы, проверки и следующий шаг. Статус модуля рассчитывается по количеству substantive-файлов, наличию ключа/рубрики и результатам проверок ссылок/структуры.</p></section>
    <div className="grid">{manifest.modules.map((module) => <section key={module.slug} className="panel card"><h3>{module.title}</h3><p><span className={`badge ${module.developmentStatus}`}>{module.developmentStatus}</span> · {module.readinessPercent}%</p><ul>{module.requiredFiles.map((file) => <li key={file}>{module.foundFiles.includes(file) ? '✅' : '❌'} {file}</li>)}</ul><p>Структура: {module.structureCheck.passed ? 'пройдена' : 'требует правки'}</p><p>Ссылки: {module.linkCheck.passed ? 'пройдены' : 'есть ошибки'}</p><p>Ключ: {module.hasAnswerKey ? 'есть' : 'нет'} · Рубрика: {module.hasRubric ? 'есть' : 'нет'}</p><p>Следующая задача: {module.nextRecommendedTask ?? '—'}</p></section>)}</div>
  </div>;
}

function ReviewsPage({ progress, updateModule }: { progress: LearnerProgressData; updateModule: (slug: string, patch: Partial<LearnerModuleProgress>) => void }) {
  const items = manifest.modules.flatMap((module) => {
    const p = ensureModuleProgress(progress, module);
    const rows: Array<{ module: ModuleManifest; key: 'review7Days' | 'review30Days' | 'review90Days'; date: string; label: string }> = [];
    if (p.review7Days) rows.push({ module, key: 'review7Days', date: p.review7Days, label: '7 дней' });
    if (p.review30Days) rows.push({ module, key: 'review30Days', date: p.review30Days, label: '30 дней' });
    if (p.review90Days) rows.push({ module, key: 'review90Days', date: p.review90Days, label: '90 дней' });
    return rows;
  });

  const markDone = (item: (typeof items)[number]) => {
    const patch: Partial<LearnerModuleProgress> = {
      reviewHistory: [
        ...ensureModuleProgress(progress, item.module).reviewHistory,
        { date: new Date().toISOString().slice(0, 10), kind: item.label === '7 дней' ? '7d' : item.label === '30 дней' ? '30d' : '90d' },
      ],
    };
    patch[item.key] = null;
    updateModule(item.module.slug, patch);
  };

  return <div><h2>Повторение материала</h2><section className="panel"><p>Можно отметить повторение выполненным и назначить новую дату.</p>{items.length ? items.map((item) => <div key={`${item.module.slug}-${item.key}`} className="row spaced"><span>{item.module.title} · {item.label} · {item.date}</span><button onClick={() => markDone(item)}>Отметить выполненным</button></div>) : 'Пока нет запланированных повторений.'}</section></div>;
}

function CompetenciesPage({ progress }: { progress: LearnerProgressData }) {
  const competencies = competencySummary(manifest, progress);
  return <div><h2>Компетенции</h2><section className="panel"><p>Формула: уровень компетенции = средний балл связанных модулей. 0 = нет данных, 1 = &lt;60, 2 = 60–74, 3 = 75–84, 4 = 85+.</p></section><div className="grid">{competencies.map((item) => <section key={item.name} className="panel card"><h3>{item.name}</h3><p>Уровень: {item.level}</p><p>Связанные модули: {item.related.map((module) => module.title).join(', ')}</p><p>Завершено модулей: {item.completed}/{item.related.length}</p><p>Проблемные области: {item.problemAreas.length ? item.problemAreas.join(', ') : 'не выявлены'}</p></section>)}</div></div>;
}

function SettingsPage({ progress, setProgress }: { progress: LearnerProgressData; setProgress: Dispatch<SetStateAction<LearnerProgressData>> }) {
  const exportJsonFile = () => {
    const blob = new Blob([exportProgress(progress)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `home-mba-progress-v${SCHEMA_VERSION}.json`;
    link.click();
  };
  const importJson = async (file?: File | null) => {
    if (!file) return;
    const text = await file.text();
    const parsed = validateImportedProgress(JSON.parse(text), manifest);
    if (window.confirm('Заменить текущие локальные данные импортом?')) setProgress(parsed);
  };
  return <div><h2>Настройки и данные</h2><section className="panel form-grid">
    <label>Недельная нагрузка<input type="number" min="1" step="0.5" value={progress.settings.weeklyLoadHours} onChange={(e) => setProgress((prev) => ({ ...prev, settings: { ...prev.settings, weeklyLoadHours: Number(e.target.value) } }))} /></label>
    <label className="check"><input type="checkbox" checked={progress.settings.freeOrderEnabled} onChange={(e) => setProgress((prev) => ({ ...prev, settings: { ...prev.settings, freeOrderEnabled: e.target.checked } }))} />Разрешить свободный порядок прохождения</label>
    <label>Тема<select value={progress.settings.theme} onChange={(e) => setProgress((prev) => ({ ...prev, settings: { ...prev.settings, theme: e.target.value as LearnerProgressData['settings']['theme'] } }))}><option value="system">system</option><option value="light">light</option><option value="dark">dark</option></select></label>
    <div className="row gap"><button onClick={exportJsonFile}>Экспорт прогресса</button><label className="button-like">Импорт JSON<input hidden type="file" accept="application/json" onChange={(e) => importJson(e.target.files?.[0])} /></label><button className="danger" onClick={() => { if (window.confirm('Сбросить весь локальный прогресс?')) setProgress(createInitialProgress(manifest)); }}>Сбросить прогресс</button></div>
    <p className="muted">Версия приложения: 2.0.0 · Версия схемы: {SCHEMA_VERSION}</p>
  </section></div>;
}

function LearningPage({ progress, setProgress, saveState }: { progress: LearnerProgressData; setProgress: Dispatch<SetStateAction<LearnerProgressData>>; saveState: SaveState }) {
  const navigate = useNavigate();
  const { slug, unitId } = useParams();
  const module = manifest.modules.find((item) => item.slug === slug);
  const learner = module ? ensureModuleProgress(progress, module) : null;
  const unit = module?.learningUnits.find((item) => item.id === unitId) ?? null;
  const [markdown, setMarkdown] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [newNote, setNewNote] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [resumePromptVisible, setResumePromptVisible] = useState(true);

  useEffect(() => {
    if (!module || !unit) return;
    const sourceUrl = resolvePublicAssetUrl(module.materials[unit.sourceFile]);
    if (!sourceUrl) return;
    fetch(sourceUrl)
      .then((res) => {
        if (!res.ok) throw new Error('load_failed');
        return res.text();
      })
      .then((text) => {
        setLoadError(null);
        setMarkdown(extractUnitMarkdown(text, unit));
      })
      .catch(() => setLoadError('Markdown не удалось загрузить.'));
  }, [module, unit]);

  useEffect(() => {
    if (!module || !unit) return;
    setProgress((prev) => saveUnitReadingPosition(prev, module.slug, unit.id, prev.modules[module.slug]?.readingPositions[unit.id] ?? 0));
  }, [module, unit, setProgress]);

  useEffect(() => {
    if (!module || !unit || !scrollRef.current) return;
    const savedPosition = learner?.readingPositions[unit.id] ?? 0;
    if (savedPosition > 0) {
      scrollRef.current.scrollTop = savedPosition;
    }
  }, [learner?.readingPositions, module, unit]);

  useEffect(() => {
    if (!module || !unit || !scrollRef.current) return;
    const element = scrollRef.current;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setProgress((prev) => saveUnitReadingPosition(prev, module.slug, unit.id, element.scrollTop));
      });
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener('scroll', onScroll);
    };
  }, [module, unit, setProgress]);

  if (!module) return <div className="panel">Модуль не найден.</div>;
  if (!unit) return <div className="panel">Учебный этап не найден.</div>;
  if (!module.learningUnits.length) return <div className="panel">Материалы этого модуля ещё не подготовлены.</div>;
  const sourceUrl = resolvePublicAssetUrl(module.materials[unit.sourceFile]);

  const completion = completionPercent(module, learner?.unitStatuses ?? {});
  const prevUnit = previousUnit(module, unit.id);
  const followingUnit = nextUnit(module, unit.id);
  const activeNotes = learner?.notes.filter((note) => note.unitId === unit.id) ?? [];
  const headings = extractHeadingSections(markdown, 2);
  const quizQuestions = unit.type === 'quiz' ? parseQuizQuestions(markdown) : [];
  const currentAttempt = learner?.quizAttempts.find((attempt) => !attempt.submittedAt) ?? null;
  const progressStatusText = saveState === 'saving' ? 'Сохранение…' : saveState === 'saved' ? 'Все изменения сохранены' : 'Прогресс сохранён локально';
  const canCompleteModule = learner ? deriveLearnerStatus(learner) === 'completed' : false;
  const nextModule = manifest.modules.find((item) => item.moduleNumber === module.moduleNumber + 1) ?? null;

  const goToUnit = (target: LearningUnit | null) => {
    if (!target) return;
    navigate(`/learn/${module.slug}/${target.id}`);
  };

  const markCompleted = () => {
    setProgress((prev) => markUnitCompleted(prev, module.slug, unit.id, unitFieldForType(unit.type) as never));
  };

  const saveNote = () => {
    if (!newNote.trim()) return;
    const now = new Date().toISOString();
    const noteId = crypto.randomUUID ? crypto.randomUUID() : now;
    const note: LessonNote = {
      id: noteId,
      unitId: unit.id,
      heading: headings[0]?.heading ?? unit.title,
      content: newNote.trim(),
      createdAt: now,
      updatedAt: now,
    };
    setProgress((prev) => upsertNote(prev, module.slug, note));
    setNewNote('');
  };

  const updateCaseDraft = (field: keyof LearnerModuleProgress['caseDraft'], value: string | string[]) => {
    setProgress((prev) => updateModuleProgress(prev, module.slug, (entry) => ({
      ...entry,
      caseDraft: { ...entry.caseDraft, [field]: value, updatedAt: new Date().toISOString() },
    })));
  };

  const updatePracticalDraft = (field: keyof LearnerModuleProgress['practicalDraft'], value: string | string[]) => {
    setProgress((prev) => updateModuleProgress(prev, module.slug, (entry) => ({
      ...entry,
      practicalDraft: { ...entry.practicalDraft, [field]: value, updatedAt: new Date().toISOString() },
    })));
  };

  const updateReflection = (field: keyof LearnerModuleProgress['reflectionAnswers'], value: string) => {
    setProgress((prev) => updateModuleProgress(prev, module.slug, (entry) => ({
      ...entry,
      reflectionAnswers: { ...entry.reflectionAnswers, [field]: value, updatedAt: new Date().toISOString() },
    })));
  };

  const ensureAttempt = (): QuizAttempt => currentAttempt ?? {
    id: crypto.randomUUID?.() ?? `${Date.now()}`,
    startedAt: new Date().toISOString(),
    submittedAt: null,
    responses: quizQuestions,
  };

  const updateQuizResponse = (questionId: string, patch: Partial<QuizQuestionResponse>) => {
    setProgress((prev) => updateModuleProgress(prev, module.slug, (entry) => {
      const attempt = entry.quizAttempts.find((item) => !item.submittedAt) ?? ensureAttempt();
      const responses = attempt.responses.length
        ? attempt.responses.map((response) => response.questionId === questionId ? { ...response, ...patch } : response)
        : quizQuestions.map((response) => response.questionId === questionId ? { ...response, ...patch } : response);
      const nextAttempt = { ...attempt, responses };
      const others = entry.quizAttempts.filter((item) => item.id !== nextAttempt.id);
      return { ...entry, quizAttempts: [...others, nextAttempt] };
    }));
  };

  const submitQuizAttempt = () => {
    const attempt = ensureAttempt();
    const answered = attempt.responses.filter((item) => item.answer.trim()).length;
    const missing = attempt.responses.length - answered;
    if (!window.confirm(`Завершить попытку? Ответов: ${answered}, пропусков: ${missing}.`)) return;
    setProgress((prev) => updateModuleProgress(prev, module.slug, (entry) => {
      const active = entry.quizAttempts.find((item) => item.id === attempt.id) ?? attempt;
      const others = entry.quizAttempts.filter((item) => item.id !== active.id);
      return {
        ...entry,
        quizCompleted: true,
        quizAttempts: [...others, { ...active, submittedAt: new Date().toISOString() }],
      };
    }));
  };

  return <div className="learning-layout">
    <header className="learning-topbar panel">
      <div className="row gap"><button onClick={() => navigate(`/modules/${module.slug}`)}>← К модулю</button><button onClick={() => setShowMenu((value) => !value)} aria-label="Открыть содержание">Содержание</button><button onClick={() => setShowNotes((value) => !value)} aria-label="Открыть заметки">Заметки</button></div>
      <div className="learning-topbar-title"><strong>Модуль {String(module.moduleNumber).padStart(2, '0')} · {module.title}</strong><span className="muted">{unit.title} · {completion}%</span></div>
      <div className="row gap"><span className="save-indicator">{progressStatusText}</span></div>
    </header>

    <div className="learning-body">
      <aside className={`learning-sidebar panel ${showMenu ? 'open' : ''}`}>
        <h3>Содержание модуля</h3>
        <p className="muted">{module.expectedDuration ?? '—'} · {module.learningUnits.length} этапов</p>
        <ul className="unit-list">
          {module.learningUnits.map((item) => {
            const status = learner?.unitStatuses[item.id] ?? 'not_started';
            return <li key={item.id} className={`unit-list-item ${item.id === unit.id ? 'current' : ''}`}>
              <button className="unit-link" onClick={() => goToUnit(item)}>
                <span>
                  <strong>{item.title}</strong>
                  <small>{UNIT_TYPE_LABELS[item.type]} · {item.estimatedMinutes} мин</small>
                </span>
                <span className={`status-chip ${status}`}>{statusLabel(status)}</span>
              </button>
            </li>;
          })}
        </ul>
      </aside>

      <section className="learning-content panel">
        {resumePromptVisible && (learner?.readingPositions[unit.id] ?? 0) > 0 && <div className="resume-banner"><span>Найдено сохранённое место в разделе.</span><div className="row gap"><button onClick={() => { if (scrollRef.current) scrollRef.current.scrollTop = learner?.readingPositions[unit.id] ?? 0; setResumePromptVisible(false); }}>Продолжить с места остановки</button><button onClick={() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; setResumePromptVisible(false); }}>Начать раздел сначала</button></div></div>}
        <div className="learning-scroll" ref={scrollRef}>
          <div className="content-head row spaced"><div><span className="badge verified-lite">{UNIT_TYPE_LABELS[unit.type]}</span><h1>{unit.title}</h1><p className="muted">{unit.summary}</p></div><button onClick={() => setProgress((prev) => toggleBookmark(prev, module.slug, unit.id))}>{learner?.bookmarks.includes(unit.id) ? '★ В закладках' : '☆ В закладки'}</button></div>
          {headings.length >= 2 && <details className="toc-box"><summary>Оглавление материала</summary><ul>{headings.map((heading) => <li key={heading.heading}>{heading.heading}</li>)}</ul></details>}
          {loadError ? <div className="empty-state">{loadError}</div> : !sourceUrl ? <div className="empty-state">Материал не найден.</div> : markdown ? <MarkdownArticle markdown={markdown} module={module} currentUnit={unit} /> : <div className="empty-state">Загрузка материала…</div>}
          {unit.type === 'case' && learner && <CaseWorkspace learner={learner} onChange={updateCaseDraft} />}
          {unit.type === 'practical' && learner && <PracticalWorkspace learner={learner} onChange={updatePracticalDraft} setProgress={setProgress} moduleSlug={module.slug} />}
          {unit.type === 'quiz' && learner && <QuizWorkspace learner={learner} questions={quizQuestions} onResponse={updateQuizResponse} onSubmit={submitQuizAttempt} updateModule={(patch) => setProgress((prev) => updateModuleProgress(prev, module.slug, (entry) => ({ ...entry, ...patch })))} />}
          {unit.type === 'reflection' && learner && <ReflectionWorkspace learner={learner} onChange={updateReflection} />}
        </div>
        <footer className="learning-footer row spaced">
          <button onClick={() => goToUnit(prevUnit)} disabled={!prevUnit}>Предыдущий урок</button>
          <button onClick={markCompleted}>Отметить выполненным</button>
          <div className="row gap"><span className="muted">Следующий этап: {followingUnit?.title ?? 'модуль завершён'}</span><button onClick={() => goToUnit(followingUnit)} disabled={!followingUnit}>Следующий урок</button></div>
        </footer>
        <section className="panel completion-panel top-gap"><h3>Завершение модуля</h3>{canCompleteModule ? <div><p>Модуль можно считать успешно завершённым.</p><p className="muted">Ближайшее повторение: {learner?.review7Days ?? 'будет назначено автоматически'}</p>{followingUnit === null && nextModule && <Link className="button-like" to={`/modules/${nextModule.slug}`}>К следующему модулю</Link>}</div> : <ul><li>Основные этапы должны быть отмечены выполненными.</li><li>Средний результат должен быть не ниже 70%.</li><li>Практическая работа должна быть оценена не ниже 65%.</li></ul>}</section>
      </section>

      <aside className={`notes-sidebar panel ${showNotes ? 'open' : ''}`}>
        <h3>Заметки и закладки</h3>
        <label>Новая заметка<textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Личные выводы, формулы, вопросы к повторению" /></label>
        <div className="row gap"><button onClick={saveNote}>Сохранить заметку</button></div>
        <h4>Закладки</h4>
        <ul>{learner?.bookmarks.length ? learner.bookmarks.map((bookmark) => <li key={bookmark}>{module.learningUnits.find((item) => item.id === bookmark)?.title ?? bookmark}</li>) : <li>Пока нет закладок.</li>}</ul>
        <h4>Заметки по текущему уроку</h4>
        <ul className="notes-list">{activeNotes.length ? activeNotes.map((note) => <li key={note.id} className="panel nested-panel"><strong>{note.heading}</strong><p>{note.content}</p><div className="row gap"><button onClick={() => setNewNote(note.content)}>Редактировать копию</button><button className="danger" onClick={() => { if (window.confirm('Удалить заметку?')) setProgress((prev) => deleteNote(prev, module.slug, note.id)); }}>Удалить</button></div></li>) : <li>Для этого урока заметок пока нет.</li>}</ul>
      </aside>
    </div>
  </div>;
}

function CaseWorkspace({ learner, onChange }: { learner: LearnerModuleProgress; onChange: (field: keyof LearnerModuleProgress['caseDraft'], value: string | string[]) => void }) {
  return <section className="interactive-panel">
    <h2>Работа с бизнес-кейсом</h2>
    <div className="grid two">
      <label>Управленческое решение<textarea value={learner.caseDraft.situation} onChange={(e) => onChange('situation', e.target.value)} /></label>
      <label>Расчёты<textarea value={learner.caseDraft.calculations} onChange={(e) => onChange('calculations', e.target.value)} /></label>
      <label>Критические допущения<textarea value={learner.caseDraft.assumptions} onChange={(e) => onChange('assumptions', e.target.value)} /></label>
      <label>Итоговая рекомендация<textarea value={learner.caseDraft.recommendation} onChange={(e) => onChange('recommendation', e.target.value)} /></label>
    </div>
    <p className="muted">Черновик сохраняется локально автоматически. Ответ можно скопировать в Markdown из полей выше.</p>
  </section>;
}

function PracticalWorkspace({ learner, onChange, setProgress, moduleSlug }: { learner: LearnerModuleProgress; onChange: (field: keyof LearnerModuleProgress['practicalDraft'], value: string | string[]) => void; setProgress: Dispatch<SetStateAction<LearnerProgressData>>; moduleSlug: string }) {
  return <section className="interactive-panel">
    <h2>Практическое задание</h2>
    <div className="grid two">
      <label>Артефакты (по одному в строке)<textarea value={learner.practicalDraft.artifacts.join('\n')} onChange={(e) => onChange('artifacts', e.target.value.split('\n').map((item) => item.trim()).filter(Boolean))} /></label>
      <label>Ссылки или имена файлов<textarea value={learner.practicalDraft.fileReferences.join('\n')} onChange={(e) => onChange('fileReferences', e.target.value.split('\n').map((item) => item.trim()).filter(Boolean))} /></label>
      <label>Итоговый вывод<textarea value={learner.practicalDraft.finalSummary} onChange={(e) => onChange('finalSummary', e.target.value)} /></label>
      <label>Самооценка<textarea value={learner.practicalDraft.selfAssessment} onChange={(e) => onChange('selfAssessment', e.target.value)} /></label>
    </div>
    <label>Баллы за практику 0–100<input type="number" min="0" max="100" value={learner.practicalScore ?? ''} onChange={(e) => setProgress((prev) => updateModuleProgress(prev, moduleSlug, (entry) => ({ ...entry, practicalScore: e.target.value === '' ? null : Number(e.target.value) })))} /></label>
  </section>;
}

function QuizWorkspace({ learner, questions, onResponse, onSubmit, updateModule }: { learner: LearnerModuleProgress; questions: QuizAttempt['responses']; onResponse: (questionId: string, patch: Partial<QuizAttempt['responses'][number]>) => void; onSubmit: () => void; updateModule: (patch: Partial<LearnerModuleProgress>) => void }) {
  if (!questions.length) return <section className="interactive-panel"><div className="empty-state">Тест не содержит корректно распознаваемых вопросов.</div></section>;
  const activeAttempt = learner.quizAttempts.find((attempt) => !attempt.submittedAt);
  const responses = activeAttempt?.responses.length ? activeAttempt.responses : questions;
  const answered = responses.filter((item) => item.answer.trim()).length;
  return <section className="interactive-panel">
    <h2>Безопасный режим теста</h2>
    <p className="muted">Правильные ответы не публикуются. Система сохраняет только ваши ответы и историю попыток.</p>
    <p>Отвечено: {answered} из {responses.length}</p>
    {responses.map((question) => <article key={question.questionId} className="quiz-question panel nested-panel"><h3>{question.questionId.toUpperCase()}</h3><p>{question.prompt}</p>{question.type === 'single_choice' ? <input aria-label={`Ответ ${question.questionId}`} value={question.answer} onChange={(e) => onResponse(question.questionId, { answer: e.target.value })} placeholder="Например: A" /> : <textarea aria-label={`Ответ ${question.questionId}`} value={question.answer} onChange={(e) => onResponse(question.questionId, { answer: e.target.value })} />}
      <label className="check"><input type="checkbox" checked={question.flagged} onChange={(e) => onResponse(question.questionId, { flagged: e.target.checked })} />Вернуться позже</label></article>)}
    <div className="row gap"><button onClick={onSubmit}>Завершить попытку</button><label>Итоговый балл после проверки<input type="number" min="0" max="100" value={learner.quizScore ?? ''} onChange={(e) => updateModule({ quizScore: e.target.value === '' ? null : Number(e.target.value) })} /></label></div>
    <h3>История попыток</h3><ul>{learner.quizAttempts.length ? learner.quizAttempts.map((attempt) => <li key={attempt.id}>{new Date(attempt.startedAt).toLocaleString('ru-RU')} · {attempt.submittedAt ? 'завершена' : 'черновик'}</li>) : <li>Пока нет попыток.</li>}</ul>
  </section>;
}

function ReflectionWorkspace({ learner, onChange }: { learner: LearnerModuleProgress; onChange: (field: keyof LearnerModuleProgress['reflectionAnswers'], value: string) => void }) {
  const fields: Array<[keyof LearnerModuleProgress['reflectionAnswers'], string]> = [
    ['keyInsights', 'Главные выводы'],
    ['usefulTakeaways', 'Что оказалось наиболее полезным'],
    ['unclearTopics', 'Что осталось непонятным'],
    ['workApplication', 'Как применить материал в текущей работе'],
    ['changedDecision', 'Какое решение вы приняли бы иначе'],
    ['reviewTopics', 'Какие темы нужно повторить'],
    ['applicationPlan', 'План применения знаний'],
  ];
  return <section className="interactive-panel"><h2>Рефлексия</h2><div className="grid two">{fields.map(([field, label]) => <label key={field}>{label}<textarea value={learner.reflectionAnswers[field] as string} onChange={(e) => onChange(field, e.target.value)} /></label>)}</div></section>;
}

function MarkdownArticle({ markdown, module, currentUnit }: { markdown: string; module: ModuleManifest; currentUnit: LearningUnit }) {
  return <article className="markdown-article"><ReactMarkdown
    remarkPlugins={[remarkGfm, remarkMath]}
    rehypePlugins={[rehypeKatex]}
    components={{
      a: ({ href, children }) => {
        const resolvedHref = resolveMarkdownHref(module, currentUnit, href);
        if (!resolvedHref) return <span className="muted">{children}</span>;
        const isInternalLearnRoute = resolvedHref.startsWith('/learn/');
        const isExternal = /^(https?:)?\/\//.test(resolvedHref);
        if (isInternalLearnRoute) {
          return <Link to={resolvedHref}>{children}</Link>;
        }
        return <a href={resolvedHref} target={isExternal ? '_blank' : undefined} rel={isExternal ? 'noreferrer' : undefined}>{children}</a>;
      },
    }}
  >{markdown}</ReactMarkdown></article>;
}

function Metric({ title, value, note }: { title: string; value: string; note: string }) {
  return <section className="panel card"><p className="metric-title">{title}</p><p className="metric-value">{value}</p><p className="muted">{note}</p></section>;
}

function statusLabel(value: string) {
  if (value === 'completed') return 'завершено';
  if (value === 'in_progress') return 'изучается';
  if (value === 'action_required') return 'требует действия';
  if (value === 'awaiting_review') return 'ожидает оценки';
  if (value === 'ready_for_review') return 'повторение';
  return 'не начато';
}

export default App;
