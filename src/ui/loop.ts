/** Logical tick rate at 1x. Ticks are fixed-step, independent of display fps. */
export const TICKS_PER_SECOND_1X = 30;

/**
 * Fixed-step scheduler: accumulates real time and reports how many whole
 * ticks to run this frame. Speed multiplies ticks per frame; a cap prevents
 * a spiral of death after the tab was in the background.
 */
export class FixedStepClock {
  private acc = 0;
  private last = -1;

  constructor(public speed = 1) {}

  reset(): void {
    this.acc = 0;
    this.last = -1;
  }

  ticksFor(now: number): number {
    if (this.last < 0) this.last = now;
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt * TICKS_PER_SECOND_1X * this.speed;
    const n = Math.floor(this.acc);
    this.acc -= n;
    return n;
  }
}
