export type StudioTheme = 'obsidian' | 'spatial' | 'graphite' | 'nordic';

export interface ThemeMeta {
  id: StudioTheme;
  name: string;
  tagline: string;
  description: string;
  accentColor: string;
  badge: string;
  badgeClass: string;
  surfaceClass: string;
  previewColors: string[];
}

export const THEMES: Record<StudioTheme, ThemeMeta> = {
  obsidian: {
    id: 'obsidian',
    name: 'Obsidian Precision',
    tagline: 'Raycast / Linear Aesthetic',
    description: 'Deep smoked obsidian glass, 1px specular hairlines, tabular timecodes, and crimson accents.',
    accentColor: '#F43F5E',
    badge: 'Linear Pro',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    surfaceClass: 'bg-[#0B0C10]/95 border-white/10',
    previewColors: ['#0B0C10', '#161922', '#F43F5E', '#38BDF8'],
  },
  spatial: {
    id: 'spatial',
    name: 'Spatial Frosted Glass',
    tagline: 'VisionOS / CleanShot Aesthetic',
    description: 'Rounded-full specular capsules, circular tactile icon wells, luminescent iris glow, and dynamic blur.',
    accentColor: '#38BDF8',
    badge: 'VisionOS',
    badgeClass: 'bg-sky-400/20 text-sky-300 border-sky-400/30',
    surfaceClass: 'bg-slate-900/80 border-white/20 backdrop-blur-2xl',
    previewColors: ['#070913', '#1e293b', '#38BDF8', '#818CF8'],
  },
  graphite: {
    id: 'graphite',
    name: 'Broadcast Graphite Pro',
    tagline: 'DaVinci / Teenage Engineering',
    description: 'Machined anodized slate, physical push-keys, recessed OLED timecode, and safety orange tally lights.',
    accentColor: '#FF5500',
    badge: 'SMPTE Pro',
    badgeClass: 'bg-[#FF5500]/20 text-[#FF5500] border-[#FF5500]/40',
    surfaceClass: 'bg-[#121418] border-[#2D323C]',
    previewColors: ['#0B0C0E', '#1B1E24', '#FF5500', '#00E676'],
  },
  nordic: {
    id: 'nordic',
    name: 'Nordic Alabaster & Ink',
    tagline: 'Figma UI3 / Craft Minimalist',
    description: 'Ultra-crisp ceramic cards, deep slate ink active pills, high daylight contrast, and FigJam markup.',
    accentColor: '#2563EB',
    badge: 'Nordic Minimal',
    badgeClass: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    surfaceClass: 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800',
    previewColors: ['#FFFFFF', '#F1F5F9', '#0F172A', '#2563EB'],
  },
};

export const THEME_LIST = Object.values(THEMES);
export const DEFAULT_THEME: StudioTheme = 'obsidian';
export const STORAGE_KEY_THEME = 'studio_recorder_theme';
