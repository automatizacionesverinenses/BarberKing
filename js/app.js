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
    icon: '✂️'
  },
  {
    id: 'corte-degradado',
    name: 'Degradado / Fade',
    description: 'Degradado personalizado con máquina y tijera. El estilo más solicitado.',
    price: 18,
    duration: 40,
    icon: '💈'
  },
  {
    id: 'corte-barba',
    name: 'Corte + Barba',
    description: 'Combo completo de corte de pelo y arreglo de barba con navaja.',
    price: 25,
    duration: 50,
    icon: '🧔'
  },
  {
    id: 'arreglo-barba',
    name: 'Arreglo de Barba',
    description: 'Perfilado y arreglo de barba con navaja tradicional y toalla caliente.',
    price: 10,
    duration: 20,
    icon: '🪒'
  },
  {
    id: 'tratamiento-capilar',
    name: 'Tratamiento Capilar',
    description: 'Tratamiento hidratante y nutritivo para el cabello con masaje craneal.',
    price: 20,
    duration: 35,
    icon: '💆'
  },
  {
    id: 'pack-premium',
    name: 'Pack Premium',
    description: 'Experiencia completa: corte, barba, tratamiento capilar y ritual caliente.',
    price: 40,
    duration: 75,
    icon: '👑'
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
});

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
        <div class="service-check">✓</div>
        <div class="service-icon">${service.icon}</div>
        <h3 class="service-name">${service.name}</h3>
        <p class="service-description">${service.description}</p>
        <div class="service-meta">
          <span class="service-price">${service.price}€</span>
          <span class="service-duration">🕐 ${service.duration} min</span>
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
    const response = await fetch(`${API_BASE}/booked-slots?date=${date}`);
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
    if (state.currentStep === 3) {
      // Submit booking to API
      const success = await submitBooking();
      if (!success) return;
    }
    state.currentStep++;
    updateStepUI();
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
      btnNext.textContent = state.currentStep === 3 ? 'Confirmar Reserva ✓' : 'Siguiente →';
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
// ============================================
// APP LOGIC
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  setupNavbar();
  setupBooking();
  setupSmoothScroll();
});

function setupNavbar() {
  const token = localStorage.getItem('bk_token');
  const userStr = localStorage.getItem('bk_user');
  const navLogin = document.getElementById('nav-login');

  if (token && userStr && navLogin) {
    try {
      const user = JSON.parse(userStr);
      navLogin.textContent = (user.role === 'admin' || user.role === 'employee') ? 'Panel Barbero' : 'Mi Perfil';
      navLogin.href = (user.role === 'admin' || user.role === 'employee') ? 'admin.html' : '#';
      // In a real app we would have a profile page for client
    } catch (e) {
      console.error(e);
    }
  }

  const toggle = document.getElementById('menu-toggle');
  const nav = document.getElementById('nav-links');
  
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      nav.classList.toggle('active');
    });
  }
}

// ============================================
// BOOKING FLOW
// ============================================

let currentStep = 1;
const state = {
  service: null,
  date: null,
  time: null,
  client: null
};

function setupBooking() {
  // Service selection
  const serviceCards = document.querySelectorAll('.service-card');
  serviceCards.forEach(card => {
    card.addEventListener('click', () => {
      // Check if logged in before proceeding
      const token = localStorage.getItem('bk_token');
      const authWarning = document.getElementById('auth-warning');
      const bookingForm = document.getElementById('booking-client-form');
      const userStr = localStorage.getItem('bk_user');

      if (!token || !userStr) {
        if(authWarning) authWarning.style.display = 'block';
        if(bookingForm) bookingForm.style.display = 'none';
      } else {
        if(authWarning) authWarning.style.display = 'none';
        if(bookingForm) {
          bookingForm.style.display = 'block';
          try {
            const user = JSON.parse(userStr);
            document.getElementById('client-name').value = user.name;
            document.getElementById('client-surname').value = user.surname;
            document.getElementById('client-phone').value = user.phone;
          } catch(e) {}
        }
      }

      serviceCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      
      state.service = {
        id: card.dataset.id,
        name: card.dataset.name,
        price: card.dataset.price,
        duration: card.dataset.duration,
        icon: card.querySelector('.service-icon').textContent
      };
      
      goToStep(2);
    });
  });

  // Date selection
  const dateInput = document.getElementById('booking-date');
  if (dateInput) {
    const today = new Date();
    dateInput.min = today.toISOString().split('T')[0];
    
    dateInput.addEventListener('change', async (e) => {
      const selectedDate = e.target.value;
      state.date = selectedDate;
      await loadAvailableTimes(selectedDate);
    });
  }

  // Time selection (delegated)
  const timeGrid = document.getElementById('time-slots');
  if (timeGrid) {
    timeGrid.addEventListener('click', (e) => {
      if (e.target.classList.contains('time-slot') && !e.target.classList.contains('disabled')) {
        document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
        e.target.classList.add('selected');
        
        state.time = e.target.dataset.time;
        
        // Render summary before going to step 3
        renderSummary();
        goToStep(3);
      }
    });
  }

  // Back buttons
  document.querySelectorAll('.btn-back').forEach(btn => {
    btn.addEventListener('click', () => {
      goToStep(currentStep - 1);
    });
  });

  // Next buttons
  const btnNextStep2 = document.getElementById('btn-next-step-2');
  if (btnNextStep2) {
    btnNextStep2.addEventListener('click', () => {
      if (!state.date || !state.time) {
        showToast('error', 'Selecciona fecha y hora');
        return;
      }
      renderSummary();
      goToStep(3);
    });
  }

  // Confirm Booking
  const btnConfirm = document.getElementById('btn-confirm-booking');
  if (btnConfirm) {
    btnConfirm.addEventListener('click', submitBooking);
  }
}

