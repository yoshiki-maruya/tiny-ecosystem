import { DEFAULT_PARAMS, diffParams, mergeParams, type SimParams } from '../core/params';
import type { AddTarget, Intervention } from '../core/interventions';

/**
 * URL hash format:  #v<VERSION>.<mode><base64url(bytes)>
 *   mode 'z': bytes = deflate-raw(JSON)   (used when it is shorter)
 *   mode 'j': bytes = UTF-8 JSON          (tiny payloads, where deflate only adds overhead)
 *
 * JSON payload (all keys short to keep URLs small):
 *   s: seed (uint32)
 *   p: params diff vs DEFAULT_PARAMS of that version (omitted if empty)
 *   t: tick to fast-forward to
 *   l: intervention log, [[tick, code, x, y], ...]  code: r=rain, h/c/p=add herbivore/carnivore/plant
 *
 * Bump CODEC_VERSION whenever simulation rules or DEFAULT_PARAMS change in a
 * way that alters outcomes; old links are then detected instead of silently
 * replaying a different history.
 */
export const CODEC_VERSION = 2;

export interface SharedState {
  seed: number;
  params: SimParams;
  tick: number;
  log: Intervention[];
}

export type DecodeResult =
  | { ok: true; state: SharedState }
  | { ok: false; reason: 'empty' | 'version' | 'corrupt'; version?: number };

type LogTuple = [number, string, number, number];

const ADD_CODES: Record<string, AddTarget> = { h: 'herbivore', c: 'carnivore', p: 'plant' };
const ADD_CODE_OF: Record<AddTarget, string> = { herbivore: 'h', carnivore: 'c', plant: 'p' };

export function toPayload(state: SharedState): Record<string, unknown> {
  const payload: Record<string, unknown> = { s: state.seed >>> 0, t: state.tick };
  const p = diffParams(DEFAULT_PARAMS, state.params);
  if (Object.keys(p).length) payload.p = p;
  if (state.log.length) {
    payload.l = state.log.map((iv): LogTuple => [iv.tick, iv.type === 'rain' ? 'r' : ADD_CODE_OF[iv.species], iv.x, iv.y]);
  }
  return payload;
}

export function fromPayload(payload: unknown): SharedState | null {
  if (!payload || typeof payload !== 'object') return null;
  const o = payload as Record<string, unknown>;
  if (typeof o.s !== 'number' || !Number.isFinite(o.s)) return null;
  const tick = typeof o.t === 'number' && Number.isFinite(o.t) ? Math.max(0, Math.floor(o.t)) : 0;
  const log: Intervention[] = [];
  if (Array.isArray(o.l)) {
    for (const e of o.l) {
      if (!Array.isArray(e) || e.length < 4) return null;
      const [t, code, x, y] = e as LogTuple;
      if (![t, x, y].every((n) => typeof n === 'number' && Number.isInteger(n))) return null;
      if (code === 'r') log.push({ tick: t, type: 'rain', x, y });
      else if (code in ADD_CODES) log.push({ tick: t, type: 'add', species: ADD_CODES[code], x, y });
      else return null;
    }
  }
  return { seed: o.s >>> 0, params: mergeParams(DEFAULT_PARAMS, o.p), tick, log };
}

export async function encodeState(state: SharedState): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(toPayload(state)));
  const z = await deflate(raw);
  return z.length < raw.length ? `v${CODEC_VERSION}.z${toBase64Url(z)}` : `v${CODEC_VERSION}.j${toBase64Url(raw)}`;
}

export async function decodeState(hash: string): Promise<DecodeResult> {
  const h = hash.replace(/^#/, '').trim();
  if (!h) return { ok: false, reason: 'empty' };
  const m = /^v(\d+)\.([zj])([A-Za-z0-9_-]+)$/.exec(h);
  if (!m) {
    const vm = /^v(\d+)\./.exec(h);
    if (vm && Number(vm[1]) !== CODEC_VERSION) return { ok: false, reason: 'version', version: Number(vm[1]) };
    return { ok: false, reason: 'corrupt' };
  }
  const version = Number(m[1]);
  if (version !== CODEC_VERSION) return { ok: false, reason: 'version', version };
  try {
    const bytes = fromBase64Url(m[3]);
    const json = new TextDecoder().decode(m[2] === 'z' ? await inflate(bytes) : bytes);
    const state = fromPayload(JSON.parse(json));
    return state ? { ok: true, state } : { ok: false, reason: 'corrupt' };
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

const deflate = (b: Uint8Array) => pipe(b, new CompressionStream('deflate-raw'));
const inflate = (b: Uint8Array) => pipe(b, new DecompressionStream('deflate-raw'));

export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
