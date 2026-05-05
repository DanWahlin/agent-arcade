// Texture generation for Vault Runner — authentic C64 Lode Runner palette.
// Textures are rendered at a small NATIVE size (16px) then upscaled via
// Phaser's pixelArt:true (NEAREST sampling) to produce a crisp 8-bit look.

declare const Phaser: any;

import { TileKind } from './types.js';

// Authentic C64 Lode Runner palette (sourced from c64-wiki.com).
export const C64 = {
  BG: 0x000000,
  BG_GRID: 0x0a0a14,
  BG_VIGNETTE: 0x000814,
  BRICK: 0x880000,
  BRICK_LIGHT: 0xc04030,
  BRICK_MORTAR: 0x180000,
  CONCRETE: 0x404040,
  CONCRETE_LIGHT: 0x707070,
  CONCRETE_DARK: 0x202020,
  LADDER: 0xffffff,
  LADDER_SHADE: 0xa0a0a0,
  ROPE: 0xffffff,
  ROPE_SHADE: 0xa0a0a0,
  GOLD_BRIGHT: 0xffff80,
  GOLD: 0xeeee44,
  GOLD_SHADE: 0x886600,
  PLAYER: 0xffffff,
  PLAYER_HEAD: 0xffd040,
  PLAYER_SHADE: 0xc0c0c0,
  GUARD: 0xaaffee,
  GUARD_HEAD: 0x66e0c0,
  GUARD_SHADE: 0x60a888,
  EXIT_GLOW: 0x33eaff,
  EXIT: 0xaaffff,
  HOLE_RIM: 0x4a1810,
  PARTICLE_BRICK: 0xc04030,
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

// NATIVE PIXEL SIZE — drawn once, upscaled crisply.
const NATIVE_TILE = 16;

/* ------------------------------------------------------------------ */

export function generateTextures(scene: any) {
  for (const key of Object.values(TEX)) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
  }

  drawBrick(scene);
  drawConcrete(scene);
  drawLadder(scene);
  drawRope(scene);
  drawGold(scene);
  drawExit(scene);
  drawHole(scene);
  drawParticle(scene);
  drawCharacterSheet(scene, TEX.PLAYER_SHEET, C64.PLAYER, C64.PLAYER_SHADE, C64.PLAYER_HEAD);
  drawCharacterSheet(scene, TEX.GUARD_SHEET, C64.GUARD, C64.GUARD_SHADE, C64.GUARD_HEAD);
}

/* ------------------------------------------------------------------ */
/*  Tile textures — rendered at 16x16 native                           */
/* ------------------------------------------------------------------ */

function drawBrick(scene: any) {
  const t = NATIVE_TILE;
  const g = scene.add.graphics();
  g.fillStyle(C64.BRICK, 1);
  g.fillRect(0, 0, t, t);
  // 1-px highlight along the top of each brick row
  g.fillStyle(C64.BRICK_LIGHT, 1);
  g.fillRect(0, 0, t, 1);
  g.fillRect(0, 8, t, 1);
  // mortar — staggered brick layout
  g.fillStyle(C64.BRICK_MORTAR, 1);
  g.fillRect(0, 7, t, 1);
  g.fillRect(0, t - 1, t, 1);
  g.fillRect(8, 1, 1, 6);
  g.fillRect(4, 9, 1, 6);
  g.fillRect(12, 9, 1, 6);
  g.generateTexture(TEX.BRICK, t, t);
  g.destroy();
}

function drawConcrete(scene: any) {
  const t = NATIVE_TILE;
  const g = scene.add.graphics();
  g.fillStyle(C64.CONCRETE, 1);
  g.fillRect(0, 0, t, t);
  g.fillStyle(C64.CONCRETE_LIGHT, 1);
  g.fillRect(0, 0, t, 1);
  g.fillRect(0, 0, 1, t);
  g.fillStyle(C64.CONCRETE_DARK, 1);
  g.fillRect(0, t - 1, t, 1);
  g.fillRect(t - 1, 0, 1, t);
  // diagonal hatch dots
  g.fillStyle(C64.CONCRETE_LIGHT, 1);
  for (let i = 0; i < 4; i++) {
    g.fillRect(2 + i * 4, 4 + i * 2, 1, 1);
    g.fillRect(4 + i * 3, 10 + (i % 2), 1, 1);
  }
  g.generateTexture(TEX.CONCRETE, t, t);
  g.destroy();
}

