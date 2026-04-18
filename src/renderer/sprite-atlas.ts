// Sprite atlas for assets/enemies.png (702x252).
// All 6 color rows have identical sprite layouts.
// Each row top is offset by ROW_DY = 36 from the previous row.
// Coordinates were derived empirically by extracting and visually identifying
// each sprite (see /tmp/green/* generated during analysis).

export type EnemyColor = 'brown' | 'purple' | 'silver' | 'green' | 'red' | 'yellow';

export interface SpriteCut {
  /** Absolute x in the sheet (same for every color row). */
  readonly x: number;
  /** Y offset relative to the row's top: absoluteY = ROW_BASE_Y[color] + dy. */
  readonly dy: number;
  readonly w: number;
  readonly h: number;
}

export const ROW_DY = 36;

export const ROW_BASE_Y: Readonly<Record<EnemyColor, number>> = {
  brown:  11,
  purple: 47,
  silver: 83,
  green:  119,
  red:    155,
  yellow: 191,
};

export const ENEMY_CUTS = {
  goomba_0:       { x:   0, dy:  8, w: 19, h: 17 },
  goomba_1:       { x:  19, dy:  8, w: 18, h: 17 },
  goomba_flat:    { x:  37, dy: 16, w: 17, h:  9 },
  koopa_0:        { x:  54, dy:  1, w: 19, h: 24 },
  koopa_1:        { x: 109, dy:  0, w: 18, h: 25 },
  koopa_shell_0:  { x: 127, dy:  9, w: 18, h: 16 },
  koopa_shell_1:  { x: 145, dy:  9, w: 17, h: 16 },
  piranha_open:   { x: 162, dy:  1, w: 19, h: 24 },
  piranha_closed: { x: 198, dy:  1, w: 19, h: 24 },
} as const satisfies Record<string, SpriteCut>;

export type EnemyCutName = keyof typeof ENEMY_CUTS;

export const ENEMY_COLORS: readonly EnemyColor[] =
  ['brown', 'purple', 'silver', 'green', 'red', 'yellow'] as const;

/** Compute the absolute (x, y, w, h) for a named sprite in a given color row. */
export function getCut(color: EnemyColor, name: EnemyCutName): { x: number; y: number; w: number; h: number } {
  const c = ENEMY_CUTS[name];
  return { x: c.x, y: ROW_BASE_Y[color] + c.dy, w: c.w, h: c.h };
}

/** Phaser TextureManager key for a (color, sprite) pair, e.g. "green_koopa_0". */
export function texKey(color: EnemyColor, name: EnemyCutName): string {
  return `${color}_${name}`;
}
