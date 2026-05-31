/* ===== PROFILE PAGE ===== */

let profileUserId = null;

(async function init() {
  if (!getToken()) { window.location.href = '/'; return; }
  await initSidebar();

  const params = new URLSearchParams(window.location.search);
  profileUserId = parseInt(params.get('id'));
  if (!profileUserId) { window.location.href = '/feed'; return; }

  loadProfile();
})();

async function loadProfile() {
  const loader = document.getElementById('profileLoader');
  const content = document.getElementById('profileContent');

  try {
    const res = await apiFetch(`/api/users/${profileUserId}`);
    if (!res?.ok) throw new Error('User not found');
    const user = await res.json();

    loader.style.display = 'none';
    content.style.display = 'block';

    document.getElementById('pageTitle').textContent = `@${user.username}`;
    document.getElementById('profileUsername').textContent = `@${user.username}`;
    document.getElementById('profileBio').textContent = user.bio || 'No bio yet';
    document.getElementById('profileJoined').textContent = `📅 Joined ${formatDate(user.created_at)}`;
    document.getElementById('statPosts').textContent = user.posts_count || 0;
    document.getElementById('statFollowers').textContent = user.followers_count || 0;
    document.getElementById('statFollowing').textContent = user.following_count || 0;

    const avatarEl = document.getElementById('profileAvatar');
    if (user.avatar) {
      avatarEl.src = user.avatar;
    } else {
      avatarEl.style.display = 'none';
      const fb = document.createElement('div');
      fb.className = 'avatar-fallback';
      fb.style.cssText = 'width:90px;height:90px;border-radius:50%;display:flex;font-size:36px;border:4px solid var(--bg-card)';
      fb.textContent = getInitials(user.username);
      avatarEl.parentNode.insertBefore(fb, avatarEl.nextSibling);
    }

    const myId = getUser()?.id;
    const actionsEl = document.getElementById('profileActions');

    if (user.id === myId) {
      actionsEl.innerHTML = `
        <button class="btn btn-outline" onclick="openEditProfile()">✏️ Edit Profile</button>`;
    } else {
      actionsEl.innerHTML = `
        <button class="btn ${user.is_following ? 'btn-ghost' : 'btn-primary'}" id="followBtn"
          onclick="toggleFollow(${user.id})">
          ${user.is_following ? 'Unfollow' : 'Follow'}
        </button>`;
    }

    loadUserPosts();
  } catch (err) {
    loader.style.display = 'none';
    document.getElementById('profileContent').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">😕</div>
        <h3>User not found</h3>
        <p>${err.message}</p>
      </div>`;
    document.getElementById('profileContent').style.display = 'block';
  }
}

async function loadUserPosts() {
  const container = document.getElementById('profilePosts');
  container.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  try {
    const res = await apiFetch(`/api/posts/user/${profileUserId}`);
    if (!res?.ok) throw new Error();
    const posts = await res.json();

    if (posts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📝</div>
          <h3>No posts yet</h3>
          <p>This user hasn't posted anything.</p>
        </div>`;
      return;
    }

    container.innerHTML = posts.map(p => renderProfilePost(p)).join('');
  } catch {
    container.innerHTML = '<div class="empty-state"><p>Failed to load posts</p></div>';
  }
}

