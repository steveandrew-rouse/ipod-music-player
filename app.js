/* ==========================================================================
   SONORA — iPod-inspired music player
   Modes: Online Songs (local server: search + streaming audio) · Global Radio
   ========================================================================== */

'use strict';

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const RADIO_MIRRORS = [
  'https://de1.api.radio-browser.info',
  'https://all.api.radio-browser.info',
  'https://at1.api.radio-browser.info'
];

const RADIO_QUERY = {
  limit: '120',
  hidebroken: 'true',
  order: 'clickcount',
  reverse: 'true',
  codec: 'MP3',
  is_https: 'true'
};

const SEED_SONGS = [
  { id: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up', artist: 'Rick Astley' },
  { id: 'djV11Xbc914', title: 'Take On Me', artist: 'a-ha' },
  { id: '5NV6Rdv1a3I', title: 'Get Lucky', artist: 'Daft Punk' },
  { id: 'fJ9rUzIMcZQ', title: 'Bohemian Rhapsody', artist: 'Queen' },
  { id: 'hTWKbfoikeg', title: 'Smells Like Teen Spirit', artist: 'Nirvana' },
  { id: '4NRXx6U8ABQ', title: 'Blinding Lights', artist: 'The Weeknd' },
  { id: 'DyDfgMOUjCI', title: 'bad guy', artist: 'Billie Eilish' },
  { id: 'TUVcZfQe-Kw', title: 'Levitating', artist: 'Dua Lipa' },
  { id: 'sBzrzS1Ag_g', title: 'The Less I Know the Better', artist: 'Tame Impala' },
  { id: 'dX3k_QDnzHE', title: 'Midnight City', artist: 'M83' },
  { id: 'yKNxeF4KMsY', title: 'Yellow', artist: 'Coldplay' },
  { id: 'mrZRURcb1cM', title: 'Dreams', artist: 'Fleetwood Mac' },
  { id: 'bpOSxM0rNPM', title: 'Do I Wanna Know?', artist: 'Arctic Monkeys' },
  { id: 'HyHNuVaZJ-k', title: 'Feel Good Inc.', artist: 'Gorillaz' },
  { id: 'tvTRZJ-4EyI', title: 'HUMBLE.', artist: 'Kendrick Lamar' },
  { id: 'XFkzRNyygfk', title: 'Creep', artist: 'Radiohead' },
  { id: 'Zi_XLOBDo_Y', title: 'Billie Jean', artist: 'Michael Jackson' },
  { id: 'JGwWNGJdvx8', title: 'Shape of You', artist: 'Ed Sheeran' }
];

const GENRES = [
  { key: 'pop', tags: ['pop', 'top 40', 'hits', 'charts', 'chart'] },
  { key: 'rock', tags: ['rock', 'classic rock', 'alternative', 'metal', 'punk', 'indie'] },
  { key: 'jazz', tags: ['jazz', 'swing', 'blues', 'bossa nova'] },
  { key: 'electronic', tags: ['electronic', 'edm', 'house', 'techno', 'trance', 'dance', 'electro', 'ambient', 'chillout'] }
];

const REPEAT_MODES = ['off', 'all', 'one'];

/* --------------------------------------------------------------------------
   DOM
   -------------------------------------------------------------------------- */

const $ = (selector) => document.querySelector(selector);

const els = {
  audioA: $('#audioA'),
  audioB: $('#audioB'),
  cover: $('#cover'),
  title: $('#title'),
  artist: $('#artist'),
  eyebrow: $('#eyebrow'),
  sourceBadge: $('#sourceBadge'),
  eq: $('#eq'),
  progress: $('#progress'),
  progressFill: $('#progressFill'),
  progressKnob: $('#progressKnob'),
  currentTime: $('#currentTime'),
  duration: $('#duration'),
  volume: $('#volume'),
  volumeValue: $('#volumeValue'),
  playBtn: $('#playBtn'),
  playIcon: $('#playIcon'),
  prevBtn: $('#prevBtn'),
  nextBtn: $('#nextBtn'),
  shuffleBtn: $('#shuffleBtn'),
  repeatBtn: $('#repeatBtn'),
  searchForm: $('#searchForm'),
  searchInput: $('#searchInput'),
  searchBtn: $('#searchBtn'),
  status: $('#status'),
  themeBtn: $('#themeBtn'),
  serverBanner: $('#serverBanner'),
  retryServer: $('#retryServer'),
  songsModeBtn: $('#songsModeBtn'),
  radioModeBtn: $('#radioModeBtn'),
  songsView: $('#songsView'),
  radioView: $('#radioView'),
  modeHint: $('#modeHint'),
  libraryGrid: $('#libraryGrid'),
  libraryTitle: $('#libraryTitle'),
  libraryEyebrow: $('#libraryEyebrow'),
  libraryCount: $('#libraryCount'),
  radioList: $('#radioList'),
  radioCount: $('#radioCount'),
  refreshRadio: $('#refreshRadio'),
  queueList: $('#queueList'),
  queueCount: $('#queueCount'),
  queueTitle: $('#queueTitle'),
  sourceNote: $('#sourceNote'),
  bgArt: $('#bgArt'),
  toast: $('#toast'),
  liveStatus: $('#liveStatus')
};

/* --------------------------------------------------------------------------
   State
   -------------------------------------------------------------------------- */

const state = {
  mode: 'songs',
  serverOnline: false,

  songs: [],
  songView: [],
  songQueue: [],
  songQuery: '',

  stations: [],
  radioView: [],
  radioQueue: [],
  radioFilter: 'all',
  radioQuery: '',
  radioLoading: false,

  current: null,
  engine: null,          // 'song' | 'radio'
  playing: false,
  failures: 0,
  history: [],
  volume: 80,
  shuffle: false,
  repeat: 'off',
  theme: 'dark',
  searching: false,

  activeSlot: 'a',
  ticker: null,
  watchdog: null
};

let toastTimer = null;

/* --------------------------------------------------------------------------
   Storage & helpers
   -------------------------------------------------------------------------- */

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(`sonora:${key}`);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`sonora:${key}`, JSON.stringify(value));
    } catch {
      /* storage may be unavailable */
    }
  }
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 360;
  }
  return hash;
}

