import { Alert, Platform } from 'react-native';

/**
 * Диалог подтверждения, который работает одинаково на телефоне и в вебе.
 *
 * `Alert.alert` на React Native Web ничего не показывает: вызов проходит
 * без ошибки, но окна нет и ни один из колбэков не срабатывает — кнопка,
 * подписанная на такой диалог, выглядит так, будто вообще не реагирует
 * на нажатие. На iOS и Android, наоборот, только `Alert.alert` даёт
 * системный вид диалога. Поэтому здесь два пути: настоящий `Alert` на
 * телефоне, `window.confirm` в браузере.
 */
export function confirmAsync(
  title: string,
  message?: string,
  options?: { confirmLabel?: string; cancelLabel?: string; destructive?: boolean },
): Promise<boolean> {
  if (Platform.OS === 'web') {
    const text = message ? `${title}\n\n${message}` : title;
    return Promise.resolve(window.confirm(text));
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: options?.cancelLabel ?? 'Отмена', style: 'cancel', onPress: () => resolve(false) },
      {
        text: options?.confirmLabel ?? 'Да',
        style: options?.destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}