function drawLadder(scene: any) {
  const t = NATIVE_TILE;
  const g = scene.add.graphics();
  // 2-px wide rails with subtle right-edge shadow on each
  g.fillStyle(C64.LADDER, 1);
  g.fillRect(3, 0, 2, t);
  g.fillRect(11, 0, 2, t);
  g.fillStyle(C64.LADDER_SHADE, 1);
  g.fillRect(4, 0, 1, t);
  g.fillRect(12, 0, 1, t);
  // Three 2-px rungs spanning between the rails
  g.fillStyle(C64.LADDER, 1);
  for (const ry of [2, 7, 12]) {
    g.fillRect(5, ry, 6, 2);
  }
  g.generateTexture(TEX.LADDER, t, t);
  g.destroy();
}

function drawRope(scene: any) {
  // C64 Lode Runner: bar sits at the TOP of its tile, runner hangs below.
  const t = NATIVE_TILE;
  const g = scene.add.graphics();
  g.fillStyle(C64.ROPE, 1);
  g.fillRect(0, 1, t, 2);
  g.fillStyle(C64.ROPE_SHADE, 1);
  g.fillRect(0, 3, t, 1);
  // tiny end caps
  g.fillStyle(C64.ROPE, 1);
  g.fillRect(0, 0, 1, 4);
  g.fillRect(t - 1, 0, 1, 4);
  g.generateTexture(TEX.ROPE, t, t);
  g.destroy();
}

function drawGold(scene: any) {
  // Treasure chest — readable at small sizes.
  const t = NATIVE_TILE;
  const g = scene.add.graphics();
  // chest body cols 3-12, rows 6-13
  g.fillStyle(C64.GOLD, 1);
  g.fillRect(3, 6, 10, 8);
  g.fillStyle(C64.GOLD_BRIGHT, 1);
  g.fillRect(3, 6, 10, 2);
  g.fillStyle(C64.GOLD_SHADE, 1);
  g.fillRect(3, 9, 10, 1);
  g.lineStyle(1, C64.GOLD_SHADE, 1);
  g.strokeRect(3, 6, 10, 8);
  g.fillStyle(C64.GOLD_BRIGHT, 1);
  g.fillRect(7, 10, 2, 2);
  g.fillStyle(C64.GOLD_SHADE, 1);
  g.fillRect(3, 14, 10, 1);
  g.generateTexture(TEX.GOLD, t, t);
  g.destroy();
}

function drawExit(scene: any) {
  const t = NATIVE_TILE;
  const g = scene.add.graphics();
  g.fillStyle(C64.EXIT_GLOW, 0.25);
  g.fillRect(2, 0, 12, t);
  g.fillStyle(C64.EXIT, 1);
  g.fillRect(3, 0, 2, t);
  g.fillRect(11, 0, 2, t);
  for (const ry of [2, 7, 12]) {
    g.fillRect(5, ry, 6, 2);
  }
  g.generateTexture(TEX.EXIT, t, t);
  g.destroy();
}

function drawHole(scene: any) {
  const t = NATIVE_TILE;
  const g = scene.add.graphics();
  g.fillStyle(C64.BG, 1);
  g.fillRect(0, 0, t, t);
  // Crumbling brick rim at the top (chunky pixel-art)
  g.fillStyle(C64.HOLE_RIM, 1);
  g.fillRect(0, 0, 2, 2);
  g.fillRect(4, 0, 2, 1);
  g.fillRect(8, 0, 2, 1);
  g.fillRect(12, 0, 2, 2);
  g.fillRect(t - 2, 0, 2, 2);
  g.generateTexture(TEX.HOLE, t, t);
  g.destroy();
}

function drawParticle(scene: any) {
  const g = scene.add.graphics();
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, 2, 2);
  g.generateTexture(TEX.PARTICLE, 2, 2);
  g.destroy();
}

/* ------------------------------------------------------------------ */
/*  Character sheet — 10 frames at 16x16 native                        */
/* ------------------------------------------------------------------ */

function drawCharacterSheet(
  scene: any,
  key: string,
  body: number,
  shade: number,
  head: number,
) {
  const t = NATIVE_TILE;
  const sheetW = t * FRAME_COUNT;
  const g = scene.add.graphics();

  for (let f = 0; f < FRAME_COUNT; f++) {
    drawCharFrame(g, f * t, t, f, body, shade, head);
  }

  g.generateTexture(key, sheetW, t);
  g.destroy();

  const tex = scene.textures.get(key);
  for (let f = 0; f < FRAME_COUNT; f++) {
    tex.add(f, 0, f * t, 0, t, t);
  }
}

