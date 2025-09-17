// Frontend client for backend-enabled SocialApp
const API_BASE = 'http://localhost:4000/api';
const $ = sel => document.querySelector(sel);
const uid = () => Math.random().toString(36).slice(2,9);

function tokenHeaders(){
  const token = localStorage.getItem('token');
  return token ? { 'Authorization': 'Bearer ' + token } : {};
}

async function api(path, opts = {}){
  const headers = Object.assign({ 'Content-Type':'application/json' }, tokenHeaders(), opts.headers || {});
  const res = await fetch(API_BASE + path, { headers, ...opts });
  if(res.status === 401){ logout(); throw new Error('unauthenticated'); }
  return res.json();
}

// --- UI wiring & rendering ---
async function renderAuth(){
  const area = $('#authArea');
  area.innerHTML = '';
  const token = localStorage.getItem('token');
  if(token){
    // get profile
    try{
      const me = await api('/me');
      const el = document.createElement('div');
      el.innerHTML = `<strong>${me.display}</strong> <button id="logoutBtn" class="btn">Logout</button>`;
      area.appendChild(el);
      $('#logoutBtn').onclick = () => { logout(); renderAll(); };
    }catch(e){
      console.warn(e);
      logout();
      area.innerHTML = `<input id="loginName" placeholder="username" /><input id="loginPass" type="password" placeholder="password" /><button id="loginBtn" class="btn">Login</button>`;
      attachLogin();
    }
  } else {
    area.innerHTML = `<input id="loginName" placeholder="username" /><input id="loginPass" type="password" placeholder="password" /><button id="loginBtn" class="btn">Login</button>`;
    attachLogin();
  }
}

function attachLogin(){
  $('#loginBtn').onclick = async () => {
    const username = $('#loginName').value.trim();
    const password = $('#loginPass').value;
    if(!username || !password) return alert('Enter username+password');
    try{
      const resp = await fetch(API_BASE + '/login', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ username, password })
      });
      const data = await resp.json();
      if(!resp.ok) return alert(data.error || 'Login failed');
      localStorage.setItem('token', data.token);
      renderAll();
    }catch(err){ alert('Login error'); console.error(err); }
  };
}

async function renderProfileCard(){
  const el = $('#profileCard');
  el.innerHTML = '';
  try{
    const me = await api('/me');
    el.innerHTML = `
      <div class="avatar" style="background:${me.avatarColor || '#c7d2fe'}"></div>
      <div class="meta">
        <h4>${me.display}</h4>
        <p>@${me.username} • ${me.following_count || 0} following • ${me.followers_count || 0} followers</p>
        <div style="margin-top:8px"><button id="editProfileBtn" class="btn">Edit profile</button></div>
      </div>`;
    $('#editProfileBtn').onclick = async () => {
      const newName = prompt('Display name', me.display);
      if(newName){
        await api('/me', { method:'PUT', body: JSON.stringify({ display:newName }) });
        renderAll();
      }
    };
  }catch(e){
    el.innerHTML = `<div><strong>Not signed in</strong><p class="muted">Log in or create an account to post and interact.</p></div>`;
  }
}