function makeCover(title) {
  const words = String(title || '').replace(/[^a-z0-9 ]/gi, ' ').trim().split(/\s+/);
  const initials = (words.slice(0, 2).map((word) => word[0] || '').join('') || '♪').toUpperCase();
  const hue = hashString(String(title || 'sonora'));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 18% 34%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360} 18% 9%)"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><circle cx="200" cy="200" r="118" fill="none" stroke="rgba(255,255,255,.16)"/><circle cx="200" cy="200" r="82" fill="none" stroke="rgba(255,255,255,.09)"/><text x="200" y="220" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="64" letter-spacing="4" fill="rgba(255,255,255,.86)">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function artworkFor(item) {
  if (!item) return makeCover('Sonora');
  if (item.artwork) return item.artwork;
  if (item.kind === 'song') return `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`;
  return makeCover(item.title);
}

function audioFor(slot) {
  return slot === 'b' ? els.audioB : els.audioA;
}

function activeAudio() {
  return audioFor(state.activeSlot);
}

function inactiveAudio() {
  return audioFor(state.activeSlot === 'a' ? 'b' : 'a');
}

function announce(message) {
  els.liveStatus.textContent = message;
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('is-visible'), 4600);
}

function setStatus(label, tone = 'idle') {
  els.status.textContent = label;
  els.status.dataset.tone = tone;
}

function syncPlayButton() {
  els.playIcon.textContent = state.playing ? '⏸' : '▶';
  els.playBtn.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
  els.eq.classList.toggle('is-playing', state.playing);
}

function setSearchBusy(busy) {
  els.searchBtn.disabled = busy;
  els.searchBtn.textContent = busy ? '…' : 'Search';
}

/* --------------------------------------------------------------------------
   Server API
   -------------------------------------------------------------------------- */

async function api(path) {
  const response = await fetch(path, { headers: { Accept: 'application/json' } });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new Error((data && data.error) || `Request failed (${response.status})`);
  }
  return data;
}

async function checkServer(showToast = false) {
  try {
    await api('/api/health');
    state.serverOnline = true;
    els.serverBanner.hidden = true;
    if (!state.playing) setStatus('READY');
    els.sourceNote.textContent = 'Streaming via local server';
    if (showToast) toast('Server online.');
    return true;
  } catch {
    state.serverOnline = false;
    els.serverBanner.hidden = false;
    els.sourceNote.textContent = 'Server offline';
    setStatus('SERVER OFFLINE', 'error');
    if (showToast) toast('No server found at this address.');
    return false;
  }
}

/* --------------------------------------------------------------------------
   Playback
   -------------------------------------------------------------------------- */

function queueForKind(kind) {
  return kind === 'radio' ? state.radioQueue : state.songQueue;
}

function activeQueue() {
  const kind = state.current ? state.current.kind : (state.mode === 'radio' ? 'radio' : 'song');
  const queue = queueForKind(kind);
  if (queue.length) return queue;
  return kind === 'radio' ? state.radioView : state.songView;
}

function currentView() {
  return state.mode === 'radio' ? state.radioView : state.songView;
}

function switchSlot(slot) {
  if (state.activeSlot === slot) return;
  const previous = audioFor(state.activeSlot);
  state.activeSlot = slot;
  previous.pause();
}

function clearInactive() {
  const element = inactiveAudio();
  element.pause();
  element.removeAttribute('src');
  element.dataset.trackId = '';
  delete element.dataset.preloadId;
  element.load();
}

async function playItem(item, options = {}) {
  if (!item) return;

  if (options.queue && options.queue.length) {
    if (item.kind === 'radio') state.radioQueue = options.queue.slice();
    else state.songQueue = options.queue.slice();
  } else {
    const queue = queueForKind(item.kind);
    if (!queue.length) {
      if (item.kind === 'radio') state.radioQueue = state.radioView.slice();
      else state.songQueue = state.songView.slice();
    }
  }

  const isSame = Boolean(state.current && state.current.id === item.id && state.current.kind === item.kind);
  state.current = item;
  state.failures = 0;

  renderNowPlaying();
  renderLibrary();
  renderStations();
  renderQueue();
  updateMediaSession();
  store.set('last', { kind: item.kind, id: item.id });

  if (item.kind === 'radio') await playRadio(item, isSame);
  else await playSong(item, isSame);
}

