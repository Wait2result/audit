import type { GeoCoordinates } from '@dagestan/shared';
import type { StyleProp, ViewStyle } from 'react-native';

/**
 * Общее для двух вариантов карты: WebView на телефоне (`LeafletMap.tsx`) и
 * iframe в веб-сборке (`LeafletMap.web.tsx`). Страница одна и та же —
 * различается только канал сообщений.
 */

export interface MapFocus {
  point: GeoCoordinates;
  zoom: number;
  /** Меняется — камера перелетает к точке, даже если точка та же */
  version: number;
}

export interface LeafletMapProps {
  /** Где открыть карту */
  center: GeoCoordinates;
  zoom?: number;
  /** Метка. null — метки нет */
  marker: GeoCoordinates | null;
  /** Круг поиска вокруг метки, км */
  radiusKm?: number | null;
  /** Круг «примерно здесь» без метки — для скрытого адреса, м */
  areaMeters?: number | null;
  /** Нажатие ставит метку, метку можно тащить */
  interactive?: boolean;
  onPick?: (point: GeoCoordinates) => void;
  /** Перелёт камеры: после выбора подсказки, «моего места» и т. п. */
  focus?: MapFocus | null;
  style?: StyleProp<ViewStyle>;
}

export interface MapState {
  marker: GeoCoordinates | null;
  radiusMeters: number | null;
  areaMeters: number | null;
}

export type MapMessage = { type: 'ready' } | { type: 'pick'; lat: number; lng: number };

/** Сообщение со страницы карты; null — чужое или испорченное. */
export function parseMapMessage(raw: unknown): MapMessage | null {
  try {
    const data = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Partial<{
      source: string;
      type: string;
      lat: number;
      lng: number;
    }>;
    if (!data || data.source !== 'dg-map') return null;
    if (data.type === 'ready') return { type: 'ready' };
    if (
      data.type === 'pick' &&
      typeof data.lat === 'number' &&
      typeof data.lng === 'number' &&
      Number.isFinite(data.lat) &&
      Number.isFinite(data.lng)
    ) {
      return { type: 'pick', lat: data.lat, lng: data.lng };
    }
    return null;
  } catch {
    return null;
  }
}

export function mapStateOf(props: LeafletMapProps): MapState {
  return {
    marker: props.marker,
    radiusMeters: props.radiusKm ? props.radiusKm * 1000 : null,
    areaMeters: props.areaMeters ?? null,
  };
}

/**
 * Подложка карты. По умолчанию — стандартные тайлы OpenStreetMap: без ключа,
 * но по правилам OSM только для разработки и небольшой нагрузки. Для
 * магазинной сборки адрес меняется переменной окружения на своего
 * поставщика (MapTiler, Stadia, свой тайл-сервер) — код не трогается.
 * Тёмная тема — фильтр поверх тех же тайлов, а не второй набор.
 */
const TILE_URL =
  process.env.EXPO_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  process.env.EXPO_PUBLIC_MAP_TILE_ATTRIBUTION || '© участники OpenStreetMap';

