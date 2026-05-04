// Texture generation for Vault Runner — authentic C64 Lode Runner palette
// and multi-frame sprite sheets for player + guard animations.
//
// All textures are generated at runtime via Phaser Graphics; no PNG asset
// files required. Style follows the original 1983 Brøderbund Lode Runner
// C64 port (sources: en.wikipedia.org/wiki/Lode_Runner, c64-wiki.com).

declare const Phaser: any;

import { TileKind } from './types.js';

// Authentic C64 Lode Runner palette (from C64-Wiki):
//   black bg, red bricks (#880000), white ladders/poles (#FFFFFF),
//   mint/cyan guards (#AAFFEE), yellow gold (#EEEE77).
export const C64 = {
  BG: 0x000000,
  BG_GRID: 0x0a0a14,         // very subtle blue-tinted grid
  BG_VIGNETTE: 0x000814,
  BRICK: 0x880000,
  BRICK_LIGHT: 0xb04030,
  BRICK_MORTAR: 0x2b0a08,
  CONCRETE: 0x404040,
  CONCRETE_LIGHT: 0x666666,
  CONCRETE_DARK: 0x202020,
  LADDER: 0xffffff,
  LADDER_SHADE: 0xc8c8c8,
  ROPE: 0xffffff,
  ROPE_SHADE: 0xc8c8c8,
  GOLD_BRIGHT: 0xffee44,
  GOLD: 0xeeee77,
  GOLD_SHADE: 0xa0850a,
  PLAYER: 0xffffff,           // C64 Lode Runner runner is white
  PLAYER_HEAD: 0xffff80,      // a touch of yellow on the head ("flamehead")
  PLAYER_SHADE: 0xb0b0b0,
  GUARD: 0xaaffee,            // C64 mint/cyan
  GUARD_HEAD: 0x80ffd0,
  GUARD_SHADE: 0x60a890,
  EXIT_GLOW: 0x33eaff,
  EXIT: 0xaaffff,
  HOLE_RIM: 0x5b2010,
  PARTICLE_BRICK: 0xb04030,
  PARTICLE_GOLD: 0xffee44,
  PARTICLE_DEATH: 0xff4040,
} as const;

export const TEX = {
  BRICK: 'vr-brick',
  CONCRETE: 'vr-concrete',
  LADDER: 'vr-ladder',
  ROPE: 'vr-rope',
  GOLD: 'vr-gold',
  EXIT: 'vr-exit',
  HOLE: 'vr-hole',
  PARTICLE: 'vr-particle',
  PLAYER_SHEET: 'vr-player-sheet',
  GUARD_SHEET: 'vr-guard-sheet',
} as const;

/**
 * Sprite-sheet frame indices — generated frames are laid out horizontally.
 * Player and guard share the same layout; only colors differ.
 */
export const FRAMES = {
  IDLE: 0,
  RUN_A: 1,
  RUN_B: 2,
  CLIMB_A: 3,
  CLIMB_B: 4,
  ROPE_A: 5,
  ROPE_B: 6,
  FALL: 7,
  DIG_LEFT: 8,
  DIG_RIGHT: 9,
} as const;

const FRAME_COUNT = 10;

/* ------------------------------------------------------------------ */
/*  Public entry — call once per scene create after layout is known.   */
/* ------------------------------------------------------------------ */

export function generateTextures(scene: any, tileSize: number) {
  const t = Math.max(8, Math.floor(tileSize));

  for (const key of Object.values(TEX)) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
  }

  drawBrick(scene, t);
  drawConcrete(scene, t);
  drawLadder(scene, t);
  drawRope(scene, t);
  drawGold(scene, t);
  drawExit(scene, t);
  drawHole(scene, t);
  drawParticle(scene);
  drawCharacterSheet(scene, TEX.PLAYER_SHEET, t, C64.PLAYER, C64.PLAYER_SHADE, C64.PLAYER_HEAD);
  drawCharacterSheet(scene, TEX.GUARD_SHEET, t, C64.GUARD, C64.GUARD_SHADE, C64.GUARD_HEAD);
}

/* ------------------------------------------------------------------ */
/*  Tile textures                                                      */
/* ------------------------------------------------------------------ */

