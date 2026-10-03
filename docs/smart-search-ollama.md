# Умный поиск: локальная модель Ollama + Qwen3 (Windows)

Умный поиск разбирает фразы человека локальной моделью. Модель работает на
компьютере разработчика (или сервере), в приложение и в репозиторий она не
попадает. Без неё всё приложение работает как раньше — умный поиск просто
отвечает «недоступен». Архитектура — [ADR-0011](ADR/0011-умный-поиск.md).

## 1. Установить Ollama

1. Скачать установщик для Windows: https://ollama.com/download/windows
   (`OllamaSetup.exe`) и установить. Ollama запускается в фоне и слушает
   `http://127.0.0.1:11434`.
2. Проверить в PowerShell:

   ```powershell
   ollama --version
   curl.exe http://127.0.0.1:11434/api/tags
   ```

Модели хранятся в `%USERPROFILE%\.ollama\models` — вне репозитория, в Git
они не попадают. Другую папку можно задать переменной `OLLAMA_MODELS`.

## 2. Скачать модель

```powershell
ollama pull qwen3:8b
```

Около 5 ГБ. Для комфортной скорости нужна видеокарта с 8 ГБ памяти; на
процессоре модель тоже работает, но ответ занимает 10–30 секунд — тогда
стоит поднять `AI_TIMEOUT_MS`.

Проверить, что модель отвечает:

```powershell
ollama run qwen3:8b "Ответь одним словом: привет"
```

## 3. Включить умный поиск

В `.env` в корне проекта (файл не коммитится; образец — `.env.example`):

```
SMART_SEARCH_ENABLED=true
AI_ENABLED=true
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:8b
AI_TIMEOUT_MS=20000
```

Перезапустить API (при запуске через `npm run dev` сторож поднимет его сам
после остановки процесса). Проверить:

```powershell
curl.exe http://localhost:3000/api/v1/smart-search/health
```

Ожидается `"status":"ok"`. `"unavailable"` с сообщением «Модель … не
скачана» — значит, не выполнен `ollama pull`; без сообщения — Ollama не
запущена.

## 4. Попробовать

```powershell
curl.exe -X POST http://localhost:3000/api/v1/smart-search `
  -H "Content-Type: application/json" `
  -d '{\"text\": \"двушка в Каспийске до 40 тысяч\"}'
```

Продолжить поиск — передать `sessionId` из ответа:
`{"text": "а с ремонтом?", "sessionId": "…"}`.

Ручная оценка на наборе фраз (печатает раздел и условия каждой):

```powershell
npx tsx apps/api/scripts/smart-search-eval.ts
```

## 5. Сменить модель

Только переменные: `OLLAMA_MODEL=qwen3:14b` (точнее, медленнее) или другая
модель Ollama с поддержкой JSON. Код поиска на имя модели не опирается.
Другой поставщик (облачный или иной локальный) подключается новым классом,
реализующим `AiProvider` (`apps/api/src/modules/smart-search/ai/`).

## Отладка

`AI_DEBUG_LOG=true` пишет в журнал причину отказа разбора. Только для
разработки: в production сервер с этим флагом не запустится.
