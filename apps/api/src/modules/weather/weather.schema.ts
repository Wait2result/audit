import { uuidSchema } from '@dagestan/shared';
import { z } from 'zod';

/** Погоду всегда спрашивают для конкретного города — по его id из базы. */
export const weatherQuerySchema = z.object({
  cityId: uuidSchema,
  /**
   * Обновление «вручную» (потянули экран вниз): пропустить кеш и сходить
   * к источнику. Без этого человек тянет экран, а в ответ приходит тот же
   * сохранённый прогноз с тем же временем обновления — выглядит так, будто
   * приложение ничего не сделало.
   */
  refresh: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export type WeatherQuery = z.infer<typeof weatherQuerySchema>;
