import {
  normalizeData, nextPhase, formatTime, formatMinutes, summary, weekSeries, treesInRange,
  UNLOCKS, unlockProgress, unlockedIds, growthStage, STAGE_LABEL, PHASE_LABEL,
} from './core.js';
import { SOUNDS, playSound } from './sounds.js';
import { Forest } from './forest.js';

// When opened in a plain browser (for development or tests) fall back to localStorage.
const api = window.api || {
  platform: 'web',
  loadData: () => { try { return JSON.parse(localStorage.getItem('pomodoro-forest') || 'null'); } catch { return null; } },
  saveData: async (d) => { try { localStorage.setItem('pomodoro-forest', JSON.stringify(d)); } catch {} },
  updateTimer: () => {},
  notify: (title, body) => { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body }); },
  setMiniMode: (on) => document.body.classList.toggle('mini', on),
  showWindow: () => {},
  onCommand: () => {},
  onMiniMode: () => {},
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const WITHER_AFTER_MS = 10_000; // leaving a focus session after this long withers its tree
const SPECIES = ['oak', 'pine', 'cherry', 'palm'];
const RING_C = 2 * Math.PI * 88;
const MINI_C = 2 * Math.PI * 16;

let data = normalizeData(api.loadData());
let forestRange = 'all';

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => api.saveData(data), 250);
}

// ---------------------------------------------------------------------------
// Timer state
// ---------------------------------------------------------------------------
const timer = {
  phase: 'focus',
  running: false,
  durationMs: 0,
  remainingMs: 0,
  endsAt: 0,
  startedAt: null, // set when a session first starts; cleared when it ends
  seed: Math.random(),
  species: data.settings.species,
};

function durationFor(phase) {
  return Math.round(data.settings[phase] * 60_000);
}

function elapsedMs() {
  return timer.durationMs - currentRemaining();
}

function currentRemaining() {
  return timer.running ? Math.max(0, timer.endsAt - Date.now()) : timer.remainingMs;
}

function setPhase(phase, { autoStart = false } = {}) {
  timer.phase = phase;
  timer.running = false;
  timer.durationMs = durationFor(phase);
  timer.remainingMs = timer.durationMs;
  timer.startedAt = null;
  timer.seed = Math.random();
  timer.species = availableSpecies(data.settings.species);
  data.activeSession = null;
  document.body.dataset.phase = phase;
  forest.setGrowing(null);
  save();
  if (autoStart) start();
  render();
}

function start() {
  if (timer.running) return;
  if (timer.remainingMs <= 0) timer.remainingMs = timer.durationMs;
  if (!timer.startedAt) timer.startedAt = Date.now();
  timer.endsAt = Date.now() + timer.remainingMs;
  timer.running = true;
  persistActive();
  render();
}

function pause() {
  if (!timer.running) return;
  timer.remainingMs = currentRemaining();
  timer.running = false;
  persistActive();
  render();
}

function toggle() { timer.running ? pause() : start(); }

function persistActive() {
  data.activeSession = timer.phase === 'focus' && timer.startedAt
    ? { phase: 'focus', startedAt: timer.startedAt, elapsedMs: elapsedMs(), species: timer.species, seed: timer.seed, taskId: data.currentTaskId }
    : null;
  save();
}

/** A focus session ended early: the tree withers but stays on the island as a reminder. */
function abandonFocus(reason) {
  if (timer.phase !== 'focus' || !timer.startedAt) return false;
  const elapsed = elapsedMs();
  if (elapsed < WITHER_AFTER_MS) return false;
  const pos = forest.growingPosition();
  const minutes = elapsed / 60_000;
  data.sessions.push({ id: uid(), phase: 'focus', start: new Date(timer.startedAt).toISOString(), end: new Date().toISOString(), minutes, completed: false, taskId: data.currentTaskId });
  data.trees.push({ id: uid(), species: timer.species, plantedAt: new Date().toISOString(), minutes, withered: true, seed: timer.seed, taskId: data.currentTaskId });
  forest.setGrowing(null);
  forest.witherPuff(pos);
  toast(reason || 'Your tree withered. Try again!');
  refreshForest();
  return true;
}

