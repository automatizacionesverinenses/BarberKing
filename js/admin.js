/**
 * BarberKing — Admin Panel
 * Connects to the Express backend API.
 * Uses Server-Sent Events (SSE) for real-time notifications.
 */

// ============================================
// CONFIG
// ============================================
const API_BASE = window.location.origin + '/api';

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  renderAdminDate();
  loadStats();
  loadAppointments();
  setupAdminEvents();
  connectSSE();
});

// ============================================
// DATE DISPLAY
// ============================================
function renderAdminDate() {
  const el = document.getElementById('admin-date');
  if (!el) return;

  const now = new Date();
  const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  el.textContent = now.toLocaleDateString('es-ES', options);
}

// ============================================
// SERVER-SENT EVENTS — Real-time Notifications
// ============================================
let eventSource = null;

function connectSSE() {
  if (eventSource) {
    eventSource.close();
  }

  eventSource = new EventSource(`${API_BASE}/events`);

  eventSource.addEventListener('connected', (e) => {
    console.log('🔗 Conectado al stream de eventos en tiempo real');
  });

  eventSource.addEventListener('new_appointment', (e) => {
    const data = JSON.parse(e.data);
    showToast('success', `🔔 ${data.message}`);
    playNotificationSound();
    loadStats();
    loadAppointments();
  });

  eventSource.addEventListener('status_update', (e) => {
    const data = JSON.parse(e.data);
    showToast('success', `🔄 ${data.message}`);
    loadStats();
    loadAppointments();
  });

  eventSource.addEventListener('heartbeat', () => {
    // Connection alive
  });

  eventSource.onerror = () => {
    console.warn('⚠️ Conexión SSE perdida. Reconectando en 5s...');
    setTimeout(connectSSE, 5000);
  };
}

function playNotificationSound() {
  // Create a simple notification beep using Web Audio API
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    gainNode.gain.value = 0.3;

    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    oscillator.stop(audioCtx.currentTime + 0.5);
  } catch (e) {
    // Audio not available, silently ignore
  }
}

// ============================================
// LOAD STATISTICS FROM API
// ============================================
async function loadStats() {
  try {
    const response = await fetch(`${API_BASE}/stats`);
    const result = await response.json();

    if (result.success) {
      const data = result.data;
      animateCounter(document.getElementById('stat-today'), data.today);
      animateCounter(document.getElementById('stat-pending'), data.pending);
      animateCounter(document.getElementById('stat-confirmed'), data.confirmed);
      animateCounter(document.getElementById('stat-revenue'), data.revenue, '€');
    }
  } catch (err) {
    console.error('Error al cargar estadísticas:', err);
  }
}

