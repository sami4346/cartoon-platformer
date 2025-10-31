# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Quick commands

- Serve locally (recommended for correct canvas sizing and future assets):
  - Python 3
    ```bash path=null start=null
    python -m http.server 5173
    ```
  - Node (if available)
    ```bash path=null start=null
    npx http-server -p 5173
    ```
  Then open http://localhost:5173 in a browser.

- Open without a server (fallback on Windows/macOS/Linux):
  ```powershell path=null start=null
  start index.html
  ```

- Lint/format/tests: not configured in this repo (no package.json, test runner, or linter configs present).

## High-level architecture

- App type: single-page, no-build vanilla HTML/CSS/JS canvas game. Entrypoint is `index.html` which loads `style.css` and `script.js`.

- UI structure (`index.html`):
  - HUD (`#hud`) with score/level labels.
  - Game canvas (`#game`, 16:9) where everything is rendered.
  - Overlays for start, game-over, and win screens; buttons control game state.
  - Mobile on-screen controls (`#controls`) for left/right/jump.

- Game runtime (`script.js`):
  - Encapsulated IIFE sets up the game and registers event listeners.
  - Audio module (Web Audio API) with simple synthesized SFX for jump/coin/win; unlocked on first user interaction.
  - Input: keyboard mapping (Arrow/A/D/W/Space) plus touch/pointer for mobile buttons; tracks held and edge-triggered jump.
  - World and entities: constants (gravity, speeds), `player`, `platforms` via `makePlatforms()`, `coins` array, and `goal`.
  - Physics: AABB collisions against axis-aligned platforms; horizontal then vertical resolution; gravity and simple air drag.
  - Camera: smooth follow along X within world bounds; Y kept fixed for simplicity.
  - Game state: `start | playing | gameover | win`; reset/start handlers wire buttons to state changes; HUD updates via DOM.
  - Rendering: layered draw calls each frame (background parallax hills/clouds, platforms with grass, coins with spin, goal star, player with squash/stretch). DPR-aware canvas sizing via `fitCanvas()`.
  - Main loop: `requestAnimationFrame` computes `dt` clamped to 1/30s, steps simulation when playing, then renders every frame.

- Styling (`style.css`):
  - CSS variables define palette; playful outlines and shadows.
  - Responsive canvas with fixed aspect ratio; HUD and overlays styled panels.
  - Mobile control grid shown only under 900px; reduced-motion media query supported.

## Notes for extending

- Level content is data-driven in `script.js`:
  - Platforms: edit `makePlatforms()`.
  - Coins: edit the `coins` array.
  - Goal: `goal` object near coins.
- Player tuning: adjust `GRAVITY`, `MOVE_SPEED`, `JUMP_VELOCITY`, `AIR_DRAG` constants.
- If you add assets (images/audio), prefer serving via a local server (see commands above) and reference them relative to project root.
