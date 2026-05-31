/* ===== FEED PAGE ===== */

let feedPage = 1;
let explorePage = 1;
let feedLoading = false;
let currentView = 'feed';
let selectedMediaFile = null;

const isGuest = !getToken() && (new URLSearchParams(location.search).get('guest') === '1' || !getToken());

(async function init() {
  if (!getToken()) {
    // Guest mode — allow browse-only access
    initGuestSidebar();
    switchView('explore');
    const banner = document.getElementById('guestBanner');
    if (banner) banner.style.display = 'block';
    loadExplore();
    setupInfiniteScroll();
    // Hide create-post UI
    const createCard = document.getElementById('inlinCreatePost');
    if (createCard) createCard.style.display = 'none';
    return;
  }
  await initSidebar();
  loadFeed();
  loadSuggestedUsers();
  setupInfiniteScroll();

  const createAvatar = document.getElementById('createPostAvatar');
  const modalAvatar = document.getElementById('modalPostAvatar');
  const user = getUser();
  if (user?.avatar) {
    createAvatar.src = user.avatar;
    modalAvatar.src = user.avatar;
  }
})();

function initGuestSidebar() {
  const usernameEl = document.getElementById('sidebarUsername');
  const roleEl = document.getElementById('sidebarRole');
  const avatarEl = document.getElementById('sidebarAvatar');
  const fallbackEl = document.getElementById('sidebarAvatarFallback');
  if (usernameEl) usernameEl.textContent = 'Guest';
  if (roleEl) roleEl.textContent = 'Browsing';
  if (avatarEl) avatarEl.style.display = 'none';
  if (fallbackEl) { fallbackEl.style.display = 'flex'; fallbackEl.textContent = '?'; }

  // Replace sidebar bottom actions with sign in/up buttons
  const logoutBtn = document.querySelector('.sidebar-footer');
  if (logoutBtn) {
    logoutBtn.innerHTML = `
      <a href="/" class="btn btn-primary btn-full" style="margin-bottom:8px">Sign In</a>
      <a href="/?tab=register" class="btn btn-ghost btn-full" style="border:1.5px solid var(--border)">Create Account</a>`;
  }

  // Hide nav links that require auth
  const profileLink = document.getElementById('profileNavLink');
  if (profileLink) profileLink.style.display = 'none';
  const adminLink = document.getElementById('adminNavLink');
  if (adminLink) adminLink.style.display = 'none';
}

function requireAuth() {
  openModal('guestModal');
  return true;
}

function switchView(view) {
  currentView = view;
  document.getElementById('feedView').style.display = view === 'feed' ? 'block' : 'none';
  document.getElementById('exploreView').style.display = view === 'explore' ? 'block' : 'none';
  document.getElementById('pageTitle').textContent = view === 'feed' ? 'Feed' : 'Explore';

  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  if (view === 'feed') document.querySelectorAll('.nav-link')[0].classList.add('active');
  if (view === 'explore') document.querySelectorAll('.nav-link')[1].classList.add('active');

  if (view === 'explore' && !document.getElementById('exploreGrid').innerHTML) loadExplore();
}

async function loadFeed(append = false) {
  if (feedLoading) return;
  feedLoading = true;
  const loader = document.getElementById('feedLoader');
  loader.style.display = 'flex';

  try {
    const res = await apiFetch(`/api/posts/feed?page=${feedPage}`);
    if (!res?.ok) throw new Error();
    const posts = await res.json();

    if (posts.length === 0) {
      loader.style.display = 'none';
      if (!append) {
        document.getElementById('feedPosts').innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">🌟</div>
            <h3>Your feed is empty</h3>
            <p>Follow some people or create a post to get started!</p>
          </div>`;
      }
      return;
    }

    const container = document.getElementById('feedPosts');
    if (!append) container.innerHTML = '';
    posts.forEach(p => container.insertAdjacentHTML('beforeend', renderPost(p)));
    feedPage++;
  } catch {
    showToast('Failed to load feed', 'error');
  } finally {
    feedLoading = false;
    loader.style.display = 'none';
  }
}

async function loadExplore(append = false) {
  const loader = document.getElementById('exploreLoader');
  loader.style.display = 'flex';
  try {
    const res = await apiFetch(`/api/posts/explore?page=${explorePage}`);
    if (!res?.ok) throw new Error();
    const posts = await res.json();
    const grid = document.getElementById('exploreGrid');
    if (!append) grid.innerHTML = '';

    if (posts.length === 0 && !append) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🔍</div><h3>Nothing to explore yet</h3></div>';
      return;
    }

    posts.forEach(p => {
      const item = document.createElement('div');
      item.className = 'explore-item';
      item.onclick = () => openPostDetail(p.id);
      if (p.media_url) {
        if (p.media_type === 'video') {
          item.innerHTML = `<video src="${p.media_url}" muted style="width:100%;height:100%;object-fit:cover"></video>`;
        } else {
          item.innerHTML = `<img src="${p.media_url}" alt="post" loading="lazy" />`;
        }
      } else {
        item.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:16px;background:var(--bg-card);font-size:13px;color:var(--text-secondary);text-align:center">${p.content.slice(0,80)}</div>`;
      }
      item.insertAdjacentHTML('beforeend', `
        <div class="explore-overlay">
          <span>❤️ ${p.likes_count}</span>
          <span>💬 ${p.comments_count}</span>
        </div>`);
      grid.appendChild(item);
    });
    explorePage++;
  } catch {
    showToast('Failed to load explore', 'error');
  } finally {
    loader.style.display = 'none';
  }
}

