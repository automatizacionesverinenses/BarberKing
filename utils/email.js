const { Resend } = require('resend');

const resendApiKey = process.env.RESEND_API_KEY;
let resend;
if (resendApiKey) {
  resend = new Resend(resendApiKey);
} else {
  console.log('⚠️ RESEND_API_KEY no configurada. Los correos se imprimirán en consola.');
}

/**
 * Sends a verification email to a newly registered user.
 * @param {string} email 
 * @param {string} name 
 * @param {string} token 
 * @param {string} origin (e.g. "http://localhost:3000" or Render domain)
 */
async function sendVerificationEmail(email, name, token, origin) {
  const verificationLink = `${origin}/api/verify-email?token=${token}`;
  const subject = 'Verifica tu cuenta en BarberKing ✂️';
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #fcfcfc;">
      <h2 style="color: #c5a880; text-align: center;">¡Bienvenido a BarberKing, ${name}!</h2>
      <p style="font-size: 16px; color: #333;">Gracias por registrarte. Para poder reservar tu primera cita, necesitamos verificar tu correo electrónico.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verificationLink}" style="background-color: #c5a880; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">Verificar Correo Electrónico</a>
      </div>
      <p style="font-size: 14px; color: #666;">Si el botón no funciona, puedes hacer clic o copiar y pegar el siguiente enlace en tu navegador:</p>
      <p style="font-size: 12px; word-break: break-all; color: #888;">${verificationLink}</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #999; text-align: center;">© 2026 BarberKing. Todos los derechos reservados.</p>
    </div>
  `;

  if (resend) {
    try {
      await resend.emails.send({
        from: 'BarberKing <onboarding@resend.dev>', // Default Resend test sending address
        to: email,
        subject: subject,
        html: html,
      });
      console.log(`📧 Correo de verificación enviado a ${email}`);
    } catch (error) {
      console.error(`❌ Error enviando correo a ${email}:`, error);
    }
  } else {
    console.log(`\n--- [SIMULACIÓN EMAIL VERIFICACIÓN] ---`);
    console.log(`Para: ${email}`);
    console.log(`Asunto: ${subject}`);
    console.log(`Enlace: ${verificationLink}`);
    console.log(`-------------------------------------\n`);
  }
}

/**
 * Sends a password reset email.
 * @param {string} email 
 * @param {string} name 
 * @param {string} token 
 * @param {string} origin 
 */
async function sendPasswordResetEmail(email, name, token, origin) {
  const resetLink = `${origin}/reset-password.html?token=${token}`;
  const subject = 'Recuperación de Contraseña — BarberKing 🔑';
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #fcfcfc;">
      <h2 style="color: #c5a880; text-align: center;">Recuperación de Contraseña</h2>
      <p style="font-size: 16px; color: #333;">Hola ${name}, hemos recibido una solicitud para restablecer tu contraseña en BarberKing.</p>
      <p style="font-size: 16px; color: #333;">Haz clic en el siguiente enlace para crear una nueva contraseña. Este enlace expira en 1 hora.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" style="background-color: #c5a880; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">Restablecer Contraseña</a>
      </div>
      <p style="font-size: 14px; color: #666;">Si no has solicitado este cambio, puedes ignorar este correo de forma segura.</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #999; text-align: center;">© 2026 BarberKing. Todos los derechos reservados.</p>
    </div>
  `;

  if (resend) {
    try {
      await resend.emails.send({
        from: 'BarberKing <onboarding@resend.dev>',
        to: email,
        subject: subject,
        html: html,
      });
      console.log(`📧 Correo de recuperación de contraseña enviado a ${email}`);
    } catch (error) {
      console.error(`❌ Error enviando correo de recuperación a ${email}:`, error);
    }
  } else {
    console.log(`\n--- [SIMULACIÓN RECUPERACIÓN CONTRASEÑA] ---`);
    console.log(`Para: ${email}`);
    console.log(`Asunto: ${subject}`);
    console.log(`Enlace: ${resetLink}`);
    console.log(`-------------------------------------------\n`);
  }
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
