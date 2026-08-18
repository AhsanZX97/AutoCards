import { isRetiredCardType, type CardType, type Translator } from '@autocards/core';

/** Label for a type read back off a stored card, retired ones included — see `cardTypeLabel` in core. */
export function cardTypeLabelT(t: Translator, type: string): string {
  const key = (isRetiredCardType(type) ? 'basic' : type) as CardType;
  return t(`cardType.${key}` as const);
}
