# Falling Bricks 3D

**Play it: https://stewalexander-com.github.io/falling-bricks-3d/**

![Falling Bricks 3D](public/og.jpg)

A 3D web remake of [Falling Bricks](https://github.com/StewAlexander-com/Falling-Bricks-Mobile-Game), the Pythonista iOS dodge game. Same rules, same difficulty curve, same *Ode to Joy* soundtrack, now running in any modern browser on desktop and mobile.

## How to play

| Device | Control |
|--------|---------|
| Phone / tablet | Drag anywhere on screen. The ball moves with your thumb but never sits under it. |
| Desktop | Move the mouse, or hold ← → / A D |
| Pause | ❚❚ button, Esc or P. The game also pauses itself when you switch tabs. |

Score is seconds survived. Every 20 seconds the level goes up: bricks fall faster, waves get denser, and from level 3 each brick gets its own speed. **Hotter, brighter bricks with longer streaks are the fast ones.**

On a phone, use *Add to Home Screen* for full-screen play. It also works offline after the first visit (without music).

## What carried over from the original

- Every gameplay constant: speeds, level-up boost, erratic-speed tiers, wave sizes, spawn timing, safe-gap width, ball and brick sizes
- Speed-encoded bricks: faster bricks are taller and shift toward red; slower outliers cool toward blue
- Top-5 local leaderboard with names and dates
- *Ode to Joy* background music

## What changed

- **3D**: rounded, lit bricks, a glowing ball that rolls as it moves, shadows on the original brick-wall texture, debris on death, sparks on near misses
- **Frame-rate independent**: the original moved bricks in pixels *per frame*, so it ran twice as fast on 120 Hz screens. Speeds are now per second, so 60, 120 and 144 Hz all play the same.
- **Solvability actually enforced**: the original README promised that random bricks never block every path, but the code never checked. Each new brick is now tested against the bricks it will share a row with when it reaches the ball, and at least two ball-sized gaps must remain.
- **Live-brick cap enforced** (`MAX_LIVE_BRICKS` was defined but unused)
- Level progress bar, level-up banners that explain new mechanics, close-call counter, best score in the HUD
- Adaptive graphics: drops resolution and shadows automatically if the frame rate falls below 45 fps

## Development

```bash
npm install
npm run dev      # http://localhost:5173/falling-bricks-3d/
npm run build    # type-check + production build into dist/
```

Pushing to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`.

| File | Purpose |
|------|---------|
| `src/config.ts` | All gameplay constants, converted from the original |
| `src/sim.ts` | Game rules and collision (no rendering), ported from `Falling-bricks.py` |
| `src/render.ts` | Three.js scene, instanced bricks, effects, camera fitting |
| `src/audio.ts` | Music through Web Audio, synthesized sound effects |
| `src/main.ts` | Game states, input, HUD and menus |

The icon and share image were modelled and rendered in Blender.

## License

GPL-3.0, same as the original.
