import {
  smartSearchOutcome,
  understoodNotes,
  understoodSummary,
  type MovieShowtimesDto,
  type SmartSearchClarificationOption,
  type SmartSearchPart,
  type SmartSearchRequest,
  type SmartSearchResponse,
} from '@dagestan/shared';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCities, useListings } from '../../src/api/queries';
import { AppBackground } from '../../src/components/AppBackground';
import { Icon } from '../../src/components/Icon';
import { ListingCard } from '../../src/components/ListingCard';
import { NewsCard } from '../../src/components/NewsCard';
import { PlaceCard } from '../../src/components/PlaceCard';
import {
  SmartClarificationBlock,
  SmartFeedbackSheet,
  SmartNotice,
  SmartThinking,
  SmartUnderstood,
  type SmartAction,
  type SmartFeedbackTarget,
} from '../../src/components/SmartSearchBlocks';
import { useListingArea } from '../../src/hooks/use-listing-area';
import { useSmartSearch, type SmartSearchState } from '../../src/hooks/use-smart-search';
import { useCityStore } from '../../src/store/city-store';
import { useListingAreaStore } from '../../src/store/listing-area-store';
import { useSmartSearchStore } from '../../src/store/smart-search-store';
import { radius, spacing, typography, useThemeColors } from '../../src/theme';
import {
  SMART_SEARCH_SECTIONS,
  applySmartListing,
  widerRadius,
} from '../../src/utils/smart-search';

/**
 * Поиск по всему приложению (пункт 9 ТЗ).
 *
 * Одно поле понимает обычную речь: «Toyota Succeed до 1.2 млн, автомат»,
 * «что сегодня в кино», «новости Дербента». Фразу разбирает сервер, а
 * результаты дают существующие разделы — те же объявления, расписание,
 * новости и заведения, что на их экранах. Следующая фраза уточняет прошлую:
 * «до миллиона», «а автомат?».
 *
 * Если умный поиск недоступен, экран не застревает: показывается обычный
 * поиск по объявлениям по той же фразе.
 */

const SUGGESTIONS = [
  'Рестораны рядом',
  'Что посмотреть в кино',
  'Квартира посуточно',
  'Попутчики в Дербент',
  'Доставка еды',
];

/** Сколько показать прямо здесь — остальное на экране раздела. */
const PREVIEW = { listings: 4, cinema: 6, news: 5, delivery: 5 } as const;

type Screen = NonNullable<NonNullable<SmartSearchRequest['context']>['screen']>;

