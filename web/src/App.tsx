import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import manifestData from './data/course-manifest.json';
import './index.css';
import type { CourseManifest, LearnerProgressData, ModuleManifest } from './types';
import { completedModulesCount, average, currentModule, nearestReview, overdueReviews, competencySummary } from './lib/analytics';
import { SCHEMA_VERSION, clampScore, computeWeakTopics, createInitialProgress, deriveLearnerStatus, ensureModuleProgress, validateImportedProgress, STORAGE_KEY } from './lib/progress';

const manifest = manifestData as CourseManifest;

function useProgress() {
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
  }, [data]);
  return [data, setData] as const;
}

function App() {
  const [progress, setProgress] = useProgress();
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

  const updateModule = (slug: string, patch: Partial<LearnerProgressData['modules'][string]>) => {
    setProgress((prev) => {
      const next = structuredClone(prev);
      const entry = { ...next.modules[slug], ...patch };
      entry.quizScore = clampScore(entry.quizScore);
      entry.practicalScore = clampScore(entry.practicalScore);
      entry.status = deriveLearnerStatus(entry);
      next.modules[slug] = entry;
      return next;
    });
  };

  const crumbs = location.pathname.split('/').filter(Boolean);

  return (
    <div className="app-shell">
      <aside className="sidebar">
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
      </aside>
      <main className="main-content">
        <div className="breadcrumbs">{crumbs.length ? crumbs.join(' / ') : 'Главная'}</div>
        <Routes>
          <Route path="/" element={<Dashboard progress={progress} stats={dashboardStats} weakTopics={weakTopics} />} />
          <Route path="/modules" element={<ModulesPage progress={progress} />} />
          <Route path="/modules/:slug" element={<ModulePage progress={progress} updateModule={updateModule} />} />
          <Route path="/development" element={<DevelopmentPage />} />
          <Route path="/reviews" element={<ReviewsPage progress={progress} updateModule={updateModule} />} />
          <Route path="/competencies" element={<CompetenciesPage progress={progress} />} />
          <Route path="/settings" element={<SettingsPage progress={progress} setProgress={setProgress} />} />
        </Routes>
      </main>
    </div>
  );
}

function Dashboard({ progress, stats, weakTopics }: { progress: LearnerProgressData; stats: { completed: number; avgQuiz: number | null; avgPractical: number | null; hours: number }; weakTopics: string[] }) {
  const nextModule = currentModule(manifest, progress);
  const nextReview = nearestReview(manifest, progress);
  const overdue = overdueReviews(manifest, progress);
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
    </ul></section>
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
      return <article key={module.slug} className="panel card">
        <div className="row"><strong>Модуль {String(module.moduleNumber).padStart(2,'0')}</strong><span className={`badge ${module.developmentStatus}`}>{module.developmentStatus}</span></div>
        <h3>{module.title}</h3>
        <p>Уровень: {module.level ?? '—'} · Материалы: {module.readinessPercent}%</p>
        <p>Статус прохождения: <strong>{learner.status}</strong>{locked ? ' · визуально заблокирован' : ''}</p>
        <p>Тест: {learner.quizScore ?? '—'} · Практика: {learner.practicalScore ?? '—'} · Время: {learner.hoursSpent} ч</p>
        <p>Файлы: {module.foundFiles.length}/{module.requiredFiles.length} · Изменён: {module.lastModifiedAt ? new Date(module.lastModifiedAt).toLocaleDateString('ru-RU') : '—'}</p>
        <Link to={`/modules/${module.slug}`}>Открыть</Link>
      </article>;
    })}</div>
  </div>;
}

