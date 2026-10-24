import { DEFAULT_PARAMS, cloneParams, type SimParams } from './params';
import { createWorld, type World } from './world';
import { stepWorld, type SimEvent } from './sim';
import { applyIntervention, canAppend, interventionStatus, sanitizeLog, type Intervention, type InterventionStatus } from './interventions';

export type InterventionInput =
  | { type: 'rain'; x: number; y: number }
  | { type: 'add'; species: 'plant' | 'herbivore' | 'carnivore'; x: number; y: number };

/**
 * Deterministic driver: seed + params + intervention log fully determine
 * every tick. Interventions with tick T are applied right before tick T is
 * stepped, both live and during replay.
 */
export class Simulation {
  readonly seed: number;
  readonly params: SimParams;
  world: World;
  /** All events since tick 0, for the notification log. */
  events: SimEvent[] = [];
  private _log: Intervention[] = [];
  /** Index of the next log entry to apply. */
  private cursor = 0;
  /** Called whenever an intervention is applied (live or during replay). */
  onIntervention: ((iv: Intervention) => void) | null = null;

  constructor(seed: number, params: SimParams = DEFAULT_PARAMS, log: readonly Intervention[] = []) {
    this.seed = seed >>> 0;
    this.params = cloneParams(params);
    this.world = createWorld(this.params, this.seed);
    this._log = sanitizeLog(log, this.world.width, this.world.height);
  }

  get tick(): number {
    return this.world.tick;
  }

  get log(): readonly Intervention[] {
    return this._log;
  }

  /** Log entries up to the current tick (what a share URL should contain). */
  get appliedLog(): Intervention[] {
    return this._log.slice(0, this.cursor);
  }

  status(): InterventionStatus {
    return interventionStatus(this.appliedLog);
  }

  /** Try to intervene now. Returns false if blocked by cooldown/quota. */
  intervene(input: InterventionInput): boolean {
    // A live intervention discards any not-yet-reached future from a replayed log.
    this._log.length = this.cursor;
    const iv = { ...input, tick: this.world.tick } as Intervention;
    if (!canAppend(this._log, iv, this.world.width, this.world.height)) return false;
    this._log.push(iv);
    this.applyPending();
    return true;
  }

  private applyPending(): void {
    while (this.cursor < this._log.length && this._log[this.cursor].tick === this.world.tick) {
      const iv = this._log[this.cursor++];
      applyIntervention(this.world, iv);
      this.onIntervention?.(iv);
    }
  }

  step(): SimEvent[] {
    this.applyPending();
    const ev = stepWorld(this.world);
    if (ev.length) this.events.push(...ev);
    return ev;
  }

  /** Run until world.tick === target (no-op if already past). */
  advanceTo(target: number): void {
    while (this.world.tick < target) this.step();
    this.applyPending();
  }
}
