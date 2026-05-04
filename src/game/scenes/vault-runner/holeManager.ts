// HoleManager — dig/regen state machine for diggable BRICK tiles.
//
// Lifecycle: BRICK -> DIGGING (anim) -> OPEN -> WARNING (last 1s flicker) -> REGEN -> BRICK
//
// The manager owns no tile state itself — it mutates the scene's grid via
// callbacks. The scene also provides an actor-occupancy callback so the
// manager can fire onActorCrushed when a regen completes with someone in
// the hole.

import { TileKind, type HoleEntity, HoleStage } from './types.js';

export const DIG_ANIM_MS = 300;
export const HOLE_OPEN_MS = 3000;
export const HOLE_WARNING_MS = 1000;
export const HOLE_REGEN_ANIM_MS = 250;
/** Total cycle from start of dig to re-solid: ~4.55s */
export const HOLE_TOTAL_MS = DIG_ANIM_MS + HOLE_OPEN_MS + HOLE_WARNING_MS + HOLE_REGEN_ANIM_MS;

export interface HoleManagerCallbacks {
  /** Read the current tile kind in the scene grid. */
  getTile(col: number, row: number): TileKind;
  /** Write a tile kind into the scene grid. */
  setTile(col: number, row: number, kind: TileKind): void;
  /** Called when an actor is in the hole at the moment regen completes. */
  onActorCrushed(col: number, row: number): void;
  /** Whether the player is occupying this tile when regen completes. */
  isPlayerAt(col: number, row: number): boolean;
  /** Whether a guard occupies this tile when regen completes. */
  isGuardAt(col: number, row: number): boolean;
  /** Optional visual hooks. */
  onDigStart?(col: number, row: number): void;
  onHoleOpen?(col: number, row: number): void;
  onHoleWarning?(col: number, row: number): void;
  onHoleRegen?(col: number, row: number): void;
}

export class HoleManager {
  private holes: HoleEntity[] = [];

  constructor(private cb: HoleManagerCallbacks) {}

  /**
   * Attempt to dig a hole at (col, row). The target tile must currently be BRICK
   * AND the tile above must be EMPTY (so the actor can stand to dig). Returns
   * true on success.
   */
  dig(col: number, row: number): boolean {
    if (this.cb.getTile(col, row) !== TileKind.BRICK) return false;
    // Must be EMPTY directly above so the actor can stand
    if (row > 0) {
      const above = this.cb.getTile(col, row - 1);
      if (above === TileKind.BRICK || above === TileKind.CONCRETE) return false;
    }
    // Already digging here?
    if (this.holes.some(h => h.col === col && h.row === row)) return false;

    this.cb.setTile(col, row, TileKind.HOLE);
    this.holes.push({ col, row, stage: HoleStage.DIGGING, timer: DIG_ANIM_MS });
    this.cb.onDigStart?.(col, row);
    return true;
  }

  /** Whether (col, row) is currently a hole (any stage). */
  isHole(col: number, row: number): boolean {
    return this.holes.some(h => h.col === col && h.row === row);
  }

  /** Tick state machines forward by `dt` ms. */
  update(dt: number) {
    for (let i = this.holes.length - 1; i >= 0; i--) {
      const h = this.holes[i];
      h.timer -= dt;
      if (h.timer > 0) continue;

      switch (h.stage) {
        case HoleStage.DIGGING:
          h.stage = HoleStage.OPEN;
          h.timer = HOLE_OPEN_MS;
          this.cb.onHoleOpen?.(h.col, h.row);
          break;
        case HoleStage.OPEN:
          h.stage = HoleStage.WARNING;
          h.timer = HOLE_WARNING_MS;
          this.cb.onHoleWarning?.(h.col, h.row);
          break;
        case HoleStage.WARNING:
          h.stage = HoleStage.REGEN;
          h.timer = HOLE_REGEN_ANIM_MS;
          this.cb.onHoleRegen?.(h.col, h.row);
          break;
        case HoleStage.REGEN:
          // Restore the brick. If anyone is standing in it, they die.
          this.cb.setTile(h.col, h.row, TileKind.BRICK);
          if (this.cb.isPlayerAt(h.col, h.row) || this.cb.isGuardAt(h.col, h.row)) {
            this.cb.onActorCrushed(h.col, h.row);
          }
          this.holes.splice(i, 1);
          break;
      }
    }
  }

  /** Get hole entity at given coords (or null). */
  getHole(col: number, row: number): HoleEntity | null {
    return this.holes.find(h => h.col === col && h.row === row) ?? null;
  }

  /** Iterate all active holes. */
  forEach(fn: (h: HoleEntity) => void) {
    for (const h of this.holes) fn(h);
  }

  /** Reset all hole state (e.g. when loading a new level). */
  reset() {
    this.holes = [];
  }

  /** For testing — number of active holes. */
  get count() { return this.holes.length; }
}
