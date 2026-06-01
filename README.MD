# QuizGen — AI-генератор викторин

Веб-приложение для учителей: загружаешь учебный материал (PDF/Word/PPT) или указываешь тему — нейросеть **GigaChat** генерирует викторину; ученики проходят её по персональной ссылке (или QR-коду); учитель видит подробную аналитику с разбором ответов.

> MVP проекта для **СберХакатона** 2026.

---

## Возможности

### Для учителя
- 🤖 **Генерация квиза** одним кликом из любого материала: PDF, DOCX, PPTX, TXT, MD (до 10 МБ).
- ⚙️ **Тонкая настройка**: предмет, класс, тема, сложность (easy/medium/hard/mixed), тон (formal/playful/neutral), язык, уровень по таксономии Блума, типы вопросов.
- ✏️ **Редактор** сгенерированного квиза с возможностью **перегенерации отдельного вопроса**.
- 🔗 **Персональные ссылки + QR-код** для каждого ученика.
- 🖨 **Печатная версия** квиза с/без ключа ответов.
- 📊 **Подробная статистика**:
  - распределение баллов по группе (гистограмма)
  - таблица учеников с баллами и статусом
  - детальный разбор попытки — что выбрал ученик, что было правильно
  - индикатор «переключений вкладок» (антишпаргалка)
- 📥 Экспорт результатов в **CSV** (UTF-8 с BOM, открывается в Excel).

### Для ученика
- 👤 **Авторизация по имени** на старте — учитель видит, кто проходил.
- 🚫 **Антишпаргалка**: детекция перехода на другую вкладку, блокировка копипаста.
- 📱 Адаптивный интерфейс — открывается с телефона по QR.

---

## Стек

| Слой       | Технологии                                                |
|------------|-----------------------------------------------------------|
| Backend    | Go 1.22 · Gin · `golang-migrate` · `lib/pq`               |
| Database   | PostgreSQL 16                                             |
| LLM        | GigaChat (Sber) — OAuth + REST                            |
| Frontend   | React 18 · TypeScript · Vite · TailwindCSS · React Router |
| Charts     | Recharts                                                  |
| QR         | qrcode.react                                              |
| Парсинг    | `pdfcpu` / archive/zip + XML (для DOCX/PPTX)              |
| Развёртка  | Docker · docker-compose (multi-stage build)               |

---

## Архитектура

```
┌──────────────┐      HTTPS       ┌──────────────────────┐
│   Browser    │ ───────────────► │   Go (Gin) :8080     │
│  (React SPA) │                  │                      │
└──────────────┘                  │  ┌────────────────┐  │
                                  │  │  Handlers       │  │
                                  │  └─────┬──────────┘  │
                                  │        │             │
                                  │  ┌─────▼──────────┐  │     ┌─────────────┐
                                  │  │  Services      │──┼────►│  GigaChat   │
                                  │  └─────┬──────────┘  │     │  (LLM API)  │
                                  │        │             │     └─────────────┘
                                  │  ┌─────▼──────────┐  │
                                  │  │  Repositories  │  │
                                  │  └─────┬──────────┘  │
                                  └────────┼─────────────┘
                                           │
                                  ┌────────▼────────┐
                                  │  PostgreSQL :5432 │
                                  └───────────────────┘
```

**Структура проекта:**

```
.
├── cmd/server/           # точка входа
├── internal/
│   ├── config/           # загрузка конфига из .env
│   ├── db/               # подключение и миграции
│   ├── handlers/         # HTTP-роутеры
│   ├── middleware/       # Auth, RateLimit
│   ├── models/           # доменные модели + DTO
│   ├── parser/           # извлечение текста из PDF/DOCX/PPTX
│   ├── repository/       # доступ к БД
│   └── service/          # бизнес-логика, LLM-клиент
├── migrations/           # SQL-миграции
├── frontend/             # React SPA
│   ├── src/
│   │   ├── api/          # клиент к Go API
│   │   ├── auth/         # AuthContext
│   │   ├── components/   # UI-кит (Button, Card, FileDrop, ...)
│   │   ├── pages/        # AuthPage, QuizListPage, ..., PlayerPage
│   │   ├── toast/        # ToastContext
│   │   └── types.ts
│   └── vite.config.ts
├── Dockerfile            # multi-stage: node → go → alpine
└── docker-compose.yaml
```

