import { useState, type ReactNode } from 'react';
import {
  Image,
  View,
  type ImageResizeMode,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { TUNNEL_HEADERS } from '../api/client';
import { API_BASE_URL } from '../api/config';

/** Общий кусок пути у всех картинок, которые отдаёт наш сервер. */
const OUR_MEDIA_PATH = '/api/v1/media/public/';

/**
 * Картинка с сервера (Этап 6).
 *
 * Отдельный компонент нужен из-за трёх вещей, которые иначе пришлось бы
 * повторять в каждом списке.
 *
 * Первая — заглушка. Ссылка может протухнуть, файл не догрузиться, сети не
 * быть: без запасного вида на месте фотографии остаётся дыра, и карточка
 * выглядит сломанной.
 *
 * Вторая — адрес. Сервер подставляет в ссылку тот адрес, по которому считает
 * себя доступным снаружи, и промахивается: при разработке это то туннель,
 * то localhost. Приложение точно знает, по какому адресу оно само ходит за
 * данными, поэтому свои картинки берёт оттуда же.
 *
 * Третья — заголовки туннеля. Туннель показывает браузеру страницу-
 * предупреждение вместо содержимого. Запросы к API её обходят заголовком,
 * но картинки грузит системный загрузчик, мимо нашего кода, и заголовок
 * нужно приложить отдельно. Только к своим: чужим сайтам он ни к чему.
 */
export function RemoteImage({
  uri,
  style,
  containerStyle,
  resizeMode = 'cover',
  fallback,
}: {
  uri: string | null | undefined;
  style: StyleProp<ImageStyle>;
  /** Стиль подложки под заглушкой, если он отличается от стиля картинки */
  containerStyle?: StyleProp<ViewStyle>;
  resizeMode?: ImageResizeMode;
  /** Что показать, когда картинки нет или она не загрузилась */
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(false);

  if (!uri || failed) {
    return <View style={[style, containerStyle]}>{fallback}</View>;
  }

  const ours = uri.indexOf(OUR_MEDIA_PATH);
  const source =
    ours >= 0
      ? {
          uri: `${API_BASE_URL.replace(/\/$/, '')}/media/public/${uri.slice(ours + OUR_MEDIA_PATH.length)}`,
          headers: TUNNEL_HEADERS,
        }
      : { uri };

  return (
    <Image source={source} style={style} resizeMode={resizeMode} onError={() => setFailed(true)} />
  );
}
