import { DEFAULT_LOCALE, type Locale } from './locale';
import { CATALOGS, type MessageKey, type Messages } from './messages';

export type { MessageKey, Messages };

/** Values substituted into `{placeholder}` slots. */
export type MessageParams = Record<string, string | number>;

/**
 * Keys that come as a `_one` / `_other` pair, derived from the catalog itself
 * so `t.plural` can only be handed a key that actually has both halves.
 *
 * Written as `K extends unknown ? ... : never` over a bare type parameter
 * rather than `MessageKey extends ...` directly — a conditional type only
 * distributes over a union when the checked type is a naked type parameter,
 * so the direct form collapses the whole union to `never` instead of picking
 * out the matching members.
 */
export type PluralKey = DistributedPluralKey<MessageKey>;
type DistributedPluralKey<K> = K extends `${infer Base}_other` ? Base : never;

const PLACEHOLDER = /\{(\w+)\}/g;

function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export interface Translator {
  /** The message for `key`, with any `{placeholder}` filled from `params`. */
  (key: MessageKey, params?: MessageParams): string;
  readonly locale: Locale;
  /**
   * The singular or plural form of `key`, with `{count}` already filled in.
   *
   * English and Spanish share the same one/other split, so a single `n === 1`
   * test covers both. A language that doesn't would need `Intl.PluralRules`
   * here instead.
   */
  plural(key: PluralKey, count: number, params?: MessageParams): string;
}

/**
 * Looks a message up, falling back to English and then to the key itself.
 *
 * The catalogs are type-checked against each other so a missing translation is
 * a build error rather than something to discover at runtime — but a persisted
 * locale from a newer build, or a key built at runtime, can still miss. Showing
 * English beats showing nothing.
 */
function lookup(locale: Locale, key: MessageKey): string {
  return CATALOGS[locale][key] ?? CATALOGS[DEFAULT_LOCALE][key] ?? key;
}

export function createTranslator(locale: Locale): Translator {
  const resolved = CATALOGS[locale] ? locale : DEFAULT_LOCALE;

  const t = ((key: MessageKey, params?: MessageParams) =>
    interpolate(lookup(resolved, key), params)) as Translator;

  Object.defineProperty(t, 'locale', { value: resolved, enumerable: true });

  t.plural = (key, count, params) => {
    const form = `${key}_${count === 1 ? 'one' : 'other'}` as MessageKey;
    return interpolate(lookup(resolved, form), { count, ...params });
  };

  return t;
}