function ModulePage({ progress, updateModule }: { progress: LearnerProgressData; updateModule: (slug: string, patch: Partial<LearnerProgressData['modules'][string]>) => void }) {
  const { slug } = useParams();
  const module = manifest.modules.find((item) => item.slug === slug);
  if (!module) return <div className="panel">Модуль не найден.</div>;
  const learner = ensureModuleProgress(progress, module);
  const set = (patch: Partial<LearnerProgressData['modules'][string]>) => updateModule(module.slug, patch);
  return <div>
    <Link to="/modules">← К каталогу</Link>
    <h2>{module.title}</h2>
    <div className="grid cards">
      <Metric title="Статус разработки" value={module.developmentStatus} note={`${module.readinessPercent}% материалов`} />
      <Metric title="Статус обучения" value={learner.status} note={`Ожидаемо: ${module.expectedDuration ?? '—'}`} />
      <Metric title="Формула завершения" value=">=70%" note="Практика не ниже 65%, основные части отмечены" />
    </div>
    <div className="grid two">
      <section className="panel">
        <h3>Прогресс по этапам</h3>
        {[
          ['theoryCompleted','Теория изучена'],['examplesCompleted','Примеры разобраны'],['caseCompleted','Кейс выполнен'],['practicalAssignmentCompleted','Практическая работа выполнена'],['quizCompleted','Тест пройден'],['reflectionCompleted','Рефлексия завершена']
        ].map(([key,label]) => <label key={key} className="check"><input type="checkbox" checked={Boolean(learner[key as keyof typeof learner])} onChange={(e) => set({ [key]: e.target.checked } as Partial<LearnerProgressData['modules'][string]>)}/>{label}</label>)}
        <label>Дата начала<input type="date" value={learner.startedAt ?? ''} onChange={(e) => set({ startedAt: e.target.value || null })} /></label>
        <label>Дата завершения<input type="date" value={learner.completedAt ?? ''} onChange={(e) => set({ completedAt: e.target.value || null })} /></label>
        <label>Тест 0–100<input type="number" min="0" max="100" value={learner.quizScore ?? ''} onChange={(e) => set({ quizScore: e.target.value === '' ? null : Number(e.target.value) })} /></label>
        <label>Практика 0–100<input type="number" min="0" max="100" value={learner.practicalScore ?? ''} onChange={(e) => set({ practicalScore: e.target.value === '' ? null : Number(e.target.value) })} /></label>
        <label>Часы<input type="number" min="0" step="0.5" value={learner.hoursSpent} onChange={(e) => set({ hoursSpent: Number(e.target.value) })} /></label>
        <label>Сложность 1–5<input type="number" min="1" max="5" value={learner.difficulty ?? ''} onChange={(e) => set({ difficulty: e.target.value === '' ? null : Number(e.target.value) })} /></label>
        <label>Заметки<textarea value={learner.notes} onChange={(e) => set({ notes: e.target.value })} /></label>
        <div className="row gap">
          <button onClick={() => set({ review7Days: new Date(Date.now() + 7 * 86400000).toISOString().slice(0,10), review30Days: new Date(Date.now() + 30 * 86400000).toISOString().slice(0,10), review90Days: new Date(Date.now() + 90 * 86400000).toISOString().slice(0,10) })}>Назначить 7/30/90</button>
        </div>
      </section>
      <section className="panel"><h3>Материалы</h3>{Object.entries(module.materials).map(([file, href]) => <details key={file}><summary>{file}</summary><MarkdownBlock url={href} /></details>)}</section>
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

function ReviewsPage({ progress, updateModule }: { progress: LearnerProgressData; updateModule: (slug: string, patch: Partial<LearnerProgressData['modules'][string]>) => void }) {
  const items = manifest.modules.flatMap((module) => {
    const p = ensureModuleProgress(progress, module);
    const rows: Array<{ module: ModuleManifest; key: 'review7Days' | 'review30Days' | 'review90Days'; date: string; label: string }> = [];
    if (p.review7Days) rows.push({ module, key: 'review7Days', date: p.review7Days, label: '7 дней' });
    if (p.review30Days) rows.push({ module, key: 'review30Days', date: p.review30Days, label: '30 дней' });
    if (p.review90Days) rows.push({ module, key: 'review90Days', date: p.review90Days, label: '90 дней' });
    return rows;
  });

  const markDone = (item: (typeof items)[number]) => {
    const patch: Partial<LearnerProgressData['modules'][string]> = {
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
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json' });
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
    <div className="row gap"><button onClick={exportJson}>Экспорт прогресса</button><label className="button-like">Импорт JSON<input hidden type="file" accept="application/json" onChange={(e) => importJson(e.target.files?.[0])} /></label><button className="danger" onClick={() => { if (window.confirm('Сбросить весь локальный прогресс?')) setProgress(createInitialProgress(manifest)); }}>Сбросить прогресс</button></div>
    <p className="muted">Версия приложения: 1.0.0 · Версия схемы: {SCHEMA_VERSION}</p>
  </section></div>;
}

function MarkdownBlock({ url }: { url: string }) {
  const [content, setContent] = useState('Загрузка…');
  useEffect(() => { fetch(url).then((res) => res.text()).then(setContent).catch(() => setContent('Не удалось загрузить материал.')); }, [url]);
  return <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{content}</ReactMarkdown>;
}

function Metric({ title, value, note }: { title: string; value: string; note: string }) {
  return <section className="panel card"><p className="metric-title">{title}</p><p className="metric-value">{value}</p><p className="muted">{note}</p></section>;
}

export default App;
