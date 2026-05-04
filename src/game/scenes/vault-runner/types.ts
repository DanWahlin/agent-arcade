// Shared types for Vault Runner subsystems.

export const GRID_COLS = 28;
export const GRID_ROWS = 16;

export const enum TileKind {
  EMPTY = 0,
  BRICK = 1,        // diggable solid floor / wall
  CONCRETE = 2,     // indestructible solid
  LADDER = 3,
  ROPE = 4,
  GOLD = 5,
  EXIT_LADDER = 6,  // hidden until all gold collected
  HOLE = 7,         // dug-out brick (transient)
}

export interface GridPos { col: number; row: number }

export interface ParsedLevel {
  /** [row][col] tile kind */
  grid: TileKind[][];
  playerSpawn: GridPos;
  guardSpawns: GridPos[];
  goldCount: number;
  /** Columns in the top row that should reveal exit ladders after all gold collected. */
  exitColumns: number[];
}

export interface PlayerState {
  col: number;
  row: number;
  /** Sub-tile offset in pixels, -tileSize/2 .. +tileSize/2 */
  ox: number;
  oy: number;
  facing: 1 | -1;
  /** ms of post-respawn invincibility remaining */
  invincible: number;
  alive: boolean;
}

export const enum GuardState {
  CHASING = 0,
  TRAPPED = 1, // stuck in hole
  FALLING_TO_RESPAWN = 2,
}

export interface GuardEntity {
  col: number;
  row: number;
  ox: number;
  oy: number;
  state: GuardState;
  /** Cooldown for next AI tick (ms) */
  aiCooldown: number;
  /** Movement cooldown to avoid running too fast (ms) */
  moveCooldown: number;
  /** ms remaining if trapped before regen kills it. */
  trappedTimer: number;
  /** spawn tile index in original guardSpawns array */
  spawnIdx: number;
  /** Phaser display object (set by scene) */
  sprite: any;
}

export const enum HoleStage {
  DIGGING = 0,
  OPEN = 1,
  WARNING = 2,
  REGEN = 3,
}

export interface HoleEntity {
  col: number;
  row: number;
  stage: HoleStage;
  /** ms remaining in current stage */
  timer: number;
  /** Phaser display object for the hole graphic */
  gfx?: any;
}
