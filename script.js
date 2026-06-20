/* ─────────────────────────────────────────
   Vienna Journey · Main Script
   ───────────────────────────────────────── */

const CAT_COLORS = {
  'music':          '#e74c3c',
  'visual-art':     '#f39c12',
  'architecture':   '#1abc9c',
  'philosophy':     '#9b59b6',
  'psychoanalysis': '#3498db',
  'literature':     '#2ecc71',
};

const CAT_LABELS = {
  'music':          '音乐',
  'visual-art':     '视觉艺术',
  'architecture':   '建筑',
  'philosophy':     '哲学',
  'psychoanalysis': '精神分析',
  'literature':     '文学',
};

const YEAR_MIN = 1780;
const YEAR_MAX = 1940;

/* ── State ── */
let entries = [];
let milestones = [];
let activeCategories = new Set(Object.keys(CAT_COLORS));
let selectedId = null;
let markers = {};         // id → Leaflet marker
let timelineDots = {};    // id → DOM element
let map;

/* ── Bootstrap ── */
async function init() {
  await loadData();
  initMap();
  initFilters();
  initSearch();
  renderMarkers();
  renderTimeline();
}

async function loadData() {
  try {
    const [eRes, mRes] = await Promise.all([
      fetch('data/vienna-journey.json'),
      fetch('data/vienna-milestones.json'),
    ]);
    entries    = await eRes.json();
    milestones = await mRes.json();
  } catch (e) {
    console.error('Data load failed:', e);
    entries = [];
    milestones = [];
  }
}

/* ── MAP ── */
function initMap() {
  map = L.map('map', {
    center: [48.208, 16.370],
    zoom: 14,
    zoomControl: true,
    attributionControl: true,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> © <a href="https://carto.com/">CARTO</a>',
    maxZoom: 19,
  }).addTo(map);

  map.on('click', () => {
    // click on empty map → deselect
    if (selectedId) deselect();
  });
}

