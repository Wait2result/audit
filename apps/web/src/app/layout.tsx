import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Панель управления — Дагестан',
  description: 'Управление платформой «Дагестан»',
  // Панель управления не должна попадать в поисковые системы
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b1418',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
