import { input, state } from "./state.js";
import { ui } from "./ui.js";
import { setMuted, isMuted } from "./audio.js";

export function bindInput({ start, restart, togglePause }) {
  const keys = new Map([["KeyW", "up"], ["ArrowUp", "up"], ["KeyS", "down"], ["ArrowDown", "down"], ["KeyA", "left"], ["ArrowLeft", "left"], ["KeyD", "right"], ["ArrowRight", "right"]]);
  window.addEventListener("keydown", (event) => {
    const action = keys.get(event.code);
    if (action) { input[action] = true; event.preventDefault(); }
    if (event.code === "KeyP" || event.code === "Escape") togglePause();
    if (event.code === "Space" && state.mode === "menu") start();
  });
  window.addEventListener("keyup", (event) => {
    const action = keys.get(event.code);
    if (action) { input[action] = false; event.preventDefault(); }
  });
  ui.canvas.addEventListener("pointerdown", (event) => {
    if (state.mode === "menu") return;
    input.pointerId = event.pointerId;
    setStick(event);
    ui.canvas.setPointerCapture(event.pointerId);
  });
  ui.canvas.addEventListener("pointermove", (event) => { if (event.pointerId === input.pointerId) setStick(event); });
  ui.canvas.addEventListener("pointerup", clearStick);
  ui.canvas.addEventListener("pointercancel", clearStick);
  ui.startButton.addEventListener("click", start);
  ui.restartButton.addEventListener("click", restart);
  ui.pauseButton.addEventListener("click", togglePause);
  ui.muteButton.addEventListener("click", () => {
    setMuted(!isMuted());
    ui.muteButton.textContent = isMuted() ? "×" : "♪";
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
  ui.touchStick.querySelector("i").style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
}

function clearStick(event) {
  if (event.pointerId !== input.pointerId) return;
  input.pointerId = null;
  input.vx = 0;
  input.vy = 0;
  ui.touchStick.querySelector("i").style.transform = "translate(0, 0)";
}
