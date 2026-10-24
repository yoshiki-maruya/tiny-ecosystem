import type { AnimalParams } from './params';
import type { World } from './world';

export const HERBIVORE = 0;
export const CARNIVORE = 1;
export type Species = typeof HERBIVORE | typeof CARNIVORE;
export const SPECIES_KEYS = ['herbivore', 'carnivore'] as const;

/** Biomass that grazing never removes. */
const GRAZE_RESIDUAL = 0.03;

/** What an animal did this tick. Observation only: never feeds back into the rules. */
export type Action = 'eat' | 'seek' | 'flee' | 'hunt' | 'catch' | 'wander' | 'rest';
export type DeathCause = 'eaten' | 'starved' | 'old';

export interface DeathRecord {
  id: number;
  species: Species;
  x: number;
  y: number;
  cause: DeathCause;
}

export interface Agent {
  id: number;
  species: Species;
  x: number;
  y: number;
  energy: number;
  age: number;
  alive: boolean;
  /** Position at the start of the current tick (for smooth rendering). */
  px: number;
  py: number;
  /** Tick of birth (0 for the initial population). */
  born: number;
  /** Horizontal facing, -1 or 1 (for rendering). */
  facing: number;
  action: Action;
  /** Set when the agent dies. */
  cause: DeathCause | null;
  /** Intrusive per-cell list links (same species only). */
  prev: Agent | null;
  next: Agent | null;
}

/** 8 neighbour directions, in a fixed order so RNG indices map deterministically. */
const DIRS: readonly (readonly [number, number])[] = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];

export function speciesParams(world: World, s: Species): AnimalParams {
  return s === HERBIVORE ? world.params.herbivore : world.params.carnivore;
}

function link(world: World, a: Agent): void {
  const heads = world.cellHead[a.species];
  const i = a.y * world.width + a.x;
  const head = heads[i];
  a.prev = null;
  a.next = head;
  if (head) head.prev = a;
  heads[i] = a;
}

function unlink(world: World, a: Agent): void {
  const heads = world.cellHead[a.species];
  if (a.prev) a.prev.next = a.next;
  else heads[a.y * world.width + a.x] = a.next;
  if (a.next) a.next.prev = a.prev;
  a.prev = a.next = null;
}

function moveTo(world: World, a: Agent, x: number, y: number): void {
  if (x === a.x && y === a.y) return;
  if (x !== a.x) a.facing = x > a.x ? 1 : -1;
  unlink(world, a);
  a.x = x;
  a.y = y;
  link(world, a);
}

function kill(world: World, a: Agent, cause: DeathCause): void {
  if (!a.alive) return;
  a.alive = false;
  a.cause = cause;
  world.deaths.push({ id: a.id, species: a.species, x: a.x, y: a.y, cause });
  unlink(world, a);
}

/** Create an agent and add it to the world. Position is clamped onto the board. */
export function spawnAgent(world: World, species: Species, x: number, y: number, energy: number, age = 0): Agent {
  const p = speciesParams(world, species);
  const a: Agent = {
    id: world.nextId++,
    species,
    x: clampInt(x, 0, world.width - 1),
    y: clampInt(y, 0, world.height - 1),
    energy: Math.min(Math.max(energy, 0), p.maxEnergy),
    age,
    alive: true,
    px: clampInt(x, 0, world.width - 1),
    py: clampInt(y, 0, world.height - 1),
    born: world.tick,
    facing: 1,
    action: 'rest',
    cause: null,
    prev: null,
    next: null,
  };
  link(world, a);
  world.agents.push(a);
  return a;
}

export function spawnInitialAgents(world: World): void {
  for (const s of [HERBIVORE, CARNIVORE] as const) {
    const p = speciesParams(world, s);
    for (let k = 0; k < p.initialCount; k++) {
      const x = world.rng.int(world.width);
      const y = world.rng.int(world.height);
      const e = p.initialEnergy * (0.5 + 0.5 * world.rng.next());
      const age = world.rng.int(Math.max(1, Math.floor(p.lifespan / 2)));
      spawnAgent(world, s, x, y, e, age);
    }
  }
}