function animateCounter(element, targetValue, suffix = '') {
  if (!element) return;
  const duration = 800;
  const startTime = performance.now();
  const startValue = parseInt(element.textContent) || 0;

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const currentValue = Math.round(startValue + (targetValue - startValue) * eased);
    element.textContent = currentValue + suffix;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

// ============================================
// LOAD APPOINTMENTS FROM API
// ============================================
let currentFilter = 'all';

async function loadAppointments(filter = currentFilter) {
  currentFilter = filter;
  const tbody = document.getElementById('appointments-tbody');
  const emptyState = document.getElementById('empty-state');
  if (!tbody) return;

  try {
    let url = `${API_BASE}/appointments`;
    if (filter !== 'all') {
      url += `?status=${filter}`;
    }

    const response = await fetch(url);
    const result = await response.json();

    if (!result.success) {
      console.error('Error:', result.error);
      return;
    }

    const appointments = result.data;

    if (appointments.length === 0) {
      tbody.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    tbody.innerHTML = appointments.map(apt => {
      const initials = (apt.client?.name?.[0] || '') + (apt.client?.surname?.[0] || '');

      const dateParts = apt.date.split('-');
      const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
      const formattedDate = dateObj.toLocaleDateString('es-ES', {
        weekday: 'short',
        day: 'numeric',
        month: 'short'
      });

      const statusLabels = {
        pending: 'Pendiente',
        confirmed: 'Confirmada',
        cancelled: 'Cancelada'
      };

      return `
        <tr data-appointment-id="${apt.id}">
          <td>
            <div class="client-info">
              <div class="client-avatar">${initials.toUpperCase()}</div>
              <div>
                <div class="client-name">${apt.client?.name || ''} ${apt.client?.surname || ''}</div>
                <div class="client-phone">${apt.client?.phone || ''}</div>
              </div>
            </div>
          </td>
          <td>
            <span>${apt.service?.icon || ''} ${apt.service?.name || 'N/A'}</span>
          </td>
          <td>${formattedDate}</td>
          <td><strong>${apt.time}h</strong></td>
          <td><strong>${apt.service?.price || 0}€</strong></td>
          <td>
            <span class="status-badge ${apt.status}">
              <span class="status-dot"></span>
              ${statusLabels[apt.status] || apt.status}
            </span>
          </td>
          <td>
            <div class="action-btns">
              ${apt.status === 'pending' ? `
                <button class="action-btn confirm" title="Confirmar cita" data-action="confirm" data-id="${apt.id}" aria-label="Confirmar cita">✓</button>
                <button class="action-btn cancel" title="Cancelar cita" data-action="cancel" data-id="${apt.id}" aria-label="Cancelar cita">✕</button>
              ` : ''}
              ${apt.status === 'confirmed' ? `
                <button class="action-btn cancel" title="Cancelar cita" data-action="cancel" data-id="${apt.id}" aria-label="Cancelar cita">✕</button>
              ` : ''}
              <button class="action-btn" title="Ver detalles" data-action="details" data-id="${apt.id}" aria-label="Ver detalles">👁</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach action events
    tbody.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        handleAction(btn.dataset.action, btn.dataset.id);
      });
    });
  } catch (err) {
    console.error('Error al cargar citas:', err);
    showToast('error', 'Error de conexión con el servidor');
  }
}

// ============================================
// APPOINTMENT ACTIONS — API CALLS
// ============================================
async function handleAction(action, appointmentId) {
  switch (action) {
    case 'confirm':
      await updateStatus(appointmentId, 'confirmed');
      break;
    case 'cancel':
      if (confirm('¿Estás seguro de que quieres cancelar esta cita?')) {
        await updateStatus(appointmentId, 'cancelled');
      }
      break;
    case 'details':
      await showDetails(appointmentId);
      break;
  }
}

async function updateStatus(id, newStatus) {
  try {
    const response = await fetch(`${API_BASE}/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });

    const result = await response.json();

    if (result.success) {
      const label = newStatus === 'confirmed' ? 'confirmada' : 'cancelada';
      showToast('success', `Cita ${label} correctamente`);
      await loadStats();
      await loadAppointments();
    } else {
      showToast('error', result.error || 'Error al actualizar la cita');
    }
  } catch (err) {
    console.error('Error:', err);
    showToast('error', 'Error de conexión con el servidor');
  }
}

async function showDetails(id) {
  try {
    const response = await fetch(`${API_BASE}/appointments/${id}`);
    const result = await response.json();

    if (!result.success) {
      showToast('error', 'Cita no encontrada');
      return;
    }

    const apt = result.data;
    const dateParts = apt.date.split('-');
    const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    const formattedDate = dateObj.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const statusLabels = {
      pending: '⏳ Pendiente',
      confirmed: '✅ Confirmada',
      cancelled: '❌ Cancelada'
    };

    const details = [
      `📋 DETALLES DE LA CITA`,
      `──────────────────────────`,
      `Cliente: ${apt.client?.name} ${apt.client?.surname}`,
      `Teléfono: ${apt.client?.phone}`,
      `Email: ${apt.client?.email || 'No proporcionado'}`,
      ``,
      `Servicio: ${apt.service?.icon} ${apt.service?.name}`,
      `Fecha: ${formattedDate}`,
      `Hora: ${apt.time}h`,
      `Duración: ${apt.service?.duration} min`,
      `Precio: ${apt.service?.price}€`,
      ``,
      `Estado: ${statusLabels[apt.status] || apt.status}`,
      apt.client?.notes ? `\nNotas: ${apt.client.notes}` : ''
    ].filter(line => line !== undefined).join('\n');

    alert(details);
  } catch (err) {
    console.error('Error:', err);
    showToast('error', 'Error al cargar detalles');
  }
}

// ============================================
// EVENT SETUP
// ============================================
function setupAdminEvents() {
  // Navigation tabs
  const navDashboard = document.getElementById('nav-dashboard');
  const navAppointments = document.getElementById('nav-appointments');
  const statsSection = document.getElementById('admin-stats');
  
  if (navDashboard && navAppointments) {
    navDashboard.addEventListener('click', (e) => {
      e.preventDefault();
      navDashboard.classList.add('active');
      navAppointments.classList.remove('active');
      statsSection.style.display = 'grid';
      // Automatically show all in dashboard
      loadAppointments('all');
      document.querySelector('[data-filter="all"]')?.click();
    });

    navAppointments.addEventListener('click', (e) => {
      e.preventDefault();
      navAppointments.classList.add('active');
      navDashboard.classList.remove('active');
      statsSection.style.display = 'none';
    });
  }

  // Filter tabs
  const filterTabs = document.getElementById('filter-tabs');
  if (filterTabs) {
    filterTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.filter-tab');
      if (!tab) return;

      filterTabs.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadAppointments(tab.dataset.filter);
    });
  }

  // Refresh button
  const refreshBtn = document.getElementById('btn-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = '⏳ Cargando...';
      await loadStats();
      await loadAppointments(currentFilter);
      showToast('success', 'Datos actualizados');
      refreshBtn.disabled = false;
      refreshBtn.textContent = '🔄 Refrescar';
    });
  }
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================
function showToast(type, message) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
    <span class="toast-close" role="button" aria-label="Cerrar">✕</span>
  `;

  container.appendChild(toast);

  toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());

  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }
  }, 4000);
}
