// PixelPlumberScene — side-scrolling SMB-style gameplay.
// Extracted from the original monolithic game.ts and refactored to
// extend BaseScene for the multi-game architecture.

declare const Phaser: any;

import { BaseScene, W, H } from './BaseScene.js';
import {
  ENEMY_COLORS,
  ENEMY_CUTS,
  ROW_BASE_Y,
  type EnemyColor,
  type EnemyCutName,
  texKey,
} from '../sprite-atlas.js';

const BLOCK = 32;
const MARIO_W = 32;
const MARIO_H = 48;
const BIG_MARIO_H = 64;
const GROUND_Y = H - 48;
const SPAWN_X = 600;

export class PixelPlumberScene extends BaseScene {
  // Input
  private cursors!: any;
  private keys!: { space: any; shift: any; f: any; z: any };

  // Mario state
  private mario!: any;
  private isBig = false;
  private facingRight = true;
  private invincible = 90;
  private shrinkTimer = 0;
  private stompGrace = 0;
  private dead = false;
  private deadTimer = 0;
  private lives = 3;
  private lastSafeX = SPAWN_X;
  private fireCooldown = 0;
  // Jump tracking — manual edge detection is more reliable on macOS than
  // Phaser's JustDown when multiple keys are held simultaneously.
  private jumpKeyWasDown = false;
  private coyoteTime = 0;     // ms left where we can still jump after leaving ground
  private jumpBuffer = 0;     // ms left where a queued jump press will fire on landing

  // Animation: cycle the run frame based on distance traveled, not wall time,
  // so step rhythm matches actual movement speed.
  private runDistance = 0;

  // Generation
  private genX = 0;

  // Groups
  private groundGroup!: any;
  private brickGroup!: any;
  private qblockGroup!: any;
  private pipeGroup!: any;
  private coinGroup!: any;
  private mushroomGroup!: any;
  private fireballGroup!: any;
  private enemyGroup!: any;

  private gaps: { start: number; end: number }[] = [];
  private piranhaGroup!: any;
  private warping = false;
  private parachuteMode = false;
  private parachuteSprite?: any;
  private parachuteFlyingEnemies: any[] = [];
  private parachuteTimer = 0;

  constructor() { super('pixel-plumber'); }

  get displayName() { return 'Pixel Plumber'; }

  preload() {
    // NES Mario spritesheets — 6 frames each, uniform cell sizes.
    // Frame order: 0=idle, 1=walk1, 2=walk2, 3=walk3, 4=skid, 5=jump
    this.load.spritesheet('mario_small', '../assets/sprites/mario_small_sheet.png', {
      frameWidth: 16, frameHeight: 16,
    });
    this.load.spritesheet('mario_big', '../assets/sprites/mario_big_sheet.png', {
      frameWidth: 16, frameHeight: 32,
    });
    this.load.image('enemies_sheet', '../assets/enemies.png');
  }

  create() {
    this.makeBlockTextures();
    this.makeEnemyTextures();

    this.physics.world.setBounds(0, 0, 1_000_000, H);

    this.groundGroup = this.physics.add.staticGroup();
    this.brickGroup = this.physics.add.staticGroup();
    this.qblockGroup = this.physics.add.staticGroup();
    this.pipeGroup = this.physics.add.staticGroup();
    this.coinGroup = this.physics.add.group({ allowGravity: false });
    this.mushroomGroup = this.physics.add.group();
    this.fireballGroup = this.physics.add.group();
    this.enemyGroup = this.physics.add.group();
    this.piranhaGroup = this.physics.add.group({ allowGravity: false });

    // Initial ground
    this.extendGround(0, W * 2);

    // Mario — spritesheet frame 0 = idle
    this.mario = this.physics.add.sprite(SPAWN_X, GROUND_Y - 200, 'mario_small', 0);
    this.mario.setOrigin(0.5, 1);
    this.mario.setDisplaySize(MARIO_W, MARIO_H);
    // Physics body fills the full cell so Mario's head hits blocks above.
    this.mario.body.setSize(12, 16);
    this.mario.body.setOffset(2, 0);
    this.mario.setMaxVelocity(700, 900);
    this.mario.body.setGravityY(1800);
    this.mario.setDepth(10);

    // Phaser animations — frame indices: 0=idle, 1=walk1, 2=walk2, 3=walk3, 4=skid, 5=jump
    // Classic NES 3-frame walk cycle: walk1 → walk2 → walk3 (repeating)
    this.anims.create({
      key: 'small_walk',
      frames: this.anims.generateFrameNumbers('mario_small', { frames: [1, 2, 3] }),
      frameRate: 10,
      repeat: -1,
    });
    this.anims.create({
      key: 'big_walk',
      frames: this.anims.generateFrameNumbers('mario_big', { frames: [1, 2, 3] }),
      frameRate: 10,
      repeat: -1,
    });

    // Camera
    this.cameras.main.setBounds(0, 0, 1_000_000, H);
    this.cameras.main.startFollow(this.mario, true, 0.15, 0.05, -W * 0.2, 0);
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

    // Colliders
    this.physics.add.collider(this.mario, this.groundGroup);
    this.physics.add.collider(this.mario, this.brickGroup, this.onMarioHitBrick, undefined, this);
    this.physics.add.collider(this.mario, this.qblockGroup, this.onMarioHitQBlock, undefined, this);
    this.physics.add.collider(this.mario, this.pipeGroup);

    this.physics.add.collider(this.enemyGroup, this.groundGroup);
    this.physics.add.collider(this.enemyGroup, this.brickGroup);
    this.physics.add.collider(this.enemyGroup, this.qblockGroup);
    this.physics.add.collider(this.enemyGroup, this.pipeGroup);
    this.physics.add.overlap(this.enemyGroup, this.enemyGroup, this.onEnemyVsEnemy, undefined, this);

    this.physics.add.collider(this.mushroomGroup, this.groundGroup);
    this.physics.add.collider(this.mushroomGroup, this.brickGroup);
    this.physics.add.collider(this.mushroomGroup, this.qblockGroup);
    this.physics.add.collider(this.mushroomGroup, this.pipeGroup);

    this.physics.add.collider(this.fireballGroup, this.groundGroup, this.onFireballHitSolid, undefined, this);
    this.physics.add.collider(this.fireballGroup, this.brickGroup, this.onFireballHitSolid, undefined, this);
    this.physics.add.collider(this.fireballGroup, this.qblockGroup, this.onFireballHitSolid, undefined, this);
    this.physics.add.collider(this.fireballGroup, this.pipeGroup, this.onFireballHitSolid, undefined, this);

    this.physics.add.overlap(this.mario, this.coinGroup, this.onMarioCoin, undefined, this);
    this.physics.add.overlap(this.mario, this.mushroomGroup, this.onMarioMushroom, undefined, this);
    this.physics.add.overlap(this.mario, this.enemyGroup, this.onMarioEnemy, undefined, this);
    this.physics.add.overlap(this.fireballGroup, this.enemyGroup, this.onFireballEnemy, undefined, this);
    this.physics.add.overlap(this.mario, this.piranhaGroup, this.onMarioPiranha, undefined, this);

    // Input
    this.input.keyboard.addCapture('UP,DOWN,LEFT,RIGHT,SPACE,SHIFT,F,Z');
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = {
      space: this.input.keyboard.addKey('SPACE'),
      shift: this.input.keyboard.addKey('SHIFT'),
      f: this.input.keyboard.addKey('F'),
      z: this.input.keyboard.addKey('Z'),
    };

    // Pause bridge: called from index.html when user presses Esc / clicks resume.
    // Pauses the Phaser scene + sound, and asks main to enable click-through.
    (window as any).__agentBreakPause = (shouldPause: boolean) => {
      const ab = (window as any).agentBreak;
      if (shouldPause) {
        this.pauseGame();
      } else {
        this.resumeGame();
      }
      if (ab && ab.setClickThrough) ab.setClickThrough(shouldPause);
      if (ab && ab.setPaused) ab.setPaused(shouldPause);
    };

    // Allow the main process to force-resume (e.g., via global ⌃⌥M).
    const ab = (window as any).agentBreak;
    if (ab && ab.onResumeRequest) {
      ab.onResumeRequest(() => {
        const hud = document.getElementById('hud');
        if (hud) hud.classList.remove('paused');
        this.resumeGame();
        if (ab.setClickThrough) ab.setClickThrough(false);
        if (ab.setPaused) ab.setPaused(false);
      });
    }

    this.generateLevel(SPAWN_X + 400, W + 600);
    this.syncLivesToHUD();
  }

