// Hand-crafted level layouts for Vault Runner.
//
// Grid: 28 columns x 16 rows.
// Characters:
//   .  EMPTY (also ' ')
//   #  BRICK (diggable)
//   @  CONCRETE (indestructible)
//   H  LADDER
//   -  ROPE
//   $  GOLD
//   E  EXIT_LADDER spot in top row (revealed when all gold collected)
//   P  Player spawn (rendered as EMPTY)
//   G  Guard spawn (rendered as EMPTY)
//
// Bottom row (15) should be solid for the ground floor.
// Top row (0) is reserved for exit ladder reveals.

import {
  TileKind,
  GRID_COLS,
  GRID_ROWS,
  type ParsedLevel,
  type GridPos,
} from './types.js';
import { charToTile } from './tiles.js';

/* eslint-disable max-len */

export const LEVELS: string[][] = [
  // Level 1 — Tutorial: simple ladders, one guard, gold easily reachable.
  [
    'E..........................E',
    '............................',
    '............................',
    '......H..........H..........',
    '..$...H..........H...$......',
    '@@@@@@@@@@.......@@@@@@@@@@@',
    '..........H.................',
    '..........H..........$......',
    '..........H........@@@@@@@@@',
    '..........H...........H.....',
    '....$.....H...........H.....',
    '@@@@@@@@@@@@@@@@@@.....H....',
    '..........G............H....',
    '..............H........H....',
    '...P..........H.....$..H....',
    '############################',
  ],

  // Level 2 — Introduces ropes.
  [
    'E.........................E.',
    '............................',
    '......H...............H.....',
    '......H...------------H.....',
    '......H...............H.....',
    '..$...H...............H..$..',
    '@@@@@@@@@@@.......@@@@@@@@@@',
    '...........H.....H..........',
    '......-----H-----H----------',
    '...........H.....H..........',
    '...........@@@@@@@..........',
    '...G.....................G..',
    '..####....H...........H..#..',
    '..........H...$.......H.....',
    '..P..$....H...........H..$..',
    '############################',
  ],

  // Level 3 — Forced digging — gold buried in brick.
  [
    'E............E.............E',
    '............................',
    '..H.....................H...',
    '..H.....................H...',
    '..H............G........H...',
    '..H..@@@@@@@@@@@@@@@@@@.H...',
    '..H..$................$.H...',
    '..H..####@@@@@@@@@@####.H...',
    '..H........H........H...H...',
    '..H...$....H.--$----H...H...',
    '..H..@@@@@@@@@@@@@@@@@@@@@..',
    '..H.........................',
    '..H.....G......H............',
    '..H...........@@@..........$',
    '..P...$.......H........$....',
    '############################',
  ],

  // Level 4 — Multi-guard chase, vertical maze.
  [
    'E.....E....................E',
    '............................',
    '..H........H..........H.....',
    '..H........H...G......H..$..',
    '..H..$.....H..####@@..H..#..',
    '..H..#@@@@@@@@@@@@@@@.H.....',
    '..H..............$....H.....',
    '..H..####@@@@@@@@@##@@H.....',
    '..H........H..........H..$..',
    '..H........H..........H..#..',
    '..H..G.....H...$......H.....',
    '..H..@@@@@@@@@@@@@@@@@H.....',
    '..H...................H.....',
    '..H----------------H..H.....',
    '..P..G..$..........H..H..$..',
    '############################',
  ],

  // Level 5 — Final challenge: ropes + dig puzzles + 3 guards.
  [
    'E.E.E....................EEE',
    '............................',
    '..H...---------------H......',
    '..H..............H...H..$...',
    '..H..H...........H...H..#...',
    '..H..H..G..H.....H...H......',
    '..H..H..#@@H@@@@@@...H......',
    '..H..H.....H.........H..$..G',
    '..H..@@@@@@@@@@@@@@@@@@@@@@@',
    '..H..............H..........',
    '..H..--------H---H----------',
    '..H..........H..............',
    '..H..$..G....H........$.....',
    '..H..####@@@@@@@@@@#########',
    '..P..................$..G...',
    '############################',
  ],
];

