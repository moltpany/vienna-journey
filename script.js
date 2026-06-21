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

const CAT_LABELS_EN = {
  'music':          'Music',
  'visual-art':     'Visual Art',
  'architecture':   'Architecture',
  'philosophy':     'Philosophy',
  'psychoanalysis': 'Psychoanalysis',
  'literature':     'Literature',
};

function catLabel(cat) {
  return (lang === 'en' ? CAT_LABELS_EN : CAT_LABELS)[cat] || cat;
}

const YEAR_MIN = 1780;
const YEAR_MAX = 1940;

/* ── State ── */
let entries = [];
let milestones = [];
let activeCategories = new Set(Object.keys(CAT_COLORS));
let selectedId = null;
let markers = {};         // id → Leaflet marker
let timelineDots = {};    // id → DOM element
let listCards = {};       // id → list card DOM element
let map;
let tileLayer;
let lang = (localStorage.getItem('vienna-journey-lang') === 'en') ? 'en' : 'zh';
let enEntries = {};       // id → English overlay
let enMilestones = {};    // id → English overlay

/* ── Bootstrap ── */
async function init() {
  await loadData();
  initMap();
  initTheme();
  initFilters();
  initSearch();
  initViewToggle();
  initLang();
  initDetailBack();
  applyUIStrings();
  renderMarkers();
  renderTimeline();
  renderList();
  applyVisibility();
  fitLayout();
  window.addEventListener('resize', fitLayout);
  // keep Leaflet correctly sized as the detail panel grows/shrinks the map area
  const mapBox = document.getElementById('map-container');
  if (window.ResizeObserver && mapBox) {
    new ResizeObserver(() => { if (map) map.invalidateSize(); }).observe(mapBox);
  }
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
  // English overlays (optional; graceful fallback to Chinese if missing)
  enEntries    = (await loadJson('data/vienna-journey.en.json'))    || {};
  enMilestones = (await loadJson('data/vienna-milestones.en.json')) || {};
}

async function loadJson(url) {
  try {
    const r = await fetch(url);
    return r.ok ? await r.json() : null;
  } catch (e) {
    return null;
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

  tileLayer = L.tileLayer(tileUrl(currentTheme()), {
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
    const e = tr(entry);
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
        <div class="popup-work">${e.work}</div>
        <div class="popup-person">${e.person || ''}</div>
        <div class="popup-year">${e.year} · ${e.city}</div>
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
  let visibleCount = 0;

  entries.forEach(entry => {
    const marker   = markers[entry.id];
    const dot      = timelineDots[entry.id];
    const card     = listCards[entry.id];
    const catOk    = activeCategories.has(entry.category);
    const searchOk = !q || matchSearch(entry, q);
    const visible  = catOk && searchOk;
    if (visible) visibleCount++;

    if (marker) {
      if (visible) marker.addTo(map);
      else marker.remove();
    }

    if (dot) {
      dot.classList.toggle('dimmed', !visible);
      dot.style.pointerEvents = visible ? '' : 'none';
    }

    if (card) {
      card.classList.toggle('hidden', !visible);
    }
  });

  const countEl = document.getElementById('list-count');
  if (countEl) countEl.textContent = UI[lang].count(visibleCount, entries.length);
}

function matchSearch(entry, q) {
  const e = tr(entry);
  return (entry.work || '').toLowerCase().includes(q)
    || (e.work || '').toLowerCase().includes(q)
    || (entry.person || '').toLowerCase().includes(q)
    || (e.person || '').toLowerCase().includes(q)
    || (entry.genre || '').toLowerCase().includes(q)
    || (e.genre || '').toLowerCase().includes(q)
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

/* ── THEME (dark / light) ── */
const THEME_KEY = 'vienna-journey-theme';
function currentTheme() {
  return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
}
function tileUrl(theme) {
  return theme === 'light'
    ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
}
function applyTheme(theme) {
  document.documentElement.classList.toggle('theme-light', theme === 'light');
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'light' ? '☀️' : '🌙';
  if (tileLayer) tileLayer.setUrl(tileUrl(theme));
  localStorage.setItem(THEME_KEY, theme);
}
function initTheme() {
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      applyTheme(currentTheme() === 'light' ? 'dark' : 'light');
    });
  }
  applyTheme(currentTheme());
}

/* ── I18N (中 / EN) ── */
const LANG_KEY = 'vienna-journey-lang';
const UI = {
  zh: {
    'subtitle': '维也纳文化地图',
    'view-map': '🗺 地图', 'view-list': '☰ 列表',
    'cat-music': '音乐', 'cat-visual-art': '视觉艺术', 'cat-architecture': '建筑',
    'cat-psychoanalysis': '精神分析', 'cat-philosophy': '哲学', 'cat-literature': '文学',
    'search-ph': '搜索作品或人物…',
    'theme-title': '切换深色 / 浅色',
    'lang-btn': 'EN',
    'empty': '点击地图标记、作品列表<br>或时间轴上的节点<br>探索维也纳的文化版图',
    'lbl-context': '背景', 'lbl-meaning': '意义', 'lbl-place': '地点', 'lbl-links': '延伸阅读', 'lbl-source': '来源',
    'listen-apple': '在 Apple Music 搜索', 'listen-spotify': '在 Spotify 搜索',
    'listen-youtube': '在 YouTube 搜索', 'listen-bilibili': '在 Bilibili 搜索',
    'source-fallback': '来源',
    'back-to-map': '🗺 在地图上查看',
    'count': (n, t) => `显示 ${n} / ${t} 件作品`,
  },
  en: {
    'subtitle': 'A Cultural Map of Vienna',
    'view-map': '🗺 Map', 'view-list': '☰ List',
    'cat-music': 'Music', 'cat-visual-art': 'Visual Art', 'cat-architecture': 'Architecture',
    'cat-psychoanalysis': 'Psychoanalysis', 'cat-philosophy': 'Philosophy', 'cat-literature': 'Literature',
    'search-ph': 'Search works or people…',
    'theme-title': 'Toggle dark / light',
    'lang-btn': '中',
    'empty': "Click a map marker, a work in the list,<br>or a node on the timeline<br>to explore Vienna's cultural map",
    'lbl-context': 'Context', 'lbl-meaning': 'Significance', 'lbl-place': 'Place', 'lbl-links': 'Links', 'lbl-source': 'Source',
    'listen-apple': 'Search on Apple Music', 'listen-spotify': 'Search on Spotify',
    'listen-youtube': 'Search on YouTube', 'listen-bilibili': 'Search on Bilibili',
    'source-fallback': 'Source',
    'back-to-map': '🗺 View on map',
    'count': (n, t) => `Showing ${n} / ${t} works`,
  },
};

function tr(entry) {
  if (lang !== 'en') return entry;
  const ov = enEntries[entry.id];
  if (!ov) return entry;
  return {
    ...entry, ...ov,
    place:     { ...(entry.place || {}),     ...(ov.place || {}) },
    source:    { ...(entry.source || {}),    ...(ov.source || {}) },
    listening: { ...(entry.listening || {}), ...(ov.listening || {}) },
    image:     { ...(entry.image || {}),     ...(ov.image || {}) },
  };
}

function trMs(ms) {
  if (lang !== 'en') return ms;
  const ov = enMilestones[ms.id];
  return ov ? { ...ms, ...ov } : ms;
}

function applyUIStrings() {
  const dict = UI[lang];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const k = el.getAttribute('data-i18n');
    if (dict[k] !== undefined) el.textContent = dict[k];
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const k = el.getAttribute('data-i18n-html');
    if (dict[k] !== undefined) el.innerHTML = dict[k];
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const k = el.getAttribute('data-i18n-ph');
    if (dict[k] !== undefined) el.setAttribute('placeholder', dict[k]);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const k = el.getAttribute('data-i18n-title');
    if (dict[k] !== undefined) el.setAttribute('title', dict[k]);
  });
  document.documentElement.setAttribute('lang', lang === 'en' ? 'en' : 'zh-CN');
}

