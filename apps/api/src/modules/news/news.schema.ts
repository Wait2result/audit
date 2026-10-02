import { paginationSchema, uuidSchema } from '@dagestan/shared';
import { z } from 'zod';

const scopeSchema = z.enum(['city', 'dagestan', 'russia', 'world']);

/** Лента новостей: курсорная пагинация, город и вкладка. */
export const newsFeedQuerySchema = paginationSchema.extend({
  cityId: uuidSchema,
  scope: scopeSchema.default('dagestan'),
});

export type NewsFeedQuery = z.infer<typeof newsFeedQuerySchema>;

/** Список для панели управления: видны и скрытые новости. */
export const newsAdminListQuerySchema = paginationSchema.extend({
  scope: scopeSchema.optional(),
});

export type NewsAdminListQuery = z.infer<typeof newsAdminListQuerySchema>;
