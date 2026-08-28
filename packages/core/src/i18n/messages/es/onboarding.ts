import type { onboarding as en } from '../en/onboarding';
import type { Dict } from '../shape';

export const onboarding: Dict<typeof en> = {
  'onboarding.skip': 'Omitir',
  'onboarding.next': 'Siguiente',
  'onboarding.back': 'Atrás',
  'onboarding.getStarted': 'Empezar',

  'onboarding.upload.title': 'Convierte cualquier documento en tarjetas',
  'onboarding.upload.body': 'Sube un PDF, un Word, una presentación o texto plano — AutoCards lo lee y escribe las tarjetas por ti.',

  'onboarding.deck.title': 'Tu mazo, listo en segundos',
  'onboarding.deck.body': 'Cada tarjeta queda organizada y editable, así que puedes corregir lo que haga falta antes de estudiar.',

  'onboarding.study.title': 'Estudia a tu manera',
  'onboarding.study.body': 'Desliza entre tarjetas, califícate y deja que la repetición espaciada recupere lo que estás olvidando.',

  'onboarding.stats.title': 'Mira crecer tu progreso',
  'onboarding.stats.body': 'Rachas, XP y logros te hacen volver — mira exactamente cuánto has avanzado.',
};
