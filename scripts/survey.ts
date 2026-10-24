/**
 * Headless survey: run many seeds and report extinction statistics.
 *   npm run survey -- [seeds=200] [ticks=5000] ['{"carnivore":{"speed":1}}']
 */
import { DEFAULT_PARAMS, mergeParams } from '../src/core/params';
import { createWorld } from '../src/core/world';
import { stepWorld } from '../src/core/sim';
import { census } from '../src/core/agents';

const seeds = Number(process.argv[2] ?? 200);
const ticks = Number(process.argv[3] ?? 5000);
const params = mergeParams(DEFAULT_PARAMS, process.argv[4] ? JSON.parse(process.argv[4]) : {});

type Row = { seed: number; herbExt: number | null; carnExt: number | null; plantExt: number | null; peakH: number; peakC: number; endH: number; endC: number };
const rows: Row[] = [];
const t0 = performance.now();
for (let seed = 1; seed <= seeds; seed++) {
  const w = createWorld(params, seed);
  const r: Row = { seed, herbExt: null, carnExt: null, plantExt: null, peakH: 0, peakC: 0, endH: 0, endC: 0 };
  for (let t = 0; t < ticks; t++) {
    for (const e of stepWorld(w)) {
      if (e.kind !== 'extinct') continue;
      if (e.species === 'herbivore') r.herbExt ??= e.tick;
      if (e.species === 'carnivore') r.carnExt ??= e.tick;
      if (e.species === 'plant') r.plantExt ??= e.tick;
    }
    const [h, c] = census(w);
    r.peakH = Math.max(r.peakH, h);
    r.peakC = Math.max(r.peakC, c);
    if (h === 0 && c === 0) break;
  }
  [r.endH, r.endC] = census(w);
  rows.push(r);
}

const pct = (n: number) => `${((100 * n) / rows.length).toFixed(1)}%`;
const quant = (xs: number[], q: number) => (xs.length ? xs.sort((a, b) => a - b)[Math.floor(q * (xs.length - 1))] : NaN);
const carnT = rows.map((r) => r.carnExt).filter((v): v is number => v !== null);
const herbT = rows.map((r) => r.herbExt).filter((v): v is number => v !== null);
const buckets = [500, 1000, 2000, 3000, 5000, Infinity];
const hist = (ts: number[]) => buckets.map((b, i) => `${i === 0 ? 0 : buckets[i - 1]}-${b === Infinity ? '' : b}:${ts.filter((t) => t < b && (i === 0 || t >= buckets[i - 1])).length}`).join(' ');

console.log(`seeds=${seeds} ticks=${ticks} elapsed=${((performance.now() - t0) / 1000).toFixed(1)}s`);
console.log(`carnivore extinct: ${pct(carnT.length)}  median tick ${quant(carnT, 0.5)}  [${hist(carnT)}]`);
console.log(`herbivore extinct: ${pct(herbT.length)}  median tick ${quant(herbT, 0.5)}  [${hist(herbT)}]`);
console.log(`plant extinct:     ${pct(rows.filter((r) => r.plantExt !== null).length)}`);
console.log(`all coexist at end: ${pct(rows.filter((r) => r.endH > 0 && r.endC > 0).length)}`);
console.log(`peak herbivores median ${quant(rows.map((r) => r.peakH), 0.5)} max ${Math.max(...rows.map((r) => r.peakH))}`);
console.log(`peak carnivores median ${quant(rows.map((r) => r.peakC), 0.5)} max ${Math.max(...rows.map((r) => r.peakC))}`);
