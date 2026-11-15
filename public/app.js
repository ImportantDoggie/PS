'use strict';
/* Console Launcher — frontend */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const isDesktop = !!window.desktop?.isDesktop;

const state = {
  mode: 'preview', games: [], settings: {}, views: [], notifications: [], sessions: [], scan: {},
  tab: 'favorites', selectedId: 'plague',
  filter: { source: 'all', installed: 'all', genre: 'all', hidden: false }, sort: 'manual',
  panel: null, searchQuery: '', lm: { search: '', sort: 'manual', filter: 'all', selected: new Set(), lastIdx: null },
  sound: true, bgFlip: false, sessionGame: null, sessionStart: 0, sessionTimer: null, overlayVisible: false
};

/* ---------- API ---------- */
async function api(path, method = 'GET', body) {
  const res = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j;
}
async function desktop(action, body) {
  if (!isDesktop) { toast('Доступно в desktop-версии (Electron)', 'warn'); return { ok: false }; }
  return window.desktop.invoke(action, body);
}

/* ---------- Sound ---------- */
let actx;
function tick(kind = 'nav') {
  if (!state.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime;
    const o = actx.createOscillator(), g = actx.createGain();
    o.connect(g); g.connect(actx.destination);
    const f = kind === 'nav' ? 720 : kind === 'select' ? 980 : kind === 'back' ? 420 : kind === 'launch' ? 520 : 600;
    o.type = 'sine'; o.frequency.setValueAtTime(f, t);
    if (kind === 'launch') o.frequency.exponentialRampToValueAtTime(1040, t + .18);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(kind === 'launch' ? .12 : .05, t + .008); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'launch' ? .25 : .07));
    o.start(t); o.stop(t + .3);
  } catch {}
}

/* ---------- Helpers ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h) return `${h} ч ${m} мин`;
  if (m) return `${m} мин`;
  return `${sec} с`;
}
function fmtClock(sec) { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return (h ? String(h).padStart(2, '0') + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); }
function fmtDate(ts) { if (!ts) return '—'; const d = new Date(ts); const diff = (Date.now() - ts) / 86400000; if (diff < 1) return 'Сегодня'; if (diff < 2) return 'Вчера'; if (diff < 7) return `${Math.floor(diff)} дн. назад`; return d.toLocaleDateString('ru-RU'); }
const sourceLabel = s => ({ steam: 'Steam', epic: 'Epic Games', gog: 'GOG', ea: 'EA / Origin', ubisoft: 'Ubisoft Connect', xbox: 'Xbox', itch: 'itch.io', shortcut: 'Ярлык', registry: 'Реестр Windows', manual: 'Добавлено вручную', battlenet: 'Battle.net' }[s] || s);
const byId = id => state.games.find(g => g.id === id);
const isRunning = id => state.sessions.some(s => s.gameId === id);

function visibleGames() {
  let list = state.games.filter(g => state.filter.hidden ? true : !g.hidden);
  if (state.tab === 'favorites') list = list.filter(g => g.favorite);
  if (state.tab === 'recent') list = list.filter(g => g.lastPlayed);
  if (state.filter.source !== 'all') list = list.filter(g => g.source === state.filter.source);
  if (state.filter.installed === 'installed') list = list.filter(g => g.installed);
  if (state.filter.installed === 'not') list = list.filter(g => !g.installed);
  if (state.filter.genre !== 'all') list = list.filter(g => (g.genres || []).includes(state.filter.genre));
  const sort = state.tab === 'most' ? 'playtime' : state.tab === 'recent' ? 'recent' : state.sort;
  list = [...list];
  if (sort === 'name') list.sort((a, b) => (a.sortName || a.name).localeCompare(b.sortName || b.name, 'ru'));
  else if (sort === 'playtime') list.sort((a, b) => (b.playtimeSeconds || 0) - (a.playtimeSeconds || 0));
  else if (sort === 'recent') list.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
  else if (sort === 'year') list.sort((a, b) => (b.releaseYear || 0) - (a.releaseYear || 0));
  else list.sort((a, b) => (a.order || 0) - (b.order || 0));
  return list;
}

/* ---------- Toasts ---------- */
function toast(msg, type = 'info', action) {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = () => { action.fn(); kill(); }; el.appendChild(b); }
  $('#toasts').appendChild(el);
  const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 260); };
  setTimeout(kill, action ? 7000 : 3600);
}

/* ---------- Background / selection ---------- */
function setBackground(url) {
  if (!url || url === state._bgUrl) return;
  state._bgUrl = url;
  const next = state.bgFlip ? $('#bgA') : $('#bgB');
  const prev = state.bgFlip ? $('#bgB') : $('#bgA');
  const img = new Image();
  img.onload = () => { next.style.backgroundImage = `url("${url}")`; next.classList.add('show'); prev.classList.remove('show'); state.bgFlip = !state.bgFlip; };
  img.onerror = () => { next.style.backgroundImage = 'linear-gradient(160deg,#1a2230,#05070a)'; next.classList.add('show'); prev.classList.remove('show'); state.bgFlip = !state.bgFlip; };
  img.src = url;
}
function selectGame(id, opts = {}) {
  const g = byId(id); if (!g) return;
  const changed = state.selectedId !== id;
  state.selectedId = id;
  setBackground(g.hero || g.cover);
  const wrap = $('.logo-wrap'), logo = $('#gameLogo'), title = $('#gameTitle');
  const src = g.logo || '';
  const apply = () => {
    if (src) { wrap.classList.remove('no-logo'); logo.src = src; logo.alt = g.name; logo.onerror = () => { wrap.classList.add('no-logo'); title.textContent = g.name; }; }
    else { wrap.classList.add('no-logo'); title.textContent = g.name; }
    logo.classList.remove('swap');
  };
  if (changed && !opts.instant) { logo.classList.add('swap'); setTimeout(apply, 120); } else apply();
  $('#metaPlatform').textContent = g.platform || 'PC (Windows)';
  $('#metaYear').textContent = g.releaseYear || '';
  $('#metaCloud').style.display = g.cloud ? '' : 'none';
  $('#btnFav').classList.toggle('off', !g.favorite);
  const pt = $('#metaPlaytime'); pt.textContent = g.playtimeSeconds ? fmtTime(g.playtimeSeconds) : ''; pt.classList.toggle('on', !!g.playtimeSeconds);
  const running = isRunning(g.id);
  const label = running ? 'Остановить' : g.installed ? 'Играть' : 'Установить';
  $('#hintInstall').textContent = label; $('#touchInstall').textContent = label;
  $$('.cover').forEach(c => c.classList.toggle('selected', c.dataset.id === id));
  positionTrack();
  if (changed && !opts.silent) tick('nav');
}

