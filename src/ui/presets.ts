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
    description: 'デフォルト設定。うさぎが増えると草が減り、きつねが増えるとうさぎが減る。その波を眺める。',
    seed: 30,
    params: DEFAULT_PARAMS,
  },
  {
    id: 'pond',
    name: '安定する池',
    description: '雨が多くみずみずしい池のほとり。このseedではうさぎときつねの波が長く穏やかに続く。',
    seed: 1,
    params: mergeParams(DEFAULT_PARAMS, {
      water: { rainChance: 0.22, initial: 0.6 },
    }),
  },
  {
    id: 'fragile',
    name: '絶滅しやすい森',
    description: '乾いた森に俊敏な捕食者。数百tickで誰かがいなくなることが多い。介入で救えるか。',
    seed: 25,
    params: mergeParams(DEFAULT_PARAMS, {
      water: { rainChance: 0.14, initial: 0.4 },
      carnivore: { speed: 1.3, huntSuccess: 0.22, foodEnergy: 0.3, initialCount: 4 },
    }),
  },
  {
    id: 'outbreak',
    name: '大発生',
    description: '豊かな草原でうさぎが爆発的に増え、きつねも後を追う。その後に何が残るか。',
    seed: 1,
    params: mergeParams(DEFAULT_PARAMS, {
      water: { rainChance: 0.3 },
      plant: { growthRate: 0.12, initialCover: 0.8 },
      herbivore: { reproduceThreshold: 1.2, initialCount: 15, biteSize: 0.2, foodEnergy: 0.6, lifespan: 400 },
      carnivore: { initialCount: 1 },
    }),
  },
];
