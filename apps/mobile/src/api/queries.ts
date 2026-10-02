import type {
  CinemaScheduleDto,
  FavoriteListingDto,
  SellerListingDto,
  SellerProfileDto,
  CreateMenuCategoryDto,
  CreateMenuItemDto,
  CreateOptionGroupDto,
  CreateOrderDto,
  CityDto,
  GeoCoordinates,
  GeoPlaceDto,
  ListingDictionaryEntryDto,
  ListingSuggestionDto,
  ListingRentPeriod,
  ListingTransactionType,
  ListingPriceUnit,
  MovieDetailsDto,
  MyPlaceDto,
  NewsDetailsDto,
  OrderDraftDto,
  OrderDto,
  OrderQuoteDto,
  OrderStatus,
  NewsScope,
  NewsSummaryDto,
  PaginatedResponse,
  PlaceDetailsDto,
  PlaceDto,
  FavoriteDishDto,
  ListingCategoryDto,
  ListingDetailsDto,
  ListingDto,
  ListingPhoneDto,
  CreateListingDto,
  MyListingDetailsDto,
  MyListingDto,
  ModerationStatus,
  UpdateMyListingDto,
  FavoritesSummaryDto,
  PlaceCategoryDto,
  PlaceMenuDto,
  PlaceReviewDto,
  PlaceReviewsDto,
  PromoBannerDto,
  PromoPlacement,
  UpdateMenuItemDto,
  UpsertReviewDto,
  UpdateMyPlaceDto,
  UpdateScheduleDto,
  WeatherDto,
} from '@dagestan/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { apiFetch } from './client';

/**
 * Запросы к серверу, общие для нескольких экранов.
 *
 * Ключ запроса (queryKey) — это его «адрес» в кеше. Одинаковый ключ на разных
 * экранах означает, что данные загрузятся один раз и будут переиспользованы.
 */

export const queryKeys = {
  cities: ['cities'] as const,
  me: ['me'] as const,
  weather: (cityId: string | null) => ['weather', cityId] as const,
  cinemaSchedule: (cityId: string | null, date: string) =>
    ['cinema-schedule', cityId, date] as const,
  cinemaMovie: (cityId: string | null, movieId: number) =>
    ['cinema-movie', cityId, movieId] as const,
  newsFeed: (cityId: string | null, scope: NewsScope) => ['news', cityId, scope] as const,
  newsItem: (id: string) => ['news-item', id] as const,
  places: (cityId: string | null, filters: string) => ['places', cityId, filters] as const,
  place: (id: string) => ['place', id] as const,
  placeMenu: (id: string) => ['place-menu', id] as const,
  cuisines: (cityId: string | null) => ['cuisines', cityId] as const,
  myPlaces: ['my-places'] as const,
  myPlace: (id: string) => ['my-place', id] as const,
  myMenu: (id: string) => ['my-menu', id] as const,
  orders: (activeOnly: boolean) => ['orders', activeOnly] as const,
  order: (id: string) => ['order', id] as const,
  placeOrders: (placeId: string) => ['place-orders', placeId] as const,
  orderQuote: (draft: string) => ['order-quote', draft] as const,
  placeReviews: (placeId: string) => ['place-reviews', placeId] as const,
  placeCategories: ['place-categories'] as const,
  promoBanners: (placement: PromoPlacement) => ['promo-banners', placement] as const,
  favoriteSummary: (cityId: string | null) => ['favorite-summary', cityId] as const,
  favoriteDishes: (cityId: string | null) => ['favorite-dishes', cityId] as const,
  listings: (cityId: string | null, filters: string) => ['listings', cityId, filters] as const,
  listing: (id: string, point = '') => ['listing', id, point] as const,
  myListings: (status: string) => ['my-listings', status] as const,
  myListing: (id: string) => ['my-listing', id] as const,
  listingCategories: ['listing-categories'] as const,
  listingDictionary: (kind: string, parent: string | null) =>
    ['listing-dictionary', kind, parent] as const,
  listingSuggestions: (cityId: string | null, q: string) =>
    ['listing-suggestions', cityId, q] as const,
};

/** Список городов. Меняется раз в месяцы — держим в кеше долго. */
export function useCities() {
  return useQuery({
    queryKey: queryKeys.cities,
    queryFn: () => apiFetch<CityDto[]>('/cities', { anonymous: true }),
    staleTime: 60 * 60 * 1000,
  });
}

/**
 * Прогноз погоды для выбранного города (Этап 3 ТЗ).
 *
 * cityId — часть ключа запроса, поэтому смена города в useCityStore сама по
 * себе запускает загрузку нового прогноза: переписывать ничего не нужно,
 * это делает TanStack Query.
 */
export function useWeather(cityId: string | null) {
  const queryClient = useQueryClient();

  /**
   * Обновление «по-настоящему»: сервер держит прогноз в кеше 15 минут, и
   * обычный повторный запрос возвращает тот же ответ с тем же временем
   * обновления — человек тянет экран, а на нём ничего не меняется. Этот
   * запрос просит сервер сходить к источнику заново.
   */
  const refresh = useCallback(async () => {
    if (!cityId) return;

    const fresh = await apiFetch<WeatherDto>(`/weather?cityId=${cityId}&refresh=true`, {
      anonymous: true,
    });
    queryClient.setQueryData(queryKeys.weather(cityId), fresh);
  }, [cityId, queryClient]);

  const query = useQuery({
    ...weatherQueryOptions(cityId),
    enabled: Boolean(cityId),
    refetchInterval: 5 * 60 * 1000,
  });

  return { ...query, refresh };
}

