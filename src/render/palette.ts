/** Shared visual palette (also used by the graph and legend). */
export const PALETTE = {
  bg: '#0e1613',
  panel: '#15201c',
  soilDry: [92, 76, 56] as const,
  soilWet: [44, 52, 44] as const,
  plantLow: [70, 112, 58] as const,
  plantHigh: [148, 196, 102] as const,
  water: [86, 164, 214] as const,
  herbivore: '#f3e3b8',
  carnivore: '#e8693c',
  plant: '#8dc26a',
  waterCss: '#56a4d6',
} as const;

export const SPECIES_COLORS = {
  plant: PALETTE.plant,
  herbivore: PALETTE.herbivore,
  carnivore: PALETTE.carnivore,
} as const;
