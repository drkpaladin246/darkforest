// Pure logic shared by the UI and the tests: no DOM, no Three.js.

export const DEFAULT_SETTINGS = {
  focus: 25,
  short: 5,
  long: 15,
  longInterval: 4,
  autoBreaks: false,
  autoFocus: false,
  notifications: true,
  sound: 'bell',
  volume: 0.6,
  theme: 'system',
  species: 'oak',
};

export function defaultData() {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    tasks: [],
    currentTaskId: null,
    sessions: [], // { id, phase, start, end, minutes, completed, taskId }
    trees: [],    // { id, species, plantedAt, minutes, withered, seed, taskId }
    cycleCount: 0, // focus sessions completed in the current long-break cycle
  };
}

export function normalizeData(raw) {
  const base = defaultData();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    settings: { ...base.settings, ...(raw.settings || {}) },
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    trees: Array.isArray(raw.trees) ? raw.trees : [],
  };
}

export const PHASE_LABEL = { focus: 'Focus', short: 'Short break', long: 'Long break' };

/** Which phase follows `phase`, given how many focus sessions are done in this cycle. */
export function nextPhase(phase, cycleCount, longInterval) {
  if (phase !== 'focus') return 'focus';
  return cycleCount > 0 && cycleCount % longInterval === 0 ? 'long' : 'short';
}

export function formatTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatMinutes(min) {
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Local-date key, e.g. "2026-11-11". */
export function dayKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Growth stage for a progress value 0..1. */
export function growthStage(progress) {
  if (progress < 0.1) return 'seed';
  if (progress < 0.35) return 'sprout';
  if (progress < 0.7) return 'sapling';
  return 'tree';
}

export const STAGE_LABEL = {
  seed: 'Seed planted',
  sprout: 'Sprouting',
  sapling: 'Sapling',
  tree: 'Almost a tree',
};

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
export function completedFocus(sessions) {
  return sessions.filter((s) => s.phase === 'focus' && s.completed);
}

/** Consecutive days (ending today, or yesterday if nothing yet today) with at least one completed focus. */
export function currentStreak(sessions, now = new Date()) {
  const days = new Set(completedFocus(sessions).map((s) => dayKey(s.end)));
  const cursor = startOfDay(now);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function longestStreak(sessions) {
  const days = [...new Set(completedFocus(sessions).map((s) => dayKey(s.end)))].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const key of days) {
    const d = new Date(key + 'T00:00:00');
    if (prev) {
      const expected = new Date(prev);
      expected.setDate(expected.getDate() + 1);
      run = dayKey(expected) === key ? run + 1 : 1;
    } else run = 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** Last 7 days (oldest first) with sessions and focus minutes. */
export function weekSeries(sessions, now = new Date()) {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = startOfDay(now);
    d.setDate(d.getDate() - i);
    out.push({ key: dayKey(d), date: d, sessions: 0, minutes: 0 });
  }
  const byKey = Object.fromEntries(out.map((o) => [o.key, o]));
  for (const s of completedFocus(sessions)) {
    const o = byKey[dayKey(s.end)];
    if (o) {
      o.sessions++;
      o.minutes += s.minutes;
    }
  }
  return out;
}

export function summary(data, now = new Date()) {
  const focus = completedFocus(data.sessions);
  const today = dayKey(now);
  const todays = focus.filter((s) => dayKey(s.end) === today);
  return {
    todaySessions: todays.length,
    todayMinutes: todays.reduce((a, s) => a + s.minutes, 0),
    totalSessions: focus.length,
    totalMinutes: focus.reduce((a, s) => a + s.minutes, 0),
    streak: currentStreak(data.sessions, now),
    bestStreak: longestStreak(data.sessions),
    withered: data.trees.filter((t) => t.withered).length,
    planted: data.trees.filter((t) => !t.withered).length,
  };
}

/** Trees visible for a range: 'today' | 'week' | 'all'. */
export function treesInRange(trees, range, now = new Date()) {
  if (range === 'all') return trees;
  const from = startOfDay(now);
  if (range === 'week') from.setDate(from.getDate() - 6);
  return trees.filter((t) => new Date(t.plantedAt) >= from);
}

// ---------------------------------------------------------------------------
// Unlocks
// ---------------------------------------------------------------------------
// kind: 'species' can be chosen for new trees; 'decor' appears on the island.
// need: { total } completed focus sessions, or { streak } best streak in days.
export const UNLOCKS = [
  { id: 'oak', kind: 'species', name: 'Oak', need: { total: 0 }, desc: 'Your first tree' },
  { id: 'flowers', kind: 'decor', name: 'Wildflowers', need: { total: 3 }, desc: '3 sessions' },
  { id: 'pine', kind: 'species', name: 'Pine', need: { total: 5 }, desc: '5 sessions' },
  { id: 'rocks', kind: 'decor', name: 'Mossy rocks', need: { total: 10 }, desc: '10 sessions' },
  { id: 'cherry', kind: 'species', name: 'Cherry blossom', need: { streak: 3 }, desc: '3-day streak' },
  { id: 'rabbit', kind: 'decor', name: 'Rabbits', need: { total: 15 }, desc: '15 sessions' },
  { id: 'birds', kind: 'decor', name: 'Birds', need: { streak: 5 }, desc: '5-day streak' },
  { id: 'palm', kind: 'species', name: 'Palm', need: { total: 25 }, desc: '25 sessions' },
  { id: 'pond', kind: 'decor', name: 'Pond', need: { streak: 7 }, desc: '7-day streak' },
  { id: 'deer', kind: 'decor', name: 'Deer', need: { total: 50 }, desc: '50 sessions' },
];

export function unlockProgress(unlock, totals) {
  if (unlock.need.total !== undefined) {
    return unlock.need.total === 0 ? 1 : Math.min(1, totals.totalSessions / unlock.need.total);
  }
  return Math.min(1, totals.bestStreak / unlock.need.streak);
}

export function unlockedIds(totals) {
  return new Set(UNLOCKS.filter((u) => unlockProgress(u, totals) >= 1).map((u) => u.id));
}

// ---------------------------------------------------------------------------
// Placement: golden-angle spiral so the forest fills the island evenly.
// ---------------------------------------------------------------------------
export const TREE_SPACING = 1.15;

export function treePosition(index, seed = 0) {
  const angle = index * 2.399963229728653 + (seed % 1) * 0.4; // golden angle
  const r = TREE_SPACING * Math.sqrt(index + 0.6);
  const jitter = ((seed * 9301 + 49297) % 233280) / 233280 - 0.5;
  return { x: Math.cos(angle) * (r + jitter * 0.3), z: Math.sin(angle) * (r + jitter * 0.3) };
}

/** Island radius big enough for `count` trees plus a rim for decorations. */
export function islandRadius(count) {
  return Math.max(6.5, TREE_SPACING * Math.sqrt(count + 1) + 3.2);
}
