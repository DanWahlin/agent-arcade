// VaultRunner — Lode Runner-inspired tile-grid puzzle platformer.
//
// Mechanics: dig holes left/right to trap guards, climb ladders, traverse
// ropes, collect all gold, then climb the revealed exit ladder. 5 hand-crafted
// levels, programmatic graphics, BFS guard AI.

declare const Phaser: any;

import { BaseScene, W, H } from './BaseScene.js';
import {
  TileKind,
  GRID_COLS,
  GRID_ROWS,
  GuardState,
  type ParsedLevel,
  type PlayerState,
  type GuardEntity,
} from './vault-runner/types.js';
import {
  TEX,
  C64,
  FRAMES,
  generateTextures,
  tileTexture,
  isPassable,
  isClimbable,
} from './vault-runner/tiles.js';
import {
  LEVELS,
  parseLevel,
  validateLevel,
} from './vault-runner/levels.js';
import { HoleManager, HOLE_TOTAL_MS } from './vault-runner/holeManager.js';
import { nextStep, type Direction } from './vault-runner/guardAI.js';

const HUD_PAD = 80;             // reserved space for top HUD
const PLAYER_MOVE_SPEED = 6;    // tiles/sec
const PLAYER_CLIMB_SPEED = 5;
const PLAYER_FALL_SPEED = 12;
const GUARD_MOVE_SPEED = 3.5;
const GUARD_AI_INTERVAL = 200;  // ms between BFS recomputes
const PLAYER_INVINCIBLE_AFTER_DEATH = 1500; // ms
const PLAYER_INVINCIBLE_AT_LEVEL_START = 3000; // ms — player gets a moment to orient
const TIME_BONUS_START = 5000;
const TIME_BONUS_DURATION_MS = 60_000; // bonus decays to 0 over 60s
const GOLD_SCORE = 100;
const LEVEL_CLEAR_SCORE = 1000;
const GUARD_KILL_SCORE = 250;

/**
 * Test fixture: a tiny 28x16 level with one guard and one gold. Used by
 * playwright tests for deterministic AI behavior. NOT exposed to players.
 */
const TEST_FIXTURES: Record<string, string[]> = {
  simple: [
    'E...........................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '...P....$...G...............',
    '############################',
    '############################',
  ],
  ladder: [
    'E...........................',
    '............................',
    '......H.....................',
    '......H.....................',
    '......H.....................',
    '......H.....................',
    '......H.....................',
    '......H.....................',
    '......H.....................',
    '......H.....................',
    '......H.....................',
    '......H.....................',
    '......H.....................',
    '...P..H..$..................',
    '############################',
    '############################',
  ],
  rope: [
    'E...........................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '...---------------..........',
    '...P............$...........',
    '############################',
    '############################',
  ],
  dig: [
    'E...........................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '...P.$......................',
    '############################',
    '############################',
  ],
  bridge: [
    // Two-row floor at rows 13/14 with bricks. Player at col 4 row 13, guard
    // pre-positioned at col 7 row 13. Player digs col 6 row 14 (X), the guard
    // chases player → falls in the hole → becomes a temporary platform.
    // Player then steps onto the trapped guard and continues rightward.
    'E...........................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '...P...G..................$.',
    '############################',
    '############################',
  ],
};

interface LoadedLevel extends ParsedLevel {
  /** Working grid — tiles change as gold is collected, holes dug, etc. */
  grid: TileKind[][];
}

export class VaultRunnerScene extends BaseScene {
  // --- Layout (recomputed on create) ---
  private tileSize = 0;
  private originX = 0;
  private originY = 0;

  // --- Game state ---
  private currentLevelIdx = 0;
  private goldRemaining = 0;
  private exitRevealed = false;
  private levelComplete = false;
  private gameOverTriggered = false;
  private levelStartTime = 0;
  private bonusFrozen = 0;             // bonus value when level ended
  private levelData!: LoadedLevel;

  // --- Display objects ---
  /** Re-rendered each loadLevel — sprite per tile cell. Indexed [row * GRID_COLS + col]. */
  private tileSprites: any[] = [];
  /** Player sprite (publicly named for test compatibility with helpers.ts). */
  player!: any;
  private playerState!: PlayerState;
  private guards: GuardEntity[] = [];
  /** Background grid graphic — drawn once per loadLevel. */
  private bgGrid: any = null;
  /** Animation frame tick counter — drives 2-frame run cycle timing. */
  private animTick = 0;
  /** Tracked tweens so we can stop them on level reload / shutdown. */
  private trackedTweens: any[] = [];

