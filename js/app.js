/**
 * BarberKing — Main Booking Application
 * Connects to the Express backend API for appointment management.
 * Uses Server-Sent Events for real-time updates.
 */

// ============================================
// CONFIG
// ============================================
const API_BASE = window.location.origin + '/api';

// ============================================
// DATA: Services
// ============================================
const SERVICES = [
  {
    id: 'corte-clasico',
    name: 'Corte Clásico',
    description: 'Corte de pelo tradicional con acabado perfecto. Incluye lavado y secado.',
    price: 15,
    duration: 30,
    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>'
  },
  {
    id: 'corte-degradado',
    name: 'Degradado / Fade',
    description: 'Degradado personalizado con máquina y tijera. El estilo más solicitado.',
    price: 18,
    duration: 40,
    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 12 12 17 22 12"/><polyline points="2 17 12 22 22 17"/></svg>'
  },
  {
    id: 'corte-barba',
    name: 'Corte + Barba',
    description: 'Combo completo de corte de pelo y arreglo de barba con navaja.',
    price: 25,
    duration: 50,
    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
  },
  {
    id: 'arreglo-barba',
    name: 'Arreglo de Barba',
    description: 'Perfilado y arreglo de barba con navaja tradicional y toalla caliente.',
    price: 10,
    duration: 20,
    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>'
  },
  {
    id: 'tratamiento-capilar',
    name: 'Tratamiento Capilar',
    description: 'Tratamiento hidratante y nutritivo para el cabello con masaje craneal.',
    price: 20,
    duration: 35,
    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>'
  },
  {
    id: 'pack-premium',
    name: 'Pack Premium',
    description: 'Experiencia completa: corte, barba, tratamiento capilar y ritual caliente.',
    price: 40,
    duration: 75,
    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
  }
];

// Available time slots
const TIME_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '16:00', '16:30', '17:00',
  '17:30', '18:00', '18:30', '19:00', '19:30', '20:00'
];

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// ============================================
// STATE
// ============================================
let state = {
  currentStep: 1,
  selectedService: null,
  selectedDate: null,
  selectedTime: null,
  calendarMonth: new Date().getMonth(),
  calendarYear: new Date().getFullYear(),
  bookedSlots: []
};

// ============================================
// DOM HELPERS
// ============================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  renderServices();
  renderCalendar();
  renderTimeSlots();
  setupEventListeners();
  setupScrollEffects();
  setupNavbarAuth();
});

function setupNavbarAuth() {
  const token = localStorage.getItem('bk_token');
  const userStr = localStorage.getItem('bk_user');
  const navLogin = document.getElementById('nav-login');

  if (token && userStr && navLogin) {
    try {
      const user = JSON.parse(userStr);
      const iconSvg = '<svg style="width: 18px; height: 18px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>';
      navLogin.innerHTML = iconSvg + ' ' + ((user.role === 'admin' || user.role === 'employee') ? 'Panel Barbero' : 'Mi Perfil');
      navLogin.href = (user.role === 'admin' || user.role === 'employee') ? 'admin.html' : '#';

      // Add logout button if it doesn't exist
      if (!document.getElementById('nav-logout')) {
        const navLinks = document.getElementById('nav-links');
        const logoutBtn = document.createElement('a');
        logoutBtn.href = '#';
        logoutBtn.id = 'nav-logout';
        if (user) {
        logoutBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px; vertical-align:-2px;"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> Salir';
      }
        logoutBtn.style.color = 'var(--color-accent-warning)';
        
        logoutBtn.addEventListener('click', (e) => {
          e.preventDefault();
          localStorage.removeItem('bk_token');
          localStorage.removeItem('bk_user');
          window.location.reload();
        });
        
        const navCta = document.querySelector('.nav-cta');
        if (navCta) {
          navLinks.insertBefore(logoutBtn, navCta);
        } else {
          navLinks.appendChild(logoutBtn);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }
}

// ============================================
// SERVICES RENDERING
// ============================================
function renderServices() {
  const grids = [
    document.getElementById('services-grid'),
    document.getElementById('booking-services-grid')
  ];

  grids.forEach(grid => {
    if (!grid) return;
    grid.innerHTML = SERVICES.map(service => `
      <div class="service-card" data-service-id="${service.id}" tabindex="0" role="button" aria-label="Seleccionar ${service.name}">
        <div class="service-check"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
        <div class="service-icon">${service.icon}</div>
        <h3 class="service-name">${service.name}</h3>
        <p class="service-description">${service.description}</p>
        <div class="service-meta">
          <span class="service-price">${service.price}€</span>
          <span class="service-duration"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${service.duration} min</span>
        </div>
      </div>
    `).join('');

    grid.addEventListener('click', (e) => {
      const card = e.target.closest('.service-card');
      if (card) selectService(card.dataset.serviceId);
    });

    grid.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const card = e.target.closest('.service-card');
        if (card) {
          e.preventDefault();
          selectService(card.dataset.serviceId);
        }
      }
    });
  });
}

