/**
 * Hand-drawn (path-based) sprites, rendered once per size into offscreen
 * canvases and then blitted. Sizes are in device pixels.
 */

export type AnimalKind = 'herbivore' | 'carnivore';

const cache = new Map<string, HTMLCanvasElement>();

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return [c, c.getContext('2d')!];
}

/**
 * Animal sprite facing right, drawn in a box of `size`×`size` device pixels
 * with the body centred. `facing` -1 mirrors it.
 */
export function animalSprite(kind: AnimalKind, size: number, facing: number, tint: 'normal' | 'ghost' = 'normal'): HTMLCanvasElement {
  const s = Math.max(6, Math.round(size));
  const key = `${kind}:${s}:${facing}:${tint}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = canvas(s, s);
  g.translate(s / 2, s / 2);
  if (facing < 0) g.scale(-1, 1);
  g.scale(s, s); // draw in unit coordinates, body roughly within [-0.5, 0.5]
  g.lineJoin = 'round';
  g.lineWidth = 0.035;
  const outline = 'rgba(20, 24, 20, 0.85)';
  const ghost = tint === 'ghost';

  if (kind === 'herbivore') {
    const fur = ghost ? '#c9cfc9' : '#f1e2bf';
    const shade = ghost ? '#a9b0a9' : '#d9c79c';
    // Ears (behind head)
    for (const [ex, rot] of [[0.2, -0.25], [0.29, 0.05]] as const) {
      g.save();
      g.translate(ex, -0.2);
      g.rotate(rot);
      g.beginPath();
      g.ellipse(0, -0.11, 0.055, 0.15, 0, 0, Math.PI * 2);
      g.fillStyle = fur;
      g.fill();
      g.strokeStyle = outline;
      g.stroke();
      g.beginPath();
      g.ellipse(0, -0.11, 0.022, 0.1, 0, 0, Math.PI * 2);
      g.fillStyle = ghost ? '#b8bdb8' : '#e8b7a6';
      g.fill();
      g.restore();
    }
    // Tail
    g.beginPath();
    g.arc(-0.31, 0.04, 0.08, 0, Math.PI * 2);
    g.fillStyle = ghost ? '#dde2dd' : '#fffaf0';
    g.fill();
    g.strokeStyle = outline;
    g.stroke();
    // Body
    g.beginPath();
    g.ellipse(-0.04, 0.1, 0.29, 0.21, 0, 0, Math.PI * 2);
    g.fillStyle = fur;
    g.fill();
    g.strokeStyle = outline;
    g.stroke();
    // Haunch shading
    g.beginPath();
    g.ellipse(-0.12, 0.14, 0.13, 0.11, 0, 0, Math.PI * 2);
    g.fillStyle = shade;
    g.fill();
    // Head
    g.beginPath();
    g.arc(0.24, -0.03, 0.14, 0, Math.PI * 2);
    g.fillStyle = fur;
    g.fill();
    g.strokeStyle = outline;
    g.stroke();
    // Eye + nose
    g.beginPath();
    g.arc(0.29, -0.06, 0.03, 0, Math.PI * 2);
    g.fillStyle = '#1d1a16';
    g.fill();
    g.beginPath();
    g.arc(0.375, 0.0, 0.022, 0, Math.PI * 2);
    g.fillStyle = ghost ? '#9aa09a' : '#c98576';
    g.fill();
  } else {
    const fur = ghost ? '#b9bfb9' : '#df6a35';
    const dark = ghost ? '#8d948d' : '#a8461f';
    const cream = ghost ? '#dde2dd' : '#fbefe0';
    // Tail
    g.beginPath();
    g.moveTo(-0.22, 0.04);
    g.quadraticCurveTo(-0.5, -0.02, -0.48, 0.2);
    g.quadraticCurveTo(-0.36, 0.2, -0.2, 0.14);
    g.closePath();
    g.fillStyle = fur;
    g.fill();
    g.strokeStyle = outline;
    g.stroke();
    g.beginPath();
    g.moveTo(-0.44, 0.08);
    g.quadraticCurveTo(-0.52, 0.12, -0.48, 0.2);
    g.quadraticCurveTo(-0.42, 0.2, -0.38, 0.18);
    g.closePath();
    g.fillStyle = cream;
    g.fill();
    // Legs
    g.fillStyle = dark;
    for (const lx of [-0.14, 0.12]) {
      g.beginPath();
      g.roundRect(lx - 0.035, 0.12, 0.07, 0.17, 0.03);
      g.fill();
    }
    // Body
    g.beginPath();
    g.ellipse(-0.01, 0.07, 0.27, 0.15, 0, 0, Math.PI * 2);
    g.fillStyle = fur;
    g.fill();
    g.strokeStyle = outline;
    g.stroke();
    // Ears
    for (const ex of [0.18, 0.3]) {
      g.beginPath();
      g.moveTo(ex - 0.06, -0.12);
      g.lineTo(ex, -0.3);
      g.lineTo(ex + 0.06, -0.11);
      g.closePath();
      g.fillStyle = dark;
      g.fill();
      g.strokeStyle = outline;
      g.stroke();
    }
    // Head with pointed snout
    g.beginPath();
    g.moveTo(0.12, -0.12);
    g.quadraticCurveTo(0.3, -0.2, 0.36, -0.06);
    g.lineTo(0.5, 0.0);
    g.quadraticCurveTo(0.36, 0.08, 0.16, 0.06);
    g.closePath();
    g.fillStyle = fur;
    g.fill();
    g.strokeStyle = outline;
    g.stroke();
    // Cheek
    g.beginPath();
    g.moveTo(0.22, 0.02);
    g.quadraticCurveTo(0.38, 0.06, 0.49, 0.0);
    g.quadraticCurveTo(0.38, 0.09, 0.2, 0.06);
    g.closePath();
    g.fillStyle = cream;
    g.fill();
    // Eye + nose
    g.beginPath();
    g.arc(0.29, -0.07, 0.026, 0, Math.PI * 2);
    g.fillStyle = '#1d1a16';
    g.fill();
    g.beginPath();
    g.arc(0.5, 0.0, 0.025, 0, Math.PI * 2);
    g.fill();
  }
  cache.set(key, c);
  return c;
}

/**
 * Plant sprite for a biomass level (1..levels): a clump of leaves that grows
 * fuller and lighter with biomass. `variant` picks one of a few shapes.
 */
export function plantSprite(level: number, levels: number, cell: number, variant: number): HTMLCanvasElement {
  const s = Math.max(4, Math.round(cell));
  const key = `plant:${level}:${levels}:${s}:${variant}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = canvas(s, s);
  const t = level / levels;
  g.translate(s / 2, s / 2);
  g.scale(s, s);
  // Leaf blobs arranged around the centre; more appear as the plant grows.
  const layout = VARIANTS[variant % VARIANTS.length];
  const n = Math.max(1, Math.round(1 + t * (layout.length - 1)));
  const r = 0.1 + 0.2 * Math.sqrt(t);
  const base = mix([56, 94, 50], [92, 150, 70], t);
  const light = mix([84, 128, 64], [158, 205, 112], t);
  for (let i = 0; i < n; i++) {
    const [lx, ly, k] = layout[i];
    const rr = r * k;
    g.beginPath();
    g.arc(lx * (0.25 + 0.6 * t), ly * (0.25 + 0.6 * t), rr, 0, Math.PI * 2);
    g.fillStyle = base;
    g.fill();
  }
  for (let i = 0; i < n; i++) {
    const [lx, ly, k] = layout[i];
    const rr = r * k * 0.62;
    g.beginPath();
    g.arc(lx * (0.25 + 0.6 * t) - rr * 0.25, ly * (0.25 + 0.6 * t) - rr * 0.3, rr, 0, Math.PI * 2);
    g.fillStyle = light;
    g.fill();
  }
  cache.set(key, c);
  return c;
}

