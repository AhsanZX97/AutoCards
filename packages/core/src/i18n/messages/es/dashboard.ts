import type { dashboard as en } from '../en/dashboard';
import type { Dict } from '../shape';

export const dashboard: Dict<typeof en> = {
  'dashboard.welcome': '¡Bienvenido de nuevo, {name}! 👋',
  'dashboard.guestName': 'amigo',
  'dashboard.decksReady_one': 'Tienes {count} mazo listo para estudiar.',
  'dashboard.decksReady_other': 'Tienes {count} mazos listos para estudiar.',
  'dashboard.noDecksYetPrompt': 'Crea tu primer mazo para empezar.',
  'dashboard.createDeck': '+ Crear un mazo',

  'dashboard.stat.dayStreak': 'Racha de días',
  'dashboard.stat.atRiskToday': 'En riesgo hoy',
  'dashboard.stat.best': 'Mejor: {count}',
  'dashboard.stat.level': 'Nivel',
  'dashboard.stat.xpProgress': '{into}/{needed} XP',
  'dashboard.stat.accuracy': 'Precisión',
  'dashboard.stat.cardsAnswered': '{count} tarjetas respondidas',
  'dashboard.stat.decks': 'Mazos',
  'dashboard.stat.cardsTotal': '{count} tarjetas en total',

  'dashboard.yourDecks': 'Tus mazos',
  'dashboard.viewAll': 'Ver todos',
  'dashboard.percentMastered': '{percent}% dominado',

  'dashboard.activity': 'Actividad',
  'dashboard.minutesStudied': 'Minutos estudiados',
  'dashboard.totalXp': 'XP total',

  'dashboard.recentSessions': 'Sesiones recientes',
  'dashboard.correctOf': '{correct}/{answered} correctas',

  'dashboard.emptyDecks.title': 'Aún no hay mazos',
  'dashboard.emptyDecks.body': 'Sube tus apuntes y Auto Cards creará tu primer mazo.',
  'dashboard.emptyDecks.cta': 'Crea tu primer mazo',

  'mobileDashboard.nextReminder': 'Próximo recordatorio',
  'mobileDashboard.todaysGoal': 'Meta de hoy',
  'mobileDashboard.getStarted': 'Empezar',
  'mobileDashboard.keepStreak': '¡Mantén tu racha!',
  'mobileDashboard.createFirstDeck': 'Crea tu primer mazo',
  'mobileDashboard.reminderAt': 'Recordatorio {when}',
  'mobileDashboard.reviewOneDeck': 'Repasa al menos 1 mazo hoy',
  'mobileDashboard.uploadToGenerate': 'Sube un documento para generar tarjetas',
  'mobileDashboard.startStudying': 'Empezar a estudiar →',
  'mobileDashboard.createDeckArrow': 'Crear mazo →',
  'mobileDashboard.streak': 'Racha',
  'mobileDashboard.level': 'Nivel',
  'mobileDashboard.accuracy': 'Precisión',
  'mobileDashboard.decks': 'Mazos',
  'mobileDashboard.yourDecks': 'Tus mazos',
  'mobileDashboard.noDecksYet': 'Aún no hay mazos — crea el primero.',
  'mobileDashboard.recentSessions': 'Sesiones recientes',
  'mobileDashboard.correctOf': '{correct}/{answered} correctas',
  'mobileDashboard.openDeck': 'Abrir {deckTitle}',
};