function selectService(serviceId) {
  state.selectedService = SERVICES.find(s => s.id === serviceId);

  $$('.service-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.serviceId === serviceId);
  });

  showToast('success', `Servicio seleccionado: ${state.selectedService.name}`);
}

// ============================================
// CALENDAR
// ============================================
function renderCalendar() {
  const label = document.getElementById('calendar-month-label');
  const container = document.getElementById('calendar-days');
  if (!label || !container) return;

  label.textContent = `${MONTH_NAMES[state.calendarMonth]} ${state.calendarYear}`;

  const firstDay = new Date(state.calendarYear, state.calendarMonth, 1);
  const lastDay = new Date(state.calendarYear, state.calendarMonth + 1, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let startDay = firstDay.getDay() - 1;
  if (startDay < 0) startDay = 6;

  let html = '';

  for (let i = 0; i < startDay; i++) {
    html += '<div class="calendar-day empty"></div>';
  }

  for (let day = 1; day <= lastDay.getDate(); day++) {
    const date = new Date(state.calendarYear, state.calendarMonth, day);
    const dateStr = formatDate(date);
    const isPast = date < today;
    const isSunday = date.getDay() === 0;
    const isToday = date.getTime() === today.getTime();
    const isSelected = state.selectedDate === dateStr;
    const isDisabled = isPast || isSunday;

    let classes = 'calendar-day';
    if (isDisabled) classes += ' disabled';
    if (isToday) classes += ' today';
    if (isSelected) classes += ' selected';

    html += `<div class="${classes}" data-date="${dateStr}" ${isDisabled ? '' : 'tabindex="0" role="button"'}>${day}</div>`;
  }

  container.innerHTML = html;

  container.querySelectorAll('.calendar-day:not(.disabled):not(.empty)').forEach(el => {
    el.addEventListener('click', () => selectDate(el.dataset.date));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectDate(el.dataset.date);
      }
    });
  });
}

async function selectDate(dateStr) {
  state.selectedDate = dateStr;
  state.selectedTime = null; // Reset time when date changes
  renderCalendar();
  await fetchBookedSlots(dateStr);
  updateTimeSlotsUI();
}

function changeMonth(delta) {
  state.calendarMonth += delta;
  if (state.calendarMonth > 11) {
    state.calendarMonth = 0;
    state.calendarYear++;
  } else if (state.calendarMonth < 0) {
    state.calendarMonth = 11;
    state.calendarYear--;
  }
  renderCalendar();
}

// ============================================
// TIME SLOTS
// ============================================
function renderTimeSlots() {
  const container = document.getElementById('time-slots');
  if (!container) return;

  container.innerHTML = TIME_SLOTS.map(time => `
    <div class="time-slot" data-time="${time}" tabindex="0" role="button" aria-label="Seleccionar hora ${time}">
      ${time}
    </div>
  `).join('');

  container.querySelectorAll('.time-slot').forEach(el => {
    el.addEventListener('click', () => {
      if (!el.classList.contains('disabled')) {
        selectTime(el.dataset.time);
      }
    });
    el.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !el.classList.contains('disabled')) {
        e.preventDefault();
        selectTime(el.dataset.time);
      }
    });
  });
}

function selectTime(time) {
  state.selectedTime = time;
  $$('.time-slot').forEach(el => {
    el.classList.toggle('selected', el.dataset.time === time);
  });
}

async function fetchBookedSlots(date) {
  try {
    const token = localStorage.getItem('bk_token');
    const response = await fetch(`${API_BASE}/booked-slots?date=${date}`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    const result = await response.json();
    if (result.success) {
      state.bookedSlots = result.data;
    }
  } catch (err) {
    console.error('Error fetching booked slots:', err);
    state.bookedSlots = [];
  }
}

function updateTimeSlotsUI() {
  $$('.time-slot').forEach(el => {
    const isBooked = state.bookedSlots.includes(el.dataset.time);
    el.classList.toggle('disabled', isBooked);
    el.classList.remove('selected');
    if (isBooked) {
      el.style.pointerEvents = 'none';
    } else {
      el.style.pointerEvents = '';
    }
  });

  // Reselect if time was previously selected and still available
  if (state.selectedTime && !state.bookedSlots.includes(state.selectedTime)) {
    $$('.time-slot').forEach(el => {
      el.classList.toggle('selected', el.dataset.time === state.selectedTime);
    });
  } else {
    state.selectedTime = null;
  }
}

// ============================================
// BOOKING WIZARD NAVIGATION
// ============================================
function setupEventListeners() {
  const btnNext = document.getElementById('btn-next');
  const btnPrev = document.getElementById('btn-prev');
  const prevMonth = document.getElementById('prev-month');
  const nextMonth = document.getElementById('next-month');

  if (btnNext) btnNext.addEventListener('click', nextStep);
  if (btnPrev) btnPrev.addEventListener('click', prevStep);
  if (prevMonth) prevMonth.addEventListener('click', () => changeMonth(-1));
  if (nextMonth) nextMonth.addEventListener('click', () => changeMonth(1));

  // Mobile menu toggle
  const menuToggle = document.getElementById('menu-toggle');
  const navLinks = document.getElementById('nav-links');
  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
    });
  }
}

