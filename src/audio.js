let muted = false;
let audio = null;
let proceduralTimer = null;
let musicGain = null;
let musicCompressor = null;
let musicElement = null;
let musicTracks = null;
let musicTrackBase = "";
let currentTrackIndex = 0;
let proceduralPaused = false;
let musicStep = 0;
let musicSection = 0;
let nextMusicTime = 0;
const lastPlayed = new Map();
const MUSIC_PLAYLIST = "assets/music/playlist.json";
const MUSIC_BPM = 152;
const MUSIC_STEP_MS = Math.round(60000 / MUSIC_BPM / 2);
const MUSIC_STEP_SECONDS = MUSIC_STEP_MS / 1000;
const MUSIC_MASTER_GAIN = 0.11;
const MUSIC_LOOKAHEAD_STEPS = 6;
const MUSIC_SCALE = [55, 61.74, 65.41, 73.42, 82.41, 92.5, 98, 110, 123.47, 130.81, 146.83, 164.81, 196];
const LEAD_PATTERN = [12, 14, 15, 17, 19, 17, 15, 14, 12, 10, 8, 10, 12, 15, 17, 22, 24, 22, 19, 17, 15, 17, 19, 15, 14, 12, 10, 12, 15, 17, 19, 22];
const BASS_PATTERN = [0, 0, 3, 0, 5, 0, 7, 5, 0, 0, 3, 5, 8, 7, 5, 3, 0, 0, 5, 0, 7, 5, 3, 0, 8, 7, 5, 3, 0, 3, 5, 7];
const ARP_PATTERN = [0, 3, 7, 10, 8, 7, 3, 7, 0, 5, 8, 12, 10, 8, 5, 8, 0, 3, 8, 12, 10, 8, 3, 8, 0, 5, 10, 12, 11, 10, 5, 8];
const CHORD_ROOTS = [0, 5, 3, 7, 0, 8, 5, 3];

export function setMuted(value) {
  muted = value;
  if (musicGain) musicGain.gain.value = muted ? 0.0001 : MUSIC_MASTER_GAIN;
  if (musicElement) musicElement.muted = muted;
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
  if (await startExternalMusic()) return;
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
  stopExternalMusic();
  stopProceduralMusic();
}

export function pauseMusic() {
  if (musicElement && !musicElement.paused) {
    musicElement.pause();
    proceduralPaused = true;
  }
  if (proceduralTimer) {
    stopProceduralMusic();
    proceduralPaused = true;
  }
}

export function resumeMusic() {
  if (muted) return;
  startMusic();
}

export async function preloadMusicAssets() {
  const tracks = await loadMusicTracks();
  if (!tracks.length) return [];
  if (!musicElement) musicElement = new Audio();
  if (!musicElement.src) {
    musicElement.preload = "auto";
    musicElement.src = resolveTrackUrl(tracks[0]);
    musicElement.load();
  }
  return tracks;
}

export async function nextMusicTrack() {
  if (musicTracks?.length) {
    currentTrackIndex = (currentTrackIndex + 1) % musicTracks.length;
    await startExternalMusic(true);
    return;
  }
  musicSection = (musicSection + 1) % 4;
  musicStep = musicSection * 16;
  if (!proceduralTimer && !muted) startProceduralMusic();
}

export function proceduralMusicArrangement() {
  return {
    externalTracks: true,
    bpm: MUSIC_BPM,
    continuous: true,
    masterGain: MUSIC_MASTER_GAIN,
    lookaheadSteps: MUSIC_LOOKAHEAD_STEPS,
    key: "external playlist",
    instruments: ["external audio"],
  };
}

