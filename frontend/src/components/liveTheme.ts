// Kahoot-style answer palette: four colours with distinct shapes so options are
// recognisable at a glance on both the host's big screen and the player's phone.
export interface TileTheme {
  bg: string;     // solid tile background
  ring: string;   // focus/selected ring colour
  shape: string;  // glyph shown next to the answer
}

export const TILE_THEMES: TileTheme[] = [
  { bg: 'bg-rose-500',    ring: 'ring-rose-300',    shape: '▲' },
  { bg: 'bg-sky-500',     ring: 'ring-sky-300',     shape: '◆' },
  { bg: 'bg-amber-500',   ring: 'ring-amber-300',   shape: '●' },
  { bg: 'bg-emerald-500', ring: 'ring-emerald-300', shape: '■' },
  { bg: 'bg-violet-500',  ring: 'ring-violet-300',  shape: '★' },
  { bg: 'bg-fuchsia-500', ring: 'ring-fuchsia-300', shape: '⬟' },
];

export function tileTheme(index: number): TileTheme {
  return TILE_THEMES[index % TILE_THEMES.length];
}

// secondsLeft converts a server deadline (unix ms) into whole seconds remaining.
export function secondsLeft(deadlineUnixMs: number | undefined): number {
  if (!deadlineUnixMs) return 0;
  return Math.max(0, Math.ceil((deadlineUnixMs - Date.now()) / 1000));
}