/**
 * Ключ, запрос и срок свежести погоды — общие для `useWeather` и заставки
 * при запуске, которая загружает погоду заранее: так виджет на главной
 * появляется сразу с данными, а не с крутилкой.
 */
export function weatherQueryOptions(cityId: string | null) {
  return {
    queryKey: queryKeys.weather(cityId),
    queryFn: () => apiFetch<WeatherDto>(`/weather?cityId=${cityId}`, { anonymous: true }),
    // Сервер кеширует прогноз на 15 минут (WEATHER_CACHE_TTL_SECONDS), но
    // спрашиваем чаще: так «Обновлено в …» не отстаёт от момента, когда
    // сервер действительно обновил данные. Лишние запросы упираются в его
    // кеш и до источника погоды не доходят.
    staleTime: 5 * 60 * 1000,
  };
}

/**
 * Расписание кино на дату для выбранного города (Этап 4 ТЗ).
 *
 * date — часть ключа запроса, поэтому переключение вкладки «Сегодня»/«Завтра»
 * само по себе запускает новый запрос, отдельно кешируемый TanStack Query.
 */
export function useCinemaSchedule(cityId: string | null, date: string) {
  return useQuery({
    queryKey: queryKeys.cinemaSchedule(cityId, date),
    queryFn: () =>
      apiFetch<CinemaScheduleDto>(`/cinema/schedule?cityId=${cityId}&date=${date}`, {
        anonymous: true,
      }),
    enabled: Boolean(cityId),
    // Сервер сам кеширует на 30 минут (CinemaService.CACHE_TTL_SECONDS).
    staleTime: 15 * 60 * 1000,
  });
}

/**
 * Описание и трейлер фильма. Запрашивается только когда карточка открыта:
 * `enabled` держит запрос выключенным, пока человек не нажал на фильм.
 */
export function useMovieDetails(cityId: string | null, movieId: number, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.cinemaMovie(cityId, movieId),
    queryFn: () =>
      apiFetch<MovieDetailsDto>(`/cinema/movie?cityId=${cityId}&movieId=${movieId}`, {
        anonymous: true,
      }),
    enabled: enabled && Boolean(cityId),
    // Описание и трейлер не меняются — незачем спрашивать повторно
    staleTime: 24 * 60 * 60 * 1000,
  });
}

/**
 * Лента новостей вкладки (Этап 5): страницы подгружаются по курсору.
 *
 * scope и город — часть ключа, поэтому каждая вкладка и каждый город хранят
 * свою ленту отдельно, а переключение вкладок не перезагружает соседние.
 */
export function useNewsFeed(cityId: string | null, scope: NewsScope) {
  return useInfiniteQuery({
    queryKey: queryKeys.newsFeed(cityId, scope),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiFetch<PaginatedResponse<NewsSummaryDto>>(
        `/news?cityId=${cityId}&scope=${scope}&limit=15${
          pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''
        }`,
        { anonymous: true },
      ),
    getNextPageParam: (last) => last.nextCursor,
    enabled: Boolean(cityId),
    // Сервер обновляет новости раз в 15 минут — чаще спрашивать незачем
    staleTime: 2 * 60 * 1000,
  });
}

/** Новость целиком — открывается по «Подробнее», когда у нас есть полный текст. */
export function useNewsItem(id: string) {
  return useQuery({
    queryKey: queryKeys.newsItem(id),
    queryFn: () => apiFetch<NewsDetailsDto>(`/news/${encodeURIComponent(id)}`, { anonymous: true }),
    staleTime: 10 * 60 * 1000,
  });
}

// ── Заведения (Этап 6) ───────────────────────────────────────────────────────

/** Фильтры каталога. Пустые значения в запрос не попадают. */
export interface PlaceFilters {
  /** Несколько видов через запятую: «restaurant,cafe» */
  types?: string;
  cuisine?: string;
  /** Плитка с витрины: «shashlik», «pizza» */
  category?: string;
  search?: string;
  openNow?: boolean;
  hasDelivery?: boolean;
  /** «До 30 мин» */
  maxMinutes?: number;
  favoritesOnly?: boolean;
  sort?: 'default' | 'rating' | 'fast' | 'cheap';
}

function placeQuery(cityId: string, filters: PlaceFilters, cursor: string | null): string {
  const params = new URLSearchParams({ limit: '20' });
  // Город — только для старого поведения «лента своего города»; при поиске
  // по кругу и «Весь Дагестан» сервер на него не смотрит
  if (cityId) params.set('cityId', cityId);

  if (filters.types) params.set('types', filters.types);
  if (filters.cuisine) params.set('cuisine', filters.cuisine);
  if (filters.category) params.set('category', filters.category);
  if (filters.search) params.set('search', filters.search);
  if (filters.openNow) params.set('openNow', 'true');
  if (filters.hasDelivery) params.set('hasDelivery', 'true');
  if (filters.maxMinutes) params.set('maxMinutes', String(filters.maxMinutes));
  if (filters.favoritesOnly) params.set('favoritesOnly', 'true');
  if (filters.sort && filters.sort !== 'default') params.set('sort', filters.sort);
  if (cursor) params.set('cursor', cursor);

  return params.toString();
}

/**
 * Каталог заведений города.
 *
 * Кеш короткий: заведение ставит позицию в стоп-лист прямо во время смены,
 * и показывать вчерашнее состояние хуже, чем лишний раз сходить на сервер.
 *
 * Запрос идёт с токеном, если он есть: маршрут публичный, но по токену
 * сервер закрашивает сердечки. Гостю тот же запрос отвечает без них.
 */
