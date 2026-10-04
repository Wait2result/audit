import {
  cardConditions,
  describeWeatherCode,
  smartSearchOutcome,
  understoodNotes,
  type SmartSearchClarificationOption,
  type SmartSearchDomain,
  type SmartSearchPart,
  type SmartSearchResponse,
} from '@dagestan/shared';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { spacing, typography, useThemeColors } from '../../theme';
import { SMART_SECTIONS, sectionIconOf, totalOf } from '../../utils/smart-navigation';
import type { IconName } from '../Icon';
import { WeatherIcon } from '../WeatherIcon';
import { AssistantMessage } from './ChatParts';
import { ChoiceList, SectionCard } from './SectionCard';

/**
 * Ответ умного поиска → реплика: «понял → показал куда → открыть».
 * Технических слов нет: ни модели, ни запроса, ни уверенности.
 */

export interface AnswerActions {
  /** «Открыть …»: раздел с условиями (plain — без условий) */
  open: (part: SmartSearchPart, plain?: boolean) => void;
  /** «Изменить» у объявлений — экран фильтров */
  edit: (part: SmartSearchPart) => void;
  /** Вариант уточнения или быстрое значение: выбор без модели */
  choose: (option: SmartSearchClarificationOption) => void;
  /** «Изменить запрос» — фокус в поле ввода */
  editQuery: () => void;
  retry: () => void;
  /** Поиск по словам в объявлениях — запасной путь */
  plainSearch: () => void;
  wrong: () => void;
}

/** Иконка варианта раздела в уточнении. */
const DOMAIN_ICONS: Readonly<Record<SmartSearchDomain, IconName>> = {
  listings: 'tag',
  places: 'food',
  delivery: 'cart',
  cinema: 'cinema',
  news: 'news',
  weather: 'sun',
  rides: 'rides',
};

export function AnswerView({
  response,
  previousDomain,
  actions,
}: {
  response: SmartSearchResponse;
  /** Раздел прошлого ответа: тот же раздел — «Обновил условия» */
  previousDomain: SmartSearchDomain | null;
  actions: AnswerActions;
}) {
  const outcome = smartSearchOutcome(response);
  if (outcome.kind === 'fallback') {
    return (
      <AssistantMessage lead="Не удалось обработать запрос">
        <SectionCard
          icon="search"
          eyebrow="Поиск"
          path="Попробуйте ещё раз"
          body={
            outcome.code === 'CHOICE_EXPIRED'
              ? 'Этот вариант устарел — напишите запрос заново.'
              : 'Проверьте соединение — или поищите по словам в объявлениях.'
          }
          cta="Повторить"
          ctaVariant="secondary"
          onOpen={actions.retry}
          secondary={{ label: 'Искать по словам в объявлениях', onPress: actions.plainSearch }}
        />
      </AssistantMessage>
    );
  }
  return (
    <>
      {outcome.parts.map((part, index) => (
        <PartView
          key={`${part.domain ?? 'none'}-${index}`}
          part={part}
          refined={index === 0 && previousDomain !== null && previousDomain === part.domain}
          actions={actions}
        />
      ))}
    </>
  );
}

