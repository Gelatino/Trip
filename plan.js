// ============ PLAN PAGE ============

const state = {
  places: [],
  filter: 'all',
  cityFilter: 'all',
  loading: true
};

const PLACE_TYPES = [
  { id: 'hotel', label: 'Hotel', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 22V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14"/><path d="M3 22h18"/><path d="M8 10h2m4 0h2m-8 4h2m4 0h2m-8 4h2m4 0h2"/></svg>' },
  { id: 'train', label: 'Train', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16"/><path d="M8 15h.01M16 15h.01"/><path d="M8 19l-2 3M16 19l2 3"/></svg>' },
  { id: 'food', label: 'Food', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11h18M5 11V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6M5 11v10h14V11"/></svg>' },
  { id: 'place', label: 'Sight', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L3 7v13h18V7l-9-5z"/><path d="M9 22V12h6v10"/></svg>' },
  { id: 'other', label: 'Other', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1.5"/></svg>' }
];

function typeColor(type) {
  return type === 'hotel' ? '#e03a2c'
    : type === 'train' ? '#4a9169'
    : type === 'food' ? '#e8b93f'
    : type === 'place' ? '#2e5cd4'
    : '#8a857a';
}

// Normalize time: handle "10:00", "10:00 AM", or ISO like "1899-12-30T09:00:00.000Z"
function normalizeTime(t) {
  if (!t) return '';
  const s = String(t).trim();
  if (!s) return '';
  // Already HH:MM format
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
    const parts = s.split(':');
    return parts[0].padStart(2, '0') + ':' + parts[1];
  }
  // ISO datetime (Google Sheets time serial converted to date)
  if (s.includes('T')) {
    try {
      const d = new Date(s);
      if (!isNaN(d)) {
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return hh + ':' + mm;
      }
    } catch(e) {}
  }
  return s;
}

// Amap URL: use app deep link on iOS/Android, web on desktop
function amapUrl(p) {
  const query = p.nameCn || p.nameLatin || '';
  const city = p.city || '';
  const keywords = encodeURIComponent(query);
  const cityParam = city ? '&city=' + encodeURIComponent(city) : '';

  // uri.amap.com works across platforms - it handles app detection server-side
  // but on iOS Safari, app handoff is unreliable. We bake in the intent explicitly.
  return `https://uri.amap.com/search?keywords=${keywords}${cityParam}&src=webapp&coordinate=gaode&callnative=1`;
}

// Open Amap with app-first behavior on mobile
function openAmap(p, ev) {
  if (ev) { ev.preventDefault(); ev.stopPropagation(); }

  // IMPROVEMENT: Combine City + Address + Name for a "Deep Search"
  // This tells AMap exactly where to look.
  const name = p.nameCn || p.nameLatin || '';
  const city = p.city || '';
  const address = p.address || '';
  
  // Create a specific search string: "Shanghai No.1066 Yan'an West Road Ji Hotel"
  const fullQuery = `${city} ${address} ${name}`.trim();
  
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);

  if (isIOS || isAndroid) {
    const appUrl = isIOS
      ? `iosamap://poi?sourceApplication=trip&name=${encodeURIComponent(fullQuery)}&dev=0`
      : `androidamap://poi?sourceApplication=trip&keywords=${encodeURIComponent(fullQuery)}&dev=0`;
    
    // Web fallback also uses the more specific query
    const webUrl = `https://uri.amap.com/search?keywords=${encodeURIComponent(fullQuery)}`;

    const start = Date.now();
    const timer = setTimeout(() => {
      if (Date.now() - start < 2000 && !document.hidden) {
        window.location.href = webUrl;
      }
    }, 1500);

    window.location.href = appUrl;

    const onHidden = () => {
      if (document.hidden) {
        clearTimeout(timer);
        document.removeEventListener('visibilitychange', onHidden);
      }
    };
    document.addEventListener('visibilitychange', onHidden);
  } else {
    const webUrl = `https://uri.amap.com/search?keywords=${encodeURIComponent(fullQuery)}`;
    window.open(webUrl, '_blank', 'noopener');
  }
}

async function refresh() {
  try {
    const data = await apiGet();
    state.places = (data.places || []).map(p => ({
      ...p,
      day: p.day ? (typeof p.day === 'string' ? p.day.slice(0,10) : formatDate(p.day)) : '',
      endDay: p.endDay ? (typeof p.endDay === 'string' ? p.endDay.slice(0,10) : formatDate(p.endDay)) : '',
      time: normalizeTime(p.time),
      city: p.city || '',
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

// Expand hotels across every day they span. Other types: one slot on their day.
function expandPlacesToDays(places) {
  const slots = [];
  const noDay = [];

  places.forEach(p => {
    if (!p.day) { noDay.push(p); return; }

    if (p.type === 'hotel' && p.endDay && p.endDay > p.day) {
      const start = new Date(p.day);
      const end = new Date(p.endDay);
      let cursor = new Date(start);
      while (cursor < end) {
        const dayStr = formatDate(cursor);
        const isStart = dayStr === p.day;
        slots.push({ day: dayStr, place: p, hotelNight: isStart ? 'start' : 'middle' });
        cursor.setDate(cursor.getDate() + 1);
      }
      slots.push({ day: p.endDay, place: p, hotelNight: 'end' });
    } else {
      slots.push({ day: p.day, place: p, hotelNight: null });
    }
  });

  return { slots, noDay };
}

// Get unique cities from the places list
function getCities() {
  const cities = [...new Set(state.places.map(p => p.city).filter(c => c))];
  return cities.sort();
}

// ============ RENDER ============
function render() {
  renderHeader({
    title: 'Plan',
    subtitle: `${state.places.length} ${state.places.length === 1 ? 'place' : 'places'} · ${state.places.filter(p => p.done).length} done`,
    page: 'plan'
  });

  const app = document.getElementById('app');
  if (state.loading) { app.innerHTML = '<div class="loading">Loading places...</div>'; return; }

  const filters = [
    { id: 'all', label: 'All' },
    { id: 'hotel', label: 'Hotels' },
    { id: 'train', label: 'Trains' },
    { id: 'food', label: 'Food' },
    { id: 'place', label: 'Sights' },
    { id: 'other', label: 'Other' },
    { id: 'done', label: 'Done' }
  ];

  const cities = getCities();

  // Apply filters
  let filteredPlaces = state.places;
  if (state.filter === 'done') {
    filteredPlaces = state.places.filter(p => p.done);
  } else if (state.filter === 'all') {
    // Hide done items from the main view
    filteredPlaces = state.places.filter(p => !p.done);
  } else {
    filteredPlaces = state.places.filter(p => (p.type || 'place') === state.filter && !p.done);
  }
  if (state.cityFilter !== 'all') {
    filteredPlaces = filteredPlaces.filter(p => p.city === state.cityFilter);
  }

  const addBtn = `<button class="add-place-inline" id="add-place-btn" title="Add place">+</button>`;
  const cityBar = cities.length > 1 ? `
    <div class="filter-row city-row">
      <button class="filter-chip city-chip ${state.cityFilter === 'all' ? 'active' : ''}" data-cityfilter="all">All cities</button>
      ${cities.map(c => `<button class="filter-chip city-chip ${state.cityFilter === c ? 'active' : ''}" data-cityfilter="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}
      ${addBtn}
    </div>
  ` : `<div class="filter-row city-row" style="justify-content: flex-end;">${addBtn}</div>`;

  // Done view: flat list of done items (could be dated or not)
  if (state.filter === 'done') {
    const empty = filteredPlaces.length === 0;
    // Sort by date descending (most recently done first), undated at the end
    const sorted = [...filteredPlaces].sort((a, b) => {
      if (!a.day && !b.day) return 0;
      if (!a.day) return 1;
      if (!b.day) return -1;
      return b.day.localeCompare(a.day);
    });
    app.innerHTML = `
      <div class="content" style="padding-top: 20px;">
        <div class="filter-row">
          ${filters.map(f => `<button class="filter-chip ${state.filter === f.id ? 'active' : ''}" data-filter="${f.id}">${f.label}</button>`).join('')}
        </div>
        ${cityBar}
        ${empty ? `
          <div class="empty"><div class="empty-icon"></div><div class="empty-text">nothing done yet</div></div>
        ` : `
          <div class="day-block">
            <div class="day-block-header">
              <div><h3 class="day-block-title" style="font-style:italic;">History</h3></div>
              <span class="day-city-tag">${filteredPlaces.length} done</span>
            </div>
            ${sorted.map(p => renderPlaceCard(p)).join('')}
          </div>
        `}
      </div>
    `;
    attachHandlers();
    return;
  }

  // Expand into day-slots
  const { slots, noDay } = expandPlacesToDays(filteredPlaces);
  const byDay = {};
  slots.forEach(s => {
    if (!byDay[s.day]) byDay[s.day] = [];
    byDay[s.day].push(s);
  });

  // Sort within a day: hotels first, then by time
  Object.keys(byDay).forEach(day => {
    byDay[day].sort((a, b) => {
      const aHotel = a.place.type === 'hotel' ? 0 : 1;
      const bHotel = b.place.type === 'hotel' ? 0 : 1;
      if (aHotel !== bHotel) return aHotel - bHotel;
      return (a.place.time || '').localeCompare(b.place.time || '');
    });
  });

  const days = Object.keys(byDay).sort();
  const empty = days.length === 0 && noDay.length === 0;

  app.innerHTML = `
    <div class="content" style="padding-top: 20px;">
      <div class="filter-row">
        ${filters.map(f => `<button class="filter-chip ${state.filter === f.id ? 'active' : ''}" data-filter="${f.id}">${f.label}</button>`).join('')}
      </div>
      ${cityBar}

      ${empty ? `
        <div class="empty"><div class="empty-icon"></div><div class="empty-text">nothing planned yet</div></div>
      ` : `
        ${days.map(day => {
          const cities = [...new Set(byDay[day].map(s => s.place.city).filter(c => c))];
          const cityLabel = cities.length > 0 ? cities.join(' · ') : '';
          return `
            <div class="day-block">
              <div class="day-block-header">
                <div>
                  <h3 class="day-block-title">${prettyDateLong(day)}</h3>
                </div>
                ${cityLabel ? `<span class="day-city-tag">${escapeHtml(cityLabel)}</span>` : ''}
              </div>
              ${byDay[day].map(s => renderPlaceCard(s.place, s.hotelNight)).join('')}
            </div>
          `;
        }).join('')}

        ${noDay.length > 0 ? `
          <div class="day-block">
            <div class="day-block-header">
              <div><h3 class="day-block-title" style="font-style:italic; color: var(--muted);">Unscheduled</h3></div>
            </div>
            ${noDay.map(p => renderPlaceCard(p)).join('')}
          </div>
        ` : ''}
      `}
    </div>
  `;
  attachHandlers();
}

function renderPlaceCard(p, hotelNight) {
  const type = p.type || 'place';
  const typeDef = PLACE_TYPES.find(t => t.id === type) || PLACE_TYPES[3];

  // TRAIN: special layout with From → To
  if (type === 'train') {
    const from = p.city || '—';
    const to = p.nameLatin || p.nameCn || '—';
    const timeLabel = p.time ? escapeHtml(p.time) : '';
    return `
      <div class="place-card train-card ${p.done ? 'done' : ''}">
        <div class="train-head">
          <div class="place-type-badge train" style="color: ${typeColor('train')};">${typeDef.icon}</div>
          <div class="train-route">
            <div class="train-endpoint">
              <p class="train-label">From</p>
              <p class="train-city">${escapeHtml(from)}</p>
            </div>
            <div class="train-arrow">→</div>
            <div class="train-endpoint">
              <p class="train-label">To</p>
              <p class="train-city">${escapeHtml(to)}</p>
            </div>
          </div>
          <button class="place-check ${p.done ? 'done' : ''}" data-toggle-place="${p.id}" title="${p.done ? 'Mark not done' : 'Mark done'}"></button>
        </div>
        ${timeLabel ? `<div class="train-time"><span class="time-badge">${timeLabel}</span></div>` : ''}
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

  // DEFAULT card (hotel, food, place, other)
  let hotelBadge = '';
  if (type === 'hotel') {
    if (hotelNight === 'start') hotelBadge = '<span class="night-badge">check-in</span>';
    else if (hotelNight === 'end') hotelBadge = '<span class="night-badge">check-out</span>';
    else if (hotelNight === 'middle') hotelBadge = '<span class="night-badge">staying</span>';
  }

  const timeLabel = p.time ? `<span class="time-badge">${escapeHtml(p.time)}</span>` : '';
  const cityPill = p.city ? `<span class="city-pill">${escapeHtml(p.city)}</span>` : '';

  let hotelRange = '';
  if (type === 'hotel' && p.day && p.endDay) {
    hotelRange = `<p class="place-subline">${prettyDateShort(p.day)} → ${prettyDateShort(p.endDay)}</p>`;
  }

  const hasMeta = timeLabel || hotelBadge || cityPill;
  const hasMapTarget = p.nameCn || p.nameLatin || p.address;

  return `
    <div class="place-card ${p.done ? 'done' : ''}">
      <div class="place-head">
        <div class="place-type-badge ${type}" style="color: ${typeColor(type)};">${typeDef.icon}</div>
        <div class="place-names">
          <p class="place-name-latin">${escapeHtml(p.nameLatin || p.nameCn || 'Untitled')}</p>
          ${hasMeta ? `<div class="place-meta-row">${cityPill}${timeLabel}${hotelBadge}</div>` : ''}
          ${hotelRange}
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
        ${hasMapTarget ? `<button class="place-map-btn" data-amap="${p.id}">Amap ↗</button>` : ''}
        <button class="place-edit-btn" data-edit-place="${p.id}">Edit</button>
        <button class="place-del-btn" data-del-place="${p.id}">Delete</button>
      </div>
    </div>
  `;
}

// ============ MODAL ============
function openPlaceModal(place) {
  const isEdit = !!place;
  const p = place ? { ...place } : {
    id: null, day: '', endDay: '', time: '', type: 'place',
    city: '', nameLatin: '', nameCn: '', address: '', note: ''
  };
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

        <div id="train-or-default-fields">
          ${renderTypeSpecificFields(p.type, p)}
        </div>

        <div class="field">
          <label class="field-label">名字 Name (Chinese)</label>
          <input type="text" class="cn-input" id="p-cn" placeholder="全季酒店" value="${escapeHtml(p.nameCn)}">
        </div>

        <div class="field">
          <label class="field-label">地址 Address (Chinese)</label>
          <input type="text" class="cn-input" id="p-addr" placeholder="上海市黄浦区..." value="${escapeHtml(p.address)}">
        </div>

        <div id="date-fields-wrap">
          ${renderDateFields(p.type, p)}
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
      // Preserve current values before re-rendering
      const current = readModalValues();
      selectedType = btn.dataset.ptype;
      container.querySelectorAll('[data-ptype]').forEach(b => {
        b.classList.remove('active');
        b.style.color = typeColor(b.dataset.ptype);
      });
      btn.classList.add('active');
      btn.style.color = 'var(--ink)';

      // Re-render type-specific and date fields, preserving values
      const merged = { ...p, ...current };
      document.getElementById('train-or-default-fields').innerHTML = renderTypeSpecificFields(selectedType, merged);
      document.getElementById('date-fields-wrap').innerHTML = renderDateFields(selectedType, merged);
    };
  });

  document.getElementById('cancel-place-btn').onclick = () => { container.innerHTML = ''; };
  document.getElementById('save-place-btn').onclick = async () => {
    const vals = readModalValues();
    let nameLatin = vals.nameLatin;
    let city = vals.city;

    // For trains, "from" maps to city (departure), "to" maps to nameLatin (destination)
    if (selectedType === 'train') {
      nameLatin = vals.trainTo || '';
      city = vals.trainFrom || '';
    }

    const payload = {
      type: selectedType,
      city: city,
      nameLatin: nameLatin,
      nameCn: vals.nameCn,
      address: vals.address,
      day: vals.day,
      endDay: vals.endDay,
      time: vals.time,
      note: vals.note
    };

    if (selectedType === 'train') {
      if (!payload.city && !payload.nameLatin) {
        showToast('Add From and To', true);
        return;
      }
    } else {
      if (!payload.nameLatin && !payload.nameCn) {
        showToast('Need at least a name', true);
        return;
      }
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
          haptic();
          container.innerHTML = '';
          render();
        } else { showToast('Save failed', true); btn.disabled = false; btn.textContent = 'Save changes'; }
      } else {
        const res = await apiPost('addPlace', { payload });
        if (res.ok) {
          state.places.push({ id: res.id, ...payload, done: false });
          showToast('Added');
          haptic();
          container.innerHTML = '';
          render();
        } else { showToast('Save failed', true); btn.disabled = false; btn.textContent = 'Add place'; }
      }
    } catch (e) {
      showToast('Network error', true); btn.disabled = false; btn.textContent = isEdit ? 'Save changes' : 'Add place';
    }
  };
}

function renderTypeSpecificFields(type, p) {
  if (type === 'train') {
    const from = p.city || '';
    const to = p.nameLatin || '';
    return `
      <div class="field-row">
        <div class="field">
          <label class="field-label">From</label>
          <input type="text" id="p-trainfrom" placeholder="Shanghai" value="${escapeHtml(from)}">
        </div>
        <div class="field">
          <label class="field-label">To</label>
          <input type="text" id="p-trainto" placeholder="Jingdezhen" value="${escapeHtml(to)}">
        </div>
      </div>
    `;
  }
  return `
    <div class="field">
      <label class="field-label">City</label>
      <input type="text" id="p-city" placeholder="Shanghai" value="${escapeHtml(p.city || '')}">
    </div>
    <div class="field">
      <label class="field-label">Name (latin / english)</label>
      <input type="text" id="p-latin" placeholder="Ji Hotel Shanghai" value="${escapeHtml(p.nameLatin || '')}">
    </div>
  `;
}

function renderDateFields(type, p) {
  if (type === 'hotel') {
    return `
      <div class="field-row">
        <div class="field">
          <label class="field-label">Check-in</label>
          <input type="date" id="p-day" value="${p.day || ''}">
        </div>
        <div class="field">
          <label class="field-label">Check-out</label>
          <input type="date" id="p-endday" value="${p.endDay || ''}">
        </div>
      </div>
    `;
  }
  if (type === 'train') {
    return `
      <div class="field-row">
        <div class="field">
          <label class="field-label">Date</label>
          <input type="date" id="p-day" value="${p.day || ''}">
        </div>
        <div class="field">
          <label class="field-label">Time</label>
          <input type="time" id="p-time" value="${p.time || ''}">
        </div>
      </div>
    `;
  }
  return `
    <div class="field-row">
      <div class="field">
        <label class="field-label">Date (optional)</label>
        <input type="date" id="p-day" value="${p.day || ''}">
      </div>
      <div class="field">
        <label class="field-label">Time (optional)</label>
        <input type="time" id="p-time" value="${p.time || ''}">
      </div>
    </div>
  `;
}

function readModalValues() {
  const getVal = (id) => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };
  return {
    city: getVal('p-city'),
    nameLatin: getVal('p-latin'),
    nameCn: getVal('p-cn'),
    address: getVal('p-addr'),
    day: getVal('p-day'),
    endDay: getVal('p-endday'),
    time: getVal('p-time'),
    note: getVal('p-note'),
    trainFrom: getVal('p-trainfrom'),
    trainTo: getVal('p-trainto')
  };
}

// ============ HANDLERS ============
function attachHandlers() {
  document.querySelectorAll('[data-filter]').forEach(btn => { btn.onclick = () => { state.filter = btn.dataset.filter; render(); }; });
  document.querySelectorAll('[data-cityfilter]').forEach(btn => { btn.onclick = () => { state.cityFilter = btn.dataset.cityfilter; render(); }; });
  document.querySelectorAll('[data-del-place]').forEach(btn => { btn.onclick = () => deletePlace(btn.dataset.delPlace); });
  document.querySelectorAll('[data-toggle-place]').forEach(btn => { btn.onclick = () => togglePlace(btn.dataset.togglePlace); });
  document.querySelectorAll('[data-edit-place]').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute('data-edit-place');
      const place = state.places.find(p => p.id === id);
      if (place) openPlaceModal(place);
      else showToast('Place not found', true);
    };
  });
  document.querySelectorAll('[data-copy]').forEach(btn => {
    btn.onclick = () => copyToClipboard(btn.dataset.copy, btn);
  });
  document.querySelectorAll('[data-amap]').forEach(btn => {
    btn.onclick = (ev) => {
      const place = state.places.find(p => p.id === btn.dataset.amap);
      if (place) openAmap(place, ev);
    };
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
  haptic();
  render();
  try {
    const res = await apiPost('togglePlace', { id });
    if (!res.ok) { place.done = !place.done; render(); showToast('Failed', true); }
  } catch (e) { place.done = !place.done; render(); showToast('Network error', true); }
}

// ============ BOOT ============
if (!window.__identity) askIdentity();
refresh();