  // ---------- Brick / block textures generated at runtime via Graphics ----------
  private makeBlockTextures() {
    const g = this.add.graphics();
    // Brick (orange / dark outline)
    g.clear();
    g.fillStyle(0xb8732e); g.fillRect(0, 0, BLOCK, BLOCK);
    g.fillStyle(0x000000); g.fillRect(0, 0, BLOCK, 2); g.fillRect(0, BLOCK / 2 - 1, BLOCK, 2);
    g.fillRect(0, BLOCK - 2, BLOCK, 2);
    g.fillRect(0, 0, 2, BLOCK); g.fillRect(BLOCK / 2 - 1, 0, 2, BLOCK / 2);
    g.fillRect(BLOCK / 4 - 1, BLOCK / 2, 2, BLOCK / 2);
    g.fillRect((3 * BLOCK) / 4 - 1, BLOCK / 2, 2, BLOCK / 2);
    g.generateTexture('brick', BLOCK, BLOCK);

    // Q-block (yellow with ?)
    g.clear();
    g.fillStyle(0xeab63a); g.fillRect(0, 0, BLOCK, BLOCK);
    g.fillStyle(0xc7892a); g.fillRect(0, 0, BLOCK, 3); g.fillRect(0, BLOCK - 3, BLOCK, 3);
    g.fillRect(0, 0, 3, BLOCK); g.fillRect(BLOCK - 3, 0, 3, BLOCK);
    g.fillStyle(0x4a2a08);
    g.fillRect(BLOCK / 2 - 3, BLOCK / 2 - 8, 8, 3);
    g.fillRect(BLOCK / 2 + 3, BLOCK / 2 - 5, 3, 5);
    g.fillRect(BLOCK / 2 - 1, BLOCK / 2, 4, 3);
    g.fillRect(BLOCK / 2 - 1, BLOCK / 2 + 6, 4, 3);
    g.generateTexture('qblock', BLOCK, BLOCK);

    // Used Q-block (brown/empty)
    g.clear();
    g.fillStyle(0xa56a26); g.fillRect(0, 0, BLOCK, BLOCK);
    g.fillStyle(0x6e4715); g.fillRect(0, 0, BLOCK, 3); g.fillRect(0, BLOCK - 3, BLOCK, 3);
    g.fillRect(0, 0, 3, BLOCK); g.fillRect(BLOCK - 3, 0, 3, BLOCK);
    g.generateTexture('qblock_used', BLOCK, BLOCK);

    // Ground block
    g.clear();
    g.fillStyle(0xb8732e); g.fillRect(0, 0, BLOCK, BLOCK);
    g.fillStyle(0x6e4715); g.fillRect(0, 0, BLOCK, 2);
    g.fillStyle(0x000000); g.fillRect(BLOCK / 2 - 1, 0, 2, BLOCK);
    g.fillRect(0, BLOCK / 2 - 1, BLOCK, 2);
    g.generateTexture('ground', BLOCK, BLOCK);

    // Pipe body (2 blocks wide)
    g.clear();
    g.fillStyle(0x20a010); g.fillRect(0, 0, BLOCK * 2, BLOCK);
    g.fillStyle(0x00680c); g.lineStyle(2, 0x00680c); g.strokeRect(0, 0, BLOCK * 2, BLOCK);
    g.fillStyle(0x80e080); g.fillRect(BLOCK / 3 + 4, 0, 4, BLOCK);
    g.generateTexture('pipe_body', BLOCK * 2, BLOCK);

    // Coin frames
    g.clear();
    g.fillStyle(0xffd24a); g.fillCircle(8, 12, 6);
    g.fillStyle(0xb88a1f); g.fillRect(7, 5, 2, 14);
    g.generateTexture('coin0', 16, 24);
    g.clear();
    g.fillStyle(0xffd24a); g.fillRect(6, 5, 4, 14);
    g.fillStyle(0xb88a1f); g.fillRect(7, 5, 2, 14);
    g.generateTexture('coin1', 16, 24);

    // Mushroom
    g.clear();
    g.fillStyle(0xd02020); g.fillRect(2, 2, 28, 16);
    g.fillStyle(0xffffff); g.fillRect(8, 6, 6, 6); g.fillRect(18, 6, 6, 6);
    g.fillStyle(0xf0d8a0); g.fillRect(6, 18, 20, 12);
    g.fillStyle(0x000000); g.fillRect(11, 22, 3, 4); g.fillRect(18, 22, 3, 4);
    g.generateTexture('mushroom', 32, 32);

    // Fireball
    g.clear();
    g.fillStyle(0xff8000); g.fillCircle(8, 8, 7);
    g.fillStyle(0xffe080); g.fillCircle(6, 6, 3);
    g.generateTexture('fireball', 16, 16);

    // Piranha plant frame 0 (mouth closed)
    g.clear();
    g.fillStyle(0x22aa22);
    g.fillRect(11, 16, 10, 16);
    g.fillStyle(0xdd2020);
    g.fillEllipse(16, 10, 24, 16);
    g.fillStyle(0xffffff);
    g.fillCircle(10, 8, 2); g.fillCircle(16, 6, 2); g.fillCircle(22, 8, 2);
    g.generateTexture('piranha_0', 32, 32);

    // Piranha plant frame 1 (mouth open)
    g.clear();
    g.fillStyle(0x22aa22);
    g.fillRect(11, 18, 10, 14);
    g.fillStyle(0xdd2020);
    g.fillEllipse(16, 10, 26, 18);
    g.fillStyle(0xffffff);
    g.fillCircle(10, 7, 2); g.fillCircle(16, 5, 2); g.fillCircle(22, 7, 2);
    g.fillStyle(0x000000);
    g.fillRect(8, 12, 16, 3);
    g.generateTexture('piranha_1', 32, 32);

    // Warp pipe (lighter green with down arrow)
    g.clear();
    g.fillStyle(0x30c030); g.fillRect(0, 0, BLOCK * 2, BLOCK);
    g.fillStyle(0x10a010); g.lineStyle(2, 0x10a010); g.strokeRect(0, 0, BLOCK * 2, BLOCK);
    g.fillStyle(0xa0ffa0); g.fillRect(BLOCK / 3 + 4, 0, 4, BLOCK);
    g.fillStyle(0xffffff);
    g.fillTriangle(BLOCK, 4, BLOCK - 6, BLOCK / 2 - 4, BLOCK + 6, BLOCK / 2 - 4);
    g.generateTexture('pipe_warp', BLOCK * 2, BLOCK);

    // Golden pipe (parachute trigger)
    g.clear();
    g.fillStyle(0xdaa520); g.fillRect(0, 0, BLOCK * 2, BLOCK);
    g.fillStyle(0xb8860b); g.lineStyle(2, 0xb8860b); g.strokeRect(0, 0, BLOCK * 2, BLOCK);
    g.fillStyle(0xffd700); g.fillRect(BLOCK / 3 + 4, 0, 4, BLOCK);
    g.fillStyle(0xffffff);
    g.fillTriangle(BLOCK, BLOCK / 2 - 2, BLOCK - 5, BLOCK / 2 + 6, BLOCK + 5, BLOCK / 2 + 6);
    g.generateTexture('pipe_gold', BLOCK * 2, BLOCK);

    // Parachute canopy — large dome with red/white stripes and long strings
    g.clear();
    const cw = 64, ch = 80;
    // Dome at top
    g.fillStyle(0xff2020);
    g.fillEllipse(cw / 2, 14, cw - 4, 28);
    // White stripes
    g.fillStyle(0xffffff);
    g.fillRect(8, 4, 8, 20);
    g.fillRect(24, 2, 8, 22);
    g.fillRect(40, 4, 8, 20);
    // Rim
    g.lineStyle(2, 0x880000);
    g.strokeEllipse(cw / 2, 14, cw - 4, 28);
    // Long strings from canopy down to bottom center
    g.lineStyle(1, 0x654321);
    g.lineBetween(6, 24, cw / 2, ch - 2);
    g.lineBetween(cw / 4, 22, cw / 2, ch - 2);
    g.lineBetween(cw / 2, 20, cw / 2, ch - 2);
    g.lineBetween((3 * cw) / 4, 22, cw / 2, ch - 2);
    g.lineBetween(cw - 6, 24, cw / 2, ch - 2);
    g.generateTexture('parachute', cw, ch);

    g.destroy();
  }

