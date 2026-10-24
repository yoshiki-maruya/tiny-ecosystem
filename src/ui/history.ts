/** Ring buffer of recent population samples for the graph. */
export class PopulationHistory {
  readonly plant: Float64Array;
  readonly herb: Float64Array;
  readonly carn: Float64Array;
  readonly ticks: Int32Array;
  private head = 0;
  size = 0;

  constructor(readonly capacity = 720) {
    this.plant = new Float64Array(capacity);
    this.herb = new Float64Array(capacity);
    this.carn = new Float64Array(capacity);
    this.ticks = new Int32Array(capacity);
  }

  clear(): void {
    this.head = 0;
    this.size = 0;
  }

  push(tick: number, plant: number, herb: number, carn: number): void {
    const i = this.head;
    this.plant[i] = plant;
    this.herb[i] = herb;
    this.carn[i] = carn;
    this.ticks[i] = tick;
    this.head = (i + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }

  /** Physical index of the k-th oldest sample. */
  index(k: number): number {
    return (this.head - this.size + k + this.capacity) % this.capacity;
  }
}
