// Design tokens extracted from src/components/**/*.tsx and src/index.css.
//
// This file only CENTRALIZES the values that already exist in the codebase —
// nothing has been rewired to use it yet, so there is no visual change.
//
// IMPORTANT constraint for any future refactor: Tailwind v4 scans source
// files for literal class-name strings at build time. Arbitrary-value
// classes like `bg-[#e2ff00]` or `text-[10px]` MUST stay as static string
// literals in `className` — interpolating a value from this file into a
// className (e.g. `` `bg-[${COLORS.accent}]` ``) will NOT be picked up by
// Tailwind's scanner and will silently break the visual. These constants are
// safe to use in `style={{ ... }}` (inline styles, already used in ~150
// places across components) and in plain JS/TS logic (chart colors, canvas,
// SVG, etc). Wiring the Tailwind classes themselves to these tokens would
// require moving them into the `@theme` block in src/index.css instead.

// ── Typography ──────────────────────────────────────────────────────────
// Mirrors the --font-sans / --font-mono custom properties defined in the
// @theme block of src/index.css.
export const FONT_FAMILIES = {
  sans: '"Inter", ui-sans-serif, system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
} as const;

// Every arbitrary text-[Npx] size found in src/components, smallest first.
export const FONT_SIZES = {
  xxs: '7px',
  xs: '8px',
  sm: '9px',
  base: '10px',
  md: '11px',
  lg: '12px',
  xl: '14px',
} as const;

// ── Spacing ─────────────────────────────────────────────────────────────
// Arbitrary pixel width/height values used across components (cards, modals,
// fixed-size icons/avatars, sticky headers, chart containers, etc).
export const SPACING = {
  px1: '1px',
  px16: '16px',
  px36: '36px',
  px40: '40px',
  px42: '42px',
  px44: '44px',
  px48: '48px',
  px60: '60px',
  px65: '65px',
  px75: '75px',
  px80: '80px',
  px100: '100px',
  px110: '110px',
  px120: '120px',
  px130: '130px',
  px140: '140px',
  px175: '175px',
  px200: '200px',
  px220: '220px',
  px240: '240px',
  px250: '250px',
  px260: '260px',
  px280: '280px',
  px300: '300px',
  px320: '320px',
  px360: '360px',
  px400: '400px',
  px420: '420px',
  px450: '450px',
  px480: '480px',
  px700: '700px',
  px760: '760px',
} as const;

// ── Colors ──────────────────────────────────────────────────────────────
// Backgrounds, from darkest to lightest, ordered by how they're used
// (page/app background → card background → raised/hover surface).
export const COLORS = {
  background: {
    base: '#0e0e0e',
    surface: '#111111',
    surfaceAlt: '#111',
    card: '#121212',
    cardAlt: '#121414',
    panel: '#131313',
    panelAlt: '#141414',
    raised: '#161616',
    raisedAlt: '#171717',
    input: '#181818',
    inputAlt: '#181a18',
    hover: '#191919',
    hoverAlt: '#1a1a1a',
    hoverAlt2: '#1a1c12',
    hoverAlt3: '#1a1c1c',
    hoverAlt4: '#1a1e20',
    hoverAlt5: '#1a1710',
    elevated: '#1b1c1c',
    elevatedAlt: '#1c1b1b',
    active: '#1e1e1a',
    activeAlt: '#1e1e1e',
    warm: '#201f1f',
    coolDark: '#202020',
    coolDarker: '#252525',
    coolDarkest: '#252511',
    darkGray: '#282a2b',
    black: '#000',
    white: '#fff',
    whiteAlt: '#ffffff',
  },

  border: {
    default: '#2a2a2a',
    defaultAlt: '#2c2b2b',
    strong: '#3a3a3a',
    strongAlt: '#3e3e3e',
    subtle: '#c5c6c5',
  },

  text: {
    muted: '#c6c9ab',
    dim: '#555',
    dimmer: '#444',
    dimmest: '#333',
    faint: '#888',
    faintAlt: '#222',
    light: '#e2e2e1',
    lightAlt: '#e5e2e1',
  },

  // Brand / accent colors.
  accent: {
    volt: '#fbcb1a',        // primary CTA / highlight color across the app (rebrand: oro)
    voltHover: '#d4a800',   // hover/active state of volt
    voltDim: '#cde600',
    voltFaint: '#f7ff80',
    cyan: '#00eefc',        // secondary accent (used for "linked athlete" tags, charts)
    cyanAlt: '#00d4e0',
    cyanDeep: '#0cbcce',
    cyanPale: '#b3f6ff',
    cyanPaleAlt: '#67e8f9',
    cyanPaleAlt2: '#93c5fd',
  },

  // Status / semantic colors (success, warning, danger, info) collected
  // from usage across ReviewsScreen, DietAutoGenerator, badges, charts, etc.
  status: {
    successLight: '#86efac',
    success: '#8ac926',
    successDeep: '#06d6a0',
    successDeepAlt: '#43aa8b',
    warning: '#ffa500',
    warningAlt: '#fb923c',
    warningLight: '#fdba74',
    warningStrong: '#f8961e',
    warningDeep: '#fb5607',
    danger: '#ff6b6b',
    dangerLight: '#fca5a5',
    dangerAlt: '#ff5e78',
    dangerDeep: '#f72585',
    coral: '#ff8c69',
    info: '#3a86ff',
  },

  // Extra chart/series/tag colors seen in load-tracking and correlation
  // panels (METRIC_COLOR-style palettes).
  chart: {
    purple: '#a78bfa',
    purpleDeep: '#9d4edd',
    pink: '#f472b6',
    amber: '#ffbe0b',
  },
} as const;

// ── Glow / shadow utilities ────────────────────────────────────────────
// Mirrors the .volt-glow / .cyan-glow utility classes defined in
// src/index.css, plus the rgba() shadow/overlay values used inline.
export const GLOWS = {
  voltGlow: '0 0 12px 2px rgba(226, 255, 0, 0.2)',
  cyanGlow: '0 0 12px 2px rgba(0, 238, 252, 0.2)',
} as const;

export const OVERLAYS = {
  blackFaint: 'rgba(0,0,0,0.25)',
  blackSoft: 'rgba(0,0,0,0.4)',
  blackMedium: 'rgba(0,0,0,0.5)',
  whiteFaint: 'rgba(255,255,255,0.04)',
  voltFaint: 'rgba(226,255,0,0.05)',
  voltSoft: 'rgba(226,255,0,0.1)',
  voltMedium: 'rgba(226,255,0,0.2)',
  voltMedium2: 'rgba(226,255,0,0.25)',
  voltStrong: 'rgba(226,255,0,0.3)',
  cyanMedium: 'rgba(0,238,252,0.2)',
  cyanStrong: 'rgba(0,238,252,0.3)',
  successFaint: 'rgba(34,197,94,.12)',
  successMedium: 'rgba(34,197,94,.4)',
  warningFaint: 'rgba(249,115,22,.12)',
  warningMedium: 'rgba(249,115,22,.4)',
} as const;
