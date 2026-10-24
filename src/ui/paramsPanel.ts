import { cloneParams, type SimParams } from '../core/params';
import { h } from './dom';

const GROUP_LABELS: Record<string, string> = {
  world: 'ワールド',
  water: '水',
  plant: '植物',
  herbivore: '草食',
  carnivore: '肉食',
};

const LABELS: Record<string, string> = {
  width: '幅',
  height: '高さ',
  initial: '初期水分',
  evaporation: '蒸発率',
  diffusion: '拡散率',
  rainChance: '自然の雨の確率/tick',
  rainRadius: '雨の半径',
  rainAmount: '雨量',
  initialCover: '初期の被覆率',
  growthThreshold: '成長に必要な水分',
  growthRate: '成長率',
  wiltRate: '枯れる速さ',
  waterUse: '水の消費',
  seedRate: '種まき率',
  seedBiomass: '芽生えの量',
  sproutChance: '自然発芽率',
  hideFactor: '草むらの隠れ効果',
  initialCount: '初期個体数',
  speed: '移動速度',
  vision: '視野',
  metabolism: '代謝コスト',
  moveCost: '移動コスト',
  reproduceThreshold: '繁殖に必要なエネルギー',
  reproduceShare: '子に渡すエネルギー比',
  maxEnergy: '最大エネルギー',
  initialEnergy: '初期エネルギー',
  lifespan: '寿命',
  biteSize: '一口の量',
  foodEnergy: '食料のエネルギー',
  huntSuccess: '狩りの成功率',
  fleeRadius: '逃げ始める距離',
};

/** Fields that have no effect for a given species and are hidden from the UI. */
const HIDDEN: Record<string, string[]> = {
  herbivore: ['huntSuccess'],
  carnivore: ['biteSize', 'fleeRadius'],
};

/**
 * Collapsible editor for every SimParams leaf. Edits are staged and only
 * take effect on "適用" (which restarts the run, since params are initial
 * conditions of a deterministic replay).
 */
export function buildParamsPanel(get: () => SimParams, apply: (p: SimParams) => void): HTMLElement {
  const body = h('div.params');
  let draft = cloneParams(get());

  const render = () => {
    draft = cloneParams(get());
    body.replaceChildren();
    const d = draft as unknown as Record<string, unknown>;
    const world = h('fieldset', {}, h('legend', {}, GROUP_LABELS.world));
    for (const k of ['width', 'height'] as const) world.append(field(k, draft[k], (v) => (draft[k] = v)));
    body.append(world);
    for (const g of ['water', 'plant', 'herbivore', 'carnivore']) {
      const group = d[g] as Record<string, number>;
      const fs = h('fieldset', {}, h('legend', {}, GROUP_LABELS[g]));
      for (const k of Object.keys(group)) {
        if (HIDDEN[g]?.includes(k)) continue;
        fs.append(field(k, group[k], (v) => (group[k] = v)));
      }
      body.append(fs);
    }
  };

  const details = h(
    'details.card.params-card',
    { ontoggle: () => details.open && render() },
    h('summary', {}, 'パラメータ'),
    h('p.muted', {}, '変更は「適用して再スタート」で反映されます（同じseedで最初から）。'),
    body,
    h(
      'div.row',
      {},
      h('button.btn.primary', { onclick: () => apply(cloneParams(draft)) }, '適用して再スタート'),
      h('button.btn', { onclick: render }, '元に戻す'),
    ),
  );
  return Object.assign(details, { refresh: render });
}

function field(key: string, value: number, set: (v: number) => void): HTMLElement {
  const input = h('input', { type: 'number', step: 'any', value: String(value), inputmode: 'decimal' });
  input.addEventListener('change', () => {
    const v = Number(input.value);
    if (Number.isFinite(v)) set(v);
  });
  return h('label.field', {}, h('span', {}, LABELS[key] ?? key), input);
}
