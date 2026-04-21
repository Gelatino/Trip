// ============ TRIP EXPENSES PAGE ============

const state = {
  rate: 8.03,
  expenses: [],
  settlements: [],
  tab: 'add',
  loading: true,
  form: { date: new Date().toISOString().slice(0, 10), who: window.__identity || 'M', category: 'Food', desc: '', amount: '', currency: 'RMB' },
  settleForm: { date: new Date().toISOString().slice(0, 10), from: 'L', amount: '', currency: 'EUR', note: '' }
};

const CATEGORIES = ['Food', 'Hotel', 'Train', 'Taxi', 'Shop', 'Ticket', 'Drinks', 'Other'];

function onIdentityChange(who) {
  state.form.who = who;
  render();
}

async function refresh() {
  try {
    const data = await apiGet();
    state.rate = data.rate || 8.03;
    state.expenses = (data.expenses || []).map(e => ({
      ...e, amount: parseFloat(e.amount),
      date: typeof e.date === 'string' ? e.date.slice(0,10) : formatDate(e.date)
    }));
    state.settlements = (data.settlements || []).map(s => ({
      ...s, amount: parseFloat(s.amount),
      date: typeof s.date === 'string' ? s.date.slice(0,10) : formatDate(s.date)
    }));
    state.loading = false;
    render();
  } catch (e) {
    showToast('Could not load', true);
    state.loading = false;
    render();
  }
}

// MATH
function toEUR(amount, currency) {
  const n = parseFloat(amount);
  if (isNaN(n)) return 0;
  return currency === 'RMB' ? n / state.rate : n;
}

function computeBalance() {
  let Mpaid = 0, Lpaid = 0, totalEUR = 0, totalRMB = 0;
  state.expenses.forEach(ex => {
    const eur = toEUR(ex.amount, ex.currency);
    const rmb = ex.currency === 'RMB' ? parseFloat(ex.amount) : eur * state.rate;
    totalEUR += eur; totalRMB += rmb;
    if (ex.who === 'M') Mpaid += eur; else Lpaid += eur;
  });
  let MtoLSettled = 0, LtoMSettled = 0;
  state.settlements.forEach(s => {
    const eur = toEUR(s.amount, s.currency);
    if (s.from === 'M') MtoLSettled += eur; else LtoMSettled += eur;
  });
  const halfTotal = totalEUR / 2;
  const net = (Mpaid - halfTotal) - LtoMSettled + MtoLSettled;
  return { net, totalEUR, totalRMB, Mpaid, Lpaid };
}

