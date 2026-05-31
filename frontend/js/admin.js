/* ===== ADMIN PANEL ===== */

let usersPage = 1;
let postsPage = 1;
let userSearchQuery = '';

(async function init() {
  if (!getToken()) { window.location.href = '/'; return; }
  const user = getUser();
  if (user?.role !== 'admin') { window.location.href = '/feed'; return; }
  await initSidebar();
  loadStats();
  loadDashboardUsers();
  connectAdminSSE();
})();

function connectAdminSSE() {
  const token = getToken();
  if (!token) return;

  const es = new EventSource(`/api/events/stream?token=${encodeURIComponent(token)}`);

  es.addEventListener('new-user', (e) => {
    try {
      const data = JSON.parse(e.data);
      showToast(`New user registered: @${data.username}`, 'success');
    } catch {}
    loadStats();
    // Refresh users table if currently visible
    if (document.getElementById('usersView')?.style.display !== 'none') {
      loadUsers(usersPage, userSearchQuery);
    }
    loadDashboardUsers();
  });

  es.addEventListener('new-post', (e) => {
    try {
      const data = JSON.parse(e.data);
      showToast(`New post by @${data.username}`, 'default');
    } catch {}
    loadStats();
    if (document.getElementById('postsView')?.style.display !== 'none') {
      loadAdminPosts(postsPage);
    }
  });

  es.addEventListener('stats-update', () => {
    loadStats();
    if (document.getElementById('usersView')?.style.display !== 'none') {
      loadUsers(usersPage, userSearchQuery);
    }
    if (document.getElementById('postsView')?.style.display !== 'none') {
      loadAdminPosts(postsPage);
    }
    loadDashboardUsers();
  });

  es.addEventListener('user-status-changed', (e) => {
    try {
      const data = JSON.parse(e.data);
      // Update row in-place if visible without full reload
      const rows = document.querySelectorAll('#usersTable tr, #dashboardUsersTable tr');
      rows.forEach(row => {
        const userCell = row.querySelector('.user-name');
        if (userCell?.textContent === `@${data.username}`) {
          const badge = row.querySelector('.badge-active, .badge-suspended');
          if (badge) {
            badge.className = `badge badge-${data.is_active ? 'active' : 'suspended'}`;
            badge.textContent = data.is_active ? 'Active' : 'Suspended';
          }
          const toggleBtn = row.querySelector('button[title="Suspend"], button[title="Activate"]');
          if (toggleBtn) toggleBtn.textContent = data.is_active ? '🚫' : '✅';
        }
      });
    } catch {}
  });

  es.onerror = () => {
    es.close();
    setTimeout(connectAdminSSE, 5000);
  };
}

async function loadStats() {
  try {
    const res = await apiFetch('/api/admin/stats');
    if (!res?.ok) return;
    const data = await res.json();
    document.getElementById('statUsers').textContent = data.users.toLocaleString();
    document.getElementById('statPosts').textContent = data.posts.toLocaleString();
    document.getElementById('statComments').textContent = data.comments.toLocaleString();
    document.getElementById('statLikes').textContent = data.likes.toLocaleString();
  } catch {}
}

async function loadDashboardUsers() {
  try {
    const res = await apiFetch('/api/admin/users?page=1');
    if (!res?.ok) return;
    const data = await res.json();
    const tbody = document.getElementById('dashboardUsersTable');
    tbody.innerHTML = data.users.slice(0, 8).map(u => renderUserRow(u, true)).join('');
  } catch {}
}

