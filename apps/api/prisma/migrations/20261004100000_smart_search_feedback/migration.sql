-- Умный поиск: «Я имел в виду другое» (ADR-0011).
--
-- Новая таблица исправлений к разбору фраз. Только добавляет таблицу и
-- индексы: существующие данные не трогаются. Записи — датасет для разбора,
-- автоматически ничего не меняют. Миграция идемпотентна.

CREATE TABLE IF NOT EXISTS "smart_search_feedback" (
    "id" UUID NOT NULL,
    "request_id" VARCHAR(64),
    "original_query" VARCHAR(300) NOT NULL,
    "model_intent" JSONB,
    "model_confidence" DOUBLE PRECISION,
    "response_status" VARCHAR(20),
    "domain" VARCHAR(20),
    "screen" VARCHAR(20),
    "failure_type" VARCHAR(40) NOT NULL,
    "user_correction" VARCHAR(500) NOT NULL,
    "corrected_intent" JSONB,
    "status" VARCHAR(20) NOT NULL DEFAULT 'new',
    "resolution" VARCHAR(40),
    "review_note" VARCHAR(1000),
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smart_search_feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "smart_search_feedback_status_created_at_idx"
    ON "smart_search_feedback"("status", "created_at");

CREATE INDEX IF NOT EXISTS "smart_search_feedback_domain_failure_type_idx"
    ON "smart_search_feedback"("domain", "failure_type");