function renderProfilePost(post) {
  const myId = getUser()?.id;
  const isOwn = post.user_id === myId;
  const mediaHtml = post.media_url ? (
    post.media_type === 'video'
      ? `<video class="post-media" src="${post.media_url}" controls preload="metadata"></video>`
      : `<img class="post-media" src="${post.media_url}" alt="post" loading="lazy" />`
  ) : '';

  return `
    <div class="post-card" id="post-${post.id}">
      <div class="post-header">
        <div style="display:flex;align-items:center;gap:8px">
          ${renderAvatar(post.avatar, post.username, 40)}
        </div>
        <div class="post-meta">
          <div class="post-username">@${post.username}</div>
          <div class="post-time">${timeAgo(post.created_at)}</div>
        </div>
        ${isOwn ? `<button class="post-menu" onclick="deleteProfilePost(${post.id})">🗑️</button>` : ''}
      </div>
      ${post.content ? `<div class="post-content">${escapeHtml(post.content)}</div>` : ''}
      ${mediaHtml}
      <div class="post-actions">
        <button class="action-btn ${post.liked ? 'liked' : ''}" onclick="toggleLike(${post.id}, this)">
          <svg width="18" height="18" fill="${post.liked ? 'var(--primary)' : 'none'}" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          <span id="profileLikeCount${post.id}">${post.likes_count}</span>
        </button>
        <button class="action-btn" onclick="toggleComments(${post.id})">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          <span>${post.comments_count}</span>
        </button>
      </div>
      <div class="comments-section" id="comments-${post.id}" style="display:none"></div>
    </div>`;
}

async function toggleLike(postId, btn) {
  try {
    const res = await apiFetch(`/api/posts/${postId}/like`, { method: 'POST' });
    if (!res?.ok) return;
    const data = await res.json();
    const countEl = document.getElementById(`profileLikeCount${postId}`);
    if (countEl) countEl.textContent = data.likes_count;
    const svg = btn.querySelector('svg');
    if (data.liked) { btn.classList.add('liked'); if (svg) svg.setAttribute('fill', 'var(--primary)'); }
    else { btn.classList.remove('liked'); if (svg) svg.setAttribute('fill', 'none'); }
  } catch {}
}

async function toggleComments(postId) {
  const section = document.getElementById(`comments-${postId}`);
  if (section.style.display === 'none') {
    section.style.display = 'block';
    await loadComments(postId);
  } else {
    section.style.display = 'none';
  }
}

async function loadComments(postId) {
  const section = document.getElementById(`comments-${postId}`);
  const user = getUser();
  try {
    const res = await apiFetch(`/api/posts/${postId}/comments`);
    if (!res?.ok) return;
    const comments = await res.json();
    section.innerHTML = `
      <div class="comment-input-row">
        ${renderAvatar(user?.avatar, user?.username, 32)}
        <input type="text" placeholder="Write a comment..." id="commentInput${postId}" onkeydown="if(event.key==='Enter')submitComment(${postId})" />
        <button class="comment-send" onclick="submitComment(${postId})">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
      <div id="commentsList${postId}">
        ${comments.length === 0
          ? '<p style="font-size:13px;color:var(--text-muted);padding:8px 0">No comments yet</p>'
          : comments.map(c => renderComment(c, postId)).join('')}
      </div>`;
  } catch {}
}

function renderComment(c, postId) {
  const user = getUser();
  const canDelete = c.user_id === user?.id;
  return `
    <div class="comment-item" id="comment-${c.id}">
      <div style="cursor:pointer" onclick="window.location.href='/profile?id=${c.user_id}'">${renderAvatar(c.avatar, c.username, 30)}</div>
      <div class="comment-body" style="flex:1">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <span class="comment-author" style="cursor:pointer" onclick="window.location.href='/profile?id=${c.user_id}'">@${c.username}</span>
          ${canDelete ? `<button onclick="deleteComment(${postId},${c.id})" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:12px;padding:2px 4px">✕</button>` : ''}
        </div>
        <div class="comment-text">${escapeHtml(c.content)}</div>
        <div class="comment-time">${timeAgo(c.created_at)}</div>
      </div>
    </div>`;
}

async function submitComment(postId) {
  const input = document.getElementById(`commentInput${postId}`);
  const content = input?.value?.trim();
  if (!content) return;
  try {
    const res = await apiFetch(`/api/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content })
    });
    if (!res?.ok) return;
    const comment = await res.json();
    input.value = '';
    const list = document.getElementById(`commentsList${postId}`);
    if (list) {
      if (list.querySelector('p')) list.innerHTML = '';
      list.insertAdjacentHTML('beforeend', renderComment(comment, postId));
    }
  } catch {}
}