async function playSong(song, isSame) {
  state.engine = 'song';
  setLiveUI(false);
  els.sourceBadge.textContent = 'ONLINE SONGS';
  els.eyebrow.textContent = 'NOW PLAYING';

  if (!state.serverOnline) {
    setStatus('SERVER OFFLINE', 'error');
    toast('Start the local server (python server.py) to stream online songs.');
    return;
  }

  const active = activeAudio();
  if (isSame && active.dataset.trackId === song.id) {
    active.play().catch(() => setStatus('TAP PLAY', 'error'));
    return;
  }

  const standbySlot = state.activeSlot === 'a' ? 'b' : 'a';
  const standby = audioFor(standbySlot);
  let target = active;

  if (standby.dataset.trackId === song.id) {
    switchSlot(standbySlot);
    target = standby;
  }

  if (target.dataset.trackId !== song.id) {
    target.dataset.trackId = song.id;
    target.preload = 'auto';
    target.src = `/api/stream/${song.id}`;
    target.load();
  }

  target.volume = state.volume / 100;
  setStatus('BUFFERING', 'busy');
  armWatchdog(20000);
  startTicker();

  try {
    await target.play();
  } catch {
    setStatus('TAP PLAY', 'error');
  }

  preloadNextSong();
}

async function playRadio(station, isSame) {
  state.engine = 'radio';
  setLiveUI(true);
  els.sourceBadge.textContent = 'LIVE RADIO';
  els.eyebrow.textContent = 'LIVE RADIO';

  const element = activeAudio();

  if (isSame && element.dataset.trackId === station.id && element.src) {
    element.play().catch(() => setStatus('TAP PLAY', 'error'));
    return;
  }

  clearInactive();
  element.dataset.trackId = station.id;
  element.preload = 'none';
  element.src = station.url;
  element.load();
  element.volume = state.volume / 100;

  setStatus('CONNECTING', 'busy');
  armWatchdog(15000);
  startTicker();

  try {
    await element.play();
  } catch {
    setStatus('TAP PLAY', 'error');
  }
}

function preloadNextSong() {
  if (state.engine !== 'song' || !state.serverOnline) return;

  const upcoming = upcomingList(activeQueue(), 1)[0];
  if (!upcoming || upcoming.kind !== 'song') return;

  const standby = inactiveAudio();
  if (standby.dataset.trackId === upcoming.id) return;

  standby.dataset.trackId = upcoming.id;
  standby.preload = 'auto';
  standby.src = `/api/stream/${upcoming.id}`;
  standby.load();
}

function togglePlay() {
  if (!state.current) {
    const first = currentView()[0];
    if (first) playItem(first, { queue: currentView() });
    else toast('Nothing to play yet — pick a song or a station.');
    return;
  }

  const element = activeAudio();
  if (element.paused) {
    element.play().catch(() => setStatus('TAP PLAY', 'error'));
  } else {
    element.pause();
  }
}

function nextItem(auto = false) {
  const queue = activeQueue();
  if (queue.length < 2) {
    if (!auto) toast('Nothing else in this queue.');
    return;
  }

  const from = queue.indexOf(state.current);
  let index;

  if (state.shuffle) {
    do {
      index = Math.floor(Math.random() * queue.length);
    } while (index === from);
  } else {
    index = from < 0 ? 0 : (from + 1) % queue.length;
  }

  state.history.push(from);
  if (state.history.length > 80) state.history.shift();
  if (!auto) state.failures = 0;

  playItem(queue[index]);
}

function prevItem() {
  const queue = activeQueue();
  if (!queue.length) return;

  const element = activeAudio();
  if (element.currentTime > 3) {
    element.currentTime = 0;
    return;
  }

  const from = queue.indexOf(state.current);
  const previous = state.history.pop();
  const index = Number.isInteger(previous) && previous >= 0
    ? clamp(previous, 0, queue.length - 1)
    : (from <= 0 ? queue.length - 1 : from - 1);

  state.failures = 0;
  playItem(queue[index]);
}

function handleEnded() {
  if (!state.current) return;

  if (state.repeat === 'one') {
    const element = activeAudio();
    element.currentTime = 0;
    element.play().catch(() => setStatus('TAP PLAY', 'error'));
    return;
  }

  const queue = activeQueue();
  const atEnd = queue.indexOf(state.current) === queue.length - 1;

  if (atEnd && state.repeat === 'off' && !state.shuffle) {
    state.playing = false;
    syncPlayButton();
    stopTicker();
    setStatus('END OF QUEUE');
    return;
  }

  nextItem(true);
}

function handleFailure() {
  const item = state.current;
  if (!item) return;

  item.unavailable = true;
  state.failures += 1;
  renderLibrary();
  renderStations();

  state.playing = false;
  syncPlayButton();
  stopTicker();

  if (state.failures >= 3 || activeQueue().length < 2) {
    setStatus('UNAVAILABLE', 'error');
    toast(`"${item.title}" could not be played. Try another track.`);
    return;
  }

  setStatus('SKIPPING', 'error');
  toast(`"${item.title}" is unavailable — skipping.`);
  setTimeout(() => {
    if (state.current === item) nextItem(true);
  }, 700);
}

