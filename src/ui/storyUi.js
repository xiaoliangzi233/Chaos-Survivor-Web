import { getStoryChapter } from "../config/story-config.js";
import { isMuted, playSfx } from "../audio.js";

const STORY_PROGRESS_PREFIX = "pixel-survivor-story-progress-v1";
const STORY_VOICE_STORAGE_KEY = "pixel-survivor-story-voice-v1";
const TYPEWRITER_INTERVAL_MS = 28;
const SCENE_DURATION_MS = 6000;
const CLOSE_TRANSITION_MS = 180;
const SILENT_TYPE_CHARACTERS = /[\s，。！？、：；…,.!?—“”‘’]/;

let initialized = false;
let activePlayback = null;
let animationFrame = 0;
let elements = null;
let storyVoiceEnabled = true;
let storySpeechSupported = false;
let speechSerial = 0;
let currentUtterance = null;

export function initStoryUi() {
  if (initialized) return Boolean(elements);
  initialized = true;
  elements = collectElements();
  if (!elements) return false;

  storySpeechSupported = supportsStorySpeech();
  storyVoiceEnabled = readStoryVoicePreference();
  updateStoryVoiceControl();
  elements.voiceButton.addEventListener("pointerdown", (event) => event.stopPropagation());
  elements.voiceButton.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!storySpeechSupported) return;
    storyVoiceEnabled = !storyVoiceEnabled;
    writeStoryVoicePreference(storyVoiceEnabled);
    updateStoryVoiceControl();
    if (!storyVoiceEnabled) stopStorySpeech();
    else if (activePlayback && !activePlayback.closing) speakCurrentScene();
  });
  elements.skipButton.addEventListener("pointerdown", (event) => event.stopPropagation());
  elements.skipButton.addEventListener("click", (event) => {
    event.stopPropagation();
    if (activePlayback && !activePlayback.closing) finishPlayback("skipped");
  });
  elements.overlay.addEventListener("pointerdown", (event) => {
    if (!activePlayback || activePlayback.closing || event.target.closest("button")) return;
    event.preventDefault();
    accelerateStory();
  });
  document.addEventListener("keydown", handleStoryKeydown, { capture: true });
  document.addEventListener("visibilitychange", handleVisibilityChange);
  return true;
}

export function playDifficultyStoryIfNeeded({ difficultyId, playerId = "local-dev", alwaysPlay = false } = {}) {
  const chapter = getStoryChapter(difficultyId);
  if (!chapter) return Promise.resolve("already-seen");
  if (!shouldPlayDifficultyStory({ difficultyId, playerId, alwaysPlay })) return Promise.resolve("already-seen");
  if (!initStoryUi()) return Promise.resolve("completed");
  storySpeechSupported = supportsStorySpeech();
  updateStoryVoiceControl();
  if (activePlayback) return activePlayback.promise;

  let resolvePlayback;
  const promise = new Promise((resolve) => {
    resolvePlayback = resolve;
  });
  activePlayback = {
    chapter,
    difficultyId: String(difficultyId),
    playerId: normalizePlayerId(playerId),
    sceneIndex: 0,
    fullText: "",
    textComplete: false,
    renderedCharacters: 0,
    sceneStartedAt: 0,
    typingStartedAt: 0,
    sceneDurationMs: SCENE_DURATION_MS,
    pausedAt: 0,
    closing: false,
    resolve: resolvePlayback,
    promise,
  };

  document.body.classList.add("story-open");
  elements.overlay.style.setProperty("--story-accent", chapter.accent || "#7ddff2");
  elements.overlay.classList.remove("is-closing");
  elements.overlay.classList.add("active");
  elements.overlay.setAttribute("aria-hidden", "false");
  elements.archive.textContent = chapter.archive;
  elements.title.textContent = chapter.title;
  renderScene(0);
  elements.overlay.focus({ preventScroll: true });
  return promise;
}

export function cancelStoryPlayback() {
  if (!activePlayback) return false;
  cancelAnimationFrame(animationFrame);
  stopStorySpeech();
  const playback = activePlayback;
  activePlayback = null;
  elements.overlay.classList.remove("active", "is-closing");
  elements.overlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("story-open");
  playback.resolve("cancelled");
  return true;
}

