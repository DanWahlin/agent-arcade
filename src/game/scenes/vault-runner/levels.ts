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
//   E  EXIT_LADDER (top row only — revealed when all gold collected)
//   P  Player spawn (rendered as EMPTY)
//   G  Guard spawn (rendered as EMPTY)
//
// Topology rules (classic Lode Runner):
//   - Bottom row (15) is fully solid for the floor.
//   - Ladders extend through platforms so the runner can climb past them.
//   - Where a ladder ends and a platform begins, the ladder TOP must be at the
//     same row as the platform TOP — i.e. you stand at row N, your feet
//     supported by either ladder rungs or the platform tile at row N+1.

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
  // ──────────────────────────────────────────────────────────────────────
  // LEVEL 1 — Tutorial: a single ladder + flat platforms.
  // Player starts on ground floor. Ladder at col 13 connects ground (row 14)
  // to upper platform at row 9 to row 14. Gold is on multiple levels.
  // ──────────────────────────────────────────────────────────────────────
  [
    'E..........................E',  // 0  exit (top row)
    '............................',  // 1
    '............................',  // 2
    '............................',  // 3
    '............................',  // 4
    '............................',  // 5
    '...$.........H..........$...',  // 6  gold + ladder
    '###########H#H##############',  // 7  brick platform with ladder hole at 13
    '...........H.H..............',  // 8
    '...........H.H..............',  // 9
    '...$.......H.H........$.....',  // 10 gold
    '###########H#H##############',  // 11 platform
    '...........H.H..............',  // 12
    '..........GH.H..G...........',  // 13 guard spawns
    '...P.......H.H........$.....',  // 14 player + gold (ground)
    '############################',  // 15 solid floor
  ],

  // ──────────────────────────────────────────────────────────────────────
  // LEVEL 2 — Add a rope. Ladders flank the rope; player traverses laterally.
  // ──────────────────────────────────────────────────────────────────────
  [
    'E..........................E',  // 0
    '............................',  // 1
    '............................',  // 2
    '............................',  // 3
    '......H..............H......',  // 4
    '......H..------------H......',  // 5  rope between two ladders
    '..$...H..............H..$...',  // 6  gold flanking
    '##H###H##############H###H##',  // 7  platform with 4 ladder holes
    '..H...H..............H...H..',  // 8
    '..H...H..............H...H..',  // 9
    '..H.$.H..............H.$.H..',  // 10
    '##H###H#######G######H###H##',  // 11 platform with guard area above
    '..H...H..............H...H..',  // 12
    '..H...H..G...........H...H..',  // 13 guard spawn
    '..P...H..........$...H......',  // 14 player + gold
    '############################',  // 15
  ],

  // ──────────────────────────────────────────────────────────────────────
  // LEVEL 3 — Forced digging. Gold is buried; player must dig through brick.
  // ──────────────────────────────────────────────────────────────────────
  [
    'E............E.............E',  // 0
    '............................',  // 1
    '............................',  // 2
    '..H...................H.....',  // 3
    '..H...................H.....',  // 3a (was 4)
    '##H###################H#####',  // 5  platform
    '..H...................H.....',  // 6
    '..H...$........$......H.....',  // 7  buried gold (dig from above)
    '##H###################H#####',  // 8  platform — gold is below this row
    '..H...................H.....',  // 9
    '..H..G...............G H....',  // 10 guards above
    '##H###################H#####',  // 11 platform
    '..H........$..........H.....',  // 12
    '..H...................H.....',  // 13
    '..P...$...........$...H..$..',  // 14 player + gold
    '############################',  // 15
  ],

  // ──────────────────────────────────────────────────────────────────────
  // LEVEL 4 — Multi-guard chase. Two ladders + rope create a chase loop.
  // ──────────────────────────────────────────────────────────────────────
  [
    'E.....E....................E',  // 0
    '............................',  // 1
    '............................',  // 2
    '..H........H..............H.',  // 3
    '..H........H------..------H.',  // 4  two ropes
    '..H........H..............H.',  // 5
    '##H########H##############H#',  // 6
    '..H........H..............H.',  // 7
    '..H..$.....H........G.....H.',  // 8  gold + guard
    '##H########H##############H#',  // 9
    '..H........H..............H.',  // 10
    '..H........H........$.....H.',  // 11
    '##H########H##############H#',  // 12
    '..H...G....H..............H.',  // 13 guard
    '..P..$.....H...$......G$..H.',  // 14 player + gold
    '############################',  // 15
  ],

  // ──────────────────────────────────────────────────────────────────────
  // LEVEL 5 — Final challenge: tall layout with multiple ladders, ropes,
  // 3 guards, gold spread across all levels.
  // ──────────────────────────────────────────────────────────────────────
  [
    'E.E.E....................EEE',  // 0
    '............................',  // 1
    '..H...........H............H',  // 2
    '..H----------H...---------H.',  // 3  rope segments
    '..H...........H............H',  // 4
    '##H###########H############H',  // 5
    '..H...........H............H',  // 6
    '..H..G........H........G...H',  // 7
    '##H###########H############H',  // 8
    '..H...........H............H',  // 9
    '..H...$.......H.....$......H',  // 10
    '##H###########H############H',  // 11
    '..H...........H............H',  // 12
    '..H...........H............H',  // 13
    '..P..G$..$..$.H..$..$..$...H',  // 14
    '############################',  // 15
  ],
];

export interface LevelValidation {
  ok: boolean;
  errors: string[];
}

/** Parse a level array of strings into grid + spawn data. */
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

/** Validate a parsed level — flags obvious authoring mistakes. */
export function validateLevel(rows: string[], parsed: ParsedLevel): LevelValidation {
  const errors: string[] = [];

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

  if (rows.length !== GRID_ROWS) {
    errors.push(`row count ${rows.length} != ${GRID_ROWS}`);
  }

  let playerCount = 0;
  for (const line of rows) for (const ch of line) if (ch === 'P') playerCount++;
  if (playerCount !== 1) errors.push(`player spawn count: ${playerCount} (expected 1)`);

  if (parsed.goldCount === 0) errors.push('no gold in level');
  if (parsed.exitColumns.length === 0) errors.push('no exit ladder (E) in level');

  for (const col of parsed.exitColumns) {
    if (parsed.grid[0][col] !== TileKind.EXIT_LADDER) {
      errors.push(`exit at col ${col} should be in row 0`);
    }
  }

  for (let col = 0; col < GRID_COLS; col++) {
    const t = parsed.grid[GRID_ROWS - 1][col];
    if (t !== TileKind.BRICK && t !== TileKind.CONCRETE) {
      errors.push(`bottom row col ${col} not solid (kind=${t})`);
    }
  }

  return { ok: errors.length === 0, errors };
}

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
