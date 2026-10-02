import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,

  // Общий пакет типов и схем поставляется как исходники TypeScript —
  // Next.js должен собрать его вместе с приложением.
  transpilePackages: ['@dagestan/shared'],

  /**
   * Заголовки безопасности.
   *
   * Панель управления — самая привлекательная цель: попав в неё, злоумышленник
   * получает доступ ко всем данным пользователей. Поэтому браузеру явно
   * запрещается всё, что панели не нужно.
   */
  // Next.js требует, чтобы функция была асинхронной, даже если ждать нечего
  // eslint-disable-next-line @typescript-eslint/require-await
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Запрет встраивания панели в чужую страницу (защита от кликджекинга:
          // невидимый слой поверх интерфейса, ворующий нажатия)
          { key: 'X-Frame-Options', value: 'DENY' },
          // Браузер не должен угадывать тип содержимого
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Не передавать адреса страниц панели на сторонние сайты
          { key: 'Referrer-Policy', value: 'no-referrer' },
          // Панели не нужны камера, микрофон и геолокация
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
    ];
  },
};

export default config;
