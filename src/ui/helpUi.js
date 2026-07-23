const TAB_IDS = ["controls", "combat", "growth"];
const dom = {};
let activeTab = "controls";
let onBeforeOpen = null;
let onOpen = null;
let onClose = null;

export function initHelpUi(options = {}) {
  dom.overlay = document.getElementById("helpOverlay");
  dom.panel = dom.overlay?.querySelector(".help-panel");
  dom.openButton = document.getElementById("helpButton");
  dom.closeButton = document.getElementById("helpCloseButton");
  dom.tabs = document.getElementById("helpTabs");
  dom.tabButtons = [...(dom.tabs?.querySelectorAll("[data-help-tab]") || [])];
  dom.panels = [...(dom.overlay?.querySelectorAll("[data-help-panel]") || [])];
  if (!dom.overlay || !dom.panel || !dom.openButton || !dom.closeButton || !dom.tabs) return;

  onBeforeOpen = options.onBeforeOpen || null;
  onOpen = options.onOpen || null;
  onClose = options.onClose || null;
  dom.openButton.addEventListener("click", toggleHelp);
  dom.closeButton.addEventListener("click", closeHelp);
  dom.overlay.addEventListener("click", (event) => {
    if (event.target === dom.overlay) closeHelp();
  });
  dom.tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-help-tab]");
    if (button) selectHelpTab(button.dataset.helpTab);
  });
  document.addEventListener("keydown", handleKeydown);
  window.matchMedia("(max-width: 899px)").addEventListener("change", (event) => {
    if (event.matches) closeHelp();
  });
  selectHelpTab(activeTab);
}

export function isHelpOpen() {
  return Boolean(dom.overlay?.classList.contains("active"));
}

export function toggleHelp() {
  if (isHelpOpen()) closeHelp();
  else openHelp();
}

export function openHelp() {
  if (!dom.overlay || window.matchMedia("(max-width: 899px)").matches) return false;
  onBeforeOpen?.();
  dom.overlay.classList.add("active");
  document.body.classList.add("help-open");
  dom.overlay.setAttribute("aria-hidden", "false");
  dom.openButton.setAttribute("aria-expanded", "true");
  dom.openButton.classList.add("active");
  selectHelpTab(activeTab);
  dom.closeButton.focus({ preventScroll: true });
  onOpen?.();
  return true;
}

export function closeHelp() {
  if (!dom.overlay) return false;
  const wasOpen = isHelpOpen();
  dom.overlay.classList.remove("active");
  document.body.classList.remove("help-open");
  dom.overlay.setAttribute("aria-hidden", "true");
  dom.openButton?.setAttribute("aria-expanded", "false");
  dom.openButton?.classList.remove("active");
  if (wasOpen) dom.openButton?.focus({ preventScroll: true });
  if (wasOpen) onClose?.();
  return wasOpen;
}

export function selectHelpTab(tabId) {
  if (!TAB_IDS.includes(tabId)) return false;
  activeTab = tabId;
  for (const button of dom.tabButtons || []) {
    const selected = button.dataset.helpTab === activeTab;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
  for (const panel of dom.panels || []) {
    const selected = panel.dataset.helpPanel === activeTab;
    panel.hidden = !selected;
    panel.classList.toggle("active", selected);
  }
  return true;
}

function handleKeydown(event) {
  if (!isHelpOpen()) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeHelp();
    return;
  }
  if (["ArrowLeft", "ArrowRight"].includes(event.key) && event.target.closest("#helpTabs")) {
    event.preventDefault();
    const currentIndex = TAB_IDS.indexOf(activeTab);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextId = TAB_IDS[(currentIndex + direction + TAB_IDS.length) % TAB_IDS.length];
    selectHelpTab(nextId);
    dom.tabButtons.find((button) => button.dataset.helpTab === nextId)?.focus();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [...dom.panel.querySelectorAll("button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])")]
    .filter((element) => !element.hidden && element.getClientRects().length);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
