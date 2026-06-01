let muted = false;
let audio = null;
let proceduralTimer = null;
let musicGain = null;
let proceduralPaused = false;
let musicStep = 0;
let musicSection = 0;
const lastPlayed = new Map();
const MUSIC_BPM = 138;
const MUSIC_STEP_MS = Math.round(60000 / MUSIC_BPM / 2);
const MUSIC_SCALE = [55, 65.41, 73.42, 82.41, 98, 110, 130.81, 146.83];
const LEAD_PATTERN = [12, 14, 15, 10, 12, 17, 15, 14, 12, 10, 8, 10, 12, 15, 17, 19];
const BASS_PATTERN = [0, 0, 3, 0, 5, 5, 3, 0, 0, 0, 3, 0, 6, 5, 3, 0];

export function setMuted(value) {
  muted = value;
  if (musicGain) musicGain.gain.value = muted ? 0.0001 : 0.035;
  if (!muted && !proceduralTimer) startMusic();
}

export function isMuted() {
  return muted;
}

export function playTone(freq, duration = 0.04, type = "sine") {
  if (muted) return;
  try {
    const ctx = ensureAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = 0.035;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    muted = true;
  }
}

export function playSfx(name) {
  if (muted) return;
  const spec = SFX[name];
  if (!spec) return;
  const now = performance.now();
  if (now - (lastPlayed.get(name) || 0) < (spec.gap || 0)) return;
  lastPlayed.set(name, now);
  for (const layer of spec.layers) {
    if (layer.noise) playNoise(layer);
    else playLayer(layer);
  }
}

export async function startMusic() {
  if (muted) return;
  if (proceduralTimer) return;
  if (proceduralPaused) {
    proceduralPaused = false;
    startProceduralMusic();
    return;
  }
  stopProceduralMusic();
  startProceduralMusic();
}

export function stopMusic() {
  proceduralPaused = false;
  stopProceduralMusic();
}

export function pauseMusic() {
  if (proceduralTimer) {
    stopProceduralMusic();
    proceduralPaused = true;
  }
}

export function resumeMusic() {
  if (muted) return;
  startMusic();
}

export async function nextMusicTrack() {
  musicSection = (musicSection + 1) % 4;
  musicStep = musicSection * 16;
  if (!proceduralTimer && !muted) startProceduralMusic();
}

export function proceduralMusicArrangement() {
  return {
    externalTracks: false,
    bpm: MUSIC_BPM,
    key: "A Phrygian dominant / neon minor",
    instruments: ["kick", "snare", "hat", "bass", "lead", "pad", "arpeggio"],
  };
}

function startProceduralMusic() {
  if (muted || proceduralTimer) return;
  try {
    const ctx = ensureAudio();
    musicGain ||= ctx.createGain();
    musicGain.gain.value = 0.045;
    musicGain.connect(ctx.destination);
    const playStep = () => {
      if (muted) return;
      scheduleMusicStep(musicStep++);
    };
    playStep();
    proceduralTimer = window.setInterval(playStep, MUSIC_STEP_MS);
  } catch {
    muted = true;
  }
}

function stopProceduralMusic() {
  if (proceduralTimer) {
    window.clearInterval(proceduralTimer);
    proceduralTimer = null;
  }
}

