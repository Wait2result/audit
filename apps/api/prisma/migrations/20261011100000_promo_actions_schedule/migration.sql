-- Рекламная карусель главной: действие при нажатии и срок показа.
--
-- Карточка умела только открыть заведение. Теперь действие задаётся типом и
-- значением: заведение (связь target_place_id, как и раньше), рубрика главной,
-- внутренний экран приложения или внешняя ссылка https. Срок показа —
-- starts_at / ends_at: приложению отдаются только карточки, у которых сейчас
-- срок идёт; пустая граница — без ограничения.
--
-- Только добавляет: у карточек с заведением действие становится «place»,
-- остальное не меняется. Идемпотентно.

DO $$ BEGIN
  CREATE TYPE "PromoActionType" AS ENUM ('none', 'place', 'rubric', 'screen', 'url');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "promo_banners"
  ADD COLUMN IF NOT EXISTS "action_type" "PromoActionType" NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "action_value" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "starts_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ends_at" TIMESTAMP(3);

UPDATE "promo_banners"
SET "action_type" = 'place'
WHERE "target_place_id" IS NOT NULL AND "action_type" = 'none';
