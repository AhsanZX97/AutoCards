import type { onboarding as en } from '../en/onboarding';
import type { Dict } from '../shape';

export const onboarding: Dict<typeof en> = {
  'onboarding.skip': 'Omitir',
  'onboarding.next': 'Siguiente',
  'onboarding.back': 'Atrás',
  'onboarding.done': 'Listo',

  'onboarding.upload.title': 'Convierte cualquier documento en tarjetas',
  'onboarding.upload.body': 'Sube un PDF, un Word, una presentación o texto plano — AutoCards lo lee y escribe las tarjetas por ti.',

  'onboarding.deck.title': 'Tu mazo, listo en segundos',
  'onboarding.deck.body': 'Cada tarjeta queda organizada y editable, así que puedes corregir lo que haga falta antes de estudiar.',

  'onboarding.study.title': 'Estudia a tu manera',
  'onboarding.study.body': 'Desliza entre tarjetas, califícate y deja que la repetición espaciada recupere lo que estás olvidando.',

  'onboarding.stats.title': 'Mira crecer tu progreso',
  'onboarding.stats.body': 'Rachas, XP y logros te hacen volver — mira exactamente cuánto has avanzado.',

  'onboarding.plans.title': 'Elige un plan',
  'onboarding.plans.body': 'El plan gratuito es un plan de verdad, no una prueba. Puedes cambiarlo luego en Ajustes.',
  'onboarding.plans.upgradeLaterTitle': 'Guardado para después',
  'onboarding.plans.upgradeLaterBody': 'Comprar todavía no está disponible en este dispositivo — puedes mejorar tu plan cuando quieras desde Ajustes.',
  'onboarding.plans.purchaseFailed': 'La compra no se completó',
};
