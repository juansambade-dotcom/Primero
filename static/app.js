let csrfToken = null;

const jsonReq = async (url, method = 'GET', body = null) => {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.headers.get('x-csrf-token')) csrfToken = res.headers.get('x-csrf-token');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'request_failed');
  return data;
};

const mountAuth = () => {
  const form = document.querySelector('#authForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const msg = document.querySelector('#formMsg');
    msg.textContent = 'Working...';
    try {
      await jsonReq(form.dataset.action, 'POST', Object.fromEntries(fd.entries()));
      location.href = '/';
    } catch (err) {
      msg.textContent = err.message.replaceAll('_', ' ');
    }
  });
};

const renderNotes = (notes) => {
  const root = document.querySelector('#notes');
  if (!root) return;
  root.innerHTML = '';
  notes.forEach((n) => {
    const el = document.createElement('article');
    el.className = `note ${n.priority}`;
    el.innerHTML = `
      <h3>${n.title}</h3>
      <p>${n.content}</p>
      <small>${n.priority.toUpperCase()} · ${new Date(n.updated_at).toLocaleString()}</small>
      <div class='actions'>
        <button data-id='${n.id}' class='ghost deleteBtn'>Delete</button>
      </div>
    `;
    root.appendChild(el);
  });
  document.querySelectorAll('.deleteBtn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await jsonReq(`/api/notes/${btn.dataset.id}`, 'DELETE');
      await loadNotes();
    });
  });
};

const loadNotes = async () => {
  const data = await jsonReq('/api/notes');
  renderNotes(data.notes || []);
};

const mountDashboard = () => {
  const form = document.querySelector('#noteForm');
  if (!form) return;
  csrfToken = document.querySelector('meta[name=csrf]')?.content || csrfToken;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    await jsonReq('/api/notes', 'POST', Object.fromEntries(fd.entries()));
    form.reset();
    await loadNotes();
  });
  loadNotes().catch(() => {});
  const logoutBtn = document.querySelector('#logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await jsonReq('/api/auth/logout', 'POST');
      location.href = '/';
    });
  }
};

mountAuth();
mountDashboard();