/* --------------------------------------------------------------------------
   Timers
   -------------------------------------------------------------------------- */

function startTicker() {
  if (state.ticker) return;
  state.ticker = setInterval(tick, 250);
}

function stopTicker() {
  if (state.ticker) clearInterval(state.ticker);
  state.ticker = null;
}

function tick() {
  if (!state.current) return;

  const element = activeAudio();
  const current = element.currentTime || 0;
  const duration = element.duration;
  els.currentTime.textContent = formatTime(current);

  if (state.engine === 'radio') {
    els.duration.textContent = 'LIVE';
    return;
  }

  if (Number.isFinite(duration) && duration > 0) {
    const percent = clamp((current / duration) * 100, 0, 100);
    els.progressFill.style.width = `${percent}%`;
    els.progressKnob.style.left = `${percent}%`;
    els.duration.textContent = formatTime(duration);
    els.progress.setAttribute('aria-valuenow', String(Math.round(percent)));
    els.progress.setAttribute('aria-valuetext', `${formatTime(current)} of ${formatTime(duration)}`);
  }
}

function armWatchdog(timeout = 15000) {
  stopWatchdog();
  const item = state.current;
  state.watchdog = setTimeout(() => {
    if (state.current !== item || state.playing) return;
    handleFailure();
  }, timeout);
}

function stopWatchdog() {
  if (state.watchdog) clearTimeout(state.watchdog);
  state.watchdog = null;
}

/* --------------------------------------------------------------------------
   Rendering
   -------------------------------------------------------------------------- */

function setLiveUI(live) {
  els.progress.classList.toggle('is-live', live);
  if (live) {
    els.duration.textContent = 'LIVE';
    els.progress.setAttribute('aria-valuetext', 'Live stream');
  } else {
    els.progressFill.style.width = '0%';
    els.progressKnob.style.left = '0%';
    els.duration.textContent = '0:00';
  }
}

function renderNowPlaying() {
  const item = state.current;
  if (!item) return;

  const art = artworkFor(item);
  els.cover.onerror = () => {
    els.cover.onerror = null;
    els.cover.src = makeCover(item.title);
  };
  els.cover.src = art;
  els.cover.alt = `${item.title} artwork`;

  els.title.textContent = item.title;
  els.artist.textContent = item.kind === 'radio'
    ? [item.artist, item.genre, item.bitrate ? `${item.bitrate} kbps` : ''].filter(Boolean).join(' • ')
    : item.artist;

  els.eyebrow.textContent = item.kind === 'radio' ? 'LIVE RADIO' : 'NOW PLAYING';
  els.sourceBadge.textContent = item.kind === 'radio' ? 'LIVE RADIO' : 'ONLINE SONGS';
  els.bgArt.style.backgroundImage = `url("${art}")`;

  setLiveUI(item.kind === 'radio');
  syncPlayButton();
}

function renderLibrary() {
  els.libraryCount.textContent = `${state.songView.length} ${state.songView.length === 1 ? 'song' : 'songs'}`;

  if (!state.songView.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = state.songQuery
      ? `No songs match "${state.songQuery}".`
      : 'No songs yet — search above.';
    els.libraryGrid.replaceChildren(empty);
    return;
  }

  const cards = state.songView.map((song) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', `${song.title} — ${song.artist}`);
    if (state.current && state.current.kind === 'song' && state.current.id === song.id) card.classList.add('is-active');
    if (song.unavailable) card.classList.add('is-unavailable');

    const artWrap = document.createElement('div');
    artWrap.className = 'card-art';

    const img = document.createElement('img');
    img.src = artworkFor(song);
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => {
      img.src = makeCover(song.title);
    }, { once: true });

    const play = document.createElement('span');
    play.className = 'card-play';
    play.setAttribute('aria-hidden', 'true');
    play.textContent = '▶';
    artWrap.append(img, play);

    const copy = document.createElement('div');
    copy.className = 'card-copy';
    const title = document.createElement('strong');
    title.className = 'card-title';
    title.textContent = song.title;
    const artist = document.createElement('span');
    artist.className = 'card-artist';
    artist.textContent = song.artist;
    copy.append(title, artist);

    card.append(artWrap, copy);
    card.addEventListener('click', () => playItem(song, { queue: state.songView }));
    return card;
  });

  els.libraryGrid.replaceChildren(...cards);
}

function normalizeStation(raw) {
  const name = (raw.name || '').trim() || 'Unknown station';
  const tags = String(raw.tags || '')
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);

  let genre = 'Radio';
  for (const entry of GENRES) {
    if (tags.some((tag) => entry.tags.includes(tag))) {
      genre = entry.key.charAt(0).toUpperCase() + entry.key.slice(1);
      break;
    }
  }
  if (genre === 'Radio' && tags.length) {
    genre = tags[0].replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  }

  const favicon = typeof raw.favicon === 'string' && raw.favicon.startsWith('https://') ? raw.favicon : '';

  return {
    kind: 'radio',
    id: raw.stationuuid || raw.url_resolved || name,
    title: name,
    artist: (raw.country || raw.countrycode || 'Worldwide').trim(),
    genre,
    tags,
    bitrate: Number(raw.bitrate) || 0,
    url: raw.url_resolved || raw.url || '',
    artwork: favicon,
    live: true
  };
}