async function loadSuggestedUsers() {
  try {
    const res = await apiFetch('/api/posts/explore?page=1');
    const postsRes = await res?.json();
    const userIds = [...new Set((postsRes || []).map(p => p.user_id))].slice(0, 5);

    const myId = getUser()?.id;
    const container = document.getElementById('suggestedUsers');

    if (userIds.length === 0) {
      container.innerHTML = '<p style="font-size:13px;color:var(--text-muted);padding:8px 0">No suggestions yet</p>';
      return;
    }

    const users = await Promise.all(userIds.filter(id => id !== myId).slice(0,5).map(async id => {
      const r = await apiFetch(`/api/users/${id}`);
      return r?.ok ? r.json() : null;
    }));

    container.innerHTML = users.filter(Boolean).map(u => `
      <div class="suggest-user">
        <div onclick="window.location.href='/profile?id=${u.id}'" style="cursor:pointer;display:flex;align-items:center;gap:10px;flex:1;min-width:0">
          ${renderAvatar(u.avatar, u.username, 36)}
          <div class="user-info" style="min-width:0">
            <div class="user-name" style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">@${u.username}</div>
            <div class="user-followers" style="font-size:11px;color:var(--text-muted)">${u.followers_count} followers</div>
          </div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="toggleFollow(${u.id}, this)" id="followBtn${u.id}">
          ${u.is_following ? 'Unfollow' : 'Follow'}
        </button>
      </div>
    `).join('');
  } catch {}
}

function renderPost(post) {
  const user = getUser();
  const isOwn = post.user_id === user?.id;
  const mediaHtml = post.media_url ? (
    post.media_type === 'video'
      ? `<video class="post-media" src="${post.media_url}" controls preload="metadata"></video>`
      : `<img class="post-media" src="${post.media_url}" alt="post media" loading="lazy" />`
  ) : '';

  return `
    <div class="post-card" id="post-${post.id}">
      <div class="post-header">
        <div style="display:flex;align-items:center;gap:8px;cursor:pointer" onclick="window.location.href='/profile?id=${post.user_id}'">
          ${renderAvatar(post.avatar, post.username, 40)}
        </div>
        <div class="post-meta" style="cursor:pointer" onclick="window.location.href='/profile?id=${post.user_id}'">
          <div class="post-username">@${post.username}</div>
          <div class="post-time">${timeAgo(post.created_at)}</div>
        </div>
        ${isOwn ? `<button class="post-menu" onclick="deletePost(${post.id})">🗑️</button>` : ''}
      </div>
      ${post.content ? `<div class="post-content">${escapeHtml(post.content)}</div>` : ''}
      ${mediaHtml}
      <div class="post-actions">
        <button class="action-btn ${post.liked ? 'liked' : ''}" onclick="${isGuest ? 'requireAuth()' : `toggleLike(${post.id}, this)`}" id="likeBtn${post.id}">
          <svg width="18" height="18" fill="${post.liked ? 'var(--primary)' : 'none'}" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          <span id="likeCount${post.id}">${post.likes_count}</span>
        </button>
        <button class="action-btn" onclick="${isGuest ? 'requireAuth()' : `toggleComments(${post.id})`}">
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
    const countEl = document.getElementById(`likeCount${postId}`);
    if (countEl) countEl.textContent = data.likes_count;
    const svg = btn.querySelector('svg');
    if (data.liked) {
      btn.classList.add('liked');
      if (svg) svg.setAttribute('fill', 'var(--primary)');
    } else {
      btn.classList.remove('liked');
      if (svg) svg.setAttribute('fill', 'none');
    }
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
        ${renderAvatar(user?.avatar, user?.username, 32, 'comment-avatar')}
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
    const countBtns = document.querySelectorAll(`#post-${postId} .action-btn:nth-child(2) span`);
    countBtns.forEach(el => el.textContent = parseInt(el.textContent || '0') + 1);
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

async function deletePost(postId) {
  if (!confirm('Delete this post?')) return;
  try {
    const res = await apiFetch(`/api/posts/${postId}`, { method: 'DELETE' });
    if (!res?.ok) return;
    document.getElementById(`post-${postId}`)?.remove();
    showToast('Post deleted', 'success');
  } catch {}
}

async function toggleFollow(userId, btn) {
  btn.disabled = true;
  try {
    const res = await apiFetch(`/api/users/${userId}/follow`, { method: 'POST' });
    if (!res?.ok) return;
    const data = await res.json();
    btn.textContent = data.following ? 'Unfollow' : 'Follow';
    btn.className = `btn ${data.following ? 'btn-ghost' : 'btn-outline'} btn-sm`;
    showToast(data.following ? 'Following!' : 'Unfollowed', 'success');
    // Reload feed so newly followed user's posts appear
    if (data.following) {
      feedPage = 1;
      loadFeed(false);
    }
  } catch {} finally {
    btn.disabled = false;
  }
}

function openCreatePost() {
  if (isGuest) { requireAuth(); return; }
  openModal('createPostModal');
}

function previewMedia(input, previewId) {
  const file = input.files[0];
  if (!file) return;
  selectedMediaFile = file;

  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    showToast('File too large! Max 50MB for videos.', 'error');
    input.value = '';
    return;
  }

  const preview = document.getElementById(previewId);
  const url = URL.createObjectURL(file);
  preview.style.display = 'block';

  if (file.type.startsWith('video')) {
    preview.innerHTML = `<video src="${url}" controls style="width:100%;max-height:250px;border-radius:10px"></video><button class="remove-media" onclick="clearMedia('${previewId}','${input.id}')">✕</button>`;
  } else {
    preview.innerHTML = `<img src="${url}" style="width:100%;max-height:250px;object-fit:cover;border-radius:10px" /><button class="remove-media" onclick="clearMedia('${previewId}','${input.id}')">✕</button>`;
  }
}

