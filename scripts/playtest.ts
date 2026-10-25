// Headless playtest: the autopilot plays many games of each mode and reports
// how long it survives, how hard it has to work and whether the "always a way
// through" promise held. Run with `npm run playtest [-- games]`.
import * as C from '../src/config';
import { Sim, VARIANTS, type Variant } from '../src/sim';

const games = Number(process.argv[2] ?? 40);
const DT = 1 / 60;
const CAP = 420;

interface Result { score: number; level: number; nearMisses: number; reversals: number; travel: number; post3: number; minGap: number }

function play(variant: Variant): Result {
  const sim = new Sim();
  sim.variant = variant;
  sim.autopilot = true;
  sim.reset('play');
  let nearMisses = 0;
  let reversals = 0;
  let travel = 0;
  let lastDir = 0;
  let post3 = 0;
  while (sim.mode === 'play' && sim.score < CAP) {
    const x0 = sim.ballX;
    sim.update(DT);
    const dx = sim.ballX - x0;
    if (sim.level >= C.TWIST_START_LEVEL) {
      post3 += DT;
      travel += Math.abs(dx);
      const dir = Math.abs(dx) > 0.5 ? Math.sign(dx) : 0;
      if (dir && lastDir && dir !== lastDir) reversals++;
      if (dir) lastDir = dir;
    }
    for (const e of sim.events) if (e.type === 'nearMiss') nearMisses++;
    sim.events.length = 0;
  }
  return { score: sim.score, level: sim.level, nearMisses, reversals, travel, post3, minGap: sim.minRowGap };
}

const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * p)];
const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

console.log(`${games} autopilot games per mode (capped at ${CAP}s)\n`);
console.log('mode        median  p10   p90   lvl  post-L3 s  moves/s  reversals/min  close/min  narrowest gap');
for (const v of VARIANTS) {
  const rs = Array.from({ length: games }, () => play(v));
  const post = rs.reduce((s, r) => s + r.post3, 0) || 1;
  const row = [
    v.padEnd(10),
    pct(rs.map((r) => r.score), 0.5).toFixed(0).padStart(6),
    pct(rs.map((r) => r.score), 0.1).toFixed(0).padStart(5),
    pct(rs.map((r) => r.score), 0.9).toFixed(0).padStart(5),
    avg(rs.map((r) => r.level)).toFixed(1).padStart(5),
    avg(rs.map((r) => r.post3)).toFixed(0).padStart(9),
    (rs.reduce((s, r) => s + r.travel, 0) / post).toFixed(0).padStart(8),
    ((rs.reduce((s, r) => s + r.reversals, 0) / post) * 60).toFixed(1).padStart(13),
    ((rs.reduce((s, r) => s + r.nearMisses, 0) / post) * 60).toFixed(1).padStart(10),
    Math.min(...rs.map((r) => r.minGap)).toFixed(0).padStart(13),
  ];
  console.log(row.join('  '));
}
