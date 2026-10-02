import { create } from 'zustand';

import type { Country } from '../components/PhoneInput';
import { DEFAULT_COUNTRY } from '../components/PhoneInput';

/**
 * Состояние процесса регистрации и восстановления пароля.
 *
 * Регистрация идёт по трём экранам: телефон → код из SMS → пароль и имя.
 * Между ними нужно передавать номер и одноразовый «пропуск», выданный
 * сервером после проверки кода.
 *
 * Хранится в памяти, а не в адресе экрана: на вебе параметры адреса видны
 * в строке браузера, попадают в историю и в закладки. Пропуск подтверждения
 * номера там оказаться не должен.
 */

export type AuthPurpose = 'registration' | 'password_reset';

interface AuthFlowState {
  purpose: AuthPurpose;
  country: Country;
  /** Только цифры, без кода страны */
  digits: string;
  /** Номер в международном формате, каким его принял сервер */
  phone: string;
  /** Замаскированный номер для показа: +7928***-**-00 */
  maskedPhone: string;
  /** Пропуск, полученный после верного кода из SMS */
  verificationToken: string | null;
  /** Через сколько секунд можно запросить код повторно */
  resendAfterSeconds: number;
  /**
   * Код из SMS в режиме разработки. На боевом сервере всегда пусто —
   * поле существует, чтобы можно было проверять регистрацию,
   * не подключая платного SMS-провайдера.
   */
  devCode: string | null;

  /**
   * Номер на экране входа — отдельно от регистрации. Живёт здесь, а не в
   * самом экране: ушли на «Забыли пароль?» или «Создать аккаунт» и
   * вернулись — номер на месте, вводить заново не нужно.
   */
  login: { country: Country; digits: string };
  setLogin: (login: { country: Country; digits: string }) => void;

  startFlow: (purpose: AuthPurpose) => void;
  setCountry: (country: Country) => void;
  setDigits: (digits: string) => void;
  setCodeRequested: (data: {
    phone: string;
    maskedPhone: string;
    resendAfterSeconds: number;
    devCode?: string | undefined;
  }) => void;
  setVerified: (token: string) => void;
  reset: () => void;
}

const initialState = {
  purpose: 'registration' as AuthPurpose,
  country: DEFAULT_COUNTRY,
  digits: '',
  phone: '',
  maskedPhone: '',
  verificationToken: null,
  resendAfterSeconds: 0,
  devCode: null,
};

const initialLogin = { country: DEFAULT_COUNTRY, digits: '' };

export const useAuthFlowStore = create<AuthFlowState>((set) => ({
  ...initialState,
  login: initialLogin,
  setLogin: (login) => set({ login }),

  startFlow: (purpose) => set({ ...initialState, purpose }),
  setCountry: (country) => set({ country, digits: '' }),
  setDigits: (digits) => set({ digits }),

  setCodeRequested: ({ phone, maskedPhone, resendAfterSeconds, devCode }) =>
    set({ phone, maskedPhone, resendAfterSeconds, devCode: devCode ?? null }),

  setVerified: (verificationToken) => set({ verificationToken }),

  reset: () => set(initialState),
}));
