// ============ PLAN PAGE ============

const state = {
  places: [],
  filter: 'all',
  loading: true
};

const PLACE_TYPES = [
  { id: 'hotel', label: 'Hotel', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 22V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14"/><path d="M3 22h18"/><path d="M8 10h2m4 0h2m-8 4h2m4 0h2m-8 4h2m4 0h2"/></svg>' },
  { id: 'food', label: 'Food', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11h18M5 11V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6M5 11v10h14V11"/></svg>' },
  { id: 'place', label: 'Sight', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L3 7v13h18V7l-9-5z"/><path d="M9 22V12h6v10"/></svg>' },
  { id: 'other', label: 'Other', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1.5"/></svg>' }
];

function typeColor(type) {
  return type === 'hotel' ? '#e03a2c' : type === 'food' ? '#e8b93f' : type === 'place' ? '#2e5cd4' : '#8a857a';
}

async function refresh() {
  try {
    const data = await apiGet();
    state.places = (data.places || []).map(p => ({
      ...p,
      day: p.day ? (typeof p.day === 'string' ? p.day.slice(0,10) : formatDate(p.day)) : '',
      done: p.done === true || p.done === 'TRUE' || p.done === 'true'
    }));
    state.loading = false;
    render();
  } catch (e) {
    showToast('Could not load', true);
    state.loading = false;
    render();
  }
}

// RENDER
function render() {
  renderHeader({
    title: 'Plan',
    subtitle: `${state.places.length} ${state.places.length === 1 ? 'place' : 'places'} · ${state.places.filter(p => p.done).length} visited`,
    page: 'plan'
  });

  const app = document.getElementById('app');
  if (state.loading) { app.innerHTML = '<div class="loading">Loading places...</div>'; return; }

  const filters = [
    { id: 'all', label: 'All' },
    { id: 'hotel', label: 'Hotels' },
    { id: 'food', label: 'Food' },
    { id: 'place', label: 'Sights' },
    { id: 'other', label: 'Other' },
    { id: 'unscheduled', label: 'No date' }
  ];

  let filtered = state.places;
  if (state.filter === 'unscheduled') {
    filtered = state.places.filter(p => !p.day);
  } else if (state.filter !== 'all') {
    filtered = state.places.filter(p => (p.type || 'place') === state.filter);
  }

  const byDay = {};
  const noDay = [];
  filtered.forEach(p => {
    if (p.day) { if (!byDay[p.day]) byDay[p.day] = []; byDay[p.day].push(p); }
    else noDay.push(p);
  });
  const days = Object.keys(byDay).sort();
  const empty = filtered.length === 0;

  app.innerHTML = `
    <div class="content" style="padding-top: 20px;">
      <div class="filter-row">
        ${filters.map(f => `<button class="filter-chip ${state.filter === f.id ? 'active' : ''}" data-filter="${f.id}">${f.label}</button>`).join('')}
      </div>

      <button class="add-place-btn" id="add-place-btn">+ Add place</button>

      ${empty ? `
        <div class="empty">
          <div class="empty-icon"></div>
          <div class="empty-text">nothing planned yet</div>
        </div>
      ` : `
        ${days.map(day => `
          <div class="day-block">
            <div class="day-block-header">
              <h3 class="day-block-title">${prettyDateLong(day)}</h3>
              <span class="day-block-date">${byDay[day].length} ${byDay[day].length === 1 ? 'stop' : 'stops'}</span>
            </div>
            ${byDay[day].map(p => renderPlaceCard(p)).join('')}
          </div>
        `).join('')}

        ${noDay.length > 0 ? `
          <div class="day-block">
            <div class="day-block-header">
              <h3 class="day-block-title" style="font-style:italic; color: var(--muted);">Unscheduled</h3>
              <span class="day-block-date">${noDay.length} ${noDay.length === 1 ? 'place' : 'places'}</span>
            </div>
            ${noDay.map(p => renderPlaceCard(p)).join('')}
          </div>
        ` : ''}
      `}
    </div>
  `;
  attachHandlers();
}

function renderPlaceCard(p) {
  const type = p.type || 'place';
  const typeDef = PLACE_TYPES.find(t => t.id === type) || PLACE_TYPES[2];
  return `
    <div class="place-card ${p.done ? 'done' : ''}">
      <div class="place-head">
        <div class="place-type-badge ${type}" style="color: ${typeColor(type)};">${typeDef.icon}</div>
        <div class="place-names">
          <p class="place-name-latin">${escapeHtml(p.nameLatin || p.nameCn || 'Untitled')}</p>
        </div>
        <button class="place-check ${p.done ? 'done' : ''}" data-toggle-place="${p.id}" title="${p.done ? 'Mark not done' : 'Mark done'}"></button>
      </div>

      ${p.nameCn ? `
        <div class="copy-row">
          <span class="copy-label">名 Name</span>
          <span class="copy-text">${escapeHtml(p.nameCn)}</span>
          <button class="copy-btn" data-copy="${escapeHtml(p.nameCn)}">Copy</button>
        </div>
      ` : ''}
      ${p.address ? `
        <div class="copy-row">
          <span class="copy-label">址 Addr</span>
          <span class="copy-text">${escapeHtml(p.address)}</span>
          <button class="copy-btn" data-copy="${escapeHtml(p.address)}">Copy</button>
        </div>
      ` : ''}

      ${p.note ? `<p class="place-note">${escapeHtml(p.note)}</p>` : ''}

      <div class="place-actions">
        <button class="place-edit-btn" data-edit-place="${p.id}">Edit</button>
        <button class="place-del-btn" data-del-place="${p.id}">Delete</button>
      </div>
    </div>
  `;
}

// MODAL
function openPlaceModal(place) {
  const isEdit = !!place;
  const p = place || { id: null, day: '', type: 'place', nameLatin: '', nameCn: '', address: '', note: '' };
  const container = document.getElementById('modal-container');
  container.innerHTML = `
    <div class="modal-bg">
      <div class="modal">
        <h2>${isEdit ? 'Edit place' : 'Add place'}</h2>
        <p>Fill the Chinese name for copy-paste in China. Latin for reading.</p>

        <div class="field">
          <label class="field-label">Type</label>
          <div class="type-select">
            ${PLACE_TYPES.map(t => `
              <button class="type-btn ${p.type === t.id ? 'active' : ''}" data-ptype="${t.id}" style="color: ${p.type === t.id ? 'var(--ink)' : typeColor(t.id)};">
                ${t.icon}
                <span>${t.label}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="field">
          <label class="field-label">Name (latin / english)</label>
          <input type="text" id="p-latin" placeholder="Ji Hotel Shanghai" value="${escapeHtml(p.nameLatin)}">
        </div>

        <div class="field">
          <label class="field-label">名字 Name (Chinese)</label>
          <input type="text" class="cn-input" id="p-cn" placeholder="全季酒店" value="${escapeHtml(p.nameCn)}">
        </div>

        <div class="field">
          <label class="field-label">地址 Address (Chinese)</label>
          <input type="text" class="cn-input" id="p-addr" placeholder="上海市黄浦区..." value="${escapeHtml(p.address)}">
        </div>

        <div class="field">
          <label class="field-label">Date (which day)</label>
          <input type="date" id="p-day" value="${p.day || ''}">
        </div>

        <div class="field">
          <label class="field-label">Note (booking ref, tips...)</label>
          <textarea id="p-note" rows="2" placeholder="confirmation #, check-in time...">${escapeHtml(p.note)}</textarea>
        </div>

        <button class="primary-btn" id="save-place-btn">${isEdit ? 'Save changes' : 'Add place'}</button>
        <button class="secondary-btn" id="cancel-place-btn">Cancel</button>
      </div>
    </div>
  `;

  let selectedType = p.type;
  container.querySelectorAll('[data-ptype]').forEach(btn => {
    btn.onclick = () => {
      selectedType = btn.dataset.ptype;
      container.querySelectorAll('[data-ptype]').forEach(b => {
        b.classList.remove('active');
        b.style.color = typeColor(b.dataset.ptype);
      });
      btn.classList.add('active');
      btn.style.color = 'var(--ink)';
    };
  });

  document.getElementById('cancel-place-btn').onclick = () => { container.innerHTML = ''; };
  document.getElementById('save-place-btn').onclick = async () => {
    const payload = {
      type: selectedType,
      nameLatin: document.getElementById('p-latin').value.trim(),
      nameCn: document.getElementById('p-cn').value.trim(),
      address: document.getElementById('p-addr').value.trim(),
      day: document.getElementById('p-day').value,
      note: document.getElementById('p-note').value.trim()
    };
    if (!payload.nameLatin && !payload.nameCn) {
      showToast('Need at least a name', true);
      return;
    }
    const btn = document.getElementById('save-place-btn');
    btn.disabled = true; btn.textContent = 'Saving...';
    try {
      if (isEdit) {
        const res = await apiPost('updatePlace', { id: p.id, payload });
        if (res.ok) {
          const idx = state.places.findIndex(x => x.id === p.id);
          if (idx >= 0) state.places[idx] = { ...state.places[idx], ...payload };
          showToast('Updated');
          container.innerHTML = '';
          render();
        } else { showToast('Save failed', true); btn.disabled = false; btn.textContent = 'Save changes'; }
      } else {
        const res = await apiPost('addPlace', { payload });
        if (res.ok) {
          state.places.push({ id: res.id, ...payload, done: false });
          showToast('Added');
          container.innerHTML = '';
          render();
        } else { showToast('Save failed', true); btn.disabled = false; btn.textContent = 'Add place'; }
      }
    } catch (e) {
      showToast('Network error', true); btn.disabled = false; btn.textContent = isEdit ? 'Save changes' : 'Add place';
    }
  };
}

// HANDLERS
function attachHandlers() {
  document.querySelectorAll('[data-filter]').forEach(btn => { btn.onclick = () => { state.filter = btn.dataset.filter; render(); }; });

  document.querySelectorAll('[data-del-place]').forEach(btn => { btn.onclick = () => deletePlace(btn.dataset.delPlace); });
  document.querySelectorAll('[data-toggle-place]').forEach(btn => { btn.onclick = () => togglePlace(btn.dataset.togglePlace); });
  document.querySelectorAll('[data-edit-place]').forEach(btn => {
    btn.onclick = () => {
      const place = state.places.find(p => p.id === btn.dataset.editPlace);
      if (place) openPlaceModal(place);
    };
  });
  document.querySelectorAll('[data-copy]').forEach(btn => {
    btn.onclick = () => copyToClipboard(btn.dataset.copy, btn);
  });

  const addPlaceBtn = document.getElementById('add-place-btn');
  if (addPlaceBtn) addPlaceBtn.onclick = () => openPlaceModal(null);
}

async function deletePlace(id) {
  if (!confirm('Delete this place?')) return;
  const res = await apiPost('deletePlace', { id });
  if (res.ok) { state.places = state.places.filter(p => p.id !== id); showToast('Deleted'); render(); }
}

async function togglePlace(id) {
  const place = state.places.find(p => p.id === id);
  if (!place) return;
  place.done = !place.done;
  render();
  try {
    const res = await apiPost('togglePlace', { id });
    if (!res.ok) { place.done = !place.done; render(); showToast('Failed', true); }
  } catch (e) { place.done = !place.done; render(); showToast('Network error', true); }
}

// BOOT
if (!window.__identity) askIdentity();
refresh();