function renderUserRow(u, compact = false) {
  const joined = new Date(u.created_at).toLocaleDateString();
  return `
    <tr>
      <td>
        <div class="user-cell">
          ${renderAvatar(u.avatar, u.username, 32)}
          <div>
            <div class="user-name">@${u.username}</div>
            <div class="user-email">${u.email}</div>
          </div>
        </div>
      </td>
      <td><span class="badge badge-${u.role}">${u.role}</span></td>
      <td><span class="badge badge-${u.is_active ? 'active' : 'suspended'}">${u.is_active ? 'Active' : 'Suspended'}</span></td>
      <td>${u.posts_count || 0}</td>
      ${!compact ? `<td>${u.followers_count || 0}</td>` : ''}
      <td>${joined}</td>
      <td>
        <div class="action-group">
          <button class="btn btn-ghost btn-sm" onclick="toggleUserStatus(${u.id}, this)" title="${u.is_active ? 'Suspend' : 'Activate'}">
            ${u.is_active ? '🚫' : '✅'}
          </button>
          <button class="btn btn-ghost btn-sm" onclick="toggleUserRole(${u.id}, '${u.role}', this)" title="Toggle Role">
            ${u.role === 'admin' ? '👤' : '🛡️'}
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id})" title="Delete">🗑️</button>
        </div>
      </td>
    </tr>`;
}

async function loadUsers(page = 1, search = '') {
  usersPage = page;
  userSearchQuery = search;
  try {
    const res = await apiFetch(`/api/admin/users?page=${page}&search=${encodeURIComponent(search)}`);
    if (!res?.ok) return;
    const data = await res.json();
    const tbody = document.getElementById('usersTable');
    tbody.innerHTML = data.users.length === 0
      ? '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:30px">No users found</td></tr>'
      : data.users.map(u => renderUserRow(u)).join('');
    renderPagination('usersPagination', data.total, 20, page, (p) => loadUsers(p, userSearchQuery));
  } catch {}
}

async function loadAdminPosts(page = 1) {
  postsPage = page;
  try {
    const res = await apiFetch(`/api/admin/posts?page=${page}`);
    if (!res?.ok) return;
    const data = await res.json();
    const tbody = document.getElementById('postsTable');
    tbody.innerHTML = data.posts.length === 0
      ? '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:30px">No posts found</td></tr>'
      : data.posts.map(p => renderPostRow(p)).join('');
    renderPagination('postsPagination', data.total, 20, page, loadAdminPosts);
  } catch {}
}

function renderPostRow(p) {
  const date = new Date(p.created_at).toLocaleDateString();
  const content = (p.content || '').slice(0, 60) + (p.content?.length > 60 ? '...' : '');
  return `
    <tr>
      <td>
        <div class="user-cell">
          ${renderAvatar(p.avatar, p.username, 32)}
          <span class="user-name">@${p.username}</span>
        </div>
      </td>
      <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(content || '(no text)')}</td>
      <td>❤️ ${p.likes_count}</td>
      <td>💬 ${p.comments_count}</td>
      <td>${p.media_type ? `<span class="badge badge-user">${p.media_type}</span>` : '—'}</td>
      <td>${date}</td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="deleteAdminPost(${p.id})">🗑️ Delete</button>
      </td>
    </tr>`;
}

function renderPagination(containerId, total, perPage, currentPage, callback) {
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) { document.getElementById(containerId).innerHTML = ''; return; }

  let html = '';
  if (currentPage > 1) html += `<button class="page-btn" onclick="(${callback})(${currentPage - 1})">‹</button>`;
  for (let i = Math.max(1, currentPage - 2); i <= Math.min(totalPages, currentPage + 2); i++) {
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="(${callback})(${i})">${i}</button>`;
  }
  if (currentPage < totalPages) html += `<button class="page-btn" onclick="(${callback})(${currentPage + 1})">›</button>`;
  document.getElementById(containerId).innerHTML = html;
}

async function toggleUserStatus(userId, btn) {
  try {
    const res = await apiFetch(`/api/admin/users/${userId}/toggle`, { method: 'PATCH' });
    if (!res?.ok) return;
    const data = await res.json();
    showToast(`User ${data.is_active ? 'activated' : 'suspended'}`, 'success');
    const row = btn.closest('tr');
    const statusBadge = row.querySelector('.badge-active, .badge-suspended');
    if (statusBadge) {
      statusBadge.className = `badge badge-${data.is_active ? 'active' : 'suspended'}`;
      statusBadge.textContent = data.is_active ? 'Active' : 'Suspended';
    }
    btn.textContent = data.is_active ? '🚫' : '✅';
  } catch {}
}

async function toggleUserRole(userId, currentRole, btn) {
  const newRole = currentRole === 'admin' ? 'user' : 'admin';
  if (!confirm(`Change role to ${newRole}?`)) return;
  try {
    const res = await apiFetch(`/api/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role: newRole })
    });
    if (!res?.ok) return;
    const data = await res.json();
    showToast(`Role changed to ${data.role}`, 'success');
    const row = btn.closest('tr');
    const roleBadge = row.querySelector('.badge-admin, .badge-user');
    if (roleBadge) {
      roleBadge.className = `badge badge-${data.role}`;
      roleBadge.textContent = data.role;
    }
    btn.textContent = newRole === 'admin' ? '👤' : '🛡️';
    btn.setAttribute('onclick', `toggleUserRole(${userId}, '${newRole}', this)`);
  } catch {}
}