function drawBrick(scene: any, t: number) {
  const g = scene.add.graphics();
  // base fill
  g.fillStyle(C64.BRICK, 1);
  g.fillRect(0, 0, t, t);
  // light highlight band (top)
  g.fillStyle(C64.BRICK_LIGHT, 0.6);
  g.fillRect(0, 0, t, Math.max(1, Math.floor(t * 0.10)));
  // mortar lines — staggered brick pattern
  const mid = Math.floor(t / 2);
  g.fillStyle(C64.BRICK_MORTAR, 1);
  // horizontal mortar
  g.fillRect(0, 0, t, 1);
  g.fillRect(0, mid, t, 1);
  g.fillRect(0, t - 1, t, 1);
  // top-row vertical mortar at midpoint
  g.fillRect(mid, 0, 1, mid);
  // bottom-row vertical mortar offset (staggered) at quarter and 3/4
  g.fillRect(0, mid, 1, t - mid);
  g.fillRect(t - 1, mid, 1, t - mid);
  // subtle shading dots for texture
  g.fillStyle(C64.BRICK_MORTAR, 0.4);
  g.fillRect(Math.floor(t * 0.25), Math.floor(t * 0.20), 1, 1);
  g.fillRect(Math.floor(t * 0.70), Math.floor(t * 0.30), 1, 1);
  g.fillRect(Math.floor(t * 0.20), Math.floor(t * 0.70), 1, 1);
  g.fillRect(Math.floor(t * 0.75), Math.floor(t * 0.80), 1, 1);
  g.generateTexture(TEX.BRICK, t, t);
  g.destroy();
}

function drawConcrete(scene: any, t: number) {
  const g = scene.add.graphics();
  g.fillStyle(C64.CONCRETE, 1);
  g.fillRect(0, 0, t, t);
  // top highlight + bottom shadow for depth
  g.fillStyle(C64.CONCRETE_LIGHT, 1);
  g.fillRect(0, 0, t, 2);
  g.fillRect(0, 0, 2, t);
  g.fillStyle(C64.CONCRETE_DARK, 1);
  g.fillRect(0, t - 2, t, 2);
  g.fillRect(t - 2, 0, 2, t);
  // diagonal hatch (subtle)
  g.lineStyle(1, C64.CONCRETE_LIGHT, 0.3);
  for (let i = -t; i < t * 2; i += 4) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + t, t); g.strokePath();
  }
  g.generateTexture(TEX.CONCRETE, t, t);
  g.destroy();
}

function drawLadder(scene: any, t: number) {
  const g = scene.add.graphics();
  const railW = Math.max(2, Math.floor(t * 0.14));
  const railLeftX = Math.floor(t * 0.18);
  const railRightX = t - railLeftX - railW;
  // rails — main + shadow
  g.fillStyle(C64.LADDER_SHADE, 1);
  g.fillRect(railLeftX + 1, 0, railW, t);
  g.fillRect(railRightX + 1, 0, railW, t);
  g.fillStyle(C64.LADDER, 1);
  g.fillRect(railLeftX, 0, railW, t);
  g.fillRect(railRightX, 0, railW, t);
  // rungs (3 evenly spaced)
  const rungH = Math.max(2, Math.floor(t * 0.12));
  const rungSpan = railRightX + railW - railLeftX;
  const rungYs = [Math.floor(t * 0.10), Math.floor(t * 0.46), Math.floor(t * 0.78)];
  for (const ry of rungYs) {
    g.fillStyle(C64.LADDER_SHADE, 1);
    g.fillRect(railLeftX, ry + 1, rungSpan, rungH);
    g.fillStyle(C64.LADDER, 1);
    g.fillRect(railLeftX, ry, rungSpan, rungH);
  }
  g.generateTexture(TEX.LADDER, t, t);
  g.destroy();
}