function initLang() {
  const btn = document.getElementById('lang-toggle');
  if (btn) btn.addEventListener('click', () => setLang(lang === 'en' ? 'zh' : 'en'));
}

function setLang(l) {
  lang = l;
  localStorage.setItem(LANG_KEY, l);
  const wasDetailOpen = document.body.classList.contains('detail-open');
  applyUIStrings();
  renderMarkers();
  renderTimeline();
  renderList();
  applyVisibility();
  if (selectedId) {
    const e = entries.find(x => x.id === selectedId);
    if (e) showDetail(tr(e));
    if (!wasDetailOpen) document.body.classList.remove('detail-open');
    const card = listCards[selectedId]; if (card) card.classList.add('selected');
    const dot  = timelineDots[selectedId]; if (dot) dot.classList.add('selected');
    const mk   = markers[selectedId]; if (mk) mk.openPopup();
  }
  fitLayout();
}

/* ── VIEW TOGGLE (map / list) ── */
function initViewToggle() {
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });
}

function setView(view) {
  document.querySelectorAll('.view-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  document.body.classList.toggle('view-list', view === 'list');
  document.body.classList.remove('detail-open');  // switching view closes the detail sheet
  // Leaflet needs a size recalculation once its container is shown again
  if (view === 'map' && map) {
    setTimeout(() => map.invalidateSize(), 0);
  }
}

/* ── DETAIL: back-to-map + responsive layout fit ── */
function initDetailBack() {
  const btn = document.getElementById('detail-back');
  if (btn) btn.addEventListener('click', goToMap);
}

function goToMap() {
  document.body.classList.remove('detail-open');
  setView('map');
  const entry = entries.find(e => e.id === selectedId);
  if (entry && map) {
    map.setView([entry.lat, entry.lng], Math.max(map.getZoom(), 15), { animate: true });
    if (markers[selectedId]) markers[selectedId].openPopup();
  }
}

// Keep the map/list area exactly below the header, whatever height it wraps to
function fitLayout() {
  const header = document.getElementById('header');
  const layout = document.getElementById('layout');
  if (header && layout) layout.style.top = header.offsetHeight + 'px';
  if (map) map.invalidateSize();
}

/* ── LIST VIEW ── */
function renderList() {
  const grid = document.getElementById('list-grid');
  grid.innerHTML = '';
  listCards = {};

  [...entries].sort((a, b) => a.year - b.year).forEach(entry => {
    const e = tr(entry);
    const color = CAT_COLORS[entry.category] || '#aaa';
    const card = document.createElement('div');
    card.className = 'list-card';
    card.dataset.id = entry.id;
    card.style.setProperty('--cat-color', color);
    card.innerHTML = `
      <div class="list-card-cat">${catLabel(entry.category)}</div>
      <div class="list-card-work">${e.work}</div>
      <div class="list-card-person">${e.person || ''}</div>
      <div class="list-card-meta">${e.year} · ${e.city}</div>
    `;
    card.addEventListener('click', () => selectEntry(entry.id));
    grid.appendChild(card);
    listCards[entry.id] = card;
  });
}

/* ── TIMELINE ── */
function renderTimeline() {
  const inner = document.getElementById('timeline-inner');

  // clear previous render (keep the axis) so this can re-run on language switch
  inner.querySelectorAll('.tl-year-label, .tl-milestone, .tl-entry-dot').forEach(el => el.remove());
  timelineDots = {};

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
    label.textContent = trMs(ms).labelShort;

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
    dot.title = `${entry.year} · ${tr(entry).work}`;
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
  const m = trMs(ms);
  document.getElementById('ms-year').textContent  = m.year;
  document.getElementById('ms-label').textContent = m.label;
  document.getElementById('ms-desc').textContent  = m.description;

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
  selectedId = id;

  // Update timeline dots + list cards
  Object.entries(timelineDots).forEach(([eid, dot]) => {
    dot.classList.toggle('selected', eid === id);
  });
  Object.entries(listCards).forEach(([eid, card]) => {
    card.classList.toggle('selected', eid === id);
  });

  // Pan map to marker
  const entry = entries.find(e => e.id === id);
  if (!entry) return;

  map.setView([entry.lat, entry.lng], Math.max(map.getZoom(), 15), { animate: true });
  if (markers[id]) {
    markers[id].openPopup();
  }

  showDetail(tr(entry));
}

function deselect() {
  selectedId = null;
  document.body.classList.remove('detail-open');
  Object.values(timelineDots).forEach(d => d.classList.remove('selected'));
  Object.values(listCards).forEach(c => c.classList.remove('selected'));
  map.closePopup();
  document.getElementById('detail-empty').style.display = '';
  document.getElementById('detail-content').classList.remove('visible');
}

/* ── DETAIL PANEL ── */
function showDetail(entry) {
  document.getElementById('detail-empty').style.display = 'none';
  document.getElementById('detail-content').classList.add('visible');
  document.body.classList.add('detail-open');

  const color = CAT_COLORS[entry.category] || '#aaa';
  const catLabelText = catLabel(entry.category);

  // Badge
  document.getElementById('detail-badge-dot').style.background = color;
  document.getElementById('detail-badge-label').textContent = catLabelText;
  document.getElementById('detail-badge').style.color = color;

  // Header
  document.getElementById('detail-work').textContent   = entry.work || '';
  document.getElementById('detail-person').textContent = entry.person || '';
  document.getElementById('detail-meta').textContent   =
    [entry.year, entry.city, entry.country].filter(Boolean).join(' · ');

  // Image
  const imgEl = document.getElementById('detail-image');
  if (entry.image && entry.image.url) {
    const cap = entry.image.caption ? entry.image.caption + ' · ' : '';
    imgEl.style.display = '';
    imgEl.innerHTML = `
      <img src="${entry.image.url}" alt="${(entry.work || '').replace(/"/g, '&quot;')}" loading="lazy" />
      <figcaption>${cap}<a href="${entry.image.page}" target="_blank" rel="noopener noreferrer">${entry.image.credit || '来源'}</a></figcaption>
    `;
  } else {
    imgEl.style.display = 'none';
    imgEl.innerHTML = '';
  }

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
    if (entry.listening.appleMusicSearch) {
      allLinks.push({ label: UI[lang]['listen-apple'], url: entry.listening.appleMusicSearch });
    }
    if (entry.listening.spotifySearch) {
      allLinks.push({ label: UI[lang]['listen-spotify'], url: entry.listening.spotifySearch });
    }
    if (entry.listening.youtubeSearch) {
      allLinks.push({ label: UI[lang]['listen-youtube'], url: entry.listening.youtubeSearch });
    }
    if (entry.listening.bilibiliSearch) {
      allLinks.push({ label: UI[lang]['listen-bilibili'], url: entry.listening.bilibiliSearch });
    }
  }
  if (entry.source && entry.source.url) {
    allLinks.push({ label: entry.source.label || UI[lang]['source-fallback'], url: entry.source.url });
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
