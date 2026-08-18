import type { feedback as en } from '../en/feedback';
import type { Dict } from '../shape';

export const feedback: Dict<typeof en> = {
  'feedback.title': 'Enviar comentarios',
  'feedback.description': 'Errores, ideas, cualquier cosa que no funcione — llega directo al equipo.',
  'feedback.cancel': 'Cancelar',
  'feedback.sending': 'Enviando…',
  'feedback.send': 'Enviar',
  'feedback.yourMessage': 'Tu mensaje',
  'feedback.charCount': '{used}/{max}',
  'feedback.placeholder': '¿Qué tienes en mente?',
  'feedback.sentTitle': 'Gracias — comentarios enviados',
  'feedback.sendFailed': 'No pudimos enviarlo en este momento. Inténtalo de nuevo en un rato.',
};
