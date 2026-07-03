const { google } = require('googleapis');

const clientID = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = process.env.GOOGLE_REDIRECT_URI;

let oauth2Client;
if (clientID && clientSecret && redirectUri) {
  oauth2Client = new google.auth.OAuth2(clientID, clientSecret, redirectUri);
} else {
  console.log('⚠️ Credenciales de Google OAuth no configuradas en el entorno.');
}

/**
 * Returns the authorization URL for the barber to consent calendar access.
 */
function getAuthUrl() {
  if (!oauth2Client) return null;
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar']
  });
}

/**
 * Exchanges auth code for tokens.
 */
async function getTokensFromCode(code) {
  if (!oauth2Client) throw new Error('OAuth2 client not initialized');
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

/**
 * Loads a calendar client authorized with saved tokens from the DB.
 */
async function getCalendarClient(pool) {
  if (!oauth2Client) return null;
  
  try {
    const { rows } = await pool.query("SELECT * FROM google_tokens WHERE id = 'default_barber'");
    if (rows.length === 0) return null; // Not connected yet
    
    const tokenRecord = rows[0];
    const client = new google.auth.OAuth2(clientID, clientSecret, redirectUri);
    
    client.setCredentials({
      access_token: tokenRecord.access_token,
      refresh_token: tokenRecord.refresh_token,
      scope: tokenRecord.scope,
      token_type: tokenRecord.token_type,
      expiry_date: parseInt(tokenRecord.expiry_date)
    });
    
    // Auto-update db when token refreshes
    client.on('tokens', async (newTokens) => {
      await pool.query(`
        UPDATE google_tokens 
        SET access_token = COALESCE($1, access_token),
            refresh_token = COALESCE($2, refresh_token),
            expiry_date = COALESCE($3, expiry_date),
            token_type = COALESCE($4, token_type)
        WHERE id = 'default_barber'
      `, [
        newTokens.access_token,
        newTokens.refresh_token,
        newTokens.expiry_date ? String(newTokens.expiry_date) : null,
        newTokens.token_type
      ]);
      console.log('🔄 Google OAuth access token auto-refreshed and saved to DB');
    });
    
    return google.calendar({ version: 'v3', auth: client });
  } catch (err) {
    console.error('Error loading Google Calendar client:', err);
    return null;
  }
}

/**
 * Syncs a new appointment to Google Calendar.
 */
async function createCalendarEvent(pool, appointment) {
  const calendar = await getCalendarClient(pool);
  if (!calendar) {
    console.log('⚠️ Google Calendar no está conectado. Cita guardada localmente pero no sincronizada.');
    return null;
  }
  
  try {
    const startDateTime = new Date(`${appointment.date}T${appointment.time}:00`);
    const endDateTime = new Date(startDateTime.getTime() + parseInt(appointment.service_duration) * 60 * 1000);
    
    const event = {
      summary: `${appointment.service_icon || '✂️'} BarberKing: ${appointment.service_name} — ${appointment.client_name}`,
      description: `Cita reservada en BarberKing.\n\nCliente: ${appointment.client_name} ${appointment.client_surname}\nTeléfono: ${appointment.client_phone}\nEmail: ${appointment.client_email}\nNotas: ${appointment.client_notes || 'Ninguna'}`,
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: 'Europe/Madrid'
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: 'Europe/Madrid'
      },
      colorId: '5' // Yellow/Gold
    };
    
    const res = await calendar.events.insert({
      calendarId: 'primary',
      resource: event
    });
    
    console.log(`✅ Evento creado en Google Calendar: ${res.data.id}`);
    return res.data.id;
  } catch (error) {
    console.error('❌ Error creando evento en Google Calendar:', error);
    return null;
  }
}

/**
 * Removes an event from Google Calendar.
 */
async function deleteCalendarEvent(pool, googleEventId) {
  if (!googleEventId) return;
  const calendar = await getCalendarClient(pool);
  if (!calendar) return;
  
  try {
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: googleEventId
    });
    console.log(`✅ Evento eliminado en Google Calendar: ${googleEventId}`);
  } catch (error) {
    console.error('❌ Error eliminando evento en Google Calendar:', error);
  }
}

module.exports = {
  getAuthUrl,
  getTokensFromCode,
  getCalendarClient,
  createCalendarEvent,
  deleteCalendarEvent
};
