/* ===== SHARED APP UTILITIES ===== */

const API = '';

function getToken() { return localStorage.getItem('token'); }
function getUser() { return JSON.parse(localStorage.getItem('user') || 'null'); }

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';

  const res = await fetch(API + path, { ...options, headers });
  if (res.status === 401) { logout(); return; }
  return res;
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/';
}

function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeUI(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeUI(next);
}

function updateThemeUI(theme) {
  const icon = document.getElementById('themeIcon');
  const label = document.getElementById('themeLabel');
  if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  if (label) label.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
}

function showToast(msg, type = 'default') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', default: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${msg}`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(30px)'; toast.style.transition = '0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
}

function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('show');
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('show');
}

function handleAvatarError(el) {
  const user = el.dataset.username || '?';
  el.style.display = 'none';
  const fb = el.nextElementSibling;
  if (fb && fb.classList.contains('avatar-fallback')) {
    fb.style.display = 'flex';
    fb.textContent = user[0]?.toUpperCase() || '?';
  }
}

function avatarSrc(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return url;
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function getInitials(name) {
  return (name || '?')[0].toUpperCase();
}

function renderAvatar(src, username, size = 36, extraClass = '') {
  const initials = getInitials(username);
  if (src) {
    return `<img src="${src}" alt="${username}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex-shrink:0" class="${extraClass}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />
    <div class="avatar-fallback ${extraClass}" style="width:${size}px;height:${size}px;border-radius:50%;display:none;flex-shrink:0;font-size:${Math.floor(size*0.4)}px">${initials}</div>`;
  }
  return `<div class="avatar-fallback ${extraClass}" style="width:${size}px;height:${size}px;border-radius:50%;display:flex;flex-shrink:0;font-size:${Math.floor(size*0.4)}px">${initials}</div>`;
}

async function initSidebar() {
  const user = getUser();
  if (!user) return;

  document.getElementById('sidebarUsername').textContent = user.username;
  document.getElementById('sidebarRole').textContent = user.role === 'admin' ? 'Administrator' : 'Member';

  const avatarEl = document.getElementById('sidebarAvatar');
  const fallbackEl = document.getElementById('sidebarAvatarFallback');

  if (user.avatar) {
    avatarEl.src = user.avatar;
    avatarEl.style.display = 'block';
    fallbackEl.style.display = 'none';
  } else {
    avatarEl.style.display = 'none';
    fallbackEl.style.display = 'flex';
    fallbackEl.textContent = getInitials(user.username);
  }

  const adminLink = document.getElementById('adminNavLink');
  if (adminLink && user.role === 'admin') adminLink.style.display = 'flex';

  const profileLink = document.getElementById('profileNavLink');
  if (profileLink) profileLink.href = `/profile?id=${user.id}`;

  try {
    const res = await apiFetch('/api/users/me');
    if (res?.ok) {
      const fresh = await res.json();
      localStorage.setItem('user', JSON.stringify({ ...user, ...fresh }));
      if (fresh.avatar) {
        avatarEl.src = fresh.avatar;
        avatarEl.style.display = 'block';
        fallbackEl.style.display = 'none';
      }
    }
  } catch {}
}

function goToMyProfile() {
  const user = getUser();
  if (user) window.location.href = `/profile?id=${user.id}`;
}

let searchTimeout;
async function handleSearch(query) {
  clearTimeout(searchTimeout);
  const resultsEl = document.getElementById('searchResults');
  if (!query.trim()) { resultsEl?.classList.remove('show'); return; }

  searchTimeout = setTimeout(async () => {
    try {
      const res = await apiFetch(`/api/users/search/query?q=${encodeURIComponent(query)}`);
      if (!res?.ok) return;
      const users = await res.json();
      if (!resultsEl) return;

      if (users.length === 0) {
        resultsEl.innerHTML = '<div style="padding:12px 14px;color:var(--text-muted);font-size:13px">No users found</div>';
      } else {
        resultsEl.innerHTML = users.map(u => `
          <div class="search-result-item" onclick="window.location.href='/profile?id=${u.id}'">
            ${renderAvatar(u.avatar, u.username, 32)}
            <div class="name">@${u.username}</div>
          </div>
        `).join('');
      }
      resultsEl.classList.add('show');
    } catch {}
  }, 300);
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-bar')) {
    document.getElementById('searchResults')?.classList.remove('show');
  }
  if (!e.target.closest('.sidebar') && !e.target.closest('.menu-btn')) {
    closeSidebar();
  }
});

initTheme();
