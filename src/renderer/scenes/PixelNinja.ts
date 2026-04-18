// PixelNinja — side-scrolling platformer with free JuhoSprite assets.
// Extracted from the original monolithic game.ts and refactored to
// extend BaseScene for the multi-game architecture.

declare const Phaser: any;

import { BaseScene, W, H } from './BaseScene.js';

const BLOCK = 48;                // logical world tile size
const MARIO_W = 48;              // player draw size
const MARIO_H = 48;              // player draw size
const GROUND_Y = H - 64;         // top of ground row
const SPAWN_X = 600;

export class PixelNinjaScene extends BaseScene {
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
  private canDoubleJump = false;
  private hasDoubleJumped = false;

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

  constructor() { super('pixel-ninja'); }

  get displayName() { return 'Pixel Ninja'; }

  preload() {
    // Player spritesheet: 7 frames of 16×16
    this.load.spritesheet('player', '../assets/player_strip.png', { frameWidth: 16, frameHeight: 16 });
    // Enemy spritesheet: 5 frames of 16×16
    this.load.spritesheet('enemy', '../assets/enemy_strip.png', { frameWidth: 16, frameHeight: 16 });
    // Coin animation: 4 frames of 16×16
    this.load.spritesheet('coin_anim', '../assets/coin_sheet.png', { frameWidth: 16, frameHeight: 16 });
    // Heart pickup
    this.load.spritesheet('heart_anim', '../assets/heart_sheet.png', { frameWidth: 16, frameHeight: 16 });
    // Tile textures
    this.load.image('grass_block', '../assets/grass_block.png');
    this.load.image('dirt_block', '../assets/dirt_block.png');
    this.load.image('brown_block', '../assets/brown_block.png');
    this.load.image('qblock_img', '../assets/qblock_new.png');
    this.load.image('platform_tile', '../assets/platform.png');
    this.load.image('spikes_tile', '../assets/spikes.png');
    this.load.image('flag_tile', '../assets/flag.png');
    this.load.image('impact', '../assets/impact_sheet.png');
    this.load.image('clouds', '../assets/clouds.png');
    this.load.image('hill_0', '../assets/hill_0.png');
    this.load.image('hill_1', '../assets/hill_1.png');
    this.load.image('big_bush', '../assets/big_bush.png');
    this.load.image('small_bush', '../assets/small_bush.png');
    this.load.image('background', '../assets/background.png');
  }

