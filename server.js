/**
 * BarberKing — Backend Server
 * Express + PostgreSQL + Server-Sent Events (SSE)
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Custom Utilities
const { validateAndFormatPhone } = require('./utils/phone');
const { sendVerificationEmail, sendPasswordResetEmail } = require('./utils/email');
const { 
  getAuthUrl, 
  getTokensFromCode, 
  createCalendarEvent, 
  deleteCalendarEvent 
} = require('./utils/calendar');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'barberking_super_secret_key_123';

// ====== SECURITY HARDENING ======
// Apply secure HTTP headers, disable contentSecurityPolicy since we are serving single-origin SPA
app.use(helmet({
  contentSecurityPolicy: false
}));

// Configure restrictive CORS
const allowedOrigins = [
  'http://localhost:3000',
  'https://barberking-bbf2.onrender.com' // Render production URL
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Bloqueado por CORS: Origen no permitido'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10kb' })); // Limit body payload to 10kb
app.use(express.static(path.join(__dirname)));

// Rate Limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 100, // 100 requests per 15m
  message: { success: false, error: 'Demasiadas solicitudes. Inténtalo más tarde.' }
});

const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 requests per hour
  message: { success: false, error: 'Límite de solicitudes de reserva excedido.' }
});

// Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Initialize Database Schema
async function initDB() {
  try {
    // 1. Core Tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'client' CHECK(role IN ('client', 'employee', 'admin')),
        name VARCHAR(255) NOT NULL,
        surname VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS appointments (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255),
        service_id VARCHAR(255) NOT NULL,
        service_name VARCHAR(255) NOT NULL,
        service_icon VARCHAR(50) DEFAULT '',
        service_price NUMERIC NOT NULL,
        service_duration INTEGER NOT NULL,
        date VARCHAR(50) NOT NULL,
        time VARCHAR(50) NOT NULL,
        client_name VARCHAR(255) NOT NULL,
        client_surname VARCHAR(255) NOT NULL,
        client_phone VARCHAR(50) NOT NULL,
        client_email VARCHAR(255) DEFAULT '',
        client_notes TEXT DEFAULT '',
        status VARCHAR(50) DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'cancelled')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS google_tokens (
        id VARCHAR(255) PRIMARY KEY,
        access_token TEXT,
        refresh_token TEXT,
        scope TEXT,
        token_type TEXT,
        expiry_date TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
      CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
      CREATE INDEX IF NOT EXISTS idx_appointments_user_id ON appointments(user_id);
    `);

    // 2. Run schema migrations/updates
    try {
      await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS google_event_id VARCHAR(255)`);
    } catch (e) {}
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE`);
    } catch (e) {}
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255)`);
    } catch (e) {}
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255)`);
    } catch (e) {}
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP`);
    } catch (e) {}

    // 3. Seed default Admin
    const { rows } = await pool.query("SELECT * FROM users WHERE role = 'admin'");
    if (rows.length === 0) {
      const adminPassword = bcrypt.hashSync('admin123', 10);
      await pool.query(`
        INSERT INTO users (id, email, password_hash, role, name, surname, phone, email_verified)
        VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
      `, ['user_admin_001', 'admin@barberking.com', adminPassword, 'admin', 'Carlos', 'Martínez', '+34 600000000']);
      console.log('✅ Creada cuenta de Admin por defecto (admin@barberking.com / admin123)');
    }
    console.log('✅ Base de datos PostgreSQL conectada e inicializada');
  } catch (err) {
    console.error('❌ Error inicializando Postgres:', err);
  }
}
initDB();

// ====== HEALTH CHECK (Ping) ======
// Endpoint to keep Render and Supabase awake (prevent free tier pausing)
app.get('/api/health', async (req, res) => {
  try {
    // Perform a lightweight query to Supabase to reset the 7-day inactivity timer
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok', message: 'Render and Supabase are awake' });
  } catch (error) {
    console.error('Health check database error:', error);
    res.status(500).json({ status: 'error', message: 'Database connection failed' });
  }
});

// ====== SERVER-SENT EVENTS (SSE) ======
let sseClients = [];
function sendSSEEvent(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => client.res.write(payload));
}

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Conectado al stream de eventos' })}\n\n`);
  
  const clientId = Date.now();
  const client = { id: clientId, res };
  sseClients.push(client);
  console.log(`🔗 Cliente SSE conectado (${sseClients.length} activos)`);

  const heartbeat = setInterval(() => {
    res.write(`event: heartbeat\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`);
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients = sseClients.filter(c => c.id !== clientId);
    console.log(`🔌 Cliente SSE desconectado (${sseClients.length} activos)`);
  });
});

// ====== MIDDLEWARES ======
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, error: 'Acceso denegado. Token no proporcionado.' });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, error: 'Token inválido o expirado.' });
    req.user = user;
    next();
  });
}

function requireAdminOrEmployee(req, res, next) {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'employee')) {
    next();
  } else {
    res.status(403).json({ success: false, error: 'No tienes permisos para realizar esta acción.' });
  }
}

// Middleware to prevent unverified users from taking actions
async function requireVerifiedUser(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT email_verified FROM users WHERE id = $1', [req.user.id]);
    if (rows.length === 0 || !rows[0].email_verified) {
      return res.status(403).json({ 
        success: false, 
        unverified: true,
        error: 'Debes verificar tu correo electrónico para reservar una cita. Revisa tu bandeja de entrada.' 
      });
    }
    next();
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error del servidor al comprobar verificación.' });
  }
}

// ====== AUTHENTICATION ROUTES ======

app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { email, password, name, surname, phone } = req.body;
    if (!email || !password || !name || !surname || !phone) {
      return res.status(400).json({ success: false, error: 'Todos los campos son obligatorios' });
    }

    // Phone format validation and normalization
    const phoneCheck = validateAndFormatPhone(phone);
    if (!phoneCheck.isValid) {
      return res.status(400).json({ success: false, error: 'Formato de teléfono inválido.' });
    }
    const formattedPhone = phoneCheck.formatted;

    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (rows.length > 0) return res.status(409).json({ success: false, error: 'El email ya está registrado' });
    
    const password_hash = bcrypt.hashSync(password, 10);
    const id = 'user_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    await pool.query(`
      INSERT INTO users (id, email, password_hash, role, name, surname, phone, email_verified, verification_token)
      VALUES ($1, $2, $3, 'client', $4, $5, $6, FALSE, $7)
    `, [id, email, password_hash, name, surname, formattedPhone, verificationToken]);
    
    // Send verification email
    const origin = `${req.protocol}://${req.get('host')}`;
    await sendVerificationEmail(email, name, verificationToken, origin);

    res.status(201).json({ 
      success: true, 
      message: 'Registro completado. Por favor, verifica tu correo para reservar citas.',
      user: { id, email, role: 'client', name, surname, phone: formattedPhone, email_verified: false }
    });
  } catch (err) {
    console.error('Error en registro:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email y contraseña requeridos' });
    
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (rows.length === 0) return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    
    const user = rows[0];
    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name, surname: user.surname }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ 
      success: true, 
      token, 
      user: { 
        id: user.id, 
        email: user.email, 
        role: user.role, 
        name: user.name, 
        surname: user.surname, 
        phone: user.phone,
        email_verified: user.email_verified
      } 
    });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, email, role, name, surname, phone, email_verified, created_at FROM users WHERE id = $1', [req.user.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// ====== EMAIL VERIFICATION & PASSWORD RECOVERY ======

app.get('/api/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('<h1>Error de verificación</h1><p>Token no proporcionado.</p>');

  try {
    const { rows } = await pool.query('SELECT id, email FROM users WHERE verification_token = $1', [token]);
    if (rows.length === 0) {
      return res.status(400).send('<h1>Enlace inválido</h1><p>El enlace de verificación no es válido o ya ha sido utilizado.</p>');
    }

    const user = rows[0];
    await pool.query('UPDATE users SET email_verified = TRUE, verification_token = NULL WHERE id = $1', [user.id]);

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Email Verificado — BarberKing</title>
        <style>
          body { display: flex; align-items: center; justify-content: center; height: 100vh; background: #0a0a0a; color: #fff; font-family: sans-serif; text-align: center; }
          .card { background: #121212; padding: 40px; border-radius: 12px; border: 1px solid #c5a880; max-width: 400px; }
          h1 { color: #c5a880; margin-bottom: 20px; }
          a { display: inline-block; margin-top: 20px; background: #c5a880; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>✂️ ¡Cuenta Verificada!</h1>
          <p>Tu correo <strong>${user.email}</strong> ha sido verificado con éxito.</p>
          <p>Ya puedes volver a la web principal y reservar tu cita.</p>
          <a href="/login.html">Iniciar Sesión</a>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('<h1>Error interno</h1><p>Ocurrió un error al verificar tu cuenta.</p>');
  }
});

app.post('/api/auth/resend-verification', authLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email requerido' });

  try {
    const { rows } = await pool.query('SELECT id, name, email, email_verified, verification_token FROM users WHERE email = $1', [email]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    const user = rows[0];
    if (user.email_verified) return res.status(400).json({ success: false, error: 'Este correo ya ha sido verificado' });

    let token = user.verification_token;
    if (!token) {
      token = crypto.randomBytes(32).toString('hex');
      await pool.query('UPDATE users SET verification_token = $1 WHERE id = $2', [token, user.id]);
    }

    const origin = `${req.protocol}://${req.get('host')}`;
    await sendVerificationEmail(user.email, user.name, token, origin);

    res.json({ success: true, message: 'Correo de verificación reenviado.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email requerido' });

  try {
    const { rows } = await pool.query('SELECT id, name, email FROM users WHERE email = $1', [email]);
    if (rows.length === 0) {
      // Return generic message for safety against enumeration
      return res.json({ success: true, message: 'Si el correo está registrado, se enviará un enlace de recuperación.' });
    }

    const user = rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 3600000); // 1 hour from now

    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3',
      [token, expiry, user.id]
    );

    const origin = `${req.protocol}://${req.get('host')}`;
    await sendPasswordResetEmail(user.email, user.name, token, origin);

    res.json({ success: true, message: 'Si el correo está registrado, se enviará un enlace de recuperación.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ success: false, error: 'Token y nueva contraseña requeridos' });

  try {
    const { rows } = await pool.query(
      'SELECT id, name FROM users WHERE reset_token = $1 AND reset_token_expiry > CURRENT_TIMESTAMP',
      [token]
    );
    if (rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Token inválido o expirado.' });
    }

    const user = rows[0];
    const new_password_hash = bcrypt.hashSync(newPassword, 10);

    await pool.query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL WHERE id = $2',
      [new_password_hash, user.id]
    );

    res.json({ success: true, message: 'Contraseña restablecida con éxito.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// ====== GOOGLE CALENDAR OAUTH ROUTES ======

app.get('/api/auth/google', authenticateToken, requireAdminOrEmployee, (req, res) => {
  const authUrl = getAuthUrl();
  if (!authUrl) return res.status(500).json({ success: false, error: 'Google OAuth no configurado en el servidor.' });
  res.json({ success: true, url: authUrl });
});

app.get('/api/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Código de autorización faltante.');

  try {
    const tokens = await getTokensFromCode(code);
    
    await pool.query(`
      INSERT INTO google_tokens (id, access_token, refresh_token, scope, token_type, expiry_date)
      VALUES ('default_barber', $1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE 
      SET access_token = $1,
          refresh_token = COALESCE($2, google_tokens.refresh_token),
          scope = $3,
          token_type = $4,
          expiry_date = $5
    `, [
      tokens.access_token,
      tokens.refresh_token,
      tokens.scope,
      tokens.token_type,
      tokens.expiry_date ? String(tokens.expiry_date) : null
    ]);

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Google Calendar Conectado</title>
        <style>
          body { display: flex; align-items: center; justify-content: center; height: 100vh; background: #0a0a0a; color: #fff; font-family: sans-serif; text-align: center; }
          .card { background: #121212; padding: 40px; border-radius: 12px; border: 1px solid #c5a880; }
          h1 { color: #c5a880; }
        </style>
        <script>
          setTimeout(() => { window.location.href = '/admin.html'; }, 3000);
        </script>
      </head>
      <body>
        <div class="card">
          <h1>📅 ¡Google Calendar Conectado con éxito!</h1>
          <p>Redirigiendo de vuelta al panel en 3 segundos...</p>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Error en callback de Google:', err);
    res.status(500).send('Error durante el proceso de autenticación de Google Calendar.');
  }
});

app.get('/api/auth/google/status', authenticateToken, requireAdminOrEmployee, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id FROM google_tokens WHERE id = 'default_barber'");
    res.json({ success: true, connected: rows.length > 0 });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error al consultar estado de Google Calendar' });
  }
});

app.post('/api/auth/google/disconnect', authenticateToken, requireAdminOrEmployee, async (req, res) => {
  try {
    await pool.query("DELETE FROM google_tokens WHERE id = 'default_barber'");
    res.json({ success: true, message: 'Google Calendar desconectado correctamente.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error al desconectar Google Calendar.' });
  }
});

// ====== APPOINTMENTS ROUTES ======

app.get('/api/appointments', authenticateToken, requireAdminOrEmployee, async (req, res) => {
  try {
    let query = 'SELECT * FROM appointments';
    const conditions = [];
    const params = [];
    
    if (req.query.status) {
      params.push(req.query.status);
      conditions.push('status = $' + params.length);
    }
    if (req.query.date) {
      params.push(req.query.date);
      conditions.push('date = $' + params.length);
    }
    
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY date ASC, time ASC';
    
    const { rows } = await pool.query(query, params);
    res.json({ success: true, data: rows.map(mapRowToAppointment) });
  } catch (err) {
    console.error('Error al obtener citas:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

app.get('/api/appointments/:id', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM appointments WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Cita no encontrada' });
    
    const appointment = rows[0];
    // Protection IDOR: Users can only see their own appointments unless they are admins/employees
    if (req.user.role === 'client' && appointment.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Acceso denegado.' });
    }
    
    res.json({ success: true, data: mapRowToAppointment(appointment) });
  } catch (err) {
    console.error('Error al obtener cita:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

app.post('/api/appointments', authenticateToken, requireVerifiedUser, bookingLimiter, async (req, res) => {
  try {
    const { service, date, time, client } = req.body;
    const errors = [];
    if (!service || !service.id) errors.push('Servicio requerido');
    if (!date) errors.push('Fecha requerida');
    if (!time) errors.push('Hora requerida');
    if (!client || !client.name) errors.push('Nombre del cliente requerido');
    if (!client || !client.surname) errors.push('Apellido del cliente requerido');
    if (!client || !client.phone) errors.push('Teléfono del cliente requerido');
    if (errors.length > 0) return res.status(400).json({ success: false, errors });
    
    // Validate phone formatting on booking
    const phoneCheck = validateAndFormatPhone(client.phone);
    if (!phoneCheck.isValid) {
      return res.status(400).json({ success: false, error: 'Formato de teléfono no válido' });
    }
    const formattedPhone = phoneCheck.formatted;

    const { rows: existingRows } = await pool.query(
      'SELECT id FROM appointments WHERE date = $1 AND time = $2 AND status != $3',
      [date, time, 'cancelled']
    );
    if (existingRows.length > 0) return res.status(409).json({ success: false, error: 'Este horario ya está reservado.' });
    
    const id = 'apt_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
    
    await pool.query(`
      INSERT INTO appointments 
        (id, user_id, service_id, service_name, service_icon, service_price, service_duration,
         date, time, client_name, client_surname, client_phone, client_email, client_notes,
         status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [
      id, req.user.id, service.id, service.name, service.icon || '', service.price, service.duration,
      date, time, client.name, client.surname, formattedPhone, client.email || '', client.notes || ''
    ]);
    
    const { rows: savedRows } = await pool.query('SELECT * FROM appointments WHERE id = $1', [id]);
    const appointment = mapRowToAppointment(savedRows[0]);
    
    // Google Calendar Sync
    const googleEventId = await createCalendarEvent(pool, appointment);
    if (googleEventId) {
      await pool.query('UPDATE appointments SET google_event_id = $1 WHERE id = $2', [googleEventId, id]);
      appointment.googleEventId = googleEventId;
    }

    sendSSEEvent('new_appointment', { message: `Nueva cita de ${client.name} ${client.surname}`, appointment });
    console.log(`📅 Nueva cita creada: ${client.name} ${client.surname} — ${date} ${time}`);
    res.status(201).json({ success: true, data: appointment });
  } catch (err) {
    console.error('Error al crear cita:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

app.patch('/api/appointments/:id', authenticateToken, requireAdminOrEmployee, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'cancelled'];
    if (!status || !validStatuses.includes(status)) return res.status(400).json({ success: false, error: 'Estado inválido.' });
    
    const { rows: existingRows } = await pool.query('SELECT * FROM appointments WHERE id = $1', [req.params.id]);
    if (existingRows.length === 0) return res.status(404).json({ success: false, error: 'Cita no encontrada' });
    
    const appointmentRecord = existingRows[0];
    
    await pool.query(
      'UPDATE appointments SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [status, req.params.id]
    );
    
    // Delete event on Google Calendar if cancelled
    if (status === 'cancelled' && appointmentRecord.google_event_id) {
      await deleteCalendarEvent(pool, appointmentRecord.google_event_id);
      await pool.query('UPDATE appointments SET google_event_id = NULL WHERE id = $1', [req.params.id]);
    }
    
    const { rows: updatedRows } = await pool.query('SELECT * FROM appointments WHERE id = $1', [req.params.id]);
    const updated = mapRowToAppointment(updatedRows[0]);
    
    const statusLabels = { pending: 'pendiente', confirmed: 'confirmada', cancelled: 'cancelada' };
    sendSSEEvent('status_update', { message: `Cita de ${updated.client.name} ${updated.client.surname} ${statusLabels[status]}`, appointment: updated });
    console.log(`🔄 Cita ${req.params.id} actualizada a: ${status}`);
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Error al actualizar cita:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

app.delete('/api/appointments/:id', authenticateToken, requireAdminOrEmployee, async (req, res) => {
  try {
    const { rows: existingRows } = await pool.query('SELECT * FROM appointments WHERE id = $1', [req.params.id]);
    if (existingRows.length === 0) return res.status(404).json({ success: false, error: 'Cita no encontrada' });
    
    const googleEventId = existingRows[0].google_event_id;
    if (googleEventId) {
      await deleteCalendarEvent(pool, googleEventId);
    }

    await pool.query('DELETE FROM appointments WHERE id = $1', [req.params.id]);
    console.log(`🗑️ Cita ${req.params.id} eliminada`);
    res.json({ success: true, message: 'Cita eliminada correctamente' });
  } catch (err) {
    console.error('Error al eliminar cita:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

app.get('/api/stats', authenticateToken, requireAdminOrEmployee, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const { rows: todayRows } = await pool.query('SELECT COUNT(*) as count FROM appointments WHERE date = $1 AND status != $2', [today, 'cancelled']);
    const { rows: pendingRows } = await pool.query('SELECT COUNT(*) as count FROM appointments WHERE status = $1', ['pending']);
    const { rows: confirmedRows } = await pool.query('SELECT COUNT(*) as count FROM appointments WHERE status = $1', ['confirmed']);
    const { rows: revenueRows } = await pool.query('SELECT COALESCE(SUM(service_price), 0) as total FROM appointments WHERE status != $1', ['cancelled']);
    const { rows: totalRows } = await pool.query('SELECT COUNT(*) as count FROM appointments');
    
    res.json({
      success: true,
      data: {
        today: parseInt(todayRows[0].count),
        pending: parseInt(pendingRows[0].count),
        confirmed: parseInt(confirmedRows[0].count),
        revenue: Math.round(parseFloat(revenueRows[0].total)),
        total: parseInt(totalRows[0].count)
      }
    });
  } catch (err) {
    console.error('Error al obtener stats:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

app.get('/api/booked-slots', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ success: false, error: 'Fecha requerida (?date=YYYY-MM-DD)' });
    
    const { rows } = await pool.query('SELECT time FROM appointments WHERE date = $1 AND status != $2', [date, 'cancelled']);
    res.json({ success: true, data: rows.map(r => r.time) });
  } catch (err) {
    console.error('Error al obtener slots ocupados:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

function mapRowToAppointment(row) {
  return {
    id: row.id,
    service: { id: row.service_id, name: row.service_name, icon: row.service_icon, price: parseFloat(row.service_price), duration: row.service_duration },
    date: row.date,
    time: row.time,
    client: { name: row.client_name, surname: row.client_surname, phone: row.client_phone, email: row.client_email, notes: row.client_notes },
    status: row.status,
    googleEventId: row.google_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

app.get('{*path}', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'index.html'));
  }
});

app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     ✂  BarberKing Server Running  ✂     ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  🌐 Web:   http://localhost:${PORT}          ║`);
  console.log(`║  📊 Admin: http://localhost:${PORT}/admin.html║`);
  console.log(`║  📡 API:   http://localhost:${PORT}/api       ║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
});

process.on('SIGINT', () => {
  console.log('\n🛑 Cerrando servidor...');
  pool.end();
  process.exit(0);
});

process.on('SIGTERM', () => {
  pool.end();
  process.exit(0);
});
