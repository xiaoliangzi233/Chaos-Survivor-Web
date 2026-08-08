# Online P2P Deployment

GitHub Pages can host the game files, but it cannot execute the local Python room API. The included `worker/` directory supplies the missing signaling API; it stores only a WebRTC offer and answer long enough to establish a connection.

## Architecture

```text
Game page (GitHub Pages / any HTTPS host)
  -> Cloudflare Worker + Durable Object (short-lived signaling only)
  -> WebRTC DataChannel (host-authoritative battle data, browser to browser)
```

The Worker never relays player input, snapshots, or combat state. `stun:stun.cloudflare.com:3478` helps browsers discover direct paths through NAT. Some restrictive networks still require a TURN relay; do not add a TURN credential directly to the static game because it would be public.

## Publish the signaling service

1. Run `npx wrangler deploy` in `worker/` after logging in to Cloudflare.
2. Set the Worker variable `ALLOWED_ORIGINS` to the game origins, for example `https://owner.github.io,https://game.example.com`.
3. Put the deployed Worker HTTPS address in `src/config/multiplayer-config.js`:

```js
export const multiplayerConfig = {
  signalServerUrl: "https://survivor-p2p-signal.<account>.workers.dev",
  iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }],
};
```

4. Publish the game files to GitHub Pages or another HTTPS static host.

With this configuration, the host creates a six-digit room and shares the game-page invitation link. The guest opens that link from any network, joins the room, then plays over a direct WebRTC DataChannel whenever the two networks allow it.

## Local Radmin fallback

Leave `signalServerUrl` empty and start the game with `start.cmd -Lan` to use the existing host-local room API over Radmin VPN. This is useful for development or private LAN sessions, but it is not available from GitHub Pages.

## Standalone local signaling backend

For a separately started local backend, run:

```powershell
.\start-p2p-backend.cmd -AdvertiseHost 26.x.x.x -AllowedOrigin http://26.x.x.x:5000
```

It exposes only `http://26.x.x.x:5001/api/p2p/`. A locally served game can select it with `?signal=http://26.x.x.x:5001`; the backend is also useful when the local front-end is served by another development server.

Do not point an HTTPS GitHub Pages game at this HTTP address: browsers block that mixed-content request. In that case, use the deployed HTTPS Worker, or put the local backend behind an HTTPS reverse proxy/tunnel and use its HTTPS URL in `?signal=`.
