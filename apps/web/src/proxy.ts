import { NextResponse, type NextRequest } from 'next/server';

import { ACCESS_COOKIE, REFRESH_COOKIE, cookieOptions, decodeToken } from './lib/session';

/**
 * Проверка сессии перед показом любой страницы панели.
 *
 * В Next.js 16 этот файл называется proxy.ts (раньше — middleware.ts).
 *
 * Выполняется до того, как страница начнёт рисоваться, поэтому закрытые
 * разделы не «мигают» содержимым перед перенаправлением на вход.
 *
 * Здесь же обновляется токен доступа. Он живёт всего 15 минут — специально,
 * чтобы украденный токен быстро становился бесполезным. Чтобы сотруднику при
 * этом не приходилось входить заново каждые 15 минут, панель незаметно
 * получает новый по долгоживущему токену обновления.
 */

const PUBLIC_PATHS = ['/login'];

/** За сколько секунд до истечения начинать обновлять токен. */
const REFRESH_MARGIN_SECONDS = 60;

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  // Уже вошедшего не держим на странице входа
  if (isPublic) {
    if (accessToken && isTokenFresh(accessToken)) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // Токен на месте и не истекает в ближайшую минуту — пропускаем
  if (accessToken && isTokenFresh(accessToken)) {
    return NextResponse.next();
  }

  // Токена нет или он вот-вот истечёт — пробуем обновить
  if (refreshToken) {
    const refreshed = await refreshTokens(refreshToken);

    if (refreshed) {
      const response = NextResponse.next();
      response.cookies.set(ACCESS_COOKIE, refreshed.accessToken, {
        ...cookieOptions,
        maxAge: refreshed.expiresIn,
      });
      response.cookies.set(REFRESH_COOKIE, refreshed.refreshToken, {
        ...cookieOptions,
        maxAge: 30 * 24 * 3600,
      });
      return response;
    }
  }

  // Обновить не удалось — на вход, запомнив, куда человек шёл
  const loginUrl = new URL('/login', request.url);
  if (pathname !== '/') {
    loginUrl.searchParams.set('next', pathname);
  }

  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(ACCESS_COOKIE);
  response.cookies.delete(REFRESH_COOKIE);
  return response;
}

function isTokenFresh(token: string): boolean {
  const payload = decodeToken(token);
  if (!payload?.exp) return false;
  return payload.exp * 1000 - Date.now() > REFRESH_MARGIN_SECONDS * 1000;
}

async function refreshTokens(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number } | null> {
  try {
    const apiUrl = process.env.API_URL ?? 'http://localhost:3000/api/v1';
    const response = await fetch(`${apiUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      tokens: { accessToken: string; refreshToken: string; expiresIn: number };
    };
    return data.tokens;
  } catch {
    // Сервер API недоступен — обращаемся с этим так же, как с истёкшей сессией
    return null;
  }
}

export const config = {
  // Проверяем всё, кроме статических файлов и служебных путей Next.js
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)'],
};
