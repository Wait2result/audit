import { createElement, useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { useIsDarkTheme, useThemeColors } from '../theme';
import {
  buildMapHtml,
  mapStateOf,
  parseMapMessage,
  type LeafletMapProps,
} from './leaflet-map-html';

export type { MapFocus } from './leaflet-map-html';

interface MapWindow extends Window {
  dg?: {
    setState: (state: unknown, initial?: boolean) => void;
    focus: (lat: number, lng: number, zoom: number) => void;
  };
}

/**
 * Веб-вариант карты: та же страница Leaflet, что и на телефоне, но в iframe —
 * у WebView веб-реализации нет. Команды идут прямым вызовом в окно iframe
 * (страница своя, `srcdoc` — того же источника), события — через
 * `postMessage`.
 */
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
  const frame = useRef<HTMLIFrameElement | null>(null);
  const ready = useRef(false);
  const onPickRef = useRef(props.onPick);
  onPickRef.current = props.onPick;

  const state = useMemo(
    () => mapStateOf({ center, marker, radiusKm, areaMeters }),
    [marker, radiusKm, areaMeters],
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  const html = useMemo(
    () => buildMapHtml({ center, zoom, interactive, dark, accent: colors.primary }),
    [dark, interactive, colors.primary],
  );

  const mapWindow = useCallback((): MapWindow | null => {
    if (!ready.current) return null;
    return (frame.current?.contentWindow as MapWindow | null) ?? null;
  }, []);

  useEffect(() => {
    ready.current = false;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const message = parseMapMessage(event.data);
      if (!message) return;
      if (message.type === 'ready') {
        ready.current = true;
        mapWindow()?.dg?.setState(stateRef.current, true);
        return;
      }
      onPickRef.current?.({ latitude: message.lat, longitude: message.lng });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [html, mapWindow]);

  useEffect(() => {
    mapWindow()?.dg?.setState(state);
  }, [state, mapWindow]);

  useEffect(() => {
    if (!focus) return;
    mapWindow()?.dg?.focus(focus.point.latitude, focus.point.longitude, focus.zoom);
  }, [focus, mapWindow]);

  return (
    <View
      style={[styles.box, { borderColor: colors.border, backgroundColor: colors.surface }, style]}
    >
      {createElement('iframe', {
        key: html,
        ref: frame,
        srcDoc: html,
        title: 'Карта',
        style: { border: 0, width: '100%', height: '100%', display: 'block' },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
});
