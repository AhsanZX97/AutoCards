import { en } from './en';
import { es } from './es';
import type { Locale } from '../locale';
import type { Dict } from './shape';

export type Messages = Dict<typeof en>;
export type MessageKey = keyof Messages;

export const CATALOGS: Record<Locale, Messages> = { en, es };