  create() {
    this.makeBlockTextures();

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
    this.mario = this.physics.add.sprite(SPAWN_X, GROUND_Y - 200, 'player', 0);
    this.mario.setOrigin(0.5, 1);
    this.mario.setDisplaySize(MARIO_W, MARIO_H);
    // Physics body fills the full cell so Mario's head hits blocks above.
    this.mario.body.setSize(12, 16);
    this.mario.body.setOffset(2, 0);
    this.mario.setMaxVelocity(700, 900);
    this.mario.body.setGravityY(1800);
    this.mario.setDepth(10);

    // Player animations
    this.anims.create({
      key: 'player_walk',
      frames: this.anims.generateFrameNumbers('player', { frames: [1, 2, 3] }),
      frameRate: 10,
      repeat: -1,
    });
    this.anims.create({
      key: 'player_idle',
      frames: [{ key: 'player', frame: 0 }],
      frameRate: 1,
    });
    // Coin spin animation
    this.anims.create({
      key: 'coin_spin',
      frames: this.anims.generateFrameNumbers('coin_anim', { start: 0, end: 3 }),
      frameRate: 8,
      repeat: -1,
    });
    // Enemy walk
    this.anims.create({
      key: 'enemy_walk',
      frames: this.anims.generateFrameNumbers('enemy', { frames: [0, 1, 2, 3] }),
      frameRate: 6,
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

    this.addDecorations();

    this.generateLevel(SPAWN_X + 400, W + 600);
    this.syncLivesToHUD();
  }

  // ---------- Brick / block textures generated at runtime via Graphics ----------
  private makeBlockTextures() {
    const g = this.add.graphics();

    // Used Q-block (brown/empty) — 16×16 to match source tile size
    g.clear();
    g.fillStyle(0xa56a26); g.fillRect(0, 0, 16, 16);
    g.fillStyle(0x6e4715); g.fillRect(0, 0, 16, 1); g.fillRect(0, 15, 16, 1);
    g.fillRect(0, 0, 1, 16); g.fillRect(15, 0, 1, 16);
    g.generateTexture('qblock_used', 16, 16);

    // Pipe body (2 blocks wide)
    g.clear();
    g.fillStyle(0x20a010); g.fillRect(0, 0, BLOCK * 2, BLOCK);
    g.fillStyle(0x00680c); g.lineStyle(2, 0x00680c); g.strokeRect(0, 0, BLOCK * 2, BLOCK);
    g.fillStyle(0x80e080); g.fillRect(BLOCK / 3 + 4, 0, 4, BLOCK);
    g.generateTexture('pipe_body', BLOCK * 2, BLOCK);

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

    // Blue slime enemy — bouncy blob, moves faster
    g.clear();
    g.fillStyle(0x2244cc);
    g.fillEllipse(8, 10, 14, 12);
    g.fillStyle(0x4488ff);
    g.fillEllipse(8, 8, 10, 8);
    g.fillStyle(0xffffff);
    g.fillCircle(5, 7, 2); g.fillCircle(11, 7, 2);
    g.fillStyle(0x000000);
    g.fillCircle(6, 7, 1); g.fillCircle(12, 7, 1);
    g.generateTexture('slime_0', 16, 16);
    g.clear();
    g.fillStyle(0x2244cc);
    g.fillEllipse(8, 11, 16, 10);
    g.fillStyle(0x4488ff);
    g.fillEllipse(8, 9, 12, 7);
    g.fillStyle(0xffffff);
    g.fillCircle(5, 8, 2); g.fillCircle(11, 8, 2);
    g.fillStyle(0x000000);
    g.fillCircle(6, 8, 1); g.fillCircle(12, 8, 1);
    g.generateTexture('slime_1', 16, 16);

    // Green bat enemy — flies in a wave pattern
    g.clear();
    g.fillStyle(0x22aa44);
    g.fillEllipse(8, 9, 8, 8);
    g.fillStyle(0x44dd66);
    g.fillTriangle(1, 6, 6, 8, 3, 12);  // left wing
    g.fillTriangle(15, 6, 10, 8, 13, 12); // right wing
    g.fillStyle(0xff0000);
    g.fillCircle(6, 8, 1); g.fillCircle(10, 8, 1);
    g.generateTexture('bat_0', 16, 16);
    g.clear();
    g.fillStyle(0x22aa44);
    g.fillEllipse(8, 9, 8, 8);
    g.fillStyle(0x44dd66);
    g.fillTriangle(1, 10, 6, 8, 3, 4);  // wings up
    g.fillTriangle(15, 10, 10, 8, 13, 4);
    g.fillStyle(0xff0000);
    g.fillCircle(6, 8, 1); g.fillCircle(10, 8, 1);
    g.generateTexture('bat_1', 16, 16);

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

    // Coin frame 0 (circle)
    g.clear();
    g.fillStyle(0xffd24a); g.fillCircle(12, 12, 9);
    g.fillStyle(0xb88a1f); g.fillRect(11, 3, 2, 18);
    g.generateTexture('coin0', 24, 24);
    // Coin frame 1 (thin)
    g.clear();
    g.fillStyle(0xffd24a); g.fillRect(9, 3, 6, 18);
    g.fillStyle(0xb88a1f); g.fillRect(11, 3, 2, 18);
    g.generateTexture('coin1', 24, 24);

    g.destroy();
  }

  private addDecorations() {
    // Semi-transparent tiled background — mountains peeking through
    // The image is 320×180, tile it across a wide area with slow parallax
    for (let i = 0; i < 30; i++) {
      this.add.image(i * W * 0.5, H / 2, 'background')
        .setDisplaySize(W * 0.5, H)
        .setAlpha(0.18)
        .setScrollFactor(0.05)
        .setDepth(-5);
    }

    // Sparse clouds at very low opacity — subtle atmosphere without blocking the desktop
    for (let i = 0; i < 15; i++) {
      const cx = i * 800 + Math.random() * 400;
      const cy = 40 + Math.random() * 100;
      this.add.image(cx, cy, 'clouds')
        .setDisplaySize(240, 72)
        .setAlpha(0.15)
        .setScrollFactor(0.1)
        .setDepth(-3);
    }

    // Hills behind the ground — very subtle
    for (let i = 0; i < 20; i++) {
      const hx = i * 500 + Math.random() * 300;
      const isSmall = Math.random() < 0.5;
      const tex = isSmall ? 'hill_0' : 'hill_1';
      const hh = isSmall ? 64 : 96;
      this.add.image(hx, GROUND_Y - hh / 2 + 10, tex)
        .setDisplaySize(isSmall ? 64 : 64, hh)
        .setAlpha(0.12)
        .setScrollFactor(0.3)
        .setDepth(-2);
    }

    // Bushes at ground level — decorative
    for (let i = 0; i < 25; i++) {
      const bx = i * 400 + Math.random() * 200;
      const isBig = Math.random() < 0.4;
      const tex = isBig ? 'big_bush' : 'small_bush';
      this.add.image(bx, GROUND_Y - 8, tex)
        .setDisplaySize(isBig ? 96 : 64, 32)
        .setAlpha(0.2)
        .setScrollFactor(0.5)
        .setDepth(-1);
    }
  }

  private extendGround(fromX: number, toX: number) {
    for (let x = Math.floor(fromX / BLOCK) * BLOCK; x < toX; x += BLOCK) {
      if (this.isInGap(x + BLOCK / 2)) continue;
      // skip if already there
      const exists = (this.groundGroup.getChildren() as any[]).some((g: any) =>
        Math.abs(g.x - (x + BLOCK / 2)) < 1
      );
      if (exists) continue;
      const g = this.groundGroup.create(x + BLOCK / 2, GROUND_Y + BLOCK / 2, 'grass_block') as any;
      g.setDisplaySize(BLOCK, BLOCK);
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
        const y = GROUND_Y - BLOCK * 2;
        const qi = Math.floor(Math.random() * n);
        for (let i = 0; i < n; i++) {
          const bx = x + i * BLOCK;
          if (i === qi) {
            const q = this.qblockGroup.create(bx + BLOCK / 2, y + BLOCK / 2, 'qblock_img') as any;
            q.setData('hit', false); q.setData('reward', 'coin');
            q.setDisplaySize(BLOCK, BLOCK);
            q.refreshBody();
          } else {
            const b = this.brickGroup.create(bx + BLOCK / 2, y + BLOCK / 2, 'brown_block') as any;
            b.setDisplaySize(BLOCK, BLOCK);
            b.refreshBody();
          }
        }
        x += n * BLOCK;
        // Enemy patrolling on top of the block row
        if (Math.random() < 0.4) {
          this.spawnEnemyAt('goomba', x - (n - 1) * BLOCK + BLOCK / 2, GROUND_Y - BLOCK * 2 - BLOCK / 2);
        }
      } else if (r < 0.17) {
        const q = this.qblockGroup.create(x + BLOCK / 2, GROUND_Y - BLOCK * 2 + BLOCK / 2, 'qblock_img') as any;
        q.setData('hit', false); q.setData('reward', 'mushroom');
        q.setDisplaySize(BLOCK, BLOCK);
        q.refreshBody();
        x += BLOCK;
      } else if (r < 0.22) {
        const q = this.qblockGroup.create(x + BLOCK / 2, GROUND_Y - BLOCK * 2 + BLOCK / 2, 'qblock_img') as any;
        q.setData('hit', false); q.setData('reward', 'coin');
        q.setDisplaySize(BLOCK, BLOCK);
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
        // Ascending staircase with enemy on top
        const h = 2 + Math.floor(Math.random() * 3);
        for (let step = 0; step < h; step++) {
          const b = this.brickGroup.create(
            x + step * BLOCK + BLOCK / 2,
            GROUND_Y - (step + 1) * BLOCK + BLOCK / 2,
            'brown_block'
          ) as any;
          b.setDisplaySize(BLOCK, BLOCK);
          b.refreshBody();
        }
        // 50% chance enemy on the top step
        if (Math.random() < 0.5) {
          const topX = x + (h - 1) * BLOCK + BLOCK / 2;
          const topY = GROUND_Y - h * BLOCK;
          this.spawnEnemyAt('goomba', topX, topY);
        }
        x += h * BLOCK;
      } else if (r < 0.73) {
        for (let i = 0; i < 3; i++) {
          const cy = GROUND_Y - BLOCK * 2 - Math.floor(Math.sin((i / 2) * Math.PI) * BLOCK);
          const c = this.coinGroup.create(x + i * BLOCK + BLOCK / 2, cy + BLOCK / 2, 'coin0') as any;
          c.setDisplaySize(BLOCK * 0.5, BLOCK * 0.65);
          c.body.setAllowGravity(false);
          c.body.setSize(12, 18);
        }
        x += 3 * BLOCK;
      } else if (r < 0.81) {
        // pipe — 1-2 blocks tall (jumpable)
        const pipeBlocks = 1 + Math.floor(Math.random() * 2);
        const ph = pipeBlocks * BLOCK;
        const pw = 2 * BLOCK;
        const py = GROUND_Y - ph;
        const isGold = Math.random() < 0.30; // 30% for testing (lower later)
        const isWarp = !isGold && Math.random() < 0.4;
        let topSeg: any = null;
        for (let yy = py; yy < GROUND_Y; yy += BLOCK) {
          const isTop = yy === py;
          const tex = isTop && isGold ? 'pipe_gold' : isTop && isWarp ? 'pipe_warp' : 'pipe_body';
          const seg = this.pipeGroup.create(x + pw / 2, yy + BLOCK / 2, tex) as any;
          seg.setDisplaySize(BLOCK * 2, BLOCK);
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
        const bridgeY = GROUND_Y - BLOCK * 2;
        for (let i = 0; i < bridgeLen; i++) {
          const b = this.brickGroup.create(x + i * BLOCK + BLOCK / 2, bridgeY + BLOCK / 2, 'brown_block') as any;
          b.setDisplaySize(BLOCK, BLOCK);
          b.refreshBody();
        }
        this.spawnEnemyAt('goomba', x + BLOCK, bridgeY - BLOCK / 2);
        x += bridgeLen * BLOCK;
      } else if (r < 0.93) {
        // Multi-tier platform
        const lowerY = GROUND_Y - BLOCK * 2;
        for (let i = 0; i < 4; i++) {
          if (i === 1) {
            const q = this.qblockGroup.create(x + i * BLOCK + BLOCK / 2, lowerY + BLOCK / 2, 'qblock_img') as any;
            q.setData('hit', false); q.setData('reward', 'coin');
            q.setDisplaySize(BLOCK, BLOCK);
            q.refreshBody();
          } else {
            const b = this.brickGroup.create(x + i * BLOCK + BLOCK / 2, lowerY + BLOCK / 2, 'brown_block') as any;
            b.setDisplaySize(BLOCK, BLOCK);
            b.refreshBody();
          }
        }
        const upperY = GROUND_Y - BLOCK * 5;
        for (let i = 1; i <= 2; i++) {
          const b = this.brickGroup.create(x + i * BLOCK + BLOCK / 2, upperY + BLOCK / 2, 'brown_block') as any;
          b.setDisplaySize(BLOCK, BLOCK);
          b.refreshBody();
        }
        const c = this.coinGroup.create(x + 1.5 * BLOCK + BLOCK / 2, upperY - BLOCK / 2, 'coin0') as any;
        c.setDisplaySize(BLOCK * 0.5, BLOCK * 0.65);
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
            'brown_block'
          ) as any;
          b.setDisplaySize(BLOCK, BLOCK);
          b.refreshBody();
        }
        x += h * BLOCK;
      } else if (r < 0.97) {
        // Mixed brick/qblock cluster
        const clusterLen = 5;
        const clusterY = GROUND_Y - BLOCK * 2;
        const qPositions = new Set<number>();
        const qCount = 1 + Math.floor(Math.random() * 2);
        while (qPositions.size < qCount) {
          qPositions.add(Math.floor(Math.random() * clusterLen));
        }
        for (let i = 0; i < clusterLen; i++) {
          if (qPositions.has(i)) {
            const q = this.qblockGroup.create(x + i * BLOCK + BLOCK / 2, clusterY + BLOCK / 2, 'qblock_img') as any;
            q.setData('hit', false); q.setData('reward', 'coin');
            q.setDisplaySize(BLOCK, BLOCK);
            q.refreshBody();
          } else {
            const b = this.brickGroup.create(x + i * BLOCK + BLOCK / 2, clusterY + BLOCK / 2, 'brown_block') as any;
            b.setDisplaySize(BLOCK, BLOCK);
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
    this.spawnEnemyAt(kind, x + BLOCK / 2, GROUND_Y);
  }

  private spawnEnemyAt(kind: 'goomba' | 'koopa' | 'rkoopa', x: number, y: number) {
    // Pick a random visual type: red monster, blue slime, or green bat
    const roll = Math.random();
    let tex: string;
    let enemyType: string;
    let speed: number;
    let isBat = false;

    if (roll < 0.45) {
      // Red monster (original) — standard speed
      tex = 'enemy';
      enemyType = 'monster';
      speed = -100;
    } else if (roll < 0.75) {
      // Blue slime — faster, squishier
      tex = 'slime_0';
      enemyType = 'slime';
      speed = -150;
    } else {
      // Green bat — flies in a wave, no gravity
      tex = 'bat_0';
      enemyType = 'bat';
      speed = -120;
      isBat = true;
    }

    const e = this.enemyGroup.create(x, y, tex, 0) as any;
    e.setOrigin(0.5, 1);
    e.setDisplaySize(BLOCK, BLOCK);
    e.body.setGravityY(isBat ? 0 : 1800);
    e.body.setAllowGravity(!isBat);
    e.setVelocityX(speed);
    e.setBounceX(1);
    e.setCollideWorldBounds(false);
    e.setData('kind', kind);
    e.setData('enemyType', enemyType);
    e.setData('state', 'walk');
    e.setData('timer', 0);
    e.setData('baseY', y);

    if (tex === 'enemy') {
      e.anims.play('enemy_walk', true);
    }
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
        const marioH = MARIO_H;
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

      // Up/down control: pull up (slow descent) or dive down (faster)
      if (this.cursors.up.isDown) {
        this.mario.setVelocityY(-120);
      } else if (this.cursors.down.isDown) {
        this.mario.setVelocityY(200);
      }

      // Keep Mario within visible screen
      if (this.mario.x < camX + 30) this.mario.x = camX + 30;
      if (this.mario.x > camX + W - 30) this.mario.x = camX + W - 30;
      if (this.mario.y < 40) this.mario.y = 40;
      this.parachuteTimer += dtMs;
      if (this.parachuteTimer > 1500) {
        this.parachuteTimer = 0;
        const fromLeft = Math.random() < 0.5;
        const camX = this.cameras.main.scrollX;
        const ex = fromLeft ? camX - 20 : camX + W + 20;
        const ey = this.mario.y + (Math.random() - 0.3) * 200;
        const fe = this.enemyGroup.create(ex, ey, 'enemy', 0) as any;
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
      this.mario.setFrame(4); // jump frame while parachuting
      if (this.cursors.left.isDown) this.mario.flipX = true;
      else if (this.cursors.right.isDown) this.mario.flipX = false;
      this.mario.setDisplaySize(MARIO_W, MARIO_H);
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
    if (onGround) {
      this.coyoteTime = 100;
      this.hasDoubleJumped = false;
      this.canDoubleJump = false;
    } else {
      this.coyoteTime = Math.max(0, this.coyoteTime - dtMs);
      // Enable double jump once we're airborne from a real jump (not just walking off edge)
      if (!this.canDoubleJump && this.coyoteTime <= 0) this.canDoubleJump = true;
    }
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dtMs);

    // Manual edge detection: Phaser's JustDown can miss key presses when
    // multiple keys are held on macOS. Track the previous-frame state ourselves.
    const jumpKeyDown = this.keys.space.isDown || this.cursors.up.isDown;
    const jumpJustPressed = jumpKeyDown && !this.jumpKeyWasDown;
    this.jumpKeyWasDown = jumpKeyDown;

    if (jumpJustPressed) this.jumpBuffer = 120;

    if (this.jumpBuffer > 0 && this.coyoteTime > 0) {
      // Normal jump
      this.mario.setVelocityY(-820);
      this.jumpBuffer = 0;
      this.coyoteTime = 0;
    } else if (jumpJustPressed && !onGround && this.canDoubleJump && !this.hasDoubleJumped) {
      // Double jump — slightly weaker boost
      this.mario.setVelocityY(-700);
      this.hasDoubleJumped = true;
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
    const sheetKey = 'player';
    const walkAnim = 'player_walk';

    // Size is always the same (no big/small visual change)
    this.mario.setDisplaySize(MARIO_W, MARIO_H);

    // Ensure correct texture
    if (this.mario.texture.key !== sheetKey) {
      this.mario.setTexture(sheetKey, 0);
    }

    if (!onGround) {
      this.mario.anims.stop();
      this.mario.setFrame(4); // jump
    } else if (intent !== 0 && moveDir !== 0 && intent !== moveDir && speed > 60) {
      this.mario.anims.stop();
      this.mario.setFrame(0); // no skid frame in new set, use idle
    } else if (speed > 20) {
      this.mario.anims.play(walkAnim, true);
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
      c.setTexture(i === 0 ? 'coin0' : 'coin1');
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
    const enemyType = e.getData('enemyType') || 'monster';

    if (e.x < camLeft - BLOCK * 3) { e.destroy(); return; }
    if (e.y > H + 50) { e.destroy(); return; }
    if (!e.body) return;

    if (state === 'walk' || state === 'flying') {
      // Animate based on enemy type
      if (enemyType === 'monster') {
        if (!e.anims.isPlaying || e.anims.currentAnim?.key !== 'enemy_walk') {
          e.anims.play('enemy_walk', true);
        }
      } else if (enemyType === 'slime') {
        const frame = Math.floor(this.time.now / 200) % 2;
        e.setTexture(frame === 0 ? 'slime_0' : 'slime_1');
        e.setDisplaySize(BLOCK, BLOCK);
      } else if (enemyType === 'bat') {
        const frame = Math.floor(this.time.now / 150) % 2;
        e.setTexture(frame === 0 ? 'bat_0' : 'bat_1');
        e.setDisplaySize(BLOCK, BLOCK);
        // Wave pattern flight
        const baseY = e.getData('baseY') || GROUND_Y - BLOCK * 2;
        e.y = baseY + Math.sin(this.time.now / 400 + e.x * 0.01) * 40;
      }

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
    q.setDisplaySize(BLOCK, BLOCK);
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
      // Visual feedback: golden flash + scale pulse
      this.mario.setTint(0xffdd00);
      this.tweens.add({
        targets: this.mario,
        scaleX: this.mario.scaleX * 1.4,
        scaleY: this.mario.scaleY * 1.4,
        duration: 150,
        yoyo: true,
        onComplete: () => {
          this.mario.setTint(0x44aaff); // blue tint = powered up
          this.mario.setDisplaySize(MARIO_W, MARIO_H);
        },
      });
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

  // Replace the enemy with a shell sprite using the dead frame.
  private becomeShell(e: any) {
    const kind = e.getData('kind');
    const x = e.x;
    e.destroy();
    const shell = this.enemyGroup.create(x, GROUND_Y, 'enemy', 4) as any;
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
    e.anims.stop();
    e.setFrame(4); // dead frame in enemy strip
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
      this.mario.clearTint();
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
    this.mario.clearTint();
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
    this.mario.clearTint();
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
          c.setDisplaySize(BLOCK * 0.5, BLOCK * 0.65);
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
