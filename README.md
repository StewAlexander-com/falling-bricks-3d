# Falling Bricks 3D

**▶ Play now: https://stewalexander-com.github.io/falling-bricks-3d/**

![Falling Bricks 3D](public/og.jpg)

A 3D web remake of [Falling Bricks](https://github.com/StewAlexander-com/Falling-Bricks-Mobile-Game), the Pythonista iOS dodge game. Same rules, same difficulty curve, same *Ode to Joy* soundtrack, now playable in any modern browser on desktop, phone and tablet. Nothing to install.

---

## How to play

Steer the ball left and right to dodge the falling bricks. Your score is the number of seconds you survive.

| Device | Steer | Pause |
|--------|-------|-------|
| Phone / tablet | Drag anywhere on the screen. The ball follows your thumb's movement, so your thumb never covers it. | ❚❚ button |
| Desktop | Move the mouse, or hold ← → or A / D | Esc, P or the ❚❚ button |

- Press **Space** or **Enter** on the title screen to start.
- The game pauses itself if you switch tabs or apps.
- A short "drag to move" prompt appears on your first game and disappears once you move.

### Difficulty

- Every **20 seconds** the level goes up: bricks fall faster and waves get bigger. The bar under the HUD shows progress to the next level.
- From **level 3**, each brick gets its own speed, and the spread widens every 3 levels.
- **Read the bricks:** taller, hotter-coloured, brighter bricks with long streaks are the fast ones. Bluer bricks are slower than average.
- There is **always a way through**. Every new brick is checked so at least two ball-sized gaps stay open when it reaches your row.
- Brush past a brick without touching it to score a **close call**. It doesn't change your score, but it's counted on the game-over screen.

### Phone tips

- For full-screen play, use **Share → Add to Home Screen** (iOS) or **Install app** (Android/Chrome).
- After the first visit it also works **offline**, without music.
- The game is built for portrait. In landscape it still works, but you'll see a hint to rotate.

---

## Settings

| Setting | What it does |
|---------|--------------|
| Music | Turns *Ode to Joy* on or off |
| Sound effects | Turns level-up, close-call and crash sounds on or off |
| Vibration | Haptic buzz on crashes and close calls (Android only; iOS browsers don't support it, so the option is hidden there) |
| Graphics | **Auto** (recommended), **High**, **Med** or **Low**. Auto starts on High for desktop and Med for phones, and steps down if the frame rate drops below 45 fps. |

Settings, the top-5 leaderboard and your last-used name are saved in your browser (`localStorage`). They stay on the device you play on.

---

## What carried over from the original

- Every gameplay constant: brick speeds, the ×1.12 level-up boost, erratic-speed tiers, wave sizes, spawn timing, safe-gap width, and ball and brick sizes
- Speed-encoded bricks: faster bricks are taller and shift toward red; slower ones cool toward blue
- Score = seconds survived, one level every 20 points
- Top-5 leaderboard with names and dates
- *Ode to Joy* background music and the dark brick-wall background

## What's new

**3D graphics**
- Rounded, lit bricks that wobble slightly as they fall, with shadows cast on the original brick wall
- A glossy ball that rolls as it moves, with a glow, a light that follows it and a motion trail
- Debris explosion and screen shake on a crash; sparks on close calls
- A slightly tilted camera that shows the depth of the bricks while keeping the playfield fully visible on any screen shape

**Fixes to the original**
- **Same speed on every screen.** The original moved bricks a fixed number of pixels *per frame*, so it ran twice as fast on 120 Hz screens. Speeds are now per second, so 60, 90, 120 and 144 Hz all play identically.
- **"Always a way through" is now real.** The original README promised random bricks were checked for a clear path, but the code never did it. It's enforced now. A simulation of 40 games up to level 21 found no moment where the ball's row was blocked; the narrowest gap was 65 units for a 30-unit ball.
- **On-screen brick limit enforced.** `MAX_LIVE_BRICKS` was defined in the original but never used.

**Interface**
- Title screen with the game running in the background, plus pause, settings, top scores and game-over screens
- HUD with score, level, best score and a level-progress bar
- Level-up banners that explain new mechanics when they kick in
- Your score is saved the moment you die, and you can edit your name afterwards
- A short delay before **Play again** works, so a panicked tap doesn't restart instantly
- Large touch targets, keyboard focus outlines, iPhone notch and home-bar spacing, and support for the system "reduce motion" setting

---

## Performance

Measured in Comet (Chromium) on a Mac with a 120 Hz display:

| Scenario | Frame rate | Draw calls |
|----------|-----------|------------|
| Desktop, High graphics | 120 fps (95th-percentile frame 10 ms) | ~17 per frame |
| Phone-size touch emulation, Med graphics | 120 fps | ~17 per frame |

The full download is about **150 KB of compressed JavaScript** plus a 48 KB wall texture. The 2.1 MB music file streams separately after you press Play, so it never delays the start.

## Browser support

Recent Chrome, Edge, Safari (macOS and iOS), Firefox and Samsung Internet. WebGL is required. The music is AAC (`.m4a`), with an Opus (`.webm`) fallback for browsers without AAC.

---

## Development

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev        # http://localhost:5173/falling-bricks-3d/
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build locally
```

Add `?debug` to the URL to expose `sim`, `renderer`, `sound`, `store` and `game` on `window` for inspection in the browser console.

### Deployment

Every push to `main` builds and deploys to GitHub Pages through [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). The site's base path (`/falling-bricks-3d/`) is set in `vite.config.ts`.

### Project structure

| Path | Purpose |
|------|---------|
| `src/config.ts` | Every gameplay constant, converted from the original's per-frame values to per-second |
| `src/sim.ts` | Game rules, brick generation, the clear-path check and collision. No rendering; a direct port of `Falling-bricks.py` |
| `src/render.ts` | Three.js scene: bricks drawn in a single GPU call, ball, lighting, effects, camera fitting, graphics quality levels |
| `src/audio.ts` | Music through Web Audio (so volume works on iOS) and sound effects generated in code |
| `src/main.ts` | Game states, input, HUD, menus and the main loop |
| `src/storage.ts` | Leaderboard and settings saved in `localStorage` |
| `src/style.css` | Menus and HUD styling |
| `public/audio/` | *Ode to Joy*, re-encoded for the web from the original |
| `public/img/wall.webp` | The original brick-wall background, compressed |
| `public/icons/`, `public/og.jpg` | App icons and link-preview image, modelled and rendered in Blender |

The PWA build (via `vite-plugin-pwa`) generates the web app manifest and service worker. The music is left out of the offline cache because Safari streams audio in chunks, which breaks precaching.

---

## Credits

- Original game: [Falling Bricks](https://github.com/StewAlexander-com/Falling-Bricks-Mobile-Game) by StewAlexander-com, built with Pythonista's `scene` module
- 3D engine: [Three.js](https://threejs.org/)
- Build tooling: [Vite](https://vite.dev/) and [vite-plugin-pwa](https://vite-pwa-org.netlify.app/)
- Music: public-domain arrangement of Beethoven's *Ode to Joy*, carried over from the original
- Icon and share image: modelled and rendered in [Blender](https://www.blender.org/)

## License

[GPL-3.0](LICENSE), same as the original.
