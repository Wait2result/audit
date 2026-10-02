import { useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';

import bgClear from '../../assets/images/weather/bg_weather_01_clear.jpg';
import bgPartlyCloudy from '../../assets/images/weather/bg_weather_02_partly_cloudy.jpg';
import bgCloudy from '../../assets/images/weather/bg_weather_03_cloudy.jpg';
import bgRain from '../../assets/images/weather/bg_weather_04_rain.jpg';
import bgThunderstorm from '../../assets/images/weather/bg_weather_05_thunderstorm.jpg';
import bgNight from '../../assets/images/weather/bg_weather_06_night.jpg';
import { WEATHER_BACKGROUND_COLOR, type WeatherBackgroundKey } from '../utils/weather-theme';

const BACKGROUNDS: Record<WeatherBackgroundKey, number> = {
  clear: bgClear,
  partly_cloudy: bgPartlyCloudy,
  cloudy: bgCloudy,
  rain: bgRain,
  storm: bgThunderstorm,
  night: bgNight,
};

/** Файл фотографии под состояние — нужен и заставке при запуске, чтобы
 *  заранее загрузить снимок текущей погоды для виджета на главной. */
export function weatherBackgroundSource(key: WeatherBackgroundKey): number {
  return BACKGROUNDS[key];
}

/**
 * Лёгкое затемнение поверх фотографии — ровно настолько, чтобы интерфейс
 * оставался главным на любом снимке, а не для того, чтобы спрятать фото.
 * Не серый и не синий сплошняком: тёплый нейтрально-тёмный, почти невидимый
 * сам по себе, просто чуть притушивает самые яркие места снимка под текстом.
 */
const READABILITY_OVERLAY = 'rgba(8,14,20,0.16)';

const FADE_DURATION_MS = 400;

/**
 * Фотография неба под шесть состояний погоды (см. `weatherBackgroundKey` в
 * `weather-theme.ts`) — общий слой для двух очень разных по форме мест:
 * полноэкранного фона экрана погоды (`WeatherBackground.tsx`, портрет во весь
 * экран) и маленькой широкой карточки виджета на главной (`WeatherWidget.tsx`,
 * пейзаж). Оба передают сюда только явные пиксельные `width`/`height` под
 * свою форму — сама фотография и её обрезка `cover`-ом при этом остаются
 * той же, что и задумано (см. безопасную зону в комментарии к самим файлам
 * в `assets/images/weather`: главный объект держат ближе к центру кадра,
 * чтобы он уцелел в обеих, очень разных по пропорциям, обрезках).
 *
 * Явные `width`/`height` вместо `StyleSheet.absoluteFill` — обход известного
 * бага react-native-web: внутренний слой, которым react-native-web оборачивает
 * `<img>`, не всегда наследует высоту/ширину, растянутую через абсолютное
 * позиционирование, и садится на собственные пиксельные размеры файла. Тот же
 * приём уже применён в `AppBackground.tsx`.
 *
 * Смена фона — не резкая замена, а перекрёстное растворение: пока не отпустят
 * прошлый снимок, следующий проступает поверх него по прозрачности.
 *
 * Под фотографией — сплошная заливка цветом того же неба
 * (`WEATHER_BACKGROUND_COLOR`): она видна, пока снимок ещё не отрисован,
 * вместо светлой подложки приложения.
 */
export function WeatherSkyPhoto({
  backgroundKey,
  width,
  height,
}: {
  backgroundKey: WeatherBackgroundKey;
  width: number;
  height: number;
}) {
  const [current, setCurrent] = useState(backgroundKey);
  const [previous, setPrevious] = useState<WeatherBackgroundKey | null>(null);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (backgroundKey === current) return;

    setPrevious(current);
    setCurrent(backgroundKey);
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: FADE_DURATION_MS,
      useNativeDriver: true,
    }).start(() => setPrevious(null));
    // current сознательно не в зависимостях: эффект должен сработать один раз
    // на смену backgroundKey, а не на каждое обновление current изнутри себя
  }, [backgroundKey]);

  const imageStyle = { position: 'absolute' as const, top: 0, left: 0, width, height };

  return (
    <View style={StyleSheet.absoluteFill}>
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: WEATHER_BACKGROUND_COLOR[current] }]}
      />

      {previous && <Image source={BACKGROUNDS[previous]} resizeMode="cover" style={imageStyle} />}

      <Animated.Image
        source={BACKGROUNDS[current]}
        resizeMode="cover"
        style={[imageStyle, previous ? { opacity: fade } : null]}
      />

      <View style={[StyleSheet.absoluteFill, { backgroundColor: READABILITY_OVERLAY }]} />
    </View>
  );
}