/** Tiny sprout for grazed-down cells (roots left behind). */
export function sproutSprite(cell: number): HTMLCanvasElement {
  const s = Math.max(4, Math.round(cell));
  const key = `sprout:${s}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = canvas(s, s);
  g.translate(s / 2, s / 2);
  g.scale(s, s);
  g.strokeStyle = 'rgb(96, 128, 70)';
  g.lineWidth = 0.05;
  g.lineCap = 'round';
  for (const [dx, a] of [[-0.06, -0.5], [0.0, 0], [0.06, 0.5]] as const) {
    g.beginPath();
    g.moveTo(dx, 0.1);
    g.quadraticCurveTo(dx + a * 0.05, -0.02, dx + a * 0.14, -0.1);
    g.stroke();
  }
  cache.set(key, c);
  return c;
}

const VARIANTS: [number, number, number][][] = [
  [[0, 0, 1], [-0.3, 0.12, 0.85], [0.3, 0.1, 0.85], [0.05, -0.3, 0.8], [-0.2, -0.22, 0.7], [0.25, -0.2, 0.7], [0, 0.32, 0.75]],
  [[0, 0, 1], [0.28, -0.12, 0.85], [-0.26, -0.1, 0.85], [-0.1, 0.3, 0.8], [0.22, 0.24, 0.7], [-0.32, 0.22, 0.65], [0.05, -0.34, 0.7]],
  [[0, 0, 1], [-0.12, -0.3, 0.85], [0.3, 0.05, 0.85], [-0.3, 0.1, 0.8], [0.18, 0.3, 0.7], [0.3, -0.26, 0.65], [-0.2, 0.32, 0.65]],
];

function mix(a: readonly number[], b: readonly number[], t: number): string {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)}, ${Math.round(a[1] + (b[1] - a[1]) * t)}, ${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}