/* ---------- Carousel ---------- */
function computeSizes() {
  const W = innerWidth, H = innerHeight;
  let cw = Math.round(Math.min(152, Math.max(84, W * 0.079)));
  if (W < 900) cw = Math.round(Math.min(112, Math.max(72, W * 0.17)));
  const ch = Math.round(cw * 1.35), sw = Math.round(cw * 1.25), sh = Math.round(sw * 1.316), gap = Math.round(cw * 0.33);
  const r = document.documentElement.style;
  r.setProperty('--cw', cw + 'px'); r.setProperty('--ch', ch + 'px'); r.setProperty('--sw', sw + 'px'); r.setProperty('--sh', sh + 'px'); r.setProperty('--gap', gap + 'px');
  return { cw, ch, sw, sh, gap };
}
function positionTrack() {
  const { cw, sw, gap } = computeSizes();
  const list = visibleGames();
  const idx = list.findIndex(g => g.id === state.selectedId);
  let x = 0, selCenter = sw / 2;
  for (let i = 0; i < list.length; i++) { const w = i === idx ? sw : cw; if (i === idx) { selCenter = x + w / 2; break; } x += w + gap; }
  const anchor = innerWidth < 900 ? innerWidth * 0.5 : innerWidth * 0.396;
  $('#track').style.transform = `translateX(${Math.round(anchor - selCenter)}px)`;
}
function renderCarousel() {
  const list = visibleGames();
  const track = $('#track');
  track.innerHTML = '';
  $('#carouselEmpty').hidden = list.length > 0;
  if (!list.find(g => g.id === state.selectedId)) state.selectedId = list[0]?.id || null;
  for (const g of list) {
    const el = document.createElement('div');
    el.className = 'cover' + (g.favorite ? ' fav' : '') + (g.installed ? '' : ' uninstalled') + (isRunning(g.id) ? ' running' : '');
    el.dataset.id = g.id; el.tabIndex = 0; el.setAttribute('role', 'button'); el.setAttribute('aria-label', g.name);
    el.innerHTML = `<img src="${esc(g.cover || g.hero || '')}" alt="" loading="lazy" draggable="false" onerror="this.parentNode.classList.add('no-img')"><div class="cover-fallback">${esc(g.name)}</div><div class="not-installed"></div><svg class="fav-mark"><use href="#i-star"/></svg>${g.installed ? '' : '<span class="state-mark" title="Не установлена">↓</span>'}<div class="label">${esc(g.name)}</div>`;
    el.addEventListener('click', () => { if (state.selectedId === g.id) openDetails(g.id); else selectGame(g.id); });
    el.addEventListener('dblclick', () => primaryAction(g.id));
    el.addEventListener('contextmenu', e => { e.preventDefault(); selectGame(g.id, { silent: true }); openContext(e.clientX, e.clientY, g.id); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter') openDetails(g.id); });
    track.appendChild(el);
  }
  if (state.selectedId) selectGame(state.selectedId, { instant: true, silent: true }); else { $('#gameLogo').removeAttribute('src'); $('.logo-wrap').classList.add('no-logo'); $('#gameTitle').textContent = 'Библиотека пуста'; }
  positionTrack();
}
function moveSel(dir) {
  const list = visibleGames(); if (!list.length) return;
  let i = list.findIndex(g => g.id === state.selectedId);
  i = Math.max(0, Math.min(list.length - 1, i + dir));
  selectGame(list[i].id);
}
function switchTab(tab) {
  state.tab = tab;
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  renderCarousel(); tick('select');
}

/* ---------- Panels ---------- */
const panels = ['searchPanel', 'filterDrawer', 'detailsDrawer', 'settingsDrawer', 'scanDrawer', 'notifDrawer', 'gamepadDrawer'];
function openPanel(id) {
  closePanels(true);
  state.panel = id;
  $('#' + id).hidden = false; $('#backdrop').hidden = false;
  if (id === 'searchPanel') { $('#searchInput').value = state.searchQuery; renderSearch(); setTimeout(() => $('#searchInput').focus(), 30); }
  if (id === 'filterDrawer') syncFilterUI();
  if (id === 'settingsDrawer') syncSettingsUI();
  if (id === 'scanDrawer') renderScan();
  if (id === 'notifDrawer') renderNotifs();
  if (id === 'gamepadDrawer') $('#gpSound').checked = state.sound;
  tick('select');
}
function closePanels(silent) {
  panels.forEach(p => $('#' + p).hidden = true);
  $('#backdrop').hidden = true; state.panel = null;
  if (!silent) tick('back');
}
function openLibrary() { $('#libraryManager').hidden = false; state.lm.selected.clear(); renderLibrary(); tick('select'); }
function closeLibrary() { $('#libraryManager').hidden = true; tick('back'); }

/* ---------- Primary actions ---------- */
async function primaryAction(id) {
  const g = byId(id || state.selectedId); if (!g) return;
  if (isRunning(g.id)) { await stopSession(g.id); return; }
  if (!g.installed) return installGame(g);
  tick('launch');
  try {
    const r = await api(`/games/${g.id}/launch`, 'POST');
    if (!r.ok) return toast(r.error || 'Не удалось запустить', 'error');
    await refreshSessions();
    showSession(g);
    toast(r.demo ? `Демо-сессия: ${g.name}` : `Запущено: ${g.name}`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}
async function installGame(g) {
  toast(`Установка ${g.name}…`, 'info');
  try {
    const r = await api(`/games/${g.id}/install`, 'POST');
    if (!r.ok) return toast(r.error || 'Нет ссылки установки', 'warn');
    if (r.demo) { g.installed = true; renderCarousel(); renderLibrary(); toast(`${g.name} установлена`, 'success'); }
    else toast('Магазин открыт. После установки нажмите «Сканировать».', 'info');
  } catch (e) { toast(e.message, 'error'); }
}
async function stopSession(id) {
  try { const r = await api(`/games/${id}/stop`, 'POST'); hideSession(); await loadState(); toast(`Сессия завершена: ${fmtTime(r.elapsed || 0)}`, 'success'); } catch (e) { toast(e.message, 'error'); }
}
function showSession(g) {
  state.sessionGame = g.id; state.sessionStart = Date.now();
  $('#sessionLogo').src = g.logo || ''; $('#sessionLogo').style.display = g.logo ? '' : 'none';
  $('#sessionLabel').textContent = state.mode === 'preview' ? 'Демо-сессия запущена' : 'Игра запущена';
  $('#sessionOverlay').hidden = false; state.overlayVisible = true;
  clearInterval(state.sessionTimer);
  state.sessionTimer = setInterval(() => { $('#sessionTimer').textContent = fmtClock(Math.floor((Date.now() - state.sessionStart) / 1000)); }, 500);
  $('#sessionTimer').textContent = '00:00';
  clearTimeout(state._overlayAuto);
  state._overlayAuto = setTimeout(() => { if (state.overlayVisible) { $('#sessionOverlay').hidden = true; state.overlayVisible = false; } }, 3500);
  renderRunningPill();
}
function hideSession() { clearInterval(state.sessionTimer); $('#sessionOverlay').hidden = true; state.overlayVisible = false; state.sessionGame = null; renderRunningPill(); }
function renderRunningPill() {
  const s = state.sessions[0];
  const pill = $('#runningPill');
  if (!s) { pill.hidden = true; return; }
  const g = byId(s.gameId);
  pill.hidden = false; $('#runningText').textContent = `${g?.name || 'Игра'} · ${fmtClock(s.elapsed || 0)}`;
}
async function refreshSessions() {
  try {
    const st = await api('/state');
    const before = state.sessions.map(s => s.gameId).join(',');
    state.sessions = st.sessions;
    const after = state.sessions.map(s => s.gameId).join(',');
    renderRunningPill();
    if (before !== after) renderCarousel();
    else $$('.cover').forEach(c => c.classList.toggle('running', isRunning(c.dataset.id)));
    if (state.sessionGame) { const s = state.sessions.find(x => x.gameId === state.sessionGame); if (s) state.sessionStart = Date.now() - (s.elapsed || 0) * 1000; }
    if (state.panel === 'scanDrawer') renderScan();
  } catch {}
}
async function toggleFav(id) {
  const g = byId(id || state.selectedId); if (!g) return;
  g.favorite = !g.favorite; renderCarousel(); renderLibrary();
  try { await api(`/games/${g.id}/favorite`, 'POST', { favorite: g.favorite }); } catch (e) { toast(e.message, 'error'); }
  toast(g.favorite ? 'Добавлено в избранное' : 'Убрано из избранного', 'info'); tick('select');
}

/* ---------- Details ---------- */
function openDetails(id) {
  const g = byId(id || state.selectedId); if (!g) return;
  state.detailsId = g.id;
  $('#detailsHero').style.backgroundImage = `url("${g.hero || g.cover || ''}")`;
  $('#detailsLogo').src = g.logo || ''; $('#detailsLogo').style.display = g.logo ? '' : 'none';
  $('#detailsTitle').textContent = g.name;
  $('#detailsDesc').textContent = g.description || 'Описание не добавлено.';
  $('#detailsChips').innerHTML = (g.genres || []).map(x => `<span class="chip">${esc(x)}</span>`).join('') + `<span class="chip ${g.installed ? 'ok' : 'warn'}">${g.installed ? 'Установлена' : 'Не установлена'}</span>` + (g.favorite ? '<span class="chip accent">★ Избранное</span>' : '') + (g.cloud ? '<span class="chip">Облачные сохранения</span>' : '');
  $('#detailsPlaytime').textContent = fmtTime(g.playtimeSeconds);
  $('#detailsLast').textContent = fmtDate(g.lastPlayed);
  $('#detailsSource').textContent = sourceLabel(g.source);
  $('#detailsYear').textContent = g.releaseYear || '—';
  $('#detailsPath').textContent = g.exePath || g.launchUri || g.installDir || 'Путь запуска не указан';
  const running = isRunning(g.id);
  $('#detailsLaunch span').textContent = running ? 'Остановить' : g.installed ? 'Играть' : 'Установить';
  $('#detailsFav span').textContent = g.favorite ? 'Убрать из избранного' : 'В избранное';
  openPanel('detailsDrawer');
}

/* ---------- Search ---------- */
function renderSearch() {
  const q = state.searchQuery.trim().toLowerCase();
  const list = state.games.filter(g => !g.hidden && (!q || g.name.toLowerCase().includes(q) || (g.genres || []).join(' ').toLowerCase().includes(q) || (g.developers || []).join(' ').toLowerCase().includes(q)));
  const box = $('#searchResults');
  if (!list.length) { box.innerHTML = '<div class="search-empty">Ничего не найдено</div>'; return; }
  box.innerHTML = list.slice(0, 30).map((g, i) => `<div class="search-item${i === 0 ? ' active' : ''}" data-id="${g.id}"><img src="${esc(g.cover || '')}" alt="" onerror="this.style.visibility='hidden'"><div><div class="si-name">${esc(g.name)}</div><div class="si-sub">${esc(sourceLabel(g.source))} · ${esc((g.genres || []).join(', '))} · ${fmtTime(g.playtimeSeconds)}</div></div><div class="si-right">${g.installed ? 'Играть' : 'Установить'}</div></div>`).join('');
  $$('.search-item', box).forEach(el => el.addEventListener('click', () => { selectGame(el.dataset.id, { silent: true }); closePanels(true); openDetails(el.dataset.id); }));
}

/* ---------- Filter ---------- */
function syncFilterUI() {
  $('#fSource').value = state.filter.source; $('#fInstalled').value = state.filter.installed; $('#fSort').value = state.sort; $('#fHidden').checked = state.filter.hidden;
  const genres = [...new Set(state.games.flatMap(g => g.genres || []))].sort();
  $('#fGenre').innerHTML = '<option value="all">Все жанры</option>' + genres.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
  $('#fGenre').value = state.filter.genre;
  $('#savedViews').innerHTML = state.views.map(v => `<div class="saved-view"><button data-view="${v.id}">${esc(v.name)}</button><button data-delview="${v.id}" title="Удалить">✕</button></div>`).join('') || '<div class="muted small">Нет сохранённых видов</div>';
  $$('[data-view]').forEach(b => b.onclick = () => { const v = state.views.find(x => x.id === b.dataset.view); if (!v) return; state.tab = v.tab; state.searchQuery = v.search || ''; state.filter = { hidden: false, ...v.filter }; state.sort = v.sort; $$('#tabs button').forEach(x => x.classList.toggle('active', x.dataset.tab === state.tab)); renderCarousel(); closePanels(); toast(`Вид «${v.name}» применён`); });
  $$('[data-delview]').forEach(b => b.onclick = async () => { await api('/views/' + b.dataset.delview, 'DELETE'); state.views = state.views.filter(v => v.id !== b.dataset.delview); syncFilterUI(); });
}
function applyFilter() { state.filter.source = $('#fSource').value; state.filter.installed = $('#fInstalled').value; state.filter.genre = $('#fGenre').value; state.filter.hidden = $('#fHidden').checked; state.sort = $('#fSort').value; renderCarousel(); }

/* ---------- Settings ---------- */
const sourceNames = { steam: 'Steam', epic: 'Epic Games', gog: 'GOG', ea: 'EA / Origin', ubisoft: 'Ubisoft', battlenet: 'Battle.net', xbox: 'Xbox / Game Pass', itch: 'itch.io', shortcuts: 'Ярлыки', registry: 'Реестр Windows', folders: 'Мои папки' };
function syncSettingsUI() {
  const s = state.settings;
  $('#sourceToggles').innerHTML = Object.entries(sourceNames).map(([k, n]) => `<label class="check"><input type="checkbox" data-source="${k}" ${s.scanSources?.[k] !== false ? 'checked' : ''}/> ${n}</label>`).join('');
  $$('[data-source]').forEach(c => c.onchange = () => saveSettings({ scanSources: { [c.dataset.source]: c.checked } }));
  $('#setScanStartup').checked = !!s.scanOnStartup; $('#setTrack').checked = s.trackPlaytime !== false; $('#setStartupWin').checked = !!s.startWithWindows; $('#setTray').checked = s.minimizeToTray !== false; $('#setFullscreen').checked = s.fullscreen !== false; $('#setSound').checked = s.sound !== false; $('#setClock').checked = s.showClock !== false;
  $('#folderList').innerHTML = (s.customFolders || []).map((f, i) => `<div class="folder-item"><span title="${esc(f)}">${esc(f)}</span><button class="icon-btn" data-delfolder="${i}">✕</button></div>`).join('') || '<div class="muted small">Папки не добавлены</div>';
  $$('[data-delfolder]').forEach(b => b.onclick = () => { const f = [...state.settings.customFolders]; f.splice(+b.dataset.delfolder, 1); saveSettings({ customFolders: f }); });
  $('#desktopInfo').textContent = isDesktop ? 'Desktop-версия: реальное сканирование, запуск и учёт времени.' : 'Предпросмотр в браузере: демо-библиотека. Полная версия — Electron (npm run desktop).';
}
async function saveSettings(patch) {
  Object.assign(state.settings, patch);
  if (patch.scanSources) state.settings.scanSources = { ...state.settings.scanSources, ...patch.scanSources };
  if (patch.sound !== undefined) setSound(patch.sound);
  if (patch.showClock !== undefined) $('#clock').style.display = patch.showClock ? '' : 'none';
  try { await api('/settings', 'POST', patch); } catch (e) { toast(e.message, 'error'); }
  syncSettingsUI();
}
function setSound(on) { state.sound = on; $('#btnSound use').setAttribute('href', on ? '#i-volume' : '#i-mute'); $('#btnSound').style.opacity = on ? '' : '.45'; }

/* ---------- Scan ---------- */
function renderScan() {
  const s = state.scan || {};
  $('#scanStatusText').textContent = s.running ? `Сканирование: ${s.source || ''}` : s.phase === 'done' ? `Готово: найдено ${s.found || 0} игр` : s.phase === 'error' ? 'Ошибка: ' + s.error : 'Готово к сканированию';
  $('#scanBar').style.width = s.running && s.total ? `${Math.round((s.done / s.total) * 100)}%` : s.phase === 'done' ? '100%' : '0%';
  $('#scanMeta').textContent = s.running ? `${s.done} / ${s.total} источников` : `В библиотеке ${state.games.length} игр · установлено ${state.games.filter(g => g.installed).length}`;
  $('#scanNow').disabled = !!s.running;
  $('#activeSessions').innerHTML = state.sessions.map(x => { const g = byId(x.gameId); return `<div class="session-row"><span class="pulse"></span><strong>${esc(g?.name || x.gameId)}</strong><span>${fmtClock(x.elapsed || 0)}</span><button class="btn tiny" data-stop="${x.gameId}">Стоп</button></div>`; }).join('') || '<div class="muted small">Нет активных сессий</div>';
  $$('[data-stop]').forEach(b => b.onclick = () => stopSession(b.dataset.stop));
  $('#scanEvents').innerHTML = state.notifications.slice(0, 6).map(n => `<div class="event-row"><span>${esc(n.title)}</span><time>${fmtDate(n.ts)}</time></div>`).join('') || '<div class="muted small">Событий пока нет</div>';
  $('#scanDot').classList.toggle('on', !!s.running);
}
async function startScan() {
  try { await api('/scan', 'POST'); state.scan = { running: true, phase: 'scan', done: 0, total: 1 }; renderScan(); if (state.panel !== 'scanDrawer') openPanel('scanDrawer'); } catch (e) { toast(e.message, 'error'); }
}

/* ---------- Notifications ---------- */
function renderNotifs() {
  $('#notifList').innerHTML = state.notifications.map(n => `<div class="notif ${n.type} ${n.read ? '' : 'unread'}"><div class="n-ico"><svg><use href="#${n.type === 'success' ? 'i-check' : 'i-info'}"/></svg></div><div><div class="n-title">${esc(n.title)}</div><div class="n-body">${esc(n.body)}</div></div><time>${fmtDate(n.ts)}</time></div>`).join('') || '<div class="muted small">Нет уведомлений</div>';
  $('#notifDot').classList.toggle('on', state.notifications.some(n => !n.read));
}

/* ---------- Library manager ---------- */
function lmList() {
  let list = Array.isArray(state.games) ? [...state.games] : [];
  for (const id of [...state.lm.selected]) if (!list.some(g => g.id === id)) state.lm.selected.delete(id);

  const q = state.lm.search.trim().toLowerCase();
  if (q) list = list.filter(g => g.name.toLowerCase().includes(q));
  if (state.lm.filter === 'favorites') list = list.filter(g => g.favorite);
  if (state.lm.filter === 'installed') list = list.filter(g => g.installed);
  if (state.lm.filter === 'not') list = list.filter(g => !g.installed);
  if (state.lm.filter === 'hidden') list = list.filter(g => g.hidden); else list = list.filter(g => !g.hidden);
  
  const s = state.lm.sort;
  if (s === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  else if (s === 'playtime') list.sort((a, b) => (b.playtimeSeconds || 0) - (a.playtimeSeconds || 0));
  else if (s === 'recent') list.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
  else if (s === 'year') list.sort((a, b) => (b.releaseYear || 0) - (a.releaseYear || 0));
  else list.sort((a, b) => (a.order || 0) - (b.order || 0));
  return list;
}
function renderLibrary() {
  if ($('#libraryManager').hidden) return;
  const list = lmList();
  $('#lmCount').textContent = `${list.length} игр`;
  const grid = $('#lmGrid');
  grid.innerHTML = list.map((g, i) => `<div class="lm-card${state.lm.selected.has(g.id) ? ' selected' : ''}" draggable="true" data-id="${g.id}" data-idx="${i}">${g.cover ? `<img src="${esc(g.cover)}" alt="" onerror="this.remove()">` : ''}<div class="lm-fallback" ${g.cover ? 'style="display:none"' : ''}>${esc(g.name)}</div><div class="lm-check"><svg><use href="#i-check"/></svg></div>${g.favorite ? '<svg class="lm-fav"><use href="#i-star"/></svg>' : ''}${g.installed ? '' : '<span class="lm-state">не установлена</span>'}<div class="lm-info"><div class="lm-name">${esc(g.name)}</div><div class="lm-sub">${esc(sourceLabel(g.source))} · ${fmtTime(g.playtimeSeconds)}</div></div></div>`).join('');
  $$('.lm-card', grid).forEach(card => {
    const id = card.dataset.id;
    card.addEventListener('click', e => {
      const idx = +card.dataset.idx;
      if (e.shiftKey && state.lm.lastIdx !== null) { const [a, b] = [Math.min(state.lm.lastIdx, idx), Math.max(state.lm.lastIdx, idx)]; list.slice(a, b + 1).forEach(g => state.lm.selected.add(g.id)); }
      else if (state.lm.selected.has(id)) state.lm.selected.delete(id); else state.lm.selected.add(id);
      state.lm.lastIdx = idx; renderLibrary();
    });
    card.addEventListener('dblclick', () => { closeLibrary(); selectGame(id, { silent: true }); openDetails(id); });
    card.addEventListener('contextmenu', e => { e.preventDefault(); openContext(e.clientX, e.clientY, id); });
    card.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', id); card.classList.add('dragging'); });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('dragover', e => { e.preventDefault(); card.classList.add('drag-over'); });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', async e => {
      e.preventDefault(); card.classList.remove('drag-over');
      const from = e.dataTransfer.getData('text/plain'); if (!from || from === id) return;
      const ids = state.games.sort((a, b) => (a.order || 0) - (b.order || 0)).map(g => g.id);
      const fi = ids.indexOf(from), ti = ids.indexOf(id); ids.splice(fi, 1); ids.splice(ti, 0, from);
      await api('/reorder', 'POST', { ids }); state.games.forEach(g => g.order = ids.indexOf(g.id)); renderLibrary(); renderCarousel(); toast('Порядок обновлён');
    });
  });
  const n = state.lm.selected.size;
  $('#lmBulk').hidden = n === 0; $('#lmBulkCount').textContent = `Выбрано: ${n}`;
}
async function bulk(action, value) {
  const ids = [...state.lm.selected]; if (!ids.length) return;
  if (action === 'delete') {
    const ok = await confirmDialog(`Удалить ${ids.length} игр из библиотеки?`, 'Файлы игр на диске не затрагиваются.'); if (!ok) return;
    try {
      const r = await api('/bulk', 'POST', { ids, action });
      state.games = state.games.filter(g => !ids.includes(g.id));
      state.lm.selected.clear();
      toast(`Удалено: ${ids.length}`, 'success', { label: 'Отменить', fn: async () => { for (const g of r.removed) await api(`/games/${g.id}/restore`, 'POST', g); await loadState(); } });
    } catch (e) { toast(e.message, 'error'); }
  } else {
    await api('/bulk', 'POST', { ids, action, value }); ids.forEach(id => { const g = byId(id); if (g) { if (action === 'favorite') g.favorite = value; if (action === 'hide') g.hidden = value; } });
    state.lm.selected.clear();
  }
  renderLibrary(); renderCarousel();
}

/* ---------- Context menu ---------- */
function openContext(x, y, id) {
  const g = byId(id); if (!g) return;
  const m = $('#ctxMenu');
  m.innerHTML = `<button data-c="play"><svg><use href="#i-play"/></svg>${isRunning(id) ? 'Остановить' : g.installed ? 'Играть' : 'Установить'}</button><button data-c="details"><svg><use href="#i-info"/></svg>Подробная информация</button><button data-c="fav"><svg><use href="#i-star"/></svg>${g.favorite ? 'Убрать из избранного' : 'В избранное'}</button><button data-c="edit"><svg><use href="#i-edit"/></svg>Изменить</button><button data-c="folder"><svg><use href="#i-folder"/></svg>Открыть папку</button><hr><button data-c="hide">${g.hidden ? 'Показать' : 'Скрыть'}</button><button data-c="delete" class="danger"><svg><use href="#i-trash"/></svg>Удалить из библиотеки</button>`;
  m.hidden = false;
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px'; m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  $$('button', m).forEach(b => b.onclick = async () => {
    m.hidden = true; const c = b.dataset.c;
    if (c === 'play') primaryAction(id); else if (c === 'details') openDetails(id); else if (c === 'fav') toggleFav(id); else if (c === 'edit') openGameModal(g); else if (c === 'folder') desktop('openPath', { path: g.installDir || (g.exePath ? g.exePath.replace(/[^\\/]+$/, '') : '') }); else if (c === 'hide') { await api(`/games/${id}`, 'PATCH', { hidden: !g.hidden }); g.hidden = !g.hidden; renderCarousel(); renderLibrary(); } else if (c === 'delete') deleteGame(id);
  });
}
document.addEventListener('click', e => { if (!e.target.closest('#ctxMenu')) $('#ctxMenu').hidden = true; });

/* ---------- Game modal ---------- */
function openGameModal(g) {
  $('#gameModalTitle').textContent = g ? 'Изменить игру' : 'Добавить игру';
  $('#gId').value = g?.id || ''; $('#gName').value = g?.name || ''; $('#gSource').value = g?.source || 'manual'; $('#gYear').value = g?.releaseYear || '';
  $('#gExe').value = g?.exePath || ''; $('#gArgs').value = g?.args || ''; $('#gUri').value = g?.launchUri || '';
  $('#gCover').value = g?.cover || ''; $('#gHero').value = g?.hero || ''; $('#gLogo').value = g?.logo || '';
  $('#gDesc').value = g?.description || ''; $('#gGenres').value = (g?.genres || []).join(', '); $('#gDev').value = (g?.developers || []).join(', ');
  $('#gInstalled').checked = g ? !!g.installed : true; $('#gFav').checked = !!g?.favorite; $('#gHidden').checked = !!g?.hidden;
  $('#gameModal').hidden = false; setTimeout(() => $('#gName').focus(), 30);
}
async function submitGame(e) {
  e.preventDefault();
  const body = { id: $('#gId').value || undefined, name: $('#gName').value, source: $('#gSource').value, releaseYear: +$('#gYear').value || null, exePath: $('#gExe').value, args: $('#gArgs').value, launchUri: $('#gUri').value, cover: $('#gCover').value, hero: $('#gHero').value, logo: $('#gLogo').value, description: $('#gDesc').value, genres: $('#gGenres').value, developers: $('#gDev').value, installed: $('#gInstalled').checked, favorite: $('#gFav').checked, hidden: $('#gHidden').checked };
  try {
    const r = await api('/games', 'POST', body);
    $('#gameModal').hidden = true; await loadState(); selectGame(r.game.id, { silent: true }); toast('Сохранено: ' + r.game.name, 'success');
  } catch (err) { toast(err.message, 'error'); }
}
async function deleteGame(id) {
  const g = byId(id); if (!g) return;
  const ok = await confirmDialog(`Удалить «${g.name}» из библиотеки?`, 'Файлы игры на диске не затрагиваются. Действие можно отменить.'); if (!ok) return;
  
  try {
    await api('/games/' + id, 'DELETE');
  } catch (e) {
    toast(e.message, 'error');
    return;
  }

  state.games = state.games.filter(x => x.id !== id);
  if (state.lm && state.lm.selected) state.lm.selected.delete(id);
  if (state.selectedId === id) state.selectedId = visibleGames()[0]?.id || null;
  
  if (state.panel === 'detailsDrawer') closePanels(true);
  renderCarousel(); renderLibrary();
  
  toast(`Удалено: ${g.name}`, 'success', { label: 'Отменить', fn: async () => {
    try {
      await api(`/games/${id}/restore`, 'POST', g);
      await loadState();
    } catch (e) { toast(e.message, 'error'); }
  }});
}
function confirmDialog(title, text) {
  return new Promise(res => {
    $('#confirmTitle').textContent = title; $('#confirmText').textContent = text; $('#confirmModal').hidden = false;
    const done = v => { $('#confirmModal').hidden = true; $('#confirmYes').onclick = $('#confirmNo').onclick = null; res(v); };
    $('#confirmYes').onclick = () => done(true); $('#confirmNo').onclick = () => done(false);
  });
}

/* ---------- State load / SSE ---------- */
async function loadState() {
  const st = await api('/state');
  state.mode = st.mode; state.games = st.games; state.settings = st.settings; state.views = st.views; state.notifications = st.notifications; state.sessions = st.sessions; state.scan = st.scan;
  setSound(state.settings.sound !== false);
  $('#clock').style.display = state.settings.showClock === false ? 'none' : '';
  $('#modeBadge').hidden = true; // режим показывается в настройках, чтобы первый экран совпадал с оригиналом
  renderCarousel(); renderNotifs(); renderScan(); renderLibrary(); renderRunningPill();
  if (state.panel === 'settingsDrawer') syncSettingsUI();
}
function connectSSE() {
  try {
    const es = new EventSource('/api/events');
    es.addEventListener('scan', e => { state.scan = JSON.parse(e.data); renderScan(); if (state.scan.phase === 'done') { toast(`Сканирование завершено: +${state.scan.added || 0} новых`, 'success'); loadState(); } });
    es.addEventListener('library', e => { const d = JSON.parse(e.data); state.games = d.games; renderCarousel(); renderLibrary(); if (state.panel === 'detailsDrawer' && state.detailsId) openDetails(state.detailsId); });
    es.addEventListener('session', e => { const d = JSON.parse(e.data); if (d.type === 'stopped' && state.sessionGame === d.gameId) hideSession(); refreshSessions(); });
    es.addEventListener('settings', e => { state.settings = JSON.parse(e.data); });
  } catch {}
}

/* ---------- Clock ---------- */
function updateClock() { const d = new Date(); $('#clock').textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

/* ---------- Keyboard ---------- */
document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
  if (e.key === 'Escape') {
    if (!$('#gameModal').hidden) { $('#gameModal').hidden = true; return; }
    if (!$('#confirmModal').hidden) { $('#confirmNo').click(); return; }
    if (!$('#sessionOverlay').hidden) { $('#sessionOverlay').hidden = true; state.overlayVisible = false; return; }
    if (!$('#libraryManager').hidden) { closeLibrary(); return; }
    if (state.panel) { closePanels(); return; }
    return;
  }
  if (typing) {
    if (state.panel === 'searchPanel' && e.key === 'Enter') { const first = $('.search-item.active') || $('.search-item'); first?.click(); }
    if (state.panel === 'searchPanel' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); const items = $$('.search-item'); let i = items.findIndex(x => x.classList.contains('active')); i = Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))); items.forEach((x, j) => x.classList.toggle('active', j === i)); items[i]?.scrollIntoView({ block: 'nearest' }); }
    return;
  }
  if (!$('#libraryManager').hidden || !$('#gameModal').hidden) return;
  if (state.panel && state.panel !== 'searchPanel') { if (e.key === 'ArrowLeft' && state.panel === 'detailsDrawer') { /* allow nav */ } else return; }
  switch (e.key) {
    case 'ArrowLeft': e.preventDefault(); moveSel(-1); break;
    case 'ArrowRight': e.preventDefault(); moveSel(1); break;
    case 'ArrowUp': e.preventDefault(); { const tabs = ['all', 'favorites', 'most', 'recent']; switchTab(tabs[Math.max(0, tabs.indexOf(state.tab) - 1)]); } break;
    case 'ArrowDown': e.preventDefault(); { const tabs = ['all', 'favorites', 'most', 'recent']; switchTab(tabs[Math.min(3, tabs.indexOf(state.tab) + 1)]); } break;
    case 'Enter': openDetails(); break;
    case ' ': e.preventDefault(); primaryAction(); break;
    case 'f': case 'F': case 'а': case 'А': openPanel('searchPanel'); break;
    case 'Tab': e.preventDefault(); openPanel('filterDrawer'); break;
    case 'F11': e.preventDefault(); toggleFullscreen(); break;
    case 'Delete': if (state.selectedId) deleteGame(state.selectedId); break;
  }
});
async function toggleFullscreen() {
  if (isDesktop) { const en = !document.fullscreenElement; await desktop('setFullscreen', { enabled: en }); return; }
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch {}
}