function drawRope(scene: any, t: number) {
  // Per C64-Wiki: the rope/pole sits at the TOP of its tile, not centered.
  // The character hangs below it with feet dangling.
  const g = scene.add.graphics();
  const ropeY = Math.floor(t * 0.10);
  const ropeH = Math.max(2, Math.floor(t * 0.14));
  // shadow
  g.fillStyle(C64.ROPE_SHADE, 1);
  g.fillRect(0, ropeY + ropeH - 1, t, 1);
  // bar
  g.fillStyle(C64.ROPE, 1);
  g.fillRect(0, ropeY, t, ropeH);
  // end caps for a rope-like look (slightly thicker at edges)
  g.fillRect(0, ropeY - 1, 2, ropeH + 2);
  g.fillRect(t - 2, ropeY - 1, 2, ropeH + 2);
  g.generateTexture(TEX.ROPE, t, t);
  g.destroy();
}

function drawGold(scene: any, t: number) {
  // Gold rendered as a small chest/coin stack — chunky and readable.
  const g = scene.add.graphics();
  const cx = t / 2;
  const w = Math.floor(t * 0.62);
  const h = Math.floor(t * 0.42);
  const x = Math.floor(cx - w / 2);
  const y = Math.floor(t * 0.35);
  // shadow under chest
  g.fillStyle(C64.GOLD_SHADE, 1);
  g.fillRect(x, y + h, w, 2);
  // body
  g.fillStyle(C64.GOLD, 1);
  g.fillRect(x, y, w, h);
  // top highlight
  g.fillStyle(C64.GOLD_BRIGHT, 1);
  g.fillRect(x, y, w, Math.max(2, Math.floor(h * 0.25)));
  // dark band (chest seam)
  g.fillStyle(C64.GOLD_SHADE, 1);
  g.fillRect(x, y + Math.floor(h * 0.45), w, 1);
  // tiny lock highlight
  g.fillStyle(C64.GOLD_BRIGHT, 1);
  g.fillRect(Math.floor(cx - 1), y + Math.floor(h * 0.45) + 1, 2, 2);
  // border outline
  g.lineStyle(1, C64.GOLD_SHADE, 1);
  g.strokeRect(x, y, w, h);
  g.generateTexture(TEX.GOLD, t, t);
  g.destroy();
}

function drawExit(scene: any, t: number) {
  // Glowing cyan version of the ladder.
  const g = scene.add.graphics();
  const railW = Math.max(2, Math.floor(t * 0.14));
  const railLeftX = Math.floor(t * 0.18);
  const railRightX = t - railLeftX - railW;
  // outer glow halo
  g.fillStyle(C64.EXIT_GLOW, 0.18);
  g.fillRect(railLeftX - 2, 0, railW + 4, t);
  g.fillRect(railRightX - 2, 0, railW + 4, t);
  // rails
  g.fillStyle(C64.EXIT, 1);
  g.fillRect(railLeftX, 0, railW, t);
  g.fillRect(railRightX, 0, railW, t);
  // rungs
  const rungH = Math.max(2, Math.floor(t * 0.12));
  const rungSpan = railRightX + railW - railLeftX;
  for (const ry of [Math.floor(t * 0.10), Math.floor(t * 0.46), Math.floor(t * 0.78)]) {
    g.fillStyle(C64.EXIT, 1);
    g.fillRect(railLeftX, ry, rungSpan, rungH);
  }
  g.generateTexture(TEX.EXIT, t, t);
  g.destroy();
}

function drawHole(scene: any, t: number) {
  const g = scene.add.graphics();
  // pure black pit
  g.fillStyle(C64.BG, 1);
  g.fillRect(0, 0, t, t);
  // crumbling brick rim along the top edge
  g.fillStyle(C64.HOLE_RIM, 1);
  for (let x = 0; x < t; x += 2) {
    const h = (x % 4 === 0) ? 2 : 1;
    g.fillRect(x, 0, 2, h);
  }
  g.generateTexture(TEX.HOLE, t, t);
  g.destroy();
}

function drawParticle(scene: any) {
  // Small 4x4 white particle for emitters — tinted at runtime.
  const g = scene.add.graphics();
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, 4, 4);
  g.generateTexture(TEX.PARTICLE, 4, 4);
  g.destroy();
}

/* ------------------------------------------------------------------ */
/*  Character sprite sheet generation                                  */
/* ------------------------------------------------------------------ */

