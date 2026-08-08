// GitHub Pages and other static hosts need an external signaling endpoint.
// Leave empty for the local `start.cmd -Lan` fallback.
export const multiplayerConfig = {
  signalServerUrl: "",
  iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }],
};
