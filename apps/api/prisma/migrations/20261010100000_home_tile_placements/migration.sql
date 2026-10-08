-- Фото плиток главной из панели (главная по референсу).
--
-- Плитки «Объявления», «Заказать», «Сейчас в кино», «Новости», «Попутчики»
-- получают фото так же, как карусель: карточка промо-баннера со своим местом
-- показа (tile_*) — та же загрузка картинки, порядок и включение в панели.
-- Новой таблицы нет: только новые значения перечисления. Без карточки плитка
-- показывает фото по умолчанию из приложения, у «Сейчас в кино» — афишу сеанса.
--
-- Только добавляет значения: существующие баннеры не меняются. Идемпотентно.

ALTER TYPE "PromoPlacement" ADD VALUE IF NOT EXISTS 'tile_listings';
ALTER TYPE "PromoPlacement" ADD VALUE IF NOT EXISTS 'tile_order';
ALTER TYPE "PromoPlacement" ADD VALUE IF NOT EXISTS 'tile_cinema';
ALTER TYPE "PromoPlacement" ADD VALUE IF NOT EXISTS 'tile_news';
ALTER TYPE "PromoPlacement" ADD VALUE IF NOT EXISTS 'tile_rides';
