import type {
  SmartSearchChoice,
  SmartSearchClarificationOption,
  SmartSearchPart,
  SmartSearchResponse,
} from '@dagestan/shared';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBackground } from '../../src/components/AppBackground';
import { Icon } from '../../src/components/Icon';
import {
  SmartFeedbackSheet,
  type SmartFeedbackTarget,
} from '../../src/components/SmartSearchBlocks';
import { AnswerView, collapsedText } from '../../src/components/smart-search/AnswerView';
import {
  AssistantMessage,
  CollapsedAnswer,
  SearchComposer,
  ThinkingMessage,
  UserMessage,
} from '../../src/components/smart-search/ChatParts';
import { SectionCard } from '../../src/components/smart-search/SectionCard';
import { useSmartSearch } from '../../src/hooks/use-smart-search';
import { useSmartSearchStore, type SmartDialogTurn } from '../../src/store/smart-search-store';
import { radius, spacing, typography, useThemeColors } from '../../src/theme';
import { openListingFilters, openSection, plainWords } from '../../src/utils/smart-navigation';

/**
 * Поиск по всему приложению — навигатор.
 *
 * Человек пишет, что хочет; поиск понимает, в какой раздел вести и с
 * какими условиями, и показывает короткую карточку с кнопкой «Открыть».
 * Выдачи здесь нет: её показывает сам раздел (объявления, кино, заведения,
 * доставка, новости, погода) с уже применёнными условиями.
 *
 * Лёгкий диалог: следующая фраза уточняет прошлую («до миллиона»,
 * «автомат»), нажатый вариант исполняется без модели. История — до
 * «Новый поиск» или перезапуска приложения.
 */

const EXAMPLES = [
  'Хочу купить машину',
  'Квартира посуточно в Махачкале',
  'Где поесть хинкал?',
  'Что посмотреть в кино?',
  'Хочу пиццу',
  'Погода завтра',
];

/** Короткая фраза-уточнение: «до миллиона», «а автомат?» — для подписи «Обновил условия». */
function looksLikeFollowUp(text: string): boolean {
  const value = text.toLowerCase().trim();
  if (/^(а|и|ещё|еще|только|без|с|до|от|в|во|на)\s/u.test(value)) return true;
  if (/(^|\s)(хочу|нужен|нужна|ищу|где|что|какая|какой|покажи|найди)(\s|$)/u.test(value))
    return false;
  return value.split(/\s+/).length <= 3;
}

type AskOptions = {
  choice?: SmartSearchChoice;
  phrase?: string;
  refined?: boolean;
  screen?: 'cinema' | 'news' | 'delivery' | 'home';
};

