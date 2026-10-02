/**
 * Работа с номерами телефона.
 *
 * В базе номер хранится ВСЕГДА в международном формате E.164: «+79280000000».
 * Это критично: если один и тот же человек в разных местах введёт
 * «8 928 000-00-00» и «+7 (928) 000-00-00», без нормализации получатся два
 * разных аккаунта.
 */

/** Ошибки нормализации номера. */
export type PhoneNormalizationError =
  'EMPTY' | 'TOO_SHORT' | 'TOO_LONG' | 'INVALID_CHARACTERS' | 'AMBIGUOUS_NO_COUNTRY_CODE';

export type PhoneNormalizationResult =
  { ok: true; phone: string } | { ok: false; error: PhoneNormalizationError };

/** Минимальная и максимальная длина номера в стандарте E.164 (без «+»). */
const E164_MIN_DIGITS = 8;
const E164_MAX_DIGITS = 15;

/** Код России (и Казахстана) — у номеров с ним ровно 11 цифр. */
export const RU_COUNTRY_CODE = '7';

/** Сколько цифр в российском номере после «+7». */
export const RU_NATIONAL_DIGITS = 10;

/**
 * Приводит введённый пользователем номер к формату E.164.
 *
 * @param input   Что ввёл пользователь: «8 928 000 00 00», «+7 928 000-00-00», «9280000000»
 * @param defaultCountryCode Код страны без «+», применяется если пользователь
 *                           ввёл номер без международного префикса. По умолчанию «7».
 *
 * Правила для России:
 *   8XXXXXXXXXX  (11 цифр, начинается с 8) → +7XXXXXXXXXX
 *   7XXXXXXXXXX  (11 цифр, начинается с 7) → +7XXXXXXXXXX
 *   9XXXXXXXXX   (10 цифр, мобильный)      → +79XXXXXXXXX
 *
 * Номер с кодом +7 обязан быть ровно из 11 цифр: «+7950123» подходит под
 * общий E.164 по длине, но это недописанный российский номер, и позвонить
 * по нему нельзя.
 */
export function normalizePhone(input: string, defaultCountryCode = '7'): PhoneNormalizationResult {
  if (!input || !input.trim()) {
    return { ok: false, error: 'EMPTY' };
  }

  const hasPlus = input.trim().startsWith('+');
  const digits = input.replace(/\D/g, '');

  if (!digits) {
    return { ok: false, error: 'INVALID_CHARACTERS' };
  }

  let normalized: string;

  if (hasPlus) {
    // Пользователь явно указал код страны — доверяем ему.
    normalized = digits;
  } else if (defaultCountryCode === RU_COUNTRY_CODE) {
    if (digits.length === 11 && (digits.startsWith('8') || digits.startsWith('7'))) {
      normalized = RU_COUNTRY_CODE + digits.slice(1);
    } else if (digits.length === RU_NATIONAL_DIGITS) {
      normalized = RU_COUNTRY_CODE + digits;
    } else if (digits.length > 11) {
      // Похоже на международный номер, введённый без «+»
      normalized = digits;
    } else {
      return { ok: false, error: 'TOO_SHORT' };
    }
  } else {
    normalized =
      digits.length > defaultCountryCode.length + E164_MIN_DIGITS - 1
        ? digits
        : defaultCountryCode + digits;
  }

  if (normalized.startsWith(RU_COUNTRY_CODE)) {
    const expected = RU_COUNTRY_CODE.length + RU_NATIONAL_DIGITS;
    if (normalized.length < expected) return { ok: false, error: 'TOO_SHORT' };
    if (normalized.length > expected) return { ok: false, error: 'TOO_LONG' };
  }
  if (normalized.length < E164_MIN_DIGITS) return { ok: false, error: 'TOO_SHORT' };
  if (normalized.length > E164_MAX_DIGITS) return { ok: false, error: 'TOO_LONG' };
  if (normalized.startsWith('0')) return { ok: false, error: 'AMBIGUOUS_NO_COUNTRY_CODE' };

  return { ok: true, phone: '+' + normalized };
}

/** Понятное человеку объяснение, чем плох номер. */
export function phoneErrorMessage(error: PhoneNormalizationError): string {
  switch (error) {
    case 'EMPTY':
      return 'Укажите номер телефона';
    case 'TOO_SHORT':
      return 'Номер неполный: после +7 нужно 10 цифр';
    case 'TOO_LONG':
      return 'В номере лишние цифры: после +7 нужно 10 цифр';
    case 'INVALID_CHARACTERS':
      return 'В номере должны быть только цифры';
    case 'AMBIGUOUS_NO_COUNTRY_CODE':
      return 'Некорректный номер телефона';
  }
}