function fmtEUR(n) { return '€' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtRMB(n) { return '¥' + Math.abs(Math.round(n)).toLocaleString('en-US'); }

// RENDER
function render() {
  renderHeader({
    title: 'Expenses',
    subtitle: `${state.expenses.length} ${state.expenses.length === 1 ? 'entry' : 'entries'} · rate ${state.rate}`,
    page: 'expenses'
  });

  const app = document.getElementById('app');
  if (state.loading) { app.innerHTML = '<div class="loading">Loading from the sheet...</div>'; return; }
  const bal = computeBalance();
  app.innerHTML = renderBalance(bal) + renderStats(bal) + renderTabs() + renderTabContent();
  attachHandlers();
}

function renderBalance(bal) {
  const rounded = Math.round(bal.net * 100) / 100;
  let cls, label, who;
  if (Math.abs(rounded) < 0.01) { cls = 'settled'; label = 'ALL SETTLED'; who = 'you are even'; }
  else if (rounded > 0) { cls = 'red-side'; label = 'L OWES M'; who = 'settle up when ready'; }
  else { cls = 'blue-side'; label = 'M OWES L'; who = 'settle up when ready'; }
  const rmb = Math.abs(rounded) * state.rate;
  return `
    <div class="balance-section">
      <div class="balance-card ${cls}">
        <div class="shape-a"></div><div class="shape-b"></div><div class="shape-c"></div>
        <p class="balance-label">${label}</p>
        <p class="balance-amount">${Math.abs(rounded) < 0.01 ? '€0.00' : fmtEUR(rounded)}</p>
        <p class="balance-who">${who}</p>
        ${Math.abs(rounded) >= 0.01 ? `<p class="balance-rmb">≈ ${fmtRMB(rmb)}</p>` : ''}
      </div>
    </div>
  `;
}

function renderStats(bal) {
  return `
    <div class="stats">
      <div class="stat"><p class="stat-label">Total / EUR</p><p class="stat-value">${fmtEUR(bal.totalEUR)}</p></div>
      <div class="stat"><p class="stat-label">Total / RMB</p><p class="stat-value">${fmtRMB(bal.totalRMB)}</p></div>
      <div class="stat"><p class="stat-label">M paid</p><p class="stat-value">${fmtEUR(bal.Mpaid)}</p></div>
      <div class="stat"><p class="stat-label">L paid</p><p class="stat-value">${fmtEUR(bal.Lpaid)}</p></div>
    </div>
  `;
}

function renderTabs() {
  const tabs = [
    { id: 'add', label: 'Add' },
    { id: 'history', label: 'Log' },
    { id: 'settle', label: 'Settle' },
    { id: 'config', label: 'Set' }
  ];
  return `
    <div class="tabs">
      ${tabs.map(t => `<button class="tab ${state.tab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
    </div>
  `;
}

function renderTabContent() {
  if (state.tab === 'add') return renderAddTab();
  if (state.tab === 'history') return renderHistoryTab();
  if (state.tab === 'settle') return renderSettleTab();
  if (state.tab === 'config') return renderConfigTab();
  return '';
}

function renderAddTab() {
  const f = state.form;
  return `
    <div class="content">
      <div class="form-card">
        <div class="field">
          <label class="field-label">Who paid</label>
          <div class="toggle-group">
            <button class="toggle-btn red ${f.who === 'M' ? 'active' : ''}" data-who="M">M</button>
            <button class="toggle-btn blue ${f.who === 'L' ? 'active' : ''}" data-who="L">L</button>
          </div>
        </div>
        <div class="field">
          <label class="field-label">Amount</label>
          <div class="amount-row">
            <input type="number" inputmode="decimal" step="0.01" id="f-amount" placeholder="0.00" value="${f.amount}">
            <div class="currency-toggle">
              <button class="currency-btn ${f.currency === 'RMB' ? 'active' : ''}" data-cur="RMB">¥</button>
              <button class="currency-btn ${f.currency === 'EUR' ? 'active' : ''}" data-cur="EUR">€</button>
            </div>
          </div>
        </div>
        <div class="field">
          <label class="field-label">Category</label>
          <div class="cat-grid">
            ${CATEGORIES.map(c => `<button class="cat-btn ${f.category === c ? 'active' : ''}" data-cat="${c}">${c}</button>`).join('')}
          </div>
        </div>
        <div class="field">
          <label class="field-label">Description</label>
          <input type="text" id="f-desc" placeholder="noodles, taxi, whatever..." value="${escapeHtml(f.desc)}">
        </div>
        <div class="field">
          <label class="field-label">Date</label>
          <input type="date" id="f-date" value="${f.date}">
        </div>
        <button class="primary-btn" id="submit-expense">Add expense</button>
      </div>
    </div>
  `;
}

function renderHistoryTab() {
  if (state.expenses.length === 0) {
    return `<div class="content"><div class="empty"><div class="empty-icon"></div><div class="empty-text">nothing logged yet</div></div></div>`;
  }
  const sorted = [...state.expenses].sort((a, b) => b.date.localeCompare(a.date));
  const byDate = {};
  sorted.forEach(ex => { if (!byDate[ex.date]) byDate[ex.date] = []; byDate[ex.date].push(ex); });
  const groups = Object.keys(byDate).sort().reverse();
  return `
    <div class="content">
      ${groups.map(date => `
        <div class="day-group">
          <p class="day-header">${prettyDate(date)}</p>
          ${byDate[date].map(ex => renderEntry(ex)).join('')}
        </div>
      `).join('')}
    </div>
  `;
}

function renderEntry(ex) {
  const eur = toEUR(ex.amount, ex.currency);
  const displayAmount = ex.currency === 'RMB' ? fmtRMB(ex.amount) : fmtEUR(ex.amount);
  const sub = ex.currency === 'RMB' ? fmtEUR(eur) : fmtRMB(eur * state.rate);
  return `
    <div class="entry">
      <div class="entry-avatar ${ex.who.toLowerCase()}">${ex.who}</div>
      <div class="entry-main">
        <p class="entry-desc">${escapeHtml(ex.desc || ex.category)}</p>
        <p class="entry-meta">${ex.category}</p>
      </div>
      <div class="entry-right">
        <p class="entry-amount">${displayAmount}</p>
        <p class="entry-sub">${sub}</p>
      </div>
      <button class="del-btn" data-del-exp="${ex.id}" title="Delete">×</button>
    </div>
  `;
}

function renderSettleTab() {
  const f = state.settleForm;
  const bal = computeBalance();
  const rounded = Math.round(bal.net * 100) / 100;
  let suggestion = '';
  if (Math.abs(rounded) >= 0.01) {
    const from = rounded > 0 ? 'L' : 'M';
    suggestion = `<div class="suggestion-banner">${from} pays <strong>${fmtEUR(rounded)}</strong> to settle up</div>`;
  }
  return `
    <div class="content">
      ${suggestion}
      <div class="form-card">
        <div class="field">
          <label class="field-label">Direction</label>
          <div class="toggle-group">
            <button class="toggle-btn red ${f.from === 'M' ? 'active' : ''}" data-sfrom="M">M → L</button>
            <button class="toggle-btn blue ${f.from === 'L' ? 'active' : ''}" data-sfrom="L">L → M</button>
          </div>
        </div>
        <div class="field">
          <label class="field-label">Amount</label>
          <div class="amount-row">
            <input type="number" inputmode="decimal" step="0.01" id="s-amount" placeholder="0.00" value="${f.amount}">
            <div class="currency-toggle">
              <button class="currency-btn ${f.currency === 'EUR' ? 'active' : ''}" data-scur="EUR">€</button>
              <button class="currency-btn ${f.currency === 'RMB' ? 'active' : ''}" data-scur="RMB">¥</button>
            </div>
          </div>
        </div>
        <div class="field">
          <label class="field-label">Note</label>
          <input type="text" id="s-note" placeholder="cash, wechat, wise..." value="${escapeHtml(f.note)}">
        </div>
        <div class="field">
          <label class="field-label">Date</label>
          <input type="date" id="s-date" value="${f.date}">
        </div>
        <button class="primary-btn" id="submit-settle">Log payment</button>
      </div>
      ${state.settlements.length > 0 ? `
        <h3 class="section-title">Past payments</h3>
        ${state.settlements.slice().sort((a,b) => b.date.localeCompare(a.date)).map(s => `
          <div class="entry">
            <div class="entry-avatar ${s.from.toLowerCase()}">${s.from}</div>
            <div class="entry-main">
              <p class="entry-desc">${s.from} → ${s.from === 'M' ? 'L' : 'M'}</p>
              <p class="entry-meta">${prettyDate(s.date)}${s.note ? ' · ' + escapeHtml(s.note) : ''}</p>
            </div>
            <div class="entry-right">
              <p class="entry-amount">${s.currency === 'EUR' ? fmtEUR(s.amount) : fmtRMB(s.amount)}</p>
            </div>
            <button class="del-btn" data-del-set="${s.id}" title="Delete">×</button>
          </div>
        `).join('')}
      ` : ''}
    </div>
  `;
}

function renderConfigTab() {
  const url = window.location.href.split('?')[0].replace(/trip_expenses\.html$/, '');
  return `
    <div class="content">
      <div class="settings-card">
        <div class="settings-row">
          <span class="settings-label">EUR → RMB</span>
          <input type="number" step="0.0001" class="rate-input" id="rate-input" value="${state.rate}">
        </div>
      </div>
      <div class="settings-card">
        <div class="settings-row" style="margin-bottom:14px;">
          <span class="settings-label">You are</span>
          <span style="font-family: 'Instrument Serif', serif; font-size: 28px; color: ${window.__identity === 'M' ? 'var(--red)' : 'var(--blue)'};">${window.__identity || '?'}</span>
        </div>
        <button class="secondary-btn" id="change-me-btn">Change identity</button>
      </div>
      <div class="settings-card">
        <div class="settings-label" style="margin-bottom: 10px;">Bookmarks</div>
        <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--cream-soft); line-height: 1.8; word-break: break-all;">
          M → ${url}?who=M<br>
          L → ${url}?who=L
        </div>
      </div>
      <button class="primary-btn" id="refresh-btn">Sync from sheet</button>
    </div>
  `;
}

// HANDLERS
function attachHandlers() {
  document.querySelectorAll('.tab').forEach(btn => { btn.onclick = () => { state.tab = btn.dataset.tab; render(); }; });
  document.querySelectorAll('[data-who]').forEach(btn => { btn.onclick = () => { syncFormFromInputs(); state.form.who = btn.dataset.who; render(); }; });
  document.querySelectorAll('[data-cat]').forEach(btn => { btn.onclick = () => { syncFormFromInputs(); state.form.category = btn.dataset.cat; render(); }; });
  document.querySelectorAll('[data-cur]').forEach(btn => { btn.onclick = () => { syncFormFromInputs(); state.form.currency = btn.dataset.cur; render(); }; });
  document.querySelectorAll('[data-sfrom]').forEach(btn => { btn.onclick = () => { syncSettleFromInputs(); state.settleForm.from = btn.dataset.sfrom; render(); }; });
  document.querySelectorAll('[data-scur]').forEach(btn => { btn.onclick = () => { syncSettleFromInputs(); state.settleForm.currency = btn.dataset.scur; render(); }; });

  const submitExp = document.getElementById('submit-expense');
  if (submitExp) submitExp.onclick = addExpense;
  const submitSet = document.getElementById('submit-settle');
  if (submitSet) submitSet.onclick = addSettlement;

  document.querySelectorAll('[data-del-exp]').forEach(btn => { btn.onclick = () => deleteExpense(btn.dataset.delExp); });
  document.querySelectorAll('[data-del-set]').forEach(btn => { btn.onclick = () => deleteSettlement(btn.dataset.delSet); });

  const rateInput = document.getElementById('rate-input');
  if (rateInput) {
    rateInput.onchange = async () => {
      const newRate = parseFloat(rateInput.value);
      if (!isNaN(newRate) && newRate > 0) {
        state.rate = newRate;
        await apiPost('setRate', { rate: newRate });
        showToast('Rate updated');
        render();
      }
    };
  }

  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) refreshBtn.onclick = () => { state.loading = true; render(); refresh(); };

  const changeMe = document.getElementById('change-me-btn');
  if (changeMe) changeMe.onclick = askIdentity;
}

function syncFormFromInputs() {
  const a = document.getElementById('f-amount');
  const d = document.getElementById('f-desc');
  const dt = document.getElementById('f-date');
  if (a) state.form.amount = a.value;
  if (d) state.form.desc = d.value;
  if (dt) state.form.date = dt.value;
}
function syncSettleFromInputs() {
  const a = document.getElementById('s-amount');
  const n = document.getElementById('s-note');
  const dt = document.getElementById('s-date');
  if (a) state.settleForm.amount = a.value;
  if (n) state.settleForm.note = n.value;
  if (dt) state.settleForm.date = dt.value;
}

async function addExpense() {
  syncFormFromInputs();
  const f = state.form;
  const amt = parseFloat(f.amount);
  if (isNaN(amt) || amt <= 0) { showToast('Enter an amount', true); return; }
  const btn = document.getElementById('submit-expense');
  btn.disabled = true; btn.textContent = 'Saving...';
  try {
    const payload = { date: f.date, who: f.who, category: f.category, desc: f.desc || f.category, amount: amt, currency: f.currency };
    const res = await apiPost('addExpense', { payload });
    if (res.ok) {
      state.expenses.push({ id: res.id, ...payload });
      state.form.amount = ''; state.form.desc = '';
      showToast('Added');
      state.tab = 'history';
      render();
    } else { showToast('Save failed', true); btn.disabled = false; btn.textContent = 'Add expense'; }
  } catch (e) { showToast('Network error', true); btn.disabled = false; btn.textContent = 'Add expense'; }
}

async function addSettlement() {
  syncSettleFromInputs();
  const f = state.settleForm;
  const amt = parseFloat(f.amount);
  if (isNaN(amt) || amt <= 0) { showToast('Enter an amount', true); return; }
  const btn = document.getElementById('submit-settle');
  btn.disabled = true; btn.textContent = 'Saving...';
  try {
    const payload = { date: f.date, from: f.from, amount: amt, currency: f.currency, note: f.note };
    const res = await apiPost('addSettlement', { payload });
    if (res.ok) {
      state.settlements.push({ id: res.id, ...payload });
      state.settleForm.amount = ''; state.settleForm.note = '';
      showToast('Logged');
      render();
    } else { showToast('Save failed', true); btn.disabled = false; btn.textContent = 'Log payment'; }
  } catch (e) { showToast('Network error', true); btn.disabled = false; btn.textContent = 'Log payment'; }
}

async function deleteExpense(id) {
  if (!confirm('Delete this expense?')) return;
  const res = await apiPost('deleteExpense', { id });
  if (res.ok) { state.expenses = state.expenses.filter(e => e.id !== id); showToast('Deleted'); render(); }
}
async function deleteSettlement(id) {
  if (!confirm('Delete this payment?')) return;
  const res = await apiPost('deleteSettlement', { id });
  if (res.ok) { state.settlements = state.settlements.filter(s => s.id !== id); showToast('Deleted'); render(); }
}

// BOOT
if (!window.__identity) askIdentity();
refresh();
