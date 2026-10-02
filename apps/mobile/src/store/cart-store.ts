import type { MenuItemDto } from '@dagestan/shared';
import { create } from 'zustand';

import { StorageKey, plainStorage } from '../api/storage';

/**
 * Корзины (Этап 6).
 *
 * Живут на устройстве, а не на сервере: серверная корзина добавляла бы
 * запрос на каждое нажатие «+», а от подделки цен всё равно не спасает.
 * Цены здесь — только чтобы показать сумму до оформления; настоящий счёт
 * присылает сервер, он же пересчитывает заказ с нуля перед созданием.
 *
 * Корзин несколько — по одной на заведение. Заказ всё равно оформляется в
 * одно заведение (это одна кухня и одна доставка), но собирать шашлык в
 * одном месте и пиццу в другом можно одновременно: человек переключается
 * между корзинами, как в привычных сервисах доставки, а не получает вопрос
 * «очистить корзину?» на каждое блюдо из другого заведения.
 */

export interface CartLine {
  /** Устойчивый ключ строки: позиция плюс набор выбранных опций */
  key: string;
  menuItemId: string;
  name: string;
  /** Цена за единицу с учётом опций, в копейках — для показа до расчёта */
  unitPrice: number;
  quantity: number;
  optionIds: string[];
  optionNames: string[];
  /** Картинка блюда — чтобы корзина не была списком голого текста */
  imageUrl: string | null;
  /** «250 г» — помогает отличить две порции одного блюда */
  portion: string | null;
}

export interface PlaceCart {
  placeId: string;
  placeName: string;
  lines: CartLine[];
  /** Когда корзину трогали последний раз — по нему упорядочены вкладки */
  updatedAt: number;
}

interface CartState {
  carts: PlaceCart[];
  isLoaded: boolean;

  load: () => Promise<void>;
  add: (
    place: { id: string; name: string },
    item: MenuItemDto,
    optionIds: string[],
    quantity?: number,
  ) => void;
  setQuantity: (placeId: string, key: string, quantity: number) => void;
  remove: (placeId: string, key: string) => void;
  /** Очистить корзину одного заведения — например, после оформления заказа */
  clear: (placeId: string) => void;
}

function lineKey(menuItemId: string, optionIds: string[]): string {
  return [menuItemId, ...[...optionIds].sort()].join('|');
}

function buildLine(item: MenuItemDto, optionIds: string[], quantity: number): CartLine {
  const selected = new Set(optionIds);
  const chosen = item.groups.flatMap((group) =>
    group.options.filter((option) => selected.has(option.id)),
  );

  return {
    key: lineKey(item.id, optionIds),
    menuItemId: item.id,
    name: item.name,
    unitPrice: item.price + chosen.reduce((sum, option) => sum + option.priceDelta, 0),
    quantity,
    optionIds,
    optionNames: chosen.map((option) => option.name),
    imageUrl: item.image?.url ?? null,
    portion: item.portion,
  };
}

/** Сохранённое раньше: одна корзина на всё приложение. */
interface LegacyCart {
  placeId: string | null;
  placeName: string | null;
  lines: CartLine[];
}

/**
 * Разбор сохранённого. Старый формат (одна корзина) переводится в новый,
 * чтобы собранный до обновления заказ не пропал.
 */
function parseStored(raw: string): PlaceCart[] {
  const data = JSON.parse(raw) as { carts?: PlaceCart[] } & Partial<LegacyCart>;

  if (Array.isArray(data.carts)) return data.carts.filter((cart) => cart.lines.length > 0);

  if (data.placeId && data.placeName && Array.isArray(data.lines) && data.lines.length > 0) {
    return [
      {
        placeId: data.placeId,
        placeName: data.placeName,
        lines: data.lines,
        updatedAt: Date.now(),
      },
    ];
  }

  return [];
}

export const useCartStore = create<CartState>((set, get) => {
  /** Сохранение идёт следом за изменением состояния и не блокирует интерфейс. */
  const commit = (carts: PlaceCart[]) => {
    const next = carts.filter((cart) => cart.lines.length > 0);
    set({ carts: next });
    void plainStorage.set(StorageKey.CART, JSON.stringify({ carts: next }));
  };

  const updateLines = (placeId: string, update: (lines: CartLine[]) => CartLine[]) => {
    commit(
      get().carts.map((cart) =>
        cart.placeId === placeId
          ? { ...cart, lines: update(cart.lines), updatedAt: Date.now() }
          : cart,
      ),
    );
  };

  return {
    carts: [],
    isLoaded: false,

    load: async () => {
      const raw = await plainStorage.get(StorageKey.CART);

      try {
        set({ carts: raw ? parseStored(raw) : [], isLoaded: true });
      } catch {
        // Испорченная запись — начинаем с пустых корзин, а не падаем
        set({ carts: [], isLoaded: true });
      }
    },

    add: (place, item, optionIds, quantity = 1) => {
      const carts = get().carts;
      const existing = carts.find((cart) => cart.placeId === place.id);

      if (!existing) {
        commit([
          ...carts,
          {
            placeId: place.id,
            placeName: place.name,
            lines: [buildLine(item, optionIds, quantity)],
            updatedAt: Date.now(),
          },
        ]);
        return;
      }

      const key = lineKey(item.id, optionIds);

      updateLines(place.id, (lines) =>
        lines.some((line) => line.key === key)
          ? lines.map((line) =>
              line.key === key ? { ...line, quantity: line.quantity + quantity } : line,
            )
          : [...lines, buildLine(item, optionIds, quantity)],
      );
    },

    setQuantity: (placeId, key, quantity) =>
      updateLines(placeId, (lines) =>
        lines
          .map((line) => (line.key === key ? { ...line, quantity } : line))
          .filter((line) => line.quantity > 0),
      ),

    remove: (placeId, key) => updateLines(placeId, (lines) => lines.filter((l) => l.key !== key)),

    clear: (placeId) => commit(get().carts.filter((cart) => cart.placeId !== placeId)),
  };
});

/** Предварительная сумма. Точную считает сервер. */
export function cartTotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

/** Корзина одного заведения; пустой список, если её нет. */
export function useCartLines(placeId: string | null | undefined): CartLine[] {
  return useCartStore((s) => s.carts.find((cart) => cart.placeId === placeId)?.lines ?? EMPTY);
}

/** Сколько всего позиций во всех корзинах — для значка на кнопке корзины. */
export function useCartBadge(): number {
  return useCartStore((s) => s.carts.reduce((sum, cart) => sum + cartCount(cart.lines), 0));
}

const EMPTY: CartLine[] = [];
