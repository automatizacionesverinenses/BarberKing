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

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'barberking_super_secret_key_123';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  try {
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
        service_icon VARCHAR(255) DEFAULT '',
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

      CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
      CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
      CREATE INDEX IF NOT EXISTS idx_appointments_user_id ON appointments(user_id);
    `);

    const { rows } = await pool.query("SELECT * FROM users WHERE role = 'admin'");
    if (rows.length === 0) {
      const adminPassword = bcrypt.hashSync('admin123', 10);
      await pool.query(`
        INSERT INTO users (id, email, password_hash, role, name, surname, phone)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, ['user_admin_001', 'admin@barberking.com', adminPassword, 'admin', 'Carlos', 'Martínez', '600000000']);
      console.log('✅ Creada cuenta de Admin por defecto (admin@barberking.com / admin123)');
    }
    console.log('✅ Base de datos PostgreSQL conectada e inicializada');
  } catch (err) {
    console.error('❌ Error inicializando Postgres:', err);
  }
}
initDB();

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

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, surname, phone } = req.body;
    if (!email || !password || !name || !surname || !phone) {
      return res.status(400).json({ success: false, error: 'Todos los campos son obligatorios' });
    }
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (rows.length > 0) return res.status(409).json({ success: false, error: 'El email ya está registrado' });
    
    const password_hash = bcrypt.hashSync(password, 10);
    const id = 'user_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
    
    await pool.query(`
      INSERT INTO users (id, email, password_hash, role, name, surname, phone)
      VALUES ($1, $2, $3, 'client', $4, $5, $6)
    `, [id, email, password_hash, name, surname, phone]);
    
    const token = jwt.sign({ id, email, role: 'client', name, surname }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ success: true, token, user: { id, email, role: 'client', name, surname, phone } });
  } catch (err) {
    console.error('Error en registro:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email y contraseña requeridos' });
    
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (rows.length === 0) return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    
    const user = rows[0];
    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name, surname: user.surname }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, user: { id: user.id, email: user.email, role: user.role, name: user.name, surname: user.surname, phone: user.phone } });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, email, role, name, surname, phone, created_at FROM users WHERE id = $1', [req.user.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

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

app.get('/api/appointments/:id', authenticateToken, requireAdminOrEmployee, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM appointments WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Cita no encontrada' });
    res.json({ success: true, data: mapRowToAppointment(rows[0]) });
  } catch (err) {
    console.error('Error al obtener cita:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

app.post('/api/appointments', authenticateToken, async (req, res) => {
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
      date, time, client.name, client.surname, client.phone, client.email || '', client.notes || ''
    ]);
    
    const { rows: savedRows } = await pool.query('SELECT * FROM appointments WHERE id = $1', [id]);
    const appointment = mapRowToAppointment(savedRows[0]);
    
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
    
    await pool.query(
      'UPDATE appointments SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [status, req.params.id]
    );
    
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
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

app.get('{*path}', (req, res) => {
  if (!req.path.startsWith('/api')) res.sendFile(path.join(__dirname, 'index.html'));
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
  console.log('\\n🛑 Cerrando servidor...');
  pool.end();
  process.exit(0);
});

process.on('SIGTERM', () => {
  pool.end();
  process.exit(0);
});
