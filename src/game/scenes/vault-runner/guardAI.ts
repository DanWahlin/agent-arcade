// GuardAI — BFS pathfinding on the Vault Runner tile grid.
//
// Move-graph rules (from a tile (c, r)):
//   - LEFT / RIGHT: target tile must be passable (not solid). Source tile
//     must have support beneath it (solid floor, ladder, or rope) — i.e.
//     guards don't walk in mid-air.
//   - UP: source tile must be a ladder. Target tile must be passable.
//   - DOWN: target tile must be passable. (Down works from ladders or
//     ropes, and also as falling from any mid-air tile.)
//
// The grid is small (28x16 = 448 tiles) so a fresh BFS per call is cheap.

import {
  TileKind,
  GRID_COLS,
  GRID_ROWS,
  type GridPos,
} from './types.js';

export type Direction = 'left' | 'right' | 'up' | 'down' | 'stay';

export interface GridReader {
  getTile(col: number, row: number): TileKind;
}

/** Return the tile kind, or CONCRETE for out-of-bounds (so it's never traversable). */
function safeTile(grid: GridReader, col: number, row: number): TileKind {
  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return TileKind.CONCRETE;
  return grid.getTile(col, row);
}

/** Whether the actor can stand here without falling (solid below or on ladder/rope). */
function isStandingTile(grid: GridReader, col: number, row: number): boolean {
  const here = safeTile(grid, col, row);
  if (here === TileKind.LADDER || here === TileKind.ROPE) return true;
  const below = safeTile(grid, col, row + 1);
  return below === TileKind.BRICK || below === TileKind.CONCRETE || below === TileKind.LADDER;
}

/** Whether actor can pass through (i.e. tile is not solid). */
function isPassable(kind: TileKind): boolean {
  return kind !== TileKind.BRICK && kind !== TileKind.CONCRETE;
}

/**
 * Enumerate adjacent tiles a guard can move into from (col, row). Returns the
 * direction-tile pairs.
 */
function neighbors(grid: GridReader, col: number, row: number): { dir: Direction; col: number; row: number }[] {
  const result: { dir: Direction; col: number; row: number }[] = [];
  const here = safeTile(grid, col, row);
  const below = safeTile(grid, col, row + 1);

  // Vertical first — UP / DOWN
  if (here === TileKind.LADDER && row > 0) {
    const up = safeTile(grid, col, row - 1);
    if (isPassable(up)) result.push({ dir: 'up', col, row: row - 1 });
  }

  if (row < GRID_ROWS - 1) {
    const down = safeTile(grid, col, row + 1);
    if (isPassable(down)) result.push({ dir: 'down', col, row: row + 1 });
  }

  // Horizontal — only if we have support (or we are on rope)
  const standing = isStandingTile(grid, col, row);
  // Also allow horizontal moves while falling between solid floors (so guards
  // don't get permanently stuck mid-air). In practice they're driven by gravity
  // by the scene, but for path planning treat them as movable.
  const canHoriz = standing || (below === TileKind.BRICK || below === TileKind.CONCRETE);

  if (canHoriz) {
    if (col > 0) {
      const left = safeTile(grid, col - 1, row);
      if (isPassable(left)) result.push({ dir: 'left', col: col - 1, row });
    }
    if (col < GRID_COLS - 1) {
      const right = safeTile(grid, col + 1, row);
      if (isPassable(right)) result.push({ dir: 'right', col: col + 1, row });
    }
  }

  return result;
}

/**
 * BFS from `from` to `to`. Returns the first-step direction the guard should
 * take, or 'stay' if no path is found.
 */
export function nextStep(grid: GridReader, from: GridPos, to: GridPos): Direction {
  if (from.col === to.col && from.row === to.row) return 'stay';

  // visited[row][col] = direction taken to first reach this cell from `from`,
  // or undefined if unvisited.
  const visited: (Direction | undefined)[][] = [];
  for (let r = 0; r < GRID_ROWS; r++) visited.push(new Array(GRID_COLS));

  type QItem = { col: number; row: number; firstDir: Direction };
  const queue: QItem[] = [];

  const startNeighbors = neighbors(grid, from.col, from.row);
  for (const n of startNeighbors) {
    if (visited[n.row][n.col]) continue;
    visited[n.row][n.col] = n.dir;
    if (n.col === to.col && n.row === to.row) return n.dir;
    queue.push({ col: n.col, row: n.row, firstDir: n.dir });
  }

  while (queue.length) {
    const cur = queue.shift()!;
    const ns = neighbors(grid, cur.col, cur.row);
    for (const n of ns) {
      if (visited[n.row][n.col]) continue;
      visited[n.row][n.col] = cur.firstDir;
      if (n.col === to.col && n.row === to.row) return cur.firstDir;
      queue.push({ col: n.col, row: n.row, firstDir: cur.firstDir });
    }
  }

  return 'stay';
}
