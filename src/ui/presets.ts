import { DEFAULT_PARAMS, mergeParams, type SimParams } from '../core/params';

export interface Preset {
  id: string;
  name: string;
  description: string;
  seed: number;
  params: SimParams;
}

/** Each preset is just seed + params, so it is reproducible and shareable like any run. */
export const PRESETS: Preset[] = [
  {
    id: 'default',
    name: 'いつもの森',
    description: 'デフォルト設定。しばらく安定し、やがて揺らぎ始める。',
    seed: 20261024,
    params: DEFAULT_PARAMS,
  },
  {
    id: 'pond',
    name: '安定する池',
    description: '雨が多く草むらが深い。捕食者は控えめで、長く共存しやすい。',
    seed: 7,
    params: mergeParams(DEFAULT_PARAMS, {
      water: { rainChance: 0.26, initial: 0.6 },
      plant: { hideFactor: 0.7 },
      carnivore: { speed: 1.1, initialCount: 4 },
    }),
  },
  {
    id: 'fragile',
    name: '絶滅しやすい森',
    description: '乾いた森に俊敏な捕食者。数百tickで誰かがいなくなることが多い。',
    seed: 1432,
    params: mergeParams(DEFAULT_PARAMS, {
      water: { rainChance: 0.12, initial: 0.35 },
      carnivore: { speed: 1.4, huntSuccess: 0.3, foodEnergy: 0.35, initialCount: 10 },
    }),
  },
  {
    id: 'outbreak',
    name: '大発生',
    description: '草食が爆発的に増える。草原が食べ尽くされ、その後に何が残るか。',
    seed: 99,
    params: mergeParams(DEFAULT_PARAMS, {
      herbivore: { reproduceThreshold: 1.2, initialCount: 200, biteSize: 0.2 },
      carnivore: { initialCount: 2 },
    }),
  },
];