export function usePlaces(cityId: string | null, filters: PlaceFilters, enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.places(cityId, JSON.stringify(filters)),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiFetch<PaginatedResponse<PlaceDto>>(
        `/places?${placeQuery(cityId ?? '', filters, pageParam)}`,
      ),
    getNextPageParam: (last) => last.nextCursor,
    enabled: enabled && Boolean(cityId),
    staleTime: 60 * 1000,
  });
}

/**
 * Категории витрины.
 *
 * Список задаёт владелец в панели, поэтому он приходит с сервера, а не
 * зашит в приложение: новая плитка появляется без выпуска новой версии.
 * Кеш длинный — меняются они редко, а на первом экране нужны сразу.
 */
export function usePlaceCategories() {
  return useQuery({
    queryKey: queryKeys.placeCategories,
    queryFn: () => apiFetch<PlaceCategoryDto[]>('/places/categories', { anonymous: true }),
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * Промо-карточки карусели — на главной странице и на витрине доставки.
 *
 * Картинку и заведение, куда ведёт нажатие, задаёт владелец в панели —
 * так же, как категории. Кеш длинный по той же причине: меняются редко.
 */
export function usePromoBanners(placement: PromoPlacement) {
  return useQuery({
    queryKey: queryKeys.promoBanners(placement),
    queryFn: () =>
      apiFetch<PromoBannerDto[]>(`/places/promo-banners?placement=${placement}`, {
        anonymous: true,
      }),
    staleTime: 30 * 60 * 1000,
  });
}

export function usePlace(id: string) {
  return useQuery({
    queryKey: queryKeys.place(id),
    queryFn: () => apiFetch<PlaceDetailsDto>(`/places/${id}`),
    enabled: Boolean(id),
    staleTime: 60 * 1000,
  });
}

/** Меню заведения: разделы, позиции и группы выбора. */
export function usePlaceMenu(id: string) {
  return useQuery({
    queryKey: queryKeys.placeMenu(id),
    // С токеном, если он есть: по нему сервер отмечает блюда в избранном
    queryFn: () => apiFetch<PlaceMenuDto>(`/places/${id}/menu`),
    enabled: Boolean(id),
    staleTime: 60 * 1000,
  });
}

/**
 * Сердечко «в избранное».
 *
 * Состояние меняется сразу, до ответа сервера: ждать полсекунды ради
 * такого действия человек не должен. Если сервер откажет, `onError`
 * возвращает прежние списки — сердечко гаснет обратно само.
 */
export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ placeId }: { placeId: string; isFavorite: boolean }) =>
      apiFetch<{ isFavorite: boolean }>(`/places/${placeId}/favorite`, { method: 'POST' }),

    onMutate: async ({ placeId, isFavorite }) => {
      await queryClient.cancelQueries({ queryKey: ['places'] });
      const listSnapshot = queryClient.getQueriesData({ queryKey: ['places'] });
      const cardSnapshot = queryClient.getQueryData(queryKeys.place(placeId));

      queryClient.setQueriesData<{ pages: PaginatedResponse<PlaceDto>[] }>(
        { queryKey: ['places'] },
        (old) =>
          old
            ? {
                ...old,
                pages: old.pages.map((page) => ({
                  ...page,
                  items: page.items.map((place) =>
                    place.id === placeId ? { ...place, isFavorite: !isFavorite } : place,
                  ),
                })),
              }
            : old,
      );

      queryClient.setQueryData<PlaceDetailsDto>(queryKeys.place(placeId), (old) =>
        old ? { ...old, isFavorite: !isFavorite } : old,
      );

      return { listSnapshot, cardSnapshot, placeId };
    },

    onError: (_err, _vars, context) => {
      context?.listSnapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
      if (context) queryClient.setQueryData(queryKeys.place(context.placeId), context.cardSnapshot);
    },

    // Список «только избранное» после переключения меняет состав, а не
    // только галочку — его нужно перезапросить целиком, вместе со счётчиком
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['places'] });
      await queryClient.invalidateQueries({ queryKey: ['favorite-summary'] });
    },
  });
}

/** Сколько заведений и блюд в избранном — для значка на кнопке и вкладок. */
export function useFavoritesSummary(cityId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.favoriteSummary(cityId),
    queryFn: () => apiFetch<FavoritesSummaryDto>(`/favorites/summary?cityId=${cityId}`),
    enabled: enabled && Boolean(cityId),
    staleTime: 30 * 1000,
  });
}

/** Избранные блюда города. */
export function useFavoriteDishes(cityId: string | null, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: queryKeys.favoriteDishes(cityId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiFetch<PaginatedResponse<FavoriteDishDto>>(
        `/favorites/dishes?cityId=${cityId}&limit=20${pageParam ? `&cursor=${pageParam}` : ''}`,
      ),
    getNextPageParam: (last) => last.nextCursor,
    enabled: enabled && Boolean(cityId),
    staleTime: 15 * 1000,
  });
}

/**
 * Сердечко на блюде.
 *
 * Как и у заведений, реагирует сразу, не дожидаясь сервера: закрашивается
 * в меню открытого заведения, а при отказе возвращается обратно.
 */
