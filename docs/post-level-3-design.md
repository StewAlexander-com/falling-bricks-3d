# Making the game harder and more interesting after level 3

Up to level 3 the game only gets faster. After that it needed a new idea, not
just more speed. This is how the new mechanic was chosen.

## Five candidates

| # | Mechanic | What changes for the player |
|---|----------|-----------------------------|
| 1 | **Drifters** | Some bricks slide sideways and bounce off the walls. You track two axes instead of one. |
| 2 | **Splitters** | Cracked bricks flicker, then burst into two shards that fly apart. A safe spot can stop being safe. |
| 3 | **Formations** | Every few seconds, after a short lull, a named pattern of bricks drops in (Slalom, Funnel, Staircase, Zipper). Pattern reading instead of reflexes. |
| 4 | **Wind gusts** | Telegraphed gusts push the ball left or right; you steer against them. |
| 5 | **Blackout** | The lights dim for a few seconds; only the ball's glow and the bricks' own light remain. |

## Audit: UI/UX and fun

| Mechanic | UI/UX | Fun | Verdict |
|----------|-------|-----|---------|
| Drifters | Easy to show: bricks bank into the slide and their streak trails at an angle. | Adds prediction, but most drifters pass harmlessly. | Finalist |
| Splitters | Needs a clear tell (flicker that speeds up) and a burst effect and sound. | Big "oh no" moments, constant re-planning. Risk: bursts too close to the ball feel cheap. | Finalist |
| Formations | Banner names each pattern; patterns are readable by design. | Satisfying rhythm and skill expression. Risk: repetitive once learned. | Finalist |
| Wind gusts | **Cut.** On desktop the ball follows the mouse exactly, so wind would either do nothing or break the controls. On touch, fighting a push feels like lag. | Frustrating, not interesting. | Cut |
| Blackout | **Cut.** Hides the speed colours that the whole game teaches you to read, hurts low-vision players and is unreadable on phones in daylight. | Deaths feel like the game's fault. | Cut |

## Playtest

All three finalists were built behind `?mode=`. Each uses the same rule: a
brick's path is predicted (sideways drift, burst and shard bounces included)
and it is only allowed if two ball-sized corridors stay open in the ball's
row at every moment.

**Headless** (`npm run playtest -- 30`). An autopilot with ~160 ms reaction
time that misjudges speeds by up to 12% played 30 games of each mode:

| Mode | Median survival | Slowest 10% | Direction changes / min after L3 | Narrowest corridor |
|------|-----------------|-------------|----------------------------------|--------------------|
| classic | 356 s | 309 s | 3.0 | 67 |
| drift | 350 s | 294 s | 2.5 | 67 |
| split | 228 s | 162 s | 6.2 | 70 |
| formation | 213 s | 174 s | 19.2 | 70 |

The ball is 30 units wide, so no mode ever closed the path. Drift barely
changed how hard the autopilot had to work. Split and formation roughly
doubled the difficulty.

**In the browser** (Chrome, played by hand from level 3 and watched with the
autopilot from level 7):

| Mode | Readability | Fun | Fairness | Notes |
|------|-------------|-----|----------|-------|
| Split | 7 | 9 | 6 | Most exciting. Shards sometimes burst too close to react. |
| Drift | 9 | 8 | 9 | Polished but less eventful. |
| Formation | 8 | 7 | 10 | Fair and rhythmic, but predictable after a few patterns. |

## Winner: Splitters

Splitters were the most fun and force the most re-planning without the lulls
formations need. The fairness problem was fixed before shipping: a burst now
always leaves at least 1.15 s (level 4) down to 0.8 s (level 13+) before the
shards reach the ball's row. That raised the slowest-10% survival from 134 s
to 162 s with a similar median.

## Ideas to revisit

- Combine modes late in a run, for example drifters from level 10 on top of splitters.
- More formation patterns, generated procedurally, if formations come back.
- Count "shard dodges" as their own stat on the game-over screen.
