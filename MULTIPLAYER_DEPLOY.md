# Multiplayer Deployment

The recommended multiplayer path is the WebSocket relay. The relay only forwards room messages, P2 input, host snapshots, ready states, and shop or lobby actions. Combat authority still stays in the P1 browser.

## Local or Radmin Play

Run this on the P1 computer:

```powershell
.\start-multiplayer.cmd
```

The script starts the no-cache frontend on port `5000`, starts the WebSocket relay on port `5001`, and opens a game URL with `?transport=relay&relay=...`.

If the Radmin address cannot be detected automatically, pass it explicitly:

```powershell
.\start-multiplayer.cmd -AdvertiseHost 26.x.x.x
```

P1 creates a room at the communication tower and sends the invite link to P2. Both ports must be allowed through the firewall on the Radmin or LAN network.

## GitHub Pages or HTTPS Hosting

GitHub Pages can host the static game, but it cannot run the Python relay. A game opened from HTTPS must connect to a `wss://` relay, not a plain `ws://` or `http://` local service.

Example URL:

```text
https://example.github.io/survivor/?transport=relay&relay=wss%3A%2F%2Frelay.example.com%2Fws
```

Put the relay behind a TLS reverse proxy or deploy an equivalent WebSocket service. Do not place private credentials in the static game files.

## WebRTC Fallback

The older WebRTC DataChannel path is still available as an advanced fallback. It can use the online signaling Worker or the local `/api/p2p/` room API to exchange offer and answer data, then send gameplay directly through WebRTC.

For that mode, configure `src/config/multiplayer-config.js` with a `signalServerUrl` and `iceServers`, or use the local LAN signaling service. Some restrictive networks still require TURN; do not embed shared TURN credentials in a public static site.