function applyRadioFilter() {
  const query = state.radioQuery.trim().toLowerCase();

  state.radioView = state.stations.filter((station) => {
    const inGenre = state.radioFilter === 'all'
      || station.tags.includes(state.radioFilter)
      || (GENRES.find((entry) => entry.key === state.radioFilter)?.tags || []).some((tag) => station.tags.includes(tag))
      || station.genre.toLowerCase() === state.radioFilter;

    if (!inGenre) return false;
    if (!query) return true;
    return `${station.title} ${station.artist} ${station.genre}`.toLowerCase().includes(query);
  });
}

function renderStations() {
  applyRadioFilter();
  els.radioCount.textContent = `${state.radioView.length} ${state.radioView.length === 1 ? 'station' : 'stations'}`;

  if (state.radioLoading) {
    const loading = document.createElement('div');
    loading.className = 'empty';
    loading.textContent = 'Loading global stations…';
    els.radioList.replaceChildren(loading);
    return;
  }

  if (!state.radioView.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = state.stations.length
      ? 'No stations match this filter yet — try All or Refresh.'
      : 'No stations loaded. Hit Refresh to load the global directory.';
    els.radioList.replaceChildren(empty);
    return;
  }

  const rows = state.radioView.map((station, index) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'station';
    row.setAttribute('role', 'listitem');
    row.setAttribute('aria-label', `${station.title} — ${station.artist}`);
    if (state.current && state.current.kind === 'radio' && state.current.id === station.id) {
      row.classList.add('is-active');
    }
    if (station.unavailable) row.classList.add('is-dead');

    const img = document.createElement('img');
    img.className = 'station-art';
    img.alt = '';
    img.loading = 'lazy';
    img.src = station.artwork || makeCover(station.title);
    img.addEventListener('error', () => {
      img.src = makeCover(station.title);
    }, { once: true });

    const copy = document.createElement('div');
    copy.className = 'station-copy';
    const name = document.createElement('strong');
    name.textContent = station.title;
    const meta = document.createElement('span');
    meta.textContent = [station.artist, station.genre, station.bitrate ? `${station.bitrate} kbps` : 'live']
      .filter(Boolean)
      .join(' • ');
    copy.append(name, meta);

    const badge = document.createElement('span');
    badge.className = 'station-badge';
    badge.textContent = String(index + 1).padStart(2, '0');

    row.append(img, copy, badge);
    row.addEventListener('click', () => playItem(station, { queue: state.radioView }));
    return row;
  });

  els.radioList.replaceChildren(...rows);
}

function upcomingList(queue, limit) {
  if (!queue.length) return [];
  const from = queue.indexOf(state.current);
  const start = from < 0 ? -1 : from;
  const list = [];
  for (let step = 1; step <= limit && step < queue.length; step += 1) {
    list.push(queue[(start + step + queue.length) % queue.length]);
  }
  return list;
}

function renderQueue() {
  const queue = state.mode === 'radio'
    ? (state.radioQueue.length ? state.radioQueue : state.radioView)
    : (state.songQueue.length ? state.songQueue : state.songView);

  const upcoming = upcomingList(queue, 8);
  els.queueCount.textContent = String(upcoming.length);
  els.queueTitle.textContent = state.mode === 'radio' ? 'Radio queue' : 'Up next';

  if (!upcoming.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = state.mode === 'radio' ? 'No stations queued yet.' : 'Nothing queued yet.';
    els.queueList.replaceChildren(empty);
    return;
  }

  const rows = upcoming.map((item, index) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'queue-item';
    if (state.current && state.current.id === item.id && state.current.kind === item.kind) {
      button.classList.add('is-current');
    }

    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.src = artworkFor(item);
    img.addEventListener('error', () => {
      img.src = makeCover(item.title);
    }, { once: true });

    const copy = document.createElement('span');
    copy.className = 'queue-copy';
    const strong = document.createElement('strong');
    strong.textContent = item.title;
    const span = document.createElement('span');
    span.textContent = item.kind === 'radio' ? `${item.artist} • ${item.genre}` : item.artist;
    copy.append(strong, span);

    const num = document.createElement('span');
    num.className = 'queue-index';
    num.textContent = String(index + 1).padStart(2, '0');

    button.append(img, copy, num);
    button.addEventListener('click', () => playItem(item));
    li.append(button);
    return li;
  });

  els.queueList.replaceChildren(...rows);
}

/* --------------------------------------------------------------------------
   Search
   -------------------------------------------------------------------------- */

function parseSongId(input) {
  const value = input.trim();
  if (!value) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;

  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);
    if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(url.hostname)) return null;

    const v = url.searchParams.get('v');
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;

    const parts = url.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1] || '';
    if (url.hostname === 'youtu.be' && /^[A-Za-z0-9_-]{11}$/.test(last)) return last;
    if (['embed', 'shorts', 'live'].includes(parts[0]) && /^[A-Za-z0-9_-]{11}$/.test(last)) return last;
  } catch {
    return null;
  }

  return null;
}