async function deleteComment(postId, commentId) {
  try {
    const res = await apiFetch(`/api/posts/${postId}/comments/${commentId}`, { method: 'DELETE' });
    if (!res?.ok) return;
    document.getElementById(`comment-${commentId}`)?.remove();
    showToast('Comment deleted', 'success');
  } catch {}
}

async function deleteProfilePost(postId) {
  if (!confirm('Delete this post?')) return;
  try {
    const res = await apiFetch(`/api/posts/${postId}`, { method: 'DELETE' });
    if (!res?.ok) return;
    document.getElementById(`post-${postId}`)?.remove();
    showToast('Post deleted', 'success');
    const stat = document.getElementById('statPosts');
    if (stat) stat.textContent = Math.max(0, parseInt(stat.textContent) - 1);
  } catch {}
}

async function toggleFollow(userId) {
  try {
    const res = await apiFetch(`/api/users/${userId}/follow`, { method: 'POST' });
    if (!res?.ok) return;
    const data = await res.json();
    const btn = document.getElementById('followBtn');
    if (btn) {
      btn.textContent = data.following ? 'Unfollow' : 'Follow';
      btn.className = `btn ${data.following ? 'btn-ghost' : 'btn-primary'}`;
    }
    const stat = document.getElementById('statFollowers');
    if (stat) stat.textContent = parseInt(stat.textContent) + (data.following ? 1 : -1);
    showToast(data.following ? 'Following!' : 'Unfollowed', 'success');
  } catch {}
}

async function openFollowers() {
  document.getElementById('followersModalTitle').textContent = 'Followers';
  openModal('followersModal');
  await loadFollowersList('followers');
}

async function openFollowing() {
  document.getElementById('followersModalTitle').textContent = 'Following';
  openModal('followersModal');
  await loadFollowersList('following');
}

async function loadFollowersList(type) {
  const list = document.getElementById('followersList');
  list.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
  try {
    const res = await apiFetch(`/api/users/${profileUserId}/${type}`);
    if (!res?.ok) throw new Error();
    const users = await res.json();
    if (users.length === 0) {
      list.innerHTML = '<p style="font-size:14px;color:var(--text-muted);text-align:center;padding:20px">No users yet</p>';
      return;
    }
    list.innerHTML = users.map(u => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="window.location.href='/profile?id=${u.id}'">
        ${renderAvatar(u.avatar, u.username, 40)}
        <div>
          <div style="font-weight:600;color:var(--text)">@${u.username}</div>
        </div>
      </div>
    `).join('');
  } catch {
    list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">Failed to load</p>';
  }
}

function openEditProfile() {
  const user = getUser();
  if (!user) return;
  document.getElementById('editUsername').value = user.username || '';
  document.getElementById('editBio').value = user.bio || '';
  openModal('editProfileModal');
}

async function saveProfile() {
  const formData = new FormData();
  formData.append('username', document.getElementById('editUsername').value);
  formData.append('bio', document.getElementById('editBio').value);
  const avatar = document.getElementById('editAvatar').files[0];
  if (avatar) formData.append('avatar', avatar);

  const errEl = document.getElementById('editProfileError');
  errEl.style.display = 'none';
  const saveBtn = document.querySelector('#editProfileModal .btn-primary');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

  try {
    const res = await apiFetch('/api/users/me', { method: 'PUT', body: formData });
    if (!res?.ok) {
      const d = await res.json();
      throw new Error(d.error);
    }
    const updated = await res.json();
    const stored = getUser();
    localStorage.setItem('user', JSON.stringify({ ...stored, ...updated }));

    // Instantly update visible profile avatar without waiting for loadProfile
    if (updated.avatar) {
      const profileAvatarEl = document.getElementById('profileAvatar');
      if (profileAvatarEl) { profileAvatarEl.src = `${updated.avatar}?t=${Date.now()}`; profileAvatarEl.style.display = 'block'; }
    }

    closeModal('editProfileModal');
    showToast('Profile updated!', 'success');
    loadProfile();
    await initSidebar();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
  }
}

function switchProfileTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadUserPosts();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}