export function storyProgressStorageKey(playerId) {
  return `${STORY_PROGRESS_PREFIX}:${normalizePlayerId(playerId)}`;
}

export function readStoryVoicePreference(storage = globalThis.localStorage) {
  if (!storage) return true;
  try {
    return storage.getItem(STORY_VOICE_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeStoryVoicePreference(enabled, storage = globalThis.localStorage) {
  if (!storage) return false;
  try {
    storage.setItem(STORY_VOICE_STORAGE_KEY, enabled ? "on" : "off");
    return true;
  } catch {
    return false;
  }
}

export function storySceneDurationMs(text) {
  return Math.min(10000, Math.max(SCENE_DURATION_MS, 1600 + String(text || "").length * 155));
}

export function selectChineseStoryVoice(voices = []) {
  const ranked = [...voices]
    .map((voice, index) => ({ voice, index, score: storyVoiceScore(voice) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked[0]?.score >= 60 ? ranked[0].voice : null;
}

export function hasSeenDifficultyStory({ difficultyId, playerId, storage = globalThis.localStorage } = {}) {
  const progress = readProgress(playerId, storage);
  return Boolean(progress[String(difficultyId || "")]?.seenAt);
}

export function shouldPlayDifficultyStory({
  difficultyId,
  playerId,
  alwaysPlay = false,
  storage = globalThis.localStorage,
} = {}) {
  if (!getStoryChapter(difficultyId)) return false;
  return Boolean(alwaysPlay) || !hasSeenDifficultyStory({ difficultyId, playerId, storage });
}

export function recordDifficultyStorySeen({
  difficultyId,
  playerId,
  outcome = "completed",
  storage = globalThis.localStorage,
  seenAt = new Date().toISOString(),
} = {}) {
  if (!difficultyId || !storage) return false;
  const progress = readProgress(playerId, storage);
  progress[String(difficultyId)] = {
    seenAt: String(seenAt),
    outcome: outcome === "skipped" ? "skipped" : "completed",
  };
  try {
    storage.setItem(storyProgressStorageKey(playerId), JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

function collectElements() {
  const overlay = document.getElementById("storyOverlay");
  const voiceButton = document.getElementById("storyVoiceButton");
  const voiceStatus = document.getElementById("storyVoiceStatus");
  const skipButton = document.getElementById("storySkipButton");
  const archive = document.getElementById("storyArchive");
  const title = document.getElementById("storyTitle");
  const speaker = document.getElementById("storySpeaker");
  const text = document.getElementById("storyText");
  const announcement = document.getElementById("storyAnnouncement");
  const progress = document.getElementById("storyProgress");
  const progressTrack = document.getElementById("storyProgressTrack");
  if (!overlay || !voiceButton || !voiceStatus || !skipButton || !archive || !title || !speaker || !text || !announcement || !progress || !progressTrack) {
    return null;
  }
  return { overlay, voiceButton, voiceStatus, skipButton, archive, title, speaker, text, announcement, progress, progressTrack };
}

function renderScene(sceneIndex) {
  if (!activePlayback) return;
  const scene = activePlayback.chapter.scenes[sceneIndex];
  if (!scene) return finishPlayback("completed");
  cancelAnimationFrame(animationFrame);

  activePlayback.sceneIndex = sceneIndex;
  activePlayback.fullText = scene.text;
  activePlayback.textComplete = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  activePlayback.renderedCharacters = activePlayback.textComplete ? scene.text.length : 0;
  activePlayback.sceneStartedAt = performance.now();
  activePlayback.typingStartedAt = activePlayback.sceneStartedAt;
  activePlayback.sceneDurationMs = storySceneDurationMs(scene.text);
  activePlayback.pausedAt = 0;

  elements.speaker.textContent = scene.speaker;
  elements.text.textContent = activePlayback.textComplete ? scene.text : "";
  elements.announcement.textContent = `${scene.speaker}：${scene.text}`;
  elements.progress.textContent = `${String(sceneIndex + 1).padStart(2, "0")} / ${String(activePlayback.chapter.scenes.length).padStart(2, "0")}`;
  renderProgressTrack();

  const panel = elements.overlay.querySelector(".story-panel");
  panel?.classList.remove("scene-enter");
  void panel?.offsetWidth;
  panel?.classList.add("scene-enter");
  elements.overlay.dataset.scene = String(sceneIndex + 1);
  speakCurrentScene();
  if (document.visibilityState === "hidden") {
    activePlayback.pausedAt = performance.now();
  } else {
    animationFrame = requestAnimationFrame(updatePlaybackFrame);
  }
}

function renderProgressTrack() {
  if (!activePlayback) return;
  elements.progressTrack.innerHTML = "";
  activePlayback.chapter.scenes.forEach((_, index) => {
    const segment = document.createElement("i");
    if (index < activePlayback.sceneIndex) segment.className = "complete";
    else if (index === activePlayback.sceneIndex) segment.className = "active";
    elements.progressTrack.appendChild(segment);
  });
}

function updatePlaybackFrame(now) {
  if (!activePlayback || activePlayback.closing) return;
  if (!activePlayback.textComplete) {
    const visibleCharacters = Math.floor((now - activePlayback.typingStartedAt) / TYPEWRITER_INTERVAL_MS);
    const nextCharacterCount = Math.min(activePlayback.fullText.length, visibleCharacters);
    if (nextCharacterCount > activePlayback.renderedCharacters) {
      playStoryTypingTick(activePlayback.fullText, activePlayback.renderedCharacters, nextCharacterCount);
      activePlayback.renderedCharacters = nextCharacterCount;
      elements.text.textContent = activePlayback.fullText.slice(0, nextCharacterCount);
    }
    if (visibleCharacters >= activePlayback.fullText.length) {
      activePlayback.textComplete = true;
      elements.text.textContent = activePlayback.fullText;
      activePlayback.renderedCharacters = activePlayback.fullText.length;
    }
  }
  if (now - activePlayback.sceneStartedAt >= activePlayback.sceneDurationMs) {
    advanceScene();
    return;
  }
  animationFrame = requestAnimationFrame(updatePlaybackFrame);
}

function accelerateStory() {
  if (!activePlayback || activePlayback.closing) return;
  if (!activePlayback.textComplete) {
    activePlayback.textComplete = true;
    elements.text.textContent = activePlayback.fullText;
    activePlayback.renderedCharacters = activePlayback.fullText.length;
    activePlayback.sceneStartedAt = performance.now();
    return;
  }
  advanceScene();
}

function advanceScene() {
  if (!activePlayback || activePlayback.closing) return;
  stopStorySpeech();
  const nextScene = activePlayback.sceneIndex + 1;
  if (nextScene >= activePlayback.chapter.scenes.length) {
    finishPlayback("completed");
    return;
  }
  renderScene(nextScene);
}

function finishPlayback(outcome) {
  if (!activePlayback || activePlayback.closing) return;
  activePlayback.closing = true;
  cancelAnimationFrame(animationFrame);
  stopStorySpeech();
  recordDifficultyStorySeen({
    difficultyId: activePlayback.difficultyId,
    playerId: activePlayback.playerId,
    outcome,
  });
  elements.overlay.classList.add("is-closing");

  const playback = activePlayback;
  window.setTimeout(() => {
    elements.overlay.classList.remove("active", "is-closing");
    elements.overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("story-open");
    activePlayback = null;
    playback.resolve(outcome);
  }, CLOSE_TRANSITION_MS);
}

function handleStoryKeydown(event) {
  if (!activePlayback || activePlayback.closing) return;
  if (event.code !== "Space" && event.code !== "Enter" && event.code !== "NumpadEnter") return;
  if (event.target === elements.skipButton) return;
  event.__survivorHandled = true;
  event.preventDefault();
  event.stopPropagation();
  if (!event.repeat) accelerateStory();
}

function handleVisibilityChange() {
  if (!activePlayback || activePlayback.closing) return;
  if (document.visibilityState === "hidden") {
    activePlayback.pausedAt = performance.now();
    cancelAnimationFrame(animationFrame);
    pauseStorySpeech();
    return;
  }
  if (activePlayback.pausedAt) {
    const hiddenDuration = performance.now() - activePlayback.pausedAt;
    activePlayback.sceneStartedAt += hiddenDuration;
    activePlayback.typingStartedAt += hiddenDuration;
    activePlayback.pausedAt = 0;
  }
  resumeStorySpeech();
  animationFrame = requestAnimationFrame(updatePlaybackFrame);
}

function supportsStorySpeech() {
  return typeof window !== "undefined"
    && "speechSynthesis" in window
    && typeof window.SpeechSynthesisUtterance === "function";
}

function updateStoryVoiceControl() {
  if (!elements) return;
  elements.voiceButton.disabled = !storySpeechSupported;
  elements.voiceButton.setAttribute("aria-pressed", String(storySpeechSupported && storyVoiceEnabled));
  if (!storySpeechSupported) {
    elements.voiceButton.setAttribute("aria-label", "当前浏览器不支持剧情语音");
    elements.voiceStatus.textContent = "语音不可用";
    return;
  }
  elements.voiceButton.setAttribute("aria-label", storyVoiceEnabled ? "关闭剧情语音" : "开启剧情语音");
  elements.voiceStatus.textContent = storyVoiceEnabled ? "语音 开" : "语音 关";
}

function speakCurrentScene() {
  stopStorySpeech();
  if (!activePlayback || !storyVoiceEnabled || !storySpeechSupported || isMuted()) return false;
  const scene = activePlayback.chapter.scenes[activePlayback.sceneIndex];
  if (!scene?.text) return false;
  try {
    const synth = window.speechSynthesis;
    const utterance = new window.SpeechSynthesisUtterance(scene.text);
    const voice = selectChineseStoryVoice(synth.getVoices());
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || "zh-CN";
    utterance.rate = 1.04;
    utterance.pitch = storyVoicePitch(scene.speaker);
    utterance.volume = 0.88;
    const serial = speechSerial;
    utterance.onend = () => {
      if (serial === speechSerial) currentUtterance = null;
    };
    utterance.onerror = () => {
      if (serial === speechSerial) currentUtterance = null;
    };
    currentUtterance = utterance;
    synth.speak(utterance);
    return true;
  } catch {
    currentUtterance = null;
    return false;
  }
}

function stopStorySpeech() {
  speechSerial++;
  currentUtterance = null;
  if (!storySpeechSupported) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Speech synthesis may disappear when the page is being unloaded.
  }
}

function pauseStorySpeech() {
  if (!storySpeechSupported || !currentUtterance) return;
  try {
    window.speechSynthesis.pause();
  } catch {}
}

function resumeStorySpeech() {
  if (!storySpeechSupported || !currentUtterance || !storyVoiceEnabled || isMuted()) return;
  try {
    window.speechSynthesis.resume();
  } catch {}
}

function playStoryTypingTick(text, fromIndex, toIndex) {
  for (let index = toIndex - 1; index >= fromIndex; index--) {
    if (SILENT_TYPE_CHARACTERS.test(text[index])) continue;
    playSfx("storyType");
    return;
  }
}

function storyVoiceScore(voice) {
  const lang = String(voice?.lang || "").toLowerCase();
  const name = String(voice?.name || "").toLowerCase();
  let score = 0;
  if (lang === "zh-cn" || lang === "zh-hans-cn") score += 100;
  else if (lang.startsWith("zh-hans")) score += 80;
  else if (lang.startsWith("zh")) score += 60;
  if (/xiaoxiao|xiaoyi|yunxi|huihui|mandarin|chinese|普通话|中文/.test(name)) score += 16;
  if (voice?.default) score += 4;
  return score;
}

function storyVoicePitch(speaker) {
  const name = String(speaker || "");
  if (/中央 AI|中央系统/.test(name)) return 0.78;
  if (/广播|警告|网络/.test(name)) return 0.88;
  if (/录音|日志/.test(name)) return 0.94;
  return 1;
}

function readProgress(playerId, storage) {
  if (!storage) return {};
  try {
    const value = JSON.parse(storage.getItem(storyProgressStorageKey(playerId)) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    try {
      storage.removeItem(storyProgressStorageKey(playerId));
    } catch {
      // Storage may be disabled; replaying the story is safer than blocking a run.
    }
    return {};
  }
}

function normalizePlayerId(playerId) {
  return String(playerId || "local-dev").trim() || "local-dev";
}
