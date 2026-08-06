/** Stable empty-array reference for zustand selector fallbacks — a fresh `[]` literal on every call breaks `useSyncExternalStore`'s reference equality check and causes an infinite render loop. */
export const EMPTY_ARRAY: never[] = [];
