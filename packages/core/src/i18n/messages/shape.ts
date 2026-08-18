/**
 * Same keys as `T`, every value loosened to `string`.
 *
 * The English catalogs are declared `as const` so a typo in a component's key
 * fails to compile — but that also pins each value to its own literal type,
 * which a translation can never match verbatim. Every other-language catalog
 * is typed through this instead: the compiler still catches a missing or
 * misspelled key, just not a translation that isn't word-for-word English.
 */
export type Dict<T> = { [K in keyof T]: string };
