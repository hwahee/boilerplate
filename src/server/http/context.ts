/**
 * Per-request context: negotiated locale + a bound translator.
 *
 * Locale resolution order: explicit `?lang=` override → `Accept-Language`
 * header → default locale. API error messages are localized with this.
 */
import {
  isLocale,
  negotiateLocale,
  translate,
  type Locale,
  type MessageKey,
  type MessageParams,
} from '@shared/i18n';

export interface RequestContext {
  locale: Locale;
  t(key: MessageKey, params?: MessageParams): string;
}

export function createRequestContext(req: Request): RequestContext {
  const langParam = new URL(req.url).searchParams.get('lang');
  const locale: Locale = isLocale(langParam)
    ? langParam
    : negotiateLocale(req.headers.get('accept-language'));
  return {
    locale,
    t: (key, params) => translate(locale, key, params),
  };
}
