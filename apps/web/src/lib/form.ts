/**
 * Чтение полей отправленной формы.
 *
 * Зачем отдельная функция вместо String(formData.get(...)): поле формы может
 * содержать не только текст, но и файл. Прямое преобразование файла в строку
 * молча даёт «[object File]», и в базу уезжает мусор вместо значения.
 * Здесь такой случай отсекается явно.
 */

export function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export function readOptionalField(formData: FormData, name: string): string | undefined {
  const value = readField(formData, name);
  return value === '' ? undefined : value;
}

export function readNumberField(formData: FormData, name: string): number {
  return Number(readField(formData, name));
}

export function readBooleanField(formData: FormData, name: string): boolean {
  // Невыбранный флажок браузер вообще не отправляет, выбранный присылает «on»
  return readField(formData, name) === 'on';
}