/* ---------- Gamepad ---------- */
const gp = { prev: [], axisCool: 0 };
function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const p = [...pads].find(Boolean);
  const status = $('#gpStatus');
  if (status) { status.textContent = p ? `Подключён: ${p.id}` : 'Геймпад не подключён'; status.classList.toggle('on', !!p); }
  if (p) {
    const now = performance.now();
    const ax = p.axes[0] || 0;
    if (Math.abs(ax) > .5 && now > gp.axisCool) { if (!state.panel && $('#libraryManager').hidden) moveSel(ax > 0 ? 1 : -1); gp.axisCool = now + 260; }
    const pressed = i => p.buttons[i]?.pressed;
    const edge = i => pressed(i) && !gp.prev[i];
    if (edge(0)) { if (state.panel) closePanels(); else openDetails(); }
    if (edge(2)) primaryAction();
    if (edge(3)) openPanel('searchPanel');
    if (edge(1)) { if (state.panel) closePanels(); else if (!$('#libraryManager').hidden) closeLibrary(); }
    if (edge(4)) openPanel('filterDrawer');
    if (edge(5)) toggleFav();
    if (edge(9)) openPanel('settingsDrawer');
    if (edge(12)) switchTab(['all', 'favorites', 'most', 'recent'][Math.max(0, ['all', 'favorites', 'most', 'recent'].indexOf(state.tab) - 1)]);
    if (edge(13)) switchTab(['all', 'favorites', 'most', 'recent'][Math.min(3, ['all', 'favorites', 'most', 'recent'].indexOf(state.tab) + 1)]);
    if (edge(14)) moveSel(-1); if (edge(15)) moveSel(1);
    gp.prev = p.buttons.map(b => b.pressed);
  }
  requestAnimationFrame(pollGamepad);
}

