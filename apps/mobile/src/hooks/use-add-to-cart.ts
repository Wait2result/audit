import type { MenuItemDto } from '@dagestan/shared';
import { useCallback } from 'react';

import { useCartStore } from '../store/cart-store';
import { useToastStore } from '../store/toast-store';

/**
 * Добавление в корзину (Этап 6).
 *
 * У каждого заведения своя корзина, поэтому блюдо из другого заведения
 * больше не требует «очистить корзину?» — оно попадает в корзину своего
 * заведения. Подсказка внизу нужна там, где добавление происходит без
 * перехода: иначе человек не видит, что «+» сработал.
 */
export function useAddToCart(place: { id: string; name: string } | null) {
  const add = useCartStore((s) => s.add);
  const showToast = useToastStore((s) => s.show);

  return useCallback(
    (item: MenuItemDto, optionIds: string[] = [], quantity = 1, onDone?: () => void) => {
      if (!place) return;

      add(place, item, optionIds, quantity);
      showToast(`«${item.name}» в корзине`);
      onDone?.();
    },
    [place, add, showToast],
  );
}
