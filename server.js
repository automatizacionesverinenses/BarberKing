/**
 * BarberKing — Backend Server
 * Express + SQLite + Server-Sent Events (SSE)
 * 
 * Endpoints:
 *   GET    /api/appointments          — List all appointments (with optional ?status= filter)
 *   GET    /api/appointments/:id      — Get a single appointment
 *   POST   /api/appointments          — Create a new appointment
 *   PATCH  /api/appointments/:id      — Update appointment status
 *   DELETE /api/appointments/:id      — Delete an appointment
 *   GET    /api/stats                 — Dashboard statistics
 *   GET    /api/events                — SSE stream for real-time notifications
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'barberking_super_secret_key_123';

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors());
app.use(express.json());

// Serve static files (the frontend)
app.use(express.static(path.join(__dirname)));

// ============================================
// DATABASE SETUP
// ============================================
const dbPath = path.join(__dirname, 'barberking.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'client' CHECK(role IN ('client', 'employee', 'admin')),
    name TEXT NOT NULL,
    surname TEXT NOT NULL,
    phone TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    service_id TEXT NOT NULL,
    service_name TEXT NOT NULL,
    service_icon TEXT DEFAULT '',
    service_price REAL NOT NULL,
    service_duration INTEGER NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    client_name TEXT NOT NULL,
    client_surname TEXT NOT NULL,
    client_phone TEXT NOT NULL,
    client_email TEXT DEFAULT '',
    client_notes TEXT DEFAULT '',
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'cancelled')),
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
  CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
  CREATE INDEX IF NOT EXISTS idx_appointments_user_id ON appointments(user_id);
`);

// Create default admin user if none exists
const adminExists = db.prepare("SELECT * FROM users WHERE role = 'admin'").get();
if (!adminExists) {
  const adminPassword = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT INTO users (id, email, password_hash, role, name, surname, phone)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('user_admin_001', 'admin@barberking.com', adminPassword, 'admin', 'Carlos', 'Martínez', '600000000');
  console.log('✅ Creada cuenta de Admin por defecto (admin@barberking.com / admin123)');
}

console.log('✅ Base de datos SQLite inicializada');

// ============================================
// SERVER-SENT EVENTS (Real-time notifications)
// ============================================
let sseClients = [];

function sendSSEEvent(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    client.res.write(payload);
  });
}

// SSE endpoint
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Send initial heartbeat
  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Conectado al stream de eventos' })}\n\n`);

  const clientId = Date.now();
  const client = { id: clientId, res };
  sseClients.push(client);

  console.log(`🔗 Cliente SSE conectado (${sseClients.length} activos)`);

  // Heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(`event: heartbeat\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`);
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients = sseClients.filter(c => c.id !== clientId);
    console.log(`🔌 Cliente SSE desconectado (${sseClients.length} activos)`);
  });
});

// ============================================
// AUTHENTICATION MIDDLEWARES
// ============================================
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

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

// ============================================
// API ROUTES
// ============================================

// --- AUTH ROUTES ---
app.post('/api/auth/register', (req, res) => {
  try {
    const { email, password, name, surname, phone } = req.body;
    
    if (!email || !password || !name || !surname || !phone) {
      return res.status(400).json({ success: false, error: 'Todos los campos son obligatorios' });
    }

    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(409).json({ success: false, error: 'El email ya está registrado' });
    }

    const password_hash = bcrypt.hashSync(password, 10);
    const id = 'user_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);

    db.prepare(`
      INSERT INTO users (id, email, password_hash, role, name, surname, phone)
      VALUES (?, ?, ?, 'client', ?, ?, ?)
    `).run(id, email, password_hash, name, surname, phone);

    const token = jwt.sign({ id, email, role: 'client', name, surname }, JWT_SECRET, { expiresIn: '7d' });
    
    res.status(201).json({ success: true, token, user: { id, email, role: 'client', name, surname, phone } });
  } catch (err) {
    console.error('Error en registro:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email y contraseña requeridos' });

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.status(401).json({ success: false, error: 'Credenciales inválidas' });

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ success: false, error: 'Credenciales inválidas' });

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name, surname: user.surname }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ 
      success: true, 
      token, 
      user: { id: user.id, email: user.email, role: user.role, name: user.name, surname: user.surname, phone: user.phone } 
    });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  try {
    const user = db.prepare('SELECT id, email, role, name, surname, phone, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// --- GET /api/appointments ---
// Query params: ?status=pending|confirmed|cancelled  &date=YYYY-MM-DD
app.get('/api/appointments', authenticateToken, requireAdminOrEmployee, (req, res) => {
  try {
    let query = 'SELECT * FROM appointments';
    const conditions = [];
    const params = [];

    if (req.query.status) {
      conditions.push('status = ?');
      params.push(req.query.status);
    }

    if (req.query.date) {
      conditions.push('date = ?');
      params.push(req.query.date);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY date ASC, time ASC';

    const appointments = db.prepare(query).all(...params);

    // Map DB rows to the frontend's expected format
    const mapped = appointments.map(mapRowToAppointment);

    res.json({ success: true, data: mapped });
  } catch (err) {
    console.error('Error al obtener citas:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// --- GET /api/appointments/:id ---
app.get('/api/appointments/:id', authenticateToken, requireAdminOrEmployee, (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, error: 'Cita no encontrada' });
    }
    res.json({ success: true, data: mapRowToAppointment(row) });
  } catch (err) {
    console.error('Error al obtener cita:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// --- POST /api/appointments ---
app.post('/api/appointments', authenticateToken, (req, res) => {
  try {
    const { service, date, time, client } = req.body;

    // Validation
    const errors = [];
    if (!service || !service.id) errors.push('Servicio requerido');
    if (!date) errors.push('Fecha requerida');
    if (!time) errors.push('Hora requerida');
    if (!client || !client.name) errors.push('Nombre del cliente requerido');
    if (!client || !client.surname) errors.push('Apellido del cliente requerido');
    if (!client || !client.phone) errors.push('Teléfono del cliente requerido');

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    // Check if time slot is already booked
    const existing = db.prepare(
      'SELECT id FROM appointments WHERE date = ? AND time = ? AND status != ?'
    ).get(date, time, 'cancelled');

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Este horario ya está reservado. Por favor, elige otro.'
      });
    }

    const id = 'apt_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO appointments 
        (id, user_id, service_id, service_name, service_icon, service_price, service_duration,
         date, time, client_name, client_surname, client_phone, client_email, client_notes,
         status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `);

    stmt.run(
      id,
      req.user.id,
      service.id,
      service.name,
      service.icon || '',
      service.price,
      service.duration,
      date,
      time,
      client.name,
      client.surname,
      client.phone,
      client.email || '',
      client.notes || '',
      now,
      now
    );

    const appointment = mapRowToAppointment(
      db.prepare('SELECT * FROM appointments WHERE id = ?').get(id)
    );

    // Notify barber via SSE
    sendSSEEvent('new_appointment', {
      message: `Nueva cita de ${client.name} ${client.surname}`,
      appointment
    });

    console.log(`📅 Nueva cita creada: ${client.name} ${client.surname} — ${date} ${time}`);

    res.status(201).json({ success: true, data: appointment });
  } catch (err) {
    console.error('Error al crear cita:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// --- PATCH /api/appointments/:id ---
app.patch('/api/appointments/:id', authenticateToken, requireAdminOrEmployee, (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'cancelled'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Estado inválido. Valores permitidos: ${validStatuses.join(', ')}`
      });
    }

    const existing = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Cita no encontrada' });
    }

    db.prepare(
      'UPDATE appointments SET status = ?, updated_at = datetime("now", "localtime") WHERE id = ?'
    ).run(status, req.params.id);

    const updated = mapRowToAppointment(
      db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id)
    );

    // Notify via SSE
    const statusLabels = { pending: 'pendiente', confirmed: 'confirmada', cancelled: 'cancelada' };
    sendSSEEvent('status_update', {
      message: `Cita de ${updated.client.name} ${updated.client.surname} ${statusLabels[status]}`,
      appointment: updated
    });

    console.log(`🔄 Cita ${req.params.id} actualizada a: ${status}`);

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Error al actualizar cita:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// --- DELETE /api/appointments/:id ---
app.delete('/api/appointments/:id', authenticateToken, requireAdminOrEmployee, (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Cita no encontrada' });
    }

    db.prepare('DELETE FROM appointments WHERE id = ?').run(req.params.id);

    console.log(`🗑️ Cita ${req.params.id} eliminada`);

    res.json({ success: true, message: 'Cita eliminada correctamente' });
  } catch (err) {
    console.error('Error al eliminar cita:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// --- GET /api/stats ---
app.get('/api/stats', authenticateToken, requireAdminOrEmployee, (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const todayCount = db.prepare(
      'SELECT COUNT(*) as count FROM appointments WHERE date = ? AND status != ?'
    ).get(today, 'cancelled').count;

    const pendingCount = db.prepare(
      'SELECT COUNT(*) as count FROM appointments WHERE status = ?'
    ).get('pending').count;

    const confirmedCount = db.prepare(
      'SELECT COUNT(*) as count FROM appointments WHERE status = ?'
    ).get('confirmed').count;

    const revenue = db.prepare(
      'SELECT COALESCE(SUM(service_price), 0) as total FROM appointments WHERE status != ?'
    ).get('cancelled').total;

    const totalCount = db.prepare(
      'SELECT COUNT(*) as count FROM appointments'
    ).get().count;

    res.json({
      success: true,
      data: {
        today: todayCount,
        pending: pendingCount,
        confirmed: confirmedCount,
        revenue: Math.round(revenue),
        total: totalCount
      }
    });
  } catch (err) {
    console.error('Error al obtener stats:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// --- GET /api/booked-slots?date=YYYY-MM-DD ---
app.get('/api/booked-slots', (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, error: 'Fecha requerida (?date=YYYY-MM-DD)' });
    }

    const rows = db.prepare(
      'SELECT time FROM appointments WHERE date = ? AND status != ?'
    ).all(date, 'cancelled');

    const bookedTimes = rows.map(r => r.time);

    res.json({ success: true, data: bookedTimes });
  } catch (err) {
    console.error('Error al obtener slots ocupados:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// ============================================
// HELPER: Map DB row to frontend format
// ============================================
function mapRowToAppointment(row) {
  return {
    id: row.id,
    service: {
      id: row.service_id,
      name: row.service_name,
      icon: row.service_icon,
      price: row.service_price,
      duration: row.service_duration
    },
    date: row.date,
    time: row.time,
    client: {
      name: row.client_name,
      surname: row.client_surname,
      phone: row.client_phone,
      email: row.client_email,
      notes: row.client_notes
    },
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// ============================================
// FALLBACK: Serve index.html for non-API routes
// ============================================
app.get('{*path}', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'index.html'));
  }
});

// ============================================
// START SERVER
// ============================================
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

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Cerrando servidor...');
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  db.close();
  process.exit(0);
});