async function nextStep() {
  if (!validateStep(state.currentStep)) return;

  if (state.currentStep < 4) {
    if (state.currentStep === 2) {
      checkAuthForBooking();
    }
    if (state.currentStep === 3) {
      // Submit booking to API
      const success = await submitBooking();
      if (!success) return;
    }
    state.currentStep++;
    updateStepUI();
  }
}

function checkAuthForBooking() {
  const token = localStorage.getItem('bk_token');
  const authOverlay = document.getElementById('auth-overlay');
  const userStr = localStorage.getItem('bk_user');

  if (!token || !userStr) {
    if(authOverlay) {
      authOverlay.innerHTML = `
        <svg style="width: 48px; height: 48px; color: var(--color-gold-primary); margin-bottom: 15px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8V7a4 4 0 00-8 0v4h8z"></path></svg>
        <h3 style="margin-bottom: 10px; color: var(--color-gold-primary); font-size: 1.5rem;">Inicia sesión para continuar</h3>
        <p style="color: var(--color-text-secondary); margin-bottom: 20px;">Necesitas una cuenta para finalizar tu reserva. Así no tendrás que volver a introducir tus datos.</p>
        <a href="login.html" class="btn btn-primary" style="text-decoration: none;">Identifícate / Regístrate</a>
      `;
      authOverlay.style.display = 'flex';
    }
  } else {
    try {
      const user = JSON.parse(userStr);
      if (!user.email_verified) {
        if (authOverlay) {
          authOverlay.innerHTML = `
            <svg style="width: 48px; height: 48px; color: var(--color-accent-warning); margin-bottom: 15px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            <h3 style="margin-bottom: 10px; color: var(--color-accent-warning); font-size: 1.5rem;">Verifica tu correo electrónico</h3>
            <p style="color: var(--color-text-secondary); margin-bottom: 20px; max-width: 450px;">Hemos enviado un enlace de confirmación a <strong>${user.email}</strong>. Debes verificar tu correo para poder reservar citas.</p>
            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
              <button onclick="resendVerificationEmail('${user.email}')" class="btn btn-outline" style="cursor: pointer; padding: 10px 15px;">Reenviar Correo</button>
              <button onclick="window.location.reload()" class="btn btn-primary" style="cursor: pointer; padding: 10px 15px;">Ya lo he verificado</button>
            </div>
          `;
          authOverlay.style.display = 'flex';
        }
        return;
      }

      if(authOverlay) authOverlay.style.display = 'none';
      const nameInput = document.getElementById('client-name');
      const surnameInput = document.getElementById('client-surname');
      const phoneInput = document.getElementById('client-phone');
      const emailInput = document.getElementById('client-email');
      
      if (nameInput) nameInput.value = user.name || '';
      if (surnameInput) surnameInput.value = user.surname || '';
      if (phoneInput) phoneInput.value = user.phone || '';
      if (emailInput) emailInput.value = user.email || '';
    } catch(e) {}
  }
}

function prevStep() {
  if (state.currentStep > 1) {
    state.currentStep--;
    updateStepUI();
  }
}

function validateStep(step) {
  switch (step) {
    case 1:
      if (!state.selectedService) {
        showToast('error', 'Por favor, selecciona un servicio');
        return false;
      }
      return true;
    case 2:
      if (!state.selectedDate) {
        showToast('error', 'Por favor, selecciona una fecha');
        return false;
      }
      if (!state.selectedTime) {
        showToast('error', 'Por favor, selecciona una hora');
        return false;
      }
      return true;
    case 3:
      const name = document.getElementById('client-name')?.value.trim();
      const surname = document.getElementById('client-surname')?.value.trim();
      const phone = document.getElementById('client-phone')?.value.trim();
      if (!name || !surname || !phone) {
        showToast('error', 'Por favor, completa los campos obligatorios (nombre, apellido y teléfono)');
        return false;
      }
      return true;
    default:
      return true;
  }
}

