import type { auth as en } from '../en/auth';
import type { Dict } from '../shape';

export const auth: Dict<typeof en> = {
  'auth.signIn.title': 'Bienvenido de nuevo',
  'auth.signIn.subtitle': 'Inicia sesión para seguir estudiando donde lo dejaste.',
  'auth.signIn.submit': 'Iniciar sesión',
  'auth.signIn.google': 'Iniciar sesión con Google',
  'auth.signIn.forgotPassword': '¿Olvidaste tu contraseña?',
  'auth.signIn.noAccount': '¿No tienes una cuenta?',
  'auth.signIn.signUpLink': 'Regístrate',

  'auth.signUp.title': 'Crea tu cuenta',
  'auth.signUp.subtitle': 'Gratis para empezar. No se necesita tarjeta de crédito.',
  'auth.signUp.submit': 'Crear cuenta',
  'auth.signUp.google': 'Registrarse con Google',
  'auth.signUp.usernameHint': '3–20 caracteres, minúsculas, a–z, 0–9, _',
  'auth.signUp.passwordHint': '{min}+ caracteres',
  'auth.signUp.hasAccount': '¿Ya tienes una cuenta?',
  'auth.signUp.signInLink': 'Inicia sesión',
  'auth.signUp.checkEmailTitle': 'Revisa tu correo',
  'auth.signUp.checkEmailBody': 'Enviamos un enlace de confirmación a {email}. Haz clic en él para confirmar tu cuenta y luego inicia sesión.',
  'auth.signUp.goToSignIn': 'Ir a iniciar sesión',

  'auth.forgotPassword.title': 'Restablece tu contraseña',
  'auth.forgotPassword.subtitle': 'Te enviaremos un enlace para crear una nueva.',
  'auth.forgotPassword.submit': 'Enviar enlace',
  'auth.forgotPassword.remembered': '¿La recordaste?',
  'auth.forgotPassword.checkEmailTitle': 'Revisa tu correo',
  'auth.forgotPassword.checkEmailBody': 'Si existe una cuenta para {email}, un enlace para crear una nueva contraseña está en camino. Caduca en una hora.',
  'auth.forgotPassword.notArrived': '¿No llegó? Revisa tu carpeta de spam, o',
  'auth.forgotPassword.tryAnother': 'prueba con otra dirección',
  'auth.forgotPassword.backToSignIn': 'Volver a iniciar sesión',

  'auth.resetPassword.title': 'Elige una nueva contraseña',
  'auth.resetPassword.subtitle': 'Después volverás a entrar directamente.',
  'auth.resetPassword.newPassword': 'Nueva contraseña',
  'auth.resetPassword.confirmPassword': 'Confirma la nueva contraseña',
  'auth.resetPassword.submit': 'Guardar nueva contraseña',
  'auth.resetPassword.tooShort': 'Usa al menos {min} caracteres.',
  'auth.resetPassword.mismatch': 'Esas dos contraseñas no coinciden.',
  'auth.resetPassword.genericError': 'No se pudo establecer esa contraseña.',
  'auth.resetPassword.successTitle': 'Contraseña cambiada',
  'auth.resetPassword.successBody': 'Has iniciado sesión con tu nueva contraseña.',
  'auth.resetPassword.expiredTitle': 'Este enlace ha caducado',
  'auth.resetPassword.expiredBody': 'Los enlaces de restablecimiento duran una hora y solo se pueden usar una vez. Pide uno nuevo y funcionará.',
  'auth.resetPassword.sendNewLink': 'Enviar un nuevo enlace',

  'auth.callback.title': 'Ya casi está',
  'auth.callback.subtitle': 'Terminando tu inicio de sesión.',
  'auth.callback.signingIn': 'Iniciando sesión…',
  'auth.callback.failedTitle': 'Eso no terminó',
  'auth.callback.googleDenied': 'Google no completó el inicio de sesión. Puedes intentarlo de nuevo o usar tu correo y contraseña.',
  'auth.callback.timedOut': 'Esto está tardando más de lo normal. Intenta iniciar sesión de nuevo.',
  'auth.callback.backToSignIn': 'Volver a iniciar sesión',

  'auth.layout.heroTitle': 'Convierte tus diapositivas y apuntes en un mazo de tarjetas listo para estudiar',
  'auth.layout.heroBody': 'Sube apuntes de clase, libros de texto o informes y obtén tarjetas de estudio personalizables y gamificadas en segundos.',

  'auth.emailPlaceholder': 'tu@ejemplo.com',

  'auth.forgotPassword.mobileTitle': '¿Olvidaste tu contraseña?',
  'auth.forgotPassword.mobileSubtitle': 'Escribe tu correo y te enviaremos un enlace para crear una nueva.',

  'auth.resetPassword.mobileTitle': 'Establece una nueva contraseña',
  'auth.resetPassword.checkingLink': 'Comprobando tu enlace…',
};