/** Проверяет, что строка уже находится в корректном формате E.164. */
export function isE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

/** Номер по частям — так он хранится у объявлений (см. ADR-0010). */
export interface PhoneParts {
  /** Код страны без «+»: «7» */
  countryCode: string;
  /** Номер без кода страны: «9501234567» */
  nationalNumber: string;
  /** Полный номер: «+79501234567» */
  e164: string;
}

/**
 * Разбор номера E.164 на код страны и номер. Сейчас распознаётся только +7 —
 * единственная страна, которую предлагает интерфейс; для остальных код не
 * угадывается (длина кодов разная), и номер целиком остаётся в `e164`.
 */
export function phoneParts(e164: string): PhoneParts | null {
  if (!isE164(e164)) return null;
  const digits = e164.slice(1);
  if (digits.startsWith(RU_COUNTRY_CODE) && digits.length === 11) {
    return { countryCode: RU_COUNTRY_CODE, nationalNumber: digits.slice(1), e164 };
  }
  return { countryCode: '', nationalNumber: digits, e164 };
}

/**
 * Цифры российского номера после «+7» — из того, что человек набрал или
 * вставил: «+7 950 123-45-67», «89501234567», «9501234567» → «9501234567».
 *
 * Мобильный номер после +7 начинается с девятки, поэтому ведущие 7 и 8 —
 * всегда набранный по привычке префикс, а не часть номера: их отбрасываем,
 * чтобы не получить «+7 895 012-34-56». Лишнее сверх 10 цифр отрезается.
 */
export function ruMobileDigits(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  while (digits.length > 0 && (digits[0] === '7' || digits[0] === '8')) {
    digits = digits.slice(1);
  }
  return digits.slice(0, RU_NATIONAL_DIGITS);
}

/**
 * Что не так с российским мобильным номером (10 цифр после +7), или null.
 * Сообщения — для человека, а не для журнала.
 */
export function ruMobileError(digits: string): string | null {
  if (digits.length === 0) return 'Укажите номер телефона';
  if (!digits.startsWith('9')) return 'Мобильный номер после +7 начинается с 9';
  if (digits.length < RU_NATIONAL_DIGITS) {
    return `Номер неполный: нужно ещё ${RU_NATIONAL_DIGITS - digits.length} ${digitWord(RU_NATIONAL_DIGITS - digits.length)}`;
  }
  return null;
}

function digitWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'цифра';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'цифры';
  return 'цифр';
}

/**
 * Цифры номера после +7 в виде «950 123-45-67» — по мере набора:
 * «950» → «950», «95012» → «950 12», «950123456» → «950 123-45-6».
 */
export function formatRuNational(digits: string): string {
  const d = digits.slice(0, RU_NATIONAL_DIGITS);
  let result = d.slice(0, 3);
  if (d.length > 3) result += ` ${d.slice(3, 6)}`;
  if (d.length > 6) result += `-${d.slice(6, 8)}`;
  if (d.length > 8) result += `-${d.slice(8, 10)}`;
  return result;
}

/**
 * Номер для показа: «+79501234567» → «+7 950 123-45-67». Номер не +7 или
 * не E.164 возвращается как есть.
 */
export function formatPhoneE164(phone: string): string {
  const parts = phoneParts(phone);
  if (!parts || parts.countryCode !== RU_COUNTRY_CODE) return phone;
  return `+7 ${formatRuNational(parts.nationalNumber)}`;
}

/**
 * Прячет середину номера для показа там, где полный номер видеть не должны:
 * «+79280000000» → «+7 928 ***-**-00».
 * Используется в логах, в списках модерации и в интерфейсе поддержки.
 */
export function maskPhone(phone: string): string {
  if (!isE164(phone)) return '***';
  const tail = phone.slice(-2);
  const head = phone.slice(0, phone.length - 7);
  return `${head}***-**-${tail}`;
}

/**
 * Красивое отображение российского номера: «+79280000000» → «+7 (928) 000-00-00».
 * Для других стран возвращает номер как есть.
 */
export function formatPhoneForDisplay(phone: string): string {
  if (!isE164(phone)) return phone;
  if (phone.startsWith('+7') && phone.length === 12) {
    const d = phone.slice(2);
    return `+7 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8, 10)}`;
  }
  return phone;
}