function renderMarkers() {
  // clear existing
  Object.values(markers).forEach(m => m.remove());
  markers = {};

  entries.forEach(entry => {
    const color = CAT_COLORS[entry.category] || '#aaa';
    const icon = L.divIcon({
      className: '',
      html: `<div class="custom-marker" style="width:14px;height:14px;background:${color};"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      popupAnchor: [0, -10],
    });

    const marker = L.marker([entry.lat, entry.lng], { icon })
      .bindPopup(`
        <div class="popup-work">${entry.work}</div>
        <div class="popup-person">${entry.person || ''}</div>
        <div class="popup-year">${entry.year} · ${entry.city}</div>
      `)
      .addTo(map);

    marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      selectEntry(entry.id);
    });

    markers[entry.id] = marker;
  });

  applyVisibility();
}

function applyVisibility() {
  const q = document.getElementById('search-box').value.toLowerCase().trim();

  entries.forEach(entry => {
    const marker   = markers[entry.id];
    const dot      = timelineDots[entry.id];
    const catOk    = activeCategories.has(entry.category);
    const searchOk = !q || matchSearch(entry, q);
    const visible  = catOk && searchOk;

    if (marker) {
      if (visible) marker.addTo(map);
      else marker.remove();
    }

    if (dot) {
      dot.classList.toggle('dimmed', !visible);
      dot.style.pointerEvents = visible ? '' : 'none';
    }
  });
}

function matchSearch(entry, q) {
  return (entry.work || '').toLowerCase().includes(q)
    || (entry.person || '').toLowerCase().includes(q)
    || (entry.genre || '').toLowerCase().includes(q)
    || String(entry.year).includes(q);
}

/* ── FILTERS ── */
function initFilters() {
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.cat;
      if (activeCategories.has(cat)) {
        activeCategories.delete(cat);
        btn.classList.remove('active');
      } else {
        activeCategories.add(cat);
        btn.classList.add('active');
      }
      applyVisibility();
    });
  });
}

function initSearch() {
  document.getElementById('search-box').addEventListener('input', () => {
    applyVisibility();
  });
}

/* ── TIMELINE ── */
function renderTimeline() {
  const inner = document.getElementById('timeline-inner');

  // Year labels
  const labelYears = [1786, 1800, 1815, 1830, 1848, 1867, 1900, 1914, 1921, 1938];
  labelYears.forEach(y => {
    const el = document.createElement('div');
    el.className = 'tl-year-label';
    el.textContent = y;
    el.style.left = pct(y) + '%';
    inner.appendChild(el);
  });

  // Milestone lines
  milestones.forEach(ms => {
    const el = document.createElement('div');
    el.className = 'tl-milestone';
    el.style.left = pct(ms.year) + '%';

    const tick = document.createElement('div');
    tick.className = 'tl-ms-tick';

    const label = document.createElement('div');
    label.className = 'tl-ms-label';
    label.textContent = ms.labelShort;

    el.appendChild(tick);
    el.appendChild(label);
    inner.appendChild(el);

    el.addEventListener('mouseenter', (e) => showMilestoneTooltip(ms, e));
    el.addEventListener('mouseleave', hideMilestoneTooltip);
    el.addEventListener('click',      (e) => { e.stopPropagation(); showMilestoneTooltip(ms, e); el.classList.toggle('active'); });
  });

  // Entry dots
  entries.forEach(entry => {
    const color = CAT_COLORS[entry.category] || '#aaa';
    const dot = document.createElement('div');
    dot.className = 'tl-entry-dot';
    dot.style.left = pct(entry.year) + '%';
    dot.style.background = color;
    dot.title = `${entry.year} · ${entry.work}`;
    inner.appendChild(dot);
    timelineDots[entry.id] = dot;

    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      selectEntry(entry.id);
    });
  });
}

function pct(year) {
  return ((year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100;
}

/* ── MILESTONE TOOLTIP ── */
const msTooltip = document.getElementById('milestone-tooltip');

function showMilestoneTooltip(ms, e) {
  document.getElementById('ms-year').textContent  = ms.year;
  document.getElementById('ms-label').textContent = ms.label;
  document.getElementById('ms-desc').textContent  = ms.description;

  const rect = e.currentTarget.getBoundingClientRect();
  msTooltip.style.left   = Math.min(rect.left, window.innerWidth - 300) + 'px';
  msTooltip.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
  msTooltip.style.top    = '';
  msTooltip.classList.add('visible');
}

function hideMilestoneTooltip() {
  msTooltip.classList.remove('visible');
}

/* ── SELECTION ── */
function selectEntry(id) {
  if (selectedId === id) return;
  selectedId = id;

  // Update timeline dots
  Object.entries(timelineDots).forEach(([eid, dot]) => {
    dot.classList.toggle('selected', eid === id);
  });

  // Pan map to marker
  const entry = entries.find(e => e.id === id);
  if (!entry) return;

  map.setView([entry.lat, entry.lng], Math.max(map.getZoom(), 15), { animate: true });
  if (markers[id]) {
    markers[id].openPopup();
  }

  showDetail(entry);
}

function deselect() {
  selectedId = null;
  Object.values(timelineDots).forEach(d => d.classList.remove('selected'));
  map.closePopup();
  document.getElementById('detail-empty').style.display = '';
  document.getElementById('detail-content').classList.remove('visible');
}

/* ── DETAIL PANEL ── */
function showDetail(entry) {
  document.getElementById('detail-empty').style.display = 'none';
  document.getElementById('detail-content').classList.add('visible');

  const color = CAT_COLORS[entry.category] || '#aaa';
  const catLabel = CAT_LABELS[entry.category] || entry.category;

  // Badge
  document.getElementById('detail-badge-dot').style.background = color;
  document.getElementById('detail-badge-label').textContent = catLabel;
  document.getElementById('detail-badge').style.color = color;

  // Header
  document.getElementById('detail-work').textContent   = entry.work || '';
  document.getElementById('detail-person').textContent = entry.person || '';
  document.getElementById('detail-meta').textContent   =
    [entry.year, entry.city, entry.country].filter(Boolean).join(' · ');

  // Body
  document.getElementById('detail-context').textContent = entry.context || '';
  document.getElementById('detail-meaning').textContent = entry.meaning || '';

  // Place
  const placeEl = document.getElementById('detail-place');
  if (entry.place) {
    const { name, address, note } = entry.place;
    placeEl.innerHTML = `
      <div class="detail-place-name">${name || ''}</div>
      ${address ? `<div class="detail-place-address">${address}</div>` : ''}
      ${note ? `<div class="detail-place-note">${note}</div>` : ''}
    `;
  } else {
    placeEl.innerHTML = `<div class="detail-place-name">${entry.city}, ${entry.country}</div>`;
  }

  // Links (journey cross-links + source)
  const linksSection = document.getElementById('section-links');
  const linksEl      = document.getElementById('detail-links');
  linksEl.innerHTML  = '';
  const allLinks = [];

  if (entry.links && entry.links.length) {
    entry.links.forEach(lnk => allLinks.push({ ...lnk, isJourney: true }));
  }
  if (entry.listening) {
    if (entry.listening.youtubeSearch) {
      allLinks.push({ label: '在 YouTube 搜索', url: entry.listening.youtubeSearch });
    }
    if (entry.listening.spotifySearch) {
      allLinks.push({ label: '在 Spotify 搜索', url: entry.listening.spotifySearch });
    }
  }
  if (entry.source && entry.source.url) {
    allLinks.push({ label: entry.source.label || '来源', url: entry.source.url });
  }

  if (allLinks.length) {
    linksSection.style.display = '';
    allLinks.forEach(lnk => {
      const a = document.createElement('a');
      a.className = 'detail-link' + (lnk.isJourney ? ' journey-link' : '');
      a.href      = lnk.url;
      a.target    = '_blank';
      a.rel       = 'noopener noreferrer';
      a.textContent = lnk.label;
      linksEl.appendChild(a);
    });
  } else {
    linksSection.style.display = 'none';
  }

  // Source citation
  const sourceEl = document.getElementById('detail-source');
  if (entry.source) {
    const { label, url, summary } = entry.source;
    sourceEl.innerHTML = summary
      ? `${summary}<br><a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
      : `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  } else {
    sourceEl.textContent = '';
  }

  // Scroll detail body to top
  document.getElementById('detail-body').scrollTop = 0;
}

/* ── START ── */
init();