/**
 * Draw a single character frame — 16x16 native pixels.
 * Inspired by the C64 Lode Runner stick-figure aesthetic.
 *
 * Layout:
 *   row 1-4:   head (4x4) at cols 6-9
 *   row 5-9:   torso + arms
 *   row 10-14: legs
 *   row 15:    feet
 */
function drawCharFrame(
  g: any,
  ox: number,
  _t: number,
  frame: number,
  body: number,
  shade: number,
  head: number,
) {
  const px = (x: number, y: number, w: number, h: number, col: number) => {
    g.fillStyle(col, 1);
    g.fillRect(ox + x, y, w, h);
  };

  // Head — 4x4 golden top
  px(6, 1, 4, 4, head);
  // Eyes (2 black pixels)
  px(7, 2, 1, 1, 0x000000);
  px(8, 2, 1, 1, 0x000000);

  switch (frame) {
    case FRAMES.IDLE: {
      px(6, 5, 4, 5, body);                    // torso
      px(5, 6, 1, 3, body); px(10, 6, 1, 3, body); // arms
      px(6, 10, 2, 5, body); px(8, 10, 2, 5, body); // legs
      px(5, 14, 2, 1, shade); px(9, 14, 2, 1, shade); // feet
      break;
    }
    case FRAMES.RUN_A: {
      px(6, 5, 4, 5, body);
      px(4, 7, 2, 3, body);   // forward arm
      px(10, 7, 2, 3, body);  // back arm
      px(5, 10, 2, 4, body); px(4, 13, 2, 1, shade);
      px(9, 10, 2, 4, body); px(10, 13, 2, 1, shade);
      break;
    }
    case FRAMES.RUN_B: {
      px(6, 5, 4, 5, body);
      px(10, 7, 2, 3, body);
      px(4, 7, 2, 3, body);
      px(7, 10, 2, 4, body); px(7, 13, 2, 1, shade);
      px(8, 10, 1, 4, body); px(8, 13, 1, 1, shade);
      break;
    }
    case FRAMES.CLIMB_A: {
      px(5, 0, 2, 5, body); px(9, 0, 2, 5, body); // arms up
      px(7, 5, 2, 5, body);                       // narrow torso
      px(5, 10, 2, 5, body); px(9, 10, 2, 5, body); // legs spread
      break;
    }
    case FRAMES.CLIMB_B: {
      px(5, 1, 2, 4, body); px(9, 1, 2, 4, body);
      px(7, 5, 2, 5, body);
      px(6, 10, 2, 5, body); px(8, 10, 2, 5, body);
      break;
    }
    case FRAMES.ROPE_A: {
      px(5, 0, 2, 4, body); px(9, 0, 2, 4, body); // arms gripping bar
      px(6, 4, 4, 5, body);
      px(6, 9, 2, 5, body); px(8, 9, 2, 5, body);
      break;
    }
    case FRAMES.ROPE_B: {
      px(5, 0, 2, 4, body); px(9, 0, 2, 4, body);
      px(6, 4, 4, 5, body);
      px(7, 9, 2, 5, body); px(9, 9, 2, 5, body);
      break;
    }
    case FRAMES.FALL: {
      px(6, 5, 4, 5, body);
      px(3, 6, 2, 2, body); px(11, 6, 2, 2, body);
      px(4, 10, 2, 4, body); px(10, 10, 2, 4, body);
      break;
    }
    case FRAMES.DIG_LEFT: {
      px(6, 6, 4, 4, body);
      px(2, 9, 2, 3, body);
      px(11, 7, 2, 3, body);
      px(6, 10, 2, 5, body); px(8, 10, 2, 5, body);
      break;
    }
    case FRAMES.DIG_RIGHT: {
      px(6, 6, 4, 4, body);
      px(12, 9, 2, 3, body);
      px(3, 7, 2, 3, body);
      px(6, 10, 2, 5, body); px(8, 10, 2, 5, body);
      break;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Mappings + predicates                                              */
/* ------------------------------------------------------------------ */

export function charToTile(ch: string): TileKind | null {
  switch (ch) {
    case '.': case ' ': return TileKind.EMPTY;
    case '#': return TileKind.BRICK;
    case '@': return TileKind.CONCRETE;
    case 'H': return TileKind.LADDER;
    case '-': return TileKind.ROPE;
    case '$': return TileKind.GOLD;
    case 'E': return TileKind.EXIT_LADDER;
    case 'P': return TileKind.EMPTY;
    case 'G': return TileKind.EMPTY;
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
