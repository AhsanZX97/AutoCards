import type { en } from '../en';
import type { Dict } from '../shape';
import { common } from './common';
import { auth } from './auth';
import { nav } from './nav';
import { dashboard } from './dashboard';
import { decks } from './decks';
import { study } from './study';
import { settings } from './settings';
import { stats } from './stats';
import { marketing } from './marketing';
import { feedback } from './feedback';
import { billing } from './billing';
import { onboarding } from './onboarding';

export const es: Dict<typeof en> = {
  ...common,
  ...auth,
  ...nav,
  ...dashboard,
  ...decks,
  ...study,
  ...settings,
  ...stats,
  ...marketing,
  ...feedback,
  ...billing,
  ...onboarding,
};