---

## Запуск

### Через Docker (рекомендуется)

```bash
# 1. Скопировать .env
cp .env.example .env

# 2. Вписать ключ GigaChat
#    LLM_API_KEY=<base64-строка-Authorization-Key>

# 3. Поднять
docker compose up -d

# Открыть
open http://localhost:8080
```

Контейнер сам прогонит миграции при старте.

### Локально (для разработки)

```bash
# Backend
cp .env.example .env
go mod download
go run ./cmd/server

# Frontend (отдельный терминал)
cd frontend
npm install
npm run dev
# открыть http://localhost:5173 (Vite проксирует /api на :8080)
```

---

## Переменные окружения

| Переменная             | Описание                                            | По умолчанию                          |
|------------------------|-----------------------------------------------------|---------------------------------------|
| `APP_PORT`             | Порт HTTP-сервера                                   | `8080`                                |
| `APP_SECRET_KEY`       | Секрет для JWT (32+ символа)                        | —                                     |
| `DB_HOST/PORT/USER/PASSWORD/NAME/SSLMODE` | Подключение к Postgres            | см. `.env.example`                    |
| `LLM_PROVIDER`         | `gigachat` / `anthropic` / `openai`                 | `anthropic`                           |
| `LLM_API_KEY`          | Авторизационный ключ                                | —                                     |
| `LLM_MODEL`            | Имя модели                                          | зависит от провайдера                 |
| `LLM_SCOPE`            | (только GigaChat) `GIGACHAT_API_PERS` / `_B2B`      | `GIGACHAT_API_PERS`                   |
| `RATE_LIMIT_REQUESTS`  | Лимит генераций на час                              | `20`                                  |
| `MAX_UPLOAD_SIZE_MB`   | Максимальный размер файла                           | `10`                                  |
| `SESSION_TTL_HOURS`    | Время жизни сессии учителя                          | `24`                                  |

---

## API (для интеграций)

| Метод | Путь                                              | Описание                          |
|-------|---------------------------------------------------|-----------------------------------|
| POST  | `/api/auth/register`                              | Регистрация учителя               |
| POST  | `/api/auth/login`                                 | Вход                              |
| POST  | `/api/quizzes/generate`                           | Генерация квиза (multipart)       |
| GET   | `/api/quizzes`                                    | Список квизов                     |
| GET   | `/api/quizzes/:id`                                | Полная информация о квизе         |
| PUT   | `/api/quizzes/:id`                                | Обновить квиз                     |
| POST  | `/api/quizzes/:id/publish`                        | Опубликовать                      |
| POST  | `/api/quizzes/:id/sessions`                       | Создать ссылку для ученика        |
| POST  | `/api/quizzes/:id/questions/:qid/regenerate`      | Перегенерировать вопрос           |
| GET   | `/api/quizzes/:id/stats`                          | Статистика прохождений            |
| GET   | `/api/quizzes/:id/stats.csv`                      | CSV-экспорт                       |
| GET   | `/api/quizzes/:id/sessions/:sessionId`            | Детали попытки ученика            |
| GET   | `/api/sessions/:token`                            | (публ.) Получить квиз по ссылке   |
| POST  | `/api/sessions/:token/identify`                   | (публ.) Имя ученика               |
| POST  | `/api/sessions/:token/answers`                    | (публ.) Отправить ответ           |
| POST  | `/api/sessions/:token/finish`                     | (публ.) Завершить                 |

Защищённые эндпойнты требуют `Authorization: Bearer <token>`.

---

## Безопасность

- JWT-токены подписаны HMAC-SHA256 (`APP_SECRET_KEY`).
- Middleware `Auth` проверяет валидность токена **и существование юзера в БД** (защита от висячих сессий).
- Rate-limit: `RATE_LIMIT_REQUESTS` генераций в час на пользователя.
- Сервис чистит ответы LLM от невалидных UTF-8 байт и NUL-байт перед записью в Postgres (`sanitizeUTF8`).
- При парсинге PDF/DOCX тексты тоже санитизируются.