function updateStepUI() {
  $$('.step').forEach(step => {
    const stepNum = parseInt(step.dataset.step);
    step.classList.remove('active', 'completed');
    if (stepNum === state.currentStep) step.classList.add('active');
    if (stepNum < state.currentStep) step.classList.add('completed');
  });

  $$('.step-panel').forEach((panel, index) => {
    panel.classList.toggle('active', index + 1 === state.currentStep);
  });

  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const footer = document.getElementById('booking-footer');

  if (btnPrev) {
    btnPrev.style.visibility = state.currentStep > 1 ? 'visible' : 'hidden';
  }

  if (state.currentStep === 4) {
    if (footer) footer.style.display = 'none';
  } else {
    if (footer) footer.style.display = 'flex';
    if (btnNext) {
      btnNext.innerHTML = state.currentStep === 3 ? 'Confirmar Reserva <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:4px; vertical-align:-3px;"><polyline points="20 6 9 17 4 12"/></svg>' : 'Siguiente <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:4px; vertical-align:-3px;"><polyline points="9 18 15 12 9 6"/></svg>';
    }
  }

  const bookingSection = document.getElementById('booking-section');
  if (bookingSection) {
    bookingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ============================================
// BOOKING SUBMISSION — API CALL
// ============================================
async function submitBooking() {
  const btnNext = document.getElementById('btn-next');
  if (btnNext) {
    btnNext.disabled = true;
    btnNext.textContent = 'Enviando...';
  }

  const payload = {
    service: state.selectedService,
    date: state.selectedDate,
    time: state.selectedTime,
    client: {
      name: document.getElementById('client-name')?.value.trim() || '',
      surname: document.getElementById('client-surname')?.value.trim() || '',
      phone: document.getElementById('client-phone')?.value.trim() || '',
      email: document.getElementById('client-email')?.value.trim() || '',
      notes: document.getElementById('client-notes')?.value.trim() || ''
    }
  };

  try {
    const token = localStorage.getItem('bk_token');
    if (!token) return false;

    const response = await fetch(`${API_BASE}/appointments`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      showToast('error', result.error || result.errors?.join(', ') || 'Error al reservar la cita');
      return false;
    }

    // Render confirmation
    renderConfirmation(result.data);
    showToast('success', '¡Cita reservada con éxito! El barbero ha sido notificado.');
    return true;
  } catch (err) {
    console.error('Error submitting booking:', err);
    showToast('error', 'Error de conexión con el servidor. Inténtalo de nuevo.');
    return false;
  } finally {
    if (btnNext) {
      btnNext.disabled = false;
      btnNext.textContent = 'Confirmar Reserva ✓';
    }
  }
}

function renderConfirmation(appointment) {
  const summary = document.getElementById('booking-summary');
  if (!summary) return;

  const dateParts = appointment.date.split('-');
  const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
  const formattedDate = dateObj.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  summary.innerHTML = `
    <div class="summary-row">
      <span class="summary-label">Servicio</span>
      <span class="summary-value">${appointment.service.icon} ${appointment.service.name}</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Fecha</span>
      <span class="summary-value">${formattedDate}</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Hora</span>
      <span class="summary-value">${appointment.time}h</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Duración</span>
      <span class="summary-value">${appointment.service.duration} minutos</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Cliente</span>
      <span class="summary-value">${appointment.client.name} ${appointment.client.surname}</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Precio Estimado</span>
      <span class="summary-value gold">${appointment.service.price}€</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Estado</span>
      <span class="summary-value" style="color: var(--color-accent-warning);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px; vertical-align:-2px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Pendiente de confirmación</span>
    </div>
  `;
}

// ============================================
// SCROLL EFFECTS
// ============================================
function setupScrollEffects() {
  const header = document.getElementById('header');

  window.addEventListener('scroll', () => {
    if (header) {
      header.classList.toggle('scrolled', window.scrollY > 50);
    }
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.service-card, .services-header').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
  });
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================
function showToast(type, message) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const svgSuccess = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
  const svgError = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  const svgInfo = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  const icon = type === 'success' ? svgSuccess : type === 'error' ? svgError : svgInfo;

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
    <span class="toast-close" role="button" aria-label="Cerrar notificación"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>
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

// ============================================
// UTILITIES
// ============================================
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function resendVerificationEmail(email) {
  try {
    const response = await fetch(`${API_BASE}/auth/resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await response.json();
    if (data.success) {
      showToast('success', '¡Correo de verificación reenviado!');
    } else {
      showToast('error', data.error || 'Error al reenviar el correo');
    }
  } catch (err) {
    showToast('error', 'Error de conexión con el servidor');
  }
}