function confirmLeave() {
  if (timer.phase !== 'focus' || !timer.startedAt || elapsedMs() < WITHER_AFTER_MS) return true;
  return window.confirm('Stopping now will wither your tree. Stop anyway?');
}

function complete() {
  const before = unlockedIds(summary(data));
  const phase = timer.phase;
  const now = new Date();
  const minutes = timer.durationMs / 60_000;
  data.sessions.push({
    id: uid(), phase, start: new Date(timer.startedAt || Date.now() - timer.durationMs).toISOString(),
    end: now.toISOString(), minutes, completed: true, taskId: phase === 'focus' ? data.currentTaskId : null,
  });

  if (phase === 'focus') {
    const pos = forest.growingPosition();
    data.trees.push({ id: uid(), species: timer.species, plantedAt: now.toISOString(), minutes, withered: false, seed: timer.seed, taskId: data.currentTaskId });
    data.cycleCount = (data.cycleCount || 0) + 1;
    const task = data.tasks.find((t) => t.id === data.currentTaskId);
    if (task) task.pomodoros = (task.pomodoros || 0) + 1;
    forest.setGrowing(null);
    refreshForest();
    forest.celebrate(pos);
  }

  playSound(data.settings.sound, data.settings.volume);
  const next = nextPhase(phase, data.cycleCount, data.settings.longInterval);
  if (data.settings.notifications) {
    const body = phase === 'focus'
      ? `A new ${speciesName(timer.species)} was planted. Time for a ${next === 'long' ? 'long' : 'short'} break.`
      : 'Break is over. Ready to grow another tree?';
    api.notify(phase === 'focus' ? 'Focus session complete' : 'Break finished', body);
  }

  const after = unlockedIds(summary(data));
  const fresh = UNLOCKS.filter((u) => after.has(u.id) && !before.has(u.id));
  if (fresh.length) toast(`Unlocked: ${fresh.map((u) => u.name).join(', ')}!`, 4500);
  else if (phase === 'focus') toast('Tree planted 🌱');

  const auto = next === 'focus' ? data.settings.autoFocus : data.settings.autoBreaks;
  setPhase(next, { autoStart: auto });
  renderTasks();
  renderStats();
}

function skip() {
  if (!confirmLeave()) return;
  const wasFocus = timer.phase === 'focus';
  abandonFocus('You skipped the session, so the tree withered.');
  if (!wasFocus && timer.startedAt) {
    data.sessions.push({ id: uid(), phase: timer.phase, start: new Date(timer.startedAt).toISOString(), end: new Date().toISOString(), minutes: elapsedMs() / 60_000, completed: false, taskId: null });
  }
  // A skipped focus session doesn't count toward the long-break cycle.
  const next = wasFocus ? 'short' : 'focus';
  setPhase(next);
  renderStats();
}

function reset() {
  if (!confirmLeave()) return;
  abandonFocus('You reset the timer, so the tree withered.');
  setPhase(timer.phase);
  renderStats();
}

function availableSpecies(preferred) {
  const unlocked = unlockedIds(summary(data));
  return unlocked.has(preferred) ? preferred : 'oak';
}

function speciesName(id) {
  return UNLOCKS.find((u) => u.id === id)?.name || id;
}

