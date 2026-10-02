import { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

import { API_BASE_URL } from '../api/config';
import { useIsDarkTheme, useThemeColors } from '../theme';
import {
  buildMapHtml,
  mapStateOf,
  parseMapMessage,
  type LeafletMapProps,
} from './leaflet-map-html';

export type { MapFocus } from './leaflet-map-html';

/**
 * Карта приложения — одна на всё: выбор места объявления, место поиска с
 * кругом радиуса, место в карточке объявления.
 *
 * Своих карт в Expo Go нет (react-native-maps требует отдельной сборки),
 * поэтому это Leaflet внутри WebView. Страница собирается один раз, дальше
 * приложение двигает метку, круг и камеру командами (`injectJavaScript`), а
 * страница сообщает о нажатии и перетаскивании (`postMessage`) — без
 * перезагрузки и мигания. В веб-сборке та же страница живёт в iframe
 * (`LeafletMap.web.tsx`).
 *
 * Подложка — тайлы OpenStreetMap (или свой поставщик через
 * EXPO_PUBLIC_MAP_TILE_URL, см. leaflet-map-html.ts), в тёмной теме —
 * затемнённые фильтром. Подпись источника обязательна по условиям OSM.
 */

/**
 * Адрес, от имени которого открыта страница карты. Без него у страницы
 * нет источника (about:blank), и запросы тайлов уходят без Referer —
 * правила OSM такие запросы отклоняют. Источник — свой сервер API.
 */
const MAP_BASE_URL = (() => {
  const match = /^https?:\/\/[^/]+/.exec(API_BASE_URL);
  return match ? `${match[0]}/` : undefined;
})();

export function LeafletMap(props: LeafletMapProps) {
  const {
    center,
    zoom = 13,
    marker,
    radiusKm,
    areaMeters,
    interactive = false,
    focus,
    style,
  } = props;
  const colors = useThemeColors();
  const dark = useIsDarkTheme();
  const webView = useRef<WebView>(null);
  const ready = useRef(false);
  const onPickRef = useRef(props.onPick);
  onPickRef.current = props.onPick;

  const state = useMemo(
    () => mapStateOf({ center, marker, radiusKm, areaMeters }),
    [marker, radiusKm, areaMeters],
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  // Страница собирается один раз на тему: центр — только стартовый,
  // дальше камеру двигают команды
  const html = useMemo(
    () => buildMapHtml({ center, zoom, interactive, dark, accent: colors.primary }),
    [dark, interactive, colors.primary],
  );

  const run = useCallback((script: string) => {
    if (!ready.current) return;
    webView.current?.injectJavaScript(`try { ${script} } catch (e) {} true;`);
  }, []);

  useEffect(() => {
    run(`window.dg.setState(${JSON.stringify(state)});`);
  }, [state, run]);

  useEffect(() => {
    if (!focus) return;
    run(`window.dg.focus(${focus.point.latitude}, ${focus.point.longitude}, ${focus.zoom});`);
  }, [focus, run]);

  const onMessage = (event: WebViewMessageEvent) => {
    const message = parseMapMessage(event.nativeEvent.data);
    if (!message) return;
    if (message.type === 'ready') {
      ready.current = true;
      run(`window.dg.setState(${JSON.stringify(stateRef.current)}, true);`);
      return;
    }
    onPickRef.current?.({ latitude: message.lat, longitude: message.lng });
  };

  return (
    <View
      style={[styles.box, { borderColor: colors.border, backgroundColor: colors.surface }, style]}
    >
      <WebView
        ref={webView}
        key={dark ? 'dark' : 'light'}
        source={MAP_BASE_URL ? { html, baseUrl: MAP_BASE_URL } : { html }}
        style={styles.map}
        onMessage={onMessage}
        onLoadStart={() => {
          ready.current = false;
        }}
        // Карту двигают пальцем — прокрутка страницы при этом мешает
        scrollEnabled={false}
        nestedScrollEnabled
        originWhitelist={['*']}
        javaScriptEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  map: { flex: 1, backgroundColor: 'transparent' },
});
