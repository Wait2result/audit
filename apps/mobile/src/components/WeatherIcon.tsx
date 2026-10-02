import { useId } from 'react';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Stop } from 'react-native-svg';
import type { WeatherIconName } from '@dagestan/shared';

/**
 * Цветные иконки состояний погоды — солнце жёлтое, облака белые с лёгким
 * серым градиентом, дождь синий, гроза с жёлтой молнией и т. д.
 *
 * Отдельный компонент от общего Icon (тот везде однотонный, под цвет текста
 * рядом — иконки меню, стрелки, метки метрик). Погода — единственное место
 * в приложении, где иконка должна быть узнаваемой «как на градуснике за
 * окном», а не подстраиваться под цвет окружающего текста.
 *
 * Фигуры собраны из простых примитивов (круг, скруглённый прямоугольник)
 * вместо ручных кривых Безье — так контуры получаются идеально ровными,
 * без «кривизны» от неточных вручную подобранных точек.
 */

const GOLD = '#FFC107';

export function WeatherIcon({ name, size = 32 }: { name: WeatherIconName; size?: number }) {
  const uid = useId();

  switch (name) {
    case 'sun':
      return <Sun size={size} cx={12} cy={12} rays />;
    case 'weather':
      return <PartlyCloudy size={size} uid={uid} />;
    case 'cloud':
      return <Cloud size={size} uid={uid} tone="light" />;
    case 'fog':
      return <Fog size={size} uid={uid} />;
    case 'rain':
      return <Rain size={size} uid={uid} />;
    case 'snow':
      return <Snow size={size} uid={uid} />;
    case 'storm':
      return <Storm size={size} uid={uid} />;
  }
}

/** Симметричные лучи солнца — 8 штук через 45°, вычислены тригонометрией,
 * а не подобраны на глаз, поэтому расходятся идеально ровно. */
function sunRayPath(cx: number, cy: number, rInner: number, rOuter: number): string {
  const segments: string[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI / 4) * i;
    const x1 = cx + rInner * Math.cos(angle);
    const y1 = cy + rInner * Math.sin(angle);
    const x2 = cx + rOuter * Math.cos(angle);
    const y2 = cy + rOuter * Math.sin(angle);
    segments.push(`M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`);
  }
  return segments.join('');
}

function Sun({
  size,
  cx,
  cy,
  radius = 5,
  rays = true,
}: {
  size: number;
  cx: number;
  cy: number;
  radius?: number;
  rays?: boolean;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {rays && (
        <Path
          d={sunRayPath(cx, cy, radius + 2.3, radius + 4.6)}
          stroke={GOLD}
          strokeWidth={2}
          strokeLinecap="round"
        />
      )}
      <Circle cx={cx} cy={cy} r={radius} fill={GOLD} />
    </Svg>
  );
}

/** Облако из четырёх эллипсов — приплюснутое (шире, чем выше), крупное,
 * но с полями по краям 24×24, чтобы не выглядело обрезанным. Эллипсы вместо
 * кругов дают настоящую сплюснутую форму, а не круглую «кучевую» — именно
 * такую просил пользователь. */
function cloudShapes(fillId: string) {
  return (
    <>
      <Ellipse cx={12} cy={16} rx={9.2} ry={4.2} fill={fillId} />
      <Ellipse cx={12} cy={12} rx={5.8} ry={3.8} fill={fillId} />
      <Ellipse cx={6.6} cy={14.6} rx={3.5} ry={2.8} fill={fillId} />
      <Ellipse cx={17.6} cy={14.8} rx={3.2} ry={2.6} fill={fillId} />
    </>
  );
}

function Cloud({
  size,
  uid,
  tone,
}: {
  size: number;
  uid: string;
  tone: 'light' | 'grey' | 'dark';
}) {
  const gradId = `${uid}-cloud-${tone}`;
  const stops =
    tone === 'light'
      ? ['#EEF1F3', '#C3CBD1']
      : tone === 'grey'
        ? ['#CFD8DC', '#90A4AE']
        : ['#78909C', '#455A64'];

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={stops[0]} />
          <Stop offset="1" stopColor={stops[1]} />
        </LinearGradient>
      </Defs>
      {cloudShapes(`url(#${gradId})`)}
    </Svg>
  );
}