async function deleteUser(userId) {
  if (!confirm('Delete this user? This action cannot be undone.')) return;
  try {
    const res = await apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
    if (!res?.ok) return;
    showToast('User deleted', 'success');
    loadUsers(usersPage, userSearchQuery);
    loadStats();
  } catch {}
}

async function deleteAdminPost(postId) {
  if (!confirm('Delete this post?')) return;
  try {
    const res = await apiFetch(`/api/admin/posts/${postId}`, { method: 'DELETE' });
    if (!res?.ok) return;
    showToast('Post deleted', 'success');
    loadAdminPosts(postsPage);
    loadStats();
  } catch {}
}

async function createAdmin() {
  const username = document.getElementById('newAdminUsername').value.trim();
  const email = document.getElementById('newAdminEmail').value.trim();
  const password = document.getElementById('newAdminPassword').value;
  const errEl = document.getElementById('createAdminError');
  const sucEl = document.getElementById('createAdminSuccess');
  errEl.style.display = 'none';
  sucEl.style.display = 'none';

  if (!username || !email || !password) {
    errEl.textContent = 'All fields are required';
    errEl.style.display = 'block';
    return;
  }

  try {
    const res = await apiFetch('/api/admin/create-admin', {
      method: 'POST',
      body: JSON.stringify({ username, email, password })
    });
    const data = await res.json();
    if (!res?.ok) throw new Error(data.error);
    sucEl.textContent = `Admin @${data.username} created successfully!`;
    sucEl.style.display = 'block';
    document.getElementById('newAdminUsername').value = '';
    document.getElementById('newAdminEmail').value = '';
    document.getElementById('newAdminPassword').value = '';
    showToast('Admin created!', 'success');
  } catch (err) {
    errEl.textContent = err.message || 'Failed to create admin';
    errEl.style.display = 'block';
  }
}

let searchUsersTimeout;
function searchUsers(query) {
  clearTimeout(searchUsersTimeout);
  searchUsersTimeout = setTimeout(() => loadUsers(1, query), 400);
}

function switchAdminView(view, el) {
  const viewIds = { dashboard: 'dashboardView', users: 'usersView', posts: 'postsView', 'create-admin': 'createAdminView' };
  Object.values(viewIds).forEach(id => {
    const viewEl = document.getElementById(id);
    if (viewEl) viewEl.style.display = 'none';
  });

  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  if (el) el.classList.add('active');

  const titles = {
    dashboard: 'Dashboard',
    users: 'Manage Users',
    posts: 'Manage Posts',
    'create-admin': 'Create Admin'
  };
  document.getElementById('adminPageTitle').textContent = titles[view] || 'Admin';

  const viewEl = document.getElementById(viewIds[view]);
  if (viewEl) viewEl.style.display = 'block';

  if (view === 'dashboard') { loadStats(); loadDashboardUsers(); }
  else if (view === 'users') loadUsers(1);
  else if (view === 'posts') loadAdminPosts(1);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}
