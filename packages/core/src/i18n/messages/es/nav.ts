import type { nav as en } from '../en/nav';
import type { Dict } from '../shape';

export const nav: Dict<typeof en> = {
  'nav.home': 'Inicio',
  'nav.createDeck': 'Crear mazo',
  'nav.dashboard': 'Panel',
  'nav.myDecks': 'Mis mazos',
  'nav.stats': 'Estadísticas',
  'nav.settings': 'Ajustes',
  'nav.newDeck': 'Nuevo mazo',
  'nav.feedback': 'Comentarios',
  'nav.openMenu': 'Abrir menú',
  'nav.savingWork': 'Guardando tu trabajo…',
  'nav.unsyncedTitle': 'Algunos cambios aún no se han guardado',
  'nav.unsyncedBody': 'No pudimos conectar con el servidor para guardar tu trabajo más reciente.',
  'nav.unsyncedBodyDetail': 'Cerrar sesión borra este dispositivo, así que cualquier cosa que no se haya guardado en tu cuenta se perdería. Lo normal es mantener la sesión iniciada hasta que vuelvas a tener conexión: se guarda solo en cuanto la conexión regresa.',
  'nav.staySignedIn': 'Mantener sesión iniciada',
  'nav.signOutAndLose': 'Cerrar sesión y perderlos',

  'nav.marketing.features': 'Funciones',
  'nav.marketing.pricing': 'Precios',
  'nav.marketing.howItWorks': 'Cómo funciona',
  'nav.marketing.goToApp': 'Ir a la app',
  'nav.marketing.signIn': 'Iniciar sesión',
  'nav.marketing.getStarted': 'Empieza gratis',
  'nav.marketing.allRightsReserved': '© {year} Auto Cards. Todos los derechos reservados.',
  'nav.marketing.privacy': 'Privacidad',
  'nav.marketing.terms': 'Términos',
  'nav.marketing.contact': 'Contacto',

  'nav.errorBoundary.title': 'Algo salió mal en esta pantalla',
  'nav.errorBoundary.body': 'Tus mazos están a salvo. Recargar suele solucionarlo — si sigue pasando, envíanos los detalles de abajo y lo arreglaremos.',
  'nav.errorBoundary.bodyMobile': 'Tus mazos están a salvo. Intentarlo de nuevo suele solucionarlo — si sigue pasando, envíanos los detalles de abajo y lo arreglaremos.',
  'nav.errorBoundary.reload': 'Recargar',
  'nav.errorBoundary.tryAgain': 'Intentar de nuevo',
  'nav.errorBoundary.backToDecks': 'Volver a mis mazos',
  'nav.errorBoundary.technicalDetails': 'Detalles técnicos',
};
