import { cookies } from 'next/headers';

/**
 * Хранение сессии сотрудника.
 *
 * Токены лежат в cookie с флагом httpOnly. Это принципиально: такую cookie
 * невозможно прочитать из JavaScript в браузере. Если на страницу панели
 * когда-нибудь попадёт чужой скрипт (через уязвимость в библиотеке или
 * вставленный сотрудником код), он не сможет украсть токен и войти в систему
 * от имени администратора.
 *
 * Альтернатива — хранить токен в localStorage — именно этим и опасна:
 * localStorage доступен любому скрипту на странице.
 *
 * Браузер сам прикладывает cookie к запросам, а серверная часть панели
 * достаёт из неё токен и обращается к API. Токен при этом ни разу не
 * оказывается в коде, который выполняется у пользователя.
 */

export const ACCESS_COOKIE = 'dg_at';
export const REFRESH_COOKIE = 'dg_rt';

const isProduction = process.env.NODE_ENV === 'production';

/** Общие настройки cookie для токенов. */
export const cookieOptions = {
  httpOnly: true,
  // В production cookie передаётся только по HTTPS
  secure: isProduction,
  // Lax: cookie не отправляется при переходах с чужих сайтов —
  // защита от подделки межсайтовых запросов (CSRF)
  sameSite: 'lax' as const,
  path: '/',
};

export interface SessionUser {
  id: string;
  phone: string;
  firstName: string;
  lastName: string | null;
  roles: string[];
  permissions: string[];
}

/** Читает токен доступа из cookie. */
export async function getAccessToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACCESS_COOKIE)?.value ?? null;
}

export async function getRefreshToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(REFRESH_COOKIE)?.value ?? null;
}

/**
 * Разбирает содержимое токена без проверки подписи.
 *
 * Здесь это допустимо: содержимое нужно только чтобы нарисовать имя в углу
 * экрана и скрыть недоступные разделы меню. Настоящая проверка прав всегда
 * происходит на сервере API при каждом запросе — панель ничего не решает.
 */
export function decodeToken(token: string): { sub: string; exp: number; perms: string[] } | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    return JSON.parse(json) as { sub: string; exp: number; perms: string[] };
  } catch {
    return null;
  }
}

/** Проверяет, есть ли у сотрудника указанное право. */
export function can(user: SessionUser | null, permission: string): boolean {
  return user?.permissions.includes(permission) ?? false;
}