function playMusicNote(freq, duration, type, gainValue, delay = 0) {
  const ctx = ensureAudio();
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(gain);
  gain.connect(musicGain || ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function scheduleMusicStep(step) {
  const beat = step % 16;
  const phrase = Math.floor(step / 16) % 4;
  if (beat === 0 || beat === 8 || beat === 11) playMusicKick(beat === 0 ? 1 : 0.72);
  if (beat === 4 || beat === 12) playMusicSnare(phrase > 1 ? 0.78 : 0.62);
  if (beat % 2 === 1 || (phrase > 0 && beat % 4 === 2)) playMusicHat(beat % 4 === 3 ? 0.034 : 0.022);
  if (beat % 2 === 0) {
    const bass = MUSIC_SCALE[BASS_PATTERN[beat] % MUSIC_SCALE.length] * (phrase === 3 && beat > 10 ? 2 : 1);
    playMusicNote(bass, 0.22, "sawtooth", 0.018);
  }
  if (beat % 4 === 0) {
    const root = MUSIC_SCALE[(phrase * 2) % MUSIC_SCALE.length];
    playMusicNote(root * 2, 1.65, "triangle", 0.011);
    playMusicNote(root * 3, 1.4, "sine", 0.007, 0.03);
  }
  if ((phrase > 0 && beat % 2 === 0) || phrase === 3) {
    const degree = LEAD_PATTERN[(beat + phrase * 3) % LEAD_PATTERN.length] % MUSIC_SCALE.length;
    const octave = LEAD_PATTERN[(beat + phrase * 3) % LEAD_PATTERN.length] > 11 ? 4 : 3;
    playMusicNote(MUSIC_SCALE[degree] * octave, phrase === 3 ? 0.14 : 0.2, "square", phrase === 3 ? 0.01 : 0.007, 0.02);
  }
}

function playMusicKick(power) {
  const ctx = ensureAudio();
  const start = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(95, start);
  osc.frequency.exponentialRampToValueAtTime(38, start + 0.12);
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.exponentialRampToValueAtTime(0.045 * power, start + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
  osc.connect(gain);
  gain.connect(musicGain || ctx.destination);
  osc.start(start);
  osc.stop(start + 0.2);
}

function playMusicSnare(power) {
  playMusicNoise({ d: 0.11, g: 0.038 * power, filter: 1800, type: "bandpass" });
  playMusicNote(185, 0.06, "triangle", 0.008 * power);
}

function playMusicHat(gainValue) {
  playMusicNoise({ d: 0.035, g: gainValue, filter: 7200, type: "highpass" });
}

function playMusicNoise(spec) {
  const ctx = ensureAudio();
  const start = ctx.currentTime;
  const length = Math.max(1, Math.floor(ctx.sampleRate * spec.d));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = buffer;
  filter.type = spec.type || "highpass";
  filter.frequency.value = spec.filter || 3000;
  gain.gain.setValueAtTime(spec.g || 0.02, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + spec.d);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(musicGain || ctx.destination);
  source.start(start);
  source.stop(start + spec.d);
}

const SFX = {
  start: { gap: 120, layers: [{ f: 180, to: 260, d: 0.09, type: "square", g: 0.035 }, { f: 360, d: 0.05, delay: 0.06, type: "triangle", g: 0.025 }] },
  select: { gap: 80, layers: [{ f: 420, to: 620, d: 0.08, type: "triangle", g: 0.03 }] },
  level: { gap: 120, layers: [{ f: 520, d: 0.05, type: "sine", g: 0.03 }, { f: 660, d: 0.05, delay: 0.05, type: "sine", g: 0.028 }, { f: 880, d: 0.08, delay: 0.1, type: "triangle", g: 0.026 }] },
  wave: { gap: 260, layers: [{ f: 220, to: 440, d: 0.12, type: "sawtooth", g: 0.024 }, { noise: true, d: 0.08, g: 0.018, filter: 900 }] },
  shoot: { gap: 32, layers: [{ f: 560, to: 300, d: 0.035, type: "square", g: 0.018 }] },
  hit: { gap: 28, layers: [{ f: 180, to: 120, d: 0.035, type: "triangle", g: 0.018 }, { noise: true, d: 0.025, g: 0.012, filter: 1200 }] },
  explode: { gap: 70, layers: [{ f: 120, to: 55, d: 0.15, type: "sawtooth", g: 0.035 }, { noise: true, d: 0.12, g: 0.03, filter: 500 }] },
  gem: { gap: 22, layers: [{ f: 820, to: 1120, d: 0.035, type: "sine", g: 0.018 }] },
  coin: { gap: 32, layers: [{ f: 680, to: 940, d: 0.04, type: "triangle", g: 0.018 }, { f: 1280, d: 0.025, delay: 0.025, type: "sine", g: 0.011 }] },
  buy: { gap: 80, layers: [{ f: 360, to: 540, d: 0.06, type: "square", g: 0.02 }, { f: 760, d: 0.05, delay: 0.045, type: "triangle", g: 0.014 }] },
  deny: { gap: 110, layers: [{ f: 180, to: 120, d: 0.08, type: "sawtooth", g: 0.02 }] },
  hurt: { gap: 180, layers: [{ f: 150, to: 90, d: 0.12, type: "sawtooth", g: 0.035 }] },
  slimeLand: { gap: 85, layers: [{ f: 130, to: 95, d: 0.055, type: "sine", g: 0.018 }] },
  victory: { gap: 500, layers: [{ f: 440, d: 0.08, type: "triangle", g: 0.035 }, { f: 660, d: 0.08, delay: 0.08, type: "triangle", g: 0.03 }, { f: 880, d: 0.16, delay: 0.16, type: "sine", g: 0.026 }] },
  defeat: { gap: 500, layers: [{ f: 160, to: 70, d: 0.26, type: "sawtooth", g: 0.035 }] },
};

function ensureAudio() {
  audio ||= new (window.AudioContext || window.webkitAudioContext)();
  if (audio.state === "suspended") audio.resume();
  return audio;
}

function playLayer(spec) {
  try {
    const ctx = ensureAudio();
    const start = ctx.currentTime + (spec.delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = spec.type || "sine";
    osc.frequency.setValueAtTime(spec.f, start);
    if (spec.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, spec.to), start + spec.d);
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(spec.g || 0.025, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, start + spec.d);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + spec.d + 0.02);
  } catch {
    muted = true;
  }
}

function playNoise(spec) {
  try {
    const ctx = ensureAudio();
    const start = ctx.currentTime + (spec.delay || 0);
    const length = Math.max(1, Math.floor(ctx.sampleRate * spec.d));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = spec.filter || 1000;
    gain.gain.setValueAtTime(spec.g || 0.02, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + spec.d);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(start);
    source.stop(start + spec.d);
  } catch {
    muted = true;
  }
}
