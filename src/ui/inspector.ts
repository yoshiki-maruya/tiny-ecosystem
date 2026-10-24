import { HERBIVORE, speciesParams, type Action, type Agent, type DeathCause } from '../core/agents';
import type { World } from '../core/world';
import { h } from './dom';

const ACTION_JA: Record<Action, string> = {
  eat: '草を食べている',
  seek: '草を探して移動中',
  flee: '肉食から逃げている！',
  hunt: '獲物を追っている',
  catch: '獲物を捕まえた！',
  wander: 'あてもなく歩いている',
  rest: 'のんびりしている',
};

const CAUSE_JA: Record<DeathCause, string> = {
  eaten: '肉食に食べられました',
  starved: 'エネルギーが尽きて死にました',
  old: '寿命を迎えました',
};

/** "観察" card: follows one animal (or shows a cell) in plain language. */
export class Inspector {
  readonly el: HTMLElement;
  private readonly body = h('div.inspect');
  private key = '';
  /** Snapshot of the last shown animal, so its fate can be described after it dies. */
  lastAgent: Agent | null = null;

  constructor() {
    this.el = h('section.card.o-inspect', {}, h('h2', {}, '観察'), this.body);
  }

  showHint(): void {
    this.set('hint', () =>
      h('p.muted', { style: 'margin:0' }, '盤面の生き物をクリック／タップすると、その個体を追いかけて様子を観察できます。地面をクリックすると、その場所の水分と草の量がわかります。'),
    );
  }

  showAgent(a: Agent, w: World): void {
    this.lastAgent = { ...a, prev: null, next: null };
    const p = speciesParams(w, a.species);
    const herb = a.species === HERBIVORE;
    const i = a.y * w.width + a.x;
    this.render(`a:${a.id}`, [
      this.title(herb, a.id),
      h('div.state', {}, ACTION_JA[a.action]),
      meter('エネルギー', a.energy / p.maxEnergy, `${a.energy.toFixed(2)} / ${p.maxEnergy}`, herb ? 'var(--herb)' : 'var(--carn)', p.reproduceThreshold / p.maxEnergy, '繁殖'),
      meter('年齢', a.age / p.lifespan, `${a.age} / ${p.lifespan} tick`, 'var(--muted)'),
      h(
        'dl.facts',
        {},
        h('dt', {}, '生まれ'),
        h('dd', {}, a.born === 0 ? '最初からいた個体' : `tick ${a.born}`),
        h('dt', {}, '足元の草'),
        h('dd', {}, pct(w.plant[i])),
        h('dt', {}, '足元の水分'),
        h('dd', {}, pct(w.water[i])),
      ),
    ]);
  }

  showDeath(a: Agent, cause: DeathCause, tick: number, _w: World): void {
    const herb = a.species === HERBIVORE;
    this.render(`d:${a.id}`, [
      this.title(herb, a.id, true),
      h('div.state.dead', {}, `tick ${tick} に${CAUSE_JA[cause]}`),
      h('p.muted', { style: 'margin:6px 0 0' }, `${a.age + 1} tick 生きました。別の生き物をクリックして観察を続けられます。`),
    ]);
  }

  showCell(x: number, y: number, w: World): void {
    const i = y * w.width + x;
    const thr = w.params.plant.growthThreshold;
    let herb = 0;
    let carn = 0;
    for (let a = w.cellHead[0][i]; a; a = a.next) herb++;
    for (let a = w.cellHead[1][i]; a; a = a.next) carn++;
    const m = w.water[i];
    this.render(`c:${x},${y}`, [
      h('div.inspect-title', {}, `地面 (${x}, ${y})`),
      meter('水分', m, pct(m), 'var(--water)', thr, '成長ライン'),
      meter('草の量', w.plant[i], pct(w.plant[i]), 'var(--accent)'),
      h('div.state', {}, m >= thr ? (w.plant[i] > 0 ? '草が育つ湿り気がある' : '湿っている。近くから種が飛んでくれば芽が出る') : '乾きすぎて草は育たない（雨が必要）'),
      h('p.muted', { style: 'margin:6px 0 0' }, `ここにいる動物: 草食 ${herb} / 肉食 ${carn}`),
    ]);
  }

  private title(herb: boolean, id: number, dead = false): HTMLElement {
    return h(
      'div.inspect-title',
      {},
      h('i.dot', { style: `background:${herb ? 'var(--herb)' : 'var(--carn)'}` }),
      `${herb ? '草食（うさぎ）' : '肉食（きつね）'} #${id}`,
      dead ? h('span.muted', {}, '  — 死亡') : null,
    );
  }

  private set(key: string, make: () => Node): void {
    if (this.key === key) return;
    this.key = key;
    this.body.replaceChildren(make());
  }

  /** Re-render only when the content changes, so the card doesn't flicker every frame. */
  private render(key: string, nodes: Node[]): void {
    const html = nodes.map((n) => (n as HTMLElement).outerHTML).join('');
    const full = `${key}|${html}`;
    if (this.key === full) return;
    this.key = full;
    this.body.replaceChildren(...nodes);
  }
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function meter(label: string, v: number, text: string, color: string, mark?: number, markLabel?: string): HTMLElement {
  const fill = h('i', { style: `width:${Math.max(0, Math.min(1, v)) * 100}%;background:${color}` });
  const bar = h('div.meter-bar', {}, fill);
  if (mark !== undefined) bar.append(h('b', { style: `left:${Math.min(1, mark) * 100}%`, title: markLabel ?? '' }));
  return h(
    'div.meter',
    {},
    h('div.meter-head', {}, h('span', {}, label), h('span', {}, text, mark !== undefined && markLabel ? h('span.muted', {}, `  ┆=${markLabel}`) : null)),
    bar,
  );
}