export default function SearchScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);

  const smart = useSmartSearch('global', { screen: 'home' });
  const { state } = smart;
  const [query, setQuery] = useState('');
  const [feedback, setFeedback] = useState<SmartFeedbackTarget | null>(null);

  // Фраза, начатая на экране объявлений, но не про них: ответ уже есть
  const handoff = useSmartSearchStore((s) => s.handoff);
  const setHandoff = useSmartSearchStore((s) => s.setHandoff);
  const { show } = smart;
  const { run } = smart;
  useEffect(() => {
    if (!handoff) return;
    setQuery(handoff.text);
    if (handoff.response) show(handoff.text, handoff.response);
    else void run(handoff.text, handoff.screen ? { screen: handoff.screen, fresh: true } : {});
    setHandoff(null);
  }, [handoff, setHandoff, show, run]);

  const submit = (text: string, options: { screen?: Screen } = {}) => {
    const clean = text.trim();
    if (!clean) return;
    setQuery(clean);
    Keyboard.dismiss();
    void smart.run(clean, options);
  };

  const clear = () => {
    setQuery('');
    smart.reset();
    inputRef.current?.focus();
  };

  const openListings = (part: SmartSearchPart, response: SmartSearchResponse, text: string) => {
    const target = applySmartListing(part, text, response.requestId);
    router.push({ pathname: '/listings/list', params: target });
  };

  const pick = (option: SmartSearchClarificationOption, text: string) => {
    if (option.kind === 'category') {
      router.push({ pathname: '/listings/list', params: { slug: option.value } });
      return;
    }
    if (option.kind === 'domain') {
      // «Где искать?» — та же фраза, но с подсказкой раздела
      submit(text, { screen: option.value as Screen });
      return;
    }
    submit(option.value);
  };

  const wrong = (
    response: SmartSearchResponse | null,
    text: string,
    failureType: SmartFeedbackTarget['failureType'],
  ) =>
    setFeedback({
      ...(response ? { requestId: response.requestId } : {}),
      originalQuery: text,
      failureType,
      screen: 'home',
    });

  return (
    <View style={styles.root}>
      <AppBackground />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Поиск</Text>

        <View style={styles.searchField}>
          <Icon name="search" size={20} color={colors.textFaint} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => submit(query)}
            placeholder="Что ищете? Пишите своими словами"
            placeholderTextColor={colors.textFaint}
            returnKeyType="search"
            accessibilityLabel="Строка поиска"
            style={styles.searchInput}
          />
          {query.length > 0 && (
            <Pressable
              onPress={clear}
              accessibilityRole="button"
              accessibilityLabel="Очистить"
              hitSlop={10}
            >
              <Icon name="close" size={16} color={colors.textFaint} />
            </Pressable>
          )}
        </View>

        {state.phase === 'thinking' && <SmartThinking />}

        {state.phase === 'done' && (
          <Answer
            text={state.text}
            response={state.response}
            onOpenListings={(part) => openListings(part, state.response, state.text)}
            onPick={(option) => pick(option, state.text)}
            onWrong={(failureType) => wrong(state.response, state.text, failureType)}
            onEditQuery={() => inputRef.current?.focus()}
            onRetry={() => submit(state.text)}
          />
        )}

        {state.phase === 'failed' && <Failed state={state} onRetry={() => submit(state.text)} />}

        {state.phase === 'idle' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Часто ищут</Text>

            <View style={styles.chips}>
              {SUGGESTIONS.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => submit(item)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
                >
                  <Text style={styles.chipText}>{item}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <SmartFeedbackSheet target={feedback} onClose={() => setFeedback(null)} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Ответ
// ─────────────────────────────────────────────────────────────────────────────

function Answer({
  text,
  response,
  onOpenListings,
  onPick,
  onWrong,
  onEditQuery,
  onRetry,
}: {
  text: string;
  response: SmartSearchResponse;
  onOpenListings: (part: SmartSearchPart) => void;
  onPick: (option: SmartSearchClarificationOption) => void;
  onWrong: (failureType: SmartFeedbackTarget['failureType']) => void;
  onEditQuery: () => void;
  onRetry: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const outcome = smartSearchOutcome(response);

  if (outcome.kind === 'fallback') {
    // Умный поиск не сработал — обычный поиск по той же фразе работает всегда
    return (
      <View style={styles.answer}>
        <SmartNotice
          title={
            outcome.code === 'AI_TIMEOUT'
              ? 'Не удалось обработать запрос. Попробуйте ещё раз.'
              : outcome.message
          }
          actions={[{ label: 'Повторить', onPress: onRetry }]}
          onWrong={() => onWrong('not_understood')}
        />
        <FallbackListings text={outcome.text || text} />
      </View>
    );
  }

  return (
    <View style={styles.answer}>
      {outcome.parts.map((part, index) => (
        <PartView
          key={`${part.domain ?? 'none'}-${index}`}
          part={part}
          onOpenListings={() => onOpenListings(part)}
          onPick={onPick}
          onWrong={onWrong}
          onEditQuery={onEditQuery}
        />
      ))}
    </View>
  );
}

function PartView({
  part,
  onOpenListings,
  onPick,
  onWrong,
  onEditQuery,
}: {
  part: SmartSearchPart;
  onOpenListings: () => void;
  onPick: (option: SmartSearchClarificationOption) => void;
  onWrong: (failureType: SmartFeedbackTarget['failureType']) => void;
  onEditQuery: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const setRadius = useListingAreaStore((s) => s.setRadius);
  const radiusKm = useListingAreaStore((s) => s.radiusKm);
  const section = part.domain ? SMART_SEARCH_SECTIONS[part.domain] : null;
  const openSection = section
    ? { label: `Открыть «${section.label}»`, onPress: () => router.push(section.route as Href) }
    : null;

  if (part.status === 'clarification' && part.clarification) {
    return (
      <SmartClarificationBlock
        clarification={part.clarification}
        onPick={onPick}
        onWrong={() => onWrong('not_understood')}
      />
    );
  }

  if (part.status === 'unsupported') {
    return (
      <SmartNotice
        title={part.message}
        actions={openSection ? [openSection] : []}
        onWrong={() => onWrong('wrong_domain')}
      />
    );
  }

  const summary = part.query ? understoodSummary(part.query) : '';
  const understood = summary ? (
    <SmartUnderstood
      summary={summary}
      notes={part.query ? understoodNotes(part.query) : []}
      onWrong={() => onWrong('wrong_conditions')}
    />
  ) : null;

  if (part.status === 'no_results') {
    const actions: SmartAction[] = [
      { label: 'Изменить запрос', onPress: onEditQuery },
      { label: 'Изменить город', onPress: () => router.push('/city-picker') },
    ];
    if (part.domain === 'listings') {
      actions.push({
        label: 'Увеличить радиус',
        onPress: () => {
          onOpenListings();
          setRadius(widerRadius(useListingAreaStore.getState().radiusKm ?? radiusKm));
        },
      });
      if ((part.query?.conditions.length ?? 0) > 1)
        actions.push({ label: 'Убрать один из фильтров', onPress: onOpenListings });
    } else if (openSection) {
      actions.push(openSection);
    }
    return (
      <View style={styles.part}>
        {understood}
        <SmartNotice title="По вашему запросу ничего не найдено" actions={actions} />
      </View>
    );
  }

  const results = part.results;
  if (!results) return understood;

  return (
    <View style={styles.part}>
      {understood}
      <Text style={styles.partTitle}>{part.message}</Text>

      {results.domain === 'listings' && (
        <>
          <ListingPreview items={results.page.items.slice(0, PREVIEW.listings)} />
          <MoreButton
            label={part.message.replace('Нашлось', 'Показать все')}
            onPress={onOpenListings}
          />
        </>
      )}

      {results.domain === 'cinema' && (
        <>
          {results.schedule.slice(0, PREVIEW.cinema).map((item) => (
            <MovieRow key={item.movie.id} item={item} onOpen={() => router.push('/cinema')} />
          ))}
          <MoreButton label="Всё расписание" onPress={() => router.push('/cinema')} />
        </>
      )}

      {results.domain === 'news' && <NewsPreview items={results.items.slice(0, PREVIEW.news)} />}

      {results.domain === 'delivery' && (
        <>
          {results.page.items.slice(0, PREVIEW.delivery).map((place) => (
            <PlaceCard
              key={place.id}
              place={place}
              onOpen={() => router.push({ pathname: '/places/[id]', params: { id: place.id } })}
            />
          ))}
          <MoreButton label="Все заведения" onPress={() => router.push('/places')} />
        </>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Выдача разделов
// ─────────────────────────────────────────────────────────────────────────────

function ListingPreview({ items }: { items: SmartSearchListingItem[] }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const rows: SmartSearchListingItem[][] = [];
  for (let index = 0; index < items.length; index += 2) rows.push(items.slice(index, index + 2));

  return (
    <View style={styles.grid}>
      {rows.map((row) => (
        <View key={row.map((item) => item.id).join('-')} style={styles.gridRow}>
          {row.map((item) => (
            <ListingCard
              key={item.id}
              listing={item}
              maxFacts={3}
              onOpen={() => router.push({ pathname: '/listings/[id]', params: { id: item.id } })}
            />
          ))}
          {row.length === 1 && <View style={styles.gridGap} />}
        </View>
      ))}
    </View>
  );
}

type SmartSearchListingItem = Extract<
  NonNullable<SmartSearchPart['results']>,
  { domain: 'listings' }
>['page']['items'][number];

type SmartNewsItem = Extract<
  NonNullable<SmartSearchPart['results']>,
  { domain: 'news' }
>['items'][number];

function NewsPreview({ items }: { items: SmartNewsItem[] }) {
  const router = useRouter();
  const cityId = useCityStore((s) => s.cityId);
  const { data: cities } = useCities();
  const timeZone = cities?.find((city) => city.id === cityId)?.timezone ?? 'Europe/Moscow';

  return (
    <>
      {items.map((item) => (
        <NewsCard
          key={item.id}
          item={item}
          timeZone={timeZone}
          onOpen={() => router.push({ pathname: '/news/[id]', params: { id: item.id } })}
        />
      ))}
      <MoreButton label="Все новости" onPress={() => router.push('/news')} />
    </>
  );
}

/** Фильм и ближайшие сеансы: время берётся из строки — оно уже местное. */
function MovieRow({ item, onOpen }: { item: MovieShowtimesDto; onOpen: () => void }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const times = item.showtimes.slice(0, 6).map((showtime) => showtime.startTime.slice(11, 16));
  const cinemas = [...new Set(item.showtimes.map((showtime) => showtime.cinemaName))];

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      style={({ pressed }) => [styles.movie, pressed && styles.pressed]}
    >
      <View style={styles.movieHead}>
        <Icon name="cinema" size={18} color={colors.primary} />
        <Text style={styles.movieTitle} numberOfLines={1}>
          {item.movie.title}
        </Text>
        {item.movie.ageRating ? <Text style={styles.movieMeta}>{item.movie.ageRating}</Text> : null}
      </View>
      <Text style={styles.movieMeta} numberOfLines={1}>
        {[item.movie.genres.slice(0, 2).join(', '), cinemas.slice(0, 2).join(', ')]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      <View style={styles.times}>
        {times.map((time, index) => (
          <Text key={`${time}-${index}`} style={styles.time}>
            {time}
          </Text>
        ))}
      </View>
    </Pressable>
  );
}

function MoreButton({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.more, pressed && styles.pressed]}
    >
      <Text style={styles.moreLabel}>{label}</Text>
      <Icon name="chevron-right" size={14} color={colors.primary} />
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Запасной путь: обычный поиск
// ─────────────────────────────────────────────────────────────────────────────

/** Ответа нет вовсе (сеть, не дождались): сообщение и обычный поиск по фразе. */
function Failed({
  state,
  onRetry,
}: {
  state: Extract<SmartSearchState, { phase: 'failed' }>;
  onRetry: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.answer}>
      <SmartNotice title={state.message} actions={[{ label: 'Повторить', onPress: onRetry }]} />
      {state.reason !== 'network' && <FallbackListings text={state.text} />}
    </View>
  );
}

/**
 * Обычный поиск по объявлениям — по словам фразы, как до умного поиска.
 * Безопасен всегда: ничего не додумывает и не применяет условий.
 */
function FallbackListings({ text }: { text: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const cityId = useCityStore((s) => s.cityId);
  const area = useListingArea();
  const filters = useMemo(() => ({ search: text, ...area.filters }), [text, area.filters]);
  const feed = useListings(cityId, filters, area.ready && text.length >= 2);
  const items = feed.data?.pages[0]?.items ?? [];

  if (feed.isLoading || items.length === 0) return null;
  return (
    <View style={styles.part}>
      <Text style={styles.partTitle}>Обычный поиск по объявлениям</Text>
      <ListingPreview items={items.slice(0, PREVIEW.listings)} />
      <MoreButton
        label="Показать все"
        onPress={() => router.push({ pathname: '/listings/list', params: { q: text } })}
      />
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },

    title: { ...typography.title, color: colors.text },

    searchField: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 52,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchInput: { ...typography.body, flex: 1, color: colors.text, paddingVertical: spacing.md },

    section: { gap: spacing.md },
    sectionTitle: { ...typography.subheading, color: colors.text },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.full,
      backgroundColor: colors.surfaceMuted,
      minHeight: 44,
      justifyContent: 'center',
    },
    chipText: { ...typography.caption, color: colors.text },

    answer: { gap: spacing.lg },
    part: { gap: spacing.md },
    partTitle: { ...typography.subheading, color: colors.text },

    grid: { gap: spacing.md },
    gridRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'stretch' },
    gridGap: { flex: 1 },

    movie: {
      gap: spacing.xs,
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    movieHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    movieTitle: { ...typography.body, color: colors.text, fontWeight: '600', flex: 1 },
    movieMeta: { ...typography.caption, color: colors.textMuted },
    times: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
    time: {
      ...typography.caption,
      color: colors.primary,
      fontWeight: '600',
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.sm,
      backgroundColor: colors.primarySoft,
      overflow: 'hidden',
    },

    more: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 2,
      minHeight: 44,
    },
    moreLabel: { ...typography.caption, color: colors.primary, fontWeight: '600' },

    pressed: { opacity: 0.7 },
  });
