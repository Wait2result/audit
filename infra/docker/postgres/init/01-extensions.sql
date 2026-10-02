-- Выполняется один раз при создании базы данных.
-- Включает расширения PostgreSQL, которые использует проект.

-- Генерация UUID (идентификаторы записей)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- География: координаты, расстояния, поиск «рядом со мной»
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Поиск по неточному совпадению («Махачкла» → «Махачкала»)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Убирает диакритику при поиске
CREATE EXTENSION IF NOT EXISTS "unaccent";