export function useToggleDishFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId }: { itemId: string; placeId: string; isFavorite: boolean }) =>
      apiFetch<{ isFavorite: boolean }>(`/favorites/dishes/${itemId}`, { method: 'POST' }),

    onMutate: async ({ itemId, placeId, isFavorite }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.placeMenu(placeId) });
      const menuSnapshot = queryClient.getQueryData<PlaceMenuDto>(queryKeys.placeMenu(placeId));

      queryClient.setQueryData<PlaceMenuDto>(queryKeys.placeMenu(placeId), (old) =>
        old
          ? {
              ...old,
              categories: old.categories.map((category) => ({
                ...category,
                items: category.items.map((item) =>
                  item.id === itemId ? { ...item, isFavorite: !isFavorite } : item,
                ),
              })),
            }
          : old,
      );

      return { menuSnapshot, placeId };
    },

    onError: (_err, _vars, context) => {
      if (context)
        queryClient.setQueryData(queryKeys.placeMenu(context.placeId), context.menuSnapshot);
    },

    onSettled: async (_data, _err, vars) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.placeMenu(vars.placeId) });
      await queryClient.invalidateQueries({ queryKey: ['favorite-dishes'] });
      await queryClient.invalidateQueries({ queryKey: ['favorite-summary'] });
    },
  });
}

// ── Отзывы ───────────────────────────────────────────────────────────────────

export function usePlaceReviews(placeId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.placeReviews(placeId),
    queryFn: () => apiFetch<PlaceReviewsDto>(`/places/${placeId}/reviews?limit=20`),
    enabled: enabled && Boolean(placeId),
    staleTime: 60 * 1000,
  });
}

export function useUpsertReview(placeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: UpsertReviewDto) =>
      apiFetch<PlaceReviewDto>(`/places/${placeId}/reviews/my`, { method: 'PUT', body: dto }),
    onSuccess: async () => {
      // Отзыв меняет и средний рейтинг в карточке, и списки
      await queryClient.invalidateQueries({ queryKey: queryKeys.placeReviews(placeId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.place(placeId) });
      await queryClient.invalidateQueries({ queryKey: ['places'] });
    },
  });
}

export function useDeleteReview(placeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiFetch<void>(`/places/${placeId}/reviews/my`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.placeReviews(placeId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.place(placeId) });
      await queryClient.invalidateQueries({ queryKey: ['places'] });
    },
  });
}

/** Ответ заведения на отзыв — из кабинета. */
export function useReplyReview(placeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ reviewId, reply }: { reviewId: string; reply: string }) =>
      apiFetch<PlaceReviewDto>(`/places/reviews/${reviewId}/reply`, {
        method: 'POST',
        body: { reply },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.placeReviews(placeId) }),
  });
}

/** Кухни города — из них строится фильтр, поэтому пустых вариантов не бывает. */
export function useCuisines(cityId: string | null) {
  return useQuery({
    queryKey: queryKeys.cuisines(cityId),
    queryFn: () => apiFetch<string[]>(`/places/cuisines?cityId=${cityId}`, { anonymous: true }),
    enabled: Boolean(cityId),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Заведения, которыми управляет этот аккаунт.
 *
 * Пустой список — обычный ответ: по нему профиль прячет раздел
 * «Моё заведение». Для гостя запрос не выполняется вовсе.
 */
export function useMyPlaces(isAuthenticated: boolean) {
  return useQuery({
    queryKey: queryKeys.myPlaces,
    queryFn: () => apiFetch<MyPlaceDto[]>('/my/places'),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
}

// ── Кабинет заведения ────────────────────────────────────────────────────────

/** Заведение глазами его сотрудника: видно и скрытое, и выключенное. */
export function useMyPlace(id: string) {
  return useQuery({
    queryKey: queryKeys.myPlace(id),
    queryFn: () => apiFetch<PlaceDetailsDto>(`/my/places/${id}`),
    enabled: Boolean(id),
  });
}

/** Меню для редактирования: с разделами и позициями, скрытыми от покупателя. */
export function useMyMenu(id: string) {
  return useQuery({
    queryKey: queryKeys.myMenu(id),
    queryFn: () => apiFetch<PlaceMenuDto>(`/my/places/${id}/menu`),
    enabled: Boolean(id),
  });
}

/**
 * Любая правка в кабинете меняет и витрину, поэтому после успеха
 * сбрасываются оба кеша — и кабинета, и публичных экранов.
 */
function useCabinetMutation<TVariables>(
  placeId: string,
  request: (variables: TVariables) => Promise<unknown>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: request,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.myPlace(placeId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.myMenu(placeId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.place(placeId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.placeMenu(placeId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.myPlaces }),
        queryClient.invalidateQueries({ queryKey: ['places'] }),
      ]);
    },
  });
}

export function useUpdateMyPlace(placeId: string) {
  return useCabinetMutation<UpdateMyPlaceDto>(placeId, (dto) =>
    apiFetch(`/my/places/${placeId}`, { method: 'PATCH', body: dto }),
  );
}

export function useUpdateSchedule(placeId: string) {
  return useCabinetMutation<UpdateScheduleDto>(placeId, (dto) =>
    apiFetch(`/my/places/${placeId}/schedule`, { method: 'PATCH', body: dto }),
  );
}

export function useCreateCategory(placeId: string) {
  return useCabinetMutation<CreateMenuCategoryDto>(placeId, (dto) =>
    apiFetch(`/my/places/${placeId}/categories`, { method: 'POST', body: dto }),
  );
}

export function useDeleteCategory(placeId: string) {
  return useCabinetMutation<string>(placeId, (categoryId) =>
    apiFetch(`/my/places/categories/${categoryId}`, { method: 'DELETE' }),
  );
}

export function useCreateItem(placeId: string) {
  return useCabinetMutation<CreateMenuItemDto>(placeId, (dto) =>
    apiFetch(`/my/places/${placeId}/items`, { method: 'POST', body: dto }),
  );
}

export function useUpdateItem(placeId: string) {
  return useCabinetMutation<{ itemId: string; dto: UpdateMenuItemDto }>(
    placeId,
    ({ itemId, dto }) => apiFetch(`/my/places/items/${itemId}`, { method: 'PATCH', body: dto }),
  );
}

export function useDeleteItem(placeId: string) {
  return useCabinetMutation<string>(placeId, (itemId) =>
    apiFetch(`/my/places/items/${itemId}`, { method: 'DELETE' }),
  );
}

/** Стоп-лист — единственное, что доступно и сотруднику, и управляющему. */
export function useSetAvailability(placeId: string) {
  return useCabinetMutation<{ itemId: string; isAvailable: boolean }>(
    placeId,
    ({ itemId, isAvailable }) =>
      apiFetch(`/my/places/items/${itemId}/availability`, {
        method: 'PATCH',
        body: { isAvailable },
      }),
  );
}

export function useSaveOptionGroup(placeId: string) {
  return useCabinetMutation<{ itemId: string; dto: CreateOptionGroupDto }>(
    placeId,
    ({ itemId, dto }) =>
      apiFetch(`/my/places/items/${itemId}/option-groups`, { method: 'POST', body: dto }),
  );
}

export function useDeleteOptionGroup(placeId: string) {
  return useCabinetMutation<string>(placeId, (groupId) =>
    apiFetch(`/my/places/option-groups/${groupId}`, { method: 'DELETE' }),
  );
}

// ── Заказы (Этап 6) ──────────────────────────────────────────────────────────

/**
 * Предварительный расчёт заказа.
 *
 * Все цифры на экране оформления приходят отсюда: клиентская корзина
 * считает приблизительно, а платит человек по расчёту сервера.
 */
export function useOrderQuote(draft: OrderDraftDto, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.orderQuote(JSON.stringify(draft)),
    queryFn: () => apiFetch<OrderQuoteDto>('/orders/quote', { method: 'POST', body: draft }),
    enabled: enabled && Boolean(draft.placeId),
    // Цена и стоп-лист меняются во время смены — пересчитываем часто
    staleTime: 15 * 1000,
  });
}

