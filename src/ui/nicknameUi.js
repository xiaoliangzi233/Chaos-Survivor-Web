const dom = {};
let initialized = false;

export function initNicknameUi() {
  if (initialized) return Boolean(dom.overlay);
  initialized = true;
  dom.overlay = document.getElementById("nicknameOverlay");
  dom.form = document.getElementById("nicknameForm");
  dom.input = document.getElementById("nicknameInput");
  dom.username = document.getElementById("nicknameUsername");
  dom.error = document.getElementById("nicknameError");
  dom.submit = document.getElementById("nicknameSubmitButton");
  if (!dom.overlay || !dom.form || !dom.input || !dom.username || !dom.error || !dom.submit) return false;
  return true;
}

export function requestPlayerNickname({ username = "", submitNickname } = {}) {
  if (!initNicknameUi() || typeof submitNickname !== "function") return Promise.resolve(null);
  dom.username.textContent = username || "SIGNED USER";
  dom.error.textContent = "";
  dom.input.value = "";
  dom.submit.disabled = false;
  dom.overlay.classList.add("active");
  dom.overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("nickname-open");
  dom.input.focus({ preventScroll: true });

  return new Promise((resolve) => {
    const cleanup = (result) => {
      dom.form.removeEventListener("submit", handleSubmit);
      dom.overlay.classList.remove("active");
      dom.overlay.setAttribute("aria-hidden", "true");
      document.body.classList.remove("nickname-open");
      resolve(result);
    };

    const handleSubmit = async (event) => {
      event.preventDefault();
      const nickname = normalizeNicknameInput(dom.input.value);
      if (!nickname) {
        dom.error.textContent = "请输入 2-16 个字符的昵称。";
        dom.input.focus({ preventScroll: true });
        return;
      }
      dom.error.textContent = "";
      dom.submit.disabled = true;
      dom.submit.textContent = "绑定中";
      try {
        const player = await submitNickname(nickname);
        cleanup(player);
      } catch (error) {
        dom.submit.disabled = false;
        dom.submit.textContent = "确认昵称";
        dom.error.textContent = error instanceof Error ? error.message : "昵称绑定失败，请重试。";
        dom.input.focus({ preventScroll: true });
      }
    };

    dom.submit.textContent = "确认昵称";
    dom.form.addEventListener("submit", handleSubmit);
  });
}

function normalizeNicknameInput(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  return text.length >= 2 && text.length <= 16 ? text : "";
}