function PartlyCloudy({ size, uid }: { size: number; uid: string }) {
  const gradId = `${uid}-cloud-light`;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#EEF1F3" />
          <Stop offset="1" stopColor="#C3CBD1" />
        </LinearGradient>
      </Defs>
      {/* Солнце верхним левым краем выглядывает из-за облака */}
      <Path
        d={sunRayPath(7.5, 7.5, 4.6, 6.6)}
        stroke={GOLD}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Circle cx={7.5} cy={7.5} r={3.4} fill={GOLD} />
      {/* Облако смещено ниже и правее — оно на переднем плане, солнце
          выглядывает из-за него слева сверху; та же приплюснутая форма из
          эллипсов, что и у обычного облака, только компактнее */}
      <Ellipse cx={13.8} cy={16.8} rx={6.2} ry={2.9} fill={`url(#${gradId})`} />
      <Ellipse cx={13.8} cy={13.6} rx={4} ry={2.6} fill={`url(#${gradId})`} />
      <Ellipse cx={9.8} cy={15.8} rx={2.4} ry={1.9} fill={`url(#${gradId})`} />
      <Ellipse cx={17.6} cy={15.9} rx={2.2} ry={1.8} fill={`url(#${gradId})`} />
    </Svg>
  );
}

function Fog({ size, uid }: { size: number; uid: string }) {
  const gradId = `${uid}-cloud-light`;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#EEF1F3" />
          <Stop offset="1" stopColor="#B8C2C8" />
        </LinearGradient>
      </Defs>
      <Ellipse cx={12.5} cy={8.7} rx={6.4} ry={2.3} fill={`url(#${gradId})`} />
      <Ellipse cx={12.5} cy={6.6} rx={3.8} ry={2.1} fill={`url(#${gradId})`} />
      <Path
        d="M3.5 14.5h17M4.5 18h15M6.5 21.5h11"
        stroke="#90A4AE"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function Rain({ size, uid }: { size: number; uid: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id={`${uid}-rain-cloud`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#CFD8DC" />
          <Stop offset="1" stopColor="#90A4AE" />
        </LinearGradient>
      </Defs>
      {cloudShapes(`url(#${uid}-rain-cloud)`)}
      <Path
        d="M9 19.5v2.8M12.5 19.5v2.8M16 19.5v2.8"
        stroke="#29B6F6"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function Snow({ size, uid }: { size: number; uid: string }) {
  const flake = (cx: number, cy: number, r: number) => (
    <Path
      d={`M${cx - r} ${cy}h${2 * r}M${cx} ${cy - r}v${2 * r}M${(cx - r * 0.7).toFixed(2)} ${(cy - r * 0.7).toFixed(2)}L${(cx + r * 0.7).toFixed(2)} ${(cy + r * 0.7).toFixed(2)}M${(cx - r * 0.7).toFixed(2)} ${(cy + r * 0.7).toFixed(2)}L${(cx + r * 0.7).toFixed(2)} ${(cy - r * 0.7).toFixed(2)}`}
      stroke="#4FC3F7"
      strokeWidth={1.4}
      strokeLinecap="round"
    />
  );

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id={`${uid}-snow-cloud`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#EEF1F3" />
          <Stop offset="1" stopColor="#C3CBD1" />
        </LinearGradient>
      </Defs>
      {cloudShapes(`url(#${uid}-snow-cloud)`)}
      {flake(9, 20.3, 1.7)}
      {flake(15, 20.3, 1.7)}
    </Svg>
  );
}

function Storm({ size, uid }: { size: number; uid: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id={`${uid}-storm-cloud`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#78909C" />
          <Stop offset="1" stopColor="#455A64" />
        </LinearGradient>
      </Defs>
      {cloudShapes(`url(#${uid}-storm-cloud)`)}
      <Path d="M13.5 15.5 10 20.5h3l-2 4 5.5-6.5h-3.2l1.7-2.5z" fill={GOLD} />
    </Svg>
  );
}