/* ---------- Wire up ---------- */
function wire() {
  $('#btnScan').onclick = () => openPanel('scanDrawer');
  $('#btnNotif').onclick = () => openPanel('notifDrawer');
  $('#btnLibrary').onclick = openLibrary;
  $('#btnGamepad').onclick = () => openPanel('gamepadDrawer');
  $('#btnSound').onclick = () => { setSound(!state.sound); saveSettings({ sound: state.sound }); tick('select'); };
  $('#btnFav').onclick = () => toggleFav();
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) switchTab(b.dataset.tab); });
  $('#hints').addEventListener('click', e => { const b = e.target.closest('.hint'); if (!b) return; doAction(b.dataset.action); });
  $('#touchActions').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; doAction(b.dataset.action); });
  $('#backdrop').onclick = () => closePanels();
  $$('[data-close]').forEach(b => b.onclick = () => { if (b.closest('#gameModal')) $('#gameModal').hidden = true; else closePanels(); });
  $('#emptyScan').onclick = startScan; $('#emptyAdd').onclick = () => openGameModal();
  $('#searchInput').addEventListener('input', e => { state.searchQuery = e.target.value; renderSearch(); });
  ['fSource', 'fInstalled', 'fGenre', 'fSort', 'fHidden'].forEach(id => $('#' + id).addEventListener('change', applyFilter));
  $('#filterReset').onclick = () => { state.filter = { source: 'all', installed: 'all', genre: 'all', hidden: false }; state.sort = 'manual'; syncFilterUI(); renderCarousel(); };
  $('#filterSaveView').onclick = async () => { const name = prompt('Название вида:', 'Мой вид'); if (!name) return; const r = await api('/views', 'POST', { name, tab: state.tab, search: state.searchQuery, filter: state.filter, sort: state.sort }); state.views.push(r.view); syncFilterUI(); toast('Вид сохранён', 'success'); };
  $('#detailsLaunch').onclick = () => primaryAction(state.detailsId);
  $('#detailsFav').onclick = () => { toggleFav(state.detailsId); openDetails(state.detailsId); };
  $('#detailsEdit').onclick = () => openGameModal(byId(state.detailsId));
  $('#detailsDelete').onclick = () => deleteGame(state.detailsId);
  ['setScanStartup', 'setTrack', 'setStartupWin', 'setTray', 'setFullscreen', 'setSound', 'setClock'].forEach(id => $('#' + id).addEventListener('change', e => {
    const map = { setScanStartup: 'scanOnStartup', setTrack: 'trackPlaytime', setStartupWin: 'startWithWindows', setTray: 'minimizeToTray', setFullscreen: 'fullscreen', setSound: 'sound', setClock: 'showClock' };
    saveSettings({ [map[id]]: e.target.checked });
    if (id === 'setStartupWin' && isDesktop) desktop('setStartup', { enabled: e.target.checked });
    if (id === 'setFullscreen' && isDesktop) desktop('setFullscreen', { enabled: e.target.checked });
  }));
  $('#addFolder').onclick = async () => { const r = await desktop('pickFolder'); if (r.ok && r.path) saveSettings({ customFolders: [...(state.settings.customFolders || []), r.path] }); else if (!isDesktop) { const p = prompt('Путь к папке с играми:'); if (p) saveSettings({ customFolders: [...(state.settings.customFolders || []), p] }); } };
  $('#settingsScan').onclick = startScan; $('#scanNow').onclick = startScan;
  $('#exportLib').onclick = async () => { const data = await api('/export'); const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'library.json'; a.click(); };
  $('#importLib').onclick = () => $('#importFile').click();
  $('#importFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const j = JSON.parse(await f.text()); await api('/import', 'POST', j); await loadState(); toast('Библиотека импортирована', 'success'); } catch (err) { toast('Ошибка импорта: ' + err.message, 'error'); } };
  $('#resetLib').onclick = async () => { if (await confirmDialog('Сбросить библиотеку к демо-состоянию?', 'Все изменения будут потеряны.')) { await api('/reset', 'POST'); await loadState(); toast('Сброшено', 'success'); } };
  $('#notifRead').onclick = async () => { await api('/notifications/read', 'POST', {}); state.notifications.forEach(n => n.read = true); renderNotifs(); };
  $('#gpSound').onchange = e => { setSound(e.target.checked); saveSettings({ sound: e.target.checked }); };
  $('#lmClose').onclick = closeLibrary; $('#lmAdd').onclick = () => openGameModal();
  $('#lmSearch').addEventListener('input', e => { state.lm.search = e.target.value; renderLibrary(); });
  $('#lmSort').onchange = e => { state.lm.sort = e.target.value; renderLibrary(); };
  $('#lmFilter').onchange = e => { state.lm.filter = e.target.value; renderLibrary(); };
  $('#bulkFav').onclick = () => bulk('favorite', true); $('#bulkUnfav').onclick = () => bulk('favorite', false); $('#bulkHide').onclick = () => bulk('hide', true); $('#bulkDelete').onclick = () => bulk('delete'); $('#bulkClear').onclick = () => { state.lm.selected.clear(); renderLibrary(); };
  $('#gameForm').addEventListener('submit', submitGame);
  $('#gPickExe').onclick = async () => { const r = await desktop('pickExe'); if (r.ok) $('#gExe').value = r.path; };
  $('#gPickCover').onclick = async () => { const r = await desktop('pickImage'); if (r.ok) $('#gCover').value = r.path; };
  $('#gPickHero').onclick = async () => { const r = await desktop('pickImage'); if (r.ok) $('#gHero').value = r.path; };
  $('#sessionStop').onclick = () => state.sessionGame && stopSession(state.sessionGame);
  $('#runningStop').onclick = () => state.sessions[0] && stopSession(state.sessions[0].gameId);
  $('#runningPill').addEventListener('click', e => { if (e.target.id !== 'runningStop' && state.sessions[0]) { const g = byId(state.sessions[0].gameId); if (g) { state.sessionGame = g.id; state.sessionStart = Date.now() - (state.sessions[0].elapsed || 0) * 1000; $('#sessionOverlay').hidden = false; state.overlayVisible = true; } } });
  $('#confirmModal').addEventListener('click', e => { if (e.target === e.currentTarget) $('#confirmNo').click(); });
  $('#gameModal').addEventListener('click', e => { if (e.target === e.currentTarget) $('#gameModal').hidden = true; });
  addEventListener('resize', positionTrack);
  $('#carousel').addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); moveSel(e.deltaY > 0 ? 1 : -1); } }, { passive: false });
  // touch swipe
  let tx = null; $('#carousel').addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  $('#carousel').addEventListener('touchend', e => { if (tx === null) return; const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 40) moveSel(dx < 0 ? 1 : -1); tx = null; }, { passive: true });
  if (window.desktop?.onShortcut) window.desktop.onShortcut(k => { if (k === 'scan') startScan(); });
}
function doAction(a) {
  if (a === 'install') primaryAction(); else if (a === 'details') openDetails(); else if (a === 'settings') openPanel('settingsDrawer'); else if (a === 'search') openPanel('searchPanel'); else if (a === 'filter') openPanel('filterDrawer');
}

/* ---------- Boot ---------- */
(async function boot() {
  wire(); updateClock(); setInterval(updateClock, 10000);
  computeSizes();
  try { await loadState(); } catch (e) { toast('Не удалось загрузить библиотеку: ' + e.message, 'error'); }
  connectSSE(); requestAnimationFrame(pollGamepad);
  setInterval(() => { if (state.sessions.length) refreshSessions(); }, 5000);
  if (isDesktop && state.settings.scanOnStartup) setTimeout(startScan, 1200);
})();