function clearMedia(previewId, inputId) {
  document.getElementById(previewId).style.display = 'none';
  document.getElementById(previewId).innerHTML = '';
  document.getElementById(inputId).value = '';
  selectedMediaFile = null;
}

async function createPost() {
  const content = document.getElementById('postContent').value.trim();
  const mediaInput = document.getElementById('postMedia');
  const errEl = document.getElementById('postError');
  errEl.style.display = 'none';

  if (!content && !mediaInput.files[0]) {
    errEl.textContent = 'Please add some text or media';
    errEl.style.display = 'block';
    return;
  }

  const formData = new FormData();
  if (content) formData.append('content', content);
  if (mediaInput.files[0]) formData.append('media', mediaInput.files[0]);

  const postBtn = document.querySelector('#createPostModal .btn-primary');
  if (postBtn) { postBtn.disabled = true; postBtn.textContent = 'Posting...'; }

  try {
    const res = await apiFetch('/api/posts', { method: 'POST', body: formData });
    if (!res?.ok) {
      const data = await res.json();
      throw new Error(data.error);
    }
    const post = await res.json();
    document.getElementById('postContent').value = '';
    clearMedia('mediaPreview', 'postMedia');
    closeModal('createPostModal');
    document.getElementById('feedPosts').insertAdjacentHTML('afterbegin', renderPost(post));
    showToast('Post created!', 'success');
  } catch (err) {
    errEl.textContent = err.message || 'Failed to create post';
    errEl.style.display = 'block';
  } finally {
    if (postBtn) { postBtn.disabled = false; postBtn.textContent = 'Post'; }
  }
}

async function quickPost() {
  if (isGuest) { requireAuth(); return; }
  const content = document.getElementById('quickPostContent').value.trim();
  const mediaInput = document.getElementById('quickPostMedia');

  if (!content && !mediaInput.files[0]) {
    showToast('Please add some text or media', 'error'); return;
  }

  const shareBtn = document.querySelector('#inlinCreatePost .btn-primary');
  if (shareBtn) { shareBtn.disabled = true; shareBtn.textContent = 'Posting...'; }

  const formData = new FormData();
  if (content) formData.append('content', content);
  if (mediaInput.files[0]) formData.append('media', mediaInput.files[0]);

  try {
    const res = await apiFetch('/api/posts', { method: 'POST', body: formData });
    if (!res?.ok) throw new Error('Failed');
    const post = await res.json();
    document.getElementById('quickPostContent').value = '';
    clearMedia('mediaPreviewInline', 'quickPostMedia');
    document.getElementById('feedPosts').insertAdjacentHTML('afterbegin', renderPost(post));
    showToast('Post created!', 'success');
  } catch {
    showToast('Failed to create post', 'error');
  } finally {
    if (shareBtn) { shareBtn.disabled = false; shareBtn.textContent = 'Share'; }
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
    const merged = { ...stored, ...updated };
    localStorage.setItem('user', JSON.stringify(merged));

    // Immediately update all avatar instances on the page
    if (updated.avatar) {
      const ts = `?t=${Date.now()}`;
      ['createPostAvatar', 'modalPostAvatar'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.src = updated.avatar + ts; el.style.display = 'block'; }
      });
    }

    closeModal('editProfileModal');
    showToast('Profile updated!', 'success');
    await initSidebar();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
  }
}

async function openPostDetail(postId) {
  try {
    const res = await apiFetch(`/api/posts/${postId}`);
    if (!res?.ok) return;
    const post = await res.json();
    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.innerHTML = `
      <div class="modal" style="max-width:600px">
        <div class="modal-header">
          <h3>Post</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        ${renderPost(post)}
      </div>`;
    document.body.appendChild(modal);
    loadComments(postId);
    toggleComments(postId);
  } catch {}
}

function setupInfiniteScroll() {
  window.addEventListener('scroll', () => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 400) {
      if (currentView === 'feed') loadFeed(true);
      if (currentView === 'explore') loadExplore(true);
    }
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}
