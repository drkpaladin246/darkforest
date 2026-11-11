// Chimes synthesized with Web Audio, so the app ships no audio files and works offline.

export const SOUNDS = {
  bell: 'Bell',
  chime: 'Wind chime',
  marimba: 'Marimba',
  gong: 'Soft gong',
  birds: 'Birdsong',
  none: 'None',
};

let ctx = null;
function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(ac, out, { freq, start, dur, type = 'sine', gain = 1, attack = 0.005, glide = 0 }) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (glide) osc.frequency.exponentialRampToValueAtTime(freq * glide, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(out);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

const PATCHES = {
  bell(ac, out, t) {
    // Inharmonic partials give a bell-like ring.
    for (const [i, f] of [880, 880 * 2.76, 880 * 5.4].entries()) {
      tone(ac, out, { freq: f, start: t, dur: 2.2 - i * 0.6, gain: 0.5 / (i + 1) });
    }
    for (const [i, f] of [660, 660 * 2.76].entries()) {
      tone(ac, out, { freq: f, start: t + 0.45, dur: 1.8 - i * 0.5, gain: 0.4 / (i + 1) });
    }
  },
  chime(ac, out, t) {
    const notes = [1046.5, 1318.5, 1568, 2093, 1568, 1318.5];
    notes.forEach((f, i) => tone(ac, out, { freq: f, start: t + i * 0.14 + Math.random() * 0.03, dur: 1.4, gain: 0.25 }));
  },
  marimba(ac, out, t) {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone(ac, out, { freq: f, start: t + i * 0.12, dur: 0.5, gain: 0.5 });
      tone(ac, out, { freq: f * 4, start: t + i * 0.12, dur: 0.08, gain: 0.12 });
    });
  },
  gong(ac, out, t) {
    tone(ac, out, { freq: 110, start: t, dur: 3.5, gain: 0.6, attack: 0.03, glide: 0.97 });
    tone(ac, out, { freq: 110 * 2.3, start: t, dur: 2.5, gain: 0.25, attack: 0.05 });
    tone(ac, out, { freq: 110 * 3.9, start: t, dur: 1.6, gain: 0.12, attack: 0.08 });
  },
  birds(ac, out, t) {
    for (let i = 0; i < 5; i++) {
      const s = t + i * 0.18 + (i > 2 ? 0.25 : 0);
      tone(ac, out, { freq: 2600 + Math.random() * 600, start: s, dur: 0.12, gain: 0.25, glide: 1.4 });
    }
  },
};

export function playSound(name, volume = 0.6) {
  if (!name || name === 'none' || volume <= 0 || !PATCHES[name]) return;
  try {
    const ac = audio();
    const master = ac.createGain();
    master.gain.value = Math.min(1, volume) * 0.8;
    master.connect(ac.destination);
    PATCHES[name](ac, master, ac.currentTime + 0.02);
  } catch (err) {
    console.warn('Sound failed', err);
  }
}