  private makeEnemyTextures() {
    const sheet = this.textures.get('enemies_sheet').getSourceImage() as HTMLImageElement;
    const cut = (key: string, x: number, y: number, w: number, h: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sheet, x, y, w, h, 0, 0, w, h);
      this.textures.addImage(key, canvas as any);
    };
    // Generate every named sprite for every color row from the atlas.
    // Texture key: `${color}_${name}` e.g. "green_koopa_0".
    const cutNames = Object.keys(ENEMY_CUTS) as EnemyCutName[];
    for (const color of ENEMY_COLORS) {
      const baseY = ROW_BASE_Y[color];
      for (const name of cutNames) {
        const c = ENEMY_CUTS[name];
        cut(texKey(color, name), c.x, baseY + c.dy, c.w, c.h);
      }
    }
    // Legacy short keys still referenced elsewhere in this file.
    const alias = (key: string, color: EnemyColor, name: EnemyCutName) => {
      const c = ENEMY_CUTS[name];
      cut(key, c.x, ROW_BASE_Y[color] + c.dy, c.w, c.h);
    };
    alias('goomba_0',     'brown', 'goomba_0');
    alias('goomba_1',     'brown', 'goomba_1');
    alias('goomba_flat',  'brown', 'goomba_flat');
    alias('koopa_0',      'green', 'koopa_0');
    alias('koopa_1',      'green', 'koopa_1');
    alias('rkoopa_0',     'red',   'koopa_0');
    alias('rkoopa_1',     'red',   'koopa_1');
    alias('koopa_shell',  'green', 'koopa_shell_0');
    alias('rkoopa_shell', 'red',   'koopa_shell_0');
  }

  private makeShellTexture(key: string, fill: number, stroke: number) {
    const w = 28, h = 22;
    const g = this.add.graphics();
    g.fillStyle(stroke, 1);
    g.fillEllipse(w / 2, h / 2 + 1, w, h);
    g.fillStyle(fill, 1);
    g.fillEllipse(w / 2, h / 2, w - 4, h - 4);
    // Shell rim/highlight
    g.fillStyle(0xffffff, 0.35);
    g.fillEllipse(w / 2 - 4, h / 2 - 4, 10, 4);
    // Spike pattern
    g.fillStyle(stroke, 1);
    for (let i = -1; i <= 1; i++) {
      g.fillTriangle(w / 2 + i * 7, h / 2 - 3, w / 2 + i * 7 - 2, h / 2 + 3, w / 2 + i * 7 + 2, h / 2 + 3);
    }
    g.generateTexture(key, w, h);
    g.destroy();
  }

  private extendGround(fromX: number, toX: number) {
    for (let x = Math.floor(fromX / BLOCK) * BLOCK; x < toX; x += BLOCK) {
      if (this.isInGap(x + BLOCK / 2)) continue;
      // skip if already there
      const exists = (this.groundGroup.getChildren() as any[]).some((g: any) =>
        Math.abs(g.x - (x + BLOCK / 2)) < 1
      );
      if (exists) continue;
      const g = this.groundGroup.create(x + BLOCK / 2, GROUND_Y + BLOCK / 2, 'ground') as any;
      g.refreshBody();
    }
  }

  private isInGap(wx: number): boolean {
    for (const gap of this.gaps) {
      if (wx >= gap.start && wx < gap.end) return true;
    }
    return false;
  }

  private generateLevel(lo: number, hi: number) {
    let x = Math.max(lo, this.genX);
    while (x < hi) {
      x += (3 + Math.floor(Math.random() * 4)) * BLOCK;
      const r = Math.random();
      if (r < 0.11) {
        const n = 3 + Math.floor(Math.random() * 2);
        const y = GROUND_Y - BLOCK * 3;
        const qi = Math.floor(Math.random() * n);
        for (let i = 0; i < n; i++) {
          const bx = x + i * BLOCK;
          if (i === qi) {
            const q = this.qblockGroup.create(bx + BLOCK / 2, y + BLOCK / 2, 'qblock') as any;
            q.setData('hit', false); q.setData('reward', 'coin');
            q.refreshBody();
          } else {
            const b = this.brickGroup.create(bx + BLOCK / 2, y + BLOCK / 2, 'brick') as any;
            b.refreshBody();
          }
        }
        x += n * BLOCK;
      } else if (r < 0.17) {
        const q = this.qblockGroup.create(x + BLOCK / 2, GROUND_Y - BLOCK * 3 + BLOCK / 2, 'qblock') as any;
        q.setData('hit', false); q.setData('reward', 'mushroom');
        q.refreshBody();
        x += BLOCK;
      } else if (r < 0.22) {
        const q = this.qblockGroup.create(x + BLOCK / 2, GROUND_Y - BLOCK * 3 + BLOCK / 2, 'qblock') as any;
        q.setData('hit', false); q.setData('reward', 'coin');
        q.refreshBody();
        x += BLOCK;
      } else if (r < 0.35) {
        this.spawnEnemy('goomba', x);
        x += BLOCK * 2;
      } else if (r < 0.46) {
        this.spawnEnemy('koopa', x);
        x += BLOCK * 2;
      } else if (r < 0.54) {
        this.spawnEnemy('rkoopa', x);
        x += BLOCK * 2;
      } else if (r < 0.61) {
        this.spawnEnemy('goomba', x);
        x += BLOCK * 2;
      } else if (r < 0.67) {
        const h = 2 + Math.floor(Math.random() * 3);
        for (let step = 0; step < h; step++) {
          const b = this.brickGroup.create(
            x + step * BLOCK + BLOCK / 2,
            GROUND_Y - (step + 1) * BLOCK + BLOCK / 2,
            'brick'
          ) as any;
          b.refreshBody();
        }
        x += h * BLOCK;
      } else if (r < 0.73) {
        for (let i = 0; i < 3; i++) {
          const cy = GROUND_Y - BLOCK * 2 - Math.floor(Math.sin((i / 2) * Math.PI) * BLOCK);
          const c = this.coinGroup.create(x + i * BLOCK + BLOCK / 2, cy + BLOCK / 2, 'coin0') as any;
          c.body.setAllowGravity(false);
          c.body.setSize(12, 18);
        }
        x += 3 * BLOCK;
      } else if (r < 0.81) {
        // pipe
        const ph = (2 + Math.floor(Math.random() * 2)) * BLOCK;
        const pw = 2 * BLOCK;
        const py = GROUND_Y - ph;
        const isGold = Math.random() < 0.30; // 30% for testing (lower later)
        const isWarp = !isGold && Math.random() < 0.4;
        let topSeg: any = null;
        for (let yy = py; yy < GROUND_Y; yy += BLOCK) {
          const isTop = yy === py;
          const tex = isTop && isGold ? 'pipe_gold' : isTop && isWarp ? 'pipe_warp' : 'pipe_body';
          const seg = this.pipeGroup.create(x + pw / 2, yy + BLOCK / 2, tex) as any;
          seg.refreshBody();
          if (isTop) topSeg = seg;
        }
        if (topSeg) {
          if (isWarp) topSeg.setData('warp', true);
          if (isGold) topSeg.setData('gold', true);
        }
        // Piranha plant on regular pipes (~60% chance)
        if (!isWarp && !isGold && Math.random() < 0.6) {
          const p = this.piranhaGroup.create(x + pw / 2, py - 8, 'piranha_0') as any;
          p.setOrigin(0.5, 1);
          p.setDisplaySize(BLOCK * 0.8, BLOCK);
          p.body.setAllowGravity(false);
          p.setData('pipeX', x + pw / 2);
          p.setData('pipeTopY', py);
          p.setData('timer', Math.random() * 4000);
          p.setData('exposed', false);
          p.setVisible(false);
        }
        x += pw;
      } else if (r < 0.87) {
        const gapW = (3 + Math.floor(Math.random() * 2)) * BLOCK;
        this.gaps.push({ start: x, end: x + gapW });
        (this.groundGroup.getChildren() as any[]).forEach((g: any) => {
          if (g.x >= x && g.x < x + gapW) g.destroy();
        });
        x += gapW;
      } else if (r < 0.90) {
        // Elevated bridge with enemy — 3 blocks up (reachable with a jump)
        const bridgeLen = 4 + Math.floor(Math.random() * 3);
        const bridgeY = GROUND_Y - BLOCK * 3;
        for (let i = 0; i < bridgeLen; i++) {
          const b = this.brickGroup.create(x + i * BLOCK + BLOCK / 2, bridgeY + BLOCK / 2, 'brick') as any;
          b.refreshBody();
        }
        this.spawnEnemyAt('goomba', x + BLOCK, bridgeY - BLOCK / 2);
        x += bridgeLen * BLOCK;
      } else if (r < 0.93) {
        // Multi-tier platform
        const lowerY = GROUND_Y - BLOCK * 3;
        for (let i = 0; i < 4; i++) {
          if (i === 1) {
            const q = this.qblockGroup.create(x + i * BLOCK + BLOCK / 2, lowerY + BLOCK / 2, 'qblock') as any;
            q.setData('hit', false); q.setData('reward', 'coin');
            q.refreshBody();
          } else {
            const b = this.brickGroup.create(x + i * BLOCK + BLOCK / 2, lowerY + BLOCK / 2, 'brick') as any;
            b.refreshBody();
          }
        }
        const upperY = GROUND_Y - BLOCK * 5;
        for (let i = 1; i <= 2; i++) {
          const b = this.brickGroup.create(x + i * BLOCK + BLOCK / 2, upperY + BLOCK / 2, 'brick') as any;
          b.refreshBody();
        }
        const c = this.coinGroup.create(x + 1.5 * BLOCK + BLOCK / 2, upperY - BLOCK / 2, 'coin0') as any;
        c.body.setAllowGravity(false);
        c.body.setSize(12, 18);
        x += 4 * BLOCK;
      } else if (r < 0.95) {
        // Descending staircase
        const h = 2 + Math.floor(Math.random() * 3);
        for (let step = 0; step < h; step++) {
          const b = this.brickGroup.create(
            x + step * BLOCK + BLOCK / 2,
            GROUND_Y - (h - step) * BLOCK + BLOCK / 2,
            'brick'
          ) as any;
          b.refreshBody();
        }
        x += h * BLOCK;
      } else if (r < 0.97) {
        // Mixed brick/qblock cluster
        const clusterLen = 5;
        const clusterY = GROUND_Y - BLOCK * 3;
        const qPositions = new Set<number>();
        const qCount = 1 + Math.floor(Math.random() * 2);
        while (qPositions.size < qCount) {
          qPositions.add(Math.floor(Math.random() * clusterLen));
        }
        for (let i = 0; i < clusterLen; i++) {
          if (qPositions.has(i)) {
            const q = this.qblockGroup.create(x + i * BLOCK + BLOCK / 2, clusterY + BLOCK / 2, 'qblock') as any;
            q.setData('hit', false); q.setData('reward', 'coin');
            q.refreshBody();
          } else {
            const b = this.brickGroup.create(x + i * BLOCK + BLOCK / 2, clusterY + BLOCK / 2, 'brick') as any;
            b.refreshBody();
          }
        }
        x += clusterLen * BLOCK;
      }
    }
    this.genX = Math.max(this.genX, x);
    this.extendGround(0, this.genX + W);
  }

  private spawnEnemy(kind: 'goomba' | 'koopa' | 'rkoopa', x: number) {
    const tex = kind === 'goomba' ? 'goomba_0' : kind === 'koopa' ? 'koopa_0' : 'rkoopa_0';
    const h = kind === 'goomba' ? BLOCK : BLOCK + 16;
    const e = this.enemyGroup.create(x + BLOCK / 2, GROUND_Y, tex) as any;
    e.setOrigin(0.5, 1);
    e.setDisplaySize(BLOCK, h);
    // Explicit gravity so enemies always fall — don't rely on world gravity.
    e.body.setGravityY(1800);
    e.body.setAllowGravity(true);
    e.setVelocityX(-90);
    e.setBounceX(1);
    e.setCollideWorldBounds(false);
    e.setData('kind', kind);
    e.setData('state', 'walk');
    e.setData('timer', 0);
  }

  private spawnEnemyAt(kind: 'goomba' | 'koopa' | 'rkoopa', x: number, y: number) {
    const tex = kind === 'goomba' ? 'goomba_0' : kind === 'koopa' ? 'koopa_0' : 'rkoopa_0';
    const h = kind === 'goomba' ? BLOCK : BLOCK + 16;
    const e = this.enemyGroup.create(x, y, tex) as any;
    e.setOrigin(0.5, 1);
    e.setDisplaySize(BLOCK, h);
    e.body.setGravityY(1800);
    e.body.setAllowGravity(true);
    e.setVelocityX(-90);
    e.setBounceX(1);
    e.setCollideWorldBounds(false);
    e.setData('kind', kind);
    e.setData('state', 'walk');
    e.setData('timer', 0);
  }

  update(_t: number, dtMs: number) {
    if (this.dead) {
      this.deadTimer -= dtMs;
      this.mario.setVelocityX(0);
      if (this.deadTimer <= 0) this.respawn();
      return;
    }

    if (this.warping) return;

    if (this.parachuteMode) {
      // Stop camera from following Mario — lock it in place
      this.cameras.main.stopFollow();

      if (this.parachuteSprite) {
        this.parachuteSprite.x = this.mario.x;
        // Bottom of parachute (origin 0.5,1) sits at Mario's head
        const marioH = this.isBig ? BIG_MARIO_H : MARIO_H;
        this.parachuteSprite.y = this.mario.y - marioH + 8;
      }

      // Steer left/right within screen bounds (no camera movement)
      const camX = this.cameras.main.scrollX;
      if (this.cursors.left.isDown) {
        this.mario.setVelocityX(-180);
      } else if (this.cursors.right.isDown) {
        this.mario.setVelocityX(180);
      } else {
        // Gentle wind drift
        this.mario.setVelocityX(Math.sin(this.time.now / 1200) * 40);
      }

      // Keep Mario within visible screen
      if (this.mario.x < camX + 30) this.mario.x = camX + 30;
      if (this.mario.x > camX + W - 30) this.mario.x = camX + W - 30;
      this.parachuteTimer += dtMs;
      if (this.parachuteTimer > 1500) {
        this.parachuteTimer = 0;
        const fromLeft = Math.random() < 0.5;
        const camX = this.cameras.main.scrollX;
        const ex = fromLeft ? camX - 20 : camX + W + 20;
        const ey = this.mario.y + (Math.random() - 0.3) * 200;
        const fe = this.enemyGroup.create(ex, ey, 'goomba_0') as any;
        fe.setOrigin(0.5, 0.5);
        fe.setDisplaySize(BLOCK, BLOCK);
        fe.body.setAllowGravity(false);
        fe.setVelocityX(fromLeft ? 150 : -150);
        fe.setData('kind', 'goomba');
        fe.setData('state', 'flying');
        fe.setData('timer', 0);
        this.parachuteFlyingEnemies.push(fe);
      }
      const pCamLeft = this.cameras.main.scrollX;
      this.parachuteFlyingEnemies = this.parachuteFlyingEnemies.filter(e => {
        if (!e.active) return false;
        if (e.x < pCamLeft - 100 || e.x > pCamLeft + W + 100) { e.destroy(); return false; }
        return true;
      });
      const pOnGround = this.mario.body.blocked.down || this.mario.body.touching.down;
      if (pOnGround && this.mario.y >= GROUND_Y - 10) {
        this.endParachute();
      }
      this.mario.anims.stop();
      this.mario.setFrame(5);
      if (this.cursors.left.isDown) this.mario.flipX = true;
      else if (this.cursors.right.isDown) this.mario.flipX = false;
      const targetH = this.isBig ? BIG_MARIO_H : MARIO_H;
      this.mario.setDisplaySize(MARIO_W, targetH);
      this.syncScoreToHUD();
      return;
    }

    if (this.invincible > 0) this.invincible -= dtMs * 0.06;
    if (this.shrinkTimer > 0) this.shrinkTimer -= dtMs * 0.06;
    if (this.stompGrace > 0) this.stompGrace -= dtMs * 0.06;
    if (this.fireCooldown > 0) this.fireCooldown -= dtMs * 0.06;

    const running = this.keys.shift.isDown;
    const maxSpeed = running ? 320 : 200;
    const accel = running ? 1100 : 800;

    if (this.cursors.left.isDown) {
      this.mario.setAccelerationX(-accel);
      this.facingRight = false;
      if (this.mario.body.velocity.x > 0) this.mario.setVelocityX(this.mario.body.velocity.x * 0.7);
    } else if (this.cursors.right.isDown) {
      this.mario.setAccelerationX(accel);
      this.facingRight = true;
      if (this.mario.body.velocity.x < 0) this.mario.setVelocityX(this.mario.body.velocity.x * 0.7);
    } else {
      this.mario.setAccelerationX(0);
      const v = this.mario.body.velocity.x;
      if (Math.abs(v) < 12) this.mario.setVelocityX(0);
      else this.mario.setVelocityX(v * 0.9);
    }

    if (this.mario.body.velocity.x > maxSpeed) this.mario.setVelocityX(maxSpeed);
    if (this.mario.body.velocity.x < -maxSpeed) this.mario.setVelocityX(-maxSpeed);

    const onGround = this.mario.body.blocked.down || this.mario.body.touching.down;
    if (onGround) this.coyoteTime = 100;
    else this.coyoteTime = Math.max(0, this.coyoteTime - dtMs);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dtMs);

    // Manual edge detection: Phaser's JustDown can miss key presses when
    // multiple keys are held on macOS. Track the previous-frame state ourselves.
    const jumpKeyDown = this.keys.space.isDown || this.cursors.up.isDown;
    const jumpJustPressed = jumpKeyDown && !this.jumpKeyWasDown;
    this.jumpKeyWasDown = jumpKeyDown;

    if (jumpJustPressed) this.jumpBuffer = 120;

    if (this.jumpBuffer > 0 && this.coyoteTime > 0) {
      this.mario.setVelocityY(-820);
      this.jumpBuffer = 0;
      this.coyoteTime = 0;
    }

    // Variable jump height: low gravity while ascending and key held.
    if (jumpKeyDown && this.mario.body.velocity.y < 0) {
      this.mario.body.setGravityY(900);
    } else {
      this.mario.body.setGravityY(1800);
    }

    if (this.isBig && this.fireCooldown <= 0 &&
        (Phaser.Input.Keyboard.JustDown(this.keys.f) || Phaser.Input.Keyboard.JustDown(this.keys.z))) {
      this.throwFireball();
      this.fireCooldown = 12;
    }

    const camLeft = this.cameras.main.scrollX;
    if (this.mario.x < camLeft) {
      this.mario.x = camLeft;
      this.mario.setVelocityX(0);
    }

    if (onGround && !this.isInGap(this.mario.x)) {
      this.lastSafeX = this.mario.x;
    }

    // Warp / golden pipe check — Mario must be standing ON TOP of the pipe
    if (onGround && this.cursors.down.isDown && !this.warping) {
      const pipes = this.pipeGroup.getChildren() as any[];
      for (const p of pipes) {
        if (!p.getData('warp') && !p.getData('gold')) continue;
        const pdx = Math.abs(this.mario.x - p.x);
        // Mario's feet (y with origin 0.5,1) should be at the pipe top edge
        const pipeTop = p.y - BLOCK / 2;
        const feetDelta = Math.abs(this.mario.y - pipeTop);
        // Also accept Mario standing at ground level next to a short pipe
        if (pdx < BLOCK * 1.5 && feetDelta < BLOCK) {
          if (p.getData('gold') && !this.parachuteMode) {
            this.startParachute(p);
          } else if (p.getData('warp')) {
            this.startWarp(p);
          }
          break;
        }
      }
    }

    if (this.mario.y > H + 50) {
      this.die();
      return;
    }

    const edge = this.cameras.main.scrollX + W + 600;
    if (edge > this.genX) this.generateLevel(this.genX, edge);

    const vx = this.mario.body.velocity.x;
    const speed = Math.abs(vx);
    // Player-intent direction this frame (from input). Used to detect skid.
    const left = this.cursors.left.isDown;
    const right = this.cursors.right.isDown;
    const intent = right ? 1 : left ? -1 : 0;
    const moveDir = vx > 5 ? 1 : vx < -5 ? -1 : 0;

    // Animation: use Phaser's anims system with the spritesheet.
    // Frame indices: 0=idle, 1=runA, 2=runB, 3=skid, 4=jump
    const sheetKey = this.isBig ? 'mario_big' : 'mario_small';
    const walkAnim = this.isBig ? 'big_walk' : 'small_walk';

    // Size: setDisplaySize keeps physics body scaling consistent
    const targetH = this.isBig ? BIG_MARIO_H : MARIO_H;
    this.mario.setDisplaySize(MARIO_W, targetH);

    // Ensure correct spritesheet texture when switching small ↔ big
    const expectedTexture = sheetKey;
    if (this.mario.texture.key !== expectedTexture) {
      this.mario.setTexture(expectedTexture, 0);
      // Update physics body for the new cell size
      if (this.isBig) {
        this.mario.body.setSize(12, 32);
        this.mario.body.setOffset(2, 0);
      } else {
        this.mario.body.setSize(12, 16);
        this.mario.body.setOffset(2, 0);
      }
    }

    if (!onGround) {
      this.mario.anims.stop();
      this.mario.setFrame(5); // jump
    } else if (intent !== 0 && moveDir !== 0 && intent !== moveDir && speed > 60) {
      this.mario.anims.stop();
      this.mario.setFrame(4); // skid
    } else if (speed > 20) {
      // Always call play — ignoreIfPlaying=true prevents restarts when
      // already running, but allows restart after anims.stop().
      this.mario.anims.play(walkAnim, true);
      // Scale animation speed with Mario's velocity for a natural feel.
      const animFps = Math.max(6, Math.min(20, speed / 20));
      this.mario.anims.msPerFrame = 1000 / animFps;
    } else {
      this.mario.anims.stop();
      this.mario.setFrame(0); // idle
    }

    // Face the input direction while skidding (so skid sprite looks "back"
    // toward old motion); otherwise face current motion / last facing.
    if (intent !== 0) this.facingRight = intent > 0;
    else if (moveDir !== 0) this.facingRight = moveDir > 0;
    this.mario.flipX = !this.facingRight;

    const blink = (this.invincible > 0 || this.shrinkTimer > 0) && Math.floor(this.time.now / 80) % 2 === 0;
    this.mario.setVisible(!blink);

    (this.coinGroup.getChildren() as any[]).forEach(c => {
      const i = Math.floor(this.time.now / 120) % 2;
      c.setTexture(`coin${i}`);
      if (c.x < camLeft - 100) c.destroy();
    });

    // Piranha plant animation
    (this.piranhaGroup.getChildren() as any[]).forEach((p: any) => {
      if (!p.active) return;
      let timer = p.getData('timer') + dtMs;
      const pipeTopY = p.getData('pipeTopY');
      const cycle = 4000;
      const phase = (timer % cycle) / cycle;
      const dx = Math.abs(this.mario.x - p.getData('pipeX'));
      if (dx < BLOCK * 2) {
        p.setVisible(false);
        p.body.enable = false;
        p.setData('timer', timer);
        return;
      }
      if (phase < 0.25) {
        const t = phase / 0.25;
        p.y = pipeTopY + BLOCK * (1 - t);
        p.setVisible(true);
        p.body.enable = true;
      } else if (phase < 0.5) {
        p.y = pipeTopY;
        p.setVisible(true);
        p.body.enable = true;
        p.setTexture(Math.floor(timer / 200) % 2 === 0 ? 'piranha_0' : 'piranha_1');
      } else if (phase < 0.75) {
        const t = (phase - 0.5) / 0.25;
        p.y = pipeTopY + BLOCK * t;
        p.setVisible(true);
        p.body.enable = true;
      } else {
        p.setVisible(false);
        p.body.enable = false;
      }
      p.setData('timer', timer);
      if (p.x < camLeft - 200) p.destroy();
    });

    (this.enemyGroup.getChildren() as any[]).forEach(e => this.updateEnemy(e, camLeft));

    (this.mushroomGroup.getChildren() as any[]).forEach(m => {
      if (m.x < camLeft - 100 || m.y > H + 100) m.destroy();
    });

    (this.fireballGroup.getChildren() as any[]).forEach(fb => {
      if (fb.x < camLeft - 100 || fb.x > camLeft + W + 200 || fb.y > H + 50) fb.destroy();
    });
  }

  private updateEnemy(e: any, camLeft: number) {
    if (!e.active) return;
    const state = e.getData('state');
    const kind = e.getData('kind');

    if (e.x < camLeft - BLOCK * 3) { e.destroy(); return; }
    if (e.y > H + 50) { e.destroy(); return; }
    if (!e.body) return;

    if (state === 'walk') {
      const i = Math.floor(this.time.now / 180) % 2;
      const texBase = kind === 'goomba' ? 'goomba' : kind === 'koopa' ? 'koopa' : 'rkoopa';
      e.setTexture(`${texBase}_${i}`);
      if (kind === 'rkoopa' && (e.body.blocked.down || e.body.touching.down)) {
        const ahead = e.x + (e.body.velocity.x > 0 ? BLOCK : -BLOCK);
        if (this.isInGap(ahead)) {
          e.setVelocityX(-e.body.velocity.x);
        }
      }
      e.flipX = e.body.velocity.x > 0;
    } else if (state === 'shell_still') {
      let timer = e.getData('timer') - 1;
      e.setData('timer', timer);
      if (timer <= 0) {
        e.setData('state', 'walk');
        e.setVelocityX(-90);
      }
    }
    // 'shell' (kicked) and 'dying' need no per-frame logic — physics + tweens handle them.
  }

  private onMarioHitBrick(_mario: any, brick: any) {
    if (!this.mario.body.touching.up) return;
    if (Math.abs(brick.x - this.mario.x) > BLOCK * 0.55) return;
    if (this.isBig) {
      brick.destroy();
      this.addScore(50, brick.x, brick.y - 20);
    } else {
      // Small Mario: bump animation only (no destruction)
      if (!brick.getData('bumping')) {
        brick.setData('bumping', true);
        const origY = brick.y;
        this.tweens.add({
          targets: brick, y: origY - 6, yoyo: true, duration: 80,
          onComplete: () => { brick.y = origY; brick.setData('bumping', false); }
        });
      }
    }
  }

  private onMarioHitQBlock(_mario: any, q: any) {
    if (q.getData('hit')) return;
    if (!this.mario.body.touching.up) return;
    if (Math.abs(q.x - this.mario.x) > BLOCK * 0.55) return;
    q.setData('hit', true);
    q.setTexture('qblock_used');
    this.tweens.add({ targets: q, y: q.y - 6, yoyo: true, duration: 100 });
    const reward = q.getData('reward');
    if (reward === 'mushroom' && !this.isBig) {
      const m = this.mushroomGroup.create(q.x, q.y - BLOCK, 'mushroom') as any;
      m.body.setSize(28, 28);
      m.setVelocityX(120);
      m.setBounceX(1);
      m.body.setMaxVelocity(200, 600);
    } else {
      this.popCoin(q.x, q.y);
      this.addScore(200, q.x, q.y - 20);
    }
  }

  private popCoin(x: number, y: number) {
    const c = this.add.image(x, y, 'coin0').setDepth(50);
    c.setDisplaySize(BLOCK * 0.7, BLOCK * 0.9);
    this.tweens.add({
      targets: c,
      y: y - BLOCK * 2.2,
      duration: 350,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: c, y: y - BLOCK * 1.6, alpha: 0,
          duration: 200, onComplete: () => c.destroy(),
        });
      },
    });
  }

  private onMarioCoin(_mario: any, c: any) {
    c.destroy();
    this.addScore(100, c.x, c.y);
  }

  private onMarioMushroom(_mario: any, m: any) {
    m.destroy();
    if (!this.isBig) {
      this.isBig = true;
      this.addScore(1000, this.mario.x, this.mario.y - 20);
    }
  }

  private onMarioEnemy(_mario: any, e: any) {
    if (this.invincible > 0 || this.stompGrace > 0 || this.shrinkTimer > 0) return;
    const state = e.getData('state');
    const kind = e.getData('kind');

    const marioBottom = this.mario.y;
    const enemyTop = e.y - e.displayHeight;
    const stomping = this.mario.body.velocity.y > 50 &&
                     marioBottom < enemyTop + e.displayHeight * 0.5;

    if (stomping) {
      this.mario.setVelocityY(-450);
      this.stompGrace = 25;
      if (kind === 'goomba') {
        this.killGoomba(e);
      } else if (state === 'walk') {
        this.becomeShell(e);
        this.addScore(200, e.x, e.y - 20);
      } else if (state === 'shell_still') {
        const dir = this.mario.x < e.x ? 1 : -1;
        e.setData('state', 'shell');
        e.setVelocityX(dir * 400);
        this.addScore(100, e.x, e.y - 20);
      } else if (state === 'shell') {
        e.setData('state', 'shell_still');
        e.setData('timer', 300);
        e.setVelocityX(0);
        this.addScore(100, e.x, e.y - 20);
      }
    } else if (state === 'shell_still') {
      const dir = this.mario.x < e.x ? 1 : -1;
      e.setData('state', 'shell');
      e.setVelocityX(dir * 400);
      this.stompGrace = 15;
      this.addScore(100, e.x, e.y - 20);
    } else {
      this.takeHit();
    }
  }

  // Replace the koopa with a fresh shell sprite. Trying to morph one Game
  // Object between two textures with different aspect ratios (18×42 koopa →
  // 28×22 shell) is fragile — we just destroy and respawn.
  private becomeShell(e: any) {
    const kind = e.getData('kind');
    const x = e.x;
    e.destroy();
    const tex = kind === 'rkoopa' ? 'rkoopa_shell' : 'koopa_shell';
    const shell = this.enemyGroup.create(x, GROUND_Y, tex) as any;
    shell.setOrigin(0.5, 1);
    shell.setDisplaySize(BLOCK, BLOCK * 0.7);
    shell.body.setGravityY(1800);
    shell.body.setAllowGravity(true);
    shell.setVelocityX(0);
    shell.setBounceX(1);
    shell.setCollideWorldBounds(false);
    shell.setData('kind', kind);
    shell.setData('state', 'shell_still');
    shell.setData('timer', 300);
  }

  // Goomba "death": disable the body so nothing collides with it again, fade
  // and shrink it visually, then destroy. No state-machine, no body resizing
  // hacks — this avoids the floating/misaligned-body bugs.
  private killGoomba(e: any) {
    e.setData('state', 'dying');
    e.disableBody(false, false);
    e.setTexture('goomba_flat');
    this.addScore(200, e.x, e.y - 20);
    this.tweens.add({
      targets: e,
      scaleY: 0.3,
      alpha: 0,
      duration: 250,
      onComplete: () => e.destroy(),
    });
  }

  private onEnemyVsEnemy(a: any, b: any) {
    const aState = a.getData('state');
    const bState = b.getData('state');
    if (aState === 'shell' && bState !== 'dying' && bState !== 'shell') {
      this.killByShell(b);
    } else if (bState === 'shell' && aState !== 'dying' && aState !== 'shell') {
      this.killByShell(a);
    }
  }

  private killByShell(e: any) {
    if (e.getData('kind') === 'goomba') {
      this.killGoomba(e);
    } else {
      // Koopa hit by shell: knock it offscreen with an upward arc.
      e.setData('state', 'dying');
      e.disableBody(false, false);
      this.addScore(100, e.x, e.y - 20);
      this.tweens.add({
        targets: e, y: e.y - 80, alpha: 0, angle: 360,
        duration: 500, onComplete: () => e.destroy(),
      });
    }
  }

  private onFireballHitSolid(fb: any, _solid: any) {
    if (fb.body.blocked.down) {
      fb.setVelocityY(-350);
    } else {
      fb.destroy();
    }
  }

  private onFireballEnemy(fb: any, e: any) {
    const st = e.getData('state');
    if (st === 'dying') return;
    fb.destroy();
    this.killByShell(e);
  }

  private throwFireball() {
    const dir = this.facingRight ? 1 : -1;
    const fb = this.fireballGroup.create(this.mario.x + dir * 20, this.mario.y + 20, 'fireball') as any;
    fb.body.setSize(14, 14);
    fb.setVelocityX(dir * 450);
    fb.setVelocityY(-100);
    fb.setBounceY(0.6);
  }

  private takeHit() {
    if (this.isBig) {
      this.isBig = false;
      this.shrinkTimer = 60;
    } else {
      this.die();
    }
  }

  private die() {
    if (this.dead) return;
    this.lives--;
    this.syncLivesToHUD();
    this.dead = true;
    this.deadTimer = 1200;
    this.mario.setVelocity(0, -500);
    this.mario.body.checkCollision.none = true;
    this.isBig = false;
    if (this.parachuteMode) this.endParachute();
  }

  private respawn() {
    if (this.lives <= 0) {
      // Game over — reset everything
      this.lives = 3;
      this.score = 0;
      this.syncScoreToHUD();
      this.syncLivesToHUD();
    }
    this.dead = false;
    let x = Math.max(this.lastSafeX, this.cameras.main.scrollX + 200);
    while (this.isInGap(x)) x += BLOCK;
    this.mario.setPosition(x, GROUND_Y - 100);
    this.mario.setVelocity(0, 0);
    this.mario.body.checkCollision.none = false;
    this.invincible = 90;
    this.shrinkTimer = 0;
    this.stompGrace = 0;
  }

  private syncLivesToHUD() {
    const el = document.getElementById('lives-value');
    if (el) el.textContent = String(this.lives);
  }

  private onMarioPiranha(_mario: any, _p: any) {
    if (this.invincible > 0 || this.shrinkTimer > 0) return;
    if (this.isBig) {
      this.isBig = false;
      this.shrinkTimer = 60;
      this.invincible = 90;
    } else {
      this.die();
    }
  }

  private startWarp(sourcePipe: any) {
    this.warping = true;
    this.mario.setVelocity(0, 0);
    this.mario.body.setAllowGravity(false);
    this.tweens.add({
      targets: this.mario,
      y: sourcePipe.y + BLOCK,
      duration: 500,
      onComplete: () => {
        const pipes = (this.pipeGroup.getChildren() as any[])
          .filter((p: any) => p.x > sourcePipe.x + BLOCK * 5)
          .sort((a: any, b: any) => a.x - b.x);
        const dest = pipes[0];
        if (dest) {
          const destTop = dest.y - BLOCK / 2;
          this.mario.setPosition(dest.x, destTop + BLOCK);
          this.mario.setVisible(false);
          this.tweens.add({
            targets: this.mario,
            y: destTop - 10,
            duration: 400,
            onStart: () => this.mario.setVisible(true),
            onComplete: () => {
              this.mario.body.setAllowGravity(true);
              this.warping = false;
              this.addScore(200, this.mario.x, this.mario.y - 20);
            },
          });
        } else {
          this.mario.body.setAllowGravity(true);
          this.warping = false;
        }
      },
    });
  }

  private startParachute(pipe: any) {
    this.warping = true;
    this.parachuteMode = true;
    this.mario.setVelocity(0, 0);
    this.mario.body.setAllowGravity(false);
    this.tweens.add({
      targets: this.mario,
      y: pipe.y + BLOCK,
      duration: 500,
      onComplete: () => {
        const targetX = this.cameras.main.scrollX + W / 2;
        this.mario.setPosition(targetX, 60);
        this.mario.setVisible(true);
        this.mario.body.setAllowGravity(true);
        this.mario.body.setGravityY(100);
        this.mario.setMaxVelocity(200, 80);
        this.warping = false;
        this.parachuteSprite = this.add.sprite(this.mario.x, this.mario.y - 80, 'parachute');
        this.parachuteSprite.setDisplaySize(96, 120);
        this.parachuteSprite.setOrigin(0.5, 1); // bottom-center anchored to Mario's head
        this.parachuteSprite.setDepth(9);
        for (let i = 0; i < 8; i++) {
          const cx = targetX + (Math.random() - 0.5) * W * 0.6;
          const cy = 100 + Math.random() * (GROUND_Y - 200);
          const c = this.coinGroup.create(cx, cy, 'coin0') as any;
          c.body.setAllowGravity(false);
          c.body.setSize(12, 18);
          c.setData('parachuteCoin', true);
        }
        this.parachuteTimer = 0;
        this.parachuteFlyingEnemies = [];
      },
    });
  }

  private endParachute() {
    this.parachuteMode = false;
    if (this.parachuteSprite) {
      this.parachuteSprite.destroy();
      this.parachuteSprite = undefined;
    }
    this.mario.body.setGravityY(1800);
    this.mario.setMaxVelocity(700, 900);
    this.mario.setAccelerationX(0);
    // Re-enable camera follow
    this.cameras.main.startFollow(this.mario, true, 0.15, 0.05, -W * 0.2, 0);
    this.parachuteFlyingEnemies.forEach(e => { if (e.active) e.destroy(); });
    this.parachuteFlyingEnemies = [];
    this.addScore(500, this.mario.x, this.mario.y - 30);
  }
}