  // --- Subsystems ---
  private holeManager!: HoleManager;

  // --- Input ---
  private cursors!: any;
  private keyZ!: any;
  private keyX!: any;

  constructor() { super('vault-runner'); }

  get displayName() { return 'Vault Runner'; }

  protected getDescription() {
    return 'Dig holes to trap guards, grab all the gold, escape via the ladder.';
  }

  protected getControls() {
    return [
      { key: '← →', action: 'Move' },
      { key: '↑ ↓', action: 'Climb / Drop' },
      { key: 'Z', action: 'Dig Left' },
      { key: 'X', action: 'Dig Right' },
    ];
  }

  preload() {
    // Reuse Vircon32 SFX from the cosmic-rocks game (CC-BY 4.0).
    this.load.audio('vr_dig', '../assets/cosmic-rocks/sounds/sfx_twoTone.ogg');
    this.load.audio('vr_gold', '../assets/cosmic-rocks/sounds/sfx_laser1.ogg');
    this.load.audio('vr_die', '../assets/cosmic-rocks/sounds/sfx_lose.ogg');
    this.load.audio('vr_kill', '../assets/cosmic-rocks/sounds/sfx_explosion.ogg');
  }

  create() {
    this.initBase();

    // Reset state
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.currentLevelIdx = 0;
    this.gameOverTriggered = false;
    this.guards = [];
    this.tileSprites = [];
    this.loadHighScore();
    this.syncScoreToHUD();
    this.syncLivesToHUD();
    this.syncLevelToHUD(this.level);

    this.computeLayout();
    generateTextures(this, this.tileSize);

    // Subsystems
    this.holeManager = new HoleManager({
      getTile: (c, r) => this.levelData.grid[r][c],
      setTile: (c, r, k) => this.setTileKind(c, r, k),
      onActorCrushed: (c, r) => this.handleActorCrushed(c, r),
      isPlayerAt: (c, r) => this.playerState.col === c && this.playerState.row === r,
      isGuardAt: (c, r) => this.guards.some(g => g.col === c && g.row === r),
    });

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keyZ = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.keyX = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);

    this.loadLevel(0);

    // Test hooks (no production impact)
    (window as any).__vaultRunnerLoadFixture = (name: string) => {
      const rows = TEST_FIXTURES[name];
      if (!rows) throw new Error(`Unknown fixture: ${name}`);
      this.loadLevelFromRows(rows);
    };
    (window as any).__vaultRunnerGetState = () => this.getDebugState();

    // Show ready screen LAST. Snapshot bonus start when player begins.
    this.startWithReadyScreen(() => {
      this.levelStartTime = this.time.now;
    });
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  private computeLayout() {
    const usableH = H - HUD_PAD;
    this.tileSize = Math.floor(Math.min(W / GRID_COLS, usableH / GRID_ROWS));
    const gridW = this.tileSize * GRID_COLS;
    const gridH = this.tileSize * GRID_ROWS;
    this.originX = Math.floor((W - gridW) / 2);
    this.originY = HUD_PAD + Math.floor((usableH - gridH) / 2);
  }

  private tileWorldX(col: number) { return this.originX + col * this.tileSize + this.tileSize / 2; }
  private tileWorldY(row: number) { return this.originY + row * this.tileSize + this.tileSize / 2; }

  // ── Level loading ─────────────────────────────────────────────────────────

  private loadLevel(idx: number) {
    if (idx >= LEVELS.length) {
      this.handleVictory();
      return;
    }
    this.currentLevelIdx = idx;
    this.level = idx + 1;
    this.syncLevelToHUD(this.level);
    this.loadLevelFromRows(LEVELS[idx]);
  }

