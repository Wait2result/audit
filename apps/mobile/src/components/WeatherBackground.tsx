import { useWindowDimensions } from 'react-native';

import type { WeatherBackgroundKey } from '../utils/weather-theme';
import { WeatherSkyPhoto } from './WeatherSkyPhoto';

/**
 * Фон экрана погоды во весь экран — настоящая фотография неба (см.
 * `WeatherSkyPhoto`), размером ровно с экран (`useWindowDimensions()`), как
 * и `AppBackground` на остальных экранах приложения: `Screen` держит его
 * неподвижным слоем под содержимым, и карточки прокручиваются поверх него.
 */
export function WeatherBackground({ backgroundKey }: { backgroundKey: WeatherBackgroundKey }) {
  const { width, height } = useWindowDimensions();
  return <WeatherSkyPhoto backgroundKey={backgroundKey} width={width} height={height} />;
}
