/**
 * BarberKing — Auth Logic
 * Handles login and registration forms
 */

const API_BASE = window.location.origin + '/api';

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupForms();
});

function setupTabs() {
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    formLogin.classList.add('active');
    formRegister.classList.remove('active');
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    formRegister.classList.add('active');
    formLogin.classList.remove('active');
  });
}

function setupForms() {
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');

  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    const btn = formLogin.querySelector('button[type="submit"]');
    
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Iniciando sesión...';

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();

      if (data.success) {
        localStorage.setItem('bk_token', data.token);
        localStorage.setItem('bk_user', JSON.stringify(data.user));
        
        showToast('success', '¡Sesión iniciada!');
        
        // Redirect based on role
        setTimeout(() => {
          if (data.user.role === 'admin' || data.user.role === 'employee') {
            window.location.href = 'admin.html';
          } else {
            window.location.href = 'index.html';
          }
        }, 1000);
      } else {
        errorEl.textContent = data.error;
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Entrar';
      }
    } catch (err) {
      errorEl.textContent = 'Error de conexión. Inténtalo de nuevo.';
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  });

  formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const surname = document.getElementById('reg-surname').value;
    const phone = document.getElementById('reg-phone').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const errorEl = document.getElementById('reg-error');
    const btn = formRegister.querySelector('button[type="submit"]');
    
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Creando cuenta...';

    try {
      const response = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, surname, phone, email, password })
      });
      const data = await response.json();

      if (data.success) {
        localStorage.setItem('bk_token', data.token);
        localStorage.setItem('bk_user', JSON.stringify(data.user));
        
        showToast('success', '¡Cuenta creada con éxito!');
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 1000);
      } else {
        errorEl.textContent = data.error;
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Crear Cuenta';
      }
    } catch (err) {
      errorEl.textContent = 'Error de conexión. Inténtalo de nuevo.';
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Crear Cuenta';
    }
  });
}

function showToast(type, message) {
  const container = document.getElementById('toast-container');
  if (!container) {
    const newContainer = document.createElement('div');
    newContainer.id = 'toast-container';
    newContainer.className = 'toast-container';
    document.body.appendChild(newContainer);
  }

  const toastContainer = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
    <span class="toast-close" role="button" aria-label="Cerrar">✕</span>
  `;

  toastContainer.appendChild(toast);

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
