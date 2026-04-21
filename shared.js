// ============ SHARED ACROSS PAGES ============

const API_URL = 'https://script.google.com/macros/s/AKfycbxwiuJ_YF5pZeDXX-KgzQujF5Ymtt-T7kIFV6zGnxzL-0LW4n2GOPFvYl56N8YpftAbhA/exec';
const IDENTITY_KEY = 'trip:identity';

// ============ IDENTITY ============
function getIdentity() {
  const params = new URLSearchParams(window.location.search);
  const urlWho = (params.get('who') || '').toUpperCase();
  if (urlWho === 'M' || urlWho === 'L') {
    try { localStorage.setItem(IDENTITY_KEY, urlWho); } catch(e) {}
    return urlWho;
  }
  try {
    const stored = localStorage.getItem(IDENTITY_KEY);
    if (stored === 'M' || stored === 'L') return stored;
  } catch(e) {}
  return null;
}

function setIdentity(who) {
  try { localStorage.setItem(IDENTITY_KEY, who); } catch(e) {}
  window.__identity = who;
  updateIdentityChip();
  if (typeof onIdentityChange === 'function') onIdentityChange(who);
}

function askIdentity() {
  const container = document.getElementById('modal-container');
  if (!container) return;
  container.innerHTML = `
    <div class="modal-bg">
      <div class="modal">
        <h2>Who are you?</h2>
        <p>Pick once, I'll remember. Tap the badge anytime to change.</p>
        <div class="modal-choices">
          <button class="choice-btn m" data-pick="M">M</button>
          <button class="choice-btn l" data-pick="L">L</button>
        </div>
      </div>
    </div>
  `;
  container.querySelectorAll('[data-pick]').forEach(btn => {
    btn.onclick = () => {
      setIdentity(btn.dataset.pick);
      container.innerHTML = '';
    };
  });
}

function updateIdentityChip() {
  const chip = document.getElementById('identity-chip');
  if (!chip) return;
  const me = window.__identity;
  chip.textContent = me ? me : '?';
  chip.className = 'identity-chip' + (me ? ' ' + me.toLowerCase() : '');
}

// ============ HEADER + DRAWER ============
function renderHeader({ title, subtitle, page }) {
  // Inject header into body
  const header = document.querySelector('.header');
  if (!header) return;
  header.innerHTML = `
    <div class="header-row">
      <a href="index.html" class="logo" title="Home">
        <svg viewBox="0 0 44 44" fill="none">
          <circle cx="14" cy="14" r="10" fill="#e03a2c" stroke="#1a1816" stroke-width="1.5"/>
          <rect x="20" y="20" width="20" height="20" rx="3" fill="#2e5cd4" stroke="#1a1816" stroke-width="1.5"/>
          <circle cx="30" cy="14" r="6" fill="#e8b93f" stroke="#1a1816" stroke-width="1.5"/>
        </svg>
      </a>
      <div class="title-block">
        <h1 class="title">${title}</h1>
        <p class="sub" id="page-sub">${subtitle || ''}</p>
      </div>
      <button class="identity-chip" id="identity-chip" title="Change identity">?</button>
      <button class="burger-btn" id="burger-btn" aria-label="Menu">
        <span></span><span></span><span></span>
      </button>
    </div>
  `;
  updateIdentityChip();

  const chip = document.getElementById('identity-chip');
  if (chip) chip.onclick = askIdentity;

  const burger = document.getElementById('burger-btn');
  if (burger) burger.onclick = () => openDrawer(page);
}

function openDrawer(currentPage) {
  let drawer = document.getElementById('drawer-container');
  if (!drawer) {
    drawer = document.createElement('div');
    drawer.id = 'drawer-container';
    document.body.appendChild(drawer);
  }
  const params = new URLSearchParams(window.location.search);
  const suffix = params.get('who') ? '?who=' + params.get('who') : '';
  drawer.innerHTML = `
    <div class="drawer-bg open" id="drawer-bg"></div>
    <div class="drawer open" id="drawer">
      <div class="drawer-header">
        <h3 class="drawer-title">Menu</h3>
        <button class="drawer-close" id="drawer-close">×</button>
      </div>
      <a href="trip_expenses.html${suffix}" class="drawer-link ${currentPage === 'expenses' ? 'active' : ''}">
        <span class="drawer-link-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 9.5h5a2 2 0 0 1 0 4H10a2 2 0 0 0 0 4h5"/></svg>
        </span>
        <span class="drawer-link-text">
          Expenses
          <div class="drawer-link-sub">money tracker</div>
        </span>
      </a>
      <a href="plan.html${suffix}" class="drawer-link ${currentPage === 'plan' ? 'active' : ''}">
        <span class="drawer-link-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
        </span>
        <span class="drawer-link-text">
          Plan
          <div class="drawer-link-sub">places & hotels</div>
        </span>
      </a>
      <a href="index.html${suffix}" class="drawer-link">
        <span class="drawer-link-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l9-9 9 9"/><path d="M5 10v10h14V10"/></svg>
        </span>
        <span class="drawer-link-text">
          Home
          <div class="drawer-link-sub">back to landing</div>
        </span>
      </a>
    </div>
  `;
  const close = () => {
    drawer.querySelector('.drawer-bg').classList.remove('open');
    drawer.querySelector('.drawer').classList.remove('open');
    setTimeout(() => { drawer.innerHTML = ''; }, 250);
  };
  document.getElementById('drawer-close').onclick = close;
  document.getElementById('drawer-bg').onclick = close;
}

// ============ API ============
async function apiGet() {
  const res = await fetch(API_URL + '?action=getAll');
  return res.json();
}

async function apiPost(action, payload) {
  const res = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({ action, ...payload }),
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }
  });
  return res.json();
}

// ============ UTILS ============
function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  return dt.toISOString().slice(0, 10);
}

function showToast(msg, isError) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => t.className = 'toast' + (isError ? ' error' : ''), 2200);
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function prettyDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function prettyDateLong(iso) {
  if (!iso) return 'Unscheduled';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

async function copyToClipboard(text, btn) {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = 'Copied';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1500);
    }
  } catch (e) {
    showToast('Copy failed', true);
  }
}

// ============ INIT ON LOAD ============
window.__identity = getIdentity();
