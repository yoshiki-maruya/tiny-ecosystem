import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, cloneParams } from '../src/core/params';
import { Simulation } from '../src/core/simulation';
import { hashWorld } from '../src/core/hash';
import { CODEC_VERSION, decodeState, encodeState } from '../src/codec/codec';

describe('URL codec', () => {
  it('round-trips state and replays to the identical world', async () => {
    const params = cloneParams(DEFAULT_PARAMS);
    params.carnivore.speed = 1.3;
    params.water.rainChance = 0.1;
    const live = new Simulation(4242, params);
    live.advanceTo(40);
    live.intervene({ type: 'rain', x: 20, y: 20 });
    live.advanceTo(200);
    live.intervene({ type: 'add', species: 'carnivore', x: 28, y: 8 });
    live.advanceTo(500);
    live.intervene({ type: 'add', species: 'plant', x: 2, y: 2 });
    live.advanceTo(640);

    const hash = await encodeState({ seed: live.seed, params: live.params, tick: live.tick, log: live.appliedLog });
    expect(hash.startsWith(`v${CODEC_VERSION}.`)).toBe(true);
    expect(hash).toMatch(/^v\d+\.[A-Za-z0-9_-]+$/);

    const res = await decodeState('#' + hash);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.seed).toBe(4242);
    expect(res.state.params).toEqual(params);
    const replay = new Simulation(res.state.seed, res.state.params, res.state.log);
    replay.advanceTo(res.state.tick);
    expect(hashWorld(replay.world)).toBe(hashWorld(live.world));
  });

  it('keeps default-param URLs short', async () => {
    const hash = await encodeState({ seed: 4294967295, params: DEFAULT_PARAMS, tick: 123456, log: [] });
    expect(hash.length).toBeLessThan(48);
  });

  it('detects other versions and garbage', async () => {
    expect(await decodeState('')).toEqual({ ok: false, reason: 'empty' });
    expect(await decodeState('#v999.abc')).toMatchObject({ ok: false, reason: 'version', version: 999 });
    expect(await decodeState('#v2.@@@')).toMatchObject({ ok: false, reason: 'corrupt' });
    expect(await decodeState('#v2.zAAAA')).toMatchObject({ ok: false, reason: 'corrupt' });
    expect(await decodeState('#v2.jAAAA')).toMatchObject({ ok: false, reason: 'corrupt' });
  });
});
