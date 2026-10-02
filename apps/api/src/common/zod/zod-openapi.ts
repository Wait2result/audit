import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import { ZodType, z } from 'zod';

/**
 * Превращает схему Zod в описание для документации Swagger.
 *
 * Благодаря этому интерактивная документация на /docs строится из тех же
 * схем, что используются для проверки данных. Документация не может
 * разойтись с реальностью — она и есть реальность.
 */
export function zodToOpenApi(schema: ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, {
    // io: 'input' — описываем то, что клиент ПРИСЫЛАЕТ (до преобразований).
    io: 'input',
    // Конструкции, которые невозможно выразить в JSON Schema (например,
    // произвольные преобразования), описываем как «любое значение»,
    // а не роняем генерацию документации.
    unrepresentable: 'any',
  });
}

/** Описывает тело запроса в Swagger по схеме Zod. */
export function ApiZodBody(schema: ZodType, description?: string) {
  return applyDecorators(
    ApiBody({
      schema: zodToOpenApi(schema) as never,
      ...(description ? { description } : {}),
    }),
  );
}

/** Описывает параметры строки запроса (?limit=20&cursor=…) в Swagger. */
export function ApiZodQuery(schema: ZodType) {
  const json = zodToOpenApi(schema);
  const properties = (json.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = (json.required ?? []) as string[];

  return applyDecorators(
    ...Object.entries(properties).map(([name, prop]) =>
      ApiQuery({
        name,
        required: required.includes(name),
        schema: prop as never,
        ...(typeof prop.description === 'string' ? { description: prop.description } : {}),
      }),
    ),
  );
}
