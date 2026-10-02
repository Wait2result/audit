/** Форматирование значений для показа сотруднику. */

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return dateTimeFormatter.format(new Date(iso));
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return dateFormatter.format(new Date(iso));
}

/** «2 часа назад», «вчера» — читается быстрее точной даты в журнале. */
export function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'вчера';
  if (days < 7) return `${days} дн назад`;

  return formatDateTime(iso);
}

/** Российский номер в читаемом виде. */
export function formatPhone(phone: string): string {
  if (phone.startsWith('+7') && phone.length === 12) {
    const d = phone.slice(2);
    return `+7 ${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8, 10)}`;
  }
  return phone;
}

/** Байты в понятный человеку размер. */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Б';
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, power);
  return `${value.toFixed(power === 0 ? 0 : 1)} ${units[power]}`;
}

/** Число с разделителями разрядов: 1 234 567. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

/** Понятные названия действий в журнале аудита. */
const ACTION_LABELS: Record<string, string> = {
  'user.register': 'Регистрация пользователя',
  'user.block': 'Блокировка пользователя',
  'user.unblock': 'Снятие блокировки',
  'user.password_reset': 'Восстановление пароля',
  'user.password_change': 'Смена пароля',
  'city.create': 'Добавлен город',
  'city.update': 'Изменён город',
  'city.delete': 'Скрыт город',
};

export function formatAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Не подтверждён',
  active: 'Активен',
  blocked: 'Заблокирован',
  deleted: 'Удалён',
};

export function formatUserStatus(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