async function importSong(id) {
  if (!state.serverOnline && !(await checkServer())) {
    toast('Start the local server to load song details.');
    return;
  }

  setSearchBusy(true);
  setStatus('LOADING', 'busy');

  try {
    const details = await api(`/api/song?id=${encodeURIComponent(id)}`);
    const song = {
      kind: 'song',
      id,
      title: details.title || `Song ${id}`,
      artist: details.artist || 'Unknown artist',
      artwork: details.artwork || ''
    };

    const existing = state.songs.find((entry) => entry.id === id);
    if (existing) {
      existing.title = song.title;
      existing.artist = song.artist;
      existing.artwork = song.artwork;
    } else {
      state.songs.unshift(song);
    }

    state.songView = state.songs;
    state.songQuery = '';
    els.libraryEyebrow.textContent = 'LIBRARY';
    els.libraryTitle.textContent = 'Online songs';
    els.searchInput.value = '';
    setMode('songs');
    playItem(existing || song, { queue: state.songView });
  } catch (error) {
    toast(error.message || 'Could not load that song.');
    setStatus('LOAD ERROR', 'error');
  } finally {
    setSearchBusy(false);
  }
}

async function searchOnline(query) {
  if (state.searching) return;
  state.searching = true;
  setSearchBusy(true);
  setStatus('SEARCHING', 'busy');

  try {
    const data = await api(`/api/search?q=${encodeURIComponent(query)}&limit=24`);
    const results = (data.songs || []).map((song) => ({
      kind: 'song',
      id: song.id,
      title: song.title,
      artist: song.artist || 'Unknown artist',
      album: song.album || '',
      duration: song.duration || 0,
      artwork: song.artwork || ''
    }));

    if (!results.length) {
      toast(`No songs found for "${query}".`);
      setStatus('READY');
      return;
    }

    state.songView = results;
    state.songQuery = query;
    state.serverOnline = true;
    els.libraryEyebrow.textContent = 'SEARCH RESULTS';
    els.libraryTitle.textContent = `"${query}"`;
    renderLibrary();
    renderQueue();
    setStatus('READY');
    announce(`${results.length} songs found.`);
  } catch (error) {
    toast(error.message || 'Search failed.');
    setStatus('SEARCH ERROR', 'error');
    checkServer();
  } finally {
    state.searching = false;
    setSearchBusy(false);
  }
}

function resetSongView() {
  state.songView = state.songs;
  state.songQuery = '';
  els.libraryEyebrow.textContent = 'LIBRARY';
  els.libraryTitle.textContent = 'Online songs';
  renderLibrary();
  renderQueue();
}

async function handleSearch(event) {
  event.preventDefault();
  const value = els.searchInput.value.trim();

  if (state.mode === 'radio') {
    state.radioQuery = value;
    renderStations();
    return;
  }

  if (!value) {
    resetSongView();
    return;
  }

  const songId = parseSongId(value);
  if (songId) {
    importSong(songId);
    return;
  }

  await searchOnline(value);
}

/* --------------------------------------------------------------------------
   Radio directory
   -------------------------------------------------------------------------- */

