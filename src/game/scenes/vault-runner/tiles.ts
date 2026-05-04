// Tile rendering — pre-generates simple textures per tile kind once per scene.

declare const Phaser: any;

import { TileKind } from './types.js';

export const TEX = {
  BRICK: 'vr-brick',
  CONCRETE: 'vr-concrete',
  LADDER: 'vr-ladder',
  ROPE: 'vr-rope',
  GOLD: 'vr-gold',
  EXIT: 'vr-exit',
  HOLE: 'vr-hole',
  PLAYER: 'vr-player',
  GUARD: 'vr-guard',
} as const;

/** Generate all tile textures at the given size. Call once during create(). */
export function generateTextures(scene: any, tileSize: number) {
  const t = Math.max(8, Math.floor(tileSize));

  // Fresh textures every load (in case tile size changed on resize)
  for (const key of Object.values(TEX)) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
  }

  // BRICK — red brick wall pattern
  {
    const g = scene.add.graphics();
    g.fillStyle(0x8b3a2f, 1);
    g.fillRect(0, 0, t, t);
    g.lineStyle(1, 0x2b1410, 1);
    // horizontal mortar lines
    g.beginPath(); g.moveTo(0, t / 2); g.lineTo(t, t / 2); g.strokePath();
    g.beginPath(); g.moveTo(0, 0); g.lineTo(t, 0); g.strokePath();
    g.beginPath(); g.moveTo(0, t - 1); g.lineTo(t, t - 1); g.strokePath();
    // staggered vertical lines
    g.beginPath(); g.moveTo(t / 2, 0); g.lineTo(t / 2, t / 2); g.strokePath();
    g.beginPath(); g.moveTo(0, t / 2); g.lineTo(0, t); g.strokePath();
    g.beginPath(); g.moveTo(t, t / 2); g.lineTo(t, t); g.strokePath();
    g.beginPath(); g.moveTo(t / 4, t / 2); g.lineTo(t / 4, t); g.strokePath();
    g.beginPath(); g.moveTo((3 * t) / 4, t / 2); g.lineTo((3 * t) / 4, t); g.strokePath();
    g.generateTexture(TEX.BRICK, t, t);
    g.destroy();
  }

  // CONCRETE — gray cross-hatched indestructible block
  {
    const g = scene.add.graphics();
    g.fillStyle(0x4a4a4a, 1);
    g.fillRect(0, 0, t, t);
    g.lineStyle(1, 0x2a2a2a, 1);
    g.strokeRect(1, 1, t - 2, t - 2);
    g.lineStyle(1, 0x6a6a6a, 0.6);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(t, t); g.strokePath();
    g.beginPath(); g.moveTo(t, 0); g.lineTo(0, t); g.strokePath();
    g.generateTexture(TEX.CONCRETE, t, t);
    g.destroy();
  }

  // LADDER — yellow rails with rungs
  {
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0); // transparent bg
    g.fillRect(0, 0, t, t);
    const railW = Math.max(2, Math.floor(t * 0.12));
    g.fillStyle(0xf4c430, 1);
    g.fillRect(Math.floor(t * 0.18), 0, railW, t);
    g.fillRect(t - Math.floor(t * 0.18) - railW, 0, railW, t);
    // rungs
    const rungH = Math.max(2, Math.floor(t * 0.1));
    g.fillRect(Math.floor(t * 0.12), Math.floor(t * 0.18), t - Math.floor(t * 0.24), rungH);
    g.fillRect(Math.floor(t * 0.12), Math.floor(t * 0.55), t - Math.floor(t * 0.24), rungH);
    g.generateTexture(TEX.LADDER, t, t);
    g.destroy();
  }

  // ROPE — horizontal cable across middle
  {
    const g = scene.add.graphics();
    const ropeY = Math.floor(t * 0.28);
    const ropeH = Math.max(2, Math.floor(t * 0.12));
    g.fillStyle(0xc8a165, 1);
    g.fillRect(0, ropeY, t, ropeH);
    g.lineStyle(1, 0x6b4a25, 1);
    g.beginPath(); g.moveTo(0, ropeY); g.lineTo(t, ropeY); g.strokePath();
    g.beginPath(); g.moveTo(0, ropeY + ropeH - 1); g.lineTo(t, ropeY + ropeH - 1); g.strokePath();
    g.generateTexture(TEX.ROPE, t, t);
    g.destroy();
  }

  // GOLD — yellow diamond
  {
    const g = scene.add.graphics();
    const cx = t / 2, cy = t / 2;
    const r = Math.floor(t * 0.32);
    g.fillStyle(0xffd700, 1);
    g.lineStyle(1, 0x8b6500, 1);
    g.beginPath();
    g.moveTo(cx, cy - r);
    g.lineTo(cx + r, cy);
    g.lineTo(cx, cy + r);
    g.lineTo(cx - r, cy);
    g.closePath();
    g.fillPath();
    g.strokePath();
    // inner highlight
    g.fillStyle(0xffffff, 0.6);
    g.fillRect(cx - r / 3, cy - r / 2, Math.max(2, r / 4), Math.max(2, r / 4));
    g.generateTexture(TEX.GOLD, t, t);
    g.destroy();
  }

  // EXIT_LADDER — like ladder but cyan to make it stand out when revealed
  {
    const g = scene.add.graphics();
    const railW = Math.max(2, Math.floor(t * 0.12));
    g.fillStyle(0x33eaff, 1);
    g.fillRect(Math.floor(t * 0.18), 0, railW, t);
    g.fillRect(t - Math.floor(t * 0.18) - railW, 0, railW, t);
    const rungH = Math.max(2, Math.floor(t * 0.1));
    g.fillRect(Math.floor(t * 0.12), Math.floor(t * 0.18), t - Math.floor(t * 0.24), rungH);
    g.fillRect(Math.floor(t * 0.12), Math.floor(t * 0.55), t - Math.floor(t * 0.24), rungH);
    g.generateTexture(TEX.EXIT, t, t);
    g.destroy();
  }

  // HOLE — dark pit with crumbling edges
  {
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 1);
    g.fillRect(0, 0, t, t);
    g.fillStyle(0x2a1410, 1);
    g.fillRect(2, 2, t - 4, t - 4);
    g.lineStyle(1, 0x5b2a20, 1);
    g.strokeRect(0, 0, t, t);
    g.generateTexture(TEX.HOLE, t, t);
    g.destroy();
  }

  // PLAYER — blue-helmeted runner silhouette
  {
    const g = scene.add.graphics();
    // body
    g.fillStyle(0x2196f3, 1);
    g.fillRect(Math.floor(t * 0.28), Math.floor(t * 0.30), Math.floor(t * 0.44), Math.floor(t * 0.50));
    // head
    g.fillStyle(0xffe0bd, 1);
    g.fillCircle(t / 2, Math.floor(t * 0.22), Math.floor(t * 0.16));
    // helmet
    g.fillStyle(0x0d47a1, 1);
    g.fillRect(Math.floor(t * 0.30), Math.floor(t * 0.10), Math.floor(t * 0.40), Math.floor(t * 0.10));
    // legs
    g.fillStyle(0x0d47a1, 1);
    g.fillRect(Math.floor(t * 0.30), Math.floor(t * 0.78), Math.floor(t * 0.16), Math.floor(t * 0.18));
    g.fillRect(Math.floor(t * 0.54), Math.floor(t * 0.78), Math.floor(t * 0.16), Math.floor(t * 0.18));
    g.generateTexture(TEX.PLAYER, t, t);
    g.destroy();
  }

  // GUARD — red enemy silhouette
  {
    const g = scene.add.graphics();
    // body
    g.fillStyle(0xc62828, 1);
    g.fillRect(Math.floor(t * 0.26), Math.floor(t * 0.30), Math.floor(t * 0.48), Math.floor(t * 0.50));
    // head
    g.fillStyle(0xffe0bd, 1);
    g.fillCircle(t / 2, Math.floor(t * 0.22), Math.floor(t * 0.16));
    // hood
    g.fillStyle(0x6d0e0e, 1);
    g.fillRect(Math.floor(t * 0.28), Math.floor(t * 0.08), Math.floor(t * 0.44), Math.floor(t * 0.14));
    // legs
    g.fillStyle(0x6d0e0e, 1);
    g.fillRect(Math.floor(t * 0.28), Math.floor(t * 0.78), Math.floor(t * 0.16), Math.floor(t * 0.18));
    g.fillRect(Math.floor(t * 0.56), Math.floor(t * 0.78), Math.floor(t * 0.16), Math.floor(t * 0.18));
    // angry eyes
    g.fillStyle(0xffffff, 1);
    g.fillRect(Math.floor(t * 0.40), Math.floor(t * 0.20), 2, 2);
    g.fillRect(Math.floor(t * 0.58), Math.floor(t * 0.20), 2, 2);
    g.generateTexture(TEX.GUARD, t, t);
    g.destroy();
  }
}