/**
 * Оформление заказа.
 *
 * Ключ идемпотентности создаётся один раз на попытку: если связь оборвалась
 * и человек нажал ещё раз, сервер вернёт тот же заказ, а не создаст второй.
 */
export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateOrderDto) =>
      apiFetch<OrderDto>('/orders', {
        method: 'POST',
        body: dto,
        headers: {
          'Idempotency-Key': `${dto.placeId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useMyOrders(isAuthenticated: boolean, activeOnly = false) {
  return useInfiniteQuery({
    queryKey: queryKeys.orders(activeOnly),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiFetch<PaginatedResponse<OrderDto>>(
        `/orders?limit=20${activeOnly ? '&activeOnly=true' : ''}${pageParam ? `&cursor=${pageParam}` : ''}`,
      ),
    getNextPageParam: (last) => last.nextCursor,
    enabled: isAuthenticated,
    staleTime: 30 * 1000,
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: queryKeys.order(id),
    queryFn: () => apiFetch<OrderDto>(`/orders/${id}`),
    enabled: Boolean(id),
    // Статус меняет заведение — обновляем, пока экран открыт
    refetchInterval: 20 * 1000,
  });
}

export function useCancelOrder(orderId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reason?: string) =>
      apiFetch<OrderDto>(`/orders/${orderId}/cancel`, { method: 'POST', body: { reason } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.order(orderId) }),
        queryClient.invalidateQueries({ queryKey: ['orders'] }),
      ]);
    },
  });
}

/** Заказы заведения — лента в кабинете, обновляется сама. */
export function usePlaceOrders(placeId: string) {
  return useQuery({
    queryKey: queryKeys.placeOrders(placeId),
    queryFn: () => apiFetch<PaginatedResponse<OrderDto>>(`/my/places/${placeId}/orders?limit=30`),
    enabled: Boolean(placeId),
    // Push-уведомлений о новом заказе пока нет: пока экран открыт,
    // лента сама подтягивает новые заказы
    refetchInterval: 20 * 1000,
  });
}

export function useChangeOrderStatus(placeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: OrderStatus }) =>
      apiFetch<OrderDto>(`/my/orders/${orderId}/status`, { method: 'POST', body: { status } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.placeOrders(placeId) });
    },
  });
}

// ── Объявления (Этап 7) ──────────────────────────────────────────────────────

/** Фильтры каталога объявлений. Пустые значения в запрос не попадают. */
export interface ListingFilters {
  category?: string;
  search?: string;
  /** Цена в рублях — в копейки переводит этот файл, сервер ждёт копейки */
  priceFrom?: number;
  priceTo?: number;
  /** Единица, в которой сравнивается цена; без неё сервер выводит её из категории и сделки */
  priceUnit?: ListingPriceUnit;
  /** Что ищет покупатель: «купить» — это sale, «снять» — rent */
  transactionType?: ListingTransactionType;
  rentPeriod?: ListingRentPeriod;
  onlyWithPhoto?: boolean;
  favoritesOnly?: boolean;
  sellerId?: string;
  sort?: 'recommended' | 'date' | 'price_asc' | 'price_desc' | 'distance';
  /**
   * Где человек находится. От этого зависят расстояние в карточке, радиус
   * и сортировка «Ближе ко мне». Пусто — он не разрешил определять место.
   */
  latitude?: number;
  longitude?: number;
  /** Искать в пределах стольких километров от точки */
  radiusKm?: number;
  /** «Весь Дагестан»: искать по всем городам, а не только по своему */
  regionWide?: boolean;
  /** Значения характеристик: { gearbox: 'auto', rooms: [2, 3] } */
  attributes?: Record<string, unknown>;
  /**
   * Снимок ленты на момент открытия. Пока человек листает, кто-то поднимает
   * своё объявление — без этого карточка показалась бы дважды или потерялась.
   */
  freshBefore?: string;
}

function listingQuery(
  cityId: string,
  filters: ListingFilters,
  cursor: string | null,
  limit = 20,
): string {
  const params = new URLSearchParams({ limit: String(limit) });
  // Город — запасной центр для сервера; при точке с радиусом он не сужает выдачу
  if (cityId) params.set('cityId', cityId);

  if (filters.category) params.set('category', filters.category);
  if (filters.search) params.set('search', filters.search);
  if (filters.priceFrom !== undefined) params.set('priceFrom', String(filters.priceFrom * 100));
  if (filters.priceTo !== undefined) params.set('priceTo', String(filters.priceTo * 100));
  if (filters.priceUnit) params.set('priceUnit', filters.priceUnit);
  if (filters.transactionType) params.set('transactionType', filters.transactionType);
  if (filters.rentPeriod) params.set('rentPeriod', filters.rentPeriod);
  if (filters.onlyWithPhoto) params.set('onlyWithPhoto', 'true');
  if (filters.favoritesOnly) params.set('favoritesOnly', 'true');
  if (filters.sellerId) params.set('sellerId', filters.sellerId);
  if (filters.sort) params.set('sort', filters.sort);
  if (filters.attributes && Object.keys(filters.attributes).length > 0) {
    params.set('attributes', JSON.stringify(filters.attributes));
  }
  if (filters.freshBefore) params.set('freshBefore', filters.freshBefore);
  if (filters.latitude !== undefined && filters.longitude !== undefined) {
    params.set('latitude', String(filters.latitude));
    params.set('longitude', String(filters.longitude));
  }
  // Радиус без координат сервер проигнорирует, но и посылать его незачем
  if (filters.radiusKm !== undefined && filters.latitude !== undefined) {
    params.set('radiusKm', String(filters.radiusKm));
  }
  if (filters.regionWide) params.set('regionWide', 'true');
  if (cursor) params.set('cursor', cursor);

  return params.toString();
}

/**
 * Лента объявлений города.
 *
 * Запрос идёт с токеном, если он есть: маршрут публичный, но по токену
 * сервер закрашивает сердечки. Гостю тот же запрос отвечает без них.
 */
export function useListings(cityId: string | null, filters: ListingFilters, enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.listings(cityId, JSON.stringify(filters)),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiFetch<PaginatedResponse<ListingDto>>(
        `/listings?${listingQuery(cityId ?? '', filters, pageParam)}`,
      ),
    getNextPageParam: (last) => last.nextCursor,
    // Выдаче нужен центр: город или точка места поиска
    enabled: enabled && (Boolean(cityId) || filters.latitude !== undefined),
    staleTime: 60 * 1000,
  });
}

/**
 * Сколько объявлений найдётся при таких фильтрах — для кнопки «Показать 1 248
 * объявлений» на экране фильтров.
 *
 * Тот же маршрут, что у ленты, но с одной карточкой на странице: сервер
 * считает число с теми же условиями (радиус, характеристики, цена в своей
 * единице), поэтому цифра на кнопке совпадёт с тем, что человек увидит. Отдельного
 * «дешёвого» счётчика не заводим: подсчёт уже идёт индексами, а второй путь
 * с теми же условиями однажды разойдётся с лентой.
 */
export function useListingCount(cityId: string | null, filters: ListingFilters, enabled = true) {
  return useQuery({
    queryKey: ['listing-count', cityId, JSON.stringify(filters)],
    queryFn: async () => {
      const page = await apiFetch<PaginatedResponse<ListingDto>>(
        `/listings?${listingQuery(cityId ?? '', filters, null, 1)}`,
      );
      return page.total ?? 0;
    },
    enabled: enabled && (Boolean(cityId) || filters.latitude !== undefined),
    staleTime: 30 * 1000,
    // Пока считается новое число, на кнопке остаётся прежнее, а не «Ищем…»
    placeholderData: (previous) => previous,
  });
}

/**
 * Объявление целиком.
 *
 * Координаты передаются, если человек разрешил определять место: иначе в
 * списке карточка говорила бы «3 км», а в открытом объявлении расстояние
 * пропадало бы.
 */
export function useListing(id: string, point?: { latitude?: number; longitude?: number }) {
  const coordinates =
    point?.latitude !== undefined && point.longitude !== undefined
      ? `?latitude=${point.latitude}&longitude=${point.longitude}`
      : '';

  return useQuery({
    queryKey: queryKeys.listing(id, coordinates),
    queryFn: () => apiFetch<ListingDetailsDto>(`/listings/${id}${coordinates}`),
    enabled: Boolean(id),
    staleTime: 60 * 1000,
  });
}

/**
 * Дерево категорий вместе с полями каждой категории: по ним строится и форма
 * подачи, и экран фильтров. Справочник меняется раз в месяц — держим дольше.
 */
export function useListingCategories() {
  return useQuery({
    queryKey: queryKeys.listingCategories,
    queryFn: () =>
      apiFetch<ListingCategoryDto[]>('/listings/categories?withAttributes=1', {
        anonymous: true,
      }),
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * Подсказки к строке поиска: категории, марки, популярные заголовки.
 * От двух символов — по одной букве подсказывать нечего.
 */
export function useListingSuggestions(cityId: string | null, q: string) {
  const needle = q.trim();
  return useQuery({
    queryKey: queryKeys.listingSuggestions(cityId, needle),
    queryFn: () =>
      apiFetch<ListingSuggestionDto[]>(
        `/listings/suggest?cityId=${cityId}&q=${encodeURIComponent(needle)}`,
        { anonymous: true },
      ),
    enabled: Boolean(cityId) && needle.length >= 2,
    staleTime: 60 * 1000,
  });
}

/**
 * Справочник значений: модели выбранной марки. Марки приходят вместе с
 * полями категории, а моделей сотни — их запрашивают по родителю.
 */
export function useDictionary(kind: string | undefined, parent: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.listingDictionary(kind ?? '', parent ?? null),
    queryFn: () =>
      apiFetch<ListingDictionaryEntryDto[]>(
        `/listings/dictionaries/${encodeURIComponent(kind ?? '')}${parent ? `?parent=${encodeURIComponent(parent)}` : ''}`,
        { anonymous: true },
      ),
    enabled: Boolean(kind),
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * Показать номер телефона. Отдельный запрос, а не поле карточки: так номера
 * не собирает первый же скрипт, а продавец видит, сколько раз его открыли.
 */
export function useRevealPhone() {
  return useMutation({
    mutationFn: (listingId: string) =>
      apiFetch<ListingPhoneDto>(`/listings/${listingId}/phone`, { method: 'POST' }),
  });
}

/**
 * Сердечко на объявлении. Закрашивается сразу, до ответа сервера: ждать
 * ответ ради галочки — значит показывать задержку там, где её быть не должно.
 * Сорвалось — откатываем к прежнему состоянию.
 */
export function useToggleListingFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ listingId }: { listingId: string; isFavorite: boolean }) =>
      apiFetch<{ isFavorite: boolean }>(`/listings/${listingId}/favorite`, { method: 'POST' }),

    onMutate: async ({ listingId, isFavorite }) => {
      await queryClient.cancelQueries({ queryKey: ['listings'] });
      const listSnapshot = queryClient.getQueriesData({ queryKey: ['listings'] });
      // Карточка лежит в кеше под ключом с координатами, и их может быть
      // несколько (место определилось не сразу). Поэтому не один ключ, а все
      // записи объявления
      const cardSnapshot = queryClient.getQueriesData({ queryKey: ['listing', listingId] });

      queryClient.setQueriesData<{ pages: PaginatedResponse<ListingDto>[] }>(
        { queryKey: ['listings'] },
        (old) =>
          old
            ? {
                ...old,
                pages: old.pages.map((page) => ({
                  ...page,
                  items: page.items.map((listing) =>
                    listing.id === listingId ? { ...listing, isFavorite: !isFavorite } : listing,
                  ),
                })),
              }
            : old,
      );

      queryClient.setQueriesData<ListingDetailsDto>({ queryKey: ['listing', listingId] }, (old) =>
        old ? { ...old, isFavorite: !isFavorite } : old,
      );

      return { listSnapshot, cardSnapshot, listingId };
    },

    onError: (_err, _vars, context) => {
      context?.listSnapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
      context?.cardSnapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },

    // Список «только избранное» после переключения меняет состав, а не
    // только галочку — его нужно перезапросить целиком
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['listings'] }),
        queryClient.invalidateQueries({ queryKey: ['favorite-listings'] }),
      ]);
    },
  });
}

/**
 * Избранные объявления — с проданными и снятыми: у них пометка, что с ними
 * стало, чтобы карточка не исчезала молча.
 */
export function useFavoriteListings(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['favorite-listings'] as const,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiFetch<PaginatedResponse<FavoriteListingDto>>(
        `/listings/favorites?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    getNextPageParam: (last) => last.nextCursor,
    enabled,
    staleTime: 15 * 1000,
  });
}

