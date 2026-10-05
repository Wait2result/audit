import { Injectable } from '@nestjs/common';
import {
  classifyListingTitle,
  parseSearchIntent,
  smartSearchIntentSchema,
  type CityDto,
  type SubjectHit,
} from '@dagestan/shared';

import {
  ListingCategoriesService,
  type ListingCatalogue,
} from '../../listings/listing-categories.service.js';
import {
  brandInText,
  findCategory,
  modelInText,
  modelLikeInText,
} from '../domains/listings.normalizer.js';
import type { IntentParseResult } from '../intent/intent-parser.js';

/** Разбор фразы без модели плюс то, что в ней не узнано. */
export interface LocalIntentParse {
  result: IntentParseResult;
  /** Слова, которые ничему не достались (без служебных) */
  leftover: string[];
  /** Что узнано — для журнала и отчёта */
  recognized: string[];
}

/**
 * Локальный разбор фраз: словарь и правила из общего пакета плюс
 * справочники каталога объявлений (марки, модели, категории) с сервера.
 * Языковая модель не вызывается. Результат проверяется той же схемой, что и
 * ответ модели, и идёт по тому же пути: сверка с фразой, контекст, адаптеры.
 */
@Injectable()
export class LocalIntentParser {
  constructor(private readonly categories: ListingCategoriesService) {}

  async parse(text: string, cities: readonly CityDto[]): Promise<LocalIntentParse> {
    const started = Date.now();
    const catalogue = await this.categories.catalogue();
    const parsed = parseSearchIntent(text, {
      cities: cities.map((city) => city.name),
      subject: (freeWords, normalized) => subjectOf(catalogue, freeWords, normalized),
    });
    const checked = smartSearchIntentSchema.safeParse(parsed.intent);
    if (!checked.success) {
      const issue = checked.error.issues[0];
      return {
        result: {
          ok: false,
          code: 'INVALID_AI_OUTPUT',
          detail:
            `Локальный разбор не по схеме: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.trim(),
        },
        leftover: parsed.leftover,
        recognized: parsed.recognized,
      };
    }
    return {
      result: { ok: true, intent: checked.data, latencyMs: Date.now() - started, stripped: [] },
      leftover: parsed.leftover,
      recognized: parsed.recognized,
    };
  }
}

/**
 * Предмет объявлений по справочникам каталога: модель («саксид» → Toyota
 * Succeed), марка («тойота», с опечаткой «тойта» — только при единственном
 * похожем названии), категория по названию («телефон») или по
 * классификатору заголовков. Ничего не найдено — null: раздел решат другие
 * признаки, а слова останутся для обычного поиска.
 */
export function subjectOf(
  catalogue: ListingCatalogue,
  freeWords: readonly string[],
  normalized: string,
): SubjectHit | null {
  if (freeWords.length === 0) return null;
  const free = freeWords.join(' ');
  const hit: { brand?: string; model?: string; category?: string; words: string[] } = { words: [] };

  const model = modelInText(catalogue, free);
  if (model) {
    hit.model = model.label;
    if (model.brand) hit.brand = model.brand;
    hit.words.push(...wordsOfModel(freeWords, model.label));
  }
  const brand = brandInText(
    catalogue,
    freeWords.filter((word) => !hit.words.includes(word)),
  );
  if (brand && (!hit.brand || brand.label.toLowerCase() === hit.brand.toLowerCase())) {
    hit.brand ??= brand.label;
    hit.words.push(...brand.words);
  }
  for (const word of freeWords) {
    if (hit.words.includes(word) || word.length < 4) continue;
    const category = findCategory(catalogue, word);
    if (category && !category.slug.includes('other')) {
      hit.category = category.slug;
      hit.words.push(word);
      break;
    }
  }
  if (!hit.model) {
    const similar = modelLikeInText(
      catalogue,
      freeWords.filter((word) => !hit.words.includes(word)),
    );
    if (similar && (!hit.brand || !similar.brand || similar.brand === hit.brand.toLowerCase())) {
      hit.model = similar.label;
      if (similar.brand) hit.brand ??= similar.brand;
      hit.words.push(similar.word);
    }
  }
  // Классификатор заголовков — тот же, что подсказывает категорию при подаче
  // объявления: «тойота» → легковые, «айфон» → телефоны
  if (!hit.category) {
    const guess = classifyListingTitle(normalized);
    if (guess.kind === 'guess') hit.category = guess.guess.slug;
  }
  return hit.brand || hit.model || hit.category ? hit : null;
}

/** Слова фразы, которыми названа модель: по совпадению с написаниями справочника. */
function wordsOfModel(freeWords: readonly string[], label: string): string[] {
  const parts = label.toLowerCase().split(/[\s-]+/);
  const matched = freeWords.filter((word) => parts.includes(word));
  if (matched.length > 0) return matched;
  // Написание кириллицей («саксид»): модель нашлась по одному из свободных слов —
  // берём слова длиной от 4 букв, которых нет среди служебных; точнее скажет справочник
  return freeWords.filter((word) => word.length >= 4 && !/^\d+$/.test(word)).slice(0, 2);
}