export default function SearchScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  const dialog = useSmartSearchStore((s) => s.dialog);
  const pushTurn = useSmartSearchStore((s) => s.pushTurn);
  const updateTurn = useSmartSearchStore((s) => s.updateTurn);
  const dropTurn = useSmartSearchStore((s) => s.dropTurn);
  const clearDialog = useSmartSearchStore((s) => s.clearDialog);
  const handoff = useSmartSearchStore((s) => s.handoff);
  const setHandoff = useSmartSearchStore((s) => s.setHandoff);

  const { run, reset } = useSmartSearch('global', { screen: 'home' });
  const [draft, setDraft] = useState('');
  const [feedback, setFeedback] = useState<SmartFeedbackTarget | null>(null);
  const busy = dialog.some((turn) => turn.phase === 'thinking');

  /** Фраза или нажатый вариант → новая реплика и ответ на неё. */
  const ask = useCallback(
    async (text: string, options: AskOptions = {}) => {
      const clean = text.trim();
      if (!clean) return;
      // Недождавшийся прежний ответ больше не нужен: на экране — ответ на последнее
      for (const turn of useSmartSearchStore.getState().dialog)
        if (turn.phase === 'thinking') dropTurn(turn.id);
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      pushTurn({
        id,
        text: clean,
        phrase: options.phrase ?? clean,
        refined: options.refined ?? looksLikeFollowUp(clean),
        phase: 'thinking',
      });
      Keyboard.dismiss();
      const result = await run(clean, {
        ...(options.choice ? { choice: options.choice } : {}),
        ...(options.screen ? { screen: options.screen, fresh: true } : {}),
      });
      if (result.phase === 'done') updateTurn(id, { phase: 'done', response: result.response });
      else if (result.phase === 'failed')
        updateTurn(id, { phase: 'failed', failure: result.message });
      else dropTurn(id);
    },
    [dropTurn, pushTurn, run, updateTurn],
  );

  // Фраза, начатая на экране объявлений, но не про них: ответ уже есть
  useEffect(() => {
    if (!handoff) return;
    setHandoff(null);
    if (handoff.response) {
      pushTurn({
        id: `${Date.now()}-handoff`,
        text: handoff.text,
        phrase: handoff.text,
        refined: false,
        phase: 'done',
        response: handoff.response,
      });
    } else if (handoff.choice) {
      void ask(handoff.text, {
        choice: handoff.choice,
        ...(handoff.phrase ? { phrase: handoff.phrase } : {}),
      });
    } else {
      void ask(handoff.text, handoff.screen ? { screen: handoff.screen } : {});
    }
  }, [ask, handoff, pushTurn, setHandoff]);

  const submit = () => {
    const text = draft;
    setDraft('');
    void ask(text);
  };

  const startOver = () => {
    reset();
    clearDialog();
    setDraft('');
    inputRef.current?.focus();
  };

  const openFallback = (phrase: string) =>
    router.push({ pathname: '/listings/list', params: { q: plainWords(phrase) } });

  const actionsFor = (turn: SmartDialogTurn, response: SmartSearchResponse) => {
    const context = { requestId: response.requestId, text: turn.phrase };
    return {
      open: (part: SmartSearchPart, plain = false) => openSection(part, context, plain),
      edit: (part: SmartSearchPart) => openListingFilters(part, context),
      choose: (option: SmartSearchClarificationOption) => {
        if (option.choice) {
          void ask(option.label, {
            choice: { requestId: response.requestId, ...option.choice },
            phrase: turn.phrase,
            refined: option.choice.kind === 'filter',
          });
        } else {
          void ask(option.value);
        }
      },
      editQuery: () => inputRef.current?.focus(),
      retry: () => void ask(turn.phrase),
      plainSearch: () => openFallback(turn.phrase),
      wrong: () =>
        setFeedback({
          requestId: response.requestId,
          originalQuery: turn.phrase,
          failureType: response.status === 'clarification' ? 'not_understood' : 'wrong_conditions',
          screen: 'home',
        }),
    };
  };

  const lastAnswered = [...dialog].reverse().find((turn) => turn.phase !== 'thinking');

  return (
    <View style={styles.root}>
      <AppBackground />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
          <Text style={styles.title} accessibilityRole="header">
            Поиск
          </Text>
          {dialog.length > 0 && (
            <Pressable
              onPress={startOver}
              accessibilityRole="button"
              accessibilityLabel="Новый поиск"
              hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
              style={({ pressed }) => [styles.newSearch, pressed && styles.pressed]}
            >
              <Icon name="plus" size={16} color={colors.primary} />
              <Text style={styles.newSearchLabel}>Новый поиск</Text>
            </Pressable>
          )}
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.chat}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {dialog.length === 0 ? (
            <View style={styles.idle}>
              <Text style={styles.hint}>
                Напишите своими словами — откроем нужный раздел с готовыми условиями.
              </Text>
              <Text style={styles.examplesTitle}>Например:</Text>
              <View style={styles.examples}>
                {EXAMPLES.map((example) => (
                  <Pressable
                    key={example}
                    onPress={() => void ask(example)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.example, pressed && styles.pressed]}
                  >
                    <Text style={styles.exampleText}>{example}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            dialog.map((turn, index) => {
              const previousDomain =
                dialog
                  .slice(0, index)
                  .reverse()
                  .find((item) => item.phase === 'done')?.response?.parts[0]?.domain ?? null;
              return (
                <View key={turn.id} style={styles.turn}>
                  <UserMessage text={turn.text} />
                  {turn.phase === 'thinking' && <ThinkingMessage />}
                  {turn.phase === 'failed' && (
                    <AssistantMessage lead={turn.failure ?? 'Не удалось обработать запрос'}>
                      <SectionCard
                        icon="search"
                        eyebrow="Поиск"
                        path="Попробуйте ещё раз"
                        body="Проверьте соединение — или поищите по словам в объявлениях."
                        cta="Повторить"
                        ctaVariant="secondary"
                        onOpen={() => void ask(turn.phrase)}
                        secondary={{
                          label: 'Искать по словам в объявлениях',
                          onPress: () => openFallback(turn.phrase),
                        }}
                      />
                    </AssistantMessage>
                  )}
                  {turn.phase === 'done' && turn.response && turn.id === lastAnswered?.id && (
                    <AnswerView
                      response={turn.response}
                      previousDomain={turn.refined ? previousDomain : null}
                      actions={actionsFor(turn, turn.response)}
                    />
                  )}
                  {turn.phase === 'done' && turn.response && turn.id !== lastAnswered?.id && (
                    <Collapsed turn={turn} response={turn.response} />
                  )}
                </View>
              );
            })
          )}
        </ScrollView>

        <View style={styles.composerWrap}>
          <SearchComposer
            ref={inputRef}
            value={draft}
            onChange={setDraft}
            onSubmit={submit}
            busy={busy}
          />
        </View>
      </KeyboardAvoidingView>

      <SmartFeedbackSheet target={feedback} onClose={() => setFeedback(null)} />
    </View>
  );
}

/** Прошлый ответ — одна строка; нажатие открывает тот же раздел с теми же условиями. */
function Collapsed({ turn, response }: { turn: SmartDialogTurn; response: SmartSearchResponse }) {
  const { icon, text } = collapsedText(response);
  const part = response.parts[0];
  const navigable = part && (part.status === 'results' || part.status === 'no_results');
  return (
    <CollapsedAnswer
      icon={icon}
      text={text}
      {...(navigable
        ? {
            onPress: () => openSection(part, { requestId: response.requestId, text: turn.phrase }),
          }
        : {})}
    />
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
    },
    title: { ...typography.title, color: colors.text },
    newSearch: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
    newSearchLabel: { ...typography.caption, color: colors.primary, fontWeight: '600' },

    chat: {
      flexGrow: 1,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
      paddingBottom: spacing.lg,
      gap: spacing.md,
    },
    turn: { gap: spacing.md },

    idle: { gap: spacing.md, paddingTop: spacing.xs },
    hint: { ...typography.body, color: colors.textMuted, lineHeight: 21 },
    examplesTitle: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
    examples: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    example: {
      minHeight: 40,
      justifyContent: 'center',
      paddingHorizontal: spacing.md + 2,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderStrong,
    },
    exampleText: { ...typography.caption, color: colors.text },

    composerWrap: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
    },

    pressed: { opacity: 0.85 },
  });