// ---------------------------------------------------------------------------
// Rendering: timer
// ---------------------------------------------------------------------------
let lastLabel = '';
let lastStage = '';
function renderTick() {
  const remaining = currentRemaining();
  if (timer.running && remaining <= 0) {
    complete();
    return;
  }
  const progress = timer.durationMs ? 1 - remaining / timer.durationMs : 0;
  const label = formatTime(remaining);

  $('#ring-progress').style.strokeDasharray = `${RING_C}`;
  $('#ring-progress').style.strokeDashoffset = `${RING_C * (1 - progress)}`;
  const a = progress * Math.PI * 2;
  $('#ring-dot').setAttribute('cx', 100 + 88 * Math.cos(a));
  $('#ring-dot').setAttribute('cy', 100 + 88 * Math.sin(a));
  $('#mini-progress').style.strokeDasharray = `${MINI_C}`;
  $('#mini-progress').style.strokeDashoffset = `${MINI_C * (1 - progress)}`;

  if (timer.phase === 'focus' && timer.startedAt) {
    forest.setGrowing({ species: timer.species, progress, seed: timer.seed });
    const stage = growthStage(progress);
    if (stage !== lastStage) {
      lastStage = stage;
      $('#stage').textContent = `${STAGE_LABEL[stage]} · ${speciesName(timer.species)}`;
    }
  } else if (timer.phase === 'focus') {
    lastStage = '';
    const name = speciesName(timer.species).toLowerCase();
    $('#stage').textContent = `Start to plant ${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}`;
  } else {
    lastStage = '';
    $('#stage').textContent = timer.running ? 'Stretch, breathe, hydrate' : 'Break time';
  }

  if (label !== lastLabel) {
    lastLabel = label;
    $('#time').textContent = label;
    $('#mini-time').textContent = label;
    document.title = `${label} · ${PHASE_LABEL[timer.phase]} · Pomodoro Forest`;
    api.updateTimer({ label, running: timer.running, phase: timer.phase, icon: trayIcon(progress) });
  }
}

function render() {
  lastLabel = '';
  document.body.classList.toggle('running', timer.running);
  $$('.phase').forEach((b) => b.classList.toggle('active', b.dataset.phase === timer.phase));
  $('#btn-toggle').textContent = timer.running ? 'Pause' : timer.startedAt ? 'Resume' : 'Start';
  $('#mini-toggle-icon').setAttribute('d', timer.running ? 'M7 5h3v14H7zM14 5h3v14h-3z' : 'M7 5l12 7-12 7z');
  $('#mini-phase').textContent = PHASE_LABEL[timer.phase] + (timer.running ? '' : ' · paused');

  const n = data.settings.longInterval;
  let filled = data.cycleCount % n;
  if (filled === 0 && data.cycleCount > 0 && timer.phase === 'long') filled = n;
  $('#session-dots').innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i < filled ? 'done' : ''}"></i>`).join('');

  renderSpecies();
  renderTick();
}

