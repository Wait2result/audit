-- Умный поиск: журнал нераспознанных фраз (ADR-0011, локальный разбор).
--
-- Только добавляет таблицу и индексы: существующие данные не трогаются.
-- Записи обезличены: нормализованная фраза, раздел, экран и счётчик — без
-- человека, устройства и адреса. Миграция идемпотентна.

CREATE TABLE IF NOT EXISTS "smart_search_unrecognized" (
    "id" UUID NOT NULL,
    "phrase" VARCHAR(300) NOT NULL,
    "domain" VARCHAR(20),
    "screen" VARCHAR(20),
    "unknown_words" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "count" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(20) NOT NULL DEFAULT 'new',
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smart_search_unrecognized_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "smart_search_unrecognized_phrase_key"
    ON "smart_search_unrecognized"("phrase");

CREATE INDEX IF NOT EXISTS "smart_search_unrecognized_status_count_idx"
    ON "smart_search_unrecognized"("status", "count");
