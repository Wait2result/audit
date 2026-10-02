import { Inject, Injectable, Logger } from '@nestjs/common';
import { ErrorCode, maskPhone } from '@dagestan/shared';

import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { AppException } from '../../common/errors/app.exception.js';

export interface SmsSendResult {
  success: boolean;
  /** Идентификатор сообщения у провайдера — нужен для разбора претензий */
  providerMessageId?: string;
  /** Стоимость отправки, если провайдер её сообщает — для контроля бюджета */
  cost?: number;
}

/**
 * Отправка SMS.
 *
 * Провайдер выбирается настройкой SMS_PROVIDER, а не жёстко зашит в код:
 * SMS-агрегаторы меняют тарифы и иногда отключаются, и переход на другого
 * должен быть сменой одной строки в .env, а не переписыванием авторизации.
 *
 * Режим «console» — для разработки: код печатается в консоль сервера, SMS
 * не отправляется, деньги не тратятся. В production этот режим запрещён
 * проверкой конфигурации при старте (см. config/env.ts).
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async send(phone: string, text: string): Promise<SmsSendResult> {
    switch (this.config.SMS_PROVIDER) {
      case 'console':
        return this.sendToConsole(phone, text);
      case 'smsc':
        return this.sendViaSmsc(phone, text);
      case 'smsru':
        return this.sendViaSmsRu(phone, text);
      default:
        throw new Error(`Неизвестный провайдер SMS: ${String(this.config.SMS_PROVIDER)}`);
    }
  }

  /** Режим разработки: ничего не отправляем, печатаем в консоль. */
  private sendToConsole(phone: string, text: string): SmsSendResult {
    this.logger.warn(
      `\n` +
        `┌──────────────── SMS (режим разработки) ────────────────\n` +
        `│ Кому:  ${phone}\n` +
        `│ Текст: ${text}\n` +
        `└────────────────────────────────────────────────────────`,
    );
    return { success: true, providerMessageId: 'console' };
  }

  /** SMSC.ru — один из основных российских агрегаторов. */
  private async sendViaSmsc(phone: string, text: string): Promise<SmsSendResult> {
    const params = new URLSearchParams({
      login: this.config.SMSC_LOGIN,
      psw: this.config.SMSC_PASSWORD,
      phones: phone,
      mes: text,
      sender: this.config.SMS_SENDER_NAME,
      charset: 'utf-8',
      fmt: '3', // ответ в формате JSON
      cost: '3', // вернуть стоимость отправки
    });

    const response = await this.request(`https://smsc.ru/sys/send.php?${params.toString()}`);
    const data = (await response.json()) as {
      id?: number;
      cost?: string;
      error?: string;
      error_code?: number;
    };

    if (data.error) {
      this.logger.error(
        { phone: maskPhone(phone), error: data.error, code: data.error_code },
        'SMSC отклонил отправку',
      );
      throw new AppException(
        ErrorCode.SMS_SEND_FAILED,
        'Не удалось отправить SMS. Попробуйте позже.',
        502,
      );
    }

    return {
      success: true,
      providerMessageId: data.id ? String(data.id) : undefined,
      cost: data.cost ? Number(data.cost) : undefined,
    };
  }

  /** SMS.RU — альтернативный агрегатор. */
  private async sendViaSmsRu(phone: string, text: string): Promise<SmsSendResult> {
    const params = new URLSearchParams({
      api_id: this.config.SMSRU_API_ID,
      to: phone,
      msg: text,
      from: this.config.SMS_SENDER_NAME,
      json: '1',
    });

    const response = await this.request(`https://sms.ru/sms/send?${params.toString()}`);
    const data = (await response.json()) as {
      status: string;
      status_text?: string;
      sms?: Record<string, { status: string; sms_id?: string; status_text?: string }>;
    };

    if (data.status !== 'OK') {
      this.logger.error(
        { phone: maskPhone(phone), status: data.status, text: data.status_text },
        'SMS.RU отклонил отправку',
      );
      throw new AppException(
        ErrorCode.SMS_SEND_FAILED,
        'Не удалось отправить SMS. Попробуйте позже.',
        502,
      );
    }

    const entry = data.sms?.[phone];
    return { success: true, providerMessageId: entry?.sms_id };
  }

  /**
   * Запрос к провайдеру с обязательным ограничением по времени.
   *
   * Без таймаута зависший провайдер задержал бы наш запрос на минуты,
   * занимая соединение. При наплыве регистраций это привело бы к отказу
   * всего сервера — то есть провайдер стал бы точкой отказа платформы.
   */
  private async request(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new AppException(ErrorCode.SMS_SEND_FAILED, 'Сервис отправки SMS недоступен', 502);
      }
      return response;
    } catch (err) {
      if (err instanceof AppException) throw err;
      this.logger.error({ err }, 'Сбой обращения к провайдеру SMS');
      throw new AppException(ErrorCode.SMS_SEND_FAILED, 'Сервис отправки SMS недоступен', 502);
    } finally {
      clearTimeout(timeout);
    }
  }
}
