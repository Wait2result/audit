/**
 * Метро умеет импортировать растровые файлы как обычные ES-модули
 * (`import photo from './photo.png'`) — TypeScript о таких файлах не знает
 * и без этого объявления считает их ошибкой. Значение — числовой id ресурса,
 * который принимает `<Image source={...} />`.
 */
declare module '*.png' {
  const value: number;
  export default value;
}

declare module '*.jpg' {
  const value: number;
  export default value;
}

declare module '*.jpeg' {
  const value: number;
  export default value;
}
