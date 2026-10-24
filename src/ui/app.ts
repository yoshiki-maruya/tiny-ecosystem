import { census, type Agent, type DeathCause } from '../core/agents';
import { hashWorld } from '../core/hash';
import { RULES, type AddTarget, type Intervention } from '../core/interventions';
import { hashSeed } from '../core/rng';
import { cloneParams, type SimParams } from '../core/params';
import { plantBiomass, type SimEvent } from '../core/sim';
import { Simulation, type InterventionInput } from '../core/simulation';
import { CODEC_VERSION, decodeState, encodeState } from '../codec/codec';
import { PopulationGraph } from '../render/graph';
import { SPECIES_COLORS, PALETTE } from '../render/palette';
import { WorldRenderer } from '../render/worldRenderer';
import { h } from './dom';
import { PopulationHistory } from './history';
import { FixedStepClock } from './loop';
import { buildParamsPanel } from './paramsPanel';
import { Inspector } from './inspector';
import { PRESETS, type Preset } from './presets';

const SPEEDS = [1, 4, 16, 64] as const;
/** Above this speed motion is not interpolated (many ticks per frame). */
const SMOOTH_MAX_SPEED = 4;
/** Max wall time spent per frame while fast-forwarding a shared URL. */
const REPLAY_BUDGET_MS = 28;

type Tool = 'rain' | AddTarget;

const TOOL_INFO: Record<Tool, { label: string; color: string; radius: number }> = {
  rain: { label: '雨を降らせる', color: PALETTE.waterCss, radius: RULES.rain.radius },
  plant: { label: '植物を植える', color: SPECIES_COLORS.plant, radius: RULES.add.radius },
  herbivore: { label: `草食を${RULES.add.count.herbivore}匹放す`, color: SPECIES_COLORS.herbivore, radius: RULES.add.radius },
  carnivore: { label: `肉食を${RULES.add.count.carnivore}匹放す`, color: SPECIES_COLORS.carnivore, radius: RULES.add.radius },
};

function describeIntervention(iv: Intervention): string {
  const where = `(${iv.x}, ${iv.y})`;
  if (iv.type === 'rain') return `雨を降らせた ${where}`;
  if (iv.species === 'plant') return `植物を植えた ${where}`;
  return `${SPECIES_JA[iv.species]}を${RULES.add.count[iv.species]}匹放した ${where}`;
}

const SPECIES_JA: Record<string, string> = { plant: '植物', herbivore: '草食', carnivore: '肉食' };

export class App {
  private sim!: Simulation;
  private params: SimParams = cloneParams(PRESETS[0].params);
  private readonly clock = new FixedStepClock(1);
  private running = true;
  private showWater = false;
  private tool: Tool | null = null;
  private hover: { x: number; y: number } | null = null;
  private selectedId: number | null = null;
  private selectedCell: { x: number; y: number } | null = null;
  /** Remembered fate of the observed animal, once it dies. */
  private selectedFate: { cause: DeathCause; tick: number; agent: Agent } | null = null;
  private readonly inspector = new Inspector();
  private readonly history = new PopulationHistory(720);
  /** Pending fast-forward target when opening a shared URL. */
  private replayTarget: number | null = null;

  private readonly canvas = h('canvas', { 'aria-label': '生態系の様子' });
  private readonly graphCanvas = h('canvas.graph', { 'aria-label': '個体数の推移' });
  private readonly renderer = new WorldRenderer(this.canvas);
  private readonly graph = new PopulationGraph(this.graphCanvas);
  private readonly hud = h('div.hud');
  private readonly toast = h('div.toast', { role: 'status', 'aria-live': 'polite' });
  private readonly overlayText = h('span', {}, '共有された展開を再生中…');
  private readonly progressBar = h('i');
  private readonly overlay = h('div.overlay', {}, this.overlayText, h('div.progress', {}, this.progressBar));
  private readonly playBtn = h('button.btn.primary', { onclick: () => this.togglePlay() });
  private readonly speedBtns: HTMLButtonElement[] = [];
  private readonly toolBtns = new Map<Tool, HTMLButtonElement>();
  private readonly seedInput = h('input', { type: 'text', inputmode: 'numeric', 'aria-label': 'seed' });
  private readonly logList = h('ul.log');
  private readonly shareNote = h('div.share-note');
  private readonly notice = h('div.notice');
  private readonly presetBtns = new Map<string, HTMLButtonElement>();
  private paramsPanel!: HTMLElement & { refresh?: () => void };
  private toastTimer = 0;