async function renderSuggestions(){
  const list = $('#suggestList');
  list.innerHTML = '';
  try{
    const data = await api('/users');
    data.users.slice(0,6).forEach(u => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${u.display} <small class="muted">@${u.username}</small></span><button class="btn follow-sugg" data-user="${u.username}">Follow</button>`;
      list.appendChild(li);
      li.querySelector('.follow-sugg').onclick = async (e) => {
        try{
          await api(`/users/${u.username}/follow`, { method:'POST' });
          renderAll();
        }catch(err){ alert('Action failed'); }
      };
    });
  }catch(e){ /* ignore when unauthenticated */ }
}

async function renderTrending(){
  const el = $('#trendingList');
  el.innerHTML = '';
  try{
    const data = await api('/posts?trending=1');
    data.posts.slice(0,5).forEach(p => {
      const li = document.createElement('li');
      li.textContent = `${p.display}: ${p.text.slice(0,50)}${p.text.length>50?'…':''}`;
      el.appendChild(li);
    });
  }catch(e){ el.innerHTML = '<li>—</li>'; }
}

async function renderFeed(q=''){
  const feed = $('#feedList');
  feed.innerHTML = '<div class="card">Loading feed…</div>';
  try{
    const qParam = q ? `?q=${encodeURIComponent(q)}` : '';
    const data = await api('/posts' + qParam);
    feed.innerHTML = '';
    if(!data.posts.length) feed.innerHTML = '<div class="card">No posts yet — be the first!</div>';
    data.posts.forEach(p => {
      const tpl = document.getElementById('postTemplate').content.cloneNode(true);
      tpl.querySelector('.avatar').style.background = p.avatarColor || '#c7d2fe';
      tpl.querySelector('.display').textContent = p.display || p.author;
      tpl.querySelector('.username').textContent = '@' + p.author;
      tpl.querySelector('.text').textContent = p.text;
      const imgEl = tpl.querySelector('.photo');
      if(p.image) { imgEl.src = p.image; imgEl.style.display = 'block'; } else imgEl.style.display = 'none';
      tpl.querySelector('.like-count').textContent = p.likes_count;
      tpl.querySelector('.comment-count').textContent = p.comments_count;

      tpl.querySelector('.like').onclick = async () => {
        try{ await api(`/posts/${p.id}/like`, { method:'POST' }); renderAll(); }catch(e){ alert('Login to like'); }
      };

      const followBtn = tpl.querySelector('.follow');
      try{
        const me = await api('/me');
        if(me.username === p.author) followBtn.style.display = 'none';
        else {
          followBtn.textContent = p.following ? 'Unfollow' : 'Follow';
          followBtn.onclick = async () => { await api(`/users/${p.author}/follow`, { method:'POST' }); renderAll(); };
        }
      }catch(e){ followBtn.style.display = 'none'; }

      const commentToggle = tpl.querySelector('.comment-toggle');
      const commentsWrap = tpl.querySelector('.comments');
      commentToggle.onclick = () => commentsWrap.style.display = commentsWrap.style.display === 'none' ? 'block' : 'none';

      const commentList = tpl.querySelector('.comment-list');
      if(p.comments && p.comments.length){
        p.comments.forEach(c => {
          const div = document.createElement('div');
          div.className = 'comment';
          div.innerHTML = `<div class="who">${c.by}</div><div class="what">${c.text}</div><div class="muted" style="font-size:12px">${new Date(c.at).toLocaleString()}</div>`;
          commentList.appendChild(div);
        });
      }

      tpl.querySelector('.comment-btn').onclick = async () => {
        const input = tpl.querySelector('.comment-input');
        const txt = input.value.trim();
        if(!txt) return;
        try{
          await api(`/posts/${p.id}/comment`, { method:'POST', body: JSON.stringify({ text: txt }) });
          renderAll();
        }catch(e){ alert('Login to comment'); }
      };

      feed.appendChild(tpl);
    });
  }catch(e){ feed.innerHTML = '<div class="card">Failed to load feed</div>'; }
}

async function renderDMs(){
  const el = $('#dmList');
  el.innerHTML = '';
  try{
    const data = await api('/messages');
    data.threads.slice(0,6).forEach(t => {
      const div = document.createElement('div');
      div.innerHTML = `<strong>${t.with}</strong><div class="muted">${t.last_text || '—'}</div>`;
      el.appendChild(div);
      div.onclick = async () => {
        const msg = prompt(`Send message to ${t.with}`);
        if(msg) await api('/messages', { method:'POST', body: JSON.stringify({ to: t.with, text: msg }) });
        renderAll();
      };
    });
  }catch(e){ el.innerHTML = '<div class="muted">Log in to use messages</div>'; }
}

async function renderNotifs(){
  const el = $('#notifList');
  el.innerHTML = '';
  try{
    const data = await api('/notifications');
    data.notifications.slice(0,10).forEach(n => {
      const li = document.createElement('li');
      li.textContent = `${n.text} • ${new Date(n.at).toLocaleString()}`;
      el.appendChild(li);
    });
  }catch(e){ el.innerHTML = '<li class="muted">Login to view notifications</li>'; }
}

// --- Actions ---
async function createPost(){
  const text = $('#postText').value.trim();
  const image = $('#postImage').value.trim();
  if(!text && !image) return alert('Enter text or image url');
  try{
    await api('/posts', { method:'POST', body: JSON.stringify({ text, image }) });
    $('#postText').value=''; $('#postImage').value='';
    renderAll();
  }catch(e){ alert('Login to post'); }
}

function logout(){ localStorage.removeItem('token'); }

// --- event wiring ---
$('#postBtn').onclick = createPost;
$('#clearBtn').onclick = () => { $('#postText').value=''; $('#postImage').value=''; };
$('#createUserBtn').onclick = async () => {
  const username = $('#newUserName').value.trim();
  const display = $('#newDisplayName').value.trim();
  const password = $('#newPassword').value;
  if(!username || !password) return alert('username + password required');
  try{
    const resp = await fetch(API_BASE + '/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, password, display })});
    const data = await resp.json();
    if(!resp.ok) return alert(data.error || 'Create failed');
    localStorage.setItem('token', data.token);
    $('#newUserName').value=''; $('#newDisplayName').value=''; $('#newPassword').value='';
    renderAll();
  }catch(err){ alert('Register failed'); }
};

$('#searchInput').addEventListener('input', e => renderFeed(e.target.value.trim()));

async function renderAll(){
  await renderAuth();
  await renderProfileCard();
  await renderSuggestions();
  await renderTrending();
  await renderFeed($('#searchInput').value.trim());
  await renderDMs();
  await renderNotifs();
}

// initial
renderAll().catch(e=>console.error(e));
