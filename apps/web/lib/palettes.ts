// Curated three-color palettes shared between the org wizard and Branding
// settings. Each has a dominant "primary" (deep, for text / buttons), a muted
// "secondary", and a vivid "accent".
export interface Palette {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
}

export const PALETTES: Palette[] = [
  { id: 'paper',    name: 'Paper',    primary: '#1a1714', secondary: '#8b8376', accent: '#b0573d' },
  { id: 'harbor',   name: 'Harbor',   primary: '#1a2430', secondary: '#5b6a7d', accent: '#3d6891' },
  { id: 'fern',     name: 'Fern',     primary: '#1f2a22', secondary: '#6b7c6f', accent: '#4f8c63' },
  { id: 'bloom',    name: 'Bloom',    primary: '#2b1a22', secondary: '#8a6a75', accent: '#da4599' },
  { id: 'marigold', name: 'Marigold', primary: '#2a2117', secondary: '#8a7a5c', accent: '#c89419' },
  { id: 'amethyst', name: 'Amethyst', primary: '#24202d', secondary: '#7a6d89', accent: '#7b5ea7' },
  { id: 'ember',    name: 'Ember',    primary: '#23130e', secondary: '#8c5d4b', accent: '#c94a22' },
  { id: 'graphite', name: 'Graphite', primary: '#141414', secondary: '#6e6e6e', accent: '#2a6fd8' },
];

export const DEFAULT_ACCENT = '#b0573d';