  constructor(root: HTMLElement) {
    root.append(this.build());
    this.startFresh(PRESETS[0].seed, this.params);
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('hashchange', () => void this.loadFromHash());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        this.togglePlay();
      }
    });
    this.resize();
    void this.loadFromHash();
    requestAnimationFrame(this.frame);
  }

  // ---------------------------------------------------------------- layout

  private build(): HTMLElement {
    const speedSeg = h('div.seg', { role: 'group', 'aria-label': '速度' });
    for (const s of SPEEDS) {
      const b = h('button.btn', { onclick: () => this.setSpeed(s) }, `${s}x`);
      this.speedBtns.push(b);
      speedSeg.append(b);
    }

    const playback = h(
      'section.card.o-play',
      {},
      h('h2', {}, '再生'),
      h('div.row', {}, this.playBtn, speedSeg, h('button.btn', { onclick: () => this.restart() }, 'リセット')),
      h(
        'div.row',
        {},
        h('span.muted', {}, 'seed'),
        this.seedInput,
        h('button.btn', { onclick: () => this.applySeedInput() }, '適用'),
        h('button.btn', { onclick: () => this.startFresh(randomSeed(), this.params), title: 'ランダムなseed', 'aria-label': 'ランダムなseed' }, '🎲'),
      ),
      h(
        'div.row',
        {},
        h(
          'label.toggle',
          {},
          h('input', { type: 'checkbox', onchange: (e: Event) => (this.showWater = (e.target as HTMLInputElement).checked) }),
          '水分を表示',
        ),
        h('span', { style: 'flex:1' }),
        h('button.btn', { onclick: () => void this.share() }, '共有'),
      ),
      this.shareNote,
      this.notice,
    );
    this.seedInput.addEventListener('keydown', (e) => e.key === 'Enter' && this.applySeedInput());

    const tools = h('div.tools');
    for (const t of Object.keys(TOOL_INFO) as Tool[]) {
      const info = TOOL_INFO[t];
      const b = h(
        'button.btn.tool',
        { onclick: () => this.selectTool(t) },
        h('span', {}, h('i.swatch', { style: `background:${info.color}` }), info.label),
        h('span.meta'),
      );
      this.toolBtns.set(t, b);
      tools.append(b);
    }
    const interventions = h(
      'section.card.o-tools',
      {},
      h('h2', {}, '介入'),
      tools,
      h('p.muted', { style: 'margin:8px 0 0' }, `ツールを選んで盤面をタップ（もう一度押すと解除）。生き物の追加は1回の世界で${RULES.add.maxUses}回まで。`),
    );

    const graphCard = h('section.card.o-graph', {}, h('h2', {}, `個体数の推移（直近${this.history.capacity} tick）`), this.graphCanvas);
    const logCard = h('section.card.o-log', {}, h('h2', {}, 'できごと'), this.logList);

    const presets = h('div.presets');
    for (const p of PRESETS) {
      const b = h('button.btn.preset', { onclick: () => this.loadPreset(p) }, h('span', {}, p.name), h('span.desc', {}, p.description));
      this.presetBtns.set(p.id, b);
      presets.append(b);
    }
    const presetCard = h('section.card.o-presets', {}, h('h2', {}, 'プリセット'), presets);

    this.paramsPanel = buildParamsPanel(
      () => this.params,
      (p) => this.startFresh(this.sim.seed, p),
    );

    this.canvas.addEventListener('pointermove', (e) => (this.hover = this.renderer.cellAt(this.sim.world, e.clientX, e.clientY)));
    this.canvas.addEventListener('pointerleave', () => (this.hover = null));
    this.canvas.addEventListener('click', (e) => this.onCanvasClick(e));

    return h(
      'div.app',
      {},
      h('header.app-header', {}, h('h1', {}, '小さな生態系'), h('span.sub', {}, 'ルールだけで増え、減り、消えていく')),
      h(
        'div.layout',
        {},
        h('div.main-col', {}, h('section.stage', {}, this.canvas, this.overlay, this.toast, this.hud), graphCard),
        h('aside.panel', {}, this.inspector.el, playback, interventions, logCard, presetCard, this.paramsPanel),
      ),
    );
  }

  private resize(): void {
    this.renderer.resize();
    this.graph.resize();
  }

  // ---------------------------------------------------------------- loop

  private frame = (now: number): void => {
    if (this.replayTarget !== null) {
      this.replayChunk();
      this.clock.reset();
    } else if (this.running) {
      const n = this.clock.ticksFor(now);
      for (let i = 0; i < n; i++) this.stepOnce(true);
    } else {
      this.clock.ticksFor(now);
    }
    const blocked = this.tool ? !this.toolReady(this.tool) : false;
    const smooth = this.running && this.replayTarget === null && this.clock.speed <= SMOOTH_MAX_SPEED;
    const alpha = smooth ? this.clock.fraction : 1;
    this.renderer.render(this.sim.world, {
      alpha,
      selectedId: this.selectedId,
      selectedCell: this.selectedId === null ? this.selectedCell : null,
      showWater: this.showWater || this.tool === 'rain',
      cursor:
        this.tool && this.hover
          ? { ...this.hover, radius: TOOL_INFO[this.tool].radius, color: TOOL_INFO[this.tool].color, blocked }
          : null,
    });
    this.graph.render(this.history);
    this.updateInspector();
    this.updateHud();
    this.updateTools();
    requestAnimationFrame(this.frame);
  };

  private stepOnce(live: boolean): void {
    const events = this.sim.step();
    const w = this.sim.world;
    const [herb, carn] = census(w);
    this.history.push(w.tick, plantBiomass(w), herb, carn);
    for (const ev of events) this.onEvent(ev, live);
    if (this.selectedId !== null && !this.selectedFate) {
      const d = w.deaths.find((r) => r.id === this.selectedId);
      if (d) {
        const last = this.lastSelected;
        if (last) this.selectedFate = { cause: d.cause, tick: w.tick, agent: last };
      }
    }
    if (live && this.clock.speed <= SMOOTH_MAX_SPEED) this.renderer.addDeaths(w.deaths, w);
  }

  private replayChunk(): void {
    const target = this.replayTarget!;
    const t0 = performance.now();
    while (this.sim.tick < target && performance.now() - t0 < REPLAY_BUDGET_MS) {
      for (let k = 0; k < 20 && this.sim.tick < target; k++) this.stepOnce(false);
    }
    this.progressBar.style.width = `${(100 * this.sim.tick) / Math.max(1, target)}%`;
    if (this.sim.tick >= target) {
      this.sim.advanceTo(target); // applies interventions logged at exactly `target`
      this.replayTarget = null;
      this.overlay.classList.remove('show');
    }
  }

  // ---------------------------------------------------------------- runs

  private startFresh(seed: number, params: SimParams, log: Intervention[] = [], tick = 0): void {
    this.params = cloneParams(params);
    this.sim = new Simulation(seed, this.params, log);
    this.sim.onIntervention = (iv) => this.addLog(describeIntervention(iv), 'intervention', iv.tick);
    this.selectedId = null;
    this.selectedCell = null;
    this.selectedFate = null;
    this.renderer.clearEffects();
    this.history.clear();
    this.logList.replaceChildren();
    this.clock.reset();
    this.shareNote.textContent = '';
    this.replayTarget = tick > 0 ? tick : null;
    this.overlay.classList.toggle('show', tick > 0);
    this.progressBar.style.width = '0%';
    if (tick === 0) this.sim.advanceTo(0);
    this.paramsPanel?.refresh?.();
    this.syncControls();
  }

  private restart(): void {
    this.startFresh(this.sim.seed, this.params);
  }

  private loadPreset(p: Preset): void {
    this.notice.textContent = '';
    history.replaceState(null, '', location.pathname + location.search);
    this.startFresh(p.seed, p.params);
  }

  private async loadFromHash(): Promise<void> {
    const res = await decodeState(location.hash);
    if (res.ok) {
      this.notice.textContent = '';
      const { seed, params, log, tick } = res.state;
      this.startFresh(seed, params, log, tick);
      this.running = true;
      this.syncControls();
    } else if (res.reason === 'version') {
      this.notice.textContent = `このリンクは別バージョン (v${res.version}) のルールで作られたため再現できません。現在は v${CODEC_VERSION} です。`;
    } else if (res.reason === 'corrupt') {
      this.notice.textContent = 'リンクの内容を読み取れませんでした。デフォルトの森を表示しています。';
    }
  }

  private async share(): Promise<void> {
    const hash = await encodeState({
      seed: this.sim.seed,
      params: this.sim.params,
      tick: this.sim.tick,
      log: this.sim.appliedLog,
    });
    const url = `${location.origin}${location.pathname}${location.search}#${hash}`;
    history.replaceState(null, '', `#${hash}`);
    try {
      await navigator.clipboard.writeText(url);
      this.shareNote.textContent = `URLをコピーしました（tick ${this.sim.tick} の状態）`;
    } catch {
      this.shareNote.textContent = 'アドレスバーのURLを共有してください（クリップボードにアクセスできませんでした）';
    }
  }

  // ---------------------------------------------------------------- interventions

  private selectTool(t: Tool): void {
    this.tool = this.tool === t ? null : t;
    this.updateTools();
  }

  private toolReady(t: Tool): boolean {
    const st = this.sim.status();
    if (t === 'rain') return this.sim.tick >= st.rainReadyAt;
    return st.addUsesLeft > 0 && this.sim.tick >= st.addReadyAt;
  }

  private onCanvasClick(e: MouseEvent): void {
    if (this.replayTarget !== null) return;
    const cell = this.renderer.cellAt(this.sim.world, e.clientX, e.clientY);
    if (!cell) return;
    if (!this.tool) {
      this.selectAt(e);
      return;
    }
    const input: InterventionInput =
      this.tool === 'rain' ? { type: 'rain', ...cell } : { type: 'add', species: this.tool, ...cell };
    if (!this.sim.intervene(input)) {
      this.showToast('まだ使えません（クールダウン中）');
      return;
    }
    if (this.tool !== 'rain' && this.sim.status().addUsesLeft === 0) this.tool = null;
  }

  /** Without a tool, a click picks the nearest animal (or the cell) to observe. */
  private selectAt(e: MouseEvent): void {
    const w = this.sim.world;
    const { gx, gy } = this.renderer.gridAt(w, e.clientX, e.clientY);
    const alpha = this.running && this.clock.speed <= SMOOTH_MAX_SPEED ? this.clock.fraction : 1;
    let best: Agent | null = null;
    let bestD = 0.8 * 0.8;
    for (const a of w.agents) {
      if (!a.alive) continue;
      const p = this.renderer.agentPos(a, alpha);
      const d = (p.x - gx) ** 2 + (p.y - gy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    this.selectedFate = null;
    if (best) {
      this.selectedId = best.id;
      this.selectedCell = null;
    } else {
      this.selectedId = null;
      this.selectedCell = { x: Math.floor(gx), y: Math.floor(gy) };
    }
  }

  private get lastSelected(): Agent | null {
    return this.inspector.lastAgent;
  }

  private updateInspector(): void {
    const w = this.sim.world;
    if (this.selectedFate) {
      this.inspector.showDeath(this.selectedFate.agent, this.selectedFate.cause, this.selectedFate.tick, w);
      return;
    }
    if (this.selectedId !== null) {
      const a = w.agents.find((x) => x.id === this.selectedId && x.alive);
      if (a) {
        this.inspector.showAgent(a, w);
        return;
      }
    }
    if (this.selectedCell) {
      this.inspector.showCell(this.selectedCell.x, this.selectedCell.y, w);
      return;
    }
    this.inspector.showHint();
  }

  // ---------------------------------------------------------------- events & UI sync

  private onEvent(ev: SimEvent, live: boolean): void {
    const msg = ev.kind === 'collapse' ? '動物が全滅しました' : `${SPECIES_JA[ev.species ?? ''] ?? ev.species}が絶滅しました`;
    this.addLog(msg, 'extinct', ev.tick);
    if (live) this.showToast(`${msg} (tick ${ev.tick})`);
  }

  private addLog(text: string, cls: string, tick = this.sim.tick): void {
    const li = h(`li.${cls}`, {}, h('span.t', {}, `tick ${tick}`), h('span', {}, text));
    this.logList.prepend(li);
    while (this.logList.childElementCount > 200) this.logList.lastElementChild!.remove();
  }

  private showToast(text: string): void {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('show'), 3200);
  }

  private updateHud(): void {
    const [herb, carn] = census(this.sim.world);
    const plant = plantBiomass(this.sim.world);
    const cell = (n: number) => (n === 0 ? '<b class="gone">0</b>' : `<b>${n}</b>`);
    this.hud.innerHTML =
      `<span>tick <b>${this.sim.tick}</b></span>` +
      `<span><i class="dot" style="background:var(--accent)"></i>植物 ${cell(Math.round(plant))}</span>` +
      `<span><i class="dot" style="background:var(--herb)"></i>草食 ${cell(herb)}</span>` +
      `<span><i class="dot" style="background:var(--carn)"></i>肉食 ${cell(carn)}</span>` +
      `<span class="seed">seed ${this.sim.seed}</span>`;
  }

  private updateTools(): void {
    const st = this.sim.status();
    const tick = this.sim.tick;
    for (const [t, b] of this.toolBtns) {
      const meta = b.querySelector('.meta')!;
      const readyAt = t === 'rain' ? st.rainReadyAt : st.addReadyAt;
      let text: string;
      if (t !== 'rain' && st.addUsesLeft === 0) text = '使い切りました';
      else if (tick < readyAt) text = `あと ${readyAt - tick} tick`;
      else text = t === 'rain' ? '使えます' : `残り ${st.addUsesLeft} 回`;
      if (meta.textContent !== text) meta.textContent = text;
      b.classList.toggle('active', this.tool === t);
      b.toggleAttribute('data-blocked', !this.toolReady(t));
    }
  }

  /** Debug/verification hook (exposed on window.ecosim): state fingerprint. */
  debugState(): { tick: number; hash: string; replaying: boolean } {
    return { tick: this.sim.tick, hash: hashWorld(this.sim.world), replaying: this.replayTarget !== null };
  }

  /** Debug hook: pause/resume. */
  setRunning(on: boolean): void {
    this.running = on;
    this.syncControls();
  }

  private togglePlay(): void {
    this.running = !this.running;
    this.syncControls();
  }

  private setSpeed(s: number): void {
    this.clock.speed = s;
    this.syncControls();
  }

  private applySeedInput(): void {
    const raw = this.seedInput.value.trim();
    if (!raw) return;
    const seed = /^\d+$/.test(raw) && Number(raw) <= 0xffffffff ? Number(raw) : hashSeed(raw);
    this.startFresh(seed, this.params);
  }

  private syncControls(): void {
    this.playBtn.textContent = this.running ? '一時停止' : '再生';
    this.speedBtns.forEach((b, i) => b.classList.toggle('active', SPEEDS[i] === this.clock.speed));
    if (document.activeElement !== this.seedInput) this.seedInput.value = String(this.sim.seed);
    for (const p of PRESETS) {
      const same = p.seed === this.sim.seed && JSON.stringify(p.params) === JSON.stringify(this.sim.params);
      this.presetBtns.get(p.id)?.classList.toggle('active', same);
    }
  }
}

function randomSeed(): number {
  // Only the *choice* of a fresh seed uses crypto; the simulation itself never does.
  return crypto.getRandomValues(new Uint32Array(1))[0];
}