/** Публичный профиль продавца. */
export function useSellerProfile(sellerId: string | undefined) {
  return useQuery({
    queryKey: ['seller', sellerId] as const,
    queryFn: () => apiFetch<SellerProfileDto>(`/sellers/${sellerId}`),
    enabled: Boolean(sellerId),
    staleTime: 60 * 1000,
  });
}

/** Объявления продавца: «Активные» или «Завершённые» (продано, снято). */
export function useSellerListings(sellerId: string | undefined, status: 'active' | 'completed') {
  return useInfiniteQuery({
    queryKey: ['seller-listings', sellerId, status] as const,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiFetch<PaginatedResponse<SellerListingDto>>(
        `/sellers/${sellerId}/listings?status=${status}&limit=20${
          pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''
        }`,
      ),
    getNextPageParam: (last) => last.nextCursor,
    enabled: Boolean(sellerId),
    staleTime: 30 * 1000,
  });
}

/** Жалоба на объявление. */
export function useReportListing() {
  return useMutation({
    mutationFn: ({
      listingId,
      reason,
      comment,
    }: {
      listingId: string;
      reason: string;
      comment?: string;
    }) =>
      apiFetch<{ ok: true }>(`/listings/${listingId}/report`, {
        method: 'POST',
        body: { reason, ...(comment ? { comment } : {}) },
      }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Мои объявления (Этап 7, часть 2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Свои объявления: активные, черновики и архив.
 *
 * Отдельно от ленты и по другому ключу: в кабинете видно то, чего в ленте
 * нет вообще, — черновики и снятое. Смешивать их в одном кеше нельзя, иначе
 * черновик однажды покажется в выдаче.
 */
export function useMyListings(filter: { status?: ModerationStatus; group?: 'review' } = {}) {
  const { status, group } = filter;
  return useInfiniteQuery({
    queryKey: queryKeys.myListings(group ?? status ?? 'all'),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiFetch<PaginatedResponse<MyListingDto>>(
        `/my/listings?limit=20${status ? `&status=${status}` : ''}${group ? `&group=${group}` : ''}${
          pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''
        }`,
      ),
    getNextPageParam: (last) => last.nextCursor,
    // Кабинет человек открывает, чтобы увидеть сегодняшние цифры просмотров
    staleTime: 30 * 1000,
  });
}

/**
 * Своё объявление целиком — для экрана правки. Настоящий телефон и полные
 * характеристики, а не то, что видит покупатель на публичной карточке.
 */
export function useMyListing(id: string) {
  return useQuery({
    queryKey: queryKeys.myListing(id),
    queryFn: () => apiFetch<MyListingDetailsDto>(`/my/listings/${id}`),
    enabled: Boolean(id),
    staleTime: 10 * 1000,
  });
}

/**
 * Действие над своим объявлением: поднять, снять, вернуть, удалить.
 *
 * Все они меняют и кабинет, и общую ленту: снятое объявление обязано
 * исчезнуть из выдачи сразу, а не после перезапуска приложения.
 */
function useMyListingMutation<TVariables, TResult = unknown>(
  request: (variables: TVariables) => Promise<TResult>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: request,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['my-listings'] }),
        queryClient.invalidateQueries({ queryKey: ['my-listing'] }),
        queryClient.invalidateQueries({ queryKey: ['listings'] }),
        queryClient.invalidateQueries({ queryKey: ['listing'] }),
      ]);
    },
  });
}

