# Survivor P2P Signal Worker

This Worker is only used to exchange short-lived WebRTC offers and answers. It never receives game inputs, snapshots, or combat data.

## Deploy

1. Install Wrangler and log in to Cloudflare.
2. From this directory, run `npx wrangler deploy`.
3. Set `ALLOWED_ORIGINS` to the comma-separated origins that host the game, for example `https://example.github.io,https://game.example.com`.
4. Copy the deployed Worker URL into `src/config/multiplayer-config.js` as `signalServerUrl`, then publish the static game.

Rooms contain a single offer and answer. They expire after 15 minutes; after an answer arrives, they are removed within 90 seconds.