const PHASE_COLORS = { focus: '#4fae6c', short: '#5a9bd0', long: '#9a7fd2' };
const trayCanvas = document.createElement('canvas');
trayCanvas.width = trayCanvas.height = 32;
function trayIcon(progress) {
  const c = trayCanvas.getContext('2d');
  c.clearRect(0, 0, 32, 32);
  c.lineWidth = 4;
  c.strokeStyle = 'rgba(128,128,128,0.45)';
  c.beginPath(); c.arc(16, 16, 12, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = PHASE_COLORS[timer.phase];
  c.lineCap = 'round';
  c.beginPath(); c.arc(16, 16, 12, -Math.PI / 2, -Math.PI / 2 + Math.max(0.05, progress) * Math.PI * 2); c.stroke();
  // little tree in the middle
  c.fillStyle = PHASE_COLORS[timer.phase];
  c.beginPath(); c.moveTo(16, 8); c.lineTo(22, 19); c.lineTo(10, 19); c.closePath(); c.fill();
  c.fillRect(14.5, 19, 3, 4);
  return trayCanvas.toDataURL('image/png');
}

function renderSpecies() {
  const unlocked = unlockedIds(summary(data));
  $('#species-list').innerHTML = SPECIES.map((id) => {
    const u = UNLOCKS.find((x) => x.id === id);
    const locked = !unlocked.has(id);
    const active = (timer.startedAt ? timer.species : data.settings.species) === id && !locked;
    return `<button data-species="${id}" class="${active ? 'active' : ''}" ${locked ? 'disabled' : ''} title="${locked ? 'Unlock: ' + u.desc : u.name}">${locked ? '🔒 ' : ''}${u.name}</button>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Rendering: tasks
// ---------------------------------------------------------------------------
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderTasks() {
  const list = $('#task-list');
  if (!data.tasks.length) {
    list.innerHTML = '<li class="empty" style="background:none;cursor:default">No tasks yet. Add one above, then pick it as your focus.</li>';
  } else {
    list.innerHTML = data.tasks.map((t) => `
      <li data-id="${t.id}" class="${t.done ? 'done' : ''} ${t.id === data.currentTaskId ? 'current' : ''}" title="Click to focus on this task">
        <input type="checkbox" ${t.done ? 'checked' : ''} aria-label="Done" />
        <span class="title">${escapeHtml(t.title)}</span>
        <span class="count">🍅 ${t.pomodoros || 0}/${t.estimate || 1}</span>
        <button class="del" aria-label="Delete">×</button>
      </li>`).join('');
  }
  const sel = $('#focus-task');
  const open = data.tasks.filter((t) => !t.done);
  sel.innerHTML = '<option value="">No task</option>' + open.map((t) => `<option value="${t.id}">${escapeHtml(t.title)} (${t.pomodoros || 0})</option>`).join('');
  sel.value = open.some((t) => t.id === data.currentTaskId) ? data.currentTaskId : '';
}

// ---------------------------------------------------------------------------
// Rendering: stats
// ---------------------------------------------------------------------------
function renderStats() {
  const s = summary(data);
  $('#st-today').textContent = s.todaySessions;
  $('#st-today-min').textContent = formatMinutes(s.todayMinutes);
  $('#st-streak').textContent = s.streak;
  $('#st-total').textContent = s.planted;
  $('#st-total-min').textContent = formatMinutes(s.totalMinutes);
  $('#st-withered').textContent = s.withered;
  drawWeekChart();

  $('#unlocks').innerHTML = UNLOCKS.map((u) => {
    const p = unlockProgress(u, s);
    return `<li class="${p >= 1 ? '' : 'locked'}"><b>${p >= 1 ? '✓ ' : ''}${u.name}</b>${u.kind === 'species' ? 'Tree' : 'Decoration'} · ${u.desc}<div class="bar"><i style="width:${Math.round(p * 100)}%"></i></div></li>`;
  }).join('');
  renderSpecies();
}

function drawWeekChart() {
  const canvas = $('#week-chart');
  const w = canvas.clientWidth || 340;
  const h = canvas.clientHeight || 170;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const c = canvas.getContext('2d');
  c.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim();
  const muted = css.getPropertyValue('--muted').trim();
  const track = css.getPropertyValue('--panel-2').trim();
  const text = css.getPropertyValue('--text').trim();

  const series = weekSeries(data.sessions);
  const max = Math.max(25, ...series.map((d) => d.minutes));
  const padB = 22, padT = 18;
  const bw = (w / 7) * 0.56;
  c.font = '11px system-ui, sans-serif';
  c.textAlign = 'center';
  series.forEach((d, i) => {
    const cx = (i + 0.5) * (w / 7);
    const full = h - padB - padT;
    const bh = (d.minutes / max) * full;
    c.fillStyle = track;
    roundRect(c, cx - bw / 2, padT, bw, full, 6);
    c.fillStyle = accent;
    if (bh > 0) roundRect(c, cx - bw / 2, padT + full - bh, bw, bh, 6);
    c.fillStyle = muted;
    const today = i === 6;
    c.fillText(today ? 'Today' : d.date.toLocaleDateString(undefined, { weekday: 'short' }), cx, h - 6);
    if (d.sessions) {
      c.fillStyle = text;
      c.fillText(`${d.sessions}`, cx, padT + full - bh - 5);
    }
  });
}

function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, h / 2, w / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.fill();
}

// ---------------------------------------------------------------------------
// Forest
// ---------------------------------------------------------------------------
const forest = new Forest($('#forest-canvas'));
window.__forest = forest; // handy for debugging from DevTools

function refreshForest() {
  const shown = treesInRange(data.trees, forestRange);
  forest.setTrees(shown);
  forest.setDecor(unlockedIds(summary(data)));
  const alive = shown.filter((t) => !t.withered).length;
  const dead = shown.length - alive;
  const label = { today: 'today', week: 'this week', all: 'all time' }[forestRange];
  $('#forest-count').textContent = `${alive} tree${alive === 1 ? '' : 's'}${dead ? ` · ${dead} withered` : ''} · ${label}`;
}

let toastTimer = null;
function toast(msg, ms = 3000) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = data.settings.theme;
  document.documentElement.dataset.theme = t === 'system' ? (darkQuery.matches ? 'dark' : 'light') : t;
  drawWeekChart();
}
darkQuery.addEventListener('change', applyTheme);

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
$$('.tab').forEach((tab) => tab.addEventListener('click', () => {
  $$('.tab').forEach((t) => t.classList.toggle('active', t === tab));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + tab.dataset.tab));
  if (tab.dataset.tab === 'stats') renderStats();
}));

$('#btn-toggle').addEventListener('click', toggle);
$('#btn-skip').addEventListener('click', skip);
$('#btn-reset').addEventListener('click', reset);
$('#mini-toggle').addEventListener('click', toggle);
$('#mini-skip').addEventListener('click', skip);
$('#mini-exit').addEventListener('click', () => api.setMiniMode(false));
$('#enter-mini').addEventListener('click', () => api.setMiniMode(true));

$$('.phase').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.phase === timer.phase && !timer.startedAt) return;
  if (!confirmLeave()) return;
  abandonFocus();
  setPhase(b.dataset.phase);
  renderStats();
}));

$('#species-list').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-species]');
  if (!b || b.disabled) return;
  data.settings.species = b.dataset.species;
  if (!timer.startedAt) timer.species = b.dataset.species;
  else toast('Your choice applies to the next tree.');
  save();
  render();
});

$('#focus-task').addEventListener('change', (e) => {
  data.currentTaskId = e.target.value || null;
  save();
  renderTasks();
});

$('#task-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('#task-input').value.trim();
  if (!title) return;
  const task = { id: uid(), title, done: false, pomodoros: 0, estimate: Math.max(1, +$('#task-est').value || 1), createdAt: new Date().toISOString() };
  data.tasks.push(task);
  if (!data.currentTaskId) data.currentTaskId = task.id;
  $('#task-input').value = '';
  $('#task-est').value = 1;
  save();
  renderTasks();
});

$('#task-list').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-id]');
  if (!li) return;
  const task = data.tasks.find((t) => t.id === li.dataset.id);
  if (!task) return;
  if (e.target.matches('.del')) {
    data.tasks = data.tasks.filter((t) => t !== task);
    if (data.currentTaskId === task.id) data.currentTaskId = null;
  } else if (e.target.matches('input[type="checkbox"]')) {
    task.done = e.target.checked;
    if (task.done && data.currentTaskId === task.id) data.currentTaskId = null;
  } else if (!task.done) {
    data.currentTaskId = task.id;
  }
  save();
  renderTasks();
});

$('#clear-done').addEventListener('click', () => {
  data.tasks = data.tasks.filter((t) => !t.done);
  save();
  renderTasks();
});

$$('#forest-range button').forEach((b) => b.addEventListener('click', () => {
  forestRange = b.dataset.range;
  $$('#forest-range button').forEach((x) => x.classList.toggle('active', x === b));
  refreshForest();
}));

// Settings
function bindSettings() {
  const s = data.settings;
  const num = (id, key, min, max) => {
    const el = $(id);
    el.value = s[key];
    el.addEventListener('change', () => {
      const v = Math.min(max, Math.max(min, Math.round(+el.value || s[key])));
      el.value = v;
      s[key] = v;
      save();
      // Apply to the current phase if it hasn't started.
      if (!timer.startedAt) setPhase(timer.phase);
      else render();
    });
  };
  num('#set-focus', 'focus', 1, 180);
  num('#set-short', 'short', 1, 60);
  num('#set-long', 'long', 1, 90);
  num('#set-interval', 'longInterval', 2, 12);

  const check = (id, key) => {
    const el = $(id);
    el.checked = !!s[key];
    el.addEventListener('change', () => { s[key] = el.checked; save(); });
  };
  check('#set-auto-breaks', 'autoBreaks');
  check('#set-auto-focus', 'autoFocus');
  check('#set-notify', 'notifications');

  const sound = $('#set-sound');
  sound.innerHTML = Object.entries(SOUNDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  sound.value = s.sound;
  sound.addEventListener('change', () => { s.sound = sound.value; save(); playSound(s.sound, s.volume); });
  const vol = $('#set-volume');
  vol.value = s.volume;
  vol.addEventListener('change', () => { s.volume = +vol.value; save(); playSound(s.sound, s.volume); });
  $('#test-sound').addEventListener('click', () => playSound(s.sound, s.volume));

  const theme = $('#set-theme');
  theme.value = s.theme;
  theme.addEventListener('change', () => { s.theme = theme.value; save(); applyTheme(); });
}

// Keyboard shortcuts (ignored while typing)
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea') && e.key !== 'Escape') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // Blur a focused button first so Space doesn't also "click" it on key-up.
  if (e.code === 'Space') { e.preventDefault(); e.target.closest('button')?.blur(); toggle(); }
  else if (e.key === 's' || e.key === 'S') skip();
  else if (e.key === 'r' || e.key === 'R') reset();
  else if (e.key === 'm' || e.key === 'M') api.setMiniMode(!document.body.classList.contains('mini'));
  else if (e.key === 'Escape' && document.body.classList.contains('mini')) api.setMiniMode(false);
});

api.onCommand((cmd) => ({ toggle, skip, reset }[cmd]?.()));
api.onMiniMode((on) => {
  document.body.classList.toggle('mini', on);
  if (!on) requestAnimationFrame(() => { forest._resize(); drawWeekChart(); });
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
$('#global-hint').textContent = api.platform === 'darwin' ? '⌘⇧Space' : 'Ctrl+Shift+Space';

// A focus session left running when the app quit counts as abandoned.
if (data.activeSession && data.activeSession.elapsedMs >= WITHER_AFTER_MS) {
  const a = data.activeSession;
  data.sessions.push({ id: uid(), phase: 'focus', start: new Date(a.startedAt).toISOString(), end: new Date().toISOString(), minutes: a.elapsedMs / 60_000, completed: false, taskId: a.taskId || null });
  data.trees.push({ id: uid(), species: a.species, plantedAt: new Date().toISOString(), minutes: a.elapsedMs / 60_000, withered: true, seed: a.seed, taskId: a.taskId || null });
  setTimeout(() => toast('The app closed mid-session, so that tree withered.', 4500), 800);
}
data.activeSession = null;

// Dev/test hook: ?hour=21 previews the sky at a given local hour.
const hourParam = new URLSearchParams(location.search).get('hour');
if (hourParam !== null) forest.setHourOverride(+hourParam);

applyTheme();
bindSettings();
setPhase('focus');
renderTasks();
renderStats();
refreshForest();

// Keep an accurate clock even if the window is in the background.
setInterval(renderTick, 250);
function raf() { renderTick(); requestAnimationFrame(raf); }
requestAnimationFrame(raf);

// Save running progress periodically so a crash still withers the right tree.
setInterval(() => { if (timer.running && timer.phase === 'focus') persistActive(); }, 15_000);

// Expose a tiny API for automated tests.
window.__app = { data: () => data, timer, start, pause, skip, reset, complete, setPhase, refreshForest };
