import { input, state } from "../state.js";
import { ui } from "../ui/ui.js";
import { setMuted, isMuted, nextMusicTrack } from "../audio.js";
import { handleEasterEggKey } from "./easterEggs.js";
import { WEAPON_INFO } from "../economy/inventory.js";

export function bindInput({ start, restart, togglePause, resume, returnToMenu }) {
  const keys = new Map([
    ["KeyW", "up"], ["ArrowUp", "up"],
    ["KeyS", "down"], ["ArrowDown", "down"],
    ["KeyA", "left"], ["ArrowLeft", "left"],
    ["KeyD", "right"], ["ArrowRight", "right"],
  ]);

  function handleKeyDown(event) {
    if (event.__survivorHandled) return;
    handleEasterEggKey(event);
    const action = keys.get(event.code);
    if (action) {
      input[action] = true;
      event.preventDefault();
    }
    const key = event.key?.toLowerCase();
    if ((event.code === "KeyP" || event.code === "Escape") && !event.repeat) {
      event.__survivorHandled = true;
      event.preventDefault();
      togglePause();
      return;
    }
    if ((event.code === "KeyM" || key === "m") && !event.repeat) {
      event.__survivorHandled = true;
      nextMusicTrack();
      return;
    }
    if (event.code === "Space" && state.mode === "menu") {
      event.__survivorHandled = true;
      start();
    }
  }

  document.addEventListener("keydown", handleKeyDown, { capture: true });

  document.addEventListener("keyup", (event) => {
    const action = keys.get(event.code);
    if (action) {
      input[action] = false;
      event.preventDefault();
    }
  }, { capture: true });

  ui.canvas.addEventListener("pointerdown", (event) => {
    if (state.mode === "menu" || state.mode === "inventory") return;
    if (event.pointerType !== "touch") return;
    input.pointerId = event.pointerId;
    setStick(event);
    ui.canvas.setPointerCapture(event.pointerId);
  });
  ui.canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId === input.pointerId) setStick(event);
  });
  ui.canvas.addEventListener("pointerup", clearStick);
  ui.canvas.addEventListener("pointercancel", clearStick);
  ui.canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  // Manual mode: mouse tracking on canvas
  ui.canvas.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    if (state.mode !== "playing" || state.controlMode !== "manual") return;
    input.mouseDown = true;
    input.mouseX = event.clientX;
    input.mouseY = event.clientY;
  });
  ui.canvas.addEventListener("mouseup", (event) => {
    if (event.button !== 0) return;
    if (state.mode !== "playing" || state.controlMode !== "manual") return;
    input.mouseDown = false;
  });
  ui.canvas.addEventListener("mousemove", (event) => {
    if (state.mode !== "playing" || state.controlMode !== "manual") return;
    input.mouseX = event.clientX;
    input.mouseY = event.clientY;
  });

  // Keyboard weapon switching (1-6) for manual mode
  document.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    if (state.mode !== "playing" || state.controlMode !== "manual") return;
    const keyMap = { "Digit1": 0, "Digit2": 1, "Digit3": 2, "Digit4": 3, "Digit5": 4, "Digit6": 5 };
    const idx = keyMap[event.code];
    if (idx === undefined) return;
    const slot = state.inventory?.weaponSlots?.[idx];
    if (!slot) return;
    if (slot.id === "drone") {
      showWeaponSwitchToast("~ 星环无人机无法设为主武器");
      return;
    }
    state.manualPrimaryIndex = idx;
    const info = WEAPON_INFO[slot.id];
    showWeaponSwitchToast(idx + 1 + ". " + (info?.icon || "") + " " + (info?.name || slot.id) + " - 主武器");
  });

  ui.startButton.addEventListener("click", start);
  ui.restartButton.addEventListener("click", restart);
  ui.pauseRestartButton.addEventListener("click", restart);
  ui.resumeButton.addEventListener("click", resume);
  ui.menuButton.addEventListener("click", returnToMenu);
  ui.pauseButton.addEventListener("click", togglePause);
  ui.muteButton.addEventListener("click", () => {
    setMuted(!isMuted());
    ui.muteButton.textContent = isMuted() ? "\u00D7" : "\u266A";
  });
}

function setStick(event) {
  const max = 42;
  const baseX = 78;
  const baseY = window.innerHeight - 78;
  const dx = event.clientX - baseX;
  const dy = event.clientY - baseY;
  const len = Math.hypot(dx, dy);
  const scale = len > max ? max / len : 1;
  input.vx = Math.max(-1, Math.min(1, dx / max));
  input.vy = Math.max(-1, Math.min(1, dy / max));
  ui.touchStick.querySelector("i").style.transform = "translate(" + (dx * scale) + "px, " + (dy * scale) + "px)";
}

function clearStick(event) {
  if (event.pointerId !== input.pointerId) return;
  input.pointerId = null;
  input.vx = 0;
  input.vy = 0;
  ui.touchStick.querySelector("i").style.transform = "translate(0, 0)";
}

function showWeaponSwitchToast(msg) {
  const toast = document.getElementById("weaponSwitchToast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("active");
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(function() { toast.classList.remove("active"); }, 1200);
}