/** Whole steps this tick: floor(speed) plus a chance of one more for the fractional part. */
function stepsThisTick(world: World, speed: number): number {
  const base = Math.floor(speed);
  const frac = speed - base;
  return frac > 0 && world.rng.chance(frac) ? base + 1 : base;
}

/** Take one step from (a.x,a.y) toward (tx,ty) (Chebyshev metric). */
function stepToward(world: World, a: Agent, tx: number, ty: number): void {
  moveTo(world, a, a.x + Math.sign(tx - a.x), a.y + Math.sign(ty - a.y));
}

function randomStep(world: World, a: Agent, dir: number): number {
  const [dx, dy] = DIRS[dir];
  const nx = a.x + dx;
  const ny = a.y + dy;
  if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height) {
    // Bounce: pick a fresh direction next time, stay put now.
    return world.rng.int(8);
  }
  moveTo(world, a, nx, ny);
  return dir;
}

/** Best plant cell within vision; null if nothing edible. Ties broken with the RNG. */
function findPlant(world: World, a: Agent, vision: number): number | null {
  const { width, height, plant } = world;
  let best = -1;
  let bestScore = 0.05; // ignore near-bare cells
  let ties = 0;
  const x0 = Math.max(0, a.x - vision), x1 = Math.min(width - 1, a.x + vision);
  const y0 = Math.max(0, a.y - vision), y1 = Math.min(height - 1, a.y + vision);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * width + x;
      const d = Math.max(Math.abs(x - a.x), Math.abs(y - a.y));
      const score = plant[i] - 0.08 * d;
      if (score > bestScore) {
        bestScore = score;
        best = i;
        ties = 1;
      } else if (score === bestScore && best >= 0) {
        ties++;
        if (world.rng.int(ties) === 0) best = i;
      }
    }
  }
  return best >= 0 ? best : null;
}

/** Nearest cell (by Chebyshev ring) containing an agent of `species`, or null. */
function findNearest(world: World, a: Agent, species: Species, vision: number): number | null {
  const heads = world.cellHead[species];
  const { width, height } = world;
  for (let r = 0; r <= vision; r++) {
    let found = -1;
    let ties = 0;
    for (let y = a.y - r; y <= a.y + r; y++) {
      if (y < 0 || y >= height) continue;
      const edge = y === a.y - r || y === a.y + r;
      for (let x = a.x - r; x <= a.x + r; x += edge || r === 0 ? 1 : 2 * r) {
        if (x < 0 || x >= width) continue;
        const i = y * width + x;
        if (heads[i]) {
          ties++;
          if (ties === 1 || world.rng.int(ties) === 0) found = i;
        }
      }
    }
    if (found >= 0) return found;
  }
  return null;
}

function eatPlant(world: World, a: Agent, p: AnimalParams): boolean {
  const i = a.y * world.width + a.x;
  // Grazing leaves roots behind so the cell can regrow.
  const amt = Math.min(p.biteSize, world.plant[i] - GRAZE_RESIDUAL);
  if (amt <= 0) return false;
  world.plant[i] -= amt;
  a.energy = Math.min(p.maxEnergy, a.energy + amt * p.foodEnergy);
  return true;
}

function tryCatch(world: World, a: Agent, p: AnimalParams): boolean {
  const prey = world.cellHead[HERBIVORE][a.y * world.width + a.x];
  if (!prey) return false;
  const cover = world.plant[a.y * world.width + a.x] * world.params.plant.hideFactor;
  if (!world.rng.chance(p.huntSuccess * Math.max(0, 1 - cover))) return false;
  kill(world, prey, 'eaten');
  a.action = 'catch';
  a.energy = Math.min(p.maxEnergy, a.energy + p.foodEnergy);
  return true;
}

function reproduce(world: World, a: Agent, p: AnimalParams): void {
  if (a.energy < p.reproduceThreshold) return;
  const childEnergy = a.energy * p.reproduceShare;
  a.energy -= childEnergy;
  const [dx, dy] = DIRS[world.rng.int(8)];
  // Newborns are appended to world.agents but are not in this tick's order list.
  const child = spawnAgent(world, a.species, a.x + dx, a.y + dy, childEnergy);
  child.born = world.tick + 1;
  child.px = a.x;
  child.py = a.y;
  child.facing = a.facing;
}