function startProceduralMusic() {
  if (muted || proceduralTimer) return;
  try {
    const ctx = ensureAudio();
    musicGain ||= ctx.createGain();
    musicCompressor ||= ctx.createDynamicsCompressor();
    musicCompressor.threshold.value = -20;
    musicCompressor.knee.value = 20;
    musicCompressor.ratio.value = 6;
    musicCompressor.attack.value = 0.006;
    musicCompressor.release.value = 0.18;
    musicGain.gain.value = MUSIC_MASTER_GAIN;
    try {
      musicGain.disconnect();
      musicCompressor.disconnect();
    } catch {}
    musicGain.connect(musicCompressor);
    musicCompressor.connect(ctx.destination);
    nextMusicTime = ctx.currentTime + 0.035;
    const schedule = () => {
      if (muted) return;
      const now = ctx.currentTime;
      while (nextMusicTime < now + MUSIC_STEP_SECONDS * MUSIC_LOOKAHEAD_STEPS) {
        scheduleMusicStep(musicStep++, nextMusicTime);
        nextMusicTime += MUSIC_STEP_SECONDS;
      }
    };
    schedule();
    proceduralTimer = window.setInterval(schedule, Math.max(35, MUSIC_STEP_MS * 0.45));
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

async function startExternalMusic(forceReload = false) {
  try {
    const tracks = await loadMusicTracks();
    if (!tracks.length) return false;
    musicElement ||= new Audio();
    musicElement.preload = "auto";
    const file = tracks[currentTrackIndex % tracks.length];
    const src = resolveTrackUrl(file);
    if (forceReload || musicElement.src !== new URL(src, window.location.href).href) {
      musicElement.src = src;
      musicElement.load();
    }
    musicElement.loop = tracks.length <= 1;
    musicElement.muted = muted;
    musicElement.volume = 1;
    musicElement.onended = () => {
      if (!musicTracks?.length || muted) return;
      currentTrackIndex = (currentTrackIndex + 1) % musicTracks.length;
      startExternalMusic(true);
    };
    stopProceduralMusic();
    proceduralPaused = false;
    await musicElement.play();
    return true;
  } catch {
    return false;
  }
}

async function loadMusicTracks() {
  if (musicTracks) return musicTracks;
  try {
    const response = await fetch(MUSIC_PLAYLIST, { cache: "no-store" });
    if (!response.ok) throw new Error("playlist unavailable");
    const data = await response.json();
    musicTracks = (data.tracks || [])
      .map((track) => typeof track === "string" ? track : track?.file)
      .filter(Boolean);
    musicTrackBase = MUSIC_PLAYLIST.slice(0, MUSIC_PLAYLIST.lastIndexOf("/") + 1);
    return musicTracks;
  } catch {}
  musicTracks = [];
  return musicTracks;
}

function resolveTrackUrl(file) {
  if (/^(https?:)?\/\//.test(file) || file.startsWith("/") || file.startsWith("data:")) return file;
  return `${musicTrackBase}${file}`;
}

function stopExternalMusic() {
  if (!musicElement) return;
  musicElement.pause();
  musicElement.currentTime = 0;
}

function playMusicNote(freq, duration, type, gainValue, delay = 0, at = null) {
  const ctx = ensureAudio();
  const start = (at ?? ctx.currentTime) + delay;
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

function scheduleMusicStep(step, at = null) {
  const beat = step % 16;
  const phrase = Math.floor(step / 16) % 8;
  const patternIndex = step % 32;
  const barStart = beat === 0;
  const phraseLift = phrase >= 4 ? 1.14 : 1;
  const heavyKick = beat === 0 || beat === 8;
  if (barStart) playMusicImpact(phrase >= 4 ? 0.72 : 0.48, at);
  if (heavyKick || beat === 3 || beat === 6 || beat === 10 || beat === 14 || (phrase >= 5 && beat === 12)) playMusicKick((heavyKick ? 1.28 : 0.82) * phraseLift, at);
  if (beat === 4 || beat === 12) playMusicSnare((phrase >= 4 ? 1.18 : 0.96) * phraseLift, at);
  if ((phrase > 2 && beat === 7) || beat === 15) playMusicSnare(phrase >= 6 ? 0.46 : 0.32, at);
  if (phrase >= 5 && (beat === 6 || beat === 14)) playMusicTom(beat === 6 ? 128 : 96, 0.62, at);
  playMusicHat(beat % 4 === 0 ? 0.03 : beat % 2 === 1 ? 0.052 : 0.038, 0, at);
  if (phrase > 0 && beat % 2 === 0) playMusicHat(0.024, MUSIC_STEP_SECONDS * 0.48, at);
  if (beat === 2 || beat === 10 || (phrase >= 4 && beat === 14)) playMusicOpenHat(phrase >= 4 ? 0.05 : 0.038, at);
  if (phrase >= 3 && beat % 4 === 1) playMusicRide(0.024, at);

  const bass = MUSIC_SCALE[BASS_PATTERN[patternIndex] % MUSIC_SCALE.length] * (phrase >= 6 && beat > 10 ? 2 : 1);
  if (beat % 2 === 0 || phrase >= 2) {
    playMusicNote(bass, phrase >= 4 ? 0.15 : 0.22, "sawtooth", phrase >= 4 ? 0.066 : 0.052, 0, at);
    playMusicNote(bass * 0.5, beat === 0 || beat === 8 ? 0.38 : 0.18, "sine", beat === 0 || beat === 8 ? 0.068 : 0.034, 0, at);
  }

  if (beat % 4 === 0) {
    const root = MUSIC_SCALE[CHORD_ROOTS[(Math.floor(step / 16) + beat / 4) % CHORD_ROOTS.length] % MUSIC_SCALE.length];
    playMusicChord(root, phrase, at);
  }
  if (beat % 2 === 1 || phrase >= 2) {
    const arp = MUSIC_SCALE[ARP_PATTERN[(patternIndex + phrase * 3) % ARP_PATTERN.length] % MUSIC_SCALE.length];
    playMusicNote(arp * 4, 0.075, "triangle", phrase >= 4 ? 0.028 : 0.019, 0.01, at);
    if (phrase >= 5) playMusicNote(arp * 8, 0.052, "sine", 0.012, MUSIC_STEP_SECONDS * 0.28, at);
  }
  if ((phrase > 0 && beat % 2 === 0) || phrase >= 4) {
    const leadIndex = (patternIndex + phrase * 4) % LEAD_PATTERN.length;
    const degree = LEAD_PATTERN[leadIndex] % MUSIC_SCALE.length;
    const octave = LEAD_PATTERN[leadIndex] > 15 ? 4 : 3;
    playMusicNote(MUSIC_SCALE[degree] * octave, phrase >= 4 ? 0.15 : 0.21, "square", phrase >= 4 ? 0.032 : 0.022, 0.02, at);
    if (phrase >= 3 && beat % 4 === 2) playMusicNote(MUSIC_SCALE[degree] * octave * 1.5, 0.11, "triangle", 0.018, 0.08, at);
    if (phrase >= 6 && beat % 4 === 0) playMusicNote(MUSIC_SCALE[(degree + 3) % MUSIC_SCALE.length] * octave * 2, 0.16, "sine", 0.016, 0.12, at);
  }
}

function playMusicKick(power, at = null) {
  const ctx = ensureAudio();
  const start = at ?? ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(95, start);
  osc.frequency.exponentialRampToValueAtTime(38, start + 0.12);
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.exponentialRampToValueAtTime(0.08 * power, start + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
  osc.connect(gain);
  gain.connect(musicGain || ctx.destination);
  osc.start(start);
  osc.stop(start + 0.2);
}

function playMusicTom(freq, power, at = null) {
  const ctx = ensureAudio();
  const start = at ?? ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(48, freq * 0.48), start + 0.18);
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.exponentialRampToValueAtTime(0.052 * power, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);
  osc.connect(gain);
  gain.connect(musicGain || ctx.destination);
  osc.start(start);
  osc.stop(start + 0.28);
}

function playMusicSnare(power, at = null) {
  playMusicNoise({ d: 0.11, g: 0.065 * power, filter: 1800, type: "bandpass" }, at);
  playMusicNote(185, 0.06, "triangle", 0.016 * power, 0, at);
}

function playMusicHat(gainValue, delay = 0, at = null) {
  playMusicNoise({ d: 0.035, g: gainValue * 1.4, filter: 7200, type: "highpass", delay }, at);
}

function playMusicOpenHat(gainValue, at = null) {
  playMusicNoise({ d: 0.14, g: gainValue, filter: 6400, type: "highpass" }, at);
}

function playMusicRide(gainValue, at = null) {
  const ctx = ensureAudio();
  const start = at ?? ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
  for (const freq of [2960, 4210, 6150]) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, start);
    osc.connect(gain);
    osc.start(start);
    osc.stop(start + 0.3);
  }
  gain.connect(musicGain || ctx.destination);
}

function playMusicChord(root, phrase, at = null) {
  const chord = phrase % 2 ? [1, 2.25, 3, 4.5] : [1, 2, 3, 4];
  for (let i = 0; i < chord.length; i++) {
    const gain = i === 0 ? 0.038 : 0.02;
    playMusicNote(root * chord[i], i === 0 ? 1.7 : 1.15, i === 0 ? "triangle" : "sine", gain, i * 0.018, at);
  }
  if (phrase >= 2) playMusicNote(root * 6, 0.32, "square", 0.012, 0.06, at);
  if (phrase >= 5) playMusicNoise({ d: 0.22, g: 0.012, filter: 2600, type: "bandpass", delay: 0.02 }, at);
}

function playMusicImpact(power, at = null) {
  playMusicNoise({ d: 0.18, g: 0.034 * power, filter: 680, type: "lowpass" }, at);
  playMusicNote(74, 0.22, "sawtooth", 0.026 * power, 0, at);
  playMusicNote(148, 0.14, "triangle", 0.012 * power, 0.025, at);
}

function playMusicNoise(spec, at = null) {
  const ctx = ensureAudio();
  const start = (at ?? ctx.currentTime) + (spec.delay || 0);
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
  storyType: { gap: 42, layers: [{ f: 760, to: 620, d: 0.022, type: "square", g: 0.009 }, { f: 1180, d: 0.014, delay: 0.006, type: "triangle", g: 0.005 }] },
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