export function buildMapHtml(options: {
  center: GeoCoordinates;
  zoom: number;
  interactive: boolean;
  dark: boolean;
  accent: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; background: ${options.dark ? '#0D181A' : '#F6F4EF'}; }
    .leaflet-control-attribution { font-size: 9px; background: rgba(0,0,0,0.25) !important; color: #ddd; }
    .leaflet-control-attribution a { color: #eee; }
    ${options.dark ? '.leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.9) saturate(0.5); }' : ''}
    .dg-pin { display: block; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35)); }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var post = function (data) {
      data.source = 'dg-map';
      var text = JSON.stringify(data);
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(text);
      else if (window.parent && window.parent !== window) window.parent.postMessage(text, '*');
    };
    var map = L.map('map', { zoomControl: false, attributionControl: true })
      .setView([${options.center.latitude}, ${options.center.longitude}], ${options.zoom});
    map.attributionControl.setPrefix('');
    L.tileLayer(${JSON.stringify(TILE_URL)}, {
      maxZoom: 19,
      attribution: ${JSON.stringify(TILE_ATTRIBUTION)}
    }).addTo(map);

    // Метка — SVG известной формы: остриё ровно в точке (15, 42) картинки, и
    // именно её Leaflet совмещает с координатой (iconAnchor). Никакого
    // сдвига стилями: положение считает карта по широте и долготе
    var PIN_W = 30, PIN_H = 42;
    var pinSvg =
      '<svg class="dg-pin" width="' + PIN_W + '" height="' + PIN_H + '" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M15 42 C15 42 1 25.5 1 15 A14 14 0 1 1 29 15 C29 25.5 15 42 15 42 Z" fill="${options.accent}" stroke="${options.dark ? '#0D181A' : '#ffffff'}" stroke-width="2"/>' +
      '<circle cx="15" cy="15" r="5.5" fill="${options.dark ? '#0D181A' : '#ffffff'}"/></svg>';
    var icon = L.divIcon({ className: '', html: pinSvg, iconSize: [PIN_W, PIN_H], iconAnchor: [PIN_W / 2, PIN_H] });
    var marker = null, radius = null, area = null, dot = null, current = {};

    /** Всё, что привязано к точке, — в одну координату: метка, центр, круги. */
    function placeAll(ll) {
      if (marker) marker.setLatLng(ll);
      if (dot) dot.setLatLng(ll);
      if (radius) radius.setLatLng(ll);
      if (area) area.setLatLng(ll);
    }
    var interactive = ${options.interactive ? 'true' : 'false'};

    function circleStyle(fill) {
      return { color: '${options.accent}', weight: 2, fillColor: '${options.accent}', fillOpacity: fill, interactive: false };
    }

    window.dg = {
      setState: function (s, initial) {
        var moved = !current.marker || !s.marker ||
          current.marker.latitude !== s.marker.latitude || current.marker.longitude !== s.marker.longitude;
        var radiusChanged = current.radiusMeters !== s.radiusMeters;
        current = s;

        if (s.marker && !s.areaMeters) {
          var ll = [s.marker.latitude, s.marker.longitude];
          if (!marker) {
            marker = L.marker(ll, { icon: icon, draggable: interactive, keyboard: false }).addTo(map);
            // Круг и центр едут вместе с меткой, пока её тащат, — а не
            // догоняют её, когда палец отпущен
            marker.on('drag', function () { placeAll(marker.getLatLng()); });
            marker.on('dragend', function () {
              var p = marker.getLatLng();
              post({ type: 'pick', lat: p.lat, lng: p.lng });
            });
            if (initial && !s.radiusMeters) map.setView(ll, map.getZoom(), { animate: false });
          } else if (moved) {
            marker.setLatLng(ll);
            // Без круга карта сама встаёт центром на выбранную точку (с кругом
            // это делает fitBounds ниже)
            if (!s.radiusMeters && !initial) map.panTo(ll, { animate: false });
          }
        } else if (marker) {
          map.removeLayer(marker); marker = null;
        }

        // Центр круга поиска — точка по координате, а не картинка: видно, где
        // ровно середина, даже если метка перекрыта пальцем
        if (s.marker && s.radiusMeters) {
          var dl = [s.marker.latitude, s.marker.longitude];
          if (!dot) {
            dot = L.circleMarker(dl, { radius: 4, weight: 2, color: '#ffffff', fillColor: '${options.accent}', fillOpacity: 1, interactive: false }).addTo(map);
          } else {
            dot.setLatLng(dl);
          }
        } else if (dot) {
          map.removeLayer(dot); dot = null;
        }

        if (s.marker && s.radiusMeters) {
          var center = [s.marker.latitude, s.marker.longitude];
          if (!radius) radius = L.circle(center, Object.assign({ radius: s.radiusMeters }, circleStyle(0.12))).addTo(map);
          else { radius.setLatLng(center); radius.setRadius(s.radiusMeters); }
          // Круг должен помещаться на экран целиком — видно, куда дотягивается поиск
          if (radiusChanged || moved || initial) map.fitBounds(radius.getBounds(), { padding: [24, 24], animate: false });
        } else if (radius) {
          map.removeLayer(radius); radius = null;
        }

        if (s.marker && s.areaMeters) {
          var ac = [s.marker.latitude, s.marker.longitude];
          if (!area) area = L.circle(ac, Object.assign({ radius: s.areaMeters }, circleStyle(0.2))).addTo(map);
          else { area.setLatLng(ac); area.setRadius(s.areaMeters); }
          if (initial || moved) map.fitBounds(area.getBounds(), { padding: [16, 16], animate: false });
        } else if (area) {
          map.removeLayer(area); area = null;
        }
      },
      focus: function (lat, lng, zoom) {
        // Без анимации: полёт идёт кадрами анимации, и в свёрнутом или ещё
        // не показанном окне он не доходит до конца — карта оставалась над
        // прежним местом. Мгновенный переход ставит центр ровно в точку
        map.setView([lat, lng], zoom, { animate: false });
      },
      /**
       * Проверка привязки: координаты метки, центра и круга и их положение
       * на экране в пикселях. Остриё метки — нижняя середина её картинки.
       */
      inspect: function () {
        var result = { marker: null, radius: null, dot: null, tipPx: null, centerPx: null };
        if (marker) {
          result.marker = marker.getLatLng();
          var el = marker.getElement();
          if (el) {
            var box = el.getBoundingClientRect(), mapBox = map.getContainer().getBoundingClientRect();
            result.tipPx = { x: box.left + box.width / 2 - mapBox.left, y: box.bottom - mapBox.top };
          }
        }
        if (radius) {
          result.radius = radius.getLatLng();
          result.centerPx = map.latLngToContainerPoint(radius.getLatLng());
        }
        if (dot) result.dot = dot.getLatLng();
        return result;
      }
    };

    if (interactive) {
      map.on('click', function (event) {
        post({ type: 'pick', lat: event.latlng.lat, lng: event.latlng.lng });
      });
    }
    post({ type: 'ready' });
  </script>
</body>
</html>`;
}