async function loadAvailableTimes(date) {
  const timeGrid = document.getElementById('time-slots');
  timeGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center;">Cargando horarios...</div>';

  try {
    const token = localStorage.getItem('bk_token');
    const response = await fetch(`/api/booked-slots?date=${date}`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    const result = await response.json();
    
    const bookedSlots = result.success ? result.data : [];
    
    const allSlots = ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30', 
                      '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00'];
                      
    timeGrid.innerHTML = allSlots.map(time => {
      const isBooked = bookedSlots.includes(time);
      const isSelected = state.time === time;
      return `
        <div class="time-slot ${isBooked ? 'disabled' : ''} ${isSelected ? 'selected' : ''}" 
             data-time="${time}">
          ${time}
        </div>
      `;
    }).join('');
  } catch (err) {
    timeGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: red;">Error al cargar horarios</div>';
  }
}

function renderSummary() {
  const summaryEl = document.getElementById('booking-summary');
  if (!summaryEl) return;

  summaryEl.innerHTML = `
    <h4 style="margin-bottom: var(--space-sm);">Resumen de la reserva</h4>
    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px; margin-bottom: 5px;">
      <span>Servicio:</span>
      <strong>${state.service?.icon} ${state.service?.name}</strong>
    </div>
    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px; margin-bottom: 5px;">
      <span>Fecha:</span>
      <strong>${state.date}</strong>
    </div>
    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px; margin-bottom: 5px;">
      <span>Hora:</span>
      <strong>${state.time}</strong>
    </div>
    <div style="display: flex; justify-content: space-between; margin-top: var(--space-md); font-size: 1.1rem; color: var(--color-gold-primary);">
      <span>Total a pagar en local:</span>
      <strong>${state.service?.price}€</strong>
    </div>
  `;
}

function goToStep(stepNumber) {
  if (stepNumber < 1 || stepNumber > 4) return;
  
  // Update UI
  document.querySelectorAll('.step-panel, .booking-step').forEach(panel => {
    panel.classList.remove('active');
    panel.style.display = 'none'; // Some are using inline styles for logic
  });
  
  const targetStep = document.getElementById(`step-${stepNumber}`);
  if (targetStep) {
    targetStep.classList.add('active');
    if (targetStep.style.display === 'none') {
      targetStep.style.display = 'block'; // Ensure block display for our custom step 3
    }
  }

  // Update Progress Bar
  const steps = document.querySelectorAll('.progress-step');
  steps.forEach((step, idx) => {
    if (idx + 1 < stepNumber) {
      step.classList.add('active');
    } else if (idx + 1 === stepNumber) {
      step.classList.add('active');
    } else {
      step.classList.remove('active');
    }
  });

  currentStep = stepNumber;
}

async function submitBooking(e) {
  e.preventDefault();
  
  const token = localStorage.getItem('bk_token');
  if (!token) return;

  const notes = document.getElementById('client-notes').value;

  state.client = {
    notes: notes
  };

  const btn = document.getElementById('btn-confirm-booking');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Procesando...';

  try {
    const response = await fetch('/api/appointments', {
      method: 'POST',
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
      <span class="summary-label">Precio</span>
      <span class="summary-value gold">${appointment.service.price}€</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Estado</span>
      <span class="summary-value" style="color: var(--color-accent-warning);">⏳ Pendiente de confirmación</span>
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

  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
    <span class="toast-close" role="button" aria-label="Cerrar notificación">✕</span>
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