export interface LevelValidation {
  ok: boolean;
  errors: string[];
}

/**
 * Parse a level array of strings into grid + spawn data.
 * Pads short rows with EMPTY and clips long rows to GRID_COLS.
 */
export function parseLevel(rows: string[]): ParsedLevel {
  const grid: TileKind[][] = [];
  let playerSpawn: GridPos | null = null;
  const guardSpawns: GridPos[] = [];
  const exitColumns: number[] = [];
  let goldCount = 0;

  for (let row = 0; row < GRID_ROWS; row++) {
    const src = rows[row] ?? '';
    const out: TileKind[] = [];
    for (let col = 0; col < GRID_COLS; col++) {
      const ch = src[col] ?? '.';
      const kind = charToTile(ch);
      if (kind === null) {
        // unknown char — treat as empty, validator will flag
        out.push(TileKind.EMPTY);
        continue;
      }

      if (ch === 'P') {
        playerSpawn = { col, row };
      } else if (ch === 'G') {
        guardSpawns.push({ col, row });
      } else if (ch === '$') {
        goldCount++;
      } else if (ch === 'E' && row === 0) {
        exitColumns.push(col);
      }

      out.push(kind);
    }
    grid.push(out);
  }

  return {
    grid,
    playerSpawn: playerSpawn ?? { col: 0, row: GRID_ROWS - 2 },
    guardSpawns,
    goldCount,
    exitColumns,
  };
}

/**
 * Validate a parsed level. Catches obvious authoring mistakes:
 *   - exactly one player spawn
 *   - at least one gold
 *   - guard spawns reasonable
 *   - exit columns exist (at least one E in row 0)
 *   - bottom row is fully solid (player can't fall off the world)
 *   - no unknown characters in source rows
 */
export function validateLevel(rows: string[], parsed: ParsedLevel): LevelValidation {
  const errors: string[] = [];

  // Char check
  for (let r = 0; r < rows.length; r++) {
    const line = rows[r];
    for (let c = 0; c < line.length; c++) {
      if (charToTile(line[c]) === null) {
        errors.push(`row ${r} col ${c}: unknown char '${line[c]}'`);
      }
    }
    if (line.length !== GRID_COLS) {
      errors.push(`row ${r}: width ${line.length} != ${GRID_COLS}`);
    }
  }

  // Row count
  if (rows.length !== GRID_ROWS) {
    errors.push(`row count ${rows.length} != ${GRID_ROWS}`);
  }

  // Player spawn count
  let playerCount = 0;
  for (const line of rows) for (const ch of line) if (ch === 'P') playerCount++;
  if (playerCount !== 1) errors.push(`player spawn count: ${playerCount} (expected 1)`);

  // Gold check
  if (parsed.goldCount === 0) errors.push('no gold in level');

  // Exit check
  if (parsed.exitColumns.length === 0) errors.push('no exit ladder (E) in level');

  // Exit columns must be in top row only
  for (const col of parsed.exitColumns) {
    if (parsed.grid[0][col] !== TileKind.EXIT_LADDER) {
      errors.push(`exit at col ${col} should be in row 0`);
    }
  }

  // Bottom row must be solid (no infinite falling off level)
  for (let col = 0; col < GRID_COLS; col++) {
    const t = parsed.grid[GRID_ROWS - 1][col];
    if (t !== TileKind.BRICK && t !== TileKind.CONCRETE) {
      errors.push(`bottom row col ${col} not solid (kind=${t})`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/** Validate all built-in levels. Used in tests and at scene init. */
export function validateAllLevels(): LevelValidation {
  const errors: string[] = [];
  for (let i = 0; i < LEVELS.length; i++) {
    const parsed = parseLevel(LEVELS[i]);
    const v = validateLevel(LEVELS[i], parsed);
    if (!v.ok) {
      for (const e of v.errors) errors.push(`Level ${i + 1}: ${e}`);
    }
  }
  return { ok: errors.length === 0, errors };
}