/** Map a single level character to its TileKind. Returns null for unknown chars. */
export function charToTile(ch: string): TileKind | null {
  switch (ch) {
    case '.': case ' ': return TileKind.EMPTY;
    case '#': return TileKind.BRICK;
    case '@': return TileKind.CONCRETE;
    case 'H': return TileKind.LADDER;
    case '-': return TileKind.ROPE;
    case '$': return TileKind.GOLD;
    case 'E': return TileKind.EXIT_LADDER;
    case 'P': return TileKind.EMPTY;  // player spawn — empty tile
    case 'G': return TileKind.EMPTY;  // guard spawn — empty tile
    default: return null;
  }
}

/** Texture key for a given tile (or null if it shouldn't render a tile sprite). */
export function tileTexture(kind: TileKind): string | null {
  switch (kind) {
    case TileKind.BRICK: return TEX.BRICK;
    case TileKind.CONCRETE: return TEX.CONCRETE;
    case TileKind.LADDER: return TEX.LADDER;
    case TileKind.ROPE: return TEX.ROPE;
    case TileKind.GOLD: return TEX.GOLD;
    case TileKind.EXIT_LADDER: return TEX.EXIT;
    case TileKind.HOLE: return TEX.HOLE;
    default: return null;
  }
}

/** Whether an actor can pass through this tile (i.e. it is not a solid block). */
export function isPassable(kind: TileKind): boolean {
  return kind !== TileKind.BRICK && kind !== TileKind.CONCRETE;
}

/** Whether this tile blocks lateral movement (solid wall). */
export function isSolid(kind: TileKind): boolean {
  return kind === TileKind.BRICK || kind === TileKind.CONCRETE;
}

/** Whether this tile supports an actor standing on top of it (solid floor or ladder top). */
export function isSupport(kind: TileKind): boolean {
  return kind === TileKind.BRICK || kind === TileKind.CONCRETE || kind === TileKind.LADDER;
}

/** Whether an actor can climb this tile vertically. */
export function isClimbable(kind: TileKind): boolean {
  return kind === TileKind.LADDER || kind === TileKind.EXIT_LADDER;
}
