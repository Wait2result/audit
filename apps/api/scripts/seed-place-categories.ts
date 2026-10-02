/**
 * Начальные категории витрины доставки и их картинки.
 *
 * Отдельным скриптом, а не частью `db:seed`, по одной причине: картинку
 * мало записать в базу, её нужно провести через обычный модуль медиа —
 * положить в хранилище, снять метаданные съёмки, нарезать уменьшенные копии.
 * Всё это умеет MediaService, и повторять его логику здесь значило бы
 * завести вторую, расходящуюся реализацию.
 *
 *   npm run db:category-images --workspace @dagestan/api
 *   npm run db:category-images --workspace @dagestan/api -- --replace   # заменить картинки
 *
 * Сервисы создаются вручную, а не через внедрение зависимостей Nest:
 * скрипты запускаются через tsx, а он не передаёт Nest типы параметров
 * конструктора, и все зависимости пришли бы пустыми.
 *
 * Скрипт идемпотентен: категории заводятся по коду, картинка грузится
 * только если её ещё нет. Повторный запуск ничего не портит.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { SEED_PLACE_CATEGORIES } from '@dagestan/shared';

import { loadConfig } from '../src/config/env.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { StorageService } from '../src/infra/storage/storage.service.js';
import { MediaProcessingService } from '../src/modules/media/media-processing.service.js';
import { MediaService } from '../src/modules/media/media.service.js';

const ASSETS = path.resolve(import.meta.dirname, '..', 'prisma', 'seed-assets', 'categories');

/** С этим флагом картинки перезагружаются, даже если у категории они уже есть. */
const REPLACE = process.argv.includes('--replace');

async function main(): Promise<void> {
  const config = loadConfig();
  const prisma = new PrismaService(config);
  const storage = new StorageService(config);
  const processing = new MediaProcessingService();
  const media = new MediaService(prisma, storage, processing, config);

  await prisma.$connect();

  // Файлы кладёт «система», но поле загрузившего обязательно:
  // записываем их на владельца платформы
  const owner = await prisma.user.findFirst({
    where: { roles: { some: { role: { name: 'super_admin' } } }, deletedAt: null },
    select: { id: true },
  });

  if (!owner) {
    throw new Error('В базе нет владельца системы — сначала выполните db:seed');
  }

  for (const [index, seed] of SEED_PLACE_CATEGORIES.entries()) {
    const existing = await prisma.placeCategory.findUnique({ where: { slug: seed.slug } });

    const category =
      existing ??
      (await prisma.placeCategory.create({
        data: {
          slug: seed.slug,
          name: seed.name,
          cuisines: [...seed.cuisines],
          types: [...seed.types],
          sortOrder: index,
        },
      }));

    if (existing) {
      // Правила отбора обновляем, а название и порядок не трогаем:
      // их мог изменить владелец, и затирать его правку нельзя
      await prisma.placeCategory.update({
        where: { id: category.id },
        data: { cuisines: [...seed.cuisines], types: [...seed.types], deletedAt: null },
      });
    }

    if (category.imageMediaId && !REPLACE) {
      console.log(`${seed.slug}: уже с картинкой`);
      continue;
    }

    const oldMediaId = category.imageMediaId;

    const bytes = await readFile(path.join(ASSETS, `${seed.slug}.webp`));

    // Тот же путь, что у загрузки из панели: заявка, файл в хранилище,
    // подтверждение с обработкой. Обходных дорожек нет
    const ticket = await media.requestUpload(
      { kind: 'image', contentType: 'image/webp', sizeBytes: bytes.length, isPrivate: false },
      owner.id,
    );

    await storage.put({
      key: `image/${ticket.mediaId}/original.webp`,
      body: bytes,
      contentType: 'image/webp',
      isPrivate: false,
    });

    const uploaded = await media.confirmUpload(ticket.mediaId, owner.id, seed.name);

    await media.attach({
      mediaIds: [uploaded.id],
      ownerType: 'place_category',
      ownerId: category.id,
      userId: owner.id,
    });

    await prisma.placeCategory.update({
      where: { id: category.id },
      data: { imageMediaId: uploaded.id },
    });

    // Прежнюю картинку убираем: иначе в хранилище копились бы файлы,
    // на которые уже никто не ссылается
    if (oldMediaId) await media.remove(oldMediaId, owner.id).catch(() => undefined);

    console.log(`${seed.slug}: картинка загружена (${Math.round(bytes.length / 1024)} КБ)`);
  }

  console.log(
    `\nКатегорий в базе: ${await prisma.placeCategory.count({ where: { deletedAt: null } })}`,
  );
  await prisma.$disconnect();
}

await main();