function updateHerbivore(world: World, a: Agent, p: AnimalParams): void {
  const speed = stepsThisTick(world, p.speed);
  const here = world.plant[a.y * world.width + a.x];
  let moved = 0;
  const threat = p.fleeRadius > 0 ? findNearest(world, a, CARNIVORE, p.fleeRadius) : null;
  a.action = 'rest';
  if (threat !== null) {
    a.action = 'flee';
    const tx = threat % world.width;
    const ty = (threat - tx) / world.width;
    for (let s = 0; s < speed; s++) {
      // Step directly away; if a wall blocks one axis, slide along the other.
      let dx = Math.sign(a.x - tx);
      let dy = Math.sign(a.y - ty);
      if (dx === 0 && dy === 0) [dx, dy] = DIRS[world.rng.int(8)];
      const nx = clampInt(a.x + dx, 0, world.width - 1);
      const ny = clampInt(a.y + dy, 0, world.height - 1);
      if (nx === a.x && ny === a.y) break;
      moveTo(world, a, nx, ny);
      moved++;
    }
  } else if (here < 0.15) {
    const target = findPlant(world, a, p.vision);
    if (target !== null) {
      a.action = 'seek';
      const tx = target % world.width;
      const ty = (target - tx) / world.width;
      for (let s = 0; s < speed && (a.x !== tx || a.y !== ty); s++) {
        stepToward(world, a, tx, ty);
        moved++;
      }
    } else {
      a.action = 'wander';
      let dir = world.rng.int(8);
      for (let s = 0; s < speed; s++) {
        dir = randomStep(world, a, dir);
        moved++;
      }
    }
  }
  a.energy -= moved * p.moveCost;
  if (eatPlant(world, a, p) && a.action !== 'flee') a.action = 'eat';
  reproduce(world, a, p);
}

function updateCarnivore(world: World, a: Agent, p: AnimalParams): void {
  const speed = stepsThisTick(world, p.speed);
  let moved = 0;
  // Only hunt when not full, so satiated predators don't wipe out prey.
  const hungry = a.energy < p.maxEnergy * 0.9;
  a.action = 'rest';
  if (hungry && !tryCatch(world, a, p)) {
    const target = findNearest(world, a, HERBIVORE, p.vision);
    if (target !== null) {
      a.action = 'hunt';
      const tx = target % world.width;
      const ty = (target - tx) / world.width;
      for (let s = 0; s < speed; s++) {
        if (a.x !== tx || a.y !== ty) {
          stepToward(world, a, tx, ty);
          moved++;
        }
        if (tryCatch(world, a, p)) break;
      }
    } else {
      a.action = 'wander';
      let dir = world.rng.int(8);
      for (let s = 0; s < speed; s++) {
        dir = randomStep(world, a, dir);
        moved++;
      }
    }
  } else if (!hungry) {
    a.action = 'rest';
    const dir = world.rng.int(8);
    randomStep(world, a, dir);
    moved++;
  }
  a.energy -= moved * p.moveCost;
  reproduce(world, a, p);
}

/** One tick of all animals, in a freshly shuffled order. */
export function stepAgents(world: World): void {
  world.deaths.length = 0;
  for (const a of world.agents) {
    a.px = a.x;
    a.py = a.y;
  }
  const order = world.rng.shuffle(world.agents.slice());
  for (const a of order) {
    if (!a.alive) continue;
    const p = speciesParams(world, a.species);
    a.age++;
    a.energy -= p.metabolism;
    if (a.species === HERBIVORE) updateHerbivore(world, a, p);
    else updateCarnivore(world, a, p);
    if (a.energy <= 0 || a.age >= p.lifespan) {
      a.energy = Math.max(0, a.energy);
      kill(world, a, a.energy <= 0 ? 'starved' : 'old');
    }
  }
  // Compact: keep survivors and newborns in insertion order.
  world.agents = world.agents.filter((a) => a.alive);
}

export function census(world: World): [number, number] {
  const c: [number, number] = [0, 0];
  for (const a of world.agents) if (a.alive) c[a.species]++;
  return c;
}

function clampInt(v: number, lo: number, hi: number): number {
  v = Math.round(v);
  return v < lo ? lo : v > hi ? hi : v;
}
