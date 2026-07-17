# DEVELOPMENT LOG

## 2026-07-17 — GitHub preparation, manifest scanner and web UI

### Что было создано
- `package.json` в корне проекта с командами генерации и валидации.
- `.gitignore`, `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`.
- `scripts/lib/course-utils.mjs`.
- `scripts/generate-course-manifest.mjs`.
- Скрипты проверок структуры, ссылок, публичной безопасности, схемы прогресса, секретов и локальных progress-артефактов.
- Статическое приложение `web/` на React + TypeScript + Vite + React Router + React Markdown + Vitest + ESLint.
- GitHub Actions workflows для validate и deploy-pages.
- `QUALITY_REPORT.md` с текущими ограничениями и результатами.

### Выбранная архитектура
- **Контур 1: разработка курса** — вычисляется автоматически сканером структуры проекта.
- **Контур 2: учебный прогресс** — хранится только локально в `localStorage` браузера.
- Учебные Markdown-материалы копируются в `web/public/content` только в безопасном виде.
- Answer keys исключаются из манифеста и публичной сборки; UI работает без backend.
- Для маршрутизации выбран `HashRouter`, чтобы статическая сборка не падала на прямом открытии маршрутов.

### Выполненные проверки
- Генерация манифеста для 14 модулей.
- Локальные unit tests для progress/manifest logic.
- ESLint.
- Production build web-приложения.
- Проверка отсутствия answer keys в web-артефакте.

### Результат публикации на GitHub
- GitHub CLI в окружении отсутствует (`gh: command not found`).
- Проект подготовлен к локальным коммитам и дальнейшей безопасной публикации после установки/авторизации `gh`.

### Ограничения первой версии
- Компетенции считаются по прозрачной, но упрощённой формуле на основе средних оценок связанных модулей.
- Production bundle крупнее рекомендуемого порога Vite и требует последующего code-splitting.
- Режим локального просмотра answer keys для преподавателя пока не добавлен.

### Следующие рекомендуемые шаги
1. Установить и авторизовать GitHub CLI, затем создать приватный репозиторий `home-mba`.
2. Добавить code-splitting и облегчить bundle UI.
3. Расширить quality gates для более точного определения `verified`.

## 2026-07-17 — Interactive learning mode, migration to schema v2 and public Pages deployment

### Что было создано и обновлено
- Обновлён `scripts/generate-course-manifest.mjs`: теперь он формирует `learningUnits`, безопасные summaries и publishable `materials` для course player.
- Обновлены `web/src/types.ts`, `web/src/lib/progress.ts`, `web/src/lib/learning.ts`.
- Существенно расширен `web/src/App.tsx` — добавлен route `#/learn/:moduleSlug/:unitId` и полноценный course player.
- Обновлены `web/src/index.css`, тесты `web/src/__tests__/learning.test.tsx` и `web/src/__tests__/progress.test.ts`.
- Обновлены `scripts/validate-course-manifest.mjs` и `scripts/validate-progress-schema.mjs` под manifest/progress schema v2.
- Обновлены `README.md` и `TASKS.md`.

### Архитектурное решение
- Markdown-файлы остаются единственным источником учебного контента.
- Крупный этап = файл; урок = section, выделенный по заголовкам `##`/`###`, если разбиение не разрушает смысл.
- Контент урока не дублируется в JSON: в манифесте хранится только metadata (`id`, `sourceFile`, `type`, `heading`, `summary`, `estimatedMinutes`).
- Реальный текст подгружается лениво из `web/public/content/...` и безопасно вырезается на клиенте по heading boundary.
- Прогресс расширен до `schemaVersion: 2` с миграцией со старых записей без потери оценок, часов, статусов и дат повторения.

### Что умеет учебный режим
- Старт / продолжение / повтор модуля через route `#/learn/:moduleSlug/:unitId`.
- Содержание модуля, последовательная навигация и возврат к месту остановки.
- Сохранение последнего урока, последней активности и scroll position.
- Личные заметки и закладки по урокам.
- Черновики для кейса и практического задания.
- Безопасный режим теста с сохранением попыток без публикации answer keys.
- Рефлексия и использование существующей системы повторений 7/30/90 дней.

### Выполненные проверки
- `npm --prefix web run lint`
- `npm --prefix web run test`
- `npm --prefix web run build`
- `npm run validate`
- Проверка production build на GitHub Pages URL.

### Результат публикации
- Репозиторий: `https://github.com/rpkshnik-ops/home-mba`
- GitHub Pages UI: `https://rpkshnik-ops.github.io/home-mba/`
- Deploy выполнен без включения answer keys в публичный артефакт.

### Ограничения текущей версии
- Модуль 01 в текущем проекте содержит placeholder-материалы и поэтому не определяется как содержательно готовый.
- Безопасный публичный тест не вычисляет правильные ответы; итоговый балл вносится после отдельной проверки.
- JS bundle остаётся крупным и требует code-splitting.

### Следующие рекомендуемые шаги
1. Добавить отдельный локальный CLI для офлайн-оценки quiz attempts по answer keys.
2. Разбить player/Markdown renderer на lazy chunks для снижения веса бандла.
3. Добавить e2e smoke-проход для course player на GitHub Actions.
