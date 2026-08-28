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

export const en = {
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
} as const;