async function fetchStations() {
  if (state.radioLoading) return;

  state.radioLoading = true;
  els.refreshRadio.classList.add('is-busy');
  setStatus('CONNECTING', 'busy');
  renderStations();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const query = new URLSearchParams(RADIO_QUERY).toString();

  let payload = null;
  for (const mirror of RADIO_MIRRORS) {
    try {
      const response = await fetch(`${mirror}/json/stations/search?${query}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (Array.isArray(data) && data.length) {
        payload = data;
        break;
      }
    } catch {
      /* try the next mirror */
    }
  }

  clearTimeout(timer);
  state.radioLoading = false;
  els.refreshRadio.classList.remove('is-busy');

  if (!payload) {
    state.stations = [];
    renderStations();
    setStatus('RADIO OFFLINE', 'error');
    toast('The radio directory is unreachable right now.');
    return;
  }

  const seen = new Set();
  const stations = [];
  for (const raw of payload) {
    const station = normalizeStation(raw);
    if (!station.url || !station.url.startsWith('https://') || seen.has(station.url)) continue;
    seen.add(station.url);
    stations.push(station);
  }

  state.stations = stations;
  renderStations();
  renderQueue();
  setStatus('RADIO READY');
  announce(`${stations.length} radio stations loaded.`);
}

function ensureRadioLoaded(force = false) {
  if (state.radioLoading) return;
  if (state.stations.length && !force) return;
  fetchStations();
}

/* --------------------------------------------------------------------------
   Modes, theme, volume
   -------------------------------------------------------------------------- */

function setMode(mode, options = {}) {
  state.mode = mode === 'radio' ? 'radio' : 'songs';
  const songs = state.mode === 'songs';

  els.songsView.hidden = !songs;
  els.radioView.hidden = songs;

  els.songsModeBtn.classList.toggle('is-active', songs);
  els.radioModeBtn.classList.toggle('is-active', !songs);
  els.songsModeBtn.setAttribute('aria-selected', String(songs));
  els.radioModeBtn.setAttribute('aria-selected', String(!songs));

  els.searchInput.placeholder = songs
    ? 'Search online songs, or paste a song link'
    : 'Search radio by name, country or genre';

  els.modeHint.textContent = songs
    ? 'Streaming audio · artwork from the online catalogue'
    : 'Live global stations via Radio Browser · artwork from station favicons';

  if (!options.silent) store.set('mode', state.mode);

  if (songs) renderLibrary();
  else {
    ensureRadioLoaded();
    renderStations();
  }

  renderQueue();
}

function applyTheme(theme, persist = true) {
  state.theme = theme === 'light' ? 'light' : 'dark';
  document.body.dataset.theme = state.theme;

  const light = state.theme === 'light';
  els.themeBtn.textContent = light ? '☾' : '☀';
  els.themeBtn.setAttribute('aria-label', light ? 'Switch to black theme' : 'Switch to white theme');
  els.themeBtn.setAttribute('aria-pressed', String(light));

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', light ? '#ffffff' : '#000000');

  if (persist) store.set('theme', state.theme);
}

function setShuffle(enabled) {
  state.shuffle = Boolean(enabled);
  els.shuffleBtn.setAttribute('aria-pressed', String(state.shuffle));
  store.set('shuffle', state.shuffle);
}

function setRepeat(mode) {
  state.repeat = REPEAT_MODES.includes(mode) ? mode : 'off';
  els.repeatBtn.setAttribute('aria-pressed', String(state.repeat !== 'off'));
  els.repeatBtn.setAttribute('aria-label', `Repeat: ${state.repeat}`);
  const label = els.repeatBtn.querySelector('small');
  if (label) label.textContent = state.repeat === 'one' ? 'REPEAT 1' : 'REPEAT';
  store.set('repeat', state.repeat);
}

function cycleRepeat() {
  setRepeat(REPEAT_MODES[(REPEAT_MODES.indexOf(state.repeat) + 1) % REPEAT_MODES.length]);
}

function applyVolume(value) {
  state.volume = clamp(Math.round(value), 0, 100);
  els.audioA.volume = state.volume / 100;
  els.audioB.volume = state.volume / 100;
  els.volume.value = String(state.volume);
  els.volumeValue.textContent = String(state.volume);
  store.set('volume', state.volume);
}

function seekToRatio(ratio) {
  if (!state.current || state.current.kind === 'radio') return;
  const element = activeAudio();
  const duration = element.duration;
  if (!Number.isFinite(duration) || duration <= 0) return;
  element.currentTime = clamp(ratio, 0, 1) * duration;
  tick();
}

function ratioFromEvent(event) {
  const rect = els.progress.getBoundingClientRect();
  if (!rect.width) return 0;
  return clamp((event.clientX - rect.left) / rect.width, 0, 1);
}

function updateMediaSession() {
  if (!('mediaSession' in navigator) || !state.current) return;
  const item = state.current;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: item.title,
      artist: item.artist,
      album: item.kind === 'radio' ? 'Live Radio' : 'Online Songs',
      artwork: [{ src: artworkFor(item), sizes: '512x512', type: 'image/jpeg' }]
    });
    navigator.mediaSession.setActionHandler('play', () => togglePlay());
    navigator.mediaSession.setActionHandler('pause', () => togglePlay());
    navigator.mediaSession.setActionHandler('nexttrack', () => nextItem());
    navigator.mediaSession.setActionHandler('previoustrack', () => prevItem());
  } catch {
    /* Media Session is optional */
  }
}

/* --------------------------------------------------------------------------
   Events
   -------------------------------------------------------------------------- */

function bindAudioEvents() {
  ['a', 'b'].forEach((slot) => {
    const element = audioFor(slot);

    element.addEventListener('playing', () => {
      if (element !== activeAudio()) {
        element.pause();
        return;
      }
      state.playing = true;
      state.failures = 0;
      stopWatchdog();
      startTicker();
      syncPlayButton();
      setStatus(state.engine === 'radio' ? 'LIVE' : 'PLAYING', 'playing');
    });

    element.addEventListener('pause', () => {
      if (element !== activeAudio()) return;
      state.playing = false;
      stopTicker();
      syncPlayButton();
      setStatus('PAUSED');
    });

    element.addEventListener('timeupdate', () => {
      if (element === activeAudio()) tick();
    });

    element.addEventListener('loadedmetadata', () => {
      if (element === activeAudio()) tick();
    });

    element.addEventListener('ended', () => {
      if (element === activeAudio()) handleEnded();
    });

    element.addEventListener('error', () => {
      if (element !== activeAudio()) return;
      if (!element.getAttribute('src') || !state.current) return;
      handleFailure();
    });

    element.addEventListener('stalled', () => {
      if (element === activeAudio() && !state.playing) armWatchdog(20000);
    });
  });
}

function bindEvents() {
  bindAudioEvents();

  els.playBtn.addEventListener('click', togglePlay);
  els.nextBtn.addEventListener('click', () => nextItem());
  els.prevBtn.addEventListener('click', prevItem);
  els.shuffleBtn.addEventListener('click', () => setShuffle(!state.shuffle));
  els.repeatBtn.addEventListener('click', cycleRepeat);

  els.volume.addEventListener('input', (event) => applyVolume(Number(event.target.value)));

  els.searchForm.addEventListener('submit', handleSearch);

  els.songsModeBtn.addEventListener('click', () => setMode('songs'));
  els.radioModeBtn.addEventListener('click', () => {
    setMode('radio');
    ensureRadioLoaded();
  });

  els.refreshRadio.addEventListener('click', () => ensureRadioLoaded(true));

  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach((other) => {
        const active = other === chip;
        other.classList.toggle('is-active', active);
        other.setAttribute('aria-pressed', String(active));
      });
      state.radioFilter = chip.dataset.filter || 'all';
      renderStations();
    });
  });

  els.themeBtn.addEventListener('click', () => {
    applyTheme(state.theme === 'light' ? 'dark' : 'light');
  });

  els.retryServer.addEventListener('click', () => checkServer(true));

  /* Seeking */
  let dragging = false;

  els.progress.addEventListener('pointerdown', (event) => {
    if (state.current && state.current.kind === 'radio') return;
    dragging = true;
    els.progress.setPointerCapture(event.pointerId);
    seekToRatio(ratioFromEvent(event));
  });

  els.progress.addEventListener('pointermove', (event) => {
    if (dragging) seekToRatio(ratioFromEvent(event));
  });

  const stopDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    if (els.progress.hasPointerCapture(event.pointerId)) {
      els.progress.releasePointerCapture(event.pointerId);
    }
  };

  els.progress.addEventListener('pointerup', stopDrag);
  els.progress.addEventListener('pointercancel', stopDrag);

  els.progress.addEventListener('keydown', (event) => {
    if (!state.current || state.current.kind === 'radio') return;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();

    const element = activeAudio();
    if (!Number.isFinite(element.duration)) return;
    const step = event.shiftKey ? 10 : 5;
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowUp';
    element.currentTime = clamp(element.currentTime + (forward ? step : -step), 0, element.duration);
    tick();
  });

  /* Keyboard */
  document.addEventListener('keydown', (event) => {
    const tag = (event.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || event.target.isContentEditable;
    if (typing) return;

    const onControl = event.target.closest && event.target.closest('button, a, [role="slider"]');

    if (event.code === 'Space' && !onControl) {
      event.preventDefault();
      togglePlay();
      return;
    }
    if (event.key === 'ArrowRight' && !onControl) {
      event.preventDefault();
      nextItem();
      return;
    }
    if (event.key === 'ArrowLeft' && !onControl) {
      event.preventDefault();
      prevItem();
      return;
    }
    if (event.key === '/') {
      event.preventDefault();
      els.searchInput.focus();
      return;
    }
    if (event.key.toLowerCase() === 's' && !event.metaKey && !event.ctrlKey) {
      setShuffle(!state.shuffle);
      return;
    }
    if (event.key.toLowerCase() === 'r' && !event.metaKey && !event.ctrlKey) {
      cycleRepeat();
      return;
    }
    if (event.key.toLowerCase() === 't' && !event.metaKey && !event.ctrlKey) {
      applyTheme(state.theme === 'light' ? 'dark' : 'light');
    }
  });

  window.addEventListener('beforeunload', () => {
    stopWatchdog();
    stopTicker();
  });
}

/* --------------------------------------------------------------------------
   Boot
   -------------------------------------------------------------------------- */

function restoreLast() {
  const last = store.get('last', null);
  if (!last || last.kind !== 'song' || !last.id) return;

  const song = state.songs.find((entry) => entry.id === last.id);
  if (!song) return;

  state.current = song;
  renderNowPlaying();
  renderLibrary();
  renderQueue();
}

function init() {
  const params = new URLSearchParams(window.location.search);
  const themeParam = params.get('theme');
  const modeParam = params.get('mode');
  const songParam = params.get('song');

  state.theme = themeParam === 'light' || themeParam === 'dark'
    ? themeParam
    : store.get('theme', 'dark');
  applyTheme(state.theme, false);

  state.volume = clamp(Number(store.get('volume', 80)) || 0, 0, 100);
  els.volume.value = String(state.volume);
  els.volumeValue.textContent = String(state.volume);
  applyVolume(state.volume);

  setShuffle(Boolean(store.get('shuffle', false)));
  setRepeat(store.get('repeat', 'off'));

  state.songs = SEED_SONGS.map((song) => ({ kind: 'song', ...song }));
  state.songView = state.songs;
  state.radioView = [];

  bindEvents();
  renderLibrary();
  renderQueue();
  setMode(modeParam === 'radio' ? 'radio' : modeParam === 'songs' ? 'songs' : store.get('mode', 'songs'), { silent: true });

  const requested = songParam ? state.songs.find((song) => song.id === songParam) : null;
  if (requested) {
    state.current = requested;
    renderNowPlaying();
    renderLibrary();
    renderQueue();
  } else {
    restoreLast();
  }

  checkServer().then((online) => {
    if (online) preloadNextSong();
  });
}

init();
