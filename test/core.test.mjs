import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nextPhase, formatTime, currentStreak, longestStreak, weekSeries, summary, unlockedIds,
  treesInRange, growthStage, normalizeData, dayKey,
} from '../src/renderer/core.js';

const day = (offset, hour = 10) => {
  const d = new Date(2026, 10, 11, hour);
  d.setDate(d.getDate() + offset);
  return d.toISOString();
};
const focus = (offset, completed = true) => ({ phase: 'focus', start: day(offset), end: day(offset), minutes: 25, completed });
const NOW = new Date(2026, 10, 11, 18);

test('long break every N focus sessions', () => {
  assert.equal(nextPhase('focus', 1, 4), 'short');
  assert.equal(nextPhase('focus', 3, 4), 'short');
  assert.equal(nextPhase('focus', 4, 4), 'long');
  assert.equal(nextPhase('focus', 8, 4), 'long');
  assert.equal(nextPhase('short', 1, 4), 'focus');
  assert.equal(nextPhase('long', 4, 4), 'focus');
});

test('formatTime rounds up to whole seconds', () => {
  assert.equal(formatTime(25 * 60_000), '25:00');
  assert.equal(formatTime(59_001), '01:00');
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(-5), '00:00');
});

test('streak counts consecutive days and tolerates nothing yet today', () => {
  const sessions = [focus(-1), focus(-2), focus(-3), focus(-5)];
  assert.equal(currentStreak(sessions, NOW), 3);
  assert.equal(currentStreak([...sessions, focus(0)], NOW), 4);
  assert.equal(currentStreak([focus(-2)], NOW), 0);
  assert.equal(currentStreak([focus(-1, false)], NOW), 0, 'withered sessions do not count');
  assert.equal(longestStreak([focus(-10), focus(-9), focus(-8), focus(-1)]), 3);
});

test('week series covers 7 days ending today', () => {
  const s = weekSeries([focus(0), focus(0), focus(-6), focus(-7)], NOW);
  assert.equal(s.length, 7);
  assert.equal(s[6].key, dayKey(NOW));
  assert.equal(s[6].sessions, 2);
  assert.equal(s[0].sessions, 1);
  assert.equal(s.reduce((a, d) => a + d.sessions, 0), 3);
});

test('unlocks follow totals and streaks', () => {
  const data = normalizeData({ sessions: Array.from({ length: 5 }, () => focus(0)) });
  const ids = unlockedIds(summary(data, NOW));
  assert.ok(ids.has('oak') && ids.has('pine') && ids.has('flowers'));
  assert.ok(!ids.has('cherry'));
  const streaky = normalizeData({ sessions: [focus(0), focus(-1), focus(-2)] });
  assert.ok(unlockedIds(summary(streaky, NOW)).has('cherry'));
});

test('forest range filter', () => {
  const trees = [{ plantedAt: day(0) }, { plantedAt: day(-3) }, { plantedAt: day(-10) }];
  assert.equal(treesInRange(trees, 'today', NOW).length, 1);
  assert.equal(treesInRange(trees, 'week', NOW).length, 2);
  assert.equal(treesInRange(trees, 'all', NOW).length, 3);
});

test('growth stages', () => {
  assert.equal(growthStage(0), 'seed');
  assert.equal(growthStage(0.2), 'sprout');
  assert.equal(growthStage(0.5), 'sapling');
  assert.equal(growthStage(0.9), 'tree');
});

test('normalizeData fills defaults', () => {
  const d = normalizeData({ settings: { focus: 50 } });
  assert.equal(d.settings.focus, 50);
  assert.equal(d.settings.short, 5);
  assert.deepEqual(d.trees, []);
});