  private loadLevelFromRows(rows: string[]) {
    const parsed = parseLevel(rows);
    const v = validateLevel(rows, parsed);
    if (!v.ok) {
      // eslint-disable-next-line no-console
      console.error('VaultRunner: invalid level layout', v.errors);
    }

    // Tear down previous level
    for (const s of this.tileSprites) if (s) s.destroy();
    this.tileSprites = [];
    for (const g of this.guards) if (g.sprite) g.sprite.destroy();
    this.guards = [];
    for (const tw of this.trackedTweens) { try { tw.stop(); } catch { /* ignore */ } }
    this.trackedTweens = [];
    if (this.bgGrid) { this.bgGrid.destroy(); this.bgGrid = null; }
    this.holeManager.reset();
    this.exitRevealed = false;
    this.levelComplete = false;

    this.levelData = parsed;
    this.goldRemaining = parsed.goldCount;

    this.drawBackground();

    // Render initial tiles. Hide EXIT_LADDER sprites until revealed.
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const kind = parsed.grid[r][c];
        const idx = r * GRID_COLS + c;
        const tex = tileTexture(kind);
        if (!tex) { this.tileSprites[idx] = null; continue; }
        const sp = this.add.image(this.tileWorldX(c), this.tileWorldY(r), tex);
        sp.setDisplaySize(this.tileSize, this.tileSize);
        sp.setDepth(1);
        if (kind === TileKind.EXIT_LADDER) sp.setVisible(false);
        if (kind === TileKind.GOLD) this.attachGoldSparkle(sp);
        this.tileSprites[idx] = sp;
      }
    }

    // Player — animated sprite using the generated character sheet
    this.playerState = {
      col: parsed.playerSpawn.col,
      row: parsed.playerSpawn.row,
      ox: 0, oy: 0,
      facing: 1,
      invincible: PLAYER_INVINCIBLE_AT_LEVEL_START,
      alive: true,
    };
    if (this.player) this.player.destroy();
    this.player = this.add.sprite(
      this.tileWorldX(this.playerState.col),
      this.tileWorldY(this.playerState.row),
      TEX.PLAYER_SHEET,
      FRAMES.IDLE,
    );
    this.player.setDisplaySize(this.tileSize, this.tileSize);
    this.player.setDepth(10);

    // Guards — animated sprites
    for (let i = 0; i < parsed.guardSpawns.length; i++) {
      const sp = parsed.guardSpawns[i];
      const sprite = this.add.sprite(this.tileWorldX(sp.col), this.tileWorldY(sp.row), TEX.GUARD_SHEET, FRAMES.IDLE);
      sprite.setDisplaySize(this.tileSize, this.tileSize);
      sprite.setDepth(9);
      this.guards.push({
        col: sp.col, row: sp.row, ox: 0, oy: 0,
        state: GuardState.CHASING,
        aiCooldown: 0, moveCooldown: 0, trappedTimer: 0,
        spawnIdx: i, sprite,
      });
    }

    this.levelStartTime = this.time.now;
  }

  /** Draw the background grid + vignette behind the playfield. */
  private drawBackground() {
    const g = this.add.graphics();
    g.setDepth(-50);
    const gridW = this.tileSize * GRID_COLS;
    const gridH = this.tileSize * GRID_ROWS;
    // soft vignette panel
    g.fillStyle(C64.BG_VIGNETTE, 1);
    g.fillRect(this.originX - 8, this.originY - 8, gridW + 16, gridH + 16);
    g.fillStyle(C64.BG, 1);
    g.fillRect(this.originX, this.originY, gridW, gridH);
    // grid lines
    g.lineStyle(1, C64.BG_GRID, 0.7);
    for (let c = 0; c <= GRID_COLS; c++) {
      const x = this.originX + c * this.tileSize;
      g.beginPath(); g.moveTo(x, this.originY); g.lineTo(x, this.originY + gridH); g.strokePath();
    }
    for (let r = 0; r <= GRID_ROWS; r++) {
      const y = this.originY + r * this.tileSize;
      g.beginPath(); g.moveTo(this.originX, y); g.lineTo(this.originX + gridW, y); g.strokePath();
    }
    this.bgGrid = g;
  }

  /** Add a subtle pulse tween to a gold tile sprite. */
  private attachGoldSparkle(sp: any) {
    const tw = this.tweens.add({
      targets: sp,
      alpha: { from: 1, to: 0.6 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
    this.trackedTweens.push(tw);
  }

  // ── Tile helpers ──────────────────────────────────────────────────────────

  private setTileKind(col: number, row: number, kind: TileKind) {
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return;
    this.levelData.grid[row][col] = kind;

    const idx = row * GRID_COLS + col;
    const old = this.tileSprites[idx];
    if (old) { old.destroy(); this.tileSprites[idx] = null; }

    const tex = tileTexture(kind);
    if (tex) {
      const sp = this.add.image(this.tileWorldX(col), this.tileWorldY(row), tex);
      sp.setDisplaySize(this.tileSize, this.tileSize);
      sp.setDepth(1);
      this.tileSprites[idx] = sp;
    }
  }

  private tileAt(col: number, row: number): TileKind {
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return TileKind.CONCRETE;
    return this.levelData.grid[row][col];
  }

  private isHoleAt(col: number, row: number): boolean {
    return this.holeManager.isHole(col, row);
  }

  /** Whether a guard is currently trapped in the hole at (col, row). */
  private isTrappedGuardAt(col: number, row: number): boolean {
    for (const g of this.guards) {
      if (g.state === GuardState.TRAPPED && g.col === col && g.row === row) return true;
    }
    return false;
  }

  /** Whether (col, row) is a tile an actor can stand on top of (or hang from). */
  private hasSupport(col: number, row: number): boolean {
    const here = this.tileAt(col, row);
    if (here === TileKind.LADDER || here === TileKind.ROPE) return true;
    if (this.isHoleAt(col, row)) return false; // standing in a hole = no support
    const below = this.tileAt(col, row + 1);
    if (this.isHoleAt(col, row + 1)) {
      // Hole below — but a trapped guard fills the hole and acts as a temporary
      // platform (classic Lode Runner: you can run across guards stuck in holes).
      return this.isTrappedGuardAt(col, row + 1);
    }
    return below === TileKind.BRICK || below === TileKind.CONCRETE || below === TileKind.LADDER;
  }

  /** Whether actor can move horizontally into target tile. */
  private canEnter(col: number, row: number): boolean {
    return isPassable(this.tileAt(col, row));
  }

  // ── Player update ─────────────────────────────────────────────────────────

  private updatePlayer(dt: number) {
    const ps = this.playerState;
    if (!ps.alive) return;

    if (ps.invincible > 0) ps.invincible = Math.max(0, ps.invincible - dt);

    const here = this.tileAt(ps.col, ps.row);
    const below = this.tileAt(ps.col, ps.row + 1);

    const left = this.cursors.left?.isDown;
    const right = this.cursors.right?.isDown;
    const up = this.cursors.up?.isDown;
    const down = this.cursors.down?.isDown;

    // Determine action priorities. Vertical takes precedence on ladders.
    const onLadder = isClimbable(here);
    const onRope = here === TileKind.ROPE;
    const supported = this.hasSupport(ps.col, ps.row);
    const ladderBelow = isClimbable(below);

    // Falling check: no support, not on ladder, not on rope -> fall
    const isFalling = !supported && !onLadder && !onRope;

    if (isFalling) {
      this.fallStep(ps, dt);
    } else if (up && (onLadder || ladderBelow)) {
      // Climb up — only if currently on ladder or there's a ladder below
      // (the "below" case lets the player grab a ladder from above).
      if (isClimbable(here)) {
        this.moveTowards(ps, ps.col, ps.row - 1, PLAYER_CLIMB_SPEED, dt);
      } else if (ps.oy > -this.tileSize / 4) {
        // not yet on ladder; can't climb up from non-ladder tile
      }
    } else if (down) {
      // Drop from rope, or climb down ladder, or descend through ladder below
      if (onRope || onLadder || ladderBelow || this.isHoleAt(ps.col, ps.row + 1)) {
        this.moveTowards(ps, ps.col, ps.row + 1, PLAYER_CLIMB_SPEED, dt);
      }
    } else if (left) {
      ps.facing = -1;
      if (this.canEnter(ps.col - 1, ps.row)) {
        this.moveTowards(ps, ps.col - 1, ps.row, PLAYER_MOVE_SPEED, dt);
      }
    } else if (right) {
      ps.facing = 1;
      if (this.canEnter(ps.col + 1, ps.row)) {
        this.moveTowards(ps, ps.col + 1, ps.row, PLAYER_MOVE_SPEED, dt);
      }
    } else {
      // Idle — snap toward tile center on rope/ladder
      this.snapToCenter(ps, dt);
    }

    // Sync sprite + animation frame
    this.player.x = this.tileWorldX(ps.col) + ps.ox;
    this.player.y = this.tileWorldY(ps.row) + ps.oy;
    this.player.setFlipX(ps.facing === -1);

    const moving = !!(left || right || up || down);
    this.player.setFrame(this.pickCharFrame({
      onLadder, onRope, isFalling, moving, vertical: !!(up || down),
    }));
    // Subtle blink during invincibility
    if (ps.invincible > 0) {
      this.player.setAlpha(Math.floor(this.time.now / 80) % 2 === 0 ? 0.4 : 1);
    } else if (this.player.alpha !== 1) {
      this.player.setAlpha(1);
    }

    // Tile-cell entry effects (gold, exit)
    if (Math.abs(ps.ox) < 1 && Math.abs(ps.oy) < 1) {
      const t = this.tileAt(ps.col, ps.row);
      if (t === TileKind.GOLD) {
        this.collectGold(ps.col, ps.row);
      } else if (t === TileKind.EXIT_LADDER && ps.row === 0 && this.exitRevealed) {
        this.advanceLevel();
      }
    }

    // Dig input — use Phaser's JustDown (edge-detected, robust to fast key presses)
    if (Phaser.Input.Keyboard.JustDown(this.keyZ)) this.tryDig(-1);
    if (Phaser.Input.Keyboard.JustDown(this.keyX)) this.tryDig(1);
  }

  private moveTowards(ps: PlayerState, targetCol: number, targetRow: number, speed: number, dt: number) {
    const dx = targetCol - ps.col;
    const dy = targetRow - ps.row;
    const step = (speed * this.tileSize * dt) / 1000;

    if (dx !== 0) {
      ps.ox += dx * step;
      // crossed center -> commit to new tile
      if (dx > 0 && ps.ox >= this.tileSize / 2) {
        ps.col = targetCol; ps.ox -= this.tileSize;
      } else if (dx < 0 && ps.ox <= -this.tileSize / 2) {
        ps.col = targetCol; ps.ox += this.tileSize;
      }
    }
    if (dy !== 0) {
      ps.oy += dy * step;
      if (dy > 0 && ps.oy >= this.tileSize / 2) {
        ps.row = targetRow; ps.oy -= this.tileSize;
      } else if (dy < 0 && ps.oy <= -this.tileSize / 2) {
        ps.row = targetRow; ps.oy += this.tileSize;
      }
    }
  }

  private fallStep(ps: PlayerState, dt: number) {
    const step = (PLAYER_FALL_SPEED * this.tileSize * dt) / 1000;
    ps.oy += step;
    if (ps.oy >= this.tileSize / 2) {
      ps.row += 1;
      ps.oy -= this.tileSize;
    }
  }

  private snapToCenter(ps: PlayerState, dt: number) {
    const speed = (PLAYER_MOVE_SPEED * this.tileSize * dt) / 1000;
    if (Math.abs(ps.ox) > 1) ps.ox -= Math.sign(ps.ox) * Math.min(speed, Math.abs(ps.ox));
    if (Math.abs(ps.oy) > 1) ps.oy -= Math.sign(ps.oy) * Math.min(speed, Math.abs(ps.oy));
  }

  // ── Digging ───────────────────────────────────────────────────────────────

  private tryDig(direction: -1 | 1) {
    const ps = this.playerState;
    if (!ps.alive) return;
    // Must be standing on solid ground (not falling, climbing, on rope)
    const here = this.tileAt(ps.col, ps.row);
    if (isClimbable(here) || here === TileKind.ROPE) return;
    if (!this.hasSupport(ps.col, ps.row)) return;
    // Must be roughly tile-aligned
    if (Math.abs(ps.ox) > this.tileSize * 0.3 || Math.abs(ps.oy) > this.tileSize * 0.3) return;

    const tc = ps.col + direction;
    const tr = ps.row + 1;
    if (this.holeManager.dig(tc, tr)) {
      this.sfx('vr_dig', 0.4);
      this.spawnBrickChunks(this.tileWorldX(tc), this.tileWorldY(tr));
      // Briefly show dig pose
      this.player.setFrame(direction < 0 ? FRAMES.DIG_LEFT : FRAMES.DIG_RIGHT);
    }
  }

  private spawnBrickChunks(x: number, y: number) {
    try {
      const emitter = this.add.particles(x, y, TEX.PARTICLE, {
        speed: { min: 60, max: 200 },
        angle: { min: 200, max: 340 },
        gravityY: 600,
        scale: { start: 1, end: 0.2 },
        lifespan: 600,
        quantity: 12,
        tint: C64.PARTICLE_BRICK,
        emitting: false,
      });
      emitter.setDepth(20);
      emitter.explode(12);
      this.activeEmitters.push(emitter);
      this.time.delayedCall(700, () => {
        const idx = this.activeEmitters.indexOf(emitter);
        if (idx >= 0) this.activeEmitters.splice(idx, 1);
        emitter.destroy();
      });
    } catch { /* particles unavailable */ }
  }

  // ── Gold / exit ───────────────────────────────────────────────────────────

  private collectGold(col: number, row: number) {
    const wx = this.tileWorldX(col);
    const wy = this.tileWorldY(row);
    this.setTileKind(col, row, TileKind.EMPTY);
    this.goldRemaining -= 1;
    this.addScore(GOLD_SCORE, wx, wy);
    this.sfx('vr_gold', 0.3);
    this.spawnGoldSparkle(wx, wy);
    if (this.goldRemaining <= 0 && !this.exitRevealed) {
      this.revealExit();
    }
  }

  private spawnGoldSparkle(x: number, y: number) {
    try {
      const emitter = this.add.particles(x, y, TEX.PARTICLE, {
        speed: { min: 40, max: 140 },
        angle: { min: 0, max: 360 },
        scale: { start: 1.4, end: 0 },
        lifespan: 500,
        quantity: 14,
        tint: C64.PARTICLE_GOLD,
        emitting: false,
      });
      emitter.setDepth(20);
      emitter.explode(14);
      this.activeEmitters.push(emitter);
      this.time.delayedCall(600, () => {
        const idx = this.activeEmitters.indexOf(emitter);
        if (idx >= 0) this.activeEmitters.splice(idx, 1);
        emitter.destroy();
      });
    } catch { /* ignore */ }
  }

  private revealExit() {
    this.exitRevealed = true;
    for (const col of this.levelData.exitColumns) {
      const idx = 0 * GRID_COLS + col;
      const sprite = this.tileSprites[idx];
      if (!sprite) continue;
      sprite.setVisible(true);
      // Pulse the exit ladder; also add a soft glow halo behind it
      const halo = this.add.image(sprite.x, sprite.y, TEX.EXIT);
      halo.setDisplaySize(this.tileSize * 1.6, this.tileSize * 1.4);
      halo.setTint(C64.EXIT_GLOW);
      halo.setAlpha(0.25);
      halo.setDepth(0);
      const tw1 = this.tweens.add({
        targets: sprite,
        alpha: { from: 0.5, to: 1 },
        duration: 500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
      const tw2 = this.tweens.add({
        targets: halo,
        alpha: { from: 0.15, to: 0.45 },
        scale: { from: 1, to: 1.15 },
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
      this.trackedTweens.push(tw1, tw2);
    }
    // Burst of sparkle particles centered on the level
    this.spawnGoldSparkle(W / 2, this.originY + this.tileSize * 1.5);
  }

  private advanceLevel() {
    if (this.levelComplete) return;
    this.levelComplete = true;
    const bonus = this.computeTimeBonus();
    this.bonusFrozen = bonus;
    this.addScore(LEVEL_CLEAR_SCORE + bonus);

    // Brief visual pause then load next
    this.time.delayedCall(800, () => {
      if (!this.scene.isActive()) return;
      this.loadLevel(this.currentLevelIdx + 1);
    });
  }

  private handleVictory() {
    if (this.gameOverTriggered) return;
    this.gameOverTriggered = true;
    this.showGameOver(this.score, () => this.scene.restart());
  }

  // ── Guards ────────────────────────────────────────────────────────────────

  private updateGuards(dt: number) {
    if (!this.playerState.alive) return;
    const playerPos = { col: this.playerState.col, row: this.playerState.row };

    for (const g of this.guards) {
      // If trapped in a hole, count down
      if (g.state === GuardState.TRAPPED) {
        g.trappedTimer -= dt;
        if (!this.holeManager.isHole(g.col, g.row)) {
          // Hole regenerated under us -> handled by handleActorCrushed via callback
          // Or we walked out (via ladder adjacency) — re-enter chase
          g.state = GuardState.CHASING;
        }
        continue;
      }

      // Falling check (no support)
      if (!this.hasSupport(g.col, g.row)) {
        const fallStep = (PLAYER_FALL_SPEED * this.tileSize * dt) / 1000;
        g.oy += fallStep;
        if (g.oy >= this.tileSize / 2) {
          g.row += 1;
          g.oy -= this.tileSize;
        }
        // Check if we just landed in a hole
        if (this.holeManager.isHole(g.col, g.row)) {
          g.state = GuardState.TRAPPED;
          g.trappedTimer = HOLE_TOTAL_MS;
        }
        g.sprite.x = this.tileWorldX(g.col) + g.ox;
        g.sprite.y = this.tileWorldY(g.row) + g.oy;
        g.sprite.setFrame(FRAMES.FALL);
        continue;
      }

      // Recompute path occasionally
      g.aiCooldown -= dt;
      if (g.aiCooldown <= 0) {
        const dir = nextStep(
          { getTile: (c, r) => this.tileAt(c, r) },
          { col: g.col, row: g.row },
          playerPos,
        );
        (g as any)._dir = dir;
        g.aiCooldown = GUARD_AI_INTERVAL;
      }

      const dir = (g as any)._dir as Direction;
      this.guardStep(g, dir, dt);

      g.sprite.x = this.tileWorldX(g.col) + g.ox;
      g.sprite.y = this.tileWorldY(g.row) + g.oy;

      // Pick guard frame based on current movement context
      const here = this.tileAt(g.col, g.row);
      const onLadder = isClimbable(here);
      const onRope = here === TileKind.ROPE;
      const moving = dir !== 'stay';
      g.sprite.setFrame(this.pickCharFrame({
        onLadder, onRope, isFalling: false, moving,
        vertical: dir === 'up' || dir === 'down',
      }));
      if (dir === 'left') g.sprite.setFlipX(true);
      else if (dir === 'right') g.sprite.setFlipX(false);
    }

    // Player-guard collision
    this.checkGuardCollision();
  }

  /** Decide which sprite-sheet frame to display for current actor state. */
  private pickCharFrame(s: {
    onLadder: boolean; onRope: boolean; isFalling: boolean; moving: boolean; vertical: boolean;
  }): number {
    if (s.isFalling) return FRAMES.FALL;
    if (s.onRope) {
      if (!s.moving) return FRAMES.ROPE_A;
      return Math.floor(this.time.now / 150) % 2 === 0 ? FRAMES.ROPE_A : FRAMES.ROPE_B;
    }
    if (s.onLadder && s.vertical) {
      return Math.floor(this.time.now / 140) % 2 === 0 ? FRAMES.CLIMB_A : FRAMES.CLIMB_B;
    }
    if (s.onLadder) return FRAMES.CLIMB_A;
    if (s.moving) {
      return Math.floor(this.time.now / 110) % 2 === 0 ? FRAMES.RUN_A : FRAMES.RUN_B;
    }
    return FRAMES.IDLE;
  }

  private guardStep(g: GuardEntity, dir: Direction, dt: number) {
    if (dir === 'stay') return;
    const step = (GUARD_MOVE_SPEED * this.tileSize * dt) / 1000;

    if (dir === 'left' || dir === 'right') {
      const sign = dir === 'left' ? -1 : 1;
      const targetCol = g.col + sign;
      // Block on solid
      if (!isPassable(this.tileAt(targetCol, g.row))) return;
      g.ox += sign * step;
      if (sign > 0 && g.ox >= this.tileSize / 2) { g.col = targetCol; g.ox -= this.tileSize; }
      else if (sign < 0 && g.ox <= -this.tileSize / 2) { g.col = targetCol; g.ox += this.tileSize; }
    } else if (dir === 'up') {
      // Only if we're on a ladder
      if (this.tileAt(g.col, g.row) !== TileKind.LADDER) return;
      const targetRow = g.row - 1;
      if (!isPassable(this.tileAt(g.col, targetRow))) return;
      g.oy -= step;
      if (g.oy <= -this.tileSize / 2) { g.row = targetRow; g.oy += this.tileSize; }
    } else if (dir === 'down') {
      const targetRow = g.row + 1;
      if (!isPassable(this.tileAt(g.col, targetRow))) return;
      g.oy += step;
      if (g.oy >= this.tileSize / 2) {
        g.row = targetRow; g.oy -= this.tileSize;
        if (this.holeManager.isHole(g.col, g.row)) {
          g.state = GuardState.TRAPPED;
          g.trappedTimer = HOLE_TOTAL_MS;
        }
      }
    }
  }

  private checkGuardCollision() {
    if (this.playerState.invincible > 0) return;
    const px = this.player.x, py = this.player.y;
    const r = this.tileSize * 0.4;
    for (const g of this.guards) {
      if (g.state === GuardState.TRAPPED) continue;
      const dx = g.sprite.x - px, dy = g.sprite.y - py;
      if (dx * dx + dy * dy < r * r) {
        this.killPlayer();
        return;
      }
    }
  }

  /** Called when an actor is crushed by hole regen. */
  private handleActorCrushed(col: number, row: number) {
    if (this.playerState.col === col && this.playerState.row === row) {
      this.killPlayer();
      return;
    }
    for (const g of this.guards) {
      if (g.col === col && g.row === row) {
        this.killGuard(g);
        return;
      }
    }
  }

  private killGuard(g: GuardEntity) {
    this.addScore(GUARD_KILL_SCORE, g.sprite.x, g.sprite.y);
    this.sfx('vr_kill', 0.3);
    this.spawnDeathBurst(g.sprite.x, g.sprite.y, C64.GUARD);
    // Respawn at original spawn tile
    const spawn = this.levelData.guardSpawns[g.spawnIdx];
    g.col = spawn.col; g.row = spawn.row; g.ox = 0; g.oy = 0;
    g.state = GuardState.CHASING;
    g.aiCooldown = 0; g.trappedTimer = 0;
    g.sprite.x = this.tileWorldX(g.col);
    g.sprite.y = this.tileWorldY(g.row);
    g.sprite.setFrame(FRAMES.IDLE);
  }

  private spawnDeathBurst(x: number, y: number, tint: number) {
    try {
      const emitter = this.add.particles(x, y, TEX.PARTICLE, {
        speed: { min: 80, max: 220 },
        angle: { min: 0, max: 360 },
        scale: { start: 1.4, end: 0 },
        lifespan: 700,
        quantity: 18,
        tint,
        emitting: false,
      });
      emitter.setDepth(20);
      emitter.explode(18);
      this.activeEmitters.push(emitter);
      this.time.delayedCall(800, () => {
        const idx = this.activeEmitters.indexOf(emitter);
        if (idx >= 0) this.activeEmitters.splice(idx, 1);
        emitter.destroy();
      });
    } catch { /* ignore */ }
  }

  // ── Death ─────────────────────────────────────────────────────────────────

  private killPlayer() {
    if (!this.playerState.alive) return;
    this.playerState.alive = false;
    this.lives -= 1;
    this.syncLivesToHUD();
    this.sfx('vr_die', 0.4);
    this.spawnDeathBurst(this.player.x, this.player.y, C64.PARTICLE_DEATH);

    if (this.lives <= 0) {
      this.time.delayedCall(800, () => {
        if (!this.scene.isActive()) return;
        if (this.gameOverTriggered) return;
        this.gameOverTriggered = true;
        this.showGameOver(this.score, () => this.scene.restart());
      });
      return;
    }

    // Respawn at spawn tile after brief pause
    this.time.delayedCall(800, () => {
      if (!this.scene.isActive()) return;
      const sp = this.levelData.playerSpawn;
      this.playerState.col = sp.col;
      this.playerState.row = sp.row;
      this.playerState.ox = 0;
      this.playerState.oy = 0;
      this.playerState.invincible = PLAYER_INVINCIBLE_AFTER_DEATH;
      this.playerState.alive = true;
      this.player.x = this.tileWorldX(sp.col);
      this.player.y = this.tileWorldY(sp.row);
    });
  }

  // ── HUD / time bonus ──────────────────────────────────────────────────────

  private computeTimeBonus(): number {
    const elapsed = Math.max(0, this.time.now - this.levelStartTime);
    const t = Math.min(1, elapsed / TIME_BONUS_DURATION_MS);
    return Math.floor(TIME_BONUS_START * (1 - t));
  }

  // ── Sound ─────────────────────────────────────────────────────────────────

  private sfx(key: string, volume = 0.3) {
    try { this.sound.play(key, { volume }); } catch { /* ignore */ }
  }

  // ── Test surface ──────────────────────────────────────────────────────────

  private getDebugState() {
    return {
      level: this.level,
      currentLevelIdx: this.currentLevelIdx,
      goldRemaining: this.goldRemaining,
      exitRevealed: this.exitRevealed,
      levelComplete: this.levelComplete,
      holeCount: this.holeManager.count,
      guardCount: this.guards.length,
      guardsTrapped: this.guards.filter(g => g.state === GuardState.TRAPPED).length,
      playerCol: this.playerState?.col ?? -1,
      playerRow: this.playerState?.row ?? -1,
      playerAlive: this.playerState?.alive ?? false,
      timeBonus: this.computeTimeBonus(),
    };
  }

  // ── Phaser lifecycle ──────────────────────────────────────────────────────

  update(_time: number, delta: number) {
    if (!this.levelData) return;
    const dt = Math.min(50, delta);
    this.holeManager.update(dt);
    this.updatePlayer(dt);
    this.updateGuards(dt);
  }

  /** Override BaseScene shutdown. Cleans up test hooks and display objects. */
  shutdown() {
    try {
      delete (window as any).__vaultRunnerLoadFixture;
      delete (window as any).__vaultRunnerGetState;
    } catch { /* ignore */ }
    for (const tw of this.trackedTweens) { try { tw.stop(); } catch { /* ignore */ } }
    this.trackedTweens = [];
    if (this.bgGrid) { this.bgGrid.destroy(); this.bgGrid = null; }
    for (const s of this.tileSprites) if (s) s.destroy();
    this.tileSprites = [];
    for (const g of this.guards) if (g.sprite) g.sprite.destroy();
    this.guards = [];
    if (this.player) { this.player.destroy(); this.player = null; }
    if (this.holeManager) this.holeManager.reset();
    super.shutdown();
  }
}
