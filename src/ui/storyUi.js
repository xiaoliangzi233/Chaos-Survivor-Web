import { getStoryChapter } from "../config/story-config.js";

const STORY_PROGRESS_PREFIX = "pixel-survivor-story-progress-v1";
const TYPEWRITER_INTERVAL_MS = 28;
const SCENE_DURATION_MS = 6000;
const CLOSE_TRANSITION_MS = 180;

let initialized = false;
let activePlayback = null;
let animationFrame = 0;
let elements = null;

export function initStoryUi() {
  if (initialized) return Boolean(elements);
  initialized = true;
  elements = collectElements();
  if (!elements) return false;

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

export function playDifficultyStoryIfNeeded({ difficultyId, playerId = "local-dev" } = {}) {
  const chapter = getStoryChapter(difficultyId);
  if (!chapter) return Promise.resolve("already-seen");
  if (hasSeenDifficultyStory({ difficultyId, playerId })) return Promise.resolve("already-seen");
  if (!initStoryUi()) return Promise.resolve("completed");
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
    sceneStartedAt: 0,
    typingStartedAt: 0,
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

export function hasSeenDifficultyStory({ difficultyId, playerId, storage = globalThis.localStorage } = {}) {
  const progress = readProgress(playerId, storage);
  return Boolean(progress[String(difficultyId || "")]?.seenAt);
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
  const skipButton = document.getElementById("storySkipButton");
  const archive = document.getElementById("storyArchive");
  const title = document.getElementById("storyTitle");
  const speaker = document.getElementById("storySpeaker");
  const text = document.getElementById("storyText");
  const announcement = document.getElementById("storyAnnouncement");
  const progress = document.getElementById("storyProgress");
  const progressTrack = document.getElementById("storyProgressTrack");
  if (!overlay || !skipButton || !archive || !title || !speaker || !text || !announcement || !progress || !progressTrack) {
    return null;
  }
  return { overlay, skipButton, archive, title, speaker, text, announcement, progress, progressTrack };
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
  activePlayback.sceneStartedAt = performance.now();
  activePlayback.typingStartedAt = activePlayback.sceneStartedAt;
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
    elements.text.textContent = activePlayback.fullText.slice(0, visibleCharacters);
    if (visibleCharacters >= activePlayback.fullText.length) {
      activePlayback.textComplete = true;
      elements.text.textContent = activePlayback.fullText;
    }
  }
  if (now - activePlayback.sceneStartedAt >= SCENE_DURATION_MS) {
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
    activePlayback.sceneStartedAt = performance.now();
    return;
  }
  advanceScene();
}

function advanceScene() {
  if (!activePlayback || activePlayback.closing) return;
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
    return;
  }
  if (activePlayback.pausedAt) {
    const hiddenDuration = performance.now() - activePlayback.pausedAt;
    activePlayback.sceneStartedAt += hiddenDuration;
    activePlayback.typingStartedAt += hiddenDuration;
    activePlayback.pausedAt = 0;
  }
  animationFrame = requestAnimationFrame(updatePlaybackFrame);
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