/** Подача объявления. `draft` сохраняет черновик вместо публикации. */
export function useCreateListing() {
  return useMyListingMutation<{ dto: CreateListingDto; draft?: boolean }, MyListingDto>(
    ({ dto, draft }) =>
      apiFetch<MyListingDto>(`/my/listings${draft ? '?draft=1' : ''}`, {
        method: 'POST',
        body: dto,
      }),
  );
}

export function useUpdateMyListing() {
  return useMyListingMutation<{ id: string; dto: UpdateMyListingDto }>(({ id, dto }) =>
    apiFetch<MyListingDto>(`/my/listings/${id}`, { method: 'PATCH', body: dto }),
  );
}

/** Полный состав и порядок фотографий: первая становится обложкой. */
export function useSetListingPhotos() {
  return useMyListingMutation<{ id: string; photoIds: string[] }>(({ id, photoIds }) =>
    apiFetch<{ ok: true }>(`/my/listings/${id}/photos`, { method: 'PUT', body: { photoIds } }),
  );
}

export function usePublishListing() {
  return useMyListingMutation<string>((id) =>
    apiFetch<MyListingDto>(`/my/listings/${id}/publish`, { method: 'POST' }),
  );
}

/** Снятое модератором — после исправления снова на проверку. */
export function useResubmitListing() {
  return useMyListingMutation<string>((id) =>
    apiFetch<MyListingDto>(`/my/listings/${id}/resubmit`, { method: 'POST' }),
  );
}