function PartView({
  part,
  refined,
  actions,
}: {
  part: SmartSearchPart;
  refined: boolean;
  actions: AnswerActions;
}) {
  if (part.status === 'clarification' && part.clarification) {
    const options = part.clarification.options;
    const choices = options.filter((option) => option.choice);
    return (
      <AssistantMessage lead={part.clarification.question} onWrong={actions.wrong}>
        {choices.length > 0 ? (
          <ChoiceList
            items={options.map((option) => ({
              icon:
                option.kind === 'domain'
                  ? DOMAIN_ICONS[option.value as SmartSearchDomain]
                  : option.kind === 'city'
                    ? 'location'
                    : 'tag',
              title: option.label,
              ...(option.hint ? { hint: option.hint } : {}),
              onPress: () => actions.choose(option),
            }))}
          />
        ) : options.length > 0 ? (
          <ChoiceList
            items={options.map((option) => ({
              icon:
                option.kind === 'city' ? 'location' : option.kind === 'movie' ? 'cinema' : 'search',
              title: option.label,
              onPress: () => actions.choose(option),
            }))}
          />
        ) : (
          <HintText text="Допишите запрос в поле ниже." />
        )}
      </AssistantMessage>
    );
  }

  const domain = part.domain;
  if (part.status === 'unsupported' || !domain) {
    const rides = domain === 'rides';
    return (
      <AssistantMessage lead={part.message} {...(rides ? {} : { onWrong: actions.wrong })}>
        {rides && (
          <SectionCard
            icon="rides"
            eyebrow="Раздел в работе"
            path="Попутчики"
            body="Здесь можно будет найти поездку между городами или предложить свою."
          />
        )}
      </AssistantMessage>
    );
  }

  const section = SMART_SECTIONS[domain];
  const query = part.query;
  const conditions = query ? cardConditions(query) : [];
  const notes = query ? understoodNotes(query) : [];
  // У новостей тема на экране ленты не выбирается — честно говорим об этом (D10)
  if (domain === 'news' && query?.conditions.some((item) => item.field === 'topic')) {
    notes.push('Лента откроется целиком: темы на экране новостей нет');
  }
  const path = (part.navigation?.path ?? [section.label]).join(
    domain === 'listings' ? ' → ' : ' · ',
  );
  const empty = part.status === 'no_results';
  const lead = empty
    ? 'По этим условиям пока ничего нет'
    : refined
      ? 'Обновил условия'
      : leadFor(domain, conditions.length > 0);
  const last = part.navigation?.path.at(-1);

  return (
    <AssistantMessage lead={lead} onWrong={actions.wrong}>
      <SectionCard
        icon={sectionIconOf(part)}
        eyebrow={section.label}
        path={path}
        conditions={conditions}
        {...(domain === 'listings' && conditions.length > 0
          ? { onEdit: () => actions.edit(part) }
          : {})}
        notes={notes}
        preview={domain === 'weather' ? <WeatherPreview part={part} /> : undefined}
        cta={
          empty
            ? domain === 'listings' && last && last !== 'Все объявления'
              ? `Открыть все ${last.toLowerCase()}`
              : section.cta(null)
            : section.cta(totalOf(part))
        }
        ctaVariant={empty ? 'secondary' : 'primary'}
        onOpen={() => actions.open(part, empty)}
        {...(empty ? { secondary: { label: 'Изменить запрос', onPress: actions.editQuery } } : {})}
        quickValues={(part.suggestions ?? []).map((option) => ({
          label: option.label,
          onPress: () => actions.choose(option),
        }))}
      />
    </AssistantMessage>
  );
}

function leadFor(domain: SmartSearchDomain, withConditions: boolean): string {
  switch (domain) {
    case 'listings':
      return withConditions ? 'Нашёл объявления по вашим условиям' : 'Нашёл подходящий раздел';
    case 'cinema':
      return withConditions ? 'Нашёл сеансы по вашему запросу' : 'Сейчас в кино';
    case 'news':
      return 'Свежие новости';
    case 'places':
      return withConditions ? 'Нашёл заведения по вашему запросу' : 'Нашёл места, где можно поесть';
    case 'delivery':
      return withConditions ? 'Нашёл доставку по вашему запросу' : 'Нашёл доставку еды';
    case 'weather':
      return 'Прогноз погоды';
    case 'rides':
      return 'Попутчики — скоро в приложении';
  }
}

/** Погода — единственный раздел с превью: это и есть ответ (D4). */
function WeatherPreview({ part }: { part: SmartSearchPart }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const results = part.results;
  if (results?.domain !== 'weather') return null;
  const day = results.day;
  const current = results.current;
  const code = current?.conditionCode ?? day?.conditionCode;
  if (code === undefined) return null;
  const condition = describeWeatherCode(code);
  const main = current ? current.temperature : (day?.tempMax ?? 0);
  return (
    <View style={styles.weather}>
      <WeatherIcon name={condition.icon} size={34} />
      <View>
        <Text style={styles.weatherTemp}>{formatTemp(main)}</Text>
        <Text style={styles.weatherText}>
          {day
            ? `${formatTemp(day.tempMin)}…${formatTemp(day.tempMax)} · ${day.conditionText.toLowerCase()}`
            : condition.text.toLowerCase()}
        </Text>
      </View>
    </View>
  );
}

function formatTemp(value: number): string {
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${rounded}°`;
}

function HintText({ text }: { text: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <Text style={styles.hint}>{text}</Text>;
}

/** Строка свёрнутого прошлого ответа: «Объявления · Toyota Succeed · до 1 млн ₽». */
export function collapsedText(response: SmartSearchResponse): { icon: IconName; text: string } {
  const part = response.parts[0];
  if (!part) return { icon: 'search', text: response.message };
  if (part.status === 'clarification') return { icon: 'search', text: part.message };
  const domain = part.domain;
  if (!domain) return { icon: 'search', text: part.message };
  const conditions = part.query ? cardConditions(part.query) : [];
  const path = part.navigation?.path ?? [];
  return {
    icon: sectionIconOf(part),
    text: [SMART_SECTIONS[domain].label, ...(conditions.length > 0 ? conditions : path)]
      .slice(0, 4)
      .join(' · '),
  };
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    weather: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    weatherTemp: { ...typography.heading, color: colors.text },
    weatherText: { ...typography.caption, color: colors.textMuted },
    hint: { ...typography.caption, color: colors.textMuted },
  });