function drawCharacterSheet(
  scene: any,
  key: string,
  tileSize: number,
  body: number,
  shade: number,
  head: number,
) {
  const t = tileSize;
  const sheetW = t * FRAME_COUNT;
  const g = scene.add.graphics();

  for (let f = 0; f < FRAME_COUNT; f++) {
    const ox = f * t;
    drawCharFrame(g, ox, t, f, body, shade, head);
  }

  g.generateTexture(key, sheetW, t);
  g.destroy();

  // Manually carve the generated single-image texture into frames so that
  // Phaser sprite animations / setFrame(idx) work as expected.
  const tex = scene.textures.get(key);
  for (let f = 0; f < FRAME_COUNT; f++) {
    tex.add(f, 0, f * t, 0, t, t);
  }
}

/**
 * Draw a single frame of a character into `g` at offset (ox, 0).
 * The character is roughly 60% of the tile high, centered horizontally.
 */
function drawCharFrame(
  g: any,
  ox: number,
  t: number,
  frame: number,
  body: number,
  shade: number,
  head: number,
) {
  const cx = ox + Math.floor(t / 2);
  const headY = Math.floor(t * 0.18);
  const headR = Math.max(2, Math.floor(t * 0.13));
  const torsoTop = Math.floor(t * 0.30);
  const torsoH = Math.floor(t * 0.36);
  const torsoW = Math.floor(t * 0.36);
  const legY = torsoTop + torsoH;
  const legH = Math.floor(t * 0.22);
  const legW = Math.max(2, Math.floor(t * 0.13));
  const armY = Math.floor(t * 0.34);
  const armH = Math.floor(t * 0.28);
  const armW = Math.max(2, Math.floor(t * 0.10));

  // Helper to draw a rect with a shadow underneath (1px down, darker)
  const fillRect = (x: number, y: number, w: number, h: number, col: number) => {
    g.fillStyle(col, 1);
    g.fillRect(x, y, w, h);
  };

  // ── Head (always present, shape varies slightly) ──
  fillRect(cx - headR, headY, headR * 2, headR * 2, body);
  fillRect(cx - headR + 1, headY + 1, 2, 2, head); // small highlight pixel
  fillRect(cx - headR, headY + headR * 2, headR * 2, 1, shade); // chin shadow

  // ── Pose-specific limbs ──
  switch (frame) {
    case FRAMES.IDLE: {
      // Torso centered, legs straight, arms at sides
      fillRect(cx - torsoW / 2, torsoTop, torsoW, torsoH, body);
      fillRect(cx - legW - 1, legY, legW, legH, body);
      fillRect(cx + 1, legY, legW, legH, body);
      // arms straight down
      fillRect(cx - torsoW / 2 - armW, armY, armW, armH, body);
      fillRect(cx + torsoW / 2, armY, armW, armH, body);
      break;
    }
    case FRAMES.RUN_A: {
      // Right leg forward, left leg back; arms swung opposite
      fillRect(cx - torsoW / 2, torsoTop, torsoW, torsoH, body);
      fillRect(cx - legW * 2, legY, legW, legH, body);            // back leg
      fillRect(cx + legW, legY, legW, Math.floor(legH * 0.85), body); // front leg
      fillRect(cx + torsoW / 2 - 1, armY, armW, armH, body);          // back arm
      fillRect(cx - torsoW / 2 - armW * 2, armY, armW, armH, body);   // forward arm
      break;
    }
    case FRAMES.RUN_B: {
      // Mirror of RUN_A — left leg forward, right leg back
      fillRect(cx - torsoW / 2, torsoTop, torsoW, torsoH, body);
      fillRect(cx + legW, legY, legW, legH, body);                  // back leg
      fillRect(cx - legW * 2, legY, legW, Math.floor(legH * 0.85), body); // front leg
      fillRect(cx - torsoW / 2 - armW, armY, armW, armH, body);     // back arm
      fillRect(cx + torsoW / 2 + armW, armY, armW, armH, body);     // forward arm
      break;
    }
    case FRAMES.CLIMB_A: {
      // Arms up grabbing rung, legs spread for climbing
      fillRect(cx - torsoW / 2, torsoTop, torsoW, torsoH, body);
      fillRect(cx - armW - 1, headY - 2, armW, armH, body); // left arm reaching up
      fillRect(cx + 1, armY, armW, armH * 0.8, body);       // right arm bent
      fillRect(cx - legW - 2, legY, legW, legH, body);
      fillRect(cx + 2, legY, legW, Math.floor(legH * 0.7), body);
      break;
    }
    case FRAMES.CLIMB_B: {
      // Mirrored climb pose
      fillRect(cx - torsoW / 2, torsoTop, torsoW, torsoH, body);
      fillRect(cx + 1, headY - 2, armW, armH, body);
      fillRect(cx - armW - 1, armY, armW, armH * 0.8, body);
      fillRect(cx + 2, legY, legW, legH, body);
      fillRect(cx - legW - 2, legY, legW, Math.floor(legH * 0.7), body);
      break;
    }
    case FRAMES.ROPE_A: {
      // Hanging from rope: arms up gripping bar, body dangles, legs together
      fillRect(cx - armW * 2, headY - 4, armW, armH * 0.7, body);
      fillRect(cx + armW, headY - 4, armW, armH * 0.7, body);
      fillRect(cx - torsoW / 2, torsoTop + 2, torsoW, torsoH * 0.85, body);
      fillRect(cx - legW, legY, legW, legH, body);
      fillRect(cx, legY, legW, legH, body);
      break;
    }
    case FRAMES.ROPE_B: {
      // Slight sway — legs offset
      fillRect(cx - armW * 2, headY - 4, armW, armH * 0.7, body);
      fillRect(cx + armW, headY - 4, armW, armH * 0.7, body);
      fillRect(cx - torsoW / 2 + 1, torsoTop + 2, torsoW, torsoH * 0.85, body);
      fillRect(cx - legW + 1, legY, legW, legH, body);
      fillRect(cx + 1, legY, legW, legH, body);
      break;
    }
    case FRAMES.FALL: {
      // Arms out flailing, legs apart
      fillRect(cx - torsoW / 2, torsoTop, torsoW, torsoH, body);
      fillRect(cx - armW * 3, armY - 2, armW, armH, body);
      fillRect(cx + torsoW / 2 + armW * 1.5, armY - 2, armW, armH, body);
      fillRect(cx - legW * 2, legY, legW, legH, body);
      fillRect(cx + legW, legY, legW, legH, body);
      break;
    }
    case FRAMES.DIG_LEFT: {
      // Bent over, arm down-left
      fillRect(cx - torsoW / 2, torsoTop + 2, torsoW, torsoH * 0.9, body);
      fillRect(cx - torsoW / 2 - armW * 2, legY - armH * 0.5, armW, armH, body);
      fillRect(cx, armY, armW, armH * 0.6, body);
      fillRect(cx - legW - 1, legY, legW, legH, body);
      fillRect(cx + 1, legY, legW, legH, body);
      break;
    }
    case FRAMES.DIG_RIGHT: {
      // Bent over, arm down-right (mirror of DIG_LEFT)
      fillRect(cx - torsoW / 2, torsoTop + 2, torsoW, torsoH * 0.9, body);
      fillRect(cx + torsoW / 2 + armW, legY - armH * 0.5, armW, armH, body);
      fillRect(cx - armW, armY, armW, armH * 0.6, body);
      fillRect(cx - legW - 1, legY, legW, legH, body);
      fillRect(cx + 1, legY, legW, legH, body);
      break;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Mappings + predicates                                              */
/* ------------------------------------------------------------------ */

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

export function isPassable(kind: TileKind): boolean {
  return kind !== TileKind.BRICK && kind !== TileKind.CONCRETE;
}

export function isSolid(kind: TileKind): boolean {
  return kind === TileKind.BRICK || kind === TileKind.CONCRETE;
}

export function isSupport(kind: TileKind): boolean {
  return kind === TileKind.BRICK || kind === TileKind.CONCRETE || kind === TileKind.LADDER;
}

export function isClimbable(kind: TileKind): boolean {
  return kind === TileKind.LADDER || kind === TileKind.EXIT_LADDER;
}