export function useBumpListing() {
  return useMyListingMutation<string>((id) =>
    apiFetch<MyListingDto>(`/my/listings/${id}/bump`, { method: 'POST' }),
  );
}

export function useArchiveListing() {
  return useMyListingMutation<{ id: string; reason: 'sold' | 'withdrawn' }>(({ id, reason }) =>
    apiFetch<MyListingDto>(`/my/listings/${id}/archive`, { method: 'POST', body: { reason } }),
  );
}

export function useDeleteListing() {
  return useMyListingMutation<string>((id) =>
    apiFetch<{ ok: true }>(`/my/listings/${id}`, { method: 'DELETE' }),
  );
}

// ── Геокодирование (ADR-0010) ────────────────────────────────────────────────

/**
 * Подсказки адреса: населённые пункты, улицы, дома Дагестана.
 *
 * Строка — уже с задержкой (useDebouncedValue у вызывающего): запрос уходит,
 * когда человек остановился. Прошлые варианты держатся на экране, пока
 * грузятся новые, — список не мигает на каждую букву. Повторов нет: сбой
 * геокодера показывается сразу, а не через три попытки.
 */
export function useGeoSuggest(
  q: string,
  options: { kind?: 'any' | 'settlement'; near?: GeoCoordinates | null; enabled?: boolean } = {},
) {
  const needle = q.trim();
  const kind = options.kind ?? 'any';
  const near = options.near
    ? `${options.near.latitude.toFixed(2)},${options.near.longitude.toFixed(2)}`
    : '';

  return useQuery({
    queryKey: ['geo-suggest', kind, near, needle.toLowerCase()] as const,
    queryFn: () => {
      const params = new URLSearchParams({ q: needle, kind });
      if (options.near) {
        params.set('latitude', String(options.near.latitude));
        params.set('longitude', String(options.near.longitude));
      }
      return apiFetch<GeoPlaceDto[]>(`/geo/suggest?${params.toString()}`, { anonymous: true });
    },
    enabled: needle.length >= 2 && (options.enabled ?? true),
    staleTime: 10 * 60 * 1000,
    retry: false,
    placeholderData: (previous) => previous,
  });
}

/** Адрес по точке. null — адресов там нет (море, горы), точка при этом годная. */
export function reverseGeocode(point: GeoCoordinates): Promise<GeoPlaceDto | null> {
  const params = new URLSearchParams({
    latitude: String(point.latitude),
    longitude: String(point.longitude),
  });
  return apiFetch<GeoPlaceDto | null>(`/geo/reverse?${params.toString()}`, { anonymous: true });
}
